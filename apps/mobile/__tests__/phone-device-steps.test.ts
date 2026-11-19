import { Platform } from 'react-native';
import { MAX_DEVICE_STEP_OUTPUT_LENGTH } from '@agiworkforce/cloud-contracts';

const mockGetCalendars = jest.fn();
const mockGetEvents = jest.fn();
const mockCalendarPermission = jest.fn();
const mockGetDefaultCalendar = jest.fn();
const mockCreateReminder = jest.fn();

jest.mock('expo-calendar/legacy', () => ({
  EntityTypes: { EVENT: 'event' },
  EventStatus: { CANCELED: 'canceled' },
  Availability: { FREE: 'free', BUSY: 'busy' },
  getCalendarPermissionsAsync: () => mockCalendarPermission(),
  requestCalendarPermissionsAsync: () => mockCalendarPermission(),
  getCalendarsAsync: () => mockGetCalendars(),
  getEventsAsync: (...args: unknown[]) => mockGetEvents(...args),
  getDefaultCalendarAsync: () => mockGetDefaultCalendar(),
  getRemindersPermissionsAsync: () => mockCalendarPermission(),
  requestRemindersPermissionsAsync: () => mockCalendarPermission(),
  createReminderAsync: (...args: unknown[]) => mockCreateReminder(...args),
}));

jest.mock('@/lib/deviceId', () => ({ getDeviceId: async () => 'this-phone' }));

import {
  PHONE_STEP_DECLINED,
  runPhoneDeviceStep,
} from '../src/features/integrations/services/phoneDeviceSteps';

function availability(start: string, end: string) {
  return runPhoneDeviceStep({
    toolCallId: 'call-1',
    name: 'device_calendar_availability',
    deviceId: 'this-phone',
    input: { start, end },
  });
}

function separateEvents(count: number) {
  const first = new Date(2030, 0, 2, 0, 0).getTime();
  return Array.from({ length: count }, (_, index) => {
    const startMs = first + index * 2 * 60 * 60 * 1000;
    return {
      id: `event-${index}`,
      calendarId: 'cal',
      title: `Event ${index}`,
      startDate: new Date(startMs).toISOString(),
      endDate: new Date(startMs + 60 * 60 * 1000).toISOString(),
      status: 'confirmed',
      availability: 'busy',
    };
  });
}

const originalOS = Platform.OS;

beforeEach(() => {
  mockGetCalendars.mockResolvedValue([{ id: 'cal', title: 'Home' }]);
  mockCalendarPermission.mockResolvedValue({ granted: true, canAskAgain: true });
});

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { get: () => originalOS, configurable: true });
  jest.clearAllMocks();
});

describe('phone step outcomes name the device neutrally', () => {
  it('says the user declined on their device', () => {
    expect(PHONE_STEP_DECLINED.content).toBe(
      'The user declined this on their device, so nothing was added.',
    );
  });

  it('points to the device Settings app when calendar access is off', async () => {
    mockCalendarPermission.mockResolvedValue({ granted: false, canAskAgain: false });

    const outcome = await availability('2030-01-02T00:00', '2030-01-03T00:00');

    expect(outcome).toEqual({
      content:
        "Calendar access is off for AGI Mobile on this device, so nothing was read or added. The user can turn it on for AGI Mobile in the device's Settings app.",
      isError: true,
    });
  });

  it('does not run a step meant for another device', async () => {
    const outcome = await runPhoneDeviceStep({
      toolCallId: 'call-2',
      name: 'device_calendar_availability',
      deviceId: 'another-phone',
      input: { start: '2030-01-02T00:00', end: '2030-01-03T00:00' },
    });

    expect(outcome).toEqual({
      content: 'This step was meant for another device, so this device did not run it.',
      isError: true,
    });
  });

  it('says when the device has no calendar an event can be added to', async () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'ios', configurable: true });
    mockGetDefaultCalendar.mockResolvedValue(null);

    const outcome = await runPhoneDeviceStep({
      toolCallId: 'call-3',
      name: 'device_calendar_create_event',
      deviceId: 'this-phone',
      input: { title: 'Lunch', start: '2030-01-02T12:00', end: '2030-01-02T13:00' },
    });

    expect(outcome).toEqual({
      content: 'There is no calendar on this device that events can be added to.',
      isError: true,
    });
  });

  it('reports a failed step as the device failing', async () => {
    mockGetEvents.mockRejectedValue(new Error('Calendar store unavailable'));

    const outcome = await availability('2030-01-02T00:00', '2030-01-03T00:00');

    expect(outcome).toEqual({
      content: 'The device could not complete this step: Calendar store unavailable',
      isError: true,
    });
  });

  it('says reminders are not available on an Android phone without naming an Apple device', async () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });

    const outcome = await runPhoneDeviceStep({
      toolCallId: 'call-4',
      name: 'device_reminder_create',
      deviceId: 'this-phone',
      input: { title: 'Call back' },
    });

    expect(outcome).toEqual({
      content: 'Reminders are not available on this device.',
      isError: true,
    });
    expect(outcome.content).not.toMatch(/iPhone|iPad|iOS|Siri|iCloud/);
  });

  it('adds the reminder on iOS instead of refusing it', async () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'ios', configurable: true });

    const outcome = await runPhoneDeviceStep({
      toolCallId: 'call-5',
      name: 'device_reminder_create',
      deviceId: 'this-phone',
      input: { title: 'Call back' },
    });

    expect(outcome).toEqual({ content: 'Added the reminder "Call back".', isError: false });
  });
});

describe('phone calendar availability result size', () => {
  it('returns busy and free spans when they fit the device result contract', async () => {
    mockGetEvents.mockResolvedValue(separateEvents(3));

    const outcome = await availability('2030-01-02T00:00', '2030-01-03T00:00');

    expect(outcome.isError).toBe(false);
    expect(outcome.content.length).toBeLessThanOrEqual(MAX_DEVICE_STEP_OUTPUT_LENGTH);
    expect(JSON.parse(outcome.content).busy).toHaveLength(3);
  });

  it('reports a too-dense range as an error instead of an oversized success', async () => {
    mockGetEvents.mockResolvedValue(separateEvents(500));

    const outcome = await availability('2030-01-02T00:00', '2030-02-01T00:00');

    expect(outcome.isError).toBe(true);
    expect(outcome.content.length).toBeLessThanOrEqual(MAX_DEVICE_STEP_OUTPUT_LENGTH);
    expect(outcome.content).toContain('shorter range');
    expect(outcome.content).not.toContain('"busy"');
  });
});
