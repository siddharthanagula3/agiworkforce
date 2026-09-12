import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Pre-release claim audit of the legal and trust surface, 2026-09-12.
 *
 * Six statements across /privacy, /trust, /subprocessors and /cookies had
 * drifted away from the code that decides them. The worst was a flat denial
 * that any per-organisation conversation retention window is enforced while a
 * nightly cron deletes workspace conversations past one; the rest were counts
 * that had grown since somebody wrote them down. Every case below reads the
 * deciding source rather than a remembered number, and bans the phrasing that
 * shipped so a rewrite cannot restore it.
 */

const APP_DIR = path.resolve(__dirname, '..');
const WEB_DIR = path.resolve(APP_DIR, '..');
const REPO_ROOT = path.resolve(WEB_DIR, '..', '..');

const PAGES = {
  privacy: path.join(APP_DIR, 'privacy', 'page.tsx'),
  trust: path.join(APP_DIR, 'trust', 'page.tsx'),
  subprocessors: path.join(APP_DIR, 'subprocessors', 'page.tsx'),
  cookies: path.join(APP_DIR, 'cookies', 'page.tsx'),
} as const;

type PageName = keyof typeof PAGES;

/** Comments are not published, so a claim proved by a comment is not proved. */
function published(page: PageName): string {
  return readFileSync(PAGES[page], 'utf8')
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/u.test(line))
    .join('\n');
}

function flat(page: PageName): string {
  return published(page).replace(/\s+/gu, ' ');
}

function cronSchedule(cronPath: string): string {
  const manifest = JSON.parse(readFileSync(path.join(REPO_ROOT, 'vercel.json'), 'utf8')) as {
    crons?: Array<{ path: string; schedule: string }>;
  };
  const entry = manifest.crons?.find((cron) => cron.path === cronPath);
  expect(entry, `${cronPath} is not scheduled in vercel.json`).toBeDefined();
  return entry!.schedule;
}

describe('/privacy discloses the workspace retention sweep it used to deny', () => {
  it('has a sweep to disclose: the service deletes workspace conversations past a window', () => {
    const service = readFileSync(
      path.join(WEB_DIR, 'lib', 'services', 'retention-service.ts'),
      'utf8',
    );
    expect(service).toContain('export async function sweepOrganizationRetention');
    expect(service).toContain('delete from public.web_conversations');
    expect(service).toContain('retention_enforced');
  });

  it('runs that sweep on a schedule registered in vercel.json', () => {
    const schedule = cronSchedule('/api/cron/enforce-workspace-retention');
    expect(/^\d+ \d+ \* \* \*$/u.test(schedule), `not a daily schedule: ${schedule}`).toBe(true);
    const route = readFileSync(
      path.join(APP_DIR, 'api', 'cron', 'enforce-workspace-retention', 'route.ts'),
      'utf8',
    );
    expect(route).toContain('sweepOrganizationRetention');
  });

  it('says so in the retention schedule, with the opt-in and the legal hold', () => {
    const copy = flat('privacy');
    expect(copy).toMatch(/retention window on that workspace/iu);
    expect(copy).toMatch(/nightly scheduled job/iu);
    expect(copy).toMatch(/legal hold/iu);
    expect(copy).toMatch(/off unless the workspace switches it on/iu);
  });

  it('never denies the sweep again', () => {
    const copy = flat('privacy');
    for (const banned of [
      'no per-organisation retention window is enforced on them today',
      'We will not describe one until it runs',
      'no per-organization retention window is enforced',
    ]) {
      expect(
        copy.includes(banned),
        `/privacy denies the workspace retention sweep with "${banned}"`,
      ).toBe(false);
    }
  });
});

describe('/privacy states the erasure table count the code enumerates', () => {
  it('publishes USER_SCOPED_TABLES.length, not a remembered figure', async () => {
    const { USER_SCOPED_TABLES } = await import('@/lib/server/account-erasure');
    const count = USER_SCOPED_TABLES.length;
    expect(count).toBeGreaterThan(0);

    expect(
      flat('privacy'),
      `/privacy must state the real erasure table count (${count}). Update the copy in the same change as the constant.`,
    ).toContain(`${count} user-scoped tables`);
  });

  it('does not restate a count the list does not have', async () => {
    const { USER_SCOPED_TABLES } = await import('@/lib/server/account-erasure');
    const copy = flat('privacy');
    for (const stale of [34, 66, 70]) {
      if (stale === USER_SCOPED_TABLES.length) continue;
      expect(
        copy.includes(`${stale} user-scoped tables`),
        `/privacy is back to the ${stale}-table figure`,
      ).toBe(false);
    }
  });
});

