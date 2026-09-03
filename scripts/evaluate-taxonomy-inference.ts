import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  classifyTicketFromContext,
} from "../src/approval-desk/classifier.js";

import {
  buildConversationContextForTicket,
} from "../src/approval-desk/conversation-context.js";

import {
  TicketSchema,
  type Ticket,
} from "../src/domain.js";

import {
  evaluateTaxonomyLane,
  observeTaxonomyBoundaryCases,
  type TaxonomyBoundaryObservation,
  type TaxonomyLaneEvaluationOutcome,
  type TaxonomyLaneEvaluationReport,
} from "../src/taxonomy-evaluation.js";

import {
  inferTaxonomyDeterministically,
  type TaxonomyInferenceInput,
} from "../src/taxonomy-inference.js";

import {
  InvalidTaxonomySchemaError,
  OpenAiTaxonomyReasoningProvider,
  TaxonomyReasoningProviderUnavailableError,
  type TaxonomyReasoningProvider,
} from "../src/taxonomy-reasoning-provider.js";

import {
  loadEvaluationOracles,
} from "../src/evaluation-oracle.js";

import type {
  EvaluationOracle,
} from "../src/evaluation-oracle.js";

export type TaxonomyInferenceEvaluationMode =
  | "offline"
  | "live"
  | "live-boundaries";

export const TAXONOMY_ABSTENTION_BOUNDARY_TICKET_IDS = [
  "TKT-1005",
  "TKT-1027",
  "TKT-1022",
  "TKT-1026",
] as const;

export function parseTaxonomyInferenceArgs(
  args: readonly string[],
): TaxonomyInferenceEvaluationMode {
  if (args.length === 0) {
    return "offline";
  }

  if (
    args.length === 1 &&
    args[0] === "--live"
  ) {
    return "live";
  }

  if (
    args.length === 1 &&
    args[0] === "--live-boundaries"
  ) {
    return "live-boundaries";
  }

  throw new Error(
    "Unknown taxonomy inference argument. Use no flags, --live, or --live-boundaries.",
  );
}

export interface TaxonomyInferenceComparisonCase {
  ticketId: string;

  expectation: NonNullable<
    EvaluationOracle["taxonomy"]
  >;

  inferenceInput: TaxonomyInferenceInput;
}

export interface TaxonomyInferenceBoundaryCase {
  ticketId: string;
  inferenceInput: TaxonomyInferenceInput;
}

export interface TaxonomyInferenceComparisonReport {
  deterministic: TaxonomyLaneEvaluationReport;
  gpt: TaxonomyLaneEvaluationReport | null;
  abstentionBoundaries: {
    deterministic: readonly TaxonomyBoundaryObservation[];
    gpt: readonly TaxonomyBoundaryObservation[] | null;
  };
}

export async function evaluateTaxonomyInference(input: {
  cases: readonly TaxonomyInferenceComparisonCase[];
  abstentionBoundaryCases?: readonly TaxonomyInferenceBoundaryCase[];
  gptProvider?: TaxonomyReasoningProvider;
  includeScoredGpt?: boolean;
}): Promise<TaxonomyInferenceComparisonReport> {
  const abstentionBoundaryCases = input.abstentionBoundaryCases ?? [];
  const deterministic =
    evaluateTaxonomyLane({
      lane: "deterministic",

      cases: input.cases.map(
        ({
          ticketId,
          expectation,
          inferenceInput,
        }) => ({
          ticketId,
          expectation,

          outcome: {
            status: "candidate" as const,

            candidate:
              inferTaxonomyDeterministically(
                inferenceInput,
              ),
          },
        }),
      ),
    });

  const deterministicBoundaryObservations = observeTaxonomyBoundaryCases(
    abstentionBoundaryCases.map(({ ticketId, inferenceInput }) => ({
      ticketId,
      outcome: {
        status: "candidate" as const,
        candidate: inferTaxonomyDeterministically(inferenceInput),
      },
    })),
  );

  const gpt =
    input.gptProvider === undefined ||
    input.includeScoredGpt === false
      ? null
      : evaluateTaxonomyLane({
        lane: "gpt",

        cases: await Promise.all(
          input.cases.map(
            async ({
              ticketId,
              expectation,
              inferenceInput,
            }) => {
              return {
                ticketId,
                expectation,
                outcome: await runTaxonomyProviderOutcome(
                  input.gptProvider!,
                  inferenceInput,
                ),
              };
            },
          ),
        ),
      });

  const gptBoundaryObservations = input.gptProvider === undefined
    ? null
    : observeTaxonomyBoundaryCases(
        await Promise.all(
          abstentionBoundaryCases.map(
            async ({ ticketId, inferenceInput }) => ({
              ticketId,
              outcome: await runTaxonomyProviderOutcome(
                input.gptProvider!,
                inferenceInput,
              ),
            }),
          ),
        ),
      );

  return {
    deterministic,
    gpt,
    abstentionBoundaries: {
      deterministic: deterministicBoundaryObservations,
      gpt: gptBoundaryObservations,
    },
  };
}

