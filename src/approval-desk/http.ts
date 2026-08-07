import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { z } from "zod";
import {
  ApprovedFieldSchema,
  AiPreferenceSchema,
  CategorySchema,
  DraftCustomerResponseStyleInputSchema,
  PrioritySchema,
  TeamSchema,
  TicketIdSchema,
  TicketStatusSchema,
} from "../domain.js";
import type {
  AuditEvent,
  TriageRecommendation,
} from "../domain.js";
import { DomainError } from "../errors.js";
import { calculateQueueMetrics } from "../metrics.js";
import type { RuntimeDependencies } from "../runtime.js";
import { customerReplyWatermarkFromAudits } from "../triage-service.js";
import {
  loadExpectedOutcomes,
} from "./recommendation-builder.js";
import {
  createCustomerResponseDraftProviderFromEnv,
  type CustomerResponseDraftProvider,
} from "./draft-response-provider.js";
import {
  createClassificationReasoningProviderFromEnv,
  type ClassificationReasoningProvider,
} from "./classification-reasoning-provider.js";
import { evaluateTicketWithAi } from "./ai-evaluation.js";
import { buildAutomationEvidenceReport } from "./evidence-report.js";
import { approvalDeskHtml } from "./ui.js";
import { lifecycleReplayHtml } from "./lifecycle-replay-ui.js";
import {
  buildLifecycleReplayViewModel,
  createUnavailableLifecycleReplayViewModel,
  type LifecycleReplayReport,
} from "./lifecycle-replay.js";
import { loadDiagnosticEvaluationScenarios } from "./diagnostic-evaluation-scenarios.js";
import type { DiagnosticEvaluationScenario } from "./diagnostic-evaluation.js";
import {
  diagnosisContextForTicket,
  fixContextForTicket,
  hasCustomerReplyAfterRecommendation,
  selectPersistedDiagnosticWorkflowContext,
} from "./diagnostic-workflow.js";
import {
  DiagnosisFixActionOutputSchema,
  DiagnosisImpactSetSchema,
  DiagnosisReviewActionOutputSchema,
  DiagnosisReviewDraftSchema,
  DiagnosisReviewListOutputSchema,
  diagnosisReviewViews,
} from "./diagnosis-review.js";
import { automaticReplyForTicket } from "./automatic-customer-replies.js";
import {
  buildTicketWorkflowReadModel,
  customerRepliesFromAudits,
  latestRecommendationApprovalAudit,
  latestSupportResponseFromAudits,
  summarizeRecommendationsForTicket,
} from "./workflow-read-model.js";
import {
  KnowledgeCandidateApprovalOutputSchema,
  KnowledgeCandidateDefermentOutputSchema,
  KnowledgeCandidateEditsSchema,
  KnowledgeCandidateIdSchema,
  KnowledgeCandidateRejectionOutputSchema,
  KnowledgeCandidateReviewOutputSchema,
  KnowledgeDiscoveryReviewOutputSchema,
  KnowledgeReviewActorSchema,
  knowledgeApprovalReview,
  knowledgeCandidateReview,
  knowledgeDiscoveryReview,
} from "../knowledge-evolution/review-surface.js";

const JSON_BODY_LIMIT_BYTES = 65_536;
const UNEXPECTED_ERROR_TEXT = "Unexpected local approval desk error.";
const markSentOperations = new Map<string, Promise<void>>();

const TicketListQuerySchema = z
  .object({
    status: TicketStatusSchema.optional(),
    category: CategorySchema.optional(),
    priority: PrioritySchema.optional(),
    team: TeamSchema.optional(),
    offset: z.coerce.number().int().nonnegative().default(0),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

const RecommendationIdSchema = z.uuid();
const CustomerReplyBodySchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    createdAt: z.iso.datetime(),
    body: z.string().trim().min(1).max(4_000),
  })
  .strict();
const SubmitBodySchema = z
  .object({
    actor: z.string().trim().min(1).default("approval-desk"),
    responseStyle: DraftCustomerResponseStyleInputSchema.default("auto"),
    aiPreference: AiPreferenceSchema.default("auto"),
    customerReplies: z.array(CustomerReplyBodySchema).max(8).default([]),
  })
  .strict();
