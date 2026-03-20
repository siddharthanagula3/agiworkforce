/**
 * Artifacts API
 *
 * TypeScript wrappers for the 24 artifact Tauri commands.
 * Provides CRUD, streaming, versioning, tagging, filtering,
 * diff-based updates, and bulk import/export operations.
 *
 * Command names: snake_case. Invoke params: camelCase.
 */

import { invoke, isTauri } from '../lib/tauri-mock';

// ============================================================================
// Types
// ============================================================================

export type ArtifactType =
  | 'code'
  | 'document'
  | 'spreadsheet'
  | 'diagram'
  | 'web'
  | 'chart'
  | 'presentation'
  | 'image';

export type ArtifactStatus = 'streaming' | 'complete' | 'failed' | 'archived';

export interface CodeMetadata {
  language: string;
  file_path?: string;
  highlight_lines?: number[];
  executable: boolean;
}

export interface DocumentMetadata {
  format: string;
  toc?: TocEntry[];
  word_count?: number;
}

export interface TocEntry {
  level: number;
  title: string;
  anchor: string;
}

export interface SpreadsheetMetadata {
  columns: string[];
  row_count: number;
  column_types?: Record<string, string>;
  formulas?: Record<string, string>;
}

export interface DiagramMetadata {
  diagram_type: string;
  theme?: string;
}

export interface WebMetadata {
  enable_scripts: boolean;
  external_resources: string[];
  viewport?: [number, number];
}

export interface ChartMetadata {
  chart_type: string;
  x_label?: string;
  y_label?: string;
  show_legend: boolean;
}

export type ArtifactMetadata =
  | { Code: CodeMetadata }
  | { Document: DocumentMetadata }
  | { Spreadsheet: SpreadsheetMetadata }
  | { Diagram: DiagramMetadata }
  | { Web: WebMetadata }
  | { Chart: ChartMetadata }
  | { Generic: Record<string, unknown> };

export interface ArtifactVersion {
  version: number;
  content: string;
  created_at: string;
  change_description?: string;
  size_bytes: number;
  content_hash: string;
}

export interface Artifact {
  id: string;
  title: string;
  artifact_type: ArtifactType;
  content: string;
  metadata: ArtifactMetadata;
  conversation_id?: number;
  message_id?: number;
  status: ArtifactStatus;
  versions: ArtifactVersion[];
  current_version: number;
  created_at: string;
  updated_at: string;
  tags: string[];
  pinned: boolean;
}

export interface ArtifactSummary {
  id: string;
  title: string;
  artifact_type: ArtifactType;
  status: ArtifactStatus;
  current_version: number;
  version_count: number;
  created_at: string;
  updated_at: string;
  size_bytes: number;
  tags: string[];
  pinned: boolean;
  conversation_id?: number;
}

export interface VersionDiff {
  from_version: number;
  to_version: number;
  from_content: string;
  to_content: string;
  from_timestamp: string;
  to_timestamp: string;
}

export interface ArtifactStoreStats {
  total_artifacts: number;
  total_versions: number;
  total_size_bytes: number;
  by_type: Record<ArtifactType, number>;
  by_status: Record<ArtifactStatus, number>;
}

export interface RenderedArtifact {
  id: string;
  title: string;
  artifact_type: ArtifactType;
  rendered_content: RenderedContent;
  version_info: VersionInfo;
  status: ArtifactStatus;
  available_actions: ArtifactAction[];
}

export type ArtifactAction =
  | 'copy'
  | 'download'
  | 'edit'
  | 'delete'
  | 'pin'
  | 'share'
  | 'export_pdf'
  | 'export_word'
  | 'export_excel'
  | 'export_svg'
  | 'export_png'
  | 'copy_markdown'
  | 'run'
  | 'apply_to_file';

export interface VersionInfo {
  current: number;
  total: number;
  created_at: string;
  updated_at: string;
}

