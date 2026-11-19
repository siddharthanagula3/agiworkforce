/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, Modal, StyleSheet } from 'react-native';
import { MANAGED_USAGE_BUCKET_COPY, MANAGED_USAGE_BUCKET_ORDER } from '@agiworkforce/types';
import { NATIVE_PURCHASES_AVAILABLE } from '@/src/features/billing/nativePurchaseAvailability';
import { ApiHttpError } from '@/services/apiErrors';
import {
  FAST_MODE_USAGE_CREDITS_MESSAGE,
  useFastModeStore,
} from '@/src/features/model-picker/fastMode';

const mockAuthState = {
  isClerkLoaded: true,
  isClerkSignedIn: true,
  clerkUserId: 'user-a' as string | null,
};

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...actual,
    useThemeColors: () => actual.lightColors,
  };
});

jest.mock('@/components/ui/Text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => <RN.Text {...props} />;
  Text.displayName = 'Text';
  return { Text };
});

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const Icon = (props: Record<string, unknown>) => <RN.View {...props} />;
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : Icon) });
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/src/features/settings/Common', () => {
  const RN = require('react-native');
  return {
    SettingsScreenShell: ({ children }: { children: React.ReactNode }) => (
      <RN.View>{children}</RN.View>
    ),
    SettingsInfo: ({ title, body }: { title: string; body: string }) => (
      <RN.View>
        <RN.Text>{title}</RN.Text>
        <RN.Text>{body}</RN.Text>
      </RN.View>
    ),
    SettingsGroup: ({ children }: { children: React.ReactNode }) => <RN.View>{children}</RN.View>,
    SettingsRow: ({ label }: { label: string }) => <RN.Text>{label}</RN.Text>,
    CloudSyncBlockedBanner: () => null,
    CloudAccountRequired: () => null,
  };
});

const mockFetchUsageSnapshot = jest.fn();
const mockFetchUsageAllowances = jest.fn();
const mockFetchUsageOverage = jest.fn();
const mockSaveUsageOverage = jest.fn();
jest.mock('@/services/usage', () => ({
  applyLimitReset: jest.fn(),
  fetchUsageSnapshot: (...args: unknown[]) => mockFetchUsageSnapshot(...args),
  fetchUsageAllowances: (...args: unknown[]) => mockFetchUsageAllowances(...args),
  fetchUsageHistory: () => new Promise(() => undefined),
  fetchUsageOverage: (...args: unknown[]) => mockFetchUsageOverage(...args),
  saveUsageOverage: (...args: unknown[]) => mockSaveUsageOverage(...args),
}));

jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: (selector: (s: typeof mockAuthState) => unknown) => selector(mockAuthState),
}));

jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () => ({ ownerId: 'user-a', epoch: 1 }),
  isCloudAccountEpochCurrent: () => true,
  isStaleCloudAccountOperation: () => false,
}));

import CloudUsageScreen from '../src/features/settings/cloud-usage/index';
import { useCloudUsageStore } from '../src/features/settings/cloud-usage/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';

const GIB = 1024 * 1024 * 1024;

function snap(overrides: Record<string, unknown> = {}) {
  return {
    planTier: 'pro',
    usagePercentage: 25,
    usageResetAt: '2099-08-01T00:00:00.000Z',
    hasUsageRemaining: true,
    periodStart: '2099-07-01T00:00:00.000Z',
    periodEnd: '2099-08-01T00:00:00.000Z',
    subscriptionStatus: 'active',
    sessionUsagePercentage: 10,
    sessionResetAt: '2099-07-15T05:00:00.000Z',
    weeklyUsagePercentage: 20,
    weeklyResetAt: '2099-07-20T00:00:00.000Z',
    flagshipWeeklyUsagePercentage: 0,
    flagshipWeeklyResetAt: null,
    credits: null,
    limitPromotions: null,
    ...overrides,
  };
}

