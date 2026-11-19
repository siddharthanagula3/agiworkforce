jest.mock('@/lib/mmkv', () => ({
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

jest.mock('../service', () => ({
  fetchSchedules: jest.fn(),
  createSchedule: jest.fn(),
  updateSchedule: jest.fn(),
  deleteSchedule: jest.fn(),
  toggleSchedule: jest.fn(),
  fetchScheduleRuns: jest.fn(),
  resolveScheduleRunApproval: jest.fn(),
}));

import { useScheduleStore } from '../store';
import { ApiHttpError } from '@/services/apiErrors';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';

/* eslint-disable @typescript-eslint/no-require-imports */
const service = require('../service') as {
  fetchSchedules: jest.Mock;
  createSchedule: jest.Mock;
  deleteSchedule: jest.Mock;
  toggleSchedule: jest.Mock;
};
/* eslint-enable @typescript-eslint/no-require-imports */

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const ids = () => useScheduleStore.getState().schedules.map((schedule) => schedule.id);

describe('Scheduled task list after a delete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('account-a');
    useScheduleStore.getState().clearAccountSchedules();
    useScheduleStore.setState({
      schedules: [{ id: 'daily-test' }, { id: 'weekly-report' }] as never,
    });
  });

  it('keeps a deleted task gone when a list read before the delete arrives afterwards', async () => {
    const staleList = deferred<unknown[]>();
    service.fetchSchedules.mockReturnValueOnce(staleList.promise);
    service.deleteSchedule.mockResolvedValueOnce(undefined);

    const listing = useScheduleStore.getState().fetchSchedules();
    await expect(useScheduleStore.getState().deleteSchedule('daily-test')).resolves.toBe(true);
    staleList.resolve([{ id: 'daily-test' }, { id: 'weekly-report' }]);
    await listing;

    expect(ids()).toEqual(['weekly-report']);
    expect(useScheduleStore.getState().error).toBeNull();
  });

  it('does not bring a task back while its delete is still on the way', async () => {
    const pendingDelete = deferred<void>();
    service.deleteSchedule.mockReturnValueOnce(pendingDelete.promise);
    service.fetchSchedules.mockResolvedValueOnce([{ id: 'daily-test' }, { id: 'weekly-report' }]);

    const deleting = useScheduleStore.getState().deleteSchedule('daily-test');
    await useScheduleStore.getState().fetchSchedules();
    expect(ids()).toEqual(['weekly-report']);

    pendingDelete.resolve();
    await expect(deleting).resolves.toBe(true);
    expect(ids()).toEqual(['weekly-report']);
  });

  it('treats a task the server no longer has as deleted, without a connection error', async () => {
    service.deleteSchedule.mockRejectedValueOnce(new ApiHttpError('Schedule not found', 404));

    await expect(useScheduleStore.getState().deleteSchedule('daily-test')).resolves.toBe(true);

    expect(ids()).toEqual(['weekly-report']);
    expect(useScheduleStore.getState().error).toBeNull();
  });

  it('still restores the task and reports the failure when the server refuses the delete', async () => {
    service.deleteSchedule.mockRejectedValueOnce(new ApiHttpError('Server error', 500));

    await expect(useScheduleStore.getState().deleteSchedule('daily-test')).resolves.toBe(false);

    expect(ids()).toEqual(['daily-test', 'weekly-report']);
    expect(useScheduleStore.getState().error).toBe(
      'Could not delete this task. Check your connection and retry.',
    );
  });

  it('keeps a task created after a list read started', async () => {
    const staleList = deferred<unknown[]>();
    service.fetchSchedules.mockReturnValueOnce(staleList.promise);
    service.createSchedule.mockResolvedValueOnce({ id: 'new-task' });

    const listing = useScheduleStore.getState().fetchSchedules();
    await expect(useScheduleStore.getState().createSchedule({} as never)).resolves.toBe(true);
    staleList.resolve([{ id: 'daily-test' }, { id: 'weekly-report' }]);
    await listing;

    expect(ids()).toEqual(['new-task', 'daily-test', 'weekly-report']);
  });

  it('drops a task deleted elsewhere even when it was switched on or off here during the read', async () => {
    const listing = deferred<unknown[]>();
    service.fetchSchedules.mockReturnValueOnce(listing.promise);
    service.toggleSchedule.mockResolvedValueOnce({ id: 'daily-test', isActive: true });
    useScheduleStore.setState({
      schedules: [
        { id: 'daily-test', isActive: false, recurrence: 'daily' },
        { id: 'weekly-report', isActive: true, recurrence: 'weekly' },
      ] as never,
    });

    const reading = useScheduleStore.getState().fetchSchedules();
    await useScheduleStore.getState().toggleSchedule('daily-test');
    listing.resolve([{ id: 'weekly-report' }]);
    await reading;

    expect(ids()).toEqual(['weekly-report']);
  });

  it('uses the server list as it is when nothing changed during the read', async () => {
    service.fetchSchedules.mockResolvedValueOnce([{ id: 'weekly-report' }, { id: 'from-web' }]);

    await useScheduleStore.getState().fetchSchedules();

    expect(ids()).toEqual(['weekly-report', 'from-web']);
  });
});
