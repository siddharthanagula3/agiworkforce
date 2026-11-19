import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockListRuns = jest.fn();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn(() => true),
  }),
}));

jest.mock('@clerk/expo', () => ({
  getClerkInstance: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

jest.mock('@/services/streaming', () => ({
  createMobileCloudAgentRunClient: () => ({
    listRuns: mockListRuns,
    followRun: jest.fn(),
    resumeRun: jest.fn(),
    cancelRun: jest.fn(),
  }),
}));

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((callback: () => void) => callback()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

let mockSources = { offered: true, needsConnect: true };
jest.mock('../useWorkIntroSources', () => ({
  useWorkIntroSources: () => mockSources,
}));

import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import { useAuthStore } from '@/src/features/auth/store';
import { useTierStore } from '@/src/features/billing/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useChatStore } from '@/stores/chatStore';
import { CloudTasksScreen } from '../CloudTasksScreen';
import { useCloudTaskStore } from '../store';

describe('AGI Work empty state', () => {
  beforeAll(() => {
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type: string, _listener: (state: AppStateStatus) => void) => ({
        remove: jest.fn(),
      }));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockSources = { offered: true, needsConnect: true };
    __resetCloudAccountSessionForTests();
    activateCloudAccount('user-1');
    useCloudTaskStore.getState().reset();
    useCloudTaskStore.setState({ filter: 'all' });
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: 'user-1' });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    useChatStore.setState({ conversations: [] } as never);
    useTierStore.setState({ grantedCapabilities: ['canUseAgiWork'] });
    mockListRuns.mockResolvedValue({ runs: [], nextCursor: null });
  });

  afterEach(() => {
    useTierStore.setState({ grantedCapabilities: [] });
  });

  it('hands off a task from an empty list with no filter, and opens the new task sheet', async () => {
    const { findByText, getAllByLabelText, findByLabelText, queryByText } = render(
      <CloudTasksScreen />,
    );

    expect(await findByText('Hand off a task')).toBeTruthy();
    expect(queryByText('No Cloud tasks yet')).toBeNull();

    const newTaskControls = getAllByLabelText('New task');
    expect(newTaskControls).toHaveLength(2);
    fireEvent.press(newTaskControls[0] as never);
    expect(await findByLabelText('Task objective')).toBeTruthy();
  });

  it('opens Customize from the connect control', async () => {
    const { findByLabelText } = render(<CloudTasksScreen />);

    fireEvent.press(await findByLabelText('Connect email and calendar'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/customize');
  });

  it('hides the connect control when both sources are connected', async () => {
    mockSources = { offered: true, needsConnect: false };
    const { findByText, queryByLabelText } = render(<CloudTasksScreen />);

    expect(await findByText('Hand off a task')).toBeTruthy();
    expect(queryByLabelText('Connect email and calendar')).toBeNull();
  });

  it('shows no intro under a filter that matches nothing', async () => {
    useCloudTaskStore.setState({ filter: 'running' });
    const { findByText, queryByText, queryByLabelText } = render(<CloudTasksScreen />);

    expect(await findByText('No tasks match this filter')).toBeTruthy();
    expect(queryByText('Hand off a task')).toBeNull();
    expect(queryByLabelText('Connect email and calendar')).toBeNull();
  });

  it('keeps the plain empty message when the plan cannot start a task', async () => {
    useTierStore.setState({ grantedCapabilities: [] });
    const { findByText, queryByText, queryByLabelText } = render(<CloudTasksScreen />);

    expect(await findByText('No Cloud tasks yet')).toBeTruthy();
    expect(queryByText('Hand off a task')).toBeNull();
    expect(queryByLabelText('New task')).toBeNull();
    expect(queryByLabelText('Connect email and calendar')).toBeNull();
    await waitFor(() => expect(mockListRuns).toHaveBeenCalled());
  });
});
