import { type ChangeEvent, useRef, useState } from "react";
import type { UtterLoopFullBackup } from "../../domain/backup/UtterLoopFullBackup";
import {
  summarizeFullBackup,
  type FullBackupSummary,
} from "../../application/use-cases/restoreFullBackup";
import { ConfirmationDialog } from "./ConfirmationDialog";

export interface PreparedFullBackupSelection {
  backup: UtterLoopFullBackup;
  fileName: string;
  summary: FullBackupSummary;
}

export interface FullBackupControlsProps {
  exportError?: string | null;
  exportPending?: boolean;
  onExport(): void;
  onRestore(backup: UtterLoopFullBackup): void | Promise<void>;
  validate(raw: unknown): UtterLoopFullBackup;
}

export async function prepareFullBackupSelection(
  file: File,
  validate: (raw: unknown) => UtterLoopFullBackup,
): Promise<PreparedFullBackupSelection> {
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text()) as unknown;
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }
  const backup = validate(raw);

  return {
    backup,
    fileName: file.name,
    summary: summarizeFullBackup(backup),
  };
}

export function restorePreparedFullBackup(
  selection: PreparedFullBackupSelection,
  onRestore: (backup: UtterLoopFullBackup) => void | Promise<void>,
): Promise<void> {
  return Promise.resolve(onRestore(selection.backup));
}

interface FullBackupSelectionSummaryProps {
  fileName: string;
  summary: FullBackupSummary;
}

export function FullBackupSelectionSummary({
  fileName,
  summary,
}: FullBackupSelectionSummaryProps) {
  const counts = [
    ["Course", summary.counts.courses],
    ["Card", summary.counts.cards],
    ["First Pass", summary.counts.firstPasses],
    ["ReviewState", summary.counts.reviewStates],
    ["Practice log", summary.counts.practiceLogEntries],
    ["Vocabulary", summary.counts.vocabularyEntries],
  ] as const;

  return (
    <div className="full-backup-summary">
      <div className="full-backup-summary-heading">
        <strong>{fileName}</strong>
        <span>
          Exported{" "}
          <time dateTime={summary.exportedAt}>
            {new Date(summary.exportedAt).toLocaleString()}
          </time>
        </span>
      </div>
      <dl className="full-backup-counts">
        {counts.map(([label, count]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{count}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

interface PreparedFullBackupRestoreProps {
  confirmationOpen: boolean;
  onCancel(): void;
  onConfirm(): void;
  onRequestConfirmation(): void;
  restoreError?: string | null;
  restorePending: boolean;
  selection: PreparedFullBackupSelection;
}

export function PreparedFullBackupRestore({
  confirmationOpen,
  onCancel,
  onConfirm,
  onRequestConfirmation,
  restoreError,
  restorePending,
  selection,
}: PreparedFullBackupRestoreProps) {
  return (
    <div className="prepared-full-backup-restore">
      <FullBackupSelectionSummary
        fileName={selection.fileName}
        summary={selection.summary}
      />
      <button
        aria-controls="full-backup-restore-confirmation"
        aria-expanded={confirmationOpen}
        className="danger-button"
        disabled={restorePending}
        onClick={onRequestConfirmation}
        type="button"
      >
        Review replacement
      </button>

      <ConfirmationDialog
        confirmLabel="Replace with backup"
        description={`Replace all current Courses, learning progress, typed answers, Review state, Vocabulary, and preferences with ${selection.fileName}. This cannot be undone.`}
        error={restoreError}
        id="full-backup-restore-confirmation"
        isPending={restorePending}
        onCancel={onCancel}
        onConfirm={onConfirm}
        open={confirmationOpen}
        pendingLabel="Restoring…"
        title="Restore full backup?"
      />
    </div>
  );
}

export function FullBackupControls({
  exportError,
  exportPending = false,
  onExport,
  onRestore,
  validate,
}: FullBackupControlsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restorePending, setRestorePending] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [selection, setSelection] = useState<PreparedFullBackupSelection | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const isBusy = exportPending || readingFile || restorePending;

  async function selectBackupFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      return;
    }

    setConfirmationOpen(false);
    setReadingFile(true);
    setRestoreError(null);
    setSelectedFileName(file.name);
    setSelection(null);
    setSelectionError(null);

    try {
      setSelection(await prepareFullBackupSelection(file, validate));
    } catch (caught) {
      setSelectionError(errorMessage(caught, "The selected backup could not be validated."));
    } finally {
      setReadingFile(false);
    }
  }

  async function restoreSelectedBackup() {
    if (!selection || restorePending) {
      return;
    }

    setRestoreError(null);
    setRestorePending(true);
    try {
      await restorePreparedFullBackup(selection, onRestore);
      setConfirmationOpen(false);
      setSelectedFileName(null);
      setSelection(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch {
      setRestoreError("Restore failed. Your current data is unchanged.");
    } finally {
      setRestorePending(false);
    }
  }

  return (
    <section
      aria-busy={isBusy}
      aria-labelledby="full-backup-heading"
      className="full-backup-controls"
    >
      <div>
        <p className="eyebrow">Private device data</p>
        <h3 id="full-backup-heading">Full local backup</h3>
        <p className="muted-copy">
          This is separate from Course bundles. A full backup may contain your typed answers and
          learning history, so keep the downloaded file stored privately.
        </p>
      </div>

      <div className="full-backup-actions">
        <button
          className="secondary-button"
          disabled={isBusy}
          onClick={onExport}
          type="button"
        >
          {exportPending ? "Exporting…" : "Export full backup"}
        </button>
        <label
          aria-disabled={isBusy}
          className="secondary-button file-button full-backup-file-button"
        >
          <span>{readingFile ? "Reading backup…" : "Choose backup file"}</span>
          <input
            accept="application/json,.json"
            disabled={isBusy}
            onChange={selectBackupFile}
            ref={fileInputRef}
            type="file"
          />
        </label>
      </div>

      {exportError && (
        <p className="full-backup-error" role="alert">
          {exportError}
        </p>
      )}

      <p aria-live="polite" className="full-backup-file-status" role="status">
        {readingFile && selectedFileName
          ? `Reading and validating ${selectedFileName}.`
          : selection
            ? `${selection.fileName} is valid and ready to review.`
            : null}
      </p>

      {selectionError && (
        <div className="full-backup-validation-error" role="alert">
          <strong>{selectedFileName ?? "Selected backup"} is not ready to restore.</strong>
          <span>{selectionError}</span>
        </div>
      )}

      {selection && (
        <PreparedFullBackupRestore
          confirmationOpen={confirmationOpen}
          onCancel={() => {
            if (!restorePending) {
              setConfirmationOpen(false);
            }
          }}
          onConfirm={() => void restoreSelectedBackup()}
          onRequestConfirmation={() => {
            setRestoreError(null);
            setConfirmationOpen(true);
          }}
          restoreError={restoreError}
          restorePending={restorePending}
          selection={selection}
        />
      )}
    </section>
  );
}

function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message ? caught.message : fallback;
}
