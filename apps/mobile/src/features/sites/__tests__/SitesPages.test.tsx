import React from 'react';
import { Alert, RefreshControl } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockGet = jest.fn();
const mockCreateConversation = jest.fn();
const mockOpenUrl = jest.fn();
const mockStore = new Map<string, string>();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    canGoBack: jest.fn(() => true),
  }),
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
  storage: {
    getString: (key: string) => mockStore.get(key),
    set: (key: string, value: string) => mockStore.set(key, value),
    delete: (key: string) => mockStore.delete(key),
  },
}));
jest.mock('@/lib/safeOpenURL', () => ({
  openUntrustedUrlInAppBrowser: (...args: unknown[]) => mockOpenUrl(...args),
}));
jest.mock('@/services/api', () => ({
  ApiHttpError: jest.requireActual('@/services/apiErrors').ApiHttpError,
  api: { get: (...args: unknown[]) => mockGet(...args) },
}));
jest.mock('@/stores/chatStore', () => ({
  useChatStore: (selector: (state: { createConversation: unknown }) => unknown) =>
    selector({ createConversation: (...args: unknown[]) => mockCreateConversation(...args) }),
}));
jest.mock('@/src/features/chat/components/ReportFlagButton', () => ({
  ReportSheet: ({ target, title }: { target: unknown; title?: string }) => {
    const { Text } = jest.requireActual('react-native');
    return (
      <>
        <Text testID="report-sheet-title">{title ?? 'default title'}</Text>
        <Text testID="report-sheet">{JSON.stringify(target)}</Text>
      </>
    );
  },
}));
jest.mock('@/src/shared/components/cloud-screen', () => ({
  ...jest.requireActual('@/src/shared/components/cloud-screen'),
  confirmIrreversible: jest.fn(() => Promise.resolve(true)),
}));

import { API_URL } from '@/lib/constants';
import { ApiHttpError } from '@/services/api';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { SitesScreen } from '../SitesScreen';

const SHARED_PATH = '/api/artifacts/shared-with-me';
const ORG_PATH = '/api/settings/organization/shared';

const OWN_SITE = {
  token: 'own_token',
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
  shareUrl: 'https://agiworkforce.com/shared-artifact/own_token',
  sandboxed: true,
};

const INVITED = {
  token: 'invited_one',
  title: 'Wedding page',
  kind: 'html',
  updatedAt: '2026-10-05T00:00:00.000Z',
};
const INVITED_TWO = { ...INVITED, token: 'invited_two', title: 'Garden plan' };

const OVERVIEW = {
  currentUserId: 'user-1',
  canManageSharing: false,
  canShareOwnProjects: false,
  members: [
    {
      userId: 'owner-2',
      role: 'member',
      displayName: 'Maya',
      email: null,
      canEditProjects: false,
    },
  ],
  sharedProjects: [],
  sharedArtifacts: [
    {
      publishedArtifactId: 'pa-1',
      token: 'workspace_tok',
      title: 'Team handbook',
      kind: 'html',
      ownerUserId: 'owner-2',
    },
  ],
};

interface Routes {
  shared?: (path: string) => Promise<unknown> | unknown;
  org?: () => Promise<unknown> | unknown;
}

