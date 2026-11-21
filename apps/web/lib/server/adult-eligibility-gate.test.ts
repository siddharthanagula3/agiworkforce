import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  state: vi.fn(),
  failure: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/observability/metrics', async (importOriginal) => ({
  ...(await importOriginal()),
  recordFailure: (...args: unknown[]) => mocks.failure(...args),
}));
vi.mock('@/lib/server/adult-eligibility', async (importOriginal) => ({
  ...(await importOriginal()),
  readAdultEligibilityState: (...args: unknown[]) => mocks.state(...args),
}));

import { ACCOUNT_AGE_INELIGIBLE_MESSAGE, ACCOUNT_MINIMUM_AGE } from '@agiworkforce/types';

import {
  ADULT_ELIGIBILITY_UNAVAILABLE_CODE,
  adultEligibilityForGate,
  buildAdultEligibilityGateResponse,
  refuseWithoutAdultEligibility,
} from './adult-eligibility-gate';

const ORIGIN = 'https://agiworkforce.com';
const REVIEW_URL = `${ORIGIN}/login/complete?redirectTo=%2Fchat`;

function gate() {
  return refuseWithoutAdultEligibility({
    userId: 'person-a',
    origin: ORIGIN,
    returnTo: '/chat',
    gate: 'test',
  });
}

beforeEach(() => vi.clearAllMocks());

describe('the server answer to "may this account use Cloud"', () => {
  it('admits an account with a current 18 and over decision', async () => {
    mocks.state.mockResolvedValue('confirmed');

    expect(await gate()).toBeNull();
    expect(mocks.state).toHaveBeenCalledWith('person-a');
  });

  it('refuses an account nobody has asked, and says where to answer', async () => {
    mocks.state.mockResolvedValue('unconfirmed');

    expect(await gate()).toEqual({
      status: 403,
      code: 'age_confirmation_required',
      message: `Confirm your age at ${REVIEW_URL} to continue, then try again.`,
      reviewUrl: REVIEW_URL,
    });
  });

  it('refuses an account found under the minimum with the published rule', async () => {
    mocks.state.mockResolvedValue('ineligible');

    expect(await gate()).toEqual({
      status: 403,
      code: 'age_ineligible',
      message: ACCOUNT_AGE_INELIGIBLE_MESSAGE,
      reviewUrl: REVIEW_URL,
    });
  });

  it('refuses, and counts the failure, when the decision cannot be read', async () => {
    mocks.state.mockRejectedValue(new Error('database unavailable'));

    expect(await gate()).toEqual({
      status: 503,
      code: ADULT_ELIGIBILITY_UNAVAILABLE_CODE,
      message: 'Your account could not be checked just now. Try again in a moment.',
      reviewUrl: null,
    });
    expect(mocks.failure).toHaveBeenCalledWith('database', 'adult_eligibility_unreadable');
  });

  it('never reports an unreadable decision as confirmed', async () => {
    mocks.state.mockRejectedValue(new Error('database unavailable'));

    expect(await adultEligibilityForGate('person-a', 'test')).toBe('unavailable');
  });
});

describe('the gate in front of Cloud compute', () => {
  const request = new Request(`${ORIGIN}/api/media/image/generate`, { method: 'POST' });

  it('lets a confirmed account through', async () => {
    mocks.state.mockResolvedValue('confirmed');

    expect(
      await buildAdultEligibilityGateResponse({ userId: 'person-a', request, gate: 'test' }),
    ).toBeNull();
  });

  it('answers 403 with the code, the review link and the minimum age, on the caller’s headers', async () => {
    mocks.state.mockResolvedValue('unconfirmed');

    const response = await buildAdultEligibilityGateResponse({
      userId: 'person-a',
      request,
      gate: 'test',
      headers: { 'x-test-header': 'kept' },
    });

    expect(response?.status).toBe(403);
    expect(response?.headers.get('x-test-header')).toBe('kept');
    expect(await response?.json()).toEqual({
      error: {
        message: `Confirm your age at ${REVIEW_URL} to continue, then try again.`,
        type: 'invalid_request_error',
        code: 'age_confirmation_required',
        review_url: REVIEW_URL,
      },
      minimum_age: ACCOUNT_MINIMUM_AGE,
      review_url: REVIEW_URL,
    });
  });

  it('answers 503 with no review link when the decision cannot be read', async () => {
    mocks.state.mockRejectedValue(new Error('database unavailable'));

    const response = await buildAdultEligibilityGateResponse({
      userId: 'person-a',
      request,
      gate: 'test',
    });

    expect(response?.status).toBe(503);
    expect(await response?.json()).toEqual({
      error: {
        message: 'Your account could not be checked just now. Try again in a moment.',
        type: 'server_error',
        code: ADULT_ELIGIBILITY_UNAVAILABLE_CODE,
      },
      minimum_age: ACCOUNT_MINIMUM_AGE,
    });
  });
});
