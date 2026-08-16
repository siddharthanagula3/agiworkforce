import type { GeneratedFile, GeneratedFileKind } from '@agiworkforce/types';
import {
  parseGeneratedFilesDelta,
  resolveGeneratedFileUri,
  type GeneratedFileWire,
} from '@agiworkforce/cloud-contracts';
import { API_URL } from '@/lib/constants';
import type { Artifact } from '@/types/chat';

export interface PersistedGeneratedFileMetadata {
  id: string;
  fileName: string;
  mimeType: string;
  uri: string;
  byteCount: number;
  kind: string;
  checksumSha256?: string;
  surface?: 'artifact' | 'file';
  previewable?: boolean;
}

const GENERATED_FILE_KINDS: ReadonlySet<string> = new Set([
  'pdf',
  'docx',
  'xlsx',
  'pptx',
  'csv',
  'json',
  'markdown',
  'html',
  'image',
  'archive',
  'other',
]);

export function dedupeGeneratedFileWire(files: GeneratedFileWire[]): GeneratedFileWire[] {
  const byId = new Map<string, GeneratedFileWire>();
  for (const file of files) byId.set(file.id, file);
  return [...byId.values()];
}

export function generatedFileMetadataFromWire(
  files: GeneratedFileWire[],
): PersistedGeneratedFileMetadata[] {
  return dedupeGeneratedFileWire(files).map((file) => ({
    id: file.id,
    fileName: file.file_name,
    mimeType: file.mime_type,
    uri: file.uri,
    byteCount: file.byte_count,
    kind: file.kind,
    ...(file.checksum_sha256 ? { checksumSha256: file.checksum_sha256 } : {}),
    surface: file.surface,
    previewable: file.previewable,
  }));
}

export function generatedFileWireFromMetadata(metadata: unknown): GeneratedFileWire[] {
  if (!Array.isArray(metadata)) return [];
  return parseGeneratedFilesDelta({
    files: metadata.map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
      const file = entry as Record<string, unknown>;
      return {
        id: file.id,
        file_name: file.fileName,
        mime_type: file.mimeType,
        uri: file.uri,
        byte_count: file.byteCount,
        kind: file.kind,
        checksum_sha256: file.checksumSha256,
        surface: file.surface,
        previewable: file.previewable,
      };
    }),
  });
}

export function generatedFileArtifactsFromWire(
  files: GeneratedFileWire[],
  createdAt: string,
): Artifact[] {
  return dedupeGeneratedFileWire(files).map((file) => {
    const kind: GeneratedFileKind = GENERATED_FILE_KINDS.has(file.kind)
      ? (file.kind as GeneratedFileKind)
      : 'other';
    const generatedFile: GeneratedFile = {
      id: file.id,
      computeSessionId: '',
      ownerUserId: '',
      sourceSurface: 'mobile',
      privacyMode: 'managed',
      providerMode: 'ManagedGateway',
      kind,
      fileName: file.file_name,
      mimeType: file.mime_type,
      uri: resolveGeneratedFileUri(file.uri, API_URL),
      byteCount: file.byte_count,
      checksumSha256: file.checksum_sha256 ?? '',
      previewDerivatives: [],
      createdAt,
    };
    return {
      id: file.id,
      type: kind === 'image' ? ('image' as const) : ('document' as const),
      title: file.file_name,
      content: '',
      generatedFile,
      metadata: {
        status: 'completed',
        surface: file.surface,
        previewable: file.previewable,
      },
    };
  });
}

export function generatedFileArtifactsFromMetadata(
  metadata: unknown,
  createdAt: string,
): Artifact[] {
  return generatedFileArtifactsFromWire(generatedFileWireFromMetadata(metadata), createdAt);
}

export function mergeDerivedAndGeneratedFileArtifacts(
  derived: Artifact[],
  generated: Artifact[],
): Artifact[] {
  if (generated.length === 0) return derived;

  const generatedFormats = new Set<string>();
  for (const artifact of generated) {
    const kind = artifact.generatedFile?.kind?.toLowerCase();
    if (kind) generatedFormats.add(kind);
    const fileName = artifact.generatedFile?.fileName ?? artifact.title;
    const extension = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase();
    if (extension) generatedFormats.add(extension);
  }

  return [
    ...derived.filter((artifact) => {
      const language = artifact.language?.trim().toLowerCase();
      return !language || !generatedFormats.has(language);
    }),
    ...generated,
  ];
}
