import { QueueNotConnectedError } from "@bb/errors";
import type { IQueueProvider, QueuePingResult } from "@bb/queue-core";

let activeProvider: IQueueProvider | null = null;
let connecting: Promise<void> | null = null;
const providers = new Map<string, () => IQueueProvider>();

export function registerQueueProvider(name: string, factory: () => IQueueProvider): void {
  providers.set(name, factory);
}

export function getQueue(): IQueueProvider {
  if (activeProvider === null) {
    throw new QueueNotConnectedError();
  }
  return activeProvider;
}

export async function connectQueue(providerName: string): Promise<void> {
  if (activeProvider !== null) {
    return;
  }
  if (connecting !== null) {
    return connecting;
  }
  connecting = doConnect(providerName).finally(() => {
    connecting = null;
  });
  return connecting;
}

async function doConnect(providerName: string): Promise<void> {
  const factory = providers.get(providerName);
  if (factory === undefined) {
    throw new Error(`Queue provider '${providerName}' not registered.`);
  }
  const next = factory();
  await next.connect();
  activeProvider = next;
}

export async function closeQueue(): Promise<void> {
  if (activeProvider === null) {
    return;
  }
  const c = activeProvider;
  activeProvider = null;
  await c.close();
}

export async function pingQueue(): Promise<QueuePingResult> {
  return getQueue().ping();
}

export function __resetForTests(): void {
  activeProvider = null;
  connecting = null;
}
