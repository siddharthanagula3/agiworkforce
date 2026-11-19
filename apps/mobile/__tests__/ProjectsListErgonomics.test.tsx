/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert, Modal, StyleSheet } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';

const mockPush = jest.fn();
const mockSetActiveProject = jest.fn();
const mockSyncNow = jest.fn().mockResolvedValue(undefined);
const mockCreateProject = jest.fn();
let mockAppMode: 'local' | 'cloud' = 'local';
let mockClerkUserId: string | null = null;
let mockSyncStatus: 'idle' | 'syncing' | 'error' = 'idle';
let mockSyncError: string | null = null;

const mockFocus = (() => {
  let focused = true;
  const listeners = new Set<() => void>();
  return {
    get: () => focused,
    set: (next: boolean) => {
      focused = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
})();

const mockProjects = [
  {
    id: 'project-mid',
    name: 'Billing rewrite',
    description: 'Invoices and dunning',
    instructions: '',
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-20T10:00:00.000Z',
  },
  {
    id: 'project-old',
    name: 'Android polish',
    description: 'Play Store review notes',
    instructions: '',
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-07-02T10:00:00.000Z',
  },
  {
    id: 'project-new',
    name: 'Zurich launch',
    description: 'Release planning',
    instructions: '',
    createdAt: '2026-07-25T10:00:00.000Z',
    updatedAt: '2026-07-30T10:00:00.000Z',
  },
];

let mockIsDark = false;

jest.mock('../src/features/chat/components/WorkModeSwitch', () => ({ HEADER_TEXT_SCALE_LIMIT: 2 }));
jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useNavigation: () => ({ openDrawer: jest.fn(), navigate: jest.fn(), goBack: jest.fn() }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = require('react');
    const focused = React.useSyncExternalStore(mockFocus.subscribe, mockFocus.get);
    React.useEffect(() => (focused ? effect() : undefined), [effect, focused]);
  },
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ openDrawer: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children, style }: { children: React.ReactNode; style?: unknown }) => {
    const { View } = require('react-native');
    return <View style={style as never}>{children}</View>;
  },
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const Icon = (props: Record<string, unknown>) => <RN.View {...props} />;
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : Icon) });
});

jest.mock('../src/ui/theme', () => {
  const actual = jest.requireActual('../src/ui/theme/tokens');
  return {
    ...actual,
    useTheme: () => ({ colors: actual.lightColors, isDark: mockIsDark, statusBarStyle: 'dark' }),
    useThemeColors: () => actual.lightColors,
  };
});

jest.mock('../src/navigation/openNearestDrawer', () => ({
  openNearestDrawer: jest.fn(),
}));

jest.mock('../src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: Object.assign(
    (selector: (state: { appMode: 'local' | 'cloud' }) => unknown) =>
      selector({ appMode: mockAppMode }),
    { getState: () => ({ appMode: mockAppMode }) },
  ),
}));

jest.mock('../src/features/auth/store', () => ({
  useAuthStore: (selector: (state: { clerkUserId: string | null }) => unknown) =>
    selector({ clerkUserId: mockClerkUserId }),
}));

jest.mock('../stores/chat/cloudSyncStateStore', () => ({
  useCloudSyncStateStore: Object.assign(
    (
      selector: (state: {
        status: 'idle' | 'syncing' | 'error';
        lastError: string | null;
      }) => unknown,
    ) => selector({ status: mockSyncStatus, lastError: mockSyncError }),
    { getState: () => ({ status: mockSyncStatus }) },
  ),
}));

jest.mock('../services/cloudSyncEngine', () => ({ syncNow: () => mockSyncNow() }));

jest.mock('../src/features/auth/services/accountScopedUiState', () => ({
  accountScopedUiStateKey: () => 'local',
  captureAccountScopedUiState: () => ({ scope: 'local' }),
  isAccountScopedUiStateCurrent: () => true,
}));

