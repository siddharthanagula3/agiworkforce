import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  PRODUCT_ANALYTICS_CONSENT_PATH,
  PRODUCT_ANALYTICS_CONSENT_PURPOSE,
  PRODUCT_ANALYTICS_NOTICE_VERSION,
} from '@agiworkforce/types';

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
jest.mock('lucide-react-native', () => ({ BarChart3: () => null }));

import { ProductAnalyticsConsentGroup } from '@/src/features/settings/cloud-privacy/ProductAnalyticsConsentGroup';
import { useAuthStore } from '@/src/features/auth/store';
import { ownerHandler } from '@/test-utils/ownerProps';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  activateCloudAccount,
  captureCloudAccountEpoch,
  __resetCloudAccountSessionForTests,
} from '@/src/features/auth/services/cloudAccountSession';

const notice = '2026-10-01';
const decision = (granted: boolean) => ({
  purpose: PRODUCT_ANALYTICS_CONSENT_PURPOSE,
  granted,
  noticeVersion: PRODUCT_ANALYTICS_NOTICE_VERSION,
});
const choice = (granted = false, noticeVersion = notice) => ({
  noticeVersion,
  purposes: [{ id: PRODUCT_ANALYTICS_CONSENT_PURPOSE }],
  consents: [decision(granted)],
});
const response = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: jest.fn().mockResolvedValue(body),
});
const receipt = (granted = true) =>
  response({ noticeVersion: notice, recorded: [decision(granted)] });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const postCalls = () => mockFetch.mock.calls.filter((call) => call[1]?.method === 'POST');

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
  const screen = render(<ProductAnalyticsConsentGroup />);
  await waitFor(() =>
    expect(screen.getByLabelText('Product analytics').props.disabled).toBe(false),
  );
  return screen;
}

