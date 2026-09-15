import { describe, expect, it } from "vitest";
import { TicketSchema } from "../src/domain.js";
import {
  ReadinessCaseSchema,
  ReadinessManifestSchema,
  selectReadinessDevelopment,
  validateReadinessCases,
  validateReadinessSplits,
  type ReadinessCase,
} from "../src/retrieval/readiness-cases.js";
import { projectArticle } from "../src/retrieval/representations.js";
import { projectStaticCause } from "../src/retrieval/sources.js";

const projected = projectArticle({
  id: "editor-loading",
  title: "Editor loading investigation",
  tags: ["editor", "loading"],
  body: "# Isolation evidence\n\nCompare a private session with the affected session.\n\n# Console evidence\n\nCapture the first loading error.",
});
const alternateProjected = projectArticle({
  id: "webhook-rotation",
  title: "Webhook rotation investigation",
  tags: ["webhook", "rotation"],
  body: "# Rotation evidence\n\nCompare the configured and expected signing-secret versions.",
});
const canonicalProjected = projectStaticCause({
  id: "synthetic-editor-cause",
  label: "Synthetic editor cause",
  knowledgeArticleIds: ["editor-loading"],
  evidencePolicy: "required",
  requiredEvidenceIds: ["isolation-result"],
  matches: () => false,
  problemSummary: "A synthetic cause used only by this local evaluation fixture.",
  nextStep: "Collect the isolation result.",
  investigationSteps: ["Compare affected and private sessions."],
});
const corpus = [projected, alternateProjected, canonicalProjected] as const;
const representation = projected.representations[0]!;

const ticket = TicketSchema.parse({
  id: "TKT-9100",
  createdAt: "2026-09-14T09:00:00.000Z",
  updatedAt: "2026-09-14T09:00:00.000Z",
  customer: { name: "Synthetic Example", plan: "starter", region: "eu", vip: false },
  subject: "The editor does not open",
  description: "The editing screen remains blank in the affected session.",
  status: "triage",
  tags: ["synthetic", "editor"],
  sla: { responseDueAt: "2026-09-14T12:00:00.000Z", breached: false },
  revision: 0,
});

function readinessCase(overrides: Partial<ReadinessCase> = {}): ReadinessCase {
  return {
    id: "readiness-editor-001",
    topic: "campaign-editor",
    families: ["paraphrase"],
    scenarioGroup: "editor-session-isolation",
    split: "development",
    provenance: {
      kind: "synthetic",
      basis: ["Approved demo-domain article content"],
      derivedFrom: [],
    },
    ticket,
    expectation: {
      requiredResourceKeys: [projected.resource.key],
      relevantResourceKeys: [projected.resource.key],
      hardNegativeResourceKeys: [alternateProjected.resource.key],
      labelsComplete: true,
      resourceCoverage: {
        "knowledge-article": "adequate",
        "known-cause": "not-expected",
        "diagnostic-playbook": "missing",
        "resolved-ticket": "not-expected",
      },
    },
    supportingSections: [{
      resourceKey: projected.resource.key,
      sourceHash: projected.resource.contentHash,
      heading: representation.heading!,
      representationIds: [representation.id],
      rationale: "This section supplies the next isolation check.",
    }],
    evidenceNotes: "The report does not yet include an isolation result.",
    labelRationale: "The article is useful for the next investigation step.",
    review: {
      status: "approved",
      reviewedBy: "domain-reviewer",
      reviewedAt: "2026-09-14T10:00:00.000Z",
      decisionRef: "review-decision-001",
    },
    ...overrides,
  };
}

