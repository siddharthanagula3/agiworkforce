import {
  providerModeToPrivacyMode,
  type ArtifactManifest,
  type ComputeSession,
  type GeneratedFile,
  type GeneratedFileKind,
  type GeneratedFilePreview,
  type PrivacyMode,
  type ProviderMode,
  type SourceSurface,
  type StorageScope,
} from '@agiworkforce/types';

export interface OpenAIContainerFileCitation {
  type: 'container_file_citation';
  file_id: string;
  container_id: string;
  filename: string;
  index?: number | null;
  start_index?: number | null;
  end_index?: number | null;
}

export interface OpenAIContainerFileMaterialization {
  fileId: string;
  uri: string;
  byteCount: number;
  checksumSha256: string;
  mimeType?: string;
  kind?: GeneratedFileKind;
  previewDerivatives?: GeneratedFilePreview[];
  retentionExpiresAt?: string | null;
  createdAt?: string;
}

export interface OpenAIContainerGeneratedFileBundle {
  computeSession: ComputeSession;
  generatedFiles: GeneratedFile[];
  artifactManifest: ArtifactManifest;
  citations: OpenAIContainerFileCitation[];
}

export interface BuildOpenAIContainerGeneratedFilesInput {
  responseId: string;
  ownerUserId: string;
  sourceSurface: SourceSurface;
  privacyMode: PrivacyMode;
  providerMode: ProviderMode;
  storageScope: Extract<StorageScope, 'direct_byok_provider' | 'managed_compute'>;
  citations: OpenAIContainerFileCitation[];
  files: OpenAIContainerFileMaterialization[];
  organizationId?: string | null;
  model?: string | null;
  sourceConversationId?: string | null;
  sourceMessageId?: string | null;
  sourceSessionId?: string | null;
  ttlSeconds?: number;
  retentionExpiresAt?: string | null;
  createdAt?: string;
}

const EXTENSION_TO_KIND: Readonly<Record<string, GeneratedFileKind>> = {
  pdf: 'pdf',
  docx: 'docx',
  xlsx: 'xlsx',
  pptx: 'pptx',
  csv: 'csv',
  json: 'json',
  md: 'markdown',
  markdown: 'markdown',
  html: 'html',
  htm: 'html',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  gif: 'image',
  zip: 'archive',
  tar: 'archive',
  gz: 'archive',
};

const KIND_TO_MIME: Readonly<Record<GeneratedFileKind, string>> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv',
  json: 'application/json',
  markdown: 'text/markdown',
  html: 'text/html',
  image: 'image/*',
  archive: 'application/octet-stream',
  other: 'application/octet-stream',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isContainerFileCitation(value: unknown): value is OpenAIContainerFileCitation {
  if (!isRecord(value)) return false;
  return (
    value['type'] === 'container_file_citation' &&
    typeof value['file_id'] === 'string' &&
    typeof value['container_id'] === 'string' &&
    typeof value['filename'] === 'string'
  );
}

function stableSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-');
}

function extensionForFileName(fileName: string): string | undefined {
  const last = fileName.split('.').pop()?.toLowerCase();
  return last && last !== fileName ? last : undefined;
}

function inferKind(fileName: string): GeneratedFileKind {
  const extension = extensionForFileName(fileName);
  return extension ? (EXTENSION_TO_KIND[extension] ?? 'other') : 'other';
}

