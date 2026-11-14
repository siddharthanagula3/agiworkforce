/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockSecureFetch = jest.fn();
const mockRegisterForPush = jest.fn();
const mockSetPushAccountContext = jest.fn();
const DEVICE_ID = '11111111-1111-4111-8111-111111111111';

interface FakeSession {
  id: string;
  status: string;
  user: {
    id: string;
    fullName: string | null;
    imageUrl: string;
    primaryEmailAddress: { emailAddress: string } | null;
  };
  publicUserData: { identifier: string; userId: string; firstName: null; lastName: null };
  getToken: () => Promise<string>;
}

function fakeSession(id: string, userId: string, name: string, email: string): FakeSession {
  return {
    id,
    status: 'active',
    user: {
      id: userId,
      fullName: name,
      imageUrl: '',
      primaryEmailAddress: { emailAddress: email },
    },
    publicUserData: { identifier: email, userId, firstName: null, lastName: null },
    getToken: async () => `token-for-${id}`,
  };
}

const mockClerk: {
  __internal_environment: { authConfig: { singleSessionMode: boolean } } | null;
  session: FakeSession | null;
  client: { signedInSessions: FakeSession[] };
  setActive: jest.Mock;
  signOut: jest.Mock;
  addListener: jest.Mock;
} = {
  __internal_environment: { authConfig: { singleSessionMode: false } },
  session: null,
  client: { signedInSessions: [] },
  setActive: jest.fn(),
  signOut: jest.fn(),
  addListener: jest.fn(() => () => undefined),
};

const mockClerkUser = {
  user: {
    id: 'user_a',
    imageUrl: null,
    fullName: 'First Person',
    firstName: 'First',
    username: null,
    primaryEmailAddress: { emailAddress: 'first@example.com' },
  } as Record<string, unknown> | null,
  isLoaded: true,
};

jest.mock('@clerk/expo', () => ({
  useUser: () => mockClerkUser,
  getClerkInstance: () => mockClerk,
}));

jest.mock('@/services/secureFetch', () => ({
  ...jest.requireActual('@/services/secureFetch'),
  secureFetch: (...args: unknown[]) => mockSecureFetch(...args),
}));

jest.mock('@/services/notifications', () => ({
  ...jest.requireActual('@/services/notifications'),
  registerForPushNotifications: (...args: unknown[]) => mockRegisterForPush(...args),
  setPushAccountContext: (...args: unknown[]) => mockSetPushAccountContext(...args),
}));

jest.mock('expo-secure-store', () => ({
  ...jest.requireActual('expo-secure-store'),
  getItemAsync: jest.fn(async (key: string) => (key === 'agi_device_id' ? DEVICE_ID : null)),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

jest.mock('@/lib/mmkv', () => {
  const values = new Map<string, string | boolean | number>();
  return {
    __values: values,
    whenMmkvReady: jest.fn((cb: () => void) => cb()),
    rehydrateWhenMmkvReady: jest.fn(),
    mmkvStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
    storage: {
      getString: (key: string) => {
        const value = values.get(key);
        return typeof value === 'string' ? value : undefined;
      },
      getBoolean: (key: string) => {
        const value = values.get(key);
        return typeof value === 'boolean' ? value : undefined;
      },
      set: (key: string, value: string | boolean | number) => values.set(key, value),
      delete: (key: string) => values.delete(key),
      contains: (key: string) => values.has(key),
      getAllKeys: () => [...values.keys()],
    },
  };
});

jest.mock('@/stores/connectionStore', () => ({
  useConnectionStore: (selector: (state: { status: string }) => unknown) =>
    selector({ status: 'disconnected' }),
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    navigate: jest.fn(),
    canGoBack: jest.fn(() => true),
    back: jest.fn(),
  }),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '2.1.0', ios: { buildNumber: '42' } } },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/services/cloudSyncEngine', () => ({
  startCloudSyncLoop: jest.fn(),
  stopCloudSyncLoop: jest.fn(),
  syncNow: jest.fn(async () => undefined),
}));

jest.mock('@/src/features/siri/askIntentToken', () => ({
  revokeAskIntentForSignOut: jest.fn(async () => undefined),
}));

