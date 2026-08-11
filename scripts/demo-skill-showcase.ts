import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  AiExecutionTraceSchema,
  TicketSchema,
  TriageRecommendationSchema,
  type AiExecutionTrace,
  type ApprovedField,
  type AuditEvent,
  type Ticket,
} from "../src/domain.js";
import {
  createClassificationReasoningProviderFromEnv,
  type ClassificationReasoningProvider,
} from "../src/approval-desk/classification-reasoning-provider.js";
import {
  buildDeterministicGptAssist,
  createCustomerResponseDraftProviderFromEnv,
  ensureDraftSignOff,
  type CustomerResponseDraftProvider,
} from "../src/approval-desk/draft-response-provider.js";
import {
  OperatorGuidanceSchema,
  type OperatorGuidance,
} from "../src/approval-desk/workflow-guidance.js";
import { diagnosisContextFromAudit } from "../src/approval-desk/diagnostic-workflow.js";
import { latestDiagnosisReviewRecord } from "../src/approval-desk/diagnosis-review.js";
import { createRuntimeDependencies } from "../src/runtime.js";
import { customerReplyWatermarkFromAudits } from "../src/triage-service.js";
import {
  createTriageServer,
  type TriageServerDependencies,
} from "../src/server.js";

const TICKET_ID = "TKT-1010" as const;
const ACTOR = "portfolio-reviewer";
// Keep the showcase bounded while allowing the full evidence/approval cycle,
// including the final read that confirms the close transition.
const MAX_TRANSITIONS = 24;
const SHOWCASE_START = Date.parse("2026-06-10T10:00:00.000Z");

export type SkillShowcaseMode = "controlled" | "deterministic" | "live";

export interface SkillShowcaseProviderProvenance {
  classification:
    | "controlled-local-simulation"
    | "not-configured"
    | "live-openai-adapter";
  drafting:
    | "controlled-local-simulation"
    | "not-configured"
    | "live-openai-adapter";
  networkPolicy: "disabled" | "live-provider-allowed";
}

export interface SkillShowcaseReport {
  mode: SkillShowcaseMode;
  providerProvenance: SkillShowcaseProviderProvenance;
  toolCalls: string[];
  toolCallTrace: Array<{ name: string; kind: "read" | "action" }>;
  aiStages: AiExecutionTrace[];
  workflowReads: Array<{
    sequence: number;
    ticketRevision: number;
    ticketStatus: Ticket["status"];
    workflowState: string;
    hasRecommendation: boolean;
    requiredEvidenceCount: number;
    providedEvidenceCount: number;
    missingEvidenceCount: number;
    hasConversationHistory: boolean;
    timelineKinds: string[];
    operatorStage: OperatorGuidance["stage"];
    nextAction: OperatorGuidance["nextAction"];
    blockers: string[];
    approvalRequired: boolean;
    hasDiagnosis: boolean;
    hasFix: boolean;
  }>;
  workflowStages: Array<{
    stage: OperatorGuidance["stage"];
    nextAction: OperatorGuidance["nextAction"];
  }>;
  approvals: Array<{
    required: true;
    fields: ApprovedField[];
    actor: string;
  }>;
  finalTicketStatus: Ticket["status"];
  auditEvents: Array<{
    type: AuditEvent["action"];
    actor: string;
    timestamp: string;
  }>;
  serialized: string;
}

export interface RunSkillShowcaseOptions {
  root: string;
  dataRoot: string;
  mode: SkillShowcaseMode;
  env?: NodeJS.ProcessEnv;
}

export interface SkillShowcaseCliOptions {
  args: readonly string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  createTemporaryRoot?: () => Promise<string>;
  removeTemporaryRoot?: (root: string) => Promise<void>;
  runShowcase?: (
    options: RunSkillShowcaseOptions,
  ) => Promise<SkillShowcaseReport>;
  writeStdout?: (text: string) => void;
  writeStderr?: (text: string) => void;
}

interface WorkflowSnapshot {
  ticket: Ticket;
  conversationHistory: Array<Record<string, unknown>>;
  conversationTimeline: Array<Record<string, unknown>>;
  recommendationHistory: z.infer<typeof TriageRecommendationSchema>[];
  recommendationSummary: {
    workflowState: string;
    hasPendingRecommendation: boolean;
    hasApprovedRecommendation: boolean;
    hasSentResponse: boolean;
    hasCustomerReply: boolean;
    [key: string]: unknown;
  };
  latestRecommendation?: z.infer<typeof TriageRecommendationSchema>;
  operatorGuidance: OperatorGuidance;
}

