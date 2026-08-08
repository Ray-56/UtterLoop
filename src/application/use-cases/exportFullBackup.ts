import type { TrainingRepository } from "../ports/TrainingRepository";

export function exportFullBackup(
  repository: Pick<TrainingRepository, "readFullBackup">,
  now: Date,
) {
  return repository.readFullBackup(now.toISOString());
}
