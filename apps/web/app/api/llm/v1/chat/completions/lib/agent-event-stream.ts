import type { AgentEvent, AgentEventEnvelope } from '@agiworkforce/types/protocol';
import {
  AGENT_EVENT_SCHEMA_VERSION,
  AgentEventEnvelopeSchema,
} from '@agiworkforce/cloud-contracts';

type AgentEventJson = Extract<AgentEvent, { type: 'tool-execution-start' }>['input'];

export interface AgentEventStreamEmitterOptions {
  sessionId: string;
  turnId: string;
  responseModel: string;
  now?: () => number;
}

export interface AgentEventStreamEmitter {
  emit(event: AgentEvent): string;
}

export interface PublicTextDeltaProjector {
  push(delta: string): string;
  flush(): string;
}

const THINKING_OPEN_TAG = '<thinking>';
const THINKING_CLOSE_TAG = '</thinking>';

function longestTrailingTagPrefix(value: string, tag: string): number {
  const maxLength = Math.min(value.length, tag.length - 1);
  for (let length = maxLength; length > 0; length -= 1) {
    if (value.endsWith(tag.slice(0, length))) return length;
  }
  return 0;
}

/**
 * Project the legacy Web wire's mixed `<thinking>` + answer stream onto the
 * public answer only. Partial tag prefixes are retained across provider
 * chunks, while private reasoning is discarded instead of entering the
 * durable managed-run journal.
 */
export function createPublicTextDeltaProjector(): PublicTextDeltaProjector {
  let buffer = '';
  let inThinking = false;

  const drain = (final: boolean): string => {
    let publicText = '';
    while (buffer) {
      const tag = inThinking ? THINKING_CLOSE_TAG : THINKING_OPEN_TAG;
      const tagIndex = buffer.indexOf(tag);
      if (tagIndex >= 0) {
        if (!inThinking) publicText += buffer.slice(0, tagIndex);
        buffer = buffer.slice(tagIndex + tag.length);
        inThinking = !inThinking;
        continue;
      }

      if (final) {
        if (!inThinking) publicText += buffer;
        buffer = '';
        break;
      }

      const retainedPrefixLength = longestTrailingTagPrefix(buffer, tag);
      const consumableLength = buffer.length - retainedPrefixLength;
      if (!inThinking) publicText += buffer.slice(0, consumableLength);
      buffer = buffer.slice(consumableLength);
      break;
    }
    return publicText;
  };

  return {
    push(delta) {
      buffer += delta;
      return drain(false);
    },
    flush() {
      return drain(true);
    },
  };
}

/**
 * Convert runtime tool arguments/results into the JSON-only value accepted by
 * the cross-surface agent-event protocol. Provider and connector values are
 * untrusted at this boundary, so undefined/function fields are removed,
 * undefined array slots become null, and bigint values are represented as
 * decimal strings instead of crashing the stream serializer.
 */
export function toAgentEventJson(value: unknown): AgentEventJson {
  const serialized = JSON.stringify(value, (_key, current: unknown) =>
    typeof current === 'bigint' ? current.toString() : current,
  );
  if (serialized === undefined) return null;
  return JSON.parse(serialized) as AgentEventJson;
}

/**
 * Build one ordered canonical activity stream for a managed-cloud turn. The
 * resulting line remains OpenAI-SSE compatible while carrying the shared
 * protocol in `delta.x_agent_event` for Web, Desktop Cloud, and Mobile Cloud.
 */
export function createAgentEventStreamEmitter(
  options: AgentEventStreamEmitterOptions,
): AgentEventStreamEmitter {
  let sequence = 0;
  const now = options.now ?? Date.now;

  return {
    emit(event) {
      const envelope: AgentEventEnvelope = AgentEventEnvelopeSchema.parse({
        schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
        sessionId: options.sessionId,
        turnId: options.turnId,
        sequence,
        emittedAtMs: now(),
        event,
      });
      sequence += 1;

      return `data: ${JSON.stringify({
        choices: [{ delta: { x_agent_event: envelope }, index: 0 }],
        model: options.responseModel,
      })}\n\n`;
    },
  };
}