const WorkflowSnapshotSchema = z
  .object({
    ticket: TicketSchema,
    conversationHistory: z.array(z.record(z.string(), z.unknown())),
    conversationTimeline: z.array(z.record(z.string(), z.unknown())),
    recommendationHistory: z.array(TriageRecommendationSchema),
    recommendationSummary: z
      .object({
        workflowState: z.string(),
        hasPendingRecommendation: z.boolean(),
        hasApprovedRecommendation: z.boolean(),
        hasSentResponse: z.boolean(),
        hasCustomerReply: z.boolean(),
      })
      .passthrough(),
    latestRecommendation: TriageRecommendationSchema.optional(),
    operatorGuidance: OperatorGuidanceSchema,
  })
  .passthrough();

export async function runSkillShowcase(
  options: RunSkillShowcaseOptions,
): Promise<SkillShowcaseReport> {
  const env = options.env ?? process.env;
  requireLiveConfiguration(options.mode, env);

  let clockTick = 0;
  const deps = await createRuntimeDependencies({
    cwd: options.root,
    now: () => new Date(SHOWCASE_START + clockTick++ * 1_000),
    env: {
      TRIAGE_DATA_ROOT: options.dataRoot,
      TRIAGE_SEED_FILE: resolve(options.root, "data/seed/tickets.json"),
      TRIAGE_KNOWLEDGE_ROOT: resolve(options.root, "data/knowledge"),
    },
  });
  const providers = providersForMode(options.mode, env);
  const client = await connectInMemory(
    createTriageServer({
      ...deps,
      ...providers,
      env: options.mode === "live" ? env : {},
    }),
  );

  try {
    return await replayTkt1010({ client, deps, mode: options.mode });
  } finally {
    await client.close();
    deps.knowledgeEvolution.ledger.close();
  }
}

export function providersForMode(
  mode: SkillShowcaseMode,
  env: NodeJS.ProcessEnv = process.env,
): Pick<
  TriageServerDependencies,
  "classificationReasoningProvider" | "draftProvider"
> {
  if (mode === "deterministic") return {};
  if (mode === "live") {
    requireLiveConfiguration(mode, env);
    return {
      classificationReasoningProvider:
        createClassificationReasoningProviderFromEnv(env, {
          preferOpenAi: true,
        }),
      draftProvider: createCustomerResponseDraftProviderFromEnv(env, {
        responseStyle: "auto",
        preferOpenAi: true,
      }),
    };
  }
  return controlledProviders();
}

