import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import {
  TicketSchema,
  TriageRecommendationSchema,
} from "../src/domain.js";
import {
  calculateQueueMetrics,
  DEFAULT_MINUTES_PER_ACCEPTED_RECOMMENDATION,
  QueueMetricsSchema,
  type QueueMetrics,
} from "../src/metrics.js";

const SHOWCASE_TIMESTAMP = "2026-06-10T12:00:00.000Z";

export async function runMetricsShowcase(
  root = resolve("."),
): Promise<QueueMetrics> {
  const [ticketsJson, recommendationsJson] = await Promise.all([
    readFile(resolve(root, "data/seed/tickets.json"), "utf8"),
    readFile(resolve(root, "data/seed/sample-recommendations.json"), "utf8"),
  ]);
  const tickets = TicketSchema.array().parse(JSON.parse(ticketsJson));
  const recommendations = TriageRecommendationSchema.array().parse(
    JSON.parse(recommendationsJson),
  );
  return QueueMetricsSchema.parse(
    calculateQueueMetrics({
      tickets,
      recommendations,
      now: new Date(SHOWCASE_TIMESTAMP),
      minutesPerAcceptedRecommendation:
        DEFAULT_MINUTES_PER_ACCEPTED_RECOMMENDATION,
    }),
  );
}

if (process.argv[1]?.endsWith("demo-metrics.js")) {
  runMetricsShowcase()
    .then((metrics) => {
      process.stdout.write(`${JSON.stringify(metrics, null, 2)}\n`);
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    });
}
