import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  AuditEventSchema,
  TicketSchema,
  TriageRecommendationSchema,
  type AuditEvent,
  type Ticket,
  type TriageRecommendation,
} from "../src/domain.js";
import { DomainError } from "../src/errors.js";
import { AuditRepository } from "../src/audit-repository.js";
import { KnowledgeRepository } from "../src/knowledge-repository.js";
import { RecommendationRepository } from "../src/recommendation-repository.js";
import { TicketRepository } from "../src/ticket-repository.js";

const temporaryRoots: string[] = [];

const baseTicket = TicketSchema.parse({
  id: "TKT-1001",
  createdAt: "2026-06-10T08:00:00.000Z",
  updatedAt: "2026-06-10T08:30:00.000Z",
  customer: {
    name: "Northstar Labs",
    plan: "enterprise",
    region: "eu-west",
    vip: false,
  },
  subject: "API requests return 503",
  description: "Production requests fail consistently.",
  status: "triage",
  category: "api",
  priority: "P1",
  team: "api-platform",
  assignee: "operator@example.test",
  tags: ["api", "outage"],
  sla: {
    responseDueAt: "2026-06-10T10:30:00.000Z",
    breached: false,
  },
  relatedTicketIds: [],
  revision: 2,
});

const recommendation = TriageRecommendationSchema.parse({
  id: "d61bba15-41f4-495b-a794-93696343cc9d",
  ticketId: "TKT-1001",
  sourceRevision: 2,
  category: "incident",
  priority: "P1",
  team: "incident-response",
  duplicateCandidates: [],
  outageRisk: "likely",
  securityRisk: "none",
  slaRisk: "possible",
  missingInformation: [],
  knowledgeArticleIds: ["api-errors"],
  draftCustomerResponse: "We are investigating the elevated API errors.",
  rationale: "Multiple reports share a production failure signature.",
  confidence: 0.9,
  recommendedNextAction: "Notify incident response.",
  escalationRequired: true,
  escalationReasons: ["outage"],
  resolution: "pending",
  createdAt: "2026-06-10T08:35:00.000Z",
});

const auditEvent = AuditEventSchema.parse({
  id: "00c96411-a595-4e2a-8869-c219d7637980",
  timestamp: "2026-06-10T08:40:01.000Z",
  actor: "casey",
  action: "recommendation-approved",
  ticketId: "TKT-1001",
  recommendationId: recommendation.id,
  before: { priority: "P3" },
  after: { priority: "P1" },
  rationale: "Approved incident routing.",
  knowledgeArticleIds: ["api-errors"],
  result: "success",
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "support-repositories-"));
  temporaryRoots.push(root);
  return root;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function ticket(
  id: `TKT-${number}`,
  overrides: Partial<Ticket> = {},
): Ticket {
  return TicketSchema.parse({
    ...baseTicket,
    id,
    ...overrides,
    customer: {
      ...baseTicket.customer,
      ...overrides.customer,
    },
    sla: {
      ...baseTicket.sla,
      ...overrides.sla,
    },
  });
}

async function createTicketRepository(
  tickets: Ticket[],
): Promise<{
  repository: TicketRepository;
  root: string;
  runtimeRoot: string;
  seedFile: string;
}> {
  const root = await temporaryRoot();
  const runtimeRoot = resolve(root, "runtime");
  const seedFile = resolve(root, "tickets.seed.json");
  await writeJson(seedFile, tickets);
  const repository = new TicketRepository(runtimeRoot, seedFile);
  await repository.initialize();
  return { repository, root, runtimeRoot, seedFile };
}

