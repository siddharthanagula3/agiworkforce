/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert, Modal } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockSetActiveProject = jest.fn();
const mockDeleteProject = jest.fn();
const mockSetProjectPinned = jest.fn();
const mockSetProjectArchived = jest.fn();

const mockProject = {
  id: 'project-1',
  name: 'Launch demo',
  description: 'Release planning',
  instructions: '',
  sources: [],
  createdAt: '2026-07-30T10:00:00.000Z',
  updatedAt: '2026-07-30T10:00:00.000Z',
};

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
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
  return new Proxy({}, { get: () => (props: Record<string, unknown>) => <RN.View {...props} /> });
});

jest.mock('../src/ui/theme', () => {
  const actual = jest.requireActual('../src/ui/theme/tokens');
  return {
    ...actual,
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
      projects: (typeof mockProject)[];
      activeProjectId: null;
      createProject: jest.Mock;
      updateProject: jest.Mock;
      deleteProject: jest.Mock;
      setActiveProject: jest.Mock;
      setProjectPinned: jest.Mock;
      setProjectArchived: jest.Mock;
    }) => unknown,
  ) =>
    selector({
      projects: [mockProject],
      activeProjectId: null,
      createProject: jest.fn(),
      updateProject: jest.fn(),
      deleteProject: mockDeleteProject,
      setActiveProject: mockSetActiveProject,
      setProjectPinned: mockSetProjectPinned,
      setProjectArchived: mockSetProjectArchived,
    }),
}));

jest.mock('../stores/projects/cloudProjectStore', () => ({
  useCloudProjectStore: (
    selector: (state: { projects: never[]; activeProjectId: null }) => unknown,
  ) => selector({ projects: [], activeProjectId: null }),
}));

import ProjectsTabScreen from '../app/(app)/(tabs)/projects';

function dismissSheets(screen: ReturnType<typeof render>) {
  act(() => {
    for (const sheet of screen.UNSAFE_getAllByType(Modal)) {
      (sheet.props.onDismiss as (() => void) | undefined)?.();
    }
  });
}

function menuLabels(screen: ReturnType<typeof render>): string[] {
  return screen
    .getAllByTestId(/^conversation-action-/)
    .map((node) => String(node.props.accessibilityLabel));
}

function choose(screen: ReturnType<typeof render>, key: string) {
  fireEvent.press(screen.getByTestId(`conversation-action-${key}`));
  dismissSheets(screen);
}

describe('Projects tab row navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens the project detail route on tap instead of only toggling active', () => {
    const { getByLabelText } = render(<ProjectsTabScreen />);

    fireEvent.press(getByLabelText('Project: Launch demo'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/projects/[id]',
      params: { id: 'project-1' },
    });
    expect(mockSetActiveProject).not.toHaveBeenCalled();
  });

  it('offers Open, Set active, Pin, Rename and Delete on long press in Local', () => {
    const screen = render(<ProjectsTabScreen />);

    fireEvent(screen.getByLabelText('Project: Launch demo'), 'longPress');

    expect(menuLabels(screen)).toEqual(['Open', 'Set active', 'Pin', 'Rename', 'Delete', 'Cancel']);
  });

  it('keeps set-active reachable from the long-press sheet', () => {
    const screen = render(<ProjectsTabScreen />);

    fireEvent(screen.getByLabelText('Project: Launch demo'), 'longPress');
    choose(screen, 'active');

    expect(mockSetActiveProject).toHaveBeenCalledWith('project-1');
  });

  it('opens the project from the long-press sheet too', () => {
    const screen = render(<ProjectsTabScreen />);

    fireEvent(screen.getByLabelText('Project: Launch demo'), 'longPress');
    choose(screen, 'open');

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/projects/[id]',
      params: { id: 'project-1' },
    });
  });

  it('pins the project from the long-press sheet', () => {
    const screen = render(<ProjectsTabScreen />);

    fireEvent(screen.getByLabelText('Project: Launch demo'), 'longPress');
    choose(screen, 'pin');

    expect(mockSetProjectPinned).toHaveBeenCalledWith('project-1', true);
  });

  it('renames from the long-press sheet in the project editor', () => {
    const screen = render(<ProjectsTabScreen />);

    fireEvent(screen.getByLabelText('Project: Launch demo'), 'longPress');
    choose(screen, 'rename');

    expect(screen.getByText('Edit Project')).toBeTruthy();
    expect(screen.getByLabelText('Project name').props.value).toBe('Launch demo');
  });

  it('names the consequence before deleting and deletes only after confirming', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const screen = render(<ProjectsTabScreen />);

    fireEvent(screen.getByLabelText('Project: Launch demo'), 'longPress');
    choose(screen, 'delete');

    expect(alertSpy).toHaveBeenCalledWith(
      'Delete project?',
      '"Launch demo" is deleted from this device. It cannot be restored.',
      expect.any(Array),
    );
    expect(mockDeleteProject).not.toHaveBeenCalled();

    const buttons = alertSpy.mock.calls.at(-1)?.[2] ?? [];
    act(() => buttons.find((button) => button.text === 'Delete')?.onPress?.());
    expect(mockDeleteProject).toHaveBeenCalledWith('project-1');
  });
});
