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
