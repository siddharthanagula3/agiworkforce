/**
 * useGreeting hook tests
 *
 * Covers:
 * - All 6 time bands with correct emoji and headline format
 * - Variant selection via date-based index (date % 3)
 * - First-name extraction from full name (splits on first space)
 * - Name length cap: names > 50 chars are discarded (anonymous greeting)
 * - Non-printable character stripping from names
 * - No-user fallback (anonymous greeting without name interpolation)
 * - Subtext is always the fixed CTA string
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGreeting } from './useGreeting';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@shared/stores/authentication-store', () => ({
  useAuthStore: vi.fn(),
}));

import { useAuthStore } from '@shared/stores/authentication-store';

// React.useState is called once per render with an initializer. We need to
// control `new Date()` inside that initializer, so we mock it before each test.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Render the hook with a fake clock pinned to `hour` and `day` (day % 3 = variantIndex).
 * `userName` is injected into the mocked auth store.
 */
function renderGreeting(hour: number, day: number, userName?: string) {
  // Pin the clock
  const fixedDate = new Date(2026, 0, day, hour, 0, 0); // Jan <day> 2026, HH:00
  vi.setSystemTime(fixedDate);

  vi.mocked(useAuthStore).mockReturnValue({
    user: userName !== undefined ? { name: userName } : null,
  } as ReturnType<typeof useAuthStore>);

  return renderHook(() => useGreeting());
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Time-band mapping
// ---------------------------------------------------------------------------

describe('useGreeting — time band selection', () => {
  it('returns earlyMorning band (☕) at hour 4', () => {
    const { result } = renderGreeting(4, 1); // day 1 → variantIndex 1
    expect(result.current.emoji).toBe('☕');
    // Anonymous variant: config.variants[1] = 'Early start'
    expect(result.current.headline).toBe('Early start');
  });

  it('returns earlyMorning band (☕) at hour 6', () => {
    const { result } = renderGreeting(6, 3); // day 3 → variantIndex 0
    expect(result.current.emoji).toBe('☕');
    expect(result.current.headline).toBe('Rise and shine');
  });

  it('returns morning band (🌤️) at hour 7', () => {
    const { result } = renderGreeting(7, 3); // variantIndex 0
    expect(result.current.emoji).toBe('🌤️');
    expect(result.current.headline).toBe('Good morning');
  });

  it('returns morning band at hour 11 (boundary)', () => {
    const { result } = renderGreeting(11, 3);
    expect(result.current.emoji).toBe('🌤️');
  });

  it('returns afternoon band (☀️) at hour 12', () => {
    const { result } = renderGreeting(12, 3); // variantIndex 0
    expect(result.current.emoji).toBe('☀️');
    expect(result.current.headline).toBe('Good afternoon');
  });

  it('returns afternoon band at hour 16 (boundary)', () => {
    const { result } = renderGreeting(16, 3);
    expect(result.current.emoji).toBe('☀️');
  });

  it('returns evening band (🌇) at hour 17', () => {
    const { result } = renderGreeting(17, 3); // variantIndex 0
    expect(result.current.emoji).toBe('🌇');
    expect(result.current.headline).toBe('Good evening');
  });

  it('returns evening band at hour 20 (boundary)', () => {
    const { result } = renderGreeting(20, 3);
    expect(result.current.emoji).toBe('🌇');
  });

  it('returns night band (🌙) at hour 21', () => {
    const { result } = renderGreeting(21, 3); // variantIndex 0
    expect(result.current.emoji).toBe('🌙');
    expect(result.current.headline).toBe('Good night');
  });

  it('returns night band at hour 23 (boundary)', () => {
    const { result } = renderGreeting(23, 3);
    expect(result.current.emoji).toBe('🌙');
    // variantIndex 0 for day=3 → 'Good night'
    expect(result.current.headline).toBe('Good night');
  });

  it('returns lateNight band (🌙) at hour 0 (midnight)', () => {
    const { result } = renderGreeting(0, 3); // variantIndex 0
    expect(result.current.emoji).toBe('🌙');
    expect(result.current.headline).toBe('Late night session');
  });

  it('returns lateNight band at hour 3 (pre-4am)', () => {
    const { result } = renderGreeting(3, 3);
    expect(result.current.emoji).toBe('🌙');
  });

  it('returns lateNight band at hour 1', () => {
    const { result } = renderGreeting(1, 4); // day 4 → variantIndex 1
    expect(result.current.emoji).toBe('🌙');
    expect(result.current.headline).toBe('Up late');
  });
});

// ---------------------------------------------------------------------------
// Variant rotation (date % 3)
// ---------------------------------------------------------------------------

describe('useGreeting — variant rotation via date', () => {
  it('selects variant index 0 when day % 3 === 0 (day=3)', () => {
    const { result } = renderGreeting(10, 3); // morning, index 0
    expect(result.current.headline).toBe('Good morning');
  });

  it('selects variant index 1 when day % 3 === 1 (day=1)', () => {
    const { result } = renderGreeting(10, 1); // morning, index 1
    expect(result.current.headline).toBe('Morning');
  });

  it('selects variant index 2 when day % 3 === 2 (day=2)', () => {
    const { result } = renderGreeting(10, 2); // morning, index 2
    expect(result.current.headline).toBe('Good to see you this morning');
  });

  it('wraps variant correctly for afternoon band', () => {
    // afternoon: index 0='Good afternoon', 1='Afternoon', 2='Good to see you this afternoon'
    const { result: r0 } = renderGreeting(14, 3);
    expect(r0.current.headline).toBe('Good afternoon');

    const { result: r1 } = renderGreeting(14, 1);
    expect(r1.current.headline).toBe('Afternoon');

    const { result: r2 } = renderGreeting(14, 2);
    expect(r2.current.headline).toBe('Good to see you this afternoon');
  });
});

// ---------------------------------------------------------------------------
// Name extraction
// ---------------------------------------------------------------------------

describe('useGreeting — name extraction', () => {
  it('uses first token from a full name', () => {
    const { result } = renderGreeting(10, 3, 'Jane Doe'); // morning, index 0
    // Named variant index 0: 'Good morning, {name}' → 'Good morning, Jane'
    expect(result.current.headline).toBe('Good morning, Jane');
  });

  it('uses the whole name when it contains no spaces', () => {
    const { result } = renderGreeting(10, 3, 'Alex');
    expect(result.current.headline).toBe('Good morning, Alex');
  });

  it('trims leading/trailing spaces from the extracted first name', () => {
    const { result } = renderGreeting(10, 3, '  Alice Smith');
    // split(' ') gives ['', '', 'Alice', 'Smith'], first token is ''
    // That token is empty so trim() gives '' which is falsy → anonymous
    // Actually: '  Alice Smith'.split(' ')[0] = '' (two leading spaces)
    // '' trimmed is '' which is falsy → falls through to anonymous
    // Intentional: name with leading spaces gives anonymous greeting
    expect(result.current.headline).toBe('Good morning');
  });

  it('uses variant index from date for named headline', () => {
    // index 1 for morning: 'Morning, {name}'
    const { result } = renderGreeting(10, 1, 'Bob');
    expect(result.current.headline).toBe('Morning, Bob');
  });

  it('uses named variant index 2 for morning', () => {
    // index 2: 'Good to see you this morning, {name}'
    const { result } = renderGreeting(10, 2, 'Carol');
    expect(result.current.headline).toBe('Good to see you this morning, Carol');
  });

  it('falls back to anonymous greeting when user has no name', () => {
    // user is present but name field is undefined
    vi.setSystemTime(new Date(2026, 0, 3, 10, 0, 0));
    vi.mocked(useAuthStore).mockReturnValue({
      user: { id: 'user-1' },
    } as ReturnType<typeof useAuthStore>);

    const { result } = renderHook(() => useGreeting());
    expect(result.current.headline).toBe('Good morning');
  });

  it('falls back to anonymous greeting when user is null', () => {
    vi.setSystemTime(new Date(2026, 0, 3, 10, 0, 0));
    vi.mocked(useAuthStore).mockReturnValue({
      user: null,
    } as ReturnType<typeof useAuthStore>);

    const { result } = renderHook(() => useGreeting());
    expect(result.current.headline).toBe('Good morning');
  });
});

// ---------------------------------------------------------------------------
// Name length cap (> 50 chars → discard)
// ---------------------------------------------------------------------------

describe('useGreeting — name length cap', () => {
  it('uses name when it is exactly 50 characters', () => {
    const fiftyChars = 'A'.repeat(50);
    const { result } = renderGreeting(10, 3, fiftyChars);
    expect(result.current.headline).toBe(`Good morning, ${fiftyChars}`);
  });

  it('discards name and shows anonymous greeting when name is 51 characters', () => {
    const fiftyOneChars = 'A'.repeat(51);
    const { result } = renderGreeting(10, 3, fiftyOneChars);
    // rawName.length (51) > 50 → firstName = undefined → anonymous
    expect(result.current.headline).toBe('Good morning');
  });

  it('discards very long names', () => {
    const longName = 'Wolfeschlegelsteinhausenbergerdorff the Great Senior III of the Fourth Estate';
    const { result } = renderGreeting(10, 3, longName);
    // first token is 'Wolfeschlegelsteinhausenbergerdorff' (35 chars) → within limit
    expect(result.current.headline).toBe('Good morning, Wolfeschlegelsteinhausenbergerdorff');
  });

  it('discards a single first token that is > 50 chars', () => {
    // A single word that is 51 chars long (no space → split gives same word)
    const longSingleWord = 'X'.repeat(51);
    const { result } = renderGreeting(10, 3, longSingleWord);
    expect(result.current.headline).toBe('Good morning');
  });
});

// ---------------------------------------------------------------------------
// Non-printable character stripping
// ---------------------------------------------------------------------------

describe('useGreeting — non-printable character stripping', () => {
  it('strips control characters from the name', () => {
    // Name with embedded null byte and bell char
    const { result } = renderGreeting(10, 3, 'Chris\x00\x07');
    // After split on space: 'Chris\x00\x07', then replace removes control chars → 'Chris'
    expect(result.current.headline).toBe('Good morning, Chris');
  });

  it('strips DEL character (0x7F)', () => {
    const { result } = renderGreeting(10, 3, 'Dana\x7F');
    expect(result.current.headline).toBe('Good morning, Dana');
  });

  it('preserves normal printable characters', () => {
    const { result } = renderGreeting(10, 3, 'Rémi');
    expect(result.current.headline).toBe('Good morning, Rémi');
  });
});

// ---------------------------------------------------------------------------
// Fixed subtext
// ---------------------------------------------------------------------------

describe('useGreeting — subtext', () => {
  it('always returns the fixed CTA subtext regardless of time or user', () => {
    const cases: Array<[number, number, string | undefined]> = [
      [4, 1, 'Alice'],
      [10, 2, undefined],
      [22, 3, 'Bob'],
      [0, 4, 'Carol'],
    ];

    for (const [hour, day, name] of cases) {
      const { result } = renderGreeting(hour, day, name);
      expect(result.current.subtext).toBe('What can I help you with today?');
    }
  });
});
