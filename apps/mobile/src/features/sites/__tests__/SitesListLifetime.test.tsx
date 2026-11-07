import React from 'react';
import { RefreshControl } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';

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
import { SitesScreen } from '../SitesScreen';
import { PressableBox } from '@/components/ui/PressableBox';
import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/src/shared/components/cloud-screen';

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

const response = (title = SITE.title, nextCursor: string | null = null) => ({
  artifacts: [{ ...SITE, title }], pageInfo: { nextCursor },
});
const refresh = () => screen.UNSAFE_getByType(RefreshControl).props.onRefresh as () => void;
const rowPress = () => screen.UNSAFE_getAllByType(PressableBox)
  .find((row) => row.props.accessibilityLabel === `${SITE.title}. Anyone with the link`)!.props.onPress as () => void;

const pageButton = (title: string) => screen.UNSAFE_getAllByType(Button)
  .find((button) => button.props.title === title)!;
const pagePress = (title: string) => pageButton(title).props.onPress as () => void;

describe('UNRUN source-only Sites list lifetime fixtures', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockReset();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('user-1');
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: 'user-1' });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    mockGet.mockResolvedValue(response());
  });

  it('loads with caller-owned authority after StrictMode replay and allows a current row', async () => {
    render(<React.StrictMode><SitesScreen /></React.StrictMode>);
    await screen.findByText(SITE.title);
    expect(mockGet).toHaveBeenLastCalledWith('/api/artifacts/publish', authorityOptions());
    act(() => rowPress()());
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(app)/sites/[token]', params: { token: SITE.token } });
  });

  it('hides old rows immediately across ready-to-ready owner mismatch and loads the activated owner', async () => {
    render(<SitesScreen />);
    await screen.findByText(SITE.title);
    const oldRow = rowPress();
    const oldRefresh = refresh();
    mockGet.mockClear();
    act(() => useAuthStore.setState({ clerkUserId: 'user-2' }));
    expect(screen.queryByText(SITE.title)).not.toBeOnTheScreen();
    act(() => { oldRow(); oldRefresh(); });
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
    mockGet.mockResolvedValue(response('Owner two'));
    act(() => activateCloudAccount('user-2'));
    await screen.findByText('Owner two');
    expect(mockGet.mock.calls[0][1].accountEpoch.ownerId).toBe('user-2');
  });

  it.each(['mode', 'account', 'signedIn', 'loaded'] as const)(
    'retires pending work and retained callbacks through a batched %s round trip', async (transition) => {
      render(<SitesScreen />);
      await screen.findByText(SITE.title);
      const oldRow = rowPress();
      const oldRefresh = refresh();
      const old = deferred<unknown>();
      mockGet.mockImplementationOnce(() => old.promise);
      act(() => oldRefresh());
      const options = mockGet.mock.calls[mockGet.mock.calls.length - 1][1];
      mockGet.mockResolvedValue(response('Fresh view'));
      act(() => {
        if (transition === 'mode') {
          useChatAppModeStore.setState({ appMode: 'local' });
          useChatAppModeStore.setState({ appMode: 'cloud' });
        } else if (transition === 'account') {
          activateCloudAccount('user-2');
          activateCloudAccount('user-1');
        } else if (transition === 'signedIn') {
          useAuthStore.setState({ isClerkSignedIn: false });
          useAuthStore.setState({ isClerkSignedIn: true });
        } else {
          useAuthStore.setState({ isClerkLoaded: false });
          useAuthStore.setState({ isClerkLoaded: true });
        }
        oldRow();
        oldRefresh();
      });
      expect(options.signal.aborted).toBe(true);
      await screen.findByText('Fresh view');
      const calls = mockGet.mock.calls.length;
      await act(async () => old.resolve(response('Obsolete')));
      act(() => { oldRow(); oldRefresh(); });
      expect(screen.queryByText('Obsolete')).not.toBeOnTheScreen();
      expect(mockGet).toHaveBeenCalledTimes(calls);
      expect(mockPush).not.toHaveBeenCalled();
    },
  );

  it.each(['resolve', 'reject'] as const)(
    'keeps the latest refresh spinner and result when a superseded request later %s', async (outcome) => {
      render(<SitesScreen />);
      await screen.findByText(SITE.title);
      const oldRow = rowPress();
      const first = deferred<unknown>();
      const latest = deferred<unknown>();
      mockGet.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => latest.promise);
      const retainedRefresh = refresh();
      act(() => { retainedRefresh(); retainedRefresh(); });
      expect(mockGet.mock.calls[1][1].signal.aborted).toBe(true);
      await act(async () => {
        if (outcome === 'resolve') first.resolve(response('Superseded'));
        else first.reject(new Error('Superseded error'));
      });
      expect(screen.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(true);
      expect(screen.queryByText('Could not load your published sites.')).not.toBeOnTheScreen();
      await act(async () => latest.resolve(response('Newest')));
      expect(screen.getByText('Newest')).toBeOnTheScreen();
      expect(screen.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(false);
      act(() => oldRow());
      expect(mockPush).not.toHaveBeenCalled();
    },
  );

  it('retires row callbacks captured during a pending refresh after its accepted display changes', async () => {
    render(<SitesScreen />);
    await screen.findByText(SITE.title);
    const pending = deferred<unknown>();
    mockGet.mockImplementationOnce(() => pending.promise);
    act(() => refresh()());
    const pendingRow = rowPress();
    await act(async () => pending.resolve({ artifacts: [], pageInfo: { nextCursor: null } }));
    expect(screen.getByText('Nothing published')).toBeOnTheScreen();
    act(() => pendingRow());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does not let older success overwrite newer failure and permits a current retry', async () => {
    render(<SitesScreen />);
    await screen.findByText(SITE.title);
    const old = deferred<unknown>();
    mockGet.mockImplementationOnce(() => old.promise).mockRejectedValueOnce(new Error('latest'));
    const retainedRefresh = refresh();
    act(() => { retainedRefresh(); retainedRefresh(); });
    await screen.findByText('Could not load your published sites.');
    await act(async () => old.resolve(response('Obsolete')));
    expect(screen.getByText('Could not load your published sites.')).toBeOnTheScreen();
    expect(screen.queryByText('Obsolete')).not.toBeOnTheScreen();
    act(() => screen.UNSAFE_getByType(ErrorBanner).props.onRetry());
    await screen.findByText(SITE.title);
    expect(screen.queryByText('Could not load your published sites.')).not.toBeOnTheScreen();
  });

  it('rejects retained retries after an owner transition', async () => {
    mockGet.mockRejectedValueOnce(new Error('initial'));
    render(<SitesScreen />);
    await screen.findByText('Could not load your published sites.');
    const retry = screen.UNSAFE_getByType(ErrorBanner).props.onRetry;
    act(() => useAuthStore.setState({ clerkUserId: 'user-2' }));
    const calls = mockGet.mock.calls.length;
    act(() => retry());
    expect(mockGet).toHaveBeenCalledTimes(calls);
    expect(screen.queryByText('Could not load your published sites.')).not.toBeOnTheScreen();
  });

  it.each(['resolve', 'reject'] as const)('retires refresh and actions at unmount before late %s', async (outcome) => {
    const rendered = render(<SitesScreen />);
    await screen.findByText(SITE.title);
    const oldRow = rowPress();
    const oldRefresh = refresh();
    const pending = deferred<unknown>();
    mockGet.mockImplementationOnce(() => pending.promise);
    act(() => oldRefresh());
    const options = mockGet.mock.calls[1][1];
    rendered.unmount();
    expect(options.signal.aborted).toBe(true);
    await act(async () => {
      if (outcome === 'resolve') pending.resolve(response('Late'));
      else pending.reject(new Error('Late'));
      oldRow();
      oldRefresh();
    });
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('reconciles an epoch transition in the render-to-layout subscription gap', async () => {
    function TransitionInLayout() {
      React.useLayoutEffect(() => {
        activateCloudAccount('user-2');
        activateCloudAccount('user-1');
      }, []);
      return null;
    }
    render(<><TransitionInLayout /><SitesScreen /></>);
    await screen.findByText(SITE.title);
    expect(mockGet.mock.calls[0][1].accountEpoch).toEqual({ ownerId: 'user-1', epoch: 3 });
  });

  it('does not load in Local mode and recovers when cloud access becomes ready', async () => {
    useChatAppModeStore.setState({ appMode: 'local' });
    render(<SitesScreen />);
    expect(mockGet).not.toHaveBeenCalled();
    act(() => useChatAppModeStore.setState({ appMode: 'cloud' }));
    await screen.findByText(SITE.title);
  });

  it('replaces one page at a time and retries the exact failed Older and Back cursors', async () => {
    mockGet.mockResolvedValueOnce(response(SITE.title, 'older+/='));
    render(<SitesScreen />);
    await screen.findByText(SITE.title);
    const firstRow = rowPress();
    const firstOlder = pagePress('Older');
    mockGet.mockRejectedValueOnce(new Error('older failed'));
    act(() => firstOlder());
    await screen.findByText('Could not load your published sites.');
    expect(screen.getByText(SITE.title)).toBeOnTheScreen();
    const failedOlderRetry = screen.UNSAFE_getByType(ErrorBanner).props.onRetry;
    const count = mockGet.mock.calls.length;
    act(() => { firstRow(); firstOlder(); });
    expect(mockGet).toHaveBeenCalledTimes(count);
    expect(mockPush).not.toHaveBeenCalled();
    act(() => rowPress()());
    expect(mockPush).toHaveBeenCalledTimes(1);
    mockGet.mockResolvedValueOnce(response('Older page', 'oldest'));
    act(() => failedOlderRetry());
    await screen.findByText('Older page');
    expect(screen.queryByText(SITE.title)).not.toBeOnTheScreen();
    expect(mockGet.mock.calls.slice(1).map(([path]) => path)).toEqual([
      '/api/artifacts/publish?cursor=older%2B%2F%3D',
      '/api/artifacts/publish?cursor=older%2B%2F%3D',
    ]);
    const back = pagePress('Back to first page');
    const older = pagePress('Older');
    mockGet.mockRejectedValueOnce(new Error('back failed'));
    act(() => back());
    await screen.findByText('Could not load your published sites.');
    expect(screen.getByText('Older page')).toBeOnTheScreen();
    const before = mockGet.mock.calls.length;
    act(() => { back(); older(); failedOlderRetry(); });
    expect(mockGet).toHaveBeenCalledTimes(before);
    mockGet.mockResolvedValueOnce(response('First again'));
    act(() => screen.UNSAFE_getByType(ErrorBanner).props.onRetry());
    await screen.findByText('First again');
    expect(mockGet.mock.calls.slice(-2).map(([path]) => path)).toEqual([
      '/api/artifacts/publish', '/api/artifacts/publish',
    ]);
  });

  it.each(['resolve', 'reject'] as const)(
    'lets retained same-view refresh supersede Older and ignores its later %s', async (outcome) => {
      mockGet.mockResolvedValueOnce(response(SITE.title, 'older'));
      render(<SitesScreen />);
      await screen.findByText(SITE.title);
      const sameViewRefresh = refresh();
      const oldRow = rowPress();
      const older = pagePress('Older');
      const pendingOlder = deferred<unknown>();
      const pendingRefresh = deferred<unknown>();
      mockGet.mockImplementationOnce(() => pendingOlder.promise).mockImplementationOnce(() => pendingRefresh.promise);
      act(() => { older(); oldRow(); older(); });
      expect(mockGet).toHaveBeenCalledTimes(2);
      expect(mockPush).not.toHaveBeenCalled();
      expect(pageButton('Older').props.disabled).toBe(true);
      const pendingControl = pagePress('Older');
      const pendingRow = rowPress();
      act(() => sameViewRefresh());
      expect(mockGet.mock.calls[1][1].signal.aborted).toBe(true);
      expect(mockGet.mock.calls[2][0]).toBe('/api/artifacts/publish');
      await act(async () => {
        if (outcome === 'resolve') pendingOlder.resolve(response('Obsolete page'));
        else pendingOlder.reject(new Error('Obsolete error'));
      });
      expect(screen.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(true);
      expect(screen.queryByText('Obsolete page')).not.toBeOnTheScreen();
      await act(async () => pendingRefresh.resolve(response(SITE.title, 'fresh-older')));
      expect(screen.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(false);
      const calls = mockGet.mock.calls.length;
      act(() => { pendingControl(); pendingRow(); older(); oldRow(); });
      expect(mockGet).toHaveBeenCalledTimes(calls);
      expect(mockPush).not.toHaveBeenCalled();
      act(() => rowPress()());
      expect(mockPush).toHaveBeenCalledTimes(1);
      mockGet.mockResolvedValueOnce(response('Current older'));
      act(() => pagePress('Older')());
      await screen.findByText('Current older');
      expect(mockGet.mock.calls.at(-1)?.[0]).toBe('/api/artifacts/publish?cursor=fresh-older');
    },
  );

  it.each(['legacy', 'error', 'terminal', 'more'] as const)(
    'uses honest first-page empty wording for %s', async (kind) => {
      if (kind === 'error') mockGet.mockRejectedValueOnce(new Error('failed'));
      else mockGet.mockResolvedValueOnce({ artifacts: [], ...(kind === 'legacy' ? {} : {
        pageInfo: { nextCursor: kind === 'more' ? 'older' : null },
      }) });
      render(<SitesScreen />);
      await screen.findByText(kind === 'terminal' ? 'Nothing published' : 'No sites on this page');
      if (kind !== 'terminal') expect(screen.queryByText('Nothing published')).not.toBeOnTheScreen();
      if (kind === 'legacy') expect(screen.getByText('0 sites on this page. Page coverage is unknown.')).toBeOnTheScreen();
    },
  );

  it('keeps a terminal empty continuation recoverable with a current Back control', async () => {
    mockGet.mockResolvedValueOnce(response(SITE.title, 'older'));
    render(<SitesScreen />);
    await screen.findByText(SITE.title);
    mockGet.mockResolvedValueOnce({ artifacts: [], pageInfo: { nextCursor: null } });
    act(() => pagePress('Older')());
    await screen.findByText('No sites on this page');
    expect(screen.queryByText('Nothing published')).not.toBeOnTheScreen();
    mockGet.mockResolvedValueOnce(response('Recovered first'));
    act(() => pagePress('Back to first page')());
    await screen.findByText('Recovered first');
    expect(mockGet.mock.calls.at(-1)?.[0]).toBe('/api/artifacts/publish');
  });

  it.each(['mode', 'account', 'signedIn', 'loaded'] as const)(
    'retires Older, Back and Retry through a batched %s round trip', async (transition) => {
      mockGet.mockResolvedValueOnce(response(SITE.title, 'older'));
      render(<SitesScreen />);
      await screen.findByText(SITE.title);
      const oldOlder = pagePress('Older');
      mockGet.mockResolvedValueOnce(response('Later page', 'oldest'));
      act(() => oldOlder());
      await screen.findByText('Later page');
      const oldBack = pagePress('Back to first page');
      mockGet.mockRejectedValueOnce(new Error('failed'));
      act(() => oldBack());
      await screen.findByText('Could not load your published sites.');
      const oldRetry = screen.UNSAFE_getByType(ErrorBanner).props.onRetry;
      const currentOlder = pagePress('Older');
      const currentBack = pagePress('Back to first page');
      mockGet.mockResolvedValue(response('Fresh view', 'new-older'));
      act(() => {
        if (transition === 'mode') {
          useChatAppModeStore.setState({ appMode: 'local' });
          useChatAppModeStore.setState({ appMode: 'cloud' });
        } else if (transition === 'account') {
          activateCloudAccount('user-2'); activateCloudAccount('user-1');
        } else if (transition === 'signedIn') {
          useAuthStore.setState({ isClerkSignedIn: false });
          useAuthStore.setState({ isClerkSignedIn: true });
        } else {
          useAuthStore.setState({ isClerkLoaded: false });
          useAuthStore.setState({ isClerkLoaded: true });
        }
        oldOlder(); oldBack(); oldRetry(); currentOlder(); currentBack();
      });
      await screen.findByText('Fresh view');
      const calls = mockGet.mock.calls.length;
      act(() => { oldOlder(); oldBack(); oldRetry(); currentOlder(); currentBack(); });
      expect(mockGet).toHaveBeenCalledTimes(calls);
      mockGet.mockResolvedValueOnce(response('Current page'));
      act(() => pagePress('Older')());
      await screen.findByText('Current page');
    },
  );


  it('retires Retry synchronously and keeps pending Back and row callbacks retired after failure', async () => {
    mockGet.mockResolvedValueOnce(response(SITE.title, 'older'));
    render(<SitesScreen />);
    await screen.findByText(SITE.title);
    mockGet.mockResolvedValueOnce(response(SITE.title, 'oldest'));
    act(() => pagePress('Older')());
    await screen.findByText('Back to first page');
    const back = pagePress('Back to first page');
    const beforeRow = rowPress();
    const pending = deferred<unknown>();
    mockGet.mockImplementationOnce(() => pending.promise);
    act(() => { back(); beforeRow(); back(); });
    expect(mockGet).toHaveBeenCalledTimes(3);
    expect(mockPush).not.toHaveBeenCalled();
    expect(pageButton('Back to first page').props.disabled).toBe(true);
    expect(pageButton('Older').props.disabled).toBe(true);
    const pendingBack = pagePress('Back to first page');
    const pendingRow = rowPress();
    await act(async () => pending.reject(new Error('Back failed')));
    act(() => { pendingBack(); pendingRow(); beforeRow(); back(); });
    expect(mockGet).toHaveBeenCalledTimes(3);
    expect(mockPush).not.toHaveBeenCalled();
    const retry = screen.UNSAFE_getByType(ErrorBanner).props.onRetry;
    const retryPending = deferred<unknown>();
    mockGet.mockImplementationOnce(() => retryPending.promise);
    act(() => { retry(); retry(); });
    expect(mockGet).toHaveBeenCalledTimes(4);
    await act(async () => retryPending.reject(new Error('Back still failed')));
    act(() => retry());
    expect(mockGet).toHaveBeenCalledTimes(4);
    mockGet.mockResolvedValueOnce(response('Recovered'));
    act(() => screen.UNSAFE_getByType(ErrorBanner).props.onRetry());
    await screen.findByText('Recovered');
  });

});
