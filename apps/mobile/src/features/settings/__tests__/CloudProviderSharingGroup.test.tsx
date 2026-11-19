/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { Alert, AppState, Platform, type AlertButton, type AppStateStatus } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockStorage = new Map<string, string>();
const mockAuth = { isClerkLoaded: true, isClerkSignedIn: false };
const mockMode = { appMode: 'local' as 'local' | 'cloud' };

jest.mock('@/lib/mmkv', () => ({
  storage: {
    getString: (key: string) => mockStorage.get(key),
    set: (key: string, value: string) => {
      mockStorage.set(key, value);
    },
    delete: (key: string) => {
      mockStorage.delete(key);
    },
  },
  whenMmkvReady: (cb: () => void) => cb(),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: () => null,
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/lib/safeOpenURL', () => ({
  openInAppBrowser: jest.fn().mockResolvedValue(true),
  openExternalUrl: jest.fn().mockResolvedValue(true),
  isAllowedExternalUrl: () => true,
}));

jest.mock('@/src/features/auth/store', () => {
  const useAuthStore = (selector: (s: typeof mockAuth) => unknown) => selector(mockAuth);
  useAuthStore.getState = () => mockAuth;
  useAuthStore.subscribe = () => () => undefined;
  return { useAuthStore };
});

jest.mock('@/src/features/schedules/service', () => ({
  fetchSchedulePage: jest.fn(),
  toggleSchedule: jest.fn(),
}));
jest.mock('@/src/features/tasks/service', () => ({
  listCloudRuns: jest.fn(),
  pauseCloudRun: jest.fn(),
}));
jest.mock('@/src/features/siri/askIntentToken', () => ({
  isAskFromSiriEnabled: jest.fn(),
  forgetAskFromSiriOnDevice: jest.fn(),
  revokeForgottenAskFromSiri: jest.fn(),
}));
jest.mock('@/src/features/voice/hooks/useLiveVoiceSession', () => ({
  endLiveVoiceSessions: jest.fn(),
}));
jest.mock('@/stores/chat/chatExecutionStore', () => ({
  ...jest.requireActual('@/stores/chat/chatExecutionStore'),
  stopEveryCloudStream: jest.fn(),
}));
jest.mock('@/src/shared/components/Toast', () => ({
  ...jest.requireActual('@/src/shared/components/Toast'),
  showToast: jest.fn(),
}));

jest.mock('@/src/features/chat/hooks/useAppModeSwitch', () => ({
  useAppModeSwitch: () => ({
    appMode: mockMode.appMode,
    cloudUnlocked: true,
    switchToLocal: jest.fn(() => true),
    switchToCloud: jest.fn(() => true),
  }),
}));

jest.mock('@/src/features/settings/cloud-privacy/TrainingPreferenceGroups', () => {
  const RN = require('react-native');
  return { TrainingPreferenceGroups: () => <RN.View testID="training-groups" /> };
});
jest.mock('@/src/features/settings/cloud-privacy/UsOnlyRoutingGroup', () => {
  const RN = require('react-native');
  return { UsOnlyRoutingGroup: () => <RN.View testID="us-only-group" /> };
});
jest.mock('@/src/features/settings/cloud-privacy/ChineseHqProviderConsentGroup', () => {
  const RN = require('react-native');
  return { ChineseHqProviderConsentGroup: () => <RN.View testID="chinese-hq-group" /> };
});
jest.mock('@/src/features/settings/cloud-privacy/ProductAnalyticsConsentGroup', () => {
  const RN = require('react-native');
  return { ProductAnalyticsConsentGroup: () => <RN.View testID="analytics-group" /> };
});

import {
  MANAGED_CLOUD_SCHEDULES_MAX_PAGE_SIZE,
  ManagedCloudAgentRunHttpError,
} from '@agiworkforce/cloud-contracts';
import { openInAppBrowser } from '@/lib/safeOpenURL';
import { mmkvDisclosureLedger } from '@/services/complianceLedger';
import { CloudProviderConsentRequiredError, ensureCloudSendConsent } from '@/services/llmGate';
import {
  CLOUD_PROVIDER_CONSENT_ALLOW_LABEL,
  CLOUD_PROVIDER_CONSENT_DECLINE_LABEL,
  CLOUD_PROVIDER_CONSENT_DETAILS_LABEL,
  CLOUD_PROVIDER_CONSENT_KEY,
  CLOUD_PROVIDER_CONSENT_WITHDRAWAL_KEY,
  CLOUD_PROVIDER_LIST_URL,
  CLOUD_PROVIDER_SHARING_LABEL,
  cloudAiProviders,
  cloudProviderConsentMessage,
  hasCloudProviderConsentForCurrentAccount,
  hasCurrentCloudProviderConsent,
  recordCloudProviderConsent,
} from '@/services/providerConsent';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { installCloudModeDoor } from '@/src/features/chat/store/cloudModeDoor';
import { fetchSchedulePage, toggleSchedule } from '@/src/features/schedules/service';
import CloudPrivacyScreen from '@/src/features/settings/cloud-privacy';
import {
  ASK_FROM_SIRI_STILL_ON,
  CLOUD_PROVIDER_SHARING_CAPTION,
  CLOUD_PROVIDER_SHARING_TEST_ID,
  CloudProviderSharingGroup,
  SHARING_NOT_TURNED_OFF,
  STANDING_CLOUD_WORK_AND_ASK_FROM_SIRI_NOT_STOPPED,
  STANDING_CLOUD_WORK_NOT_STOPPED,
  standingCloudWorkPausedMessage,
  withdrawSharingWithProviders,
} from '@/src/features/settings/cloud-privacy/CloudProviderSharingGroup';
import {
  forgetAskFromSiriOnDevice,
  isAskFromSiriEnabled,
  revokeForgottenAskFromSiri,
} from '@/src/features/siri/askIntentToken';
import { listCloudRuns, pauseCloudRun } from '@/src/features/tasks/service';
import { endLiveVoiceSessions } from '@/src/features/voice/hooks/useLiveVoiceSession';
import { showToast } from '@/src/shared/components/Toast';
import { stopEveryCloudStream } from '@/stores/chat/chatExecutionStore';
import { TIMEOUTS } from '@/lib/constants';

