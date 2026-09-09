import process from "node:process";
import type { AddressInfo } from "node:net";
import { createApprovalDeskHttpServer } from "./approval-desk/http.js";
import { DomainError } from "./errors.js";
import {
  createRuntimeDependencies,
  StartupConfigError,
} from "./runtime.js";

const DEFAULT_APPROVAL_DESK_HOST = "127.0.0.1";
const DEFAULT_APPROVAL_DESK_PORT = 5177;
const INVALID_HOST_MESSAGE = "APPROVAL_DESK_HOST must not be blank.";
const INVALID_PORT_MESSAGE =
  "APPROVAL_DESK_PORT must be an integer from 0 to 65535.";

function safeErrorDetail(error: unknown): string {
  if (error instanceof StartupConfigError || error instanceof DomainError) {
    return error.message;
  }
  return "Unexpected approval desk startup error.";
}

function approvalDeskHost(env: NodeJS.ProcessEnv): string {
  const configured = env.APPROVAL_DESK_HOST;
  if (configured === undefined) {
    return DEFAULT_APPROVAL_DESK_HOST;
  }

  const trimmed = configured.trim();
  if (trimmed.length === 0) {
    throw new StartupConfigError(INVALID_HOST_MESSAGE);
  }
  return trimmed;
}

function approvalDeskPort(env: NodeJS.ProcessEnv): number {
  const configured = env.APPROVAL_DESK_PORT;
  if (configured === undefined) {
    return DEFAULT_APPROVAL_DESK_PORT;
  }

  const trimmed = configured.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw invalidApprovalDeskPort();
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65_535) {
    throw invalidApprovalDeskPort();
  }
  return parsed;
}

function invalidApprovalDeskPort(): StartupConfigError {
  return new StartupConfigError(INVALID_PORT_MESSAGE);
}

function listenUrl(host: string, port: number): string {
  const formattedHost =
    host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${formattedHost}:${port}`;
}

function safeShutdownDetail(error: unknown): string {
  if (error instanceof StartupConfigError || error instanceof DomainError) {
    return error.message;
  }
  return "Unexpected approval desk shutdown error.";
}

async function main(): Promise<void> {
  const host = approvalDeskHost(process.env);
  const port = approvalDeskPort(process.env);
  const deps = await createRuntimeDependencies();
  let closePromise: Promise<void> | undefined;
  const closeRuntime = (): Promise<void> => closePromise ??= deps.close();
  let closeServerAndRuntime: (() => Promise<void>) | undefined;
  try {
    if (deps.learningAvailability.status === "unavailable") {
      console.error(`[${deps.learningAvailability.code}] ${deps.learningAvailability.message}`);
    }
    const server = createApprovalDeskHttpServer(deps);
    let resolveServerClosed!: () => void;
    const serverClosed = new Promise<void>((resolve) => {
      resolveServerClosed = resolve;
    });
    let shutdownRequested = false;
    let shutdownPromise: Promise<void> | undefined;
    const closeServer = async (): Promise<void> => {
      await new Promise<void>((resolveClose, rejectClose) => {
        if (!server.listening) {
          resolveClose();
          return;
        }
        server.close((error) => error === undefined
          ? resolveClose()
          : rejectClose(error));
      });
    };
    const closeServerAndRuntimeNow = (): Promise<void> => shutdownPromise ??= (async () => {
      await closeServer();
      await closeRuntime();
    })();
    closeServerAndRuntime = closeServerAndRuntimeNow;
    server.once("close", resolveServerClosed);
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.once(signal, () => {
        shutdownRequested = true;
        void closeServerAndRuntimeNow().then(
          () => { process.exitCode = 0; },
          (error: unknown) => {
            console.error(safeShutdownDetail(error));
            process.exitCode = 1;
          },
        );
      });
    }
    if (shutdownRequested) {
      await closeServerAndRuntimeNow();
      return;
    }
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once("error", rejectListen);
      server.listen(port, host, () => {
        server.off("error", rejectListen);
        if (shutdownRequested) {
          server.close((error) => error === undefined
            ? resolveListen()
            : rejectListen(error));
          return;
        }
        const address = server.address();
        const boundPort = typeof address === "object" && address !== null
          ? (address as AddressInfo).port
          : port;
        console.log(`Approval Desk listening at ${listenUrl(host, boundPort)}.`);
        resolveListen();
      });
    });
    if (shutdownRequested) {
      await closeServerAndRuntimeNow();
      await closeServer();
      await closeRuntime();
      return;
    }
    await serverClosed;
    await closeRuntime();
  } catch (error) {
    try {
      if (closeServerAndRuntime !== undefined) {
        await closeServerAndRuntime();
      } else {
        await closeRuntime();
      }
    } catch (cleanupError) {
      if (cleanupError !== error) {
        throw new AggregateError(
          [error, cleanupError],
          "Approval Desk startup and cleanup failed.",
        );
      }
    }
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error("Approval Desk failed to start.");
  console.error(safeErrorDetail(error));
  process.exitCode = 1;
});
