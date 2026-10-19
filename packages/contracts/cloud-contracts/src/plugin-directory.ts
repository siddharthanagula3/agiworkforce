import { z } from 'zod';

export const PLUGINS_PATH = '/api/plugins';
export const PLUGIN_INSTALLATIONS_PATH = `${PLUGINS_PATH}/installations`;
export const PLUGIN_UPDATES_PATH = `${PLUGINS_PATH}/updates`;
export const PLUGIN_MARKETPLACES_PATH = `${PLUGINS_PATH}/marketplaces`;
export const PLUGIN_MARKETPLACE_ENTRIES_PATH = `${PLUGIN_MARKETPLACES_PATH}/entries`;
export const PLUGIN_MARKETPLACE_INSTALLATIONS_PATH = `${PLUGINS_PATH}/marketplace-installations`;
export const PLUGIN_HAS_DEPENDENTS_CODE = 'PLUGIN_HAS_DEPENDENTS';
export const PLUGIN_DIRECTORY_SORTS = ['installs', 'name'] as const;
export const PLUGIN_DIRECTORY_SOURCE_FACETS = ['builtin', 'partner', 'marketplace'] as const;

export type PluginDirectorySortKey = (typeof PLUGIN_DIRECTORY_SORTS)[number];
export type PluginDirectorySourceFacet = (typeof PLUGIN_DIRECTORY_SOURCE_FACETS)[number];

export function pluginPath(pluginId: string, leaf = ''): string {
  return `${PLUGINS_PATH}/${encodeURIComponent(pluginId)}${leaf ? `/${leaf}` : ''}`;
}

export function pluginInstallationPath(pluginId: string): string {
  return `${PLUGIN_INSTALLATIONS_PATH}/${encodeURIComponent(pluginId)}`;
}

const StringList = z.array(z.string());

export const PluginDirectoryPublisherSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  url: z.string().nullable().optional(),
});

export const PluginDirectoryComponentsSchema = z.object({
  skills: StringList.default([]),
  commands: z.number().int().min(0).default(0),
  agents: StringList.default([]),
  hooks: z.boolean().default(false),
  mcpServers: z
    .array(z.object({ name: z.string(), transport: z.string(), url: z.string().optional() }))
    .default([]),
  lspServers: StringList.default([]),
});

export const PluginDirectoryEntryWireSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string(),
  category: z.string(),
  publisher: PluginDirectoryPublisherSchema,
  status: z.string(),
  webInstallable: z.boolean(),
  declaredSkills: StringList.default([]),
  requiredConnectors: StringList.default([]),
  capabilities: StringList.default([]),
  permissions: StringList.default([]),
  examplePrompts: StringList.default([]),
  homepageUrl: z.string().nullable().optional(),
  installCount: z.number().int().optional(),
  sourceFacet: z.enum(PLUGIN_DIRECTORY_SOURCE_FACETS).optional(),
  verified: z.boolean().optional(),
  installs: z.number().int().nullable().optional(),
  worksWith: StringList.optional(),
  repositoryUrl: z.string().nullable().optional(),
  runtime: z
    .object({
      webInstallable: z.boolean(),
      inspected: z.boolean(),
      components: PluginDirectoryComponentsSchema,
      note: z.string().nullable(),
    })
    .optional(),
  dependencies: z
    .array(
      z.object({
        name: z.string(),
        marketplace: z.string().nullable(),
        version: z.string().nullable(),
      }),
    )
    .nullable()
    .optional(),
});
export type PluginDirectoryEntryWire = z.infer<typeof PluginDirectoryEntryWireSchema>;

export const PluginDirectoryListWireSchema = z.object({
  entries: z.array(PluginDirectoryEntryWireSchema),
  total: z.number().int().min(0),
  nextCursor: z.string().nullable(),
  stats: z
    .object({ byCategory: z.record(z.string(), z.number()) })
    .partial()
    .optional(),
});
export type PluginDirectoryListWire = z.infer<typeof PluginDirectoryListWireSchema>;

export const PluginDirectoryDetailWireSchema = z.object({
  entry: PluginDirectoryEntryWireSchema,
});

export const PluginInstallationWireSchema = z.object({
  pluginId: z.string(),
  installedVersion: z.string(),
  enabled: z.boolean(),
  installedAt: z.string(),
  updatedAt: z.string(),
});
export type PluginInstallationWire = z.infer<typeof PluginInstallationWireSchema>;

export const PluginInstallationsWireSchema = z.object({
  installations: z.array(PluginInstallationWireSchema),
});

export const PluginInstallWireSchema = z.object({
  installation: PluginInstallationWireSchema,
  dependencies: z
    .array(
      z.object({
        pluginId: z.string(),
        name: z.string(),
        version: z.string(),
        requiredBy: z.string(),
      }),
    )
    .default([]),
});

export const PluginVersionDiffWireSchema = z.object({
  pluginId: z.string(),
  from: z.string().nullable(),
  to: z.string(),
  changelog: z.string(),
  addedSkills: StringList,
  removedSkills: StringList,
  addedPermissions: StringList,
  removedPermissions: StringList,
  requiresPermissionReview: z.boolean(),
});
export type PluginVersionDiffWire = z.infer<typeof PluginVersionDiffWireSchema>;

export const PluginUpdateOfferWireSchema = z.object({
  pluginId: z.string(),
  installedVersion: z.string(),
  latestVersion: z.string(),
  diff: PluginVersionDiffWireSchema,
  installedVersionStopped: z.boolean(),
});
export type PluginUpdateOfferWire = z.infer<typeof PluginUpdateOfferWireSchema>;

export const PluginUpdatesWireSchema = z.object({ updates: z.array(PluginUpdateOfferWireSchema) });

export const PluginVersionsWireSchema = z.object({
  versions: z.array(
    z.object({
      version: z.string(),
      publishedAt: z.string().nullable(),
      changelog: z.string(),
      permissions: StringList,
      declaredSkills: StringList,
    }),
  ),
  installedVersion: z.string().nullable(),
  approvedPermissions: StringList,
});
export type PluginVersionsWire = z.infer<typeof PluginVersionsWireSchema>;

export const PluginScanWireSchema = z.object({
  scan: z
    .object({
      verdict: z.enum(['pass', 'review', 'block']),
      findings: z.array(
        z.object({
          path: z.string(),
          line: z.number().int(),
          message: z.string(),
          severity: z.enum(['block', 'review']),
        }),
      ),
      scannedAt: z.string(),
    })
    .nullable(),
});
export type PluginScanWire = z.infer<typeof PluginScanWireSchema>;

export const PluginSettingsWireSchema = z.object({
  settings: z.object({
    pluginId: z.string(),
    enabledSkills: StringList,
    examplePrompts: StringList,
    connectors: z.array(z.object({ connectorId: z.string(), connected: z.boolean() })),
    agents: StringList,
  }),
});
export type PluginSettingsWire = z.infer<typeof PluginSettingsWireSchema>['settings'];

export const PluginDependentsRefusalSchema = z.object({
  error: z.object({
    code: z.literal(PLUGIN_HAS_DEPENDENTS_CODE),
    message: z.string(),
    dependents: z.array(z.object({ id: z.string(), name: z.string() })),
  }),
});

export function pluginPermissionsToAcknowledge(
  versions: PluginVersionsWire,
  targetVersion: string,
): string[] {
  const target = versions.versions.find((version) => version.version === targetVersion);
  if (!target) return [];
  const approved = new Set(versions.approvedPermissions);
  return target.permissions.filter((permission) => !approved.has(permission));
}
