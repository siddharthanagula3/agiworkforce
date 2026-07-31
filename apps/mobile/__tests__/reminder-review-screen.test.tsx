/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert, Platform } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockCreateIOSReminder = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockParams: { title?: string; due?: string } = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ canGoBack: () => true, back: mockBack, replace: mockReplace }),
}));

jest.mock('../src/features/reminders/service', () => {
  const actual = jest.requireActual('../src/features/reminders/service');
  return {
    ...actual,
    createIOSReminder: (input: unknown) => mockCreateIOSReminder(input),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  const icon = () => <Text>icon</Text>;
  return {
    ArrowLeft: icon,
    Bell: icon,
    CalendarDays: icon,
    Clock3: icon,
    ShieldCheck: icon,
  };
});

import ReminderReviewScreen from '../src/features/reminders';
import { ReminderCreationError } from '../src/features/reminders/service';

const originalOS = Platform.OS;

beforeEach(() => {
  Object.defineProperty(Platform, 'OS', { get: () => 'ios', configurable: true });
  mockParams.title = 'Call the dentist';
  mockParams.due = new Date(2031, 4, 6, 14, 7).toISOString();
  mockCreateIOSReminder.mockResolvedValue('reminder-id');
});

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { get: () => originalOS, configurable: true });
  delete mockParams.title;
  delete mockParams.due;
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('Apple Reminder review screen', () => {
  it('prefills Siri details and writes only after the explicit Create Reminder action', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const screen = render(<ReminderReviewScreen />);

    expect(screen.getByDisplayValue('Call the dentist')).toBeTruthy();
    expect(screen.getByDisplayValue('2031-05-06')).toBeTruthy();
    expect(screen.getByDisplayValue('14:07')).toBeTruthy();
    expect(screen.getByText(/does not send it to a model/i)).toBeTruthy();
    expect(mockCreateIOSReminder).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Create Reminder'));

    await waitFor(() => {
      expect(mockCreateIOSReminder).toHaveBeenCalledWith({
        title: 'Call the dentist',
        due: expect.objectContaining({ allDay: false }),
      });
    });
    expect(alert).toHaveBeenCalledWith(
      'Reminder Created',
      'The reviewed reminder was added to Apple Reminders.',
      expect.any(Array),
    );
  });

  it('shows a settings recovery action when Reminders permission is denied', async () => {
    mockCreateIOSReminder.mockRejectedValue(
      new ReminderCreationError(
        'permission-denied',
        'Allow Reminders access in Settings to create this reminder.',
      ),
    );
    const alert = jest.spyOn(Alert, 'alert');
    const screen = render(<ReminderReviewScreen />);

    fireEvent.press(screen.getByLabelText('Create Reminder'));

    await waitFor(() => {
      expect(screen.getByText(/Allow Reminders access in Settings/)).toBeTruthy();
    });
    expect(alert).toHaveBeenCalledWith(
      'Reminders Access Needed',
      'Allow Reminders access in Settings to create this reminder.',
      expect.arrayContaining([expect.objectContaining({ text: 'Open Settings' })]),
    );
  });
});
