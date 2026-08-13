import process from "node:process";
import { resolve } from "node:path";
import { AuditRepository } from "./audit-repository.js";
import { KnowledgeRepository } from "./knowledge-repository.js";
import { RecommendationRepository } from "./recommendation-repository.js";
import { TicketRepository } from "./ticket-repository.js";
import { TriageService, type OperationalCommandStore } from "./triage-service.js";
import { DiagnosisRepository } from "./knowledge-evolution/diagnosis-repository.js";
import { KnowledgeEvolutionService } from "./knowledge-evolution/service.js";
import type { CandidateDraftProvider } from "./knowledge-evolution/candidate-draft-provider.js";
import { createControlledKnowledgeCandidateDraftProvider } from "./approval-desk/controlled-evaluation-providers.js";
import { createOpenAiKnowledgeCandidateDraftProvider } from "./knowledge-evolution/openai-candidate-draft-provider.js";
import { SqliteLearningLedger } from "./knowledge-evolution/sqlite-learning-ledger.js";
import { SqliteKnowledgeEvolutionStore } from "./knowledge-evolution/sqlite-knowledge-evolution-store.js";
import { LearningCaptureService } from "./knowledge-evolution/learning-capture.js";
import {
  LearningOutboxWorker,
  type OperationalLearningOutboxStore,
} from "./operational/learning-outbox.js";
import { createRuntimeOperationalStore } from "./operational/import.js";
import { OperationalSqliteStore } from "./operational/sqlite-store.js";
import {
  OperationalAuditRepository,
  OperationalRecommendationRepository,
  OperationalTicketRepository,
} from "./operational/runtime-repositories.js";
import { DEFAULT_MINUTES_PER_ACCEPTED_RECOMMENDATION } from "./metrics.js";
import { DomainError } from "./errors.js";
import {
  acquireDemoStateUsageLease,
  type DemoStateUsageLease,
} from "./demo-state-lease.js";

const STARTUP_PATH_MESSAGES = {
  TRIAGE_DATA_ROOT: "TRIAGE_DATA_ROOT must not be blank.",
  TRIAGE_SEED_FILE: "TRIAGE_SEED_FILE must not be blank.",
  TRIAGE_KNOWLEDGE_ROOT: "TRIAGE_KNOWLEDGE_ROOT must not be blank.",
  TRIAGE_KNOWLEDGE_APPROVERS: "TRIAGE_KNOWLEDGE_APPROVERS must contain at least one actor.",
  TRIAGE_LEARNING_LEDGER_PATH: "TRIAGE_LEARNING_LEDGER_PATH must not be blank.",
  OPERATIONAL_DB_PATH: "OPERATIONAL_DB_PATH must not be blank.",
} as const;

export class StartupConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StartupConfigError";
  }
}

export type RuntimeEnvironment = NodeJS.ProcessEnv;

export interface RuntimeOptions {
  env?: RuntimeEnvironment;
  cwd?: string;
  now?: () => Date;
  knowledgeCandidateDraftProvider?: CandidateDraftProvider;
  operationalStore?: OperationalCommandStore;
  /** Explicit compatibility mode for focused legacy repository fixtures only. */
  legacyFixtureRepositories?: boolean;
}

export interface RuntimePaths {
  dataRoot: string;
  seedFile: string;
  knowledgeRoot: string;
  recommendationsRoot: string;
  auditFile: string;
  operationalDatabase: string;
  knowledgeEvolution: { diagnosesRoot: string; candidatesRoot: string; approvedRoot: string; auditFile: string; learningLedgerFile: string };
}

export interface RuntimeDependencies {
  tickets: TicketRepository | OperationalTicketRepository;
  knowledge: KnowledgeRepository;
  recommendations: RecommendationRepository | OperationalRecommendationRepository;
  audits: AuditRepository | OperationalAuditRepository;
  knowledgeEvolution: { diagnoses: DiagnosisRepository; objects: SqliteKnowledgeEvolutionStore; audits: SqliteKnowledgeEvolutionStore; ledger: SqliteLearningLedger; service: KnowledgeEvolutionService };
  service: TriageService;
  operationalStore?: OperationalCommandStore;
  learningOutbox?: LearningOutboxWorker;
  learningAvailability: LearningAvailability;
  now: () => Date;
  minutesPerAcceptedRecommendation: number;
  paths: RuntimePaths;
  close(): void;
}

