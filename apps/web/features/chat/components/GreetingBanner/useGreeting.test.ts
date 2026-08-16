
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGreeting } from './useGreeting';

const greetingMocks = vi.hoisted(() => ({
  canonicalUser: null as null | {
    name?: string;
    profile?: { preferred_name?: string | null };
  },
}));

vi.mock('@shared/stores/authentication-store', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (selector: (state: { user: typeof greetingMocks.canonicalUser }) => unknown) =>
    selector({ user: greetingMocks.canonicalUser }),
}));

import { useAuthStore } from '@shared/stores/authentication-store';

function renderGreeting(hour: number, day: number, userName?: string) {
  const fixedDate = new Date(2026, 0, day, hour, 0, 0);
  vi.setSystemTime(fixedDate);

  vi.mocked(useAuthStore).mockReturnValue({
    user: userName !== undefined ? { name: userName } : null,
  } as ReturnType<typeof useAuthStore>);

  return renderHook(() => useGreeting());
}

beforeEach(() => {
  vi.useFakeTimers();
  greetingMocks.canonicalUser = null;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useGreeting · time band selection', () => {
  it('uses the canonical /api/me preferred name on the first hydrated render', () => {
    vi.setSystemTime(new Date(2026, 0, 3, 10, 0, 0));
    greetingMocks.canonicalUser = {
      name: 'Canonical Full Name',
      profile: { preferred_name: 'Preferred' },
    };
    vi.mocked(useAuthStore).mockReturnValue({
      user: null,
    } as ReturnType<typeof useAuthStore>);

    const { result } = renderHook(() => useGreeting());

    expect(result.current.headline).toBe('Good morning, Preferred');
  });

  it('returns earlyMorning band at hour 4', () => {
    const { result } = renderGreeting(4, 1);
    expect(result.current.headline).toBe('Early start');
  });

  it('returns earlyMorning band at hour 6', () => {
    const { result } = renderGreeting(6, 3);
    expect(result.current.headline).toBe('Good morning');
  });

  it('returns morning band at hour 7', () => {
    const { result } = renderGreeting(7, 3);
    expect(result.current.headline).toBe('Good morning');
  });

  it('returns morning band at hour 11 (boundary)', () => {
    const { result } = renderGreeting(11, 3);
    expect(result.current.headline).toBe('Good morning');
  });

  it('returns afternoon band at hour 12', () => {
    const { result } = renderGreeting(12, 3);
    expect(result.current.headline).toBe('Good afternoon');
  });

  it('returns afternoon band at hour 16 (boundary)', () => {
    const { result } = renderGreeting(16, 3);
    expect(result.current.headline).toBe('Good afternoon');
  });

  it('returns evening band at hour 17', () => {
    const { result } = renderGreeting(17, 3);
    expect(result.current.headline).toBe('Good evening');
  });

  it('returns evening band at hour 20 (boundary)', () => {
    const { result } = renderGreeting(20, 3);
    expect(result.current.headline).toBe('Good evening');
  });

  it('returns night band at hour 21', () => {
    const { result } = renderGreeting(21, 3);
    expect(result.current.headline).toBe('Good evening');
  });

  it('returns night band at hour 23 (boundary)', () => {
    const { result } = renderGreeting(23, 3);
    expect(result.current.headline).toBe('Good evening');
  });

  it('returns lateNight band at hour 0 (midnight)', () => {
    const { result } = renderGreeting(0, 3);
    expect(result.current.headline).toBe('Good evening');
  });

  it('returns lateNight band at hour 3 (pre-4am)', () => {
    const { result } = renderGreeting(3, 3);
    expect(result.current.headline).toBe('Good evening');
  });

  it('returns lateNight band at hour 1', () => {
    const { result } = renderGreeting(1, 4);
    expect(result.current.headline).toBe('Up late');
  });
});

