/**
 * The rules a sentence goes through before it becomes a clip. This file is the
 * single source of truth for the Worker and for the pre-render scripts in
 * scripts/audio/ (which import it), so a pre-rendered clip lands under exactly
 * the R2 key the Worker looks up.
 */

/** Polish Azure neural voices the Worker can synthesise with on a miss. */
export const VOICES = [
  "pl-PL-ZofiaNeural",
  "pl-PL-MarekNeural",
  "pl-PL-AgnieszkaNeural",
] as const;

export type Voice = (typeof VOICES)[number];

export const DEFAULT_VOICE: Voice = "pl-PL-ZofiaNeural";

export const MAX_TEXT_LENGTH = 300;

/** What Azure is asked for: 24 kHz, 48 kbit/s mono MP3. Other engines' clips are encoded to match. */
export const AZURE_OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
export const MP3_SAMPLE_RATE = 24000;
export const MP3_BITRATE = "48k";

/** Every clip is immutable: its name is the hash of what it says. */
export const AUDIO_CACHE_CONTROL = "public, max-age=31536000, immutable";

/** The Azure Neural TTS REST endpoint for a Speech resource's region. */
export function azureEndpoint(region: string): string {
  return `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
}

/**
 * Letters (ASCII, Latin-1 and Latin Extended-A, which covers every Polish
 * diacritic), digits, spaces and basic sentence punctuation. Anything else
 * (markup, emoji, other scripts) is refused before it can cost money.
 */
const ALLOWED_TEXT = /^[A-Za-zÀ-ÖØ-öø-ſ0-9 .,!?;:'"…\-–—„”“()]+$/;

/**
 * A voice label for clips pre-rendered by another engine (e.g.
 * `piper-pl-gosia`). It becomes a path segment in R2 and on disk, so only
 * letters, digits and dashes, at most 64 of them.
 */
export const VOICE_LABEL = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;

/** One canonical form per sentence, so equal sentences share one cache entry. */
export function normaliseText(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** An Azure voice: one the Worker can synthesise with. */
export function isVoice(voice: string): voice is Voice {
  return (VOICES as readonly string[]).includes(voice);
}

/** The well-formed labels in a comma-separated list (the Worker's `EXTRA_VOICES`). */
export function parseVoiceList(list: string | undefined): string[] {
  return (list ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter((v) => VOICE_LABEL.test(v));
}

/** Returns why the (normalised) text is refused, or null when it is fine. */
export function textProblem(text: string): string | null {
  if (!text) return "text is empty";
  if ([...text].length > MAX_TEXT_LENGTH) {
    return `text is longer than ${MAX_TEXT_LENGTH} characters`;
  }
  if (!ALLOWED_TEXT.test(text)) return "text contains characters that are not allowed";
  return null;
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * The SSML Azure reads. A drill sentence is read a little slower than
 * conversational speed, which the browser path does with `rate = 0.9`.
 */
export function ssml(text: string, voice: Voice): string {
  return (
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="pl-PL">' +
    `<voice name="${voice}"><prosody rate="-10%">${escapeXml(text)}</prosody></voice>` +
    "</speak>"
  );
}

/** Hex SHA-256 of voice + "\n" + (normalised) text. */
export async function audioHash(voice: string, text: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${voice}\n${text}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The R2 object name for a clip: `audio/<voice>/<hash>.mp3`. */
export function audioPath(voice: string, hash: string): string {
  return `audio/${voice}/${hash}.mp3`;
}

/** The R2 object name for a (normalised) sentence in a voice. */
export async function audioKey(voice: string, text: string): Promise<string> {
  return audioPath(voice, await audioHash(voice, text));
}
