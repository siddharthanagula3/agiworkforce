export type DirectoryTransport = 'streamable-http' | 'sse' | 'stdio';

export type DirectoryAuthMode = 'none' | 'oauth' | 'api-key' | 'unknown';

export type DirectoryConnectableMode =
  | 'connect'
  | 'api-key-form'
  | 'desktop-and-cli'
  | 'needs-setup';

export type DirectorySource = 'internal' | 'mcp-registry';

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
}

export interface DirectorySnapshot {
  readonly records: readonly DirectoryRecord[];
  readonly nextIngestCursor: string | null;
  readonly updatedAt: string;
}
