import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_PERSONALIZATION_PREFERENCES,
  isFingerGuideMode,
  listEnglishSpeechVoices,
  readPersonalizationPreferences,
  resolveEffectiveTheme,
  resolvePreferredSpeechVoice,
  type PersonalizationPreferences,
  type FingerGuideMode,
  type ThemePreference,
} from "../preferences/personalizationPreferences";
import type { AppPreferences } from "../../domain/backup/UtterLoopFullBackup";

const themeMediaQuery = "(prefers-color-scheme: dark)";
const previewSentence = "Small steps make strong sentences.";

export type PersonalizationPreferenceUpdate = Partial<PersonalizationPreferences>;

export interface PersonalizationSaveState {
  error: string | null;
  pendingUpdate: PersonalizationPreferenceUpdate | null;
  persistedPreferences: PersonalizationPreferences;
  preferences: PersonalizationPreferences;
  retryUpdate: PersonalizationPreferenceUpdate | null;
}

export type PersonalizationSaveEvent =
  | { type: "save-started"; update: PersonalizationPreferenceUpdate }
  | { type: "save-succeeded"; preferences: PersonalizationPreferences }
  | { type: "durable-preferences-received"; preferences: PersonalizationPreferences }
  | { type: "save-failed"; error: string };

export function createPersonalizationSaveState(
  preferences: PersonalizationPreferences,
): PersonalizationSaveState {
  return {
    error: null,
    pendingUpdate: null,
    persistedPreferences: preferences,
    preferences,
    retryUpdate: null,
  };
}

export function transitionPersonalizationSaveState(
  state: PersonalizationSaveState,
  event: PersonalizationSaveEvent,
): PersonalizationSaveState {
  if (event.type === "save-started") {
    return {
      ...state,
      error: null,
      pendingUpdate: event.update,
      preferences: { ...state.persistedPreferences, ...event.update },
      retryUpdate: null,
    };
  }

  if (event.type === "durable-preferences-received") {
    return {
      ...state,
      persistedPreferences: event.preferences,
      preferences: state.pendingUpdate
        ? { ...event.preferences, ...state.pendingUpdate }
        : event.preferences,
    };
  }

  if (event.type === "save-succeeded") {
    return {
      error: null,
      pendingUpdate: null,
      persistedPreferences: event.preferences,
      preferences: event.preferences,
      retryUpdate: null,
    };
  }

  return {
    ...state,
    error: event.error,
    pendingUpdate: null,
    preferences: state.persistedPreferences,
    retryUpdate: state.pendingUpdate,
  };
}

export interface PersonalizationController {
  isPreferenceSavePending: boolean;
  isSpeechSupported: boolean;
  preferenceSaveError: string | null;
  preferences: PersonalizationPreferences;
  previewSpeechVoice(): void;
  retryPreferenceSave(): void;
  setFingerGuideMode(mode: FingerGuideMode): void;
  setSpeechVoice(voiceUri: string | null): void;
  setTheme(theme: ThemePreference): void;
  speechPreviewStatus: string | null;
  speechVoices: readonly SpeechSynthesisVoice[];
  stopSpeechPreview(): void;
}

export function initializePersonalizationTheme(): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  applyTheme(
    readBrowserPersonalizationPreferences().theme,
    window.matchMedia?.(themeMediaQuery).matches ?? false,
  );
}

