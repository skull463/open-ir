import { JobPriority } from "@bb/types";

const PRIORITY_TO_HONKER: Record<JobPriority, number> = {
  [JobPriority.Low]: 1,
  [JobPriority.Normal]: 100,
  [JobPriority.High]: 1000,
};

export function mapHonkerPriority(priority: JobPriority): number {
  return PRIORITY_TO_HONKER[priority];
}
