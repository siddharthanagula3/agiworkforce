/**
 * Deterministic haystacks for the long-context suite.
 *
 * A committed 400k-character corpus file would dwarf the rest of the harness,
 * so a case declares a seed, a size, a depth and a needle, and the same text is
 * generated on every run. The request fingerprint covers the generated text, so
 * a generator change invalidates recorded responses instead of replaying them
 * against a different document.
 *
 * @module evals/haystack
 * @packageDocumentation
 */

import type { EvalHaystack } from './types';

const SUBJECTS = [
  'The logistics team',
  'A regional office',
  'The quarterly review',
  'The facilities group',
  'An internal audit',
  'The procurement desk',
  'The field survey',
  'A customer panel',
  'The archive committee',
  'The maintenance crew',
];
const VERBS = [
  'noted',
  'recorded',
  'summarised',
  'confirmed',
  'described',
  'reviewed',
  'catalogued',
  'discussed',
];
const OBJECTS = [
  'routine changes to the delivery schedule',
  'minor variations in storage temperature',
  'the usual turnover of seasonal equipment',
  'a steady volume of routine correspondence',
  'several adjustments to shared calendars',
  'ordinary wear on the loading dock doors',
  'the relocation of two filing cabinets',
  'expected delays in paperwork processing',
];
const TAILS = [
  'and no further action was required.',
  'which matched the previous period.',
  'without any notable exceptions.',
  'as described in earlier memos.',
  'and the matter was closed.',
  'pending the next scheduled check.',
];

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)]!;
}

export function buildHaystack(spec: EvalHaystack): string {
  const random = mulberry32(spec.seed);
  const sentences: string[] = [];
  let length = 0;
  while (length < spec.targetChars) {
    const sentence = `${pick(random, SUBJECTS)} ${pick(random, VERBS)} ${pick(random, OBJECTS)} ${pick(random, TAILS)}`;
    sentences.push(sentence);
    length += sentence.length + 1;
  }
  const index = Math.min(sentences.length, Math.max(0, Math.round(sentences.length * spec.depth)));
  sentences.splice(index, 0, spec.needle);
  return sentences.join(' ');
}

export const CHARS_PER_TOKEN_ESTIMATE = 4;

export function estimatedTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE);
}
