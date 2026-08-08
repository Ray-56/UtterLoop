import { useEffect, useRef } from "react";

interface ConfirmationDialogProps {
  id: string;
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel?: string;
  isPending?: boolean;
  error?: string | null;
  danger?: boolean;
  onCancel(): void;
  onConfirm(): void;
}

export function ConfirmationDialog({
  confirmLabel,
  danger = true,
  description,
  error,
  id,
  isPending = false,
  onCancel,
  onConfirm,
  open,
  pendingLabel = "Working…",
  title,
}: ConfirmationDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const isPendingRef = useRef(isPending);
  const onCancelRef = useRef(onCancel);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  isPendingRef.current = isPending;
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const frame = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>("[data-dialog-autofocus]")?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (!dialogRef.current) {
        return;
      }

      if (event.key === "Escape") {
        if (!isPendingRef.current) {
          event.preventDefault();
          onCancelRef.current();
        }
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )];
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      const opener = previousFocusRef.current;
      previousFocusRef.current = null;
      if (opener?.isConnected) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="confirmation-dialog-backdrop"
      onMouseDown={(event) => {
        if (!isPending && event.currentTarget === event.target) {
          onCancel();
        }
      }}
    >
      <div
        aria-busy={isPending}
        aria-describedby={`${id}-description`}
        aria-labelledby={`${id}-title`}
        aria-modal="true"
        className="confirmation-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="confirmation-dialog-copy">
          <p className="eyebrow">Confirm local change</p>
          <h3 id={`${id}-title`}>{title}</h3>
          <p id={`${id}-description`}>{description}</p>
          {error && (
            <p className="confirmation-dialog-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="confirmation-dialog-actions">
          <button
            className="secondary-button"
            data-dialog-autofocus
            disabled={isPending}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className={danger ? "danger-button" : "primary-button"}
            disabled={isPending}
            onClick={onConfirm}
            type="button"
          >
            {isPending ? pendingLabel : error ? "Try again" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
