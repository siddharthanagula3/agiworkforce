import type { DirectoryRecord } from '@/lib/connectors/directory/types';

const BASE_RECORD = {
  publisher: 'example',
  description: 'An example remote MCP server.',
  categories: ['Productivity'],
  remotes: [],
  authMode: 'unknown',
  connectable: 'needs-setup',
  toolNames: [],
  repositoryUrl: null,
  version: '1.0.0',
  sourceRegistry: 'mcp-registry',
  badge: 'community',
  iconUrl: null,
  monogram: 'EX',
  monogramHue: 'other',
  documentationUrl: null,
  iconSource: 'monogram',
  brandSlug: null,
  authorName: 'example',
  authorUrl: null,
  websiteUrl: null,
  supportUrl: null,
  privacyPolicyUrl: null,
};

export function directoryRecordFixture(
  overrides: Partial<DirectoryRecord> & Pick<DirectoryRecord, 'id' | 'name'>,
): DirectoryRecord {
  return { ...BASE_RECORD, ...overrides } as unknown as DirectoryRecord;
}

export function remoteRecordFixture(
  id: string,
  name: string,
  url: string,
  authMode: DirectoryRecord['authMode'],
  overrides: Partial<DirectoryRecord> = {},
): DirectoryRecord {
  return directoryRecordFixture({
    id,
    name,
    authMode,
    remotes: [{ url, transport: 'streamable-http' }],
    ...overrides,
  });
}