const ApprovalBodySchema = z
  .object({
    ticketId: TicketIdSchema,
    expectedRevision: z.number().int().nonnegative(),
    approvedFields: z
      .array(ApprovedFieldSchema)
      .min(1)
      .refine((fields) => new Set(fields).size === fields.length, {
        message: "Approved fields must be unique.",
      }),
    fieldOverrides: z
      .object({
        category: CategorySchema.optional(),
        priority: PrioritySchema.optional(),
        team: TeamSchema.optional(),
        assignee: z.string().trim().min(1).nullable().optional(),
        status: TicketStatusSchema.optional(),
        tags: z.array(z.string().trim().min(1)).optional(),
      })
      .strict()
      .optional(),
    editedCustomerResponse: z.string().trim().min(1).optional(),
    actor: z.string().trim().min(1),
    confirm: z.literal(true),
  })
  .strict()
  .refine(
    (approval) =>
      approval.editedCustomerResponse === undefined ||
      approval.approvedFields.includes("customerResponse"),
    {
      message:
        "editedCustomerResponse requires customerResponse to be approved.",
      path: ["editedCustomerResponse"],
    },
  )
  .refine(
    (approval) =>
      !approval.approvedFields.includes("customerResponse") ||
      approval.editedCustomerResponse !== undefined,
    {
      message:
        "editedCustomerResponse is required when customerResponse is approved.",
      path: ["editedCustomerResponse"],
    },
  )
  .refine(
    (approval) =>
      approval.fieldOverrides === undefined ||
      Object.keys(approval.fieldOverrides).every((field) =>
        approval.approvedFields.includes(
          field as (typeof approval.approvedFields)[number],
        ),
      ),
    {
      message: "Field overrides require the matching field to be approved.",
      path: ["fieldOverrides"],
    },
  );
const RejectBodySchema = z
  .object({
    ticketId: TicketIdSchema,
    actor: z.string().trim().min(1),
    feedback: z.string().trim().min(1),
  })
  .strict();
const CancelApprovalBodySchema = z
  .object({
    ticketId: TicketIdSchema,
    actor: z.string().trim().min(1),
    reason: z.string().trim().min(1),
  })
  .strict();
const CustomerReplyRouteBodySchema = z
  .object({
    actor: z.string().trim().min(1),
    body: z.string().trim().min(1).max(4_000),
    source: z.string().trim().min(1).optional(),
  })
  .strict();
const MarkSentBodySchema = z
  .object({
    ticketId: TicketIdSchema,
    actor: z.string().trim().min(1),
    automaticReplyEnabled: z.boolean().default(true),
  })
  .strict();
const WorkflowActionBodySchema = z
  .object({
    actor: z.string().trim().min(1),
  })
  .strict();
const PlatformMitigationBodySchema = z
  .object({
    actor: z.string().trim().min(1),
    eventId: z.string().trim().min(1),
    rationale: z.string().trim().min(1).max(1_000),
  })
  .strict();
const ReviewDiagnosisBodySchema = DiagnosisReviewDraftSchema.omit({
  diagnosisId: true,
  ticketId: true,
  reviewedAt: true,
});
const ApplyDiagnosisFixBodySchema = z
  .object({
    actor: z.string().trim().min(1),
    impactSet: DiagnosisImpactSetSchema,
  })
  .strict();
const KnowledgeDiscoveryBodySchema = z.object({
  ticketId: TicketIdSchema.optional(),
  includeGpt: z.boolean().default(false),
  actor: KnowledgeReviewActorSchema,
}).strict();
const KnowledgeApprovalBodySchema = z.object({
  actor: KnowledgeReviewActorSchema,
  expectedVersion: z.number().int().positive(),
  edits: KnowledgeCandidateEditsSchema.optional(),
}).strict();
const KnowledgeRejectionBodySchema = z.object({
  actor: KnowledgeReviewActorSchema,
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(1).max(1_000),
}).strict();
const KnowledgeDefermentBodySchema = z.object({
  actor: KnowledgeReviewActorSchema,
  expectedVersion: z.number().int().positive(),
}).strict();

export interface ApprovalDeskHttpOptions {
  expectedOutcomesPath?: string;
  draftProvider?: CustomerResponseDraftProvider;
  classificationReasoningProvider?: ClassificationReasoningProvider;
  lifecycleReplayReportPath?: string;
  lifecycleReplayControlledReportPath?: string;
  lifecycleReplayScenarios?: readonly DiagnosticEvaluationScenario[];
}

export function createApprovalDeskHttpServer(
  deps: RuntimeDependencies,
  options: ApprovalDeskHttpOptions = {},
) {
  return createServer((request, response) => {
    void routeRequest(request, response, deps, options);
  });
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  deps: RuntimeDependencies,
  options: ApprovalDeskHttpOptions,
): Promise<void> {
  try {
    const url = new URL(request.url ?? "/", "http://approval-desk.local");
    if (request.method === "GET" && url.pathname === "/") {
      text(response, 200, approvalDeskHtml);
      return;
    }
    if (request.method === "GET" && url.pathname === "/lifecycle-replay") {
      text(response, 200, lifecycleReplayHtml);
      return;
    }

    const route = matchRoute(request.method ?? "", url.pathname);
    if (route === undefined) {
      json(response, 404, {
        error: { code: "NOT_FOUND", message: "Route not found." },
      });
      return;
    }

    const result = await route.handle({ deps, options, request, url });
    json(response, route.status, result);
  } catch (error) {
    handleError(response, error);
  }
}