export type RenderedContent =
  | { type: 'Code'; data: CodeRenderData }
  | { type: 'Document'; data: DocumentRenderData }
  | { type: 'Spreadsheet'; data: SpreadsheetRenderData }
  | { type: 'Diagram'; data: DiagramRenderData }
  | { type: 'Web'; data: WebRenderData }
  | { type: 'Chart'; data: ChartRenderData }
  | { type: 'Presentation'; data: PresentationRenderData }
  | { type: 'Image'; data: ImageRenderData };

export interface CodeRenderData {
  source: string;
  language: string;
  highlight_lines: number[];
  executable: boolean;
  line_count: number;
  file_extension: string;
}

export interface DocumentRenderData {
  source: string;
  format: string;
  toc: TocEntry[];
  word_count: number;
  char_count: number;
}

export interface SpreadsheetRenderData {
  rows: Record<string, unknown>[];
  columns: ColumnInfo[];
  row_count: number;
  editable: boolean;
}

export interface ColumnInfo {
  name: string;
  data_type: string;
  width?: number;
}

export interface DiagramRenderData {
  source: string;
  diagram_type: string;
  theme: string;
}

export interface WebRenderData {
  html: string;
  scripts_enabled: boolean;
  sandbox_permissions: string[];
  viewport?: [number, number];
}

export interface ChartRenderData {
  chart_type: string;
  data: Record<string, unknown>[];
  x_axis?: { label?: string; data_key: string };
  y_axis?: { label?: string; data_key: string };
  series: { data_key: string; name?: string; color?: string }[];
  show_legend: boolean;
  colors: string[];
}

export interface PresentationRenderData {
  slides: SlideData[];
  slide_count: number;
  current_slide: number;
}

export interface SlideData {
  index: number;
  title?: string;
  content: string;
  notes?: string;
}

export interface ImageRenderData {
  source: string;
  format: string;
  width?: number;
  height?: number;
  alt_text?: string;
}

/** Response wrapper matching Rust's ArtifactResponse<T> */
export interface ArtifactResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/** A single hunk in a diff-based artifact update */
export interface ArtifactDiffHunk {
  startLine: number;
  endLine: number;
  originalContent: string;
  newContent: string;
}

/** Filter options for listing artifacts */
export interface ArtifactListFilter {
  artifactTypes?: ArtifactType[];
  statuses?: ArtifactStatus[];
  tags?: string[];
  conversationId?: number;
  searchQuery?: string;
  pinnedOnly?: boolean;
  limit?: number;
  offset?: number;
}

// ============================================================================
// Helpers
// ============================================================================

function unwrap<T>(response: ArtifactResponse<T>): T {
  if (response.success && response.data !== undefined) {
    return response.data;
  }
  throw new Error(response.error ?? 'Unknown artifact operation error');
}

function unwrapVoid(response: ArtifactResponse<void>): void {
  if (!response.success) {
    throw new Error(response.error ?? 'Unknown artifact operation error');
  }
}

const MOCK_ID = () => `mock_artifact_${Date.now()}`;
const MOCK_TIMESTAMP = () => new Date().toISOString();

function mockArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: MOCK_ID(),
    title: 'Mock Artifact',
    artifact_type: 'code',
    content: '',
    metadata: { Generic: {} },
    status: 'complete',
    versions: [],
    current_version: 1,
    created_at: MOCK_TIMESTAMP(),
    updated_at: MOCK_TIMESTAMP(),
    tags: [],
    pinned: false,
    ...overrides,
  };
}

// ============================================================================
// 1. artifact_create
// ============================================================================

