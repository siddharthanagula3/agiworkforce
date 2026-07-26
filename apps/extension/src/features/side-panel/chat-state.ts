import { applyAgentActivityEvent, type AgentActivityState } from '@agiworkforce/client-runtime';
import type { ManagedCloudAgentRunReference } from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';

export interface SidePanelChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  error?: boolean;
  agentActivity?: AgentActivityState;
  /** Display-safe canonical events used to rebuild activity after a browser restart. */
  agentEvents?: AgentEventEnvelope[];
  cloudAgentRun?: ManagedCloudAgentRunReference;
  /** Explicit per-tool choices retained while a multi-tool approval batch is incomplete. */
  cloudApprovalDecisions?: Record<string, 'approved' | 'rejected'>;
  /** Retryable, display-only failure from the most recent approval continuation. */
  cloudApprovalError?: string;
  timestamp: number;
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

/**
 * Fold one runtime-validated engine event into the assistant turn. Private
 * reasoning and answer text are deliberately excluded by the shared reducer.
 */
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

/**
 * Resolve the visible user turn before it is admitted to Managed Cloud chat.
 * Attachment-only turns must never leave an enabled Send control as a silent
 * no-op. Keep filenames out of this trusted instruction channel because they
 * are user-controlled metadata.
 */
export function resolveComposerPrompt(text: string, attachmentCount: number): string | null {
  const trimmed = text.trim();
  if (trimmed) return trimmed;
  if (attachmentCount <= 0) return null;
  return attachmentCount === 1
    ? 'Please analyze the attached image.'
    : 'Please analyze the attached images.';
}

/** Mutates the active view in place and returns the number of discarded messages. */
export function trimChatMessages(messages: SidePanelChatMessage[], maximum: number): number {
  const overflow = Math.max(0, messages.length - Math.max(1, maximum));
  if (overflow > 0) messages.splice(0, overflow);
  return overflow;
}

/** Preserve partial output and terminate the same assistant record on stream failure. */
export function applyStreamFailure(
  messages: SidePanelChatMessage[],
  streamId: string,
  errorText: string,
  timestamp = Date.now(),
): void {
  const content = `Error: ${errorText}`;
  const existing = messages.find((message) => message.id === streamId);
  if (existing) {
    existing.content = existing.content ? `${existing.content}\n\n${content}` : content;
    existing.streaming = false;
    existing.error = true;
    return;
  }
  messages.push({
    id: streamId,
    role: 'assistant',
    content,
    error: true,
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

/**
 * Whether an assistant message should render a text bubble element.
 *
 * A bubble is needed when there is text to show and — critically — while the
 * message is still streaming even if its text is momentarily empty. An agentic
 * (tool-using) run creates the assistant message from a tool/agent event with
 * empty content (see {@link applyCanonicalAgentEvent}, `streaming: true`) and
 * only later streams the answer in. Without the streaming case the bubble is
 * never built, so the in-place streaming updater has no `sp-bubble-<id>` target
 * and the streamed reply silently fails to paint — the user sees the activity
 * timeline but no answer.
 */
export function shouldRenderTextBubble(input: { text: string; streaming: boolean }): boolean {
  return input.text.trim().length > 0 || input.streaming === true;
}
