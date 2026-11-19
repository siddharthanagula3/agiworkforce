/* eslint-disable @typescript-eslint/no-require-imports */
const mockSyncNow = jest.fn().mockResolvedValue(undefined);
const mockMarkProjectForSync = jest.fn();
let mockClerkUserId: string | null = null;

jest.mock('@/lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('@/services/cloudSyncEngine', () => ({
  syncNow: () => mockSyncNow(),
  markProjectForSync: (id: string) => mockMarkProjectForSync(id),
}));

jest.mock('@/src/features/projects/service', () => ({
  refreshCloudProjectDetails: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: (selector: (state: { clerkUserId: string | null }) => unknown) =>
    selector({ clerkUserId: mockClerkUserId }),
}));

jest.mock('@/src/features/auth/services/accountScopedUiState', () => ({
  accountScopedUiStateKey: (state: { scope: string } | null) => state?.scope ?? 'unavailable',
  captureAccountScopedUiState: (scope: 'local' | 'cloud') => ({ scope }),
  isAccountScopedUiStateCurrent: (state: { scope: string } | null, mode: string) =>
    state?.scope === mode,
}));

jest.mock('@/src/features/projects/components/SharedWithYouSection', () => {
  const RN = require('react-native');
  return {
    SharedWithYouSection: ({ emptyMessage }: { emptyMessage?: string }) => (
      <RN.Text testID="shared-section">{emptyMessage ?? 'shared projects'}</RN.Text>
    ),
  };
});

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useNavigation: () => ({ openDrawer: jest.fn(), navigate: jest.fn(), goBack: jest.fn() }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => cb(), []);
  },
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  return new Proxy(
    {},
    {
      get: (_target, name) =>
        name === '__esModule' ? true : (props: Record<string, unknown>) => <RN.View {...props} />,
    },
  );
});

jest.mock('@/src/navigation/openNearestDrawer', () => ({ openNearestDrawer: jest.fn() }));

import React from 'react';
import { Alert, Modal } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import ProjectsTabScreen from '@/app/(app)/(tabs)/projects';
import { useProjectStore, type Project } from '@/src/features/projects/store';
import { useCloudProjectStore, type CloudProject } from '@/stores/projects/cloudProjectStore';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';

function localProject(id: string, name: string, updatedAt: string): Project {
  return {
    id,
    name,
    description: '',
    instructions: '',
    sources: [],
    createdAt: updatedAt,
    updatedAt,
  };
}

function cloudProject(
  id: string,
  name: string,
  updatedAt: string,
  overrides: Partial<CloudProject> = {},
): CloudProject {
  return {
    id,
    name,
    description: null,
    instructions: null,
    color: null,
    isArchived: false,
    metadata: null,
    source: 'web',
    createdAt: updatedAt,
    updatedAt,
    deletedAt: null,
    serverVersion: '1',
    ...overrides,
  };
}

function order(screen: ReturnType<typeof render>): string[] {
  return screen
    .queryAllByLabelText(/^Project: /)
    .map((node) => String(node.props.accessibilityLabel).replace(/^Project: /, ''));
}

function menuLabels(screen: ReturnType<typeof render>): string[] {
  return screen
    .queryAllByTestId(/^conversation-action-/)
    .map((node) => String(node.props.accessibilityLabel));
}

function dismissSheets(screen: ReturnType<typeof render>) {
  act(() => {
    for (const sheet of screen.UNSAFE_getAllByType(Modal)) {
      (sheet.props.onDismiss as (() => void) | undefined)?.();
    }
  });
}

function chooseFilter(screen: ReturnType<typeof render>, label: string) {
  fireEvent.press(screen.getByLabelText(/^Filter projects\./));
  fireEvent.press(screen.getByTestId(`conversation-action-filter-${label}`));
  dismissSheets(screen);
}

function longPress(screen: ReturnType<typeof render>, label: string) {
  fireEvent(screen.getByLabelText(new RegExp(`^Project: ${label}`)), 'longPress');
}

function choose(screen: ReturnType<typeof render>, key: string) {
  fireEvent.press(screen.getByTestId(`conversation-action-${key}`));
  dismissSheets(screen);
}

const OLDEST = '2026-07-01T10:00:00.000Z';
const MIDDLE = '2026-07-10T10:00:00.000Z';
const NEWEST = '2026-07-20T10:00:00.000Z';

