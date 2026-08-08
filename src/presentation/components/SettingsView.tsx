import { ChangeEvent, useEffect, useRef, useState } from "react";
import {
  Download,
  Keyboard,
  Monitor,
  Moon,
  Play,
  RefreshCcw,
  RotateCcw,
  Sun,
  Trash2,
  Upload,
  Volume2,
} from "lucide-react";
import type { CourseBundle } from "../../application/UtterLoopService";
import type { PersonalizationController } from "../hooks/usePersonalizationPreferences";
import type { TrainingController } from "../hooks/useTrainingController";
import type {
  PersonalizationPreferences,
  FingerGuideMode,
  SpeechVoiceDescriptor,
  ThemePreference,
} from "../preferences/personalizationPreferences";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { FullBackupControls } from "./FullBackupControls";
import { validateFullBackup } from "../../domain/backup/validateFullBackup";

interface SettingsViewProps {
  controller: TrainingController;
  personalization: PersonalizationController;
}

interface PersonalizationSettingsProps {
  isPreferenceSavePending: boolean;
  isSpeechSupported: boolean;
  onPreviewVoice(): void;
  onRetryPreferenceSave(): void;
  onFingerGuideModeChange(mode: FingerGuideMode): void;
  onSpeechVoiceChange(voiceUri: string | null): void;
  onThemeChange(theme: ThemePreference): void;
  preferenceSaveError: string | null;
  preferences: PersonalizationPreferences;
  speechPreviewStatus: string | null;
  speechVoices: readonly SpeechVoiceDescriptor[];
}

type SettingsAction = "import" | "export" | "backup-export" | "restore" | "reset" | "clear";
type DestructiveSettingsAction = Extract<SettingsAction, "reset" | "clear">;

interface LocalDataControlsProps {
  confirmation: DestructiveSettingsAction | null;
  error?: string | null;
  onCancelConfirmation(): void;
  onConfirm(): void;
  onRequestConfirmation(action: DestructiveSettingsAction): void;
  onRestoreDefaults(): void;
  pendingAction: SettingsAction | null;
}

const themeOptions = [
  { value: "system", label: "System", description: "Match this device", icon: Monitor },
  { value: "light", label: "Light", description: "Bright paper studio", icon: Sun },
  { value: "dark", label: "Dark", description: "Low-light focus", icon: Moon },
] satisfies Array<{
  value: ThemePreference;
  label: string;
  description: string;
  icon: typeof Monitor;
}>;

const fingerGuideOptions = [
  {
    value: "auto",
    label: "Auto",
    description: "Compact by default; hides when the viewport is too short",
  },
  {
    value: "compact",
    label: "Compact",
    description: "Keep the key and recommended finger strip visible",
  },
  {
    value: "full",
    label: "Full",
    description: "Keep the complete ANSI keyboard map open",
  },
  {
    value: "off",
    label: "Off",
    description: "Hide the finger guide during Practice",
  },
] satisfies Array<{
  value: FingerGuideMode;
  label: string;
  description: string;
}>;

