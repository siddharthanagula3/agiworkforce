import React from 'react';
import { Alert, type AlertButton } from 'react-native';
import { act, render, renderHook } from '@testing-library/react-native';

type ModelFixtures = typeof import('../test-utils/modelFixtures');

const mockStored = new Map<string, string>();
const mockHeldUntilMmkvReady: Array<() => void> = [];
const mockMmkv = { ready: true };
jest.mock('@/lib/mmkv', () => ({
  storage: {
    getString: (key: string) => mockStored.get(key),
    set: (key: string, value: string) => mockStored.set(key, value),
    delete: (key: string) => mockStored.delete(key),
  },
  mmkvStorage: {
    getItem: (key: string) => mockStored.get(key) ?? null,
    setItem: (key: string, value: string) => mockStored.set(key, value),
    removeItem: (key: string) => mockStored.delete(key),
  },
  rehydrateWhenMmkvReady: () => undefined,
  whenMmkvReady: (callback: () => void) => {
    if (mockMmkv.ready) callback();
    else mockHeldUntilMmkvReady.push(callback);
  },
}));
jest.mock('@/lib/safeOpenURL', () => ({
  openInAppBrowser: jest.fn().mockResolvedValue(true),
  openExternalUrl: jest.fn().mockResolvedValue(true),
  isAllowedExternalUrl: () => true,
}));
jest.mock('@/src/features/auth/store', () => {
  const { create } = jest.requireActual<typeof import('zustand')>('zustand');
  return {
    useAuthStore: create(() => ({
      isClerkSignedIn: false as boolean,
      clerkUserId: null as string | null,
    })),
  };
});
const mockSiriEnabled = jest.fn(() => false);
const mockForgetSiri = jest.fn().mockResolvedValue(undefined);
const mockRevokeSiri = jest.fn().mockResolvedValue(undefined);
jest.mock('@/src/features/siri/askIntentToken', () => ({
  isAskFromSiriEnabled: () => mockSiriEnabled(),
  forgetAskFromSiriOnDevice: () => mockForgetSiri(),
  revokeForgottenAskFromSiri: () => mockRevokeSiri(),
}));
jest.mock('@/src/shared/components/Toast', () => ({
  ...jest.requireActual('@/src/shared/components/Toast'),
  showToast: jest.fn(),
}));
jest.mock('@/src/features/model-picker/service', () => {
  const { SYNTHETIC_CLOUD_MODEL_ID } = jest.requireActual<
    typeof import('../test-utils/modelFixtures')
  >('../test-utils/modelFixtures');
  return {
    DEFAULT_CLOUD_MODEL_ID: SYNTHETIC_CLOUD_MODEL_ID,
    getDefaultCloudModelIdForTier: () => SYNTHETIC_CLOUD_MODEL_ID,
    isAutoMode: () => false,
    isCloudManagedModelId: (modelId: string) => modelId === SYNTHETIC_CLOUD_MODEL_ID,
  };
});
jest.mock('@/src/features/model-picker/store', () => {
  const fixtures = jest.requireActual<ModelFixtures>('../test-utils/modelFixtures');
  const { useChatAppModeStore } = jest.requireActual<
    typeof import('../src/features/chat/store/appModeStore')
  >('../src/features/chat/store/appModeStore');
  const state = {
    selectedModel: fixtures.SYNTHETIC_LOCAL_MODEL_ID,
    restoreNewChatModel: () => {
      state.selectedModel =
        useChatAppModeStore.getState().appMode === 'cloud'
          ? fixtures.SYNTHETIC_CLOUD_MODEL_ID
          : fixtures.SYNTHETIC_LOCAL_MODEL_ID;
    },
    setModel: () => undefined,
  };
  return {
    useModelStore: Object.assign((selector: (s: typeof state) => unknown) => selector(state), {
      getState: () => state,
    }),
  };
});
jest.mock('@/src/features/model-picker/installStore', () => ({
  readyLocalModelIdOr: (modelId: string) => modelId,
}));
jest.mock('@/stores/chatStore', () => {
  const state = { setWorkMode: () => undefined };
  return { useChatStore: (selector: (s: typeof state) => unknown) => selector(state) };
});
jest.mock('@/src/features/waitlist/store', () => {
  const state = { cloudUnlocked: true };
  return { useWaitlistStore: (selector: (s: typeof state) => unknown) => selector(state) };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/src/features/auth/services/accountAddition', () => ({
  isCloudAccountAdditionOpenFor: () => false,
}));

