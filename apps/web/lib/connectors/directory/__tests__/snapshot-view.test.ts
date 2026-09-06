import { describe, expect, it } from 'vitest';

import {
  DIRECTORY_AUTH_MODES,
  DIRECTORY_BADGES,
  DIRECTORY_CONNECTABLE_MODES,
  compareDirectoryRecordsByName,
  computeDirectoryCounts,
  hasNetworkRemote,
  isConnectableNow,
  networkRemoteUrl,
  orderDirectoryRecords,
  withDefaultBadge,
} from '@/lib/connectors/directory/snapshot-view';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';
import { directoryRecord } from './fixtures';

function storedWithoutBadge(id: string, overrides: Partial<DirectoryRecord> = {}) {
  const { badge: _badge, ...rest } = directoryRecord({ id, ...overrides });
  return rest;
}

describe('directory enumerations', () => {
  it('lists every badge, connectable mode and auth mode in rank order', () => {
    expect(DIRECTORY_BADGES).toEqual([
      'first-party',
      'official',
      'verified',
      'registry',
      'community',
    ]);
    expect(DIRECTORY_CONNECTABLE_MODES).toEqual([
      'connect',
      'api-key-form',
      'desktop-and-cli',
      'needs-setup',
    ]);
    expect(DIRECTORY_AUTH_MODES).toEqual(['none', 'oauth', 'api-key', 'unknown']);
  });
});

describe('networkRemoteUrl', () => {
  it('skips stdio remotes and picks the first network transport', () => {
    const record = directoryRecord({
      id: 'mixed',
      remotes: [
        { url: 'stdio://local', transport: 'stdio' },
        { url: 'https://sse.example.com/sse', transport: 'sse' },
        { url: 'https://http.example.com/mcp', transport: 'streamable-http' },
      ],
    });
    expect(networkRemoteUrl(record)).toBe('https://sse.example.com/sse');
    expect(hasNetworkRemote(record)).toBe(true);
  });

  it('reports no network remote for stdio-only and packages-only records', () => {
    expect(
      networkRemoteUrl(
        directoryRecord({ id: 'stdio', remotes: [{ url: 'stdio://x', transport: 'stdio' }] }),
      ),
    ).toBeNull();
    expect(hasNetworkRemote(directoryRecord({ id: 'packages', remotes: [] }))).toBe(false);
  });
});

describe('isConnectableNow', () => {
  it('treats connect and api-key-form as connectable and the other modes as not', () => {
    expect(isConnectableNow(directoryRecord({ id: 'a', connectable: 'connect' }))).toBe(true);
    expect(isConnectableNow(directoryRecord({ id: 'b', connectable: 'api-key-form' }))).toBe(true);
    expect(isConnectableNow(directoryRecord({ id: 'c', connectable: 'desktop-and-cli' }))).toBe(
      false,
    );
    expect(isConnectableNow(directoryRecord({ id: 'd', connectable: 'needs-setup' }))).toBe(false);
  });
});

