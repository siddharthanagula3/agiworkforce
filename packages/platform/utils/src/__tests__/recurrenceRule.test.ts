import { describe, expect, it } from 'vitest';
import { normalizeRecurrenceRule, parseRecurrenceRule } from '../scheduling/recurrence-rule';

const NOW = new Date('2026-10-17T08:30:00Z');

describe('bounded recurrence normalization', () => {
  it('adds an anchor to an unanchored rule', () => {
    expect(normalizeRecurrenceRule('FREQ=DAILY;BYHOUR=9;BYMINUTE=15', 'UTC', NOW)).toBe(
      'DTSTART:20261017T083000\nRRULE:FREQ=DAILY;BYHOUR=9;BYMINUTE=15',
    );
  });

  it('preserves an existing case-insensitive, indented CRLF anchor and its time zone', () => {
    const input = '\t dtstart;TZID=America/Chicago:20261015T090000\r\n rrule:freq=weekly;byday=mo';
    const normalized = normalizeRecurrenceRule(input, 'America/Chicago', NOW);
    expect(normalized).toBe('DTSTART:20261015T090000\nRRULE:FREQ=WEEKLY;BYDAY=MO');
    expect(parseRecurrenceRule(normalized, 'America/Chicago').start.hour).toBe(9);
  });

  it('refuses an oversized newline attack before scanning for an anchor', () => {
    expect(() =>
      normalizeRecurrenceRule(`RRULE:FREQ=DAILY${'\n'.repeat(100_000)}X`, 'UTC', NOW),
    ).toThrow('Recurrence rule is too long');
  });

  it('keeps duplicate and malformed anchor rejection', () => {
    for (const input of [
      'DTSTART:20261017T080000\nDTSTART:20261017T090000\nRRULE:FREQ=DAILY',
      'DTSTART_BOGUS:20261017T080000\nRRULE:FREQ=DAILY',
    ]) {
      expect(() => normalizeRecurrenceRule(input, 'UTC', NOW)).toThrow();
    }
  });
});