describe('/privacy gives the sandbox reclaim the clock the cron actually has', () => {
  it('does not call the hourly reclaim a daily job', () => {
    const schedule = cronSchedule('/api/cron/reclaim-sandboxes');
    expect(
      /^\d+ \* \* \* \*$/u.test(schedule),
      `reclaim-sandboxes is not hourly: ${schedule}`,
    ).toBe(true);

    const copy = flat('privacy');
    expect(copy).toMatch(/scheduled job that runs every hour enforces a 24-hour age cap/iu);
    expect(
      copy.includes('a daily scheduled job enforces a 24-hour age cap'),
      '/privacy calls the hourly sandbox reclaim a daily job again',
    ).toBe(false);
  });

  it('states the age caps the reclaim module declares', () => {
    const reclaim = readFileSync(path.join(WEB_DIR, 'lib', 'e2b', 'reclaim.ts'), 'utf8');
    expect(reclaim).toContain('export const SANDBOX_MAX_AGE_MS = 24 * 60 * 60 * 1000;');
    expect(reclaim).toContain('export const PAUSED_SANDBOX_MAX_AGE_MS = 2 * 60 * 60 * 1000;');
    expect(flat('privacy')).toMatch(/paused gives its slot up after two hours/iu);
  });
});

const COUNT_WORDS: Record<number, string> = {
  6: 'Six',
  7: 'seven',
  8: 'Eight',
  9: 'nine',
  10: 'Ten',
  11: 'Eleven',
  12: 'Twelve',
  13: 'Thirteen',
  14: 'Fourteen',
};

describe('/trust counts what the code has, not what it had', () => {
  it('names the protected route-group count the proxy matcher enforces', () => {
    const proxy = readFileSync(path.join(WEB_DIR, 'proxy.ts'), 'utf8');
    const block = /const isProtectedAppRoute = [^[]*\[([\s\S]*?)\]/u.exec(proxy);
    expect(block, 'isProtectedAppRoute is gone from proxy.ts').not.toBeNull();
    const groups = [...block![1]!.matchAll(/'\/([a-z-]+)\(\.\*\)'/gu)].map((match) => match[1]!);
    expect(groups.length).toBeGreaterThan(1);

    const word = COUNT_WORDS[groups.length];
    expect(word, `no word for ${groups.length} route groups`).toBeDefined();
    expect(flat('trust')).toContain(`${word} protected route groups`);
    expect(
      flat('trust').includes('Six protected route groups'),
      `/trust claims six protected route groups; proxy.ts matches ${groups.length}`,
    ).toBe(groups.length === 6);
  });

  it('names the security event-type count the audit module declares', () => {
    const audit = readFileSync(path.join(WEB_DIR, 'lib', 'security-audit.ts'), 'utf8');
    const union = /export type SecurityEventType =([\s\S]*?);/u.exec(audit);
    expect(union, 'SecurityEventType is gone from lib/security-audit.ts').not.toBeNull();
    const types = [...union![1]!.matchAll(/'([a-z_]+)'/gu)].map((match) => match[1]!);
    expect(types.length).toBeGreaterThan(1);

    const word = COUNT_WORDS[types.length];
    expect(word, `no word for ${types.length} event types`).toBeDefined();
    expect(flat('trust')).toContain(`Implemented: ${word} event types`);
    expect(
      flat('trust').includes('Implemented: seven event types'),
      `/trust claims seven security event types; the module declares ${types.length}`,
    ).toBe(types.length === 7);
  });

  it('accounts for the two event types that are not failures', () => {
    const audit = readFileSync(path.join(WEB_DIR, 'lib', 'security-audit.ts'), 'utf8');
    expect(audit).toContain("'content_notice'");
    expect(audit).toContain("'retention_purge'");
    const copy = flat('trust');
    expect(copy).toMatch(/content notice/iu);
    expect(copy).toMatch(/retention purge/iu);
  });
});

describe('/subprocessors lists the place-search recipient it was missing', () => {
  it('has a recipient to list: the places provider posts the query to Google', () => {
    const provider = readFileSync(
      path.join(WEB_DIR, 'lib', 'places', 'google-places-provider.ts'),
      'utf8',
    );
    expect(provider).toContain("const GOOGLE_PLACES_API_ORIGIN = 'https://places.googleapis.com'");

    const processor = readFileSync(
      path.join(APP_DIR, 'api', 'llm', 'v1', 'chat', 'completions', 'lib', 'request-processor.ts'),
      'utf8',
    );
    expect(processor).toContain('placesSearchToolDef()');
  });

  it('names Google Places as its own row, separate from Play verification', () => {
    const copy = flat('subprocessors');
    expect(copy).toContain("name: 'Google (Places API)'");
    expect(copy).toMatch(/lib\/places\/google-places-provider\.ts/u);
    expect(copy).toContain("name: 'Google (Play Android Publisher)'");
  });
});

/**
 * The device-storage table claimed to be complete and listed one of the
 * fourteen stores the app persists. Derive the set from the code rather than
 * trusting the next author to remember, because that is exactly what failed.
 */
const SCAN_ROOTS = ['app', 'features', 'shared', 'lib'] as const;
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx']);
const SKIP_DIRECTORIES = new Set(['node_modules', '__tests__', 'e2e', '.next']);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRECTORIES.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, out);
      continue;
    }
    if (!SCAN_EXTENSIONS.has(path.extname(entry))) continue;
    if (/\.(test|spec)\.tsx?$/u.test(entry)) continue;
    out.push(full);
  }
  return out;
}

