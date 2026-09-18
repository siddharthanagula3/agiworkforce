import {
  deriveManagedFile,
  localDeviceManagedFile,
  type ArtifactManifest,
  type ComputeSession,
  type FileDerivation,
  type FileLineage,
  type GeneratedFile,
  type ManagedFile,
} from '@agiworkforce/types';

export type { ManagedFile };

export enum DocumentType {
  Word = 'Word',
  Excel = 'Excel',
  Pdf = 'Pdf',
}

export interface DocumentMetadata {
  file_path: string;
  file_name: string;
  file_size: number;
  document_type: DocumentType;
  created_at?: string;
  modified_at?: string;
  author?: string;
  title?: string;
  page_count?: number;
  word_count?: number;
}

export interface WordContent {
  paragraphs: string[];
  tables?: Array<string[][]>;
}

export interface WordDocumentConfig {
  file_path: string;
  metadata: DocumentMetadata;
}

export interface ExcelSheet {
  name: string;
  rows: Array<Record<string, unknown>>;
}

export interface ExcelDocumentConfig {
  file_path: string;
  sheets: ExcelSheet[];
  metadata: DocumentMetadata;
}

export interface PdfContent {
  pages: Array<{
    page_number: number;
    text: string;
  }>;
}

export interface PdfDocumentConfig {
  file_path: string;
  metadata: DocumentMetadata;
}

export interface DocumentContent {
  text: string;
  metadata: DocumentMetadata;
}

export interface SearchResult {
  page?: number;
  line?: number;
  context: string;
  match_text: string;
}

export interface DocumentCreationResult {
  path: string;
  file_path: string;
  filePath: string;
  format: 'pdf' | 'docx' | 'xlsx' | 'pptx';
  status: 'created';
  success: boolean;
  computeSession: ComputeSession;
  generatedFile: GeneratedFile;
  artifactManifest: ArtifactManifest;
}

export interface DocumentState {
  currentDocument: DocumentContent | null;
  searchResults: SearchResult[];
  loading: boolean;
  error: string | null;
}

/**
 * `DocumentMetadata` is the shape the Rust document layer returns; it is not a
 * second File model and nothing outside this module should treat it as one.
 * These two functions are the only crossing: they turn what Rust sent into the
 * one {@link ManagedFile} the web and the phone also speak, so a document
 * created here has the same identity, version and lineage everywhere.
 */
export function documentManagedFile(
  metadata: DocumentMetadata,
  options: { origin?: 'upload' | 'generated'; lineage?: Partial<FileLineage> } = {},
): ManagedFile {
  return localDeviceManagedFile({
    path: metadata.file_path,
    name: metadata.file_name,
    byteCount: metadata.file_size,
    origin: options.origin ?? 'upload',
    sourceSurface: 'desktop',
    lineage: options.lineage ?? {},
  });
}

export function documentCreationManagedFile(
  result: DocumentCreationResult,
  source?: { file: ManagedFile; derivation: FileDerivation },
): ManagedFile {
  const created = localDeviceManagedFile({
    path: result.file_path,
    name: result.file_path.split('/').pop() ?? result.file_path,
    origin: 'generated',
    sourceSurface: 'desktop',
    lineage: { generatedByTurnId: result.computeSession.id },
  });
  if (!source) return created;
  return deriveManagedFile(source.file, {
    id: created.id,
    name: created.name,
    mediaType: created.mediaType,
    byteCount: created.byteCount,
    uri: created.uri,
    origin: 'generated',
    storage: 'local_device',
    sourceSurface: 'desktop',
    derivation: source.derivation,
    lineage: { generatedByTurnId: result.computeSession.id },
  });
}
