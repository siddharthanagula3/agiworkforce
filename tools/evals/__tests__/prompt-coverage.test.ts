import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  LEDGER_FILE,
  PROMPT_MANIFEST_FILE,
  corporaForPrompts,
  corpusPromptIds,
  evaluateCoverage,
  manifestPromptIds,
} from '../scripts/prompt-coverage.mjs';

const MANIFEST = `export const PROMPT_MANIFEST = {
  'support.system': {
    kind: 'support',
  },
  'research.system': {
    kind: 'research',
  },
} as const;
`;

describe('manifestPromptIds', () => {
  it('reads the prompt ids the manifest declares', () => {
    expect(manifestPromptIds(MANIFEST)).toEqual(['research.system', 'support.system']);
  });

  it('treats a manifest it can no longer parse as a broken instrument, not an empty one', () => {
    expect(() => manifestPromptIds('export const PROMPT_MANIFEST = {} as const;\n')).toThrow(
      /measuring nothing/,
    );
  });

  it('parses the manifest this repository ships', () => {
    expect(manifestPromptIds(readFileSync(PROMPT_MANIFEST_FILE, 'utf8')).length).toBeGreaterThan(0);
  });
});

describe('evaluateCoverage', () => {
  const manifestIds = ['a.one', 'b.two'];

  it('passes when every prompt is covered or recorded as uncovered', () => {
    const verdict = evaluateCoverage({
      manifestIds,
      covered: new Map([['a.one', ['chat']]]),
      ledger: { uncovered: { 'b.two': 'no corpus can reach it yet' } },
    });
    expect(verdict.passed).toBe(true);
    expect(verdict.uncovered).toEqual(['b.two']);
  });

  it('fails a new prompt that is neither covered nor recorded', () => {
    const verdict = evaluateCoverage({
      manifestIds,
      covered: new Map([['a.one', ['chat']]]),
      ledger: { uncovered: {} },
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.problems.join('\n')).toMatch(/b\.two has no eval corpus/);
  });

  it('fails a corpus that measures a prompt the manifest dropped', () => {
    const verdict = evaluateCoverage({
      manifestIds,
      covered: new Map([
        ['a.one', ['chat']],
        ['gone.prompt', ['tools']],
      ]),
      ledger: { uncovered: { 'b.two': 'recorded' } },
    });
    expect(verdict.problems.join('\n')).toMatch(/no longer defines/);
  });

  it('fails a ledger entry that a corpus has since covered, so the ratchet tightens', () => {
    const verdict = evaluateCoverage({
      manifestIds,
      covered: new Map([
        ['a.one', ['chat']],
        ['b.two', ['research']],
      ]),
      ledger: { uncovered: { 'b.two': 'stale' } },
    });
    expect(verdict.problems.join('\n')).toMatch(/drop it from prompt-coverage\.json/);
  });
});

describe('the committed corpora and ledger', () => {
  it('leave no product prompt unaccounted for', () => {
    const verdict = evaluateCoverage({
      manifestIds: manifestPromptIds(readFileSync(PROMPT_MANIFEST_FILE, 'utf8')),
      covered: corpusPromptIds(),
      ledger: JSON.parse(readFileSync(LEDGER_FILE, 'utf8')),
    });
    expect(verdict.problems).toEqual([]);
  });

  it('name the corpora to run for a changed prompt', () => {
    const covered = corpusPromptIds();
    expect(corporaForPrompts(['safety.untrusted_context'], covered)).toEqual(['jailbreak']);
    expect(corporaForPrompts(['not.a.prompt'], covered)).toEqual([]);
  });
});
