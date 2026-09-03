import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getIconForUrl: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/connectors/directory/icon-fetch', () => ({
  getIconForUrl: (...args: unknown[]) => mocks.getIconForUrl(...args),
}));

import {
  pendingSiteIconSource,
  probeSiteFavicon,
  resolveSiteIconForRecord,
} from '@/lib/connectors/directory/favicon-probe';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';

describe('probeSiteFavicon', () => {
  beforeEach(() => vi.clearAllMocks());

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

  it('returns null when neither candidate resolves', async () => {
    mocks.getIconForUrl.mockResolvedValue(null);

    await expect(probeSiteFavicon('https://example.com')).resolves.toBeNull();
  });

  it('returns null for an unparseable site url', async () => {
    await expect(probeSiteFavicon('not a url')).resolves.toBeNull();
    expect(mocks.getIconForUrl).not.toHaveBeenCalled();
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
  beforeEach(() => vi.clearAllMocks());

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
