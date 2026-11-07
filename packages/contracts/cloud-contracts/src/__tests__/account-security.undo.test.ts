import { describe, expect, it } from 'vitest';
import { AccountSecurityUndoResponseSchema } from '../account-security';

describe('account security undo response contract', () => {
  it.each([
    { sessionsSignedOut: 0, passwordReset: false },
    { sessionsSignedOut: 3, passwordReset: true },
  ])('accepts the existing response fields: %j', (response) => {
    expect(AccountSecurityUndoResponseSchema.parse(response)).toEqual(response);
    expect(AccountSecurityUndoResponseSchema.parse({ ...response, futureField: true })).toEqual(
      response,
    );
  });

  it.each([
    undefined,
    null,
    [],
    {},
    { sessionsSignedOut: 0 },
    { passwordReset: false },
    { sessionsSignedOut: '0', passwordReset: false },
    { sessionsSignedOut: null, passwordReset: false },
    { sessionsSignedOut: true, passwordReset: false },
    { sessionsSignedOut: -1, passwordReset: false },
    { sessionsSignedOut: 0.5, passwordReset: false },
    { sessionsSignedOut: NaN, passwordReset: false },
    { sessionsSignedOut: Infinity, passwordReset: false },
    { sessionsSignedOut: -Infinity, passwordReset: false },
    { sessionsSignedOut: 0, passwordReset: 'false' },
    { sessionsSignedOut: 0, passwordReset: 0 },
    { sessionsSignedOut: 0, passwordReset: null },
  ])('rejects missing or malformed response fields: %j', (response) => {
    expect(AccountSecurityUndoResponseSchema.safeParse(response).success).toBe(false);
  });
});
