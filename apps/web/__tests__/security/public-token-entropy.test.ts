import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { isHighEntropyToken, shannonEntropyBits } from '@/lib/security/entropy';

const WEB_ROOT = path.resolve(import.meta.dirname, '../..');

/**
 * The identifiers that ARE the authorization: anyone holding one reads the
 * resource, so the only thing standing between a stranger and the content is
 * how hard the string is to guess.
 */
const PUBLIC_TOKEN_MINTS = [
  {
    what: 'a published artifact',
    file: 'lib/services/published-artifact-service.ts',
    mint: /randomBytes\((\d+)\)\.toString\('base64url'\)/,
  },
  {
    what: 'a shared conversation',
    file: 'app/api/share/route.ts',
    mint: /randomBytes\((\d+)\)\.toString\('base64url'\)/,
  },
];

/** 128 bits is the floor below which a link becomes worth enumerating. */
const MINIMUM_BYTES = 16;

describe('a link that is the permission is not guessable', () => {
  it('mints every public token from at least 128 bits of randomness', () => {
    for (const entry of PUBLIC_TOKEN_MINTS) {
      const source = fs.readFileSync(path.join(WEB_ROOT, entry.file), 'utf8');
      const match = source.match(entry.mint);
      expect(match, `${entry.what} no longer mints its token in ${entry.file}`).not.toBeNull();
      expect(
        Number(match![1]),
        `${entry.what} is handed out on fewer than ${MINIMUM_BYTES} random bytes`,
      ).toBeGreaterThanOrEqual(MINIMUM_BYTES);
    }
  });

  it('never derives a public token from something a stranger already knows', () => {
    for (const entry of PUBLIC_TOKEN_MINTS) {
      const source = fs.readFileSync(path.join(WEB_ROOT, entry.file), 'utf8');
      const index = source.search(entry.mint);
      const statement = source.slice(Math.max(0, index - 200), index + 200);
      for (const derived of ['userId', 'conversationId', 'artifactId', 'organizationId', 'slug']) {
        expect(statement, `${entry.what} mixes ${derived} into its token`).not.toContain(
          `${derived} +`,
        );
      }
      expect(statement, `${entry.what} counts rows to build its token`).not.toMatch(
        /\bcount\b|\bsequence\b|Date\.now\(\)/,
      );
    }
  });

  it('scores a minted token as a credential rather than as a word', () => {
    const sample = Buffer.from(
      Uint8Array.from({ length: 18 }, (_, index) => (index * 37 + 11) % 251),
    ).toString('base64url');

    expect(sample.length).toBeGreaterThanOrEqual(24);
    expect(isHighEntropyToken(sample)).toBe(true);
    expect(shannonEntropyBits(sample)).toBeGreaterThan(
      shannonEntropyBits('shared-conversation-link'),
    );
  });
});