describe("readiness case JSON contracts", () => {
  it("accepts a complete strict case and rejects unknown fields", () => {
    expect(ReadinessCaseSchema.parse(readinessCase()).id).toBe("readiness-editor-001");
    expect(() => ReadinessCaseSchema.parse({ ...readinessCase(), inventedApproval: true })).toThrow();
  });

  it("validates manifest timestamps, SHA-256 values, and exact versions", () => {
    const valid = {
      version: 1,
      sourceRevision: "ae3fd6b0771d4ae55b8fdb72846328f2f9a28024",
      corpusHash: "a".repeat(64),
      representationVersion: 3,
      cutoff: "2026-09-14T10:00:00.000Z",
      development: { path: "data/evaluation/knowledge-readiness/development.json", sha256: "b".repeat(64) },
      holdout: { path: "data/evaluation/knowledge-readiness/holdout.json", sha256: "c".repeat(64) },
    };
    expect(ReadinessManifestSchema.parse(valid).version).toBe(1);
    expect(() => ReadinessManifestSchema.parse({ ...valid, corpusHash: "not-a-sha" })).toThrow();
    expect(() => ReadinessManifestSchema.parse({ ...valid, cutoff: "yesterday" })).toThrow();
    expect(() => ReadinessManifestSchema.parse({ ...valid, representationVersion: 2 })).toThrow();
    expect(() => ReadinessManifestSchema.parse({ ...valid, extra: true })).toThrow();
  });

  it("requires nonempty families and review rationales", () => {
    expect(() => ReadinessCaseSchema.parse(readinessCase({ families: [] }))).toThrow();
    expect(() => ReadinessCaseSchema.parse(readinessCase({ labelRationale: "  " }))).toThrow();
    expect(() => ReadinessCaseSchema.parse(readinessCase({
      supportingSections: [{ ...readinessCase().supportingSections[0]!, rationale: "" }],
    }))).toThrow();
  });

  it("allows a complete negative-control label with no supporting section", () => {
    const negativeControl = readinessCase({
      families: ["near-match"],
      expectation: {
        ...readinessCase().expectation,
        requiredResourceKeys: [],
        relevantResourceKeys: [],
        hardNegativeResourceKeys: [projected.resource.key],
      },
      supportingSections: [],
      labelRationale: "Incidental editor terminology does not make the article useful for this report.",
    });
    expect(() => validateReadinessCases([negativeControl], corpus)).not.toThrow();
  });

  it("composes the oracle constraints for required and hard-negative labels", () => {
    expect(() => ReadinessCaseSchema.parse(readinessCase({
      expectation: { ...readinessCase().expectation, relevantResourceKeys: [] },
    }))).toThrow(/relevant/i);
    expect(() => ReadinessCaseSchema.parse(readinessCase({
      expectation: {
        ...readinessCase().expectation,
        hardNegativeResourceKeys: [projected.resource.key],
      },
    }))).toThrow(/hard negative/i);
  });
});

