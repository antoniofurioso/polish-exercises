/**
 * Chooses between the natural-voice Worker (`NEXT_PUBLIC_TTS_URL`) and the
 * browser's speech synthesis. Everything browser-specific comes in through
 * `SpeakerEnv`, so the selection and fallback rules run in plain Node tests.
 */
import { ttsSrc } from "./ttsUrl";

/** The parts of HTMLAudioElement the speaker drives. */
export interface AudioLike {
  src: string;
  crossOrigin: string | null;
  onerror: ((ev: never) => unknown) | null;
  play(): Promise<void>;
  pause(): void;
}

export interface SpeakerEnv {
  /** Base URL of the TTS Worker; undefined/empty means browser speech only. */
  ttsUrl: string | undefined;
  /**
   * The voice to ask the Worker for (`NEXT_PUBLIC_TTS_VOICE`): an Azure voice
   * or the label of a pre-rendered one. Unset means the Worker's default.
   */
  ttsVoice?: string;
  /** The browser's speech engine, or null where there is none. */
  synth(): SpeechSynthesis | null;
  /** A fresh audio element, or null where there is no Audio. */
  createAudio(): AudioLike | null;
  /** Speaks one sentence through `synth()` (voice, language and rate). */
  synthSpeak(engine: SpeechSynthesis, text: string): void;
  /** False when the browser knows it is offline. */
  online(): boolean;
}

export interface Speaker {
  speak(text: string): void;
  stop(): void;
  available(): boolean;
}

export { ttsSrc };

export function createSpeaker(env: SpeakerEnv): Speaker {
  let audio: AudioLike | null = null;
  /** Bumped on every speak/stop, so late errors from an old clip are ignored. */
  let generation = 0;

  /** One element for the whole session; created on first use. */
  function player(): AudioLike | null {
    if (!audio) {
      audio = env.createAudio();
      // CORS mode, so the request carries Origin for the Worker's allow-list
      if (audio) audio.crossOrigin = "anonymous";
    }
    return audio;
  }

  function speakWithSynth(text: string): void {
    const engine = env.synth();
    if (!engine) return;
    try {
      engine.cancel();
      env.synthSpeak(engine, text);
    } catch {
      // speech is a nice-to-have; never break the drill over it
    }
  }

  function stop(): void {
    generation++;
    try {
      audio?.pause();
    } catch {
      // ignore
    }
    try {
      env.synth()?.cancel();
    } catch {
      // ignore
    }
  }

  function speak(text: string): void {
    if (!text.trim()) return;
    stop();
    const el = env.ttsUrl && env.online() ? player() : null;
    if (!el || !env.ttsUrl) {
      speakWithSynth(text);
      return;
    }
    const mine = generation;
    const fallBack = () => {
      if (mine !== generation) return; // stopped or replaced meanwhile
      generation++; // fall back at most once per sentence
      speakWithSynth(text);
    };
    try {
      // a network error, a 4xx/5xx or an undecodable body all land here
      el.onerror = fallBack;
      el.src = ttsSrc(env.ttsUrl, text, env.ttsVoice);
      // rejects on autoplay refusal too; an abort from stop() is ignored above
      el.play().catch(fallBack);
    } catch {
      fallBack();
    }
  }

  function available(): boolean {
    return env.synth() !== null || (!!env.ttsUrl && player() !== null);
  }

  return { speak, stop, available };
}
