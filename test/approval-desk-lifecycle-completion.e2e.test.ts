import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { approvalDeskHtml } from "../src/approval-desk/ui.js";
import { createApprovalDeskHttpServer } from "../src/approval-desk/http.js";
import type { RuntimeDependencies } from "../src/runtime.js";
import { createRuntimeDependencies } from "../src/runtime.js";
import { resetOperationalDemoState } from "../src/demo-reset.js";

const ticketId = "TKT-1010";

describe("Approval Desk lifecycle completion e2e", () => {
  it("drives TKT-1010 through the UI-controlled lifecycle with authoritative refresh and restart recovery", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "approval-desk-ui-lifecycle-complete-"));
    const seedPath = join(dataRoot, "tickets.json");
    const operationalDatabase = join(dataRoot, "operational.sqlite");
    const seed = JSON.parse(
      readFileSync(resolve("data/seed/tickets.json"), "utf8"),
    ) as Array<Record<string, any>>;
    const seedTicket = seed.find((ticket) => ticket.id === ticketId)!;
    Object.assign(seedTicket, {
      subject: "Campaign editor is blank",
      description: "The campaign editor stays blank after opening a campaign.",
      category: "performance",
      priority: "P3",
      team: "product",
      tags: [...(seedTicket.tags as string[]), "performance"],
    });
    await writeFile(seedPath, JSON.stringify(seed), "utf8");

    const env = {
      TRIAGE_DATA_ROOT: dataRoot,
      TRIAGE_SEED_FILE: seedPath,
      TRIAGE_KNOWLEDGE_ROOT: resolve("data/knowledge"),
      OPERATIONAL_DB_PATH: operationalDatabase,
    };
    resetOperationalDemoState({
      operationalDatabase,
      seedFile: seedPath,
      dataRoot,
    });

    let currentTime = Date.parse("2026-08-27T09:00:00.000Z");
    const now = () => new Date(currentTime);
    const runtime = await startRuntime(env, now);
    let state = runtime;
    let app = await startLiveApprovalDeskApp(state.baseUrl);

    const live = async (path: string, init?: RequestInit): Promise<{ status: number; body: any }> => {
      const response = await fetch(`${state.baseUrl}${path}`, {
        headers: {
          "content-type": "application/json",
          ...(init?.method === "POST" ? { "idempotency-key": randomUUID() } : {}),
          ...init?.headers,
        },
        ...init,
      });
      return { status: response.status, body: await response.json() };
    };
    const detail = async (): Promise<any> => (await live(`/api/tickets/${ticketId}`)).body;
    const lifecycle = async (): Promise<any> => (await detail()).lifecycle;
    const diagnoses = async (): Promise<any[]> => (await live(`/api/tickets/${ticketId}/diagnoses`)).body.diagnoses;
    const advanceMinutes = (minutes = 1): void => {
      currentTime += minutes * 60_000;
    };
    const requestCount = (path: string): number =>
      app.requests.filter((request) => request.path === path).length;
    const assertUiMatchesLifecycle = async (
      label: string,
      options?: { refreshUi?: boolean },
    ): Promise<any> => {
      if (options?.refreshUi !== false) {
        await waitForAuthoritativeRefresh(app, ticketId);
      }
      const currentLifecycle = await lifecycle();
      const rendered = renderedPrimaryAction(app);
      expect(
        rendered,
        `${label}: expected rendered primary action to match lifecycle.\nTitle: ${app.el("actionBarTitle").textContent}\nHint: ${app.el("actionBarHint").textContent}\nDiagnosis: ${app.el("diagnosisPanel").innerHTML}\nRecommendation: ${app.el("recommendationPanel").innerHTML}`,
      ).toBe(currentLifecycle.primaryAction.kind);
      const controls = enabledGovernedControls(app);
      expect(
        controls.every(({ kind }) =>
          currentLifecycle.actions.some((action: any) =>
            action.kind === kind && ["primary", "available"].includes(action.availability),
          )),
        `${label}: UI exposed a control that lifecycle did not authorize.\nControls: ${JSON.stringify(controls)}\nLifecycle: ${JSON.stringify(currentLifecycle.actions)}`,
      ).toBe(true);
      return currentLifecycle;
    };

    const performGesture = async (
      label: string,
      gesture: () => Promise<void>,
      expectedPath: RegExp | null,
    ): Promise<any> => {
      advanceMinutes();
      const before = app.requests.length;
      await gesture();
      const newRequests = app.requests.slice(before);
      const mutations = newRequests.filter(isGovernedMutationRequest);
      const renderedState = [
        `title=${app.el("actionBarTitle").textContent}`,
        `hint=${app.el("actionBarHint").textContent}`,
        `rendered=${safeRenderedPrimaryAction(app)}`,
        `controls=${JSON.stringify(enabledGovernedControls(app))}`,
        `recommendation=${app.el("recommendationPanel").innerHTML}`,
        `diagnosis=${app.el("diagnosisPanel").innerHTML}`,
      ].join("\n");
      if (expectedPath === null) {
        expect(mutations, `${label} should not issue a governed mutation.\n${renderedState}`).toHaveLength(0);
      } else {
        expect(mutations, `${label} should issue exactly one governed mutation.\n${renderedState}`).toHaveLength(1);
        expect(mutations[0]!.path, `${label} hit the wrong mutation endpoint.`).toMatch(expectedPath);
      }
      const observed = await assertUiMatchesLifecycle(label, { refreshUi: expectedPath !== null });
      return observed;
    };

    try {
      const liveQueue = await live("/api/tickets?limit=50");
      expect(liveQueue.status, JSON.stringify(liveQueue.body)).toBe(200);
      expect(liveQueue.body.items, JSON.stringify(liveQueue.body)).toHaveLength(30);

      await app.wait(200);
      app.setQueueFilter("all");
      await app.wait(200);
      await app.selectTicket(ticketId);
      await assertUiMatchesLifecycle("initial selection");

      let currentLifecycle = await performGesture(
        "initial evaluate",
        async () => clickPrimaryLifecycleControl(app, "evaluate-ticket"),
        /\/api\/tickets\/TKT-1010\/recommendations$/,
      );
      expect(currentLifecycle.primaryAction.kind).toBe("review-recommendation");

      currentLifecycle = await performGesture(
        "initial review approval",
        async () => clickPrimaryLifecycleControl(app, "review-recommendation"),
        /\/api\/recommendations\/[^/]+\/approve$/,
      );
      expect(latestGovernedMutationBody(app)).toMatchObject({
        approvedFields: ["category", "priority", "team", "tags", "customerResponse"],
      });
      expect(currentLifecycle.primaryAction.kind).toBe("send-customer-response");

      currentLifecycle = await performGesture(
        "initial send",
        async () => clickPrimaryLifecycleControl(app, "send-customer-response"),
        /\/api\/recommendations\/[^/]+\/mark-sent$/,
      );
      const firstMarkSentResponse = app.responses
        .filter((response) => /\/api\/recommendations\/[^/]+\/mark-sent$/.test(response.path))
        .at(-1);
      expect(firstMarkSentResponse?.body).toMatchObject({
        automaticReply: {
          action: "customer-reply-received",
          after: {
            body: expect.any(String),
          },
        },
      });
      expect(firstMarkSentResponse?.body.automaticReply.after.body.trim()).not.toBe("");
      for (let attempt = 0; attempt < 8; attempt += 1) {
        if (currentLifecycle.primaryAction.kind === "evaluate-ticket") {
          currentLifecycle = await performGesture(
            `evaluate automatic evidence reply ${attempt + 1}`,
            async () => clickPrimaryLifecycleControl(app, "evaluate-ticket"),
            /\/api\/tickets\/TKT-1010\/recommendations$/,
          );
          continue;
        }
        if (currentLifecycle.primaryAction.kind === "review-recommendation") {
          currentLifecycle = await performGesture(
            `approve automatic evidence follow-up ${attempt + 1}`,
            async () => clickPrimaryLifecycleControl(app, "review-recommendation"),
            /\/api\/recommendations\/[^/]+\/approve$/,
          );
          currentLifecycle = await performGesture(
            `send automatic evidence follow-up ${attempt + 1}`,
            async () => clickPrimaryLifecycleControl(app, "send-customer-response"),
            /\/api\/recommendations\/[^/]+\/mark-sent$/,
          );
          continue;
        }
        if (currentLifecycle.primaryAction.kind === "record-diagnosis") {
          break;
        }
        throw new Error(`Unexpected lifecycle while gathering evidence: ${currentLifecycle.primaryAction.kind}`);
      }
      expect(currentLifecycle.primaryAction.kind).toBe("record-diagnosis");
      currentLifecycle = await performGesture(
        "record first diagnosis",
        async () => clickPrimaryLifecycleControl(app, "record-diagnosis"),
        /\/api\/tickets\/TKT-1010\/diagnosis$/,
      );
      if (currentLifecycle.primaryAction.kind === "evaluate-ticket") {
        await live(`/api/demo/tickets/${ticketId}/inject`, {
          method: "POST",
          body: JSON.stringify({
            action: "internal-confirmation",
            actor: "product-support",
            rationale: "The internal platform check confirms the diagnosis.",
          }),
        });
      }
      await assertUiMatchesLifecycle("after internal diagnosis confirmation");
      if (currentLifecycle.primaryAction.kind === "evaluate-ticket") {
        currentLifecycle = await performGesture(
          "evaluate after internal diagnosis confirmation",
          async () => clickPrimaryLifecycleControl(app, "evaluate-ticket"),
          /\/api\/tickets\/TKT-1010\/recommendations$/,
        );
      }
      for (let attempt = 0; attempt < 8 && currentLifecycle.primaryAction.kind !== "review-diagnosis"; attempt += 1) {
        if (currentLifecycle.primaryAction.kind === "review-recommendation") {
          currentLifecycle = await performGesture(
            `approve diagnosis update ${attempt + 1}`,
            async () => clickPrimaryLifecycleControl(app, "review-recommendation"),
            /\/api\/recommendations\/[^/]+\/approve$/,
          );
          currentLifecycle = await performGesture(
            `send diagnosis update ${attempt + 1}`,
            async () => clickPrimaryLifecycleControl(app, "send-customer-response"),
            /\/api\/recommendations\/[^/]+\/mark-sent$/,
          );
          continue;
        }
        if (currentLifecycle.primaryAction.kind === "evaluate-ticket") {
          currentLifecycle = await performGesture(
            `evaluate diagnosis update ${attempt + 1}`,
            async () => clickPrimaryLifecycleControl(app, "evaluate-ticket"),
            /\/api\/tickets\/TKT-1010\/recommendations$/,
          );
          continue;
        }
        if (currentLifecycle.primaryAction.kind === "record-diagnosis") {
          currentLifecycle = await performGesture(
            `record diagnosis update ${attempt + 1}`,
            async () => clickPrimaryLifecycleControl(app, "record-diagnosis"),
            /\/api\/tickets\/TKT-1010\/diagnosis$/,
          );
          continue;
        }
        break;
      }
      expect(currentLifecycle.primaryAction.kind).toBe("review-diagnosis");
      const firstDiagnosisId = diagnoses().then((views) => views.at(-1)!.originalDiagnosis.id);

      currentLifecycle = await performGesture(
        "open first diagnosis inspection",
        async () => app.openDiagnosisInspection(),
        null,
      );
      expect(app.el("diagnosisPanel").innerHTML).toContain('data-action="review-diagnosis"');

      currentLifecycle = await performGesture(
        "reject first diagnosis",
        async () => {
          app.setDiagnosisReviewRationale("The first theory needs a different direction.");
          await app.reviewDiagnosis("reject");
        },
        /\/api\/tickets\/TKT-1010\/diagnoses\/[^/]+\/review$/,
      );
      expect(currentLifecycle).toMatchObject({
        phase: "evaluation-needed",
        primaryAction: { kind: "evaluate-ticket", availability: "primary" },
      });
      expect(app.el("diagnosisPanel").innerHTML).toContain('data-action="reopen-diagnosis-evaluation"');

      await performGesture(
        "back from rejected diagnosis",
        async () => app.backToNormalActionBarAndRefresh(),
        null,
      );
      const beforeRecovery = requestCount(`/api/tickets/${ticketId}/recommendations`);
      currentLifecycle = await performGesture(
        "re-evaluate after rejection",
        async () => clickPrimaryLifecycleControl(app, "evaluate-ticket"),
        /\/api\/tickets\/TKT-1010\/recommendations$/,
      );
      expect(requestCount(`/api/tickets/${ticketId}/recommendations`) - beforeRecovery).toBe(1);
      expect(currentLifecycle.primaryAction.kind).toBe("review-recommendation");

      currentLifecycle = await performGesture(
        "approve reevaluation draft",
        async () => clickPrimaryLifecycleControl(app, "review-recommendation"),
        /\/api\/recommendations\/[^/]+\/approve$/,
      );
      app.el("disableAutomaticReplies").checked = true;
      currentLifecycle = await performGesture(
        "send reevaluation draft",
        async () => clickPrimaryLifecycleControl(app, "send-customer-response"),
        /\/api\/recommendations\/[^/]+\/mark-sent$/,
      );

      await live(`/api/demo/tickets/${ticketId}/inject`, {
        method: "POST",
        body: JSON.stringify({
          action: "internal-confirmation",
          actor: "product-support",
          rationale: "The internal platform check confirms the diagnosis.",
        }),
      });
      await assertUiMatchesLifecycle("after internal confirmation");

      let confirmedDiagnosisId = await firstDiagnosisId;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        currentLifecycle = await assertUiMatchesLifecycle(`recovery loop ${attempt + 1}`);
        if (currentLifecycle.primaryAction.kind === "none" && currentLifecycle.phase === "waiting-for-customer") {
          await live(`/api/tickets/${ticketId}/customer-replies`, {
            method: "POST",
            body: JSON.stringify({
              actor: "Mia Johnson",
              source: "manual",
              body:
                "The editor is still blank in a private window and another browser, another admin sees the same failure, and the browser console reports ChunkLoadError at the retry time.",
            }),
          });
          continue;
        }
        if (currentLifecycle.primaryAction.kind === "review-diagnosis") {
          break;
        }
        if (currentLifecycle.primaryAction.kind === "evaluate-ticket") {
          await live(`/api/tickets/${ticketId}/customer-replies`, {
            method: "POST",
            body: JSON.stringify({
              actor: "Mia Johnson",
              source: "manual",
              body:
                "The editor is still blank in a private window and another browser, another admin sees the same failure, and the browser console reports ChunkLoadError at the retry time.",
            }),
          });
          await assertUiMatchesLifecycle(`after manual confirmation evidence ${attempt + 1}`);
          currentLifecycle = await performGesture(
            `evaluate confirmation evidence ${attempt + 1}`,
            async () => clickPrimaryLifecycleControl(app, "evaluate-ticket"),
            /\/api\/tickets\/TKT-1010\/recommendations$/,
          );
          if (currentLifecycle.primaryAction.kind === "review-recommendation") {
            currentLifecycle = await performGesture(
              `approve confirmation recommendation ${attempt + 1}`,
              async () => clickPrimaryLifecycleControl(app, "review-recommendation"),
              /\/api\/recommendations\/[^/]+\/approve$/,
            );
            app.el("disableAutomaticReplies").checked = true;
            currentLifecycle = await performGesture(
              `send confirmation recommendation ${attempt + 1}`,
              async () => clickPrimaryLifecycleControl(app, "send-customer-response"),
              /\/api\/recommendations\/[^/]+\/mark-sent$/,
            );
          }
          continue;
        }
        if (currentLifecycle.primaryAction.kind === "record-diagnosis") {
          currentLifecycle = await performGesture(
            `record confirmed diagnosis ${attempt + 1}`,
            async () => clickPrimaryLifecycleControl(app, "record-diagnosis"),
            /\/api\/tickets\/TKT-1010\/diagnosis$/,
          );
          confirmedDiagnosisId = (await diagnoses()).at(-1)!.originalDiagnosis.id;
          continue;
        }
        if (currentLifecycle.primaryAction.kind === "review-recommendation") {
          currentLifecycle = await performGesture(
            `approve loop recommendation ${attempt + 1}`,
            async () => clickPrimaryLifecycleControl(app, "review-recommendation"),
            /\/api\/recommendations\/[^/]+\/approve$/,
          );
          if (currentLifecycle.primaryAction.kind === "send-customer-response") {
            app.el("disableAutomaticReplies").checked = false;
            currentLifecycle = await performGesture(
              `send loop recommendation ${attempt + 1}`,
              async () => clickPrimaryLifecycleControl(app, "send-customer-response"),
              /\/api\/recommendations\/[^/]+\/mark-sent$/,
            );
          }
          continue;
        }
        if (currentLifecycle.primaryAction.kind === "specialist-review") {
          await live(`/api/demo/tickets/${ticketId}/inject`, {
            method: "POST",
            body: JSON.stringify({
              action: "internal-confirmation",
              actor: "product-support",
              rationale: "The internal platform check confirms the diagnosis.",
            }),
          });
          continue;
        }
      }

      currentLifecycle = await assertUiMatchesLifecycle("before confirmed review");
      expect(["review-diagnosis", "revalidate-diagnosis", "apply-scoped-fix", "record-fix-available"]).toContain(
        currentLifecycle.primaryAction.kind,
      );
      if (currentLifecycle.primaryAction.kind === "review-diagnosis" || currentLifecycle.primaryAction.kind === "revalidate-diagnosis") {
        currentLifecycle = await performGesture(
          "open confirmed diagnosis inspection",
          async () => app.openDiagnosisInspection(currentLifecycle.primaryAction.kind === "revalidate-diagnosis" ? "revalidate" : "approve"),
          null,
        );
        if (currentLifecycle.primaryAction.kind === "revalidate-diagnosis") {
          app.setDiagnosisReviewRationale("The fresh customer evidence supports the same confirmed diagnosis.");
        }
        currentLifecycle = await performGesture(
          "approve confirmed diagnosis",
          async () => app.reviewDiagnosis(currentLifecycle.primaryAction.kind === "revalidate-diagnosis" ? "revalidate" : "approve"),
          /\/api\/tickets\/TKT-1010\/diagnoses\/[^/]+\/review$/,
        );
      }

      for (let attempt = 0; attempt < 8; attempt += 1) {
        currentLifecycle = await assertUiMatchesLifecycle(`pre-fix loop ${attempt + 1}`);
        if (["apply-scoped-fix", "record-fix-available"].includes(currentLifecycle.primaryAction.kind)) {
          break;
        }

        if (
          currentLifecycle.primaryAction.kind === "review-diagnosis" ||
          currentLifecycle.primaryAction.kind === "revalidate-diagnosis"
        ) {
          const decision = currentLifecycle.primaryAction.kind === "revalidate-diagnosis" ? "revalidate" : "approve";
          currentLifecycle = await performGesture(
            `open ${decision} diagnosis inspection ${attempt + 1}`,
            async () => app.openDiagnosisInspection(decision),
            null,
          );
          if (decision === "revalidate") {
            app.setDiagnosisReviewRationale("The fresh customer evidence supports the same confirmed diagnosis.");
          }
          currentLifecycle = await performGesture(
            `${decision} confirmed diagnosis ${attempt + 1}`,
            async () => app.reviewDiagnosis(decision),
            /\/api\/tickets\/TKT-1010\/diagnoses\/[^/]+\/review$/,
          );
          continue;
        }

        if (currentLifecycle.primaryAction.kind === "evaluate-ticket") {
          if (currentLifecycle.confirmation?.state === "awaiting-internal-verification") {
            await live(`/api/demo/tickets/${ticketId}/inject`, {
              method: "POST",
              body: JSON.stringify({
                action: "internal-confirmation",
                actor: "product-support",
                rationale: "The internal platform check confirms the diagnosis.",
              }),
            });
            currentLifecycle = await assertUiMatchesLifecycle(`after internal confirmation ${attempt + 1}`);
            if (["apply-scoped-fix", "record-fix-available"].includes(currentLifecycle.primaryAction.kind)) {
              break;
            }
            if (currentLifecycle.primaryAction.kind !== "evaluate-ticket") {
              continue;
            }
          }
          currentLifecycle = await performGesture(
            `evaluate pre-fix lifecycle ${attempt + 1}`,
            async () => clickPrimaryLifecycleControl(app, "evaluate-ticket"),
            /\/api\/tickets\/TKT-1010\/recommendations$/,
          );
          continue;
        }

        if (currentLifecycle.primaryAction.kind === "review-recommendation") {
          currentLifecycle = await performGesture(
            `approve pre-fix recommendation ${attempt + 1}`,
            async () => clickPrimaryLifecycleControl(app, "review-recommendation"),
            /\/api\/recommendations\/[^/]+\/approve$/,
          );
          continue;
        }

        if (currentLifecycle.primaryAction.kind === "send-customer-response") {
          app.el("disableAutomaticReplies").checked = true;
          currentLifecycle = await performGesture(
            `send pre-fix recommendation ${attempt + 1}`,
            async () => clickPrimaryLifecycleControl(app, "send-customer-response"),
            /\/api\/recommendations\/[^/]+\/mark-sent$/,
          );
          continue;
        }

        if (currentLifecycle.primaryAction.kind === "record-diagnosis") {
          currentLifecycle = await performGesture(
            `record confirmed diagnosis ${attempt + 1}`,
            async () => clickPrimaryLifecycleControl(app, "record-diagnosis"),
            /\/api\/tickets\/TKT-1010\/diagnosis$/,
          );
          confirmedDiagnosisId = (await diagnoses()).at(-1)!.originalDiagnosis.id;
          continue;
        }

        if (currentLifecycle.primaryAction.kind === "none" && currentLifecycle.phase === "waiting-for-customer") {
          await live(`/api/tickets/${ticketId}/customer-replies`, {
            method: "POST",
            body: JSON.stringify({
              actor: "Mia Johnson",
              source: "manual",
              body:
                "The editor is still blank in a private window and another browser, another admin sees the same failure, and the browser console reports ChunkLoadError at the retry time.",
            }),
          });
          currentLifecycle = await assertUiMatchesLifecycle(`after pre-fix customer reply ${attempt + 1}`);
          continue;
        }

        if (currentLifecycle.primaryAction.kind === "specialist-review") {
          await live(`/api/demo/tickets/${ticketId}/inject`, {
            method: "POST",
            body: JSON.stringify({
              action: "internal-confirmation",
              actor: "product-support",
              rationale: "The internal platform check confirms the diagnosis.",
            }),
          });
          currentLifecycle = await assertUiMatchesLifecycle(`after specialist confirmation ${attempt + 1}`);
          continue;
        }

        throw new Error(`Unable to reach the pre-fix lifecycle state.\n${JSON.stringify(currentLifecycle, null, 2)}`);
      }
      expect(
        ["apply-scoped-fix", "record-fix-available"],
        `pre-fix lifecycle: ${JSON.stringify(currentLifecycle, null, 2)}`,
      ).toContain(currentLifecycle.primaryAction.kind);

      app = await restartRuntimeFromOperationalSqlite(state, now);
      currentLifecycle = await assertUiMatchesLifecycle("after runtime restart");
      const fixWasAlreadyApplied = currentLifecycle.fix?.state === "applied";
      let scopedFixApplied = false;
      if (!fixWasAlreadyApplied) {
        expect(["apply-scoped-fix", "record-fix-available"]).toContain(currentLifecycle.primaryAction.kind);
        if (currentLifecycle.primaryAction.kind === "record-fix-available") {
          currentLifecycle = await performGesture(
            "record fix availability",
            async () => clickPrimaryLifecycleControl(app, "record-fix-available"),
            /\/api\/tickets\/TKT-1010\/fix$/,
          );
        }
        if (currentLifecycle.primaryAction.kind === "apply-scoped-fix") {
          const latestDiagnosisId = (await diagnoses()).at(-1)!.originalDiagnosis.id;
          app.selectDiagnosis(latestDiagnosisId);
          currentLifecycle = await performGesture(
            "open scoped fix",
            async () => app.openScopedFix(),
            null,
          );
          currentLifecycle = await performGesture(
            "apply scoped fix",
            async () => clickPrimaryLifecycleControl(app, "apply-scoped-fix"),
            /\/api\/tickets\/TKT-1010\/diagnoses\/[^/]+\/fix$/,
          );
          scopedFixApplied = true;
        }
      }
      expect(["evaluate-ticket", "review-recommendation"]).toContain(currentLifecycle.primaryAction.kind);
      if (scopedFixApplied) {
        expect((await detail()).recommendation?.draftCustomerResponse ?? "").toContain("verify");
      }

      if (currentLifecycle.primaryAction.kind === "evaluate-ticket") {
        currentLifecycle = await performGesture(
          "evaluate after fix",
          async () => clickPrimaryLifecycleControl(app, "evaluate-ticket"),
          /\/api\/tickets\/TKT-1010\/recommendations$/,
        );
      }
      if (currentLifecycle.primaryAction.kind === "review-recommendation") {
        currentLifecycle = await performGesture(
          "approve post-fix response",
          async () => clickPrimaryLifecycleControl(app, "review-recommendation"),
          /\/api\/recommendations\/[^/]+\/approve$/,
        );
      }
      if (currentLifecycle.primaryAction.kind === "send-customer-response") {
        app.el("disableAutomaticReplies").checked = true;
        currentLifecycle = await performGesture(
          "send post-fix response",
          async () => clickPrimaryLifecycleControl(app, "send-customer-response"),
          /\/api\/recommendations\/[^/]+\/mark-sent$/,
        );
      }

      await live(`/api/tickets/${ticketId}/customer-replies`, {
        method: "POST",
        body: JSON.stringify({
          actor: "Mia Johnson",
          source: "manual",
          body: "The campaign editor works now, thanks.",
        }),
      });
      currentLifecycle = await assertUiMatchesLifecycle("after customer confirmation");
      if (currentLifecycle.primaryAction.kind === "revalidate-diagnosis") {
        currentLifecycle = await performGesture(
          "open post-fix diagnosis revalidation",
          async () => app.openDiagnosisInspection("revalidate"),
          null,
        );
        app.setDiagnosisReviewRationale("The customer confirms the scoped fix resolved the campaign editor failure.");
        currentLifecycle = await performGesture(
          "revalidate post-fix diagnosis",
          async () => app.reviewDiagnosis("revalidate"),
          /\/api\/tickets\/TKT-1010\/diagnoses\/[^/]+\/review$/,
        );
      }
      expect(currentLifecycle.primaryAction.kind).toBe("evaluate-ticket");

      currentLifecycle = await performGesture(
        "evaluate customer confirmation",
        async () => clickPrimaryLifecycleControl(app, "evaluate-ticket"),
        /\/api\/tickets\/TKT-1010\/recommendations$/,
      );
      if (currentLifecycle.primaryAction.kind === "review-recommendation") {
        currentLifecycle = await performGesture(
          "approve closure response",
          async () => clickPrimaryLifecycleControl(app, "review-recommendation"),
          /\/api\/recommendations\/[^/]+\/approve$/,
        );
      }
      if (currentLifecycle.primaryAction.kind === "send-customer-response") {
        app.el("disableAutomaticReplies").checked = true;
        currentLifecycle = await performGesture(
          "send closure response",
          async () => clickPrimaryLifecycleControl(app, "send-customer-response"),
          /\/api\/recommendations\/[^/]+\/mark-sent$/,
        );
      }
      currentLifecycle = await assertUiMatchesLifecycle("before resolve");
      expect(currentLifecycle.primaryAction.kind).toBe("resolve-ticket");

      currentLifecycle = await performGesture(
        "resolve ticket",
        async () => clickPrimaryLifecycleControl(app, "resolve-ticket"),
        /\/api\/tickets\/TKT-1010\/close$/,
      );
      expect(currentLifecycle.phase).toBe("resolved");
      expect(app.el("actionBarTitle").textContent).toBe("Resolved");
      expect(await diagnoses()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            originalDiagnosis: expect.objectContaining({ id: confirmedDiagnosisId }),
          }),
        ]),
      );
    } finally {
      await closeRuntime(state);
      await rm(dataRoot, { recursive: true, force: true });
    }
  }, 45_000);
});

