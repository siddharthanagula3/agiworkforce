import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

const mockModelPicker = jest.fn().mockReturnValue(null);

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('lucide-react-native', () => ({
  ChevronDown: jest.fn().mockReturnValue(null),
}));

jest.mock('../stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: { hapticsEnabled: boolean }) => unknown) =>
    selector({ hapticsEnabled: false }),
}));

jest.mock('../src/features/model-picker/components/ModelPickerSheet', () => ({
  ModelPickerSheet: (props: unknown) => mockModelPicker(props),
}));

jest.mock('../src/features/model-picker/service', () => ({
  getDisplayName: (id: string) => id,
}));

import { ScheduleForm } from '../src/features/schedules/components/ScheduleForm';

describe('Mobile schedule form', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses only Cloud models and submits the exact displayed one-time instant', () => {
    const onSubmit = jest.fn();
    const screen = render(
      <ScheduleForm
        initialData={{
          name: 'Investor follow-up',
          prompt: 'Summarize the launch feedback.',
          model: 'auto',
          recurrence: 'once',
          scheduledAt: '2030-07-15T13:30:00.000Z',
          timeOfDay: '09:30',
          timezone: 'America/New_York',
        }}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
      />,
    );

    expect(mockModelPicker).toHaveBeenCalledWith(expect.objectContaining({ modelScope: 'cloud' }));
    expect(screen.queryByLabelText('Recurrence: Custom')).toBeNull();
    expect(screen.queryByLabelText('Recurrence: Interval')).toBeNull();
    expect(screen.getByDisplayValue('2030-07-15')).toBeTruthy();
    expect(screen.getByLabelText('Schedules use saved prompt text only')).toBeTruthy();
    expect(
      screen.getByText(
        'Camera, Photos, Files, and chat attachments are not saved or reused when this schedule runs. Put essential context in the prompt.',
      ),
    ).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Create Schedule'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        recurrence: 'once',
        scheduledAt: '2030-07-15T13:30:00.000Z',
        timeOfDay: '09:30',
        timezone: 'America/New_York',
      }),
    );
    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty('attachments');
  });

  it('does not silently rewrite a legacy unsupported cadence when editing', () => {
    const onSubmit = jest.fn();
    const screen = render(
      <ScheduleForm
        initialData={{
          id: 'schedule-1',
          name: 'Legacy hourly task',
          prompt: 'Check the queue.',
          model: 'auto',
          recurrence: 'interval',
          intervalMs: 60 * 60_000,
          timeOfDay: '09:00',
          timezone: 'UTC',
          isActive: true,
        }}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByText(/legacy cadence is not deliverable/i)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Save Changes'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Choose Once, Daily, Weekly, or Monthly')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Recurrence: Daily'));
    fireEvent.press(screen.getByLabelText('Save Changes'));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ recurrence: 'daily' }));
  });
});