const mockOpenInAppBrowser = openInAppBrowser as jest.Mock;
const mockFetchSchedulePage = fetchSchedulePage as jest.Mock;
const mockToggleSchedule = toggleSchedule as jest.Mock;
const mockListCloudRuns = listCloudRuns as jest.Mock;
const mockPauseCloudRun = pauseCloudRun as jest.Mock;
const mockSiriEnabled = isAskFromSiriEnabled as jest.Mock;
const mockForgetSiri = forgetAskFromSiriOnDevice as jest.Mock;
const mockRevokeSiri = revokeForgottenAskFromSiri as jest.Mock;
const mockStopEveryCloudStream = stopEveryCloudStream as jest.Mock;
const mockEndLiveVoice = endLiveVoiceSessions as jest.Mock;
const mockShowToast = showToast as jest.Mock;
const alertSpy = jest.spyOn(Alert, 'alert');

function setMode(mode: 'local' | 'cloud'): void {
  mockMode.appMode = mode;
  useChatAppModeStore.setState({ appMode: mode });
}

function sharingSwitch() {
  return screen.getByTestId(CLOUD_PROVIDER_SHARING_TEST_ID);
}

function sharingState(): { on: boolean; disabled: boolean } {
  const props = sharingSwitch().props;
  return Platform.OS === 'android'
    ? { on: props.on === true, disabled: props.enabled === false }
    : { on: props.value === true, disabled: props.disabled === true };
}

function pressAlertButton(label: string): void {
  const buttons = (alertSpy.mock.calls[alertSpy.mock.calls.length - 1]?.[2] ?? []) as AlertButton[];
  const button = buttons.find((candidate) => candidate.text === label);
  if (!button?.onPress) throw new Error(`No "${label}" button in the consent prompt`);
  button.onPress();
}

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

beforeEach(() => {
  mockStorage.clear();
  alertSpy.mockReset();
  mockOpenInAppBrowser.mockClear();
  mockOpenInAppBrowser.mockResolvedValue(true);
  mockAuth.isClerkLoaded = true;
  mockAuth.isClerkSignedIn = false;
  __resetCloudAccountSessionForTests();
  activateCloudAccount('person-a');
  mockFetchSchedulePage.mockReset().mockResolvedValue([]);
  mockToggleSchedule.mockReset().mockResolvedValue(undefined);
  mockListCloudRuns.mockReset().mockResolvedValue({ runs: [], nextCursor: null });
  mockPauseCloudRun.mockReset().mockResolvedValue(undefined);
  mockSiriEnabled.mockReset().mockReturnValue(false);
  mockForgetSiri.mockReset().mockImplementation(async () => {
    mockSiriEnabled.mockReturnValue(false);
  });
  mockRevokeSiri.mockReset().mockResolvedValue(undefined);
  mockEndLiveVoice.mockReset();
  mockStopEveryCloudStream.mockReset().mockReturnValue([]);
  mockShowToast.mockReset();
  setMode('cloud');
  mmkvDisclosureLedger.write({
    version: 1,
    acceptedAt: new Date().toISOString(),
    surface: 'mobile',
    disclosureCopyHash: 'test-copy-hash',
    managedCloudAccepted: false,
    chineseHqProvidersAccepted: [],
  });
});

