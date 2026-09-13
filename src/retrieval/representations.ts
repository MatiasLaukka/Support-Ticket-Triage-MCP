import { createHash } from "node:crypto";
import type { KnowledgeArticle } from "../domain.js";
import type { ProjectedResource, Representation, Resource, ResourceKey } from "./types.js";
export const REPRESENTATION_VERSION = 2;
export const ARTICLE_SECTION_BODY_LIMIT = 4_000;
export const normalizeText = (text: string): string => text.normalize("NFC").replace(/\r\n?/g, "\n").trim();
export const hashText = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
export function hashRepresentation(representation: Omit<Representation, "contentHash">): string {
  return hashText(JSON.stringify({
    version: REPRESENTATION_VERSION,
    resourceKey: representation.resourceKey,
    kind: representation.kind,
    ordinal: representation.ordinal,
    title: representation.title,
    heading: representation.heading ?? null,
    keywords: representation.keywords,
    lexicalText: representation.lexicalText,
    semanticText: representation.semanticText,
  }));
}
export function hashResource(resource: Omit<Resource, "contentHash">, representations: readonly Pick<Representation, "id" | "contentHash">[]): string {
  return hashText(JSON.stringify({
    version: REPRESENTATION_VERSION,
    resource,
    representations: representations.map(({ id, contentHash }) => ({ id, contentHash })).sort((left, right) => left.id.localeCompare(right.id)),
  }));
}
const unsafeCaseText = /(?:\b(?:raw\s+)?(?:system|developer|user)\s+(?:prompt|message|instructions?)\b|\braw\s+prompt\b|\b(?:hidden|chain[- ]of[- ]thought|reasoning)\b|\b(?:api[-_]?key|access[-_]?token|secret|password)\s*[=:]\s*\S+|\bsk-[a-z0-9_-]+\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:account|tenant|workspace|organization|customer)\s*(?:id|identifier|number)\s*[=:]\s*\S+|\b(?:[a-z]:[\\/]|\\\\)|(?:^|\s)[~\/][^\s]*|\b(?:model|provider)\s+(?:payload|response)\b|^\s*[\[{]|https?:\/\/[^\s/@]+:[^\s/@]+)/i;
export function safeCaseText(text: string, identifiers: readonly string[]): string | undefined { let value = normalizeText(text); for (const identifier of identifiers) { const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); if (escaped) value = value.replace(new RegExp(escaped, "giu"), ""); } value = normalizeText(value.replace(/\s{2,}/g, " ")); return value.length > 0 && !unsafeCaseText.test(value) ? value : undefined; }
function splitLongText(text: string): readonly string[] { if (text.length <= ARTICLE_SECTION_BODY_LIMIT) return [text]; const result: string[] = []; let remaining = text; while (remaining.length > ARTICLE_SECTION_BODY_LIMIT) { const boundary = remaining.lastIndexOf(" ", ARTICLE_SECTION_BODY_LIMIT); const index = boundary > 0 ? boundary : ARTICLE_SECTION_BODY_LIMIT; result.push(remaining.slice(0, index).trim()); remaining = remaining.slice(index).trim(); } if (remaining) result.push(remaining); return result; }
function splitBody(body: string): readonly { heading?: string; text: string }[] { const sections: { heading?: string; text: string }[] = []; let heading: string | undefined; let current: string[] = []; const flush = () => { const text = normalizeText(current.join("\n")); if (text) sections.push({ heading, text }); current = []; }; for (const line of normalizeText(body).split("\n")) { const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line); if (match) { flush(); heading = normalizeText(match[2]!); } else current.push(line); } flush(); return sections.flatMap((section) => splitLongText(section.text).map((text) => ({ heading: section.heading, text }))); }
export function projectArticle(article: KnowledgeArticle): ProjectedResource { const key = `knowledge-article:${article.id}` as ResourceKey; const tags = [...article.tags].map(normalizeText).sort(); const title = normalizeText(article.title); const representations: Representation[] = splitBody(article.body).map(({ heading, text }, ordinal) => { const representation = { id: `${key}:section:${ordinal}`, resourceKey: key, kind: "section", ordinal, title, ...(heading ? { heading } : {}), keywords: tags, lexicalText: normalizeText([title, heading, tags.join(" "), text].filter(Boolean).join("\n")), semanticText: normalizeText([title, heading, text].filter(Boolean).join("\n\n")) }; return { ...representation, contentHash: hashRepresentation(representation) }; }); const resource = { key, type: "knowledge-article" as const, sourceId: article.id, family: "article" as const, linkedResourceKeys: [] as const }; return { resource: { ...resource, contentHash: hashResource(resource, representations) }, representations }; }
