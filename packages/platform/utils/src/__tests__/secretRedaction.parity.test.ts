import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { REDACTION_POLICIES, redactWithPolicy, type RedactionPolicy } from '../secretRedaction';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../__fixtures__/${name}`, import.meta.url), 'utf8'));
const corpus = fixture('secret-redaction-corpus.json') as string[];
const expected = fixture('secret-redaction-parity.json') as Record<RedactionPolicy, string[]>;

/**
 * Each policy reproduces, byte for byte, what its call site produced when it
 * kept its own pattern list: the fixture was captured from those lists before
 * they moved here.
 */
describe('one secret registry, each use keeping its output', () => {
  it.each(Object.keys(REDACTION_POLICIES) as RedactionPolicy[])('%s', (policy) => {
    expect(corpus.map((text) => redactWithPolicy(text, policy))).toEqual(expected[policy]);
  });
});
