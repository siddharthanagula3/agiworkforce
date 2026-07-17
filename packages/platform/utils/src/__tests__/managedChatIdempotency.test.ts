import { describe, expect, it } from 'vitest';

import {
  createManagedChatIdempotencyKey,
  isManagedChatIdempotencyKey,
} from '../managedChatIdempotency';

describe('managed chat idempotency identity', () => {
  const operationId = '0190a000-0000-7000-8000-000000000001';

  it('is deterministic for retries of the same logical operation', () => {
    const first = createManagedChatIdempotencyKey({
      surface: 'mobile',
      purpose: 'send',
      operationId,
    });
    const retry = createManagedChatIdempotencyKey({
      surface: 'mobile',
      purpose: 'send',
      operationId,
    });

    expect(retry).toBe(first);
    expect(isManagedChatIdempotencyKey(first)).toBe(true);
  });

  it('separates deliberate sends, continuations, and tool resumes', () => {
    const send = createManagedChatIdempotencyKey({
      surface: 'web',
      purpose: 'send',
      operationId,
    });
    const continuation = createManagedChatIdempotencyKey({
      surface: 'web',
      purpose: 'continue',
      operationId,
    });
    const resume = createManagedChatIdempotencyKey({
      surface: 'web',
      purpose: 'tool-resume',
      operationId,
    });

    expect(new Set([send, continuation, resume]).size).toBe(3);
  });

  it('rejects malformed or unbounded operation identity instead of weakening it', () => {
    expect(() =>
      createManagedChatIdempotencyKey({
        surface: 'desktop',
        purpose: 'send',
        operationId: 'contains spaces',
      }),
    ).toThrow(/operationId/i);
    expect(() =>
      createManagedChatIdempotencyKey({
        surface: 'desktop',
        purpose: 'send',
        operationId: 'x'.repeat(129),
      }),
    ).toThrow(/operationId/i);
  });

  it('does not accept arbitrary legacy header values as an AGI-owned key', () => {
    expect(isManagedChatIdempotencyKey('random-request-id')).toBe(false);
    expect(isManagedChatIdempotencyKey('agi.chat.web.send.bad key')).toBe(false);
  });
});