describe('computeDirectoryCounts', () => {
  it('counts the whole snapshot by connectable mode, badge and remote presence', () => {
    const counts = computeDirectoryCounts([
      directoryRecord({ id: 'a', badge: 'first-party', connectable: 'connect' }),
      directoryRecord({ id: 'b', badge: 'registry', connectable: 'api-key-form' }),
      directoryRecord({ id: 'c', badge: 'community', connectable: 'needs-setup' }),
      directoryRecord({ id: 'd', badge: 'community', connectable: 'desktop-and-cli', remotes: [] }),
      directoryRecord({ id: 'e', badge: 'official', connectable: 'connect' }),
    ]);

    expect(counts).toEqual({
      totalRecords: 5,
      remoteRecords: 4,
      byConnectable: { connect: 2, 'api-key-form': 1, 'desktop-and-cli': 1, 'needs-setup': 1 },
      byBadge: { 'first-party': 1, official: 1, verified: 0, registry: 1, community: 2 },
    });
  });

  it('zero-fills every bucket for an empty snapshot', () => {
    const counts = computeDirectoryCounts([]);
    expect(counts.totalRecords).toBe(0);
    expect(counts.remoteRecords).toBe(0);
    expect(Object.values(counts.byConnectable)).toEqual([0, 0, 0, 0]);
    expect(Object.values(counts.byBadge)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('orderDirectoryRecords', () => {
  const records = [
    directoryRecord({ id: 'community-plain', name: 'Alpha', badge: 'community' }),
    directoryRecord({
      id: 'community-rich',
      name: 'Zulu',
      badge: 'community',
      iconUrl: 'https://cdn.example.com/z.png',
    }),
    directoryRecord({ id: 'registry-no-desc', name: 'Beta', badge: 'registry', description: ' ' }),
    directoryRecord({ id: 'registry-rich', name: 'Gamma', badge: 'registry', brandSlug: 'gamma' }),
    directoryRecord({ id: 'verified-plain', name: 'Delta', badge: 'verified' }),
    directoryRecord({ id: 'official-plain', name: 'Epsilon', badge: 'official' }),
    directoryRecord({ id: 'first-party-b', name: 'notion', badge: 'first-party', brandSlug: 'n' }),
    directoryRecord({ id: 'first-party-a', name: 'Notion', badge: 'first-party', brandSlug: 'n' }),
  ];

  it('groups first-party, official, verified, registry, then community, with complete records first and names ordered inside a group', () => {
    expect(orderDirectoryRecords(records).map((record) => record.id)).toEqual([
      'first-party-a',
      'first-party-b',
      'official-plain',
      'verified-plain',
      'registry-rich',
      'registry-no-desc',
      'community-rich',
      'community-plain',
    ]);
  });

  it('puts featured records first inside their badge group, then complete ones, then the name key', () => {
    const featuredBare = {
      ...directoryRecord({
        id: 'community-featured-bare',
        name: 'Zed',
        badge: 'community',
        description: ' ',
      }),
      featured: true,
    };
    const featuredRich = {
      ...directoryRecord({
        id: 'community-featured-rich',
        name: 'Beta',
        badge: 'community',
        brandSlug: 'beta',
      }),
      featured: true,
    };
    const unfeaturedRich = directoryRecord({
      id: 'community-rich',
      name: 'Alpha',
      badge: 'community',
      brandSlug: 'alpha',
    });
    const higherGroupPlain = directoryRecord({
      id: 'official-plain',
      name: 'Omega',
      badge: 'official',
    });
    const explicitlyNotFeatured = {
      ...directoryRecord({
        id: 'community-off',
        name: 'Aardvark',
        badge: 'community',
        brandSlug: 'a',
      }),
      featured: false,
    };

    const ordered = orderDirectoryRecords([
      unfeaturedRich,
      featuredBare,
      explicitlyNotFeatured,
      higherGroupPlain,
      featuredRich,
    ]);

    expect(ordered.map((record) => record.id)).toEqual([
      'official-plain',
      'community-featured-rich',
      'community-featured-bare',
      'community-off',
      'community-rich',
    ]);
  });

  it('is deterministic regardless of input order', () => {
    const reversed = orderDirectoryRecords([...records].reverse());
    expect(reversed.map((record) => record.id)).toEqual(
      orderDirectoryRecords(records).map((record) => record.id),
    );
  });

  it('does not mutate its input', () => {
    const input = [...records];
    orderDirectoryRecords(input);
    expect(input.map((record) => record.id)).toEqual(records.map((record) => record.id));
  });
});

describe('compareDirectoryRecordsByName', () => {
  it('orders by name case-insensitively and falls back to id', () => {
    const sorted = [
      directoryRecord({ id: 'b', name: 'slack' }),
      directoryRecord({ id: 'a', name: 'Slack' }),
      directoryRecord({ id: 'c', name: 'Asana' }),
    ].sort(compareDirectoryRecordsByName);
    expect(sorted.map((record) => record.id)).toEqual(['c', 'a', 'b']);
  });

  it('sorts on the name with leading punctuation, currency signs and emoji stripped, letters before digits', () => {
    const sorted = [
      directoryRecord({ id: 'com.00widget/00widget', name: '00Widget' }),
      directoryRecord({ id: 'com.dotprompts/dotprompts', name: '.prompts' }),
      directoryRecord({ id: 'org.imqueue/mcp', name: '@imqueue' }),
      directoryRecord({ id: 'io.github.nirholas/three-token-mcp', name: '$THREE Token' }),
      directoryRecord({ id: 'com.transcriptapi/youtube', name: '💯 YouTube Transcript' }),
      directoryRecord({ id: 'zapier', name: 'Zapier' }),
      directoryRecord({ id: 'com.1inch.business/mcp', name: '1inch' }),
      directoryRecord({ id: 'asana', name: 'Asana' }),
    ].sort(compareDirectoryRecordsByName);
    expect(sorted.map((record) => record.id)).toEqual([
      'asana',
      'org.imqueue/mcp',
      'com.dotprompts/dotprompts',
      'io.github.nirholas/three-token-mcp',
      'com.transcriptapi/youtube',
      'zapier',
      'com.00widget/00widget',
      'com.1inch.business/mcp',
    ]);
  });

  it('breaks a tie on the stripped key with the full name before the id', () => {
    const sorted = [
      directoryRecord({ id: 'a', name: 'notion' }),
      directoryRecord({ id: 'z', name: '@notion' }),
      directoryRecord({ id: 'm', name: 'Notion' }),
    ].sort(compareDirectoryRecordsByName);
    expect(sorted.map((record) => record.id)).toEqual(['z', 'a', 'm']);
  });
});

describe('withDefaultBadge', () => {
  it('reads a registry record persisted without a badge as community', () => {
    expect(withDefaultBadge(storedWithoutBadge('io.github.someone/tool')).badge).toBe('community');
  });

  it('reads an internal record persisted without a badge as first-party', () => {
    expect(
      withDefaultBadge(storedWithoutBadge('notion', { sourceRegistry: 'internal' })).badge,
    ).toBe('first-party');
  });

  it('treats a badge value this build does not know as absent', () => {
    expect(withDefaultBadge({ ...storedWithoutBadge('x'), badge: 'platinum' }).badge).toBe(
      'community',
    );
  });

  it('returns a record that already carries a badge untouched', () => {
    const record = directoryRecord({ id: 'official', badge: 'official' });
    expect(withDefaultBadge(record)).toBe(record);
  });
});
