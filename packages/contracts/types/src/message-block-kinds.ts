import type { MessageKind } from './conversation';
import type { AgentEvent } from './generated/protocol/index';

export type AgentEventType = AgentEvent['type'];

export const AGENT_EVENT_MESSAGE_KINDS = Object.freeze({
  'text-delta': 'text',
  'reasoning-delta': 'reasoning',
  'tool-use-start': 'tool_call',
  'tool-use-delta': 'tool_call',
  'tool-use-end': 'tool_call',
  'server-tool-use': 'tool_call',
  'server-tool-result': 'tool_result',
  usage: null,
  error: 'error',
  stop: null,
  lifecycle: 'status',
  'progress-update': 'status',
  'tool-execution-queued': 'tool_call',
  'tool-execution-start': 'tool_call',
  'command-started': 'tool_call',
  'file-changed': 'tool_result',
  'turn-diff': 'tool_result',
  'tool-execution-end': 'tool_result',
  'source-list': 'citation',
  'approval-requested': 'approval',
  'approval-resolved': 'approval',
  'input-requested': 'approval',
  'input-resolved': 'approval',
  'device-step-requested': 'computer_action',
  'device-step-resolved': 'computer_action',
  'artifact-produced': 'artifact',
  'context-compacted': 'status',
  'task-state-changed': 'status',
} as const satisfies Readonly<Record<AgentEventType, MessageKind | null>>);

export function messageKindForAgentEvent(type: string): MessageKind | null {
  return Object.prototype.hasOwnProperty.call(AGENT_EVENT_MESSAGE_KINDS, type)
    ? AGENT_EVENT_MESSAGE_KINDS[type as AgentEventType]
    : null;
}