function matchRoute(
  method: string,
  pathname: string,
):
  | {
      status: number;
      handle(context: RouteContext): Promise<unknown>;
    }
  | undefined {
  if (method === "GET" && pathname === "/api/tickets") {
    return { status: 200, handle: listTickets };
  }

  const ticketRecommendation = /^\/api\/tickets\/([^/]+)\/recommendations$/.exec(
    pathname,
  );
  if (method === "POST" && ticketRecommendation !== null) {
    return {
      status: 201,
      handle: (context) =>
        createRecommendation(context, ticketRecommendation[1]!),
    };
  }

  const customerReply = /^\/api\/tickets\/([^/]+)\/customer-replies$/.exec(
    pathname,
  );
  if (method === "POST" && customerReply !== null) {
    return {
      status: 201,
      handle: (context) => addCustomerReply(context, customerReply[1]!),
    };
  }

  const diagnosis = /^\/api\/tickets\/([^/]+)\/diagnosis$/.exec(pathname);
  if (method === "POST" && diagnosis !== null) {
    return {
      status: 201,
      handle: (context) => recordDiagnosis(context, diagnosis[1]!),
    };
  }

  const platformMitigation = /^\/api\/tickets\/([^/]+)\/platform-mitigation$/.exec(pathname);
  if (method === "POST" && platformMitigation !== null) {
    return {
      status: 201,
      handle: (context) => recordPlatformMitigation(context, platformMitigation[1]!),
    };
  }

  const diagnoses = /^\/api\/tickets\/([^/]+)\/diagnoses$/.exec(pathname);
  if (method === "GET" && diagnoses !== null) {
    return {
      status: 200,
      handle: (context) => getTicketDiagnoses(context, diagnoses[1]!),
    };
  }

  const diagnosisReview = /^\/api\/tickets\/([^/]+)\/diagnoses\/([^/]+)\/review$/.exec(
    pathname,
  );
  if (method === "POST" && diagnosisReview !== null) {
    return {
      status: 201,
      handle: (context) =>
        reviewDiagnosis(context, diagnosisReview[1]!, diagnosisReview[2]!),
    };
  }

  const diagnosisFix = /^\/api\/tickets\/([^/]+)\/diagnoses\/([^/]+)\/fix$/.exec(
    pathname,
  );
  if (method === "POST" && diagnosisFix !== null) {
    return {
      status: 201,
      handle: (context) =>
        applyDiagnosisFix(context, diagnosisFix[1]!, diagnosisFix[2]!),
    };
  }

  const fix = /^\/api\/tickets\/([^/]+)\/fix$/.exec(pathname);
  if (method === "POST" && fix !== null) {
    return {
      status: 201,
      handle: (context) => recordFix(context, fix[1]!),
    };
  }

  const close = /^\/api\/tickets\/([^/]+)\/close$/.exec(pathname);
  if (method === "POST" && close !== null) {
    return {
      status: 200,
      handle: (context) => closeTicket(context, close[1]!),
    };
  }

  const ticketDetail = /^\/api\/tickets\/([^/]+)$/.exec(pathname);
  if (method === "GET" && ticketDetail !== null) {
    return {
      status: 200,
      handle: (context) => getTicketDetail(context, ticketDetail[1]!),
    };
  }

  const recommendationDetail = /^\/api\/recommendations\/([^/]+)$/.exec(
    pathname,
  );
  if (method === "GET" && recommendationDetail !== null) {
    return {
      status: 200,
      handle: (context) =>
        getRecommendation(context, recommendationDetail[1]!),
    };
  }

  const approval = /^\/api\/recommendations\/([^/]+)\/approve$/.exec(pathname);
  if (method === "POST" && approval !== null) {
    return {
      status: 200,
      handle: (context) => approveRecommendation(context, approval[1]!),
    };
  }

  const sent = /^\/api\/recommendations\/([^/]+)\/mark-sent$/.exec(pathname);
  if (method === "POST" && sent !== null) {
    return {
      status: 200,
      handle: (context) => markRecommendationSent(context, sent[1]!),
    };
  }

  const rejection = /^\/api\/recommendations\/([^/]+)\/reject$/.exec(pathname);
  if (method === "POST" && rejection !== null) {
    return {
      status: 200,
      handle: (context) => rejectRecommendation(context, rejection[1]!),
    };
  }

  const approvalCancellation =
    /^\/api\/recommendations\/([^/]+)\/cancel-approval$/.exec(pathname);
  if (method === "POST" && approvalCancellation !== null) {
    return {
      status: 200,
      handle: (context) =>
        cancelApproval(context, approvalCancellation[1]!),
    };
  }

  if (method === "GET" && pathname === "/api/metrics") {
    return { status: 200, handle: getMetrics };
  }

  if (method === "GET" && pathname === "/api/evidence") {
    return { status: 200, handle: getEvidence };
  }

  if (method === "POST" && pathname === "/api/knowledge-candidates") {
    return { status: 200, handle: discoverKnowledgeCandidates };
  }

  const knowledgeCandidate = /^\/api\/knowledge-candidates\/([^/]+)$/.exec(pathname);
  const knowledgeLearning = /^\/api\/knowledge-candidates\/([^/]+)\/learning$/.exec(pathname);
  if (method === "GET" && knowledgeLearning !== null) {
    return { status: 200, handle: (context) => getKnowledgeLearning(context, knowledgeLearning[1]!) };
  }
  if (method === "GET" && knowledgeCandidate !== null) {
    return { status: 200, handle: (context) => getKnowledgeCandidate(context, knowledgeCandidate[1]!) };
  }

  const knowledgeApproval = /^\/api\/knowledge-candidates\/([^/]+)\/approve$/.exec(pathname);
  if (method === "POST" && knowledgeApproval !== null) {
    return { status: 200, handle: (context) => approveKnowledgeCandidate(context, knowledgeApproval[1]!) };
  }

  const knowledgeRejection = /^\/api\/knowledge-candidates\/([^/]+)\/reject$/.exec(pathname);
  if (method === "POST" && knowledgeRejection !== null) {
    return { status: 200, handle: (context) => rejectKnowledgeCandidate(context, knowledgeRejection[1]!) };
  }

  const knowledgeDeferment = /^\/api\/knowledge-candidates\/([^/]+)\/defer$/.exec(pathname);
  if (method === "POST" && knowledgeDeferment !== null) {
    return { status: 200, handle: (context) => deferKnowledgeCandidate(context, knowledgeDeferment[1]!) };
  }

  if (method === "GET" && pathname === "/api/lifecycle-replay") {
    return { status: 200, handle: getLifecycleReplay };
  }

  return undefined;
}

