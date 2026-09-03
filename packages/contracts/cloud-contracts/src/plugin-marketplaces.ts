import { z } from 'zod';

/**
 * A user- or org-registered plugin marketplace is a git repository. The
 * server resolves this path against the repository's default branch (or the
 * caller-supplied ref) to find the marketplace's manifest.
 */
export const PLUGIN_MARKETPLACE_MANIFEST_PATH = '.agiworkforce/marketplace.json';

const MARKETPLACE_PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const MARKETPLACE_SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
const MARKETPLACE_CONTENT_HASH_PATTERN = /^[0-9a-f]{64}$/;
const MARKETPLACE_NAME_MAX_LENGTH = 200;
const MARKETPLACE_DESCRIPTION_MAX_LENGTH = 2000;
const MARKETPLACE_LIST_ITEM_MAX_LENGTH = 200;
const MARKETPLACE_LIST_MAX_ITEMS = 50;
const MARKETPLACE_PLUGINS_MAX_COUNT = 100;

const marketplaceStringListSchema = z
  .array(z.string().trim().min(1).max(MARKETPLACE_LIST_ITEM_MAX_LENGTH))
  .max(MARKETPLACE_LIST_MAX_ITEMS);

export const PluginMarketplaceManifestPluginSchema = z.object({
  id: z.string().regex(MARKETPLACE_PLUGIN_ID_PATTERN),
  name: z.string().trim().min(1).max(MARKETPLACE_NAME_MAX_LENGTH),
  description: z.string().trim().min(1).max(MARKETPLACE_DESCRIPTION_MAX_LENGTH),
  version: z.string().regex(MARKETPLACE_SEMVER_PATTERN),
  skills: marketplaceStringListSchema.default([]),
  connectors: marketplaceStringListSchema.default([]),
  agents: marketplaceStringListSchema.default([]),
  examplePrompts: marketplaceStringListSchema.default([]),
  permissions: marketplaceStringListSchema.default([]),
});

export const PluginMarketplaceManifestSchema = z.object({
  name: z.string().trim().min(1).max(MARKETPLACE_NAME_MAX_LENGTH),
  plugins: z.array(PluginMarketplaceManifestPluginSchema).min(1).max(MARKETPLACE_PLUGINS_MAX_COUNT),
});

export type PluginMarketplaceManifestPlugin = z.infer<typeof PluginMarketplaceManifestPluginSchema>;
export type PluginMarketplaceManifest = z.infer<typeof PluginMarketplaceManifestSchema>;

export function parsePluginMarketplaceManifest(data: unknown): PluginMarketplaceManifest {
  return PluginMarketplaceManifestSchema.parse(data);
}

export function isPluginMarketplaceContentHash(value: unknown): value is string {
  return typeof value === 'string' && MARKETPLACE_CONTENT_HASH_PATTERN.test(value);
}

export type PluginMarketplaceSourceStatus = 'active' | 'error';

export const PLUGIN_MARKETPLACE_SOURCE_STATUSES: readonly PluginMarketplaceSourceStatus[] = [
  'active',
  'error',
] as const;

export function isPluginMarketplaceSourceStatus(
  value: unknown,
): value is PluginMarketplaceSourceStatus {
  return (
    typeof value === 'string' &&
    (PLUGIN_MARKETPLACE_SOURCE_STATUSES as readonly string[]).includes(value)
  );
}

export interface PluginMarketplaceSourceSummary {
  id: string;
  name: string;
  repositoryUrl: string;
  ref: string | null;
  status: PluginMarketplaceSourceStatus;
  lastError: string | null;
  contentHash: string | null;
  entryCount: number;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PluginMarketplaceEntry {
  id: string;
  sourceId: string;
  pluginKey: string;
  name: string;
  description: string;
  version: string;
  declaredSkills: string[];
  requiredConnectors: string[];
  agents: string[];
  examplePrompts: string[];
  permissions: string[];
  contentHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface PluginMarketplaceSourceListResponse {
  sources: PluginMarketplaceSourceSummary[];
}

export interface PluginMarketplaceEntryListResponse {
  entries: PluginMarketplaceEntry[];
}

export interface PluginMarketplaceInstallation {
  id: string;
  entryId: string;
  sourceId: string;
  pluginKey: string;
  installedVersion: string;
  enabled: boolean;
  enabledSkills: string[];
  customExamplePrompts: string[] | null;
  installedAt: string;
  updatedAt: string;
}

export interface PluginMarketplaceInstallationsResponse {
  installations: PluginMarketplaceInstallation[];
}

export interface PluginConnectorRequirementState {
  connectorId: string;
  connected: boolean;
}

export interface PluginInstallationSettings {
  pluginId: string;
  enabledSkills: string[];
  examplePrompts: string[];
  connectors: PluginConnectorRequirementState[];
  agents: string[];
}

export const PluginInstallationSettingsPatchSchema = z
  .object({
    enabledSkills: marketplaceStringListSchema.optional(),
    customExamplePrompts: marketplaceStringListSchema.nullable().optional(),
  })
  .strict();

export type PluginInstallationSettingsPatch = z.infer<typeof PluginInstallationSettingsPatchSchema>;
