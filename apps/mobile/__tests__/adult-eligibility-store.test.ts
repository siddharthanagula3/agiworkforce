const mockStorage = new Map<string, string>();

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  storage: {
    getString: (key: string) => mockStorage.get(key) ?? undefined,
    set: (key: string, value: string) => mockStorage.set(key, value),
    delete: (key: string) => mockStorage.delete(key),
  },
}));

const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('@/services/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

import { ACCOUNT_MINIMUM_AGE } from '@agiworkforce/types';
import { ADULT_ELIGIBILITY_PATH } from '@agiworkforce/cloud-contracts';
import {
  adultEligibilityNeedsAnswer,
  isAdultEligibilityAnswerPending,
  isAdultEligibilityConfirmed,
  useAdultEligibilityStore,
} from '../src/features/auth/store/adultEligibilityStore';
import { ageGateStatus, confirmAgeGate } from '../src/features/auth/services/ageGate';
import { ApiHttpError } from '../services/apiErrors';

const confirmed = { minimumAge: ACCOUNT_MINIMUM_AGE, state: 'confirmed' };
const unconfirmed = { minimumAge: ACCOUNT_MINIMUM_AGE, state: 'unconfirmed' };
const ineligible = { minimumAge: ACCOUNT_MINIMUM_AGE, state: 'ineligible' };

function refusal(status: number, code: string): ApiHttpError {
  return new ApiHttpError('refused', status, code, { body: { error: { code } } });
}

function storeOsRange(lowerBound: number | null, upperBound: number | null): void {
  mockStorage.set(
    'age-assurance:v1',
    JSON.stringify({
      checkedAt: '2026-06-01T00:00:00.000Z',
      platform: 'android',
      outcome: 'range',
      regulated: true,
      lowerBound,
      upperBound,
      guardianManaged: false,
      installId: null,
      significantChangeStatus: null,
    }),
  );
}

const store = () => useAdultEligibilityStore.getState();

beforeEach(() => {
  mockStorage.clear();
  mockGet.mockReset();
  mockPost.mockReset();
  store().reset();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('reading the account’s standing after sign-in', () => {
  it('continues without sending anything when the server already confirmed the account', async () => {
    mockGet.mockResolvedValueOnce(confirmed);

    await store().verify('person-a');

    expect(mockGet).toHaveBeenCalledWith(ADULT_ELIGIBILITY_PATH);
    expect(mockPost).not.toHaveBeenCalled();
    expect(isAdultEligibilityConfirmed(store(), 'person-a')).toBe(true);
  });

  it('keeps Cloud closed for an account the server holds ineligible', async () => {
    mockGet.mockResolvedValueOnce(ineligible);

    await store().verify('person-a');

    expect(store().status).toBe('ineligible');
    expect(mockPost).not.toHaveBeenCalled();
    expect(isAdultEligibilityConfirmed(store(), 'person-a')).toBe(false);
    expect(adultEligibilityNeedsAnswer(store(), 'person-a')).toBe(true);
  });

  it('reports the device’s 18-based check for an unconfirmed account', async () => {
    confirmAgeGate(30);
    mockGet.mockResolvedValueOnce(unconfirmed);
    mockPost.mockResolvedValueOnce(confirmed);

    await store().verify('person-a');

    expect(mockPost).toHaveBeenCalledWith(ADULT_ELIGIBILITY_PATH, {
      surface: 'mobile-auth',
      evidence: { kind: 'age_checked_on_device', minimumAge: ACCOUNT_MINIMUM_AGE },
    });
    expect(store().status).toBe('confirmed');
  });

  it('reports a stored OS range that settles the minimum', async () => {
    storeOsRange(18, null);
    mockGet.mockResolvedValueOnce(unconfirmed);
    mockPost.mockResolvedValueOnce(confirmed);

    await store().verify('person-a');

    expect(mockPost).toHaveBeenCalledWith(ADULT_ELIGIBILITY_PATH, {
      surface: 'mobile-auth',
      evidence: { kind: 'platform_age_signal', lowerBound: 18, upperBound: null },
    });
    expect(store().status).toBe('confirmed');
  });

  it('asks for the typed age when the device holds nothing current', async () => {
    mockGet.mockResolvedValueOnce(unconfirmed);

    await store().verify('person-a');

    expect(mockPost).not.toHaveBeenCalled();
    expect(store().status).toBe('age_required');
  });

  it('closes Cloud on a 403 age_ineligible answer to the report', async () => {
    confirmAgeGate(30);
    mockGet.mockResolvedValueOnce(unconfirmed);
    mockPost.mockRejectedValueOnce(refusal(403, 'age_ineligible'));

    await store().verify('person-a');

    expect(store().status).toBe('ineligible');
    expect(isAdultEligibilityConfirmed(store(), 'person-a')).toBe(false);
  });

  it('asks for the typed age on a 422 answer to the report', async () => {
    confirmAgeGate(30);
    mockGet.mockResolvedValueOnce(unconfirmed);
    mockPost.mockRejectedValueOnce(refusal(422, 'age_evidence_inconclusive'));

    await store().verify('person-a');

    expect(store().status).toBe('age_required');
  });

  it.each([
    [
      'a network failure on the read',
      () => mockGet.mockRejectedValueOnce(new TypeError('offline')),
    ],
    [
      'a server failure on the read',
      () => mockGet.mockRejectedValueOnce(new ApiHttpError('boom', 503)),
    ],
    [
      'a network failure on the report',
      () => {
        confirmAgeGate(30);
        mockGet.mockResolvedValueOnce(unconfirmed);
        mockPost.mockRejectedValueOnce(new TypeError('offline'));
      },
    ],
    ['an answer that does not match the contract', () => mockGet.mockResolvedValueOnce({ ok: 1 })],
  ])('never grants Cloud after %s and offers a retry', async (_label, arrange) => {
    arrange();

    await store().verify('person-a');

    expect(store().status).toBe('error');
    expect(store().error).toBeTruthy();
    expect(isAdultEligibilityConfirmed(store(), 'person-a')).toBe(false);
    expect(adultEligibilityNeedsAnswer(store(), 'person-a')).toBe(true);
  });
});

describe('the typed age', () => {
  async function askedForAge() {
    mockGet.mockResolvedValueOnce(unconfirmed);
    await store().verify('person-a');
    expect(store().status).toBe('age_required');
  }

  it('sends the number once and keeps only the verdict', async () => {
    await askedForAge();
    mockPost.mockResolvedValueOnce(confirmed);

    await store().submitAge('person-a', 34);

    expect(mockPost).toHaveBeenCalledWith(ADULT_ELIGIBILITY_PATH, {
      surface: 'mobile-auth',
      evidence: { kind: 'declared_age', age: 34 },
    });
    expect(store().status).toBe('confirmed');
    const deviceRecord = JSON.parse(mockStorage.get('age-gate:v1') as string) as object;
    expect(Object.values(deviceRecord)).not.toContain(34);
    expect([...mockStorage.keys()]).toEqual(['age-gate:v1']);
    expect(Object.values(store())).not.toContain(34);
  });

  it('closes Cloud and refuses the device for a typed 17', async () => {
    await askedForAge();
    mockPost.mockRejectedValueOnce(refusal(403, 'age_ineligible'));

    await store().submitAge('person-a', 17);

    expect(store().status).toBe('ineligible');
    expect(ageGateStatus()).toBe('refused');
  });

  it('retries a failed report with the saved verdict without asking for the number again', async () => {
    await askedForAge();
    mockPost.mockRejectedValueOnce(new TypeError('offline'));

    await store().submitAge('person-a', 30);

    expect(store().status).toBe('error');
    expect(store().error).toBeTruthy();
    expect(isAdultEligibilityConfirmed(store(), 'person-a')).toBe(false);
    expect(ageGateStatus()).toBe('confirmed');

    mockGet.mockResolvedValueOnce(unconfirmed);
    mockPost.mockResolvedValueOnce(confirmed);
    await store().verify('person-a');

    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(mockPost).toHaveBeenLastCalledWith(ADULT_ELIGIBILITY_PATH, {
      surface: 'mobile-auth',
      evidence: { kind: 'age_checked_on_device', minimumAge: ACCOUNT_MINIMUM_AGE },
    });
    expect(isAdultEligibilityConfirmed(store(), 'person-a')).toBe(true);
  });

  it('ignores an answer meant for an account that is no longer signed in', async () => {
    await askedForAge();
    store().reset();

    await store().submitAge('person-a', 30);

    expect(mockPost).not.toHaveBeenCalled();
  });
});

describe('re-checking when the account or the app changes', () => {
  it('runs the check again when the signed-in account changes', async () => {
    mockGet.mockResolvedValue(confirmed);
    await store().verify('person-a');
    expect(isAdultEligibilityAnswerPending(store(), 'person-a')).toBe(false);

    expect(isAdultEligibilityAnswerPending(store(), 'person-b')).toBe(true);
    expect(isAdultEligibilityConfirmed(store(), 'person-b')).toBe(false);
    await store().verify('person-b');

    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(isAdultEligibilityConfirmed(store(), 'person-b')).toBe(true);
  });

  it('keeps nothing across launches, so an upgraded app checks again', async () => {
    mockGet.mockResolvedValue(confirmed);
    await store().verify('person-a');

    expect([...mockStorage.keys()]).toEqual([]);
    store().reset();
    expect(isAdultEligibilityAnswerPending(store(), 'person-a')).toBe(true);
  });

  it('drops a late answer for the account that was switched away from', async () => {
    let answerA: (value: unknown) => void = () => undefined;
    mockGet.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answerA = resolve;
        }),
    );
    const checkA = store().verify('person-a');
    mockGet.mockResolvedValueOnce(ineligible);
    await store().verify('person-b');

    answerA(confirmed);
    await checkA;

    expect(store().userId).toBe('person-b');
    expect(store().status).toBe('ineligible');
  });
});
