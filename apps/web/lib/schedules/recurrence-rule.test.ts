import { describe, expect, it } from 'vitest';

import {
  RecurrenceRuleError,
  describeRecurrenceRule,
  nextRecurrenceOccurrence,
  normalizeRecurrenceRule,
  parseRecurrenceRule,
} from './recurrence-rule';
import {
  NoFurtherOccurrenceError,
  assertDeliverableCadence,
  getNextExecutionAt,
} from './schedule-time';

function next(rule: string, timezone: string, after: string): string | null {
  return (
    nextRecurrenceOccurrence(
      parseRecurrenceRule(rule, timezone),
      timezone,
      new Date(after),
    )?.toISOString() ?? null
  );
}

function occurrences(rule: string, timezone: string, after: string, count: number): string[] {
  const parsed = parseRecurrenceRule(rule, timezone);
  const result: string[] = [];
  let cursor = new Date(after);
  for (let index = 0; index < count; index += 1) {
    const value = nextRecurrenceOccurrence(parsed, timezone, cursor);
    if (!value) break;
    result.push(value.toISOString());
    cursor = value;
  }
  return result;
}

describe('parseRecurrenceRule', () => {
  it('reads DTSTART and the supported RRULE parts', () => {
    const rule = parseRecurrenceRule(
      'DTSTART:20260901T090000\nRRULE:FREQ=MONTHLY;INTERVAL=2;BYDAY=-1FR;BYHOUR=9,17;BYMINUTE=30',
      'UTC',
    );
    expect(rule).toMatchObject({
      freq: 'MONTHLY',
      interval: 2,
      byDay: [{ weekday: 5, ordinal: -1 }],
      byHour: [9, 17],
      byMinute: [30],
      start: { year: 2026, month: 9, day: 1, hour: 9, minute: 0 },
    });
  });

  it('rejects parts the scheduler cannot honour instead of ignoring them', () => {
    expect(() => parseRecurrenceRule('DTSTART:20260901T090000\nRRULE:FREQ=YEARLY', 'UTC')).toThrow(
      RecurrenceRuleError,
    );
    expect(() =>
      parseRecurrenceRule('DTSTART:20260901T090000\nRRULE:FREQ=DAILY;BYSETPOS=1', 'UTC'),
    ).toThrow('BYSETPOS is not supported');
    expect(() =>
      parseRecurrenceRule('DTSTART:20260901T090000\nRRULE:FREQ=WEEKLY;BYDAY=1MO', 'UTC'),
    ).toThrow('only valid with FREQ=MONTHLY');
    expect(() =>
      parseRecurrenceRule(
        'DTSTART:20260901T090000\nRRULE:FREQ=DAILY;COUNT=2;UNTIL=20261001',
        'UTC',
      ),
    ).toThrow('COUNT or UNTIL');
    expect(() =>
      parseRecurrenceRule('DTSTART;TZID=Europe/Paris:20260901T090000\nRRULE:FREQ=DAILY', 'UTC'),
    ).toThrow('must match the schedule time zone');
  });

  it('anchors a rule without DTSTART at the local creation time', () => {
    const normalized = normalizeRecurrenceRule(
      'RRULE:FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0',
      'America/New_York',
      new Date('2026-09-17T15:04:00.000Z'),
    );
    expect(normalized).toBe(
      'DTSTART:20260917T110400\nRRULE:FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0',
    );
  });
});

