import type { ReactTestInstance } from 'react-test-renderer';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, RefreshControl, Share } from 'react-native';

function retainedPress(node: ReactTestInstance): () => void {
  for (let current: ReactTestInstance | null = node; current; current = current.parent) {
    const callback: unknown = current.props.onPress;
    if (typeof callback === 'function') return callback as () => void;
  }
  throw new Error('No press callback on the rendered control');
}

const mockGet = jest.fn();
const mockDelete = jest.fn();
const mockFocusCallbacks: Array<() => void | (() => void)> = [];
let mockBlur: (() => void) | undefined;

jest.mock('@/src/features/auth/store', () => {
  const { create } = jest.requireActual<ImportedModule0>('zustand');
  return {
    useAuthStore: create(() => ({ clerkUserId: 'fixture-account', isClerkSignedIn: true })),
  };
});

jest.mock('@/services/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    canGoBack: jest.fn(() => true),
    back: jest.fn(),
    navigate: jest.fn(),
  }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<ImportedModule1>('react');
    useEffect(() => {
      let active = true;
      let cleanup: (() => void) | undefined;
      const blur = () => {
        cleanup?.();
        cleanup = undefined;
      };
      const focus = () => {
        if (!active) return;
        blur();
        const next = callback();
        cleanup = typeof next === 'function' ? next : undefined;
        mockBlur = blur;
        return blur;
      };
      mockFocusCallbacks.push(focus);
      focus();
      return () => {
        active = false;
        blur();
        if (mockBlur === blur) mockBlur = undefined;
      };
    }, [callback]);
  },
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/src/ui/theme', () => {
  const tokens = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...tokens,
    useTheme: () => ({ statusBarStyle: 'dark', colors: tokens.lightColors }),
    useThemeColors: () => tokens.lightColors,
  };
});

import SharedLinksScreen from '../app/(app)/settings/shared-links';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useAuthStore } from '../src/features/auth/store';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const share = {
  token: 'tok-1',
  title: 'Planning session',
  shareUrl: 'https://example.test/share/tok-1',
  modelId: 'model-a',
  provider: 'provider-a',
  messageCount: 3,
  createdAt: '2026-07-01T00:00:00.000Z',
  expiresAt: '2026-08-01T00:00:00.000Z',
  expired: false,
};

