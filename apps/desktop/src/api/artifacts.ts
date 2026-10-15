import { invoke, isTauri } from '../lib/tauri-mock';

export type ArtifactType =
  'code' | 'document' | 'spreadsheet' | 'diagram' | 'web' | 'chart' | 'presentation' | 'image';

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

export interface ArtifactResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

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

export async function artifactGet(id: string): Promise<Artifact> {
  if (!isTauri) {
    return mockArtifact({ id });
  }
  const response = await invoke<ArtifactResponse<Artifact>>('artifact_get', { id });
  return unwrap(response);
}

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

export async function artifactRollback(id: string, version: number): Promise<Artifact> {
  if (!isTauri) {
    return mockArtifact({ id, current_version: version });
  }
  const response = await invoke<ArtifactResponse<Artifact>>('artifact_rollback', { id, version });
  return unwrap(response);
}

export async function artifactDelete(id: string): Promise<void> {
  if (!isTauri) return;
  const response = await invoke<ArtifactResponse<void>>('artifact_delete', { id });
  unwrapVoid(response);
}

export async function artifactArchive(id: string): Promise<void> {
  if (!isTauri) return;
  const response = await invoke<ArtifactResponse<void>>('artifact_archive', { id });
  unwrapVoid(response);
}

export async function artifactUnarchive(id: string): Promise<void> {
  if (!isTauri) return;
  const response = await invoke<ArtifactResponse<void>>('artifact_unarchive', { id });
  unwrapVoid(response);
}

export async function artifactPin(id: string, pinned: boolean): Promise<void> {
  if (!isTauri) return;
  const response = await invoke<ArtifactResponse<void>>('artifact_pin', { id, pinned });
  unwrapVoid(response);
}

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
