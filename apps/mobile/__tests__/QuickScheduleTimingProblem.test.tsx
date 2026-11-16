import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('@/src/features/voice/components/VoiceInputButton', () => ({
  VoiceInputButton: () => null,
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return { Zap: icon, X: icon, Plus: icon, ArrowUp: icon };
});

jest.mock('@/src/features/schedules/timing', () => ({
  ...jest.requireActual('@/src/features/schedules/timing'),
  zonedDateAndTimeToIso: jest.fn(),
}));

import { QuickSchedule } from '@/src/features/schedules/components/QuickSchedule';
import { useScheduleStore } from '@/src/features/schedules/store';
import { zonedDateAndTimeToIso } from '@/src/features/schedules/timing';

const SENTENCE = 'Pay rent on January 5 2031 at 9am';
const mockZoned = zonedDateAndTimeToIso as jest.Mock;

function openReviewSheet() {
  const utils = render(<QuickSchedule />);
  fireEvent.changeText(utils.getByLabelText('Schedule a task'), SENTENCE);
  fireEvent.press(utils.getByLabelText('Continue scheduling task'));
  fireEvent.press(utils.getAllByLabelText('Create schedule').at(-1)!);
  return utils;
}

describe('QuickSchedule one-time timing problems', () => {
  const createSchedule = jest.fn(async () => true);

  beforeEach(() => {
    createSchedule.mockClear();
    useScheduleStore.setState({ createSchedule });
  });

  it('shows the repeated local time sentence at a clock change and creates nothing', async () => {
    const repeated = 'This local time occurs twice because the clock changes for daylight saving.';
    mockZoned.mockImplementation(() => {
      throw new Error(repeated);
    });
    const utils = openReviewSheet();

    await waitFor(() => expect(utils.getByText(repeated)).toBeTruthy());
    expect(createSchedule).not.toHaveBeenCalled();
  });

  it('shows the skipped local time sentence', async () => {
    const skipped = 'This local time does not exist because the clock changes for daylight saving.';
    mockZoned.mockImplementation(() => {
      throw new Error(skipped);
    });
    const utils = openReviewSheet();

    await waitFor(() => expect(utils.getByText(skipped)).toBeTruthy());
  });

  it('shows the generic sentence for an engine error and never its text', async () => {
    mockZoned.mockImplementation(() => {
      throw new RangeError('Invalid time zone specified: Moon/Base');
    });
    const utils = openReviewSheet();

    await waitFor(() => expect(utils.getByText('Enter a valid date and time.')).toBeTruthy());
    expect(utils.queryByText(/Invalid time zone specified/)).toBeNull();
    expect(createSchedule).not.toHaveBeenCalled();
  });
});
