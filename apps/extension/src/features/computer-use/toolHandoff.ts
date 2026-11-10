import { messageKindForAgentEvent } from '@agiworkforce/types';
import {
  AgentEventEnvelopeSchema,
  CALLER_TOOL_BOUNDARY_EVENT_COUNT,
  CallerToolResumeRequestSchema,
  readCallerToolHandoff,
  readCompleteCallerToolCalls,
  type CallerToolCall,
  type CallerToolResumeRequest,
} from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import type { ToolDefinition } from './browserToolDefinitions';

export type ToolCall = CallerToolCall;
export type ToolOfferingReference = Readonly<{
  function: Readonly<Pick<ToolDefinition['function'], 'name'>>;
}>;

export interface CallerToolContinuation extends Omit<
  CallerToolResumeRequest,
  'tool_results' | 'observations'
> {
  calls: ToolCall[];
}

export class CallerToolContinuationError extends Error {
  constructor() {
    super('The cloud returned an incomplete or conflicting caller-action checkpoint.');
    this.name = 'CallerToolContinuationError';
  }
}

export function createCallerToolContinuationReader(tools: readonly ToolOfferingReference[]) {
  let boundary: AgentEventEnvelope[] | null = null;
  let calls: ToolCall[] | null = null;
  let lastEnvelope: AgentEventEnvelope | null = null;
  let observedSequence = -1;
  return {
    observe(input: AgentEventEnvelope): void {
      const parsed = AgentEventEnvelopeSchema.safeParse(input);
      if (!parsed.success) throw new CallerToolContinuationError();
      const envelope = parsed.data;
      if (!boundary && !lastEnvelope && envelope.event.type !== 'caller-tools-requested') {
        observedSequence = Math.max(observedSequence, envelope.sequence);
        return;
      }
      const duplicate = boundary?.find((entry) => entry.sequence === envelope.sequence);
      if (duplicate) {
        if (JSON.stringify(duplicate) !== JSON.stringify(envelope))
          throw new CallerToolContinuationError();
        return;
      }
      if (envelope.sequence < observedSequence) return;
      if (lastEnvelope && envelope.sequence === lastEnvelope.sequence) {
        if (JSON.stringify(lastEnvelope) !== JSON.stringify(envelope))
          throw new CallerToolContinuationError();
        return;
      }
      lastEnvelope = envelope;
      observedSequence = Math.max(observedSequence, envelope.sequence);
      if (envelope.event.type === 'caller-tools-requested') {
        if (
          envelope.event.nextEventSequence !==
          envelope.sequence + CALLER_TOOL_BOUNDARY_EVENT_COUNT
        )
          throw new CallerToolContinuationError();
        calls = readCompleteToolCalls(
          envelope.event.calls.map((call, index) => ({ ...call, index })),
          envelope.event.calls.map((call) => call.id),
          tools,
        );
        if (!calls) throw new CallerToolContinuationError();
        boundary = [envelope];
        return;
      }
      if (!boundary) return;
      const first = boundary[0]!;
      if (envelope.sequence < first.sequence) return;
      if (
        boundary.length === CALLER_TOOL_BOUNDARY_EVENT_COUNT &&
        envelope.sequence >= first.sequence + CALLER_TOOL_BOUNDARY_EVENT_COUNT
      ) {
        boundary = null;
        calls = null;
        return;
      }
      const validState =
        boundary.length === 1 &&
        envelope.event.type === 'task-state-changed' &&
        envelope.event.state === 'awaiting_input' &&
        envelope.event.taskId === envelope.turnId;
      const validPause =
        boundary.length === 2 &&
        envelope.event.type === 'lifecycle' &&
        envelope.event.phase === 'paused';
      if (
        envelope.sessionId !== first.sessionId ||
        envelope.turnId !== first.turnId ||
        envelope.sequence !== first.sequence + boundary.length ||
        (!validState && !validPause)
      )
        throw new CallerToolContinuationError();
      boundary.push(envelope);
    },
    incomplete(): boolean {
      return boundary !== null && boundary.length < CALLER_TOOL_BOUNDARY_EVENT_COUNT;
    },
    read(runId: string | undefined): CallerToolContinuation | null {
      if (!boundary || boundary.length !== CALLER_TOOL_BOUNDARY_EVENT_COUNT || !calls) return null;
      const first = boundary[0]!;
      const fields = CallerToolResumeRequestSchema.safeParse({
        schema_version: first.schemaVersion,
        run_id: runId,
        turn_id: first.turnId,
        next_event_sequence: first.sequence + CALLER_TOOL_BOUNDARY_EVENT_COUNT,
        tool_results: calls.map((call) => ({ tool_call_id: call.id, content: '' })),
      });
      if (!fields.success) throw new CallerToolContinuationError();
      const { tool_results: _results, ...cursor } = fields.data;
      return { ...cursor, calls: structuredClone(calls) };
    },
  };
}

