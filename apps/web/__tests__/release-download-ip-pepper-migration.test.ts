import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { logger } from '@/lib/logger';
import { __resetIpHashKeyForTests, hashIpAddress } from '@/lib/server/ip-hash';

const NEON_DIR = path.resolve(import.meta.dirname, '../db/neon');
const UP_FILENAME = '0131_release_download_ip_pepper.sql';
const up = fs.readFileSync(path.join(NEON_DIR, UP_FILENAME), 'utf8');
const down = fs.readFileSync(
  path.join(NEON_DIR, 'down', UP_FILENAME.replace(/\.sql$/u, '.down.sql')),
  'utf8',
);

const PEPPER = 'first-pepper-value-at-least-32-characters';
const IP = '203.0.113.7';
const DOMAIN = 'release-download';

function sqlBody(source: string): string {
  return source.replace(/--[^\n]*/gu, ' ');
}

function expectedDigest(key: Buffer | string): string {
  return createHmac('sha256', key).update(`${DOMAIN}\0${IP}`).digest('hex');
}

describe('release download IP pepper migration', () => {
  it('redefines record_release_download to take a digest instead of an address', () => {
    const body = sqlBody(up);
    expect(body).toContain(
      'drop function if exists public.record_release_download(uuid, text, text, text, text, text)',
    );
    expect(body).toMatch(
      /create function public\.record_release_download\(\s*p_release_id uuid,\s*p_ip_hash text/u,
    );
    expect(body).not.toContain('p_ip_address');
  });

  it('leaves no hardcoded salt and no digesting of caller input in the database', () => {
    const body = sqlBody(up);
    expect(body).not.toContain('agiworkforce-salt');
    expect(body).not.toContain('digest(');
  });

  it('rejects a raw address rather than storing it in the ip_hash column', () => {
    const body = sqlBody(up);
    expect(body).toContain("p_ip_hash !~ '^[0-9a-f]{64}$'");
    expect(body).toContain('raise exception');
    expect(body).toContain('invalid_parameter_value');
  });

  it('clears the reversible digests already stored instead of leaving them to a retention job', () => {
    const body = sqlBody(up);
    expect(body).toMatch(/update\s+public\.release_downloads\s+set ip_hash = null/u);
    expect(body).not.toMatch(/delete\s+from\s+public\.release_downloads/u);
  });

  it('locks the table before clearing so no salted row lands after the clear', () => {
    const body = sqlBody(up);
    const lockAt = body.indexOf('lock table public.release_downloads in access exclusive mode');
    const recreateAt = body.indexOf('create function public.record_release_download');
    const clearAt = body.search(/update\s+public\.release_downloads/u);

    expect(lockAt).toBeGreaterThanOrEqual(0);
    expect(lockAt).toBeLessThan(recreateAt);
    expect(recreateAt).toBeLessThan(clearAt);
  });

  it('ships a reversal that restores the previous definition and retracts its ledger row', () => {
    const body = sqlBody(down);
    expect(body).toMatch(/^\s*begin;/u);
    expect(body).toMatch(/commit;\s*$/u);
    expect(body).toContain('p_ip_address');
    expect(body).toContain(
      `delete from public.schema_migrations\nwhere filename = '${UP_FILENAME}'`,
    );
  });

  it('does not pretend the reversal can restore the cleared digests', () => {
    expect(sqlBody(down)).not.toMatch(/update\s+public\.release_downloads/u);
    expect(down).toMatch(/does NOT restore release_downloads\.ip_hash/u);
  });

  it('never re-applies the weak salt from 0020 in any forward migration', () => {
    const forward = fs
      .readdirSync(NEON_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
      .filter((entry) => entry.name > '0020_functions.sql');
    for (const entry of forward) {
      expect(sqlBody(fs.readFileSync(path.join(NEON_DIR, entry.name), 'utf8'))).not.toContain(
        'agiworkforce-salt',
      );
    }
  });
});

describe('hashIpAddress', () => {
  beforeEach(() => {
    __resetIpHashKeyForTests();
    vi.clearAllMocks();
    vi.stubEnv('IP_HASH_PEPPER', '');
    vi.stubEnv('LOG_SALT', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    __resetIpHashKeyForTests();
  });

  it('is a keyed HMAC an attacker cannot precompute without the pepper', () => {
    vi.stubEnv('IP_HASH_PEPPER', PEPPER);
    const first = hashIpAddress(IP, DOMAIN);

    vi.stubEnv('IP_HASH_PEPPER', 'second-pepper-value-at-least-32-character');
    const second = hashIpAddress(IP, DOMAIN);

    expect(first).toBe(expectedDigest(PEPPER));
    expect(first).not.toBe(second);
  });

  it('separates domains so the same address does not correlate across surfaces', () => {
    vi.stubEnv('IP_HASH_PEPPER', PEPPER);
    expect(hashIpAddress(IP, DOMAIN)).not.toBe(hashIpAddress(IP, 'download'));
  });

  it('derives a domain-separated key from LOG_SALT when no dedicated pepper is set', () => {
    vi.stubEnv('LOG_SALT', 'a-configured-log-salt');
    const derived = createHmac('sha256', 'a-configured-log-salt')
      .update('ip-hash-pepper/v1')
      .digest();

    expect(hashIpAddress(IP, DOMAIN)).toBe(expectedDigest(derived));
    expect(hashIpAddress(IP, DOMAIN)).not.toBe(expectedDigest('a-configured-log-salt'));
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('ignores a pepper too short to resist guessing, and says so once', () => {
    vi.stubEnv('IP_HASH_PEPPER', 'too-short');
    vi.stubEnv('LOG_SALT', 'a-configured-log-salt');

    const digest = hashIpAddress(IP, DOMAIN);
    hashIpAddress(IP, DOMAIN);

    expect(digest).not.toBe(expectedDigest('too-short'));
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('uses no key that ships in this repository when nothing is configured', () => {
    const digest = hashIpAddress(IP, DOMAIN);

    expect(digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(digest).not.toBe(expectedDigest('agiworkforce-local-development-ip-hash-pepper'));
    expect(digest).not.toBe(expectedDigest('agiworkforce-salt'));

    const source = fs.readFileSync(
      path.resolve(import.meta.dirname, '../lib/server/ip-hash.ts'),
      'utf8',
    );
    for (const literal of source.match(/'[^']{16,}'/gu) ?? []) {
      expect(digest).not.toBe(expectedDigest(literal.slice(1, -1)));
    }
  });

  it('keeps the unconfigured key to this process, and warns that counts will overcount', () => {
    const first = hashIpAddress(IP, DOMAIN);
    expect(hashIpAddress(IP, DOMAIN)).toBe(first);
    expect(logger.error).toHaveBeenCalledOnce();

    __resetIpHashKeyForTests();
    expect(hashIpAddress(IP, DOMAIN)).not.toBe(first);
  });

  it('still returns a digest on a deployed runtime with nothing configured, rather than throwing', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NODE_ENV', 'production');

    expect(hashIpAddress(IP, DOMAIN)).toMatch(/^[0-9a-f]{64}$/u);
  });
});