async function startRuntime(
  env: Record<string, string>,
  now: () => Date,
): Promise<{
  deps: RuntimeDependencies;
  server: ReturnType<typeof createApprovalDeskHttpServer>;
  baseUrl: string;
  env: Record<string, string>;
}> {
  const deps = await createRuntimeDependencies({ env, now });
  const server = createApprovalDeskHttpServer(deps, { enableDemoInjectors: true });
  return {
    deps,
    server,
    baseUrl: await listen(server),
    env,
  };
}

async function closeRuntime(
  state: { deps: RuntimeDependencies; server: ReturnType<typeof createApprovalDeskHttpServer> } | undefined,
): Promise<void> {
  if (state === undefined) return;
  try {
    await closeServer(state.server);
  } finally {
    state.deps.close();
  }
}

async function restartRuntimeFromOperationalSqlite(
  state: {
    deps: RuntimeDependencies;
    server: ReturnType<typeof createApprovalDeskHttpServer>;
    baseUrl: string;
    env: Record<string, string>;
  },
  now: () => Date,
): Promise<ReturnType<typeof startLiveApprovalDeskApp>> {
  await closeRuntime(state);
  const restarted = await startRuntime(state.env, now);
  state.deps = restarted.deps;
  state.server = restarted.server;
  state.baseUrl = restarted.baseUrl;
  const app = await startLiveApprovalDeskApp(state.baseUrl);
  await app.wait(200);
  app.setQueueFilter("all");
  await app.wait(200);
  await app.selectTicket(ticketId);
  await app.wait(200);
  return app;
}

