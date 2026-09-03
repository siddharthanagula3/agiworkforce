import { describe, expect, it } from 'vitest';

import {
  brandSlugForConnectorId,
  brandSlugForPublisher,
} from '@/lib/connectors/directory/brand-icons';

describe('brandSlugForConnectorId', () => {
  it('resolves a known internal id to its simple-icons slug', () => {
    expect(brandSlugForConnectorId('notion')).toBe('notion');
    expect(brandSlugForConnectorId('google-drive')).toBe('googledrive');
  });

  it('returns null for a connector with no simple-icons entry', () => {
    expect(brandSlugForConnectorId('slack')).toBeNull();
    expect(brandSlugForConnectorId('canva')).toBeNull();
    expect(brandSlugForConnectorId('microsoft-365')).toBeNull();
  });

  it('returns null for an unrecognized id', () => {
    expect(brandSlugForConnectorId('not-a-real-connector')).toBeNull();
  });
});

describe('brandSlugForPublisher', () => {
  it('matches a publisher name that normalizes onto a verified slug', () => {
    expect(brandSlugForPublisher('Notion')).toBe('notion');
    expect(brandSlugForPublisher('Google Drive')).toBe('googledrive');
  });

  it('returns null for a publisher with no verified brand mark', () => {
    expect(brandSlugForPublisher('Slack')).toBeNull();
    expect(brandSlugForPublisher('smithery.ai')).toBeNull();
  });
});
