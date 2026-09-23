import type { IndexManager } from "./index-manager.js";
import { rankRetrieval, RESOURCE_TYPES } from "./ranking.js";
import type {
  RankingOutputLimits,
  RankingPolicy,
  RankingResult,
} from "./ranking-types.js";
import { retrieve } from "./search.js";
import type { RetrievalStore } from "./sqlite-store.js";
import type {
  EmbeddingProvider,
  Limits,
  Query,
  RetrievalResult,
} from "./types.js";

export type RetrievalRankingExecution =
  | {
      status: "not-requested";
    }
  | {
      status: "succeeded";
      result: RankingResult;
      durationMs: number;
    }
  | {
      status: "failed";
      error: unknown;
      durationMs: number;
    };

export interface RetrievalExecution {
  retrieval: RetrievalResult;
  ranking: RetrievalRankingExecution;
}

export interface RetrievalExecutionInput {
  manager: IndexManager;
  store: RetrievalStore;
  provider?: EmbeddingProvider;
  limits: Limits;
  query: Query;
  signal: AbortSignal;
  ranking?: {
    policy: RankingPolicy;
    outputLimit: number;
  };
}

export async function executeRetrieval(
  input: RetrievalExecutionInput,
): Promise<RetrievalExecution> {
  await input.manager.refresh(input.signal);

  const retrieval = await retrieve({
    query: input.query,
    store: input.store,
    provider: input.provider,
    limits: input.limits,
    signal: input.signal,
  });

  if (input.ranking === undefined) {
    return {
      retrieval,
      ranking: { status: "not-requested" },
    };
  }

    const ranking = input.ranking;
    const rankingStarted = performance.now();

    try {
    const outputLimits = Object.fromEntries(
        RESOURCE_TYPES.map((resourceType) => [
        resourceType,
        ranking.outputLimit,
        ]),
    ) as RankingOutputLimits;

    const result = rankRetrieval(
      {
        contractVersion: 1,
        queryBasis: {
          queryHash: input.query.queryHash,
          ticketId: input.query.ticketId,
          ticketRevision: input.query.sourceRevision,
          customerReplyWatermark: input.query.customerReplyWatermark,
        },
        retrieval,
        outputLimits,
      },
      ranking.policy,
    );

    return {
      retrieval,
      ranking: {
        status: "succeeded",
        result,
        durationMs: performance.now() - rankingStarted,
      },
    };
  } catch (error) {
    return {
      retrieval,
      ranking: {
        status: "failed",
        error,
        durationMs: performance.now() - rankingStarted,
      },
    };
  }
}