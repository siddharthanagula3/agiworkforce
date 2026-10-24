import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockApiGet = jest.fn();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
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
  return new Proxy({}, { get: (_target, key) => (key === '__esModule' ? false : icon) });
});

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((callback) => callback()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('../services/api', () => ({
  ...jest.requireActual('../services/api'),
  api: { get: (...args: unknown[]) => mockApiGet(...args) },
}));

jest.mock('../src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () => ({ ownerId: 'account-a', epoch: 1 }),
  isCloudAccountEpochCurrent: () => true,
}));

import ScheduledRunsScreen from '../app/(app)/schedules/runs';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { useScheduleStore } from '../src/features/schedules/store';

function apiRun(id: string, taskName: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    taskId: `task-${id}`,
    taskName,
    status: 'success',
    triggerSource: 'schedule',
    scheduledFor: null,
    startedAt: '2026-10-20T09:00:00.000Z',
    completedAt: '2026-10-20T09:01:00.000Z',
    durationMs: 60_000,
    result: { text: `Result of ${taskName}` },
    error: null,
    idempotencyKey: `key-${id}`,
    leaseExpiresAt: null,
    attemptCount: 1,
    ...overrides,
  };
}

describe('Scheduled runs screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    useScheduleStore.getState().clearAccountSchedules();
  });

  it('lists runs across schedules, newest first as served, and opens the owning schedule', async () => {
    mockApiGet.mockResolvedValueOnce({
      runs: [
        apiRun('run-2', 'Morning briefing'),
        apiRun('run-1', 'Inbox triage', { status: 'failed', result: null }),
      ],
      nextCursor: null,
    });

    const { getByText, getByLabelText, getAllByText } = render(<ScheduledRunsScreen />);

    await waitFor(() => expect(getByText('Morning briefing')).toBeTruthy());
    expect(getByText('Scheduled runs')).toBeTruthy();
    expect(getByText('Result of Morning briefing')).toBeTruthy();
    expect(getAllByText('Failed').length).toBe(1);
    expect(mockApiGet).toHaveBeenCalledWith(
      expect.stringMatching(/^\/api\/schedules\/runs\?limit=\d+$/),
    );

    fireEvent.press(getByLabelText(/^Inbox triage, Failed/));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/schedules/create',
      params: { id: 'task-run-1' },
    });
  });

  it('shows the empty state when nothing has run yet', async () => {
    mockApiGet.mockResolvedValueOnce({ runs: [], nextCursor: null });

    const { getByText } = render(<ScheduledRunsScreen />);

    await waitFor(() => expect(getByText('No scheduled runs')).toBeTruthy());
    expect(getByText('Runs from your scheduled tasks appear here.')).toBeTruthy();
  });

  it('shows a retryable error instead of a blank list when loading fails', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('offline'));
    mockApiGet.mockResolvedValueOnce({
      runs: [apiRun('run-1', 'Weekly review')],
      nextCursor: null,
    });

    const { getByText, getByLabelText } = render(<ScheduledRunsScreen />);

    await waitFor(() => expect(getByText('Scheduled runs could not be loaded')).toBeTruthy());
    fireEvent.press(getByLabelText('Retry loading scheduled runs'));
    await waitFor(() => expect(getByText('Weekly review')).toBeTruthy());
  });

  it('follows the cursor for the next page and skips runs already shown', async () => {
    mockApiGet.mockResolvedValueOnce({
      runs: [apiRun('run-3', 'Third')],
      nextCursor: 'cursor-1',
    });
    mockApiGet.mockResolvedValueOnce({
      runs: [apiRun('run-3', 'Third'), apiRun('run-2', 'Second')],
      nextCursor: null,
    });

    const { getByText } = render(<ScheduledRunsScreen />);
    await waitFor(() => expect(getByText('Third')).toBeTruthy());

    await useScheduleStore.getState().fetchMoreRecentRuns();

    expect(mockApiGet).toHaveBeenLastCalledWith(expect.stringContaining('cursor=cursor-1'));
    expect(useScheduleStore.getState().recentRuns.map((run) => run.id)).toEqual(['run-3', 'run-2']);
    expect(useScheduleStore.getState().recentRunsCursor).toBeNull();
  });

  it('does not contact Cloud in Local Mode', () => {
    useChatAppModeStore.setState({ appMode: 'local' });

    render(<ScheduledRunsScreen />);

    expect(mockApiGet).not.toHaveBeenCalled();
  });
});
