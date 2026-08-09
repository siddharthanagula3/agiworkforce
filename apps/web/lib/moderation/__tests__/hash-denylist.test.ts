import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: loggerMock }));

import { matchDenylistedUpload, sha256Hex } from '../hash-denylist';

const BYTES = new TextEncoder().encode('known-illegal-media-stand-in');
const DIGEST = createHash('sha256').update(BYTES).digest('hex');

const originalList = process.env['MODERATION_HASH_DENYLIST'];

beforeEach(() => {
  loggerMock.error.mockClear();
});

afterEach(() => {
  if (originalList === undefined) delete process.env['MODERATION_HASH_DENYLIST'];
  else process.env['MODERATION_HASH_DENYLIST'] = originalList;
});

describe('matchDenylistedUpload', () => {
  it('returns the digest and no match when nothing is configured', () => {
    delete process.env['MODERATION_HASH_DENYLIST'];
    expect(matchDenylistedUpload(BYTES)).toEqual({ sha256: DIGEST, matched: false });
  });

  it('matches a configured digest and carries the provenance label', () => {
    process.env['MODERATION_HASH_DENYLIST'] = `ncmec:${DIGEST}`;
    expect(matchDenylistedUpload(BYTES)).toEqual({
      sha256: DIGEST,
      matched: true,
      listLabel: 'ncmec',
    });
  });

  it('re-reads the list when the environment changes mid-process', () => {
    process.env['MODERATION_HASH_DENYLIST'] = `ncmec:${DIGEST}`;
    expect(matchDenylistedUpload(BYTES).matched).toBe(true);
    process.env['MODERATION_HASH_DENYLIST'] = '';
    expect(matchDenylistedUpload(BYTES).matched).toBe(false);
  });

  it('accepts unlabelled, uppercase, and multi-line entries', () => {
    process.env['MODERATION_HASH_DENYLIST'] = `\n  ${DIGEST.toUpperCase()}  \n${'a'.repeat(64)}\n`;
    expect(matchDenylistedUpload(BYTES)).toEqual({ sha256: DIGEST, matched: true });
  });

  it('logs loudly when an entry is not a digest, since a typo fails open', () => {
    process.env['MODERATION_HASH_DENYLIST'] = `${DIGEST} not-a-digest`;
    expect(matchDenylistedUpload(BYTES).matched).toBe(true);
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.objectContaining({ malformed: 1, usable: 1 }),
      expect.stringContaining('MODERATION_HASH_DENYLIST'),
    );
  });

  it('does not match a file that differs by one byte', () => {
    process.env['MODERATION_HASH_DENYLIST'] = DIGEST;
    const altered = new Uint8Array(BYTES);
    altered[0] = (altered[0]! + 1) % 256;
    expect(matchDenylistedUpload(altered).matched).toBe(false);
  });
});

describe('sha256Hex', () => {
  it('agrees with node crypto', () => {
    expect(sha256Hex(BYTES)).toBe(DIGEST);
  });
});
