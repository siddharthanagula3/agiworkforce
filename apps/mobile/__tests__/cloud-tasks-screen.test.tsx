import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockListRuns = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: jest.fn(() => true),
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return {
    ArrowLeft: icon,
    Bot: icon,
    CheckCircle2: icon,
    ChevronRight: icon,
    Clock3: icon,
    Cloud: icon,
    PauseCircle: icon,
    RefreshCw: icon,
  };
});

jest.mock('../services/streaming', () => ({
  createMobileCloudAgentRunClient: () => ({ listRuns: mockListRuns }),
}));

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((callback) => callback()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import TasksScreen from '../app/(app)/agents';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { useChatStore } from '../stores/chatStore';

const RUN = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: 'user-1',
  requestId: 'request-1',
  conversationId: 'conversation-1',
  originSurface: 'mobile',
  workMode: 'agiwork',
  state: 'awaiting_input',
  provider: 'openai',
  model: 'model-1',
  lastEventSequence: 4,
  cancellationRequestedAt: null,
  completedAt: null,
  createdAt: '2026-07-17T19:00:00.000Z',
  updatedAt: '2026-07-17T20:00:00.000Z',
};

describe('Mobile Cloud tasks screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    useChatStore.setState({
      conversations: [
        {
          id: 'conversation-1',
          title: 'Audit the launch checklist',
          createdAt: RUN.createdAt,
          updatedAt: RUN.updatedAt,
          messageCount: 2,
          executionMode: 'cloud',
        },
      ],
    } as never);
    mockListRuns.mockResolvedValue({ runs: [RUN], nextCursor: null });
  });

  it('loads real active Cloud runs and opens the owning conversation', async () => {
    const { getByText, getByLabelText } = render(<TasksScreen />);

    await waitFor(() => expect(getByText('Audit the launch checklist')).toBeTruthy());
    expect(getByText('Awaiting input')).toBeTruthy();
    expect(mockListRuns).toHaveBeenCalledWith(
      expect.objectContaining({
        states: ['queued', 'running', 'paused', 'awaiting_input', 'ready_for_review'],
      }),
    );

    fireEvent.press(getByLabelText('Open task: Audit the launch checklist'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/chat/[id]',
      params: { id: 'conversation-1' },
    });
  });

  it('uses semantic filters backed by the server state query', async () => {
    const { getByLabelText } = render(<TasksScreen />);
    await waitFor(() => expect(mockListRuns).toHaveBeenCalledTimes(1));

    fireEvent.press(getByLabelText('Filter tasks: Needs input'));

    await waitFor(() =>
      expect(mockListRuns).toHaveBeenLastCalledWith(
        expect.objectContaining({ states: ['awaiting_input'] }),
      ),
    );
  });

  it('does not contact Cloud while Local mode is active', () => {
    useChatAppModeStore.setState({ appMode: 'local' });
    const { getByText } = render(<TasksScreen />);

    expect(getByText('Tasks run in AGI Cloud')).toBeTruthy();
    expect(mockListRuns).not.toHaveBeenCalled();
  });

  it('renders an actionable retry state when the run list fails', async () => {
    mockListRuns.mockRejectedValueOnce(new Error('offline'));
    const { getByText, getByLabelText } = render(<TasksScreen />);

    await waitFor(() => expect(getByText('Tasks could not be loaded')).toBeTruthy());
    fireEvent.press(getByLabelText('Retry loading tasks'));

    await waitFor(() => expect(mockListRuns).toHaveBeenCalledTimes(2));
  });
});