import {
  CLOUD_PROVIDER_CONSENT_ALLOW_LABEL,
  CLOUD_PROVIDER_CONSENT_DECLINE_LABEL,
  CLOUD_PROVIDER_CONSENT_KEY,
  CLOUD_PROVIDER_CONSENT_WITHDRAWAL_KEY,
  beginCloudProviderConsentWithdrawal,
  ensureCloudProviderConsent,
  hasCurrentCloudProviderConsent,
  recordCloudProviderConsent,
  withdrawCloudProviderConsent,
} from '@/services/providerConsent';
import { applyPostAuthIntentAfterSignIn } from '@/src/features/auth/actions/postAuthIntent';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
  invalidateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import { useAuthStore } from '@/src/features/auth/store';
import { useAppModeSwitch } from '@/src/features/chat/hooks/useAppModeSwitch';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  __resetCloudModeFallbackForTests,
  answerCloudSession,
  fallBackToLocalMode,
} from '@/src/features/chat/store/cloudModeFallback';
import {
  STANDING_CLOUD_WORK_MAY_STILL_RUN,
  enterCloudMode,
  installCloudModeDoor,
} from '@/src/features/chat/store/cloudModeDoor';
import { showToast } from '@/src/shared/components/Toast';

const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
const mockShowToast = showToast as jest.Mock;
const appMode = () => useChatAppModeStore.getState().appMode;

function signedIn(userId: string | null): void {
  useAuthStore.setState({ isClerkSignedIn: userId !== null, clerkUserId: userId });
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
}

async function answer(label: string): Promise<void> {
  const buttons = (alertSpy.mock.calls[alertSpy.mock.calls.length - 1]?.[2] ?? []) as AlertButton[];
  const button = buttons.find((candidate) => candidate.text === label);
  if (!button?.onPress) throw new Error(`No "${label}" button in the question`);
  button.onPress();
  await settle();
}

let uninstallDoor: (() => void) | null = null;
let stopWatching: () => void = () => undefined;
let cloudWithoutPermission: number;

beforeEach(async () => {
  uninstallDoor?.();
  uninstallDoor = null;
  mockStored.clear();
  mockMmkv.ready = true;
  mockHeldUntilMmkvReady.length = 0;
  __resetCloudAccountSessionForTests();
  await ensureCloudProviderConsent();
  alertSpy.mockClear();
  mockSiriEnabled.mockReset().mockReturnValue(false);
  mockForgetSiri.mockClear();
  mockRevokeSiri.mockClear();
  mockShowToast.mockClear();
  __resetCloudModeFallbackForTests();
  useChatAppModeStore.setState({ appMode: 'local' });
  activateCloudAccount('person-a');
  signedIn('person-a');
  uninstallDoor = installCloudModeDoor();
  mockForgetSiri.mockClear();
  cloudWithoutPermission = 0;
  watchForCloudWithoutPermission();
});

function watchForCloudWithoutPermission(): void {
  stopWatching = useChatAppModeStore.subscribe((state) => {
    if (state.appMode === 'cloud' && !hasCurrentCloudProviderConsent()) cloudWithoutPermission += 1;
  });
}

afterEach(() => {
  stopWatching();
  expect(cloudWithoutPermission).toBe(0);
});

afterAll(() => {
  uninstallDoor?.();
});

const writers: Array<[string, () => unknown]> = [
  ['the mode setter', () => useChatAppModeStore.getState().setAppMode('cloud')],
  ['a direct store write', () => useChatAppModeStore.setState({ appMode: 'cloud' })],
  ['a computed store write', () => useChatAppModeStore.setState(() => ({ appMode: 'cloud' }))],
  [
    'the mode saved on this phone, read back at launch',
    () => {
      mockStored.set(
        'chat-app-mode-store',
        JSON.stringify({ state: { appMode: 'cloud' }, version: 0 }),
      );
      return useChatAppModeStore.persist.rehydrate();
    },
  ],
  [
    'the return to Cloud after a late account answer',
    () => {
      fallBackToLocalMode();
      answerCloudSession('person-a');
    },
  ],
  [
    'finishing a sign-in that was for Cloud',
    () => applyPostAuthIntentAfterSignIn('cloud-chat', 'pro'),
  ],
  [
    'the Cloud switch',
    () => {
      const { result } = renderHook(() => useAppModeSwitch());
      act(() => {
        result.current.switchToCloud();
      });
    },
  ],
];