function isGovernedMutationRequest(request: { path: string; init?: RequestInit }): boolean {
  if (request.init?.method !== "POST") {
    return false;
  }
  return [
    /\/api\/tickets\/TKT-1010\/recommendations$/,
    /\/api\/recommendations\/[^/]+\/approve$/,
    /\/api\/recommendations\/[^/]+\/mark-sent$/,
    /\/api\/tickets\/TKT-1010\/diagnosis$/,
    /\/api\/tickets\/TKT-1010\/diagnoses\/[^/]+\/review$/,
    /\/api\/tickets\/TKT-1010\/fix$/,
    /\/api\/tickets\/TKT-1010\/diagnoses\/[^/]+\/fix$/,
    /\/api\/tickets\/TKT-1010\/close$/,
  ].some((pattern) => pattern.test(request.path));
}

function latestGovernedMutationBody(
  app: Awaited<ReturnType<typeof startLiveApprovalDeskApp>>,
): Record<string, unknown> {
  const mutation = [...app.requests].reverse().find(isGovernedMutationRequest);
  if (mutation?.init?.body === undefined) {
    throw new Error("Expected a governed mutation request body.");
  }
  return JSON.parse(String(mutation.init.body)) as Record<string, unknown>;
}

function renderedPrimaryAction(app: Awaited<ReturnType<typeof startLiveApprovalDeskApp>>): string {
  const diagnosisActions = parseRenderedActions(app.el("diagnosisPanel").innerHTML);
  const recommendationActions = parseRenderedActions(app.el("recommendationPanel").innerHTML);
  const title = app.el("actionBarTitle").textContent.trim();

  if (isActionBarControlVisible(app, "closeTicketButton")) {
    return "resolve-ticket";
  }
  if (diagnosisActions.some((action) => action.action === "apply-diagnosis-fix" && !action.hidden && !action.disabled)) {
    return "apply-scoped-fix";
  }
  if (
    diagnosisActions.some(
      (action) =>
        action.action === "review-diagnosis" &&
        action.decision === "revalidate" &&
        !action.hidden &&
        !action.disabled,
    )
  ) {
    return "revalidate-diagnosis";
  }
  if (
    diagnosisActions.some(
      (action) =>
        action.action === "review-diagnosis" &&
        action.decision === "approve" &&
        !action.hidden &&
        !action.disabled,
    )
  ) {
    return "review-diagnosis";
  }
  if (isActionBarControlVisible(app, "diagnoseButton")) {
    return "record-diagnosis";
  }
  if (isActionBarControlVisible(app, "fixButton")) {
    return "record-fix-available";
  }
  if (recommendationActions.some((action) => action.action === "mark-sent" && !action.hidden && !action.disabled)) {
    return "send-customer-response";
  }
  if (isActionBarControlVisible(app, "approveButton")) {
    const label = app.el("approveButton").textContent.trim();
    if (label === "Review") return "review-recommendation";
    if (label === "Send") return "send-customer-response";
  }
  if (isActionBarControlVisible(app, "createUpdatedRecommendation")) {
    return "evaluate-ticket";
  }
  if (isActionBarControlVisible(app, "createRecommendation")) {
    return "evaluate-ticket";
  }
  if (diagnosisActions.some((action) => action.action === "record-fix-available" && !action.hidden && !action.disabled)) {
    return "record-fix-available";
  }
  if (diagnosisActions.some((action) => action.action === "open-scoped-fix" && !action.hidden && !action.disabled)) {
    return "apply-scoped-fix";
  }
  if (
    diagnosisActions.some(
      (action) => action.action === "reopen-diagnosis-evaluation" && !action.hidden && !action.disabled,
    )
  ) {
    return "evaluate-ticket";
  }
  if (title === "Resolved") {
    return "none";
  }
  if (title === "Waiting for customer") {
    return "none";
  }
  if (title === "Review recommendation") {
    return "review-recommendation";
  }
  if (title === "Review diagnosis") {
    return "review-diagnosis";
  }
  if (title === "Revalidate diagnosis") {
    return "revalidate-diagnosis";
  }
  if (title === "Diagnose ticket") {
    return "record-diagnosis";
  }
  if (title === "Fix available") {
    return "record-fix-available";
  }
  if (title === "Scoped fix") {
    return "apply-scoped-fix";
  }
  if (title === "Ready to resolve") {
    return "resolve-ticket";
  }
  if (title === "Re-evaluate" || title === "Waiting for confirmation") {
    return "evaluate-ticket";
  }
  throw new Error(
    `Could not determine rendered primary action.\nTitle: ${app.el("actionBarTitle").textContent}\nDiagnosis: ${app.el("diagnosisPanel").innerHTML}\nRecommendation: ${app.el("recommendationPanel").innerHTML}`,
  );
}

