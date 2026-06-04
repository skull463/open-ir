export class QueueNotConnectedError extends Error {
  override readonly name = "QueueNotConnectedError";

  constructor() {
    super("Queue is not connected. Call connectQueue() first.");
  }
}

export class QueueConnectError extends Error {
  override readonly name = "QueueConnectError";

  constructor(cause: unknown) {
    super(`Failed to initialize queue: ${describe(cause)}`);
    this.cause = cause;
  }
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
