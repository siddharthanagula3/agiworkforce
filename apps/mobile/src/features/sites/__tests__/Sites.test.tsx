import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

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
    __resetCloudAccountSessionForTests();
    activateCloudAccount('user-1');
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: 'user-1' });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    mockGet.mockImplementation(routeGet);
    mockParams.token = 'tok_1';
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
    const { findByText, getByLabelText, getByText } = render(<SiteDetailScreen />);
    fireEvent.press(await findByText('Only your workspace'));
    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith('/api/artifacts/publish/tok_1', {
        visibility: 'organization',
      }),
    );
    fireEvent.changeText(getByLabelText('Site name'), 'Pricing tool');
    fireEvent.press(getByText('Rename'));
    await waitFor(() =>
      expect(mockPatch).toHaveBeenLastCalledWith('/api/artifacts/publish/tok_1', {
        title: 'Pricing tool',
      }),
    );
  });

  it('puts an earlier version live by republishing its content', async () => {
    mockPost.mockResolvedValue({ shareUrl: SITE.shareUrl });
    const { findByLabelText } = render(<SiteDetailScreen />);
    fireEvent.press(await findByLabelText('Put version 1 live'));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/api/artifacts/publish', {
        artifactId: 'art-1',
        title: 'Pricing',
        kind: 'html',
        language: 'html',
        content: '<p>v1</p>',
      }),
    );
  });

  it('deletes the site and the data visitors saved, after naming the consequence', async () => {
    mockDelete.mockResolvedValue({ cleared: 1 });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, body, buttons) => {
      expect(body).toMatch(/cannot be undone/);
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });
    const { findByText } = render(<SiteDetailScreen />);
    expect(await findByText('1 shared entry, 12 B of 1.0 MB')).toBeTruthy();
    fireEvent.press(await findByText('Delete site and its data'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(app)/sites'));
    expect(mockDelete.mock.calls.map((call) => call[0])).toEqual([
      '/api/artifacts/publish/tok_1/data',
      '/api/artifacts/publish/tok_1',
    ]);
    alert.mockRestore();
  });
});
