import { z } from 'zod';
import { SYNCED_APP_SURFACES } from '@agiworkforce/types';

export const MANAGED_CLOUD_PROJECTS_PATH = '/api/projects';
export const MANAGED_CLOUD_PROJECTS_SYNC_PATH = '/api/projects/sync';

const ProjectAccentColorSchema = z.enum(['emerald', 'sky', 'amber', 'rose', 'violet', 'zinc']);
const ProjectImportSourceSchema = z.enum(['claude', 'openai', 'manual']);
const PrivacyModeSchema = z.literal('managed');
const ProviderModeSchema = z.enum(['ManagedGateway', 'ManagedNative']);
const SourceSurfaceSchema = z.enum(SYNCED_APP_SURFACES);

/** Runtime form of the existing Web CRUD `ProjectRecord` response. */
export const ManagedCloudProjectSchema = z.object({
  id: z.string().min(1),
  ownerUserId: z.string().min(1),
  organizationId: z.string().nullable().optional(),
  name: z.string(),
  description: z.string().nullable().optional(),
  instructions: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  isArchived: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  defaultPrivacyMode: PrivacyModeSchema,
  defaultProviderMode: ProviderModeSchema,
  allowedSurfaces: z.array(SourceSurfaceSchema),
  defaultModelId: z.string().nullable().optional(),
  knowledgeFileCount: z.number().int().nonnegative().nullable().optional(),
  memberCount: z.number().int().nonnegative().nullable().optional(),
  lastUsedAt: z.string().nullable().optional(),
  iconEmoji: z.string().nullable().optional(),
  accentColor: ProjectAccentColorSchema.nullable().optional(),
  importedFrom: ProjectImportSourceSchema.nullable().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type ManagedCloudProject = z.infer<typeof ManagedCloudProjectSchema>;

export const ManagedCloudProjectListQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).max(10_000).optional(),
});
export type ManagedCloudProjectListQuery = z.infer<typeof ManagedCloudProjectListQuerySchema>;

export const ManagedCloudProjectListResponseSchema = z.object({
  projects: z.array(ManagedCloudProjectSchema),
});

const ManagedCloudProjectWriteFields = {
  description: z.string().max(2_000).nullable().optional(),
  instructions: z.string().max(10_000).nullable().optional(),
  color: z.string().optional(),
  iconEmoji: z.string().max(16).nullable().optional(),
  accentColor: ProjectAccentColorSchema.nullable().optional(),
  defaultPrivacyMode: PrivacyModeSchema.optional(),
  defaultProviderMode: ProviderModeSchema.optional(),
  allowedSurfaces: z.array(SourceSurfaceSchema).optional(),
  defaultModelId: z.string().nullable().optional(),
  importedFrom: ProjectImportSourceSchema.nullable().optional(),
};

export const ManagedCloudProjectCreateRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  ...ManagedCloudProjectWriteFields,
});
export type ManagedCloudProjectCreateRequest = z.infer<
  typeof ManagedCloudProjectCreateRequestSchema
>;

export const ManagedCloudProjectUpdateRequestSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  isArchived: z.boolean().optional(),
  // Starred/pinned. Persisted in the existing user_projects.metadata jsonb so no
  // schema migration is required; the server merges it under metadata.starred.
  starred: z.boolean().optional(),
  ...ManagedCloudProjectWriteFields,
});
export type ManagedCloudProjectUpdateRequest = z.infer<
  typeof ManagedCloudProjectUpdateRequestSchema
>;

export const ManagedCloudProjectResponseSchema = z.object({
  project: ManagedCloudProjectSchema,
});

export const ManagedCloudProjectDeleteResponseSchema = z.object({ success: z.literal(true) });

export function managedCloudProjectPath(projectId: string): string {
  return `${MANAGED_CLOUD_PROJECTS_PATH}/${encodeURIComponent(projectId)}`;
}
