import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ME_ROUTING_PREFERENCES_PATH } from '@agiworkforce/cloud-contracts';
import { US_ONLY_ROUTING_TIERS, type BillingPlanTier } from '@agiworkforce/types';

const mockGet = jest.fn();
const mockPut = jest.fn();
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
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    put: (...args: unknown[]) => mockPut(...args),
  },
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
jest.mock('@/src/features/billing/store', () => {
  const { create } = jest.requireActual<ImportedModule1>('zustand');
  return { useTierStore: create(() => ({ tier: 'free' })) };
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
jest.mock('lucide-react-native', () => ({ MapPin: () => null }));

import { UsOnlyRoutingGroup } from '@/src/features/settings/cloud-privacy/UsOnlyRoutingGroup';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useTierStore } from '@/src/features/billing/store';
import {
  activateCloudAccount,
  captureCloudAccountEpoch,
  __resetCloudAccountSessionForTests,
} from '@/src/features/auth/services/cloudAccountSession';

const label = 'Only use AI providers based in the US';
const retry = 'Retry loading provider location';
const eligibleTier = US_ONLY_ROUTING_TIERS[0] as BillingPlanTier;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  mockGet.mockReset().mockResolvedValue({});
  mockPut.mockReset().mockResolvedValue({ us_only: true });
  mockFocus = undefined;
  mockBlur = undefined;
  __resetCloudAccountSessionForTests();
  activateCloudAccount('account-a');
  useAuthStore.setState({ clerkUserId: 'account-a', isClerkLoaded: true, isClerkSignedIn: true });
  useChatAppModeStore.setState({ appMode: 'cloud' });
  useTierStore.setState({ tier: eligibleTier });
});

async function readyScreen() {
  const screen = render(<UsOnlyRoutingGroup />);
  await waitFor(() => expect(screen.getByLabelText(label).props.disabled).toBe(false));
  return screen;
}

