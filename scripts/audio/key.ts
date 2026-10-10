/**
 * The app side of the audio key. Everything here comes from the Worker's own
 * rules (workers/tts/src/text.ts), so a clip rendered from the manifest lands
 * under exactly the R2 key the Worker looks up for the same sentence. No Node
 * imports, so the Worker's tests can import it too (workers/tts/test/keys.test.ts).
 */
import {
  DEFAULT_VOICE,
  VOICE_LABEL,
  audioHash,
  audioPath,
  normaliseText,
  textProblem,
} from "../../workers/tts/src/text";

export {
  AUDIO_CACHE_CONTROL,
  AZURE_OUTPUT_FORMAT,
  DEFAULT_VOICE,
  MP3_BITRATE,
  MP3_SAMPLE_RATE,
  VOICES,
  azureEndpoint,
  isVoice,
  ssml,
} from "../../workers/tts/src/text";
export { audioHash, audioPath, normaliseText, textProblem };

/** One line of audio/manifest.jsonl. `key` is the hash; the R2 object is `audio/<voice>/<key>.mp3`. */
export type ManifestEntry = { key: string; voice: string; text: string };

/** The voice the app asks for: `NEXT_PUBLIC_TTS_VOICE`, else the Worker's default. */
export function appVoice(env: Record<string, string | undefined>): string {
  return env.NEXT_PUBLIC_TTS_VOICE || DEFAULT_VOICE;
}

export function checkVoice(voice: string): string {
  if (!VOICE_LABEL.test(voice)) {
    throw new Error(`bad voice label "${voice}": letters, digits and dashes only, at most 64`);
  }
  return voice;
}

/**
 * What the Worker would store for a sentence the client speaks, or null when
 * the Worker refuses the text (it would answer 400 and the app would use the
 * browser voice anyway).
 */
export async function manifestEntry(voice: string, spoken: string): Promise<ManifestEntry | null> {
  const text = normaliseText(spoken);
  if (textProblem(text)) return null;
  return { key: await audioHash(voice, text), voice, text };
}

/** Where a rendered clip lives on disk: `<outDir>/<voice>/<hash>.mp3`. */
export function localClip(outDir: string, voice: string, key: string): string {
  return `${outDir}/${voice}/${key}.mp3`;
}