export type LearningAvailability =
  | { readonly status: "available" }
  | {
      readonly status: "unavailable";
      readonly code: "LEARNING_UNAVAILABLE";
      readonly message: string;
    };

const LEARNING_UNAVAILABLE_MESSAGE =
  "Advisory learning is unavailable. Check TRIAGE_LEARNING_LEDGER_PATH and SQLite permissions, then restart.";

export function environmentPath(
  name: keyof typeof STARTUP_PATH_MESSAGES,
  fallback: string,
  env: RuntimeEnvironment,
  cwd = process.cwd(),
): string {
  const configured = env[name];
  if (configured !== undefined && configured.trim() === "") {
    throw new StartupConfigError(STARTUP_PATH_MESSAGES[name]);
  }
  return resolve(cwd, configured ?? fallback);
}

export function minutesSaved(env: RuntimeEnvironment): number {
  const configured = env.TRIAGE_MINUTES_SAVED;
  if (configured === undefined) {
    return DEFAULT_MINUTES_PER_ACCEPTED_RECOMMENDATION;
  }
  if (configured.trim() === "") {
    throw invalidMinutesSaved();
  }
  const parsed = Number(configured);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw invalidMinutesSaved();
  }
  return parsed;
}

export function knowledgeApprovers(env: RuntimeEnvironment): ReadonlySet<string> {
  const configured = env.TRIAGE_KNOWLEDGE_APPROVERS;
  if (configured !== undefined && configured.trim() === "") {
    throw new StartupConfigError(STARTUP_PATH_MESSAGES.TRIAGE_KNOWLEDGE_APPROVERS);
  }
  const actors = (configured ?? "support-lead,reviewer,approval-desk")
    .split(",")
    .map((actor) => actor.trim())
    .filter((actor) => actor.length > 0);
  if (actors.length === 0) throw new StartupConfigError(STARTUP_PATH_MESSAGES.TRIAGE_KNOWLEDGE_APPROVERS);
  return new Set(actors);
}

export function createKnowledgeCandidateDraftProviderFromEnv(
  env: RuntimeEnvironment,
): CandidateDraftProvider | undefined {
  const configured = env.TRIAGE_KNOWLEDGE_CANDIDATE_PROVIDER?.trim();
  if (configured === undefined || configured === "") return undefined;
  if (configured === "controlled") return createControlledKnowledgeCandidateDraftProvider();
  if (configured !== "openai") {
    throw new StartupConfigError(
      "TRIAGE_KNOWLEDGE_CANDIDATE_PROVIDER must be unset, controlled, or openai.",
    );
  }
  return createOpenAiKnowledgeCandidateDraftProvider({
    apiKey: env.OPENAI_API_KEY,
    model: env.TRIAGE_KNOWLEDGE_CANDIDATE_MODEL?.trim() || env.OPENAI_MODEL?.trim(),
    timeoutMs: parseKnowledgeCandidateTimeoutMs(env.TRIAGE_KNOWLEDGE_CANDIDATE_TIMEOUT_MS),
  });
}

