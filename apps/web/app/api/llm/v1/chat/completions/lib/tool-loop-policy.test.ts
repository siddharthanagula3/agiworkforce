import { describe, expect, it } from 'vitest';
import { resolveToolLoopPolicy } from './tool-loop';
import type { ProcessedRequest } from './request-processor';

function processed(workMode: 'chat' | 'agiwork' | undefined): ProcessedRequest {
  return {
    chatRequest: {
      model: 'test-model',
      messages: [{ role: 'user', content: 'test' }],
      stream: true,
      ...(workMode ? { work_mode: workMode } : {}),
    },
  } as ProcessedRequest;
}

describe('resolveToolLoopPolicy', () => {
  it('keeps ordinary chat on the conservative ten-step limit, inside the platform time limit', () => {
    expect(resolveToolLoopPolicy(processed('chat'), {})).toEqual({
      maxSteps: 10,
      maxDurationMs: 4 * 60_000,
    });
    expect(resolveToolLoopPolicy(processed(undefined), {})).toEqual({
      maxSteps: 10,
      maxDurationMs: 4 * 60_000,
    });
  });

  it('gives paid AGI Work a deeper loop with headroom under the five-minute function limit', () => {
    expect(resolveToolLoopPolicy(processed('agiwork'), {})).toEqual({
      maxSteps: 100,
      maxDurationMs: 4 * 60_000,
    });
  });

  it('honors explicit test and caller overrides', () => {
    expect(
      resolveToolLoopPolicy(processed('agiwork'), {
        maxSteps: 3,
        maxDurationMs: 12_345,
      }),
    ).toEqual({ maxSteps: 3, maxDurationMs: 12_345 });
  });
});