function route(routes: Routes = {}) {
  mockGet.mockImplementation((path: string) => {
    if (path === '/api/artifacts/publish') {
      return Promise.resolve({ artifacts: [OWN_SITE], pageInfo: { nextCursor: null } });
    }
    if (path.startsWith(SHARED_PATH)) {
      return Promise.resolve(
        routes.shared
          ? routes.shared(path)
          : { items: [INVITED], nextCursor: null, hasMore: false, emailVerified: true },
      );
    }
    if (path === ORG_PATH) {
      return Promise.resolve(routes.org ? routes.org() : OVERVIEW);
    }
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

const openShared = async () => {
  fireEvent.press(screen.getByLabelText('Shared with you'));
};
const sharedGets = () =>
  mockGet.mock.calls
    .map((call) => call[0] as string)
    .filter((path) => path.startsWith(SHARED_PATH));

function lastAlertButtons() {
  const calls = (Alert.alert as jest.Mock).mock.calls;
  return calls[calls.length - 1][2] as { text: string; onPress?: () => void }[];
}

describe('Sites page with Yours and Shared with you', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockReset();
    mockStore.clear();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    __resetCloudAccountSessionForTests();
    activateCloudAccount('user-1');
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: 'user-1' });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    route();
  });

  it('is titled Sites with Yours selected and does not read shared sites until asked', async () => {
    render(<SitesScreen />);
    await screen.findByText(OWN_SITE.title);
    expect(screen.getByText('Sites')).toBeOnTheScreen();
    expect(screen.queryByText('Published sites')).toBeNull();
    expect(screen.getByLabelText('Yours').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByLabelText('Shared with you').props.accessibilityState).toEqual({
      selected: false,
    });
    expect(sharedGets()).toEqual([]);
  });

  it('lists invited and workspace shared sites and opens one in the in-app browser', async () => {
    render(<SitesScreen />);
    await screen.findByText(OWN_SITE.title);
    await openShared();
    await screen.findByText(INVITED.title);
    expect(screen.getByText('Team handbook')).toBeOnTheScreen();
    expect(screen.getByText('Shared by Maya')).toBeOnTheScreen();
    expect(
      screen.getByLabelText(
        `${INVITED.title}. Updated ${new Date(INVITED.updatedAt).toLocaleDateString()}`,
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText(OWN_SITE.title)).toBeNull();

    fireEvent.press(screen.getByLabelText(/^Wedding page\./));
    expect(mockOpenUrl).toHaveBeenCalledWith(
      `${API_URL.replace(/\/+$/, '')}/shared-artifact/invited_one`,
    );
    fireEvent.press(screen.getByLabelText(/^Team handbook\./));
    expect(mockOpenUrl).toHaveBeenLastCalledWith(
      `${API_URL.replace(/\/+$/, '')}/shared-artifact/workspace_tok`,
    );
  });

  it('keeps each pill mounted so its list is not reloaded when switching back', async () => {
    render(<SitesScreen />);
    await screen.findByText(OWN_SITE.title);
    await openShared();
    await screen.findByText(INVITED.title);
    const reads = mockGet.mock.calls.length;
    fireEvent.press(screen.getByLabelText('Yours'));
    expect(screen.getByText(OWN_SITE.title)).toBeOnTheScreen();
    expect(screen.queryByText(INVITED.title)).toBeNull();
    expect(screen.getByText(INVITED.title, { includeHiddenElements: true })).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Shared with you'));
    expect(screen.getByText(INVITED.title)).toBeOnTheScreen();
    expect(mockGet).toHaveBeenCalledTimes(reads);
  });

  it('pages shared sites with Load more while a next cursor exists', async () => {
    route({
      shared: (path) =>
        path === SHARED_PATH
          ? { items: [INVITED], nextCursor: 'cursor_2', hasMore: true, emailVerified: true }
          : {
              items: [INVITED, INVITED_TWO],
              nextCursor: null,
              hasMore: false,
              emailVerified: true,
            },
    });
    render(<SitesScreen />);
    await openShared();
    await screen.findByText(INVITED.title);
    fireEvent.press(screen.getByText('Load more'));
    await screen.findByText(INVITED_TWO.title);
    expect(sharedGets()).toEqual([SHARED_PATH, `${SHARED_PATH}?cursor=cursor_2`]);
    expect(screen.getAllByText(INVITED.title)).toHaveLength(1);
    expect(screen.queryByText('Load more')).toBeNull();
  });

  it('keeps loaded sites and offers a retry when Load more fails', async () => {
    let attempt = 0;
    route({
      shared: (path) => {
        if (path === SHARED_PATH) {
          return { items: [INVITED], nextCursor: 'cursor_2', hasMore: true, emailVerified: true };
        }
        attempt += 1;
        if (attempt === 1) throw new ApiHttpError('Try later', 429);
        return { items: [INVITED_TWO], nextCursor: null, hasMore: false, emailVerified: true };
      },
    });
    render(<SitesScreen />);
    await openShared();
    await screen.findByText(INVITED.title);
    fireEvent.press(screen.getByText('Load more'));
    await screen.findByText('Try later');
    expect(screen.getByText(INVITED.title)).toBeOnTheScreen();
    expect(
      screen.getAllByText(/^(Wedding page|Try later)$/).map((node) => node.children.join('')),
    ).toEqual([INVITED.title, 'Try later']);
    fireEvent.press(screen.getByLabelText('Try again'));
    await screen.findByText(INVITED_TWO.title);
    expect(screen.queryByText('Try later')).toBeNull();
  });

  it('shows the empty state when nothing is shared', async () => {
    route({
      shared: () => ({ items: [], nextCursor: null, hasMore: false, emailVerified: true }),
      org: () => {
        throw new ApiHttpError('Not a member', 403);
      },
    });
    render(<SitesScreen />);
    await openShared();
    expect(await screen.findByText('No shared sites yet')).toBeOnTheScreen();
    expect(screen.getByText('Sites people share with you will appear here.')).toBeOnTheScreen();
  });

  it('asks to verify the email when the account email is not confirmed', async () => {
    route({
      shared: () => ({ items: [], nextCursor: null, hasMore: false, emailVerified: false }),
      org: () => {
        throw new ApiHttpError('Not a member', 403);
      },
    });
    render(<SitesScreen />);
    await openShared();
    expect(
      await screen.findByText('Verify your email to see sites shared with you'),
    ).toBeOnTheScreen();
    expect(
      screen.getByText('Sharing matches the confirmed email on your account.'),
    ).toBeOnTheScreen();
  });

  it('keeps workspace shares and notes the unverified email above them', async () => {
    route({
      shared: () => ({ items: [], nextCursor: null, hasMore: false, emailVerified: false }),
    });
    render(<SitesScreen />);
    await openShared();
    await screen.findByText('Team handbook');
    expect(screen.getByText('Verify your email to see sites shared with you')).toBeOnTheScreen();
    expect(screen.queryByText('No shared sites yet')).toBeNull();
  });

  it('shows a loading state, then an error with Try again that reloads', async () => {
    let fail = true;
    route({
      shared: () => {
        if (fail) throw new ApiHttpError('Shared sites are unavailable', 503);
        return { items: [INVITED], nextCursor: null, hasMore: false, emailVerified: true };
      },
    });
    render(<SitesScreen />);
    await screen.findByText(OWN_SITE.title);
    await openShared();
    expect(screen.getAllByLabelText('Loading').length).toBeGreaterThan(0);
    await screen.findByText('Could not load sites shared with you.');
    expect(screen.queryByText('No shared sites yet')).toBeNull();
    fail = false;
    fireEvent.press(screen.getByLabelText('Try again'));
    await screen.findByText(INVITED.title);
    expect(screen.queryByText('Could not load sites shared with you.')).toBeNull();
  });

  it('reloads only the shared list on pull to refresh', async () => {
    render(<SitesScreen />);
    await screen.findByText(OWN_SITE.title);
    await openShared();
    await screen.findByText(INVITED.title);
    const publishReads = mockGet.mock.calls.filter(
      (call) => call[0] === '/api/artifacts/publish',
    ).length;
    const before = sharedGets().length;
    const controls = screen.UNSAFE_getAllByType(RefreshControl);
    expect(controls).toHaveLength(2);
    await act(async () => controls[1].props.onRefresh());
    await waitFor(() => expect(sharedGets().length).toBe(before + 1));
    expect(mockGet.mock.calls.filter((call) => call[0] === '/api/artifacts/publish')).toHaveLength(
      publishReads,
    );
  });

  it('offers Report and Hide for a workspace share and only Report for an invited one', async () => {
    render(<SitesScreen />);
    await openShared();
    await screen.findByText(INVITED.title);

    fireEvent.press(screen.getByLabelText('More options for Wedding page'));
    expect(lastAlertButtons().map((button) => button.text)).toEqual([
      'Report',
      'Hide this site',
      'Cancel',
    ]);
    act(() => lastAlertButtons()[0].onPress?.());
    expect(screen.getByTestId('report-sheet-title').children.join('')).toBe('Report this item');
    expect(JSON.parse(screen.getByTestId('report-sheet').children.join(''))).toEqual({
      messageId: 'invited_one',
      conversationId: 'shared:artifact',
      contentExcerpt: 'Wedding page',
      subject: { kind: 'shared-item', id: 'invited_one' },
    });

    fireEvent.press(screen.getByLabelText('More options for Team handbook'));
    expect(lastAlertButtons().map((button) => button.text)).toEqual([
      'Report',
      'Hide Maya',
      'Cancel',
    ]);
    act(() => lastAlertButtons()[0].onPress?.());
    expect(JSON.parse(screen.getByTestId('report-sheet').children.join(''))).toMatchObject({
      messageId: 'pa-1',
      sharedItem: { kind: 'artifact', id: 'pa-1', sharerId: 'owner-2' },
    });
  });

  it('hides everything a hidden person shared', async () => {
    render(<SitesScreen />);
    await openShared();
    await screen.findByText('Team handbook');
    fireEvent.press(screen.getByLabelText('More options for Team handbook'));
    await act(async () => lastAlertButtons()[1].onPress?.());
    await waitFor(() => expect(screen.queryByText('Team handbook')).toBeNull());
    expect(screen.getByText(INVITED.title)).toBeOnTheScreen();
    expect(JSON.parse(mockStore.get('shared-with-you:hidden-sharers:v1:user-1') ?? '[]')).toEqual([
      { id: 'owner-2', name: 'Maya' },
    ]);
  });
});

