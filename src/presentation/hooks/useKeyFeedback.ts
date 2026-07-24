import { useCallback, useEffect, useRef, useState } from "react";
import type { PracticeKeyCommand } from "../keyboard/resolvePracticeKey";
import { KeystrokeAudio, type KeystrokeSound } from "../audio/KeystrokeAudio";

const soundPreferenceKey = "utterloop:key-sound";

export function useKeyFeedback() {
  const [isSoundEnabled, setIsSoundEnabled] = useState(readSoundPreference);
  const [keyPulse, setKeyPulse] = useState(0);
  const playerRef = useRef<KeystrokeAudio | null>(null);
  const isSoundSupported = KeystrokeAudio.isSupported();

  const getPlayer = useCallback(() => {
    playerRef.current ??= new KeystrokeAudio();
    return playerRef.current;
  }, []);

  useEffect(() => () => playerRef.current?.close(), []);

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
    writeSoundPreference(nextValue);
    setKeyPulse((current) => current + 1);

    if (nextValue && isSoundSupported) {
      void getPlayer().play("action");
    }
  }, [getPlayer, isSoundEnabled, isSoundSupported]);

  return {
    isSoundEnabled,
    isSoundSupported,
    keyPulse,
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
