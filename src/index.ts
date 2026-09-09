import process from "node:process";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DomainError } from "./errors.js";
import {
  createRuntimeDependencies,
  StartupConfigError,
} from "./runtime.js";
import { createTriageServer } from "./server.js";

function safeErrorDetail(error: unknown): string {
  if (error instanceof StartupConfigError || error instanceof DomainError) {
    return error.message;
  }
  return "Unexpected startup error.";
}

function safeShutdownDetail(error: unknown): string {
  if (error instanceof StartupConfigError || error instanceof DomainError) {
    return error.message;
  }
  return "Unexpected shutdown error.";
}

async function main(): Promise<void> {
  const deps = await createRuntimeDependencies();
  let closePromise: Promise<void> | undefined;
  const closeRuntime = (): Promise<void> => closePromise ??= deps.close();
  let server!: ReturnType<typeof createTriageServer>;
  let transport!: StdioServerTransport;
  let shutdown: (() => Promise<void>) | undefined;
  try {
    if (deps.learningAvailability.status === "unavailable") {
      console.error(`[${deps.learningAvailability.code}] ${deps.learningAvailability.message}`);
    }
    server = createTriageServer(deps);
    transport = new StdioServerTransport();
    let resolveTransportClosed!: () => void;
    const transportClosed = new Promise<void>((resolve) => {
      resolveTransportClosed = resolve;
    });
    let shutdownRequested = false;
    let shutdownPromise: Promise<void> | undefined;
    const shutdownNow = (): Promise<void> => shutdownPromise ??= (async () => {
      await server.close();
      await transport.close();
      await closeRuntime();
    })();
    shutdown = shutdownNow;
    transport.onclose = () => {
      resolveTransportClosed();
    };
    const handleSignal = (): void => {
      shutdownRequested = true;
      void shutdownNow().then(
        () => { process.exitCode = 0; },
        (error: unknown) => {
          console.error(safeShutdownDetail(error));
          process.exitCode = 1;
        },
      );
    };
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.once(signal, handleSignal);
    }
    if (shutdownRequested) {
      await shutdownNow();
      return;
    }
    await server.connect(transport);
    if (shutdownRequested) {
      await shutdownNow();
      await server.close();
      await transport.close();
      return;
    }
    await transportClosed;
    await closeRuntime();
  } catch (error) {
    try {
      if (shutdown !== undefined) {
        await shutdown();
      } else {
        await closeRuntime();
      }
    } catch (cleanupError) {
      if (cleanupError !== error) {
        throw new AggregateError(
          [error, cleanupError],
          "MCP startup and cleanup failed.",
        );
      }
    }
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error("Support ticket triage server failed to start.");
  console.error(safeErrorDetail(error));
  process.exitCode = 1;
});
