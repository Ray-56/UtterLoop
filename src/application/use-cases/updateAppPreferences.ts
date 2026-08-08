import {
  normalizeAppPreferences,
  type AppPreferences,
} from "../../domain/backup/UtterLoopFullBackup";
import type { TrainingRepository } from "../ports/TrainingRepository";
import { DEFAULT_APP_PREFERENCES } from "./getTrainingSnapshot";

type AppPreferencesRepository = Pick<
  TrainingRepository,
  "getAppPreferences" | "saveAppPreferences"
>;

export async function updateAppPreferences(
  repository: AppPreferencesRepository,
  patch: Partial<AppPreferences>,
): Promise<AppPreferences> {
  const stored = await repository.getAppPreferences();
  const current = stored
    ? normalizeAppPreferences(stored)
    : DEFAULT_APP_PREFERENCES;
  const next: AppPreferences = {
    ...current,
    ...patch,
    id: "device",
  };
  await repository.saveAppPreferences(next);
  return next;
}
