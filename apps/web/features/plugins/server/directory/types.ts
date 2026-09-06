import type { PluginRegistryEntry } from '@agiworkforce/types';
import type { PLUGIN_SORTS, PLUGIN_SOURCE_FACETS, PLUGIN_WORKS_WITH } from './constants';

export type PluginWorksWith = (typeof PLUGIN_WORKS_WITH)[number];
export type PluginDirectorySort = (typeof PLUGIN_SORTS)[number];
export type PluginSourceFacet = (typeof PLUGIN_SOURCE_FACETS)[number];

export type PluginMcpTransportKind = 'stdio' | 'http' | 'sse' | 'unknown';

export interface PluginMcpServerSummary {
  name: string;
  transport: PluginMcpTransportKind;
}

export interface PluginRuntimeComponents {
  skills: string[];
  skillPaths: string[];
  commands: number;
  agents: number;
  hooks: boolean;
  mcpServers: PluginMcpServerSummary[];
  lspServers: string[];
}

export interface PluginRuntimeFit {
  webInstallable: boolean;
  inspected: boolean;
  components: PluginRuntimeComponents;
  note: string | null;
}

export interface PluginSourceLocation {
  repositoryUrl: string;
  ref: string | null;
  sha: string | null;
  path: string | null;
}

export interface PluginMarketplaceRef {
  name: string;
  repositoryUrl: string | null;
  manifestUrl: string | null;
  contentHash: string | null;
}

export interface PluginDirectoryEntry extends PluginRegistryEntry {
  slug: string;
  sourceFacet: PluginSourceFacet;
  verified: boolean;
  installs: number | null;
  worksWith: PluginWorksWith[];
  repositoryUrl: string | null;
  marketplace: PluginMarketplaceRef | null;
  installCommand: string | null;
  runtime: PluginRuntimeFit;
  sourceLocation: PluginSourceLocation | null;
}

export interface PluginDirectoryStats {
  totalPlugins: number;
  verified: number;
  bySource: Record<PluginSourceFacet, number>;
  byWorksWith: Record<PluginWorksWith, number>;
}

export interface PluginDirectoryListResponse {
  entries: PluginDirectoryEntry[];
  total: number;
  nextCursor: string | null;
  stats: PluginDirectoryStats;
}

export interface PluginInspectionRecord {
  key: string;
  treeSha: string;
  inspectedAt: string;
  version: string | null;
  description: string | null;
  components: PluginRuntimeComponents;
}

export interface PublicDirectoryCard {
  slug: string;
  name: string;
  description: string;
  verified: boolean;
  installs: number | null;
  worksWith: PluginWorksWith[];
}

export interface PublicDirectoryDetail {
  installCommand: string | null;
  repositoryUrl: string | null;
}

export interface InstalledDirectorySkill {
  name: string;
  description: string;
  body: string;
  path: string;
}
