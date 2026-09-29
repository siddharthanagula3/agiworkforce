/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockDispatch = jest.fn();
const mockSetActiveLocal = jest.fn();
const mockSetActiveCloud = jest.fn();
const mockLoadMissingCloudProject = jest.fn();
let mockSignedIn = false;

let mockSearchParams: { id?: string } = { id: 'proj_snapshot' };
let mockLocalProjects = [{ id: 'proj_snapshot', name: 'Snapshot project', sources: [] }];
let mockCloudProjects: Array<{
  id: string;
  name: string;
  deletedAt: string | null;
  updatedAt?: string;
}> = [];

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useNavigation: () => ({ openDrawer: jest.fn(), navigate: jest.fn(), goBack: jest.fn() }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => cb(), []);
  },
  useLocalSearchParams: () => mockSearchParams,
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    canGoBack: () => false,
    back: mockBack,
  }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ dispatch: mockDispatch }),
  DrawerActions: { openDrawer: () => ({ type: 'OPEN_DRAWER' }) },
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn().mockResolvedValue({ canceled: true, assets: [] }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  SafeAreaView: ({ children, ...rest }: { children: React.ReactNode; [key: string]: unknown }) => {
    const { View } = require('react-native');
    return <View {...rest}>{children}</View>;
  },
}));

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const factory = (name: string) => (props: Record<string, unknown>) => (
    <RN.View testID={`icon-${name}`} {...props} />
  );
  return {
    ArrowLeft: factory('arrow-left'),
    Clock: factory('clock'),
    FileText: factory('file-text'),
    Folder: factory('folder'),
    KeyRound: factory('key-round'),
    Lock: factory('lock'),
    LogIn: factory('log-in'),
    Menu: factory('menu'),
    MessageSquare: factory('message-square'),
    Plus: factory('plus'),
    SquarePen: factory('square-pen'),
    Trash2: factory('trash-2'),
    Type: factory('type'),
    Users: factory('users'),
    Check: factory('check'),
    ...Object.fromEntries(
      [
        'BookOpen',
        'Brain',
        'Calendar',
        'CalendarClock',
        'Camera',
        'Code',
        'Code2',
        'Database',
        'FileCode',
        'FileSpreadsheet',
        'FolderOpen',
        'GitBranch',
        'GitFork',
        'Globe',
        'Image',
        'LayoutList',
        'LibraryBig',
        'ListChecks',
        'Monitor',
        'Palette',
        'Plug',
        'ShieldCheck',
        'Sparkles',
        'Star',
        'Terminal',
        'TerminalSquare',
        'Video',
      ].map((name) => [name, factory(name)]),
    ),
  };
});

jest.mock('@/components/ui/text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => <RN.Text {...props} />;
  Text.displayName = 'Text';
  return { Text };
});

jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...actual,
    useThemeColors: () => actual.colors,
  };
});

jest.mock('@/src/features/projects/store', () => ({
  useProjectStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      projects: mockLocalProjects,
      activeProjectId: null,
      setActiveProject: mockSetActiveLocal,
      addSource: jest.fn(),
      removeSource: jest.fn(),
    }),
  useProjectSourceTarget: (id: string) =>
    mockLocalProjects.some((project) => project.id === id)
      ? 'local'
      : mockCloudProjects.some((project) => project.id === id && project.deletedAt === null)
        ? 'cloud'
        : 'unknown',
}));

jest.mock('@/stores/projects/cloudProjectStore', () => ({
  useCloudProjectStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      projects: mockCloudProjects,
      details: {},
      setActiveCloudProject: mockSetActiveCloud,
    }),
}));

jest.mock('@/stores/chatStore', () => ({
  useChatMessageStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ conversations: [] }),
  useChatCloudMessageStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ conversations: [] }),
}));

jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ isClerkSignedIn: mockSignedIn }),
}));

jest.mock('@/src/features/projects/service', () => ({
  loadMissingCloudProject: (...args: unknown[]) => mockLoadMissingCloudProject(...args),
  refreshCloudProjectDetails: jest.fn(async () => undefined),
}));

import ProjectDetailScreen from '@/app/(app)/projects/[id]';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';