/** Create a new artifact. */
export async function artifactCreate(
  title: string,
  artifactType: ArtifactType,
  content: string,
  metadata?: ArtifactMetadata,
  conversationId?: number,
  messageId?: number,
  tags?: string[],
): Promise<Artifact> {
  if (!isTauri) {
    return mockArtifact({ title, artifact_type: artifactType, content, metadata, tags });
  }
  const response = await invoke<ArtifactResponse<Artifact>>('artifact_create', {
    title,
    artifactType,
    content,
    metadata: metadata ?? null,
    conversationId: conversationId ?? null,
    messageId: messageId ?? null,
    tags: tags ?? null,
  });
  return unwrap(response);
}

// ============================================================================
// 2. artifact_create_streaming
// ============================================================================

/** Create a streaming artifact (content will be appended incrementally). */
export async function artifactCreateStreaming(
  title: string,
  artifactType: ArtifactType,
  metadata?: ArtifactMetadata,
  conversationId?: number,
  messageId?: number,
): Promise<Artifact> {
  if (!isTauri) {
    return mockArtifact({ title, artifact_type: artifactType, status: 'streaming', metadata });
  }
  const response = await invoke<ArtifactResponse<Artifact>>('artifact_create_streaming', {
    title,
    artifactType,
    metadata: metadata ?? null,
    conversationId: conversationId ?? null,
    messageId: messageId ?? null,
  });
  return unwrap(response);
}

// ============================================================================
// 3. artifact_append_streaming
// ============================================================================

/** Append a content delta to a streaming artifact. */
export async function artifactAppendStreaming(id: string, delta: string): Promise<void> {
  if (!isTauri) return;
  const response = await invoke<ArtifactResponse<void>>('artifact_append_streaming', {
    id,
    delta,
  });
  unwrapVoid(response);
}

// ============================================================================
// 4. artifact_finalize_streaming
// ============================================================================

/** Finalize a streaming artifact, marking it complete. */
export async function artifactFinalizeStreaming(
  id: string,
  changeDescription?: string,
): Promise<Artifact> {
  if (!isTauri) {
    return mockArtifact({ id, status: 'complete' });
  }
  const response = await invoke<ArtifactResponse<Artifact>>('artifact_finalize_streaming', {
    id,
    changeDescription: changeDescription ?? null,
  });
  return unwrap(response);
}

// ============================================================================
// 5. artifact_get
// ============================================================================

/** Get an artifact by ID. */
export async function artifactGet(id: string): Promise<Artifact> {
  if (!isTauri) {
    return mockArtifact({ id });
  }
  const response = await invoke<ArtifactResponse<Artifact>>('artifact_get', { id });
  return unwrap(response);
}

// ============================================================================
// 6. artifact_get_rendered
// ============================================================================

/** Get a rendered artifact suitable for display. */
export async function artifactGetRendered(id: string): Promise<RenderedArtifact> {
  if (!isTauri) {
    return {
      id,
      title: 'Mock Artifact',
      artifact_type: 'code',
      rendered_content: {
        type: 'Code',
        data: {
          source: '',
          language: 'text',
          highlight_lines: [],
          executable: false,
          line_count: 0,
          file_extension: 'txt',
        },
      },
      version_info: {
        current: 1,
        total: 1,
        created_at: MOCK_TIMESTAMP(),
        updated_at: MOCK_TIMESTAMP(),
      },
      status: 'complete',
      available_actions: ['copy', 'download', 'edit', 'delete'],
    };
  }
  const response = await invoke<ArtifactResponse<RenderedArtifact>>('artifact_get_rendered', {
    id,
  });
  return unwrap(response);
}

// ============================================================================
// 7. artifact_update
// ============================================================================

/** Update an artifact's content, creating a new version. */
export async function artifactUpdate(
  id: string,
  content: string,
  changeDescription?: string,
  title?: string,
  metadata?: ArtifactMetadata,
  tags?: string[],
): Promise<Artifact> {
  if (!isTauri) {
    return mockArtifact({ id, content, title: title ?? 'Updated Artifact' });
  }
  const response = await invoke<ArtifactResponse<Artifact>>('artifact_update', {
    id,
    content,
    changeDescription: changeDescription ?? null,
    title: title ?? null,
    metadata: metadata ?? null,
    tags: tags ?? null,
  });
  return unwrap(response);
}

