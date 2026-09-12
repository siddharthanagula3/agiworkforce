import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_DIR = path.resolve(__dirname, '..', '..');

const PAGES = {
  security: path.join(APP_DIR, 'security', 'page.tsx'),
  trust: path.join(APP_DIR, 'trust', 'page.tsx'),
  status: path.join(APP_DIR, 'status', 'page.tsx'),
  sla: path.join(APP_DIR, 'sla', 'page.tsx'),
} as const;

type PageName = keyof typeof PAGES;

function read(page: PageName): string {
  return readFileSync(PAGES[page], 'utf8');
}

function rendered(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');
}

const UNFALSIFIABLE_HEDGES = [
  'is designed to',
  'are designed to',
  'designed to be',
  'where available',
  'where enabled',
  'should not be able',
  'must keep',
  'is expected to',
  'are expected to',
] as const;

describe('trust surface, falsifiable statements', () => {
  for (const page of Object.keys(PAGES) as PageName[]) {
    it(`/${page} states controls instead of hedging them`, () => {
      const source = rendered(read(page)).toLowerCase();
      const hits = UNFALSIFIABLE_HEDGES.filter((hedge) => source.includes(hedge));
      expect(hits).toEqual([]);
    });
  }
});

describe('trust surface, the honest-gap sections stay present', () => {
  it('/security keeps a "what we have not done" section', () => {
    const source = read('security');
    expect(source).toContain('id="not-done"');
    expect(source.toLowerCase()).toContain('what we have not done');
  });

  it('/security names the absent assurances explicitly', () => {
    const lower = read('security').toLowerCase();
    expect(lower).toContain('no soc 2');
    expect(lower).toContain('not certified');
    expect(lower).toContain('no third-party penetration test has been performed');
  });

  it('/security publishes a coordinated-disclosure process, not just an address', () => {
    const source = read('security');
    expect(source).toContain('id="report"');
    expect(source).toContain('contactMailto(CONTACT_SUBJECTS.security)');
    const lower = source.toLowerCase();
    expect(lower).toContain('safe harbour');
    expect(lower).toContain('in scope');
    expect(lower).toContain('out of scope');
  });

  it('/security names row-level-security coverage without a stale route count', () => {
    const source = read('security');
    expect(source).toContain('The user-scoped client is used by chat and conversation sync');
    expect(source).toContain('Other privileged routes must enforce authenticated ownership');
    expect(source).not.toMatch(/\d+ of \d+ hosted API route files/);
  });

  it('/security names the audit-log schedule that actually owns the purge', () => {
    const source = read('security');
    expect(source).toContain('Retention is 90 days and it is scheduled');
    expect(source).not.toContain('a scheduled job purges old rows');
  });

  it('/trust carries dates, which is what its headline promises', () => {
    const source = read('trust');
    expect(source).toContain('LAST_REVIEWED');
    expect(source).toContain('NEXT_REVIEW');
    expect(source.match(/As of \d{4}-\d{2}-\d{2}/gu)?.length ?? 0).toBeGreaterThan(10);
  });

  it('/sla does not promise a named human or a contractual commitment', () => {
    const lower = rendered(read('sla')).toLowerCase();
    expect(lower).not.toContain('named support contact');
    expect(lower).toContain('not a binding commitment');
  });

  it('/status describes its own check mechanism correctly', () => {
    const lower = read('status').toLowerCase();
    expect(lower).toContain('in-process');
    expect(lower).not.toContain('call to our health endpoint');
    expect(lower).toContain('not covered');
  });
});

describe('trust surface, pages reference each other', () => {
  const EXPECTED_LINKS: Record<PageName, string[]> = {
    security: ['/trust', '/status', '/sla', '/privacy', '/subprocessors', '/dpa'],
    trust: ['/security', '/status', '/sla', '/privacy', '/subprocessors', '/dpa'],
    status: ['/security', '/sla'],
    sla: ['/security', '/trust', '/status'],
  };

  for (const page of Object.keys(PAGES) as PageName[]) {
    it(`/${page} links to the rest of the surface`, () => {
      const source = read(page);
      for (const href of EXPECTED_LINKS[page]) {
        expect(source).toContain(`"${href}"`);
      }
    });
  }
});

describe('trust surface, managed cloud maturity is stated', () => {
  for (const page of ['security', 'trust', 'status', 'sla'] as PageName[]) {
    it(`/${page} calls Managed Cloud a public alpha`, () => {
      expect(read(page).toLowerCase()).toContain('public alpha');
    });
  }
});

describe('trust surface, the erasure figure is derived, not remembered', () => {
  it('publishes the real USER_SCOPED_TABLES length on /security and /trust', async () => {
    const { USER_SCOPED_TABLES } = await import('@/lib/server/account-erasure');
    const count = USER_SCOPED_TABLES.length;

    expect(count).toBeGreaterThan(0);

    for (const page of ['security', 'trust'] as PageName[]) {
      const source = read(page);
      expect(
        source,
        `/${page} must state the real erasure table count (${count}). Update the copy in the same change as the constant.`,
      ).toContain(`${count} user-scoped tables`);
    }
  });
});

/**
 * Pre-release claim audit, 2026-09-12. Four statements on /security had drifted
 * away from the code that decides them: an edge-protection count of six against
 * twelve matcher groups, an erasure batch of 25 against a constant of 100, a
 * daily sandbox reclaim against an hourly cron, and a flat denial that anything
 * schedules the security-log retention routine while vercel.json schedules it.
 * Each case below reads the deciding source rather than a remembered number,
 * and bans the phrasing that shipped so a rewrite cannot restore it.
 */