describe('the Share with AI providers switch', () => {
  it('is on when sharing is allowed, with its name, state and one line on what On and Off do', () => {
    recordCloudProviderConsent();
    render(<CloudProviderSharingGroup />);

    const toggle = sharingSwitch();
    expect(toggle.props.value).toBe(true);
    expect(toggle.props.accessibilityLabel).toBe(`${CLOUD_PROVIDER_SHARING_LABEL}. On`);
    expect(screen.getByRole('switch', { name: `${CLOUD_PROVIDER_SHARING_LABEL}. On` })).toBe(
      toggle,
    );
    expect(screen.getByText(CLOUD_PROVIDER_SHARING_CAPTION)).toBeTruthy();
    expect(screen.queryByText(cloudProviderConsentMessage(cloudAiProviders()))).toBeNull();
  });

  it('is off when nothing was allowed', () => {
    render(<CloudProviderSharingGroup />);

    expect(sharingState().on).toBe(false);
    expect(sharingSwitch().props.accessibilityLabel).toBe(`${CLOUD_PROVIDER_SHARING_LABEL}. Off`);
  });

  it('withdraws when turned off, without a confirmation, and the next send asks again', async () => {
    recordCloudProviderConsent();
    render(<CloudProviderSharingGroup />);

    fireEvent(sharingSwitch(), 'valueChange', false);
    await flush();

    expect(alertSpy).not.toHaveBeenCalled();
    expect(hasCurrentCloudProviderConsent()).toBe(false);
    expect(sharingState().on).toBe(false);

    const send = ensureCloudSendConsent();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    pressAlertButton(CLOUD_PROVIDER_CONSENT_DECLINE_LABEL);
    await expect(send).rejects.toBeInstanceOf(CloudProviderConsentRequiredError);
  });

  it('asks the same question when turned on and stays on after Allow', async () => {
    render(<CloudProviderSharingGroup />);

    fireEvent(sharingSwitch(), 'valueChange', true);

    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = alertSpy.mock.calls[0]!;
    expect(title).toBe(`${CLOUD_PROVIDER_SHARING_LABEL}?`);
    expect(message).toBe(cloudProviderConsentMessage(cloudAiProviders()));
    expect((buttons as AlertButton[]).map((button) => button.text)).toEqual([
      CLOUD_PROVIDER_CONSENT_DETAILS_LABEL,
      CLOUD_PROVIDER_CONSENT_DECLINE_LABEL,
      CLOUD_PROVIDER_CONSENT_ALLOW_LABEL,
    ]);
    expect(sharingState().on).toBe(false);
    expect(sharingState().disabled).toBe(true);

    pressAlertButton(CLOUD_PROVIDER_CONSENT_ALLOW_LABEL);
    await flush();

    expect(hasCurrentCloudProviderConsent()).toBe(true);
    expect(sharingState().on).toBe(true);
    expect(sharingState().disabled).toBe(false);
  });

  it('stays off after Not now and records nothing', async () => {
    render(<CloudProviderSharingGroup />);

    fireEvent(sharingSwitch(), 'valueChange', true);
    pressAlertButton(CLOUD_PROVIDER_CONSENT_DECLINE_LABEL);
    await flush();

    expect(hasCurrentCloudProviderConsent()).toBe(false);
    expect(sharingState().on).toBe(false);
    expect(sharingState().disabled).toBe(false);
  });

  it('opens the provider list from Details and follows the answer asked after it', async () => {
    render(<CloudProviderSharingGroup />);

    fireEvent(sharingSwitch(), 'valueChange', true);
    pressAlertButton(CLOUD_PROVIDER_CONSENT_DETAILS_LABEL);
    await flush();

    expect(mockOpenInAppBrowser).toHaveBeenCalledWith(`${CLOUD_PROVIDER_LIST_URL}?from=mobile`);
    expect(alertSpy).toHaveBeenCalledTimes(2);
    expect(sharingState().on).toBe(false);

    pressAlertButton(CLOUD_PROVIDER_CONSENT_ALLOW_LABEL);
    await flush();
    expect(sharingState().on).toBe(true);
  });

  describe('on Android, where the question follows the app coming back to the front', () => {
    const originalOS = Platform.OS;
    const originalAppState = AppState.currentState;
    let listeners: Array<(state: AppStateStatus) => void> = [];
    let addListener: jest.SpyInstance;

    function moveApp(state: AppStateStatus): void {
      AppState.currentState = state;
      for (const listener of [...listeners]) listener(state);
    }

    beforeEach(() => {
      Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });
      listeners = [];
      AppState.currentState = 'active';
      addListener = jest
        .spyOn(AppState, 'addEventListener')
        .mockImplementation((_event, listener) => {
          const handler = listener as (state: AppStateStatus) => void;
          listeners.push(handler);
          return {
            remove: () => {
              listeners = listeners.filter((candidate) => candidate !== handler);
            },
          } as ReturnType<typeof AppState.addEventListener>;
        });
    });

    afterEach(() => {
      addListener.mockRestore();
      AppState.currentState = originalAppState;
      Object.defineProperty(Platform, 'OS', { get: () => originalOS, configurable: true });
    });

    it('asks again after Details and Back, and follows Allow', async () => {
      render(<CloudProviderSharingGroup />);

      fireEvent(sharingSwitch(), 'valueChange', true);
      pressAlertButton(CLOUD_PROVIDER_CONSENT_DETAILS_LABEL);
      await flush();
      expect(alertSpy).toHaveBeenCalledTimes(1);

      act(() => {
        moveApp('background');
        moveApp('active');
      });
      await flush();
      expect(alertSpy).toHaveBeenCalledTimes(2);
      expect(sharingState().disabled).toBe(true);

      pressAlertButton(CLOUD_PROVIDER_CONSENT_ALLOW_LABEL);
      await flush();
      expect(sharingState().on).toBe(true);
      expect(sharingState().disabled).toBe(false);
      expect(listeners).toHaveLength(0);
    });

    it('stays off when the question shown on return is dismissed with Back', async () => {
      render(<CloudProviderSharingGroup />);

      fireEvent(sharingSwitch(), 'valueChange', true);
      pressAlertButton(CLOUD_PROVIDER_CONSENT_DETAILS_LABEL);
      await flush();
      act(() => {
        moveApp('background');
        moveApp('active');
      });
      await flush();

      alertSpy.mock.calls[1]![3]?.onDismiss?.();
      await flush();
      expect(hasCurrentCloudProviderConsent()).toBe(false);
      expect(sharingState().on).toBe(false);
      expect(sharingState().disabled).toBe(false);
    });
  });
});