export function usePersonalizationPreferences(
  durablePreferences: Pick<AppPreferences, "fingerGuideMode" | "theme" | "speechVoiceUri"> | null = null,
  persistPreferences?: (patch: Partial<AppPreferences>) => Promise<unknown> | unknown,
): PersonalizationController {
  const [saveState, setSaveState] = useState<PersonalizationSaveState>(() =>
    createPersonalizationSaveState(durablePreferences ?? readBrowserPersonalizationPreferences()));
  const saveStateRef = useRef(saveState);
  const [speechVoices, setSpeechVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speechPreviewStatus, setSpeechPreviewStatus] = useState<string | null>(null);
  const previewRunRef = useRef(0);
  const previewIsActiveRef = useRef(false);
  const isSpeechSupported = supportsSpeechSynthesis();
  const preferences = saveState.preferences;

  const applySaveEvent = useCallback((event: PersonalizationSaveEvent) => {
    const nextState = transitionPersonalizationSaveState(saveStateRef.current, event);
    saveStateRef.current = nextState;
    setSaveState(nextState);
    return nextState;
  }, []);

  useEffect(() => {
    if (durablePreferences) {
      applySaveEvent({
        type: "durable-preferences-received",
        preferences: {
          fingerGuideMode: isFingerGuideMode(durablePreferences.fingerGuideMode)
            ? durablePreferences.fingerGuideMode
            : "auto",
          theme: durablePreferences.theme,
          speechVoiceUri: durablePreferences.speechVoiceUri,
        },
      });
    }
  }, [
    applySaveEvent,
    durablePreferences?.fingerGuideMode,
    durablePreferences?.speechVoiceUri,
    durablePreferences?.theme,
  ]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(themeMediaQuery);
    const refreshTheme = () => applyTheme(preferences.theme, mediaQuery.matches);

    refreshTheme();

    if (preferences.theme !== "system") {
      return;
    }

    mediaQuery.addEventListener("change", refreshTheme);
    return () => mediaQuery.removeEventListener("change", refreshTheme);
  }, [preferences.theme]);

  useEffect(() => {
    if (!isSpeechSupported) {
      return;
    }

    const synthesis = window.speechSynthesis;
    const refreshVoices = () => setSpeechVoices(listEnglishSpeechVoices(synthesis.getVoices()));

    refreshVoices();
    synthesis.addEventListener("voiceschanged", refreshVoices);
    return () => synthesis.removeEventListener("voiceschanged", refreshVoices);
  }, [isSpeechSupported]);

  const updatePreferences = useCallback((update: PersonalizationPreferenceUpdate) => {
    if (saveStateRef.current.pendingUpdate) {
      return;
    }

    applySaveEvent({ type: "save-started", update });
    if (!persistPreferences) {
      applySaveEvent({
        type: "save-succeeded",
        preferences: {
          ...saveStateRef.current.persistedPreferences,
          ...update,
        },
      });
      return;
    }

    void Promise.resolve()
      .then(() => persistPreferences(update))
      .then((result) => {
        applySaveEvent({
          type: "save-succeeded",
          preferences: resolvePersistedPersonalizationPreferences(
            result,
            { ...saveStateRef.current.persistedPreferences, ...update },
          ),
        });
      })
      .catch((caught: unknown) => {
        applySaveEvent({
          type: "save-failed",
          error: describePreferenceSaveFailure(update, caught),
        });
      });
  }, [applySaveEvent, persistPreferences]);

  const setTheme = useCallback(
    (theme: ThemePreference) => updatePreferences({ theme }),
    [updatePreferences],
  );

  const setFingerGuideMode = useCallback(
    (fingerGuideMode: FingerGuideMode) => updatePreferences({ fingerGuideMode }),
    [updatePreferences],
  );

  const retryPreferenceSave = useCallback(() => {
    const retryUpdate = saveStateRef.current.retryUpdate;
    if (retryUpdate) {
      updatePreferences(retryUpdate);
    }
  }, [updatePreferences]);

  const stopSpeechPreview = useCallback(() => {
    previewRunRef.current += 1;

    if (previewIsActiveRef.current && supportsSpeechSynthesis()) {
      window.speechSynthesis.cancel();
    }

    previewIsActiveRef.current = false;
    setSpeechPreviewStatus(null);
  }, []);

  const setSpeechVoice = useCallback(
    (speechVoiceUri: string | null) => {
      stopSpeechPreview();
      updatePreferences({ speechVoiceUri });
    },
    [stopSpeechPreview, updatePreferences],
  );

  const previewSpeechVoice = useCallback(() => {
    if (!supportsSpeechSynthesis()) {
      setSpeechPreviewStatus("Pronunciation is not available in this browser.");
      return;
    }

    const synthesis = window.speechSynthesis;
    const voices = listEnglishSpeechVoices(synthesis.getVoices());
    const voice = resolvePreferredSpeechVoice(voices, preferences.speechVoiceUri);
    stopSpeechPreview();
    const previewRun = previewRunRef.current + 1;
    previewRunRef.current = previewRun;
    previewIsActiveRef.current = true;

    try {
      const utterance = new SpeechSynthesisUtterance(previewSentence);
      utterance.lang = voice?.lang ?? "en-US";
      utterance.rate = 0.92;

      if (voice) {
        utterance.voice = voice;
      }

      utterance.onstart = () => {
        if (previewRunRef.current === previewRun) {
          setSpeechPreviewStatus("Playing voice preview.");
        }
      };
      utterance.onend = () => {
        if (previewRunRef.current === previewRun) {
          previewIsActiveRef.current = false;
          setSpeechPreviewStatus("Voice preview finished.");
        }
      };
      utterance.onerror = () => {
        if (previewRunRef.current === previewRun) {
          previewIsActiveRef.current = false;
          setSpeechPreviewStatus("Voice preview could not be played.");
        }
      };

      setSpeechPreviewStatus("Starting voice preview.");
      synthesis.speak(utterance);
    } catch {
      previewIsActiveRef.current = false;
      setSpeechPreviewStatus("Voice preview could not be played.");
    }
  }, [preferences.speechVoiceUri, stopSpeechPreview]);

  return {
    isPreferenceSavePending: saveState.pendingUpdate !== null,
    isSpeechSupported,
    preferenceSaveError: saveState.error,
    preferences,
    previewSpeechVoice,
    retryPreferenceSave,
    setFingerGuideMode,
    setSpeechVoice,
    setTheme,
    speechPreviewStatus,
    speechVoices,
    stopSpeechPreview,
  };
}

