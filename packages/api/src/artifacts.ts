/**
 * Artifacts API — typed wrappers for artifact_* Tauri commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export type ArtifactType =
  | 'code'
  | 'document'
  | 'image'
  | 'data'
  | 'diagram'
  | 'html'
  | 'react'
  | 'svg'
  | 'mermaid';
export type ArtifactStatus = 'active' | 'archived' | 'deleted';
export interface ArtifactMetadata {
  language?: string;
  framework?: string;
  [key: string]: unknown;
}
export interface Artifact {
  id: string;
  title: string;
  type: ArtifactType;
  content: string;
  status: ArtifactStatus;
  version: number;
  conversationId?: number;
  messageId?: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  metadata?: ArtifactMetadata;
}
export interface ArtifactSummary {
  id: string;
  title: string;
  type: ArtifactType;
  status: ArtifactStatus;
  version: number;
  pinned: boolean;
  updatedAt: string;
  tags: string[];
}
export interface RenderedArtifact {
  id: string;
  html: string;
  css?: string;
}
export interface ArtifactDiffHunk {
  startLine: number;
  endLine: number;
  content: string;
}
export interface ArtifactVersion {
  version: number;
  createdAt: string;
  changeDescription?: string;
}
export interface VersionDiff {
  fromVersion: number;
  toVersion: number;
  hunks: ArtifactDiffHunk[];
}
export interface ArtifactStoreStats {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  totalSize: number;
}
export interface ArtifactResponse<T> {
  success: boolean;
  data: T;
}

// ---- Commands ----

export async function artifactCreate(
  title: string,
  artifactType: ArtifactType,
  content: string,
  metadata?: ArtifactMetadata,
  conversationId?: number,
  messageId?: number,
  tags?: string[],
): Promise<ArtifactResponse<Artifact>> {
  return command<ArtifactResponse<Artifact>>('artifact_create', {
    title,
    artifactType,
    content,
    metadata,
    conversationId,
    messageId,
    tags,
  });
}
export async function artifactCreateStreaming(
  title: string,
  artifactType: ArtifactType,
  metadata?: ArtifactMetadata,
  conversationId?: number,
  messageId?: number,
): Promise<ArtifactResponse<Artifact>> {
  return command<ArtifactResponse<Artifact>>('artifact_create_streaming', {
    title,
    artifactType,
    metadata,
    conversationId,
    messageId,
  });
}
export async function artifactAppendStreaming(
  id: string,
  delta: string,
): Promise<ArtifactResponse<void>> {
  return command<ArtifactResponse<void>>('artifact_append_streaming', { id, delta });
}
export async function artifactFinalizeStreaming(
  id: string,
  changeDescription?: string,
): Promise<ArtifactResponse<Artifact>> {
  return command<ArtifactResponse<Artifact>>('artifact_finalize_streaming', {
    id,
    changeDescription,
  });
}
export async function artifactGet(id: string): Promise<ArtifactResponse<Artifact>> {
  return command<ArtifactResponse<Artifact>>('artifact_get', { id });
}
export async function artifactGetRendered(id: string): Promise<ArtifactResponse<RenderedArtifact>> {
  return command<ArtifactResponse<RenderedArtifact>>('artifact_get_rendered', { id });
}
export async function artifactUpdate(
  id: string,
  content: string,
  changeDescription?: string,
  title?: string,
  metadata?: ArtifactMetadata,
  tags?: string[],
): Promise<ArtifactResponse<Artifact>> {
  return command<ArtifactResponse<Artifact>>('artifact_update', {
    id,
    content,
    changeDescription,
    title,
    metadata,
    tags,
  });
}
export async function artifactApplyDiff(
  id: string,
  hunks: ArtifactDiffHunk[],
  changeDescription?: string,
): Promise<ArtifactResponse<Artifact>> {
  return command<ArtifactResponse<Artifact>>('artifact_apply_diff', {
    id,
    hunks,
    changeDescription,
  });
}
export async function artifactRollback(
  id: string,
  version: number,
): Promise<ArtifactResponse<Artifact>> {
  return command<ArtifactResponse<Artifact>>('artifact_rollback', { id, version });
}
export async function artifactDelete(id: string): Promise<ArtifactResponse<void>> {
  return command<ArtifactResponse<void>>('artifact_delete', { id });
}
export async function artifactArchive(id: string): Promise<ArtifactResponse<void>> {
  return command<ArtifactResponse<void>>('artifact_archive', { id });
}
export async function artifactUnarchive(id: string): Promise<ArtifactResponse<void>> {
  return command<ArtifactResponse<void>>('artifact_unarchive', { id });
}
export async function artifactPin(id: string, pinned: boolean): Promise<ArtifactResponse<void>> {
  return command<ArtifactResponse<void>>('artifact_pin', { id, pinned });
}
export async function artifactAddTags(id: string, tags: string[]): Promise<ArtifactResponse<void>> {
  return command<ArtifactResponse<void>>('artifact_add_tags', { id, tags });
}
export async function artifactRemoveTags(
  id: string,
  tags: string[],
): Promise<ArtifactResponse<void>> {
  return command<ArtifactResponse<void>>('artifact_remove_tags', { id, tags });
}
export async function artifactList(
  artifactTypes?: ArtifactType[],
  statuses?: ArtifactStatus[],
  tags?: string[],
  conversationId?: number,
  searchQuery?: string,
  pinnedOnly?: boolean,
  limit?: number,
  offset?: number,
): Promise<ArtifactResponse<ArtifactSummary[]>> {
  return command<ArtifactResponse<ArtifactSummary[]>>('artifact_list', {
    artifactTypes,
    statuses,
    tags,
    conversationId,
    searchQuery,
    pinnedOnly,
    limit,
    offset,
  });
}
export async function artifactGetByConversation(
  conversationId: number,
): Promise<ArtifactResponse<ArtifactSummary[]>> {
  return command<ArtifactResponse<ArtifactSummary[]>>('artifact_get_by_conversation', {
    conversationId,
  });
}
export async function artifactGetVersions(
  id: string,
): Promise<ArtifactResponse<ArtifactVersion[]>> {
  return command<ArtifactResponse<ArtifactVersion[]>>('artifact_get_versions', { id });
}
export async function artifactGetDiff(
  id: string,
  fromVersion: number,
  toVersion: number,
): Promise<ArtifactResponse<VersionDiff>> {
  return command<ArtifactResponse<VersionDiff>>('artifact_get_diff', {
    id,
    fromVersion,
    toVersion,
  });
}
export async function artifactGetStats(): Promise<ArtifactResponse<ArtifactStoreStats>> {
  return command<ArtifactResponse<ArtifactStoreStats>>('artifact_get_stats');
}
export async function artifactExportAll(): Promise<ArtifactResponse<Artifact[]>> {
  return command<ArtifactResponse<Artifact[]>>('artifact_export_all');
}
export async function artifactImportAll(artifacts: Artifact[]): Promise<ArtifactResponse<number>> {
  return command<ArtifactResponse<number>>('artifact_import_all', { artifacts });
}
export async function artifactClearAll(): Promise<ArtifactResponse<void>> {
  return command<ArtifactResponse<void>>('artifact_clear_all');
}
export async function artifactListPersisted(
  conversationId?: string,
  limit?: number,
): Promise<ArtifactResponse<ArtifactSummary[]>> {
  return command<ArtifactResponse<ArtifactSummary[]>>('artifact_list_persisted', {
    conversationId,
    limit,
  });
}