export async function createRuntimeDependencies(
  options: RuntimeOptions = {},
): Promise<RuntimeDependencies> {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const dataRoot = environmentPath("TRIAGE_DATA_ROOT", "data/runtime", env, cwd);
  const seedFile = environmentPath(
    "TRIAGE_SEED_FILE",
    "data/seed/tickets.json",
    env,
    cwd,
  );
  const knowledgeRoot = environmentPath(
    "TRIAGE_KNOWLEDGE_ROOT",
    "data/knowledge",
    env,
    cwd,
  );
  const recommendationsRoot = resolve(dataRoot, "recommendations");
  const auditFile = resolve(dataRoot, "audit", "events.jsonl");
  const operationalDatabase = environmentPath(
    "OPERATIONAL_DB_PATH",
    resolve(dataRoot, "operational.sqlite"),
    env,
    cwd,
  );
  const knowledgeEvolutionPaths = {
    diagnosesRoot: resolve(dataRoot, "knowledge-evolution", "diagnoses"),
    candidatesRoot: resolve(dataRoot, "knowledge-evolution", "candidates"),
    approvedRoot: resolve(dataRoot, "knowledge-evolution", "approved"),
    auditFile: resolve(dataRoot, "knowledge-evolution", "audit", "events.jsonl"),
    learningLedgerFile: environmentPath("TRIAGE_LEARNING_LEDGER_PATH", resolve(dataRoot, "knowledge-evolution", "learning.sqlite"), env, cwd),
  };
  const minutesPerAcceptedRecommendation = minutesSaved(env);
  const approvers = knowledgeApprovers(env);
  const now = options.now ?? (() => new Date());
  const knowledgeCandidateDraftProvider = options.knowledgeCandidateDraftProvider ??
    createKnowledgeCandidateDraftProviderFromEnv(env);

  const usageLease = acquireDemoStateUsageLease(dataRoot);
  let runtimeOperationalStore: OperationalCommandStore | undefined = options.operationalStore;
  let sqliteOperationalStore = options.operationalStore instanceof OperationalSqliteStore
    ? options.operationalStore
    : undefined;
  let ledger: SqliteLearningLedger | undefined;
  try {
  if (runtimeOperationalStore === undefined && options.legacyFixtureRepositories !== true) {
    sqliteOperationalStore = OperationalSqliteStore.open(operationalDatabase);
    try {
      sqliteOperationalStore.initialize();
    } catch (error) {
      sqliteOperationalStore.close();
      throw error;
    }
    runtimeOperationalStore = sqliteOperationalStore;
  }
  const useOperationalRepositories = sqliteOperationalStore !== undefined
    && options.legacyFixtureRepositories !== true;
  const tickets = useOperationalRepositories
    ? new OperationalTicketRepository(sqliteOperationalStore!)
    : new TicketRepository(dataRoot, seedFile);
  if (tickets instanceof TicketRepository) await tickets.initialize();
  const knowledge = new KnowledgeRepository(knowledgeRoot);
  const recommendations = useOperationalRepositories
    ? new OperationalRecommendationRepository(sqliteOperationalStore!)
    : new RecommendationRepository(recommendationsRoot);
  const audits = useOperationalRepositories
    ? new OperationalAuditRepository(sqliteOperationalStore!)
    : new AuditRepository(auditFile);
  const diagnoses = new DiagnosisRepository(knowledgeEvolutionPaths.diagnosesRoot);
  let store: SqliteKnowledgeEvolutionStore | undefined;
  let learningAvailability: LearningAvailability = { status: "available" };
  try {
    ledger = new SqliteLearningLedger(knowledgeEvolutionPaths.learningLedgerFile);
    await ledger.initialize();
    store = new SqliteKnowledgeEvolutionStore(ledger.getDatabase(), {
      reactivationAuthorizer: (actorId) => approvers.has(actorId),
    });
    await store.initialize();
  } catch {
    ledger?.close();
    ledger = undefined;
    store = undefined;
    learningAvailability = {
      status: "unavailable",
      code: "LEARNING_UNAVAILABLE",
      message: LEARNING_UNAVAILABLE_MESSAGE,
    };
  }
  const learningCapture = ledger === undefined
    ? undefined
    : new LearningCaptureService(ledger);
  const learningOutbox = learningCapture !== undefined
      && isOperationalLearningOutboxStore(runtimeOperationalStore)
    ? new LearningOutboxWorker({
        store: runtimeOperationalStore,
        delivery: learningCapture,
        now,
      })
    : undefined;
  if (learningOutbox !== undefined) {
    try {
      await learningOutbox.drainPending();
    } catch (error) {
      ledger?.close();
      sqliteOperationalStore?.close();
      throw error;
    }
  }
  const knowledgeEvolution = ledger !== undefined && store !== undefined
    ? {
        diagnoses,
        objects: store,
        audits: store,
        ledger,
        service: new KnowledgeEvolutionService({
          tickets,
          knowledge,
          diagnoses,
          objects: store,
          audits: store,
          promotionAuthorizer: (actorId) => approvers.has(actorId),
          ...(knowledgeCandidateDraftProvider === undefined
            ? {}
            : { draftProvider: knowledgeCandidateDraftProvider }),
          ledger,
          now,
        }),
      }
    : unavailableKnowledgeEvolution(diagnoses);
  const serviceOperationalStore = isImportStateAwareOperationalStore(runtimeOperationalStore)
    ? createRuntimeOperationalStore(runtimeOperationalStore)
    : runtimeOperationalStore;
  const service = new TriageService({
    tickets,
    recommendations,
    audit: audits,
    diagnoses,
    ...(serviceOperationalStore === undefined ? {} : { operationalStore: serviceOperationalStore }),
    now,
  });

  return {
    tickets,
    knowledge,
    recommendations,
    audits,
    knowledgeEvolution,
    service,
    ...(runtimeOperationalStore === undefined ? {} : { operationalStore: runtimeOperationalStore }),
    ...(learningOutbox === undefined ? {} : { learningOutbox }),
    learningAvailability,
    now,
    minutesPerAcceptedRecommendation,
    paths: {
      dataRoot,
      seedFile,
      knowledgeRoot,
      recommendationsRoot,
      auditFile,
      operationalDatabase,
      knowledgeEvolution: knowledgeEvolutionPaths,
    },
    close() {
      closeRuntimeResources({ sqliteOperationalStore, ledger, usageLease });
    },
  };
  } catch (error) {
    try {
      closeRuntimeResources({ sqliteOperationalStore, ledger, usageLease });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Runtime startup failed and cleanup could not complete.",
      );
    }
    throw error;
  }
}