function resolvePersistedPersonalizationPreferences(
  result: unknown,
  fallback: PersonalizationPreferences,
): PersonalizationPreferences {
  if (!result || typeof result !== "object") {
    return fallback;
  }

  const candidate = result as Partial<PersonalizationPreferences>;
  const hasValidTheme = candidate.theme === "system"
    || candidate.theme === "light"
    || candidate.theme === "dark";
  const hasValidVoice = candidate.speechVoiceUri === null
    || typeof candidate.speechVoiceUri === "string";
  const hasValidFingerGuideMode = isFingerGuideMode(candidate.fingerGuideMode);

  return hasValidTheme && hasValidVoice && hasValidFingerGuideMode
    ? {
        fingerGuideMode: candidate.fingerGuideMode!,
        theme: candidate.theme!,
        speechVoiceUri: candidate.speechVoiceUri!,
      }
    : fallback;
}

function describePreferenceSaveFailure(
  update: PersonalizationPreferenceUpdate,
  _caught: unknown,
): string {
  const preferenceName = update.fingerGuideMode !== undefined
    ? "Finger guide"
    : update.theme !== undefined
      ? "Theme"
      : "Pronunciation voice";
  return `${preferenceName} could not be saved. Your previous setting was restored.`;
}

function readBrowserPersonalizationPreferences(): PersonalizationPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_PERSONALIZATION_PREFERENCES;
  }

  try {
    return readPersonalizationPreferences(window.localStorage);
  } catch {
    return DEFAULT_PERSONALIZATION_PREFERENCES;
  }
}

function applyTheme(preference: ThemePreference, systemPrefersDark: boolean): void {
  const theme = resolveEffectiveTheme(preference, systemPrefersDark);
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function supportsSpeechSynthesis(): boolean {
  return typeof window !== "undefined"
    && "speechSynthesis" in window
    && typeof SpeechSynthesisUtterance !== "undefined";
}
