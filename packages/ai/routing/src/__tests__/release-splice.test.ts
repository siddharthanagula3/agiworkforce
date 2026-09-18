import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// @ts-expect-error plain-node module, run by the release CLI rather than bundled
import {
  objectEnd,
  spliceSlotCandidates,
  spliceTopLevelObject,
} from '../promotion/json-splice.mjs';

const POLICIES_FILE = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'model-registry',
  'catalog',
  'routing-policies.json',
);

const TEXT = readFileSync(POLICIES_FILE, 'utf8');
const SLOT = 'coding_balanced';
const CANARY = { modelKey: 'drill-model', trafficFraction: 0.05 };

function policy(text: string): {
  release: { policyVersion: number };
  auto: { slots: Record<string, { canary?: unknown; shadow?: unknown }> };
} {
  return JSON.parse(text);
}

describe('splicing the routing policy', () => {
  it('walks past strings and nested objects to find where a value ends', () => {
    const text = '{"a":{"b":"}}}","c":{}},"d":1}';
    expect(text.slice(0, objectEnd(text, 0))).toBe(text);
    expect(text.slice(text.indexOf('{', 1), objectEnd(text, text.indexOf('{', 1)))).toBe(
      '{"b":"}}}","c":{}}',
    );
  });

  it('replaces the ledger and leaves every other byte alone', () => {
    const before = policy(TEXT).release;
    const spliced = spliceTopLevelObject(
      TEXT,
      'release',
      { ...before, policyVersion: 99 },
      'schemaVersion',
    );
    expect(policy(spliced).release.policyVersion).toBe(99);
    expect(policy(spliced).auto).toEqual(policy(TEXT).auto);
  });

  it('inserts the ledger after the anchor when the document has none', () => {
    const without = TEXT.replace(JSON.stringify(policy(TEXT).release), 'null');
    const spliced = spliceTopLevelObject(
      without.replace('"release": null,\n', ''),
      'release',
      { policyVersion: 1, records: [] },
      'schemaVersion',
    );
    expect(policy(spliced).release).toEqual({ policyVersion: 1, records: [] });
  });

  it('stages and withdraws a slot candidate without touching its other keys', () => {
    const staged = spliceSlotCandidates(TEXT, SLOT, { canary: CANARY });
    expect(policy(staged).auto.slots[SLOT]).toEqual({
      ...policy(TEXT).auto.slots[SLOT],
      canary: CANARY,
    });
    const withdrawn = spliceSlotCandidates(staged, SLOT, undefined);
    expect(policy(withdrawn).auto.slots[SLOT]).toEqual(policy(TEXT).auto.slots[SLOT]);
    expect(policy(withdrawn).auto.slots).toEqual(policy(TEXT).auto.slots);
  });

  it('edits the policy slot, not the copy a release record carries', () => {
    const withRecord = spliceTopLevelObject(
      TEXT,
      'release',
      {
        policyVersion: 1,
        records: [
          {
            version: 1,
            artifact: 'routing_policy',
            id: 'auto',
            channel: 'canary',
            effectiveOn: '2026-09-18',
            reason: 'a record carrying its own slots block',
            slots: { [SLOT]: { canary: { modelKey: 'other', trafficFraction: 0.5 } } },
          },
        ],
      },
      'schemaVersion',
    );
    const staged = spliceSlotCandidates(withRecord, SLOT, { canary: CANARY });
    expect(policy(staged).auto.slots[SLOT].canary).toEqual(CANARY);
    expect(
      (policy(staged) as unknown as { release: { records: { slots: Record<string, unknown> }[] } })
        .release.records[0].slots[SLOT],
    ).toEqual({ canary: { modelKey: 'other', trafficFraction: 0.5 } });
  });

  it('refuses a slot the policy does not declare', () => {
    expect(() => spliceSlotCandidates(TEXT, 'no_such_slot', { canary: CANARY })).toThrow(
      'no no_such_slot key',
    );
  });
});
