import { computeDerivedArtifactId, extractCodeBlocks } from '@agiworkforce/artifacts';
import type { ArtifactData } from '@features/chat/components/artifacts/ArtifactPreview';

type SnapshotArtifactType = ArtifactData['type'];

const SNAPSHOT_ARTIFACT_TYPES: Record<SnapshotArtifactType, true> = {
  html: true,
  react: true,
  svg: true,
  mermaid: true,
  code: true,
  document: true,
  spreadsheet: true,
  table: true,
  csv: true,
  presentation: true,
  email: true,
  chart: true,
  image: true,
};

function isSnapshotArtifactType(value: unknown): value is SnapshotArtifactType {
  return typeof value === 'string' && Object.hasOwn(SNAPSHOT_ARTIFACT_TYPES, value);
}

export interface SnapshotAttachment {
  name: string;
  type?: string;
  mimeType?: string;
}

export interface SnapshotArtifact {
  ordinal: number | null;
  title: string;
  type: SnapshotArtifactType;
  language: string;
  content: string;
}

export interface SnapshotMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments: SnapshotAttachment[];
  artifactDerivation: string | null;
  artifacts: SnapshotArtifact[];
}

export interface SnapshotArtifactSource {
  id: string;
  title: string;
  type: SnapshotArtifactType;
  language: string;
  content: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function snapshotArtifacts(
  conversationId: string,
  messageId: string,
  content: string,
  artifacts: readonly SnapshotArtifactSource[],
): SnapshotArtifact[] {
  const blocks = extractCodeBlocks(content);
  return artifacts.flatMap((artifact) => {
    const block = blocks.find(
      (candidate) =>
        computeDerivedArtifactId(conversationId, messageId, candidate.ordinal) === artifact.id,
    );
    if (block && block.content === artifact.content.trim()) return [];
    return [
      {
        ordinal: block ? block.ordinal : null,
        title: artifact.title,
        type: artifact.type,
        language: artifact.language,
        content: artifact.content,
      },
    ];
  });
}

function readAttachments(value: unknown): SnapshotAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry['name'] !== 'string' || !entry['name'].trim()) return [];
    return [
      {
        name: entry['name'].trim(),
        ...(typeof entry['type'] === 'string' ? { type: entry['type'] } : {}),
        ...(typeof entry['mimeType'] === 'string' ? { mimeType: entry['mimeType'] } : {}),
      },
    ];
  });
}

function readArtifacts(value: unknown): SnapshotArtifact[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const { content, title, type, language, ordinal } = entry;
    if (typeof content !== 'string' || typeof title !== 'string' || !isSnapshotArtifactType(type)) {
      return [];
    }
    return [
      {
        ordinal:
          typeof ordinal === 'number' && Number.isInteger(ordinal) && ordinal >= 0 ? ordinal : null,
        title,
        type,
        language: typeof language === 'string' ? language : type,
        content,
      },
    ];
  });
}

export function readSnapshotMessages(raw: unknown, maxContentChars: number): SnapshotMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!isRecord(item)) return [];
    const { role, content } = item;
    if (role !== 'user' && role !== 'assistant' && role !== 'system') return [];
    if (typeof content !== 'string') return [];
    const trimmed = content.trim().slice(0, maxContentChars);
    if (!trimmed) return [];
    const derivation = item['artifact_derivation'];
    return [
      {
        role,
        content: trimmed,
        attachments: readAttachments(item['attachments']),
        artifactDerivation: typeof derivation === 'string' ? derivation : null,
        artifacts: role === 'assistant' ? readArtifacts(item['artifacts']) : [],
      },
    ];
  });
}
