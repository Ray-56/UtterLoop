export type KeystrokeSound = "key" | "space" | "delete" | "action";

interface SoundProfile {
  duration: number;
  noiseFrequency: number;
  noiseGain: number;
  toneFrequency: number;
  toneGain: number;
}

const profiles: Record<KeystrokeSound, SoundProfile> = {
  key: {
    duration: 0.024,
    noiseFrequency: 1800,
    noiseGain: 0.022,
    toneFrequency: 480,
    toneGain: 0.006,
  },
  space: {
    duration: 0.042,
    noiseFrequency: 900,
    noiseGain: 0.034,
    toneFrequency: 170,
    toneGain: 0.014,
  },
  delete: {
    duration: 0.03,
    noiseFrequency: 1250,
    noiseGain: 0.026,
    toneFrequency: 240,
    toneGain: 0.01,
  },
  action: {
    duration: 0.05,
    noiseFrequency: 720,
    noiseGain: 0.03,
    toneFrequency: 130,
    toneGain: 0.018,
  },
};

type AudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

export class KeystrokeAudio {
  private context: AudioContext | null = null;

  static isSupported(): boolean {
    if (typeof window === "undefined") {
      return false;
    }

    return Boolean(window.AudioContext ?? (window as AudioWindow).webkitAudioContext);
  }

  async play(sound: KeystrokeSound): Promise<boolean> {
    try {
      const context = this.getContext();

      if (!context) {
        return false;
      }

      if (context.state === "suspended") {
        await context.resume();
      }

      if (context.state !== "running") {
        return false;
      }

      this.playProfile(context, profiles[sound]);
      return true;
    } catch {
      return false;
    }
  }

  close(): void {
    const context = this.context;
    this.context = null;

    if (context && context.state !== "closed") {
      void context.close();
    }
  }

  private getContext(): AudioContext | null {
    if (this.context?.state === "closed") {
      this.context = null;
    }

    if (this.context) {
      return this.context;
    }

    const AudioContextConstructor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;

    if (!AudioContextConstructor) {
      return null;
    }

    this.context = new AudioContextConstructor({ latencyHint: "interactive" });
    return this.context;
  }

  private playProfile(context: AudioContext, profile: SoundProfile): void {
    const startAt = context.currentTime;
    const endAt = startAt + profile.duration;
    const sampleCount = Math.max(1, Math.floor(context.sampleRate * profile.duration));
    const noiseBuffer = context.createBuffer(1, sampleCount, context.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);

    for (let index = 0; index < sampleCount; index += 1) {
      const envelope = 1 - index / sampleCount;
      noiseData[index] = (Math.random() * 2 - 1) * envelope;
    }

    const noise = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    noise.buffer = noiseBuffer;
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(profile.noiseFrequency, startAt);
    filter.Q.setValueAtTime(0.75, startAt);
    noiseGain.gain.setValueAtTime(profile.noiseGain, startAt);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, endAt);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(context.destination);

    const tone = context.createOscillator();
    const toneGain = context.createGain();
    tone.type = "triangle";
    tone.frequency.setValueAtTime(profile.toneFrequency, startAt);
    tone.frequency.exponentialRampToValueAtTime(Math.max(60, profile.toneFrequency * 0.55), endAt);
    toneGain.gain.setValueAtTime(profile.toneGain, startAt);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, endAt);
    tone.connect(toneGain);
    toneGain.connect(context.destination);

    noise.start(startAt);
    noise.stop(endAt);
    tone.start(startAt);
    tone.stop(endAt);
  }
}
