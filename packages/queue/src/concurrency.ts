import { Config, JobType } from "@bb/types";
import { getConfigValue } from "@bb/config";

export function defaultConcurrencyFor(type: JobType): number {
  switch (type) {
    case JobType.GithubIndex:
    case JobType.GithubPull:
    case JobType.LocalIngest:
    case JobType.BusinessContextProcessing:
      return getConfigValue(Config.ConcurrencyGithub);
  }
}