function safeRenderedPrimaryAction(
  app: Awaited<ReturnType<typeof startLiveApprovalDeskApp>>,
): string {
  try {
    return renderedPrimaryAction(app);
  } catch (error) {
    return error instanceof Error ? `error:${error.message}` : "error:unknown";
  }
}

function enabledGovernedControls(
  app: Awaited<ReturnType<typeof startLiveApprovalDeskApp>>,
): Array<{ kind: string; source: string }> {
  const controls: Array<{ kind: string; source: string }> = [];
  const push = (kind: string, source: string): void => {
    if (!controls.some((entry) => entry.kind === kind && entry.source === source)) {
      controls.push({ kind, source });
    }
  };

  if (isActionBarControlVisible(app, "createRecommendation")) {
    push("evaluate-ticket", "createRecommendation");
  }
  if (isActionBarControlVisible(app, "createUpdatedRecommendation")) {
    push("evaluate-ticket", "createUpdatedRecommendation");
  }
  if (isActionBarControlVisible(app, "approveButton")) {
    const label = app.el("approveButton").textContent.trim();
    if (label === "Review") push("review-recommendation", "approveButton");
    if (label === "Send") push("send-customer-response", "approveButton");
  }
  if (isActionBarControlVisible(app, "diagnoseButton")) {
    push("record-diagnosis", "diagnoseButton");
  }
  if (isActionBarControlVisible(app, "fixButton")) {
    push("record-fix-available", "fixButton");
  }
  if (isActionBarControlVisible(app, "closeTicketButton")) {
    push("resolve-ticket", "closeTicketButton");
  }

  for (const action of parseRenderedActions(app.el("recommendationPanel").innerHTML)) {
    if (action.disabled || action.hidden) continue;
    if (action.action === "mark-sent") push("send-customer-response", "recommendationPanel");
  }
  for (const action of parseRenderedActions(app.el("diagnosisPanel").innerHTML)) {
    if (action.disabled || action.hidden) continue;
    if (action.action === "reopen-diagnosis-evaluation") push("evaluate-ticket", "diagnosisPanel");
    if (action.action === "record-fix-available") push("record-fix-available", "diagnosisPanel");
    if (action.action === "open-scoped-fix" || action.action === "apply-diagnosis-fix") {
      push("apply-scoped-fix", "diagnosisPanel");
    }
    if (action.action === "review-diagnosis" && action.decision === "approve") {
      push("review-diagnosis", "diagnosisPanel");
    }
    if (action.action === "review-diagnosis" && action.decision === "reject") {
      push("reject-diagnosis", "diagnosisPanel");
    }
    if (action.action === "review-diagnosis" && action.decision === "revalidate") {
      push("revalidate-diagnosis", "diagnosisPanel");
    }
  }
  return controls;
}

