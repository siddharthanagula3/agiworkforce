import { describe, expect, it } from 'vitest';
import { AGENT_EVENT_SCHEMA_VERSION } from '@agiworkforce/types';
import { MAX_CHAT_COMPLETION_REQUEST_BYTES } from '@agiworkforce/cloud-contracts';
import {
  prepareChatToolResults,
  validChatToolResults,
} from '../src/features/computer-use/chatToolResults';
import { MAX_CHAT_TOOL_RESULT_CHARS } from '../src/features/computer-use/chatBrowserTools';
const cursor = {
  schema_version: AGENT_EVENT_SCHEMA_VERSION,
  run_id: '11111111-1111-4111-8111-111111111111',
  turn_id: 'fixture-turn',
  next_event_sequence: 8,
};
describe('chat result transport limits', () => {
  it('preserves complete negotiated results beyond the legacy cap', () => {
    const results = [
      { toolCallId: 'fixture-call', content: 'x'.repeat(MAX_CHAT_TOOL_RESULT_CHARS + 100) },
    ];
    expect(prepareChatToolResults(results, cursor)).toEqual(results);
    expect(validChatToolResults(results, cursor)).toBe(true);
    expect(validChatToolResults(results)).toBe(false);
    expect(prepareChatToolResults(results)[0]!.content).toHaveLength(MAX_CHAT_TOOL_RESULT_CHARS);
  });
  it('refuses oversized complete receipts without truncating them', () => {
    const results = [
      { toolCallId: 'fixture-call', content: 'x'.repeat(MAX_CHAT_COMPLETION_REQUEST_BYTES) },
    ];
    expect(validChatToolResults(results, cursor)).toBe(false);
    expect(() => prepareChatToolResults(results, cursor)).toThrow('complete browser results');
    expect(results[0]!.content).toHaveLength(MAX_CHAT_COMPLETION_REQUEST_BYTES);
  });
  it('refuses duplicate result identities in negotiated receipts', () => {
    expect(
      validChatToolResults(
        [
          { toolCallId: 'same', content: 'one' },
          { toolCallId: 'same', content: 'two' },
        ],
        cursor,
      ),
    ).toBe(false);
  });
});
