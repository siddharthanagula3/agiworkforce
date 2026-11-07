import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockParams: { token?: string } = {};
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPatch = jest.fn();
const mockDelete = jest.fn();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
    replace: mockReplace,
    navigate: jest.fn(),
    canGoBack: jest.fn(() => true),
  }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@clerk/expo', () => ({ getClerkInstance: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: () => jest.fn().mockReturnValue(null) }),
);
jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((callback: () => void) => callback()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: { getItem: jest.fn(() => null), setItem: jest.fn(), removeItem: jest.fn() },
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
}));
jest.mock('@/lib/safeOpenURL', () => ({ openUntrustedUrlInAppBrowser: jest.fn() }));
jest.mock('@/services/api', () => ({
  ApiHttpError: jest.requireActual('@/services/apiErrors').ApiHttpError,
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { SiteDetailScreen } from '../SiteDetailScreen';
import { SitesScreen } from '../SitesScreen';
import { Button } from '@/components/ui/Button';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const authorityOptions = () => expect.objectContaining({
  accountEpoch: expect.objectContaining({ ownerId: 'user-1', epoch: expect.any(Number) }),
  signal: expect.anything(),
  auth401Recovery: 'caller-owned',
});

const SITE = {
  token: 'tok_1',
  artifactId: 'art-1',
  conversationId: 'conv-1',
  title: 'Pricing calculator',
  kind: 'html',
  language: 'html',
  contentChars: 2000,
  version: 2,
  visibility: 'public',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
  shareUrl: 'https://agiworkforce.com/shared-artifact/tok_1',
  sandboxed: true,
};

function routeGet(path: string) {
  if (path === '/api/artifacts/publish') {
    return Promise.resolve({ artifacts: [SITE], workspace: { memberCount: 4 } });
  }
  if (path.endsWith('/versions')) {
    return Promise.resolve({
      versions: [
        {
          version: 2,
          title: 'Pricing calculator',
          kind: 'html',
          createdAt: SITE.updatedAt,
          live: true,
        },
        { version: 1, title: 'Pricing', kind: 'html', createdAt: SITE.createdAt, live: false },
      ],
    });
  }
  if (path.endsWith('/versions/1')) {
    return Promise.resolve({
      version: 1,
      title: 'Pricing',
      kind: 'html',
      language: 'html',
      content: '<p>v1</p>',
    });
  }
  if (path.endsWith('/data')) {
    return Promise.resolve({
      supported: true,
      shared: {
        entries: [
          {
            key: 'votes',
            bytes: 12,
            preview: '{"a":3}',
            truncated: false,
            updatedAt: SITE.updatedAt,
          },
        ],
        entryCount: 1,
        totalBytes: 12,
        limitBytes: 1048576,
      },
      ownPersonalEntryCount: 0,
    });
  }
  return Promise.reject(new Error(`unexpected ${path}`));
}

describe('published sites on mobile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockReset();
    mockPost.mockReset();
    mockPatch.mockReset();
    mockDelete.mockReset();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('user-1');
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: 'user-1' });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    mockGet.mockImplementation(routeGet);
    mockParams.token = 'tok_1';
  });

  it('loads after StrictMode effect replay', async () => {
    const screen = render(<React.StrictMode><SiteDetailScreen /></React.StrictMode>);
    expect((await screen.findByLabelText('Site name')).props.value).toBe(SITE.title);
  });

  it('does not request or keep loading for an empty token', async () => {
    delete mockParams.token;
    const screen = render(<SiteDetailScreen />);
    expect(await screen.findByText('This site is not available')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('does not request for deliberately unavailable cloud access', () => {
    useChatAppModeStore.setState({ appMode: 'local' });
    const screen = render(<SiteDetailScreen />);
    expect(screen.queryByLabelText('Site name')).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it.each(['token', 'mode', 'account', 'auth'] as const)(
    'retires deferred list reads across a %s round trip', async (transition) => {
      const old = deferred<unknown>();
      mockGet.mockImplementationOnce(() => old.promise);
      const screen = render(<SiteDetailScreen />);
      const oldOptions = mockGet.mock.calls[0]?.[1];
      act(() => {
        if (transition === 'token') {
          mockParams.token = 'another-token';
          screen.rerender(<SiteDetailScreen />);
        } else if (transition === 'mode') {
          useChatAppModeStore.setState({ appMode: 'local' });
          useChatAppModeStore.setState({ appMode: 'cloud' });
        } else if (transition === 'account') {
          activateCloudAccount('user-2');
          activateCloudAccount('user-1');
        } else {
          useAuthStore.setState({ isClerkSignedIn: false });
          useAuthStore.setState({ isClerkSignedIn: true });
        }
      });
      if (transition === 'token') {
        act(() => {
          mockParams.token = 'tok_1';
          screen.rerender(<SiteDetailScreen />);
        });
      }
      expect(oldOptions.signal.aborted).toBe(true);
      await screen.findByLabelText('Site name');
      const requests = mockGet.mock.calls.length;
      await act(async () => {
        old.resolve({ artifacts: [{ ...SITE, title: 'Obsolete title' }] });
      });
      expect(screen.getByLabelText('Site name').props.value).toBe(SITE.title);
      expect(mockGet).toHaveBeenCalledTimes(requests);
    },
  );

  it('reconciles account changes between render and layout subscription', async () => {
    function TransitionInLayout() {
      React.useLayoutEffect(() => {
        activateCloudAccount('user-2');
        activateCloudAccount('user-1');
      }, []);
      return null;
    }
    const screen = render(<><TransitionInLayout /><SiteDetailScreen /></>);
    await screen.findByLabelText('Site name');
    expect(mockGet.mock.calls[0]?.[1].accountEpoch).toEqual({ ownerId: 'user-1', epoch: 3 });
  });

  it('restarts for a ready-to-ready account switch and refuses mismatched runtime ownership', async () => {
    const screen = render(<SiteDetailScreen />);
    await screen.findByLabelText('Site name');
    mockGet.mockClear();
    act(() => useAuthStore.setState({ clerkUserId: 'user-2' }));
    expect(screen.queryByLabelText('Site name')).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
    act(() => activateCloudAccount('user-2'));
    await screen.findByLabelText('Site name');
    expect(mockGet.mock.calls[0]?.[1].accountEpoch.ownerId).toBe('user-2');
  });

  it.each(['resolve', 'reject'] as const)('does not commit retired child read %s fallbacks', async (outcome) => {
    const versions = deferred<unknown>();
    const data = deferred<unknown>();
    mockGet.mockImplementation((path: string) => {
      if (path.endsWith('/versions')) return versions.promise;
      if (path.endsWith('/data')) return data.promise;
      return routeGet(path);
    });
    const screen = render(<SiteDetailScreen />);
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(3));
    mockGet.mockImplementation(routeGet);
    act(() => {
      useChatAppModeStore.setState({ appMode: 'local' });
      useChatAppModeStore.setState({ appMode: 'cloud' });
    });
    await screen.findByLabelText('Put version 1 live');
    await act(async () => {
      if (outcome === 'resolve') {
        versions.resolve({ versions: [] });
        data.resolve({ supported: false });
      } else {
        versions.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        data.reject(new Error('old data failure'));
      }
    });
    expect(screen.getByLabelText('Put version 1 live')).toBeTruthy();
    expect(screen.getByText('Clear shared data')).toBeTruthy();
  });

  it('keeps optional read failure fallbacks in a current view', async () => {
    mockGet.mockImplementation((path: string) => path === '/api/artifacts/publish'
      ? routeGet(path) : Promise.reject(new Error('optional read unavailable')));
    const screen = render(<SiteDetailScreen />);
    await screen.findByLabelText('Site name');
    expect(screen.queryByText('Publish history')).toBeNull();
    expect(screen.queryByText('Clear shared data')).toBeNull();
  });

  it.each(['token', 'mode', 'account', 'unmount'] as const)(
    'rejects captured controls and confirmed intent after %s retirement', async (transition) => {
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      try {
        const screen = render(<SiteDetailScreen />);
        fireEvent.press(await screen.findByText('Unpublish'));
        const confirm = alert.mock.calls[0]?.[2]?.find((button) => button.style === 'destructive')?.onPress;
        const rename = screen.UNSAFE_getAllByType(Button).find((button) => button.props.title === 'Rename')?.props.onPress;
        act(() => {
          if (transition === 'token') {
            mockParams.token = 'another-token';
            screen.rerender(<SiteDetailScreen />);
          } else if (transition === 'mode') {
            useChatAppModeStore.setState({ appMode: 'local' });
            useChatAppModeStore.setState({ appMode: 'cloud' });
          } else if (transition === 'account') {
            activateCloudAccount('user-2');
            activateCloudAccount('user-1');
          } else screen.unmount();
        });
        await act(async () => { confirm?.(); rename?.(); });
        expect(mockDelete).not.toHaveBeenCalled();
        expect(mockPatch).not.toHaveBeenCalled();
        expect(mockReplace).not.toHaveBeenCalled();
      } finally { alert.mockRestore(); }
    },
  );

  it.each(['resolve', 'reject'] as const)('ignores stale mutation %s and finalization', async (outcome) => {
    const old = deferred<unknown>();
    const current = deferred<unknown>();
    mockPatch.mockImplementationOnce(() => old.promise).mockImplementationOnce(() => current.promise);
    const screen = render(<SiteDetailScreen />);
    fireEvent.press(await screen.findByText('Only your workspace'));
    act(() => {
      useChatAppModeStore.setState({ appMode: 'local' });
      useChatAppModeStore.setState({ appMode: 'cloud' });
    });
    fireEvent.press(await screen.findByText('Only your workspace'));
    const requests = mockGet.mock.calls.length;
    await act(async () => {
      if (outcome === 'resolve') old.resolve({ token: SITE.token, shareUrl: SITE.shareUrl,
        title: SITE.title, visibility: 'organization', organizationId: 'org-1', updatedAt: SITE.updatedAt });
      else old.reject(new Error('retired mutation failed'));
    });
    expect(mockGet).toHaveBeenCalledTimes(requests);
    expect(screen.queryByText('Could not change who can open this.')).toBeNull();
    expect(screen.UNSAFE_getAllByType(Button).find((button) => button.props.title === 'Unpublish')?.props.disabled).toBe(true);
    screen.unmount();
    await act(async () => current.reject(new Error('retired current mutation')));
  });

  it('admits one confirmation at a time and releases it on cancel', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    try {
      const screen = render(<SiteDetailScreen />);
      const unpublish = await screen.findByText('Unpublish');
      act(() => {
        fireEvent.press(unpublish);
        fireEvent.press(unpublish);
        fireEvent.press(screen.getByText('Clear shared data'));
        fireEvent.press(screen.getByText('Only your workspace'));
      });
      expect(alert).toHaveBeenCalledTimes(1);
      expect(mockPatch).not.toHaveBeenCalled();
      await act(async () => alert.mock.calls[0]?.[2]?.find((button) => button.style === 'cancel')?.onPress?.());
      fireEvent.press(unpublish);
      expect(alert).toHaveBeenCalledTimes(2);
      expect(mockDelete).not.toHaveBeenCalled();
    } finally { alert.mockRestore(); }
  });

  it('does not continue clear-then-delete or navigate after retirement', async () => {
    const cleared = deferred<unknown>();
    mockDelete.mockImplementationOnce(() => cleared.promise);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    try {
      const screen = render(<SiteDetailScreen />);
      fireEvent.press(await screen.findByText('Delete site and its data'));
      await act(async () => alert.mock.calls[0]?.[2]?.find((button) => button.style === 'destructive')?.onPress?.());
      expect(mockDelete).toHaveBeenCalledTimes(1);
      act(() => {
        useChatAppModeStore.setState({ appMode: 'local' });
        useChatAppModeStore.setState({ appMode: 'cloud' });
      });
      await screen.findByLabelText('Site name');
      await act(async () => cleared.resolve({ cleared: 1 }));
      expect(mockDelete).toHaveBeenCalledTimes(1);
      expect(mockReplace).not.toHaveBeenCalled();
    } finally { alert.mockRestore(); }
  });

  it('lists what is published with who can open it', async () => {
    const { findByLabelText } = render(<SitesScreen />);
    fireEvent.press(await findByLabelText('Pricing calculator. Anyone with the link'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/sites/[token]',
      params: { token: 'tok_1' },
    });
  });

  it('limits a site to the workspace and renames it', async () => {
    mockPatch.mockResolvedValue({
      token: 'tok_1',
      shareUrl: SITE.shareUrl,
      title: 'Pricing',
      visibility: 'organization',
      organizationId: 'org-1',
      updatedAt: SITE.updatedAt,
    });
    const { findByText, findByLabelText, getByText } = render(<SiteDetailScreen />);
    fireEvent.press(await findByText('Only your workspace'));
    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith('/api/artifacts/publish/tok_1', {
        visibility: 'organization',
      }, authorityOptions()),
    );
    fireEvent.changeText(await findByLabelText('Site name'), 'Pricing tool');
    fireEvent.press(getByText('Rename'));
    await waitFor(() =>
      expect(mockPatch).toHaveBeenLastCalledWith('/api/artifacts/publish/tok_1', {
        title: 'Pricing tool',
      }, authorityOptions()),
    );
  });

  it('puts an earlier version live through its canonical endpoint with captured authority', async () => {
    mockPost.mockResolvedValue({ shareUrl: SITE.shareUrl });
    const { findByLabelText } = render(<SiteDetailScreen />);
    fireEvent.press(await findByLabelText('Put version 1 live'));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        '/api/artifacts/publish/tok_1/versions/1', undefined, authorityOptions(),
      ),
    );
  });

  describe.each([
    {
      control: 'Unpublish',
      title: 'Unpublish Pricing calculator?',
      action: 'Unpublish',
      paths: ['/api/artifacts/publish/tok_1'],
    },
    {
      control: 'Delete site and its data',
      title: 'Delete Pricing calculator and its data?',
      action: 'Delete',
      paths: ['/api/artifacts/publish/tok_1/data', '/api/artifacts/publish/tok_1'],
    },
  ])('$control confirmation', ({ control, title, action, paths }) => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('discloses irreversible shared and personal data loss before dispatching', async () => {
      mockDelete.mockResolvedValue({ cleared: 1 });
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const { findByText } = render(<SiteDetailScreen />);
      fireEvent.press(await findByText(control));

      expect(alert).toHaveBeenCalledTimes(1);
      expect(alert).toHaveBeenCalledWith(
        title,
        'The link stops working for everyone, and all shared and personal data visitors saved in this site is permanently erased. The original artifact stays in its chat. The deleted data cannot be recovered.',
        [
          { text: 'Cancel', style: 'cancel', onPress: expect.any(Function) },
          { text: action, style: 'destructive', onPress: expect.any(Function) },
        ],
        { cancelable: true, onDismiss: expect.any(Function) },
      );
      expect(mockDelete).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();

      const confirm = alert.mock.calls[0]?.[2]?.find(
        (button) => button.style === 'destructive',
      )?.onPress;
      expect(confirm).toEqual(expect.any(Function));
      await act(async () => {
        confirm?.();
      });

      await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(app)/sites'));
      expect(mockDelete.mock.calls.map((call) => call[0])).toEqual(paths);
      expect(mockPost).not.toHaveBeenCalled();
      expect(mockPatch).not.toHaveBeenCalled();
    });

    it.each(['cancel', 'dismiss'] as const)('does not mutate on %s', async (choice) => {
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const { findByText } = render(<SiteDetailScreen />);
      fireEvent.press(await findByText(control));

      expect(alert).toHaveBeenCalledTimes(1);
      expect(mockDelete).not.toHaveBeenCalled();
      const cancel =
        choice === 'cancel'
          ? alert.mock.calls[0]?.[2]?.find((button) => button.style === 'cancel')?.onPress
          : alert.mock.calls[0]?.[3]?.onDismiss;
      expect(cancel).toEqual(expect.any(Function));
      await act(async () => {
        cancel?.();
      });

      expect(mockDelete).not.toHaveBeenCalled();
      expect(mockPost).not.toHaveBeenCalled();
      expect(mockPatch).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });
});
