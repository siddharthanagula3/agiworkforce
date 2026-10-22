import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPatch = jest.fn();
const mockDelete = jest.fn();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: jest.fn(),
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
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
}));
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
import { FEATURES } from '@/lib/v1FeatureFlags';
import { PluginSourcesScreen } from '../PluginSourcesScreen';

const T = '2026-10-01T00:00:00.000Z';
const REPO_SOURCE = {
  id: 'src-1',
  name: 'acme-tools',
  kind: 'repository',
  repositoryUrl: 'https://github.com/acme/tools',
  ref: null,
  status: 'active',
  lastError: null,
  contentHash: null,
  entryCount: 1,
  lastSyncedAt: T,
  createdAt: T,
  updatedAt: T,
};
const UPLOAD_SOURCE = {
  ...REPO_SOURCE,
  id: 'src-2',
  name: 'my-uploads',
  kind: 'upload',
  repositoryUrl: null,
};
function entry(id: string, sourceId: string, name: string) {
  return {
    id,
    sourceId,
    pluginKey: name.toLowerCase(),
    name,
    description: `${name} does things`,
    version: '1.0.0',
    declaredSkills: [],
    requiredConnectors: [],
    agents: [],
    examplePrompts: [],
    permissions: [],
    contentHash: 'a'.repeat(64),
    createdAt: T,
    updatedAt: T,
  };
}

function routeGet(path: string) {
  switch (path) {
    case '/api/plugins/organization':
      return Promise.resolve({
        organizationId: 'org-1',
        organizationName: 'Acme',
        plugins: [
          {
            id: 'org-p1',
            pluginKey: 'sales',
            name: 'Sales kit',
            description: '',
            version: '2.0.0',
            skills: [],
            updatedAt: T,
            installPreference: 'available',
            installed: false,
            enabled: false,
            enabledSkills: null,
          },
        ],
      });
    case '/api/plugins/marketplaces':
      return Promise.resolve({ sources: [REPO_SOURCE, UPLOAD_SOURCE] });
    case '/api/plugins/marketplaces/entries':
      return Promise.resolve({
        entries: [entry('e-1', 'src-1', 'Linter'), entry('e-2', 'src-2', 'Notes helper')],
      });
    case '/api/plugins/marketplace-installations':
      return Promise.resolve({
        installations: [
          {
            id: 'inst-1',
            entryId: 'e-1',
            sourceId: 'src-1',
            pluginKey: 'linter',
            installedVersion: '1.0.0',
            enabled: true,
            enabledSkills: [],
            customExamplePrompts: null,
            installedAt: T,
            updatedAt: T,
          },
        ],
      });
    case '/api/plugins/submissions':
      return Promise.resolve({ submissions: [] });
    default:
      return Promise.reject(new Error(`unexpected ${path}`));
  }
}

describe('plugin sources on mobile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('user-1');
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: 'user-1' });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    mockGet.mockImplementation(routeGet);
    mockPost.mockResolvedValue({});
    mockPatch.mockResolvedValue({});
    mockDelete.mockResolvedValue({});
  });

  it('installs a plugin your workspace publishes', async () => {
    const { findByText, getByLabelText } = render(<PluginSourcesScreen />);
    expect(await findByText('From Acme')).toBeTruthy();
    fireEvent(getByLabelText('Installed'), 'valueChange', true);
    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith('/api/plugins/organization/org-p1', {
        installed: true,
      }),
    );
  });

  it('hides adding a marketplace and submitting to the directory in the store build', async () => {
    const { findByLabelText, queryByLabelText, queryByText } = render(<PluginSourcesScreen />);
    fireEvent.press(await findByLabelText('Install Notes helper'));
    expect(queryByText('Add a marketplace')).toBeNull();
    expect(queryByLabelText('Repository URL')).toBeNull();
    expect(queryByText('Sync marketplace')).toBeNull();
    expect(queryByLabelText('Submit Notes helper to the directory')).toBeNull();
    expect(queryByLabelText('Submit Linter to the directory')).toBeNull();
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/api/plugins/marketplace-installations', {
        entryId: 'e-2',
      }),
    );
    expect(mockPost).not.toHaveBeenCalledWith('/api/plugins/marketplaces', expect.anything());
  });

  describe('with marketplace administration enabled', () => {
    const features = FEATURES as { pluginMarketplaceAdmin: boolean };
    beforeEach(() => {
      features.pluginMarketplaceAdmin = true;
    });
    afterEach(() => {
      features.pluginMarketplaceAdmin = false;
    });

    it('syncs a marketplace from a repository and installs from it', async () => {
      const { findByLabelText, getByLabelText, getByText } = render(<PluginSourcesScreen />);
      fireEvent.changeText(
        await findByLabelText('Repository URL'),
        ' https://github.com/acme/more ',
      );
      fireEvent.press(getByText('Sync marketplace'));
      await waitFor(() =>
        expect(mockPost).toHaveBeenCalledWith('/api/plugins/marketplaces', {
          repositoryUrl: 'https://github.com/acme/more',
        }),
      );
      fireEvent.press(getByLabelText('Install Notes helper'));
      await waitFor(() =>
        expect(mockPost).toHaveBeenCalledWith('/api/plugins/marketplace-installations', {
          entryId: 'e-2',
        }),
      );
    });

    it('only offers to submit plugins you uploaded or authored', async () => {
      const { findByLabelText, queryByLabelText } = render(<PluginSourcesScreen />);
      fireEvent.press(await findByLabelText('Submit Notes helper to the directory'));
      expect(queryByLabelText('Submit Linter to the directory')).toBeNull();
      await waitFor(() =>
        expect(mockPost).toHaveBeenCalledWith('/api/plugins/submissions', { entryId: 'e-2' }),
      );
    });
  });

  it('removes an installed marketplace plugin after confirming', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });
    const { findByLabelText } = render(<PluginSourcesScreen />);
    fireEvent.press(await findByLabelText('Remove Linter'));
    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith('/api/plugins/marketplace-installations/inst-1'),
    );
    alert.mockRestore();
  });
});
