import { describe, expect, it } from 'vitest';

import { classifyError } from '../errors';
import { CredentialFailoverState, isCredentialFailureCategory } from '../failover';

describe('credential failover admission', () => {
  it('admits rotation for a 401 the classifier calls auth', () => {
    const classified = classifyError({ status: 401, message: 'invalid x-api-key' });
    expect(classified.category).toBe('auth');

    const state = new CredentialFailoverState();
    expect(state.recordFailure('anthropic', classified.category)).toBe(true);
  });

  it.each([
    ['a suspended organization', 'Your organization has been disabled', 403],
    ['an exhausted credit balance', 'Your credit balance is too low to access the API', 400],
    ['a revoked token', 'OAuth token has been revoked', 401],
  ])('admits rotation for %s', (_label, message, status) => {
    const classified = classifyError({ status, message });
    expect(classified.category).toBe('auth');
    expect(isCredentialFailureCategory(classified.category)).toBe(true);
  });

  it('rotates to a different provider but never back to the rejected one', () => {
    const state = new CredentialFailoverState();
    state.recordFailure(
      'anthropic',
      classifyError({ status: 401, message: 'invalid key' }).category,
    );

    expect(state.blocksRoute('anthropic')).toBe(true);
    expect(state.blocksRoute('openai')).toBe(false);
    expect(state.rejectedProviders()).toEqual(['anthropic']);
  });

  it('leaves availability failures to the availability rules', () => {
    const overloaded = classifyError({ status: 529, message: 'overloaded_error' });
    expect(overloaded.category).toBe('server_overload');

    const state = new CredentialFailoverState();
    expect(state.recordFailure('anthropic', overloaded.category)).toBe(false);
    expect(state.blocksRoute('anthropic')).toBe(false);
  });

  it('blocks every route on a provider once its credential is rejected', () => {
    const state = new CredentialFailoverState();
    state.recordFailure('anthropic', 'auth');
    state.recordFailure('openai', 'auth');

    expect(state.rejectedProviders()).toEqual(['anthropic', 'openai']);
    expect(state.blocksRoute('google')).toBe(false);
  });
});
