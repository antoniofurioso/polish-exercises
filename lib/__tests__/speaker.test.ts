import { describe, expect, it, vi } from "vitest";
import { type AudioLike, type SpeakerEnv, createSpeaker, ttsSrc } from "../speaker";

class FakeAudio implements AudioLike {
  src = "";
  crossOrigin: string | null = null;
  onerror: ((ev: never) => unknown) | null = null;
  playResult: Promise<void> = Promise.resolve();
  play = vi.fn(() => this.playResult);
  pause = vi.fn();
  /** What the browser does on a network error, a 4xx/5xx or a bad body. */
  fail() {
    (this.onerror as (() => void) | null)?.();
  }
}

function fakeSynth() {
  return { cancel: vi.fn(), speak: vi.fn(), getVoices: () => [] } as unknown as SpeechSynthesis & {
    cancel: ReturnType<typeof vi.fn>;
  };
}

function setup(over: Partial<SpeakerEnv> = {}) {
  const engine = fakeSynth();
  const audios: FakeAudio[] = [];
  const synthSpeak = vi.fn();
  const env: SpeakerEnv = {
    ttsUrl: "https://tts.example/",
    synth: () => engine,
    createAudio: () => {
      const a = new FakeAudio();
      audios.push(a);
      return a;
    },
    synthSpeak,
    online: () => true,
    ...over,
  };
  return { speaker: createSpeaker(env), engine, audios, synthSpeak };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("ttsSrc", () => {
  it("builds the Worker URL with collapsed spacing and encoded text", () => {
    expect(ttsSrc("https://tts.example/", "  Nie  mam kota? ")).toBe(
      "https://tts.example/tts?text=Nie%20mam%20kota%3F",
    );
    expect(ttsSrc("https://tts.example", "Żółw")).toBe(
      "https://tts.example/tts?text=%C5%BB%C3%B3%C5%82w",
    );
    expect(ttsSrc("https://tts.example", "Kot.", "pl-PL-MarekNeural")).toBe(
      "https://tts.example/tts?text=Kot.&voice=pl-PL-MarekNeural",
    );
  });
});

describe("speaker without a TTS URL", () => {
  it("uses speech synthesis only and never creates audio", () => {
    const { speaker, synthSpeak, audios, engine } = setup({ ttsUrl: undefined });
    speaker.speak("Mam kota.");
    expect(synthSpeak).toHaveBeenCalledWith(engine, "Mam kota.");
    expect(audios).toHaveLength(0);
    expect(speaker.available()).toBe(true);
  });

  it("is unavailable without speech synthesis", () => {
    const { speaker, synthSpeak } = setup({ ttsUrl: "", synth: () => null });
    expect(speaker.available()).toBe(false);
    speaker.speak("Mam kota.");
    expect(synthSpeak).not.toHaveBeenCalled();
  });

  it("ignores blank text", () => {
    const { speaker, synthSpeak } = setup({ ttsUrl: undefined });
    speaker.speak("   ");
    expect(synthSpeak).not.toHaveBeenCalled();
  });
});

describe("speaker with a TTS URL", () => {
  it("plays the Worker's audio through one reused element", async () => {
    const { speaker, audios, synthSpeak } = setup();
    speaker.speak("Mam kota.");
    speaker.speak("Nie mam kota.");
    await flush();
    expect(audios).toHaveLength(1);
    expect(audios[0].crossOrigin).toBe("anonymous");
    expect(audios[0].src).toBe("https://tts.example/tts?text=Nie%20mam%20kota.");
    expect(audios[0].play).toHaveBeenCalledTimes(2);
    expect(audios[0].pause).toHaveBeenCalled(); // the first clip was stopped
    expect(synthSpeak).not.toHaveBeenCalled();
  });

  it("asks for NEXT_PUBLIC_TTS_VOICE when one is set", () => {
    const { speaker, audios } = setup({ ttsVoice: "piper-pl-gosia" });
    speaker.speak("Mam kota.");
    expect(audios[0].src).toBe("https://tts.example/tts?text=Mam%20kota.&voice=piper-pl-gosia");
  });

  it("falls back on a 404 for a sentence that was never pre-rendered", () => {
    const { speaker, audios, synthSpeak } = setup({ ttsVoice: "piper-pl-gosia" });
    speaker.speak("Mam kota.");
    audios[0].fail(); // the element's error event: the Worker answered 404
    expect(synthSpeak).toHaveBeenCalledTimes(1);
  });

  it("is available with audio even without speech synthesis", () => {
    expect(setup({ synth: () => null }).speaker.available()).toBe(true);
  });

  it("falls back to speech synthesis on a load error (network, 4xx/5xx, decode)", () => {
    const { speaker, audios, synthSpeak, engine } = setup();
    speaker.speak("Mam kota.");
    audios[0].fail();
    expect(synthSpeak).toHaveBeenCalledTimes(1);
    expect(synthSpeak).toHaveBeenCalledWith(engine, "Mam kota.");
    audios[0].fail(); // a second error event does not speak twice
    expect(synthSpeak).toHaveBeenCalledTimes(1);
  });

  it("falls back when play() is refused (autoplay)", async () => {
    const { speaker, audios, synthSpeak } = setup();
    speaker.speak("Mam kota.");
    // the element exists now; make its next play() reject
    audios[0].playResult = Promise.reject(new DOMException("blocked", "NotAllowedError"));
    speaker.speak("Mam psa.");
    await flush();
    expect(synthSpeak).toHaveBeenCalledTimes(1);
    expect(synthSpeak.mock.calls[0][1]).toBe("Mam psa.");
  });

  it("goes straight to speech synthesis when offline", () => {
    const { speaker, audios, synthSpeak } = setup({ online: () => false });
    speaker.speak("Mam kota.");
    expect(audios).toHaveLength(0);
    expect(synthSpeak).toHaveBeenCalledTimes(1);
  });

  it("does not fall back after stop() or a newer sentence", async () => {
    const { speaker, audios, synthSpeak } = setup();
    speaker.speak("Mam kota.");
    const first = audios[0];
    // play() rejects with AbortError when pause() interrupts it
    first.playResult = Promise.reject(new DOMException("aborted", "AbortError"));
    speaker.speak("Mam psa.");
    speaker.stop();
    first.fail();
    await flush();
    expect(synthSpeak).not.toHaveBeenCalled();
  });

  it("stop() stops both the audio and speech synthesis", () => {
    const { speaker, audios, engine } = setup();
    speaker.speak("Mam kota.");
    engine.cancel.mockClear();
    speaker.stop();
    expect(audios[0].pause).toHaveBeenCalled();
    expect(engine.cancel).toHaveBeenCalled();
  });
});
