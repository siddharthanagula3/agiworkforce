import {
  FALLBACK_FILENAME,
  MAX_FILENAME_EXTENSION_CHARS,
  sanitizeFilename,
} from '@agiworkforce/unified-chat/filename';

const PATH_COMPONENT_LIMIT_BYTES = 255;
const DUPLICATE_SUFFIX_HEADROOM_BYTES = 8;
export const MAX_NATIVE_FILENAME_BYTES =
  PATH_COMPONENT_LIMIT_BYTES - DUPLICATE_SUFFIX_HEADROOM_BYTES;

const REPLACEMENT = '_';
const ZERO_WIDTH_JOINER = 0x200d;
const FIRST_REGIONAL_INDICATOR = 0x1f1e6;
const LAST_REGIONAL_INDICATOR = 0x1f1ff;
const CLUSTER_EXTENDERS: ReadonlyArray<readonly [number, number]> = [
  [0x0300, 0x036f],
  [0x1ab0, 0x1aff],
  [0x1dc0, 0x1dff],
  [0x200d, 0x200d],
  [0x20d0, 0x20ff],
  [0xfe00, 0xfe0f],
  [0xfe20, 0xfe2f],
  [0x1f3fb, 0x1f3ff],
  [0xe0020, 0xe007f],
  [0xe0100, 0xe01ef],
];

function isSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdfff;
}

function withoutLoneSurrogates(value: string): string {
  let out = '';
  for (const character of value) {
    out += isSurrogate(character.codePointAt(0) ?? 0) ? REPLACEMENT : character;
  }
  return out;
}

function utf8Bytes(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  return codePoint < 0x10000 ? 3 : 4;
}

function isClusterExtender(codePoint: number): boolean {
  return CLUSTER_EXTENDERS.some(([first, last]) => codePoint >= first && codePoint <= last);
}

function isRegionalIndicator(codePoint: number): boolean {
  return codePoint >= FIRST_REGIONAL_INDICATOR && codePoint <= LAST_REGIONAL_INDICATOR;
}

function splitsCluster(codePoints: readonly number[], cut: number): boolean {
  const next = codePoints[cut];
  if (next === undefined) return false;
  if (codePoints[cut - 1] === ZERO_WIDTH_JOINER || isClusterExtender(next)) return true;
  if (!isRegionalIndicator(next)) return false;
  let run = 0;
  while (cut - run - 1 >= 0 && isRegionalIndicator(codePoints[cut - run - 1] ?? 0)) run += 1;
  return run % 2 === 1;
}

function cutToBytes(base: string, budget: number): string {
  const codePoints = Array.from(base, (character) => character.codePointAt(0) ?? 0);
  let used = 0;
  let cut = 0;
  while (cut < codePoints.length) {
    const size = utf8Bytes(codePoints[cut] ?? 0);
    if (used + size > budget) break;
    used += size;
    cut += 1;
  }
  while (cut > 0 && splitsCluster(codePoints, cut)) cut -= 1;
  return String.fromCodePoint(...codePoints.slice(0, cut)).replace(/[. ]+$/u, '');
}

function utf8Length(value: string): number {
  let total = 0;
  for (const character of value) total += utf8Bytes(character.codePointAt(0) ?? 0);
  return total;
}

/**
 * A name that is safe as one path component on the phone: sanitized, well formed, and at most
 * MAX_NATIVE_FILENAME_BYTES of UTF-8 so the app's storage accepts it. Ext4 and f2fs on Android
 * and APFS on iOS limit a component to 255 bytes, so a long title in a script that takes three
 * bytes a character would otherwise fail the write. The headroom leaves room for the " (1)" a
 * receiving app adds when a name is already taken. The cut falls between whole characters and
 * clusters (combining marks, joined emoji, flags); the short final ".ext" stays intact.
 */
export function nativeFileName(value: string): string {
  const name = sanitizeFilename(withoutLoneSurrogates(value));
  if (utf8Length(name) <= MAX_NATIVE_FILENAME_BYTES) return name;

  const dot = name.lastIndexOf('.');
  const extension =
    dot > 0 && name.length - dot <= MAX_FILENAME_EXTENSION_CHARS ? name.slice(dot) : '';
  const base = cutToBytes(
    name.slice(0, name.length - extension.length),
    MAX_NATIVE_FILENAME_BYTES - utf8Length(extension),
  );
  return base.length === 0 ? `${FALLBACK_FILENAME}${extension}` : `${base}${extension}`;
}
