import type { EmbeddingProvider, ModelIdentity } from "./types.js";

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_CHARS = 2_000_000;
export class EmbeddingProviderError extends Error { constructor(readonly code: string, message: string) { super(message); this.name = "EmbeddingProviderError"; } }

export function createEmbeddingProvider(input: { endpoint: string; model: ModelIdentity; apiKey?: string; timeoutMs?: number; fetchImpl?: typeof fetch }): EmbeddingProvider {
  const url = new URL(input.endpoint);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1"))) throw new EmbeddingProviderError("PROVIDER_INVALID_CONFIGURATION", "Embedding endpoint must use HTTPS unless local.");
  if (!Number.isInteger(input.model.dimensions) || input.model.dimensions <= 0) throw new EmbeddingProviderError("PROVIDER_INVALID_CONFIGURATION", "Embedding dimensions must be positive.");
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = input.fetchImpl ?? fetch;
  return { model: input.model, async embed(texts, signal) { if (texts.length === 0) return []; const timeout = AbortSignal.timeout(timeoutMs); try { const response = await fetchImpl(input.endpoint, { method: "POST", signal: AbortSignal.any([signal, timeout]), redirect: "error", headers: { "Content-Type": "application/json", ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}) }, body: JSON.stringify({ model: input.model.id, input: texts }) }); if (!response.ok) throw new EmbeddingProviderError("PROVIDER_HTTP_ERROR", `Embedding provider returned HTTP ${response.status}.`); const body = await response.text(); if (body.length > MAX_RESPONSE_CHARS) throw new EmbeddingProviderError("PROVIDER_INVALID_RESPONSE", "Embedding provider response is too large."); let parsed: unknown; try { parsed = JSON.parse(body); } catch { throw new EmbeddingProviderError("PROVIDER_INVALID_RESPONSE", "Embedding provider response was not valid JSON."); } if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { data?: unknown }).data)) throw new EmbeddingProviderError("PROVIDER_INVALID_RESPONSE", "Embedding provider response had no data array."); const data = (parsed as { data: unknown[] }).data; if (data.length !== texts.length) throw new EmbeddingProviderError("PROVIDER_INVALID_RESPONSE", "Embedding provider returned the wrong number of vectors."); const result: number[][] = Array.from({ length: texts.length }); const seen = new Set<number>(); for (const item of data) { if (!item || typeof item !== "object" || !Number.isInteger((item as { index?: unknown }).index) || !Array.isArray((item as { embedding?: unknown }).embedding)) throw new EmbeddingProviderError("PROVIDER_INVALID_RESPONSE", "Embedding provider returned malformed vector data."); const index = (item as { index: number }).index; const embedding = (item as { embedding: unknown[] }).embedding; if (index < 0 || index >= texts.length || seen.has(index) || embedding.length !== input.model.dimensions || embedding.some((value) => typeof value !== "number" || !Number.isFinite(value)) || embedding.every((value) => value === 0)) throw new EmbeddingProviderError("PROVIDER_INVALID_RESPONSE", "Embedding provider returned incompatible vectors."); seen.add(index); result[index] = embedding as number[]; } if (seen.size !== texts.length || result.some((value) => value === undefined)) throw new EmbeddingProviderError("PROVIDER_INVALID_RESPONSE", "Embedding provider omitted a vector."); return result; } catch (error) { if (error instanceof EmbeddingProviderError) throw error; if (signal.aborted) throw new EmbeddingProviderError("PROVIDER_CANCELLED", "Embedding request was cancelled."); if (error instanceof DOMException && error.name === "TimeoutError") throw new EmbeddingProviderError("PROVIDER_TIMEOUT", "Embedding provider timed out."); throw new EmbeddingProviderError("PROVIDER_UNREACHABLE", "Embedding provider was unreachable."); } } };
}

export function embeddingProviderFromEnv(env: NodeJS.ProcessEnv): EmbeddingProvider | undefined {
  const endpoint = env.TRIAGE_EMBEDDING_ENDPOINT;
  const modelId = env.TRIAGE_EMBEDDING_MODEL;
  const revision = env.TRIAGE_EMBEDDING_REVISION;
  const dimensions = env.TRIAGE_EMBEDDING_DIMENSIONS;
  if (!endpoint && !modelId && !revision && !dimensions) return undefined;
  if (!endpoint || !modelId || !revision || !dimensions) throw new EmbeddingProviderError("PROVIDER_INVALID_CONFIGURATION", "Embedding configuration is incomplete.");
  const parsedDimensions = Number(dimensions);
  if (!Number.isInteger(parsedDimensions) || parsedDimensions <= 0) throw new EmbeddingProviderError("PROVIDER_INVALID_CONFIGURATION", "Embedding dimensions must be positive.");
  const timeout = env.TRIAGE_EMBEDDING_TIMEOUT_MS === undefined ? undefined : Number(env.TRIAGE_EMBEDDING_TIMEOUT_MS);
  if (timeout !== undefined && (!Number.isInteger(timeout) || timeout <= 0)) throw new EmbeddingProviderError("PROVIDER_INVALID_CONFIGURATION", "Embedding timeout must be positive.");
  return createEmbeddingProvider({ endpoint, model: { id: modelId, revision, dimensions: parsedDimensions }, ...(env.TRIAGE_EMBEDDING_API_KEY ? { apiKey: env.TRIAGE_EMBEDDING_API_KEY } : {}), ...(timeout === undefined ? {} : { timeoutMs: timeout }) });
}
