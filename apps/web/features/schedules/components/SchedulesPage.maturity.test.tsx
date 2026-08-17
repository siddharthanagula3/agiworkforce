import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MANAGED_CLOUD_STATUS } from '@/lib/legal-constants';
import { SchedulesPage } from './SchedulesPage';
import type { ScheduleApi } from '../services/schedule-api';

function createApi(): ScheduleApi {
  return {
    listSchedules: vi.fn(async () => ({
      schedules: [],
      pagination: { limit: 50, offset: 0 },
      hasMore: false,
    })),
    getSchedule: vi.fn(),
    createSchedule: vi.fn(),
    updateSchedule: vi.fn(),
    setScheduleEnabled: vi.fn(),
    deleteSchedule: vi.fn(),
    listRuns: vi.fn(async () => ({
      runs: [],
      pagination: { limit: 20, offset: 0 },
      hasMore: false,
    })),
    runNow: vi.fn(),
  } as unknown as ScheduleApi;
}

describe('SchedulesPage maturity disclosure', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  it('marks the schedules surface with the Managed Cloud maturity status', async () => {
    render(<SchedulesPage api={createApi()} />);

    const badge = await screen.findByTestId('schedule-maturity-badge');
    expect(badge.textContent).toBe('Alpha');
    expect(badge.getAttribute('title')).toContain(MANAGED_CLOUD_STATUS);
  });

  it('discloses the maturity status inside the schedule-creation dialog', async () => {
    const user = userEvent.setup();
    render(<SchedulesPage api={createApi()} />);

    await user.click(await screen.findByRole('button', { name: 'Create Your First Schedule' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain(MANAGED_CLOUD_STATUS);
  });
});
