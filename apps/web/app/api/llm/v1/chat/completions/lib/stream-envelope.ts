import 'server-only';

import { randomUUID } from 'node:crypto';
import { STREAM_ENVELOPE_SCHEMA_VERSION, type StreamEnvelope } from '@agiworkforce/types';

export const STREAM_ENVELOPE_WIRE_KEY = 'envelope';

export interface StreamEnvelopeContext {
  conversationId?: string | undefined;
  turnId?: string | undefined;
  /** The last sequence already delivered, so a resumed leg continues the count. */
  startSequence?: number | undefined;
  now?: (() => number) | undefined;
  newEventId?: (() => string) | undefined;
}

export interface StreamEnvelopeStamper {
  stamp(payload: string): string;
  readonly lastSequence: number;
}

const DATA_PREFIX = 'data:';
const DONE_PAYLOAD = '[DONE]';

function toolInvocationIdOf(frame: Record<string, unknown>): string | undefined {
  const choices = frame['choices'];
  const delta = Array.isArray(choices)
    ? ((choices[0] as { delta?: Record<string, unknown> } | undefined)?.delta ?? undefined)
    : undefined;
  const toolCalls = delta?.['tool_calls'];
  if (Array.isArray(toolCalls)) {
    const id = (toolCalls[0] as { id?: unknown } | undefined)?.id;
    if (typeof id === 'string' && id) return id;
  }
  const toolResult = delta?.['x_tool_result'] as { tool_call_id?: unknown } | undefined;
  if (typeof toolResult?.tool_call_id === 'string' && toolResult.tool_call_id) {
    return toolResult.tool_call_id;
  }
  return undefined;
}

/**
 * Stamps identity and order onto an already-serialized wire frame. The envelope
 * is an added key, so a client that does not read it sees the frame unchanged.
 */
export function createStreamEnvelopeStamper(
  context: StreamEnvelopeContext = {},
): StreamEnvelopeStamper {
  const now = context.now ?? (() => Date.now());
  const newEventId = context.newEventId ?? (() => randomUUID());
  let sequence = Math.max(0, Math.trunc(context.startSequence ?? 0));

  return {
    get lastSequence() {
      return sequence;
    },
    stamp(payload: string): string {
      const trimmed = payload.trim();
      if (!trimmed || trimmed === DONE_PAYLOAD) return payload;
      let frame: unknown;
      try {
        frame = JSON.parse(trimmed);
      } catch {
        return payload;
      }
      if (typeof frame !== 'object' || frame === null || Array.isArray(frame)) return payload;
      const record = frame as Record<string, unknown>;
      if (STREAM_ENVELOPE_WIRE_KEY in record) return payload;
      sequence += 1;
      const toolInvocationId = toolInvocationIdOf(record);
      const envelope: StreamEnvelope = {
        schemaVersion: STREAM_ENVELOPE_SCHEMA_VERSION,
        eventId: newEventId(),
        sequence,
        emittedAt: now(),
        ...(context.conversationId ? { conversationId: context.conversationId } : {}),
        ...(context.turnId ? { turnId: context.turnId } : {}),
        ...(toolInvocationId ? { toolInvocationId } : {}),
      };
      return JSON.stringify({ ...record, [STREAM_ENVELOPE_WIRE_KEY]: envelope });
    },
  };
}

function stampEventBlock(block: string, stamper: StreamEnvelopeStamper): string {
  const lines = block.split('\n');
  const dataIndexes: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]?.startsWith(DATA_PREFIX)) dataIndexes.push(index);
  }
  if (dataIndexes.length === 0) return block;

  const joined = dataIndexes
    .map((index) => (lines[index] ?? '').slice(DATA_PREFIX.length).replace(/^ /, ''))
    .join('\n');
  const stamped = stamper.stamp(joined);
  if (stamped === joined) return block;

  const first = dataIndexes[0] as number;
  const rebuilt: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (index === first) rebuilt.push(`${DATA_PREFIX} ${stamped}`);
    else if (!dataIndexes.includes(index)) rebuilt.push(lines[index] as string);
  }
  return rebuilt.join('\n');
}

/**
 * Wraps an SSE body so every JSON frame carries an envelope. Frames it cannot
 * parse, comments and the terminator pass through byte for byte.
 */
export function withStreamEnvelope(
  source: ReadableStream<Uint8Array>,
  context: StreamEnvelopeContext = {},
): ReadableStream<Uint8Array> {
  const stamper = createStreamEnvelopeStamper(context);
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = source.getReader();
  let buffer = '';

  const drain = (controller: ReadableStreamDefaultController<Uint8Array>, flush: boolean): void => {
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      controller.enqueue(encoder.encode(`${stampEventBlock(block, stamper)}\n\n`));
      boundary = buffer.indexOf('\n\n');
    }
    if (flush && buffer) {
      controller.enqueue(encoder.encode(stampEventBlock(buffer, stamper)));
      buffer = '';
    }
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            buffer += decoder.decode(value, { stream: true });
            buffer = buffer.replace(/\r\n|\r/g, '\n');
            drain(controller, false);
          }
        }
        buffer += decoder.decode();
        drain(controller, true);
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
}

export interface TurnResumeFrameInput {
  content: string;
  model: string;
  completionId: string;
  finishReason: string;
  conversationId: string;
  turnId: string;
  startSequence: number;
  created?: number;
  now?: (() => number) | undefined;
  newEventId?: (() => string) | undefined;
}

/**
 * The replay leg of a dropped stream: the text the client has not seen, then a
 * finish frame, both stamped so the reader's sequence continues unbroken.
 */
export function buildTurnResumeStream(input: TurnResumeFrameInput): ReadableStream<Uint8Array> {
  const stamper = createStreamEnvelopeStamper({
    conversationId: input.conversationId,
    turnId: input.turnId,
    startSequence: input.startSequence,
    ...(input.now ? { now: input.now } : {}),
    ...(input.newEventId ? { newEventId: input.newEventId } : {}),
  });
  const created = input.created ?? Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();

  const frame = (delta: Record<string, unknown>, finishReason: string | null): string =>
    stamper.stamp(
      JSON.stringify({
        id: input.completionId,
        object: 'chat.completion.chunk',
        created,
        model: input.model,
        choices: [{ index: 0, delta, finish_reason: finishReason }],
      }),
    );

  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (input.content) {
        controller.enqueue(encoder.encode(`data: ${frame({ content: input.content }, null)}\n\n`));
      }
      controller.enqueue(encoder.encode(`data: ${frame({}, input.finishReason)}\n\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}
