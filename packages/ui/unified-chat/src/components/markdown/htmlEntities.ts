import { HTML_NAMED_CHARACTER_REFERENCES } from './htmlNamedCharacterReferences';

const HTML_CHARACTER_REFERENCE = /&(#\d{1,7}|#[xX][\da-fA-F]{1,6}|[A-Za-z][A-Za-z\d]{1,31});/g;

const MAX_CODE_POINT = 0x10ffff;
const SURROGATE_START = 0xd800;
const SURROGATE_END = 0xdfff;

export function decodeCharacterReference(reference: string): string | null {
  if (reference.startsWith('#')) {
    const hex = reference[1] === 'x' || reference[1] === 'X';
    const digits = reference.slice(hex ? 2 : 1);
    if (!(hex ? /^[\da-fA-F]{1,6}$/ : /^\d{1,7}$/).test(digits)) return null;
    const code = Number.parseInt(digits, hex ? 16 : 10);
    const valid =
      code > 0 && code <= MAX_CODE_POINT && (code < SURROGATE_START || code > SURROGATE_END);
    return valid ? String.fromCodePoint(code) : null;
  }
  return Object.prototype.hasOwnProperty.call(HTML_NAMED_CHARACTER_REFERENCES, reference)
    ? (HTML_NAMED_CHARACTER_REFERENCES[reference] ?? null)
    : null;
}

export function decodeHtmlEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(
    HTML_CHARACTER_REFERENCE,
    (token, reference: string) => decodeCharacterReference(reference) ?? token,
  );
}
