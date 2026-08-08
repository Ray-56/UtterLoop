import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ConfirmationDialog } from "./ConfirmationDialog";

describe("ConfirmationDialog", () => {
  it("renders a labelled modal with explicit cancel and confirm actions", () => {
    const html = renderToStaticMarkup(
      <ConfirmationDialog
        confirmLabel="Reset learning progress"
        description="Review state and attempts will be removed. Vocabulary stays saved."
        id="reset-dialog"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        open
        title="Reset learning progress?"
      />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="reset-dialog-title"');
    expect(html).toContain('aria-describedby="reset-dialog-description"');
    expect(html).toContain("Vocabulary stays saved.");
    expect(html).toContain("Cancel");
    expect(html).toContain("Reset learning progress");
  });

  it("locks dismissal while pending and exposes retryable failure status", () => {
    const pending = renderToStaticMarkup(
      <ConfirmationDialog
        confirmLabel="Replace with backup"
        description="Current local data will be replaced."
        error="Restore failed. Your current data is unchanged."
        id="restore-dialog"
        isPending
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        open
        pendingLabel="Restoring…"
        title="Restore full backup?"
      />,
    );

    expect(pending).toContain('aria-busy="true"');
    expect(pending.match(/disabled=""/g)).toHaveLength(2);
    expect(pending).toContain("Restoring…");
    expect(pending).toContain('role="alert"');
    expect(pending).toContain("current data is unchanged");
  });

  it("labels a failed confirmation as an explicit retry", () => {
    const failed = renderToStaticMarkup(
      <ConfirmationDialog
        confirmLabel="Replace with backup"
        description="Current local data will be replaced."
        error="Restore failed. Your current data is unchanged."
        id="failed-restore-dialog"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        open
        pendingLabel="Restoring…"
        title="Restore full backup?"
      />,
    );

    expect(failed).toContain("Try again");
    expect(failed).not.toContain("Restoring…");
  });

  it("renders nothing while closed", () => {
    expect(renderToStaticMarkup(
      <ConfirmationDialog
        confirmLabel="Clear"
        description="Clear data."
        id="closed-dialog"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        open={false}
        title="Clear?"
      />,
    )).toBe("");
  });
});
