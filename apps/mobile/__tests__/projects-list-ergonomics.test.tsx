/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';

const mockPush = jest.fn();
const mockSetActiveProject = jest.fn();

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

let mockActiveProjectId: string | null = null;

jest.mock('expo-router', () => ({
  useNavigation: () => ({ openDrawer: jest.fn(), navigate: jest.fn(), goBack: jest.fn() }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => cb(), []);
  },
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ openDrawer: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
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
    useTheme: () => ({ colors: actual.lightColors, statusBarStyle: 'dark' }),
    useThemeColors: () => actual.lightColors,
  };
});

jest.mock('../src/navigation/openNearestDrawer', () => ({
  openNearestDrawer: jest.fn(),
}));

jest.mock('../src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: Object.assign(
    (selector: (state: { appMode: 'local' }) => unknown) => selector({ appMode: 'local' }),
    { getState: () => ({ appMode: 'local' }) },
  ),
}));

jest.mock('../src/features/auth/store', () => ({
  useAuthStore: (selector: (state: { clerkUserId: null }) => unknown) =>
    selector({ clerkUserId: null }),
}));

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
      activeProjectId: mockActiveProjectId,
      createProject: jest.fn(),
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

describe('Projects list ergonomics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActiveProjectId = null;
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
  });

  it('defaults to most-recently-updated first instead of raw store order', () => {
    const screen = render(<ProjectsTabScreen />);

    expect(renderedOrder(screen)).toEqual(['Zurich launch', 'Billing rewrite', 'Android polish']);
  });

  it('sorts by name from the funnel chip', () => {
    const screen = render(<ProjectsTabScreen />);

    fireEvent.press(screen.getByLabelText('Sort projects. Recently updated'));
    expect(sortButtons().map((button) => button.text)).toEqual([
      '✓ Recently updated',
      'Name',
      'Active first',
      'Cancel',
    ]);

    chooseSort(screen, 'Name');

    expect(renderedOrder(screen)).toEqual(['Android polish', 'Billing rewrite', 'Zurich launch']);
    expect(screen.getByLabelText('Sort projects. Name')).toBeTruthy();
  });

  it('floats the active project to the top without reshuffling the rest', () => {
    mockActiveProjectId = 'project-old';
    const screen = render(<ProjectsTabScreen />);

    chooseSort(screen, 'Active first');

    expect(renderedOrder(screen)).toEqual(['Android polish', 'Zurich launch', 'Billing rewrite']);
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

  it('creates from a labelled pill that meets the 44pt minimum target', () => {
    const screen = render(<ProjectsTabScreen />);

    const create = screen.getByLabelText('Create new project');
    expect(create.props.style.minHeight).toBeGreaterThanOrEqual(44);
    expect(screen.getAllByLabelText('Create new project')).toHaveLength(1);

    fireEvent.press(create);
    expect(screen.getByText('New Project')).toBeTruthy();
  });
});