describe('Shared links screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockReset();
    mockDelete.mockReset();
    mockFocusCallbacks.length = 0;
    mockBlur = undefined;
    __resetCloudAccountSessionForTests();
    activateCloudAccount('fixture-account');
    useAuthStore.setState({ clerkUserId: 'fixture-account', isClerkSignedIn: true });
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  afterEach(() => jest.restoreAllMocks());

  it('is titled in sentence case on the settings shell', async () => {
    mockGet.mockResolvedValue({ shares: [], complete: true });
    render(<SharedLinksScreen />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    expect(screen.getByText('Shared links')).toBeTruthy();
    expect(screen.getByLabelText('Go back')).toBeTruthy();
  });

  it('centres the empty state in the space below the header', async () => {
    mockGet.mockResolvedValue({ shares: [], complete: true });
    render(<SharedLinksScreen />);

    const empty = await screen.findByTestId('shared-links-empty');

    expect(empty.props.style).toMatchObject({ flex: 1, justifyContent: 'center' });
    expect(screen.getByText('No shared links yet')).toBeTruthy();
    expect(screen.queryByTestId('shared-links-incomplete')).toBeNull();
  });

  it('says a truncated list may be missing links', async () => {
    mockGet.mockResolvedValue({ shares: [share], complete: false });
    render(<SharedLinksScreen />);

    expect(await screen.findByText('Planning session')).toBeTruthy();
    expect(screen.getByTestId('shared-links-incomplete')).toBeTruthy();
    expect(screen.getByText(/Some older links may be missing\./u)).toBeTruthy();
  });

  it('does not claim nothing is shared when the server did not confirm the list is complete', async () => {
    mockGet.mockResolvedValue({ shares: [] });
    render(<SharedLinksScreen />);

    expect(await screen.findByTestId('shared-links-incomplete')).toBeTruthy();
    expect(screen.queryByText('No shared links yet')).toBeNull();
    expect(screen.queryByTestId('shared-links-empty')).toBeNull();
  });

  it('reloads the links when the screen regains focus, so a new share appears without a pull', async () => {
    mockGet.mockResolvedValueOnce({ shares: [], complete: true });
    render(<SharedLinksScreen />);
    expect(await screen.findByText('No shared links yet')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledTimes(1);

    mockGet.mockResolvedValueOnce({ shares: [share] });
    const refocus = mockFocusCallbacks[mockFocusCallbacks.length - 1];
    await act(async () => {
      refocus?.();
    });
    expect(mockGet).toHaveBeenCalledTimes(2);

    expect(await screen.findByText('Planning session')).toBeTruthy();
    expect(screen.queryByText('No shared links yet')).toBeNull();
  });

  it('does not publish a delayed Cloud list after switching to Local mode', async () => {
    const read = deferred<{ shares: (typeof share)[] }>();
    mockGet.mockReturnValueOnce(read.promise);
    render(<SharedLinksScreen />);
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
    const signal = mockGet.mock.calls[0][1].signal as AbortSignal;

    act(() => useChatAppModeStore.setState({ appMode: 'local' }));
    await act(async () => {
      read.resolve({ shares: [share] });
    });

    expect(signal.aborted).toBe(true);
    expect(screen.getByText('Chat is set to Local Mode')).toBeTruthy();
    expect(screen.queryByText(share.title)).toBeNull();
    expect(screen.queryByText('Could not load shared links')).toBeNull();
  });

  it('ignores a blurred load failure after a refocused list succeeds', async () => {
    const old = deferred<{ shares: (typeof share)[] }>();
    mockGet.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ shares: [share] });
    render(<SharedLinksScreen />);
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
    act(() => mockBlur?.());
    await act(async () => {
      mockFocusCallbacks.at(-1)?.();
    });
    expect(await screen.findByText(share.title)).toBeTruthy();
    await act(async () => {
      old.reject(new Error('late read failure'));
    });
    expect(screen.getByText(share.title)).toBeTruthy();
    expect(screen.queryByText('Could not load shared links')).toBeNull();
  });

  it('only the latest refresh owns rows and the refresh spinner', async () => {
    const old = deferred<{ shares: (typeof share)[] }>();
    const latest = deferred<{ shares: (typeof share)[] }>();
    mockGet
      .mockResolvedValueOnce({ shares: [share] })
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(latest.promise);
    const view = render(<SharedLinksScreen />);
    await screen.findByText(share.title);
    act(() => view.UNSAFE_getByType(RefreshControl).props.onRefresh());
    act(() => view.UNSAFE_getByType(RefreshControl).props.onRefresh());
    await act(async () => {
      old.resolve({ shares: [] });
    });
    expect(view.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(true);
    await act(async () => {
      latest.resolve({ shares: [{ ...share, title: 'Newest list' }] });
    });
    expect(screen.getByText('Newest list')).toBeTruthy();
    expect(view.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(false);
  });

  it('retires a saved revoke confirmation across an account round trip', async () => {
    mockGet.mockResolvedValue({ shares: [share] });
    const alerts = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    render(<SharedLinksScreen />);
    fireEvent.press(await screen.findByLabelText(`Revoke link to ${share.title}`));
    const confirm = alerts.mock.calls[0][2]?.find((button) => button.text === 'Revoke')?.onPress;
    act(() => {
      activateCloudAccount('replacement-account');
      activateCloudAccount('fixture-account');
    });
    act(() => confirm?.());
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it.each(['local', 'blur', 'unmount', 'cancel'] as const)(
    'refuses a saved revoke confirmation after %s retirement',
    async (boundary) => {
      mockGet.mockResolvedValue({ shares: [share] });
      const alerts = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      const view = render(<SharedLinksScreen />);
      fireEvent.press(await screen.findByLabelText(`Revoke link to ${share.title}`));
      const buttons = alerts.mock.calls[0][2];
      const confirm = buttons?.find((button) => button.text === 'Revoke')?.onPress;
      if (boundary === 'unmount') view.unmount();
      act(() => {
        if (boundary === 'local') {
          useChatAppModeStore.setState({ appMode: 'local' });
          useChatAppModeStore.setState({ appMode: 'cloud' });
        } else if (boundary === 'blur') {
          mockBlur?.();
          mockFocusCallbacks.at(-1)?.();
        } else if (boundary === 'cancel') {
          buttons?.find((button) => button.text === 'Cancel')?.onPress?.();
        }
        confirm?.();
      });
      expect(mockDelete).not.toHaveBeenCalled();
    },
  );

  it('keeps the confirmed token across a same-owner refresh', async () => {
    const refresh = deferred<{ shares: (typeof share)[]; complete: boolean }>();
    mockGet.mockResolvedValueOnce({ shares: [share] }).mockReturnValueOnce(refresh.promise);
    mockDelete.mockResolvedValueOnce({ success: true });
    const alerts = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = render(<SharedLinksScreen />);
    fireEvent.press(await screen.findByLabelText(`Revoke link to ${share.title}`));
    const confirm = alerts.mock.calls[0][2]?.find((button) => button.text === 'Revoke')?.onPress;
    act(() => view.UNSAFE_getByType(RefreshControl).props.onRefresh());
    await act(async () => {
      refresh.resolve({ shares: [], complete: true });
    });
    await act(async () => {
      confirm?.();
    });
    expect(mockDelete).toHaveBeenCalledWith(
      '/api/share/tok-1',
      expect.objectContaining({
        accountEpoch: mockGet.mock.calls[0][1].accountEpoch,
      }),
    );
    expect(screen.getByText('No shared links yet')).toBeTruthy();
  });

  it.each(['resolve', 'reject'] as const)(
    'keeps replacement account rows after an old list %s',
    async (outcome) => {
      const old = deferred<{ shares: (typeof share)[] }>();
      mockGet.mockReturnValueOnce(old.promise).mockResolvedValue({
        shares: [{ ...share, title: 'Replacement account list' }],
      });
      render(<SharedLinksScreen />);
      await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
      act(() => {
        activateCloudAccount('replacement-account');
        useAuthStore.setState({ clerkUserId: 'replacement-account' });
      });
      await screen.findByText('Replacement account list');
      await act(async () => {
        if (outcome === 'resolve') old.resolve({ shares: [share] });
        else old.reject(new Error('old account read failed'));
      });
      expect(screen.getByText('Replacement account list')).toBeTruthy();
      expect(screen.queryByText(share.title)).toBeNull();
      expect(screen.queryByText('Could not load shared links')).toBeNull();
    },
  );

  it.each(['local', 'account', 'blur', 'unmount'] as const)(
    'refuses a saved native-share callback after %s retirement',
    async (boundary) => {
      mockGet.mockResolvedValue({ shares: [share] });
      const nativeShare = jest
        .spyOn(Share, 'share')
        .mockResolvedValue({ action: Share.sharedAction });
      const view = render(<SharedLinksScreen />);
      const press = retainedPress(await screen.findByLabelText(`Share link to ${share.title}`));
      act(() => {
        if (boundary === 'local') {
          useChatAppModeStore.setState({ appMode: 'local' });
          useChatAppModeStore.setState({ appMode: 'cloud' });
        } else if (boundary === 'account') {
          activateCloudAccount('replacement-account');
          useAuthStore.setState({ clerkUserId: 'replacement-account' });
        } else if (boundary === 'blur') {
          mockBlur?.();
        } else {
          view.unmount();
        }
      });
      await act(async () => {
        await press();
      });
      expect(nativeShare).not.toHaveBeenCalled();
    },
  );

  it('shares a current non-expired row through the native sheet', async () => {
    mockGet.mockResolvedValue({ shares: [share] });
    const nativeShare = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: Share.sharedAction });
    render(<SharedLinksScreen />);
    fireEvent.press(await screen.findByLabelText(`Share link to ${share.title}`));
    expect(nativeShare).toHaveBeenCalledWith({ message: share.shareUrl });
  });

  it('uses the confirmed original epoch and admits only one revoke', async () => {
    const deletion = deferred<{ success: true }>();
    mockGet.mockResolvedValue({ shares: [share], complete: true });
    mockDelete.mockReturnValueOnce(deletion.promise);
    const alerts = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    render(<SharedLinksScreen />);
    fireEvent.press(await screen.findByLabelText(`Revoke link to ${share.title}`));
    const confirm = alerts.mock.calls[0][2]?.find((button) => button.text === 'Revoke')?.onPress;
    act(() => {
      confirm?.();
      confirm?.();
    });
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledWith(
      '/api/share/tok-1',
      expect.objectContaining({
        accountEpoch: mockGet.mock.calls[0][1].accountEpoch,
        signal: expect.anything(),
      }),
    );
    await act(async () => {
      deletion.resolve({ success: true });
    });
    expect(screen.queryByText(share.title)).toBeNull();
    expect(screen.getByText('No shared links yet')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it.each(['resolve', 'reject'] as const)(
    'suppresses an old revoke %s after account replacement',
    async (outcome) => {
      const deletion = deferred<{ success: true }>();
      mockGet.mockResolvedValueOnce({ shares: [share] }).mockResolvedValue({ shares: [] });
      mockDelete.mockReturnValueOnce(deletion.promise);
      const alerts = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      render(<SharedLinksScreen />);
      fireEvent.press(await screen.findByLabelText(`Revoke link to ${share.title}`));
      const confirm = alerts.mock.calls[0][2]?.find((button) => button.text === 'Revoke')?.onPress;
      act(() => confirm?.());
      act(() => {
        activateCloudAccount('replacement-account');
        useAuthStore.setState({ clerkUserId: 'replacement-account' });
      });
      await act(async () => {
        if (outcome === 'resolve') deletion.resolve({ success: true });
        else deletion.reject(new Error('old deletion error'));
      });
      expect(alerts).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(share.title)).toBeNull();
      expect(screen.queryByText('Could not load shared links')).toBeNull();
    },
  );

  it('treats a revoke reply without success as unconfirmed instead of removing the row', async () => {
    mockGet.mockResolvedValue({ shares: [share], complete: true });
    mockDelete.mockResolvedValueOnce({});
    const alerts = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    render(<SharedLinksScreen />);
    fireEvent.press(await screen.findByLabelText(`Revoke link to ${share.title}`));
    const confirm = alerts.mock.calls[0][2]?.find((button) => button.text === 'Revoke')?.onPress;
    await act(async () => {
      confirm?.();
    });
    expect(alerts).toHaveBeenLastCalledWith(
      'Could not revoke',
      'Could not confirm whether the link was revoked. Refresh the list before trying again.',
    );
    expect(screen.queryByText('No shared links yet')).toBeNull();
  });

  it('labels who can open each link', async () => {
    mockGet.mockResolvedValue({
      shares: [
        share,
        { ...share, token: 'tok-2', title: 'Team notes', visibility: 'organization' },
      ],
      complete: true,
    });
    render(<SharedLinksScreen />);
    expect(await screen.findByText('Workspace only')).toBeTruthy();
    expect(screen.getByText('Anyone with the link')).toBeTruthy();
  });

  it('reports uncertain revocation without claiming the link is still active', async () => {
    mockGet.mockResolvedValue({ shares: [share] });
    mockDelete.mockRejectedValueOnce(new Error('response lost'));
    const alerts = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    render(<SharedLinksScreen />);
    fireEvent.press(await screen.findByLabelText(`Revoke link to ${share.title}`));
    const confirm = alerts.mock.calls[0][2]?.find((button) => button.text === 'Revoke')?.onPress;
    await act(async () => {
      confirm?.();
    });
    expect(alerts).toHaveBeenLastCalledWith(
      'Could not revoke',
      'Could not confirm whether the link was revoked. Refresh the list before trying again.',
    );
    expect(screen.queryByLabelText(`Revoke link to ${share.title}`)).toBeNull();
  });
});

type ImportedModule0 = typeof import('zustand');
type ImportedModule1 = typeof import('react');
