import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getIconForUrl: vi.fn(),
  fetchPageHead: vi.fn(),
  query: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({
    query: (...args: unknown[]) => mocks.query(...args),
    execute: (...args: unknown[]) => mocks.execute(...args),
  }),
}));
vi.mock('@/lib/connectors/directory/icon-fetch', () => ({
  getIconForUrl: (...args: unknown[]) => mocks.getIconForUrl(...args),
  fetchPageHead: (...args: unknown[]) => mocks.fetchPageHead(...args),
}));

import {
  MAX_LINKED_ICON_CANDIDATES,
  SITE_FAVICON_TTL_MS,
  pendingSiteIconSource,
  probeSiteFavicon,
  resolveSiteIconForRecord,
} from '@/lib/connectors/directory/favicon-probe';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';

const SITE_FAVICON_CACHE_METHOD = 'connectors.directory.site-favicon';
const CLOSE_PAGE = 'https://www.close.com/';
const CLOSE_CDN = 'https://cdn.prod.website-files.com/61717799a852418a278cfa9b';
const ICON = { contentType: 'image/png', base64: 'AA' };

function recorded(name: string): string {
  return readFileSync(join(__dirname, 'recorded', name), 'utf8');
}

function iconRequests(): string[] {
  return mocks.getIconForUrl.mock.calls.map(([url]) => url as string);
}

function cachedRow(value: string) {
  return { value, stamp: '1', expires_at_ms: String(Date.now() + 60_000), scope: 'public' };
}

function cacheWrites(): unknown[][] {
  return mocks.query.mock.calls
    .filter(([sql]) => typeof sql === 'string' && sql.includes('insert'))
    .map(([, params]) => params as unknown[]);
}

describe('probeSiteFavicon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue([]);
  });

  it('returns the favicon.ico candidate when it resolves', async () => {
    mocks.getIconForUrl.mockResolvedValueOnce({ contentType: 'image/x-icon', base64: 'AA' });

    await expect(probeSiteFavicon('https://example.com/some/path')).resolves.toBe(
      'https://example.com/favicon.ico',
    );
  });

  it('falls back to apple-touch-icon.png when favicon.ico fails', async () => {
    mocks.getIconForUrl.mockResolvedValueOnce(null);
    mocks.getIconForUrl.mockResolvedValueOnce({ contentType: 'image/png', base64: 'AA' });

    await expect(probeSiteFavicon('https://example.com')).resolves.toBe(
      'https://example.com/apple-touch-icon.png',
    );
  });

  it('returns null when neither candidate resolves and the page head is unavailable', async () => {
    mocks.getIconForUrl.mockResolvedValue(null);
    mocks.fetchPageHead.mockResolvedValue(null);

    await expect(probeSiteFavicon('https://example.com')).resolves.toBeNull();
    expect(mocks.fetchPageHead).toHaveBeenCalledWith('https://example.com/');
  });

  it('never reads the page head when a well-known path serves an icon', async () => {
    mocks.getIconForUrl.mockResolvedValueOnce(ICON);

    await expect(probeSiteFavicon('https://example.com')).resolves.toBe(
      'https://example.com/favicon.ico',
    );
    expect(mocks.fetchPageHead).not.toHaveBeenCalled();
  });

  it('falls back to the icons the recorded close.com head declares, in rank order', async () => {
    mocks.getIconForUrl.mockImplementation(async (url: string) =>
      url === `${CLOSE_CDN}/69e787e66659174d6c555923_favicon.png` ? ICON : null,
    );
    mocks.fetchPageHead.mockResolvedValueOnce({
      url: CLOSE_PAGE,
      html: recorded('close-com-head.html'),
    });

    await expect(probeSiteFavicon('https://close.com')).resolves.toBe(
      `${CLOSE_CDN}/69e787e66659174d6c555923_favicon.png`,
    );
    expect(iconRequests()).toEqual([
      'https://close.com/favicon.ico',
      'https://close.com/apple-touch-icon.png',
      `${CLOSE_CDN}/69e787e66659174d6c555923_favicon.png`,
    ]);
  });

  it('tries at most four linked candidates from the recorded clay.com head', async () => {
    mocks.getIconForUrl.mockResolvedValue(null);
    mocks.fetchPageHead.mockResolvedValueOnce({
      url: 'https://www.clay.com/',
      html: recorded('clay-com-head.html'),
    });

    await expect(probeSiteFavicon('https://clay.com')).resolves.toBeNull();
    expect(iconRequests()).toHaveLength(2 + MAX_LINKED_ICON_CANDIDATES);
    expect(
      iconRequests()
        .slice(2)
        .every((url) => url.startsWith('https://cdn.prod.website-files.com/')),
    ).toBe(true);
  });

  it('returns null for an unparseable site url', async () => {
    await expect(probeSiteFavicon('not a url')).resolves.toBeNull();
    expect(mocks.getIconForUrl).not.toHaveBeenCalled();
    expect(mocks.fetchPageHead).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('reuses a cached verdict for the origin instead of fetching again', async () => {
    mocks.query.mockResolvedValueOnce([cachedRow('https://example.com/apple-touch-icon.png')]);

    await expect(probeSiteFavicon('https://example.com/pricing')).resolves.toBe(
      'https://example.com/apple-touch-icon.png',
    );
    expect(mocks.getIconForUrl).not.toHaveBeenCalled();
  });

  it('remembers a miss so the next probe of that origin skips the network', async () => {
    mocks.query.mockResolvedValueOnce([cachedRow('')]);

    await expect(probeSiteFavicon('https://example.com')).resolves.toBeNull();
    expect(mocks.getIconForUrl).not.toHaveBeenCalled();
  });

  it('writes the verdict for the origin with a bounded lifetime, hit or miss', async () => {
    const before = Date.now();
    mocks.getIconForUrl.mockResolvedValue(null);
    mocks.fetchPageHead.mockResolvedValue(null);
    await probeSiteFavicon('https://example.com/some/path');
    mocks.getIconForUrl.mockResolvedValue({ contentType: 'image/x-icon', base64: 'AA' });
    await probeSiteFavicon('https://other.example.com');

    const writes = cacheWrites();
    expect(writes).toHaveLength(2);
    expect(writes[0]?.slice(0, 4)).toEqual([
      SITE_FAVICON_CACHE_METHOD,
      'https://example.com',
      '',
      '',
    ]);
    expect(writes[1]?.slice(0, 4)).toEqual([
      SITE_FAVICON_CACHE_METHOD,
      'https://other.example.com',
      '',
      'https://other.example.com/favicon.ico',
    ]);
    for (const write of writes) {
      expect(Number(write[4])).toBeGreaterThanOrEqual(before + SITE_FAVICON_TTL_MS);
    }
  });
});

