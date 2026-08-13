import { describe, expect, it } from "vitest";
import { TicketEvaluationGuard } from "../src/approval-desk/evaluation-guard.js";
import { DomainError } from "../src/errors.js";

describe("TicketEvaluationGuard", () => {
  it("rejects an overlapping evaluation for the same ticket", async () => {
    const guard = new TicketEvaluationGuard();
    const started = deferred();
    const release = deferred();
    const first = guard.run("TKT-1010", async () => {
      started.resolve();
      await release.promise;
      return "first";
    });
    await started.promise;

    const overlapping = guard.run("TKT-1010", async () => "second");
    await expect(overlapping).rejects.toBeInstanceOf(DomainError);
    await expect(overlapping).rejects.toMatchObject({
      code: "EVALUATION_IN_PROGRESS",
      message: "An evaluation is already in progress for this ticket.",
    });

    release.resolve();
    await expect(first).resolves.toBe("first");
  });

  it("allows evaluations for different tickets to run concurrently", async () => {
    const guard = new TicketEvaluationGuard();
    const release = deferred();
    const started: string[] = [];
    const first = guard.run("TKT-1010", async () => {
      started.push("TKT-1010");
      await release.promise;
      return "first";
    });
    const second = guard.run("TKT-1008", async () => {
      started.push("TKT-1008");
      await release.promise;
      return "second";
    });

    expect(started).toEqual(["TKT-1010", "TKT-1008"]);
    release.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual(["first", "second"]);
  });

  it("releases the ticket claim when an evaluation throws", async () => {
    const guard = new TicketEvaluationGuard();
    const failure = new Error("provider failed");

    await expect(
      guard.run("TKT-1010", async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    await expect(
      guard.run("TKT-1010", async () => "retried"),
    ).resolves.toBe("retried");
  });
});

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
