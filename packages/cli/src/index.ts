#!/usr/bin/env bun
import { buildProgram } from "./program.ts";
import { runMenu } from "./MenuCommand.ts";
import { error } from "./output.ts";

async function main(): Promise<void> {
  // A bare `bytebell` (no subcommand, no flags) opens the interactive menu.
  // Anything else — a subcommand, `--help`, `--version` — parses normally.
  if (process.argv.slice(2).length === 0) {
    await runMenu();
    return;
  }
  const program = buildProgram();
  await program.parseAsync(process.argv);
}

main().catch((cause: unknown) => {
  const msg = cause instanceof Error ? cause.message : String(cause);
  error(msg);
  process.exit(2);
});
