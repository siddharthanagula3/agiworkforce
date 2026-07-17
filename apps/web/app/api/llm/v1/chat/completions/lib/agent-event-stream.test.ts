import { describe, expect, it } from 'vitest';

import { parseAgentEventDelta } from '@agiworkforce/cloud-contracts';
import { createAgentEventStreamEmitter, toAgentEventJson } from './agent-event-stream';

function parseSseLine(line: string): Record<string, unknown> {
  expect(line.startsWith('data: ')).toBe(true);
  return JSON.parse(line.slice('data: '.length)) as Record<string, unknown>;
}

describe('createAgentEventStreamEmitter', () => {
  it('wraps canonical activity in the OpenAI-compatible x_agent_event delta', () => {
    const emitter = createAgentEventStreamEmitter({
      sessionId: 'conversation-1',
      turnId: 'request-1',
      responseModel: 'gpt-test',
      now: () => 1_752_000_000_123,
    });

    const payload = parseSseLine(emitter.emit({ type: 'lifecycle', phase: 'started' }));
    const choices = payload['choices'] as Array<{
      delta: { x_agent_event?: unknown };
      index: number;
    }>;
    const envelope = parseAgentEventDelta(choices[0]?.delta.x_agent_event);

    expect(payload['model']).toBe('gpt-test');
    expect(choices[0]?.index).toBe(0);
    expect(envelope).toEqual({
      schemaVersion: 3,
      sessionId: 'conversation-1',
      turnId: 'request-1',
      sequence: 0,
      emittedAtMs: 1_752_000_000_123,
      event: { type: 'lifecycle', phase: 'started' },
    });
  });

  it('uses a monotonic sequence for every event in one turn', () => {
    const emitter = createAgentEventStreamEmitter({
      sessionId: 'conversation-1',
      turnId: 'request-1',
      responseModel: 'gpt-test',
      now: () => 100,
    });

    const sequences = [
      emitter.emit({ type: 'lifecycle', phase: 'started' }),
      emitter.emit({
        type: 'progress-update',
        progressId: 'work',
        summary: 'Inspecting the request',
        status: 'running',
      }),
      emitter.emit({ type: 'stop', reason: 'end-turn' }),
    ].map((line) => {
      const payload = parseSseLine(line);
      const choice = (payload['choices'] as Array<{ delta: { x_agent_event: unknown } }>)[0];
      return parseAgentEventDelta(choice?.delta.x_agent_event)?.sequence;
    });

    expect(sequences).toEqual([0, 1, 2]);
  });
});

describe('toAgentEventJson', () => {
  it('normalizes runtime values to protocol-safe JSON', () => {
    expect(
      toAgentEventJson({
        query: 'official sources',
        optional: undefined,
        nested: [1, undefined, true],
      }),
    ).toEqual({
      query: 'official sources',
      nested: [1, null, true],
    });
    expect(toAgentEventJson(undefined)).toBeNull();
  });
});
