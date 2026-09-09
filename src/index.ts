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
  try {
    if (deps.learningAvailability.status === "unavailable") {
      console.error(`[${deps.learningAvailability.code}] ${deps.learningAvailability.message}`);
    }
    const server = createTriageServer(deps);
    const transport = new StdioServerTransport();
    let resolveTransportClosed!: () => void;
    const transportClosed = new Promise<void>((resolve) => {
      resolveTransportClosed = resolve;
    });
    let shutdownPromise: Promise<void> | undefined;
    const shutdown = (): Promise<void> => shutdownPromise ??= (async () => {
      await server.close();
      await closeRuntime();
    })();
    transport.onclose = () => {
      resolveTransportClosed();
    };
    const handleSignal = (): void => {
      void shutdown().then(
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
    await server.connect(transport);
    await transportClosed;
    await closeRuntime();
  } catch (error) {
    try {
      await closeRuntime();
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
