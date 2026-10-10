"use client";

import { useSyncExternalStore } from "react";
import { createSpeaker } from "./speaker";

/**
 * Reads a sentence aloud. With `NEXT_PUBLIC_TTS_URL` set (inlined at build
 * time) it plays natural audio from the TTS Worker (workers/tts) in the voice
 * `NEXT_PUBLIC_TTS_VOICE` (default pl-PL-ZofiaNeural) and falls back to the
 * browser's speech synthesis on any error (a 404 for a sentence that was never
 * pre-rendered included) or when offline;
 * without it, only the browser's speech synthesis is used.
 */
function synth(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  return window.speechSynthesis;
}

/** Voices load asynchronously in most browsers, so look them up every time. */
function polishVoice(engine: SpeechSynthesis): SpeechSynthesisVoice | null {
  const voices = engine.getVoices() ?? [];
  return voices.find((v) => v.lang.toLowerCase().startsWith("pl")) ?? null;
}

/** The browser's Polish voice when the system has one; otherwise the default voice still gets the pl-PL hint. */
function synthSpeak(engine: SpeechSynthesis, text: string): void {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "pl-PL";
  utterance.rate = 0.9;
  const voice = polishVoice(engine);
  if (voice) utterance.voice = voice;
  engine.speak(utterance);
}

const speaker = createSpeaker({
  ttsUrl: process.env.NEXT_PUBLIC_TTS_URL,
  // unset: the Worker's default voice, pl-PL-ZofiaNeural
  ttsVoice: process.env.NEXT_PUBLIC_TTS_VOICE || undefined,
  synth,
  createAudio: () =>
    typeof window === "undefined" || typeof Audio === "undefined" ? null : new Audio(),
  synthSpeak,
  online: () => typeof navigator === "undefined" || navigator.onLine !== false,
});

/** Never subscribes — speech support cannot change during a session. */
const noSubscribe = () => () => {};

/**
 * False on the server so the button matches during hydration, then the real
 * answer once the client takes over.
 */
export function useSpeechAvailable(): boolean {
  return useSyncExternalStore(noSubscribe, speaker.available, () => false);
}

export function speak(text: string): void {
  speaker.speak(text);
}

/** Turns "Nie mam ___." into something a voice can read: "Nie mam …". */
export function spokenGap(sentence: string): string {
  return sentence
    .replace(/\s*___\s*/, " … ")
    .replace(/…\s*([.,!?])/g, "…")
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function stopSpeaking(): void {
  speaker.stop();
}
