jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => 'session-token'),
  getAuthHeaders: jest.fn(async () => ({ Authorization: 'Bearer session-token' })),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(),
}));

jest.mock('../src/platform/webContentPage', () => ({
  openWebContentPage: jest.fn(),
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

jest.mock('../src/platform/platformHeaders', () => ({
  platformRequestHeaders: () => ({}),
}));

const mockSecureFetch = jest.fn();
jest.mock('@/services/secureFetch', () => ({
  secureFetch: (input: unknown, init: unknown) => mockSecureFetch(input, init),
}));

const mockStored = new Map<string, string>();
jest.mock('@/lib/mmkv', () => ({
  storage: {
    getString: (key: string) => mockStored.get(key),
    set: (key: string, value: string) => mockStored.set(key, value),
    delete: (key: string) => mockStored.delete(key),
  },
  mmkvStorage: {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  },
  rehydrateWhenMmkvReady: () => undefined,
  whenMmkvReady: (callback: () => void) => callback(),
}));

import {
  ADULT_ELIGIBILITY_PATH,
  type AdultEligibilityRequest,
  type AdultEligibilityStatus,
} from '@agiworkforce/cloud-contracts';
import { ACCOUNT_MINIMUM_AGE } from '@agiworkforce/types';

import { API_URL } from '../lib/constants';
import { EgressBlockedError } from '../lib/egressGuard';
import { api } from '../services/api';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';

const ELIGIBILITY_URL = new URL(ADULT_ELIGIBILITY_PATH, API_URL).toString();
const UNCONFIRMED: AdultEligibilityStatus = {
  minimumAge: ACCOUNT_MINIMUM_AGE,
  state: 'unconfirmed',
};
const CONFIRMED: AdultEligibilityStatus = { minimumAge: ACCOUNT_MINIMUM_AGE, state: 'confirmed' };
const DECLARED: AdultEligibilityRequest = {
  surface: 'mobile-auth',
  evidence: { kind: 'declared_age', age: ACCOUNT_MINIMUM_AGE },
};

function answer(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('the age check that opens AGI Cloud, sent before Cloud is open', () => {
  beforeEach(() => {
    mockStored.clear();
    mockSecureFetch.mockReset();
    useChatAppModeStore.setState({ appMode: 'local' });
  });

  it('reads the account decision from the server while the app is still in Local Mode', async () => {
    mockSecureFetch.mockResolvedValueOnce(answer(UNCONFIRMED));

    await expect(api.get(ADULT_ELIGIBILITY_PATH)).resolves.toEqual(UNCONFIRMED);

    expect(mockSecureFetch).toHaveBeenCalledTimes(1);
    expect(mockSecureFetch.mock.calls[0]?.[0]).toBe(ELIGIBILITY_URL);
  });

  it('reports the age evidence to the server while the app is still in Local Mode', async () => {
    mockSecureFetch.mockResolvedValueOnce(answer(CONFIRMED));

    await expect(api.post(ADULT_ELIGIBILITY_PATH, DECLARED)).resolves.toEqual(CONFIRMED);

    expect(mockSecureFetch).toHaveBeenCalledTimes(1);
    const init = mockSecureFetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(DECLARED);
  });

  it('CRITICAL: still sends nothing else to AGI Cloud from Local Mode', async () => {
    await expect(api.post('/api/chat/send', { message: 'hello' })).rejects.toBeInstanceOf(
      EgressBlockedError,
    );
    await expect(
      api.post(ADULT_ELIGIBILITY_PATH, { ...DECLARED, note: 'hello' }),
    ).rejects.toBeInstanceOf(EgressBlockedError);

    expect(mockSecureFetch).not.toHaveBeenCalled();
  });
});