async function clickPrimaryLifecycleControl(
  app: Awaited<ReturnType<typeof startLiveApprovalDeskApp>>,
  kind: string,
): Promise<void> {
  if (kind === "evaluate-ticket") {
    if (hasVisibleLifecycleButton(app.el("diagnosisPanel").innerHTML, "reopen-diagnosis-evaluation")) {
      await app.reopenDiagnosisEvaluation();
      return;
    }
    if (isActionBarControlVisible(app, "createUpdatedRecommendation")) {
      await app.createUpdatedRecommendation();
      return;
    }
    if (isActionBarControlVisible(app, "createRecommendation")) {
      await app.createRecommendation();
      return;
    }
  }
  if (kind === "review-recommendation") {
    await app.approve();
    return;
  }
  if (kind === "send-customer-response") {
    await app.markSent();
    return;
  }
  if (kind === "record-diagnosis") {
    await app.click("diagnoseButton");
    return;
  }
  if (kind === "review-diagnosis") {
    await app.reviewDiagnosis("approve");
    return;
  }
  if (kind === "revalidate-diagnosis") {
    await app.reviewDiagnosis("revalidate");
    return;
  }
  if (kind === "record-fix-available") {
    await app.click("fixButton");
    return;
  }
  if (kind === "apply-scoped-fix") {
    await app.applyDiagnosisFix();
    return;
  }
  if (kind === "resolve-ticket") {
    await app.click("closeTicketButton");
    return;
  }
  throw new Error(`Unsupported lifecycle action: ${kind}`);
}

