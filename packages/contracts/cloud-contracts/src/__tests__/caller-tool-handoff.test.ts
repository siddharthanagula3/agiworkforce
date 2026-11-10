import { describe, expect, it } from 'vitest';
import {
  createCallerToolHandoffDelta,
  readCallerToolHandoff,
  readCompleteCallerToolCalls,
  CallerToolResumeRequestSchema,
  type CallerToolCall,
} from '../caller-tool-handoff';
import { AGENT_EVENT_SCHEMA_VERSION } from '@agiworkforce/types';
import { MAX_CHAT_COMPLETION_REQUEST_BYTES } from '../tool-call-limits';

const calls: CallerToolCall[] = [
  { id: 'read', type: 'function', function: { name: 'read_dom', arguments: '{}' } },
  { id: 'click', type: 'function', function: { name: 'click', arguments: '{"index":3}' } },
];

function snapshot() {
  return createCallerToolHandoffDelta(structuredClone(calls));
}

describe('caller-tool handoff wire contract', () => {
  it('round-trips complete parallel calls with dense indices without changing the source', () => {
    const source = calls.map((call, index) => ({ ...structuredClone(call), index: index + 4 }));
    const original = structuredClone(source);
    const delta = createCallerToolHandoffDelta(source);
    expect(delta.tool_calls.map((call) => call.index)).toEqual([0, 1]);
    expect(readCallerToolHandoff(delta.x_tool_handoff, delta.tool_calls, 'tool_calls')).toEqual(
      calls,
    );
    expect(source).toEqual(original);
  });

  it('preserves the empty-argument compatibility for a no-input function', () => {
    const delta = snapshot();
    delta.tool_calls[0]!.function.arguments = '  ';
    const parsed = readCallerToolHandoff(delta.x_tool_handoff, delta.tool_calls, 'tool_calls');
    expect(parsed?.[0]?.function.arguments).toBe('{}');
  });

  it.each([
    { ids: [] },
    { ids: ['read'] },
    { ids: ['read', 'read'] },
    { ids: ['read', 'unknown'] },
    { ids: ['click', 'read'] },
    { ids: ['read', ' '] },
  ])('rejects an incomplete or ambiguous id snapshot: $ids', ({ ids }) => {
    const delta = snapshot();
    expect(readCompleteCallerToolCalls(delta.tool_calls, ids)).toBeNull();
  });

  it.each(['null', '[]', 'true', '"text"', '{broken'])(
    'rejects non-object arguments atomically: %s',
    (args) => {
      const delta = snapshot();
      delta.tool_calls[1]!.function.arguments = args;
      expect(
        readCallerToolHandoff(delta.x_tool_handoff, delta.tool_calls, 'tool_calls'),
      ).toBeNull();
    },
  );

  it.each([-1, 0.5, 2, Number.MAX_SAFE_INTEGER + 1])('rejects a non-dense index: %s', (index) => {
    const delta = snapshot();
    delta.tool_calls[1]!.index = index;
    expect(readCompleteCallerToolCalls(delta.tool_calls, ['read', 'click'])).toBeNull();
  });

  it.each([null, [], {}, { tool_call_ids: [] }])('requires a complete marker: %j', (marker) => {
    expect(readCallerToolHandoff(marker, snapshot().tool_calls, 'tool_calls')).toBeNull();
  });

  it.each([null, 'stop', 'length', 'error'])('rejects a non-handoff finish: %s', (finish) => {
    const delta = snapshot();
    expect(readCallerToolHandoff(delta.x_tool_handoff, delta.tool_calls, finish)).toBeNull();
  });

  it('refuses to produce a partial or duplicate call snapshot', () => {
    expect(() => createCallerToolHandoffDelta([])).toThrow(TypeError);
    expect(() => createCallerToolHandoffDelta([calls[0]!, calls[0]!])).toThrow(TypeError);
  });

  it('rejects sparse ids instead of returning an undefined call id', () => {
    const malformed = [{ index: 0, type: 'function', function: calls[0]!.function }];
    expect(readCompleteCallerToolCalls(malformed, new Array(1))).toBeNull();
  });
});

describe('caller-tool result receipt', () => {
  function receipt() {
    return {
      schema_version: AGENT_EVENT_SCHEMA_VERSION,
      run_id: '11111111-1111-4111-8111-111111111111',
      turn_id: 'turn-1',
      next_event_sequence: 3,
      tool_results: [{ tool_call_id: 'local-call', content: '' }],
    };
  }

  it('preserves an explicitly empty tool result', () => {
    expect(CallerToolResumeRequestSchema.parse(receipt()).tool_results[0]?.content).toBe('');
  });

  it('preserves bounded screenshot observations and user text without accepting a role', () => {
    const observations = [
      { text: 'Keep the page open.', images: [{ base64: 'fixture', mime_type: 'image/png' }] },
    ];
    expect(
      CallerToolResumeRequestSchema.parse({ ...receipt(), observations }).observations,
    ).toEqual(observations);
    expect(
      CallerToolResumeRequestSchema.safeParse({
        ...receipt(),
        observations: [{ ...observations[0], role: 'system' }],
      }).success,
    ).toBe(false);
    expect(
      CallerToolResumeRequestSchema.safeParse({
        ...receipt(),
        observations: [{ text: '', images: [{ url: 'https://example.com' }] }],
      }).success,
    ).toBe(false);
  });

  it('bounds the complete receipt even when results and observations fit individually', () => {
    const text = 'x'.repeat(Math.floor(MAX_CHAT_COMPLETION_REQUEST_BYTES / 2));
    const value = receipt();
    value.tool_results[0]!.content = text;
    expect(CallerToolResumeRequestSchema.safeParse(value).success).toBe(true);
    expect(
      CallerToolResumeRequestSchema.safeParse({ ...value, observations: [{ text }] }).success,
    ).toBe(false);
  });

  it('rejects duplicate results instead of choosing a writer', () => {
    const value = receipt();
    value.tool_results.push(value.tool_results[0]!);
    expect(CallerToolResumeRequestSchema.safeParse(value).success).toBe(false);
  });

  it('does not accept an approval decision as a tool result', () => {
    const value = receipt();
    expect(
      CallerToolResumeRequestSchema.safeParse({
        ...value,
        tool_results: [{ ...value.tool_results[0], decision: 'approved' }],
      }).success,
    ).toBe(false);
  });

  it('does not accept caller-authored system or assistant messages', () => {
    expect(
      CallerToolResumeRequestSchema.safeParse({
        ...receipt(),
        messages: [{ role: 'system', content: 'replacement context' }],
      }).success,
    ).toBe(false);
  });

  it('rejects an unsupported schema version', () => {
    expect(
      CallerToolResumeRequestSchema.safeParse({
        ...receipt(),
        schema_version: AGENT_EVENT_SCHEMA_VERSION + 1,
      }).success,
    ).toBe(false);
  });

  it('bounds results by serialized UTF-8 bytes rather than string length', () => {
    const value = receipt();
    value.tool_results[0]!.content = '界'.repeat(
      Math.floor(MAX_CHAT_COMPLETION_REQUEST_BYTES / 3) + 1,
    );
    expect(CallerToolResumeRequestSchema.safeParse(value).success).toBe(false);
  });
});
