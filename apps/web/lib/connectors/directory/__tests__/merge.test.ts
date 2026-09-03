import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/connectors/oauth-registry', () => ({
  isConnectorOAuthConfigured: () => false,
}));
vi.mock('@/lib/github-app', () => ({
  isGitHubAppConfigured: () => true,
  isGitHubInstallationLinkingAvailable: () => true,
}));

import { CONNECTORS } from '@/features/connectors/data/connectors';
import { applyFirstPartyTargets } from '@/lib/connectors/directory/first-party';
import {
  buildInternalDirectoryRecords,
  mergeDirectoryRecords,
} from '@/lib/connectors/directory/merge';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';

function internalRecord(overrides: Partial<DirectoryRecord> = {}): DirectoryRecord {
  return {
    id: 'notion',
    name: 'Notion',
    publisher: 'Notion',
    description: 'Read and write Notion pages.',
    categories: ['Productivity'],
    remotes: [{ url: 'https://mcp.notion.com/mcp', transport: 'streamable-http' }],
    authMode: 'oauth',
    connectable: 'connect',
    toolNames: [],
    repositoryUrl: null,
    version: null,
    sourceRegistry: 'internal',
    badge: 'first-party',
    iconUrl: null,
    monogram: 'N',
    documentationUrl: null,
    iconSource: 'monogram',
    brandSlug: null,
    authorName: 'Notion',
    authorUrl: null,
    websiteUrl: null,
    supportUrl: null,
    privacyPolicyUrl: null,
    ...overrides,
  };
}

function registryRecord(overrides: Partial<DirectoryRecord> = {}): DirectoryRecord {
  return {
    id: 'io.github.someone/notion-mirror',
    name: 'Notion mirror',
    publisher: 'someone',
    description: 'A community mirror of the Notion MCP server.',
    categories: ['Other'],
    remotes: [{ url: 'https://mcp.notion.com/mcp', transport: 'streamable-http' }],
    authMode: 'unknown',
    connectable: 'needs-setup',
    toolNames: ['create_page', 'update_page'],
    repositoryUrl: 'https://github.com/someone/notion-mirror',
    version: '1.0.0',
    sourceRegistry: 'mcp-registry',
    badge: 'registry',
    iconUrl: null,
    monogram: 'NM',
    documentationUrl: null,
    iconSource: 'monogram',
    brandSlug: null,
    authorName: 'someone',
    authorUrl: 'https://github.com/someone',
    websiteUrl: null,
    supportUrl: null,
    privacyPolicyUrl: null,
    ...overrides,
  };
}

