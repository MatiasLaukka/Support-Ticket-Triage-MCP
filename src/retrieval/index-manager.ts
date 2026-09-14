import type { EmbeddingProvider, IndexMetadata, Representation, SearchSnapshot, SourceSnapshot } from "./types.js";
import { RetrievalIntegrityError, RetrievalStore } from "./sqlite-store.js";
import { EmbeddingProviderError } from "./embedding-provider.js";

export class IndexManager {
  private tail: Promise<void> = Promise.resolve();
  private closed = false;
  private readonly controller = new AbortController();

  constructor(private readonly input: { store: RetrievalStore; load: () => Promise<SourceSnapshot>; provider?: EmbeddingProvider }) {}

  refresh(signal: AbortSignal): Promise<IndexMetadata> { return this.serialize(() => this.runRefresh(signal, false)); }
  rebuild(signal: AbortSignal): Promise<IndexMetadata> { return this.serialize(() => this.runRefresh(signal, true)); }
  async close(): Promise<void> { this.closed = true; this.controller.abort(); await this.tail; }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new Error("Retrieval index manager is closed."));
    const result = this.tail.then(work);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }

  private async runRefresh(signal: AbortSignal, rebuild: boolean): Promise<IndexMetadata> {
    if (rebuild) this.input.store.validateForRebuild();
    else this.input.store.validate();
    const snapshot = await this.input.load();
    if (rebuild) {
      this.input.store.assertRebuildSourcesAvailable(snapshot);
      const vectors = this.input.provider === undefined
        ? []
        : await this.embed(snapshot.resources.flatMap(({ representations }) => representations), signal);
      this.input.store.replaceAll(snapshot, vectors, this.input.provider?.model);
      return this.input.store.metadata();
    }
    if (this.input.provider) this.input.store.configureModel(this.input.provider.model);
    const pending = this.input.store.reconcile(snapshot);
    if (this.input.provider && pending.length > 0) {
      try {
        this.input.store.installVectors(await this.embed(pending, signal));
      } catch (error) {
        if (signal.aborted || this.controller.signal.aborted) throw error;
        if (error instanceof RetrievalIntegrityError || !(error instanceof EmbeddingProviderError)) throw error;
        return this.input.store.metadata();
      }
    }
    return this.input.store.metadata();
  }

  private async embed(representations: readonly Representation[], signal: AbortSignal): Promise<readonly SearchSnapshot["vectors"][number][]> {
    const provider = this.input.provider;
    if (provider === undefined || representations.length === 0) return [];
    const vectors: Array<SearchSnapshot["vectors"][number]> = [];
    for (let index = 0; index < representations.length; index += 16) {
      const batch = representations.slice(index, index + 16);
      const values = await provider.embed(batch.map(({ semanticText }) => semanticText), this.combinedSignal(signal));
      if (values.length !== batch.length) throw new Error("Embedding provider returned the wrong number of vectors.");
      values.forEach((value, offset) => vectors.push({ representationId: batch[offset]!.id, resourceKey: batch[offset]!.resourceKey, contentHash: batch[offset]!.contentHash, model: provider.model, values: value }));
    }
    return vectors;
  }

  private combinedSignal(signal: AbortSignal): AbortSignal {
    if (signal.aborted || this.controller.signal.aborted) return AbortSignal.abort();
    return AbortSignal.any([signal, this.controller.signal]);
  }
}