import SettingsTabScreen from '@/app/(app)/settings/index';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useChatCloudMessageStore } from '@/stores/chat/chatCloudMessageStore';
import { api } from '@/services/api';
import type { PushNotificationAccountContext } from '@/services/notifications';
import { beginPushRegistration, postPushRegistration } from '@/services/pushPreferenceSync';
import { offlineQueue } from '@/services/offlineQueue';
import { getDraft, setDraft } from '@/src/features/chat/draftStore';
import { clearLocalCloudAccountState } from '@/src/features/auth/services/cloudAccountTeardown';
import {
  activateCloudAccount,
  captureCloudAccountEpoch,
  invalidateCloudAccount,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import {
  endCloudAccountAddition,
  isCloudAccountAdditionOpenFor,
} from '@/src/features/auth/services/accountAddition';
import { __resetPushTokenAccountLifecycleForTests } from '@/src/features/auth/services/pushTokenAccountLifecycle';
import { usePushTokenAccountRegistration } from '@/src/features/auth/hooks/usePushTokenAccountRegistration';
import {
  clearPostAuthIntent,
  peekPostAuthIntent,
} from '@/src/features/auth/services/postAuthIntent';
import { useAccountSwitchStore } from '@/src/features/accounts/useDeviceAccounts';

const mmkvValues = (require('@/lib/mmkv') as { __values: Map<string, unknown> }).__values;

const FIRST = fakeSession('sess_a', 'user_a', 'First Person', 'first@example.com');
const SECOND = fakeSession('sess_b', 'user_b', 'Second Person', 'second@example.com');
const FIRST_CLOUD = { scope: 'cloud', ownerId: 'user_a' } as const;
const NETWORK_FAILURE = Object.assign(new TypeError('Network request failed'), {
  code: 'network_error',
});

function sessionById(sessionId: string): FakeSession {
  return [FIRST, SECOND].find((session) => session.id === sessionId)!;
}

function bridgeAdoptsActiveSession() {
  const userId = mockClerk.session!.user.id;
  const owner = activateCloudAccount(userId);
  if (owner.changed) clearLocalCloudAccountState();
  useAuthStore.getState().setClerkUserId(userId);
  useAuthStore.getState().setClerkSignedIn(true);
  useWaitlistStore.getState().setCloudAccess(true);
}

function PushRegistration() {
  const isClerkSignedIn = useAuthStore((state) => state.isClerkSignedIn);
  const clerkUserId = useAuthStore((state) => state.clerkUserId);
  const isCloud = useChatAppModeStore((state) => state.appMode) === 'cloud';
  usePushTokenAccountRegistration({ isClerkSignedIn, clerkUserId, isCloud, isInitialized: true });
  return null;
}

function registeredPushOwners(): string[] {
  return mockRegisterForPush.mock.calls.map(
    ([context]) => (context as { ownerId: string }).ownerId,
  );
}

function releaseRequests() {
  return pushTokenRequests().filter(({ url }) => url.searchParams.get('release') === 'device');
}

function signInFirstAccount({ multiSession }: { multiSession: boolean }) {
  mockClerk.__internal_environment = { authConfig: { singleSessionMode: !multiSession } };
  mockClerk.client.signedInSessions = multiSession ? [FIRST, SECOND] : [FIRST];
  mockClerk.session = FIRST;
  activateCloudAccount('user_a');
  useChatAppModeStore.setState({ appMode: 'cloud' });
  useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: 'user_a' });
  useWaitlistStore.setState({ cloudUnlocked: true });
}

function leaveUnsentWorkOnFirstAccount() {
  offlineQueue.enqueue({
    conversationId: 'conv-first',
    content: 'queued while offline',
    model: 'auto',
    provenance: FIRST_CLOUD,
  });
  setDraft('conv-first', 'half-written reply', FIRST_CLOUD);
}

function queuedCloudSends() {
  return offlineQueue.getQueue().filter((entry) => entry.provenance.scope === 'cloud');
}

function storedCloudDrafts() {
  return [...mmkvValues.keys()].filter((key) => key.startsWith('composer-draft:v1:cloud:'));
}

