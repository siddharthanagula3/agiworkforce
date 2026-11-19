import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH,
  managedCloudPreferencesNamespacePath,
} from '@agiworkforce/cloud-contracts';

const mockFetch = jest.fn();
let mockFocus: (() => void) | undefined;
let mockBlur: (() => void) | undefined;

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<ImportedModule0>('react');
    useEffect(() => {
      mockFocus = () => {
        const cleanup = callback();
        mockBlur = typeof cleanup === 'function' ? cleanup : undefined;
      };
      mockFocus();
      return () => {
        mockBlur?.();
        mockBlur = undefined;
      };
    }, [callback]);
  },
}));
jest.mock('@/services/api', () => ({
  apiFetch: (...args: unknown[]) => mockFetch(...args),
}));
jest.mock('@/src/features/auth/store', () => {
  const { create } = jest.requireActual<ImportedModule1>('zustand');
  return {
    useAuthStore: create(() => ({
      isClerkLoaded: true,
      isClerkSignedIn: true,
      clerkUserId: 'account-a',
    })),
  };
});
jest.mock('@/src/features/chat/store/appModeStore', () => {
  const { create } = jest.requireActual<ImportedModule1>('zustand');
  return { useChatAppModeStore: create(() => ({ appMode: 'cloud' })) };
});
jest.mock('@/src/features/settings/Common', () => {
  const { Switch } = jest.requireActual<ImportedModule2>('react-native');
  return {
    SettingsGroup: ({ children }: { children: React.ReactNode }) => children,
    SettingsSwitchRow: ({ label, ...props }: { label: string }) => (
      <Switch accessibilityLabel={label} {...props} />
    ),
  };
});
jest.mock('@/components/ui/Button', () => {
  const { Pressable, Text } = jest.requireActual<ImportedModule2>('react-native');
  return {
    Button: ({ title, ...props }: { title: string }) => (
      <Pressable {...props}>
        <Text>{title}</Text>
      </Pressable>
    ),
  };
});
jest.mock('lucide-react-native', () => ({
  EyeOff: () => null,
  MessageSquare: () => null,
  Mic: () => null,
}));

import { TrainingPreferenceGroups } from '@/src/features/settings/cloud-privacy/TrainingPreferenceGroups';
import { useAuthStore } from '@/src/features/auth/store';
import { ownerHandler } from '@/test-utils/ownerProps';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  activateCloudAccount,
  captureCloudAccountEpoch,
  __resetCloudAccountSessionForTests,
} from '@/src/features/auth/services/cloudAccountSession';

const version = 'stored-revision';
const choice = (optedOut = false, revision: string | null = version) => ({
  settings: { keepOutOfProviderTraining: optedOut },
  version: revision,
});
const response = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: jest.fn().mockResolvedValue(body),
});
const receiptBody = (optedOut = true) => ({
  settings: { privacy: { keepOutOfProviderTraining: optedOut }, unrelated: { theme: 'dark' } },
  version: 'saved-revision',
});
const receipt = (optedOut = true) => response(receiptBody(optedOut));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const putCalls = () => mockFetch.mock.calls.filter((call) => call[1]?.method === 'PUT');

beforeEach(() => {
  mockFetch.mockReset();
  mockFocus = undefined;
  mockBlur = undefined;
  __resetCloudAccountSessionForTests();
  activateCloudAccount('account-a');
  useAuthStore.setState({ clerkUserId: 'account-a', isClerkLoaded: true, isClerkSignedIn: true });
  useChatAppModeStore.setState({ appMode: 'cloud' });
  mockFetch.mockResolvedValue(response(choice()));
});

async function readyScreen() {
  const screen = render(<TrainingPreferenceGroups />);
  await waitFor(() =>
    expect(
      screen.getByLabelText('Only use models that do not train on your chats').props.disabled,
    ).toBe(false),
  );
  return screen;
}

