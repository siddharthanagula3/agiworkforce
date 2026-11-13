import { describe, expect, it } from 'vitest';
import {
  CHAT_READ_PAGE_TOOL,
  chatBrowserToolDefinitions,
} from '../src/features/computer-use/chatBrowserTools';
import { createToolUseJournal } from '../src/features/computer-use/toolHandoff';

const tools = chatBrowserToolDefinitions('act');

function replay(events: Array<Record<string, unknown> & { type: string }>) {
  const journal = createToolUseJournal(tools);
  return events.map((event) => journal.observe(event));
}

describe('rebuilding a tool handoff from journaled events', () => {
  it('returns the calls on the tool-use stop, grouped by tool use id', () => {
    const outcomes = replay([
      { type: 'tool-use-start', toolUseId: 'call_1', name: CHAT_READ_PAGE_TOOL },
      { type: 'tool-use-delta', toolUseId: 'call_1', deltaJson: '{}' },
      { type: 'tool-use-end', toolUseId: 'call_1' },
      { type: 'stop', reason: 'tool-use' },
    ]);
    expect(outcomes.slice(0, 3)).toEqual([null, null, null]);
    expect(outcomes[3]).toEqual([
      { id: 'call_1', type: 'function', function: { name: CHAT_READ_PAGE_TOOL, arguments: '{}' } },
    ]);
  });

  it('joins argument deltas and keeps interleaved calls apart', () => {
    const outcomes = replay([
      { type: 'tool-use-start', toolUseId: 'a', name: 'browser_task' },
      { type: 'tool-use-start', toolUseId: 'b', name: CHAT_READ_PAGE_TOOL },
      { type: 'tool-use-delta', toolUseId: 'a', deltaJson: '{"goal":' },
      { type: 'tool-use-delta', toolUseId: 'b', deltaJson: '{}' },
      { type: 'tool-use-delta', toolUseId: 'a', deltaJson: '"Click Update"}' },
      { type: 'tool-use-end', toolUseId: 'a' },
      { type: 'tool-use-end', toolUseId: 'b' },
      { type: 'stop', reason: 'tool-use' },
    ]);
    expect(outcomes.at(-1)).toEqual([
      {
        id: 'a',
        type: 'function',
        function: { name: 'browser_task', arguments: '{"goal":"Click Update"}' },
      },
      { id: 'b', type: 'function', function: { name: CHAT_READ_PAGE_TOOL, arguments: '{}' } },
    ]);
  });

  it('hands nothing back for a normal stop, an unoffered tool or an unfinished call', () => {
    expect(replay([{ type: 'stop', reason: 'end-turn' }])).toEqual([null]);
    expect(
      replay([
        { type: 'tool-use-start', toolUseId: 'x', name: 'delete_everything' },
        { type: 'tool-use-delta', toolUseId: 'x', deltaJson: '{}' },
        { type: 'tool-use-end', toolUseId: 'x' },
        { type: 'stop', reason: 'tool-use' },
      ]).at(-1),
    ).toBeNull();
    expect(
      replay([
        { type: 'tool-use-start', toolUseId: 'y', name: CHAT_READ_PAGE_TOOL },
        { type: 'stop', reason: 'tool-use' },
      ]).at(-1),
    ).toBeNull();
  });

  it('refuses arguments that are not a JSON object', () => {
    expect(
      replay([
        { type: 'tool-use-start', toolUseId: 'z', name: CHAT_READ_PAGE_TOOL },
        { type: 'tool-use-delta', toolUseId: 'z', deltaJson: '[1]' },
        { type: 'tool-use-end', toolUseId: 'z' },
        { type: 'stop', reason: 'tool-use' },
      ]).at(-1),
    ).toBeNull();
  });
});
