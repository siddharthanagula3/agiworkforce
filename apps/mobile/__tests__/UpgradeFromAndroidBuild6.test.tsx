/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

// Android internal build 6 shipped the 13+ gate. These tests start from the
// MMKV state it leaves behind and drive the new build's own gate, router and
// server check over it. Installing build 6 and upgrading in place is a device
// step these tests cannot take.

const mockStorage = new Map<string, string>();

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
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

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: (props: Record<string, unknown>) => <View {...props} /> };
});

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const icon = (props: Record<string, unknown>) => <View {...props} />;
  return { Lock: icon, Shield: icon };
});

let mockSignedIn = false;
jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ isClerkSignedIn: mockSignedIn, signOutAllAccounts: jest.fn() }),
}));

jest.mock('@/src/features/age-assurance', () => ({
  assureAgeWithOs: jest.fn(async () => null),
}));

jest.mock('@/src/features/settings/data-controls/useLocalDataExport', () => ({
  useLocalDataExport: () => ({ exporting: false, progress: null, handleExport: jest.fn() }),
}));

jest.mock('@/src/features/settings/data-controls/useEraseDeviceData', () => ({
  useEraseDeviceData: () => ({ isWiping: false, eraseDeviceData: jest.fn() }),
}));

import { ACCOUNT_MINIMUM_AGE } from '@agiworkforce/types';
import { ADULT_ELIGIBILITY_PATH } from '@agiworkforce/cloud-contracts';
import AgeGateScreen from '../app/(public)/age-gate';
import {
  ageGateStatus,
  isAgeGateConfirmed,
  readAgeGateRecord,
} from '../src/features/auth/services/ageGate';
import {
  resolveRootRedirect,
  type RootRouteInput,
} from '../src/features/auth/services/rootRouting';
import {
  adultEligibilityNeedsAnswer,
  isAdultEligibilityConfirmed,
  useAdultEligibilityStore,
} from '../src/features/auth/store/adultEligibilityStore';

const BUILD_6_ADULT_RESULT = {
  confirmed: true,
  isMinor: false,
  confirmedAt: '2026-10-30T09:00:00.000Z',
  regionCode: 'DEFAULT',
  threshold: 13,
};
const ACCOUNT = 'build-6-account';
const confirmed = { minimumAge: ACCOUNT_MINIMUM_AGE, state: 'confirmed' };
const unconfirmed = { minimumAge: ACCOUNT_MINIMUM_AGE, state: 'unconfirmed' };

function leaveBuild6State(extra: { osRangeFrom?: number } = {}) {
  mockStorage.clear();
  mockStorage.set('age-gate:v1', JSON.stringify(BUILD_6_ADULT_RESULT));
  mockStorage.set('onboarding-done', 'true');
  if (extra.osRangeFrom !== undefined) {
    mockStorage.set(
      'age-assurance:v1',
      JSON.stringify({
        checkedAt: '2026-10-30T09:00:00.000Z',
        platform: 'android',
        outcome: 'range',
        regulated: true,
        lowerBound: extra.osRangeFrom,
        upperBound: null,
        guardianManaged: false,
        installId: null,
        significantChangeStatus: null,
      }),
    );
  }
}

function routeOnLaunch(
  segments: string[],
  signedIn: boolean,
): ReturnType<typeof resolveRootRedirect> {
  const input: RootRouteInput = {
    segments,
    authEnabled: true,
    isClerkLoaded: true,
    isClerkSignedIn: signedIn,
    onboardingDone: Boolean(mockStorage.get('onboarding-done')),
    ageGateConfirmed: isAgeGateConfirmed(),
    signInOwedForEndedSession: false,
  };
  return resolveRootRedirect(input);
}

function answerGate(age: string) {
  const screen = render(<AgeGateScreen />);
  fireEvent.changeText(screen.getByTestId('age-gate-input'), age);
  fireEvent.press(screen.getByTestId('age-gate-continue-btn'));
  return screen;
}