describe('where the switch is on the Privacy page', () => {
  it.each([
    ['Cloud Mode, signed in', 'cloud', true],
    ['Cloud Mode, signed out', 'cloud', false],
    ['Local Mode, signed in', 'local', true],
    ['Local Mode, signed out', 'local', false],
  ] as const)('is there in %s once sharing was allowed', (_state, mode, signedIn) => {
    recordCloudProviderConsent();
    setMode(mode);
    mockAuth.isClerkSignedIn = signedIn;
    render(<CloudPrivacyScreen />);

    expect(sharingState().on).toBe(true);
  });

  it('is there before the account check has finished', () => {
    recordCloudProviderConsent();
    setMode('local');
    mockAuth.isClerkLoaded = false;
    render(<CloudPrivacyScreen />);

    expect(sharingState().on).toBe(true);
  });

  it.each([
    ['signed in', true],
    ['signed out', false],
  ] as const)('is there, off, in Cloud Mode %s before anything was allowed', (_state, signedIn) => {
    setMode('cloud');
    mockAuth.isClerkSignedIn = signedIn;
    render(<CloudPrivacyScreen />);

    expect(sharingState().on).toBe(false);
  });

  it('stays out of Local Mode while nothing was ever allowed, since nothing is shared there', () => {
    setMode('local');
    render(<CloudPrivacyScreen />);

    expect(screen.queryByTestId(CLOUD_PROVIDER_SHARING_TEST_ID)).toBeNull();
  });

  it('stays on the page in Local Mode after it is turned off there, until the page is left', async () => {
    recordCloudProviderConsent();
    setMode('local');
    render(<CloudPrivacyScreen />);

    fireEvent(sharingSwitch(), 'valueChange', false);
    await flush();

    expect(hasCurrentCloudProviderConsent()).toBe(false);
    expect(sharingState().on).toBe(false);
  });

  it('is gone from Local Mode when the page is opened again, where Switch to AGI Cloud asks again', async () => {
    recordCloudProviderConsent();
    setMode('local');
    mockAuth.isClerkSignedIn = true;
    const page = render(<CloudPrivacyScreen />);
    fireEvent(sharingSwitch(), 'valueChange', false);
    await flush();
    page.unmount();

    render(<CloudPrivacyScreen />);

    expect(screen.queryByTestId(CLOUD_PROVIDER_SHARING_TEST_ID)).toBeNull();
    expect(screen.getByText('Switch to AGI Cloud')).toBeTruthy();
  });

  it('sits above the AGI Cloud controls', () => {
    recordCloudProviderConsent();
    setMode('cloud');
    mockAuth.isClerkSignedIn = true;
    render(<CloudPrivacyScreen />);

    const headers = screen.getAllByRole('header').map((node) => String(node.props.children));
    expect(headers).toContain('AI providers');
    const tree = JSON.stringify(screen.toJSON());
    expect(tree.indexOf(`"${CLOUD_PROVIDER_SHARING_TEST_ID}"`)).toBeGreaterThan(-1);
    expect(tree.indexOf(`"${CLOUD_PROVIDER_SHARING_TEST_ID}"`)).toBeLessThan(
      tree.indexOf('"training-groups"'),
    );
  });
});

