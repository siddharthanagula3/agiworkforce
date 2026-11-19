import React from 'react';
import { Dimensions, RefreshControl, ScrollView } from 'react-native';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { PRODUCT_BRAND } from '@agiworkforce/types';

const mockPush = jest.fn();
const mockPlugin = jest.fn();
const mockInstallations = jest.fn();
const mockInsets = { top: 0, bottom: 34, left: 0, right: 0 };
const mockFocus: { callback: (() => void) | null } = { callback: null };

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
      replace: jest.fn(),
      navigate: jest.fn(),
      canGoBack: jest.fn(() => true),
    }),
  };
});
jest.mock('@clerk/expo', () => ({ getClerkInstance: () => null }));
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
jest.mock('@/services/preferences', () => ({
  fetchToolApprovalNamespace: jest.fn(async () => ({
    settings: { defaultPolicy: 'ask_every_time' },
    autonomousToolApprovalsAllowed: true,
  })),
  savePreferenceNamespace: jest.fn(async () => undefined),
}));
jest.mock('../service', () => ({
  ...jest.requireActual('../service'),
  fetchPlugin: (...args: unknown[]) => mockPlugin(...args),
  fetchPluginInstallations: (...args: unknown[]) => mockInstallations(...args),
}));

import type { PluginDirectoryEntryWire } from '@agiworkforce/cloud-contracts';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  BOTTOM_SEARCH_BAR_HEIGHT,
  BOTTOM_SEARCH_BAR_MARGIN,
} from '@/src/shared/components/BottomSearchBar';
import { TextScaleBoundary } from '@/src/shared/components/TextScaleBoundary';
import { ROW_LABEL_TEXT_SCALE_LIMIT } from '@/src/ui/theme/tokens';
import { LARGEST_IOS_TEXT_SCALE, setTextScale } from '@/test-utils/textScale';
import { PLUGIN_DETAIL_CONCURRENCY } from '../pluginsModel';
import { InstalledPluginsScreen } from '../InstalledPluginsScreen';

function entry(id: string, name: string): PluginDirectoryEntryWire {
  return {
    id,
    name,
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
    installs: 1,
    worksWith: ['web'],
  };
}

