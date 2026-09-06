import { describe, expect, it } from 'vitest';

import { directoryRecord } from './fixtures';

import {
  carrySiteIcon,
  hasResolvedSiteIcon,
  pendingSiteIconSource,
  siteIconUrlOf,
} from '@/lib/connectors/directory/site-icon';

const SITE = 'https://vendor.example.com';
const FAVICON = `${SITE}/favicon.ico`;

function pending(overrides: Parameters<typeof directoryRecord>[0] = { id: 'vendor' }) {
  return directoryRecord({ iconSource: 'site', websiteUrl: SITE, ...overrides });
}

describe('siteIconUrlOf', () => {
  it('prefers the website and falls back to the documentation url', () => {
    expect(siteIconUrlOf(pending())).toBe(SITE);
    expect(
      siteIconUrlOf(
        directoryRecord({ id: 'docs', websiteUrl: null, documentationUrl: `${SITE}/docs` }),
      ),
    ).toBe(`${SITE}/docs`);
    expect(siteIconUrlOf(directoryRecord({ id: 'none' }))).toBeNull();
  });
});

describe('pendingSiteIconSource and hasResolvedSiteIcon', () => {
  it('splits site records by whether the favicon has been found', () => {
    expect(pendingSiteIconSource(pending())).toBe(true);
    expect(hasResolvedSiteIcon(pending())).toBe(false);
    const resolved = pending({ id: 'vendor', iconUrl: FAVICON });
    expect(pendingSiteIconSource(resolved)).toBe(false);
    expect(hasResolvedSiteIcon(resolved)).toBe(true);
    expect(hasResolvedSiteIcon(directoryRecord({ id: 'brand', iconUrl: FAVICON }))).toBe(false);
  });
});

describe('carrySiteIcon', () => {
  it('copies the previously found favicon when the site origin is unchanged', () => {
    const carried = carrySiteIcon(pending(), pending({ id: 'vendor', iconUrl: FAVICON }));
    expect(carried.iconUrl).toBe(FAVICON);
    expect(carried.iconSource).toBe('site');
  });

  it('leaves the record alone without a previous record or a previous icon', () => {
    const record = pending();
    expect(carrySiteIcon(record, undefined)).toBe(record);
    expect(carrySiteIcon(record, pending())).toBe(record);
  });

  it('never carries an icon onto a record that is not pending a site icon', () => {
    const resolved = pending({ id: 'vendor', iconUrl: `${SITE}/apple-touch-icon.png` });
    expect(carrySiteIcon(resolved, pending({ id: 'vendor', iconUrl: FAVICON }))).toBe(resolved);
    const brand = directoryRecord({ id: 'vendor', iconSource: 'brand', brandSlug: 'vendor' });
    expect(carrySiteIcon(brand, pending({ id: 'vendor', iconUrl: FAVICON }))).toBe(brand);
  });

  it('drops the carried icon when the site moved to another origin', () => {
    const moved = pending({ id: 'vendor', websiteUrl: 'https://vendor-moved.example.com' });
    expect(carrySiteIcon(moved, pending({ id: 'vendor', iconUrl: FAVICON }))).toBe(moved);
  });
});