describe('turning the switch off', () => {
  const WITHDRAWAL_CONTROL = { withdrawalControl: true };
  let uninstallDoor: () => void;

  beforeEach(() => {
    recordCloudProviderConsent();
    uninstallDoor = installCloudModeDoor();
    setMode('cloud');
  });

  afterEach(() => {
    uninstallDoor();
    jest.useRealTimers();
  });

  async function turnOff(): Promise<void> {
    render(<CloudProviderSharingGroup />);
    fireEvent(sharingSwitch(), 'valueChange', false);
    await flush();
  }

  function oneSentence(message: string): boolean {
    return (message.match(/[.!?](\s|$)/g) ?? []).length === 1 && /[.!?]$/.test(message);
  }

  let removeSpy: jest.SpyInstance | null = null;

  function markerWhenRemoved(): { readonly value: string | undefined } {
    const seen: { value: string | undefined } = { value: undefined };
    const remove = mockStorage.delete.bind(mockStorage);
    removeSpy = jest.spyOn(mockStorage, 'delete').mockImplementation((key: string) => {
      if (key === CLOUD_PROVIDER_CONSENT_WITHDRAWAL_KEY) seen.value = mockStorage.get(key);
      return remove(key);
    });
    return seen;
  }

  afterEach(() => {
    removeSpy?.mockRestore();
    removeSpy = null;
  });

  it('pauses active schedules and running tasks through the withdrawal controls once Cloud is closed, and says so', async () => {
    const seen: Array<[string, boolean, boolean]> = [];
    const look = (label: string) =>
      seen.push([
        label,
        hasCurrentCloudProviderConsent(),
        mockStorage.has(CLOUD_PROVIDER_CONSENT_KEY),
      ]);
    mockFetchSchedulePage.mockResolvedValue([
      { id: 'brief', isActive: true },
      { id: 'paused', isActive: false },
    ]);
    mockToggleSchedule.mockImplementation(async (id: string) => look(`pause schedule ${id}`));
    mockListCloudRuns
      .mockResolvedValueOnce({ runs: [{ id: 'run-1' }], nextCursor: 'next' })
      .mockResolvedValueOnce({ runs: [{ id: 'run-2' }], nextCursor: null });
    mockPauseCloudRun.mockImplementation(async (id: string) => look(`pause task ${id}`));

    await turnOff();

    expect(mockFetchSchedulePage).toHaveBeenCalledWith(0, WITHDRAWAL_CONTROL);
    expect(mockToggleSchedule.mock.calls).toEqual([['brief', false, WITHDRAWAL_CONTROL]]);
    expect(mockListCloudRuns).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cursor: 'next',
        states: expect.arrayContaining(['running']),
        ...WITHDRAWAL_CONTROL,
      }),
    );
    expect(mockPauseCloudRun.mock.calls).toEqual([
      ['run-1', undefined, WITHDRAWAL_CONTROL],
      ['run-2', undefined, WITHDRAWAL_CONTROL],
    ]);
    expect(seen).toEqual([
      ['pause schedule brief', false, true],
      ['pause task run-1', false, true],
      ['pause task run-2', false, true],
    ]);
    expect(hasCurrentCloudProviderConsent()).toBe(false);
    expect(mockShowToast).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith(standingCloudWorkPausedMessage(1, 2));
    expect(standingCloudWorkPausedMessage(1, 2)).toBe('Paused 1 schedule and 2 running tasks.');
  });

  it('pauses schedules past the first page', async () => {
    const fullPage = Array.from({ length: MANAGED_CLOUD_SCHEDULES_MAX_PAGE_SIZE }, (_, index) => ({
      id: `schedule-${index}`,
      isActive: index === 0,
    }));
    mockFetchSchedulePage
      .mockResolvedValueOnce(fullPage)
      .mockResolvedValueOnce([{ id: 'oldest', isActive: true }]);

    await turnOff();

    expect(mockFetchSchedulePage.mock.calls).toEqual([
      [0, WITHDRAWAL_CONTROL],
      [MANAGED_CLOUD_SCHEDULES_MAX_PAGE_SIZE, WITHDRAWAL_CONTROL],
    ]);
    expect(mockToggleSchedule.mock.calls).toEqual([
      ['schedule-0', false, WITHDRAWAL_CONTROL],
      ['oldest', false, WITHDRAWAL_CONTROL],
    ]);
    expect(mockShowToast).toHaveBeenCalledWith(standingCloudWorkPausedMessage(2, 0));
  });

  it('counts a task that stopped working before the pause as nothing left to stop', async () => {
    mockListCloudRuns.mockResolvedValue({
      runs: [{ id: 'run-1' }],
      nextCursor: null,
    });
    mockPauseCloudRun.mockRejectedValue(
      new ManagedCloudAgentRunHttpError('Only a task that is still working can be paused.', 409),
    );

    await turnOff();

    expect(hasCurrentCloudProviderConsent()).toBe(false);
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('records the withdrawal before pausing anything, so a closed app finishes it at the next start', async () => {
    const recordedWhilePausing: boolean[] = [];
    mockFetchSchedulePage.mockResolvedValue([{ id: 'brief', isActive: true }]);
    mockToggleSchedule.mockImplementation(async () => {
      recordedWhilePausing.push(
        mockStorage.has(CLOUD_PROVIDER_CONSENT_WITHDRAWAL_KEY) &&
          mockStorage.has(CLOUD_PROVIDER_CONSENT_KEY),
      );
    });

    await turnOff();

    expect(recordedWhilePausing).toEqual([true]);
    expect(mockStorage.has(CLOUD_PROVIDER_CONSENT_WITHDRAWAL_KEY)).toBe(false);
    expect(mockStorage.has(CLOUD_PROVIDER_CONSENT_KEY)).toBe(false);
  });

  it('marks the pauses as finished before it ends, so a later launch does not warn about them', async () => {
    const marker = markerWhenRemoved();
    mockFetchSchedulePage.mockResolvedValue([{ id: 'brief', isActive: true }]);

    await turnOff();

    expect(JSON.parse(marker.value ?? '{}')).toEqual(
      expect.objectContaining({ standingWorkPaused: true }),
    );
  });

  it('leaves the pauses marked unfinished when they did not finish', async () => {
    const marker = markerWhenRemoved();
    mockFetchSchedulePage.mockResolvedValue([{ id: 'brief', isActive: true }]);
    mockToggleSchedule.mockRejectedValue(new Error('offline'));

    await turnOff();

    expect(JSON.parse(marker.value ?? '{}')).toEqual(
      expect.objectContaining({ standingWorkPaused: false }),
    );
  });

  it('pauses from Local Mode too, and says what was paused', async () => {
    setMode('local');
    mockFetchSchedulePage.mockResolvedValue([{ id: 'brief', isActive: true }]);
    mockListCloudRuns.mockResolvedValue({
      runs: [{ id: 'run-1' }],
      nextCursor: null,
    });

    await turnOff();

    expect(mockToggleSchedule).toHaveBeenCalledWith('brief', false, WITHDRAWAL_CONTROL);
    expect(mockPauseCloudRun).toHaveBeenCalledWith('run-1', undefined, WITHDRAWAL_CONTROL);
    expect(hasCurrentCloudProviderConsent()).toBe(false);
    expect(mockShowToast).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith(standingCloudWorkPausedMessage(1, 1));
  });

  it('sends nothing to AGI Cloud and says nothing when this account never allowed sharing', async () => {
    mockStorage.delete(CLOUD_PROVIDER_CONSENT_KEY);
    setMode('local');
    expect(hasCloudProviderConsentForCurrentAccount()).toBe(false);

    await act(async () => {
      await withdrawSharingWithProviders();
    });

    expect(mockFetchSchedulePage).not.toHaveBeenCalled();
    expect(mockListCloudRuns).not.toHaveBeenCalled();
    expect(mockShowToast).not.toHaveBeenCalled();
    expect(mockStorage.has(CLOUD_PROVIDER_CONSENT_WITHDRAWAL_KEY)).toBe(false);
  });

  it('returns the app to Local Mode and keeps it there', async () => {
    expect(useChatAppModeStore.getState().appMode).toBe('cloud');

    await turnOff();

    expect(useChatAppModeStore.getState().appMode).toBe('local');
    act(() => useChatAppModeStore.getState().setAppMode('cloud'));
    expect(useChatAppModeStore.getState().appMode).toBe('local');
    act(() => useChatAppModeStore.setState({ appMode: 'cloud' }));
    expect(useChatAppModeStore.getState().appMode).toBe('local');
  });

  it('removes the Ask from Siri token, ends live voice and stops every answer before any request', async () => {
    const order: string[] = [];
    mockSiriEnabled.mockReturnValue(true);
    mockForgetSiri.mockImplementation(async () => {
      order.push('forget the Siri token');
      mockSiriEnabled.mockReturnValue(false);
    });
    mockRevokeSiri.mockImplementation(async () => {
      order.push('revoke the Siri token');
    });
    mockEndLiveVoice.mockImplementation(() => order.push('end live voice'));
    mockStopEveryCloudStream.mockImplementation(() => {
      order.push('stop every answer');
      return [];
    });
    mockFetchSchedulePage.mockImplementation(async () => {
      order.push('list schedules');
      return [];
    });
    mockListCloudRuns.mockImplementation(async () => {
      order.push('list tasks');
      return { runs: [], nextCursor: null };
    });

    await turnOff();

    const at = (step: string) => order.indexOf(step);
    expect(order[0]).toBe('forget the Siri token');
    expect(at('end live voice')).toBeLessThan(at('list schedules'));
    expect(at('end live voice')).toBeLessThan(at('list tasks'));
    expect(at('stop every answer')).toBeLessThan(at('list schedules'));
    expect(at('stop every answer')).toBeLessThan(at('list tasks'));
    expect(at('revoke the Siri token')).toBeGreaterThan(0);
    expect(mockForgetSiri).toHaveBeenCalledTimes(2);
    expect(mockRevokeSiri).toHaveBeenCalledTimes(2);
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('still withdraws, and says so in one line, when a schedule could not be paused', async () => {
    mockFetchSchedulePage.mockResolvedValue([{ id: 'brief', isActive: true }]);
    mockToggleSchedule.mockRejectedValue(new Error('offline'));

    await turnOff();

    expect(hasCurrentCloudProviderConsent()).toBe(false);
    expect(useChatAppModeStore.getState().appMode).toBe('local');
    expect(mockShowToast).toHaveBeenCalledWith(STANDING_CLOUD_WORK_NOT_STOPPED);
    expect(oneSentence(STANDING_CLOUD_WORK_NOT_STOPPED)).toBe(true);
    expect(sharingState()).toEqual({ on: false, disabled: false });
  });

  it('closes Cloud at once and still withdraws when the running tasks never answer', async () => {
    jest.useFakeTimers();
    mockListCloudRuns.mockReturnValue(new Promise(() => undefined));

    render(<CloudProviderSharingGroup />);
    fireEvent(sharingSwitch(), 'valueChange', false);
    await flush();
    expect(hasCurrentCloudProviderConsent()).toBe(false);
    expect(mockStorage.has(CLOUD_PROVIDER_CONSENT_WITHDRAWAL_KEY)).toBe(true);

    act(() => {
      jest.advanceTimersByTime(TIMEOUTS.SIGN_OUT_CLEANUP);
    });
    await flush();

    expect(mockStorage.has(CLOUD_PROVIDER_CONSENT_WITHDRAWAL_KEY)).toBe(false);
    expect(mockStorage.has(CLOUD_PROVIDER_CONSENT_KEY)).toBe(false);
    expect(mockShowToast).toHaveBeenCalledWith(STANDING_CLOUD_WORK_NOT_STOPPED);
  });

  it('finishes when the Ask from Siri revoke never answers, since the token is already gone from the phone', async () => {
    jest.useFakeTimers();
    mockSiriEnabled.mockReturnValue(true);
    mockRevokeSiri.mockReturnValue(new Promise(() => undefined));

    render(<CloudProviderSharingGroup />);
    fireEvent(sharingSwitch(), 'valueChange', false);
    await flush();
    act(() => {
      jest.advanceTimersByTime(TIMEOUTS.SIGN_OUT_CLEANUP);
    });
    await flush();

    expect(hasCurrentCloudProviderConsent()).toBe(false);
    expect(mockForgetSiri).toHaveBeenCalledTimes(1);
    expect(mockShowToast).not.toHaveBeenCalled();
    expect(sharingState()).toEqual({ on: false, disabled: false });
  });

  it('says both, in one sentence, when neither the tasks nor Ask from Siri could be turned off', async () => {
    mockFetchSchedulePage.mockResolvedValue([{ id: 'brief', isActive: true }]);
    mockToggleSchedule.mockRejectedValue(new Error('offline'));
    mockSiriEnabled.mockReturnValue(true);
    mockForgetSiri.mockRejectedValue(new Error('keychain locked'));

    await turnOff();

    expect(hasCurrentCloudProviderConsent()).toBe(false);
    expect(mockShowToast).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith(STANDING_CLOUD_WORK_AND_ASK_FROM_SIRI_NOT_STOPPED);
    expect(oneSentence(STANDING_CLOUD_WORK_AND_ASK_FROM_SIRI_NOT_STOPPED)).toBe(true);
  });

  it('says Ask from Siri is still on when its token could not be removed from the phone', async () => {
    mockSiriEnabled.mockReturnValue(true);
    mockForgetSiri.mockRejectedValue(new Error('keychain locked'));

    await turnOff();

    expect(hasCurrentCloudProviderConsent()).toBe(false);
    expect(mockShowToast).toHaveBeenCalledWith(ASK_FROM_SIRI_STILL_ON);
    expect(oneSentence(ASK_FROM_SIRI_STILL_ON)).toBe(true);
  });

  it('says what was paused and that Ask from Siri is still on, in one sentence', async () => {
    mockFetchSchedulePage.mockResolvedValue([{ id: 'brief', isActive: true }]);
    mockSiriEnabled.mockReturnValue(true);
    mockForgetSiri.mockRejectedValue(new Error('keychain locked'));

    await turnOff();

    expect(mockShowToast).toHaveBeenCalledTimes(1);
    const [message] = mockShowToast.mock.calls[0] as [string];
    expect(message.startsWith('Paused 1 schedule, but ')).toBe(true);
    expect(message.endsWith(ASK_FROM_SIRI_STILL_ON)).toBe(true);
    expect(oneSentence(message)).toBe(true);
  });

  it("removes only this device's permission for a wipe: no task of the account is touched and nothing is said", async () => {
    mockFetchSchedulePage.mockResolvedValue([{ id: 'brief', isActive: true }]);
    mockListCloudRuns.mockResolvedValue({ runs: [{ id: 'run-1' }], nextCursor: null });
    mockSiriEnabled.mockReturnValue(true);

    await act(async () => {
      await withdrawSharingWithProviders('this-device');
    });

    expect(mockFetchSchedulePage).not.toHaveBeenCalled();
    expect(mockListCloudRuns).not.toHaveBeenCalled();
    expect(mockToggleSchedule).not.toHaveBeenCalled();
    expect(mockPauseCloudRun).not.toHaveBeenCalled();
    expect(mockForgetSiri).toHaveBeenCalledTimes(1);
    expect(mockStopEveryCloudStream).toHaveBeenCalledTimes(1);
    expect(mockEndLiveVoice).toHaveBeenCalledTimes(1);
    expect(hasCurrentCloudProviderConsent()).toBe(false);
    expect(mockStorage.has(CLOUD_PROVIDER_CONSENT_KEY)).toBe(false);
    expect(useChatAppModeStore.getState().appMode).toBe('local');
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('ends live voice and stops every answer without waiting for the Ask from Siri token to be removed', async () => {
    jest.useFakeTimers();
    mockSiriEnabled.mockReturnValue(true);
    mockForgetSiri.mockReturnValue(new Promise(() => undefined));
    mockEndLiveVoice.mockClear();

    render(<CloudProviderSharingGroup />);
    fireEvent(sharingSwitch(), 'valueChange', false);
    await flush();

    expect(mockEndLiveVoice).toHaveBeenCalledTimes(1);
    expect(mockStopEveryCloudStream).toHaveBeenCalledTimes(1);
    expect(mockStorage.has(CLOUD_PROVIDER_CONSENT_WITHDRAWAL_KEY)).toBe(true);
  });

  it('pauses the runs this device was driving for a wipe, through the withdrawal controls, and lists nothing', async () => {
    mockStopEveryCloudStream.mockReturnValue(['run-1', 'run-2']);

    await act(async () => {
      await withdrawSharingWithProviders('this-device');
    });

    expect(mockPauseCloudRun).toHaveBeenCalledTimes(2);
    expect(mockPauseCloudRun).toHaveBeenCalledWith('run-1', undefined, WITHDRAWAL_CONTROL);
    expect(mockPauseCloudRun).toHaveBeenCalledWith('run-2', undefined, WITHDRAWAL_CONTROL);
    expect(mockListCloudRuns).not.toHaveBeenCalled();
    expect(mockFetchSchedulePage).not.toHaveBeenCalled();
    expect(mockToggleSchedule).not.toHaveBeenCalled();
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('pauses those runs before the permission record is removed', async () => {
    mockStopEveryCloudStream.mockReturnValue(['run-1']);
    const seen: boolean[] = [];
    mockPauseCloudRun.mockImplementation(async () => {
      seen.push(mockStorage.has(CLOUD_PROVIDER_CONSENT_WITHDRAWAL_KEY));
    });

    await act(async () => {
      await withdrawSharingWithProviders('this-device');
    });

    expect(seen).toEqual([true]);
  });

  it('still finishes a wipe when a run this device was driving could not be paused', async () => {
    mockStopEveryCloudStream.mockReturnValue(['run-1']);
    mockPauseCloudRun.mockRejectedValue(new Error('offline'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await act(async () => {
      await withdrawSharingWithProviders('this-device');
    });
    warn.mockRestore();

    expect(hasCurrentCloudProviderConsent()).toBe(false);
    expect(mockStorage.has(CLOUD_PROVIDER_CONSENT_KEY)).toBe(false);
    expect(mockStorage.has(CLOUD_PROVIDER_CONSENT_WITHDRAWAL_KEY)).toBe(false);
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('leaves the runs to the account-wide list when the switch is turned off', async () => {
    mockStopEveryCloudStream.mockReturnValue(['run-1']);

    await turnOff();

    expect(mockListCloudRuns).toHaveBeenCalled();
    expect(mockPauseCloudRun).not.toHaveBeenCalled();
  });

  it('finishes the withdrawal when removing the Ask from Siri token never settles, and says Siri is still on', async () => {
    jest.useFakeTimers();
    mockSiriEnabled.mockReturnValue(true);
    mockForgetSiri.mockReturnValue(new Promise(() => undefined));

    render(<CloudProviderSharingGroup />);
    fireEvent(sharingSwitch(), 'valueChange', false);
    await flush();
    expect(mockStopEveryCloudStream).toHaveBeenCalledTimes(1);
    expect(mockEndLiveVoice).toHaveBeenCalledTimes(1);
    for (let window = 0; window < 2; window += 1) {
      act(() => {
        jest.advanceTimersByTime(TIMEOUTS.SIGN_OUT_CLEANUP);
      });
      await flush();
    }

    expect(mockStopEveryCloudStream).toHaveBeenCalledTimes(1);
    expect(mockEndLiveVoice).toHaveBeenCalledTimes(1);
    expect(mockStorage.has(CLOUD_PROVIDER_CONSENT_KEY)).toBe(false);
    expect(mockStorage.has(CLOUD_PROVIDER_CONSENT_WITHDRAWAL_KEY)).toBe(false);
    expect(useChatAppModeStore.getState().appMode).toBe('local');
    expect(mockShowToast).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith(ASK_FROM_SIRI_STILL_ON);
    expect(sharingState()).toEqual({ on: false, disabled: false });
  });

  it('frees the switch and says so in one line when the phone could not record the withdrawal', async () => {
    const write = mockStorage.set.bind(mockStorage);
    const remove = mockStorage.delete.bind(mockStorage);
    const setSpy = jest
      .spyOn(mockStorage, 'set')
      .mockImplementation((key: string, value: string) => {
        if (key === CLOUD_PROVIDER_CONSENT_WITHDRAWAL_KEY) throw new Error('storage full');
        return write(key, value);
      });
    const deleteSpy = jest.spyOn(mockStorage, 'delete').mockImplementation((key: string) => {
      if (key === CLOUD_PROVIDER_CONSENT_KEY) throw new Error('storage full');
      return remove(key);
    });
    try {
      await turnOff();

      expect(hasCurrentCloudProviderConsent()).toBe(true);
      expect(mockShowToast).toHaveBeenCalledTimes(1);
      expect(mockShowToast).toHaveBeenCalledWith(SHARING_NOT_TURNED_OFF);
      expect(oneSentence(SHARING_NOT_TURNED_OFF)).toBe(true);
      expect(sharingState()).toEqual({ on: true, disabled: false });
    } finally {
      setSpy.mockRestore();
      deleteSpy.mockRestore();
    }
  });

  it('asks the question when turned on again and leaves the mode alone', async () => {
    await turnOff();
    alertSpy.mockReset();

    fireEvent(sharingSwitch(), 'valueChange', true);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    pressAlertButton(CLOUD_PROVIDER_CONSENT_ALLOW_LABEL);
    await flush();

    expect(hasCurrentCloudProviderConsent()).toBe(true);
    expect(useChatAppModeStore.getState().appMode).toBe('local');
  });
});