describe('owned provider location choices', () => {
  it('does not read without matching loaded Cloud account identity', () => {
    useAuthStore.setState({ clerkUserId: 'account-b' });
    const screen = render(<UsOnlyRoutingGroup />);
    expect(mockGet).not.toHaveBeenCalled();
    expect(screen.getByLabelText(label).props.disabled).toBe(true);
  });

  it('takes one synchronous lease and preserves the loaded geo overlay', async () => {
    mockGet.mockResolvedValue({ us_only: false, geo_overlay: 'in' });
    const screen = await readyScreen();
    const saved = screen.getByLabelText(label).props.onValueChange;
    const pending = deferred<unknown>();
    mockPut.mockImplementationOnce(() => pending.promise);
    act(() => {
      saved(true);
      saved(false);
    });
    expect(mockPut).toHaveBeenCalledTimes(1);
    expect(mockPut).toHaveBeenCalledWith(
      ME_ROUTING_PREFERENCES_PATH,
      { us_only: true, geo_overlay: 'in' },
      { accountEpoch: captureCloudAccountEpoch(), signal: expect.any(AbortSignal) },
    );
    expect(mockGet.mock.calls[0]).toEqual([
      ME_ROUTING_PREFERENCES_PATH,
      { accountEpoch: captureCloudAccountEpoch(), signal: expect.any(AbortSignal) },
    ]);
    mockGet.mockResolvedValue({ us_only: true, geo_overlay: 'in' });
    await act(async () => {
      pending.resolve({ us_only: true, geo_overlay: 'in' });
    });
    await waitFor(() => expect(screen.getByLabelText(label).props.disabled).toBe(false));
    act(() => saved(false));
    expect(mockPut).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(label).props.value).toBe(true);
  });

  it.each(['account', 'identity', 'mode', 'authentication', 'focus', 'tier'])(
    'retires a rendered callback when %s leaves and returns',
    async (kind) => {
      const screen = await readyScreen();
      const saved = screen.getByLabelText(label).props.onValueChange;
      act(() => {
        if (kind === 'account') {
          activateCloudAccount('account-b');
          activateCloudAccount('account-a');
        } else if (kind === 'identity') {
          useAuthStore.setState({ clerkUserId: 'account-b' });
          useAuthStore.setState({ clerkUserId: 'account-a' });
        } else if (kind === 'mode') {
          useChatAppModeStore.setState({ appMode: 'local' });
          useChatAppModeStore.setState({ appMode: 'cloud' });
        } else if (kind === 'authentication') {
          useAuthStore.setState({ isClerkSignedIn: false });
          useAuthStore.setState({ isClerkSignedIn: true });
        } else if (kind === 'tier') {
          useTierStore.setState({ tier: 'free' });
          useTierStore.setState({ tier: eligibleTier });
        } else {
          mockBlur?.();
          mockFocus?.();
        }
        saved(true);
      });
      await waitFor(() => expect(screen.getByLabelText(label).props.disabled).toBe(false));
      expect(mockPut).not.toHaveBeenCalled();
    },
  );

  it('refuses old callbacks immediately in Local mode or after eligibility is lost', async () => {
    const screen = await readyScreen();
    const saved = screen.getByLabelText(label).props.onValueChange;
    act(() => {
      useChatAppModeStore.setState({ appMode: 'local' });
      saved(true);
    });
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockPut).not.toHaveBeenCalled();
    expect(screen.getByLabelText(label).props.disabled).toBe(true);
    act(() => useChatAppModeStore.setState({ appMode: 'cloud' }));
    await waitFor(() => expect(screen.getByLabelText(label).props.disabled).toBe(false));
    const current = screen.getByLabelText(label).props.onValueChange;
    act(() => {
      useTierStore.setState({ tier: 'free' });
      current(true);
    });
    await act(async () => {});
    expect(mockPut).not.toHaveBeenCalled();
    expect(screen.getByLabelText(label).props.disabled).toBe(true);
  });

  it.each([
    { body: null },
    { body: [] },
    { body: { us_only: 'yes' } },
    { body: { geo_overlay: 'mars' } },
  ])('rejects a malformed successful read: $body', async ({ body }) => {
    mockGet.mockResolvedValueOnce(body);
    const screen = render(<UsOnlyRoutingGroup />);
    await waitFor(() => expect(screen.getByLabelText(retry)).toBeTruthy());
    expect(screen.getByLabelText(label).props.disabled).toBe(true);
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('keeps a failed read disabled and retries only the read, admitting authoritative absence', async () => {
    mockGet.mockRejectedValueOnce(new Error('HTTP 500'));
    const screen = render(<UsOnlyRoutingGroup />);
    await waitFor(() => expect(screen.getByLabelText(retry)).toBeTruthy());
    act(() => screen.getByLabelText(label).props.onValueChange(true));
    expect(mockPut).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText(retry));
    await waitFor(() => expect(screen.getByLabelText(label).props.disabled).toBe(false));
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockPut).not.toHaveBeenCalled();
    fireEvent(screen.getByLabelText(label), 'valueChange', true);
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
  });

  it.each(['focus', 'tier'])('cannot publish an old read after a %s transition', async (kind) => {
    const old = deferred<unknown>();
    mockGet.mockImplementationOnce(() => old.promise);
    const screen = render(<UsOnlyRoutingGroup />);
    const replacement = deferred<unknown>();
    if (kind === 'tier') mockGet.mockResolvedValueOnce({});
    mockGet.mockImplementationOnce(() => replacement.promise);
    act(() => {
      if (kind === 'focus') {
        mockBlur?.();
        mockFocus?.();
      } else {
        useTierStore.setState({ tier: 'free' });
        useTierStore.setState({ tier: eligibleTier });
      }
    });
    await act(async () => {
      old.resolve({ us_only: true });
    });
    expect(screen.getByLabelText(label).props.disabled).toBe(true);
    expect(screen.getByLabelText(label).props.value).toBe(false);
    expect(mockGet.mock.calls[0]?.[1].signal.aborted).toBe(true);
    await act(async () => {
      replacement.resolve({});
    });
    await waitFor(() => expect(screen.getByLabelText(label).props.disabled).toBe(false));
  });

  it.each(['focus', 'tier'])(
    'does not reconcile a write retired by a %s transition',
    async (kind) => {
      const screen = await readyScreen();
      const old = deferred<unknown>();
      mockPut.mockImplementationOnce(() => old.promise);
      fireEvent(screen.getByLabelText(label), 'valueChange', true);
      const replacement = deferred<unknown>();
      if (kind === 'tier') mockGet.mockResolvedValueOnce({});
      mockGet.mockImplementationOnce(() => replacement.promise);
      act(() => {
        if (kind === 'focus') {
          mockBlur?.();
          mockFocus?.();
        } else {
          useTierStore.setState({ tier: 'free' });
          useTierStore.setState({ tier: eligibleTier });
        }
      });
      await act(async () => {
        old.resolve({ us_only: true });
      });
      expect(mockGet).toHaveBeenCalledTimes(kind === 'focus' ? 2 : 3);
      expect(screen.getByLabelText(label).props.disabled).toBe(true);
      expect(mockPut.mock.calls[0]?.[2].signal.aborted).toBe(true);
      await act(async () => {
        replacement.resolve({});
      });
      await waitFor(() => expect(screen.getByLabelText(label).props.disabled).toBe(false));
    },
  );

  it('preserves the acknowledged boolean when readback fails', async () => {
    const screen = await readyScreen();
    mockPut.mockResolvedValueOnce({ us_only: false });
    mockGet.mockRejectedValueOnce(new Error('read unavailable'));
    fireEvent(screen.getByLabelText(label), 'valueChange', true);
    await waitFor(() => expect(screen.getByText(/was saved as off/)).toBeTruthy());
    expect(screen.getByLabelText(label).props.value).toBe(false);
    expect(screen.getByLabelText(label).props.disabled).toBe(true);
    expect(mockPut).toHaveBeenCalledTimes(1);
  });

  it.each(['lost response', 'invalid receipt'])(
    'keeps %s uncertain and never retries a write automatically',
    async (kind) => {
      const screen = await readyScreen();
      if (kind === 'lost response') mockPut.mockRejectedValueOnce(new Error('response lost'));
      else mockPut.mockResolvedValueOnce({});
      mockGet.mockRejectedValueOnce(new Error('read unavailable'));
      fireEvent(screen.getByLabelText(label), 'valueChange', true);
      await waitFor(() => expect(screen.getByText(/save could not be confirmed/)).toBeTruthy());
      expect(screen.getByLabelText(label).props.disabled).toBe(true);
      expect(mockPut).toHaveBeenCalledTimes(1);
      fireEvent.press(screen.getByLabelText(retry));
      await waitFor(() => expect(screen.getByLabelText(label).props.disabled).toBe(false));
      expect(mockPut).toHaveBeenCalledTimes(1);
    },
  );

  it('does not reconcile or publish a rejected write after unmount', async () => {
    const screen = await readyScreen();
    const pending = deferred<unknown>();
    mockPut.mockImplementationOnce(() => pending.promise);
    fireEvent(screen.getByLabelText(label), 'valueChange', true);
    screen.unmount();
    await act(async () => {
      pending.reject(new Error('response lost'));
    });
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockPut.mock.calls[0]?.[2].signal.aborted).toBe(true);
  });

  it('reconciles a lost write response from the server without repeating the write', async () => {
    const screen = await readyScreen();
    mockPut.mockRejectedValueOnce(new Error('response lost'));
    mockGet.mockResolvedValueOnce({ us_only: true, geo_overlay: 'us' });
    fireEvent(screen.getByLabelText(label), 'valueChange', true);
    await waitFor(() => expect(screen.getByLabelText(label).props.disabled).toBe(false));
    expect(screen.getByLabelText(label).props.value).toBe(true);
    expect(screen.getByText(/save could not be confirmed/)).toBeTruthy();
    expect(mockPut).toHaveBeenCalledTimes(1);
  });
});

type ImportedModule0 = typeof import('react');
type ImportedModule1 = typeof import('zustand');
type ImportedModule2 = typeof import('react-native');