describe('owned provider training choices', () => {
  it('does not read when the loaded Clerk identity disagrees with the account epoch', () => {
    useAuthStore.setState({ clerkUserId: 'account-b' });
    const screen = render(<TrainingPreferenceGroups />);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(
      screen.getByLabelText('Only use models that do not train on your chats').props.disabled,
    ).toBe(true);
  });

  it('takes a synchronous lease, forwards the epoch, and retires the original ready callback', async () => {
    const screen = await readyScreen();
    const saved = ownerHandler(
      screen.getByLabelText('Only use models that do not train on your chats'),
      'onValueChange',
    );
    const pending = deferred<ReturnType<typeof response>>();
    mockFetch.mockImplementationOnce(() => pending.promise);
    act(() => {
      saved(true);
      saved(false);
    });
    expect(putCalls()).toHaveLength(1);
    expect(putCalls()[0]?.[0]).toBe(MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH);
    expect(JSON.parse(putCalls()[0]?.[1].body)).toEqual({
      namespace: 'privacy',
      patch: { keepOutOfProviderTraining: true },
      expectedVersion: version,
    });
    expect(putCalls()[0]?.[2]).toEqual({
      accountEpoch: captureCloudAccountEpoch(),
      signal: expect.any(AbortSignal),
    });
    mockFetch.mockResolvedValue(response(choice(true)));
    await act(async () => {
      pending.resolve(receipt());
    });
    await waitFor(() =>
      expect(
        screen.getByLabelText('Only use models that do not train on your chats').props.disabled,
      ).toBe(false),
    );
    act(() => saved(false));
    expect(putCalls()).toHaveLength(1);
    expect(mockFetch.mock.calls[0]).toEqual([
      managedCloudPreferencesNamespacePath('privacy'),
      {},
      { accountEpoch: captureCloudAccountEpoch(), signal: expect.any(AbortSignal) },
    ]);
  });

  it.each(['account', 'identity', 'loaded', 'mode', 'authentication', 'focus'])(
    'rejects a saved callback after %s leaves and returns',
    async (kind) => {
      const screen = await readyScreen();
      const saved = ownerHandler(
        screen.getByLabelText('Only use models that do not train on your chats'),
        'onValueChange',
      );
      act(() => {
        if (kind === 'account') {
          activateCloudAccount('account-b');
          activateCloudAccount('account-a');
        } else if (kind === 'identity') {
          useAuthStore.setState({ clerkUserId: 'account-b' });
          useAuthStore.setState({ clerkUserId: 'account-a' });
        } else if (kind === 'loaded') {
          useAuthStore.setState({ isClerkLoaded: false });
          useAuthStore.setState({ isClerkLoaded: true });
        } else if (kind === 'mode') {
          useChatAppModeStore.setState({ appMode: 'local' });
          useChatAppModeStore.setState({ appMode: 'cloud' });
        } else if (kind === 'authentication') {
          useAuthStore.setState({ isClerkSignedIn: false });
          useAuthStore.setState({ isClerkSignedIn: true });
        } else {
          mockBlur?.();
          mockFocus?.();
        }
        saved(true);
      });
      await waitFor(() =>
        expect(
          screen.getByLabelText('Only use models that do not train on your chats').props.disabled,
        ).toBe(false),
      );
      expect(putCalls()).toHaveLength(0);
    },
  );

  it('does not dispatch reads or saved choices in Local mode', async () => {
    const screen = await readyScreen();
    const saved = ownerHandler(
      screen.getByLabelText('Only use models that do not train on your chats'),
      'onValueChange',
    );
    act(() => {
      useChatAppModeStore.setState({ appMode: 'local' });
      saved(true);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(
      screen.getByLabelText('Only use models that do not train on your chats').props.disabled,
    ).toBe(true);
  });

  it('retires delayed body parsing and keeps the replacement read busy', async () => {
    const body = deferred<unknown>();
    mockFetch.mockResolvedValueOnce({ ...response(null), json: () => body.promise });
    const screen = render(<TrainingPreferenceGroups />);
    await act(async () => {});
    const replacement = deferred<ReturnType<typeof response>>();
    mockFetch.mockImplementationOnce(() => replacement.promise);
    act(() => {
      mockBlur?.();
      mockFocus?.();
    });
    await act(async () => {
      body.resolve(choice(true));
    });
    expect(
      screen.getByLabelText('Only use models that do not train on your chats').props.disabled,
    ).toBe(true);
    expect(
      screen.getByLabelText('Only use models that do not train on your chats').props.value,
    ).toBe(false);
    expect(mockFetch.mock.calls[0]?.[2].signal.aborted).toBe(true);
    await act(async () => {
      replacement.resolve(response(choice()));
    });
    await waitFor(() =>
      expect(
        screen.getByLabelText('Only use models that do not train on your chats').props.disabled,
      ).toBe(false),
    );
  });

  it('does not reconcile an old receipt or release the replacement operation', async () => {
    const screen = await readyScreen();
    const body = deferred<unknown>();
    mockFetch.mockResolvedValueOnce({ ...receipt(), json: () => body.promise });
    fireEvent(
      screen.getByLabelText('Only use models that do not train on your chats'),
      'valueChange',
      true,
    );
    await act(async () => {});
    const replacement = deferred<ReturnType<typeof response>>();
    mockFetch.mockImplementationOnce(() => replacement.promise);
    act(() => {
      mockBlur?.();
      mockFocus?.();
    });
    await act(async () => {
      body.resolve(receiptBody());
    });
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(
      screen.getByLabelText('Only use models that do not train on your chats').props.disabled,
    ).toBe(true);
    await act(async () => {
      replacement.resolve(response(choice()));
    });
    await waitFor(() =>
      expect(
        screen.getByLabelText('Only use models that do not train on your chats').props.disabled,
      ).toBe(false),
    );
  });

  it('does not reconcile or publish a failed write after unmount', async () => {
    const screen = await readyScreen();
    const pending = deferred<ReturnType<typeof response>>();
    mockFetch.mockImplementationOnce(() => pending.promise);
    fireEvent(
      screen.getByLabelText('Only use models that do not train on your chats'),
      'valueChange',
      true,
    );
    screen.unmount();
    await act(async () => {
      pending.reject(new Error('lost response'));
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(putCalls()[0]?.[2].signal.aborted).toBe(true);
  });

  it('preserves an acknowledged opt-out when readback fails and offers a working read retry', async () => {
    const screen = await readyScreen();
    const saved = ownerHandler(
      screen.getByLabelText('Only use models that do not train on your chats'),
      'onValueChange',
    );
    mockFetch.mockResolvedValueOnce(receipt(true)).mockRejectedValueOnce(new Error('read failed'));
    act(() => saved(true));
    await waitFor(() =>
      expect(screen.getByText(/Your model training setting was saved as on, but/)).toBeTruthy(),
    );
    expect(
      screen.getByLabelText('Only use models that do not train on your chats').props.value,
    ).toBe(true);
    expect(
      screen.getByLabelText('Only use models that do not train on your chats').props.disabled,
    ).toBe(true);
    act(() => saved(true));
    expect(putCalls()).toHaveLength(1);
    fireEvent.press(screen.getByLabelText('Retry loading model training settings'));
    await waitFor(() =>
      expect(
        screen.getByLabelText('Only use models that do not train on your chats').props.disabled,
      ).toBe(false),
    );
    expect(putCalls()).toHaveLength(1);
  });

  it.each(['lost response', 'invalid receipt', 'contradictory receipt'])(
    'reconciles %s without retrying the PUT',
    async (failure) => {
      const screen = await readyScreen();
      if (failure === 'lost response') mockFetch.mockRejectedValueOnce(new Error('lost'));
      else if (failure === 'contradictory receipt') mockFetch.mockResolvedValueOnce(receipt(false));
      else mockFetch.mockResolvedValueOnce(response({}));
      mockFetch.mockResolvedValueOnce(response(choice(true)));
      fireEvent(
        screen.getByLabelText('Only use models that do not train on your chats'),
        'valueChange',
        true,
      );
      await waitFor(() => expect(screen.getByText(/The save could not be confirmed/)).toBeTruthy());
      expect(
        screen.getByLabelText('Only use models that do not train on your chats').props.value,
      ).toBe(true);
      expect(
        screen.getByLabelText('Only use models that do not train on your chats').props.disabled,
      ).toBe(false);
      expect(putCalls()).toHaveLength(1);
    },
  );

  it('keeps an uncertain save unavailable when reconciliation fails until an explicit read succeeds', async () => {
    const screen = await readyScreen();
    const saved = ownerHandler(
      screen.getByLabelText('Only use models that do not train on your chats'),
      'onValueChange',
    );
    mockFetch
      .mockRejectedValueOnce(new Error('lost write response'))
      .mockRejectedValueOnce(new Error('read unavailable'));
    act(() => saved(true));
    await waitFor(() =>
      expect(screen.getByLabelText('Retry loading model training settings')).toBeTruthy(),
    );
    expect(screen.getByText(/The save could not be confirmed/)).toBeTruthy();
    expect(screen.queryByText(/was saved as/)).toBeNull();
    expect(
      screen.getByLabelText('Only use models that do not train on your chats').props.disabled,
    ).toBe(true);
    act(() => saved(false));
    expect(putCalls()).toHaveLength(1);
    mockFetch.mockResolvedValueOnce(response(choice(true)));
    fireEvent.press(screen.getByLabelText('Retry loading model training settings'));
    await waitFor(() =>
      expect(
        screen.getByLabelText('Only use models that do not train on your chats').props.disabled,
      ).toBe(false),
    );
    expect(
      screen.getByLabelText('Only use models that do not train on your chats').props.value,
    ).toBe(true);
    expect(putCalls()).toHaveLength(1);
  });

  it('requires a refreshed revision and new choice after a precondition conflict', async () => {
    const screen = await readyScreen();
    const saved = ownerHandler(
      screen.getByLabelText('Only use models that do not train on your chats'),
      'onValueChange',
    );
    mockFetch
      .mockResolvedValueOnce(response({}, 412))
      .mockResolvedValueOnce(response(choice(false, 'new-revision')));
    act(() => saved(true));
    await waitFor(() => expect(screen.getByText(/Your settings changed elsewhere/)).toBeTruthy());
    act(() => saved(true));
    expect(putCalls()).toHaveLength(1);
    mockFetch.mockResolvedValueOnce(receipt());
    fireEvent(
      screen.getByLabelText('Only use models that do not train on your chats'),
      'valueChange',
      true,
    );
    expect(JSON.parse(putCalls()[1]?.[1].body).expectedVersion).toBe('new-revision');
    await waitFor(() =>
      expect(
        screen.getByLabelText('Only use models that do not train on your chats').props.disabled,
      ).toBe(false),
    );
  });

  it('leaves malformed GET unavailable and consumes duplicate read retries synchronously', async () => {
    mockFetch.mockResolvedValueOnce(response({}));
    const screen = render(<TrainingPreferenceGroups />);
    await waitFor(() =>
      expect(screen.getByLabelText('Retry loading model training settings')).toBeTruthy(),
    );
    expect(
      screen.getByLabelText('Only use models that do not train on your chats').props.disabled,
    ).toBe(true);
    const retry = ownerHandler(
      screen.getByLabelText('Retry loading model training settings'),
      'onPress',
    );
    const pending = deferred<ReturnType<typeof response>>();
    mockFetch.mockImplementationOnce(() => pending.promise);
    act(() => {
      retry();
      retry();
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    await act(async () => {
      pending.resolve(response(choice()));
    });
    await waitFor(() =>
      expect(
        screen.getByLabelText('Only use models that do not train on your chats').props.disabled,
      ).toBe(false),
    );
    act(() => retry());
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('allows an authoritative absent namespace and retains null as the unconditional version', async () => {
    mockFetch.mockResolvedValueOnce(response({ settings: {}, version: null }));
    const screen = await readyScreen();
    mockFetch.mockResolvedValueOnce(receipt());
    fireEvent(
      screen.getByLabelText('Only use models that do not train on your chats'),
      'valueChange',
      true,
    );
    expect(JSON.parse(putCalls()[0]?.[1].body)).toEqual({
      namespace: 'privacy',
      patch: { keepOutOfProviderTraining: true },
      expectedVersion: null,
    });
    await waitFor(() =>
      expect(
        screen.getByLabelText('Only use models that do not train on your chats').props.disabled,
      ).toBe(false),
    );
  });
});

type ImportedModule0 = typeof import('react');
type ImportedModule1 = typeof import('zustand');
type ImportedModule2 = typeof import('react-native');
