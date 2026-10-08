import type {
  ConnectorDirectoryAuthMode,
  ConnectorDirectoryBadge,
  ConnectorDirectoryConnectableMode,
  ConnectorDirectoryIconSource,
  ConnectorDirectoryMonogramHue,
  ConnectorDirectorySource,
  ConnectorDirectoryTransport,
} from '@agiworkforce/cloud-contracts';

export type DirectoryTransport = ConnectorDirectoryTransport;

export type DirectoryAuthMode = ConnectorDirectoryAuthMode;

export type DirectoryConnectableMode = ConnectorDirectoryConnectableMode;

export type DirectorySource = ConnectorDirectorySource;

export type DirectoryBadge = ConnectorDirectoryBadge;

export type DirectoryIconSource = ConnectorDirectoryIconSource;

export type DirectoryMonogramHue = ConnectorDirectoryMonogramHue;

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
  readonly publishedAt?: string;
  readonly firstSeenAt?: string;
}

export interface DirectorySnapshot {
  readonly records: readonly DirectoryRecord[];
  readonly nextIngestCursor: string | null;
  readonly bootstrapComplete: boolean;
  readonly lastSyncAt: string | null;
  readonly updatedAt: string;
}