describe('Projects list pin and filter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClerkUserId = null;
    useChatAppModeStore.setState({ appMode: 'local' });
    useProjectStore.setState({
      projects: [
        localProject('l-old', 'Android polish', OLDEST),
        localProject('l-new', 'Zurich launch', NEWEST),
      ],
      activeProjectId: null,
    });
    useCloudProjectStore.setState({
      projects: [
        cloudProject('c-old', 'Billing rewrite', OLDEST),
        cloudProject('c-new', 'Search relevance', NEWEST),
        cloudProject('c-archived', 'Old migration', MIDDLE, { isArchived: true }),
      ],
      activeProjectId: null,
      details: {},
    });
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
  });

  describe('Local mode', () => {
    it('offers no filter control because nothing can be shared or archived on the device', () => {
      const screen = render(<ProjectsTabScreen />);

      expect(screen.queryByLabelText(/^Filter projects\./)).toBeNull();
      expect(screen.getByLabelText(/^Sort projects\./)).toBeTruthy();
    });

    it('pins a project from the long-press menu and sorts it first with a marker', () => {
      const screen = render(<ProjectsTabScreen />);
      expect(order(screen)).toEqual(['Zurich launch', 'Android polish']);

      longPress(screen, 'Android polish');
      expect(menuLabels(screen)).toEqual([
        'Open',
        'Set active',
        'Pin',
        'Rename',
        'Delete',
        'Cancel',
      ]);
      choose(screen, 'pin');

      expect(order(screen)).toEqual(['Android polish, pinned', 'Zurich launch']);
      expect(useProjectStore.getState().projects.find((p) => p.id === 'l-old')?.pinned).toBe(true);

      longPress(screen, 'Android polish');
      expect(screen.getByLabelText('Unpin')).toBeTruthy();
      choose(screen, 'pin');

      expect(order(screen)).toEqual(['Zurich launch', 'Android polish']);
    });

    it('keeps pinned projects first under every sort order', () => {
      useProjectStore.setState({
        projects: [
          { ...localProject('l-old', 'Android polish', OLDEST), pinned: true },
          localProject('l-new', 'Zurich launch', NEWEST),
        ],
      });
      const screen = render(<ProjectsTabScreen />);

      fireEvent.press(screen.getByLabelText(/^Sort projects\./));
      const buttons = ((Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] ?? []) as {
        text?: string;
        onPress?: () => void;
      }[];
      act(() => buttons.find((button) => button.text === 'Name')?.onPress?.());

      expect(order(screen)).toEqual(['Android polish, pinned', 'Zurich launch']);
    });

    it('has no Archive action in the long-press menu', () => {
      const screen = render(<ProjectsTabScreen />);

      longPress(screen, 'Zurich launch');

      expect(menuLabels(screen)).not.toContain('Archive');
    });
  });

  describe('Cloud mode', () => {
    beforeEach(() => {
      mockClerkUserId = 'user-1';
      useChatAppModeStore.setState({ appMode: 'cloud' });
    });

    it('lists the four filters with the current one marked', () => {
      const screen = render(<ProjectsTabScreen />);

      fireEvent.press(screen.getByLabelText('Filter projects. All'));

      expect(menuLabels(screen)).toEqual([
        'All',
        'Created by you',
        'Shared with you',
        'Archived',
        'Cancel',
      ]);
      expect(screen.getByLabelText('All').props.accessibilityState).toEqual({ selected: true });
    });

    it('shows your projects and the shared section under All', () => {
      const screen = render(<ProjectsTabScreen />);

      expect(order(screen)).toEqual(['Search relevance', 'Billing rewrite']);
      expect(screen.getByTestId('shared-section').props.children).toBe('shared projects');
    });

    it('shows only your own projects under Created by you', () => {
      const screen = render(<ProjectsTabScreen />);

      chooseFilter(screen, 'mine');

      expect(order(screen)).toEqual(['Search relevance', 'Billing rewrite']);
      expect(screen.queryByTestId('shared-section')).toBeNull();
      expect(screen.getByLabelText('Filter projects. Created by you')).toBeTruthy();
    });

    it('shows only the shared section under Shared with you, with an empty message', () => {
      const screen = render(<ProjectsTabScreen />);

      chooseFilter(screen, 'shared');

      expect(order(screen)).toEqual([]);
      expect(screen.getByTestId('shared-section').props.children).toBe(
        'Nothing is shared with you yet.',
      );
      expect(screen.queryByTestId('projects-search')).toBeNull();
    });

    it('shows archived projects under Archived and hides the active ones', () => {
      const screen = render(<ProjectsTabScreen />);
      expect(order(screen)).not.toContain('Old migration, archived');

      chooseFilter(screen, 'archived');

      expect(order(screen)).toEqual(['Old migration, archived']);
      expect(screen.queryByTestId('shared-section')).toBeNull();
    });

    it('explains an empty Archived list', () => {
      useCloudProjectStore.setState({
        projects: [cloudProject('c-new', 'Search relevance', NEWEST)],
      });
      const screen = render(<ProjectsTabScreen />);

      chooseFilter(screen, 'archived');

      expect(screen.getByText('No archived projects')).toBeTruthy();
      expect(screen.getByLabelText('Filter projects. Archived')).toBeTruthy();
    });

    it('returns to All and the full list when All is chosen again', () => {
      const screen = render(<ProjectsTabScreen />);
      chooseFilter(screen, 'archived');
      chooseFilter(screen, 'all');

      expect(order(screen)).toEqual(['Search relevance', 'Billing rewrite']);
    });

    it('pins with the server field that the web app calls starred and syncs it', () => {
      const screen = render(<ProjectsTabScreen />);

      longPress(screen, 'Billing rewrite');
      expect(menuLabels(screen)).toEqual([
        'Open',
        'Set active',
        'Pin',
        'Rename',
        'Archive',
        'Delete',
        'Cancel',
      ]);
      choose(screen, 'pin');

      expect(order(screen)).toEqual(['Billing rewrite, pinned', 'Search relevance']);
      expect(
        useCloudProjectStore.getState().projects.find((p) => p.id === 'c-old')?.metadata,
      ).toEqual({ starred: true });
      expect(mockMarkProjectForSync).toHaveBeenCalledWith('c-old');
    });

    it('keeps other metadata when pinning and clears only the pin when unpinning', () => {
      useCloudProjectStore.setState({
        projects: [
          cloudProject('c-old', 'Billing rewrite', OLDEST, {
            metadata: { starred: true, importedFrom: 'web' },
          }),
        ],
      });
      const screen = render(<ProjectsTabScreen />);
      expect(order(screen)).toEqual(['Billing rewrite, pinned']);

      longPress(screen, 'Billing rewrite');
      choose(screen, 'pin');

      expect(useCloudProjectStore.getState().projects[0]?.metadata).toEqual({
        starred: false,
        importedFrom: 'web',
      });
      expect(order(screen)).toEqual(['Billing rewrite']);
    });

    it('archives from the long-press menu, offers undo and syncs the change', () => {
      const screen = render(<ProjectsTabScreen />);

      longPress(screen, 'Billing rewrite');
      choose(screen, 'archive');

      expect(order(screen)).toEqual(['Search relevance']);
      expect(
        useCloudProjectStore.getState().projects.find((p) => p.id === 'c-old')?.isArchived,
      ).toBe(true);
      expect(mockMarkProjectForSync).toHaveBeenCalledWith('c-old');
    });

    it('clears the active project when it is archived', () => {
      useCloudProjectStore.setState({ activeProjectId: 'c-old' });
      const screen = render(<ProjectsTabScreen />);

      longPress(screen, 'Billing rewrite');
      choose(screen, 'archive');

      expect(useCloudProjectStore.getState().activeProjectId).toBeNull();
      expect(screen.queryByText(/^Active:/)).toBeNull();
    });

    it('restores an archived project from the Archived filter', () => {
      const screen = render(<ProjectsTabScreen />);
      chooseFilter(screen, 'archived');

      longPress(screen, 'Old migration');
      expect(menuLabels(screen)).toEqual(['Open', 'Rename', 'Restore', 'Delete', 'Cancel']);
      choose(screen, 'archive');

      expect(order(screen)).toEqual([]);
      expect(
        useCloudProjectStore.getState().projects.find((p) => p.id === 'c-archived')?.isArchived,
      ).toBe(false);
      expect(mockMarkProjectForSync).toHaveBeenCalledWith('c-archived');

      chooseFilter(screen, 'all');
      expect(order(screen)).toEqual(['Search relevance', 'Old migration', 'Billing rewrite']);
    });

    it('says the project leaves every device before a Cloud delete', () => {
      const screen = render(<ProjectsTabScreen />);

      longPress(screen, 'Billing rewrite');
      choose(screen, 'delete');

      expect(Alert.alert).toHaveBeenCalledWith(
        'Delete project?',
        '"Billing rewrite" is removed from all your devices. It cannot be restored from the app.',
        expect.any(Array),
      );
      expect(
        useCloudProjectStore.getState().projects.find((p) => p.id === 'c-old')?.deletedAt,
      ).toBeNull();
    });
  });
});
