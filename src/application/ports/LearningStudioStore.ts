import type { LearningStudioDocument } from "../../domain/studio/LearningStudio";

export interface LearningStudioStore {
  /** Treat returned durable collections as immutable; checkpoint copies may be edited separately. */
  readLearningStudio(): Promise<LearningStudioDocument>;
  /** Atomically compare the whole document revision, including checkpoint-only changes. */
  saveLearningStudio(document: LearningStudioDocument, expectedRevision: number): Promise<LearningStudioDocument>;
}

export class LearningStudioConflictError extends Error {
  readonly code = "STUDIO_CONFLICT";

  constructor() {
    super("Learning Studio changed in another tab. Refresh it before saving again.");
    this.name = "LearningStudioConflictError";
  }
}