describe('useGreeting · variant rotation via date', () => {
  it('selects variant index 0 when day % 3 === 0 (day=3)', () => {
    const { result } = renderGreeting(10, 3);
    expect(result.current.headline).toBe('Good morning');
  });

  it('selects variant index 1 when day % 3 === 1 (day=1)', () => {
    const { result } = renderGreeting(10, 1);
    expect(result.current.headline).toBe('Morning');
  });

  it('selects variant index 2 when day % 3 === 2 (day=2)', () => {
    const { result } = renderGreeting(10, 2);
    expect(result.current.headline).toBe('Good to see you this morning');
  });

  it('wraps variant correctly for afternoon band', () => {
    const { result: r0 } = renderGreeting(14, 3);
    expect(r0.current.headline).toBe('Good afternoon');

    const { result: r1 } = renderGreeting(14, 1);
    expect(r1.current.headline).toBe('Afternoon');

    const { result: r2 } = renderGreeting(14, 2);
    expect(r2.current.headline).toBe('Good to see you this afternoon');
  });
});

describe('useGreeting · name extraction', () => {
  it('uses first token from a full name', () => {
    const { result } = renderGreeting(10, 3, 'Jane Doe');
    expect(result.current.headline).toBe('Good morning, Jane');
  });

  it('uses the whole name when it contains no spaces', () => {
    const { result } = renderGreeting(10, 3, 'Alex');
    expect(result.current.headline).toBe('Good morning, Alex');
  });

  it('trims leading/trailing spaces from the extracted first name', () => {
    const { result } = renderGreeting(10, 3, '  Alice Smith');
    expect(result.current.headline).toBe('Good morning');
  });

  it('uses variant index from date for named headline', () => {
    const { result } = renderGreeting(10, 1, 'Bob');
    expect(result.current.headline).toBe('Morning, Bob');
  });

  it('uses named variant index 2 for morning', () => {
    const { result } = renderGreeting(10, 2, 'Carol');
    expect(result.current.headline).toBe('Good to see you this morning, Carol');
  });

  it('falls back to anonymous greeting when user has no name', () => {
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

describe('useGreeting · name length cap', () => {
  it('uses name when it is exactly 50 characters', () => {
    const fiftyChars = `Aa${'b'.repeat(48)}`;
    expect(fiftyChars).toHaveLength(50);
    const { result } = renderGreeting(10, 3, fiftyChars);
    expect(result.current.headline).toBe(`Good morning, ${fiftyChars}`);
  });

  it('discards name and shows anonymous greeting when name is 51 characters', () => {
    const fiftyOneChars = 'A'.repeat(51);
    const { result } = renderGreeting(10, 3, fiftyOneChars);
    expect(result.current.headline).toBe('Good morning');
  });

  it('discards very long names', () => {
    const longName =
      'Wolfeschlegelsteinhausenbergerdorff the Great Senior III of the Fourth Estate';
    const { result } = renderGreeting(10, 3, longName);
    expect(result.current.headline).toBe('Good morning, Wolfeschlegelsteinhausenbergerdorff');
  });

  it('discards a single first token that is > 50 chars', () => {
    const longSingleWord = 'X'.repeat(51);
    const { result } = renderGreeting(10, 3, longSingleWord);
    expect(result.current.headline).toBe('Good morning');
  });
});

describe('useGreeting · non-printable character stripping', () => {
  it('strips control characters from the name', () => {
    const { result } = renderGreeting(10, 3, 'Chris\x00\x07');
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

  it("preserves apostrophes in names like O'Brien", () => {
    const { result } = renderGreeting(10, 3, "O'Brien");
    expect(result.current.headline).toBe("Good morning, O'Brien");
  });

  it('preserves hyphens in hyphenated first names like Mary-Jane', () => {
    const { result } = renderGreeting(10, 3, 'Mary-Jane');
    expect(result.current.headline).toBe('Good morning, Mary-Jane');
  });
});
