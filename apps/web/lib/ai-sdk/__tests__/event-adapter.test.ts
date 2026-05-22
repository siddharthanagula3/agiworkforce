import { describe, expect, it } from 'vitest';
import {
  adaptAiSdkChunkToStreamChunk,
  adaptAiSdkFinishToStreamChunks,
  mapAiSdkFinishReasonToAgiStopReason,
} from '../event-adapter';

describe('AI SDK event adapter', () => {
  it('maps text deltas to AGI StreamChunk text events', () => {
    expect(adaptAiSdkChunkToStreamChunk({ type: 'text-delta', text: 'hello' })).toEqual({
      type: 'text-delta',
      delta: 'hello',
    });
  });

  it('maps reasoning deltas to AGI thinking events', () => {
    expect(
      adaptAiSdkChunkToStreamChunk({
        type: 'reasoning-delta',
        text: 'step 1',
        signature: 'sig-1',
      }),
    ).toEqual({
      type: 'thinking-delta',
      delta: 'step 1',
      signature: 'sig-1',
    });
  });

  it('maps tool lifecycle chunks to canonical AGI tool-use events', () => {
    expect(
      adaptAiSdkChunkToStreamChunk({
        type: 'tool-call',
        toolCallId: 'tool-1',
        toolName: 'read_file',
      }),
    ).toEqual({
      type: 'tool-use-start',
      toolUseId: 'tool-1',
      name: 'read_file',
    });

    expect(
      adaptAiSdkChunkToStreamChunk({
        type: 'tool-call-delta',
        toolCallId: 'tool-1',
        argsTextDelta: '{"path"',
      }),
    ).toEqual({
      type: 'tool-use-delta',
      toolUseId: 'tool-1',
      deltaJson: '{"path"',
    });

    expect(
      adaptAiSdkChunkToStreamChunk({
        type: 'tool-result',
        toolCallId: 'tool-1',
      }),
    ).toEqual({
      type: 'tool-use-end',
      toolUseId: 'tool-1',
    });
  });

  it('maps finish events to usage plus stop chunks', () => {
    expect(
      adaptAiSdkFinishToStreamChunks({
        finishReason: 'length',
        usage: {
          inputTokens: 12,
          outputTokens: 7,
          reasoningTokens: 3,
        },
      }),
    ).toEqual([
      {
        type: 'usage',
        inputTokens: 12,
        outputTokens: 7,
        reasoningTokens: 3,
      },
      { type: 'stop', reason: 'max_tokens' },
    ]);
  });

  it('maps provider finish reasons into AGI stop reasons', () => {
    expect(mapAiSdkFinishReasonToAgiStopReason('stop')).toBe('end_turn');
    expect(mapAiSdkFinishReasonToAgiStopReason('tool-calls')).toBe('tool_use');
    expect(mapAiSdkFinishReasonToAgiStopReason('content-filter')).toBe('error');
    expect(mapAiSdkFinishReasonToAgiStopReason('cancel')).toBe('cancel');
  });

  it('returns null for unsupported or incomplete chunks', () => {
    expect(adaptAiSdkChunkToStreamChunk({ type: 'source' })).toBeNull();
    expect(adaptAiSdkChunkToStreamChunk({ type: 'tool-call', toolCallId: 'tool-1' })).toBeNull();
  });
});
