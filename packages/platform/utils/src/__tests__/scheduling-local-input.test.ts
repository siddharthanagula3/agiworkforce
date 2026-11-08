import { describe, expect, it } from 'vitest';
import { isoToZonedLocalInput, zonedLocalInputToIso } from '../scheduling/local-input';

describe('schedule local input', () => {
  it('converts a chosen zone independently of the process timezone', () => {
    expect(zonedLocalInputToIso('2026-07-15T09:30', 'America/New_York')).toBe(
      '2026-07-15T13:30:00.000Z',
    );
    expect(isoToZonedLocalInput('2026-07-15T13:30:00.000Z', 'Asia/Tokyo')).toBe('2026-07-15T22:30');
  });
  it.each([
    ['2026-03-08T02:30', 'does not exist'],
    ['2026-11-01T01:30', 'occurs twice'],
    ['2026-02-30T09:30', 'valid local date'],
    ['2026-07-15', 'complete local date'],
  ])('rejects an invalid or ambiguous wall-clock value %s', (input, reason) => {
    expect(() => zonedLocalInputToIso(input, 'America/New_York')).toThrow(reason);
  });
  it('rejects invalid timezone names', () => {
    expect(() => zonedLocalInputToIso('2026-07-15T09:30', 'invalid-zone')).toThrow();
  });
  it('keeps empty and corrupt stored dates empty', () => {
    expect(isoToZonedLocalInput(null, 'UTC')).toBe('');
    expect(isoToZonedLocalInput('not-a-date', 'UTC')).toBe('');
  });
});
