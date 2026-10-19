import { describe, expect, it, vi } from 'vitest';

vi.mock('@features/auth/step-up-fetch', () => ({ sendAuthorizedJson: vi.fn() }));

import { parseTools, toolCallsOf } from '../components/RequestPlayground';

describe('playground tools', () => {
  it('accepts an empty field or a JSON array and explains anything else', () => {
    expect(parseTools('  ')).toEqual({ tools: null, error: null });
    expect(parseTools('[{"type":"function"}]').tools).toEqual([{ type: 'function' }]);
    expect(parseTools('{"type":"function"}').error).toBe('Tools must be a JSON array.');
    expect(parseTools('[oops').error).toBe('Tools are not valid JSON.');
  });

  it('reads the tool calls a completion made with readable arguments', () => {
    expect(
      toolCallsOf({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                { id: 'call_1', function: { name: 'get_weather', arguments: '{"city":"Oslo"}' } },
                { function: { name: 'broken', arguments: 'not json' } },
              ],
            },
          },
        ],
      }),
    ).toEqual([
      { id: 'call_1', name: 'get_weather', arguments: '{\n  "city": "Oslo"\n}' },
      { id: 'call-2', name: 'broken', arguments: 'not json' },
    ]);
    expect(toolCallsOf(null)).toEqual([]);
  });
});
