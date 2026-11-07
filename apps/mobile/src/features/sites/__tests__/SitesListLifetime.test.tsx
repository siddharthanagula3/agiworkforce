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

const response = (title = SITE.title) => ({ artifacts: [{ ...SITE, title }] });
const refresh = () => screen.UNSAFE_getByType(RefreshControl).props.onRefresh as () => void;
const rowPress = () => screen.UNSAFE_getAllByType(PressableBox)
  .find((row) => row.props.accessibilityLabel === `${SITE.title}. Anyone with the link`)!.props.onPress as () => void;

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
    await act(async () => pending.resolve({ artifacts: [] }));
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
});
