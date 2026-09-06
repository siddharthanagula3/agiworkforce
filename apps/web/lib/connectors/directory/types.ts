export type DirectoryTransport = 'streamable-http' | 'sse' | 'stdio';

export type DirectoryAuthMode = 'none' | 'oauth' | 'api-key' | 'unknown';

export type DirectoryConnectableMode =
  | 'connect'
  | 'api-key-form'
  | 'desktop-and-cli'
  | 'needs-setup';

export type DirectorySource = 'internal' | 'mcp-registry';

export type DirectoryBadge = 'first-party' | 'official' | 'verified' | 'registry' | 'community';

export type DirectoryIconSource = 'brand' | 'registry' | 'site' | 'monogram';

export type DirectoryMonogramHue =
  | 'code'
  | 'communication'
  | 'data'
  | 'design'
  | 'financial-services'
  | 'health'
  | 'legal'
  | 'life-sciences'
  | 'productivity'
  | 'sales-and-marketing'
  | 'other';

export interface DirectoryRemote {
  readonly url: string;
  readonly transport: DirectoryTransport;
}

export interface DirectoryRecord {
  readonly id: string;
  readonly name: string;
  readonly publisher: string;
  readonly description: string;
  readonly categories: readonly string[];
  readonly remotes: readonly DirectoryRemote[];
  readonly authMode: DirectoryAuthMode;
  readonly connectable: DirectoryConnectableMode;
  readonly toolNames: readonly string[];
  readonly repositoryUrl: string | null;
  readonly version: string | null;
  readonly sourceRegistry: DirectorySource;
  readonly badge: DirectoryBadge;
  readonly iconUrl: string | null;
  readonly monogram: string;
  readonly monogramHue?: DirectoryMonogramHue;
  readonly featured?: boolean;
  readonly listingNote?: string;
  readonly documentationUrl: string | null;
  readonly iconSource: DirectoryIconSource;
  readonly brandSlug: string | null;
  readonly authorName: string | null;
  readonly authorUrl: string | null;
  readonly websiteUrl: string | null;
  readonly supportUrl: string | null;
  readonly privacyPolicyUrl: string | null;
}

export interface DirectorySnapshot {
  readonly records: readonly DirectoryRecord[];
  readonly nextIngestCursor: string | null;
  readonly bootstrapComplete: boolean;
  readonly lastSyncAt: string | null;
  readonly updatedAt: string;
}