function dedupeCitations(citations: OpenAIContainerFileCitation[]): OpenAIContainerFileCitation[] {
  const seen = new Set<string>();
  const deduped: OpenAIContainerFileCitation[] = [];
  for (const citation of citations) {
    const key = `${citation.container_id}:${citation.file_id}:${citation.filename}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(citation);
  }
  return deduped;
}

export function extractOpenAIContainerFileCitations(
  payload: unknown,
): OpenAIContainerFileCitation[] {
  const citations: OpenAIContainerFileCitation[] = [];
  const visit = (value: unknown) => {
    if (isContainerFileCitation(value)) {
      citations.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (isRecord(value)) {
      Object.values(value).forEach(visit);
    }
  };
  visit(payload);
  return dedupeCitations(citations);
}

export function buildOpenAIContainerGeneratedFileBundles(
  input: BuildOpenAIContainerGeneratedFilesInput,
): OpenAIContainerGeneratedFileBundle[] {
  const expectedPrivacyMode = providerModeToPrivacyMode(input.providerMode);
  if (input.privacyMode !== expectedPrivacyMode) {
    throw new Error(
      `OpenAI generated-file privacy mismatch: ${input.providerMode} requires ${expectedPrivacyMode}`,
    );
  }

  if (input.privacyMode === 'byok' && input.storageScope !== 'direct_byok_provider') {
    throw new Error('OpenAI BYOK generated files must use direct_byok_provider storage scope');
  }
  if (input.privacyMode === 'managed' && input.storageScope !== 'managed_compute') {
    throw new Error('OpenAI managed generated files must use managed_compute storage scope');
  }

  const materializedByFileId = new Map(input.files.map((file) => [file.fileId, file]));
  const citations = dedupeCitations(input.citations);
  const citationsByContainer = new Map<string, OpenAIContainerFileCitation[]>();
  for (const citation of citations) {
    const group = citationsByContainer.get(citation.container_id) ?? [];
    group.push(citation);
    citationsByContainer.set(citation.container_id, group);
  }

  const now = input.createdAt ?? new Date().toISOString();
  const bundles: OpenAIContainerGeneratedFileBundle[] = [];

  for (const [containerId, containerCitations] of citationsByContainer) {
    const computeSessionId = `openai-container-${stableSegment(containerId)}`;
    const generatedFiles = containerCitations.map((citation): GeneratedFile => {
      const materialized = materializedByFileId.get(citation.file_id);
      if (!materialized) {
        throw new Error(`Missing materialized file metadata for OpenAI file ${citation.file_id}`);
      }

      const kind = materialized.kind ?? inferKind(citation.filename);
      return {
        id: `openai-file-${stableSegment(citation.file_id)}`,
        computeSessionId,
        ownerUserId: input.ownerUserId,
        sourceSurface: input.sourceSurface,
        privacyMode: input.privacyMode,
        providerMode: input.providerMode,
        kind,
        fileName: citation.filename,
        mimeType: materialized.mimeType ?? KIND_TO_MIME[kind],
        uri: materialized.uri,
        byteCount: materialized.byteCount,
        checksumSha256: materialized.checksumSha256,
        previewDerivatives: materialized.previewDerivatives ?? [],
        retentionExpiresAt:
          materialized.retentionExpiresAt ?? input.retentionExpiresAt ?? undefined,
        createdAt: materialized.createdAt ?? now,
      };
    });

    const firstFile = generatedFiles[0];
    if (!firstFile) continue;

    const computeSession: ComputeSession = {
      id: computeSessionId,
      ownerUserId: input.ownerUserId,
      organizationId: input.organizationId ?? null,
      sourceSurface: input.sourceSurface,
      privacyMode: input.privacyMode,
      providerMode: input.providerMode,
      provider: 'openai',
      model: input.model ?? null,
      status: 'completed',
      workdirUri: `openai://containers/${encodeURIComponent(containerId)}`,
      retentionExpiresAt: input.retentionExpiresAt ?? null,
      ttlSeconds: input.ttlSeconds,
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    };

    const artifactManifest: ArtifactManifest = {
      id: `openai-artifact-manifest-${stableSegment(containerId)}`,
      artifactId: `openai-artifact-${stableSegment(containerId)}`,
      type: 'generated_file_bundle',
      title:
        generatedFiles.length === 1
          ? firstFile.fileName
          : `OpenAI Code Interpreter files (${generatedFiles.length})`,
      sourceConversationId: input.sourceConversationId ?? null,
      sourceMessageId: input.sourceMessageId ?? null,
      sourceSessionId: input.sourceSessionId ?? input.responseId,
      computeSessionId,
      generatedFileIds: generatedFiles.map((file) => file.id),
      privacyMode: input.privacyMode,
      providerMode: input.providerMode,
      storageScope: input.storageScope,
      checksumSha256: generatedFiles.length === 1 ? firstFile.checksumSha256 : undefined,
      createdAt: now,
      updatedAt: now,
    };

    bundles.push({
      computeSession,
      generatedFiles,
      artifactManifest,
      citations: containerCitations,
    });
  }

  return bundles;
}
