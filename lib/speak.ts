"use client";

import { useSyncExternalStore } from "react";

/**
 * Reads a sentence aloud with the browser's Polish voice when the system has
 * one; otherwise the default voice still gets the pl-PL hint.
 */
function synth(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  return window.speechSynthesis;
}

/** Never subscribes — speech support cannot change during a session. */
const noSubscribe = () => () => {};

/**
 * False on the server so the button matches during hydration, then the real
 * answer once the client takes over.
 */
export function useSpeechAvailable(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => synth() !== null,
    () => false,
  );
}

/** Voices load asynchronously in most browsers, so look them up every time. */
function polishVoice(): SpeechSynthesisVoice | null {
  const voices = synth()?.getVoices() ?? [];
  return voices.find((v) => v.lang.toLowerCase().startsWith("pl")) ?? null;
}

export function speak(text: string): void {
  const engine = synth();
  if (!engine || !text.trim()) return;
  try {
    engine.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "pl-PL";
    utterance.rate = 0.9;
    const voice = polishVoice();
    if (voice) utterance.voice = voice;
    engine.speak(utterance);
  } catch {
    // speech is a nice-to-have; never break the drill over it
  }
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
  try {
    synth()?.cancel();
  } catch {
    // ignore
  }
}
