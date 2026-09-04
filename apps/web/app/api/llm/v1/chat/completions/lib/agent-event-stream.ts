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
  initialSequence?: number;
  now?: () => number;
}

export interface AgentEventStreamEmitter {
  emit(event: AgentEvent): string;
  emitWithEnvelope(event: AgentEvent): { envelope: AgentEventEnvelope; sse: string };
  nextSequence(): number;
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

function createTaggedTextDeltaProjector(collectThinkingSide: boolean): PublicTextDeltaProjector {
  let buffer = '';
  let inThinking = false;

  const drain = (final: boolean): string => {
    let collected = '';
    while (buffer) {
      const tag = inThinking ? THINKING_CLOSE_TAG : THINKING_OPEN_TAG;
      const tagIndex = buffer.indexOf(tag);
      if (tagIndex >= 0) {
        if (inThinking === collectThinkingSide) collected += buffer.slice(0, tagIndex);
        buffer = buffer.slice(tagIndex + tag.length);
        inThinking = !inThinking;
        continue;
      }

      if (final) {
        if (inThinking === collectThinkingSide) collected += buffer;
        buffer = '';
        break;
      }

      const retainedPrefixLength = longestTrailingTagPrefix(buffer, tag);
      const consumableLength = buffer.length - retainedPrefixLength;
      if (inThinking === collectThinkingSide) collected += buffer.slice(0, consumableLength);
      buffer = buffer.slice(consumableLength);
      break;
    }
    return collected;
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

export function createPublicTextDeltaProjector(): PublicTextDeltaProjector {
  return createTaggedTextDeltaProjector(false);
}

/**
 * The inverse of `createPublicTextDeltaProjector`: collects the text INSIDE
 * `<thinking>` tags instead of outside them, so a reasoning summary can be
 * projected onto its own `reasoning-delta` agent event rather than only
 * surviving as literal tag-wrapped `content`.
 */
export function createThinkingTextDeltaProjector(): PublicTextDeltaProjector {
  return createTaggedTextDeltaProjector(true);
}

export function toAgentEventJson(value: unknown): AgentEventJson {
  const serialized = JSON.stringify(value, (_key, current: unknown) =>
    typeof current === 'bigint' ? current.toString() : current,
  );
  if (serialized === undefined) return null;
  return JSON.parse(serialized) as AgentEventJson;
}

export function createAgentEventStreamEmitter(
  options: AgentEventStreamEmitterOptions,
): AgentEventStreamEmitter {
  let sequence = Math.max(0, Math.trunc(options.initialSequence ?? 0));
  const now = options.now ?? Date.now;

  const emitWithEnvelope = (event: AgentEvent): { envelope: AgentEventEnvelope; sse: string } => {
    const envelope: AgentEventEnvelope = AgentEventEnvelopeSchema.parse({
      schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
      sessionId: options.sessionId,
      turnId: options.turnId,
      sequence,
      emittedAtMs: now(),
      event,
    });
    sequence += 1;

    return {
      envelope,
      sse: `data: ${JSON.stringify({
        choices: [{ delta: { x_agent_event: envelope }, index: 0 }],
        model: options.responseModel,
      })}\n\n`,
    };
  };

  return {
    emit(event) {
      return emitWithEnvelope(event).sse;
    },
    emitWithEnvelope,
    nextSequence() {
      return sequence;
    },
  };
}