describe.each(writers)('entering Cloud Mode through %s', (_writer, write) => {
  it('enters at once when this account allowed sharing with AI providers', async () => {
    recordCloudProviderConsent();

    await write();
    await settle();

    expect(appMode()).toBe('cloud');
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('stays in Local without the permission, asks, and enters on Allow', async () => {
    await write();
    expect(appMode()).toBe('local');
    await settle();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(appMode()).toBe('local');

    await answer(CLOUD_PROVIDER_CONSENT_ALLOW_LABEL);

    expect(hasCurrentCloudProviderConsent()).toBe(true);
    expect(appMode()).toBe('cloud');
  });

  it('stays in Local on Not now and records nothing', async () => {
    await write();
    await settle();

    await answer(CLOUD_PROVIDER_CONSENT_DECLINE_LABEL);

    expect(appMode()).toBe('local');
    expect(mockStored.has(CLOUD_PROVIDER_CONSENT_KEY)).toBe(false);
  });
});

describe('the Cloud Mode door', () => {
  it('keeps the destination of a sign-in for Cloud while the question is open', async () => {
    expect(applyPostAuthIntentAfterSignIn('cloud-chat', 'pro')).toBe(true);
    expect(appMode()).toBe('local');
    await settle();
    expect(alertSpy).toHaveBeenCalledTimes(1);
  });

  it('asks only once the signed-in account is confirmed', async () => {
    signedIn(null);

    useChatAppModeStore.getState().setAppMode('cloud');
    await settle();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(appMode()).toBe('local');

    signedIn('person-a');
    await settle();
    expect(alertSpy).toHaveBeenCalledTimes(1);
  });

  it('does not ask when nobody is signed in to Cloud', async () => {
    invalidateCloudAccount();
    signedIn(null);

    useChatAppModeStore.getState().setAppMode('cloud');
    await settle();

    expect(appMode()).toBe('local');
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('drops a held entry when the person picks Local before answering', async () => {
    useChatAppModeStore.getState().setAppMode('cloud');
    await settle();
    useChatAppModeStore.getState().setAppMode('local');

    await answer(CLOUD_PROVIDER_CONSENT_ALLOW_LABEL);

    expect(appMode()).toBe('local');
  });

  it('leaves Cloud when another account signs in, and asks that account', async () => {
    recordCloudProviderConsent();
    useChatAppModeStore.getState().setAppMode('cloud');
    expect(appMode()).toBe('cloud');

    activateCloudAccount('person-b');
    expect(appMode()).toBe('local');
    await settle();
    expect(alertSpy).not.toHaveBeenCalled();

    signedIn('person-b');
    await settle();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    await answer(CLOUD_PROVIDER_CONSENT_ALLOW_LABEL);

    expect(appMode()).toBe('cloud');
  });

  it('leaves Cloud and asks nothing when the account signs out', async () => {
    recordCloudProviderConsent();
    useChatAppModeStore.getState().setAppMode('cloud');

    invalidateCloudAccount();
    signedIn(null);
    await settle();

    expect(appMode()).toBe('local');
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('leaves Cloud when the permission is withdrawn, and stays in Local', async () => {
    recordCloudProviderConsent();
    useChatAppModeStore.getState().setAppMode('cloud');

    withdrawCloudProviderConsent();
    expect(appMode()).toBe('local');

    useChatAppModeStore.setState({ appMode: 'cloud' });
    expect(appMode()).toBe('local');
  });

  it('moves a Cloud start already read back before the door was in place to Local, and asks', async () => {
    uninstallDoor?.();
    stopWatching();
    useChatAppModeStore.setState({ appMode: 'cloud' });

    uninstallDoor = installCloudModeDoor();
    watchForCloudWithoutPermission();

    expect(appMode()).toBe('local');
    await settle();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    await answer(CLOUD_PROVIDER_CONSENT_ALLOW_LABEL);
    expect(appMode()).toBe('cloud');
  });

  it('turns off Ask from Siri at start when this account has not allowed sharing', () => {
    uninstallDoor?.();
    mockSiriEnabled.mockReturnValue(true);

    uninstallDoor = installCloudModeDoor();

    expect(mockForgetSiri).toHaveBeenCalledTimes(1);
  });

  it('removes the Ask from Siri token at start even when Ask from Siri is marked off', () => {
    uninstallDoor?.();
    mockSiriEnabled.mockReturnValue(false);

    uninstallDoor = installCloudModeDoor();

    expect(mockForgetSiri).toHaveBeenCalledTimes(1);
  });

  it('removes the Ask from Siri token when the permission is withdrawn, even when Ask from Siri is marked off', () => {
    recordCloudProviderConsent();
    mockSiriEnabled.mockReturnValue(false);

    withdrawCloudProviderConsent();

    expect(mockForgetSiri).toHaveBeenCalledTimes(1);
  });

  it('leaves Ask from Siri on at start when this account allowed sharing', () => {
    uninstallDoor?.();
    recordCloudProviderConsent();
    mockSiriEnabled.mockReturnValue(true);

    uninstallDoor = installCloudModeDoor();

    expect(mockForgetSiri).not.toHaveBeenCalled();
  });

  it('finishes at start a withdrawal the app did not live to finish, and asks nothing', async () => {
    uninstallDoor?.();
    stopWatching();
    recordCloudProviderConsent();
    mockStored.set(CLOUD_PROVIDER_CONSENT_WITHDRAWAL_KEY, 'an-earlier-launch');
    mockStored.set(
      'chat-app-mode-store',
      JSON.stringify({ state: { appMode: 'cloud' }, version: 0 }),
    );
    mockSiriEnabled.mockReturnValue(true);
    mockMmkv.ready = false;
    uninstallDoor = installCloudModeDoor();
    watchForCloudWithoutPermission();

    act(() => {
      mockMmkv.ready = true;
      void useChatAppModeStore.persist.rehydrate();
      for (const callback of mockHeldUntilMmkvReady.splice(0)) callback();
    });
    await settle();

    expect(mockStored.has(CLOUD_PROVIDER_CONSENT_KEY)).toBe(false);
    expect(mockStored.has(CLOUD_PROVIDER_CONSENT_WITHDRAWAL_KEY)).toBe(false);
    expect(appMode()).toBe('local');
    expect(JSON.parse(mockStored.get('chat-app-mode-store') ?? '{}').state.appMode).toBe('local');
    expect(mockForgetSiri).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith(STANDING_CLOUD_WORK_MAY_STILL_RUN);
  });

  it('says nothing about tasks after an interrupted withdrawal whose pauses had finished', async () => {
    uninstallDoor?.();
    recordCloudProviderConsent();
    mockStored.set(
      CLOUD_PROVIDER_CONSENT_WITHDRAWAL_KEY,
      JSON.stringify({ launch: 'an-earlier-launch', standingWorkPaused: true }),
    );

    uninstallDoor = installCloudModeDoor();
    await settle();

    expect(mockStored.has(CLOUD_PROVIDER_CONSENT_KEY)).toBe(false);
    expect(mockStored.has(CLOUD_PROVIDER_CONSENT_WITHDRAWAL_KEY)).toBe(false);
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('asks nothing at the launch that finishes a withdrawal, even when the account is confirmed first', async () => {
    uninstallDoor?.();
    stopWatching();
    recordCloudProviderConsent();
    mockStored.set(CLOUD_PROVIDER_CONSENT_WITHDRAWAL_KEY, 'an-earlier-launch');
    mockStored.set(
      'chat-app-mode-store',
      JSON.stringify({ state: { appMode: 'cloud' }, version: 0 }),
    );
    useChatAppModeStore.setState({ appMode: 'cloud' });
    mockMmkv.ready = false;
    uninstallDoor = installCloudModeDoor();
    watchForCloudWithoutPermission();
    await settle();
    expect(alertSpy).not.toHaveBeenCalled();

    await act(async () => {
      mockMmkv.ready = true;
      void useChatAppModeStore.persist.rehydrate();
      await Promise.resolve();
      signedIn('person-a');
      await Promise.resolve();
      for (const callback of mockHeldUntilMmkvReady.splice(0)) callback();
    });
    await settle();

    expect(appMode()).toBe('local');
    expect(alertSpy).not.toHaveBeenCalled();
    useChatAppModeStore.getState().setAppMode('cloud');
    await settle();
    expect(alertSpy).toHaveBeenCalledTimes(1);
  });

  it('drops to Local the moment a withdrawal begins and holds any entry until it ends', async () => {
    recordCloudProviderConsent();
    useChatAppModeStore.getState().setAppMode('cloud');
    expect(appMode()).toBe('cloud');

    beginCloudProviderConsentWithdrawal();
    expect(appMode()).toBe('local');
    useChatAppModeStore.getState().setAppMode('cloud');
    await settle();
    expect(appMode()).toBe('local');
    expect(alertSpy).not.toHaveBeenCalled();

    withdrawCloudProviderConsent();
    signedIn('person-a');
    await settle();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(appMode()).toBe('local');
  });

  it('drops an entry still waiting for the account when a withdrawal begins', async () => {
    signedIn(null);
    useChatAppModeStore.getState().setAppMode('cloud');
    await settle();
    expect(alertSpy).not.toHaveBeenCalled();

    beginCloudProviderConsentWithdrawal();
    withdrawCloudProviderConsent();
    signedIn('person-a');
    await settle();

    expect(alertSpy).not.toHaveBeenCalled();
    expect(appMode()).toBe('local');
  });

  it('tells the Cloud switch whether the app really entered Cloud', async () => {
    const { result } = renderHook(() => useAppModeSwitch());
    let entered: boolean | undefined;
    act(() => {
      entered = result.current.switchToCloud();
    });
    expect(entered).toBe(false);
    expect(appMode()).toBe('local');
    await settle();
    await answer(CLOUD_PROVIDER_CONSENT_DECLINE_LABEL);

    recordCloudProviderConsent();
    act(() => {
      entered = result.current.switchToCloud();
    });
    expect(entered).toBe(true);
    expect(appMode()).toBe('cloud');
  });

  it('keeps Local Mode for the next launch once the person says Not now to a saved Cloud Mode', async () => {
    mockStored.set(
      'chat-app-mode-store',
      JSON.stringify({ state: { appMode: 'cloud' }, version: 0 }),
    );
    await act(async () => {
      await useChatAppModeStore.persist.rehydrate();
    });
    await settle();
    expect(alertSpy).toHaveBeenCalledTimes(1);

    await answer(CLOUD_PROVIDER_CONSENT_DECLINE_LABEL);

    expect(JSON.parse(mockStored.get('chat-app-mode-store') ?? '{}').state.appMode).toBe('local');
    await act(async () => {
      await useChatAppModeStore.persist.rehydrate();
    });
    await settle();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(appMode()).toBe('local');
  });

  it('turns off Ask from Siri when another account signs in', () => {
    recordCloudProviderConsent();
    mockSiriEnabled.mockReturnValue(true);

    activateCloudAccount('person-b');

    expect(mockForgetSiri).toHaveBeenCalledTimes(1);
  });

  it('turns off Ask from Siri when the session ends under the person', () => {
    recordCloudProviderConsent();
    mockSiriEnabled.mockReturnValue(true);

    invalidateCloudAccount();

    expect(mockForgetSiri).toHaveBeenCalledTimes(1);
  });

  it('turns off Ask from Siri when the permission is withdrawn', () => {
    recordCloudProviderConsent();
    mockSiriEnabled.mockReturnValue(true);

    withdrawCloudProviderConsent();

    expect(mockForgetSiri).toHaveBeenCalledTimes(1);
  });

  it('turns Ask from Siri off again after a turn-off that was still running when the permission changed again', async () => {
    await settle();
    let finishFirstRemoval: () => void = () => undefined;
    mockForgetSiri.mockClear();
    mockRevokeSiri.mockClear();
    mockForgetSiri.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishFirstRemoval = resolve;
      }),
    );
    recordCloudProviderConsent();
    withdrawCloudProviderConsent();
    expect(mockForgetSiri).toHaveBeenCalledTimes(1);

    recordCloudProviderConsent();
    withdrawCloudProviderConsent();
    expect(mockForgetSiri).toHaveBeenCalledTimes(1);

    finishFirstRemoval();
    await settle();

    expect(mockForgetSiri).toHaveBeenCalledTimes(2);
    expect(mockRevokeSiri).toHaveBeenCalledTimes(2);
  });

  it('does not repeat the turn-off when the permission is current again after the first one ends', async () => {
    await settle();
    let finishFirstRemoval: () => void = () => undefined;
    mockForgetSiri.mockClear();
    mockRevokeSiri.mockClear();
    mockForgetSiri.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishFirstRemoval = resolve;
      }),
    );
    recordCloudProviderConsent();
    withdrawCloudProviderConsent();
    expect(mockForgetSiri).toHaveBeenCalledTimes(1);

    recordCloudProviderConsent();
    withdrawCloudProviderConsent();
    recordCloudProviderConsent();

    finishFirstRemoval();
    await settle();

    expect(mockForgetSiri).toHaveBeenCalledTimes(1);
  });

  it('does not repeat a turn-off that is still running when the permission stays withdrawn', async () => {
    await settle();
    let finishFirstRemoval: () => void = () => undefined;
    mockForgetSiri.mockClear();
    mockRevokeSiri.mockClear();
    mockForgetSiri.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishFirstRemoval = resolve;
      }),
    );
    recordCloudProviderConsent();
    withdrawCloudProviderConsent();
    invalidateCloudAccount();

    finishFirstRemoval();
    await settle();

    expect(mockForgetSiri).toHaveBeenCalledTimes(1);
    expect(mockRevokeSiri).toHaveBeenCalledTimes(1);
  });

  it('asks Ask from Siri to pay any owed revoke at account activation, asking nothing', async () => {
    invalidateCloudAccount();
    await settle();
    mockRevokeSiri.mockClear();

    activateCloudAccount('person-a');
    await settle();

    expect(mockRevokeSiri).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(appMode()).toBe('local');
  });

  it('sends no revoke at account activation for an account that allowed sharing', async () => {
    recordCloudProviderConsent();
    invalidateCloudAccount();
    await settle();
    mockRevokeSiri.mockClear();

    activateCloudAccount('person-a');
    await settle();

    expect(mockRevokeSiri).not.toHaveBeenCalled();
  });
});

