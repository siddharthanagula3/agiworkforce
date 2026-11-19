/* eslint-disable @typescript-eslint/no-require-imports */
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockPush = jest.fn();
const mockMarkProjectForSync = jest.fn();
let mockSearchParams: { id?: string } = { id: 'project-1' };
let mockCanGoBack = true;

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
  syncNow: jest.fn().mockResolvedValue(undefined),
  markProjectForSync: (id: string) => mockMarkProjectForSync(id),
}));

jest.mock('@/src/features/projects/service', () => ({
  loadMissingCloudProject: jest.fn().mockResolvedValue(undefined),
  refreshCloudProjectDetails: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ isClerkSignedIn: true, clerkUserId: 'user-1' }),
}));

jest.mock('@/src/features/auth/services/accountScopedUiState', () => ({
  accountScopedUiStateKey: (state: { scope: string } | null) => state?.scope ?? 'unavailable',
  captureAccountScopedUiState: (scope: 'local' | 'cloud') => ({ scope }),
  isAccountScopedUiStateCurrent: (state: { scope: string } | null, mode: string) =>
    state?.scope === mode,
}));

jest.mock('@/src/features/projects/components/ProjectChatsTab', () => ({
  ProjectChatsTab: () => null,
}));
jest.mock('@/src/features/projects/components/ProjectSourcesTab', () => ({
  ProjectSourcesTab: () => null,
}));
jest.mock('@/src/features/projects/components/ProjectWorkTab', () => ({
  ProjectWorkTab: () => null,
}));
jest.mock('@/src/features/projects/components/ProjectArtifactsTab', () => ({
  ProjectArtifactsTab: () => null,
}));
jest.mock('@/src/features/projects/components/ProjectRoutinesTab', () => ({
  ProjectRoutinesTab: () => null,
}));
jest.mock('@/src/features/projects/components/CloudProjectOverview', () => ({
  CloudProjectOverview: () => null,
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useNavigation: () => ({ openDrawer: jest.fn(), navigate: jest.fn(), goBack: jest.fn() }),
  useLocalSearchParams: () => mockSearchParams,
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => mockCanGoBack,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
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
import ProjectDetailScreen from '@/app/(app)/projects/[id]';
import { useProjectStore } from '@/src/features/projects/store';
import { useCloudProjectStore, type CloudProject } from '@/stores/projects/cloudProjectStore';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';

const NOW = '2026-07-20T10:00:00.000Z';

function cloudProject(overrides: Partial<CloudProject> = {}): CloudProject {
  return {
    id: 'project-1',
    name: 'Billing rewrite',
    description: 'Invoices',
    instructions: null,
    color: null,
    isArchived: false,
    metadata: null,
    source: 'web',
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    serverVersion: '1',
    ...overrides,
  };
}

function menuLabels(screen: ReturnType<typeof render>): string[] {
  return screen
    .queryAllByTestId(/^conversation-action-/)
    .map((node) => String(node.props.accessibilityLabel));
}

function choose(screen: ReturnType<typeof render>, key: string) {
  fireEvent.press(screen.getByTestId(`conversation-action-${key}`));
  act(() => {
    for (const sheet of screen.UNSAFE_getAllByType(Modal)) {
      (sheet.props.onDismiss as (() => void) | undefined)?.();
    }
  });
}

describe('Project page more-actions menu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = { id: 'project-1' };
    mockCanGoBack = true;
    useChatAppModeStore.setState({ appMode: 'local' });
    useProjectStore.setState({
      projects: [
        {
          id: 'project-1',
          name: 'Launch demo',
          description: 'Release planning',
          instructions: 'Be brief',
          sources: [],
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
      activeProjectId: null,
    });
    useCloudProjectStore.setState({ projects: [], activeProjectId: null, details: {} });
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
  });

  describe('Local project', () => {
    it('opens Pin, Rename and Delete from an ellipsis button in the header', () => {
      const screen = render(<ProjectDetailScreen />);

      fireEvent.press(screen.getByLabelText('More project actions'));

      expect(menuLabels(screen)).toEqual(['Pin', 'Rename', 'Delete', 'Cancel']);
    });

    it('pins and then unpins the project', () => {
      const screen = render(<ProjectDetailScreen />);

      fireEvent.press(screen.getByLabelText('More project actions'));
      choose(screen, 'pin');
      expect(useProjectStore.getState().projects[0]?.pinned).toBe(true);

      fireEvent.press(screen.getByLabelText('More project actions'));
      expect(screen.getByLabelText('Unpin')).toBeTruthy();
      choose(screen, 'pin');
      expect(useProjectStore.getState().projects[0]?.pinned).toBe(false);
    });

    it('renames in the project editor and shows the new name in the header', () => {
      const screen = render(<ProjectDetailScreen />);

      fireEvent.press(screen.getByLabelText('More project actions'));
      choose(screen, 'rename');
      expect(screen.getByLabelText('Project name').props.value).toBe('Launch demo');
      fireEvent.changeText(screen.getByLabelText('Project name'), 'Launch plan');
      fireEvent.press(screen.getByLabelText('Save project'));

      expect(useProjectStore.getState().projects[0]?.name).toBe('Launch plan');
      expect(screen.getAllByText('Launch plan').length).toBeGreaterThan(0);
    });

    it('names the consequence, deletes only after confirming and leaves the page', () => {
      const screen = render(<ProjectDetailScreen />);

      fireEvent.press(screen.getByLabelText('More project actions'));
      choose(screen, 'delete');

      expect(Alert.alert).toHaveBeenCalledWith(
        'Delete project?',
        '"Launch demo" is deleted from this device. It cannot be restored.',
        expect.any(Array),
      );
      expect(useProjectStore.getState().projects).toHaveLength(1);
      expect(mockBack).not.toHaveBeenCalled();

      const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as {
        text?: string;
        style?: string;
        onPress?: () => void;
      }[];
      expect(buttons.find((button) => button.text === 'Delete')?.style).toBe('destructive');
      act(() => buttons.find((button) => button.text === 'Delete')?.onPress?.());

      expect(useProjectStore.getState().projects).toHaveLength(0);
      expect(mockBack).toHaveBeenCalled();
    });

    it('does not delete when the confirmation is cancelled', () => {
      const screen = render(<ProjectDetailScreen />);

      fireEvent.press(screen.getByLabelText('More project actions'));
      choose(screen, 'delete');
      const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as {
        text?: string;
        onPress?: () => void;
      }[];
      act(() => buttons.find((button) => button.text === 'Cancel')?.onPress?.());

      expect(useProjectStore.getState().projects).toHaveLength(1);
      expect(mockBack).not.toHaveBeenCalled();
    });

    it('hides the ellipsis for a Cloud project while in Local mode', () => {
      useProjectStore.setState({ projects: [], activeProjectId: null });
      useCloudProjectStore.setState({ projects: [cloudProject()] });

      const screen = render(<ProjectDetailScreen />);

      expect(screen.queryByLabelText('More project actions')).toBeNull();
    });
  });

  describe('Cloud project', () => {
    beforeEach(() => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useProjectStore.setState({ projects: [], activeProjectId: null });
      useCloudProjectStore.setState({ projects: [cloudProject()] });
    });

    it('adds Archive to the menu', () => {
      const screen = render(<ProjectDetailScreen />);

      fireEvent.press(screen.getByLabelText('More project actions'));

      expect(menuLabels(screen)).toEqual(['Pin', 'Rename', 'Archive', 'Delete', 'Cancel']);
    });

    it('pins with the synced server field', () => {
      const screen = render(<ProjectDetailScreen />);

      fireEvent.press(screen.getByLabelText('More project actions'));
      choose(screen, 'pin');

      expect(useCloudProjectStore.getState().projects[0]?.metadata).toEqual({ starred: true });
      expect(mockMarkProjectForSync).toHaveBeenCalledWith('project-1');
    });

    it('archives, syncs and leaves the page', () => {
      const screen = render(<ProjectDetailScreen />);

      fireEvent.press(screen.getByLabelText('More project actions'));
      choose(screen, 'archive');

      expect(useCloudProjectStore.getState().projects[0]?.isArchived).toBe(true);
      expect(mockMarkProjectForSync).toHaveBeenCalledWith('project-1');
      expect(mockBack).toHaveBeenCalled();
    });

    it('offers Restore instead of Pin and Archive for an archived project', () => {
      useCloudProjectStore.setState({ projects: [cloudProject({ isArchived: true })] });
      const screen = render(<ProjectDetailScreen />);

      fireEvent.press(screen.getByLabelText('More project actions'));
      expect(menuLabels(screen)).toEqual(['Rename', 'Restore', 'Delete', 'Cancel']);
      choose(screen, 'archive');

      expect(useCloudProjectStore.getState().projects[0]?.isArchived).toBe(false);
      expect(mockBack).not.toHaveBeenCalled();
    });

    it('says the project leaves every device before a Cloud delete', () => {
      const screen = render(<ProjectDetailScreen />);

      fireEvent.press(screen.getByLabelText('More project actions'));
      choose(screen, 'delete');

      expect(Alert.alert).toHaveBeenCalledWith(
        'Delete project?',
        '"Billing rewrite" is removed from all your devices. It cannot be restored from the app.',
        expect.any(Array),
      );
      const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as {
        text?: string;
        onPress?: () => void;
      }[];
      act(() => buttons.find((button) => button.text === 'Delete')?.onPress?.());

      expect(useCloudProjectStore.getState().projects[0]?.deletedAt).not.toBeNull();
      expect(mockMarkProjectForSync).toHaveBeenCalledWith('project-1');
      expect(mockBack).toHaveBeenCalled();
    });

    it('hides the ellipsis for a Local project while in Cloud mode', () => {
      useProjectStore.setState({
        projects: [
          {
            id: 'project-1',
            name: 'Launch demo',
            description: '',
            instructions: '',
            sources: [],
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
      });
      useCloudProjectStore.setState({ projects: [] });

      const screen = render(<ProjectDetailScreen />);

      expect(screen.queryByLabelText('More project actions')).toBeNull();
    });
  });
});