function expectDomainError(
  code: string,
  message: string,
): (error: unknown) => boolean {
  return (error) => {
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({ code, message });
    for (const root of temporaryRoots) {
      expect(String((error as Error).message)).not.toContain(root);
    }
    return true;
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

describe("TicketRepository", () => {
  it("initializes runtime tickets from seed without overwriting existing state", async () => {
    const root = await temporaryRoot();
    const runtimeRoot = resolve(root, "runtime");
    const seedFile = resolve(root, "tickets.seed.json");
    await writeJson(seedFile, [baseTicket]);

    const repository = new TicketRepository(runtimeRoot, seedFile);
    await repository.initialize();
    const runtimeFile = resolve(runtimeRoot, "tickets.json");
    const existing = [
      ticket("TKT-1002", {
        subject: "Existing runtime state",
        revision: 7,
      }),
    ];
    await writeJson(runtimeFile, existing);
    await repository.initialize();

    expect(JSON.parse(await readFile(runtimeFile, "utf8"))).toEqual(existing);
  });

  it("filters tickets by status, category, priority, team, and SLA state", async () => {
    const { repository } = await createTicketRepository([
      ticket("TKT-1001", {
        status: "triage",
        category: "api",
        priority: "P1",
        team: "api-platform",
        sla: {
          responseDueAt: "2026-06-10T10:30:00.000Z",
          breached: false,
        },
      }),
      ticket("TKT-1002", {
        status: "new",
        category: "billing",
        priority: "P3",
        team: "billing",
        sla: {
          responseDueAt: "2026-06-10T09:30:00.000Z",
          breached: false,
        },
      }),
      ticket("TKT-1003", {
        status: "in-progress",
        category: "security",
        priority: "P2",
        team: "security",
        sla: {
          responseDueAt: "2026-06-10T08:30:00.000Z",
          breached: true,
        },
      }),
    ]);

    await expect(repository.list({ status: "new" })).resolves.toMatchObject({
      items: [expect.objectContaining({ id: "TKT-1002" })],
      total: 1,
    });
    await expect(repository.list({ category: "security" })).resolves.toMatchObject({
      items: [expect.objectContaining({ id: "TKT-1003" })],
      total: 1,
    });
    await expect(repository.list({ priority: "P1" })).resolves.toMatchObject({
      items: [expect.objectContaining({ id: "TKT-1001" })],
      total: 1,
    });
    await expect(repository.list({ team: "billing" })).resolves.toMatchObject({
      items: [expect.objectContaining({ id: "TKT-1002" })],
      total: 1,
    });
    await expect(
      repository.list({
        slaState: "at-risk",
        asOf: "2026-06-10T09:00:00.000Z",
      }),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ id: "TKT-1002" })],
      total: 1,
    });
    await expect(
      repository.list({
        slaState: "breached",
        asOf: "2026-06-10T09:00:00.000Z",
      }),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ id: "TKT-1003" })],
      total: 1,
    });
    await expect(
      repository.list({
        slaState: "healthy",
        asOf: "2026-06-10T09:00:00.000Z",
      }),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ id: "TKT-1001" })],
      total: 1,
    });
  });

  it("bounds pagination limits to 50 and reports the filtered total", async () => {
    const tickets = Array.from({ length: 55 }, (_, index) =>
      ticket(`TKT-${String(1001 + index).padStart(4, "0")}` as `TKT-${number}`),
    );
    const { repository } = await createTicketRepository(tickets);

    const firstPage = await repository.list({ limit: 500 });
    const secondPage = await repository.list({ offset: 50, limit: 500 });

    expect(firstPage).toMatchObject({ total: 55, offset: 0, limit: 50 });
    expect(firstPage.items).toHaveLength(50);
    expect(secondPage).toMatchObject({ total: 55, offset: 50, limit: 50 });
    expect(secondPage.items).toHaveLength(5);
  });

  it("reads and atomically updates a ticket when its revision matches", async () => {
    const { repository, runtimeRoot } = await createTicketRepository([baseTicket]);

    await expect(repository.get("TKT-1001")).resolves.toEqual(baseTicket);
    const updated = await repository.update("TKT-1001", 2, (current) => ({
      ...current,
      status: "in-progress",
      updatedAt: "2026-06-10T08:45:00.000Z",
    }));

    expect(updated).toMatchObject({ status: "in-progress", revision: 3 });
    await expect(repository.get("TKT-1001")).resolves.toEqual(updated);
    expect(await readdir(runtimeRoot)).toEqual(["tickets.json"]);
  });

  it("rejects a stale revision without changing persisted state", async () => {
    const { repository } = await createTicketRepository([baseTicket]);

    await expect(
      repository.update("TKT-1001", 1, (current) => ({
        ...current,
        status: "resolved",
      })),
    ).rejects.toSatisfy(
      expectDomainError(
        "REVISION_CONFLICT",
        "Ticket revision does not match.",
      ),
    );
    await expect(repository.get("TKT-1001")).resolves.toEqual(baseTicket);
  });

  it("returns the stable not-found error for an unknown ticket", async () => {
    const { repository } = await createTicketRepository([baseTicket]);

    await expect(repository.get("TKT-9999")).rejects.toSatisfy(
      expectDomainError("TICKET_NOT_FOUND", "Ticket was not found."),
    );
  });

  it("rejects traversal IDs and linked runtime roots or files", async () => {
    const root = await temporaryRoot();
    const seedFile = resolve(root, "tickets.seed.json");
    await writeJson(seedFile, [baseTicket]);

    const actualRuntimeRoot = resolve(root, "actual-runtime");
    const linkedRuntimeRoot = resolve(root, "linked-runtime");
    await mkdir(actualRuntimeRoot);
    await symlink(actualRuntimeRoot, linkedRuntimeRoot, "junction");
    await expect(
      new TicketRepository(linkedRuntimeRoot, seedFile).initialize(),
    ).rejects.toSatisfy(
      expectDomainError(
        "REPOSITORY_ERROR",
        "Repository contains an unsupported linked path.",
      ),
    );

    const runtimeRoot = resolve(root, "runtime");
    const repository = new TicketRepository(runtimeRoot, seedFile);
    await repository.initialize();
    const runtimeFile = resolve(runtimeRoot, "tickets.json");
    const linkedFile = resolve(runtimeRoot, "linked.json");
    await link(runtimeFile, linkedFile);
    await rm(runtimeFile);
    await link(linkedFile, runtimeFile);
    await expect(repository.get("TKT-1001")).rejects.toSatisfy(
      expectDomainError(
        "REPOSITORY_ERROR",
        "Repository contains an unsupported linked path.",
      ),
    );
    await expect(repository.get("../outside" as never)).rejects.toSatisfy(
      expectDomainError(
        "REPOSITORY_ERROR",
        "Repository path is not allowed.",
      ),
    );
  });
});

