import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockApiGet = jest.fn();
const mockReportSheet = jest.fn();

jest.mock('@/src/features/chat/components/ReportFlagButton', () => ({
  ReportSheet: (props: Record<string, unknown>) => {
    mockReportSheet(props);
    return null;
  },
}));

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
  subscribeCloudAccountEpochChange: () => () => undefined,
}));

import ScheduledRunsScreen from '../app/(app)/schedules/runs';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { useScheduleStore } from '../src/features/schedules/store';
import { HEADER_TEXT_SCALE_LIMIT } from '../src/features/chat/components/WorkModeSwitch';
import { LARGEST_IOS_TEXT_SCALE, setTextScale } from '../test-utils/textScale';

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

  it('reports what a run wrote from its row, naming the run and its schedule', async () => {
    mockApiGet.mockResolvedValueOnce({
      runs: [
        apiRun('run-2', 'Morning briefing'),
        apiRun('run-1', 'Inbox triage', { status: 'failed', result: null }),
      ],
      nextCursor: null,
    });

    const { getAllByLabelText, getByTestId, getByText, queryByTestId } = render(
      <ScheduledRunsScreen />,
    );
    await waitFor(() => expect(getByText('Morning briefing')).toBeTruthy());

    expect(getAllByLabelText('Report this run')).toHaveLength(1);
    expect(queryByTestId('recent-run-report-run-1')).toBeNull();

    fireEvent.press(getByTestId('recent-run-report-run-2'));

    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReportSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        visible: true,
        title: 'Report this run',
        target: {
          messageId: 'schedule-run:run-2',
          conversationId: 'schedule:task-run-2',
          contentExcerpt: 'Result of Morning briefing',
          subject: { kind: 'schedule-run', id: 'run-2' },
        },
      }),
    );
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

  it('retries the newest page when a refresh of a fully loaded feed fails', async () => {
    mockApiGet.mockResolvedValueOnce({
      runs: [apiRun('run-1', 'Weekly review')],
      nextCursor: null,
    });
    mockApiGet.mockRejectedValueOnce(new Error('503'));
    mockApiGet.mockResolvedValueOnce({
      runs: [apiRun('run-2', 'Daily digest'), apiRun('run-1', 'Weekly review')],
      nextCursor: null,
    });

    const { getByText, getByLabelText, queryByText } = render(<ScheduledRunsScreen />);
    await waitFor(() => expect(getByText('Weekly review')).toBeTruthy());
    await act(() => useScheduleStore.getState().fetchRecentRuns());
    expect(
      getByText('Could not load scheduled runs. Check your connection and retry.'),
    ).toBeTruthy();

    fireEvent.press(getByLabelText('Retry loading scheduled runs'));

    await waitFor(() => expect(getByText('Daily digest')).toBeTruthy());
    expect(mockApiGet).toHaveBeenCalledTimes(3);
    expect(mockApiGet).toHaveBeenLastCalledWith(
      expect.stringMatching(/^\/api\/schedules\/runs\?limit=\d+$/),
    );
    expect(
      queryByText('Could not load scheduled runs. Check your connection and retry.'),
    ).toBeNull();
  });

  it('does not treat an older page as recovery from a failed refresh', async () => {
    mockApiGet.mockResolvedValueOnce({ runs: [apiRun('run-3', 'Third')], nextCursor: 'cursor-1' });
    mockApiGet.mockRejectedValueOnce(new Error('503'));
    mockApiGet.mockResolvedValueOnce({ runs: [apiRun('run-2', 'Second')], nextCursor: null });
    mockApiGet.mockResolvedValueOnce({ runs: [apiRun('run-4', 'Fourth')], nextCursor: null });

    const { getByText, getByLabelText } = render(<ScheduledRunsScreen />);
    await waitFor(() => expect(getByText('Third')).toBeTruthy());
    await act(() => useScheduleStore.getState().fetchRecentRuns());
    await act(() => useScheduleStore.getState().fetchMoreRecentRuns());

    expect(getByText('Second')).toBeTruthy();
    expect(
      getByText('Could not load scheduled runs. Check your connection and retry.'),
    ).toBeTruthy();

    fireEvent.press(getByLabelText('Retry loading scheduled runs'));

    await waitFor(() => expect(getByText('Fourth')).toBeTruthy());
    expect(mockApiGet).toHaveBeenLastCalledWith(
      expect.stringMatching(/^\/api\/schedules\/runs\?limit=\d+$/),
    );
  });

  it('retries the same older page when loading more fails', async () => {
    mockApiGet.mockResolvedValueOnce({ runs: [apiRun('run-3', 'Third')], nextCursor: 'cursor-1' });
    mockApiGet.mockRejectedValueOnce(new Error('503'));
    mockApiGet.mockResolvedValueOnce({ runs: [apiRun('run-2', 'Second')], nextCursor: null });

    const { getByText, getByLabelText } = render(<ScheduledRunsScreen />);
    await waitFor(() => expect(getByText('Third')).toBeTruthy());
    await act(() => useScheduleStore.getState().fetchMoreRecentRuns());

    fireEvent.press(getByLabelText('Retry loading more scheduled runs'));

    await waitFor(() => expect(getByText('Second')).toBeTruthy());
    expect(mockApiGet).toHaveBeenLastCalledWith(expect.stringContaining('cursor=cursor-1'));
  });

  describe('header at large text sizes', () => {
    const startingScale = Dimensions.get('window').fontScale;

    afterEach(() => setTextScale(startingScale));

    it.each([
      ['the default text size', 1],
      ['the largest text size', LARGEST_IOS_TEXT_SCALE],
    ])('gives the header a minimum height and a capped title at %s', (_name, scale) => {
      setTextScale(scale);
      mockApiGet.mockResolvedValueOnce({ runs: [], nextCursor: null });

      const { getByTestId, getByRole } = render(<ScheduledRunsScreen />);

      const header = getByTestId('schedule-runs-header');
      expect(String(header.props.className)).toMatch(/\bmin-h-12\b/);
      expect(String(header.props.className)).not.toMatch(/(^|\s)h-12\b/);
      const title = getByRole('header', { name: 'Scheduled runs' });
      expect(title.props.maxFontSizeMultiplier).toBe(HEADER_TEXT_SCALE_LIMIT);
    });

    it('keeps the title in the header row so a taller title makes the row taller', () => {
      mockApiGet.mockResolvedValueOnce({ runs: [], nextCursor: null });

      const { getByRole } = render(<ScheduledRunsScreen />);

      const title = getByRole('header', { name: 'Scheduled runs' });
      let node = title.parent;
      while (node) {
        expect(StyleSheet.flatten(node.props?.style)?.position).not.toBe('absolute');
        if (node.props?.testID === 'schedule-runs-header') break;
        node = node.parent;
      }
      expect(node?.props?.testID).toBe('schedule-runs-header');
    });
  });

  it('does not contact Cloud in Local Mode', () => {
    useChatAppModeStore.setState({ appMode: 'local' });

    render(<ScheduledRunsScreen />);

    expect(mockApiGet).not.toHaveBeenCalled();
  });
});