function allowances(storage: { usedBytes: number | null; limitBytes: number | null } | null) {
  return {
    units: [],
    images: { requests: 0, images: 0, credits: 0 },
    responses: null,
    storage,
    resetAt: '2099-08-01T00:00:00.000Z',
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockAuthState, {
    isClerkLoaded: true,
    isClerkSignedIn: true,
    clerkUserId: 'user-a',
  });
  useCloudUsageStore.getState().clear();
  useChatAppModeStore.setState({ appMode: 'cloud' });
  mockFetchUsageSnapshot.mockResolvedValue(snap());
  mockFetchUsageAllowances.mockResolvedValue(allowances(null));
  mockFetchUsageOverage.mockResolvedValue({ enabled: false, availableCredits: 0 });
});

describe('usage limits explainer sheet', () => {
  it('runs against the real switch value', () => {
    expect(NATIVE_PURCHASES_AVAILABLE).toBe(false);
  });

  it('puts an About usage limits button beside the 5-hour, weekly and monthly headings', async () => {
    const screen = render(<CloudUsageScreen />);

    await waitFor(() => expect(screen.getAllByLabelText('About usage limits')).toHaveLength(3));
    const button = screen.getAllByLabelText('About usage limits')[0];
    const style = StyleSheet.flatten(button.props.style);
    expect(style.width).toBe(44);
    expect(style.height).toBe(44);
    expect(screen.queryByTestId('usage-limits-sheet')).toBeNull();
  });

  it('opens a sheet built from the shared window descriptions and closes with Done', async () => {
    const screen = render(<CloudUsageScreen />);
    await waitFor(() => expect(screen.getAllByLabelText('About usage limits')).toHaveLength(3));

    fireEvent.press(screen.getAllByLabelText('About usage limits')[1]);

    expect(screen.getByText('How usage limits work')).toBeTruthy();
    for (const bucket of MANAGED_USAGE_BUCKET_ORDER) {
      expect(screen.getByText(MANAGED_USAGE_BUCKET_COPY[bucket].description)).toBeTruthy();
    }
    const sheet = screen.getByTestId('usage-limits-sheet');
    expect(sheet).toHaveTextContent(/Larger models and tools use more\./);
    expect(sheet).toHaveTextContent(/Cloud replies pause until reset\./);
    expect(sheet).toHaveTextContent(/Local mode keeps working\./);
    expect(sheet).not.toHaveTextContent(/buy|purchase|upgrade|top-up|price|https?:/i);

    fireEvent.press(screen.getByLabelText('Done'));
    expect(screen.queryByTestId('usage-limits-sheet')).toBeNull();
  });

  it('closes on a swipe down or the back gesture', async () => {
    const screen = render(<CloudUsageScreen />);
    await waitFor(() => expect(screen.getAllByLabelText('About usage limits')).toHaveLength(3));
    fireEvent.press(screen.getAllByLabelText('About usage limits')[0]);
    expect(screen.getByTestId('usage-limits-sheet')).toBeTruthy();

    expect(screen.UNSAFE_getByType(Modal).props.allowSwipeDismissal).toBe(true);
    fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose');

    expect(screen.queryByTestId('usage-limits-sheet')).toBeNull();
  });

  it('gives a Free account no meters and so no explainer button', async () => {
    mockFetchUsageSnapshot.mockResolvedValue(snap({ planTier: 'free' }));
    const screen = render(<CloudUsageScreen />);

    await waitFor(() => expect(screen.getByText('Free plan')).toBeTruthy());
    expect(screen.queryByLabelText('About usage limits')).toBeNull();
    expect(mockFetchUsageOverage).not.toHaveBeenCalled();
  });
});

