import type { ManagedCloudProject, ProjectWireDelta } from '@agiworkforce/cloud-contracts';

export type SyncProjectSource = 'mobile' | 'desktop' | 'web';

export interface SyncProjectRecord {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  color: string | null;
  isArchived: boolean;
  metadata: Record<string, unknown> | null;
  source: SyncProjectSource;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  serverVersion: string;
}

export function mapProjectWireDelta(delta: ProjectWireDelta): SyncProjectRecord {
  return {
    id: delta.id,
    name: delta.name,
    description: delta.description,
    instructions: delta.instructions,
    color: delta.color,
    isArchived: delta.is_archived,
    metadata: delta.metadata,
    source: 'web',
    createdAt: delta.created_at,
    updatedAt: delta.updated_at,
    deletedAt: delta.deleted_at,
    serverVersion: delta.server_version,
  };
}

export function mapFetchedManagedProject(
  project: ManagedCloudProject & { serverVersion: string },
): SyncProjectRecord {
  return {
    id: project.id,
    name: project.name,
    description: project.description ?? null,
    instructions: project.instructions ?? null,
    color: project.color ?? null,
    isArchived: project.isArchived ?? false,
    metadata: project.metadata ?? null,
    source: 'web',
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    deletedAt: null,
    serverVersion: project.serverVersion,
  };
}