jest.mock('../src/features/projects/store', () => ({
  useProjectStore: (
    selector: (state: {
      projects: typeof mockProjects;
      activeProjectId: string | null;
      createProject: jest.Mock;
      updateProject: jest.Mock;
      deleteProject: jest.Mock;
      setActiveProject: jest.Mock;
    }) => unknown,
  ) =>
    selector({
      projects: mockProjects,
      activeProjectId: null,
      createProject: mockCreateProject,
      updateProject: jest.fn(),
      deleteProject: jest.fn(),
      setActiveProject: mockSetActiveProject,
    }),
}));

jest.mock('../stores/projects/cloudProjectStore', () => ({
  useCloudProjectStore: (
    selector: (state: { projects: never[]; activeProjectId: null }) => unknown,
  ) => selector({ projects: [], activeProjectId: null }),
}));

import ProjectsTabScreen from '../app/(app)/(tabs)/projects';
import { lightColors } from '../src/ui/theme/tokens';
import { READING_COLUMN_MAX_WIDTH } from '../src/shared/layout/contentColumn';

type AlertButton = { text?: string; onPress?: () => void };

function sortButtons(): AlertButton[] {
  return ((Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] ?? []) as AlertButton[];
}

function renderedOrder(screen: ReturnType<typeof render>): string[] {
  return screen.getAllByLabelText(/^Project: /).map((node) =>
    String(node.props.accessibilityLabel)
      .replace(/^Project: /, '')
      .replace(/, active$/, ''),
  );
}

function testIDsInOrder(root: ReactTestInstance): string[] {
  const ids: string[] = [];
  const walk = (node: ReactTestInstance) => {
    const id: unknown = node.props?.testID;
    if (typeof id === 'string') ids.push(id);
    for (const child of node.children) {
      if (typeof child !== 'string') walk(child);
    }
  };
  walk(root);
  return ids;
}

function chooseSort(screen: ReturnType<typeof render>, text: string) {
  fireEvent.press(screen.getByLabelText(/^Sort projects\./));
  act(() => {
    sortButtons()
      .find((button) => button.text === text)
      ?.onPress?.();
  });
}

function pageBackground(screen: ReturnType<typeof render>) {
  const tree = screen.toJSON();
  const root = Array.isArray(tree) ? tree[0] : tree;
  return StyleSheet.flatten(root?.props.style).backgroundColor;
}