interface RouteContext {
  deps: RuntimeDependencies;
  options: ApprovalDeskHttpOptions;
  request: IncomingMessage;
  url: URL;
}

async function discoverKnowledgeCandidates(
  { deps, request }: RouteContext,
): Promise<unknown> {
  const input = KnowledgeDiscoveryBodySchema.parse(await readJsonBody(request));
  const result = await deps.knowledgeEvolution.service.discover({
    ...(input.ticketId === undefined ? {} : { ticketId: input.ticketId }),
    includeGpt: input.includeGpt,
    actorId: input.actor,
  });
  const candidates = await Promise.all(
    [
      ...result.candidates.map((candidate) => `known-cause-${candidate.id}`),
      ...(result.gptAdvisory.candidateId === undefined ? [] : [result.gptAdvisory.candidateId]),
    ].map((candidateId) => deps.knowledgeEvolution.service.getCandidate(candidateId)),
  );
  return KnowledgeDiscoveryReviewOutputSchema.parse(
    knowledgeDiscoveryReview(result, candidates),
  );
}

async function getKnowledgeCandidate(
  { deps }: RouteContext,
  id: string,
): Promise<unknown> {
  const candidateId = KnowledgeCandidateIdSchema.parse(id);
  return KnowledgeCandidateReviewOutputSchema.parse({
    candidate: knowledgeCandidateReview(
      await deps.knowledgeEvolution.service.getCandidate(candidateId),
    ),
  });
}

async function approveKnowledgeCandidate(
  { deps, request }: RouteContext,
  id: string,
): Promise<unknown> {
  const candidateId = KnowledgeCandidateIdSchema.parse(id);
  const input = KnowledgeApprovalBodySchema.parse(await readJsonBody(request));
  return KnowledgeCandidateApprovalOutputSchema.parse(
    knowledgeApprovalReview(await deps.knowledgeEvolution.service.approve({
      candidateId,
      actorId: input.actor,
      expectedVersion: input.expectedVersion,
      ...(input.edits === undefined ? {} : { edits: input.edits }),
    })),
  );
}

async function rejectKnowledgeCandidate(
  { deps, request }: RouteContext,
  id: string,
): Promise<unknown> {
  const candidateId = KnowledgeCandidateIdSchema.parse(id);
  const input = KnowledgeRejectionBodySchema.parse(await readJsonBody(request));
  await deps.knowledgeEvolution.service.reject({
    candidateId,
    actorId: input.actor,
    expectedVersion: input.expectedVersion,
    reason: input.reason,
  });
  return KnowledgeCandidateRejectionOutputSchema.parse({ candidateId, rejected: true });
}

async function deferKnowledgeCandidate(
  { deps, request }: RouteContext,
  id: string,
): Promise<unknown> {
  const candidateId = KnowledgeCandidateIdSchema.parse(id);
  const input = KnowledgeDefermentBodySchema.parse(await readJsonBody(request));
  await deps.knowledgeEvolution.service.defer({
    candidateId,
    actorId: input.actor,
    expectedVersion: input.expectedVersion,
  });
  return KnowledgeCandidateDefermentOutputSchema.parse({ candidateId, deferred: true });
}

