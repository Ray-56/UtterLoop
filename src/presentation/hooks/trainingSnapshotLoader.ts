import type {
  CompleteTrainingSnapshot,
  TrainingSnapshot,
} from "../../application/use-cases/getTrainingSnapshot";

export type AnalyticsStatus = "deferred" | "loading" | "loaded" | "error";
export interface TrainingSnapshotLoadState {
  snapshot: TrainingSnapshot | null;
  analyticsStatus: AnalyticsStatus;
  analyticsError: string | null;
}

interface SnapshotSource {
  getPracticeSnapshot(): Promise<TrainingSnapshot>;
  getSnapshot(): Promise<CompleteTrainingSnapshot>;
}

export class TrainingSnapshotLoader {
  state: TrainingSnapshotLoadState = {
    snapshot: null, analyticsStatus: "deferred", analyticsError: null,
  };
  private revision = 0;
  private analyticsRequest: { revision: number; promise: Promise<void> } | null = null;

  constructor(
    private readonly source: SnapshotSource,
    private readonly onChange: (state: TrainingSnapshotLoadState) => void,
    private readonly now: () => number = Date.now,
  ) {}

  async refresh({ invalidateFocused = false } = {}): Promise<void> {
    const revision = ++this.revision;
    const next = await this.source.getPracticeSnapshot();
    if (revision !== this.revision) return;
    this.publish({
      snapshot: {
        ...next,
        focusedWeakCardIds: invalidateFocused ? null : this.state.snapshot?.focusedWeakCardIds ?? null,
      },
      analyticsStatus: "deferred",
      analyticsError: null,
    });
  }

  loadAnalytics({ force = false } = {}): Promise<void> {
    const asOf = this.state.snapshot?.analyticsAsOf;
    const age = asOf ? this.now() - Date.parse(asOf) : Infinity;
    if (!this.state.snapshot || (!force && age >= 0 && age < 60_000)) {
      return Promise.resolve();
    }
    if (this.analyticsRequest?.revision === this.revision) return this.analyticsRequest.promise;
    const revision = this.revision;
    this.publish({ ...this.state, analyticsStatus: "loading", analyticsError: null });
    const promise = this.source.getSnapshot().then((snapshot) => {
      if (revision === this.revision) {
        this.publish({ snapshot, analyticsStatus: "loaded", analyticsError: null });
      }
    }).catch((error: unknown) => {
      if (revision === this.revision) {
        this.publish({
          ...this.state,
          analyticsStatus: "error",
          analyticsError: "Learning statistics could not be loaded. Retry to refresh them.",
        });
      }
      throw error;
    }).finally(() => {
      if (this.analyticsRequest?.revision === revision) this.analyticsRequest = null;
    });
    this.analyticsRequest = { revision, promise };
    return promise;
  }

  cancel(): void {
    this.revision += 1;
  }

  private publish(state: TrainingSnapshotLoadState): void {
    this.state = state;
    this.onChange(state);
  }
}
