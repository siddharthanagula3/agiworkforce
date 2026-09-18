import { describe, expect, it } from 'vitest';

import {
  beginOperation,
  carriedOperation,
  formatOperationReplayRef,
  isMintedId,
  newAttemptId,
  newOperationId,
  newRequestId,
  nextAttempt,
  operationLogFields,
  parseOperationReplayRef,
  withOperationCarrier,
} from '../operation-identity';

describe('operation identity', () => {
  it('mints ids that are recognisable and unique', () => {
    const ids = [newRequestId(), newOperationId(), newAttemptId()];
    for (const id of ids) expect(isMintedId(id)).toBe(true);
    expect(new Set(ids).size).toBe(3);
    expect(newOperationId()).not.toBe(newOperationId());
  });

  it('keeps operation_id stable across a retry while attempt_id changes', () => {
    const first = beginOperation({ requestId: 'req_0123456789abcdef01234567' });
    const second = nextAttempt(first);
    const third = nextAttempt(second);

    expect(second.operationId).toBe(first.operationId);
    expect(third.operationId).toBe(first.operationId);
    expect(second.attemptId).not.toBe(first.attemptId);
    expect(third.attemptId).not.toBe(second.attemptId);
    expect([first.attempt, second.attempt, third.attempt]).toEqual([1, 2, 3]);
    expect(second.requestId).toBe(first.requestId);
  });

  it('carries a parent task id only when there is one', () => {
    const without = beginOperation({ requestId: 'req_a' });
    expect(without.parentTaskId).toBeUndefined();
    expect(operationLogFields(without)).not.toHaveProperty('parent_task_id');

    const within = beginOperation({ requestId: 'req_a', parentTaskId: 'task_b' });
    expect(operationLogFields(within).parent_task_id).toBe('task_b');
  });

  it('logs ids and nothing else', () => {
    const identity = beginOperation({ requestId: 'req_a', parentTaskId: 'task_b' });
    const fields = operationLogFields(identity);
    expect(Object.keys(fields).sort()).toEqual([
      'attempt',
      'attempt_id',
      'operation_id',
      'parent_task_id',
      'request_id',
    ]);
    for (const value of Object.values(fields)) {
      expect(['string', 'number']).toContain(typeof value);
    }
  });

  it('travels in a payload a worker reads back', () => {
    const identity = beginOperation({ requestId: 'req_a' });
    const payload = withOperationCarrier({ jobId: 'j1' }, identity);
    expect(payload.jobId).toBe('j1');
    expect(carriedOperation(payload)).toEqual(identity);
  });

  it('refuses a carrier that is not a complete identity', () => {
    expect(carriedOperation(null)).toBeNull();
    expect(carriedOperation({})).toBeNull();
    expect(carriedOperation({ operation: { requestId: 'r' } })).toBeNull();
    expect(
      carriedOperation({
        operation: { requestId: 'r', operationId: 'o', attemptId: 'a', attempt: 1.5 },
      }),
    ).toBeNull();
  });

  it('round-trips the replay reference a bug report can carry', () => {
    const identity = beginOperation({ requestId: 'req_support_ticket' });
    const ref = formatOperationReplayRef(identity);
    expect(parseOperationReplayRef(ref)).toEqual({
      version: 1,
      requestId: identity.requestId,
      operationId: identity.operationId,
      attemptId: identity.attemptId,
    });
    expect(parseOperationReplayRef('2:a:b:c')).toBeNull();
    expect(parseOperationReplayRef('1:a:b')).toBeNull();
    expect(parseOperationReplayRef('1:a:not-an-id:also-not')).toBeNull();
  });

  it('names one attempt, so two attempts never share a reference', () => {
    const first = beginOperation({ requestId: 'req_a' });
    expect(formatOperationReplayRef(nextAttempt(first))).not.toBe(formatOperationReplayRef(first));
  });
});
