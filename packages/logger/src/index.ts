import { getLogger } from "./logger.ts";

export { getLogger, shutdownLoggers, __resetLoggersForTests } from "./logger.ts";
export type { LoggerScope } from "./logger.ts";

export { getLogsDir, ensureLogsDir } from "./dirs.ts";

export type { Logger } from "winston";

export const logger = getLogger("server");
