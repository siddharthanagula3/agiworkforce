import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import { ProjectChatsTab } from '../components/ProjectChatsTab';
import { useChatCloudMessageStore } from '@/stores/chatStore';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useCloudProjectStore } from '@/stores/projects/cloudProjectStore';

const PROJECT_ID = 'project-garden';

describe('ProjectChatsTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useCloudProjectStore.setState({
      projects: [
        {
          id: PROJECT_ID,
          name: 'Garden',
          description: null,
          instructions: null,
          color: null,
          isArchived: false,
          metadata: null,
          source: 'mobile',
          createdAt: '2026-11-01T00:00:00.000Z',
          updatedAt: '2026-11-01T00:00:00.000Z',
          deletedAt: null,
        },
      ],
      activeProjectId: null,
    });
    useChatCloudMessageStore.setState({
      conversations: [
        {
          id: 'thread-1',
          title: 'Quarterly plan',
          createdAt: '2026-11-01T00:00:00.000Z',
          updatedAt: '2026-11-01T00:00:00.000Z',
          messageCount: 1,
          pinned: false,
          executionMode: 'cloud',
          projectId: PROJECT_ID,
        },
      ],
    } as never);
  });

  it('opens a chat with the project as its origin', () => {
    render(<ProjectChatsTab projectId={PROJECT_ID} />);

    fireEvent.press(screen.getByRole('button', { name: 'Open chat: Quarterly plan' }));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/chat/[id]',
      params: { id: 'thread-1', from: 'project' },
    });
  });

  it('starts a new chat in the project with the project as its origin', () => {
    render(<ProjectChatsTab projectId={PROJECT_ID} />);

    fireEvent.press(screen.getByRole('button', { name: 'New chat in this project' }));

    expect(useCloudProjectStore.getState().activeProjectId).toBe(PROJECT_ID);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/(tabs)/chat',
      params: { from: 'project' },
    });
  });
});
