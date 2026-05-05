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
