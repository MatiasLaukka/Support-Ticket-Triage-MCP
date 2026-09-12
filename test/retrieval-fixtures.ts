import type { KnowledgeArticle } from "../src/domain.js";
export function retrievalArticle(overrides: Partial<KnowledgeArticle> = {}): KnowledgeArticle { return { id: "article", title: "Article", tags: ["support"], body: "Useful support text.", ...overrides }; }
