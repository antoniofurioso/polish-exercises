"use client";

import type { Verdict } from "./grade";

/**
 * Short synthesised cues — no audio files to ship, and nothing plays until the
 * learner has interacted with the page (checking an answer is that gesture).
 */
type Note = { freq: number; at: number; length: number; type?: OscillatorType; glide?: number };

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context ??= new Ctor();
    if (context.state === "suspended") void context.resume();
    return context;
  } catch {
    return null;
  }
}

function play(notes: Note[], peak = 0.1): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  for (const note of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = note.type ?? "sine";
    osc.frequency.setValueAtTime(note.freq, now + note.at);
    if (note.glide) {
      osc.frequency.exponentialRampToValueAtTime(note.glide, now + note.at + note.length);
    }
    // ramp in and out so the note does not click
    gain.gain.setValueAtTime(0.0001, now + note.at);
    gain.gain.exponentialRampToValueAtTime(peak, now + note.at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + note.at + note.length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + note.at);
    osc.stop(now + note.at + note.length + 0.02);
  }
}

const CUES: Record<Verdict, Note[]> = {
  // rising two-note blip
  correct: [
    { freq: 880, at: 0, length: 0.09 },
    { freq: 1318.5, at: 0.08, length: 0.14 },
  ],
  // two flat taps — close, but not there
  diacritics: [
    { freq: 740, at: 0, length: 0.07, type: "triangle" },
    { freq: 740, at: 0.11, length: 0.09, type: "triangle" },
  ],
  // low buzz sliding down
  wrong: [{ freq: 220, at: 0, length: 0.22, type: "sawtooth", glide: 150 }],
};

export function playVerdict(verdict: Verdict): void {
  play(CUES[verdict], verdict === "wrong" ? 0.06 : 0.1);
}

/** Little arpeggio when the session is over. */
export function playFinish(): void {
  play(
    [523.25, 659.25, 783.99, 1046.5].map((freq, i) => ({ freq, at: i * 0.085, length: 0.16 })),
    0.09,
  );
}