function pushTokenRequests() {
  return mockSecureFetch.mock.calls
    .map(([url, init]) => ({ url: new URL(String(url)), init: init as RequestInit }))
    .filter(({ url }) => url.pathname === '/api/mobile/push-token');
}

function authorizationOf(init: RequestInit): string {
  return (init.headers as Record<string, string>).Authorization;
}

function holdRegistrationPostsUntilDelivered() {
  let deliver: () => void = () => undefined;
  const delivered = new Promise<void>((resolve) => {
    deliver = resolve;
  });
  const post = jest
    .spyOn(api, 'post')
    .mockImplementation(() => delivered.then(() => ({}) as never));
  const outcomes: boolean[] = [];
  mockRegisterForPush.mockImplementation(async (context: PushNotificationAccountContext) => {
    const registration = beginPushRegistration('expo-push-token', context);
    outcomes.push(await postPushRegistration(registration));
    return 'expo-push-token';
  });
  return { post, outcomes, deliver: () => deliver() };
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('accounts signed in on this phone', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    offlineQueue.clear();
    mmkvValues.clear();
    invalidateCloudAccount();
    clearPostAuthIntent();
    endCloudAccountAddition({ cancelled: false });
    __resetPushTokenAccountLifecycleForTests();
    mockRegisterForPush.mockResolvedValue('expo-push-token');
    useAccountSwitchStore.setState({ switchingTo: null });
    jest.spyOn(api, 'get').mockImplementation(() => new Promise(() => undefined));
    mockSecureFetch.mockResolvedValue({ ok: true, status: 200 });
    mockClerk.setActive.mockImplementation(async ({ session }: { session: string }) => {
      mockClerk.session = sessionById(session);
    });
    mockClerk.signOut.mockImplementation(async (options?: { sessionId?: string }) => {
      if (!options?.sessionId) {
        mockClerk.client.signedInSessions = [];
        mockClerk.session = null;
        return;
      }
      mockClerk.client.signedInSessions = mockClerk.client.signedInSessions.filter(
        (entry) => entry.id !== options.sessionId,
      );
      if (mockClerk.session?.id === options.sessionId) mockClerk.session = null;
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('lists every signed-in account with a check on the active one and an Add account row', () => {
    signInFirstAccount({ multiSession: true });

    const { getByTestId, getByLabelText } = render(<SettingsTabScreen />);

    const card = within(getByTestId('device-accounts-card'));
    expect(card.getByText('First Person')).toBeTruthy();
    expect(card.getByText('first@example.com')).toBeTruthy();
    expect(card.getByText('Second Person')).toBeTruthy();
    expect(card.getByText('second@example.com')).toBeTruthy();
    expect(card.getAllByTestId('device-account-active-sess_a').length).toBeGreaterThan(0);
    expect(card.queryAllByTestId('device-account-active-sess_b')).toHaveLength(0);
    expect(getByLabelText('Switch to second@example.com')).toBeTruthy();
    expect(card.getByText('Add account')).toBeTruthy();
  });

  it('shows nothing new on an instance that allows one session', () => {
    signInFirstAccount({ multiSession: false });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const { queryByTestId, queryByText, getByLabelText } = render(<SettingsTabScreen />);

    expect(queryByTestId('device-accounts-card')).toBeNull();
    expect(queryByText('Add account')).toBeNull();
    expect(getByLabelText('Log Out').props.accessibilityHint).toBe('Signs you out on this device');
    fireEvent.press(getByLabelText('Log Out'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Log Out',
      'Log out of AGI Cloud on this device?',
      expect.any(Array),
    );
  });

  it('shows no account list in Local mode', () => {
    signInFirstAccount({ multiSession: true });
    useChatAppModeStore.setState({ appMode: 'local' });

    const { queryByTestId } = render(<SettingsTabScreen />);

    expect(queryByTestId('device-accounts-card')).toBeNull();
  });

  it('switches with one tap and shows progress until the new account is adopted', async () => {
    signInFirstAccount({ multiSession: true });
    let finishSwitch: () => void = () => undefined;
    mockClerk.setActive.mockImplementation(
      ({ session }: { session: string }) =>
        new Promise<void>((resolve) => {
          finishSwitch = () => {
            mockClerk.session = sessionById(session);
            resolve();
          };
        }),
    );

    const { getByLabelText, getByTestId, findByText, queryByTestId } = render(
      <SettingsTabScreen />,
    );
    await act(async () => {
      fireEvent.press(getByLabelText('Switch to second@example.com'));
    });

    expect(getByTestId('account-switch-progress')).toBeTruthy();
    expect(await findByText('Switching to second@example.com…')).toBeTruthy();

    await act(async () => {
      finishSwitch();
    });
    await act(async () => {
      bridgeAdoptsActiveSession();
    });

    await waitFor(() => expect(queryByTestId('account-switch-progress')).toBeNull());
    expect(mockClerk.setActive).toHaveBeenCalledWith({ session: 'sess_b' });
    expect(useAuthStore.getState().clerkUserId).toBe('user_b');
  });

  it('releases the first account’s push registration with its own token before switching', async () => {
    signInFirstAccount({ multiSession: true });

    await useAuthStore.getState().switchAccount('sess_b');

    const requests = pushTokenRequests();
    expect(requests).toHaveLength(1);
    const [release] = requests;
    expect(release!.init.method).toBe('DELETE');
    expect(release!.url.searchParams.get('deviceId')).toBe(DEVICE_ID);
    expect(release!.url.searchParams.get('release')).toBe('device');
    expect(authorizationOf(release!.init)).toBe('Bearer token-for-sess_a');
    expect(mockSecureFetch.mock.invocationCallOrder[0]).toBeLessThan(
      mockClerk.setActive.mock.invocationCallOrder[0]!,
    );
    expect(mockClerk.setActive).toHaveBeenCalledWith({ session: 'sess_b' });
  });

  it('leaves nothing of the first account readable after a successful switch', async () => {
    signInFirstAccount({ multiSession: true });
    const firstAccountEpoch = captureCloudAccountEpoch();
    useChatCloudMessageStore.setState({
      conversations: [{ id: 'conv-first', title: 'First account chat' }] as never,
    });
    leaveUnsentWorkOnFirstAccount();

    await useAuthStore.getState().switchAccount('sess_b');

    expect(isCloudAccountEpochCurrent(firstAccountEpoch)).toBe(false);
    expect(useAuthStore.getState()).toEqual(
      expect.objectContaining({ clerkUserId: null, isClerkSignedIn: false }),
    );
    expect(useChatCloudMessageStore.getState().conversations).toEqual([]);
    expect(queuedCloudSends()).toEqual([]);
    expect(storedCloudDrafts()).toEqual([]);
    expect(peekPostAuthIntent()).not.toBeNull();
  });

  it('asks before a switch that discards messages still waiting to send', async () => {
    signInFirstAccount({ multiSession: true });
    leaveUnsentWorkOnFirstAccount();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const { getByLabelText } = render(<SettingsTabScreen />);
    await act(async () => {
      fireEvent.press(getByLabelText('Switch to second@example.com'));
    });

    const [title, message, buttons] = alertSpy.mock.calls[0]!;
    expect(title).toBe('Switch to second@example.com?');
    expect(message).toBe(
      'Messages from this account that are still waiting to send will be discarded.',
    );
    expect(mockClerk.setActive).not.toHaveBeenCalled();
    expect(mockSecureFetch).not.toHaveBeenCalled();

    const cancel = (buttons as { text: string; onPress?: () => void }[]).find(
      (button) => button.text === 'Cancel',
    )!;
    cancel.onPress?.();
    expect(queuedCloudSends()).toHaveLength(1);

    const confirm = (buttons as { text: string; onPress?: () => void }[]).find(
      (button) => button.text === 'Discard and switch',
    )!;
    await act(async () => {
      confirm.onPress?.();
    });
    await waitFor(() => expect(mockClerk.setActive).toHaveBeenCalledWith({ session: 'sess_b' }));
    await act(async () => {
      bridgeAdoptsActiveSession();
    });
    await waitFor(() => expect(useAccountSwitchStore.getState().switchingTo).toBeNull());
    expect(queuedCloudSends()).toEqual([]);
  });

  it('keeps the old account, its drafts and its queued sends when switching fails', async () => {
    signInFirstAccount({ multiSession: true });
    leaveUnsentWorkOnFirstAccount();
    mockClerk.setActive.mockRejectedValue(NETWORK_FAILURE);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const { getByLabelText, queryByTestId, getByTestId } = render(<SettingsTabScreen />);
    await act(async () => {
      fireEvent.press(getByLabelText('Switch to second@example.com'));
    });
    const discard = (alertSpy.mock.calls[0]![2] as { text: string; onPress?: () => void }[]).find(
      (button) => button.text === 'Discard and switch',
    )!;
    await act(async () => {
      discard.onPress?.();
    });

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Could not switch accounts', expect.any(String)),
    );
    const message = alertSpy.mock.calls.find(
      ([title]) => title === 'Could not switch accounts',
    )![1];
    expect(message).toMatch(/try again/i);
    expect(mockClerk.session?.id).toBe('sess_a');
    expect(captureCloudAccountEpoch()?.ownerId).toBe('user_a');
    expect(useAuthStore.getState()).toEqual(
      expect.objectContaining({ clerkUserId: 'user_a', isClerkSignedIn: true }),
    );
    expect(useChatAppModeStore.getState().appMode).toBe('cloud');
    expect(peekPostAuthIntent()).toBeNull();
    expect(queuedCloudSends().map((entry) => entry.content)).toEqual(['queued while offline']);
    expect(getDraft('conv-first', FIRST_CLOUD)).toBe('half-written reply');
    expect(queryByTestId('account-switch-progress')).toBeNull();
    expect(
      within(getByTestId('device-accounts-card')).getAllByTestId('device-account-active-sess_a')
        .length,
    ).toBeGreaterThan(0);
  });

  it('never activates the other account when the push registration cannot be released', async () => {
    signInFirstAccount({ multiSession: true });
    leaveUnsentWorkOnFirstAccount();
    mockSecureFetch.mockResolvedValue({ ok: false, status: 503 });

    await expect(useAuthStore.getState().switchAccount('sess_b')).rejects.toThrow(
      'Could not switch accounts. Try again.',
    );

    expect(mockClerk.setActive).not.toHaveBeenCalled();
    expect(mockClerk.session?.id).toBe('sess_a');
    expect(captureCloudAccountEpoch()?.ownerId).toBe('user_a');
    expect(useAuthStore.getState().clerkUserId).toBe('user_a');
    expect(queuedCloudSends()).toHaveLength(1);
    expect(getDraft('conv-first', FIRST_CLOUD)).toBe('half-written reply');
  });

  it('leaves the first account untouched and registered for push when a switch cannot release it', async () => {
    signInFirstAccount({ multiSession: true });
    const firstAccountEpoch = captureCloudAccountEpoch();
    useChatCloudMessageStore.setState({
      conversations: [{ id: 'conv-first', title: 'First account chat' }] as never,
    });
    render(<PushRegistration />);
    await waitFor(() => expect(registeredPushOwners()).toEqual(['user_a']));
    mockSecureFetch.mockResolvedValue({ ok: false, status: 503 });

    await act(async () => {
      await expect(useAuthStore.getState().switchAccount('sess_b')).rejects.toThrow(
        'Could not switch accounts. Try again.',
      );
    });

    expect(isCloudAccountEpochCurrent(firstAccountEpoch)).toBe(true);
    expect(useChatCloudMessageStore.getState().conversations).toEqual([
      { id: 'conv-first', title: 'First account chat' },
    ]);
    expect(useAuthStore.getState()).toEqual(
      expect.objectContaining({ clerkUserId: 'user_a', isClerkSignedIn: true }),
    );
    expect(useChatAppModeStore.getState().appMode).toBe('cloud');
    expect(pushTokenRequests().map(({ url }) => url.searchParams.get('release'))).toEqual([
      'device',
    ]);
    await waitFor(() => expect(registeredPushOwners()).toEqual(['user_a', 'user_a']));
  });

  it('waits for a push registration still on its way to the server before releasing it for a switch', async () => {
    signInFirstAccount({ multiSession: true });
    const registration = holdRegistrationPostsUntilDelivered();
    render(<PushRegistration />);
    await waitFor(() => expect(registration.post).toHaveBeenCalledTimes(1));

    let switching: Promise<void> = Promise.resolve();
    await act(async () => {
      switching = useAuthStore.getState().switchAccount('sess_b');
    });
    await settle();

    expect(releaseRequests()).toEqual([]);
    expect(mockClerk.setActive).not.toHaveBeenCalled();

    registration.deliver();
    await act(async () => {
      await switching;
    });

    expect(releaseRequests()).toHaveLength(1);
    expect(registration.outcomes).toEqual([false]);
    expect(registration.post).toHaveBeenCalledTimes(1);
    expect(mockClerk.setActive).toHaveBeenCalledWith({ session: 'sess_b' });
  });

  it('logs out of the active account only, releases its push registration and continues on the other one', async () => {
    signInFirstAccount({ multiSession: true });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const { getByLabelText } = render(<SettingsTabScreen />);
    expect(getByLabelText(/Log Out/).props.accessibilityHint).toBe(
      'Signs first@example.com out on this device',
    );
    fireEvent.press(getByLabelText(/Log Out/));

    const [title, message, buttons] = alertSpy.mock.calls[0]!;
    expect(title).toBe('Log Out');
    expect(message).toBe(
      'Log out of first@example.com on this device? You will continue as second@example.com.',
    );
    const confirm = (buttons as { text: string; onPress?: () => void }[]).find(
      (button) => button.text === 'Log Out',
    )!;
    await act(async () => {
      confirm.onPress?.();
    });

    await waitFor(() => expect(mockClerk.signOut).toHaveBeenCalledWith({ sessionId: 'sess_a' }));
    expect(mockClerk.setActive).toHaveBeenCalledWith({ session: 'sess_b' });
    expect(mockClerk.setActive.mock.invocationCallOrder[0]).toBeLessThan(
      mockClerk.signOut.mock.invocationCallOrder[0]!,
    );
    const [release] = pushTokenRequests();
    expect(release!.url.searchParams.get('release')).toBe('device');
    expect(authorizationOf(release!.init)).toBe('Bearer token-for-sess_a');
    expect(mockSecureFetch.mock.invocationCallOrder[0]).toBeLessThan(
      mockClerk.setActive.mock.invocationCallOrder[0]!,
    );
    expect(mockClerk.client.signedInSessions.map((entry) => entry.id)).toEqual(['sess_b']);
    expect(mockClerk.session?.id).toBe('sess_b');
  });

  it('ends every session when the hand-over to the other account fails', async () => {
    signInFirstAccount({ multiSession: true });
    mockClerk.setActive.mockRejectedValue(NETWORK_FAILURE);

    await useAuthStore.getState().signOut();

    expect(mockClerk.signOut).toHaveBeenCalledTimes(1);
    expect(mockClerk.signOut.mock.calls[0]![0]).toBeUndefined();
    expect(mockClerk.client.signedInSessions).toEqual([]);
    expect(mockClerk.session).toBeNull();
    expect(captureCloudAccountEpoch()).toBeNull();
    expect(useAuthStore.getState()).toEqual(
      expect.objectContaining({ clerkUserId: null, isClerkSignedIn: false }),
    );
    expect(peekPostAuthIntent()).toBeNull();
  });

  it.each([
    [
      'the server cannot confirm the release',
      () => mockSecureFetch.mockResolvedValue({ ok: false, status: 503 }),
    ],
    [
      'the account credential is unavailable',
      () => jest.spyOn(FIRST, 'getToken').mockRejectedValue(NETWORK_FAILURE),
    ],
  ])(
    'ends every session instead of continuing on the other account when %s',
    async (_case, failRelease) => {
      signInFirstAccount({ multiSession: true });
      failRelease();

      await useAuthStore.getState().signOut();

      expect(mockClerk.setActive).not.toHaveBeenCalled();
      expect(mockClerk.signOut).toHaveBeenCalledTimes(1);
      expect(mockClerk.signOut.mock.calls[0]![0]).toBeUndefined();
      expect(mockClerk.client.signedInSessions).toEqual([]);
      expect(mockClerk.session).toBeNull();
      expect(captureCloudAccountEpoch()).toBeNull();
      expect(useAuthStore.getState()).toEqual(
        expect.objectContaining({ clerkUserId: null, isClerkSignedIn: false }),
      );
      expect(peekPostAuthIntent()).toBeNull();
    },
  );

  it('ends every account on the phone when asked to, without handing over', async () => {
    signInFirstAccount({ multiSession: true });
    leaveUnsentWorkOnFirstAccount();

    await useAuthStore.getState().signOutAllAccounts();

    expect(mockClerk.setActive).not.toHaveBeenCalled();
    expect(mockClerk.signOut).toHaveBeenCalledTimes(1);
    expect(mockClerk.signOut.mock.calls[0]![0]).toBeUndefined();
    expect(mockClerk.client.signedInSessions).toEqual([]);
    expect(peekPostAuthIntent()).toBeNull();
    const [unregister] = pushTokenRequests();
    expect(unregister!.url.searchParams.get('release')).toBeNull();
    expect(authorizationOf(unregister!.init)).toBe('Bearer token-for-sess_a');
    expect(queuedCloudSends()).toEqual([]);
    expect(storedCloudDrafts()).toEqual([]);
  });

  it('signs out exactly as before when the phone holds one account', async () => {
    signInFirstAccount({ multiSession: false });

    await useAuthStore.getState().signOut();

    expect(mockClerk.setActive).not.toHaveBeenCalled();
    expect(mockClerk.signOut).toHaveBeenCalledTimes(1);
    expect(mockClerk.signOut.mock.calls[0]![0]).toBeUndefined();
    const [unregister] = pushTokenRequests();
    expect(unregister!.init.method).toBe('DELETE');
    expect(unregister!.url.searchParams.get('release')).toBeNull();
    expect(mockSecureFetch.mock.invocationCallOrder[0]).toBeLessThan(
      mockClerk.signOut.mock.invocationCallOrder[0]!,
    );
  });

  it('opens the Cloud sign-in screen in add-account mode', async () => {
    signInFirstAccount({ multiSession: true });

    const { getByLabelText } = render(<SettingsTabScreen />);
    await act(async () => {
      fireEvent.press(getByLabelText('Add account'));
    });

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(auth)/login',
        params: { addAccount: '1' },
      }),
    );
    expect(isCloudAccountAdditionOpenFor('user_a')).toBe(true);
  });

  it('releases the first account’s push registration when an add starts and registers it again when the add is cancelled', async () => {
    signInFirstAccount({ multiSession: true });
    const { getByLabelText } = render(
      <>
        <PushRegistration />
        <SettingsTabScreen />
      </>,
    );
    await waitFor(() => expect(registeredPushOwners()).toEqual(['user_a']));

    await act(async () => {
      fireEvent.press(getByLabelText('Add account'));
    });

    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    const [release] = releaseRequests();
    expect(authorizationOf(release!.init)).toBe('Bearer token-for-sess_a');
    expect(mockSecureFetch.mock.invocationCallOrder[0]).toBeLessThan(
      mockPush.mock.invocationCallOrder[0]!,
    );
    expect(mockSetPushAccountContext).toHaveBeenLastCalledWith(null);
    expect(registeredPushOwners()).toEqual(['user_a']);

    await act(async () => {
      endCloudAccountAddition({ cancelled: true });
    });

    await waitFor(() => expect(registeredPushOwners()).toEqual(['user_a', 'user_a']));
  });

  it('registers the added account for push once it signs in, and never the first one again', async () => {
    signInFirstAccount({ multiSession: true });
    mockClerk.client.signedInSessions = [FIRST];
    const { getByLabelText } = render(
      <>
        <PushRegistration />
        <SettingsTabScreen />
      </>,
    );
    await waitFor(() => expect(registeredPushOwners()).toEqual(['user_a']));
    await act(async () => {
      fireEvent.press(getByLabelText('Add account'));
    });
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(releaseRequests()).toHaveLength(1);

    await act(async () => {
      mockClerk.client.signedInSessions = [FIRST, SECOND];
      mockClerk.session = SECOND;
      bridgeAdoptsActiveSession();
      useChatAppModeStore.setState({ appMode: 'cloud' });
      endCloudAccountAddition({ cancelled: false });
    });

    await waitFor(() => expect(registeredPushOwners()).toEqual(['user_a', 'user_b']));
  });

  it('keeps the first account registered for push when its registration cannot be released for an add', async () => {
    signInFirstAccount({ multiSession: true });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { getByLabelText } = render(
      <>
        <PushRegistration />
        <SettingsTabScreen />
      </>,
    );
    await waitFor(() => expect(registeredPushOwners()).toEqual(['user_a']));
    mockSecureFetch.mockResolvedValue({ ok: false, status: 503 });

    await act(async () => {
      fireEvent.press(getByLabelText('Add account'));
    });

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Could not add an account',
        'Could not add an account. Try again.',
      ),
    );
    expect(mockPush).not.toHaveBeenCalled();
    expect(isCloudAccountAdditionOpenFor('user_a')).toBe(false);
    await waitFor(() => expect(registeredPushOwners()).toEqual(['user_a', 'user_a']));
  });

  it('asks before an add that would discard messages still waiting to send', async () => {
    signInFirstAccount({ multiSession: true });
    leaveUnsentWorkOnFirstAccount();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const { getByLabelText } = render(<SettingsTabScreen />);
    await act(async () => {
      fireEvent.press(getByLabelText('Add account'));
    });

    const [title, message, buttons] = alertSpy.mock.calls[0]!;
    expect(title).toBe('Add another account?');
    expect(message).toBe(
      'Messages from this account that are still waiting to send will be discarded.',
    );
    expect(mockSecureFetch).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(isCloudAccountAdditionOpenFor('user_a')).toBe(false);

    const choices = buttons as { text: string; onPress?: () => void }[];
    choices.find((button) => button.text === 'Cancel')!.onPress?.();
    expect(queuedCloudSends()).toHaveLength(1);
    expect(mockPush).not.toHaveBeenCalled();

    await act(async () => {
      choices.find((button) => button.text === 'Discard and add account')!.onPress?.();
    });
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(auth)/login',
        params: { addAccount: '1' },
      }),
    );
    expect(releaseRequests()).toHaveLength(1);
    expect(isCloudAccountAdditionOpenFor('user_a')).toBe(true);
  });

  it('starts an add without asking when nothing is waiting to send', async () => {
    signInFirstAccount({ multiSession: true });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const { getByLabelText } = render(<SettingsTabScreen />);
    await act(async () => {
      fireEvent.press(getByLabelText('Add account'));
    });

    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('waits for a push registration still on its way to the server before releasing it for an add', async () => {
    signInFirstAccount({ multiSession: true });
    const registration = holdRegistrationPostsUntilDelivered();
    const { getByLabelText } = render(
      <>
        <PushRegistration />
        <SettingsTabScreen />
      </>,
    );
    await waitFor(() => expect(registration.post).toHaveBeenCalledTimes(1));

    await act(async () => {
      fireEvent.press(getByLabelText('Add account'));
    });
    await settle();

    expect(releaseRequests()).toEqual([]);
    expect(mockPush).not.toHaveBeenCalled();

    registration.deliver();

    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(releaseRequests()).toHaveLength(1);
    expect(registration.outcomes).toEqual([false]);
    expect(registration.post).toHaveBeenCalledTimes(1);
  });

  it('registers the first account for push again when a switch fails after releasing it', async () => {
    signInFirstAccount({ multiSession: true });
    render(<PushRegistration />);
    await waitFor(() => expect(registeredPushOwners()).toEqual(['user_a']));
    mockClerk.setActive.mockRejectedValue(NETWORK_FAILURE);

    await act(async () => {
      await expect(useAuthStore.getState().switchAccount('sess_b')).rejects.toThrow();
    });

    expect(releaseRequests()).toHaveLength(1);
    expect(mockClerk.session?.id).toBe('sess_a');
    await waitFor(() => expect(registeredPushOwners()).toEqual(['user_a', 'user_a']));
  });
});
