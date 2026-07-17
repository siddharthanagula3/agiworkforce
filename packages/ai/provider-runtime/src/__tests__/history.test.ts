import { describe, expect, it } from 'vitest';

import {
  ensureToolResultPairing,
  repairMessageHistory,
  stripAnthropicOnlyFields,
  stripExcessMediaItems,
  type RepairMessage,
} from '../history';

describe('ensureToolResultPairing — anthropic-shape', () => {
  it('passes through clean conversation', () => {
    const msgs: RepairMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ];
    expect(ensureToolResultPairing(msgs)).toEqual(msgs);
  });

  it('inserts synthetic tool_result for orphan tool_use', () => {
    const msgs: RepairMessage[] = [
      { role: 'user', content: 'do it' },
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'tu1', name: 'do_thing' }],
      },
      // orphan — no result
      { role: 'user', content: 'next prompt' },
    ];
    const out = ensureToolResultPairing(msgs);
    expect(out.length).toBe(4);
    const synthetic = out[2]!;
    expect(synthetic.role).toBe('user');
    const block = (
      synthetic.content as { type: string; tool_use_id?: string; is_error?: boolean }[]
    )[0];
    expect(block?.type).toBe('tool_result');
    expect(block?.tool_use_id).toBe('tu1');
    expect(block?.is_error).toBe(true);
  });

  it('does NOT insert when tool_result is present', () => {
    const msgs: RepairMessage[] = [
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'tu1', name: 'do_thing' }],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'ok' }],
      },
    ];
    expect(ensureToolResultPairing(msgs)).toEqual(msgs);
  });

  it('coalesces multiple orphans on the same source-message into one synthetic message', () => {
    const msgs: RepairMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'tu1', name: 'a' },
          { type: 'tool_use', id: 'tu2', name: 'b' },
        ],
      },
      { role: 'user', content: 'next' },
    ];
    const out = ensureToolResultPairing(msgs);
    expect(out.length).toBe(3);
    const synthetic = out[1]!;
    expect(Array.isArray(synthetic.content)).toBe(true);
    expect((synthetic.content as unknown[]).length).toBe(2);
  });
});

describe('ensureToolResultPairing — openai-shape', () => {
  it('handles orphan tool_calls on assistant message', () => {
    const msgs: RepairMessage[] = [
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call_a', type: 'function', function: { name: 'do_thing' } }],
      },
      { role: 'user', content: 'next' },
    ];
    const out = ensureToolResultPairing(msgs, 'openai-shape');
    expect(out.length).toBe(3);
    expect(out[1]!.role).toBe('tool');
    expect(out[1]!.tool_call_id).toBe('call_a');
  });

  it('does NOT insert when role:tool message has matching tool_call_id', () => {
    const msgs: RepairMessage[] = [
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call_a', type: 'function', function: { name: 'a' } }],
      },
      { role: 'tool', tool_call_id: 'call_a', content: 'ok' },
    ];
    expect(ensureToolResultPairing(msgs, 'openai-shape')).toEqual(msgs);
  });
});

describe('stripAnthropicOnlyFields', () => {
  it('removes tool_reference, caller, connector_text, redacted_thinking', () => {
    const msgs: RepairMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'hi' },
          { type: 'tool_reference', name: 'foo' } as never,
          { type: 'caller', name: 'bar' } as never,
          { type: 'connector_text', text: 'leaked' } as never,
          { type: 'redacted_thinking', value: 'r' } as never,
        ],
      },
    ];
    const out = stripAnthropicOnlyFields(msgs);
    expect(out[0]!.content).toEqual([{ type: 'text', text: 'hi' }]);
  });

  it('passes string content through unchanged', () => {
    const msgs: RepairMessage[] = [{ role: 'user', content: 'plain' }];
    expect(stripAnthropicOnlyFields(msgs)).toEqual(msgs);
  });
});

describe('stripExcessMediaItems', () => {
  it('returns input unchanged when under cap', () => {
    const msgs: RepairMessage[] = [{ role: 'user', content: [{ type: 'image' }] }];
    const r = stripExcessMediaItems(msgs, 100);
    expect(r.dropped).toBe(0);
    expect(r.messages).toEqual(msgs);
  });

  it('drops oldest media items when over cap', () => {
    const blocks: { type: string }[] = [];
    for (let i = 0; i < 5; i++) blocks.push({ type: 'image' });
    const msgs: RepairMessage[] = [{ role: 'user', content: blocks }];
    const r = stripExcessMediaItems(msgs, 3);
    expect(r.dropped).toBe(2);
    expect((r.messages[0]!.content as unknown[]).length).toBe(3);
  });

  it('drops across multiple messages oldest-first', () => {
    const msgs: RepairMessage[] = [
      { role: 'user', content: [{ type: 'image' }, { type: 'image' }] }, // 2 oldest
      { role: 'user', content: [{ type: 'image' }] }, // 1 newer
    ];
    const r = stripExcessMediaItems(msgs, 1);
    expect(r.dropped).toBe(2);
    // The 1 newest image survived → should be on message[1]
    const m0 = r.messages[0]!.content as unknown[];
    const m1 = r.messages[1]!.content as unknown[];
    expect(m0.length).toBe(0);
    expect(m1.length).toBe(1);
  });

  it('does not touch non-media blocks', () => {
    const msgs: RepairMessage[] = [
      { role: 'user', content: [{ type: 'text', text: 'a' }, { type: 'image' }] },
    ];
    const r = stripExcessMediaItems(msgs, 0);
    const blocks = r.messages[0]!.content as { type: string }[];
    expect(blocks.length).toBe(1);
    expect(blocks[0]!.type).toBe('text');
  });
});

describe('repairMessageHistory', () => {
  it('runs the full pipeline and reports diagnostics', () => {
    const msgs: RepairMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'tu1', name: 'a' },
          { type: 'tool_reference', name: 'foo' } as never,
        ],
      },
    ];
    const r = repairMessageHistory(msgs, {
      stripAnthropicFields: true,
      maxMediaItems: 100,
    });
    expect(r.diagnostics.anthropicFieldsStripped).toBe(true);
    expect(r.diagnostics.syntheticResultsInserted).toBe(1);
    expect(r.diagnostics.mediaDropped).toBe(0);
  });
});
