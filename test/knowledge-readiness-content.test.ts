import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { KnowledgeRepository } from "../src/knowledge-repository.js";
import { projectArticle } from "../src/retrieval/representations.js";

const scopedIds = ["performance-troubleshooting", "webhook-signature-validation",
  "flow-trigger-troubleshooting", "event-tracking-debugging"];

describe("knowledge readiness content", () => {
  it.each(scopedIds)("keeps %s qualifications in diagnosis and descriptive retrieval sections", async (id) => {
    const article = await new KnowledgeRepository(resolve("data/knowledge")).get(id);
    expect(article.body.slice(0, 1800)).toContain("A symptom alone does not confirm a cause.");
    expect(article.body.slice(0, 1800)).toContain("Do not claim a fix without verification.");
    const sections = projectArticle(article).representations;
    expect(sections.length).toBeGreaterThanOrEqual(5);
    expect(sections.every((section) => section.heading?.trim())).toBe(true);
    expect(new Set(sections.map((section) => section.heading)).size).toBe(sections.length);
    for (const link of article.body.matchAll(/\]\(([^)]+)\)/g)) {
      expect(link[1]).toMatch(/^[a-z0-9-]+\.md$/);
      expect(existsSync(resolve("data/knowledge", link[1]!))).toBe(true);
    }
  });
});
