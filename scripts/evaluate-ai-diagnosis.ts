import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { TicketSchema, TriageRecommendationSchema } from "../src/domain.js";
import { KnowledgeRepository } from "../src/knowledge-repository.js";
import { buildApprovalDeskRecommendationInput } from "../src/approval-desk/recommendation-builder.js";
import { diagnosisContextForTicket } from "../src/approval-desk/diagnostic-workflow.js";
import { buildConversationContextForTicket } from "../src/approval-desk/conversation-context.js";
import { diagnoseTicketWithAi } from "../src/approval-desk/ai-diagnosis.js";
import {
  createControlledDiagnosisProvider,
} from "../src/approval-desk/controlled-evaluation-providers.js";
import { createDiagnosisReasoningProviderFromEnv } from "../src/approval-desk/diagnosis-reasoning-provider.js";

const projectRoot = resolve(import.meta.dirname, "../..");

async function main(): Promise<void> {
  const mode = process.argv.slice(2).length === 0
    ? "controlled"
    : process.argv.slice(2).length === 1 && process.argv[2] === "--live"
      ? "live"
      : undefined;
  if (mode === undefined) throw new Error("Unknown argument. Use no flags or --live.");
  if (mode === "live" && !process.env.OPENAI_API_KEY?.trim()) {
    throw new Error("--live requires OPENAI_API_KEY.");
  }

  const tickets = TicketSchema.array().parse(
    JSON.parse(await readFile(resolve(projectRoot, "data/seed/tickets.json"), "utf8")),
  );
  const articles = await new KnowledgeRepository(resolve(projectRoot, "data/knowledge")).list();
  const provider = mode === "controlled"
    ? createControlledDiagnosisProvider()
    : createDiagnosisReasoningProviderFromEnv(process.env, { preferOpenAi: true });

  const observations = [];
  for (const ticket of tickets) {
    const { actor: _actor, ...recommendationInput } = buildApprovalDeskRecommendationInput({
      ticket,
      actor: "ai-diagnosis-evaluation",
    });
    const recommendation = TriageRecommendationSchema.parse({
      ...recommendationInput,
      id: stableRecommendationId(ticket.id),
      resolution: "pending",
      createdAt: ticket.updatedAt,
    });
    const deterministicDiagnosis = diagnosisContextForTicket(ticket, recommendation);
    const conversationContext = buildConversationContextForTicket({ ticket });
    const selectedArticles = articles.filter((article) => recommendation.knowledgeArticleIds.includes(article.id));
    const result = await diagnoseTicketWithAi({
      ticket,
      conversationContext,
      recommendation,
      deterministicDiagnosis,
      knowledgeArticles: selectedArticles,
      aiPreference: "gpt-preferred",
      provider,
    });
    observations.push({
      ticketId: ticket.id,
      supportState: recommendation.supportState,
      missingEvidence: recommendation.missingEvidence?.map(({ label }) => label) ?? [],
      deterministicDiagnosis: deterministicDiagnosis.customerSafeSummary,
      gptStatus: result.status,
      ...(result.candidate === undefined ? {} : {
        gptCandidate: {
          causeType: result.candidate.causeType,
          confidence: result.candidate.confidence,
          summary: result.candidate.customerSafeSummary,
          knowledgeArticleIds: result.candidate.knowledgeArticleIds,
        },
      }),
      ...(result.safety.detected ? { promptInjection: true } : {}),
      ...(result.fallback === undefined ? {} : { fallback: result.fallback }),
    });
  }

  const used = observations.filter((item) => item.gptStatus === "used").length;
  const skipped = observations.filter((item) => item.gptStatus === "skipped").length;
  const fallback = observations.filter((item) => item.gptStatus === "fallback").length;
  const report = {
    mode,
    generatedAt: new Date().toISOString(),
    summary: {
      ticketCount: observations.length,
      gptAdvisoryCandidates: used,
      deterministicSafetySkips: skipped,
      providerFallbacks: fallback,
    },
    observations,
  };
  const reportDirectory = resolve(projectRoot, "reports/ai-diagnosis");
  await mkdir(reportDirectory, { recursive: true });
  const reportPrefix = mode === "live" ? "live" : "controlled";
  await writeFile(
    resolve(reportDirectory, `${reportPrefix}-latest.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  const markdown = [
    "# AI diagnosis evaluation",
    "",
    `- Mode: ${mode === "live" ? "live OpenAI provider" : "controlled local simulation"}`,
    `- Generated: ${report.generatedAt}`,
    `- Tickets evaluated: ${observations.length}`,
    `- GPT advisory candidates: ${used}`,
    `- Deterministic safety skips: ${skipped}`,
    `- Provider fallbacks: ${fallback}`,
    "",
    "## Ticket observations",
    ...observations.map((observation) => {
      const candidate = observation.gptCandidate === undefined
        ? "candidate=none"
        : `candidate=${observation.gptCandidate.causeType ?? "unclear"}/${observation.gptCandidate.confidence}`;
      return `- ${observation.ticketId}: ${observation.gptStatus}; support=${observation.supportState ?? "unset"}; missing=${observation.missingEvidence.length}; ${candidate}${observation.promptInjection === true ? "; operator-safety-skip" : ""}`;
    }),
    "",
    `Full sanitized JSON: ${reportPrefix}-latest.json`,
    "",
  ].join("\n");
  await writeFile(resolve(reportDirectory, `${reportPrefix}-latest.md`), markdown, "utf8");
  console.log("# AI diagnosis evaluation");
  console.log(`- Mode: ${mode === "live" ? "live OpenAI provider" : "controlled local simulation"}`);
  console.log(`- Tickets evaluated: ${observations.length}`);
  console.log(`- GPT advisory candidates: ${used}`);
  console.log(`- Deterministic safety skips: ${skipped}`);
  console.log(`- Provider fallbacks: ${fallback}`);
  console.log(`- Saved report: reports/ai-diagnosis/${reportPrefix}-latest.md`);
  console.log("\n## Ticket observations");
  for (const observation of observations) {
    const candidate = observation.gptCandidate === undefined
      ? "candidate=none"
      : `candidate=${observation.gptCandidate.causeType ?? "unclear"}/${observation.gptCandidate.confidence}`;
    console.log(`- ${observation.ticketId}: ${observation.gptStatus}; support=${observation.supportState ?? "unset"}; missing=${observation.missingEvidence.length}; ${candidate}${observation.promptInjection === true ? "; operator-safety-skip" : ""}`);
  }
  console.log("\n## Machine-readable report");
  console.log(JSON.stringify(report, null, 2));
}

function stableRecommendationId(ticketId: string): string {
  const number = ticketId.replace("TKT-", "").padStart(12, "0");
  return `00000000-0000-4000-8000-${number}`;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