describe('Mobile project-detail screen snapshots (round-17)', () => {
  beforeEach(() => {
    mockSearchParams = { id: 'proj_snapshot' };
    mockLocalProjects = [{ id: 'proj_snapshot', name: 'Snapshot project', sources: [] }];
    mockCloudProjects = [];
    mockSignedIn = false;
    mockLoadMissingCloudProject.mockReset();
    useChatAppModeStore.setState({ appMode: 'local' });
    mockPush.mockReset();
    mockReplace.mockReset();
    mockBack.mockReset();
    mockDispatch.mockReset();
    mockSetActiveLocal.mockReset();
    mockSetActiveCloud.mockReset();
  });

  it('shows local project chats only in Local mode', async () => {
    const { toJSON, getByTestId } = render(<ProjectDetailScreen />);
    await waitFor(() => getByTestId('project-detail-scroll'));
    expect(getByTestId('project-detail-local-fallback')).toBeTruthy();
    expect(toJSON()).toMatchSnapshot();
  });

  it('requires an explicit switch before opening a Local project from Cloud mode', async () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const { toJSON, getByLabelText, queryByLabelText } = render(<ProjectDetailScreen />);
    expect(queryByLabelText('New chat in this project')).toBeNull();
    expect(toJSON()).toMatchSnapshot();
    fireEvent.press(getByLabelText('Switch to Local mode'));
    await waitFor(() => expect(getByLabelText('New chat in this project')).toBeTruthy());
    fireEvent.press(getByLabelText('New chat in this project'));
    expect(mockSetActiveLocal).toHaveBeenCalledWith('proj_snapshot');
    expect(mockSetActiveCloud).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/(app)/(tabs)/chat');
  });

  it('requires an explicit switch before opening a Cloud project from Local mode', async () => {
    mockLocalProjects = [];
    mockCloudProjects = [
      {
        id: 'proj_snapshot',
        name: 'Cloud project',
        deletedAt: null,
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ];
    const { getByLabelText, getByTestId, queryByLabelText } = render(<ProjectDetailScreen />);
    expect(getByTestId('project-detail-cloud-header')).toBeTruthy();
    expect(queryByLabelText('New chat in this project')).toBeNull();
    fireEvent.press(getByLabelText('Switch to Cloud mode'));
    await waitFor(() => expect(getByLabelText('New chat in this project')).toBeTruthy());
    fireEvent.press(getByLabelText('New chat in this project'));
    expect(mockSetActiveCloud).toHaveBeenCalledWith('proj_snapshot');
    expect(mockSetActiveLocal).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/(app)/(tabs)/chat');
  });

  it('does not offer chat or source actions for an unavailable project', () => {
    mockLocalProjects = [];
    const { getByText, queryByLabelText } = render(<ProjectDetailScreen />);
    expect(getByText('Project unavailable')).toBeTruthy();
    expect(queryByLabelText('New chat in this project')).toBeNull();
    expect(queryByLabelText('Sources')).toBeNull();
    fireEvent.press(getByText('Open Projects'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/(tabs)/projects');
  });

  it('loads a Cloud project found by server search before offering chat actions', async () => {
    mockLocalProjects = [];
    mockSignedIn = true;
    useChatAppModeStore.setState({ appMode: 'cloud' });
    let finishLoad: () => void = () => undefined;
    mockLoadMissingCloudProject.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishLoad = () => {
            mockCloudProjects = [
              {
                id: 'proj_snapshot',
                name: 'Remote project',
                deletedAt: null,
                updatedAt: '2026-09-01T00:00:00.000Z',
              },
            ];
            resolve();
          };
        }),
    );

    const screen = render(<ProjectDetailScreen />);
    expect(screen.getByText('Loading Cloud project')).toBeTruthy();
    expect(screen.queryByLabelText('New chat in this project')).toBeNull();
    await waitFor(() =>
      expect(mockLoadMissingCloudProject).toHaveBeenCalledWith('proj_snapshot', expect.anything()),
    );
    await act(async () => finishLoad());
    screen.rerender(<ProjectDetailScreen />);
    expect(screen.getByLabelText('New chat in this project')).toBeTruthy();
  });

  it('offers retry when loading an unsynced Cloud project fails', async () => {
    mockLocalProjects = [];
    mockSignedIn = true;
    useChatAppModeStore.setState({ appMode: 'cloud' });
    mockLoadMissingCloudProject.mockRejectedValue(new Error('offline'));

    const { getByLabelText, getByText, queryByLabelText } = render(<ProjectDetailScreen />);
    await waitFor(() => expect(getByText('Project unavailable')).toBeTruthy());
    expect(queryByLabelText('New chat in this project')).toBeNull();
    fireEvent.press(getByLabelText('Retry loading project'));
    await waitFor(() => expect(mockLoadMissingCloudProject).toHaveBeenCalledTimes(2));
  });

  it('locks the no-id empty tree when no params are provided', () => {
    mockSearchParams = {};
    const { toJSON } = render(<ProjectDetailScreen />);
    expect(toJSON()).toMatchSnapshot();
  });
});
