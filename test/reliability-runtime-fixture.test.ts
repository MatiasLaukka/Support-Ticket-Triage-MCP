import type { Server } from "node:http";
import { describe, expect, it } from "vitest";
import { closeReliabilityResources } from "./reliability-runtime-fixture.js";

describe("reliability runtime fixture cleanup", () => {
  it("attempts runtime cleanup after server cleanup fails and preserves both errors", async () => {
    const serverError = new Error("server close failed");
    const runtimeError = new Error("runtime close failed");
    let runtimeClosed = false;
    const server = {
      close(callback: (error?: Error) => void): void {
        callback(serverError);
      },
    } as Pick<Server, "close">;
    const runtime = {
      close(): void {
        runtimeClosed = true;
        throw runtimeError;
      },
    };

    let cleanupError: unknown;
    try {
      await closeReliabilityResources(server, runtime);
    } catch (error) {
      cleanupError = error;
    }

    expect(runtimeClosed).toBe(true);
    expect(cleanupError).toBeInstanceOf(AggregateError);
    expect((cleanupError as AggregateError).errors).toEqual([serverError, runtimeError]);
  });
});