export function readCompleteToolCalls(
  calls: unknown,
  ids: unknown,
  tools: readonly ToolOfferingReference[],
): ToolCall[] | null {
  return locallyOfferedCalls(readCompleteCallerToolCalls(calls, ids), tools);
}

function locallyOfferedCalls(
  calls: ToolCall[] | null,
  tools: readonly ToolOfferingReference[],
): ToolCall[] | null {
  return calls?.every((call) => tools.some((tool) => tool.function.name === call.function.name))
    ? calls
    : null;
}

/**
 * The gateway hands a caller-declared tool back in one complete snapshot: the
 * marker names every call id and the delta carries each call whole. Anything
 * else is refused, so a partial or unknown call never reaches an executor.
 */
export function readToolHandoff(
  marker: unknown,
  calls: unknown,
  finishReason: unknown,
  tools: readonly ToolOfferingReference[],
): ToolCall[] | null {
  return locallyOfferedCalls(readCallerToolHandoff(marker, calls, finishReason), tools);
}

/**
 * A durable run replays canonical events only. The gateway journals a caller
 * tool handoff as tool-use start, delta and end events per call, closed by a
 * stop with reason tool-use, so a reader that reattaches rebuilds the same
 * snapshot the live stream carried. Calls this turn did not offer are ignored.
 */
export function createToolUseJournal(tools: readonly ToolOfferingReference[]) {
  const pending = new Map<string, { name: string; args: string; ended: boolean }>();
  return {
    observe(event: { type: string }): ToolCall[] | null {
      const record = event as Record<string, unknown>;
      const toolUseId = record['toolUseId'];
      if (messageKindForAgentEvent(event.type) === 'tool_call') {
        if (event.type === 'tool-use-start') {
          if (typeof toolUseId !== 'string' || typeof record['name'] !== 'string') return null;
          pending.set(toolUseId, { name: record['name'], args: '', ended: false });
        } else if (event.type === 'tool-use-delta') {
          const entry = typeof toolUseId === 'string' ? pending.get(toolUseId) : undefined;
          if (entry && typeof record['deltaJson'] === 'string') entry.args += record['deltaJson'];
        } else if (event.type === 'tool-use-end') {
          const entry = typeof toolUseId === 'string' ? pending.get(toolUseId) : undefined;
          if (entry) entry.ended = true;
        }
        return null;
      }
      if (event.type !== 'stop') return null;
      const entries = [...pending.entries()].filter(
        ([, entry]) => entry.ended && tools.some((tool) => tool.function.name === entry.name),
      );
      pending.clear();
      if (record['reason'] !== 'tool-use' || entries.length === 0) return null;
      const calls = readCompleteToolCalls(
        entries.map(([id, entry], index) => ({
          index,
          id,
          type: 'function',
          function: { name: entry.name, arguments: entry.args },
        })),
        entries.map(([id]) => id),
        tools,
      );
      return calls;
    },
  };
}