// ============================================================================
// 8. artifact_apply_diff
// ============================================================================

/** Apply a set of diff hunks to an artifact, creating a new version. */
export async function artifactApplyDiff(
  id: string,
  hunks: ArtifactDiffHunk[],
  changeDescription?: string,
): Promise<Artifact> {
  if (!isTauri) {
    return mockArtifact({ id });
  }
  const response = await invoke<ArtifactResponse<Artifact>>('artifact_apply_diff', {
    id,
    hunks: hunks.map((h) => ({
      start_line: h.startLine,
      end_line: h.endLine,
      original_content: h.originalContent,
      new_content: h.newContent,
    })),
    changeDescription: changeDescription ?? null,
  });
  return unwrap(response);
}

// ============================================================================
// 9. artifact_rollback
// ============================================================================

/** Rollback an artifact to a specific version. */
export async function artifactRollback(id: string, version: number): Promise<Artifact> {
  if (!isTauri) {
    return mockArtifact({ id, current_version: version });
  }
  const response = await invoke<ArtifactResponse<Artifact>>('artifact_rollback', { id, version });
  return unwrap(response);
}

// ============================================================================
// 10. artifact_delete
// ============================================================================

/** Delete an artifact permanently. */
export async function artifactDelete(id: string): Promise<void> {
  if (!isTauri) return;
  const response = await invoke<ArtifactResponse<void>>('artifact_delete', { id });
  unwrapVoid(response);
}

// ============================================================================
// 11. artifact_archive
// ============================================================================

/** Archive an artifact (soft delete). */
export async function artifactArchive(id: string): Promise<void> {
  if (!isTauri) return;
  const response = await invoke<ArtifactResponse<void>>('artifact_archive', { id });
  unwrapVoid(response);
}

// ============================================================================
// 12. artifact_unarchive
// ============================================================================

/** Unarchive a previously archived artifact. */
export async function artifactUnarchive(id: string): Promise<void> {
  if (!isTauri) return;
  const response = await invoke<ArtifactResponse<void>>('artifact_unarchive', { id });
  unwrapVoid(response);
}

// ============================================================================
// 13. artifact_pin
// ============================================================================

/** Pin or unpin an artifact. */
export async function artifactPin(id: string, pinned: boolean): Promise<void> {
  if (!isTauri) return;
  const response = await invoke<ArtifactResponse<void>>('artifact_pin', { id, pinned });
  unwrapVoid(response);
}

// ============================================================================
// 14. artifact_add_tags
// ============================================================================

/** Add tags to an artifact. */
export async function artifactAddTags(id: string, tags: string[]): Promise<void> {
  if (!isTauri) return;
  const response = await invoke<ArtifactResponse<void>>('artifact_add_tags', { id, tags });
  unwrapVoid(response);
}

// ============================================================================
// 15. artifact_remove_tags
// ============================================================================

/** Remove tags from an artifact. */
export async function artifactRemoveTags(id: string, tags: string[]): Promise<void> {
  if (!isTauri) return;
  const response = await invoke<ArtifactResponse<void>>('artifact_remove_tags', { id, tags });
  unwrapVoid(response);
}

// ============================================================================
// 16. artifact_list
// ============================================================================

/** List artifacts with optional filtering. */
export async function artifactList(filter?: ArtifactListFilter): Promise<ArtifactSummary[]> {
  if (!isTauri) return [];
  const response = await invoke<ArtifactResponse<ArtifactSummary[]>>('artifact_list', {
    artifactTypes: filter?.artifactTypes ?? null,
    statuses: filter?.statuses ?? null,
    tags: filter?.tags ?? null,
    conversationId: filter?.conversationId ?? null,
    searchQuery: filter?.searchQuery ?? null,
    pinnedOnly: filter?.pinnedOnly ?? null,
    limit: filter?.limit ?? null,
    offset: filter?.offset ?? null,
  });
  return unwrap(response);
}

