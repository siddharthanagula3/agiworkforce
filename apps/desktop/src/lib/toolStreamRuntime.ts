import type { ToolStreamStateEntry } from '../stores/chat/toolStore';
import type { UnifiedChatState } from '../stores/unifiedChatStore';
import type { MessageLookupSnapshot } from './messageLookup';
import { findMessageOwningArtifact } from './messageLookup';
import {
  buildMessageArtifactUpdate,
  buildToolArtifactTerminalArtifact,
  updateMessageArtifactById,
} from './messageArtifacts';

type ToolTrailMutationState = Pick<UnifiedChatState, 'actionTrail' | 'removeActionTrailEntry'>;

type ToolArtifactMutationState = MessageLookupSnapshot & Pick<UnifiedChatState, 'updateMessage'>;

export type ToolTerminalArtifactStatus = 'completed' | 'failed' | 'cancelled';
export type ToolStreamStateUpdate = Partial<ToolStreamStateEntry>;

interface ToolTerminalArtifactOptions {
  status: ToolTerminalArtifactStatus;
  reason?: string;
  completedAt?: string;
  durationMs?: number;
  messageState?: Record<string, unknown>;
}

export function buildStartedToolStreamUpdate(input: {
  toolId: string;
  toolName: string;
  timestamp: string;
  parameters?: Record<string, unknown>;
}): ToolStreamStateUpdate {
  return {
    tool_id: input.toolId,
    tool_name: input.toolName,
    status: 'running',
    progress: 0,
    startedAt: new Date(input.timestamp),
    parameters: input.parameters,
  };
}

export function buildProgressToolStreamUpdate(input: {
  progress: number;
  message?: string;
  bytesProcessed?: number;
  bytesTotal?: number;
}): ToolStreamStateUpdate {
  return {
    progress: input.progress,
    progressMessage: input.message,
    bytesProcessed: input.bytesProcessed,
    bytesTotal: input.bytesTotal,
  };
}

export function buildOutputChunkToolStreamUpdate(chunk: string): ToolStreamStateUpdate {
  return {
    outputBuffer: chunk,
    outputChunks: [chunk],
  };
}

export function buildTerminalToolStreamUpdate(input: {
  status: 'completed' | 'error' | 'cancelled';
  timestamp: string;
  durationMs: number;
  result?: unknown;
  error?: string;
  retryable?: boolean;
}): ToolStreamStateUpdate {
  return {
    status: input.status,
    progress: input.status === 'completed' ? 1.0 : undefined,
    result: input.result,
    error: input.error,
    completedAt: new Date(input.timestamp),
    duration_ms: input.durationMs,
    retryable: input.retryable,
  };
}

export function normalizeToolTerminalArtifactStatus(
  status: 'running' | 'completed' | 'error' | 'cancelled',
): ToolTerminalArtifactStatus {
  if (status === 'running') {
    return 'completed';
  }

  if (status === 'error') {
    return 'failed';
  }

  return status;
}

export function clearRunningToolTrailEntries(
  state: ToolTrailMutationState,
  toolId: string,
  toolName?: string,
): string[] {
  const matches = state.actionTrail.filter((entry) => {
    if (entry.type !== 'running') return false;

    const metadataToolCallId = (entry.metadata as Record<string, unknown> | undefined)?.[
      'tool_call_id'
    ];
    if (metadataToolCallId === toolId) return true;
    if (!toolName) return false;

    return (
      entry.message === `Executing ${toolName}...` || entry.message === `Calling ${toolName}...`
    );
  });

  for (const entry of matches) {
    state.removeActionTrailEntry(entry.id);
  }

  return matches.map((entry) => entry.id);
}

export function reconcileToolArtifactTerminalState(
  state: ToolArtifactMutationState,
  toolId: string,
  options: ToolTerminalArtifactOptions,
): string | null {
  const artifactOwner = findMessageOwningArtifact(state, toolId);
  if (!artifactOwner) {
    return null;
  }

  const updatedArtifacts = updateMessageArtifactById(artifactOwner.message, toolId, (artifact) =>
    buildToolArtifactTerminalArtifact(artifact, {
      status: options.status,
      reason: options.reason,
      completedAt: options.completedAt,
      durationMs: options.durationMs,
    }),
  );

  if (!updatedArtifacts) {
    return artifactOwner.message.id;
  }

  state.updateMessage(
    artifactOwner.message.id,
    buildMessageArtifactUpdate(artifactOwner.message, updatedArtifacts, options.messageState),
  );

  return artifactOwner.message.id;
}
