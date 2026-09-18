/**
 * The shared site policy engine and the three extension gates that consume it.
 *
 * The regression this file exists for: the user allowlist used to be the whole
 * decision, so an origin the user had approved stayed reachable to browser
 * automation, downloads and page tools after an admin blocked it. Each gate
 * below is driven with a user-approved origin that the org blocks.
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SITE_POLICY_ADMIN_UNAVAILABLE,
  evaluateSitePolicy,
  parseAdminSitePolicy,
  parseSitePolicyPattern,
  type AdminSitePolicy,
  type SitePolicyInput,
} from '@agiworkforce/types';

const TAB_ID = 77;

const local: Record<string, unknown> = {};
const managed: Record<string, unknown> = {};
const grantedOrigins = new Set<string>();
const tabs = new Map<number, { id: number; url: string }>();

function areaFor(backing: Record<string, unknown>, failing: () => boolean) {
  return {
    get: vi.fn((keys?: unknown) => {
      if (failing()) return Promise.reject(new Error('storage unavailable'));
      if (typeof keys === 'string') return Promise.resolve({ [keys]: backing[keys] });
      if (Array.isArray(keys)) {
        return Promise.resolve(Object.fromEntries(keys.map((key) => [key, backing[key]])));
      }
      return Promise.resolve({ ...backing });
    }),
    set: vi.fn((items: Record<string, unknown>) => {
      Object.assign(backing, items);
      return Promise.resolve();
    }),
  };
}

let localFails = false;
let managedFails = false;

vi.stubGlobal('chrome', {
  runtime: { id: 'site-policy-test', lastError: undefined },
  storage: {
    local: areaFor(local, () => localFails),
    managed: areaFor(managed, () => managedFails),
    session: areaFor({}, () => false),
  },
  permissions: {
    contains: vi.fn((permissions: { origins?: string[] }) =>
      Promise.resolve((permissions.origins ?? []).every((p) => grantedOrigins.has(p))),
    ),
  },
  tabs: {
    get: vi.fn((tabId: number) => {
      const tab = tabs.get(tabId);
      return tab ? Promise.resolve(tab) : Promise.reject(new Error('no tab'));
    }),
  },
  downloads: {
    download: vi.fn(() => Promise.resolve(1)),
    search: vi.fn(() => Promise.resolve([])),
    show: vi.fn(),
    onChanged: { addListener: vi.fn() },
  },
  debugger: {
    attach: vi.fn((_t: unknown, _v: string, cb: () => void) => cb()),
    detach: vi.fn((_t: unknown, cb: () => void) => cb()),
    sendCommand: vi.fn((_t: unknown, _m: string, _p: unknown, cb: (r: unknown) => void) => cb({})),
    onEvent: { addListener: vi.fn(), removeListener: vi.fn() },
    onDetach: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});

import {
  ADMIN_SITE_POLICY_STORAGE_KEY,
  evaluateSiteAccess,
} from '../src/features/site-policy/store';
import { SITE_ALLOWLIST_STORAGE_KEY } from '../src/background/policy';
import { assertDestinationAllowlisted } from '../src/features/computer-use/cdpDriver';
import { resolveDownloadUrl } from '../src/features/browser-tools/downloads';
import { authorizeBrowserToolTab } from '../src/features/browser-tools/tabAuthority';

const PARTNER = 'https://partner.example';
const BLOCKED = 'https://leak.example';

function setUserAllowlist(origins: string[]): void {
  local[SITE_ALLOWLIST_STORAGE_KEY] = origins;
}

function setAdminPolicy(document: unknown): void {
  if (document === undefined) delete local[ADMIN_SITE_POLICY_STORAGE_KEY];
  else local[ADMIN_SITE_POLICY_STORAGE_KEY] = document;
}

function input(admin: SitePolicyInput['admin'], userAllowlist: string[]): SitePolicyInput {
  return { admin, userAllowlist };
}

function policy(partial: Partial<AdminSitePolicy>): AdminSitePolicy {
  return { version: 1, blocklist: [], allowlist: [], ...partial };
}

beforeEach(() => {
  localFails = false;
  managedFails = false;
  for (const key of Object.keys(local)) delete local[key];
  for (const key of Object.keys(managed)) delete managed[key];
  grantedOrigins.clear();
  tabs.clear();
});

describe('parseSitePolicyPattern', () => {
  it('accepts an exact origin and a wildcard subdomain pattern', () => {
    expect(parseSitePolicyPattern('https://example.com')).toMatchObject({
      scheme: 'https',
      host: 'example.com',
      wildcard: false,
    });
    expect(parseSitePolicyPattern('https://*.example.com')).toMatchObject({
      host: 'example.com',
      wildcard: true,
    });
  });

  it('rejects patterns that would widen or mean nothing', () => {
    for (const pattern of [
      'example.com',
      '*.example.com',
      'ftp://example.com',
      'https://example.com/path',
      'https://user:pw@example.com',
      'https://*',
      '',
    ]) {
      expect(parseSitePolicyPattern(pattern)).toBeNull();
    }
  });
});

describe('evaluateSitePolicy, wildcard subdomains', () => {
  const wildcard = policy({ allowlist: [{ pattern: 'https://*.example.com' }] });

  it('matches the pattern host and every subdomain of it', () => {
    for (const url of [
      'https://example.com/a',
      'https://app.example.com/a',
      'https://eu.app.example.com/a',
    ]) {
      expect(evaluateSitePolicy(input(wildcard, []), url, 'automation').allowed).toBe(true);
    }
  });

  it('does not match a suffix that is not a subdomain boundary', () => {
    expect(
      evaluateSitePolicy(input(wildcard, []), 'https://notexample.com', 'automation').allowed,
    ).toBe(false);
    expect(
      evaluateSitePolicy(input(wildcard, []), 'https://example.com.evil.test', 'automation')
        .allowed,
    ).toBe(false);
  });

  it('does not cross scheme or port', () => {
    expect(
      evaluateSitePolicy(input(wildcard, []), 'http://app.example.com', 'automation').allowed,
    ).toBe(false);
    expect(
      evaluateSitePolicy(input(wildcard, []), 'https://app.example.com:8443', 'automation').allowed,
    ).toBe(false);
  });
});

describe('evaluateSitePolicy, precedence', () => {
  it('blocks what the admin blocked even when the user approved it', () => {
    const blocking = policy({ blocklist: [{ pattern: 'https://*.example.com' }] });
    const decision = evaluateSitePolicy(
      input(blocking, ['https://app.example.com']),
      'https://app.example.com/page',
      'automation',
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('admin-blocked');
    expect(decision.matchedPattern).toBe('https://*.example.com');
  });

  it('blocks what the admin blocked even when the admin allowlist also matches', () => {
    const conflicting = policy({
      blocklist: [{ pattern: 'https://secret.example.com' }],
      allowlist: [{ pattern: 'https://*.example.com' }],
    });
    expect(
      evaluateSitePolicy(input(conflicting, []), 'https://secret.example.com', 'automation').reason,
    ).toBe('admin-blocked');
    expect(
      evaluateSitePolicy(input(conflicting, []), 'https://open.example.com', 'automation').allowed,
    ).toBe(true);
  });

  it('bounds the user allowlist by a non-empty admin allowlist', () => {
    const bounded = policy({ allowlist: [{ pattern: 'https://work.example' }] });
    expect(
      evaluateSitePolicy(
        input(bounded, ['https://personal.example']),
        'https://personal.example',
        'automation',
      ).reason,
    ).toBe('outside-admin-allowlist');
    expect(
      evaluateSitePolicy(input(bounded, []), 'https://work.example', 'automation').allowed,
    ).toBe(true);
  });

  it('is fail-closed with no lists at all', () => {
    expect(
      evaluateSitePolicy(input(null, []), 'https://anything.example', 'automation'),
    ).toMatchObject({ allowed: false, reason: 'not-allowlisted' });
  });

  it('denies everything while the admin policy is unreadable', () => {
    expect(
      evaluateSitePolicy(
        input(SITE_POLICY_ADMIN_UNAVAILABLE, ['https://work.example']),
        'https://work.example',
        'automation',
      ),
    ).toMatchObject({ allowed: false, reason: 'admin-unavailable' });
  });

  it('refuses non-http(s) destinations before any list is read', () => {
    expect(
      evaluateSitePolicy(input(null, ['javascript:evil']), 'javascript:alert(1)', 'automation')
        .reason,
    ).toBe('unsupported-scheme');
  });
});

describe('evaluateSitePolicy, upload and download are separate rules', () => {
  const uploadBlocked = policy({
    blocklist: [{ pattern: 'https://*.example.com', capabilities: ['upload'] }],
    allowlist: [{ pattern: 'https://*.example.com' }],
  });

  it('blocks only the capability the rule names', () => {
    const url = 'https://app.example.com/form';
    expect(evaluateSitePolicy(input(uploadBlocked, []), url, 'upload')).toMatchObject({
      allowed: false,
      reason: 'admin-blocked',
    });
    expect(evaluateSitePolicy(input(uploadBlocked, []), url, 'download').allowed).toBe(true);
    expect(evaluateSitePolicy(input(uploadBlocked, []), url, 'automation').allowed).toBe(true);
  });

  it('grants only the capabilities an allow rule names', () => {
    const readOnly = policy({
      allowlist: [{ pattern: 'https://archive.example', capabilities: ['automation'] }],
    });
    expect(
      evaluateSitePolicy(input(readOnly, []), 'https://archive.example/f', 'automation').allowed,
    ).toBe(true);
    expect(
      evaluateSitePolicy(input(readOnly, []), 'https://archive.example/f', 'download'),
    ).toMatchObject({ allowed: false, reason: 'outside-admin-allowlist' });
  });
});

describe('parseAdminSitePolicy', () => {
  it('accepts plain patterns and capability-scoped rules', () => {
    const parsed = parseAdminSitePolicy({
      version: 2,
      blocklist: ['https://*.leak.example'],
      allowlist: [{ pattern: 'https://work.example', capabilities: ['automation', 'download'] }],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.policy.blocklist[0]).toEqual({ pattern: 'https://*.leak.example' });
    expect(parsed.policy.allowlist[0]?.capabilities).toEqual(['automation', 'download']);
  });

  it('rejects a document rather than dropping the rules it cannot read', () => {
    for (const document of [
      null,
      [],
      { blocklist: [] },
      { version: 0, blocklist: [] },
      { version: 1, blocklist: ['example.com'] },
      { version: 1, blocklist: [{ pattern: 'https://a.example', capabilities: [] }] },
      { version: 1, allowlist: [{ pattern: 'https://a.example', capabilities: ['print'] }] },
      { version: 1, allowlist: 'https://a.example' },
    ]) {
      expect(parseAdminSitePolicy(document).ok).toBe(false);
    }
  });
});

describe('extension store, admin policy carriers', () => {
  it('prefers the managed document over the workspace copy', async () => {
    setUserAllowlist([PARTNER]);
    setAdminPolicy({ version: 1, blocklist: [] });
    managed[ADMIN_SITE_POLICY_STORAGE_KEY] = { version: 1, blocklist: [{ pattern: PARTNER }] };
    await expect(evaluateSiteAccess(`${PARTNER}/x`, 'automation')).resolves.toMatchObject({
      allowed: false,
      reason: 'admin-blocked',
    });
  });

  it('falls back to the workspace copy when no managed document is set', async () => {
    setUserAllowlist([PARTNER]);
    setAdminPolicy({ version: 1, blocklist: [{ pattern: PARTNER }] });
    await expect(evaluateSiteAccess(`${PARTNER}/x`, 'automation')).resolves.toMatchObject({
      reason: 'admin-blocked',
    });
  });

  it('denies when a carrier holds a document it cannot parse', async () => {
    setUserAllowlist([PARTNER]);
    setAdminPolicy({ version: 1, blocklist: ['not-a-pattern'] });
    await expect(evaluateSiteAccess(`${PARTNER}/x`, 'automation')).resolves.toMatchObject({
      reason: 'admin-unavailable',
    });
  });

  it('denies when the managed area cannot be read at all', async () => {
    setUserAllowlist([PARTNER]);
    managedFails = true;
    await expect(evaluateSiteAccess(`${PARTNER}/x`, 'automation')).resolves.toMatchObject({
      reason: 'admin-unavailable',
    });
  });

  it('allows an approved origin when no org policy exists', async () => {
    setUserAllowlist([PARTNER]);
    await expect(evaluateSiteAccess(`${PARTNER}/x`, 'automation')).resolves.toMatchObject({
      allowed: true,
    });
  });
});

describe('the admin blocklist reaches every gate', () => {
  beforeEach(() => {
    setUserAllowlist([PARTNER, BLOCKED]);
    setAdminPolicy({
      version: 1,
      blocklist: [{ pattern: BLOCKED }, { pattern: PARTNER, capabilities: ['download', 'upload'] }],
    });
    grantedOrigins.add(`${PARTNER}/*`);
    grantedOrigins.add(`${BLOCKED}/*`);
  });

  it('cdpDriver refuses to navigate to a user-approved origin the org blocked', async () => {
    await expect(assertDestinationAllowlisted(`${BLOCKED}/steal`)).rejects.toThrow(
      /blocked by your organization's site policy/,
    );
    await expect(assertDestinationAllowlisted(`${PARTNER}/ok`)).resolves.toBeUndefined();
  });

  it('browser tools refuse a tab on a blocked origin', async () => {
    tabs.set(TAB_ID, { id: TAB_ID, url: `${BLOCKED}/page` });
    await expect(authorizeBrowserToolTab(TAB_ID)).rejects.toThrow(
      /blocked by your organization's site policy/,
    );
  });

  it('downloads honour a download-only block on an otherwise allowed site', async () => {
    await expect(resolveDownloadUrl(`${PARTNER}/file.pdf`, `${PARTNER}/page`)).rejects.toThrow(
      /File download on "https:\/\/partner.example" is blocked by your organization's site policy/,
    );
  });

  it('downloads still refuse an origin nobody approved', async () => {
    await expect(
      resolveDownloadUrl('https://unknown.example/f.pdf', `${PARTNER}/page`),
    ).rejects.toThrow(/site allowlist/);
  });
});