describe('Hiding an invited site and untitled sites', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockReset();
    mockStore.clear();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    __resetCloudAccountSessionForTests();
    activateCloudAccount('user-1');
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: 'user-1' });
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  it('hides an invited site on this phone and keeps the others', async () => {
    route({
      shared: () => ({
        items: [INVITED, INVITED_TWO],
        nextCursor: null,
        hasMore: false,
        emailVerified: true,
      }),
    });
    render(<SitesScreen />);
    await openShared();
    await screen.findByText(INVITED.title);
    fireEvent.press(screen.getByLabelText('More options for Wedding page'));
    const hide = lastAlertButtons().find((button) => button.text === 'Hide this site');
    await act(async () => hide?.onPress?.());
    await waitFor(() => expect(screen.queryByText(INVITED.title)).toBeNull());
    expect(screen.getByText(INVITED_TWO.title)).toBeOnTheScreen();
    expect(JSON.parse(mockStore.get('sites:hidden-shared-sites:v1:user-1') ?? '[]')).toEqual([
      'invited_one',
    ]);
  });

  it('names an untitled shared site the same way for every reader', async () => {
    route({
      shared: () => ({
        items: [{ ...INVITED, title: '  ' }],
        nextCursor: null,
        hasMore: false,
        emailVerified: true,
      }),
    });
    render(<SitesScreen />);
    await openShared();
    await screen.findByLabelText(/^Untitled site\./);
    expect(screen.getByLabelText('More options for Untitled site')).toBeOnTheScreen();
  });
});