function closeRuntimeResources(input: {
  readonly sqliteOperationalStore: OperationalSqliteStore | undefined;
  readonly ledger: SqliteLearningLedger | undefined;
  readonly usageLease: DemoStateUsageLease;
}): void {
  const errors: unknown[] = [];
  for (const close of [
    () => input.sqliteOperationalStore?.close(),
    () => input.ledger?.close(),
    () => input.usageLease.release(),
  ]) {
    try {
      close();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateError(errors, "Runtime resources could not be closed cleanly.");
  }
}

function unavailableKnowledgeEvolution(
  diagnoses: DiagnosisRepository,
): RuntimeDependencies["knowledgeEvolution"] {
  const component = unavailableLearningComponent<SqliteKnowledgeEvolutionStore>();
  return {
    diagnoses,
    objects: component,
    audits: component,
    ledger: unavailableLearningComponent<SqliteLearningLedger>({
      close: () => undefined,
    }),
    service: unavailableLearningComponent<KnowledgeEvolutionService>(),
  };
}

function unavailableLearningComponent<T extends object>(overrides: Partial<T> = {}): T {
  return new Proxy(overrides as T, {
    get(target, property, receiver) {
      if (property === "then") return undefined;
      const configured = Reflect.get(target, property, receiver);
      if (configured !== undefined) return configured;
      return () => Promise.reject(new DomainError(
        LEARNING_UNAVAILABLE_MESSAGE,
        "REPOSITORY_ERROR",
      ));
    },
  });
}

function isImportStateAwareOperationalStore(
  store: OperationalCommandStore | undefined,
): store is OperationalSqliteStore {
  if (store === undefined) return false;
  const candidate = store as Partial<OperationalSqliteStore>;
  return typeof candidate.readImportState === "function"
    && typeof candidate.assertRuntimeMutationsAllowed === "function";
}

function isOperationalLearningOutboxStore(
  store: OperationalCommandStore | undefined,
): store is OperationalCommandStore & OperationalLearningOutboxStore {
  if (store === undefined) return false;
  const candidate = store as Partial<OperationalLearningOutboxStore>;
  return typeof candidate.readOutbox === "function"
    && typeof candidate.listPendingOutbox === "function";
}

function parseKnowledgeCandidateTimeoutMs(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return 20_000;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 20_000;
}

function invalidMinutesSaved(): StartupConfigError {
  return new StartupConfigError(
    "TRIAGE_MINUTES_SAVED must be a finite nonnegative number.",
  );
}
