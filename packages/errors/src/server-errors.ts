export class ServerConfigError extends Error {
  override readonly name = "ServerConfigError";
  readonly missing: readonly string[];
  readonly hints: readonly string[];

  constructor(missing: readonly string[], hints: readonly string[]) {
    super(
      `Missing required config: ${missing.join(", ")}.\n` + (hints.length > 0 ? `Run:\n  ${hints.join("\n  ")}` : ""),
    );
    this.missing = missing;
    this.hints = hints;
  }
}

export class ServerStartTimeoutError extends Error {
  override readonly name = "ServerStartTimeoutError";
  readonly logPath: string;

  constructor(logPath: string, timeoutSeconds: number) {
    super(`server didn't come up within ${timeoutSeconds}s. Check ${logPath}`);
    this.logPath = logPath;
  }
}

export class ServerInfraDownError extends Error {
  override readonly name = "ServerInfraDownError";
  readonly services: string[];

  constructor(services: string[]) {
    super(`server started but infra not reachable: ${services.join(", ")}. Make sure Docker is running.`);
    this.services = services;
  }
}

export class ServerInfraUnreachableError extends Error {
  override readonly name = "ServerInfraUnreachableError";
  readonly services: { name: string; uri: string }[];

  constructor(services: { name: string; uri: string }[]) {
    const list = services.map((s) => `${s.name} (${s.uri})`).join(", ");
    super(`infra not reachable before server start: ${list}. Is Docker running?`);
    this.services = services;
  }
}

export class ServerProcessExitedError extends Error {
  override readonly name = "ServerProcessExitedError";
  readonly logTail: string;

  constructor(code: number | null, logTail: string) {
    super(`server process exited immediately (code ${code ?? "null"})`);
    this.logTail = logTail;
  }
}
