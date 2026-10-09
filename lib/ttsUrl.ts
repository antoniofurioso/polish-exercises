/**
 * The TTS Worker URL for a sentence. Kept free of browser types so the
 * Worker's tests can check that this URL hashes to the same R2 key as the
 * pre-render manifest (workers/tts/test/keys.test.ts).
 */

/**
 * Same spacing rules as the Worker's cache key. `voice` is left out when
 * unset, so the Worker uses its default (pl-PL-ZofiaNeural).
 */
export function ttsSrc(base: string, text: string, voice?: string): string {
  const sentence = text.replace(/\s+/g, " ").trim();
  const url = `${base.replace(/\/+$/, "")}/tts?text=${encodeURIComponent(sentence)}`;
  return voice ? `${url}&voice=${encodeURIComponent(voice)}` : url;
}
