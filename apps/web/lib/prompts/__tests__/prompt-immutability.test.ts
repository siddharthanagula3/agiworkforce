import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { PROMPT_IDS, PROMPT_MANIFEST } from '../prompt-manifest';
import { promptStamp } from '../prompt-registry';

/**
 * "Never rewrite a version that has shipped" was a convention in a comment. It
 * is a lock file here: the digest of every published version's text, checked on
 * every run. Editing shipped text fails; adding a version requires adding its
 * digest, which is a line a reviewer sees.
 */

const LOCK_FILE = path.resolve(import.meta.dirname, '..', 'published-prompt-versions.json');

interface PublishedLock {
  readonly schemaVersion: number;
  readonly digests: Readonly<Record<string, string>>;
}

function digestOf(text: string): string {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

function currentDigests(): Record<string, string> {
  const digests: Record<string, string> = {};
  for (const id of PROMPT_IDS) {
    for (const version of PROMPT_MANIFEST[id].versions) {
      digests[promptStamp(id, version.version)] = digestOf(version.text);
    }
  }
  return digests;
}

function lock(): PublishedLock {
  return JSON.parse(readFileSync(LOCK_FILE, 'utf8')) as PublishedLock;
}

describe('published prompt versions are immutable', () => {
  it('matches the digest recorded for every shipped version', () => {
    const recorded = lock().digests;
    const actual = currentDigests();
    const rewritten = Object.keys(actual).filter(
      (stamp) => recorded[stamp] !== undefined && recorded[stamp] !== actual[stamp],
    );

    expect(
      rewritten,
      `${rewritten.join(', ')} changed after publication. A shipped version is what a stamped ledger row means: add a new version instead of rewriting one. Current digests:\n${JSON.stringify(actual, null, 2)}`,
    ).toEqual([]);
  });

  it('records a digest for every version the manifest holds', () => {
    const recorded = lock().digests;
    const actual = currentDigests();
    const unrecorded = Object.keys(actual).filter((stamp) => recorded[stamp] === undefined);

    expect(
      unrecorded,
      `${unrecorded.join(', ')} ship with no digest in published-prompt-versions.json. Add them with:\n${JSON.stringify(actual, null, 2)}`,
    ).toEqual([]);
  });

  it('never records a digest for a version that no longer ships', () => {
    const actual = currentDigests();
    const withdrawn = Object.keys(lock().digests).filter((stamp) => actual[stamp] === undefined);

    expect(withdrawn).toEqual([]);
  });
});