describe('usage credits card', () => {
  it.each([
    ['a balance and the switch off', { enabled: false, availableCredits: 40 }, true],
    ['the switch on and no balance', { enabled: true, availableCredits: 0 }, true],
    ['the switch on and a balance', { enabled: true, availableCredits: 40 }, true],
    ['no balance and the switch off', { enabled: false, availableCredits: 0 }, false],
  ])('with %s the card shows: %s', async (_name, overage, shown) => {
    mockFetchUsageOverage.mockResolvedValue(overage);
    const screen = render(<CloudUsageScreen />);

    await waitFor(() => expect(mockFetchUsageOverage).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('Plan usage')).toBeTruthy());
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByText('Usage credits') !== null).toBe(shown);
    expect(screen.queryByTestId('usage-credits-switch') !== null).toBe(shown);
  });

  it('hides the card while the setting loads and when it cannot be read', async () => {
    const pending = deferred<{ enabled: boolean; availableCredits: number }>();
    mockFetchUsageOverage.mockReturnValueOnce(pending.promise);
    const screen = render(<CloudUsageScreen />);

    await waitFor(() => expect(mockFetchUsageOverage).toHaveBeenCalled());
    expect(screen.queryByText('Usage credits')).toBeNull();

    await act(async () => {
      pending.reject(new Error('offline'));
    });
    expect(screen.queryByText('Usage credits')).toBeNull();
    expect(screen.queryByText('Could not load the usage credits setting.')).toBeNull();
  });

  it('is not requested in Local mode', async () => {
    useChatAppModeStore.setState({ appMode: 'local' });
    const screen = render(<CloudUsageScreen />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockFetchUsageOverage).not.toHaveBeenCalled();
    expect(screen.queryByText('Usage credits')).toBeNull();
  });

  it('states the balance in credits, never dollars, with no buying words', async () => {
    mockFetchUsageOverage.mockResolvedValue({ enabled: false, availableCredits: 1250.5 });
    const screen = render(<CloudUsageScreen />);

    await waitFor(() => expect(screen.getByText('Current balance')).toBeTruthy());
    expect(screen.getByText('1,250.5 credits')).toBeTruthy();
    expect(
      screen.getByText('Keep going past your plan limits by spending credits you already hold.'),
    ).toBeTruthy();
    expect(screen.queryByText(/\$\d/)).toBeNull();
    expect(screen.queryByText(/buy|purchase|top-up|upgrade/i)).toBeNull();
  });

  it('turns on optimistically, locks the switch while saving, then keeps the saved value', async () => {
    mockFetchUsageOverage.mockResolvedValue({ enabled: false, availableCredits: 40 });
    const save = deferred<{ enabled: boolean; availableCredits: number }>();
    mockSaveUsageOverage.mockReturnValueOnce(save.promise);
    const refreshFastMode = jest.fn().mockResolvedValue(undefined);
    useFastModeStore.setState({ refresh: refreshFastMode });
    const screen = render(<CloudUsageScreen />);
    await waitFor(() => expect(screen.getByTestId('usage-credits-switch')).toBeTruthy());
    expect(screen.getByTestId('usage-credits-switch').props.value).toBe(false);
    await waitFor(() => expect(mockFetchUsageSnapshot).toHaveBeenCalledTimes(1));

    fireEvent(screen.getByTestId('usage-credits-switch'), 'valueChange', true);

    expect(mockSaveUsageOverage).toHaveBeenCalledWith(true, { ownerId: 'user-a', epoch: 1 });
    expect(screen.getByTestId('usage-credits-switch').props.value).toBe(true);
    expect(screen.getByTestId('usage-credits-switch').props.disabled).toBe(true);

    await act(async () => {
      save.resolve({ enabled: true, availableCredits: 35 });
    });

    expect(screen.getByTestId('usage-credits-switch').props.value).toBe(true);
    expect(screen.getByTestId('usage-credits-switch').props.disabled).toBe(false);
    expect(screen.getByText('35 credits')).toBeTruthy();
    expect(screen.getByText('Usage credits')).toBeTruthy();
    expect(refreshFastMode).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockFetchUsageSnapshot).toHaveBeenCalledTimes(2));
  });

  it('keeps the card after the last credit is switched off', async () => {
    mockFetchUsageOverage.mockResolvedValue({ enabled: true, availableCredits: 0 });
    mockSaveUsageOverage.mockResolvedValueOnce({ enabled: false, availableCredits: 0 });
    const screen = render(<CloudUsageScreen />);
    await waitFor(() => expect(screen.getByTestId('usage-credits-switch')).toBeTruthy());

    fireEvent(screen.getByTestId('usage-credits-switch'), 'valueChange', false);
    await waitFor(() =>
      expect(screen.getByTestId('usage-credits-switch').props.disabled).toBe(false),
    );

    expect(screen.getByTestId('usage-credits-switch').props.value).toBe(false);
  });

  it('reverts the switch and shows the server message when saving fails', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockFetchUsageOverage.mockResolvedValue({ enabled: false, availableCredits: 40 });
    mockSaveUsageOverage.mockRejectedValueOnce(new ApiHttpError('Try again in a minute.', 429));
    const screen = render(<CloudUsageScreen />);
    await waitFor(() => expect(screen.getByTestId('usage-credits-switch')).toBeTruthy());

    fireEvent(screen.getByTestId('usage-credits-switch'), 'valueChange', true);
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        'Could not update usage credits',
        'Try again in a minute.',
      ),
    );

    expect(screen.getByTestId('usage-credits-switch').props.value).toBe(false);
    expect(screen.getByTestId('usage-credits-switch').props.disabled).toBe(false);
    alert.mockRestore();
  });

  it('falls back to a plain retry message when the failure has no server message', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockFetchUsageOverage.mockResolvedValue({ enabled: true, availableCredits: 40 });
    mockSaveUsageOverage.mockRejectedValueOnce(new Error('network down'));
    const screen = render(<CloudUsageScreen />);
    await waitFor(() => expect(screen.getByTestId('usage-credits-switch')).toBeTruthy());

    fireEvent(screen.getByTestId('usage-credits-switch'), 'valueChange', false);
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith('Could not update usage credits', 'Try again.'),
    );

    expect(screen.getByTestId('usage-credits-switch').props.value).toBe(true);
    alert.mockRestore();
  });

  it('points a fast mode block at Usage, not at the web', () => {
    expect(FAST_MODE_USAGE_CREDITS_MESSAGE).toContain('Turn on usage credits in Usage.');
    expect(FAST_MODE_USAGE_CREDITS_MESSAGE).not.toMatch(/web|billing/i);
  });
});

