import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const allowlistPath = path.resolve(import.meta.dirname, '../wiring-allowlist.json');
const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8')) as {
  registeredWithoutReachableCaller: Array<{ command: string; reason: string }>;
};

const entries = allowlist.registeredWithoutReachableCaller;
const VERDICT = /^(?:WIRE|DELETE|KEEP): /;
const CITATION = /\b(?:apps\/|packages\/|core\/|sys\/|features\/|docs\/|lib\.rs)/;

describe('wiring-allowlist reachability entries', () => {
  it('is not empty', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it('opens every entry with an individual WIRE/DELETE/KEEP decision', () => {
    const undecided = entries.filter((entry) => !VERDICT.test(entry.reason));
    expect(undecided.map((entry) => entry.command)).toEqual([]);
  });

  it('cites the code each decision was made against', () => {
    const uncited = entries.filter((entry) => !CITATION.test(entry.reason));
    expect(uncited.map((entry) => entry.command)).toEqual([]);
  });

  it('never reuses one boilerplate reason across commands', () => {
    const byReason = new Map<string, string[]>();
    for (const entry of entries) {
      byReason.set(entry.reason, [...(byReason.get(entry.reason) ?? []), entry.command]);
    }
    const shared = [...byReason.values()].filter((commands) => commands.length > 1);
    expect(shared).toEqual([]);
  });
});
