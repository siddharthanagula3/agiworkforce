/* eslint-disable @typescript-eslint/no-require-imports */
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockPush = jest.fn();
const mockMarkProjectForSync = jest.fn();
let mockSearchParams: Record<string, string | undefined> = { id: 'project-1' };
const mockSourcesTab = jest.fn();
const mockCanGoBack = true;

jest.mock('@/src/features/chat/components/WorkModeSwitch', () => ({ HEADER_TEXT_SCALE_LIMIT: 2 }));
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
  ProjectSourcesTab: (props: Record<string, unknown>) => {
    mockSourcesTab(props);
    return null;
  },
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
import { render, screen } from '@testing-library/react-native';
import ProjectDetailScreen from '@/app/(app)/projects/[id]';
import { useProjectStore } from '@/src/features/projects/store';
import { useCloudProjectStore } from '@/stores/projects/cloudProjectStore';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';

const NOW = '2026-07-20T10:00:00.000Z';

describe('Project page opened from a cited project file', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useChatAppModeStore.setState({ appMode: 'local' });
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
      activeProjectId: null,
    });
    useCloudProjectStore.setState({ projects: [], activeProjectId: null, details: {} });
  });

  it('lands on Sources and opens the cited file at the cited page', () => {
    mockSearchParams = { id: 'project-1', knowledgeFile: 'kf-9', page: '12' };
    render(<ProjectDetailScreen />);

    expect(screen.getByRole('tab', { name: 'Sources' }).props.accessibilityState).toEqual({
      selected: true,
    });
    expect(mockSourcesTab).toHaveBeenLastCalledWith({
      projectId: 'project-1',
      openFileId: 'kf-9',
      openPage: 12,
    });
  });

  it('ignores a page that is not a page number', () => {
    mockSearchParams = { id: 'project-1', knowledgeFile: 'kf-9', page: 'abc' };
    render(<ProjectDetailScreen />);

    expect(mockSourcesTab).toHaveBeenLastCalledWith({ projectId: 'project-1', openFileId: 'kf-9' });
  });

  it('opens on Chats when no file is cited', () => {
    mockSearchParams = { id: 'project-1' };
    render(<ProjectDetailScreen />);

    expect(screen.getByRole('tab', { name: 'Chats' }).props.accessibilityState).toEqual({
      selected: true,
    });
    expect(mockSourcesTab).not.toHaveBeenCalled();
  });
});