describe("readiness source bindings", () => {
  it("accepts current source hashes, headings, and matching representation IDs", () => {
    expect(() => validateReadinessCases([readinessCase()], corpus)).not.toThrow();
  });

  it("rejects duplicate case IDs", () => {
    expect(() => validateReadinessCases([readinessCase(), readinessCase()], corpus)).toThrow(/duplicate/i);
  });

  it("rejects a missing bound resource or heading", () => {
    expect(() => validateReadinessCases([readinessCase({
      supportingSections: [{
        ...readinessCase().supportingSections[0]!,
        resourceKey: "knowledge-article:missing",
      }],
    })], corpus)).toThrow(/resource/i);
    expect(() => validateReadinessCases([readinessCase({
      supportingSections: [{ ...readinessCase().supportingSections[0]!, heading: "Missing heading" }],
    })], corpus)).toThrow(/heading/i);
  });

  it("rejects stale source hashes even if the case ID is rewritten", () => {
    expect(() => validateReadinessCases([readinessCase({
      id: "arbitrary-rewrite-999",
      supportingSections: [{ ...readinessCase().supportingSections[0]!, sourceHash: "0".repeat(64) }],
    })], corpus)).toThrow(/hash|review/i);
  });

  it("rejects representation IDs that do not match the current bound heading", () => {
    const wrongRepresentation = projected.representations[1]!;
    expect(() => validateReadinessCases([readinessCase({
      supportingSections: [{
        ...readinessCase().supportingSections[0]!,
        representationIds: [wrongRepresentation.id],
      }],
    })], corpus)).toThrow(/representation/i);
  });

  it("allows a non-article canonical title when no heading exists", () => {
    const canonical = canonicalProjected.representations[0]!;
    expect(() => validateReadinessCases([readinessCase({
      expectation: {
        ...readinessCase().expectation,
        requiredResourceKeys: [canonicalProjected.resource.key],
        relevantResourceKeys: [canonicalProjected.resource.key],
      },
      supportingSections: [{
        resourceKey: canonicalProjected.resource.key,
        sourceHash: canonicalProjected.resource.contentHash,
        heading: canonical.title,
        representationIds: [canonical.id],
        rationale: "The canonical cause supplies a grounded investigation step.",
      }],
    })], corpus)).not.toThrow();
  });

  it("does not treat an unheaded article title as a section heading", () => {
    const unheadedArticle = projectArticle({
      id: "unheaded-article",
      title: "Unheaded article",
      tags: ["synthetic"],
      body: "This article has no descriptive section heading.",
    });
    const unheadedRepresentation = unheadedArticle.representations[0]!;
    expect(() => validateReadinessCases([readinessCase({
      expectation: {
        ...readinessCase().expectation,
        requiredResourceKeys: [unheadedArticle.resource.key],
        relevantResourceKeys: [unheadedArticle.resource.key],
      },
      supportingSections: [{
        resourceKey: unheadedArticle.resource.key,
        sourceHash: unheadedArticle.resource.contentHash,
        heading: unheadedRepresentation.title,
        representationIds: [unheadedRepresentation.id],
        rationale: "An article needs an actual section heading.",
      }],
    })], [...corpus, unheadedArticle])).toThrow(/heading/i);
  });
});

describe("fail-closed development selection", () => {
  it("refuses a complete pending-review case", () => {
    const pendingCase = readinessCase({ review: { status: "pending" } });
    expect(() => selectReadinessDevelopment([pendingCase])).toThrow(/review/i);
  });

  it("refuses empty, holdout-only, and mixed split inputs", () => {
    expect(() => selectReadinessDevelopment([])).toThrow(/empty|case/i);
    expect(() => selectReadinessDevelopment([readinessCase({ split: "holdout" })])).toThrow(/holdout|split/i);
    expect(() => selectReadinessDevelopment([
      readinessCase(),
      readinessCase({ id: "readiness-editor-002", split: "holdout", scenarioGroup: "independent-holdout" }),
    ])).toThrow(/holdout|split/i);
  });

  it("returns an approved development-only set", () => {
    expect(selectReadinessDevelopment([readinessCase()])).toHaveLength(1);
  });
});

describe("readiness split isolation", () => {
  it("rejects separate case IDs in the same scenario group across splits", () => {
    expect(() => validateReadinessSplits(
      [readinessCase()],
      [readinessCase({ id: "readiness-editor-002", split: "holdout" })],
    )).toThrow(/scenario|split/i);
  });

  it("rejects derived variants crossing splits even with different scenario groups", () => {
    expect(() => validateReadinessSplits(
      [readinessCase()],
      [readinessCase({
        id: "readiness-editor-002",
        split: "holdout",
        scenarioGroup: "rewritten-group-name",
        provenance: {
          kind: "synthetic",
          basis: ["Approved demo-domain article content"],
          derivedFrom: ["readiness-editor-001"],
        },
      })],
    )).toThrow(/derived|split/i);
  });

  it("accepts independent scenario groups assigned to their declared splits", () => {
    expect(() => validateReadinessSplits(
      [readinessCase()],
      [readinessCase({
        id: "readiness-webhook-001",
        topic: "webhook",
        split: "holdout",
        scenarioGroup: "webhook-independent-holdout",
      })],
    )).not.toThrow();
  });
});
