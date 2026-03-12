import type { EnhancedMessage } from '../stores/chat/types';
import type { Artifact } from '../types/chat';

type MessageArtifactCarrier = Pick<EnhancedMessage, 'artifacts' | 'metadata'>;
type ToolArtifactRecord = Artifact & {
  status?: string;
  success?: boolean;
  error?: string;
  content?: string;
};

export type ToolArtifactTerminalStatus = 'completed' | 'failed' | 'cancelled';

export function getMergedMessageArtifacts(message: MessageArtifactCarrier): Artifact[] {
  const artifacts = message.artifacts ?? [];
  const metadataArtifacts = Array.isArray(message.metadata?.artifacts)
    ? message.metadata.artifacts
    : [];

  if (metadataArtifacts.length === 0) {
    return [...artifacts];
  }

  const merged: Artifact[] = [...artifacts];
  const existingIds = new Set(artifacts.map((artifact) => artifact.id));
  for (const artifact of metadataArtifacts) {
    if (!existingIds.has(artifact.id)) {
      merged.push(artifact);
    }
  }

  return merged;
}

export function upsertMessageArtifact(
  message: MessageArtifactCarrier,
  nextArtifact: Artifact,
): Artifact[] {
  const artifacts = getMergedMessageArtifacts(message);
  const index = artifacts.findIndex((artifact) => artifact.id === nextArtifact.id);

  return index >= 0
    ? artifacts.map((artifact, artifactIndex) =>
        artifactIndex === index ? nextArtifact : artifact,
      )
    : [...artifacts, nextArtifact];
}

export function updateMessageArtifactById(
  message: MessageArtifactCarrier,
  artifactId: string,
  updater: (artifact: Artifact) => Artifact,
): Artifact[] | null {
  const artifacts = getMergedMessageArtifacts(message);
  const index = artifacts.findIndex((artifact) => artifact.id === artifactId);

  if (index < 0) {
    return null;
  }

  return artifacts.map((artifact, artifactIndex) =>
    artifactIndex === index ? updater(artifact) : artifact,
  );
}

export function buildToolArtifactTerminalArtifact(
  artifact: Artifact,
  options: {
    status: ToolArtifactTerminalStatus;
    reason?: string;
    completedAt?: string;
    durationMs?: number;
    contentFallback?: string;
  },
): Artifact {
  const runtimeArtifact = artifact as ToolArtifactRecord;
  const currentContent = (runtimeArtifact.content ?? '').trim();
  const nextContent =
    currentContent ||
    options.contentFallback ||
    (options.status === 'completed'
      ? 'Tool completed. Output included in assistant response.'
      : (options.reason ?? 'Tool execution ended.'));

  return {
    ...runtimeArtifact,
    status: options.status,
    success: options.status === 'completed',
    error: options.status === 'completed' ? undefined : options.reason,
    content: nextContent,
    metadata: {
      ...(runtimeArtifact.metadata ?? {}),
      status: options.status,
      ...(options.reason ? { error: options.reason } : {}),
      ...(options.completedAt ? { completedAt: options.completedAt } : {}),
      ...(typeof options.durationMs === 'number' ? { duration_ms: options.durationMs } : {}),
    },
  } as Artifact;
}

export function finalizeRunningMessageArtifacts(
  message: MessageArtifactCarrier,
  options: {
    status: ToolArtifactTerminalStatus;
    reason?: string;
    completedAt?: string;
    durationMs?: number;
    contentFallback?: string;
  },
): Artifact[] | null {
  const artifacts = getMergedMessageArtifacts(message);
  let changed = false;

  const nextArtifacts = artifacts.map((artifact) => {
    const runtimeArtifact = artifact as ToolArtifactRecord;
    if (runtimeArtifact.status !== 'running') {
      return artifact;
    }

    changed = true;
    return buildToolArtifactTerminalArtifact(artifact, options);
  });

  return changed ? nextArtifacts : null;
}

export function buildMessageArtifactUpdate(
  message: MessageArtifactCarrier,
  artifacts: Artifact[],
  metadataPatch: Record<string, unknown> = {},
): Pick<EnhancedMessage, 'artifacts' | 'metadata'> {
  return {
    artifacts,
    metadata: {
      ...(message.metadata ?? {}),
      artifacts,
      ...metadataPatch,
    },
  };
}