describe('mergeDirectoryRecords', () => {
  it('keeps an internal id as the identity when a registry entry targets the same host', () => {
    const merged = mergeDirectoryRecords([internalRecord()], [registryRecord()]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe('notion');
    expect(merged[0]?.sourceRegistry).toBe('internal');
    expect(merged[0]?.connectable).toBe('connect');
  });

  it('enriches empty internal fields from the matched registry record without overwriting real values', () => {
    const merged = mergeDirectoryRecords(
      [internalRecord({ toolNames: [], repositoryUrl: null })],
      [registryRecord()],
    );

    expect(merged[0]?.toolNames).toEqual(['create_page', 'update_page']);
    expect(merged[0]?.repositoryUrl).toBe('https://github.com/someone/notion-mirror');
  });

  it('never overwrites an internal record that already has tool names', () => {
    const merged = mergeDirectoryRecords(
      [internalRecord({ toolNames: ['search'] })],
      [registryRecord({ toolNames: ['create_page'] })],
    );

    expect(merged[0]?.toolNames).toEqual(['search']);
  });

  it('adds an unmatched registry record under its own id', () => {
    const merged = mergeDirectoryRecords(
      [internalRecord()],
      [
        registryRecord({
          id: 'io.github.someone/unrelated',
          remotes: [{ url: 'https://unrelated.example.com/mcp', transport: 'streamable-http' }],
        }),
      ],
    );

    expect(merged).toHaveLength(2);
    expect(merged.map((record) => record.id).sort()).toEqual([
      'io.github.someone/unrelated',
      'notion',
    ]);
  });

  it('never adds a registry entry that would duplicate an id already merged', () => {
    const merged = mergeDirectoryRecords([internalRecord()], [registryRecord({ id: 'notion' })]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.sourceRegistry).toBe('internal');
  });

  it('keeps the richer of the two descriptions and unions categories', () => {
    const merged = mergeDirectoryRecords(
      [internalRecord({ description: 'Notion.', categories: ['Productivity'] })],
      [
        registryRecord({
          description: 'A community mirror of the Notion MCP server.',
          categories: ['Code'],
        }),
      ],
    );

    expect(merged[0]?.description).toBe('A community mirror of the Notion MCP server.');
    expect(merged[0]?.categories).toEqual(['Productivity', 'Code']);
  });

  it('never lets a registry match downgrade the internal badge', () => {
    const merged = mergeDirectoryRecords([internalRecord()], [registryRecord()]);

    expect(merged[0]?.badge).toBe('first-party');
  });

  it('fills in a missing icon and docs url from the matched registry record', () => {
    const merged = mergeDirectoryRecords(
      [internalRecord({ iconUrl: null, documentationUrl: null, iconSource: 'monogram' })],
      [
        registryRecord({
          iconUrl: 'https://cdn.example.com/notion-mirror.png',
          documentationUrl: 'https://example.com/docs',
          iconSource: 'registry',
        }),
      ],
    );

    expect(merged[0]?.iconUrl).toBe('https://cdn.example.com/notion-mirror.png');
    expect(merged[0]?.documentationUrl).toBe('https://example.com/docs');
    expect(merged[0]?.iconSource).toBe('registry');
  });

  it('never lets a lower-priority registry icon source downgrade a brand match', () => {
    const merged = mergeDirectoryRecords(
      [internalRecord({ iconSource: 'brand', brandSlug: 'notion' })],
      [registryRecord({ iconSource: 'site', iconUrl: 'https://cdn.example.com/favicon.ico' })],
    );

    expect(merged[0]?.iconSource).toBe('brand');
    expect(merged[0]?.brandSlug).toBe('notion');
  });

  it('fills in a missing author url and website url from the matched registry record', () => {
    const merged = mergeDirectoryRecords(
      [internalRecord({ authorUrl: null, websiteUrl: null })],
      [
        registryRecord({
          authorUrl: 'https://github.com/someone',
          websiteUrl: 'https://example.com',
        }),
      ],
    );

    expect(merged[0]?.authorUrl).toBe('https://github.com/someone');
    expect(merged[0]?.websiteUrl).toBe('https://example.com');
  });
});

describe('applyFirstPartyTargets', () => {
  it('overrides a stale internal remote for a provider the first-party file flags as superseded', () => {
    const [jira] = applyFirstPartyTargets([
      internalRecord({
        id: 'jira',
        remotes: [{ url: 'https://mcp.atlassian.com/v1/sse', transport: 'sse' }],
      }),
    ]);

    expect(jira?.remotes).toEqual([
      { url: 'https://mcp.atlassian.com/v2/mcp', transport: 'streamable-http' },
    ]);
    expect(jira?.toolNames).toContain('getJiraIssue');
  });

  it('keeps an already-correct internal remote when the first-party file does not flag it as stale', () => {
    const [notion] = applyFirstPartyTargets([internalRecord({ id: 'notion' })]);

    expect(notion?.remotes).toEqual([
      { url: 'https://mcp.notion.com/mcp', transport: 'streamable-http' },
    ]);
    expect(notion?.documentationUrl).toBe(
      'https://developers.notion.com/guides/mcp/mcp-supported-tools',
    );
  });

  it('fills in a real remote for a catalog entry that had none at all', () => {
    const [gmail] = applyFirstPartyTargets([internalRecord({ id: 'gmail', remotes: [] })]);

    expect(gmail?.remotes).toEqual([
      { url: 'https://gmailmcp.googleapis.com/mcp/v1', transport: 'streamable-http' },
    ]);
  });

  it('leaves records with no first-party target untouched', () => {
    const [other] = applyFirstPartyTargets([internalRecord({ id: 'stripe' })]);

    expect(other?.documentationUrl).toBeNull();
  });

  it('derives categories for a first-party target through the same keyword rules as the registry', () => {
    const [hubspot] = applyFirstPartyTargets([internalRecord({ id: 'hubspot', categories: [] })]);

    expect(hubspot?.categories).toContain('Sales and marketing');
  });

  it('keeps the richer of the internal and first-party descriptions', () => {
    const [gmail] = applyFirstPartyTargets([
      internalRecord({ id: 'gmail', description: 'Gmail.' }),
    ]);

    expect(gmail?.description).toBe('Search, draft, and send email through Gmail.');
  });

  it('adds a directory-only provider as a standalone record with no wired remote', () => {
    const withStandalone = applyFirstPartyTargets(buildInternalDirectoryRecords());
    const microsoft365 = withStandalone.find((record) => record.id === 'microsoft-365');

    expect(microsoft365).toBeDefined();
    expect(microsoft365?.remotes).toEqual([]);
    expect(microsoft365?.connectable).toBe('needs-setup');
    expect(microsoft365?.badge).toBe('first-party');
  });

  it('applies exactly one standalone record on top of the full internal catalog, with no duplicate ids', () => {
    const internal = buildInternalDirectoryRecords();
    const withStandalone = applyFirstPartyTargets(internal);

    expect(withStandalone).toHaveLength(internal.length + 1);
    expect(new Set(withStandalone.map((record) => record.id)).size).toBe(withStandalone.length);
  });

  it('keeps the brand icon source it already had from the connector id, for a provider we ship a mark for', () => {
    const [jira] = applyFirstPartyTargets([
      internalRecord({ id: 'jira', iconSource: 'brand', brandSlug: 'jira' }),
    ]);

    expect(jira?.iconSource).toBe('brand');
    expect(jira?.brandSlug).toBe('jira');
  });

  it('upgrades a monogram-only provider to site once a documentation url exists', () => {
    const [slack] = applyFirstPartyTargets([
      internalRecord({ id: 'slack', iconSource: 'monogram' }),
    ]);

    expect(slack?.iconSource).toBe('site');
  });

  it('derives an author url from the documentation url origin', () => {
    const [notion] = applyFirstPartyTargets([internalRecord({ id: 'notion', authorUrl: null })]);

    expect(notion?.authorUrl).toBe('https://developers.notion.com');
  });

  it('gives the microsoft-365 standalone record a site icon source, not brand', () => {
    const microsoft365 = applyFirstPartyTargets(buildInternalDirectoryRecords()).find(
      (record) => record.id === 'microsoft-365',
    );

    expect(microsoft365?.iconSource).toBe('site');
    expect(microsoft365?.brandSlug).toBeNull();
    expect(microsoft365?.authorUrl).toBe('https://learn.microsoft.com');
  });
});

describe('buildInternalDirectoryRecords', () => {
  it('produces one directory record per catalog connector, all sourced internally', () => {
    const records = buildInternalDirectoryRecords();

    expect(records).toHaveLength(CONNECTORS.length);
    expect(records.every((record) => record.sourceRegistry === 'internal')).toBe(true);
    expect(new Set(records.map((record) => record.id)).size).toBe(CONNECTORS.length);
  });

  it('gives the self-service Notion connector a real MCP remote and a connect state', () => {
    const notion = buildInternalDirectoryRecords().find((record) => record.id === 'notion');

    expect(notion?.remotes).toEqual([
      { url: 'https://mcp.notion.com/mcp', transport: 'streamable-http' },
    ]);
    expect(notion?.connectable).toBe('connect');
  });

  it('marks a connector with a verified simple-icons entry as a brand icon', () => {
    const notion = buildInternalDirectoryRecords().find((record) => record.id === 'notion');

    expect(notion?.iconSource).toBe('brand');
    expect(notion?.brandSlug).toBe('notion');
  });

  it('falls back to monogram for a connector with no simple-icons entry', () => {
    const slack = buildInternalDirectoryRecords().find((record) => record.id === 'slack');

    expect(slack?.iconSource).toBe('monogram');
    expect(slack?.brandSlug).toBeNull();
  });
});
