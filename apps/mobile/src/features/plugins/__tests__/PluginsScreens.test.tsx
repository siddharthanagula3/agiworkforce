import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
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

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    canGoBack: jest.fn(() => true),
  }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@clerk/expo', () => ({ getClerkInstance: () => null }));
jest.mock('@agiworkforce/types', () => ({
  ...jest.requireActual('@agiworkforce/types'),
  connectorsReleased: () => mockConnectorsReleased(),
}));
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
import { useSettingsStore } from '@/stores/settingsStore';
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

describe('mobile plugins', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete mockParams.id;
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
    const { findByText, getByText, getAllByLabelText } = render(<PluginsScreen />);
    expect(await findByText('Featured')).toBeTruthy();
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

  it('titles sections in title case and lists installed plugins once under Installed', async () => {
    mockInstallations.mockResolvedValue([
      {
        pluginId: 'docs',
        installedVersion: '1.0.0',
        enabled: true,
        installedAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    ]);
    const { findByRole, queryByText } = render(<PluginsScreen />);
    expect(await findByRole('header', { name: 'Installed' })).toBeTruthy();
    expect(queryByText('INSTALLED')).toBeNull();
  });

  it('shows the approval policy as Permissions and opens Action approvals', async () => {
    const originalPolicy = useSettingsStore.getState().toolApprovalPolicy;
    try {
      useSettingsStore.getState().setToolApprovalPolicy('ask_every_time');
      const { findByRole, getByText } = render(<PluginsScreen />);
      const row = await findByRole('button', { name: 'Permissions. Ask' });
      expect(getByText('Choose when AGI asks before a plugin acts.')).toBeTruthy();
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
    expect(getByLabelText('Connect slack')).toBeTruthy();

    fireEvent.press(getByText('Install'));
    await waitFor(() => expect(mockInstall).toHaveBeenCalledWith('mail'));
  });

  it('does not offer to connect while connectors are not released', async () => {
    mockConnectorsReleased.mockReturnValue(false);
    mockParams.id = 'mail';
    mockPlugin.mockResolvedValue(MAIL);
    const { findByText, queryByLabelText, getAllByText } = render(<PluginDetailScreen />);
    expect(await findByText('Security scan')).toBeTruthy();
    expect(queryByLabelText('Connect slack')).toBeNull();
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
});
