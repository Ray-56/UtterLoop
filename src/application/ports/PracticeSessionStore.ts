import type { QuickStartPreference } from "../../domain/backup/UtterLoopFullBackup";
import type { PracticeSessionEvidence } from "../../domain/practice/PracticeSessionEvidence";
import type {
  PracticeSessionCheckpoint,
  PracticeSessionCheckpointV2,
} from "../practice-session/PracticeSessionCheckpoint";

/**
 * A checkpoint accepted by the monotonic persistence boundary.
 *
 * The application checkpoint contract still includes legacy schema-v1 rows;
 * the lifecycle upgrades those rows before asking the store to commit them.
 */
export type RevisionedPracticeSessionCheckpoint = PracticeSessionCheckpointV2;

export type PracticeSessionCheckpointCommitResult =
  | "stored"
  | "unchanged"
  | "stale"
  | "terminal";

export interface PracticeSessionTerminalCommit {
  evidence: PracticeSessionEvidence;
  quickStartPreference?: QuickStartPreference;
}

export type PracticeSessionTerminalCommitResult = "created" | "existing" | "conflict";

export interface PracticeSessionStore {
  loadActiveCheckpoint(): Promise<PracticeSessionCheckpoint | undefined>;
  discardActiveCheckpoint(expectedSessionId?: string): Promise<boolean>;
  commitCheckpoint(
    checkpoint: RevisionedPracticeSessionCheckpoint,
  ): Promise<PracticeSessionCheckpointCommitResult>;
  commitTerminal(
    commit: PracticeSessionTerminalCommit,
  ): Promise<PracticeSessionTerminalCommitResult>;
  getEvidence(sessionId: string): Promise<PracticeSessionEvidence | undefined>;
  listEvidence(): Promise<PracticeSessionEvidence[]>;
  getMeasurementEpoch(): Promise<string>;
}