function cloudOpen(): boolean {
  return isAdultEligibilityConfirmed(useAdultEligibilityStore.getState(), ACCOUNT);
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockReset();
  mockPost.mockReset();
  mockSignedIn = false;
  useAdultEligibilityStore.getState().reset();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('upgrading from Android build 6 with no account, in Local Mode', () => {
  beforeEach(() => leaveBuild6State());

  it('reaches the age gate before Local chat on the first launch of the new build', () => {
    expect(ageGateStatus()).toBe('required');
    expect(routeOnLaunch(['(app)', '(tabs)', 'chat'], false)).toEqual({
      pathname: '/(public)/age-gate',
    });
    expect(routeOnLaunch(['(app)', 'settings'], false)).toEqual({
      pathname: '/(public)/age-gate',
    });
  });

  it('lets 18 or more through, records it against 18, and asks exactly once', () => {
    answerGate('18');

    expect(readAgeGateRecord()).toMatchObject({ isMinor: false, threshold: ACCOUNT_MINIMUM_AGE });
    expect(mockReplace).toHaveBeenCalledWith('/(public)/onboarding');
    expect(routeOnLaunch(['(public)', 'onboarding'], false)).toEqual({ pathname: '/(app)' });

    expect(routeOnLaunch(['(app)', '(tabs)', 'chat'], false)).toBeNull();
    expect(ageGateStatus()).toBe('confirmed');
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('refuses 17 and keeps Local Mode closed', () => {
    const screen = answerGate('17');

    expect(screen.getByTestId('age-gate-refusal')).toBeTruthy();
    expect(ageGateStatus()).toBe('refused');
    expect(routeOnLaunch(['(app)', '(tabs)', 'chat'], false)).toEqual({
      pathname: '/(public)/age-gate',
    });
  });
});

describe('upgrading from Android build 6 with a still-valid AGI Cloud session', () => {
  beforeEach(() => {
    leaveBuild6State();
    mockSignedIn = true;
  });

  async function launchWithSession() {
    mockGet.mockResolvedValueOnce(unconfirmed);
    await act(() => useAdultEligibilityStore.getState().verify(ACCOUNT));
  }

  it('reaches the age gate before the app, with Cloud closed', async () => {
    await launchWithSession();

    expect(mockPost).not.toHaveBeenCalled();
    expect(useAdultEligibilityStore.getState().status).toBe('age_required');
    expect(cloudOpen()).toBe(false);
    expect(routeOnLaunch(['(app)', '(tabs)', 'chat'], true)).toEqual({
      pathname: '/(public)/age-gate',
    });
    expect(routeOnLaunch(['(app)', '(tabs)', 'chat'], false)).toEqual({
      pathname: '/(public)/age-gate',
    });
  });

  it('reports the typed age after the answer and opens Cloud only on confirmed', async () => {
    await launchWithSession();
    const answer = deferred<unknown>();
    mockPost.mockReturnValueOnce(answer.promise);

    answerGate('30');

    expect(readAgeGateRecord()).toMatchObject({ isMinor: false, threshold: ACCOUNT_MINIMUM_AGE });
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith(ADULT_ELIGIBILITY_PATH, {
      surface: 'mobile-auth',
      evidence: { kind: 'declared_age', age: 30 },
    });
    expect(cloudOpen()).toBe(false);
    expect(adultEligibilityNeedsAnswer(useAdultEligibilityStore.getState(), ACCOUNT)).toBe(false);

    await act(async () => {
      answer.resolve(confirmed);
      await answer.promise;
    });

    expect(cloudOpen()).toBe(true);
    expect(Object.values(readAgeGateRecord() ?? {})).not.toContain(30);
  });

  it('asks exactly once: the next launch reports the device result without a prompt', async () => {
    await launchWithSession();
    mockPost.mockResolvedValueOnce(confirmed);
    answerGate('30');
    await act(async () => undefined);
    useAdultEligibilityStore.getState().reset();
    mockGet.mockReset();
    mockPost.mockReset();

    mockGet.mockResolvedValueOnce(confirmed);
    await act(() => useAdultEligibilityStore.getState().verify(ACCOUNT));

    expect(ageGateStatus()).toBe('confirmed');
    expect(routeOnLaunch(['(app)', '(tabs)', 'chat'], true)).toBeNull();
    expect(adultEligibilityNeedsAnswer(useAdultEligibilityStore.getState(), ACCOUNT)).toBe(false);
    expect(cloudOpen()).toBe(true);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('keeps Cloud closed while the server has not answered, and after a failed report', async () => {
    await launchWithSession();
    mockPost.mockRejectedValueOnce(new TypeError('offline'));

    answerGate('30');
    await act(async () => undefined);

    expect(cloudOpen()).toBe(false);
    expect(useAdultEligibilityStore.getState().status).toBe('age_required');
  });

  it('refuses 17 and keeps both Cloud and Local Mode closed', async () => {
    await launchWithSession();

    const screen = answerGate('17');

    expect(screen.getByTestId('age-gate-refusal')).toBeTruthy();
    expect(screen.getByTestId('age-gate-refused-sign-out-btn')).toBeTruthy();
    expect(ageGateStatus()).toBe('refused');
    expect(cloudOpen()).toBe(false);
    expect(routeOnLaunch(['(app)', '(tabs)', 'chat'], true)).toEqual({
      pathname: '/(public)/age-gate',
    });
  });

  it('reuses a stored OS range of 18 or more instead of asking, and reports that range', async () => {
    leaveBuild6State({ osRangeFrom: 18 });
    mockGet.mockResolvedValueOnce(unconfirmed);
    mockPost.mockResolvedValueOnce(confirmed);

    await act(() => useAdultEligibilityStore.getState().verify(ACCOUNT));

    expect(routeOnLaunch(['(app)', '(tabs)', 'chat'], true)).toBeNull();
    expect(mockPost).toHaveBeenCalledWith(ADULT_ELIGIBILITY_PATH, {
      surface: 'mobile-auth',
      evidence: { kind: 'platform_age_signal', lowerBound: 18, upperBound: null },
    });
    expect(cloudOpen()).toBe(true);
  });
});

describe('an adult already on the new rule', () => {
  it('signs in and reaches the app with no age prompt and no redirect to the gate', async () => {
    mockStorage.clear();
    mockStorage.set(
      'age-gate:v1',
      JSON.stringify({ ...BUILD_6_ADULT_RESULT, threshold: ACCOUNT_MINIMUM_AGE }),
    );
    mockStorage.set('onboarding-done', 'true');
    mockGet.mockResolvedValueOnce(confirmed);

    await act(() => useAdultEligibilityStore.getState().verify(ACCOUNT));

    expect(routeOnLaunch(['(auth)', 'login'], false)).toBeNull();
    expect(routeOnLaunch(['(auth)', 'login'], true)).toEqual({ pathname: '/(app)' });
    expect(routeOnLaunch(['(app)', '(tabs)', 'chat'], true)).toBeNull();
    expect(adultEligibilityNeedsAnswer(useAdultEligibilityStore.getState(), ACCOUNT)).toBe(false);
    expect(cloudOpen()).toBe(true);
    expect(mockPost).not.toHaveBeenCalled();
  });
});