function hasVisibleLifecycleButton(html: string, action: string): boolean {
  return parseRenderedActions(html).some((candidate) =>
    candidate.action === action && !candidate.disabled && !candidate.hidden,
  );
}

function isVisibleAndEnabled(element: FakeElement): boolean {
  return !element.disabled && isVisibleInTree(element);
}

function isActionBarControlVisible(
  app: Awaited<ReturnType<typeof startLiveApprovalDeskApp>>,
  id:
    | "approveButton"
    | "closeTicketButton"
    | "createRecommendation"
    | "createUpdatedRecommendation"
    | "diagnoseButton"
    | "fixButton",
): boolean {
  const containerId = id === "createRecommendation" ? "setupControls" : "decisionControls";
  return isVisibleAndEnabled(app.el(id)) && !app.el(containerId).hidden;
}

function isVisibleInTree(element: FakeElement): boolean {
  let current: FakeElement | undefined = element;
  while (current !== undefined) {
    if (current.hidden) {
      return false;
    }
    current = current.parentElement();
  }
  return true;
}

function parseRenderedActions(html: string): Array<{
  action: string;
  decision?: string;
  hidden: boolean;
  disabled: boolean;
}> {
  const actions: Array<{ action: string; decision?: string; hidden: boolean; disabled: boolean }> = [];
  for (const match of html.matchAll(/<button([^>]*)data-action="([^"]+)"([^>]*)>/g)) {
    const attrs = `${match[1] ?? ""} ${match[3] ?? ""}`;
    const decision = /data-decision="([^"]+)"/.exec(attrs)?.[1];
    actions.push({
      action: match[2]!,
      ...(decision === undefined ? {} : { decision }),
      hidden: /\shidden(?:\s|>|$)/.test(attrs),
      disabled: /\sdisabled(?:\s|>|$)/.test(attrs),
    });
  }
  return actions;
}

