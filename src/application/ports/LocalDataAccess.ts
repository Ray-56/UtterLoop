export const PRACTICE_OWNERSHIP_LEASE_MS = 30_000;

export interface PracticeOwnershipLease {
  token: string;
  expiresAt: number;
}

export type PracticeOwnershipResult =
  | ({ status: "owned" } & PracticeOwnershipLease)
  | { status: "in-use"; expiresAt: number };

/** Device-local coordination only. These tokens never belong in a portable backup. */
export interface LocalDataAccess {
  initializeDataAccess(): Promise<number>;
  acquirePracticeOwnership(options?: { takeOver?: boolean }): Promise<PracticeOwnershipResult>;
  renewPracticeOwnership(token: string): Promise<PracticeOwnershipLease>;
  releasePracticeOwnership(token: string): Promise<void>;
}

export class LocalDataChangedError extends Error {
  readonly code = "LOCAL_DATA_CHANGED";

  constructor() {
    super("Local learning data was restored or reset. Reload before continuing.");
    this.name = "LocalDataChangedError";
  }
}

export class PracticeOwnershipLostError extends Error {
  readonly code = "PRACTICE_OWNERSHIP_LOST";

  constructor() {
    super("Practice is active in another tab. Return to that tab or explicitly take over here.");
    this.name = "PracticeOwnershipLostError";
  }
}