function installation(id: string, enabled = true) {
  return {
    pluginId: id,
    installedVersion: '1.0.0',
    enabled,
    installedAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

const NAMES: Record<string, string> = {
  zeta: 'Zeta kit',
  alpha: 'alpha kit',
  mid: 'Mid kit',
};

describe('added plugins', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('user-1');
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: 'user-1' });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    mockInstallations.mockResolvedValue([
      installation('zeta'),
      installation('alpha'),
      installation('mid', false),
    ]);
    mockPlugin.mockImplementation(async (id: string) => entry(id, NAMES[id] ?? id));
  });

  it('lists every installation from A to Z with Turned off where it applies', async () => {
    const { findByLabelText, getAllByRole, getByLabelText, getByText } = render(
      <InstalledPluginsScreen />,
    );
    expect(await findByLabelText('alpha kit')).toBeTruthy();
    expect(getByLabelText('Mid kit. Turned off')).toBeTruthy();
    expect(getByText('Turned off')).toBeTruthy();
    const names = getAllByRole('button')
      .map((button) => button.props.accessibilityLabel as string)
      .filter((label) => /kit/.test(label));
    expect(names).toEqual(['alpha kit', 'Mid kit. Turned off', 'Zeta kit']);
    expect(mockPlugin).toHaveBeenCalledTimes(3);
  });

  it('starts with the Permissions row and opens a plugin from its row', async () => {
    const { findByLabelText, getByText, getByRole } = render(<InstalledPluginsScreen />);
    fireEvent.press(await findByLabelText('Zeta kit'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/plugins/[id]',
      params: { id: 'zeta' },
    });
    expect(getByRole('button', { name: 'Permissions. Ask' })).toBeTruthy();
    expect(getByText(`Choose when ${PRODUCT_BRAND} asks before a plugin acts.`)).toBeTruthy();
  });

  it('shows a loading state before the list, and fetches at most six details at once', async () => {
    const ids = Array.from({ length: 10 }, (_, index) => `p${index}`);
    mockInstallations.mockResolvedValue(ids.map((id) => installation(id)));
    let active = 0;
    let peak = 0;
    const releases: (() => void)[] = [];
    mockPlugin.mockImplementation(
      (id: string) =>
        new Promise((resolve) => {
          active += 1;
          peak = Math.max(peak, active);
          releases.push(() => {
            active -= 1;
            resolve(entry(id, `Kit ${id}`));
          });
        }),
    );
    const { findByLabelText, queryByLabelText } = render(<InstalledPluginsScreen />);
    await waitFor(() => expect(releases).toHaveLength(PLUGIN_DETAIL_CONCURRENCY));
    expect(queryByLabelText('Kit p0')).toBeNull();
    expect(peak).toBe(PLUGIN_DETAIL_CONCURRENCY);

    while (releases.length > 0 || mockPlugin.mock.calls.length < ids.length) {
      await act(async () => {
        releases.splice(0).forEach((release) => release());
      });
    }
    expect(await findByLabelText('Kit p9')).toBeTruthy();
    expect(peak).toBe(PLUGIN_DETAIL_CONCURRENCY);
    expect(mockPlugin).toHaveBeenCalledTimes(ids.length);
  });

  it('keeps an entry that fails, shows its id with Could not load, and retries it', async () => {
    mockPlugin.mockImplementation(async (id: string) => {
      if (id === 'mid') throw new Error('offline');
      return entry(id, NAMES[id] ?? id);
    });
    const { findByLabelText, getByLabelText, queryByText } = render(<InstalledPluginsScreen />);
    expect(await findByLabelText('mid. Could not load')).toBeTruthy();
    expect(getByLabelText('Zeta kit')).toBeTruthy();
    expect(queryByText('Could not load your plugins.')).toBeNull();

    mockPlugin.mockImplementation(async (id: string) => entry(id, NAMES[id] ?? id));
    mockPlugin.mockClear();
    await act(async () => {
      mockFocus.callback?.();
    });
    expect(await findByLabelText('Mid kit. Turned off')).toBeTruthy();
    expect(mockPlugin).toHaveBeenCalledTimes(1);
    expect(mockPlugin).toHaveBeenCalledWith('mid', expect.anything());
  });

  it('keeps the list and shows no spinner while a failed entry is retried on return', async () => {
    mockPlugin.mockImplementation(async (id: string) => {
      if (id === 'mid') throw new Error('offline');
      return entry(id, NAMES[id] ?? id);
    });
    const root = render(<InstalledPluginsScreen />);
    await root.findByLabelText('mid. Could not load');

    let release: (() => void) | null = null;
    mockPlugin.mockImplementation(
      (id: string) =>
        new Promise((resolve) => {
          release = () => resolve(entry(id, NAMES[id] ?? id));
        }),
    );
    await act(async () => {
      mockFocus.callback?.();
    });
    await waitFor(() => expect(release).not.toBeNull());
    expect(root.getByLabelText('Zeta kit')).toBeTruthy();
    expect(root.getByLabelText('mid. Could not load')).toBeTruthy();
    expect(root.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(false);

    await act(async () => {
      release?.();
    });
    expect(await root.findByLabelText('Mid kit. Turned off')).toBeTruthy();
  });

  it('shows the pull to refresh spinner only for a pull', async () => {
    const root = render(<InstalledPluginsScreen />);
    await root.findByLabelText('Zeta kit');
    let finish: ((value: unknown) => void) | null = null;
    mockInstallations.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    act(() => {
      root.UNSAFE_getByType(RefreshControl).props.onRefresh();
    });
    expect(root.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(true);
    await act(async () => {
      finish?.([installation('zeta')]);
    });
    await waitFor(() => expect(root.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(false));
  });

  it('loads the details again when the account changes while they are in flight', async () => {
    const releases: (() => void)[] = [];
    mockPlugin.mockImplementation(
      (id: string) =>
        new Promise((resolve) => {
          releases.push(() => resolve(entry(id, NAMES[id] ?? id)));
        }),
    );
    const root = render(<InstalledPluginsScreen />);
    await waitFor(() => expect(releases).toHaveLength(3));

    act(() => {
      activateCloudAccount('user-2');
      useAuthStore.setState({ clerkUserId: 'user-2' });
    });
    await waitFor(() => expect(releases.length).toBeGreaterThanOrEqual(6));
    await act(async () => {
      releases.splice(0).forEach((release) => release());
    });
    expect(await root.findByLabelText('Zeta kit')).toBeTruthy();
    expect(root.getByLabelText('alpha kit')).toBeTruthy();
  });

  it('filters by name on the phone with the bottom search bar and clears it', async () => {
    const { findByLabelText, getByLabelText, queryByLabelText, getByText, getByTestId } = render(
      <InstalledPluginsScreen />,
    );
    await findByLabelText('Zeta kit');
    mockPlugin.mockClear();
    mockInstallations.mockClear();
    expect(getByLabelText('Search plugins').props.placeholder).toBe('Search plugins');
    expect(getByTestId('added-plugins-search').props.style.marginBottom).toBe(
      mockInsets.bottom + BOTTOM_SEARCH_BAR_MARGIN,
    );

    fireEvent.changeText(getByLabelText('Search plugins'), 'ZET');
    expect(getByLabelText('Zeta kit')).toBeTruthy();
    expect(queryByLabelText('alpha kit')).toBeNull();

    fireEvent.changeText(getByLabelText('Search plugins'), 'nothing like it');
    expect(getByText('No matching plugins')).toBeTruthy();

    fireEvent.press(getByLabelText('Clear plugin search'));
    expect(getByLabelText('alpha kit')).toBeTruthy();
    expect(mockPlugin).not.toHaveBeenCalled();
    expect(mockInstallations).not.toHaveBeenCalled();
  });

  it('pads the list below the floating search bar', async () => {
    const root = render(<InstalledPluginsScreen />);
    await root.findByLabelText('Zeta kit');
    const content = root.UNSAFE_getAllByType(ScrollView)[0]!.props.contentContainerStyle;
    expect(content.paddingBottom).toBeGreaterThanOrEqual(
      mockInsets.bottom + BOTTOM_SEARCH_BAR_MARGIN + BOTTOM_SEARCH_BAR_HEIGHT,
    );
  });

  it('says nothing is added yet and offers Browse plugins, with no search bar', async () => {
    mockInstallations.mockResolvedValue([]);
    const { findByText, getByText, queryByLabelText } = render(<InstalledPluginsScreen />);
    expect(await findByText('No plugins added yet')).toBeTruthy();
    expect(queryByLabelText('Search plugins')).toBeNull();
    fireEvent.press(getByText('Browse plugins'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/plugins');
  });

  it('shows Could not load your plugins with Retry when the installations fail', async () => {
    mockInstallations.mockRejectedValueOnce(new Error('offline'));
    const { findByText, getByText, findByLabelText, queryByText, queryByLabelText } = render(
      <InstalledPluginsScreen />,
    );
    expect(await findByText('Could not load your plugins.')).toBeTruthy();
    expect(queryByText('No plugins added yet')).toBeNull();
    expect(queryByLabelText('Search plugins')).toBeNull();

    fireEvent.press(getByText('Retry'));
    expect(await findByLabelText('Zeta kit')).toBeTruthy();
    expect(queryByText('Could not load your plugins.')).toBeNull();
  });

  it('refreshes when the page regains focus, not on the first focus', async () => {
    const { findByLabelText, queryByLabelText } = render(<InstalledPluginsScreen />);
    await findByLabelText('Zeta kit');
    expect(mockInstallations).toHaveBeenCalledTimes(1);

    mockInstallations.mockResolvedValue([installation('alpha')]);
    await act(async () => {
      mockFocus.callback?.();
    });
    await waitFor(() => expect(queryByLabelText('Zeta kit')).toBeNull());
    expect(mockInstallations).toHaveBeenCalledTimes(2);
  });

  it('asks to continue in AGI Cloud when the person is in Local mode', () => {
    useChatAppModeStore.setState({ appMode: 'local' });
    const { getByText } = render(<InstalledPluginsScreen />);
    expect(
      getByText('Plugins live in AGI Cloud; switching won’t upload your local chats.'),
    ).toBeTruthy();
    expect(mockInstallations).not.toHaveBeenCalled();
  });

  it.each([
    ['the default text size', 1],
    ['the largest text size', LARGEST_IOS_TEXT_SCALE],
  ])('keeps Permissions and plugin names whole at %s', async (_size, scale) => {
    const startingScale = Dimensions.get('window').fontScale;
    setTextScale(scale);
    try {
      const { findByText, getByTestId, getByText, queryByTestId } = render(
        <TextScaleBoundary>
          <InstalledPluginsScreen />
        </TextScaleBoundary>,
      );
      const name = await findByText('Zeta kit');
      const permissions = getByText('Permissions');
      if (scale === 1) {
        expect(name.props.numberOfLines).toBe(1);
        expect(permissions.props.maxFontSizeMultiplier).toBeUndefined();
        expect(queryByTestId('settings-row-text-Permissions')).toBeNull();
        return;
      }
      expect(name.props.numberOfLines).toBeUndefined();
      expect(name.props.maxFontSizeMultiplier).toBe(ROW_LABEL_TEXT_SCALE_LIMIT);
      expect(permissions.props.numberOfLines).toBeUndefined();
      expect(permissions.props.maxFontSizeMultiplier).toBe(ROW_LABEL_TEXT_SCALE_LIMIT);
      const column = getByTestId('settings-row-text-Permissions');
      expect(within(column).getByText('Ask')).toBeTruthy();
      expect(within(column).getByText('Permissions')).toBeTruthy();
    } finally {
      setTextScale(startingScale);
    }
  });
});
