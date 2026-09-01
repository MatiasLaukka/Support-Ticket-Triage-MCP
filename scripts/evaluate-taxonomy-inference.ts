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
} from "../src/domain.js";

import {
  evaluateTaxonomyLane,
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
  | "live";

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

  throw new Error(
    "Unknown taxonomy inference argument. Use no flags or --live.",
  );
}

export interface TaxonomyInferenceComparisonCase {
  ticketId: string;

  expectation: NonNullable<
    EvaluationOracle["taxonomy"]
  >;

  inferenceInput: TaxonomyInferenceInput;
}

export interface TaxonomyInferenceComparisonReport {
  deterministic: TaxonomyLaneEvaluationReport;
  gpt: TaxonomyLaneEvaluationReport | null;
}

export async function evaluateTaxonomyInference(input: {
  cases: readonly TaxonomyInferenceComparisonCase[];
  gptProvider?: TaxonomyReasoningProvider;
}): Promise<TaxonomyInferenceComparisonReport> {
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

  const gpt =
    input.gptProvider === undefined
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
              try {
                const execution =
                  await input.gptProvider!.reason(
                    inferenceInput,
                  );

                return {
                  ticketId,
                  expectation,

                  outcome: {
                    status: "candidate" as const,
                    candidate:
                      execution.candidate,
                  },
                };
              } catch (error) {
                if (
                  error instanceof
                  TaxonomyReasoningProviderUnavailableError
                ) {
                  return {
                    ticketId,
                    expectation,

                    outcome: {
                      status:
                        "provider-unavailable" as const,
                      reason:
                        error.reason,
                      statusCode:
                        error.statusCode,
                    },
                  };
                }

                if (
                  error instanceof
                  InvalidTaxonomySchemaError
                ) {
                  return {
                    ticketId,
                    expectation,

                    outcome: {
                      status:
                        "rejected-taxonomy" as const,
                      stage:
                        error.stage,
                      fields:
                        error.fields,
                    },
                  };
                }

                throw error;
              }
            },
          ),
        ),
      });

  return {
    deterministic,
    gpt,
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

    const conversationContext =
      buildConversationContextForTicket({
        ticket,
        customerReplies: [],
        previousSupportResponses: [],
      });

    const classification =
      classifyTicketFromContext(
        conversationContext,
      );

    cases.push({
      ticketId:
        oracle.ticketId,

      expectation:
        oracle.taxonomy,

      inferenceInput: {
        ticket,

        conversationText:
          conversationContext.classificationText,

        deterministicClassification: {
          category:
            classification.category,

          team:
            classification.team,

          priority:
            classification.priority,
        },
      },
    });
  }

  if (input.mode === "offline") {
    return evaluateTaxonomyInference({
      cases,
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
    gptProvider,
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