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
  // CHANGED BY AUDIT-FIX SYS-26 — read loudly.
  //
  // Ordinary chat used to assert `maxDurationMs: undefined`, i.e. NO wall-clock
  // budget at all. Ten steps at the 120 s per-tool cap exceeds the route's
  // `export const maxDuration = 300`, so the platform SIGKILLed the function
  // and skipped the generator `finally` that pauses/disposes the E2B sandbox
  // (which keeps billing) and settles managed usage. Chat now gets the same
  // four-minute budget AGI Work has, leaving one minute of teardown headroom
  // inside the platform limit.
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
