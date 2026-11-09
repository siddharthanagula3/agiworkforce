import { Platform } from 'react-native';

const mockGetRemindersPermissions = jest.fn();
const mockRequestRemindersPermissions = jest.fn();
const mockCreateReminder = jest.fn();

jest.mock('expo-calendar/legacy', () => ({
  getRemindersPermissionsAsync: () => mockGetRemindersPermissions(),
  requestRemindersPermissionsAsync: () => mockRequestRemindersPermissions(),
  createReminderAsync: (calendarId: string | null, reminder: unknown) =>
    mockCreateReminder(calendarId, reminder),
}));

import {
  createIOSReminder,
  parseReminderDueInputs,
  reminderDueInputsFromISO,
  ReminderCreationError,
} from '../src/features/reminders/service';

const originalOS = Platform.OS;

function setPlatform(os: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
}

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { get: () => originalOS, configurable: true });
  jest.clearAllMocks();
});

describe('Apple Reminders service', () => {
  it('parses undated, all-day, and timed reminder inputs without natural-language guessing', () => {
    const now = new Date(2030, 0, 2, 8, 0);
    expect(parseReminderDueInputs('', '', now)).toBeNull();

    const allDay = parseReminderDueInputs('2030-01-03', '', now);
    expect(allDay?.allDay).toBe(true);
    expect(allDay?.dueDate.getFullYear()).toBe(2030);
    expect(allDay?.dueDate.getMonth()).toBe(0);
    expect(allDay?.dueDate.getDate()).toBe(3);

    const timed = parseReminderDueInputs('2030-01-03', '09:45', now);
    expect(timed?.allDay).toBe(false);
    expect(timed?.dueDate.getHours()).toBe(9);
    expect(timed?.dueDate.getMinutes()).toBe(45);
  });

  it('rejects malformed, impossible, and past dates before requesting permission', () => {
    const now = new Date(2030, 0, 2, 8, 0);
    expect(() => parseReminderDueInputs('', '09:00', now)).toThrow('Add a date');
    expect(() => parseReminderDueInputs('2030-02-30', '', now)).toThrow('valid calendar date');
    expect(() => parseReminderDueInputs('2030-01-01', '', now)).toThrow('future date');
    expect(() => parseReminderDueInputs('2030-01-02', '07:59', now)).toThrow(
      'future date and time',
    );
  });

  it('normalizes a valid Siri ISO due date into editable local inputs', () => {
    const local = new Date(2031, 4, 6, 14, 7, 0, 0);
    expect(reminderDueInputsFromISO(local.toISOString())).toEqual({
      dateInput: '2031-05-06',
      timeInput: '14:07',
      instant: local,
    });
    expect(reminderDueInputsFromISO('not-a-date')).toEqual({
      dateInput: '',
      timeInput: '',
      instant: null,
    });
  });

  it('keeps the exact Siri instant when the reviewed date and time are unchanged', () => {
    const now = new Date(2031, 0, 1, 8, 0);
    const siri = new Date(2031, 4, 6, 14, 7, 42, 500);
    const prefill = reminderDueInputsFromISO(siri.toISOString());

    const unchanged = parseReminderDueInputs(
      ` ${prefill.dateInput} `,
      prefill.timeInput,
      now,
      prefill,
    );
    expect(unchanged).toEqual({ dueDate: siri, allDay: false });

    const edited = parseReminderDueInputs(prefill.dateInput, '14:08', now, prefill);
    expect(edited?.dueDate).toEqual(new Date(2031, 4, 6, 14, 8, 0, 0));

    const allDay = parseReminderDueInputs(prefill.dateInput, '', now, prefill);
    expect(allDay?.allDay).toBe(true);

    expect(() =>
      parseReminderDueInputs(prefill.dateInput, prefill.timeInput, new Date(2032, 0, 1), prefill),
    ).toThrow('future date and time');
  });

  it('requests permission on explicit create and saves one timed reminder with an alarm', async () => {
    setPlatform('ios');
    mockGetRemindersPermissions.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    mockRequestRemindersPermissions.mockResolvedValue({ status: 'granted', canAskAgain: true });
    mockCreateReminder.mockResolvedValue('reminder-id');
    const dueDate = new Date(2032, 3, 5, 9, 30);

    await expect(
      createIOSReminder({ title: '  Call the dentist  ', due: { dueDate, allDay: false } }),
    ).resolves.toBe('reminder-id');

    expect(mockRequestRemindersPermissions).toHaveBeenCalledTimes(1);
    expect(mockCreateReminder).toHaveBeenCalledWith(null, {
      title: 'Call the dentist',
      dueDate,
      allDay: false,
      alarms: [{ absoluteDate: dueDate.toISOString() }],
    });
  });

  it('uses an all-day due date without inventing a notification time', async () => {
    setPlatform('ios');
    mockGetRemindersPermissions.mockResolvedValue({ status: 'granted', canAskAgain: true });
    mockCreateReminder.mockResolvedValue('all-day-id');
    const dueDate = new Date(2032, 3, 5, 12, 0);

    await createIOSReminder({ title: 'File taxes', due: { dueDate, allDay: true } });

    expect(mockRequestRemindersPermissions).not.toHaveBeenCalled();
    expect(mockCreateReminder).toHaveBeenCalledWith(null, {
      title: 'File taxes',
      dueDate,
      allDay: true,
    });
  });

  it('fails closed when permission is denied and does not write anything', async () => {
    setPlatform('ios');
    mockGetRemindersPermissions.mockResolvedValue({ status: 'denied', canAskAgain: false });

    await expect(createIOSReminder({ title: 'Private reminder', due: null })).rejects.toMatchObject<
      Partial<ReminderCreationError>
    >({ code: 'permission-denied' });
    expect(mockRequestRemindersPermissions).not.toHaveBeenCalled();
    expect(mockCreateReminder).not.toHaveBeenCalled();
  });

  describe('local clock changes', () => {
    const MINUTE_MS = 60_000;

    function findTransition(
      towardEarlierClock: boolean,
    ): { at: number; shiftMinutes: number } | null {
      const end = new Date(2031, 0, 1).getTime();
      for (let time = new Date(2030, 0, 1).getTime(); time < end; time += 60 * MINUTE_MS) {
        const before = new Date(time).getTimezoneOffset();
        const after = new Date(time + 60 * MINUTE_MS).getTimezoneOffset();
        if (before === after || after > before !== towardEarlierClock) continue;
        let at = time + 15 * MINUTE_MS;
        while (new Date(at).getTimezoneOffset() === before) at += 15 * MINUTE_MS;
        return { at, shiftMinutes: Math.abs(after - before) };
      }
      return null;
    }

    function wallFields(at: number, deltaMinutes: number): { date: string; time: string } {
      const local = new Date(at);
      const wall = new Date(
        Date.UTC(
          local.getFullYear(),
          local.getMonth(),
          local.getDate(),
          local.getHours(),
          local.getMinutes(),
        ) +
          deltaMinutes * MINUTE_MS,
      );
      const pad = (value: number) => String(value).padStart(2, '0');
      return {
        date: `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}`,
        time: `${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}`,
      };
    }

    const now = new Date(2029, 0, 1);
    const springForward = findTransition(false);
    const fallBack = findTransition(true);
    // llm-guardrail-allow: clock-change cases need a runner timezone that observes daylight saving
    const itWithClockChanges = springForward && fallBack ? it : it.skip;

    itWithClockChanges('rejects a typed time that the clock change skips', () => {
      const { at, shiftMinutes } = springForward!;
      const skipped = wallFields(at, -shiftMinutes / 2);
      expect(() => parseReminderDueInputs(skipped.date, skipped.time, now)).toThrow(
        expect.objectContaining({ code: 'time-nonexistent' }),
      );
    });

    itWithClockChanges('asks for another time when a typed time happens twice', () => {
      const { at, shiftMinutes } = fallBack!;
      const repeated = wallFields(at, shiftMinutes / 2);
      expect(() => parseReminderDueInputs(repeated.date, repeated.time, now)).toThrow(
        expect.objectContaining({ code: 'time-ambiguous' }),
      );
    });

    itWithClockChanges('preserves each Siri instant inside a repeated local hour', () => {
      const { at, shiftMinutes } = fallBack!;
      const first = new Date(at + (shiftMinutes / 2 - shiftMinutes) * MINUTE_MS);
      const second = new Date(at + (shiftMinutes / 2) * MINUTE_MS);
      const firstPrefill = reminderDueInputsFromISO(first.toISOString());
      const secondPrefill = reminderDueInputsFromISO(second.toISOString());
      expect(firstPrefill.dateInput).toBe(secondPrefill.dateInput);
      expect(firstPrefill.timeInput).toBe(secondPrefill.timeInput);

      expect(
        parseReminderDueInputs(firstPrefill.dateInput, firstPrefill.timeInput, now, firstPrefill)
          ?.dueDate,
      ).toEqual(first);
      expect(
        parseReminderDueInputs(secondPrefill.dateInput, secondPrefill.timeInput, now, secondPrefill)
          ?.dueDate,
      ).toEqual(second);
    });
  });

  it('never calls the iOS Reminder APIs on Android', async () => {
    setPlatform('android');

    await expect(createIOSReminder({ title: 'Fallback', due: null })).rejects.toMatchObject<
      Partial<ReminderCreationError>
    >({ code: 'unsupported-platform' });
    expect(mockGetRemindersPermissions).not.toHaveBeenCalled();
    expect(mockCreateReminder).not.toHaveBeenCalled();
  });
});
