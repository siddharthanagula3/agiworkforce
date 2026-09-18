import type { ProjectWireDelta } from '@agiworkforce/cloud-contracts';

import { mapProjectWireDelta, type SyncProjectRecord } from './projects';

/**
 * A project's descriptive fields on their own.
 *
 * Renaming a project or recolouring it does not touch its instructions, and the
 * instructions are the field a device may hold megabytes of. Pushing the whole
 * row for a colour change costs a conflict on a field nobody edited, so the
 * metadata is a sync path of its own with the same server-version CAS.
 */
export interface SyncProjectMetadata {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  isArchived: boolean;
  metadata: Record<string, unknown> | null;
  updatedAt: string;
  deletedAt: string | null;
  serverVersion: string;
}

export function projectMetadataOf(record: SyncProjectRecord): SyncProjectMetadata {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    color: record.color,
    isArchived: record.isArchived,
    metadata: record.metadata,
    updatedAt: record.updatedAt,
    deletedAt: record.deletedAt,
    serverVersion: record.serverVersion,
  };
}

export function mapProjectMetadataWireDelta(delta: ProjectWireDelta): SyncProjectMetadata {
  return projectMetadataOf(mapProjectWireDelta(delta));
}

export interface ProjectMetadataPushItem {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  isArchived: boolean;
  metadata: Record<string, unknown> | null;
  baseVersion: string;
  deletedAt: string | null;
}

export function toProjectMetadataPushItem(metadata: SyncProjectMetadata): ProjectMetadataPushItem {
  return {
    id: metadata.id,
    name: metadata.name,
    description: metadata.description,
    color: metadata.color,
    isArchived: metadata.isArchived,
    metadata: metadata.metadata,
    baseVersion: metadata.serverVersion,
    deletedAt: metadata.deletedAt,
  };
}

export function projectMetadataMatches(
  left: SyncProjectMetadata,
  right: SyncProjectMetadata,
): boolean {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.description === right.description &&
    left.color === right.color &&
    left.isArchived === right.isArchived &&
    left.deletedAt === right.deletedAt &&
    JSON.stringify(left.metadata ?? null) === JSON.stringify(right.metadata ?? null)
  );
}

/**
 * Applies a metadata delta onto a full project record without touching the
 * fields the metadata path does not carry. Instructions survive a rename.
 */
export function applyProjectMetadata(
  record: SyncProjectRecord,
  metadata: SyncProjectMetadata,
): SyncProjectRecord {
  return {
    ...record,
    name: metadata.name,
    description: metadata.description,
    color: metadata.color,
    isArchived: metadata.isArchived,
    metadata: metadata.metadata,
    updatedAt: metadata.updatedAt,
    deletedAt: metadata.deletedAt,
    serverVersion: metadata.serverVersion,
  };
}
