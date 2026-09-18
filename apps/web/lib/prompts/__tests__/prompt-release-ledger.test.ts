import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { PROMPT_IDS, PROMPT_MANIFEST, isPromptId } from '../prompt-manifest';
import { parsePromptStamp, promptStamp } from '../prompt-registry';

/**
 * The manifest says which version serves; the release ledger says on what
 * channel and on what evidence. Pairing them is what stops a prompt reaching
 * 100% of traffic without a staged release behind it.
 */

const LEDGER_FILE = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'packages',
  'ai',
  'model-registry',
  'catalog',
  'routing-policies.json',
);

interface ReleaseRecord {
  readonly version: number;
  readonly artifact: string;
  readonly id: string;
  readonly channel: string;
}

const records = (
  JSON.parse(readFileSync(LEDGER_FILE, 'utf8')) as {
    release: { records: readonly ReleaseRecord[] };
  }
).release.records;

const promptRecords = records.filter((record) => record.artifact === 'prompt');

function channelOf(stamp: string): string | null {
  const history = promptRecords.filter((record) => record.id === stamp);
  return history[history.length - 1]?.channel ?? null;
}

describe('the prompt manifest and the release ledger', () => {
  it('gives every shipped prompt version a release record', () => {
    const unreleased = PROMPT_IDS.flatMap((id) =>
      PROMPT_MANIFEST[id].versions
        .map((version) => promptStamp(id, version.version))
        .filter((stamp) => channelOf(stamp) === null),
    );

    expect(unreleased).toEqual([]);
  });

  it('never records a prompt version the manifest no longer holds', () => {
    for (const record of promptRecords) {
      const parsed = parsePromptStamp(record.id);
      expect(parsed, `${record.id} is not a manifest prompt stamp`).not.toBeNull();
      if (!parsed || !isPromptId(parsed.id)) continue;
      expect(
        PROMPT_MANIFEST[parsed.id].versions.map((version) => version.version),
        record.id,
      ).toContain(parsed.version);
    }
  });

  it('serves only a stable version by default, and stages every other one', () => {
    for (const id of PROMPT_IDS) {
      const entry = PROMPT_MANIFEST[id];
      for (const version of entry.versions) {
        const stamp = promptStamp(id, version.version);
        const channel = channelOf(stamp);
        if (version.version === entry.pinnedVersion) {
          expect(channel, `${stamp} is pinned`).toBe('stable');
        } else {
          expect(channel, `${stamp} is not pinned`).not.toBe('stable');
        }
      }
    }
  });
});
