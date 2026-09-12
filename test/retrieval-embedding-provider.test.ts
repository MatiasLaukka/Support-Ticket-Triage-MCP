import { describe, expect, it, vi } from "vitest";
import { createEmbeddingProvider, embeddingProviderFromEnv } from "../src/retrieval/embedding-provider.js";

describe("retrieval embedding provider", () => {
  it("sends only model and input and restores indexed response order", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }] }), { status: 200 }));
    const provider = createEmbeddingProvider({ endpoint: "http://127.0.0.1:8080/v1/embeddings", model: { id: "local", revision: "r1", dimensions: 2 }, apiKey: "secret" , fetchImpl });
    await expect(provider.embed(["a", "b"], new AbortController().signal)).resolves.toEqual([[1, 0], [0, 1]]);
    const request = fetchImpl.mock.calls[0]![1]!;
    expect(JSON.parse(String(request.body))).toEqual({ model: "local", input: ["a", "b"] });
  });

  it("requires a complete environment tuple and supports lexical-only absence", () => {
    expect(embeddingProviderFromEnv({})).toBeUndefined();
    expect(() => embeddingProviderFromEnv({ TRIAGE_EMBEDDING_ENDPOINT: "http://localhost", TRIAGE_EMBEDDING_MODEL: "m" })).toThrow();
  });

  it("rejects duplicate, zero, and wrong-dimension vectors", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: [{ index: 0, embedding: [0, 0] }, { index: 0, embedding: [1, 1] }] }), { status: 200 }));
    const provider = createEmbeddingProvider({ endpoint: "http://localhost/v1/embeddings", model: { id: "m", revision: "r", dimensions: 2 }, fetchImpl });
    await expect(provider.embed(["a", "b"], new AbortController().signal)).rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
  });
});