async function runTaxonomyProviderOutcome(
  provider: TaxonomyReasoningProvider,
  inferenceInput: TaxonomyInferenceInput,
): Promise<TaxonomyLaneEvaluationOutcome> {
  try {
    const execution = await provider.reason(inferenceInput);
    return {
      status: "candidate",
      candidate: execution.candidate,
    };
  } catch (error) {
    if (error instanceof TaxonomyReasoningProviderUnavailableError) {
      return {
        status: "provider-unavailable",
        reason: error.reason,
        statusCode: error.statusCode,
      };
    }

    if (error instanceof InvalidTaxonomySchemaError) {
      return {
        status: "rejected-taxonomy",
        stage: error.stage,
        fields: error.fields,
      };
    }

    throw error;
  }
}

function buildTaxonomyInferenceInput(ticket: Ticket): TaxonomyInferenceInput {
  const conversationContext = buildConversationContextForTicket({
    ticket,
    customerReplies: [],
    previousSupportResponses: [],
  });
  const classification = classifyTicketFromContext(conversationContext);

  return {
    ticket,
    conversationText: conversationContext.classificationText,
    deterministicClassification: {
      category: classification.category,
      team: classification.team,
      priority: classification.priority,
    },
  };
}

export type TaxonomyLiveProviderFactory = (
  env: NodeJS.ProcessEnv,
) => TaxonomyReasoningProvider;

function createLiveTaxonomyProvider(
  env: NodeJS.ProcessEnv,
): TaxonomyReasoningProvider {
  const apiKey =
    env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is required for live taxonomy inference.",
    );
  }

  return new OpenAiTaxonomyReasoningProvider({
    apiKey,

    ...(env.OPENAI_MODEL?.trim()
      ? {
        model:
          env.OPENAI_MODEL.trim(),
      }
      : {}),
  });
}

export async function runTaxonomyInferenceCommand(input: {
  cwd: string;
  mode: TaxonomyInferenceEvaluationMode;
  env?: NodeJS.ProcessEnv;
  createLiveProvider?: TaxonomyLiveProviderFactory;
}): Promise<TaxonomyInferenceComparisonReport> {
  const oracles =
    await loadEvaluationOracles(
      resolve(
        input.cwd,
        "data/seed/evaluation-oracles.json",
      ),
    );

  const tickets =
    TicketSchema.array().parse(
      JSON.parse(
        await readFile(
          resolve(
            input.cwd,
            "data/seed/tickets.json",
          ),
          "utf8",
        ),
      ),
    );

  const ticketsById =
    new Map(
      tickets.map(
        (ticket) => [
          ticket.id,
          ticket,
        ] as const,
      ),
    );

  const cases:
    TaxonomyInferenceComparisonCase[] = [];

  for (const oracle of oracles) {
    if (oracle.taxonomy === undefined) {
      continue;
    }

    const ticket =
      ticketsById.get(
        oracle.ticketId,
      );

    if (ticket === undefined) {
      throw new Error(
        `Missing seed ticket ${oracle.ticketId}.`,
      );
    }

    cases.push({
      ticketId:
        oracle.ticketId,

      expectation:
        oracle.taxonomy,

      inferenceInput: buildTaxonomyInferenceInput(ticket),
    });
  }

  const abstentionBoundaryCases: TaxonomyInferenceBoundaryCase[] =
    TAXONOMY_ABSTENTION_BOUNDARY_TICKET_IDS.map((ticketId) => {
      const ticket = ticketsById.get(ticketId);
      if (ticket === undefined) {
        throw new Error(`Missing seed ticket ${ticketId}.`);
      }
      return {
        ticketId,
        inferenceInput: buildTaxonomyInferenceInput(ticket),
      };
    });

  if (input.mode === "offline") {
    return evaluateTaxonomyInference({
      cases,
      abstentionBoundaryCases,
    });
  }

  const env =
    input.env ?? process.env;

  const providerFactory =
    input.createLiveProvider ??
    createLiveTaxonomyProvider;

  const gptProvider =
    providerFactory(env);

  return evaluateTaxonomyInference({
    cases,
    abstentionBoundaryCases,
    gptProvider,
    includeScoredGpt:
      input.mode !== "live-boundaries",
  });
}

export interface TaxonomyInferenceCliOptions {
  args: readonly string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  createLiveProvider?: TaxonomyLiveProviderFactory;
  writeStdout?: (text: string) => void;
}

export async function runTaxonomyInferenceCli(
  input: TaxonomyInferenceCliOptions,
): Promise<void> {
  const mode =
    parseTaxonomyInferenceArgs(
      input.args,
    );

  const report =
    await runTaxonomyInferenceCommand({
      cwd: input.cwd,
      mode,

      ...(input.env === undefined
        ? {}
        : {
          env: input.env,
        }),

      ...(input.createLiveProvider === undefined
        ? {}
        : {
          createLiveProvider:
            input.createLiveProvider,
        }),
    });

  const writeStdout =
    input.writeStdout ??
    ((text: string) => {
      process.stdout.write(text);
    });

  writeStdout(
    `${JSON.stringify(report, null, 2)}\n`,
  );
}

const invokedPath =
  process.argv[1];

if (
  invokedPath !== undefined &&
  import.meta.url ===
  pathToFileURL(
    resolve(invokedPath),
  ).href
) {
  runTaxonomyInferenceCli({
    args: process.argv.slice(2),
    cwd: process.cwd(),
  }).catch(
    (error: unknown) => {
      console.error(
        error instanceof Error
          ? error.message
          : error,
      );

      process.exitCode = 1;
    },
  );
}
