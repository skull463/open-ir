import { knowledgeDb } from "@bb/db";
import type {
  ProgressContext,
  ProgressContextFactory,
  ProgressPhase,
  ProgressReporter,
  ProgressReporterInput,
} from "./types.ts";

class DbProgressContext implements ProgressContext {
  private total = 0;
  private processed = 0;
  private lastUpdate = 0;

  constructor(private knowledgeId: string) {}

  reporter(input: ProgressReporterInput): ProgressReporter {
    const isFileAnalysis =
      input.phase === "file_analysis" &&
      (input.subPhase === "analyse_small" || input.subPhase === "big_files_condense");

    return {
      start: async () => {
        if (isFileAnalysis && input.total.kind === "fixed") {
          this.total += input.total.total;
          await knowledgeDb.updateKnowledgeProgress(this.knowledgeId, this.processed, this.total);
        }
      },
      increment: (delta = 1) => {
        if (isFileAnalysis) {
          this.processed += delta;
          const now = Date.now();
          if (now - this.lastUpdate > 250 || this.processed >= this.total) {
            this.lastUpdate = now;
            knowledgeDb.updateKnowledgeProgress(this.knowledgeId, this.processed, this.total).catch(() => {});
          }
        }
      },
      incrementSeen: () => {},
      setTotal: (total) => {
        if (isFileAnalysis) {
          this.total = total;
          knowledgeDb.updateKnowledgeProgress(this.knowledgeId, this.processed, this.total).catch(() => {});
        }
      },
      stop: () => {},
    };
  }

  phaseChanged(phase: ProgressPhase) {
    if (phase === "clone" || phase === "scan") {
      knowledgeDb.updateKnowledgeProgress(this.knowledgeId, 0, undefined).catch(() => {});
    }
  }

  completed() {
    knowledgeDb.updateKnowledgeProgress(this.knowledgeId, this.total, this.total).catch(() => {});
  }

  failed() {}
}

export const dbProgressContextFactory: ProgressContextFactory = (knowledgeId: string) => {
  return new DbProgressContext(knowledgeId);
};
