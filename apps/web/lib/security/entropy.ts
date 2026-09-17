export const HIGH_ENTROPY_DETECTION_NAME = 'High-Entropy String';

const MIN_TOKEN_LENGTH = 24;
const MAX_TOKEN_LENGTH = 512;
const BASE64_ENTROPY_BITS = 4.2;
const HEX_ENTROPY_BITS = 3.3;
const MIN_DISTINCT_CHARACTERS = 12;
const TOKEN_PATTERN = /[A-Za-z0-9+/=_-]{24,512}/gu;
const HEX_PATTERN = /^[A-Fa-f0-9]+$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const DIGEST_LENGTHS: ReadonlySet<number> = new Set([32, 40, 56, 64, 96, 128]);
const WORD_SEPARATOR = /[_-]/u;
const MIN_WORD_LENGTH = 3;
const MAX_WORDY_RATIO = 0.5;

/**
 * Shannon entropy per character. A credential is drawn from a large alphabet
 * with no structure, so it sits near the ceiling for its alphabet; English
 * prose, an identifier and a file path all sit well under it.
 */
export function shannonEntropyBits(value: string): number {
  if (value.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const character of value) {
    counts.set(character, (counts.get(character) ?? 0) + 1);
  }
  let bits = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    bits -= probability * Math.log2(probability);
  }
  return bits;
}

function distinctCharacters(value: string): number {
  return new Set(value).size;
}

/**
 * A long token made of separated words is a name, not a key: `feature-flag-
 * rollout-controller-config` clears the length bar and would clear an entropy
 * bar tuned for base64 if it were not checked for shape first.
 */
function readsAsWords(value: string): boolean {
  const parts = value.split(WORD_SEPARATOR).filter((part) => part.length >= MIN_WORD_LENGTH);
  if (parts.length < 2) return false;
  const lettersOnly = parts.filter((part) => /^[A-Za-z]+$/u.test(part));
  return lettersOnly.length / parts.length > MAX_WORDY_RATIO;
}

export function isHighEntropyToken(token: string): boolean {
  if (token.length < MIN_TOKEN_LENGTH || token.length > MAX_TOKEN_LENGTH) return false;
  if (UUID_PATTERN.test(token)) return false;
  if (readsAsWords(token)) return false;
  if (distinctCharacters(token) < MIN_DISTINCT_CHARACTERS) return false;

  if (HEX_PATTERN.test(token)) {
    if (DIGEST_LENGTHS.has(token.length)) return false;
    return shannonEntropyBits(token) >= HEX_ENTROPY_BITS;
  }

  return shannonEntropyBits(token) >= BASE64_ENTROPY_BITS;
}

export interface HighEntropyMatch {
  value: string;
  position: number;
  entropyBits: number;
}

/**
 * Deliberately conservative. This is the only detector that has no idea what
 * it is looking at, so it reports rather than asserts, and everything it can
 * recognise as a digest, an identifier or a name is dropped before it counts:
 * a scanner that cries wolf stops being read, which is worse than one
 * detector fewer.
 */
export function findHighEntropyStrings(content: string): HighEntropyMatch[] {
  const matches: HighEntropyMatch[] = [];
  const pattern = new RegExp(TOKEN_PATTERN.source, TOKEN_PATTERN.flags);
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    const token = match[0];
    if (!isHighEntropyToken(token)) continue;
    matches.push({
      value: token,
      position: match.index,
      entropyBits: shannonEntropyBits(token),
    });
  }

  return matches;
}
