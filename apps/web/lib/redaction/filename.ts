export const MAX_FILENAME_CHARS = 200;
export const FALLBACK_FILENAME = 'file';

const PATH_SEPARATOR = /[/\\]/u;
const WINDOWS_DRIVE_PREFIX = /^[A-Za-z]:/u;
const RESERVED_CHARACTERS = /[<>:"|?*]/gu;
const COLLAPSE_UNDERSCORES = /_{2,}/gu;
const TRAVERSAL_SEGMENT = /^\.+$/u;
const LAST_CONTROL_CODE = 0x1f;
const DELETE_CODE = 0x7f;

function isControlCharacter(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return code <= LAST_CONTROL_CODE || code === DELETE_CODE;
}

function stripControlCharacters(value: string): string {
  let out = '';
  for (const character of value) {
    if (!isControlCharacter(character)) out += character;
  }
  return out;
}

function lastSegment(value: string): string {
  const parts = value.split(PATH_SEPARATOR);
  return parts[parts.length - 1] ?? '';
}

/**
 * True when the name carries a path rather than naming a file. The caller
 * refuses the upload instead of quietly storing it under a rewritten name.
 */
export function filenameIsUnsafe(value: string): boolean {
  if (value.length === 0 || value.length > MAX_FILENAME_CHARS) return true;
  if ([...value].some(isControlCharacter)) return true;
  if (PATH_SEPARATOR.test(value)) return true;
  if (WINDOWS_DRIVE_PREFIX.test(value)) return true;
  return TRAVERSAL_SEGMENT.test(value.trim());
}

/**
 * The name a file is stored and served under: one path segment, no control
 * characters, no traversal, bounded length with the extension kept.
 */
export function sanitizeFilename(value: string): string {
  const base = stripControlCharacters(lastSegment(value.replace(WINDOWS_DRIVE_PREFIX, '')))
    .replace(RESERVED_CHARACTERS, '_')
    .replace(COLLAPSE_UNDERSCORES, '_')
    .trim();

  if (base.length === 0 || TRAVERSAL_SEGMENT.test(base)) return FALLBACK_FILENAME;
  if (base.length <= MAX_FILENAME_CHARS) return base;

  const dot = base.lastIndexOf('.');
  const extension = dot > 0 && base.length - dot <= 16 ? base.slice(dot) : '';
  return `${base.slice(0, MAX_FILENAME_CHARS - extension.length)}${extension}`;
}