async function waitForAuthoritativeRefresh(
  app: Awaited<ReturnType<typeof startLiveApprovalDeskApp>>,
  currentTicketId: string,
): Promise<void> {
  await app.refreshSelectedTicket(currentTicketId);
}

async function startLiveApprovalDeskApp(baseUrl: string) {
  const elements = createElements();
  const requests: Array<{ path: string; init?: RequestInit }> = [];
  const responses: Array<{ path: string; status: number; body: any }> = [];
  let pendingRequests = 0;
  const document = {
    createElement: () => new FakeElement(),
    getElementById: (id: string) => elements[id],
  };
  const fetchOverride = async (path: string, init?: RequestInit) => {
    requests.push({ path, init });
    pendingRequests += 1;
    try {
      const response = await fetch(`${baseUrl}${path}`, init);
      const body = await response.json();
      responses.push({ path, status: response.status, body });
      return jsonResponse(body, response.status);
    } finally {
      pendingRequests -= 1;
    }
  };
  const waitForIdle = async () => {
    for (let attempt = 0; attempt < 500 && pendingRequests > 0; attempt += 1) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    }
    await settle(10);
    expect(pendingRequests).toBe(0);
  };

  Function("document", "fetch", "encodeURIComponent", "confirm", extractScript(approvalDeskHtml))(
    document,
    fetchOverride,
    encodeURIComponent,
    () => true,
  );
  await settle();

  return {
    el: (id: string) => elements[id]!,
    requests,
    responses,
    wait: async (milliseconds = 0) => {
      await new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
      await waitForIdle();
    },
    setQueueFilter: (value: string) => {
      elements.queueFilters.children.find((field) => field.value === value)!.dispatch("click");
    },
    selectTicket: async (id: string) => {
      elements.ticketList.children.find((item) => item.innerHTML.includes(id))!.dispatch("click");
      await waitForIdle();
    },
    refreshSelectedTicket: async (id: string) => {
      elements.ticketList.children.find((item) => item.innerHTML.includes(id))!.dispatch("click");
      await waitForIdle();
    },
    createRecommendation: async () => {
      elements.createRecommendation.dispatch("click");
      await waitForIdle();
    },
    createUpdatedRecommendation: async () => {
      elements.createUpdatedRecommendation.dispatch("click");
      await waitForIdle();
    },
    approve: async () => {
      elements.approveButton.dispatch("click");
      await waitForIdle();
    },
    markSent: async () => {
      elements.recommendationPanel.dispatch("click", {
        target: { dataset: { action: "mark-sent" } },
      });
      await waitForIdle();
    },
    click: async (id: string) => {
      elements[id]!.dispatch("click");
      await waitForIdle();
    },
    openDiagnosisInspection: async (decision?: "approve" | "revalidate") => {
      elements.diagnosisPanel.dispatch("click", {
        target: {
          dataset: {
            action: "open-diagnosis-inspection",
            ...(decision === undefined ? {} : { reviewDecision: decision }),
          },
        },
      });
      await waitForIdle();
    },
    reviewDiagnosis: async (decision: "approve" | "reject" | "revalidate") => {
      const target = new FakeElement();
      target.dataset = { action: "review-diagnosis", decision };
      elements.diagnosisPanel.dispatch("click", {
        target,
      });
      await waitForIdle();
    },
    reopenDiagnosisEvaluation: async () => {
      elements.diagnosisPanel.dispatch("click", {
        target: { dataset: { action: "reopen-diagnosis-evaluation" } },
      });
      await waitForIdle();
    },
    backToNormalActionBarAndRefresh: async () => {
      elements.diagnosisPanel.dispatch("click", {
        target: { dataset: { action: "back-to-normal-action-bar" } },
      });
      await waitForIdle();
    },
    openScopedFix: async () => {
      elements.diagnosisPanel.dispatch("click", {
        target: { dataset: { action: "open-scoped-fix" } },
      });
      await waitForIdle();
    },
    selectDiagnosis: (diagnosisId: string) => {
      elements.diagnosisPanel.dispatch("click", {
        target: { dataset: { action: "select-diagnosis", diagnosisId } },
      });
    },
    applyDiagnosisFix: async () => {
      elements.diagnosisPanel.dispatch("click", {
        target: { dataset: { action: "apply-diagnosis-fix" } },
      });
      await waitForIdle();
    },
    setDiagnosisReviewRationale: (value: string) => {
      elements.diagnosisPanel.dispatch("input", {
        target: { dataset: { diagnosisReviewRationale: "true" }, value },
      });
    },
  };
}