async function listTickets({ deps, url }: RouteContext): Promise<unknown> {
  const query = TicketListQuerySchema.parse({
    status: optionalParam(url.searchParams, "status"),
    category: optionalParam(url.searchParams, "category"),
    priority: optionalParam(url.searchParams, "priority"),
    team: optionalParam(url.searchParams, "team"),
    offset: optionalParam(url.searchParams, "offset"),
    limit: optionalParam(url.searchParams, "limit"),
  });
  const [tickets, recommendations, audits] = await Promise.all([
    deps.tickets.list(query),
    deps.recommendations.list(),
    deps.audits.list(),
  ]);
  return {
    ...tickets,
    items: tickets.items.map((ticket) => ({
      ...ticket,
      recommendationSummary: summarizeRecommendationsForTicket(
        ticket,
        recommendations,
        audits,
      ).summary,
    })),
  };
}

async function getLifecycleReplay({ options }: RouteContext): Promise<unknown> {
  const liveReportPath = options.lifecycleReplayReportPath ??
    resolve("reports/ai-comparison/live-latest.json");
  let liveReport: LifecycleReplayReport | undefined;
  let sourceReportPath = liveReportPath;
  try {
    liveReport = JSON.parse(await readFile(liveReportPath, "utf8")) as LifecycleReplayReport;
  } catch (error) {
    if (isMissingFile(error)) {
      const controlledPath = options.lifecycleReplayControlledReportPath ??
        resolve("reports/ai-comparison/controlled-latest.json");
      try {
        liveReport = JSON.parse(
          await readFile(controlledPath, "utf8"),
        ) as LifecycleReplayReport;
        sourceReportPath = controlledPath;
      } catch (controlledError) {
        if (isMissingFile(controlledError)) {
          return createUnavailableLifecycleReplayViewModel(
            "live-report-missing",
            liveReportPath,
          );
        }
        return createUnavailableLifecycleReplayViewModel("invalid-report", controlledPath);
      }
    } else {
      return createUnavailableLifecycleReplayViewModel("invalid-report", liveReportPath);
    }
  }

  let controlledReport: LifecycleReplayReport | undefined;
  const controlledReportPath = options.lifecycleReplayControlledReportPath ??
    resolve("reports/ai-comparison/controlled-latest.json");
  try {
    controlledReport = JSON.parse(
      await readFile(controlledReportPath, "utf8"),
    ) as LifecycleReplayReport;
  } catch (error) {
    if (!isMissingFile(error)) {
      controlledReport = undefined;
    }
  }

  const scenarios = options.lifecycleReplayScenarios ??
    await loadDiagnosticEvaluationScenarios();
  return buildLifecycleReplayViewModel({
    liveReport,
    controlledReport,
    scenarios,
    liveReportPath: sourceReportPath,
    controlledReportPath,
  });
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

async function getTicketDetail(
  { deps }: RouteContext,
  id: string,
): Promise<unknown> {
  const ticketId = TicketIdSchema.parse(id);
  const [ticket, auditPage, ticketAudits, recommendations, knowledgeCandidates, knowledgeAudits] = await Promise.all([
    deps.tickets.get(ticketId),
    deps.audits.listPage({ ticketId, offset: 0, limit: 10 }),
    deps.audits.list(ticketId),
    deps.recommendations.list(),
    deps.knowledgeEvolution.objects.listCandidates(),
    deps.knowledgeEvolution.audits.list(),
  ]);
  const workflow = buildTicketWorkflowReadModel({
    ticket,
    recommendations,
    audits: ticketAudits,
    knowledgeEvolution: {
      candidates: knowledgeCandidates,
      audits: knowledgeAudits,
    },
  });
  return {
    audits: auditPage,
    ...workflow,
  };
}

async function createRecommendation(
  { deps, options, request }: RouteContext,
  id: string,
): Promise<unknown> {
  const ticketId = TicketIdSchema.parse(id);
  const body = SubmitBodySchema.parse(await readJsonBody(request));
  const [ticket, audits, allKnowledgeArticles, approvedObjects] = await Promise.all([
    deps.tickets.get(ticketId),
    deps.audits.list(ticketId),
    deps.knowledge.list(),
    deps.knowledgeEvolution.service.listApproved(),
  ]);
  const persistedCustomerReplies = customerRepliesFromAudits(ticketId, audits);
  const previousSupportResponse = latestSupportResponseFromAudits(
    ticketId,
    audits,
  );
  const persistedDiagnosticContext = selectPersistedDiagnosticWorkflowContext(
    audits,
  );
  const customerReplies = [...persistedCustomerReplies, ...body.customerReplies.map((reply) => ({
    ...reply,
    ticketId,
  }))];
  const outcomes =
    options.expectedOutcomesPath === undefined
      ? undefined
      : await loadExpectedOutcomes(options.expectedOutcomesPath);
  const outcome = outcomes?.get(ticket.id);
  const input = await evaluateTicketWithAi({
    ticket,
    outcome,
    actor: body.actor,
    allKnowledgeArticles,
    approvedObjects,
    customerReplies,
    previousSupportResponse,
    diagnosisContext: persistedDiagnosticContext.diagnosis?.context,
    rejectedDiagnosis: persistedDiagnosticContext.rejectedDiagnosis?.context,
    fixContext: persistedDiagnosticContext.fix?.context,
    aiPreference: body.aiPreference,
    responseStyle: body.responseStyle,
    classificationProvider:
      options.classificationReasoningProvider ??
      createClassificationReasoningProviderFromEnv(process.env, {
        preferOpenAi: body.aiPreference === "gpt-preferred" ||
          process.env.APPROVAL_DRAFT_PROVIDER === "openai",
      }),
    draftProvider:
      options.draftProvider ??
      createCustomerResponseDraftProviderFromEnv(process.env, {
        responseStyle: body.responseStyle,
        preferOpenAi: body.aiPreference === "gpt-preferred",
      }),
  });
  const { recommendation } = await deps.service.submitEvaluation({
    ...input,
    submittedAt: deps.now().toISOString(),
    evaluatedCustomerReplyWatermark: customerReplyWatermarkFromAudits(audits),
  });
  return { recommendation };
}

async function addCustomerReply(
  { deps, request }: RouteContext,
  id: string,
): Promise<unknown> {
  const ticketId = TicketIdSchema.parse(id);
  const body = CustomerReplyRouteBodySchema.parse(await readJsonBody(request));
  return {
    auditEvent: await deps.service.addCustomerReply({
      ...body,
      ticketId,
      receivedAt: deps.now().toISOString(),
    }),
  };
}

async function recordDiagnosis(
  { deps, request }: RouteContext,
  id: string,
): Promise<unknown> {
  const ticketId = TicketIdSchema.parse(id);
  const body = WorkflowActionBodySchema.parse(await readJsonBody(request));
  const [ticket, audits, recommendations] = await Promise.all([
    deps.tickets.get(ticketId),
    deps.audits.list(ticketId),
    deps.recommendations.list(),
  ]);
  const latest = summarizeRecommendationsForTicket(
    ticket,
    recommendations,
    audits,
  ).latest;
  if (latest === undefined) {
    throw invalidRequest("A completed evaluation is required before diagnosis.");
  }
  const diagnosisContext = diagnosisContextForTicket(ticket, latest, audits);

  return {
    auditEvent: await deps.service.recordDiagnosis({
      ticketId,
      actor: body.actor,
      diagnosedAt: deps.now().toISOString(),
      diagnosis: diagnosisContext,
      knowledgeArticleIds: latest.knowledgeArticleIds.length > 0
        ? latest.knowledgeArticleIds
        : [latest.knownCause ?? "known-cause"],
      sourceWorkflow: {
        recommendationId: latest.id,
        ticketRevision: ticket.revision,
        customerReplyWatermark: customerReplyWatermarkFromAudits(audits),
      },
    }),
  };
}

async function getKnowledgeLearning(
  { deps }: RouteContext,
  id: string,
): Promise<unknown> {
  const candidateId = KnowledgeCandidateIdSchema.parse(id);
  return { learning: await deps.knowledgeEvolution.service.learningSummary({ candidateId }) };
}

async function recordPlatformMitigation(
  { deps, request }: RouteContext,
  id: string,
): Promise<unknown> {
  const ticketId = TicketIdSchema.parse(id);
  const body = PlatformMitigationBodySchema.parse(await readJsonBody(request));
  return {
    auditEvent: await deps.service.recordPlatformMitigation({
      ...body,
      ticketId,
      recordedAt: deps.now().toISOString(),
    }),
  };
}

async function getTicketDiagnoses(
  { deps }: RouteContext,
  id: string,
): Promise<unknown> {
  const ticketId = TicketIdSchema.parse(id);
  const [ticket, audits] = await Promise.all([
    deps.tickets.get(ticketId),
    deps.audits.list(ticketId),
  ]);
  return DiagnosisReviewListOutputSchema.parse({
    diagnoses: diagnosisReviewViews({ ticket, audits }),
  });
}

async function reviewDiagnosis(
  { deps, request }: RouteContext,
  id: string,
  diagnosisId: string,
): Promise<unknown> {
  const ticketId = TicketIdSchema.parse(id);
  const body = ReviewDiagnosisBodySchema.parse(await readJsonBody(request));
  const auditEvent = await deps.service.reviewDiagnosis({
    ...body,
    ticketId,
    diagnosisId,
    reviewedAt: deps.now().toISOString(),
  });
  const [ticket, audits] = await Promise.all([
    deps.tickets.get(ticketId),
    deps.audits.list(ticketId),
  ]);
  return DiagnosisReviewActionOutputSchema.parse({
    auditEvent,
    diagnoses: diagnosisReviewViews({ ticket, audits }),
  });
}

async function applyDiagnosisFix(
  { deps, request }: RouteContext,
  id: string,
  diagnosisId: string,
): Promise<unknown> {
  const sourceTicketId = TicketIdSchema.parse(id);
  const body = ApplyDiagnosisFixBodySchema.parse(await readJsonBody(request));
  const auditEvents = await deps.service.applyDiagnosisFix({
    diagnosisId,
    sourceTicketId,
    impactSet: body.impactSet,
    actor: body.actor,
    fixedAt: deps.now().toISOString(),
  });
  return DiagnosisFixActionOutputSchema.parse({ auditEvents });
}

async function recordFix(
  { deps, request }: RouteContext,
  id: string,
): Promise<unknown> {
  const ticketId = TicketIdSchema.parse(id);
  const body = WorkflowActionBodySchema.parse(await readJsonBody(request));
  const [ticket, audits, recommendations] = await Promise.all([
    deps.tickets.get(ticketId),
    deps.audits.list(ticketId),
    deps.recommendations.list(),
  ]);
  const persistedDiagnosticContext = selectPersistedDiagnosticWorkflowContext(
    audits,
  );
  const latest = summarizeRecommendationsForTicket(
    ticket,
    recommendations,
    audits,
  ).latest;

  return {
    auditEvent: await deps.service.recordFix({
      ticketId,
      actor: body.actor,
      fixedAt: deps.now().toISOString(),
      fix: fixContextForTicket(persistedDiagnosticContext.diagnosis?.event),
      knowledgeArticleIds: latest?.knowledgeArticleIds ?? [],
    }),
  };
}

async function closeTicket(
  { deps, request }: RouteContext,
  id: string,
): Promise<unknown> {
  const ticketId = TicketIdSchema.parse(id);
  const body = WorkflowActionBodySchema.parse(await readJsonBody(request));
  return deps.service.closeTicket({
    ticketId,
    actor: body.actor,
    closedAt: deps.now().toISOString(),
  });
}

async function getRecommendation(
  { deps }: RouteContext,
  id: string,
): Promise<unknown> {
  const recommendationId = RecommendationIdSchema.parse(id);
  return { recommendation: await deps.recommendations.get(recommendationId) };
}

async function approveRecommendation(
  { deps, request }: RouteContext,
  id: string,
): Promise<unknown> {
  const recommendationId = RecommendationIdSchema.parse(id);
  const body = ApprovalBodySchema.parse(await readJsonBody(request));
  return deps.service.approve({
    ...body,
    recommendationId,
    approvedAt: deps.now().toISOString(),
  });
}

async function markRecommendationSent(
  { deps, request }: RouteContext,
  id: string,
): Promise<unknown> {
  const recommendationId = RecommendationIdSchema.parse(id);
  const body = MarkSentBodySchema.parse(await readJsonBody(request));
  return serializeMarkSent(recommendationId, async () => {
    const audits = await deps.audits.list(body.ticketId);
    const alreadySent = audits.some(
      (event) =>
        event.action === "customer-response-sent" &&
        event.recommendationId === recommendationId,
    );
    if (alreadySent) {
      throw invalidRequest("Customer response has already been marked sent.");
    }
    const approval = latestRecommendationApprovalAudit(
      audits,
      recommendationId,
    );
    if (approval === undefined) {
      throw invalidRequest("Approved recommendation audit was not found.");
    }
    const customerResponse =
      typeof approval.after.customerResponse === "string"
        ? approval.after.customerResponse
        : undefined;
    if (customerResponse === undefined) {
      throw invalidRequest(
        "Customer response must be approved before it can be marked sent.",
      );
    }
    const sentAt = deps.now().toISOString();
    const auditEvent = await deps.service.markResponseSent({
      ticketId: body.ticketId,
      actor: body.actor,
      recommendationId,
      sentAt,
      customerResponse,
    });
    const recommendation = await deps.recommendations.get(recommendationId);
    const automaticReply = await maybeAddAutomaticCustomerReplyAfterSent({
      deps,
      ticketId: body.ticketId,
      recommendation,
      auditsBeforeSent: audits,
      sentAt,
      automaticReplyEnabled: body.automaticReplyEnabled,
    });
    return {
      auditEvent,
      ...(automaticReply === undefined ? {} : { automaticReply }),
    };
  });
}

async function maybeAddAutomaticCustomerReplyAfterSent(input: {
  deps: RuntimeDependencies;
  ticketId: string;
  recommendation: TriageRecommendation;
  auditsBeforeSent: readonly AuditEvent[];
  sentAt: string;
  automaticReplyEnabled?: boolean;
}): Promise<AuditEvent | undefined> {
  if (input.automaticReplyEnabled === false) {
    return undefined;
  }
  if (
    hasCustomerReplyAfterRecommendation(
      input.auditsBeforeSent,
      input.recommendation,
    )
  ) {
    return undefined;
  }
  const ticket = await input.deps.tickets.get(input.ticketId);
  const body = automaticReplyForTicket({
    ticket,
    recommendation: input.recommendation,
    auditsBeforeSent: input.auditsBeforeSent,
  });
  if (body === undefined) {
    return undefined;
  }
  return input.deps.service.addCustomerReply({
    ticketId: input.ticketId,
    actor: ticket.requester?.name ?? ticket.customer.name,
    body,
    receivedAt: plusMilliseconds(input.sentAt, 1),
    source: "demo-auto-reply",
  });
}

function plusMilliseconds(timestamp: string, milliseconds: number): string {
  return new Date(new Date(timestamp).getTime() + milliseconds).toISOString();
}

async function rejectRecommendation(
  { deps, request }: RouteContext,
  id: string,
): Promise<unknown> {
  const recommendationId = RecommendationIdSchema.parse(id);
  const body = RejectBodySchema.parse(await readJsonBody(request));
  return {
    auditEvent: await deps.service.reject({
      ...body,
      recommendationId,
      rejectedAt: deps.now().toISOString(),
    }),
  };
}

async function cancelApproval(
  { deps, request }: RouteContext,
  id: string,
): Promise<unknown> {
  const recommendationId = RecommendationIdSchema.parse(id);
  const body = CancelApprovalBodySchema.parse(await readJsonBody(request));
  return {
    auditEvent: await deps.service.cancelApproval({
      ...body,
      recommendationId,
      canceledAt: deps.now().toISOString(),
    }),
  };
}

async function getMetrics({ deps }: RouteContext): Promise<unknown> {
  const [tickets, recommendations] = await Promise.all([
    deps.tickets.snapshot(),
    deps.recommendations.list(),
  ]);
  return calculateQueueMetrics({
    tickets,
    recommendations,
    now: deps.now(),
    minutesPerAcceptedRecommendation: deps.minutesPerAcceptedRecommendation,
  });
}

async function getEvidence({ deps }: RouteContext): Promise<unknown> {
  const generatedAt = deps.now();
  const [tickets, recommendations, audits] = await Promise.all([
    deps.tickets.snapshot(),
    deps.recommendations.list(),
    deps.audits.list(),
  ]);
  const metrics = calculateQueueMetrics({
    tickets,
    recommendations,
    now: generatedAt,
    minutesPerAcceptedRecommendation: deps.minutesPerAcceptedRecommendation,
  });
  return buildAutomationEvidenceReport({
    metrics,
    audits,
    generatedAt: generatedAt.toISOString(),
  });
}

function optionalParam(
  searchParams: URLSearchParams,
  key: string,
): string | undefined {
  return searchParams.has(key) ? (searchParams.get(key) ?? "") : undefined;
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > JSON_BODY_LIMIT_BYTES) {
      throw invalidRequest(
        `Request body must be ${JSON_BODY_LIMIT_BYTES} bytes or less.`,
      );
    }
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.trim() === "") {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw invalidRequest("Request body must be valid JSON.", raw);
  }
}