describe('New site from the Sites page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockReset();
    mockStore.clear();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('user-1');
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: 'user-1' });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    route();
  });

  it('creates a Cloud conversation and opens it with the prompt prefilled', async () => {
    mockCreateConversation.mockResolvedValue('conv-new');
    render(<SitesScreen />);
    await screen.findByText(OWN_SITE.title);
    fireEvent.press(screen.getByLabelText('New site'));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/chat/[id]',
        params: { id: 'conv-new', prompt: 'Build a one-page website for ' },
      }),
    );
    expect(mockCreateConversation).toHaveBeenCalledTimes(1);
  });

  it('is disabled while the conversation is being created', async () => {
    let finish!: (id: string) => void;
    mockCreateConversation.mockReturnValue(new Promise<string>((resolve) => (finish = resolve)));
    render(<SitesScreen />);
    await screen.findByText(OWN_SITE.title);
    fireEvent.press(screen.getByLabelText('New site'));
    expect(screen.getByLabelText('New site').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    fireEvent.press(screen.getByLabelText('New site'));
    expect(mockCreateConversation).toHaveBeenCalledTimes(1);
    await act(async () => finish('conv-new'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
  });

  it('shows the error and re-enables the plus when creating fails', async () => {
    mockCreateConversation.mockRejectedValueOnce(new ApiHttpError('Could not create it', 400));
    mockCreateConversation.mockResolvedValueOnce('conv-new');
    render(<SitesScreen />);
    await screen.findByText(OWN_SITE.title);
    fireEvent.press(screen.getByLabelText('New site'));
    await screen.findByText('Could not create it');
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByLabelText('New site').props.accessibilityState).toMatchObject({
      disabled: false,
    });
    fireEvent.press(screen.getByLabelText('New site'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Could not create it')).toBeNull();
  });

  it('does not show the plus or the pills in Local Mode', () => {
    useChatAppModeStore.setState({ appMode: 'local' });
    render(<SitesScreen />);
    expect(screen.queryByLabelText('New site')).toBeNull();
    expect(screen.queryByLabelText('Shared with you')).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });
});