function createElements(): Record<string, FakeElement> {
  const ids = [
    "actor", "actionBarPosition", "actionBarHint", "actionBarTitle", "approvalStage", "approveButton",
    "approveEditedButton", "backToRecommendation", "addCustomerReply", "simulateConfirmationButton",
    "cancelRejectButton", "closeTicketButton", "confirmApproval", "continueApproval",
    "conversationContextPanel", "decisionTimelinePanel", "createRecommendation",
    "createUpdatedRecommendation", "discoverKnowledgeButton", "customerReplyBody",
    "customerReplyFocus", "decisionChips", "decisionControls", "decisionSummary",
    "diagnosisPanel", "diagnosisSummaryPanel", "diagnosisActionPanel", "diagnoseButton",
    "draftStyle", "editApprovalControls", "editedCustomerResponse", "categoryOverride",
    "evidencePanel", "feedback", "fieldChoices", "fixButton", "guardrailsPanel",
    "activityPanel", "markSentButton", "manualRepliesButton", "priorityOverride",
    "predictedReply", "queueFilters", "queueStatus", "recommendationPanel", "patternActionBar",
    "patternReviewPanel", "refreshEvidence", "refreshQueue", "rejectButton", "rejectControls",
    "replyComposer", "replyControls", "advancedSettings", "disableAutomaticReplies", "resultPanel",
    "reviewDraftButton", "setupControls", "startRejectButton", "statusOverride", "assigneeOverride",
    "tagsOverride", "teamOverride", "ticketList", "ticketDetailsPanel", "ticketPanel",
    "workflowActionStack", "knowledgeName", "knowledgeSummary", "knowledgeTriggerPatterns",
    "knowledgeEvidenceMode", "knowledgeEvidenceIds", "knowledgeEvidenceRationale",
    "knowledgeTimeConstraints", "knowledgeDiagnosticSteps", "knowledgeFixSteps",
    "knowledgeVerificationSteps", "knowledgeCustomerSafeExplanation",
    "knowledgeOperatorRationale", "knowledgeOwner", "knowledgeRejectReason",
    "knowledgeDiscoveryStatus", "knowledgeJourneyBar", "knowledgeJourneyStatus",
    "knowledgeJourneySteps", "reviewKnowledgePatternButton",
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement()]));
  elements.actor.value = "approval-desk";
  elements.actionBarPosition.value = "bottom-right";
  elements.workflowActionStack.dataset.dock = "bottom-right";
  elements.draftStyle.value = "auto";
  elements.approveButton.disabled = true;
  elements.approveEditedButton.disabled = true;
  elements.rejectButton.disabled = true;
  elements.replyComposer.open = false;
  elements.advancedSettings.open = false;
  elements.disableAutomaticReplies.checked = false;
  elements.knowledgeJourneyBar.hidden = true;
  elements.patternActionBar.hidden = true;
  elements.diagnosisActionPanel.hidden = true;
  elements.reviewKnowledgePatternButton.hidden = true;
  elements.fieldChoices.children = [
    "category", "priority", "team", "assignee", "status", "tags", "customerResponse",
  ].map((value) => {
    const field = new FakeElement();
    field.value = value;
    field.textContent = "Approve";
    field.className = "field-approve-button";
    return field;
  });
  elements.queueFilters.children = [
    ["active", "Active"],
    ["draft-ready", "Draft ready"],
    ["waiting", "Waiting"],
    ["customer-replied", "Customer replied"],
    ["resolved", "Closed"],
    ["all", "All"],
  ].map(([value, label]) => {
    const filter = new FakeElement();
    filter.value = value;
    filter.textContent = label;
    filter.className = "chip queue-filter";
    return filter;
  });
  elements.rejectControls.children = [
    ["Wrong classification.", "Wrong"],
    ["Needs better evidence.", "Evidence"],
    ["Rewrite the customer response.", "Rewrite"],
  ].map(([value, label]) => {
    const button = new FakeElement();
    button.value = value;
    button.textContent = label;
    button.className = "quick-reason secondary";
    return button;
  });
  return elements;
}

class FakeElement {
  checked = false;
  children: FakeElement[] = [];
  className = "";
  dataset: Record<string, string> = {};
  disabled = false;
  hidden = false;
  open = false;
  textContent = "";
  title = "";
  type = "";
  value = "";
  private parent: FakeElement | undefined;
  private innerHtmlValue = "";
  private readonly listeners = new Map<string, Array<(event?: unknown) => void>>();

  get innerHTML(): string {
    return this.innerHtmlValue;
  }

  set innerHTML(value: string) {
    this.innerHtmlValue = value;
    this.children = [];
    for (const match of value.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)) {
      const attrs = match[1] ?? "";
      const button = new FakeElement();
      button.className = /class="([^"]*)"/.exec(attrs)?.[1] ?? "";
      button.value = /value="([^"]*)"/.exec(attrs)?.[1] ?? "";
      button.textContent = stripHtml(match[2] ?? "").trim();
      button.hidden = /\shidden(?:\s|>|$)/.test(attrs);
      button.disabled = /\sdisabled(?:\s|>|$)/.test(attrs);
      const action = /data-action="([^"]*)"/.exec(attrs)?.[1];
      const decision = /data-decision="([^"]*)"/.exec(attrs)?.[1];
      const diagnosisId = /data-diagnosis-id="([^"]*)"/.exec(attrs)?.[1];
      const reviewDecision = /data-review-decision="([^"]*)"/.exec(attrs)?.[1];
      if (action !== undefined) button.dataset.action = action;
      if (decision !== undefined) button.dataset.decision = decision;
      if (diagnosisId !== undefined) button.dataset.diagnosisId = diagnosisId;
      if (reviewDecision !== undefined) button.dataset.reviewDecision = reviewDecision;
      button.parent = this;
      this.children.push(button);
    }
  }

  addEventListener(type: string, listener: (event?: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  append(child: FakeElement): void {
    child.parent = this;
    this.children.push(child);
  }

  closest(selector: string): FakeElement | null {
    if (selector === "[data-action]" && this.dataset.action !== undefined) {
      return this;
    }
    return this.parent?.closest(selector) ?? null;
  }

  parentElement(): FakeElement | undefined {
    return this.parent;
  }

  dispatch(type: string, event?: unknown): void {
    const dispatchedEvent = event ?? { target: this };
    for (const listener of this.listeners.get(type) ?? []) {
      listener(dispatchedEvent);
    }
    if (this.parent !== undefined) {
      this.parent.dispatch(type, dispatchedEvent);
    }
  }

  querySelectorAll(selector: string): FakeElement[] {
    if (selector === 'input[type="checkbox"]:checked') {
      return this.children.filter((child) => child.checked);
    }
    if (selector === ".field-approve-button") {
      return this.children.filter((child) => child.className.includes("field-approve-button"));
    }
    if (selector === ".queue-filter") {
      return this.children.filter((child) => child.className.includes("queue-filter"));
    }
    if (selector === ".quick-reason") {
      return this.children.filter((child) => child.className.includes("quick-reason"));
    }
    return [];
  }
}

function extractScript(html: string): string {
  const match = /<script>([\s\S]+)<\/script>/.exec(html);
  if (match === null) {
    throw new Error("Approval Desk HTML did not include browser script.");
  }
  return match[1]!;
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

async function listen(
  server: ReturnType<typeof createApprovalDeskHttpServer>,
): Promise<string> {
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(
  server: ReturnType<typeof createApprovalDeskHttpServer>,
): Promise<void> {
  if (!server.listening) {
    return;
  }
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
}

async function settle(ticks = 10): Promise<void> {
  for (let tick = 0; tick < ticks; tick += 1) {
    await Promise.resolve();
  }
}
