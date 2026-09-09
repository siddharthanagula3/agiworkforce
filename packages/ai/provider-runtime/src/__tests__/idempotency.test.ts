import { describe, expect, it } from 'vitest';

import {
  deriveIdempotencyKey,
  meteredStepIdempotencyKey,
  toolInvocationIdempotencyKey,
} from '../idempotency';

const REQUEST_KEY = 'agi.chat.web.send.assistant-001';
const TOOL_CALL_ID = 'call_abc123';
const USER_ID = 'user-001';

describe('idempotency key derivation', () => {
  it('is stable for the same request, step and operation', () => {
    const first = toolInvocationIdempotencyKey({
      requestKey: REQUEST_KEY,
      step: 2,
      toolCallId: TOOL_CALL_ID,
      userId: USER_ID,
    });
    const second = toolInvocationIdempotencyKey({
      requestKey: REQUEST_KEY,
      step: 2,
      toolCallId: TOOL_CALL_ID,
      userId: USER_ID,
    });
    expect(first).toBe(second);
  });

  it('separates two requests that share a provider-minted tool call id', () => {
    const mine = toolInvocationIdempotencyKey({
      requestKey: REQUEST_KEY,
      step: 0,
      toolCallId: TOOL_CALL_ID,
      userId: USER_ID,
    });
    const theirs = toolInvocationIdempotencyKey({
      requestKey: 'agi.chat.web.send.assistant-002',
      step: 0,
      toolCallId: TOOL_CALL_ID,
      userId: USER_ID,
    });
    expect(mine).not.toBe(theirs);
  });

  it('separates two tenants that share a request key and tool call id', () => {
    // A settled record is returned without re-executing, and requestKey comes
    // from a client header on the managed path, so without the tenant one
    // account could be handed another's tool result.
    const mine = toolInvocationIdempotencyKey({
      requestKey: REQUEST_KEY,
      step: 0,
      toolCallId: TOOL_CALL_ID,
      userId: USER_ID,
    });
    const theirs = toolInvocationIdempotencyKey({
      requestKey: REQUEST_KEY,
      step: 0,
      toolCallId: TOOL_CALL_ID,
      userId: 'user-002',
    });
    expect(mine).not.toBe(theirs);
  });

  it('separates the same account across two workspaces', () => {
    const personal = toolInvocationIdempotencyKey({
      requestKey: REQUEST_KEY,
      step: 0,
      toolCallId: TOOL_CALL_ID,
      userId: USER_ID,
    });
    const workspace = toolInvocationIdempotencyKey({
      requestKey: REQUEST_KEY,
      step: 0,
      toolCallId: TOOL_CALL_ID,
      userId: USER_ID,
      organizationId: 'org-001',
    });
    expect(personal).not.toBe(workspace);
  });

  it('separates the same tool call id across steps', () => {
    expect(
      toolInvocationIdempotencyKey({
        requestKey: REQUEST_KEY,
        step: 0,
        toolCallId: TOOL_CALL_ID,
        userId: USER_ID,
      }),
    ).not.toBe(
      toolInvocationIdempotencyKey({
        requestKey: REQUEST_KEY,
        step: 1,
        toolCallId: TOOL_CALL_ID,
        userId: USER_ID,
      }),
    );
  });

  it('scopes a resumed call by its round, so a resume is not the paused call', () => {
    const paused = toolInvocationIdempotencyKey({
      requestKey: REQUEST_KEY,
      step: 1,
      toolCallId: TOOL_CALL_ID,
      userId: USER_ID,
    });
    const resumed = toolInvocationIdempotencyKey({
      requestKey: REQUEST_KEY,
      step: 1,
      toolCallId: TOOL_CALL_ID,
      userId: USER_ID,
      resumeRound: 1,
    });
    expect(resumed).not.toBe(paused);
  });

  it('separates a metered step from a tool call in the same step', () => {
    expect(meteredStepIdempotencyKey({ requestKey: REQUEST_KEY, step: 3 })).not.toBe(
      toolInvocationIdempotencyKey({
        requestKey: REQUEST_KEY,
        step: 3,
        toolCallId: TOOL_CALL_ID,
        userId: USER_ID,
      }),
    );
  });

  it('cannot be forged by a segment that contains the separator', () => {
    const forged = deriveIdempotencyKey({
      requestKey: 'a:0:tool',
      step: 0,
      operation: ['x'],
    });
    const real = deriveIdempotencyKey({ requestKey: 'a', step: 0, operation: ['tool', '0', 'x'] });
    expect(forged).not.toBe(real);
  });
});