const PROXY_SOURCE = path.join(APP_DIR, '..', 'proxy.ts');
const PURGE_ACCOUNTS_ROUTE = path.join(
  APP_DIR,
  'api',
  'cron',
  'purge-deleted-accounts',
  'route.ts',
);
const VERCEL_MANIFEST = path.join(APP_DIR, '..', '..', '..', 'vercel.json');

const COUNT_WORDS: Record<number, string> = {
  6: 'Six',
  8: 'Eight',
  10: 'Ten',
  11: 'Eleven',
  12: 'Twelve',
  13: 'Thirteen',
  14: 'Fourteen',
};

function protectedRouteGroups(): string[] {
  const source = readFileSync(PROXY_SOURCE, 'utf8');
  const block = /const isProtectedAppRoute = [^[]*\[([\s\S]*?)\]/u.exec(source);
  expect(block, 'isProtectedAppRoute is gone from proxy.ts').not.toBeNull();
  return [...block![1]!.matchAll(/'\/([a-z-]+)\(\.\*\)'/gu)].map((match) => match[1]!);
}

function cronSchedule(cronPath: string): string {
  const manifest = JSON.parse(readFileSync(VERCEL_MANIFEST, 'utf8')) as {
    crons?: Array<{ path: string; schedule: string }>;
  };
  const entry = manifest.crons?.find((cron) => cron.path === cronPath);
  expect(entry, `${cronPath} is not scheduled in vercel.json`).toBeDefined();
  return entry!.schedule;
}

describe('/security, access control states the edge coverage the proxy enforces', () => {
  it('names every protected route group, and counts them correctly', () => {
    const groups = protectedRouteGroups();
    expect(groups.length).toBeGreaterThan(1);
    const word = COUNT_WORDS[groups.length];
    expect(word, `no word for ${groups.length} route groups`).toBeDefined();

    const source = read('security');
    expect(source).toContain(`${word} route groups`);
    for (const group of groups) {
      expect(source, `/security omits the protected route group ${group}`).toMatch(
        new RegExp(`route groups \\([^)]*\\b${group}\\b`, 'u'),
      );
    }
  });

  it('never restates a route-group count the proxy does not match', () => {
    const groups = protectedRouteGroups();
    const source = read('security');
    for (const [count, word] of Object.entries(COUNT_WORDS)) {
      if (Number(count) === groups.length) continue;
      expect(
        source.includes(`${word} route groups`),
        `/security claims ${word} protected route groups; proxy.ts matches ${groups.length}`,
      ).toBe(false);
    }
  });
});

describe('/security, the deletion mechanism matches the jobs that run it', () => {
  it('states the batch size the purge route actually claims', () => {
    const route = readFileSync(PURGE_ACCOUNTS_ROUTE, 'utf8');
    const declared = /const MAX_ACCOUNTS_PER_RUN = ([\d_]+)/u.exec(route);
    expect(declared, 'MAX_ACCOUNTS_PER_RUN is gone from the purge route').not.toBeNull();
    const batch = Number(declared![1]!.replace(/_/gu, ''));

    const source = read('security');
    expect(source).toContain(`up to ${batch} pending accounts per run`);
    expect(
      /up to 25 pending accounts per run/u.test(source),
      '/security is back to the 25-account batch the route never used',
    ).toBe(false);
  });

  it('does not describe the hourly sandbox reclaim as a daily job', () => {
    const schedule = cronSchedule('/api/cron/reclaim-sandboxes');
    const hourly = /^(\d+) \* \* \* \*$/u.exec(schedule);
    expect(hourly, `reclaim-sandboxes is no longer hourly: ${schedule}`).not.toBeNull();

    const source = read('security');
    expect(source).toContain(`${hourly![1]!} minutes past every hour`);
    expect(
      /reclaim sandboxes at \d{2}:\d{2} UTC/u.test(source),
      '/security gives the hourly sandbox reclaim a daily clock time again',
    ).toBe(false);
  });

  it('keeps the daily account, media and temporary-chat times tied to vercel.json', () => {
    const source = read('security');
    const daily: Array<[string, string]> = [
      ['/api/cron/purge-deleted-accounts', 'runs daily at'],
      ['/api/cron/purge-deleted-media', 'purge deleted media at'],
      ['/api/cron/purge-temporary-chats', 'temporary chats at'],
    ];
    for (const [cronPath, phrase] of daily) {
      const parts = cronSchedule(cronPath).split(' ');
      const clock = `${parts[1]!.padStart(2, '0')}:${parts[0]!.padStart(2, '0')} UTC`;
      expect(source, `/security states the wrong clock time for ${cronPath}`).toContain(
        `${phrase} ${clock}`,
      );
    }
  });
});

describe('/security, security-log retention admits the cron that enforces it', () => {
  it('states the retention window and the schedule from the code that owns them', async () => {
    const { SECURITY_AUDIT_LOG_RETENTION_DAYS, SECURITY_LOG_RETENTION_CRON_PATH } =
      await import('@/lib/server/security-log-retention');
    const parts = cronSchedule(SECURITY_LOG_RETENTION_CRON_PATH).split(' ');
    const clock = `${parts[1]!.padStart(2, '0')}:${parts[0]!.padStart(2, '0')} UTC`;

    const source = read('security');
    expect(source).toContain(`Retention is ${SECURITY_AUDIT_LOG_RETENTION_DAYS} days`);
    expect(source).toContain(`a cron-authenticated job at ${clock}`);
  });

  it('never denies the schedule again', () => {
    const source = read('security');
    for (const banned of [
      'no scheduled route invokes it today',
      'automatic expiry is not promised',
      'no scheduled route invokes it',
    ]) {
      expect(
        source.includes(banned),
        `/security denies the security-log retention cron with "${banned}"`,
      ).toBe(false);
    }
  });
});
