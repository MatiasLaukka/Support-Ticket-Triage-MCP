import type { EmbeddingProvider, IndexMetadata, SearchSnapshot, SourceSnapshot } from "./types.js";
import { RetrievalStore } from "./sqlite-store.js";

export class IndexManager {
  private tail: Promise<void> = Promise.resolve();
  private closed = false;
  private readonly controller = new AbortController();
  constructor(private readonly input: { store: RetrievalStore; load: () => Promise<SourceSnapshot>; provider?: EmbeddingProvider }) {}
  refresh(signal: AbortSignal): Promise<IndexMetadata> { return this.serialize(() => this.runRefresh(signal, false)); }
  rebuild(signal: AbortSignal): Promise<IndexMetadata> { return this.serialize(() => this.runRefresh(signal, true)); }
  async close(): Promise<void> { this.closed = true; this.controller.abort(); await this.tail; }
  private serialize<T>(work: () => Promise<T>): Promise<T> { if (this.closed) return Promise.reject(new Error("Retrieval index manager is closed.")); const result = this.tail.then(work); this.tail = result.then(() => undefined, () => undefined); return result; }
  private async runRefresh(signal: AbortSignal, rebuild: boolean): Promise<IndexMetadata> { const snapshot = await this.input.load(); if (this.input.provider) this.input.store.configureModel(this.input.provider.model); const pending = this.input.store.reconcile(snapshot); if (this.input.provider && pending.length > 0) { const vectors: Array<SearchSnapshot["vectors"][number]> = []; for (let index = 0; index < pending.length; index += 16) { const batch = pending.slice(index, index + 16); const values = await this.input.provider.embed(batch.map(({ semanticText }) => semanticText), this.combinedSignal(signal)); values.forEach((value, offset) => vectors.push({ representationId: batch[offset]!.id, resourceKey: batch[offset]!.resourceKey, contentHash: batch[offset]!.contentHash, model: this.input.provider!.model, values: value })); } this.input.store.installVectors(vectors); } return this.input.store.metadata(); }
  private combinedSignal(signal: AbortSignal): AbortSignal { if (signal.aborted || this.controller.signal.aborted) return AbortSignal.abort(); return AbortSignal.any([signal, this.controller.signal]); }
}