// ============================================================================
// 17. artifact_get_by_conversation
// ============================================================================

/** Get all artifacts associated with a specific conversation. */
export async function artifactGetByConversation(
  conversationId: number,
): Promise<ArtifactSummary[]> {
  if (!isTauri) return [];
  const response = await invoke<ArtifactResponse<ArtifactSummary[]>>(
    'artifact_get_by_conversation',
    { conversationId },
  );
  return unwrap(response);
}

// ============================================================================
// 18. artifact_get_versions
// ============================================================================

/** Get the full version history for an artifact. */
export async function artifactGetVersions(id: string): Promise<ArtifactVersion[]> {
  if (!isTauri) return [];
  const response = await invoke<ArtifactResponse<ArtifactVersion[]>>('artifact_get_versions', {
    id,
  });
  return unwrap(response);
}

// ============================================================================
// 19. artifact_get_diff
// ============================================================================

/** Get a diff between two versions of an artifact. */
export async function artifactGetDiff(
  id: string,
  fromVersion: number,
  toVersion: number,
): Promise<VersionDiff> {
  if (!isTauri) {
    return {
      from_version: fromVersion,
      to_version: toVersion,
      from_content: '',
      to_content: '',
      from_timestamp: MOCK_TIMESTAMP(),
      to_timestamp: MOCK_TIMESTAMP(),
    };
  }
  const response = await invoke<ArtifactResponse<VersionDiff>>('artifact_get_diff', {
    id,
    fromVersion,
    toVersion,
  });
  return unwrap(response);
}

// ============================================================================
// 20. artifact_get_stats
// ============================================================================

/** Get aggregate statistics for the artifact store. */
export async function artifactGetStats(): Promise<ArtifactStoreStats> {
  if (!isTauri) {
    return {
      total_artifacts: 0,
      total_versions: 0,
      total_size_bytes: 0,
      by_type: {} as Record<ArtifactType, number>,
      by_status: {} as Record<ArtifactStatus, number>,
    };
  }
  const response = await invoke<ArtifactResponse<ArtifactStoreStats>>('artifact_get_stats');
  return unwrap(response);
}

// ============================================================================
// 21. artifact_export_all
// ============================================================================

/** Export all artifacts for backup. Returns the full artifact array. */
export async function artifactExportAll(): Promise<Artifact[]> {
  if (!isTauri) return [];
  const response = await invoke<ArtifactResponse<Artifact[]>>('artifact_export_all');
  return unwrap(response);
}

// ============================================================================
// 22. artifact_import_all
// ============================================================================

/** Import artifacts from a backup. Returns the number of artifacts imported. */
export async function artifactImportAll(artifacts: Artifact[]): Promise<number> {
  if (!isTauri) return 0;
  const response = await invoke<ArtifactResponse<number>>('artifact_import_all', { artifacts });
  return unwrap(response);
}

// ============================================================================
// 23. artifact_clear_all
// ============================================================================

/** Clear all artifacts from the store. Use with caution. */
export async function artifactClearAll(): Promise<void> {
  if (!isTauri) return;
  const response = await invoke<ArtifactResponse<void>>('artifact_clear_all');
  unwrapVoid(response);
}

// ============================================================================
// 24. artifact_list_persisted
// ============================================================================

/** List persisted artifacts from SQLite (bypasses in-memory cache). */
export async function artifactListPersisted(
  conversationId?: string,
  limit?: number,
): Promise<ArtifactSummary[]> {
  if (!isTauri) return [];
  const response = await invoke<ArtifactResponse<ArtifactSummary[]>>('artifact_list_persisted', {
    conversationId: conversationId ?? null,
    limit: limit ?? null,
  });
  return unwrap(response);
}