describe("KnowledgeRepository", () => {
  it("parses Markdown frontmatter and searches case-insensitively", async () => {
    const root = await temporaryRoot();
    const knowledgeRoot = resolve(root, "knowledge");
    await mkdir(knowledgeRoot);
    await writeFile(
      resolve(knowledgeRoot, "api-errors.md"),
      [
        "---",
        "id: api-errors",
        "title: API Error Investigation",
        "tags: api, errors, validation",
        "---",
        "# Troubleshooting",
        "",
        "Inspect HTTP status codes and request identifiers.",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      resolve(knowledgeRoot, "billing.md"),
      [
        "---",
        "id: billing-refunds",
        "title: Billing Refunds",
        "tags: billing, refund",
        "---",
        "Verify duplicate charges before refunding.",
        "",
      ].join("\n"),
      "utf8",
    );
    const repository = new KnowledgeRepository(knowledgeRoot);

    await expect(repository.list()).resolves.toEqual([
      expect.objectContaining({ id: "api-errors" }),
      expect.objectContaining({ id: "billing-refunds" }),
    ]);
    await expect(repository.get("api-errors")).resolves.toMatchObject({
      id: "api-errors",
      title: "API Error Investigation",
      tags: ["api", "errors", "validation"],
      body: "# Troubleshooting\n\nInspect HTTP status codes and request identifiers.",
    });
    await expect(repository.search("http STATUS", 10)).resolves.toEqual([
      expect.objectContaining({ id: "api-errors" }),
    ]);
    await expect(repository.search("BILLING", 1)).resolves.toEqual([
      expect.objectContaining({ id: "billing-refunds" }),
    ]);
  });

  it("rejects traversal and linked knowledge roots or files", async () => {
    const root = await temporaryRoot();
    const actualRoot = resolve(root, "actual");
    const linkedRoot = resolve(root, "linked");
    await mkdir(actualRoot);
    await symlink(actualRoot, linkedRoot, "junction");
    await expect(new KnowledgeRepository(linkedRoot).list()).rejects.toSatisfy(
      expectDomainError(
        "REPOSITORY_ERROR",
        "Repository contains an unsupported linked path.",
      ),
    );

    const article = resolve(actualRoot, "article.md");
    const linkedArticle = resolve(actualRoot, "linked.md");
    await writeFile(
      article,
      "---\nid: article\ntitle: Article\ntags: test\n---\nBody.\n",
      "utf8",
    );
    await link(article, linkedArticle);
    await expect(new KnowledgeRepository(actualRoot).list()).rejects.toSatisfy(
      expectDomainError(
        "REPOSITORY_ERROR",
        "Repository contains an unsupported linked path.",
      ),
    );
    await expect(
      new KnowledgeRepository(actualRoot).get("../article"),
    ).rejects.toSatisfy(
      expectDomainError(
        "REPOSITORY_ERROR",
        "Repository path is not allowed.",
      ),
    );
  });
});

describe("RecommendationRepository", () => {
  it("creates, reads, and resolves a validated recommendation", async () => {
    const root = await temporaryRoot();
    const repository = new RecommendationRepository(resolve(root, "recommendations"));

    await repository.create(recommendation);
    await expect(repository.get(recommendation.id)).resolves.toEqual(recommendation);
    await repository.markResolved(recommendation.id, "approved");
    await expect(repository.get(recommendation.id)).resolves.toMatchObject({
      id: recommendation.id,
      resolution: "approved",
    });
  });

  it("rejects duplicate recommendation IDs", async () => {
    const root = await temporaryRoot();
    const repository = new RecommendationRepository(resolve(root, "recommendations"));
    await repository.create(recommendation);

    await expect(repository.create(recommendation)).rejects.toSatisfy(
      expectDomainError(
        "REPOSITORY_ERROR",
        "Recommendation already exists.",
      ),
    );
  });

  it("returns the stable not-found error for an unknown recommendation", async () => {
    const root = await temporaryRoot();
    const repository = new RecommendationRepository(resolve(root, "recommendations"));

    await expect(
      repository.get("19632c22-405e-4b70-8b84-0cd15f3ba7e1"),
    ).rejects.toSatisfy(
      expectDomainError(
        "RECOMMENDATION_NOT_FOUND",
        "Recommendation was not found.",
      ),
    );
  });

  it("rejects traversal and linked recommendation roots or files", async () => {
    const root = await temporaryRoot();
    const actualRoot = resolve(root, "actual");
    const linkedRoot = resolve(root, "linked");
    await mkdir(actualRoot);
    await symlink(actualRoot, linkedRoot, "junction");
    await expect(
      new RecommendationRepository(linkedRoot).create(recommendation),
    ).rejects.toSatisfy(
      expectDomainError(
        "REPOSITORY_ERROR",
        "Repository contains an unsupported linked path.",
      ),
    );

    const repository = new RecommendationRepository(actualRoot);
    await repository.create(recommendation);
    const recommendationFile = resolve(actualRoot, `${recommendation.id}.json`);
    const linkedFile = resolve(actualRoot, "linked.json");
    await link(recommendationFile, linkedFile);
    await expect(repository.get(recommendation.id)).rejects.toSatisfy(
      expectDomainError(
        "REPOSITORY_ERROR",
        "Repository contains an unsupported linked path.",
      ),
    );
    await expect(repository.get("../outside")).rejects.toSatisfy(
      expectDomainError(
        "REPOSITORY_ERROR",
        "Repository path is not allowed.",
      ),
    );
  });
});

describe("AuditRepository", () => {
  it("appends one validated JSON object per line and filters by ticket", async () => {
    const root = await temporaryRoot();
    const file = resolve(root, "audit", "events.jsonl");
    const repository = new AuditRepository(file);
    const otherEvent: AuditEvent = AuditEventSchema.parse({
      ...auditEvent,
      id: "19632c22-405e-4b70-8b84-0cd15f3ba7e1",
      ticketId: "TKT-1002",
    });

    await repository.append(auditEvent);
    await repository.append(otherEvent);

    expect((await readFile(file, "utf8")).trim().split("\n")).toHaveLength(2);
    await expect(repository.list()).resolves.toEqual([auditEvent, otherEvent]);
    await expect(repository.list("TKT-1001")).resolves.toEqual([auditEvent]);
  });

  it("detects malformed JSONL lines without leaking the file path", async () => {
    const root = await temporaryRoot();
    const file = resolve(root, "events.jsonl");
    await writeFile(
      file,
      `${JSON.stringify(auditEvent)}\n{"not":"an audit event"}\n`,
      "utf8",
    );

    await expect(new AuditRepository(file).list()).rejects.toSatisfy(
      expectDomainError(
        "REPOSITORY_ERROR",
        "Audit log contains malformed data.",
      ),
    );
  });

  it("rejects linked audit files", async () => {
    const root = await temporaryRoot();
    const file = resolve(root, "events.jsonl");
    const linkedFile = resolve(root, "events-linked.jsonl");
    await writeFile(file, "", "utf8");
    await link(file, linkedFile);

    await expect(new AuditRepository(file).append(auditEvent)).rejects.toSatisfy(
      expectDomainError(
        "REPOSITORY_ERROR",
        "Repository contains an unsupported linked path.",
      ),
    );
  });
});