describe('a screen that enters Cloud with a follow-up', () => {
  function followUpSeeingMode(): { run: jest.Mock; modes: string[] } {
    const modes: string[] = [];
    return { run: jest.fn(() => modes.push(appMode())), modes };
  }

  it('runs the follow-up at once when this account allowed sharing', () => {
    recordCloudProviderConsent();
    const followUp = followUpSeeingMode();

    expect(enterCloudMode(followUp.run)).toBe(true);

    expect(followUp.modes).toEqual(['cloud']);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('runs the follow-up only after Allow, in Cloud', async () => {
    const followUp = followUpSeeingMode();

    expect(enterCloudMode(followUp.run)).toBe(false);
    expect(appMode()).toBe('local');
    expect(followUp.run).not.toHaveBeenCalled();
    await settle();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    await answer(CLOUD_PROVIDER_CONSENT_ALLOW_LABEL);

    expect(followUp.modes).toEqual(['cloud']);
  });

  it('drops the follow-up on Not now', async () => {
    const followUp = followUpSeeingMode();

    enterCloudMode(followUp.run);
    await settle();
    await answer(CLOUD_PROVIDER_CONSENT_DECLINE_LABEL);

    expect(appMode()).toBe('local');
    expect(followUp.run).not.toHaveBeenCalled();
  });

  it('drops the follow-up when another way into Cloud asks after it', async () => {
    const followUp = followUpSeeingMode();

    enterCloudMode(followUp.run);
    useChatAppModeStore.getState().setAppMode('cloud');
    await settle();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    await answer(CLOUD_PROVIDER_CONSENT_ALLOW_LABEL);

    expect(appMode()).toBe('cloud');
    expect(followUp.run).not.toHaveBeenCalled();
  });

  it('drops the follow-up when the person goes back to Local before answering', async () => {
    const followUp = followUpSeeingMode();

    enterCloudMode(followUp.run);
    useChatAppModeStore.getState().setAppMode('local');
    await settle();

    expect(followUp.run).not.toHaveBeenCalled();
    expect(appMode()).toBe('local');
  });
});

describe('what a screen shows', () => {
  it('never renders Cloud Mode without the permission of the signed-in account', async () => {
    const renders: Array<{ mode: string; allowed: boolean }> = [];
    function ModeProbe() {
      const mode = useChatAppModeStore((state) => state.appMode);
      renders.push({ mode, allowed: hasCurrentCloudProviderConsent() });
      return null;
    }
    render(<ModeProbe />);

    for (const [name, write] of writers) {
      if (name === 'the Cloud switch') await write();
      else
        await act(async () => {
          await write();
        });
      await settle();
    }
    await answer(CLOUD_PROVIDER_CONSENT_ALLOW_LABEL);
    act(() => activateCloudAccount('person-b'));
    act(() => useChatAppModeStore.setState({ appMode: 'cloud' }));
    act(() => activateCloudAccount('person-a'));
    act(() => useChatAppModeStore.setState({ appMode: 'cloud' }));
    act(() => withdrawCloudProviderConsent());
    act(() => useChatAppModeStore.getState().setAppMode('cloud'));
    await settle();

    expect(renders.some((entry) => entry.mode === 'cloud')).toBe(true);
    expect(renders.filter((entry) => entry.mode === 'cloud' && !entry.allowed)).toEqual([]);
  });
});
