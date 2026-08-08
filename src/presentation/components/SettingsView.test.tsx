import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PersonalizationController } from "../hooks/usePersonalizationPreferences";
import type { TrainingController } from "../hooks/useTrainingController";
import { LocalDataControls, PersonalizationSettings, SettingsView } from "./SettingsView";

describe("PersonalizationSettings", () => {
  it("renders an accessible theme group and labeled pronunciation voice controls", () => {
    const html = renderToStaticMarkup(
      <PersonalizationSettings
        isPreferenceSavePending={false}
        isSpeechSupported
        onFingerGuideModeChange={vi.fn()}
        onRetryPreferenceSave={vi.fn()}
        onPreviewVoice={vi.fn()}
        onSpeechVoiceChange={vi.fn()}
        onThemeChange={vi.fn()}
        preferenceSaveError={null}
        preferences={{ fingerGuideMode: "auto", theme: "dark", speechVoiceUri: "en-gb-1" }}
        speechPreviewStatus="Voice preview finished."
        speechVoices={[
          { voiceURI: "en-us-1", name: "System English", lang: "en-US", default: true },
          { voiceURI: "en-gb-1", name: "Serena", lang: "en-GB", default: false },
        ]}
      />,
    );

    expect(html).toContain("Personalization");
    expect(html).toContain("<legend>Theme</legend>");
    expect(html.match(/name="theme-preference"/g)).toHaveLength(3);
    expect(html).toContain("<legend>Finger guide</legend>");
    expect(html.match(/name="finger-guide-preference"/g)).toHaveLength(4);
    expect(html.match(/checked=""/g)).toHaveLength(2);
    expect(html.match(/<input[^>]+checked=""[^>]*>/)?.[0]).toContain('value="dark"');
    expect(html).toContain('<label for="pronunciation-voice">Pronunciation voice</label>');
    expect(html).toMatch(/<select[^>]+id="pronunciation-voice"/);
    expect(html).toContain('<option value="">Automatic · system English voice</option>');
    expect(html).toContain('<option value="en-gb-1" selected="">Serena · en-GB</option>');
    expect(html).toContain("Preview voice");
    expect(html).toContain("Key sounds stay separate");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Voice preview finished.");
  });

  it("keeps an unavailable saved voice explicit so the user can clear it", () => {
    const html = renderToStaticMarkup(
      <PersonalizationSettings
        isPreferenceSavePending={false}
        isSpeechSupported
        onFingerGuideModeChange={vi.fn()}
        onRetryPreferenceSave={vi.fn()}
        onPreviewVoice={vi.fn()}
        onSpeechVoiceChange={vi.fn()}
        onThemeChange={vi.fn()}
        preferenceSaveError={null}
        preferences={{ fingerGuideMode: "compact", theme: "system", speechVoiceUri: "missing-voice" }}
        speechPreviewStatus={null}
        speechVoices={[]}
      />,
    );

    const unavailableOption = html.match(
      /<option[^>]+>Saved voice unavailable · choose Automatic to clear<\/option>/,
    )?.[0];
    expect(unavailableOption).toContain('value="missing-voice"');
    expect(unavailableOption).toContain('disabled=""');
    expect(unavailableOption).toContain('selected=""');
  });

  it("shows a failed preference save with an explicit retry action", () => {
    const html = renderToStaticMarkup(
      <PersonalizationSettings
        isPreferenceSavePending={false}
        isSpeechSupported
        onFingerGuideModeChange={vi.fn()}
        onPreviewVoice={vi.fn()}
        onRetryPreferenceSave={vi.fn()}
        onSpeechVoiceChange={vi.fn()}
        onThemeChange={vi.fn()}
        preferenceSaveError="Theme could not be saved. Your previous setting was restored."
        preferences={{ fingerGuideMode: "full", theme: "light", speechVoiceUri: null }}
        speechPreviewStatus={null}
        speechVoices={[]}
      />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("Theme could not be saved. Your previous setting was restored.");
    expect(html).toMatch(/<button[^>]*>[^<]*Retry[^<]*<\/button>/);
  });

  it("locks preference-changing controls while a save is pending", () => {
    const html = renderToStaticMarkup(
      <PersonalizationSettings
        isPreferenceSavePending
        isSpeechSupported
        onFingerGuideModeChange={vi.fn()}
        onPreviewVoice={vi.fn()}
        onRetryPreferenceSave={vi.fn()}
        onSpeechVoiceChange={vi.fn()}
        onThemeChange={vi.fn()}
        preferenceSaveError={null}
        preferences={{ fingerGuideMode: "off", theme: "dark", speechVoiceUri: null }}
        speechPreviewStatus={null}
        speechVoices={[]}
      />,
    );

    const themeInputs = html.match(/<input[^>]*type="radio"[^>]*>/g);

    expect(html).toMatch(/<section[^>]+aria-busy="true"/);
    expect(html).toContain("Saving preferences…");
    expect(themeInputs).toHaveLength(7);
    expect(themeInputs?.every((input) => input.includes('disabled=""'))).toBe(true);
    expect(html.match(/<select[^>]*>/)?.[0]).toContain('disabled=""');
  });
});

describe("SettingsView", () => {
  it("labels pasted bundle input and reserves a live status message", () => {
    const html = renderToStaticMarkup(
      <SettingsView controller={trainingController()} personalization={personalizationController()} />,
    );

    expect(html).toContain('<label for="course-bundle-json">Course bundle JSON</label>');
    expect(html).toMatch(/<textarea[^>]+id="course-bundle-json"/);
    expect(html).toMatch(/<p[^>]+aria-live="polite"[^>]+role="status"/);
  });

  it("shows an explicit destructive confirmation and locks controls while it runs", () => {
    const html = renderToStaticMarkup(
      <LocalDataControls
        confirmation="clear"
        onCancelConfirmation={vi.fn()}
        onConfirm={vi.fn()}
        onRequestConfirmation={vi.fn()}
        onRestoreDefaults={vi.fn()}
        pendingAction="clear"
      />,
    );

    expect(html).toContain("Clear this device?");
    expect(html).toContain("courses, learning progress, attempts, Vocabulary, preferences, and the active Practice draft");
    expect(html).toContain("Default courses and device defaults will be reinstalled");
    expect(html).toContain("Clearing…");
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-busy="true"');
    expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(4);
  });
});

function trainingController(): TrainingController {
  return {
    snapshot: null,
    status: "ready",
    error: null,
    refresh: vi.fn(),
    retryStartup: vi.fn(),
    submitAttempt: vi.fn(),
    submitPracticeTurn: vi.fn(),
    completeFirstExposure: vi.fn(),
    setReviewLearningStatus: vi.fn(),
    setVocabularyStatus: vi.fn(),
    skipPracticeCard: vi.fn(),
    revealPracticeAnswer: vi.fn(),
    recordPracticeSupport: vi.fn(),
    previewAttempt: vi.fn(),
    exportCourseBundle: vi.fn(),
    importCourseBundle: vi.fn(),
    restoreDefaultCourses: vi.fn(),
    resetLearningProgress: vi.fn(),
    clearAll: vi.fn(),
    updateAppPreferences: vi.fn(),
    exportFullBackup: vi.fn(),
    restoreFullBackup: vi.fn(),
    getPracticeSessionCheckpoint: vi.fn(),
    savePracticeSessionCheckpoint: vi.fn(),
    deletePracticeSessionCheckpoint: vi.fn(),
    getActivePracticeSession: vi.fn(),
    openPracticeSession: vi.fn(),
    commitPracticeSessionCheckpoint: vi.fn(),
    commitPracticeSessionTerminal: vi.fn(),
  };
}

function personalizationController(): PersonalizationController {
  return {
    isPreferenceSavePending: false,
    isSpeechSupported: false,
    preferenceSaveError: null,
    preferences: { fingerGuideMode: "auto", theme: "system", speechVoiceUri: null },
    previewSpeechVoice: vi.fn(),
    retryPreferenceSave: vi.fn(),
    setFingerGuideMode: vi.fn(),
    setSpeechVoice: vi.fn(),
    setTheme: vi.fn(),
    speechPreviewStatus: null,
    speechVoices: [],
    stopSpeechPreview: vi.fn(),
  };
}
