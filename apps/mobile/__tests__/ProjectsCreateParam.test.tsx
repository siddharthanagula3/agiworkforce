/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

const mockSetParams = jest.fn();
const mockRouter = { push: jest.fn(), setParams: mockSetParams };
let mockParams: { create?: string | string[] } = {};

jest.mock('../src/features/chat/components/WorkModeSwitch', () => ({ HEADER_TEXT_SCALE_LIMIT: 2 }));
jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useNavigation: () => ({ openDrawer: jest.fn(), navigate: jest.fn(), goBack: jest.fn() }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => cb(), []);
  },
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

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
  useProjectStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      projects: [],
      activeProjectId: null,
      createProject: jest.fn(),
      updateProject: jest.fn(),
    }),
}));

jest.mock('../stores/projects/cloudProjectStore', () => ({
  useCloudProjectStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ projects: [], details: {}, activeProjectId: null }),
}));

import ProjectsTabScreen from '../app/(app)/(tabs)/projects';

describe('Projects tab create param', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
  });

  it('leaves the editor closed without the param', () => {
    const screen = render(<ProjectsTabScreen />);

    expect(screen.queryByLabelText('Project name')).toBeNull();
    expect(mockSetParams).not.toHaveBeenCalled();
  });

  it('opens the create editor once for create=1 and clears the param', () => {
    mockParams = { create: '1' };
    const screen = render(<ProjectsTabScreen />);

    expect(screen.getByLabelText('Project name').props.value).toBe('');
    expect(mockSetParams).toHaveBeenCalledTimes(1);
    expect(mockSetParams).toHaveBeenCalledWith({ create: undefined });

    act(() => {
      screen.rerender(<ProjectsTabScreen />);
    });
    expect(mockSetParams).toHaveBeenCalledTimes(1);
  });

  it('opens the editor again for a later create=1 after the param was cleared', () => {
    mockParams = { create: '1' };
    const screen = render(<ProjectsTabScreen />);
    expect(screen.getByLabelText('Project name')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Close project editor'));
    expect(screen.queryByLabelText('Project name')).toBeNull();

    mockParams = {};
    screen.rerender(<ProjectsTabScreen />);
    mockParams = { create: '1' };
    screen.rerender(<ProjectsTabScreen />);

    expect(screen.getByLabelText('Project name')).toBeTruthy();
    expect(mockSetParams).toHaveBeenCalledTimes(2);
  });

  it('ignores any other create value', () => {
    mockParams = { create: '0' };
    const screen = render(<ProjectsTabScreen />);

    expect(screen.queryByLabelText('Project name')).toBeNull();
    expect(mockSetParams).not.toHaveBeenCalled();
  });
});
