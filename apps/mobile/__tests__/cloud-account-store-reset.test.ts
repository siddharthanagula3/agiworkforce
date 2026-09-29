jest.mock('../lib/mmkv', () => ({
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  rehydrateWhenMmkvReady: jest.fn(),
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../src/features/schedules/service', () => ({
  fetchSchedules: jest.fn(),
  createSchedule: jest.fn(),
  updateSchedule: jest.fn(),
  deleteSchedule: jest.fn(),
  toggleSchedule: jest.fn(),
  fetchScheduleRuns: jest.fn(),
}));

import { useScheduleStore } from '../src/features/schedules/store';
import { useChatViewStore } from '../stores/chat/chatViewStore';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

/* eslint-disable @typescript-eslint/no-require-imports */
const scheduleService = require('../src/features/schedules/service') as {
  fetchSchedules: jest.Mock;
  createSchedule: jest.Mock;
  deleteSchedule: jest.Mock;
  toggleSchedule: jest.Mock;
  fetchScheduleRuns: jest.Mock;
};
/* eslint-enable @typescript-eslint/no-require-imports */

describe('Cloud account store resets', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('account-a');
    useScheduleStore.getState().clearAccountSchedules();
    useChatViewStore.getState().clearCloudSearchState();
  });

  it('clears schedules, run history, and transient request state', () => {
    useScheduleStore.setState({
      schedules: [{ id: 'account-a-schedule' }] as never,
      runsBySchedule: { 'account-a-schedule': [{ id: 'run-a' }] } as never,
      runsLoadingBySchedule: { 'account-a-schedule': true },
      runsErrorBySchedule: { 'account-a-schedule': 'private error' },
      loading: true,
      error: 'private error',
    });

    useScheduleStore.getState().clearAccountSchedules();

    expect(useScheduleStore.getState()).toMatchObject({
      schedules: [],
      runsBySchedule: {},
      runsLoadingBySchedule: {},
      runsErrorBySchedule: {},
      loading: false,
      error: null,
    });
  });

  it('cancels account search state without resetting device chat preferences', () => {
    useChatViewStore.setState({
      searchQuery: 'account A secret',
      searchResults: [
        { conversationId: 'account-a-chat', messageId: 'message-a', snippet: 'secret' },
      ],
      isSearching: true,
      chatStyle: 'explanatory',
    });

    useChatViewStore.getState().clearCloudSearchState();

    expect(useChatViewStore.getState()).toMatchObject({
      searchQuery: '',
      searchResults: [],
      isSearching: false,
      chatStyle: 'explanatory',
    });
  });

  it('ignores a stale account-A schedule response after account B becomes active', async () => {
    let resolveAccountA!: (value: unknown[]) => void;
    scheduleService.fetchSchedules.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAccountA = resolve;
      }),
    );

    const pending = useScheduleStore.getState().fetchSchedules();
    activateCloudAccount('account-b');
    useScheduleStore.getState().clearAccountSchedules();
    resolveAccountA([{ id: 'account-a-schedule' }]);
    await pending;

    expect(useScheduleStore.getState()).toMatchObject({
      schedules: [],
      loading: false,
      error: null,
    });
  });

  it('does not report a task as created when the Cloud account changes during creation', async () => {
    let resolveCreate!: (value: { id: string }) => void;
    scheduleService.createSchedule.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );

    const pending = useScheduleStore.getState().createSchedule({} as never);
    activateCloudAccount('account-b');
    useScheduleStore.getState().clearAccountSchedules();
    resolveCreate({ id: 'account-a-schedule' });

    await expect(pending).resolves.toBe(false);
    expect(useScheduleStore.getState().schedules).toEqual([]);
  });

  it('keeps service diagnostics out of scheduled-task and run-history errors', async () => {
    scheduleService.fetchSchedules.mockRejectedValueOnce(new Error('internal provider token'));
    await useScheduleStore.getState().fetchSchedules();
    expect(useScheduleStore.getState().error).toBe(
      'Could not load scheduled tasks. Check your connection and retry.',
    );

    scheduleService.createSchedule.mockRejectedValueOnce(new Error('database connection string'));
    await expect(useScheduleStore.getState().createSchedule({} as never)).rejects.toThrow(
      'database connection string',
    );
    expect(useScheduleStore.getState().error).toBe(
      'Could not create this task. Check your connection and retry.',
    );

    scheduleService.fetchScheduleRuns.mockRejectedValueOnce(
      new Error('private schedule identifier'),
    );
    await useScheduleStore.getState().fetchRuns('schedule-a');
    expect(useScheduleStore.getState().runsErrorBySchedule['schedule-a']).toBe(
      'Could not load run history. Check your connection and retry.',
    );
  });

  it('restores a task and reports failure when deletion is refused', async () => {
    useScheduleStore.setState({ schedules: [{ id: 'schedule-a' }] as never });
    scheduleService.deleteSchedule.mockRejectedValueOnce(new Error('private storage path'));

    await expect(useScheduleStore.getState().deleteSchedule('schedule-a')).resolves.toBe(false);
    expect(useScheduleStore.getState().schedules).toEqual([{ id: 'schedule-a' }]);
    expect(useScheduleStore.getState().error).toBe(
      'Could not delete this task. Check your connection and retry.',
    );
  });

  it('preserves other task changes when a deletion fails after they arrive', async () => {
    useScheduleStore.setState({ schedules: [{ id: 'schedule-a' }] as never });
    let rejectDeletion!: (error: Error) => void;
    scheduleService.deleteSchedule.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectDeletion = reject;
      }),
    );

    const pending = useScheduleStore.getState().deleteSchedule('schedule-a');
    useScheduleStore.setState({ schedules: [{ id: 'schedule-b' }] as never });
    rejectDeletion(new Error('delete refused'));

    await expect(pending).resolves.toBe(false);
    expect(useScheduleStore.getState().schedules).toEqual([
      { id: 'schedule-a' },
      { id: 'schedule-b' },
    ]);
  });

  it('uses the server schedule after changing activation', async () => {
    useScheduleStore.setState({
      schedules: [
        { id: 'schedule-a', recurrence: 'daily', isActive: false, nextRunAt: null },
      ] as never,
    });
    scheduleService.toggleSchedule.mockResolvedValueOnce({
      id: 'schedule-a',
      recurrence: 'daily',
      isActive: true,
      nextRunAt: '2026-09-28T14:00:00.000Z',
    });

    await useScheduleStore.getState().toggleSchedule('schedule-a');

    expect(useScheduleStore.getState().schedules).toEqual([
      {
        id: 'schedule-a',
        recurrence: 'daily',
        isActive: true,
        nextRunAt: '2026-09-28T14:00:00.000Z',
      },
    ]);
  });
});