export async function connectInMemory(server: McpServer): Promise<Client> {
  const client = new Client({
    name: "skill-showcase",
    version: "1.0.0",
  });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

async function replayTkt1010(input: {
  client: Client;
  deps: Awaited<ReturnType<typeof createRuntimeDependencies>>;
  mode: SkillShowcaseMode;
}): Promise<SkillShowcaseReport> {
  const toolCalls: string[] = [];
  const toolCallTrace: SkillShowcaseReport["toolCallTrace"] = [];
  const aiStages: SkillShowcaseReport["aiStages"] = [];
  const workflowReads: SkillShowcaseReport["workflowReads"] = [];
  const workflowStages: SkillShowcaseReport["workflowStages"] = [];
  const approvals: SkillShowcaseReport["approvals"] = [];

  let workflow = await readWorkflow(input.client, toolCalls, toolCallTrace, workflowReads);
  workflowStages.push(sanitizeGuidance(workflow.operatorGuidance));

  for (let transition = 0; transition < MAX_TRANSITIONS; transition += 1) {
    const action = workflow.operatorGuidance.nextAction;
    if (action === "none") {
      const auditEvents = sanitizeAuditEvents(
        await input.deps.audits.list(TICKET_ID),
      );
      const report = {
        mode: input.mode,
        providerProvenance: providerProvenanceForMode(input.mode),
        toolCalls,
        toolCallTrace,
        aiStages,
        workflowReads,
        workflowStages,
        approvals,
        finalTicketStatus: workflow.ticket.status,
        auditEvents,
      };
      return { ...report, serialized: serializeReport(report) };
    }

    switch (action) {
      case "evaluate-ticket": {
        const evaluated = await callTool(input.client, toolCalls, "evaluate_ticket", {
          ticketId: TICKET_ID,
          actor: "skill-showcase",
          responseStyle: "auto",
          aiPreference:
            input.mode === "deterministic" ? "deterministic" : "gpt-preferred",
        }, toolCallTrace);
        const recommendation = TriageRecommendationSchema.parse(
          evaluated.recommendation,
        );
        const trace = recommendation.aiExecutionTrace;
        if (trace === undefined) {
          throw new Error("evaluate_ticket did not return the required AI trace.");
        }
        aiStages.push(AiExecutionTraceSchema.parse(trace));
        break;
      }
      case "review-recommendation": {
        const recommendation = workflow.latestRecommendation;
        if (recommendation === undefined) {
          throw new Error("Review guidance did not include a recommendation.");
        }
        const approval = showcaseApprovalFields(
          workflow.operatorGuidance.approval,
        );
        const fields = approval.fields;
        await callTool(input.client, toolCalls, "mark_response_done", {
          recommendationId: recommendation.id,
          ticketId: TICKET_ID,
          expectedRevision: workflow.ticket.revision,
          approvedFields: fields,
          editedCustomerResponse: recommendation.draftCustomerResponse,
          actor: ACTOR,
          confirm: true,
        }, toolCallTrace);
        approvals.push({
          required: approval.required,
          fields,
          actor: ACTOR,
        });
        break;
      }
      case "record-diagnosis":
        await callTool(input.client, toolCalls, "record_diagnosis", {
          ticketId: TICKET_ID,
          actor: "product-support",
        }, toolCallTrace);
        break;
      case "review-diagnosis":
        await reviewLatestDiagnosisForShowcase({
          deps: input.deps,
          workflow,
          approvals,
        });
        break;
      case "mark-fix-available":
        await callTool(input.client, toolCalls, "mark_fix_available", {
          ticketId: TICKET_ID,
          actor: "product-support",
        }, toolCallTrace);
        break;
      case "close-ticket":
        await callTool(input.client, toolCalls, "close_ticket", {
          ticketId: TICKET_ID,
          actor: ACTOR,
        }, toolCallTrace);
        break;
      case "wait-for-customer":
        throw new Error(
          `Showcase fixture stopped while waiting for customer. Workflow: ${formatWorkflowTrail(workflowStages)}.`,
        );
    }

    workflow = await readWorkflow(input.client, toolCalls, toolCallTrace, workflowReads);
    workflowStages.push(sanitizeGuidance(workflow.operatorGuidance));
  }

  throw new Error("Showcase exceeded the bounded transition limit.");
}

async function reviewLatestDiagnosisForShowcase(input: {
  deps: Awaited<ReturnType<typeof createRuntimeDependencies>>;
  workflow: WorkflowSnapshot;
  approvals: SkillShowcaseReport["approvals"];
}): Promise<void> {
  const audits = await input.deps.audits.list(TICKET_ID);
  const originalDiagnosis = audits
    .filter((event) => event.action === "diagnosis-completed")
    .at(-1);
  const diagnosis = diagnosisContextFromAudit(originalDiagnosis);
  if (originalDiagnosis === undefined || diagnosis === undefined) {
    throw new Error("Diagnosis-review guidance did not have a current diagnosis.");
  }
  const previousReview = latestDiagnosisReviewRecord(audits, originalDiagnosis.id);
  const reviewDecision = previousReview === undefined ? "approve" : "revalidate";
  const reviewedAt = new Date(
    Math.max(...audits.map((event) => Date.parse(event.timestamp))) + 1,
  ).toISOString();

  await input.deps.service.reviewDiagnosis({
    decision: reviewDecision,
    diagnosisId: originalDiagnosis.id,
    ticketId: TICKET_ID,
    sourceTicketRevision: input.workflow.ticket.revision,
    sourceConversationWatermark: customerReplyWatermarkFromAudits(audits),
    editedDiagnosis: previousReview?.review.editedDiagnosis ?? diagnosis,
    actor: ACTOR,
    rationale: reviewDecision === "approve"
      ? "Scripted portfolio reviewer approved the current diagnosis."
      : "Scripted portfolio reviewer revalidated the unchanged diagnosis after the ticket revision changed.",
    reviewedAt,
  });
  input.approvals.push({ required: true, fields: [], actor: ACTOR });
}

function controlledProviders(): {
  classificationReasoningProvider: ClassificationReasoningProvider;
  draftProvider: CustomerResponseDraftProvider;
} {
  return {
    classificationReasoningProvider: {
      async reason(input) {
        const baseline = input.deterministicClassification;
        return {
          reasoning: {
            issueType: "campaign-editor-loading",
            candidateCategory: baseline.category,
            candidateTeam: baseline.team,
            candidatePriority: baseline.priority,
            knowledgeArticleIds: [...baseline.knowledgeArticleIds],
            confidence: baseline.confidence,
            evidence: [
              "Campaign editor loading evidence is consistent with the local classification.",
            ],
            missingEvidenceThatWouldChangeClassification: [],
            explanation:
              "Controlled local reasoning agrees with the governed deterministic result.",
          },
          telemetry: { model: "controlled-local", latencyMs: 0 },
        };
      },
    },
    draftProvider: {
      async draft(input) {
        return {
          source: "deterministic",
          response: ensureDraftSignOff(input.deterministicDraft, input),
          assist: buildDeterministicGptAssist(input, "deterministic", []),
          telemetry: { model: "controlled-local", latencyMs: 0 },
        };
      },
    },
  };
}

async function readWorkflow(
  client: Client,
  toolCalls: string[],
  toolCallTrace: SkillShowcaseReport["toolCallTrace"],
  workflowReads: SkillShowcaseReport["workflowReads"],
): Promise<WorkflowSnapshot> {
  const content = await callTool(client, toolCalls, "get_ticket_workflow", {
    id: TICKET_ID,
  }, toolCallTrace);
  const snapshot = WorkflowSnapshotSchema.parse(content);
  const timelineKinds = snapshot.conversationTimeline.map((item) => {
    if (typeof item.kind !== "string") {
      throw new Error("Workflow read is missing a safe conversation timeline kind.");
    }
    if ((item.kind === "diagnosis" || item.kind === "fix") &&
      typeof item.summary !== "string") {
      throw new Error(`Workflow read ${item.kind} item is missing its safe summary.`);
    }
    return item.kind;
  });
  if (!timelineKinds.includes("original-ticket")) {
    throw new Error("Workflow read is missing the original ticket context.");
  }
  workflowReads.push({
    sequence: workflowReads.length + 1,
    ticketRevision: snapshot.ticket.revision,
    ticketStatus: snapshot.ticket.status,
    workflowState: snapshot.recommendationSummary.workflowState,
    hasRecommendation: snapshot.latestRecommendation !== undefined,
    requiredEvidenceCount: snapshot.latestRecommendation?.requiredEvidence?.length ?? 0,
    providedEvidenceCount: snapshot.latestRecommendation?.providedEvidence?.length ?? 0,
    missingEvidenceCount: snapshot.latestRecommendation?.missingEvidence?.length ?? 0,
    hasConversationHistory: snapshot.conversationHistory.length > 0,
    timelineKinds,
    operatorStage: snapshot.operatorGuidance.stage,
    nextAction: snapshot.operatorGuidance.nextAction,
    blockers: [...snapshot.operatorGuidance.blockers],
    approvalRequired: snapshot.operatorGuidance.approval.required,
    hasDiagnosis: timelineKinds.includes("diagnosis"),
    hasFix: timelineKinds.includes("fix"),
  });
  return snapshot;
}

async function callTool(
  client: Client,
  toolCalls: string[],
  name: string,
  args: Record<string, unknown>,
  toolCallTrace?: SkillShowcaseReport["toolCallTrace"],
): Promise<Record<string, unknown>> {
  toolCalls.push(name);
  toolCallTrace?.push({
    name,
    kind: name === "get_ticket_workflow" ? "read" : "action",
  });
  const commandBound = new Set([
    "submit_triage_recommendation",
    "add_customer_reply",
    "evaluate_ticket",
    "approve_triage_recommendation",
    "mark_response_done",
    "reject_triage_recommendation",
  ]);
  const argumentsWithCommand = commandBound.has(name)
    ? {
        commandId: `94000000-0000-4000-8000-${String(toolCalls.length).padStart(12, "0")}`,
        ...args,
      }
    : args;
  const result = (await client.callTool({
    name,
    arguments: argumentsWithCommand,
  })) as CallToolResult;
  if (result.isError === true || result.structuredContent === undefined) {
    throw new Error(`MCP tool ${name} failed.`);
  }
  return result.structuredContent;
}

function sanitizeAuditEvents(
  events: readonly AuditEvent[],
): SkillShowcaseReport["auditEvents"] {
  return events.map((event) => ({
    type: event.action,
    actor: event.actor,
    timestamp: event.timestamp,
  }));
}

function sanitizeGuidance(
  guidance: OperatorGuidance,
): SkillShowcaseReport["workflowStages"][number] {
  return { stage: guidance.stage, nextAction: guidance.nextAction };
}

function providerProvenanceForMode(
  mode: SkillShowcaseMode,
): SkillShowcaseProviderProvenance {
  if (mode === "controlled") {
    return {
      classification: "controlled-local-simulation",
      drafting: "controlled-local-simulation",
      networkPolicy: "disabled",
    };
  }
  if (mode === "deterministic") {
    return {
      classification: "not-configured",
      drafting: "not-configured",
      networkPolicy: "disabled",
    };
  }
  return {
    classification: "live-openai-adapter",
    drafting: "live-openai-adapter",
    networkPolicy: "live-provider-allowed",
  };
}

export function showcaseApprovalFields(
  approval: OperatorGuidance["approval"],
): { required: true; fields: ApprovedField[] } {
  if (!approval.required) {
    throw new Error("Review guidance did not require explicit approval.");
  }
  return { required: approval.required, fields: [...approval.fields] };
}

export function formatWorkflowTrail(
  stages: SkillShowcaseReport["workflowStages"],
): string {
  return stages
    .map(({ stage, nextAction }) => `${stage}/${nextAction}`)
    .join(" -> ");
}

export function verifySkillShowcaseReport(
  report: SkillShowcaseReport,
): string[] {
  const failures: string[] = [];
  const requiredStages: SkillShowcaseReport["workflowStages"][number]["stage"][] = [
    "review",
    "diagnosis-ready",
    "diagnosis-recorded",
    "fix-ready",
    "verification",
    "ready-for-close",
    "closed",
  ];
  let stageIndex = -1;
  for (const stage of requiredStages) {
    const nextIndex = report.workflowStages.findIndex(
      (candidate, index) => index > stageIndex && candidate.stage === stage,
    );
    if (nextIndex < 0) failures.push(`missing workflow stage: ${stage}`);
    else stageIndex = nextIndex;
  }
  if (report.finalTicketStatus !== "resolved") {
    failures.push(`final ticket status was ${report.finalTicketStatus}`);
  }
  if (report.approvals.length === 0 || !report.approvals.some((approval) =>
    approval.fields.includes("customerResponse")
  )) {
    failures.push("customer-response approval was not recorded");
  }
  for (const action of [
    "customer-reply-received",
    "diagnosis-completed",
    "fix-available",
  ] as const) {
    if (!report.auditEvents.some((event) => event.type === action)) {
      failures.push(`missing audit event: ${action}`);
    }
  }
  if (report.workflowReads.length !== report.workflowStages.length) {
    failures.push("workflow read count does not match workflow stage count");
  }
  for (let index = 0; index < report.toolCallTrace.length; index += 1) {
    const entry = report.toolCallTrace[index];
    if (entry.kind === "action" && report.toolCallTrace[index - 1]?.kind !== "read") {
      failures.push(`action ${entry.name} was not preceded by a workflow read`);
    }
  }
  return failures;
}

function serializeReport(
  report: Omit<SkillShowcaseReport, "serialized">,
): string {
  const lines = [
    "# Codex Skill AI Showcase",
    "",
    `- Mode: ${report.mode}`,
    `- Provider provenance: classification=${report.providerProvenance.classification}; drafting=${report.providerProvenance.drafting}; network=${report.providerProvenance.networkPolicy}.`,
    "- Human approval: scripted portfolio-reviewer simulation; no interactive pause.",
    `- Final ticket status: ${report.finalTicketStatus}`,
    "",
    "## Governed MCP tool calls",
    "",
    ...report.toolCalls.map((name, index) => `${index + 1}. \`${name}\``),
    "",
    "## Workflow read coverage",
    "",
    `- Complete read-model snapshots: ${report.workflowReads.length}.`,
    ...report.workflowReads.map((read) =>
      `- Read ${read.sequence}: revision=${read.ticketRevision}; status=${read.ticketStatus}; state=${read.workflowState}; stage=${read.operatorStage}; next=${read.nextAction}; evidence=required:${read.requiredEvidenceCount}/provided:${read.providedEvidenceCount}/missing:${read.missingEvidenceCount}; timeline=${read.timelineKinds.join(",")}.`,
    ),
    "",
    "## AI execution traces",
    "",
    ...report.aiStages.map(
      (trace, index) => [
        `- Evaluation ${index + 1}: preference=${trace.preference}; classification=${trace.classification.status}; drafting=${trace.drafting.status}.`,
        ...(trace.classification.fallback === undefined
          ? []
          : [`  - Classification fallback: ${trace.classification.fallback.category}; ${trace.classification.fallback.message}`]),
        ...(trace.drafting.fallback === undefined
          ? []
          : [`  - Drafting fallback: ${trace.drafting.fallback.category}; ${trace.drafting.fallback.message}`]),
      ].join("\n"),
    ),
    "",
    "## Workflow stages",
    "",
    ...report.workflowStages.map(
      (stage) => `- ${stage.stage}: next guided action is \`${stage.nextAction}\`.`,
    ),
    "",
    "## Explicit approvals",
    "",
    ...report.approvals.map(
      (approval) =>
        `- Scripted portfolio-reviewer simulation: required=${approval.required}; fields=${approval.fields.join(",")}; actor=${approval.actor}.`,
    ),
    "",
    "## Parsed audit events",
    "",
    ...report.auditEvents.map(
      (event, index) =>
        `- ${index + 1}. type=${event.type}; actor=${event.actor}; timestamp=${event.timestamp}.`,
    ),
    "",
  ];
  return lines.join("\n");
}

export function parseSkillShowcaseArgs(
  args: readonly string[],
): SkillShowcaseMode {
  if (args.some((arg) => !["--deterministic", "--live"].includes(arg))) {
    throw new Error(
      "Unknown showcase argument. Use no flags, --deterministic, or --live.",
    );
  }
  const deterministicCount = args.filter(
    (arg) => arg === "--deterministic",
  ).length;
  const liveCount = args.filter((arg) => arg === "--live").length;
  if (deterministicCount > 1 || liveCount > 1) {
    throw new Error("Showcase mode flags may be provided only once.");
  }
  if (deterministicCount === 1 && liveCount === 1) {
    throw new Error("Choose either --deterministic or --live, not both.");
  }
  return liveCount === 1
    ? "live"
    : deterministicCount === 1
      ? "deterministic"
      : "controlled";
}

export async function runSkillShowcaseCli(
  options: SkillShowcaseCliOptions,
): Promise<void> {
  const env = options.env ?? process.env;
  const mode = parseSkillShowcaseArgs(options.args);
  requireLiveConfiguration(mode, env);
  const createTemporaryRoot = options.createTemporaryRoot ??
    (() => mkdtemp(join(tmpdir(), "skill-showcase-")));
  const removeTemporaryRoot = options.removeTemporaryRoot ??
    ((root: string) => rm(root, { recursive: true, force: true }));
  const dataRoot = await createTemporaryRoot();
  try {
    const report = await (options.runShowcase ?? runSkillShowcase)({
      root: options.cwd,
      dataRoot,
      mode,
      env,
    });
    (options.writeStdout ?? ((text) => process.stdout.write(text)))(
      `${report.serialized}\n`,
    );
  } finally {
    await removeTemporaryRoot(dataRoot);
  }
}

export async function main(options: SkillShowcaseCliOptions): Promise<number> {
  try {
    await runSkillShowcaseCli(options);
    return 0;
  } catch (error) {
    const message = safeCliErrorMessage(error);
    (options.writeStderr ?? ((text) => process.stderr.write(text)))(
      `${message}\n`,
    );
    return 1;
  }
}

function requireLiveConfiguration(
  mode: SkillShowcaseMode,
  env: NodeJS.ProcessEnv,
): void {
  if (mode === "live" && !env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY is required for live showcase mode.");
  }
}

function safeCliErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const fixedMessages = new Set([
    "OPENAI_API_KEY is required for live showcase mode.",
    "Choose either --deterministic or --live, not both.",
    "Showcase mode flags may be provided only once.",
    "Unknown showcase argument. Use no flags, --deterministic, or --live.",
    "Showcase exceeded the bounded transition limit.",
    "Review guidance did not require explicit approval.",
  ]);
  if (fixedMessages.has(message)) return message;
  if (
    /^Showcase fixture stopped while waiting for customer\. Workflow: (?:[a-z-]+\/[a-z-]+)(?: -> [a-z-]+\/[a-z-]+)*\.$/.test(
      message,
    )
  ) {
    return message;
  }
  return "Showcase failed.";
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  void main({
    args: process.argv.slice(2),
    cwd: process.cwd(),
    env: process.env,
  }).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
