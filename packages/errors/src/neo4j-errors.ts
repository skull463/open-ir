export class Neo4jConfigError extends Error {
  override readonly name = "Neo4jConfigError";
  readonly hint: string;

  constructor(hint: string) {
    super(`Neo4j is not configured. Run:\n  ${hint}`);
    this.hint = hint;
  }
}

export class Neo4jConnectError extends Error {
  override readonly name = "Neo4jConnectError";

  constructor(uri: string, cause: unknown) {
    super(`Failed to connect to Neo4j at ${redactUri(uri)}: ${describe(cause)}`);
    this.cause = cause;
  }
}

export class Neo4jNotConnectedError extends Error {
  override readonly name = "Neo4jNotConnectedError";

  constructor() {
    super("Neo4j driver is not connected. Call connectNeo4j() first.");
  }
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function redactUri(uri: string): string {
  return uri.replace(/\/\/([^:]+):([^@]+)@/u, "//$1:***@");
}
