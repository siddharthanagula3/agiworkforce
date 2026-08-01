/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * PAR-M17 — a project row must open the project.
 *
 * Tapping a row used to toggle the active-context flag and nothing else, so on
 * a demo the tap looked like a dead control while `/(app)/projects/[id]` — a
 * fully implemented, registered route — was reachable only from the drawer,
 * the chats list and the in-conversation project chip. "Set active" moved onto
 * the long-press sheet, alongside Open / Rename / Delete.
 */
import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockSetActiveProject = jest.fn();
const mockDeleteProject = jest.fn();

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
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ openDrawer: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  // The bottom-anchored search pill (src/shared/components/BottomSearchBar)
  // reads the safe-area inset so it clears the home indicator.
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  return new Proxy({}, { get: () => (props: Record<string, unknown>) => <RN.View {...props} /> });
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
      projects: (typeof mockProject)[];
      activeProjectId: null;
      createProject: jest.Mock;
      updateProject: jest.Mock;
      deleteProject: jest.Mock;
      setActiveProject: jest.Mock;
    }) => unknown,
  ) =>
    selector({
      projects: [mockProject],
      activeProjectId: null,
      createProject: jest.fn(),
      updateProject: jest.fn(),
      deleteProject: mockDeleteProject,
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

function longPressButtons(): AlertButton[] {
  return ((Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] ?? []) as AlertButton[];
}

describe('Projects tab row navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
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

  it('offers Open / Set active / Rename / Delete on long press', () => {
    const { getByLabelText } = render(<ProjectsTabScreen />);

    fireEvent(getByLabelText('Project: Launch demo'), 'longPress');

    expect(longPressButtons().map((button) => button.text)).toEqual([
      'Open',
      'Set active',
      'Rename',
      'Delete',
      'Cancel',
    ]);
  });

  it('keeps set-active reachable from the long-press sheet', () => {
    const { getByLabelText } = render(<ProjectsTabScreen />);

    fireEvent(getByLabelText('Project: Launch demo'), 'longPress');
    longPressButtons()
      .find((button) => button.text === 'Set active')
      ?.onPress?.();

    expect(mockSetActiveProject).toHaveBeenCalledWith('project-1');
  });

  it('opens the project from the long-press sheet too', () => {
    const { getByLabelText } = render(<ProjectsTabScreen />);

    fireEvent(getByLabelText('Project: Launch demo'), 'longPress');
    longPressButtons()
      .find((button) => button.text === 'Open')
      ?.onPress?.();

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/projects/[id]',
      params: { id: 'project-1' },
    });
  });
});
