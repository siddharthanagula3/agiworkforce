import { describe, expect, it } from 'vitest';

import { ConnectorDirectoryEntrySchema } from '../connector-directory';

const SNAPSHOT_ENTRY_BEFORE_DATES = {
  id: 'com.example/notes',
  name: 'Notes MCP',
  publisher: 'example',
  description: 'Sync notes.',
  categories: ['Productivity'],
  remotes: [{ url: 'https://notes.example.com/mcp', transport: 'streamable-http' }],
  authMode: 'none',
  connectable: 'connect',
  toolNames: [],
  repositoryUrl: null,
  version: null,
  sourceRegistry: 'mcp-registry',
  badge: 'community',
  iconUrl: null,
  monogram: 'NM',
  documentationUrl: null,
  iconSource: 'monogram',
  brandSlug: null,
  authorName: null,
  authorUrl: null,
  websiteUrl: null,
  supportUrl: null,
  privacyPolicyUrl: null,
  toolCount: 0,
  connectorUrl: 'https://notes.example.com/mcp',
};

describe('ConnectorDirectoryEntrySchema dates', () => {
  it('still loads an entry stored before publishedAt and firstSeenAt existed', () => {
    const parsed = ConnectorDirectoryEntrySchema.safeParse(SNAPSHOT_ENTRY_BEFORE_DATES);
    expect(parsed.success).toBe(true);
    expect(parsed.data).not.toHaveProperty('publishedAt');
    expect(parsed.data).not.toHaveProperty('firstSeenAt');
  });

  it('carries both dates when present', () => {
    const parsed = ConnectorDirectoryEntrySchema.parse({
      ...SNAPSHOT_ENTRY_BEFORE_DATES,
      publishedAt: '2026-07-29T13:00:17.314082Z',
      firstSeenAt: '2026-10-01T06:03:00.000Z',
    });
    expect(parsed.publishedAt).toBe('2026-07-29T13:00:17.314082Z');
    expect(parsed.firstSeenAt).toBe('2026-10-01T06:03:00.000Z');
  });
});
