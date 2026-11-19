import React from 'react';
import { Alert, Platform, ScrollView } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { PRODUCT_BRAND } from '@agiworkforce/types';
import { ApiHttpError } from '@/services/apiErrors';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockFeatures = { skills: true };
const mockConnectorsReleased = jest.fn(() => true);
const mockParams: { id?: string } = {};
const mockDirectory = jest.fn();
const mockPlugin = jest.fn();
const mockInstallations = jest.fn();
const mockUpdates = jest.fn();
const mockInstall = jest.fn();
const mockUninstall = jest.fn();
const mockEnabled = jest.fn();
const mockMove = jest.fn();
const mockManagedSkills = jest.fn();
const mockShowToast = jest.fn();
const mockFocus: { callback: (() => void) | null } = { callback: null };
const mockInsets = { top: 0, bottom: 34, left: 0, right: 0 };

jest.mock('expo-router', () => {
  const actual = jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock();
  return {
    ...actual,
    useFocusEffect: (callback: () => void) => {
      mockFocus.callback = callback;
      actual.useFocusEffect(callback);
    },
    useRouter: () => ({
      push: mockPush,
      back: jest.fn(),
      replace: mockReplace,
      navigate: jest.fn(),
      canGoBack: jest.fn(() => true),
    }),
    useLocalSearchParams: () => mockParams,
  };
});
jest.mock('@/lib/v1FeatureFlags', () => {
  const actual = jest.requireActual('@/lib/v1FeatureFlags');
  return {
    ...actual,
    FEATURES: new Proxy(actual.FEATURES, {
      get: (target, key) => (key === 'skills' ? mockFeatures.skills : Reflect.get(target, key)),
    }),
  };
});
jest.mock('@clerk/expo', () => ({ getClerkInstance: () => null }));
jest.mock('@agiworkforce/types', () => ({
  ...jest.requireActual('@agiworkforce/types'),
  connectorsReleased: () => mockConnectorsReleased(),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => mockInsets,
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
jest.mock('@/src/shared/components/Toast', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));
jest.mock('@/lib/safeOpenURL', () => ({ openUntrustedUrlInAppBrowser: jest.fn() }));
jest.mock('@/services/preferences', () => ({
  fetchToolApprovalNamespace: jest.fn(async () => ({
    settings: { defaultPolicy: 'ask_every_time' },
    autonomousToolApprovalsAllowed: true,
  })),
  savePreferenceNamespace: jest.fn(async () => undefined),
}));
jest.mock('@/services/connectors', () => ({
  fetchConnectorDirectory: jest.fn(async () => ({
    connectors: [{ connectorId: 'gmail', toolConnectorId: 'gmail' }],
  })),
}));
jest.mock('@/src/features/skills/service', () => ({
  fetchManagedSkills: (...args: unknown[]) => mockManagedSkills(...args),
}));
jest.mock('../service', () => ({
  ...jest.requireActual('../service'),
  fetchPluginDirectory: (...args: unknown[]) => mockDirectory(...args),
  fetchPlugin: (...args: unknown[]) => mockPlugin(...args),
  fetchPluginInstallations: (...args: unknown[]) => mockInstallations(...args),
  fetchPluginUpdates: (...args: unknown[]) => mockUpdates(...args),
  fetchPluginScan: jest.fn(async () => ({
    verdict: 'pass',
    findings: [],
    scannedAt: '2026-10-01T00:00:00.000Z',
  })),
  fetchPluginVersions: jest.fn(async () => ({
    installedVersion: '1.0.0',
    approvedPermissions: [],
    versions: [
      { version: '1.0.0', publishedAt: null, changelog: '', permissions: [], declaredSkills: [] },
      {
        version: '1.1.0',
        publishedAt: null,
        changelog: '',
        permissions: ['send mail'],
        declaredSkills: [],
      },
    ],
  })),
  fetchPluginSettings: jest.fn(async () => ({
    pluginId: 'mail',
    enabledSkills: ['triage'],
    examplePrompts: [],
    connectors: [],
    agents: [],
  })),
  installPlugin: (...args: unknown[]) => mockInstall(...args),
  uninstallPlugin: (...args: unknown[]) => mockUninstall(...args),
  setPluginEnabled: (...args: unknown[]) => mockEnabled(...args),
  movePluginToVersion: (...args: unknown[]) => mockMove(...args),
}));

import type { PluginDirectoryEntryWire } from '@agiworkforce/cloud-contracts';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { ActionMenuHost } from '@/src/shared/components/ActionMenuHost';
import {
  BOTTOM_SEARCH_BAR_HEIGHT,
  BOTTOM_SEARCH_BAR_MARGIN,
} from '@/src/shared/components/BottomSearchBar';
import { useSettingsStore } from '@/stores/settingsStore';
import { PLUGIN_PERMISSIONS_COPY } from '../pluginsModel';
import { PluginDetailScreen } from '../PluginDetailScreen';
import { PluginsScreen } from '../PluginsScreen';

function entry(overrides: Partial<PluginDirectoryEntryWire>): PluginDirectoryEntryWire {
  return {
    id: 'plugin',
    name: 'Plugin',
    version: '1.0.0',
    description: 'Does a thing',
    category: 'Productivity',
    publisher: { id: 'agi', name: 'AGI Workforce', kind: 'first-party' },
    status: 'published',
    webInstallable: true,
    declaredSkills: [],
    requiredConnectors: [],
    capabilities: [],
    permissions: [],
    examplePrompts: [],
    verified: true,
    installs: 10,
    worksWith: ['web'],
    ...overrides,
  };
}

const MAIL = entry({
  id: 'mail',
  name: 'Mail helper',
  installs: 0,
  verified: false,
  requiredConnectors: ['gmail', 'slack'],
  declaredSkills: ['triage', 'reply'],
  permissions: ['read mail'],
});
const DOCS = entry({ id: 'docs', name: 'Docs kit', installs: 80 });
const DESKTOP = entry({
  id: 'desk',
  name: 'Desk kit',
  installs: 0,
  verified: false,
  webInstallable: false,
});
const INSTALLED_DOCS = {
  pluginId: 'docs',
  installedVersion: '1.0.0',
  enabled: true,
  installedAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};
const DOCS_UPDATE = {
  pluginId: 'docs',
  installedVersion: '1.0.0',
  latestVersion: '1.1.0',
  installedVersionStopped: false,
  diff: {
    pluginId: 'docs',
    from: '1.0.0',
    to: '1.1.0',
    changelog: '',
    addedSkills: [],
    removedSkills: [],
    addedPermissions: [],
    removedPermissions: [],
    requiresPermissionReview: false,
  },
};

function pressAlertButton(match: (button: { text?: string; style?: string }) => boolean) {
  return jest.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
    buttons?.find(match)?.onPress?.();
  });
}

