import { z } from 'zod';

export const CONNECTOR_DIRECTORY_PATH = '/api/connectors/directory';
export const CONNECTOR_DIRECTORY_ICON_PATH = '/api/connectors/directory/icon';
export const CONNECTOR_DIRECTORY_ICON_ID_PARAM = 'id';

export function connectorDirectoryEntryPath(id: string): string {
  const segments = id.split('/').map((segment) => encodeURIComponent(segment));
  return `${CONNECTOR_DIRECTORY_PATH}/${segments.join('/')}`;
}

export function connectorDirectoryIconPath(id: string): string {
  return `${CONNECTOR_DIRECTORY_ICON_PATH}?${CONNECTOR_DIRECTORY_ICON_ID_PARAM}=${encodeURIComponent(id)}`;
}

export const CONNECTOR_DIRECTORY_CATEGORIES = [
  'Code',
  'Communication',
  'Data',
  'Design',
  'Financial services',
  'Health',
  'Legal',
  'Life sciences',
  'Productivity',
  'Sales and marketing',
  'Other',
] as const;
export type ConnectorDirectoryCategory = (typeof CONNECTOR_DIRECTORY_CATEGORIES)[number];

export const CONNECTOR_DIRECTORY_TRANSPORTS = ['streamable-http', 'sse', 'stdio'] as const;
export type ConnectorDirectoryTransport = (typeof CONNECTOR_DIRECTORY_TRANSPORTS)[number];

export const CONNECTOR_DIRECTORY_AUTH_MODES = ['none', 'oauth', 'api-key', 'unknown'] as const;
export type ConnectorDirectoryAuthMode = (typeof CONNECTOR_DIRECTORY_AUTH_MODES)[number];

export const CONNECTOR_DIRECTORY_CONNECTABLE_MODES = [
  'connect',
  'api-key-form',
  'desktop-and-cli',
  'needs-setup',
  'unavailable',
] as const;
export type ConnectorDirectoryConnectableMode =
  (typeof CONNECTOR_DIRECTORY_CONNECTABLE_MODES)[number];

export const CONNECTOR_DIRECTORY_SOURCES = ['internal', 'mcp-registry'] as const;
export type ConnectorDirectorySource = (typeof CONNECTOR_DIRECTORY_SOURCES)[number];

export const CONNECTOR_DIRECTORY_BADGES = [
  'first-party',
  'official',
  'verified',
  'registry',
  'community',
] as const;
export type ConnectorDirectoryBadge = (typeof CONNECTOR_DIRECTORY_BADGES)[number];

export const CONNECTOR_DIRECTORY_ICON_SOURCES = ['brand', 'registry', 'site', 'monogram'] as const;
export type ConnectorDirectoryIconSource = (typeof CONNECTOR_DIRECTORY_ICON_SOURCES)[number];

export const CONNECTOR_DIRECTORY_MONOGRAM_HUES = [
  'code',
  'communication',
  'data',
  'design',
  'financial-services',
  'health',
  'legal',
  'life-sciences',
  'productivity',
  'sales-and-marketing',
  'other',
] as const;
export type ConnectorDirectoryMonogramHue = (typeof CONNECTOR_DIRECTORY_MONOGRAM_HUES)[number];

export const CONNECTOR_DIRECTORY_SORTS = ['popular', 'name'] as const;
export type ConnectorDirectorySort = (typeof CONNECTOR_DIRECTORY_SORTS)[number];

export const CONNECTOR_DIRECTORY_DEFAULT_LIMIT = 25;
export const CONNECTOR_DIRECTORY_MAX_LIMIT = 100;
export const CONNECTOR_DIRECTORY_SEARCH_MAX_LENGTH = 200;

const BooleanParamSchema = z.enum(['true', 'false']).transform((value) => value === 'true');

