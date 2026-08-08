import { useCallback, useEffect, useRef, useState } from "react";
import type { PracticeKeyCommand } from "../keyboard/resolvePracticeKey";
import { KeystrokeAudio, type KeystrokeSound } from "../audio/KeystrokeAudio";

const soundPreferenceKey = "utterloop:key-sound";

interface KeyFeedbackOptions {
  isMuted?: boolean;
  onMutedChange?(isMuted: boolean): Promise<unknown> | unknown;
}

export function useKeyFeedback(options: KeyFeedbackOptions = {}) {
  const [isSoundEnabled, setIsSoundEnabled] = useState(() =>
    options.isMuted === undefined ? readSoundPreference() : !options.isMuted);
  const [soundPreferenceError, setSoundPreferenceError] = useState<string | null>(null);
  const [keyPulse, setKeyPulse] = useState(0);
  const playerRef = useRef<KeystrokeAudio | null>(null);
  const isSoundSupported = KeystrokeAudio.isSupported();

  const getPlayer = useCallback(() => {
    playerRef.current ??= new KeystrokeAudio();
    return playerRef.current;
  }, []);

  useEffect(() => () => playerRef.current?.close(), []);

  useEffect(() => {
    if (options.isMuted !== undefined) {
      setIsSoundEnabled(!options.isMuted);
    }
  }, [options.isMuted]);

  const triggerKeyFeedback = useCallback(
    (command: PracticeKeyCommand) => {
      setKeyPulse((current) => current + 1);

      if (isSoundEnabled && isSoundSupported) {
        void getPlayer().play(soundForPracticeCommand(command));
      }
    },
    [getPlayer, isSoundEnabled, isSoundSupported],
  );

  const toggleKeySound = useCallback(() => {
    const nextValue = !isSoundEnabled;
    setIsSoundEnabled(nextValue);
    setSoundPreferenceError(null);
    if (options.onMutedChange) {
      void Promise.resolve(options.onMutedChange(!nextValue)).catch((caught: unknown) => {
        setIsSoundEnabled(!nextValue);
        setSoundPreferenceError(caught instanceof Error
          ? `Key sound preference could not be saved: ${caught.message}`
          : "Key sound preference could not be saved.");
      });
    } else {
      writeSoundPreference(nextValue);
    }
    setKeyPulse((current) => current + 1);

    if (nextValue && isSoundSupported) {
      void getPlayer().play("action");
    }
  }, [getPlayer, isSoundEnabled, isSoundSupported, options]);

  return {
    isSoundEnabled,
    isSoundSupported,
    keyPulse,
    soundPreferenceError,
    toggleKeySound,
    triggerKeyFeedback,
  };
}

export function soundForPracticeCommand(command: PracticeKeyCommand): KeystrokeSound {
  switch (command.type) {
    case "append":
      return command.value === " " ? "space" : "key";
    case "delete":
    case "clear":
    case "retry":
      return "delete";
    case "submit":
    case "incomplete":
    case "next":
    case "mark-mastered":
    case "toggle-vocabulary":
    case "play-audio":
    case "toggle-answer":
    case "resume-editing":
    case "previous":
    case "skip":
    case "toggle-pause":
      return "action";
  }
}

function readSoundPreference(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    return window.localStorage.getItem(soundPreferenceKey) !== "off";
  } catch {
    return true;
  }
}

function writeSoundPreference(isEnabled: boolean): void {
  try {
    window.localStorage.setItem(soundPreferenceKey, isEnabled ? "on" : "off");
  } catch {
    // The preference remains active for this session when storage is unavailable.
  }
}
