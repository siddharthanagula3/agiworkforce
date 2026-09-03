import { applyAgentActivityEvent, type AgentActivityState } from '@agiworkforce/client-runtime';
import type {
  GeneratedFileWire,
  ManagedCloudAgentRunReference,
} from '@agiworkforce/cloud-contracts';
import type { InteractiveCard } from '@agiworkforce/types';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';

export interface SidePanelChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  error?: boolean;
  agentActivity?: AgentActivityState;
  agentEvents?: AgentEventEnvelope[];
  cloudAgentRun?: ManagedCloudAgentRunReference;
  cloudApprovalDecisions?: Record<string, 'approved' | 'rejected'>;
  cloudApprovalError?: string;
  managedQuickMode?: boolean;
  model?: string;
  provider?: string;
  generatedFiles?: GeneratedFileWire[];
  interactiveCards?: InteractiveCard[];
  runtime?: 'managed-cloud' | 'local';
  errorText?: string;
  /**
   * Client-generated UUID reused as the server's `assistant_message_id` and the
   * cloud sync's message id, so a server-persisted turn and the extension's own
   * terminal sync converge on ONE row instead of duplicating.
   */
  cloudMessageId?: string;
  timestamp: number;
}

export interface StoredSidePanelChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  agentEvents?: AgentEventEnvelope[];
  cloudAgentRun?: ManagedCloudAgentRunReference;
  cloudApprovalDecisions?: Record<string, 'approved' | 'rejected'>;
  cloudApprovalError?: string;
  managedQuickMode?: boolean;
  model?: string;
  provider?: string;
  generatedFiles?: GeneratedFileWire[];
  interactiveCards?: InteractiveCard[];
  runtime?: 'managed-cloud' | 'local';
  error?: boolean;
  cloudMessageId?: string;
}

const MAX_PERSISTED_ACTIVITY_EVENTS = 1_000;

function isDisplaySafeActivityEvent(envelope: AgentEventEnvelope): boolean {
  switch (envelope.event.type) {
    case 'lifecycle':
    case 'progress-update':
    case 'tool-execution-start':
    case 'tool-execution-end':
    case 'source-list':
    case 'approval-requested':
    case 'approval-resolved':
    case 'input-requested':
    case 'input-resolved':
    case 'artifact-produced':
    case 'context-compacted':
    case 'task-state-changed':
    case 'error':
    case 'stop':
      return true;
    case 'text-delta':
    case 'reasoning-delta':
    case 'tool-use-start':
    case 'tool-use-delta':
    case 'tool-use-end':
    case 'server-tool-use':
    case 'server-tool-result':
    case 'usage':
      return false;
  }
}

export function projectCanonicalAgentActivity(
  envelopes: readonly AgentEventEnvelope[] | undefined,
): AgentActivityState | undefined {
  let activity: AgentActivityState | undefined;
  for (const envelope of envelopes ?? []) {
    activity = applyAgentActivityEvent(activity, envelope);
  }
  return activity;
}

export function hydrateStoredChatMessage(
  message: StoredSidePanelChatMessage,
  id: string,
): SidePanelChatMessage {
  const agentEvents = message.agentEvents?.map((event) => ({
    ...event,
    event: { ...event.event },
  })) as AgentEventEnvelope[] | undefined;

  return {
    id,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
    ...(agentEvents
      ? {
          agentEvents,
          agentActivity: projectCanonicalAgentActivity(agentEvents),
        }
      : {}),
    ...(message.cloudAgentRun ? { cloudAgentRun: { ...message.cloudAgentRun } } : {}),
    ...(message.cloudApprovalDecisions
      ? { cloudApprovalDecisions: { ...message.cloudApprovalDecisions } }
      : {}),
    ...(message.cloudApprovalError ? { cloudApprovalError: message.cloudApprovalError } : {}),
    ...(message.managedQuickMode ? { managedQuickMode: true } : {}),
    ...(message.model ? { model: message.model } : {}),
    ...(message.provider ? { provider: message.provider } : {}),
    ...(message.generatedFiles
      ? { generatedFiles: message.generatedFiles.map((file) => ({ ...file })) }
      : {}),
    ...(message.interactiveCards
      ? { interactiveCards: message.interactiveCards.map((card) => ({ ...card })) }
      : {}),
    ...(message.runtime ? { runtime: message.runtime } : {}),
    ...(message.error ? { error: true } : {}),
    ...(message.cloudMessageId ? { cloudMessageId: message.cloudMessageId } : {}),
  };
}

export function applyCanonicalAgentEvent(
  messages: SidePanelChatMessage[],
  streamId: string,
  envelope: AgentEventEnvelope,
  timestamp = Date.now(),
): SidePanelChatMessage {
  let assistant = messages.find((message) => message.id === streamId);
  if (!assistant) {
    assistant = {
      id: streamId,
      role: 'assistant',
      content: '',
      streaming: true,
      timestamp,
    };
    messages.push(assistant);
  }
  const previous = assistant.agentActivity;
  const next = applyAgentActivityEvent(previous, envelope);
  assistant.agentActivity = next;
  if (next !== previous && isDisplaySafeActivityEvent(envelope)) {
    assistant.agentEvents = [...(assistant.agentEvents ?? []), envelope].slice(
      -MAX_PERSISTED_ACTIVITY_EVENTS,
    );
  }
  return assistant;
}

export function resolveComposerPrompt(text: string, attachmentCount: number): string | null {
  const trimmed = text.trim();
  if (trimmed) return trimmed;
  if (attachmentCount <= 0) return null;
  return attachmentCount === 1
    ? 'Please analyze the attached image.'
    : 'Please analyze the attached images.';
}

export function trimChatMessages(messages: SidePanelChatMessage[], maximum: number): number {
  const overflow = Math.max(0, messages.length - Math.max(1, maximum));
  if (overflow > 0) messages.splice(0, overflow);
  return overflow;
}

export function applyStreamFailure(
  messages: SidePanelChatMessage[],
  streamId: string,
  errorText: string,
  timestamp = Date.now(),
): void {
  const existing = messages.find((message) => message.id === streamId);
  if (existing) {
    existing.streaming = false;
    existing.error = true;
    existing.errorText = errorText;
    return;
  }
  messages.push({
    id: streamId,
    role: 'assistant',
    content: '',
    error: true,
    errorText,
    timestamp,
  });
}

export function selectModelHistory(
  messages: readonly SidePanelChatMessage[],
  excludedMessageId?: string,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages
    .filter((message) => !message.error && message.id !== excludedMessageId)
    .map((message) => ({ role: message.role, content: message.content }));
}

export function shouldRebuildMessageDom(input: {
  forceRebuild: boolean;
  renderedCount: number;
  messageCount: number;
}): boolean {
  return input.forceRebuild || input.renderedCount > input.messageCount;
}

export function shouldRenderTextBubble(input: { text: string; streaming: boolean }): boolean {
  return input.text.trim().length > 0 || input.streaming === true;
}
