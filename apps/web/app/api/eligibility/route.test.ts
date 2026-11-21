import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  csrf: vi.fn(),
  read: vi.fn(),
  submit: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/error-handler', async (importOriginal) => ({
  ...(await importOriginal()),
  withErrorHandler: (handler: unknown) => handler,
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal()),
  requireCsrfToken: (...args: unknown[]) => mocks.csrf(...args),
}));
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal()),
  getClerkAuthUser: (...args: unknown[]) => mocks.auth(...args),
}));
vi.mock('@/lib/server/adult-eligibility', async (importOriginal) => ({
  ...(await importOriginal()),
  readAdultEligibilityState: (...args: unknown[]) => mocks.read(...args),
  submitAdultEligibilityEvidence: (...args: unknown[]) => mocks.submit(...args),
}));

import { ACCOUNT_MINIMUM_AGE } from '@agiworkforce/types';

import { GET, POST } from './route';

const URL = 'https://agiworkforce.com/api/eligibility';

function submit(body: unknown) {
  return POST(new NextRequest(URL, { method: 'POST', body: JSON.stringify(body) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.csrf.mockResolvedValue(null);
  mocks.auth.mockResolvedValue({ userId: 'person-a' });
});

describe('GET /api/eligibility', () => {
  it.each(['confirmed', 'unconfirmed', 'ineligible'] as const)(
    'reports the %s state with the current minimum age, uncached',
    async (state) => {
      mocks.read.mockResolvedValue(state);

      const response = await GET(new NextRequest(URL));

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(await response.json()).toEqual({ minimumAge: ACCOUNT_MINIMUM_AGE, state });
      expect(mocks.read).toHaveBeenCalledWith('person-a');
    },
  );

  it('answers nothing about eligibility to a caller who is not signed in', async () => {
    mocks.auth.mockRejectedValue(new Error('unauthorized'));

    await expect(GET(new NextRequest(URL))).rejects.toThrow('unauthorized');
    expect(mocks.read).not.toHaveBeenCalled();
  });
});

describe('POST /api/eligibility', () => {
  it('confirms an account whose evidence shows 18 or over', async () => {
    mocks.submit.mockResolvedValue('confirmed');

    const response = await submit({
      surface: 'web-login',
      evidence: { kind: 'declared_age', age: 18 },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ minimumAge: ACCOUNT_MINIMUM_AGE, state: 'confirmed' });
    expect(mocks.submit).toHaveBeenCalledWith('person-a', 'web-login', {
      kind: 'declared_age',
      age: 18,
    });
  });

  it('answers 403 age_ineligible for an account found under the minimum', async () => {
    mocks.submit.mockResolvedValue('ineligible');

    const response = await submit({
      surface: 'web-login',
      evidence: { kind: 'declared_age', age: 17 },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: 'age_ineligible' },
      minimumAge: ACCOUNT_MINIMUM_AGE,
      state: 'ineligible',
    });
  });

  it('answers 422 and admits nothing when the evidence settles nothing', async () => {
    mocks.submit.mockResolvedValue('unconfirmed');

    const response = await submit({
      surface: 'mobile-auth',
      evidence: { kind: 'platform_age_signal', lowerBound: 16, upperBound: 18 },
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: 'age_evidence_inconclusive' },
      state: 'unconfirmed',
    });
  });

  it.each([
    ['no evidence', { surface: 'web-login' }],
    ['an unknown kind of evidence', { surface: 'web-login', evidence: { kind: 'trust_me' } }],
    [
      'a birth date in place of an age',
      { surface: 'web-login', evidence: { kind: 'declared_age', birthDate: '2001-04-02' } },
    ],
    [
      'a field beyond the evidence',
      { surface: 'web-login', evidence: { kind: 'declared_age', age: 30, birthYear: 1996 } },
    ],
    [
      'an age that is not a whole number',
      { surface: 'web-login', evidence: { kind: 'declared_age', age: 17.9 } },
    ],
    [
      'a surface that does not ask',
      { surface: 'cli', evidence: { kind: 'declared_age', age: 30 } },
    ],
  ])('refuses %s without judging anything', async (_label, body) => {
    await expect(submit(body)).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('checks the request forgery token before reading who is asking', async () => {
    const refusal = new Response(null, { status: 403 });
    mocks.csrf.mockResolvedValue(refusal);

    expect(
      await submit({ surface: 'web-login', evidence: { kind: 'declared_age', age: 30 } }),
    ).toBe(refusal);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});
