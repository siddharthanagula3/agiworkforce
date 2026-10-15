/**
 * The snippet a reader is shown for a source, never the provider's own token.
 *
 * A native search result carries `encrypted_content`: an opaque value the
 * provider needs back to continue the turn, which the wire reuses as the
 * snippet field. Shown as-is it reads as gibberish on a source card. The raw
 * block stays in the provider transcript; only what is displayed, receipted or
 * persisted for display goes through here.
 */

const MIN_ENCODED_RUN_CHARS = 64;
const ENCODED_RUN = /[A-Za-z0-9+/=_-]+/g;
const CONTROL_CHARACTERS = /[^\P{Cc}\t\n\r]/gu;
const SEPARATOR_CHARACTERS = /[-_]/g;
const MAX_SEPARATOR_SHARE = 0.05;
const MIN_OPAQUE_SHARE = 0.5;

function isEncodedRun(run: string): boolean {
  if (run.length < MIN_ENCODED_RUN_CHARS) return false;
  if (!/[A-Z]/.test(run) || !/[a-z]/.test(run) || !/[0-9]/.test(run)) return false;
  const separators = run.match(SEPARATOR_CHARACTERS)?.length ?? 0;
  return separators / run.length < MAX_SEPARATOR_SHARE;
}

function isOpaque(text: string): boolean {
  const visible = text.replace(/\s+/g, '').length;
  if (visible === 0) return false;
  let encoded = 0;
  for (const [run] of text.matchAll(ENCODED_RUN)) {
    if (isEncodedRun(run)) encoded += run.length;
  }
  return encoded / visible >= MIN_OPAQUE_SHARE;
}

/** Readable text, or `''` when the value carries none. */
export function displaySourceSnippet(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = value.replace(CONTROL_CHARACTERS, '').trim();
  return text && !isOpaque(text) ? text : '';
}
