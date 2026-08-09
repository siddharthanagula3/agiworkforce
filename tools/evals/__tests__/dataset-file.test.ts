/**
 * `loadDataset` reads `datasets/<suite>.json` and then re-checks that the file
 * agrees with its own filename. That guard is unreachable through the committed
 * corpora by design, so it is exercised here against a stubbed filesystem —
 * otherwise the one branch that stops a mis-copied corpus file would ship
 * untested.
 *
 * The failure it prevents is silent: copy `refusal.json` to `jailbreak.json`,
 * forget to change `suite`, and `loadAllDatasets` returns the refusal corpus
 * twice while the jailbreak corpus vanishes from the run. Every gate still
 * passes and nothing has been measured.
 */

import { describe, expect, it, vi } from 'vitest';

const readFileSync = vi.hoisted(() => vi.fn());

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, readFileSync };
});

const { loadDataset } = await import('../src/dataset');

const refusalShaped = {
  suite: 'refusal',
  version: 1,
  passThreshold: 1,
  cases: [
    {
      id: 'refusal/example',
      family: 'safety',
      risk: 'high',
      expected: 'refusal',
      prompt: 'Do the disallowed thing.',
      checks: [{ kind: 'refuses' }],
    },
  ],
};

describe('loadDataset', () => {
  it('rejects a corpus file whose declared suite disagrees with its filename', () => {
    readFileSync.mockReturnValue(JSON.stringify(refusalShaped));
    expect(() => loadDataset('jailbreak')).toThrow(/file declares suite refusal/);
  });

  it('accepts the file when the two agree', () => {
    readFileSync.mockReturnValue(JSON.stringify(refusalShaped));
    expect(loadDataset('refusal').cases).toHaveLength(1);
  });

  it('reads the file that belongs to the requested suite', () => {
    readFileSync.mockReturnValue(JSON.stringify(refusalShaped));
    loadDataset('refusal');
    expect(String(readFileSync.mock.calls.at(-1)?.[0])).toContain('datasets/refusal.json');
  });
});