describe('nextRecurrenceOccurrence', () => {
  it('fires every other week on the listed weekdays in the schedule time zone', () => {
    expect(
      occurrences(
        'DTSTART:20260907T000000\nRRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;BYHOUR=9;BYMINUTE=0',
        'America/New_York',
        '2026-09-07T00:00:00.000Z',
        4,
      ),
    ).toEqual([
      '2026-09-07T13:00:00.000Z',
      '2026-09-10T13:00:00.000Z',
      '2026-09-21T13:00:00.000Z',
      '2026-09-24T13:00:00.000Z',
    ]);
  });

  it('finds the last Friday of the month', () => {
    expect(
      occurrences(
        'DTSTART:20260101T170000\nRRULE:FREQ=MONTHLY;BYDAY=-1FR',
        'UTC',
        '2026-09-01T00:00:00.000Z',
        3,
      ),
    ).toEqual(['2026-09-25T17:00:00.000Z', '2026-10-30T17:00:00.000Z', '2026-11-27T17:00:00.000Z']);
  });

  it('counts negative month days from the end of each month', () => {
    expect(
      occurrences(
        'DTSTART:20260101T080000\nRRULE:FREQ=MONTHLY;BYMONTHDAY=-1',
        'UTC',
        '2027-01-15T00:00:00.000Z',
        2,
      ),
    ).toEqual(['2027-01-31T08:00:00.000Z', '2027-02-28T08:00:00.000Z']);
  });

  it('steps hourly rules from the DTSTART hour', () => {
    expect(
      occurrences(
        'DTSTART:20260917T010000\nRRULE:FREQ=HOURLY;INTERVAL=6;BYMINUTE=15',
        'UTC',
        '2026-09-17T02:00:00.000Z',
        3,
      ),
    ).toEqual(['2026-09-17T07:15:00.000Z', '2026-09-17T13:15:00.000Z', '2026-09-17T19:15:00.000Z']);
  });

  it('never fires before DTSTART or after UNTIL', () => {
    expect(
      next('DTSTART:20261001T090000\nRRULE:FREQ=DAILY', 'UTC', '2026-09-01T00:00:00.000Z'),
    ).toBe('2026-10-01T09:00:00.000Z');
    expect(
      next(
        'DTSTART:20260901T090000\nRRULE:FREQ=DAILY;UNTIL=20260903T090000Z',
        'UTC',
        '2026-09-03T09:00:00.000Z',
      ),
    ).toBeNull();
  });

  it('skips a wall time that does not exist on a daylight saving change', () => {
    expect(
      next(
        'DTSTART:20260301T023000\nRRULE:FREQ=DAILY',
        'America/New_York',
        '2026-03-08T00:00:00.000Z',
      ),
    ).toBe('2026-03-09T06:30:00.000Z');
  });
});

describe('recurrence rules in the schedule timing', () => {
  it('reports an exhausted rule as having no further occurrence', () => {
    expect(() =>
      getNextExecutionAt(
        {
          scheduleType: 'rrule',
          recurrenceRule: 'DTSTART:20260901T090000\nRRULE:FREQ=DAILY;UNTIL=20260902',
          timezone: 'UTC',
        },
        new Date('2026-09-05T00:00:00.000Z'),
      ),
    ).toThrow(NoFurtherOccurrenceError);
  });

  it('refuses a rule that fires faster than the sweep', () => {
    expect(() =>
      assertDeliverableCadence(
        {
          scheduleType: 'rrule',
          recurrenceRule: 'DTSTART:20260901T090000\nRRULE:FREQ=DAILY;BYMINUTE=0,5',
          timezone: 'UTC',
        },
        new Date('2026-09-17T00:00:00.000Z'),
      ),
    ).toThrow('recurrence rule cannot fire more often');
  });

  it('gives event-only tasks no clock occurrence', () => {
    expect(() =>
      getNextExecutionAt({ scheduleType: 'event', timezone: 'UTC' }, new Date()),
    ).toThrow(NoFurtherOccurrenceError);
  });
});

describe('describeRecurrenceRule', () => {
  it('reads a rule back in words', () => {
    expect(
      describeRecurrenceRule(
        'DTSTART:20260901T000000\nRRULE:FREQ=MONTHLY;BYDAY=1MO;BYHOUR=9;BYMINUTE=0',
        'UTC',
      ),
    ).toBe('Every month on the 1st Monday at 09:00');
    expect(describeRecurrenceRule('not a rule', 'UTC')).toBe('Custom rule');
  });
});
