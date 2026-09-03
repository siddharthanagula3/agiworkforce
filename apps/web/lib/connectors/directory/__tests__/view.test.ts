import { describe, expect, it } from 'vitest';

import { toDirectoryEntryView } from '@/lib/connectors/directory/view';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';

function record(overrides: Partial<DirectoryRecord> = {}): DirectoryRecord {
  return {
    id: 'notion',
    name: 'Notion',
    publisher: 'Notion',
    description: 'd',
    categories: [],
    remotes: [],
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
    authorName: null,
    authorUrl: null,
    websiteUrl: null,
    supportUrl: null,
    privacyPolicyUrl: null,
    ...overrides,
  };
}

describe('toDirectoryEntryView', () => {
  it('counts the known tool names', () => {
    const view = toDirectoryEntryView(record({ toolNames: ['a', 'b', 'c'] }));
    expect(view.toolCount).toBe(3);
  });

  it('exposes the primary remote url as connectorUrl', () => {
    const view = toDirectoryEntryView(
      record({ remotes: [{ url: 'https://mcp.notion.com/mcp', transport: 'streamable-http' }] }),
    );
    expect(view.connectorUrl).toBe('https://mcp.notion.com/mcp');
  });

  it('gives a null connectorUrl when there is no remote', () => {
    const view = toDirectoryEntryView(record({ remotes: [] }));
    expect(view.connectorUrl).toBeNull();
  });

  it('carries every other record field through unchanged', () => {
    const source = record({ authorName: 'Notion', websiteUrl: 'https://notion.so' });
    const view = toDirectoryEntryView(source);
    expect(view.authorName).toBe('Notion');
    expect(view.websiteUrl).toBe('https://notion.so');
  });
});
