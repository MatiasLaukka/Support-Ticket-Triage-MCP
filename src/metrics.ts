import { z } from "zod";
import {
  IsoTimestampSchema,
  type Ticket,
  type TriageRecommendation,
} from "./domain.js";
import { confidenceBand } from "./classifier-confidence.js";
import { DomainError } from "./errors.js";

export const DEFAULT_MINUTES_PER_ACCEPTED_RECOMMENDATION = 8;

export const QueueMetricsSchema = z
  .object({
    generatedAt: IsoTimestampSchema,
    openTickets: z.number().int().nonnegative(),
    untriagedTickets: z.number().int().nonnegative(),
    slaBreachedTickets: z.number().int().nonnegative(),
    slaAtRiskTickets: z.number().int().nonnegative(),
    ticketsByCategory: z.record(z.string(), z.number().int().nonnegative()),
    ticketsByPriority: z.record(z.string(), z.number().int().nonnegative()),
    ticketsByTeam: z.record(z.string(), z.number().int().nonnegative()),
    submittedRecommendations: z.number().int().nonnegative(),
    pendingRecommendations: z.number().int().nonnegative(),
    approvedRecommendations: z.number().int().nonnegative(),
    rejectedRecommendations: z.number().int().nonnegative(),
    acceptanceRate: z.number().min(0).max(1).nullable(),
    rejectionRate: z.number().min(0).max(1).nullable(),
    averageConfidence: z.number().min(0).max(1).nullable(),
    averageApprovedConfidence: z.number().min(0).max(1).nullable(),
    confidenceBandCounts: z
      .object({
        low: z.number().int().nonnegative(),
        medium: z.number().int().nonnegative(),
        high: z.number().int().nonnegative(),
      })
      .strict(),
    escalationCounts: z
      .object({ total: z.number().int().nonnegative() })
      .catchall(z.number().int().nonnegative()),
    minutesPerAcceptedRecommendation: z.number().nonnegative(),
    estimatedMinutesSaved: z.number().nonnegative(),
    potentialMinutesSaved: z.number().nonnegative(),
  })
  .strict();

type QueueMetricsOutput = z.infer<typeof QueueMetricsSchema>;
/**
 * The calculator always returns the complete schema output. The optional
 * additions keep older in-process report adapters source-compatible while
 * they migrate to the expanded transport contract.
 */
export type QueueMetrics = Omit<
  QueueMetricsOutput,
  "averageApprovedConfidence" | "confidenceBandCounts" | "potentialMinutesSaved"
> &
  Partial<
    Pick<
      QueueMetricsOutput,
      "averageApprovedConfidence" | "confidenceBandCounts" | "potentialMinutesSaved"
    >
  >;

export interface QueueMetricsInput {
  tickets: readonly Ticket[];
  recommendations: readonly TriageRecommendation[];
  now: Date;
  minutesPerAcceptedRecommendation: number;
}

const AT_RISK_WINDOW_MS = 60 * 60 * 1000;

export function calculateQueueMetrics(input: QueueMetricsInput): QueueMetrics {
  if (Number.isNaN(input.now.getTime())) {
    throw new DomainError(
      "Queue metrics require a valid current time.",
      "INVALID_NOW",
    );
  }
  if (
    !Number.isFinite(input.minutesPerAcceptedRecommendation) ||
    input.minutesPerAcceptedRecommendation < 0
  ) {
    throw new DomainError(
      "Minutes per accepted recommendation must be nonnegative.",
      "REPOSITORY_ERROR",
    );
  }

  const openTickets = input.tickets.filter(
    ({ status }) => status !== "resolved",
  );
  const approvedRecommendations = input.recommendations.filter(
    ({ resolution }) => resolution === "approved",
  ).length;
  const rejectedRecommendations = input.recommendations.filter(
    ({ resolution }) => resolution === "rejected",
  ).length;
  const pendingRecommendations = input.recommendations.filter(
    ({ resolution }) => resolution === "pending",
  ).length;
  const resolvedRecommendations =
    approvedRecommendations + rejectedRecommendations;
  const confidenceBandCounts: NonNullable<QueueMetrics["confidenceBandCounts"]> = {
    low: 0,
    medium: 0,
    high: 0,
  };
  for (const recommendation of input.recommendations) {
    const band = confidenceBand(recommendation.confidence);
    confidenceBandCounts[band] += 1;
  }
  const escalationCounts: QueueMetrics["escalationCounts"] = { total: 0 };

  for (const recommendation of input.recommendations) {
    if (recommendation.escalationRequired) {
      escalationCounts.total += 1;
    }
    for (const reason of recommendation.escalationReasons) {
      escalationCounts[reason] = (escalationCounts[reason] ?? 0) + 1;
    }
  }

  return QueueMetricsSchema.parse({
    generatedAt: input.now.toISOString(),
    openTickets: openTickets.length,
    untriagedTickets: openTickets.filter(
      (ticket) =>
        ticket.category === undefined ||
        ticket.priority === undefined ||
        ticket.team === undefined,
    ).length,
    slaBreachedTickets: openTickets.filter(
      (ticket) =>
        ticket.sla.breached ||
        new Date(ticket.sla.responseDueAt).getTime() <= input.now.getTime(),
    ).length,
    slaAtRiskTickets: openTickets.filter((ticket) => {
      const dueAt = new Date(ticket.sla.responseDueAt).getTime();
      const remaining = dueAt - input.now.getTime();
      return !ticket.sla.breached && remaining > 0 && remaining <= AT_RISK_WINDOW_MS;
    }).length,
    ticketsByCategory: countBy(openTickets, ({ category }) => category),
    ticketsByPriority: countBy(openTickets, ({ priority }) => priority),
    ticketsByTeam: countBy(openTickets, ({ team }) => team),
    submittedRecommendations: input.recommendations.length,
    pendingRecommendations,
    approvedRecommendations,
    rejectedRecommendations,
    acceptanceRate:
      resolvedRecommendations === 0
        ? null
        : approvedRecommendations / resolvedRecommendations,
    rejectionRate:
      resolvedRecommendations === 0
        ? null
        : rejectedRecommendations / resolvedRecommendations,
    averageConfidence:
      input.recommendations.length === 0
        ? null
        : roundMetric(
            input.recommendations.reduce(
              (sum, recommendation) => sum + recommendation.confidence,
              0,
            ) / input.recommendations.length,
          ),
    averageApprovedConfidence:
      approvedRecommendations === 0
        ? null
        : roundMetric(
            input.recommendations
              .filter(({ resolution }) => resolution === "approved")
              .reduce((sum, recommendation) => sum + recommendation.confidence, 0) /
              approvedRecommendations,
          ),
    confidenceBandCounts,
    escalationCounts,
    minutesPerAcceptedRecommendation:
      input.minutesPerAcceptedRecommendation,
    estimatedMinutesSaved:
      approvedRecommendations * input.minutesPerAcceptedRecommendation,
    potentialMinutesSaved:
      pendingRecommendations * input.minutesPerAcceptedRecommendation,
  });
}

function roundMetric(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function countBy(
  tickets: readonly Ticket[],
  value: (ticket: Ticket) => string | undefined,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const ticket of tickets) {
    const key = value(ticket) ?? "unassigned";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