export function PersonalizationSettings({
  isPreferenceSavePending,
  isSpeechSupported,
  onFingerGuideModeChange,
  onPreviewVoice,
  onRetryPreferenceSave,
  onSpeechVoiceChange,
  onThemeChange,
  preferenceSaveError,
  preferences,
  speechPreviewStatus,
  speechVoices,
}: PersonalizationSettingsProps) {
  const isSavedVoiceUnavailable = Boolean(
    preferences.speechVoiceUri
    && !speechVoices.some((voice) => voice.voiceURI === preferences.speechVoiceUri),
  );
  const selectedSpeechVoiceUri = preferences.speechVoiceUri ?? "";

  return (
    <section
      aria-busy={isPreferenceSavePending}
      aria-labelledby="personalization-heading"
      className="settings-panel personalization-panel"
    >
      <div className="personalization-heading">
        <div className="settings-icon" aria-hidden="true">
          <Sun size={20} />
        </div>
        <div>
          <p className="eyebrow">Personalization</p>
          <h3 id="personalization-heading">Make the studio yours</h3>
        </div>
      </div>

      <div className="personalization-grid">
        <fieldset
          aria-describedby="theme-preference-description"
          className="preference-group theme-preference-group"
        >
          <legend>Theme</legend>
          <p className="muted-copy" id="theme-preference-description">
            Choose how UtterLoop looks on this device.
          </p>
          <div className="theme-options">
            {themeOptions.map((option) => {
              const Icon = option.icon;

              return (
                <label className="theme-option" key={option.value}>
                  <input
                    disabled={isPreferenceSavePending}
                    type="radio"
                    name="theme-preference"
                    value={option.value}
                    checked={preferences.theme === option.value}
                    onChange={() => onThemeChange(option.value)}
                  />
                  <span className="theme-option-icon" aria-hidden="true">
                    <Icon size={18} />
                  </span>
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="preference-group voice-preference-group">
          <div className="preference-label-row">
            <label htmlFor="pronunciation-voice">Pronunciation voice</label>
            <Volume2 aria-hidden="true" size={18} />
          </div>
          <p className="muted-copy" id="pronunciation-voice-description">
            Used when you play a sentence with Ctrl+Quote or the audio button. Key sounds stay separate in Practice.
          </p>
          <div className="voice-controls">
            <select
              aria-describedby="pronunciation-voice-description"
              disabled={!isSpeechSupported || isPreferenceSavePending}
              id="pronunciation-voice"
              onChange={(event) => onSpeechVoiceChange(event.target.value || null)}
              value={selectedSpeechVoiceUri}
            >
              <option value="">Automatic · system English voice</option>
              {isSavedVoiceUnavailable && (
                <option disabled value={selectedSpeechVoiceUri}>
                  Saved voice unavailable · choose Automatic to clear
                </option>
              )}
              {speechVoices.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voice.name} · {voice.lang}
                </option>
              ))}
            </select>
            <button
              className="secondary-button preview-voice-button"
              disabled={!isSpeechSupported}
              onClick={onPreviewVoice}
              type="button"
            >
              <Play aria-hidden="true" size={17} />
              Preview voice
            </button>
          </div>
          {!isSpeechSupported && (
            <p className="preference-support-note" role="status">
              Pronunciation voices are not available in this browser.
            </p>
          )}
          <p aria-live="polite" className="preference-preview-status">
            {speechPreviewStatus}
          </p>
        </div>

        <fieldset
          aria-describedby="finger-guide-preference-description"
          className="preference-group finger-guide-preference-group"
        >
          <legend>Finger guide</legend>
          <p className="muted-copy" id="finger-guide-preference-description">
            Choose how much typing guidance stays visible in Practice. Paused and study states use the compact home-row reminder.
          </p>
          <div className="finger-guide-mode-options">
            {fingerGuideOptions.map((option) => (
              <label className="theme-option finger-guide-mode-option" key={option.value}>
                <input
                  checked={preferences.fingerGuideMode === option.value}
                  disabled={isPreferenceSavePending}
                  name="finger-guide-preference"
                  onChange={() => onFingerGuideModeChange(option.value)}
                  type="radio"
                  value={option.value}
                />
                <span className="theme-option-icon" aria-hidden="true">
                  <Keyboard size={18} />
                </span>
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {isPreferenceSavePending && (
        <p aria-live="polite" className="settings-message" role="status">
          Saving preferences…
        </p>
      )}
      {preferenceSaveError && (
        <div className="practice-actions preference-save-feedback">
          <p className="settings-message" role="alert">
            {preferenceSaveError}
          </p>
          <button
            className="secondary-button"
            disabled={isPreferenceSavePending}
            onClick={onRetryPreferenceSave}
            type="button"
          >
            Retry
          </button>
        </div>
      )}
    </section>
  );
}

export function LocalDataControls({
  confirmation,
  error,
  onCancelConfirmation,
  onConfirm,
  onRequestConfirmation,
  onRestoreDefaults,
  pendingAction,
}: LocalDataControlsProps) {
  const isPending = pendingAction !== null;
  const confirmationCopy = confirmation === "clear"
    ? {
        title: "Clear this device?",
        description: "Remove courses, learning progress, attempts, Vocabulary, preferences, and the active Practice draft. Default courses and device defaults will be reinstalled. This cannot be undone.",
        pendingLabel: "Clearing…",
        confirmLabel: "Clear this device",
      }
    : {
        title: "Reset learning progress?",
        description: "Keep courses, Vocabulary, and device preferences, but remove sentence learning, Review schedules, attempt history, and the active Practice draft.",
        pendingLabel: "Resetting…",
        confirmLabel: "Reset learning progress",
      };

  return (
    <div aria-busy={isPending} className="local-data-controls">
      <div className="practice-actions">
        <button
          className="secondary-button"
          disabled={isPending}
          onClick={onRestoreDefaults}
          type="button"
        >
          <RotateCcw size={18} />
          {pendingAction === "restore" ? "Restoring…" : "Restore defaults"}
        </button>
        <button
          aria-controls="local-data-confirmation"
          aria-expanded={confirmation === "reset"}
          className="secondary-button"
          disabled={isPending}
          onClick={() => onRequestConfirmation("reset")}
          type="button"
        >
          <RefreshCcw size={18} />
          Reset learning progress
        </button>
        <button
          aria-controls="local-data-confirmation"
          aria-expanded={confirmation === "clear"}
          className="danger-button"
          disabled={isPending}
          onClick={() => onRequestConfirmation("clear")}
          type="button"
        >
          <Trash2 size={18} />
          Clear this device
        </button>
      </div>

      <ConfirmationDialog
        confirmLabel={confirmationCopy.confirmLabel}
        description={confirmationCopy.description}
        error={error}
        id="local-data-confirmation"
        isPending={Boolean(confirmation && pendingAction === confirmation)}
        onCancel={onCancelConfirmation}
        onConfirm={onConfirm}
        open={confirmation !== null}
        pendingLabel={confirmationCopy.pendingLabel}
        title={confirmationCopy.title}
      />
    </div>
  );
}

export function SettingsView({ controller, personalization }: SettingsViewProps) {
  const [importText, setImportText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<SettingsAction | null>(null);
  const [backupExportError, setBackupExportError] = useState<string | null>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<DestructiveSettingsAction | null>(null);
  const pendingActionRef = useRef<SettingsAction | null>(null);
  const snapshot = controller.snapshot;

  useEffect(
    () => () => personalization.stopSpeechPreview(),
    [personalization.stopSpeechPreview],
  );

  async function exportCatalog() {
    if (!beginAction("export")) {
      return;
    }

    try {
      const bundle = await controller.exportCourseBundle();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "utterloop-course-bundle-v2.json";
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage(`Exported ${bundle.courses.length} courses and ${bundle.categories.length} categories.`);
    } catch {
      setMessage("Course export failed. Your local data is unchanged.");
    } finally {
      finishAction();
    }
  }

  async function exportLocalBackup() {
    if (!beginAction("backup-export")) {
      return;
    }

    setBackupExportError(null);
    setBackupMessage(null);
    try {
      const backup = await controller.exportFullBackup();
      downloadJson(
        backup,
        `utterloop-full-backup-${backup.exportedAt.slice(0, 10)}.json`,
      );
      setBackupMessage(`Exported a private full backup with ${backup.learning.practiceLog.length} learning events.`);
    } catch {
      setBackupExportError("Full backup export failed. Your local data is unchanged.");
    } finally {
      finishAction();
    }
  }

  async function importCatalog() {
    if (!beginAction("import")) {
      return;
    }

    try {
      const parsed = JSON.parse(importText) as CourseBundle;
      await controller.importCourseBundle(parsed);
      setMessage(`Imported ${parsed.courses.length} courses and ${parsed.cards.length} cards.`);
      setImportText("");
    } catch {
      setMessage("Course import failed. Check the bundle format and references, then retry.");
    } finally {
      finishAction();
    }
  }

  function beginAction(action: SettingsAction): boolean {
    if (pendingActionRef.current) {
      return false;
    }

    pendingActionRef.current = action;
    setPendingAction(action);
    setMessage(null);
    return true;
  }

  function finishAction() {
    pendingActionRef.current = null;
    setPendingAction(null);
  }

  async function runAction(
    actionName: SettingsAction,
    action: () => Promise<void>,
    successMessage: string,
  ): Promise<boolean> {
    if (!beginAction(actionName)) {
      return false;
    }

    try {
      await action();
      setMessage(successMessage);
      return true;
    } catch {
      setMessage(`${settingsActionLabel(actionName)} failed. Your existing local data remains available.`);
      return false;
    } finally {
      finishAction();
    }
  }

  async function confirmDestructiveAction() {
    if (confirmation === "reset") {
      const didReset = await runAction(
        "reset",
        controller.resetLearningProgress,
        "Learning progress reset.",
      );
      if (didReset) {
        setConfirmation(null);
      }
      return;
    }

    if (confirmation === "clear") {
      const didClear = await runAction(
        "clear",
        controller.clearAll,
        "This device was cleared and default courses were reinstalled.",
      );
      if (didClear) {
        setConfirmation(null);
      }
    }
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setImportText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  return (
    <section className="settings-layout">
      <PersonalizationSettings
        isPreferenceSavePending={personalization.isPreferenceSavePending}
        isSpeechSupported={personalization.isSpeechSupported}
        onPreviewVoice={personalization.previewSpeechVoice}
        onFingerGuideModeChange={personalization.setFingerGuideMode}
        onRetryPreferenceSave={personalization.retryPreferenceSave}
        onSpeechVoiceChange={personalization.setSpeechVoice}
        onThemeChange={personalization.setTheme}
        preferenceSaveError={personalization.preferenceSaveError}
        preferences={personalization.preferences}
        speechPreviewStatus={personalization.speechPreviewStatus}
        speechVoices={personalization.speechVoices}
      />

      <div className="settings-panel">
        <p className="eyebrow">Portable curriculum</p>
        <h3>Import and export complete courses</h3>
        <p className="muted-copy" id="course-bundle-description">A course bundle includes its learning paths, outlines, lessons, and sentence cards.</p>
        <label htmlFor="course-bundle-json">Course bundle JSON</label>
        <textarea
          aria-describedby="course-bundle-description"
          className="import-box"
          id="course-bundle-json"
          onChange={(event) => setImportText(event.target.value)}
          placeholder='Paste a v2 bundle like { "schemaVersion": 2, "categories": [...], "learningPaths": [...], "courses": [...], "cards": [...] }'
          value={importText}
        />
        <div className="practice-actions">
          <label className="secondary-button file-button">
            <Upload size={18} />
            Load file
            <input accept="application/json,.json" onChange={handleFile} type="file" />
          </label>
          <button
            className="primary-button"
            disabled={!importText.trim() || pendingAction !== null}
            onClick={() => void importCatalog()}
            type="button"
          >
            <Upload size={18} />
            {pendingAction === "import" ? "Importing…" : "Import"}
          </button>
          <button
            className="secondary-button"
            disabled={!snapshot || pendingAction !== null}
            onClick={() => void exportCatalog()}
            type="button"
          >
            <Download size={18} />
            {pendingAction === "export" ? "Exporting…" : "Export"}
          </button>
        </div>
        <p aria-live="polite" className="settings-message" role="status">
          {message}
        </p>
      </div>

      <div className="settings-panel">
        <FullBackupControls
          exportError={backupExportError}
          exportPending={pendingAction === "backup-export"}
          onExport={() => void exportLocalBackup()}
          onRestore={async (backup) => {
            const summary = await controller.restoreFullBackup(backup);
            setBackupMessage(
              `Restored ${summary.counts.courses} courses, ${summary.counts.cards} cards, and ${summary.counts.practiceLogEntries} learning events.`,
            );
          }}
          validate={validateFullBackup}
        />
        <p aria-live="polite" className="settings-message" role="status">
          {backupMessage}
        </p>
      </div>

      <div className="settings-panel">
        <p className="eyebrow">Local browser data</p>
        <h3>Manage this device</h3>
        <p className="muted-copy">
          UtterLoop stores courses, review state, and attempts in IndexedDB on this browser. Nothing is uploaded.
        </p>
        <LocalDataControls
          confirmation={confirmation}
          error={confirmation ? message : null}
          onCancelConfirmation={() => setConfirmation(null)}
          onConfirm={() => void confirmDestructiveAction()}
          onRequestConfirmation={(action) => {
            setMessage(null);
            setConfirmation(action);
          }}
          onRestoreDefaults={() => void runAction(
            "restore",
            controller.restoreDefaultCourses,
            "Default courses restored.",
          )}
          pendingAction={pendingAction}
        />
      </div>

      <div className="settings-panel license-panel">
        <p className="eyebrow">Default content licenses</p>
        <h3>Open content, with sources kept visible</h3>
        <p className="muted-copy">
          UtterLoop's original courses are released under{" "}
          <a href="https://creativecommons.org/publicdomain/zero/1.0/" rel="noreferrer" target="_blank">CC0 1.0</a>.
          The VOA course uses VOA Learning English material identified as public domain and credits each source lesson.
        </p>
        <a href="https://learningenglish.voanews.com/p/6861.html" rel="noreferrer" target="_blank">
          Read VOA reuse guidance
        </a>
      </div>
    </section>
  );
}

function settingsActionLabel(action: SettingsAction): string {
  switch (action) {
    case "restore":
      return "Restoring default courses";
    case "reset":
      return "Resetting learning progress";
    case "clear":
      return "Clearing this device";
    case "import":
      return "Course import";
    case "export":
      return "Course export";
    case "backup-export":
      return "Full backup export";
  }
}

function downloadJson(value: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
