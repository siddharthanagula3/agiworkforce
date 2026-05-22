import type { Artifact as PanelArtifact, ArtifactSummary, ArtifactType } from '@/api/artifacts';
import type { Artifact as MessageArtifact } from '@/types/chat';

export const PERSISTED_ARTIFACT_ID_METADATA_KEY = 'persistedArtifactId';

export interface PanelArtifactCreateInput {
  title: string;
  artifactType: ArtifactType;
  content: string;
  metadata: Record<string, unknown>;
  tags: string[];
}

function getArtifactMetadata(artifact: MessageArtifact): Record<string, unknown> {
  return artifact.metadata && typeof artifact.metadata === 'object' ? artifact.metadata : {};
}

export function getPersistedArtifactId(artifact: MessageArtifact): string | null {
  const metadata = getArtifactMetadata(artifact);
  const persistedId = metadata[PERSISTED_ARTIFACT_ID_METADATA_KEY] ?? metadata['artifactId'];
  return typeof persistedId === 'string' && persistedId.trim().length > 0
    ? persistedId.trim()
    : null;
}

export function getArtifactPanelCandidateIds(artifact: MessageArtifact): string[] {
  return [getPersistedArtifactId(artifact), artifact.id].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );
}

function normalizeType(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function getPanelArtifactType(artifact: MessageArtifact): ArtifactType {
  const type = normalizeType(artifact.type);
  const language = normalizeType(artifact.language);

  if (type === 'html' || type === 'react' || type === 'component' || language === 'html') {
    return 'web';
  }
  if (type === 'markdown' || type === 'document' || language === 'markdown' || language === 'md') {
    return 'document';
  }
  if (type === 'spreadsheet' || type === 'table') {
    return 'spreadsheet';
  }
  if (type === 'diagram' || type === 'mermaid') {
    return 'diagram';
  }
  if (type === 'chart') {
    return 'chart';
  }
  if (type === 'presentation') {
    return 'presentation';
  }
  if (type === 'image') {
    return 'image';
  }

  return 'code';
}

function buildBackendMetadata(artifact: MessageArtifact, artifactType: ArtifactType) {
  const metadata = getArtifactMetadata(artifact);
  const language = normalizeType(artifact.language) || normalizeType(artifact.type) || 'text';

  switch (artifactType) {
    case 'code':
      return {
        language,
        file_path:
          typeof metadata['filePath'] === 'string'
            ? metadata['filePath']
            : typeof metadata['file_path'] === 'string'
              ? metadata['file_path']
              : null,
        highlight_lines: Array.isArray(metadata['highlightLines'])
          ? metadata['highlightLines']
          : Array.isArray(metadata['highlight_lines'])
            ? metadata['highlight_lines']
            : null,
        executable: Boolean(metadata['executable']),
      };
    case 'document':
      return {
        format:
          normalizeType(artifact.language) ||
          (normalizeType(artifact.type) === 'markdown' ? 'markdown' : 'plain'),
        toc: [],
        word_count: artifact.content.split(/\s+/).filter(Boolean).length,
      };
    case 'spreadsheet':
      return {
        columns: [],
        row_count: Math.max(artifact.content.trim().split(/\r?\n/).filter(Boolean).length - 1, 0),
        column_types: null,
        formulas: null,
      };
    case 'diagram':
      return {
        diagram_type: normalizeType(artifact.type) === 'mermaid' ? 'mermaid' : 'diagram',
        theme: 'dark',
      };
    case 'web':
      return {
        enable_scripts: true,
        external_resources: [],
        viewport: null,
      };
    case 'chart':
      return {
        chart_type: typeof metadata['chartType'] === 'string' ? metadata['chartType'] : 'bar',
        x_label: null,
        y_label: null,
        show_legend: true,
      };
    default:
      return {
        source: 'message-artifact',
        original_type: artifact.type,
        language: artifact.language ?? null,
      };
  }
}

export function buildPanelArtifactCreateInput(artifact: MessageArtifact): PanelArtifactCreateInput {
  const artifactType = getPanelArtifactType(artifact);
  const metadata = getArtifactMetadata(artifact);

  return {
    title: artifact.title?.trim() || 'Generated Artifact',
    artifactType,
    content: artifact.content,
    metadata: {
      ...buildBackendMetadata(artifact, artifactType),
      source_message_artifact_id: artifact.id,
      ...(typeof metadata['toolName'] === 'string' ? { tool_name: metadata['toolName'] } : {}),
    },
    tags: ['message-artifact'],
  };
}

export function attachPersistedArtifactId(
  artifact: MessageArtifact,
  persistedArtifactId: string,
): MessageArtifact {
  return {
    ...artifact,
    metadata: {
      ...getArtifactMetadata(artifact),
      [PERSISTED_ARTIFACT_ID_METADATA_KEY]: persistedArtifactId,
    },
  };
}

export function artifactToSummary(artifact: PanelArtifact): ArtifactSummary {
  return {
    id: artifact.id,
    title: artifact.title,
    artifact_type: artifact.artifact_type,
    status: artifact.status,
    current_version: artifact.current_version,
    version_count: artifact.versions.length,
    created_at: artifact.created_at,
    updated_at: artifact.updated_at,
    size_bytes: new TextEncoder().encode(artifact.content).length,
    tags: artifact.tags,
    pinned: artifact.pinned,
    conversation_id: artifact.conversation_id,
  };
}
