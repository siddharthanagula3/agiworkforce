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
});
