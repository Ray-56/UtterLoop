import type {
  UtterLoopFullBackup,
  UtterLoopFullBackupV2,
} from "../../domain/backup/UtterLoopFullBackup";
import { validateFullBackup } from "../../domain/backup/validateFullBackup";
import type { TrainingRepository } from "../ports/TrainingRepository";

export interface FullBackupSummary {
  exportedAt: string;
  counts: {
    courses: number;
    cards: number;
    firstPasses: number;
    reviewStates: number;
    practiceLogEntries: number;
    vocabularyEntries: number;
  };
}

export async function restoreFullBackup(
  repository: Pick<TrainingRepository, "replaceAllData">,
  value: unknown,
  restoredAt = new Date(),
): Promise<FullBackupSummary> {
  const backup = validateFullBackup(value, restoredAt.toISOString());
  await repository.replaceAllData(backup);
  return summarizeFullBackup(backup);
}

export function summarizeFullBackup(
  backup: UtterLoopFullBackup | UtterLoopFullBackupV2,
): FullBackupSummary {
  return {
    exportedAt: backup.exportedAt,
    counts: {
      courses: backup.catalog.courses.length,
      cards: backup.catalog.cards.length,
      firstPasses: backup.learning.sentenceLearningStates.filter((state) => state.firstPassedAt).length,
      reviewStates: backup.learning.reviewStates.length,
      practiceLogEntries: backup.learning.practiceLog.length,
      vocabularyEntries: backup.learning.vocabularyEntries.length,
    },
  };
}
