/**
 * Regression suite for the billing/quota failure-classification defect.
 *
 * THE DEFECT THIS PINS
 * --------------------
 * Anthropic's "credit balance is too low" was classified `category: 'auth'`.
 * `CredentialFailoverState` treats any `auth` as "this provider's credential is
 * bad", which is a rotation trigger — so an AGIWorkforce account that had merely
 * run OUT OF MONEY would silently push the request onto a different PAID
 * provider and spend more there, instead of surfacing the billing failure.
 *
 * Nothing tested this path. These tests exist so it cannot regress silently.
 *
 * The governing invariant: billing/quota exhaustion, authentication failure,
 * temporary rate limiting, provider overload, timeout, capability mismatch and
 * policy refusal are semantically DIFFERENT failure classes and must produce
 * different routing behaviour.
 */
import { describe, expect, it } from 'vitest';

import { classifyError } from '../errors';
import { CredentialFailoverState, isCredentialFailureCategory } from '../failover';

function anthropicError(message: string, status?: number): Error & { status?: number } {
  const error = new Error(message) as Error & { status?: number };
  if (status !== undefined) error.status = status;
  return error;
}

describe('billing exhaustion is not a credential failure', () => {
  it('classifies Anthropic credit exhaustion as billing_exhausted, never auth', () => {
    const classified = classifyError(
      anthropicError('Your credit balance is too low to access the Anthropic API.', 400),
    );

    expect(classified.category).toBe('billing_exhausted');
    expect(classified.category).not.toBe('auth');
    expect(classified.code).toBe('credit_balance_low');
  });

  it('does not trigger credential rotation for an unfunded account', () => {
    const classified = classifyError(
      anthropicError('Your credit balance is too low to access the Anthropic API.', 400),
    );

    // The whole point: an unfunded credential is still a VALID credential.
    expect(isCredentialFailureCategory(classified.category)).toBe(false);

    const state = new CredentialFailoverState();
    expect(state.recordFailure('anthropic', classified.category)).toBe(false);
    expect(state.blocksRoute('anthropic')).toBe(false);
  });

  it('marks billing exhaustion as neither retryable nor fallbackable', () => {
    const classified = classifyError(anthropicError('credit balance is too low', 400));
    // Waiting adds no funds; another provider costs MORE money.
    expect(classified.retryable).toBe(false);
    expect(classified.fallbackable).toBe(false);
  });

  it('classifies a raw 402 as billing_exhausted rather than a generic client error', () => {
    const classified = classifyError(anthropicError('Payment Required', 402));
    expect(classified.category).toBe('billing_exhausted');
    expect(classified.code).toBe('payment_required_402');
    expect(classified.fallbackable).toBe(false);
  });

  it('still treats a genuinely invalid credential as auth', () => {
    const classified = classifyError(anthropicError('invalid api key provided', 401));
    expect(classified.category).toBe('auth');
    expect(isCredentialFailureCategory(classified.category)).toBe(true);
    // A bad credential SHOULD block the provider — that behaviour is preserved.
    const state = new CredentialFailoverState();
    expect(state.recordFailure('anthropic', classified.category)).toBe(true);
    expect(state.blocksRoute('anthropic')).toBe(true);
  });
});

describe('quota exhaustion is distinct from a short rate limit', () => {
  it('classifies OpenAI insufficient_quota as quota_exhausted, not rate_limit', () => {
    const error = Object.assign(new Error('You exceeded your current quota'), {
      status: 429,
      error: { type: 'insufficient_quota' },
    });
    const classified = classifyError(error);

    expect(classified.category).toBe('quota_exhausted');
    expect(classified.code).toBe('insufficient_quota_429');
    // Retrying the same spent window is pointless...
    expect(classified.retryable).toBe(false);
    // ...but a different route with its own quota is a legitimate answer.
    expect(classified.fallbackable).toBe(true);
  });

  it('reads the provider-native code from error.code as well as error.type', () => {
    const error = Object.assign(new Error('quota'), {
      status: 429,
      code: 'insufficient_quota',
    });
    expect(classifyError(error).category).toBe('quota_exhausted');
  });

  it("recognises Google's RESOURCE_EXHAUSTED status", () => {
    const error = Object.assign(new Error('Resource has been exhausted'), {
      status: 429,
      error: { status: 'RESOURCE_EXHAUSTED' },
    });
    expect(classifyError(error).category).toBe('quota_exhausted');
  });

  it('keeps a plain 429 as a retryable short rate limit', () => {
    const classified = classifyError(anthropicError('Too many requests', 429));
    expect(classified.category).toBe('rate_limit');
    expect(classified.retryable).toBe(true);
  });
});

describe('Retry-After survives normalization', () => {
  it('reads Retry-After from real provider headers', () => {
    const error = Object.assign(new Error('slow down'), {
      status: 429,
      headers: { 'retry-after': '30' },
    });
    expect(classifyError(error).retryAfterSeconds).toBe(30);
  });

  it('reads a Retry-After already extracted by an upstream layer', () => {
    // This is the case that was broken: once an error crossed a stream-chunk
    // boundary the raw headers were gone, so the value had to be carried on the
    // reconstructed Error — and `extractRetryAfterSeconds` used to ignore it.
    const error = Object.assign(new Error('slow down'), {
      status: 429,
      retryAfterSeconds: 12,
    });
    expect(classifyError(error).retryAfterSeconds).toBe(12);
  });

  it('prefers real headers over a carried value when both are present', () => {
    const error = Object.assign(new Error('slow down'), {
      status: 429,
      headers: { 'retry-after': '5' },
      retryAfterSeconds: 99,
    });
    expect(classifyError(error).retryAfterSeconds).toBe(5);
  });

  it('ignores a nonsensical carried value rather than trusting it', () => {
    const error = Object.assign(new Error('slow down'), {
      status: 429,
      retryAfterSeconds: Number.NaN,
    });
    expect(classifyError(error).retryAfterSeconds).toBeUndefined();
  });
});

describe('policy refusals stay non-rotatable', () => {
  it('classifies a safety refusal as safety, which is never failover-eligible', () => {
    const classified = classifyError(
      anthropicError('Output blocked by content filtering policy', 400),
    );
    expect(classified.category).toBe('safety');
    expect(isCredentialFailureCategory(classified.category)).toBe(false);
  });
});
