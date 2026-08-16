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

describe('trust surface — falsifiable statements', () => {
  for (const page of Object.keys(PAGES) as PageName[]) {
    it(`/${page} states controls instead of hedging them`, () => {
      const source = rendered(read(page)).toLowerCase();
      const hits = UNFALSIFIABLE_HEDGES.filter((hedge) => source.includes(hedge));
      expect(hits).toEqual([]);
    });
  }
});

describe('trust surface — the honest-gap sections stay present', () => {
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

  it('/security does not claim an audit-log schedule that has no route owner', () => {
    const source = read('security');
    expect(source).toContain('no scheduled route invokes it today');
    expect(source).not.toContain('a scheduled job purges old rows');
  });

  it('/trust carries dates, which is what its headline promises', () => {
    const source = read('trust');
    expect(source).toContain('LAST_REVIEWED');
    expect(source).toContain('NEXT_REVIEW');
    expect(source.match(/asOf: '\d{4}-\d{2}-\d{2}'/gu)?.length ?? 0).toBeGreaterThan(10);
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

describe('trust surface — pages reference each other', () => {
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

describe('trust surface — managed cloud maturity is stated', () => {
  for (const page of ['security', 'trust', 'status', 'sla'] as PageName[]) {
    it(`/${page} calls Managed Cloud a public alpha`, () => {
      expect(read(page).toLowerCase()).toContain('public alpha');
    });
  }
});

describe('trust surface — the erasure figure is derived, not remembered', () => {
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