describe('file storage bar', () => {
  it('draws the used share under Used X of Y on a paid plan', async () => {
    mockFetchUsageAllowances.mockResolvedValue(
      allowances({ usedBytes: 2 * GIB, limitBytes: 8 * GIB }),
    );
    const screen = render(<CloudUsageScreen />);

    await waitFor(() => expect(screen.getByTestId('usage-storage-meter')).toBeTruthy());
    expect(screen.getByText('2 GB of 8 GB')).toBeTruthy();
    const fill = StyleSheet.flatten(screen.getByTestId('usage-storage-meter-fill').props.style);
    expect(fill.width).toBe('25%');
    expect(screen.getByTestId('usage-storage-meter').props.accessibilityValue).toMatchObject({
      now: 25,
    });
  });

  it('draws no bar when the plan has no storage limit', async () => {
    mockFetchUsageAllowances.mockResolvedValue(
      allowances({ usedBytes: 2 * GIB, limitBytes: null }),
    );
    const screen = render(<CloudUsageScreen />);

    await waitFor(() => expect(screen.getByText('File storage')).toBeTruthy());
    expect(screen.queryByTestId('usage-storage-meter')).toBeNull();
  });

  it('shows a Free account no file storage card and no bar', async () => {
    mockFetchUsageSnapshot.mockResolvedValue(snap({ planTier: 'free' }));
    mockFetchUsageAllowances.mockResolvedValue(
      allowances({ usedBytes: 2 * GIB, limitBytes: 8 * GIB }),
    );
    const screen = render(<CloudUsageScreen />);

    await waitFor(() => expect(screen.getByText('Free plan')).toBeTruthy());
    expect(screen.queryByText('File storage')).toBeNull();
    expect(screen.queryByTestId('usage-storage-meter')).toBeNull();
  });
});