describe('owned analytics choices', () => {
  it('does not read when the loaded Clerk identity disagrees with the account epoch', () => {
    useAuthStore.setState({ clerkUserId: 'account-b' });
    const screen = render(<ProductAnalyticsConsentGroup />);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Product analytics').props.disabled).toBe(true);
  });

  it('takes a synchronous lease, forwards the epoch, and retires the original ready callback', async () => {
    const screen = await readyScreen();
    const saved = ownerHandler(screen.getByLabelText('Product analytics'), 'onValueChange');
    const pending = deferred<ReturnType<typeof response>>();
    mockFetch.mockImplementationOnce(() => pending.promise);
    act(() => {
      saved(true);
      saved(false);
    });
    expect(postCalls()).toHaveLength(1);
    expect(postCalls()[0]?.[2]).toEqual({
      accountEpoch: captureCloudAccountEpoch(),
      signal: expect.any(AbortSignal),
    });
    mockFetch.mockResolvedValue(response(choice(true)));
    await act(async () => {
      pending.resolve(receipt());
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Product analytics').props.disabled).toBe(false),
    );
    act(() => saved(false));
    expect(postCalls()).toHaveLength(1);
    expect(mockFetch.mock.calls[0]).toEqual([
      PRODUCT_ANALYTICS_CONSENT_PATH,
      {},
      { accountEpoch: captureCloudAccountEpoch(), signal: expect.any(AbortSignal) },
    ]);
  });

  it.each(['account', 'mode', 'authentication', 'focus'])(
    'rejects a saved callback after %s leaves and returns',
    async (kind) => {
      const screen = await readyScreen();
      const saved = ownerHandler(screen.getByLabelText('Product analytics'), 'onValueChange');
      act(() => {
        if (kind === 'account') {
          activateCloudAccount('account-b');
          activateCloudAccount('account-a');
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
        expect(screen.getByLabelText('Product analytics').props.disabled).toBe(false),
      );
      expect(postCalls()).toHaveLength(0);
    },
  );

  it('does not dispatch reads or saved choices in Local mode', async () => {
    const screen = await readyScreen();
    const saved = ownerHandler(screen.getByLabelText('Product analytics'), 'onValueChange');
    act(() => {
      useChatAppModeStore.setState({ appMode: 'local' });
      saved(true);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Product analytics').props.disabled).toBe(true);
  });

  it('retires delayed body parsing and keeps the replacement read busy', async () => {
    const body = deferred<unknown>();
    mockFetch.mockResolvedValueOnce({ ...response(null), json: () => body.promise });
    const screen = render(<ProductAnalyticsConsentGroup />);
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
    expect(screen.getByLabelText('Product analytics').props.disabled).toBe(true);
    expect(screen.getByLabelText('Product analytics').props.value).toBe(false);
    expect(mockFetch.mock.calls[0]?.[2].signal.aborted).toBe(true);
    await act(async () => {
      replacement.resolve(response(choice()));
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Product analytics').props.disabled).toBe(false),
    );
  });

  it('does not reconcile an old receipt or release the replacement operation', async () => {
    const screen = await readyScreen();
    const body = deferred<unknown>();
    mockFetch.mockResolvedValueOnce({ ...receipt(), json: () => body.promise });
    fireEvent(screen.getByLabelText('Product analytics'), 'valueChange', true);
    await act(async () => {});
    const replacement = deferred<ReturnType<typeof response>>();
    mockFetch.mockImplementationOnce(() => replacement.promise);
    act(() => {
      mockBlur?.();
      mockFocus?.();
    });
    await act(async () => {
      body.resolve({ noticeVersion: notice, recorded: [decision(true)] });
    });
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(screen.getByLabelText('Product analytics').props.disabled).toBe(true);
    await act(async () => {
      replacement.resolve(response(choice()));
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Product analytics').props.disabled).toBe(false),
    );
  });

  it('does not reconcile or publish a failed write after unmount', async () => {
    const screen = await readyScreen();
    const pending = deferred<ReturnType<typeof response>>();
    mockFetch.mockImplementationOnce(() => pending.promise);
    fireEvent(screen.getByLabelText('Product analytics'), 'valueChange', true);
    screen.unmount();
    await act(async () => {
      pending.reject(new Error('lost response'));
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(postCalls()[0]?.[2].signal.aborted).toBe(true);
  });

  it('preserves acknowledged server-adjusted denial when readback fails and offers a working read retry', async () => {
    const screen = await readyScreen();
    const saved = ownerHandler(screen.getByLabelText('Product analytics'), 'onValueChange');
    mockFetch.mockResolvedValueOnce(receipt(false)).mockRejectedValueOnce(new Error('read failed'));
    act(() => saved(true));
    await waitFor(() =>
      expect(screen.getByText(/Product analytics was saved as off, but/)).toBeTruthy(),
    );
    expect(screen.getByLabelText('Product analytics').props.value).toBe(false);
    expect(screen.getByLabelText('Product analytics').props.disabled).toBe(true);
    act(() => saved(true));
    expect(postCalls()).toHaveLength(1);
    fireEvent.press(screen.getByLabelText('Retry loading analytics choice'));
    await waitFor(() =>
      expect(screen.getByLabelText('Product analytics').props.disabled).toBe(false),
    );
    expect(postCalls()).toHaveLength(1);
  });

  it.each(['lost response', 'invalid receipt'])(
    'reconciles %s without retrying the POST',
    async (failure) => {
      const screen = await readyScreen();
      if (failure === 'lost response') mockFetch.mockRejectedValueOnce(new Error('lost'));
      else mockFetch.mockResolvedValueOnce(response({}));
      mockFetch.mockResolvedValueOnce(response(choice(true)));
      fireEvent(screen.getByLabelText('Product analytics'), 'valueChange', true);
      await waitFor(() => expect(screen.getByText(/The save could not be confirmed/)).toBeTruthy());
      expect(screen.getByLabelText('Product analytics').props.value).toBe(true);
      expect(screen.getByLabelText('Product analytics').props.disabled).toBe(false);
      expect(postCalls()).toHaveLength(1);
    },
  );

  it('keeps an uncertain save unavailable when reconciliation fails until an explicit read succeeds', async () => {
    const screen = await readyScreen();
    const saved = ownerHandler(screen.getByLabelText('Product analytics'), 'onValueChange');
    mockFetch
      .mockRejectedValueOnce(new Error('lost write response'))
      .mockRejectedValueOnce(new Error('read unavailable'));
    act(() => saved(true));
    await waitFor(() =>
      expect(screen.getByLabelText('Retry loading analytics choice')).toBeTruthy(),
    );
    expect(screen.getByText(/The save could not be confirmed/)).toBeTruthy();
    expect(screen.queryByText(/was saved as/)).toBeNull();
    expect(screen.getByLabelText('Product analytics').props.disabled).toBe(true);
    act(() => saved(false));
    expect(postCalls()).toHaveLength(1);
    mockFetch.mockResolvedValueOnce(response(choice(true)));
    fireEvent.press(screen.getByLabelText('Retry loading analytics choice'));
    await waitFor(() =>
      expect(screen.getByLabelText('Product analytics').props.disabled).toBe(false),
    );
    expect(screen.getByLabelText('Product analytics').props.value).toBe(true);
    expect(postCalls()).toHaveLength(1);
  });

  it('requires a refreshed notice and a fresh choice after 409', async () => {
    const screen = await readyScreen();
    const saved = ownerHandler(screen.getByLabelText('Product analytics'), 'onValueChange');
    mockFetch
      .mockResolvedValueOnce(response({}, 409))
      .mockResolvedValueOnce(response(choice(false, '2026-11-01')));
    act(() => saved(true));
    await waitFor(() => expect(screen.getByText(/The privacy notice changed/)).toBeTruthy());
    act(() => saved(true));
    expect(postCalls()).toHaveLength(1);
    mockFetch.mockResolvedValueOnce(
      response({
        noticeVersion: '2026-11-01',
        recorded: [decision(true)],
      }),
    );
    fireEvent(screen.getByLabelText('Product analytics'), 'valueChange', true);
    expect(JSON.parse(postCalls()[1]?.[1].body).noticeVersion).toBe('2026-11-01');
    await waitFor(() =>
      expect(screen.getByLabelText('Product analytics').props.disabled).toBe(false),
    );
  });

  it('leaves malformed GET unavailable and consumes duplicate read retries synchronously', async () => {
    mockFetch.mockResolvedValueOnce(response({}));
    const screen = render(<ProductAnalyticsConsentGroup />);
    await waitFor(() =>
      expect(screen.getByLabelText('Retry loading analytics choice')).toBeTruthy(),
    );
    expect(screen.getByLabelText('Product analytics').props.disabled).toBe(true);
    const retry = ownerHandler(screen.getByLabelText('Retry loading analytics choice'), 'onPress');
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
      expect(screen.getByLabelText('Product analytics').props.disabled).toBe(false),
    );
    act(() => retry());
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

type ImportedModule0 = typeof import('react');
type ImportedModule1 = typeof import('zustand');
type ImportedModule2 = typeof import('react-native');
