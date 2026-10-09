/** Polish neural voices the Worker will synthesise with. */
export const VOICES = [
  "pl-PL-ZofiaNeural",
  "pl-PL-MarekNeural",
  "pl-PL-AgnieszkaNeural",
] as const;

export type Voice = (typeof VOICES)[number];

export const DEFAULT_VOICE: Voice = "pl-PL-ZofiaNeural";

export const MAX_TEXT_LENGTH = 300;

/**
 * Letters (ASCII, Latin-1 and Latin Extended-A, which covers every Polish
 * diacritic), digits, spaces and basic sentence punctuation. Anything else
 * (markup, emoji, other scripts) is refused before it can cost money.
 */
const ALLOWED_TEXT = /^[A-Za-zÀ-ÖØ-öø-ſ0-9 .,!?;:'"…\-–—„”“()]+$/;

/** One canonical form per sentence, so equal sentences share one cache entry. */
export function normaliseText(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function isVoice(voice: string): voice is Voice {
  return (VOICES as readonly string[]).includes(voice);
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

/** Hex SHA-256 of voice + "\n" + text: the R2 object name. */
export async function audioKey(voice: Voice, text: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${voice}\n${text}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `audio/${voice}/${hex}.mp3`;
}
