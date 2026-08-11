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

async function main(): Promise<void> {
  const deps = await createRuntimeDependencies();
  const server = createTriageServer(deps);
  let closed = false;
  const closeRuntime = (): void => {
    if (closed) return;
    closed = true;
    deps.close();
  };
  process.once("exit", closeRuntime);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void server.close().finally(() => {
        closeRuntime();
        process.exitCode = 0;
      });
    });
  }
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  console.error("Support ticket triage server failed to start.");
  console.error(safeErrorDetail(error));
  process.exitCode = 1;
});
