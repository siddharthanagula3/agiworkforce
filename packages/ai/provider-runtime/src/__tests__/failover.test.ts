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
    ['a revoked token', 'OAuth token has been revoked', 401],
  ])('admits rotation for %s', (_label, message, status) => {
    const classified = classifyError({ status, message });
    expect(classified.category).toBe('auth');
    expect(isCredentialFailureCategory(classified.category)).toBe(true);
  });

  // CORRECTED: this case previously asserted `category === 'auth'`, which
  // encoded a real defect rather than a requirement. An exhausted credit balance
  // is an unfunded, but perfectly VALID, credential. Classifying it as a
  // credential failure made it a rotation trigger, so an AGIWorkforce account
  // that had run out of money silently pushed the request onto a different PAID
  // provider and spent more there instead of surfacing the billing problem.
  //
  // The assertion is inverted deliberately. See billing-failure-taxonomy.test.ts
  // for the full invariant.
  it('refuses credential rotation for an exhausted credit balance', () => {
    const classified = classifyError({
      status: 400,
      message: 'Your credit balance is too low to access the API',
    });

    expect(classified.category).toBe('billing_exhausted');
    expect(isCredentialFailureCategory(classified.category)).toBe(false);

    const state = new CredentialFailoverState();
    expect(state.recordFailure('anthropic', classified.category)).toBe(false);
    expect(state.blocksRoute('anthropic')).toBe(false);
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

describe('cross-request credential memory', () => {
  it('skips a credential a shared breaker already holds open', () => {
    const state = new CredentialFailoverState({ openCredentialIds: ['anthropic'] });

    expect(state.blocksRoute('anthropic')).toBe(true);
    expect(state.blocksRoute('openai')).toBe(false);
    expect(state.rejectedProviders()).toEqual([]);
    expect(state.parkedProviders()).toEqual(['anthropic']);
  });

  it('reports a rejection once so the caller can share it', () => {
    const shared: string[] = [];
    const state = new CredentialFailoverState({
      onCredentialRejected: (credentialId) => shared.push(credentialId),
    });

    state.recordFailure('anthropic', 'auth');
    state.recordFailure('anthropic', 'auth');
    state.recordFailure('openai', 'server_overload');

    expect(shared).toEqual(['anthropic']);
  });

  it('counts a credential rejected in this request as rejected, not merely parked', () => {
    const state = new CredentialFailoverState({ openCredentialIds: ['anthropic'] });
    state.recordFailure('anthropic', 'auth');

    expect(state.rejectedProviders()).toEqual(['anthropic']);
    expect(state.parkedProviders()).toEqual([]);
  });

  it('keeps the no-argument constructor callers already depend on', () => {
    const state = new CredentialFailoverState();
    expect(state.blocksRoute('anthropic')).toBe(false);
    expect(state.parkedProviders()).toEqual([]);
  });
});
