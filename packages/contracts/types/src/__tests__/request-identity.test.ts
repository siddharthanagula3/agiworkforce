import { describe, expect, it } from 'vitest';

import { AUDIT_EVENT_SCHEMA_VERSION, createAuditEvent } from '../audit';
import {
  formatOperationRef,
  isRequestIdentity,
  nextAttempt,
  parseOperationRef,
  sameOperation,
  type RequestIdentity,
} from '../request-identity';

const IDENTITY: RequestIdentity = {
  requestId: 'req_01J8',
  operationId: 'op_01J8',
  attemptId: 'att_01',
};

describe('the identity a request carries', () => {
  it('round trips through the joined form the trail stores', () => {
    const ref = formatOperationRef(IDENTITY);
    expect(ref.split(':')).toHaveLength(4);
    expect(parseOperationRef(ref)).toEqual(IDENTITY);
  });

  it('refuses a ref written under a schema this reader does not know', () => {
    const ref = formatOperationRef(IDENTITY).replace(
      `${AUDIT_EVENT_SCHEMA_VERSION}:`,
      `${AUDIT_EVENT_SCHEMA_VERSION + 1}:`,
    );
    expect(parseOperationRef(ref)).toBeNull();
  });

  it('refuses a ref with a segment missing rather than shifting the rest along', () => {
    expect(parseOperationRef('1:req_01J8:op_01J8')).toBeNull();
    expect(parseOperationRef('1:req_01J8:op_01J8:att_01:extra')).toBeNull();
  });

  it('refuses a segment that is not an identifier', () => {
    expect(isRequestIdentity({ ...IDENTITY, requestId: 'req 01J8' })).toBe(false);
    expect(isRequestIdentity({ ...IDENTITY, attemptId: '' })).toBe(false);
    expect(isRequestIdentity({ requestId: 'r', operationId: 'o' })).toBe(false);
  });

  it('carries an optional parent task and still validates without one', () => {
    expect(isRequestIdentity({ ...IDENTITY, parentTaskId: 'task_9' })).toBe(true);
    expect(isRequestIdentity(IDENTITY)).toBe(true);
    expect(isRequestIdentity({ ...IDENTITY, parentTaskId: 42 })).toBe(false);
  });

  it('keeps a retry on the same operation and gives it a new attempt', () => {
    const retry = nextAttempt(IDENTITY, 'att_02');
    expect(sameOperation(IDENTITY, retry)).toBe(true);
    expect(retry.requestId).toBe(IDENTITY.requestId);
    expect(retry.attemptId).not.toBe(IDENTITY.attemptId);
  });

  it('is the value an audit record quotes, not a string each caller assembles', () => {
    const event = createAuditEvent({
      userId: 'user_1',
      surface: 'web',
      action: 'auth_login',
      resource: 'session:sess_1',
      outcome: 'success',
      operationRef: formatOperationRef(IDENTITY),
    });
    expect(parseOperationRef(event.operationRef ?? '')).toEqual(IDENTITY);
  });
});
