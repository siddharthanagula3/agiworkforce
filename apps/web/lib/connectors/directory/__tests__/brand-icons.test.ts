import { describe, expect, it } from 'vitest';

import {
  brandSlugForConnectorId,
  brandSlugForHost,
  brandSlugForPublisher,
  brandSlugForPublisherHandle,
  brandSlugForSignals,
  isVerifiedBrandSlug,
} from '@/lib/connectors/directory/brand-icons';

describe('brandSlugForConnectorId', () => {
  it('resolves a known internal id to its simple-icons slug', () => {
    expect(brandSlugForConnectorId('notion')).toBe('notion');
    expect(brandSlugForConnectorId('google-drive')).toBe('googledrive');
  });

  it('returns null for a connector whose mark simple-icons does not carry', () => {
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

  it('maps a GitHub organisation handle onto the brand it publishes for', () => {
    expect(brandSlugForPublisher('getsentry')).toBe('sentry');
    expect(brandSlugForPublisher('HewlettPackard')).toBe('hp');
    expect(brandSlugForPublisher('makenotion')).toBe('notion');
  });

  it('returns null for a publisher with no verified brand mark', () => {
    expect(brandSlugForPublisher('Slack')).toBeNull();
    expect(brandSlugForPublisher('smithery.ai')).toBeNull();
  });
});

describe('brandSlugForPublisherHandle', () => {
  it('answers only from the verified organisation table, never from slug names', () => {
    expect(brandSlugForPublisherHandle('makenotion')).toBe('notion');
    expect(brandSlugForPublisherHandle('SonarSource')).toBe('sonarqubeserver');
    expect(brandSlugForPublisherHandle('notion')).toBeNull();
    expect(brandSlugForPublisherHandle('meta')).toBeNull();
  });
});

describe('brandSlugForHost', () => {
  it('matches a vendor host by any parent label', () => {
    expect(brandSlugForHost('mcp.notion.com')).toBe('notion');
    expect(brandSlugForHost('api.githubcopilot.com')).toBe('github');
    expect(brandSlugForHost('drivemcp.googleapis.com')).toBe('google');
  });

  it('never matches a hosting platform or code forge host', () => {
    expect(brandSlugForHost('notion.workers.dev')).toBeNull();
    expect(brandSlugForHost('github.com')).toBeNull();
  });
});

describe('brandSlugForSignals', () => {
  it('prefers the remote host, then the publisher, then the repository owner', () => {
    expect(
      brandSlugForSignals({
        publisher: 'someone',
        hosts: ['mcp.linear.app'],
        repositoryOwner: 'x',
      }),
    ).toBe('linear');
    expect(brandSlugForSignals({ publisher: 'getsentry', hosts: ['x.workers.dev'] })).toBe(
      'sentry',
    );
    expect(
      brandSlugForSignals({ publisher: 'someone', hosts: [], repositoryOwner: 'neondatabase' }),
    ).toBe('neon');
  });

  it('returns null when no signal names a brand', () => {
    expect(brandSlugForSignals({ publisher: 'someone', hosts: ['x.example.com'] })).toBeNull();
  });
});

describe('isVerifiedBrandSlug', () => {
  it('accepts a slug from any of the brand tables', () => {
    expect(isVerifiedBrandSlug('notion')).toBe(true);
    expect(isVerifiedBrandSlug('hp')).toBe(true);
    expect(isVerifiedBrandSlug('nope')).toBe(false);
  });
});