export const ConnectorDirectoryQuerySchema = z.object({
  search: z.string().trim().min(1).max(CONNECTOR_DIRECTORY_SEARCH_MAX_LENGTH).optional(),
  category: z.enum(CONNECTOR_DIRECTORY_CATEGORIES).optional(),
  badge: z.enum(CONNECTOR_DIRECTORY_BADGES).optional(),
  connectable: z.enum(CONNECTOR_DIRECTORY_CONNECTABLE_MODES).optional(),
  connectableOnly: BooleanParamSchema.optional(),
  authMode: z.enum(CONNECTOR_DIRECTORY_AUTH_MODES).optional(),
  sort: z.enum(CONNECTOR_DIRECTORY_SORTS).default('popular'),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(CONNECTOR_DIRECTORY_MAX_LIMIT)
    .default(CONNECTOR_DIRECTORY_DEFAULT_LIMIT),
  cursor: z.string().regex(/^\d+$/).optional(),
});
export type ConnectorDirectoryQuery = z.infer<typeof ConnectorDirectoryQuerySchema>;

export const ConnectorDirectoryRemoteSchema = z.object({
  url: z.string(),
  transport: z.enum(CONNECTOR_DIRECTORY_TRANSPORTS),
});
export type ConnectorDirectoryRemote = z.infer<typeof ConnectorDirectoryRemoteSchema>;

export const ConnectorDirectoryEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  publisher: z.string(),
  description: z.string(),
  categories: z.array(z.string()),
  remotes: z.array(ConnectorDirectoryRemoteSchema),
  authMode: z.enum(CONNECTOR_DIRECTORY_AUTH_MODES),
  connectable: z.enum(CONNECTOR_DIRECTORY_CONNECTABLE_MODES),
  toolNames: z.array(z.string()),
  repositoryUrl: z.string().nullable(),
  version: z.string().nullable(),
  sourceRegistry: z.enum(CONNECTOR_DIRECTORY_SOURCES),
  badge: z.enum(CONNECTOR_DIRECTORY_BADGES),
  iconUrl: z.string().nullable(),
  monogram: z.string(),
  monogramHue: z.enum(CONNECTOR_DIRECTORY_MONOGRAM_HUES).optional(),
  featured: z.boolean().optional(),
  listingNote: z.string().optional(),
  documentationUrl: z.string().nullable(),
  iconSource: z.enum(CONNECTOR_DIRECTORY_ICON_SOURCES),
  brandSlug: z.string().nullable(),
  authorName: z.string().nullable(),
  authorUrl: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  supportUrl: z.string().nullable(),
  privacyPolicyUrl: z.string().nullable(),
  toolCount: z.number().int().nonnegative(),
  connectorUrl: z.string().nullable(),
  publishedAt: z.string().optional(),
  firstSeenAt: z.string().optional(),
});
export type ConnectorDirectoryEntry = z.infer<typeof ConnectorDirectoryEntrySchema>;

const CountSchema = z.number().int().nonnegative();

export const ConnectorDirectoryStatsSchema = z.object({
  totalRecords: CountSchema,
  remoteRecords: CountSchema,
  byConnectable: z.record(z.enum(CONNECTOR_DIRECTORY_CONNECTABLE_MODES), CountSchema),
  byBadge: z.record(z.enum(CONNECTOR_DIRECTORY_BADGES), CountSchema),
  bootstrapComplete: z.boolean(),
  lastSyncAt: z.string().nullable(),
});
export type ConnectorDirectoryStats = z.infer<typeof ConnectorDirectoryStatsSchema>;

export const ConnectorDirectoryListResponseSchema = z.object({
  entries: z.array(ConnectorDirectoryEntrySchema),
  total: CountSchema,
  nextCursor: z.string().nullable(),
  categories: z.array(z.enum(CONNECTOR_DIRECTORY_CATEGORIES)),
  connectableModes: z.array(z.enum(CONNECTOR_DIRECTORY_CONNECTABLE_MODES)),
  stats: ConnectorDirectoryStatsSchema,
});
export type ConnectorDirectoryListResponse = z.infer<typeof ConnectorDirectoryListResponseSchema>;

export const ConnectorDirectoryEntryResponseSchema = z.object({
  entry: ConnectorDirectoryEntrySchema,
});
export type ConnectorDirectoryEntryResponse = z.infer<typeof ConnectorDirectoryEntryResponseSchema>;
