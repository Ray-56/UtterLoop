import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { UtterLoopFullBackup } from "../../domain/backup/UtterLoopFullBackup";
import {
  FullBackupControls,
  FullBackupSelectionSummary,
  PreparedFullBackupRestore,
  prepareFullBackupSelection,
  restorePreparedFullBackup,
} from "./FullBackupControls";

describe("FullBackupControls", () => {
  it("keeps private full-backup export distinct and exposes pending failure status", () => {
    const html = renderToStaticMarkup(
      <FullBackupControls
        exportError="The backup could not be exported."
        exportPending
        onExport={vi.fn()}
        onRestore={vi.fn()}
        validate={vi.fn()}
      />,
    );

    expect(html).toContain("Full local backup");
    expect(html).toContain("typed answers");
    expect(html).toContain("learning history");
    expect(html).toContain("stored privately");
    expect(html).toContain("Exporting…");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("The backup could not be exported.");
    expect(html).toContain("Choose backup file");
    expect(html).toContain('accept="application/json,.json"');
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain("Review replacement");
  });

  it("parses a selected JSON file and summarizes only the validated backup", async () => {
    const backup = backupFixture();
    const validate = vi.fn((raw: unknown) => {
      expect(raw).toEqual({ format: "candidate" });
      return backup;
    });

    const selection = await prepareFullBackupSelection(
      new File(['{"format":"candidate"}'], "july-backup.json", { type: "application/json" }),
      validate,
    );

    expect(validate).toHaveBeenCalledOnce();
    expect(selection.backup).toBe(backup);
    expect(selection.fileName).toBe("july-backup.json");
    expect(selection.summary).toEqual({
      exportedAt: "2026-07-31T12:34:56.000Z",
      counts: {
        courses: 2,
        cards: 3,
        firstPasses: 2,
        reviewStates: 4,
        practiceLogEntries: 5,
        vocabularyEntries: 1,
      },
    });
  });

  it("shows every required count and the exported date before replacement", () => {
    const html = renderToStaticMarkup(
      <FullBackupSelectionSummary
        fileName="july-backup.json"
        summary={{
          exportedAt: "2026-07-31T12:34:56.000Z",
          counts: {
            courses: 2,
            cards: 3,
            firstPasses: 2,
            reviewStates: 4,
            practiceLogEntries: 5,
            vocabularyEntries: 1,
          },
        }}
      />,
    );

    expect(html).toContain("july-backup.json");
    expect(html).toContain('dateTime="2026-07-31T12:34:56.000Z"');
    expect(html).toMatch(/Course<\/dt><dd>2<\/dd>/);
    expect(html).toMatch(/Card<\/dt><dd>3<\/dd>/);
    expect(html).toMatch(/First Pass<\/dt><dd>2<\/dd>/);
    expect(html).toMatch(/ReviewState<\/dt><dd>4<\/dd>/);
    expect(html).toMatch(/log<\/dt><dd>5<\/dd>/);
    expect(html).toMatch(/Vocabulary<\/dt><dd>1<\/dd>/);
  });

  it("reports malformed JSON as a file error before validation", async () => {
    const validate = vi.fn(() => backupFixture());

    await expect(prepareFullBackupSelection(
      new File(["not json"], "broken.json", { type: "application/json" }),
      validate,
    )).rejects.toThrow("The selected file is not valid JSON.");
    expect(validate).not.toHaveBeenCalled();
  });

  it("preserves a validator's path-oriented error", async () => {
    const pathError = "learning.practiceLog[42].cardId references a missing Card";

    await expect(prepareFullBackupSelection(
      new File(["{}"], "invalid-backup.json", { type: "application/json" }),
      () => {
        throw new Error(pathError);
      },
    )).rejects.toThrow(pathError);
  });

  it("keeps a validated selection available when replacement fails so it can retry", () => {
    const html = renderToStaticMarkup(
      <PreparedFullBackupRestore
        confirmationOpen
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        onRequestConfirmation={vi.fn()}
        restoreError="Restore failed. Your current data is unchanged."
        restorePending={false}
        selection={{
          backup: backupFixture(),
          fileName: "july-backup.json",
          summary: {
            exportedAt: "2026-07-31T12:34:56.000Z",
            counts: {
              courses: 2,
              cards: 3,
              firstPasses: 2,
              reviewStates: 4,
              practiceLogEntries: 5,
              vocabularyEntries: 1,
            },
          },
        }}
      />,
    );

    expect(html).toContain("july-backup.json");
    expect(html).toContain('role="dialog"');
    expect(html).toContain("Restore full backup?");
    expect(html).toContain("Try again");
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("current data is unchanged");
    expect(html).not.toContain("Restoring…");
  });

  it("hands only the validated backup to the restore callback", async () => {
    const selection = {
      backup: backupFixture(),
      fileName: "july-backup.json",
      summary: {
        exportedAt: "2026-07-31T12:34:56.000Z",
        counts: {
          courses: 2,
          cards: 3,
          firstPasses: 2,
          reviewStates: 4,
          practiceLogEntries: 5,
          vocabularyEntries: 1,
        },
      },
    };
    const onRestore = vi.fn().mockResolvedValue(undefined);

    await restorePreparedFullBackup(selection, onRestore);

    expect(onRestore).toHaveBeenCalledOnce();
    expect(onRestore).toHaveBeenCalledWith(selection.backup);
  });
});

function backupFixture(): UtterLoopFullBackup {
  return {
    format: "utterloop-full-backup",
    schemaVersion: 1,
    exportedAt: "2026-07-31T12:34:56.000Z",
    databaseSchemaVersion: 5,
    catalog: {
      categories: [],
      learningPaths: [],
      courses: [{}, {}] as never[],
      cards: [{}, {}, {}] as never[],
    },
    learning: {
      sentenceLearningStates: [
        { cardId: "card-1", firstPassedAt: "2026-07-01T00:00:00.000Z", firstPassSource: "legacy" },
        { cardId: "card-2", firstPassedAt: "2026-07-02T00:00:00.000Z", firstPassSource: "legacy" },
        { cardId: "card-3", introducedAt: "2026-07-03T00:00:00.000Z", acquisitionStatus: "needs-guided" },
      ],
      reviewStates: [{}, {}, {}, {}] as never[],
      practiceLog: [{}, {}, {}, {}, {}] as never[],
      vocabularyEntries: [{}] as never[],
    },
    preferences: {
      fingerGuideMode: "auto",
      id: "device",
      theme: "system",
      speechVoiceUri: null,
      keySoundMuted: false,
      quickStart: null,
    },
  };
}