function invalidRequest(message: string, input?: unknown): z.ZodError {
  return new z.ZodError([
    {
      code: "custom",
      path: [],
      message,
      input,
    },
  ]);
}

async function serializeMarkSent<T>(
  recommendationId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous =
    markSentOperations.get(recommendationId) ?? Promise.resolve();
  let release = (): void => undefined;
  const current = new Promise<void>((resolveOperation) => {
    release = resolveOperation;
  });
  markSentOperations.set(recommendationId, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (markSentOperations.get(recommendationId) === current) {
      markSentOperations.delete(recommendationId);
    }
  }
}

function text(
  response: ServerResponse,
  status: number,
  body: string,
): void {
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
  });
  response.end(body);
}

function json(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(`${JSON.stringify(body)}\n`);
}

function handleError(response: ServerResponse, error: unknown): void {
  if (error instanceof z.ZodError) {
    json(response, 400, {
      error: {
        code: "INVALID_REQUEST",
        message: error.issues[0]?.message ?? "Invalid request.",
      },
    });
    return;
  }
  if (error instanceof DomainError) {
    json(response, domainStatus(error), {
      error: { code: error.code, message: error.message },
    });
    return;
  }

  console.error(
    `${UNEXPECTED_ERROR_TEXT} ${
      error instanceof Error ? (error.stack ?? error.message) : String(error)
    }`,
  );
  json(response, 500, {
    error: {
      code: "APPROVAL_DESK_ERROR",
      message: UNEXPECTED_ERROR_TEXT,
    },
  });
}

function domainStatus(error: DomainError): number {
  switch (error.code) {
    case "STALE_APPROVAL":
      return 409;
    case "TICKET_NOT_FOUND":
    case "RECOMMENDATION_NOT_FOUND":
      return 404;
    default:
      return 400;
  }
}