function pendingRecord(overrides: Partial<DirectoryRecord> = {}): DirectoryRecord {
  return {
    id: 'x',
    name: 'x',
    publisher: 'x',
    description: 'd',
    categories: [],
    remotes: [],
    authMode: 'oauth',
    connectable: 'connect',
    toolNames: [],
    repositoryUrl: null,
    version: null,
    sourceRegistry: 'mcp-registry',
    badge: 'community',
    iconUrl: null,
    monogram: 'X',
    documentationUrl: null,
    iconSource: 'site',
    brandSlug: null,
    authorName: null,
    authorUrl: null,
    websiteUrl: 'https://example.com',
    supportUrl: null,
    privacyPolicyUrl: null,
    ...overrides,
  };
}

describe('pendingSiteIconSource', () => {
  it('is pending when iconSource is site and iconUrl is unresolved', () => {
    expect(pendingSiteIconSource(pendingRecord())).toBe(true);
  });

  it('is not pending once an icon url is set', () => {
    expect(
      pendingSiteIconSource(pendingRecord({ iconUrl: 'https://example.com/favicon.ico' })),
    ).toBe(false);
  });

  it('is not pending for any other icon source', () => {
    expect(pendingSiteIconSource(pendingRecord({ iconSource: 'monogram' }))).toBe(false);
  });
});

describe('resolveSiteIconForRecord', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue([]);
  });

  it('leaves an already-resolved record untouched', async () => {
    const record = pendingRecord({ iconUrl: 'https://example.com/favicon.ico' });
    await expect(resolveSiteIconForRecord(record)).resolves.toBe(record);
    expect(mocks.getIconForUrl).not.toHaveBeenCalled();
  });

  it('sets the icon url once a favicon is found', async () => {
    mocks.getIconForUrl.mockResolvedValueOnce({ contentType: 'image/x-icon', base64: 'AA' });

    const resolved = await resolveSiteIconForRecord(pendingRecord());

    expect(resolved.iconUrl).toBe('https://example.com/favicon.ico');
    expect(resolved.iconSource).toBe('site');
  });

  it('downgrades to monogram when no favicon is found', async () => {
    mocks.getIconForUrl.mockResolvedValue(null);
    mocks.fetchPageHead.mockResolvedValue(null);

    const resolved = await resolveSiteIconForRecord(pendingRecord());

    expect(resolved.iconSource).toBe('monogram');
  });

  it('downgrades to monogram immediately when there is no site url at all', async () => {
    const resolved = await resolveSiteIconForRecord(
      pendingRecord({ websiteUrl: null, documentationUrl: null }),
    );

    expect(resolved.iconSource).toBe('monogram');
    expect(mocks.getIconForUrl).not.toHaveBeenCalled();
  });
});
