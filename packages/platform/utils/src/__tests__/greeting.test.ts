import { describe, it, expect } from 'vitest';
import {
  GREETING_BAND_GROUP,
  greetingFirstName,
  greetingHeadline,
  greetingTimeBand,
  greetingVariantIndex,
  resolveGreetingHeadline,
} from '../greeting';

describe('greeting time bands', () => {
  it.each([
    [4, 'earlyMorning'],
    [6, 'earlyMorning'],
    [7, 'morning'],
    [11, 'morning'],
    [12, 'afternoon'],
    [16, 'afternoon'],
    [17, 'evening'],
    [20, 'evening'],
    [21, 'night'],
    [23, 'night'],
    [0, 'lateNight'],
    [3, 'lateNight'],
  ] as const)('hour %i falls in the %s band', (hour, band) => {
    expect(greetingTimeBand(hour)).toBe(band);
  });

  it('collapses the six bands onto the three localized groups', () => {
    expect(GREETING_BAND_GROUP.earlyMorning).toBe('morning');
    expect(GREETING_BAND_GROUP.night).toBe('evening');
    expect(GREETING_BAND_GROUP.lateNight).toBe('evening');
  });
});

describe('greeting variants', () => {
  it('rotates one of three variants by day of month', () => {
    expect(greetingVariantIndex(3)).toBe(0);
    expect(greetingVariantIndex(1)).toBe(1);
    expect(greetingVariantIndex(2)).toBe(2);
  });

  it('renders the named template when a first name is known', () => {
    expect(greetingHeadline('morning', 1, 'Bob')).toBe('Morning, Bob');
    expect(greetingHeadline('morning', 1)).toBe('Morning');
  });
});

describe('greeting first name', () => {
  it('takes the first token of a full name', () => {
    expect(greetingFirstName('Jane Doe')).toBe('Jane');
  });

  it('drops a name whose first token is longer than the display cap', () => {
    expect(greetingFirstName('X'.repeat(51))).toBeUndefined();
  });

  it('drops a leading space rather than greeting an empty name', () => {
    expect(greetingFirstName('  Alice Smith')).toBeUndefined();
  });

  it('strips control characters and keeps printable punctuation', () => {
    expect(greetingFirstName('Chris\u0000\u0007')).toBe('Chris');
    expect(greetingFirstName("O'Brien")).toBe("O'Brien");
    expect(greetingFirstName('Mary-Jane')).toBe('Mary-Jane');
  });

  it('is absent when no name is known', () => {
    expect(greetingFirstName(null)).toBeUndefined();
    expect(greetingFirstName(undefined)).toBeUndefined();
  });
});

describe('resolveGreetingHeadline', () => {
  it('joins clock, rotation and name into one headline', () => {
    expect(resolveGreetingHeadline(new Date(2026, 0, 1, 10, 0, 0), 'Bob Smith')).toBe(
      'Morning, Bob',
    );
    expect(resolveGreetingHeadline(new Date(2026, 0, 3, 22, 0, 0))).toBe('Good evening');
  });
});
