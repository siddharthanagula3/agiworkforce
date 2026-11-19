import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

const mockGet = jest.fn();

jest.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: () => jest.fn().mockReturnValue(null) }),
);
jest.mock('@/services/api', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args) },
}));
jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { schedules: true } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('@gorhom/bottom-sheet', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/RecurrencePicker', () => ({ RecurrencePicker: () => null }));
jest.mock('../components/TimezonePickerField', () => ({ TimezonePickerField: () => null }));
jest.mock('../components/ScheduleAccessSection', () => ({ ScheduleAccessSection: () => null }));
jest.mock('@/src/features/model-picker/components/ModelPickerSheet', () => ({
  ModelPickerSheet: () => null,
}));
jest.mock('@/src/features/model-picker/service', () => ({
  getDisplayName: (model: string) => model,
}));
jest.mock('@/src/shared/hooks/useUnsavedChangesGuard', () => ({
  useUnsavedChangesGuard: jest.fn(),
}));

import { ScheduleForm } from '../components/ScheduleForm';
import { fetchSchedules } from '../service';
import { isoToZonedTimeInput } from '../timing';

const ONCE_INSTANT = '2099-11-20T18:30:45.000Z';

function onceTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    userId: 'user-1',
    name: 'Launch brief',
    description: null,
    scheduleType: 'once',
    cronExpression: null,
    executeAt: ONCE_INSTANT,
    intervalMs: null,
    timezone: 'UTC',
    isEnabled: true,
    expiresAt: null,
    maxExecutions: null,
    executionCount: 0,
    actionType: 'agent',
    actionConfig: null,
    prompt: 'Brief me',
    model: 'auto',
    status: 'active',
    lastExecutedAt: null,
    nextExecutionAt: ONCE_INSTANT,
    lastError: null,
    metadata: { productRecurrence: 'once', timeOfDay: '09:00' },
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    agentId: null,
    connectors: null,
    ...overrides,
  };
}

describe('one-time schedule clock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads the clock of a one-time schedule from its execution instant', async () => {
    mockGet.mockResolvedValue({
      schedules: [onceTask(), onceTask({ id: 'task-2', timezone: 'Asia/Kolkata' })],
      pagination: { limit: 50, offset: 0 },
    });
    const [utc, kolkata] = await fetchSchedules();
    expect(utc?.timeOfDay).toBe('18:30');
    expect(kolkata?.timeOfDay).toBe('00:00');
  });

  it('keeps the metadata clock for recurring schedules', async () => {
    mockGet.mockResolvedValue({
      schedules: [
        onceTask({
          scheduleType: 'cron',
          cronExpression: '30 18 * * *',
          executeAt: null,
          metadata: { productRecurrence: 'daily', timeOfDay: '07:15' },
        }),
      ],
      pagination: { limit: 50, offset: 0 },
    });
    const [daily] = await fetchSchedules();
    expect(daily?.timeOfDay).toBe('07:15');
  });

  it('resubmits the original instant when only the name changes', async () => {
    mockGet.mockResolvedValue({
      schedules: [onceTask()],
      pagination: { limit: 50, offset: 0 },
    });
    const [schedule] = await fetchSchedules();
    const onSubmit = jest.fn();
    const view = render(
      <ScheduleForm initialData={schedule} onSubmit={onSubmit} onCancel={jest.fn()} />,
    );
    fireEvent.changeText(view.getByDisplayValue('Launch brief'), 'Renamed brief');
    fireEvent.press(view.getByText('Save Changes'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      name: 'Renamed brief',
      recurrence: 'once',
      scheduledAt: ONCE_INSTANT,
      timezone: 'UTC',
    });
  });

  it('formats the wall clock in the saved timezone', () => {
    expect(isoToZonedTimeInput(ONCE_INSTANT, 'America/Chicago')).toBe('12:30');
    expect(isoToZonedTimeInput(null, 'UTC')).toBe('');
  });
});
