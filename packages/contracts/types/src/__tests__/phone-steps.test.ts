import { describe, expect, it } from 'vitest';
import {
  MAX_PHONE_STEP_LOCATION_LENGTH,
  MAX_PHONE_STEP_NOTES_LENGTH,
  MAX_PHONE_STEP_RANGE_DAYS,
  MAX_PHONE_STEP_TITLE_LENGTH,
  PHONE_STEP_CAPABILITY,
  PhoneStepRefused,
  describePhoneStep,
  formatPhoneStepTime,
  isPhoneCapability,
  isPhoneStepTool,
  isPhoneWriteStep,
  parsePhoneStepTime,
  phoneStepNeedsConfirmation,
  phoneStepStakes,
  planPhoneStep,
} from '../phone-steps';

const start = '2026-10-02T15:00:00Z';
const end = '2026-10-02T16:00:00Z';

describe('phone step permissions and planning', () => {
  it('requires confirmation for writes and explicit review while keeping read capabilities separate', () => {
    expect(isPhoneStepTool('device_calendar_events')).toBe(true);
    expect(isPhoneStepTool('unknown')).toBe(false);
    expect(isPhoneCapability('calendar.read')).toBe(true);
    expect(isPhoneCapability('calendar.admin')).toBe(false);
    expect(PHONE_STEP_CAPABILITY.device_calendar_events).toBe('calendar.read');
    expect(PHONE_STEP_CAPABILITY.device_calendar_create_event).toBe('calendar.write');
    expect(isPhoneWriteStep('device_calendar_events')).toBe(false);
    expect(phoneStepNeedsConfirmation('device_calendar_create_event', {})).toBe(true);
    expect(phoneStepNeedsConfirmation('device_reminder_create', null)).toBe(true);
    expect(
      phoneStepNeedsConfirmation('device_calendar_events', { review: ' Show the dates ' }),
    ).toBe(true);
    for (const input of [null, [], { review: true }, { review: '  ' }])
      expect(phoneStepNeedsConfirmation('device_calendar_events', input)).toBe(false);
  });

  it.each(['device_calendar_events', 'device_calendar_availability'])(
    'plans a bounded calendar read for %s',
    (tool) => {
      expect(planPhoneStep(tool, { start, end })).toEqual({ tool, start, end });
      expect(phoneStepStakes(tool, { start, end })).toEqual([]);
      const maxEnd = new Date(
        Date.parse(start) + MAX_PHONE_STEP_RANGE_DAYS * 86_400_000,
      ).toISOString();
      expect(planPhoneStep(tool, { start, end: maxEnd })).toEqual({ tool, start, end: maxEnd });
      const tooFar = new Date(Date.parse(maxEnd) + 1).toISOString();
      expect(() => planPhoneStep(tool, { start, end: tooFar })).toThrow(PhoneStepRefused);
    },
  );

  it.each([
    ['unknown', {}],
    ['device_calendar_events', { end }],
    ['device_calendar_events', { start }],
    ['device_calendar_events', { start: 1, end }],
    ['device_calendar_events', { start: 'invalid', end }],
    ['device_calendar_events', { start, end: start }],
    ['device_calendar_events', { start: end, end: start }],
    ['device_reminder_create', {}],
    ['device_reminder_create', { title: 1 }],
    ['device_reminder_create', { title: '  ' }],
    ['device_reminder_create', { title: 'x'.repeat(MAX_PHONE_STEP_TITLE_LENGTH + 1) }],
    ['device_reminder_create', { title: 'Reminder', notes: false }],
    [
      'device_reminder_create',
      { title: 'Reminder', notes: 'x'.repeat(MAX_PHONE_STEP_NOTES_LENGTH + 1) },
    ],
    ['device_reminder_create', { title: 'Reminder', due: 'invalid' }],
    ['device_calendar_create_event', { title: 'Event', start }],
    ['device_calendar_create_event', { title: 'Event', start: '2026-10-02', end: '2026-10-03' }],
    [
      'device_calendar_create_event',
      { title: 'Event', start, end, location: 'x'.repeat(MAX_PHONE_STEP_LOCATION_LENGTH + 1) },
    ],
  ])('refuses malformed or unsupported planning input %#', (tool, args) => {
    expect(() => planPhoneStep(tool as string, args as Record<string, unknown>)).toThrow(
      PhoneStepRefused,
    );
    expect(phoneStepStakes(tool as string, args as Record<string, unknown>)).toEqual([]);
  });

  it('plans reminders and timed or all-day events without fabricating optional values', () => {
    expect(
      planPhoneStep('device_reminder_create', { title: '  Follow up  ', notes: null, due: '' }),
    ).toEqual({ tool: 'device_reminder_create', title: 'Follow up' });
    expect(
      planPhoneStep('device_reminder_create', {
        title: 'Follow up',
        notes: ' Bring notes ',
        due: end,
      }),
    ).toEqual({
      tool: 'device_reminder_create',
      title: 'Follow up',
      notes: 'Bring notes',
      due: end,
    });
    expect(
      planPhoneStep('device_calendar_create_event', {
        title: ' Review ',
        start,
        end,
        location: ' Room 1 ',
        notes: ' Bring notes ',
      }),
    ).toEqual({
      tool: 'device_calendar_create_event',
      title: 'Review',
      start,
      end,
      location: 'Room 1',
      notes: 'Bring notes',
    });
    expect(
      planPhoneStep('device_calendar_create_event', {
        title: 'Review',
        start: '2026-10-02',
        allDay: true,
      }),
    ).toEqual({
      tool: 'device_calendar_create_event',
      title: 'Review',
      start: '2026-10-02',
      allDay: true,
    });
  });

  it('shows the exact mutation stakes and describes read and write requests', () => {
    const reminder = planPhoneStep('device_reminder_create', {
      title: 'Follow up',
      due: end,
      notes: 'Bring notes',
    });
    expect(phoneStepStakes(reminder.tool, { ...reminder })).toEqual([
      { kind: 'item', label: 'Reminder', value: 'Follow up' },
      { kind: 'item', label: 'Due', value: expect.any(String) },
      { kind: 'item', label: 'Notes', value: 'Bring notes' },
    ]);
    expect(
      phoneStepStakes('device_calendar_create_event', {
        title: 'Review',
        start,
        end,
        location: 'Room 1',
        notes: 'Bring notes',
      }).map((stake) => stake.label),
    ).toEqual(['Event', 'Starts', 'Ends', 'Where', 'Notes']);
    expect(
      phoneStepStakes('device_calendar_create_event', {
        title: 'Review',
        start: '2026-10-02',
        end: '2026-10-03',
        allDay: true,
      }).map((stake) => stake.label),
    ).toEqual(['Event', 'Date']);
    expect(describePhoneStep({ tool: 'device_calendar_events', start, end })).toBe(
      `Read your calendar from ${start.replace('T', ' ')} to ${end.replace('T', ' ')}`,
    );
    expect(describePhoneStep({ tool: 'device_calendar_availability', start, end })).toContain(
      'Check when you are free',
    );
    expect(
      describePhoneStep({ tool: 'device_calendar_create_event', title: 'Review', start }),
    ).toContain('Add "Review" to your calendar');
    expect(describePhoneStep(reminder)).toContain('due');
    expect(describePhoneStep({ tool: 'device_reminder_create', title: 'Follow up' })).toBe(
      'Add the reminder "Follow up"',
    );
  });

  it('parses explicit offsets and local times without accepting non-date input', () => {
    expect(parsePhoneStepTime(start)?.toISOString()).toBe(start.replace('Z', '.000Z'));
    const local = new Date(2026, 9, 2, 15, 7);
    expect(formatPhoneStepTime(local)).toBe('2026-10-02T15:07');
    expect(parsePhoneStepTime(formatPhoneStepTime(local))?.getTime()).toBe(local.getTime());
    expect(parsePhoneStepTime('2026-10-02')).not.toBeNull();
    expect(parsePhoneStepTime('2026-10-02T15:00+99:99')).toBeNull();
    expect(parsePhoneStepTime('tomorrow')).toBeNull();
  });
});