describe('mobile plugins', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete mockParams.id;
    mockFeatures.skills = true;
    __resetCloudAccountSessionForTests();
    activateCloudAccount('user-1');
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: 'user-1' });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    mockDirectory.mockResolvedValue({ entries: [MAIL, DOCS], total: 2, nextCursor: null });
    mockInstallations.mockResolvedValue([]);
    mockUpdates.mockResolvedValue([]);
    mockManagedSkills.mockResolvedValue([{ name: 'triage' }]);
  });

  it('shows featured and recommended sections and filters by category', async () => {
    const { findByRole, getByText, getAllByLabelText } = render(<PluginsScreen />);
    expect(await findByRole('header', { name: 'Popular' })).toBeTruthy();
    expect(getByText('Recommended for you')).toBeTruthy();
    expect(getAllByLabelText(/^Docs kit by AGI Workforce/).length).toBeGreaterThan(0);

    fireEvent.press(getByText('Productivity'));
    await waitFor(() =>
      expect(mockDirectory).toHaveBeenLastCalledWith(
        expect.objectContaining({ category: 'Productivity', sort: 'installs' }),
        expect.anything(),
      ),
    );
  });

  it('shows one chip for categories that differ only in case and filters by it', async () => {
    mockDirectory.mockResolvedValue({
      entries: [
        MAIL,
        entry({ id: 'dev-a', name: 'Dev kit', category: 'Developer' }),
        entry({ id: 'dev-b', name: 'Dev tools', category: 'developer' }),
      ],
      total: 3,
      nextCursor: null,
      stats: { byCategory: { developer: 2, productivity: 1 } },
    });
    const { findAllByText, getAllByText, queryByText } = render(<PluginsScreen />);
    expect((await findAllByText('Developer')).length).toBe(1);
    expect(queryByText('developer')).toBeNull();
    expect(getAllByText('Productivity').length).toBe(1);

    fireEvent.press(getAllByText('Developer')[0]);
    await waitFor(() =>
      expect(mockDirectory).toHaveBeenLastCalledWith(
        expect.objectContaining({ category: 'Developer' }),
        expect.anything(),
      ),
    );
  });

  it('discards a Show more page that resolves after the search changed', async () => {
    const STALE = entry({ id: 'stale', name: 'Stale plugin' });
    let resolveOlderPage: (page: unknown) => void = () => undefined;
    const olderPage = new Promise((resolve) => {
      resolveOlderPage = resolve;
    });
    mockDirectory.mockImplementation((query: { cursor?: string; search?: string }) => {
      if (query.cursor) return olderPage;
      if (query.search) return Promise.resolve({ entries: [DOCS], total: 1, nextCursor: null });
      return Promise.resolve({ entries: [MAIL], total: 2, nextCursor: 'cursor-a' });
    });
    const { findByText, findAllByLabelText, getByLabelText, queryByText, queryAllByLabelText } =
      render(<PluginsScreen />);

    fireEvent.press(await findByText('Show more'));
    await waitFor(() =>
      expect(mockDirectory).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: 'cursor-a' }),
        expect.anything(),
      ),
    );

    fireEvent.changeText(getByLabelText('Search plugins'), 'docs');
    expect((await findAllByLabelText(/^Docs kit by AGI Workforce/)).length).toBeGreaterThan(0);

    await act(async () => {
      resolveOlderPage({ entries: [STALE], total: 3, nextCursor: 'cursor-stale' });
      await olderPage;
    });

    expect(queryAllByLabelText(/^Stale plugin by AGI Workforce/)).toHaveLength(0);
    expect(queryAllByLabelText(/^Mail helper by AGI Workforce/)).toHaveLength(0);
    expect(queryByText('Show more')).toBeNull();
  });

  it('keeps the newer search results when a retired first load settles late', async () => {
    const connectors = jest.requireMock('@/services/connectors') as {
      fetchConnectorDirectory: jest.Mock;
    };
    let resolveRetiredDirectory: (directory: unknown) => void = () => undefined;
    const retiredDirectory = new Promise((resolve) => {
      resolveRetiredDirectory = resolve;
    });
    connectors.fetchConnectorDirectory.mockImplementationOnce(() => retiredDirectory);
    mockDirectory.mockImplementation((query: { search?: string }) =>
      Promise.resolve(
        query.search
          ? { entries: [DOCS], total: 1, nextCursor: null }
          : { entries: [MAIL], total: 1, nextCursor: null },
      ),
    );
    const { findAllByLabelText, getByLabelText, queryAllByLabelText } = render(<PluginsScreen />);
    await waitFor(() => expect(connectors.fetchConnectorDirectory).toHaveBeenCalledTimes(1));

    fireEvent.changeText(getByLabelText('Search plugins'), 'docs');
    expect((await findAllByLabelText(/^Docs kit by AGI Workforce/)).length).toBeGreaterThan(0);

    await act(async () => {
      resolveRetiredDirectory({ connectors: [] });
      await retiredDirectory;
    });

    expect(queryAllByLabelText(/^Mail helper by AGI Workforce/)).toHaveLength(0);
    expect(queryAllByLabelText(/^Docs kit by AGI Workforce/).length).toBeGreaterThan(0);
  });

  it('titles sections in title case and shows installed plugins as tiles under Installed', async () => {
    mockInstallations.mockResolvedValue([INSTALLED_DOCS]);
    const { findByRole, findByLabelText, queryByText } = render(<PluginsScreen />);
    expect(await findByRole('header', { name: 'Installed' })).toBeTruthy();
    expect(await findByLabelText('Docs kit, installed')).toBeTruthy();
    expect(queryByText('INSTALLED')).toBeNull();
  });

  describe('installed tiles', () => {
    function installation(id: string, installedAt: string, enabled = true) {
      return {
        pluginId: id,
        installedVersion: '1.0.0',
        enabled,
        installedAt,
        updatedAt: installedAt,
      };
    }
    const SEVEN = Array.from({ length: 7 }, (_, index) =>
      installation(`p${index}`, `2026-10-0${index + 1}T00:00:00.000Z`),
    );
    const KIT_NAMES = ['Alpha', 'Bravo', 'Cedar', 'Delta', 'Ember', 'Forge', 'Grove'];
    const SEVEN_ENTRIES = SEVEN.map((item, index) =>
      entry({ id: item.pluginId, name: `${KIT_NAMES[index]} kit`, installs: 0 }),
    );

    beforeEach(() => {
      mockDirectory.mockResolvedValue({
        entries: SEVEN_ENTRIES,
        total: 7,
        nextCursor: null,
      });
      mockInstallations.mockResolvedValue(SEVEN);
    });

    it('shows the five most recently installed first and a plus tile for the rest', async () => {
      const { findByLabelText, getAllByLabelText, queryByLabelText, getByText } = render(
        <PluginsScreen />,
      );
      expect(await findByLabelText('Grove kit, installed')).toBeTruthy();
      const labels = getAllByLabelText(/, installed$/).map((tile) => tile.props.accessibilityLabel);
      expect(labels).toEqual([
        'Grove kit, installed',
        'Forge kit, installed',
        'Ember kit, installed',
        'Delta kit, installed',
        'Cedar kit, installed',
      ]);
      expect(queryByLabelText('Bravo kit, installed')).toBeNull();
      expect(getByText('+2')).toBeTruthy();
      expect(getByText('G')).toBeTruthy();
    });

    it('opens the plugin from a tile, and the Added page from the heading and the plus tile', async () => {
      const { findByLabelText, findByRole, getByLabelText } = render(<PluginsScreen />);
      fireEvent.press(await findByLabelText('Grove kit, installed'));
      expect(mockPush).toHaveBeenLastCalledWith({
        pathname: '/(app)/plugins/[id]',
        params: { id: 'p6' },
      });

      fireEvent.press(await findByRole('header', { name: 'Installed' }));
      expect(mockPush).toHaveBeenLastCalledWith('/(app)/plugins/installed');

      mockPush.mockClear();
      fireEvent.press(getByLabelText('2 more installed plugins'));
      expect(mockPush).toHaveBeenCalledWith('/(app)/plugins/installed');
    });

    it('names a single hidden plugin in the singular', async () => {
      mockInstallations.mockResolvedValue(SEVEN.slice(0, 6));
      const { findByLabelText, getByText } = render(<PluginsScreen />);
      expect(await findByLabelText('1 more installed plugin')).toBeTruthy();
      expect(getByText('+1').props.numberOfLines).toBe(1);
      expect(getByText('+1').props.adjustsFontSizeToFit).toBe(true);
    });

    it('has no plus tile for five or fewer', async () => {
      mockInstallations.mockResolvedValue(SEVEN.slice(0, 5));
      const { findByLabelText, queryByLabelText } = render(<PluginsScreen />);
      expect(await findByLabelText('Ember kit, installed')).toBeTruthy();
      expect(queryByLabelText(/more installed plugins/)).toBeNull();
    });

    it('takes tiles from the installations, not from the loaded page', async () => {
      mockDirectory.mockResolvedValue({ entries: [MAIL], total: 1, nextCursor: null });
      mockInstallations.mockResolvedValue([
        installation('off-page', '2026-10-05T00:00:00.000Z'),
        installation('gone', '2026-10-04T00:00:00.000Z'),
      ]);
      mockPlugin.mockImplementation(async (id: string) => {
        if (id === 'gone') throw new Error('missing');
        return entry({ id, name: 'Off page kit', installs: 0 });
      });
      const { findByLabelText } = render(<PluginsScreen />);
      expect(await findByLabelText('Off page kit, installed')).toBeTruthy();
      expect(await findByLabelText('gone, installed')).toBeTruthy();
      expect(mockPlugin).toHaveBeenCalledWith('off-page', expect.anything());
      expect(mockPlugin).toHaveBeenCalledWith('gone', expect.anything());
    });

    it('hides the row when nothing is installed', async () => {
      mockInstallations.mockResolvedValue([]);
      const { findAllByLabelText, queryByRole } = render(<PluginsScreen />);
      expect((await findAllByLabelText(/^Alpha kit by AGI Workforce/)).length).toBeGreaterThan(0);
      expect(queryByRole('header', { name: 'Installed' })).toBeNull();
    });

    it('hides the row while filtering and brings it back when the filter is cleared', async () => {
      const { findByLabelText, getByLabelText, queryByLabelText, findByRole } = render(
        <PluginsScreen />,
      );
      expect(await findByLabelText('Grove kit, installed')).toBeTruthy();
      fireEvent.changeText(getByLabelText('Search plugins'), 'kit');
      await waitFor(() => expect(queryByLabelText('Grove kit, installed')).toBeNull());
      expect(await findByRole('header', { name: 'Results' })).toBeTruthy();

      fireEvent.changeText(getByLabelText('Search plugins'), '');
      expect(await findByLabelText('Grove kit, installed')).toBeTruthy();
    });

    it('hides the row when the installations cannot be loaded', async () => {
      mockInstallations.mockRejectedValue(new Error('offline'));
      const { findAllByLabelText, queryByRole } = render(<PluginsScreen />);
      expect((await findAllByLabelText(/^Alpha kit by AGI Workforce/)).length).toBeGreaterThan(0);
      expect(queryByRole('header', { name: 'Installed' })).toBeNull();
    });
  });

  describe('bottom search', () => {
    it('has one search field, a floating bar, with a clear button once there is a query', async () => {
      const {
        findAllByLabelText,
        getAllByLabelText,
        getByLabelText,
        queryByLabelText,
        getByTestId,
      } = render(<PluginsScreen />);
      await findAllByLabelText(/^Docs kit by AGI Workforce/);
      expect(getAllByLabelText('Search plugins')).toHaveLength(1);
      expect(getByLabelText('Search plugins').props.placeholder).toBe('Search plugins');
      expect(getByTestId('plugins-search').props.style.marginBottom).toBe(
        mockInsets.bottom + BOTTOM_SEARCH_BAR_MARGIN,
      );
      expect(queryByLabelText('Clear plugin search')).toBeNull();

      fireEvent.changeText(getByLabelText('Search plugins'), 'docs');
      fireEvent.press(getByLabelText('Clear plugin search'));
      expect(getByLabelText('Search plugins').props.value).toBe('');
    });

    it('pads the list so Show more is not covered by the bar', async () => {
      mockDirectory.mockResolvedValue({ entries: [MAIL], total: 2, nextCursor: 'next' });
      const root = render(<PluginsScreen />);
      await root.findByText('Show more');
      const content = root.UNSAFE_getAllByType(ScrollView)[0]!.props.contentContainerStyle;
      expect(content.paddingBottom).toBeGreaterThanOrEqual(
        mockInsets.bottom + BOTTOM_SEARCH_BAR_MARGIN + BOTTOM_SEARCH_BAR_HEIGHT,
      );
    });

    it('waits 250 ms after typing before it asks the server', async () => {
      jest.useFakeTimers();
      try {
        const { getByLabelText } = render(<PluginsScreen />);
        await act(async () => {
          await jest.advanceTimersByTimeAsync(0);
        });
        mockDirectory.mockClear();

        fireEvent.changeText(getByLabelText('Search plugins'), 'docs');
        await act(async () => {
          await jest.advanceTimersByTimeAsync(249);
        });
        expect(mockDirectory).not.toHaveBeenCalled();

        await act(async () => {
          await jest.advanceTimersByTimeAsync(1);
        });
        expect(mockDirectory).toHaveBeenCalledWith(
          expect.objectContaining({ search: 'docs' }),
          expect.anything(),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('shows No matching plugins when the search finds nothing', async () => {
      const { findByText, getByLabelText, findAllByLabelText } = render(<PluginsScreen />);
      await findAllByLabelText(/^Docs kit by AGI Workforce/);
      mockDirectory.mockResolvedValue({ entries: [], total: 0, nextCursor: null });
      fireEvent.changeText(getByLabelText('Search plugins'), 'zzz');
      expect(await findByText('No matching plugins')).toBeTruthy();
    });
  });

  it('shows the approval policy as Permissions and opens Action approvals', async () => {
    const originalPolicy = useSettingsStore.getState().toolApprovalPolicy;
    try {
      useSettingsStore.getState().setToolApprovalPolicy('ask_every_time');
      const { findByRole, getByText } = render(<PluginsScreen />);
      const row = await findByRole('button', { name: 'Permissions. Ask' });
      expect(getByText(`Choose when ${PRODUCT_BRAND} asks before a plugin acts.`)).toBeTruthy();
      fireEvent.press(row);
      expect(mockPush).toHaveBeenCalledWith('/(app)/settings/auto-approve');
    } finally {
      useSettingsStore.getState().setToolApprovalPolicy(originalPolicy);
    }
  });

  it('installs from the detail screen and lists what it needs', async () => {
    mockParams.id = 'mail';
    mockPlugin.mockResolvedValue(MAIL);
    mockInstall.mockResolvedValue({ installation: {}, dependencies: [] });
    const { findByText, getByText, getByLabelText } = render(<PluginDetailScreen />);

    expect(await findByText('Security scan')).toBeTruthy();
    expect(getByText('triage, reply')).toBeTruthy();
    expect(getByText('read mail')).toBeTruthy();
    expect(getByLabelText('Connect Slack')).toBeTruthy();

    fireEvent.press(getByText('Install'));
    await waitFor(() => expect(mockInstall).toHaveBeenCalledWith('mail'));
  });

  describe('detail page state', () => {
    const INSTALLED_MAIL = {
      pluginId: 'mail',
      installedVersion: '1.0.0',
      enabled: true,
      installedAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };

    const refocus = () =>
      act(async () => {
        mockFocus.callback?.();
      });

    beforeEach(() => {
      mockParams.id = 'mail';
      mockPlugin.mockResolvedValue(MAIL);
    });

    it('opens an installed plugin with its installed controls and no Install button', async () => {
      mockInstallations.mockResolvedValue([INSTALLED_MAIL]);
      const { findByText, getByText, queryByRole } = render(<PluginDetailScreen />);

      expect(await findByText('Turned on')).toBeTruthy();
      expect(getByText('Remove plugin')).toBeTruthy();
      expect(getByText('Customize')).toBeTruthy();
      expect(queryByRole('button', { name: 'Install' })).toBeNull();
    });

    it('shows a plugin installed elsewhere when the page regains focus, not on the first focus', async () => {
      const { findByRole, findByText, queryByRole } = render(<PluginDetailScreen />);
      expect(await findByRole('button', { name: 'Install' })).toBeTruthy();
      const calls = mockInstallations.mock.calls.length;

      mockInstallations.mockResolvedValue([INSTALLED_MAIL]);
      await refocus();

      expect(await findByText('Turned on')).toBeTruthy();
      expect(queryByRole('button', { name: 'Install' })).toBeNull();
      expect(mockInstallations.mock.calls.length).toBe(calls + 1);
    });

    it('shows a plugin removed elsewhere as not installed when the page regains focus', async () => {
      mockInstallations.mockResolvedValue([INSTALLED_MAIL]);
      const { findByText, findByRole, queryByText } = render(<PluginDetailScreen />);
      expect(await findByText('Remove plugin')).toBeTruthy();

      mockInstallations.mockResolvedValue([]);
      await refocus();

      expect(await findByRole('button', { name: 'Install' })).toBeTruthy();
      expect(queryByText('Remove plugin')).toBeNull();
      expect(queryByText('Turned on')).toBeNull();
    });

    it('never offers Install when the installations cannot be read, and retries from the failure state', async () => {
      mockInstallations.mockRejectedValueOnce(new Error('offline'));
      const { findByText, queryByRole, getByText } = render(<PluginDetailScreen />);

      expect(await findByText('Could not load this plugin')).toBeTruthy();
      expect(queryByRole('button', { name: 'Install' })).toBeNull();

      mockInstallations.mockResolvedValue([INSTALLED_MAIL]);
      fireEvent.press(getByText('Try again'));

      expect(await findByText('Turned on')).toBeTruthy();
      expect(queryByRole('button', { name: 'Install' })).toBeNull();
    });

    it('replaces a stale page with the failure state when the read fails on refocus', async () => {
      const { findByRole, findByText, queryByRole } = render(<PluginDetailScreen />);
      expect(await findByRole('button', { name: 'Install' })).toBeTruthy();

      mockInstallations.mockRejectedValue(new Error('offline'));
      await refocus();

      expect(await findByText('Could not load this plugin')).toBeTruthy();
      expect(queryByRole('button', { name: 'Install' })).toBeNull();
    });

    it('disables Install while the page is checking what is installed', async () => {
      const { findByRole, getByRole } = render(<PluginDetailScreen />);
      expect(await findByRole('button', { name: 'Install' })).not.toBeDisabled();

      mockInstallations.mockReturnValue(new Promise(() => undefined));
      await refocus();

      await waitFor(() => expect(getByRole('button', { name: 'Install' })).toBeDisabled());
      fireEvent.press(getByRole('button', { name: 'Install' }));
      expect(mockInstall).not.toHaveBeenCalled();
    });

    it('keeps the newer state when an older read settles late', async () => {
      let settleOld: (value: unknown) => void = () => undefined;
      mockInstallations.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            settleOld = resolve;
          }),
      );
      const { findByText, queryByRole } = render(<PluginDetailScreen />);
      await waitFor(() => expect(mockInstallations).toHaveBeenCalledTimes(1));

      mockInstallations.mockResolvedValue([INSTALLED_MAIL]);
      await refocus();
      expect(await findByText('Turned on')).toBeTruthy();

      await act(async () => {
        settleOld([]);
      });
      expect(queryByRole('button', { name: 'Install' })).toBeNull();
    });
  });

  it('names each connector the way the directory does, with a readable fallback', async () => {
    const connectors = jest.requireMock('@/services/connectors') as {
      fetchConnectorDirectory: jest.Mock;
    };
    connectors.fetchConnectorDirectory.mockImplementationOnce(async () => ({
      connectors: [{ connectorId: 'acme-crm', toolConnectorId: 'acme-crm', name: 'Acme Sales' }],
    }));
    mockParams.id = 'mail';
    mockPlugin.mockResolvedValue(
      entry({
        id: 'mail',
        name: 'Mail helper',
        requiredConnectors: ['gmail', 'acme-crm', 'my_unlisted-tool'],
      }),
    );
    const { findByText, getByText, queryByText, getByLabelText } = render(<PluginDetailScreen />);
    expect(await findByText('Gmail')).toBeTruthy();
    expect(getByText('Acme Sales')).toBeTruthy();
    expect(getByText('My Unlisted Tool')).toBeTruthy();
    expect(queryByText('gmail')).toBeNull();
    expect(queryByText('acme-crm')).toBeNull();
    expect(getByLabelText('Connect My Unlisted Tool')).toBeTruthy();
  });

  it('writes the category on the detail page the way its chip reads', async () => {
    mockParams.id = 'mail';
    mockPlugin.mockResolvedValue(
      entry({ id: 'mail', name: 'Mail helper', category: 'data-analysis' }),
    );
    const { findByText, queryByText } = render(<PluginDetailScreen />);
    expect(await findByText(/AGI Workforce · Verified · Data analysis · Version/)).toBeTruthy();
    expect(queryByText(/data-analysis/)).toBeNull();
  });

  it('does not offer to connect while connectors are not released', async () => {
    mockConnectorsReleased.mockReturnValue(false);
    mockParams.id = 'mail';
    mockPlugin.mockResolvedValue(MAIL);
    const { findByText, queryByLabelText, getAllByText } = render(<PluginDetailScreen />);
    expect(await findByText('Security scan')).toBeTruthy();
    expect(queryByLabelText('Connect Slack')).toBeNull();
    expect(getAllByText('Coming soon').length).toBe(2);
    mockConnectorsReleased.mockReturnValue(true);
  });

  it('asks before removing and offers to remove dependents together', async () => {
    mockParams.id = 'mail';
    mockPlugin.mockResolvedValue(MAIL);
    mockInstallations.mockResolvedValue([
      {
        pluginId: 'mail',
        installedVersion: '1.0.0',
        enabled: true,
        installedAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    ]);
    const { PluginDependentsError } = jest.requireActual('../service');
    mockUninstall
      .mockRejectedValueOnce(
        new PluginDependentsError('Mail helper cannot be removed yet because Inbox needs it.', [
          { id: 'inbox', name: 'Inbox' },
        ]),
      )
      .mockResolvedValueOnce(undefined);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });

    const { findByText } = render(<PluginDetailScreen />);
    fireEvent.press(await findByText('Remove plugin'));

    await waitFor(() => expect(mockUninstall).toHaveBeenLastCalledWith('mail', true));
    expect(mockUninstall).toHaveBeenNthCalledWith(1, 'mail');
    expect(alert.mock.calls[1]?.[0]).toBe('Remove Mail helper and what needs it?');
    alert.mockRestore();
  });

  it('pins an installed plugin to a chosen version with the new permission acknowledged', async () => {
    mockParams.id = 'mail';
    mockPlugin.mockResolvedValue(MAIL);
    mockInstallations.mockResolvedValue([
      {
        pluginId: 'mail',
        installedVersion: '1.0.0',
        enabled: true,
        installedAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    ]);
    mockMove.mockResolvedValue(undefined);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });

    const { findByText, getByText } = render(<PluginDetailScreen />);
    fireEvent.press(await findByText('1.1.0'));
    fireEvent.press(getByText('Switch version'));

    await waitFor(() => expect(mockMove).toHaveBeenCalledWith('mail', '1.1.0', ['send mail']));
    expect(alert.mock.calls[0]?.[0]).toBe('Switch to version 1.1.0?');
    expect(alert.mock.calls[0]?.[1]).toContain('It also asks for: send mail.');
    alert.mockRestore();
  });

  it('disables removing and reinstalling while a version change is running', async () => {
    mockParams.id = 'mail';
    mockPlugin.mockResolvedValue(MAIL);
    mockInstallations.mockResolvedValue([
      {
        pluginId: 'mail',
        installedVersion: '1.0.0',
        enabled: true,
        installedAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    ]);
    let finish: (value: unknown) => void = () => undefined;
    mockMove.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });

    const { findByText, getByText, getByRole } = render(<PluginDetailScreen />);
    const versionChip = await findByText('1.1.0');
    expect(getByRole('button', { name: 'Remove plugin' })).not.toBeDisabled();
    fireEvent.press(versionChip);
    fireEvent.press(getByText('Switch version'));

    await waitFor(() => expect(mockMove).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getByRole('button', { name: 'Remove plugin' })).toBeDisabled());
    fireEvent.press(getByText('Remove plugin'));
    expect(mockUninstall).not.toHaveBeenCalled();

    await act(async () => {
      finish(undefined);
    });
    alert.mockRestore();
  });

  it('submits nothing when the person cancels a version change that adds a permission', async () => {
    mockParams.id = 'mail';
    mockPlugin.mockResolvedValue(MAIL);
    mockInstallations.mockResolvedValue([
      {
        pluginId: 'mail',
        installedVersion: '1.0.0',
        enabled: true,
        installedAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    ]);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
      buttons?.find((button) => button.style === 'cancel')?.onPress?.();
    });

    const { findByText, getByText } = render(<PluginDetailScreen />);
    fireEvent.press(await findByText('1.1.0'));
    fireEvent.press(getByText('Switch version'));

    await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
    expect(alert.mock.calls[0]?.[1]).toContain('It also asks for: send mail.');
    expect(mockMove).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it('acknowledges exactly the permissions the update confirmation names', async () => {
    mockParams.id = 'mail';
    mockPlugin.mockResolvedValue(MAIL);
    mockInstallations.mockResolvedValue([
      {
        pluginId: 'mail',
        installedVersion: '1.0.0',
        enabled: true,
        installedAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    ]);
    mockUpdates.mockResolvedValue([
      {
        pluginId: 'mail',
        installedVersion: '1.0.0',
        latestVersion: '1.1.0',
        installedVersionStopped: false,
        diff: {
          pluginId: 'mail',
          from: '1.0.0',
          to: '1.1.0',
          changelog: '',
          addedSkills: [],
          removedSkills: [],
          addedPermissions: [],
          removedPermissions: [],
          requiresPermissionReview: false,
        },
      },
    ]);
    mockMove.mockResolvedValue(undefined);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });

    const { findByText } = render(<PluginDetailScreen />);
    fireEvent.press(await findByText('Update to 1.1.0'));

    await waitFor(() => expect(mockMove).toHaveBeenCalledWith('mail', '1.1.0', ['send mail']));
    expect(alert.mock.calls[0]?.[1]).toContain('It also asks for: send mail.');
    alert.mockRestore();
  });

  it('offers to reinstall an installed plugin whose skills did not load', async () => {
    mockParams.id = 'mail';
    mockPlugin.mockResolvedValue(MAIL);
    mockInstallations.mockResolvedValue([
      {
        pluginId: 'mail',
        installedVersion: '1.0.0',
        enabled: true,
        installedAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    ]);
    mockManagedSkills.mockResolvedValue([]);
    mockInstall.mockResolvedValue({ installation: {}, dependencies: [] });
    const { findByText, getByLabelText } = render(<PluginDetailScreen />);
    expect(await findByText('These skills did not load: triage')).toBeTruthy();
    fireEvent.press(getByLabelText('Reinstall Mail helper'));
    await waitFor(() => expect(mockInstall).toHaveBeenCalledWith('mail'));
  });

  describe('row actions', () => {
    let platform: jest.ReplaceProperty<typeof Platform.OS>;

    beforeEach(() => {
      platform = jest.replaceProperty(Platform, 'OS', 'android');
      mockDirectory.mockResolvedValue({
        entries: [MAIL, DOCS, DESKTOP],
        total: 3,
        nextCursor: null,
      });
    });

    afterEach(() => {
      platform.restore();
      jest.restoreAllMocks();
    });

    function renderList() {
      return render(
        <>
          <PluginsScreen />
          <ActionMenuHost />
        </>,
      );
    }

    it('gives each row the control its state calls for', async () => {
      mockInstallations.mockResolvedValue([INSTALLED_DOCS]);
      const { findAllByLabelText, queryAllByLabelText, getAllByLabelText } = renderList();
      expect((await findAllByLabelText('Install Mail helper')).length).toBeGreaterThan(0);
      expect(getAllByLabelText('More actions for Docs kit').length).toBeGreaterThan(0);
      expect(queryAllByLabelText('Install Docs kit')).toHaveLength(0);
      expect(queryAllByLabelText('Install Desk kit')).toHaveLength(0);
      expect(queryAllByLabelText('More actions for Desk kit')).toHaveLength(0);
      expect(queryAllByLabelText('More actions for Mail helper')).toHaveLength(0);
      expect(getAllByLabelText('Desk kit by AGI Workforce. Desktop and CLI').length).toBe(1);
    });

    it('lists what a plugin asks for before installing it, and installs after Install', async () => {
      mockInstall.mockResolvedValue({
        installation: {},
        dependencies: [
          { pluginId: 'base', name: 'Base kit', version: '1.0.0', requiredBy: 'mail' },
        ],
      });
      const alert = pressAlertButton((button) => button.text === 'Install');
      const { findAllByLabelText } = renderList();
      fireEvent.press((await findAllByLabelText('Install Mail helper'))[0]!);

      await waitFor(() => expect(mockInstall).toHaveBeenCalledWith('mail'));
      expect(alert.mock.calls[0]?.[0]).toBe('Install Mail helper?');
      expect(alert.mock.calls[0]?.[1]).toContain(PLUGIN_PERMISSIONS_COPY);
      expect(alert.mock.calls[0]?.[1]).toContain('• read mail');
      await waitFor(() =>
        expect(mockShowToast).toHaveBeenCalledWith(
          'Installed Mail helper. Also installed: Base kit.',
        ),
      );
    });

    it('re-indexes after an install: the plus becomes the three-dot and the plugin joins Installed', async () => {
      mockInstall.mockResolvedValue({ installation: {}, dependencies: [] });
      const { findAllByLabelText, queryAllByLabelText, findByRole, queryByRole } = renderList();
      fireEvent.press((await findAllByLabelText('Install Docs kit'))[0]!);
      expect(queryByRole('header', { name: 'Installed' })).toBeNull();
      mockInstallations.mockResolvedValue([INSTALLED_DOCS]);

      expect(await findByRole('header', { name: 'Installed' })).toBeTruthy();
      expect((await findAllByLabelText('More actions for Docs kit')).length).toBeGreaterThan(0);
      expect(queryAllByLabelText('Install Docs kit')).toHaveLength(0);
      expect(mockShowToast).toHaveBeenCalledWith('Installed Docs kit');
    });

    it('installs at once when the plugin asks for nothing, and disables the rows while it runs', async () => {
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      let finish: (value: unknown) => void = () => undefined;
      mockInstall.mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const { findAllByLabelText, getAllByLabelText } = renderList();
      fireEvent.press((await findAllByLabelText('Install Docs kit'))[0]!);

      await waitFor(() => expect(mockInstall).toHaveBeenCalledWith('docs'));
      expect(alert).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(getAllByLabelText('Install Docs kit')[0]!.props.accessibilityState).toMatchObject({
          busy: true,
          disabled: true,
        }),
      );
      expect(getAllByLabelText('Install Mail helper')[0]!.props.accessibilityState).toMatchObject({
        busy: false,
        disabled: true,
      });
      expect(mockInstall).toHaveBeenCalledTimes(1);

      await act(async () => {
        finish({ installation: {}, dependencies: [] });
      });
    });

    it('installs nothing when the permissions prompt is cancelled', async () => {
      const alert = pressAlertButton((button) => button.style === 'cancel');
      const { findAllByLabelText } = renderList();
      fireEvent.press((await findAllByLabelText('Install Mail helper'))[0]!);
      await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
      expect(mockInstall).not.toHaveBeenCalled();
    });

    it('shows an alert with the refusal and keeps the plus when an install fails', async () => {
      mockInstall.mockRejectedValue(new ApiHttpError('Blocked by the security scan.', 422));
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      const { findAllByLabelText } = renderList();
      fireEvent.press((await findAllByLabelText('Install Docs kit'))[0]!);
      await waitFor(() =>
        expect(alert).toHaveBeenCalledWith('Docs kit', 'Blocked by the security scan.'),
      );
      expect((await findAllByLabelText('Install Docs kit')).length).toBeGreaterThan(0);
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('turns an installed plugin off from its menu and updates its meta', async () => {
      mockInstallations.mockResolvedValue([INSTALLED_DOCS]);
      mockEnabled.mockResolvedValue({ ...INSTALLED_DOCS, enabled: false });
      const { findAllByLabelText, getByText, getByTestId, queryByText } = renderList();
      fireEvent.press((await findAllByLabelText('More actions for Docs kit'))[0]!);
      expect(getByText('View details')).toBeTruthy();
      expect(getByText('Turn off')).toBeTruthy();
      expect(queryByText(/^Update to/)).toBeNull();
      expect(getByText('Remove')).toBeTruthy();
      expect(getByText('Cancel')).toBeTruthy();

      mockInstallations.mockResolvedValue([{ ...INSTALLED_DOCS, enabled: false }]);
      fireEvent.press(getByTestId('conversation-action-enabled'));
      await waitFor(() => expect(mockEnabled).toHaveBeenCalledWith('docs', false));
      expect((await findAllByLabelText('Docs kit by AGI Workforce. Turned off')).length).toBe(2);

      fireEvent.press((await findAllByLabelText('More actions for Docs kit'))[0]!);
      expect(getByText('Turn on')).toBeTruthy();
    });

    it('offers View details and an update only when there is an update offer', async () => {
      mockInstallations.mockResolvedValue([INSTALLED_DOCS]);
      mockUpdates.mockResolvedValue([DOCS_UPDATE]);
      const { findAllByLabelText, getByText, getByTestId } = renderList();
      fireEvent.press((await findAllByLabelText('More actions for Docs kit'))[0]!);
      expect(getByText('Update to 1.1.0')).toBeTruthy();

      fireEvent.press(getByTestId('conversation-action-update'));
      await waitFor(() =>
        expect(mockPush).toHaveBeenCalledWith({
          pathname: '/(app)/plugins/[id]',
          params: { id: 'docs' },
        }),
      );
      expect(mockMove).not.toHaveBeenCalled();
    });

    it('names what stops working before it removes a plugin', async () => {
      mockInstallations.mockResolvedValue([INSTALLED_DOCS]);
      const alert = pressAlertButton((button) => button.style === 'cancel');
      const { findAllByLabelText, getByTestId } = renderList();
      fireEvent.press((await findAllByLabelText('More actions for Docs kit'))[0]!);
      fireEvent.press(getByTestId('conversation-action-remove'));

      await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
      expect(alert.mock.calls[0]?.[0]).toBe('Remove Docs kit?');
      expect(alert.mock.calls[0]?.[1]).toContain('stop loading in your Cloud chats');
      expect(mockUninstall).not.toHaveBeenCalled();
    });

    it('removes a plugin together with what needs it after a second confirmation', async () => {
      mockInstallations.mockResolvedValue([INSTALLED_DOCS]);
      const { PluginDependentsError } = jest.requireActual('../service');
      mockUninstall
        .mockRejectedValueOnce(
          new PluginDependentsError('Docs kit cannot be removed yet because Inbox needs it.', [
            { id: 'inbox', name: 'Inbox' },
          ]),
        )
        .mockResolvedValueOnce(undefined);
      const alert = pressAlertButton((button) => button.style === 'destructive');
      const { findAllByLabelText, getByTestId, queryAllByLabelText } = renderList();
      fireEvent.press((await findAllByLabelText('More actions for Docs kit'))[0]!);
      mockInstallations.mockResolvedValue([]);
      fireEvent.press(getByTestId('conversation-action-remove'));

      await waitFor(() => expect(mockUninstall).toHaveBeenLastCalledWith('docs', true));
      expect(mockUninstall).toHaveBeenNthCalledWith(1, 'docs');
      expect(alert.mock.calls[1]?.[0]).toBe('Remove Docs kit and what needs it?');
      expect(alert.mock.calls[1]?.[1]).toContain('Inbox');
      await waitFor(() => expect(queryAllByLabelText('More actions for Docs kit')).toHaveLength(0));
    });

    it('shows an alert when turning a plugin off fails', async () => {
      mockInstallations.mockResolvedValue([INSTALLED_DOCS]);
      mockEnabled.mockRejectedValue(new Error('offline'));
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      const { findAllByLabelText, getByTestId } = renderList();
      fireEvent.press((await findAllByLabelText('More actions for Docs kit'))[0]!);
      fireEvent.press(getByTestId('conversation-action-enabled'));
      await waitFor(() =>
        expect(alert).toHaveBeenCalledWith('Docs kit', 'Could not turn Docs kit off.'),
      );
    });

    it('lists the popular installable plugins including installed ones, once in Popular and once in All plugins', async () => {
      mockInstallations.mockResolvedValue([INSTALLED_DOCS]);
      const { findAllByLabelText } = renderList();
      expect((await findAllByLabelText(/^Docs kit by AGI Workforce/)).length).toBe(2);
    });

    it('sets the sort to Popular from the heading', async () => {
      const { findByRole, getByLabelText } = renderList();
      fireEvent.press(await findByRole('header', { name: 'Popular' }));
      fireEvent.press(getByLabelText('Sort by name'));
      await waitFor(() =>
        expect(mockDirectory).toHaveBeenLastCalledWith(
          expect.objectContaining({ sort: 'name' }),
          expect.anything(),
        ),
      );
      fireEvent.press(await findByRole('header', { name: 'Popular' }));
      await waitFor(() =>
        expect(mockDirectory).toHaveBeenLastCalledWith(
          expect.objectContaining({ sort: 'installs' }),
          expect.anything(),
        ),
      );
    });

    it('refreshes the installations when the list regains focus, not on the first focus', async () => {
      mockInstallations.mockResolvedValue([]);
      const { findAllByLabelText, queryAllByLabelText } = renderList();
      expect((await findAllByLabelText('Install Docs kit')).length).toBeGreaterThan(0);
      const calls = mockInstallations.mock.calls.length;

      mockInstallations.mockResolvedValue([INSTALLED_DOCS]);
      await act(async () => {
        mockFocus.callback?.();
      });
      await waitFor(() => expect(queryAllByLabelText('Install Docs kit')).toHaveLength(0));
      expect(mockInstallations.mock.calls.length).toBe(calls + 1);
      expect(queryAllByLabelText('More actions for Docs kit').length).toBeGreaterThan(0);
    });

    describe('scrolling to All plugins from the Popular heading', () => {
      const frames = new Map<number, () => void>();
      let nextFrame = 0;
      const runFrames = () =>
        act(async () => {
          const due = [...frames.values()];
          frames.clear();
          due.forEach((run) => run());
        });

      beforeEach(() => {
        frames.clear();
        jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
          nextFrame += 1;
          frames.set(nextFrame, () => callback(0));
          return nextFrame;
        });
        jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
          if (typeof id === 'number') frames.delete(id);
        });
      });

      function scrollSpy(root: ReturnType<typeof renderList>) {
        const scroll = root.UNSAFE_getAllByType(ScrollView)[0]!.instance;
        return jest.spyOn(scroll, 'scrollTo').mockImplementation(() => undefined);
      }

      it('scrolls at once when the sort is already Popular', async () => {
        const root = renderList();
        const scrollTo = scrollSpy(root);
        fireEvent(await root.findByText('All plugins'), 'layout', {
          nativeEvent: { layout: { x: 0, y: 640, width: 300, height: 30 } },
        });
        fireEvent.press(await root.findByRole('header', { name: 'Popular' }));
        expect(scrollTo).toHaveBeenCalledWith({ y: 640, animated: true });
      });

      it('waits for the reload after a sort change and scrolls to the new offset', async () => {
        let finish: (page: unknown) => void = () => undefined;
        const root = renderList();
        const scrollTo = scrollSpy(root);
        fireEvent.press(await root.findByLabelText('Sort by name'));
        await waitFor(() =>
          expect(mockDirectory).toHaveBeenLastCalledWith(
            expect.objectContaining({ sort: 'name' }),
            expect.anything(),
          ),
        );
        await root.findAllByLabelText(/^Docs kit by AGI Workforce/);

        mockDirectory.mockImplementation(
          () =>
            new Promise((resolve) => {
              finish = resolve;
            }),
        );
        fireEvent.press(await root.findByRole('header', { name: 'Popular' }));
        await waitFor(() =>
          expect(mockDirectory).toHaveBeenLastCalledWith(
            expect.objectContaining({ sort: 'installs' }),
            expect.anything(),
          ),
        );
        fireEvent(root.getByText('All plugins'), 'layout', {
          nativeEvent: { layout: { x: 0, y: 300, width: 300, height: 30 } },
        });
        await runFrames();
        expect(scrollTo).not.toHaveBeenCalled();

        await act(async () => {
          finish({ entries: [MAIL, DOCS, DESKTOP], total: 3, nextCursor: null });
        });
        await waitFor(() => expect(frames.size).toBeGreaterThan(0));
        fireEvent(root.getByText('All plugins'), 'layout', {
          nativeEvent: { layout: { x: 0, y: 720, width: 300, height: 30 } },
        });
        expect(scrollTo).toHaveBeenCalledTimes(1);
        expect(scrollTo).toHaveBeenCalledWith({ y: 720, animated: true });

        await runFrames();
        expect(scrollTo).toHaveBeenCalledTimes(1);
      });

      it('still scrolls after the reload when the list did not move', async () => {
        const root = renderList();
        const scrollTo = scrollSpy(root);
        fireEvent.press(await root.findByLabelText('Sort by name'));
        await root.findAllByLabelText(/^Docs kit by AGI Workforce/);
        fireEvent(root.getByText('All plugins'), 'layout', {
          nativeEvent: { layout: { x: 0, y: 410, width: 300, height: 30 } },
        });
        fireEvent.press(await root.findByRole('header', { name: 'Popular' }));
        await waitFor(() =>
          expect(mockDirectory).toHaveBeenLastCalledWith(
            expect.objectContaining({ sort: 'installs' }),
            expect.anything(),
          ),
        );
        await waitFor(() => expect(frames.size).toBeGreaterThan(0));
        await runFrames();
        expect(scrollTo).toHaveBeenCalledWith({ y: 410, animated: true });
      });
    });

    it('hides Popular when no plugin qualifies', async () => {
      mockDirectory.mockResolvedValue({ entries: [MAIL, DESKTOP], total: 2, nextCursor: null });
      const { findAllByLabelText, queryByRole } = renderList();
      expect((await findAllByLabelText(/^Mail helper by AGI Workforce/)).length).toBeGreaterThan(0);
      expect(queryByRole('header', { name: 'Popular' })).toBeNull();
    });
  });

  describe('category shelves', () => {
    const SHELF_STATS = {
      byCategory: { finance: 5, developer: 4, design: 3, writing: 2, data: 9 },
    };

    function shelfEntries(category: string) {
      return [1, 2, 3, 4].map((index) =>
        entry({ id: `${category}-${index}`, name: `${category} kit ${index}`, category }),
      );
    }

    beforeEach(() => {
      mockDirectory.mockImplementation((query: { category?: string }) =>
        Promise.resolve({
          entries: query.category ? shelfEntries(query.category) : [MAIL, DOCS],
          total: 2,
          nextCursor: null,
          stats: SHELF_STATS,
        }),
      );
    });

    it('shows the three largest categories with at least three plugins, four rows each', async () => {
      const { findByRole, queryByRole, getAllByLabelText, queryAllByLabelText } = render(
        <PluginsScreen />,
      );
      expect(await findByRole('header', { name: 'Data' })).toBeTruthy();
      expect(await findByRole('header', { name: 'Finance' })).toBeTruthy();
      expect(await findByRole('header', { name: 'Developer' })).toBeTruthy();
      expect(queryByRole('header', { name: 'Design' })).toBeNull();
      expect(queryByRole('header', { name: 'Writing' })).toBeNull();
      expect(queryByRole('header', { name: 'Small business' })).toBeNull();
      expect(mockDirectory).toHaveBeenCalledWith(
        { category: 'data', sort: 'installs', limit: 4 },
        expect.anything(),
      );
      expect(getAllByLabelText(/^data kit \d by AGI Workforce/)).toHaveLength(4);
      expect(queryAllByLabelText(/^design kit/)).toHaveLength(0);
    });

    it('draws the shelf rows with the install control', async () => {
      const { findByRole, getByLabelText } = render(<PluginsScreen />);
      await findByRole('header', { name: 'Data' });
      expect(getByLabelText('Install data kit 1')).toBeTruthy();
    });

    it('hides a shelf that fails to load or comes back empty', async () => {
      mockDirectory.mockImplementation((query: { category?: string }) => {
        if (query.category === 'data') return Promise.reject(new Error('offline'));
        if (query.category === 'finance') {
          return Promise.resolve({ entries: [], total: 0, nextCursor: null });
        }
        return Promise.resolve({
          entries: query.category ? shelfEntries(query.category) : [MAIL, DOCS],
          total: 2,
          nextCursor: null,
          stats: SHELF_STATS,
        });
      });
      const { findByRole, queryByRole } = render(<PluginsScreen />);
      expect(await findByRole('header', { name: 'Developer' })).toBeTruthy();
      expect(queryByRole('header', { name: 'Data' })).toBeNull();
      expect(queryByRole('header', { name: 'Finance' })).toBeNull();
    });

    it('shows no shelf when no category has three plugins', async () => {
      mockDirectory.mockResolvedValue({
        entries: [MAIL, DOCS],
        total: 2,
        nextCursor: null,
        stats: { byCategory: { finance: 2, developer: 1 } },
      });
      const { findByRole, queryByRole } = render(<PluginsScreen />);
      await findByRole('header', { name: 'Popular' });
      expect(mockDirectory).toHaveBeenCalledTimes(1);
      expect(queryByRole('header', { name: 'Finance' })).toBeNull();
    });

    it('leaves the shelves out while a filter is active', async () => {
      const { findByRole, getAllByText, queryByRole } = render(<PluginsScreen />);
      await findByRole('header', { name: 'Data' });
      fireEvent.press(getAllByText('Developer')[0]);
      await waitFor(() => expect(queryByRole('header', { name: 'Data' })).toBeNull());
      expect(queryByRole('header', { name: 'Results' })).toBeTruthy();
    });

    it('selects the category and scrolls to the results from the heading', async () => {
      const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {});
      const { findByRole, getByRole } = render(<PluginsScreen />);
      fireEvent.press(await findByRole('header', { name: 'Finance' }));
      await waitFor(() =>
        expect(mockDirectory).toHaveBeenLastCalledWith(
          expect.objectContaining({ category: 'finance', sort: 'installs' }),
          expect.anything(),
        ),
      );
      await waitFor(() => expect(scrollTo).toHaveBeenCalled());
      expect(getByRole('header', { name: 'Results' })).toBeTruthy();
      scrollTo.mockRestore();
    });
  });

  describe('title section menu', () => {
    let platform: jest.ReplaceProperty<typeof Platform.OS>;

    beforeEach(() => {
      platform = jest.replaceProperty(Platform, 'OS', 'android');
    });

    afterEach(() => {
      platform.restore();
    });

    async function openTitleMenu() {
      const view = render(
        <>
          <PluginsScreen />
          <ActionMenuHost />
        </>,
      );
      fireEvent.press(await view.findByLabelText('Plugins, switch section'));
      return view;
    }

    it('lists the customize sections with Plugins marked and Sources last', async () => {
      const { getByTestId, getAllByTestId, queryByLabelText } = await openTitleMenu();
      expect(
        getAllByTestId(/^conversation-action-/)
          .map((node) => node.props.testID)
          .filter((id) => id !== 'conversation-action-cancel'),
      ).toEqual([
        'conversation-action-plugins',
        'conversation-action-skills',
        'conversation-action-connectors',
        'conversation-action-agents',
        'conversation-action-sources',
      ]);
      expect(getByTestId('conversation-action-plugins').props.accessibilityState).toEqual(
        expect.objectContaining({ selected: true }),
      );
      expect(queryByLabelText('Workspace plugins, marketplaces and submissions')).toBeNull();
    });

    it('leaves Skills out when the build has them turned off', async () => {
      mockFeatures.skills = false;
      const { queryByTestId } = await openTitleMenu();
      expect(queryByTestId('conversation-action-skills')).toBeNull();
      expect(queryByTestId('conversation-action-connectors')).toBeTruthy();
    });

    it('replaces the screen with the chosen section', async () => {
      const { getByTestId } = await openTitleMenu();
      fireEvent.press(getByTestId('conversation-action-connectors'));
      await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(app)/connectors'));
    });

    it('stays on Plugins when the current section is chosen', async () => {
      const { getByTestId } = await openTitleMenu();
      fireEvent.press(getByTestId('conversation-action-plugins'));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
      });
      expect(mockReplace).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('opens Sources from the last item', async () => {
      const { getByTestId } = await openTitleMenu();
      fireEvent.press(getByTestId('conversation-action-sources'));
      await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/(app)/plugins/sources'));
    });
  });
});
