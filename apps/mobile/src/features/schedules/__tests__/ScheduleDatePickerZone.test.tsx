import React from 'react';
import { Platform } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

const mockOpen = jest.fn();

jest.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: () => jest.fn().mockReturnValue(null) }),
);
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: () => null,
  DateTimePickerAndroid: { open: (...args: unknown[]) => mockOpen(...args) },
}));

import { ScheduleDateTimeField } from '../components/ScheduleDateTimeField';
import { earliestPickerDateInZone } from '../timing';

const WITNESS_INSTANT = new Date('2026-11-09T01:00:00.000Z');
const originalOS = Platform.OS;

function localDay(date: Date): string {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].join('-');
}

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { get: () => originalOS, configurable: true });
  jest.clearAllMocks();
});

describe('earliestPickerDateInZone', () => {
  it('reads the calendar day of the schedule zone, not of the device', () => {
    expect(localDay(earliestPickerDateInZone('America/Los_Angeles', WITNESS_INSTANT))).toBe(
      '2026-11-8',
    );
    expect(localDay(earliestPickerDateInZone('Asia/Tokyo', WITNESS_INSTANT))).toBe('2026-11-9');
  });

  it('starts at the beginning of that day so every future hour of it stays selectable', () => {
    const earliest = earliestPickerDateInZone('America/Los_Angeles', WITNESS_INSTANT);
    expect([earliest.getHours(), earliest.getMinutes()]).toEqual([0, 0]);
  });

  it('falls back to the device day for a zone it cannot read', () => {
    expect(localDay(earliestPickerDateInZone('Not/AZone', WITNESS_INSTANT))).toBe(
      localDay(WITNESS_INSTANT),
    );
  });
});

describe('one-time date field minimum', () => {
  it('opens the Android picker no earlier than today in the selected zone', () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });
    jest.useFakeTimers().setSystemTime(WITNESS_INSTANT);
    try {
      const { getByRole } = render(
        <ScheduleDateTimeField
          mode="date"
          label="Date"
          value=""
          onChange={jest.fn()}
          timezone="America/Los_Angeles"
        />,
      );
      fireEvent.press(getByRole('button'));
      const options = mockOpen.mock.calls[0]?.[0] as { minimumDate: Date };
      expect(localDay(options.minimumDate)).toBe('2026-11-8');
    } finally {
      jest.useRealTimers();
    }
  });
});
