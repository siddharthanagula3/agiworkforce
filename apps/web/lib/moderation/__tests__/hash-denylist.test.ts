import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: loggerMock }));

import {
  matchDenylistedSha256,
  matchDenylistedUpload,
  sha256Hex,
  sha256HexFromFile,
} from '../hash-denylist';

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

describe('matchDenylistedSha256', () => {
  it('reads the same list as the upload matcher and normalises the digest it is given', () => {
    process.env['MODERATION_HASH_DENYLIST'] = `ncmec:${DIGEST}`;
    expect(matchDenylistedSha256(DIGEST.toUpperCase())).toEqual({
      sha256: DIGEST,
      matched: true,
      listLabel: 'ncmec',
    });
    expect(matchDenylistedSha256('b'.repeat(64))).toEqual({
      sha256: 'b'.repeat(64),
      matched: false,
    });
  });
});

describe('sha256Hex', () => {
  it('agrees with node crypto', () => {
    expect(sha256Hex(BYTES)).toBe(DIGEST);
  });
});

describe('sha256HexFromFile', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'agi-denylist-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('digests a file spanning many read buffers, chunk boundaries included', async () => {
    const readBuffer = 64 * 1024;
    const large = Buffer.alloc(readBuffer * 16 + 7, 0x7a);
    large.write('staged-video-stand-in', readBuffer + 1);
    large.write('tail', large.byteLength - 4);
    const filePath = path.join(directory, 'staged-output');
    await writeFile(filePath, large);

    const digest = await sha256HexFromFile(filePath);

    expect(digest).toBe(createHash('sha256').update(large).digest('hex'));
  });

  it('agrees with the in-memory digest of the same bytes', async () => {
    const filePath = path.join(directory, 'small-output');
    await writeFile(filePath, BYTES);
    expect(await sha256HexFromFile(filePath)).toBe(DIGEST);
  });

  it('rejects rather than returning a digest when the staged file is gone', async () => {
    await expect(sha256HexFromFile(path.join(directory, 'missing'))).rejects.toThrow();
  });
});
