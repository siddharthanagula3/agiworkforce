import type { DirectoryRecord } from '@/lib/connectors/directory/types';

type RecordOverrides = Partial<DirectoryRecord> & Pick<DirectoryRecord, 'id'>;

function hostFor(id: string): string {
  return id.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
}

export function directoryRecord(overrides: RecordOverrides): DirectoryRecord {
  return {
    name: overrides.id,
    publisher: 'publisher',
    description: `${overrides.id} description`,
    categories: ['Other'],
    remotes: [
      { url: `https://${hostFor(overrides.id)}.example.com/mcp`, transport: 'streamable-http' },
    ],
    authMode: 'unknown',
    connectable: 'needs-setup',
    toolNames: [],
    repositoryUrl: null,
    version: null,
    sourceRegistry: 'mcp-registry',
    badge: 'community',
    iconUrl: null,
    monogram: 'X',
    monogramHue: 'other',
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