/** A zustand persist name is a browser storage key, so it is one of these. */
function persistedStoreKeys(): string[] {
  const keys = new Set<string>();
  for (const root of SCAN_ROOTS) {
    for (const file of sourceFiles(path.join(WEB_DIR, root))) {
      const source = readFileSync(file, 'utf8');
      if (!source.includes('persist(')) continue;
      for (const match of source.matchAll(/name: '([a-z][a-zA-Z0-9._:-]*)'/gu)) {
        keys.add(match[1]!);
      }
    }
  }
  return [...keys].sort();
}

/** Direct writes, whether the key is a literal at the call or a named constant. */
function directlyWrittenKeys(): string[] {
  const keys = new Set<string>();
  for (const root of SCAN_ROOTS) {
    for (const file of sourceFiles(path.join(WEB_DIR, root))) {
      const source = readFileSync(file, 'utf8');
      if (!/(?:localStorage|sessionStorage)\.setItem\(/u.test(source)) continue;
      for (const match of source.matchAll(
        /(?:localStorage|sessionStorage)\.setItem\(\s*'([a-zA-Z][a-zA-Z0-9._:-]*)'/gu,
      )) {
        keys.add(match[1]!);
      }
      for (const match of source.matchAll(
        /(?:STORAGE_KEY|KEY_NAME|STORAGE_KEY_NAME)\s*=\s*'([a-zA-Z][a-zA-Z0-9._:-]*)'/gu,
      )) {
        keys.add(match[1]!);
      }
    }
  }
  return [...keys].sort();
}

const PREFIXED = /^agi([-_.:]|worksforce|workforce)/u;

describe('/cookies accounts for every key the app puts in browser storage', () => {
  const persisted = persistedStoreKeys();
  const written = directlyWrittenKeys();

  it('found the keys to check, so an empty scan cannot pass this suite', () => {
    expect(persisted.length).toBeGreaterThan(10);
    expect(written.length).toBeGreaterThan(5);
  });

  it('states the prefix rule that accounts for the keys it does not name', () => {
    const copy = flat('cookies');
    expect(copy).toMatch(/under an agi or agiworkforce prefix/iu);
    expect(copy).toMatch(/Every remaining key the app writes carries one of those two prefixes/iu);
  });

  for (const key of persistedStoreKeys()) {
    it(`names the persisted store ${key}`, () => {
      expect(
        published('cookies'),
        `/cookies omits the persisted store ${key}. Add a row in the same change as the store; a store holds state, not a bare preference, so the prefix row does not cover it.`,
      ).toContain(key);
    });
  }

  for (const key of directlyWrittenKeys()) {
    it(`names ${key}, or leaves it to the prefix rule`, () => {
      const covered = published('cookies').includes(key) || PREFIXED.test(key);
      expect(
        covered,
        `/cookies neither names ${key} nor covers it by prefix, so its device-storage claim is incomplete.`,
      ).toBe(true);
    });
  }

  it('does not repeat the completeness claim it could not back', () => {
    expect(
      flat('cookies').includes('so here it is in full'),
      '/cookies claims a full inventory again without a guard behind it',
    ).toBe(false);
  });
});