describe('Projects list ergonomics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppMode = 'local';
    mockClerkUserId = null;
    mockSyncStatus = 'idle';
    mockSyncError = null;
    act(() => mockFocus.set(true));
    (useNetInfo as jest.Mock).mockReturnValue({ isConnected: true, isInternetReachable: true });
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
  });

  it('defaults to most-recently-updated first instead of raw store order', () => {
    const screen = render(<ProjectsTabScreen />);

    expect(renderedOrder(screen)).toEqual(['Zurich launch', 'Billing rewrite', 'Android polish']);
  });

  it('centres a semibold title beside the count badge', () => {
    const screen = render(<ProjectsTabScreen />);

    const title = screen.getByText('Projects');
    expect(StyleSheet.flatten(title.props.style).fontWeight).toBe('600');
    expect(
      StyleSheet.flatten(screen.getByTestId('projects-title-group').props.style),
    ).toMatchObject({
      justifyContent: 'center',
    });
  });

  it('fills the New project pill with the neutral ink tone', () => {
    const screen = render(<ProjectsTabScreen />);

    const fill = StyleSheet.flatten(screen.getByLabelText('Create new project').props.style);
    expect(fill.backgroundColor).toBe(lightColors.textPrimary);
  });

  it('sorts by name from the funnel chip', () => {
    const screen = render(<ProjectsTabScreen />);

    fireEvent.press(screen.getByLabelText('Sort projects. Recently updated'));
    expect(sortButtons().map((button) => button.text)).toEqual([
      '✓ Recently updated',
      'Name',
      'Cancel',
    ]);

    chooseSort(screen, 'Name');

    expect(renderedOrder(screen)).toEqual(['Android polish', 'Billing rewrite', 'Zurich launch']);
    expect(screen.getByLabelText('Sort projects. Name')).toBeTruthy();
  });

  it('filters on name and description from the bottom-anchored field', () => {
    const screen = render(<ProjectsTabScreen />);

    fireEvent.changeText(screen.getByLabelText('Search projects'), 'zurich');
    expect(renderedOrder(screen)).toEqual(['Zurich launch']);

    fireEvent.changeText(screen.getByLabelText('Search projects'), 'dunning');
    expect(renderedOrder(screen)).toEqual(['Billing rewrite']);

    fireEvent.changeText(screen.getByLabelText('Search projects'), 'nothing matches this');
    expect(screen.queryAllByLabelText(/^Project: /)).toHaveLength(0);
    expect(screen.getByText('No matches')).toBeTruthy();
  });

  it('keeps the search field out of the scrolling list so it cannot scroll away', () => {
    const screen = render(<ProjectsTabScreen />);

    expect(within(screen.getByTestId('projects-list')).queryByTestId('projects-search')).toBeNull();

    const ids = testIDsInOrder(screen.UNSAFE_root);
    expect(ids).toContain('projects-search');
    expect(ids.indexOf('projects-list')).toBeLessThan(ids.indexOf('projects-search'));
  });

  it('holds the project cards to the reading column on a wide pane', () => {
    const screen = render(<ProjectsTabScreen />);

    expect(
      StyleSheet.flatten(screen.getByTestId('projects-list').props.contentContainerStyle),
    ).toMatchObject({
      width: '100%',
      maxWidth: READING_COLUMN_MAX_WIDTH,
      alignSelf: 'center',
      padding: 12,
    });
  });

  it('creates from a labelled pill that meets the 44pt minimum target', () => {
    const screen = render(<ProjectsTabScreen />);

    const create = screen.getByLabelText('Create new project');
    expect(create.props.style.minHeight).toBeGreaterThanOrEqual(44);
    expect(screen.getAllByLabelText('Create new project')).toHaveLength(1);

    fireEvent.press(create);
    expect(screen.getByText('New Project')).toBeTruthy();
    expect(
      screen.getByText('Keep related chats and instructions together in one place.'),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('project-editor-fields')).queryByTestId('project-editor-submit'),
    ).toBeNull();
    expect(
      screen.getByTestId('project-editor-submit').props.style.minHeight,
    ).toBeGreaterThanOrEqual(44);
  });

  it('seeds a new project from the shared template and keeps the fields editable', () => {
    const screen = render(<ProjectsTabScreen />);
    fireEvent.press(screen.getByLabelText('Create new project'));

    const writing = screen.getByLabelText('Start from Writing');
    expect(writing.props.style.minHeight).toBeGreaterThanOrEqual(44);
    fireEvent.press(writing);

    expect(screen.getByLabelText('Project name').props.value).toBe('Writing');
    expect(screen.getByLabelText('Project description').props.value).toContain('Drafts');
    expect(screen.getByLabelText('Project instructions').props.value).toContain('write and edit');

    fireEvent.changeText(screen.getByLabelText('Project name'), 'Product launch copy');
    fireEvent.changeText(screen.getByLabelText('Project instructions'), 'Use our brand voice.');
    fireEvent.press(screen.getByLabelText('Create project'));

    expect(mockCreateProject).toHaveBeenCalledWith(
      'Product launch copy',
      'Drafts, edits, and a consistent voice.',
      'Use our brand voice.',
      undefined,
    );
  });

  it('explains that Cloud projects can keep files with their chats', () => {
    mockAppMode = 'cloud';
    mockClerkUserId = 'user-1';
    const screen = render(<ProjectsTabScreen />);
    fireEvent.press(screen.getByLabelText('Create project'));

    expect(
      screen.getByText('Keep related chats, files, and instructions together in one place.'),
    ).toBeTruthy();
  });

  it('does not replace a custom name when choosing a starter template', () => {
    const screen = render(<ProjectsTabScreen />);
    fireEvent.press(screen.getByLabelText('Create new project'));
    fireEvent.changeText(screen.getByLabelText('Project name'), 'Q4 strategy');
    fireEvent.press(screen.getByLabelText('Start from Research'));

    expect(screen.getByLabelText('Project name').props.value).toBe('Q4 strategy');
  });

  it('holds the empty state to the reading column on a wide pane', () => {
    mockAppMode = 'cloud';
    mockClerkUserId = 'user-1';
    const screen = render(<ProjectsTabScreen />);

    expect(
      StyleSheet.flatten(screen.getByTestId('projects-empty-scroll').props.contentContainerStyle),
    ).toMatchObject({
      width: '100%',
      maxWidth: READING_COLUMN_MAX_WIDTH,
      alignSelf: 'center',
      paddingHorizontal: 32,
    });
  });

  it('starts Cloud sync on entry and lets an empty list be pulled to refresh', async () => {
    mockAppMode = 'cloud';
    mockClerkUserId = 'user-1';
    const screen = render(<ProjectsTabScreen />);

    expect(mockSyncNow).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/No projects yet/)).toBeTruthy();
    await act(async () => {
      screen.getByTestId('projects-empty-scroll').props.refreshControl.props.onRefresh();
    });

    expect(mockSyncNow).toHaveBeenCalledTimes(2);
  });

  it('shows a retryable error instead of falsely reporting no Cloud projects', async () => {
    mockAppMode = 'cloud';
    mockClerkUserId = 'user-1';
    mockSyncStatus = 'error';
    const screen = render(<ProjectsTabScreen />);

    expect(screen.queryByText(/No projects yet/)).toBeNull();
    expect(screen.getByText(/Projects could not be refreshed/)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Retry loading projects'));
    });
    expect(mockSyncNow).toHaveBeenCalledTimes(2);
  });

  it('does not blame the connection when the server refused the sync', () => {
    mockAppMode = 'cloud';
    mockClerkUserId = 'user-1';
    mockSyncStatus = 'error';
    mockSyncError = 'HTTP 500';
    const screen = render(<ProjectsTabScreen />);

    expect(screen.getByText('Projects could not be refreshed.')).toBeTruthy();
    expect(screen.queryByText(/Check your connection/)).toBeNull();
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('blames the connection when the device is offline', () => {
    mockAppMode = 'cloud';
    mockClerkUserId = 'user-1';
    mockSyncStatus = 'error';
    mockSyncError = 'HTTP 500';
    (useNetInfo as jest.Mock).mockReturnValue({ isConnected: false, isInternetReachable: false });
    const screen = render(<ProjectsTabScreen />);

    expect(
      screen.getByText('Projects could not be refreshed. Check your connection and try again.'),
    ).toBeTruthy();
  });

  it('blames the connection when the request never reached the server', () => {
    mockAppMode = 'cloud';
    mockClerkUserId = 'user-1';
    mockSyncStatus = 'error';
    mockSyncError = 'Network request failed';
    const screen = render(<ProjectsTabScreen />);

    expect(
      screen.getByText('Projects could not be refreshed. Check your connection and try again.'),
    ).toBeTruthy();
  });

  it('opens on the default filter on every visit', () => {
    mockAppMode = 'cloud';
    mockClerkUserId = 'user-1';
    const screen = render(<ProjectsTabScreen />);

    fireEvent.press(screen.getByLabelText('Filter projects. All'));
    const filterSheet = screen
      .UNSAFE_getAllByType(Modal)
      .find((modal) => within(modal).queryByLabelText('Dismiss project filter'))!;
    fireEvent.press(screen.getByText('Archived'));
    act(() => filterSheet.props.onDismiss());
    expect(screen.getByLabelText('Filter projects. Archived')).toBeTruthy();
    expect(screen.getByText('No archived projects')).toBeTruthy();

    act(() => mockFocus.set(false));
    act(() => mockFocus.set(true));

    expect(screen.getByLabelText('Filter projects. All')).toBeTruthy();
    expect(screen.queryByText('No archived projects')).toBeNull();
  });

  it.each([
    [true, lightColors.background],
    [false, lightColors.surfaceBase],
  ])('paints the page root for dark mode %s with the right surface', (isDark, expected) => {
    mockIsDark = isDark;
    try {
      expect(pageBackground(render(<ProjectsTabScreen />))).toBe(expected);
    } finally {
      mockIsDark = false;
    }
  });
});
