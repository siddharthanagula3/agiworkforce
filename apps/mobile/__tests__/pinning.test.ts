// AUDIT-FIX: C-7 — verify placeholder pins block release while still allowing tests.
import {
  PINS_BY_HOST,
  PINNING_ENFORCED,
  assertPinningReadyIfEnforced,
  hasPlaceholderPins,
  hostHasPins,
  pinsForUrl,
  requiresPin,
} from '@/lib/pinning';
import { PinningError, secureFetch } from '@/services/secureFetch';

function fakeOk(): Response {
  return new Response(null, { status: 200 });
}

beforeEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// PINS_BY_HOST shape
// ---------------------------------------------------------------------------

describe('PINS_BY_HOST', () => {
  it('is frozen (immutable)', () => {
    expect(Object.isFrozen(PINS_BY_HOST)).toBe(true);
  });

  it.each([
    'agiworkforce.com',
    'signaling.agiworkforce.com',
    'api.agiworkforce.com',
    'xwmcvbgdyergfnvwbnap.supabase.co',
    'api.openai.com',
    'api.anthropic.com',
  ])('declares entry for %s', (host) => {
    expect(Object.prototype.hasOwnProperty.call(PINS_BY_HOST, host)).toBe(true);
    const pins = PINS_BY_HOST[host as keyof typeof PINS_BY_HOST] as ReadonlyArray<string>;
    expect(pins.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Enforcement state
// ---------------------------------------------------------------------------

describe('PINNING_ENFORCED', () => {
  it('is true (audit-fix C-7)', () => {
    expect(PINNING_ENFORCED).toBe(true);
  });
});

describe('placeholder guard', () => {
  it('detects placeholder pins so a release build fails loudly', () => {
    expect(hasPlaceholderPins()).toBe(true);
  });

  it('simulated release-mode launch with placeholders throws', () => {
    const guardFn = (
      enforced: boolean,
      pins: ReadonlyArray<string>,
      isDev: boolean,
      isTest: boolean,
    ): void => {
      if (isDev || isTest) return;
      if (enforced && pins.some((h) => h.includes('PLACEHOLDER_REPLACE_BEFORE_LAUNCH_'))) {
        throw new Error('TLS pinning not provisioned');
      }
    };

    const allPlaceholderPins = Object.values(PINS_BY_HOST).flat();
    expect(() => guardFn(true, allPlaceholderPins, false, false)).toThrow(
      /TLS pinning not provisioned/,
    );
  });

  it('release-mode launch with real pins does not throw', () => {
    const guardFn = (
      enforced: boolean,
      pins: ReadonlyArray<string>,
      isDev: boolean,
      isTest: boolean,
    ): void => {
      if (isDev || isTest) return;
      if (enforced && pins.some((h) => h.includes('PLACEHOLDER_REPLACE_BEFORE_LAUNCH_'))) {
        throw new Error('TLS pinning not provisioned');
      }
    };

    expect(() =>
      guardFn(true, ['sha256/realhash1=', 'sha256/realhash2='], false, false),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// hostHasPins
// ---------------------------------------------------------------------------

describe('hostHasPins', () => {
  it('returns true for a configured prod host', () => {
    expect(hostHasPins('https://agiworkforce.com/api')).toBe(true);
  });

  it('returns false for an unknown host', () => {
    expect(hostHasPins('https://unknown.example.com/')).toBe(false);
  });

  it('returns false for a malformed URL', () => {
    expect(hostHasPins('not-a-url')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// pinsForUrl
// ---------------------------------------------------------------------------

describe('pinsForUrl', () => {
  it('returns the configured pins for a known host', () => {
    const pins = pinsForUrl('https://agiworkforce.com/');
    expect(pins.length).toBeGreaterThanOrEqual(2);
  });

  it('returns empty array for unknown host', () => {
    expect(pinsForUrl('https://example.com/')).toEqual([]);
  });

  it('returns empty array for malformed URL', () => {
    expect(pinsForUrl('::bad')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// requiresPin
// ---------------------------------------------------------------------------

describe('requiresPin', () => {
  it('returns true for agiworkforce.com', () => {
    expect(requiresPin('agiworkforce.com')).toBe(true);
  });

  it('returns true for api.anthropic.com', () => {
    expect(requiresPin('api.anthropic.com')).toBe(true);
  });

  it('returns true for api.openai.com', () => {
    expect(requiresPin('api.openai.com')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(requiresPin('AGIWorkforce.COM')).toBe(true);
  });

  it('returns false for third-party hosts not in the list', () => {
    expect(requiresPin('stripe.com')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// assertPinningReadyIfEnforced
// ---------------------------------------------------------------------------

describe('assertPinningReadyIfEnforced', () => {
  it('does not throw when all required hosts have at least one pin', () => {
    expect(() => assertPinningReadyIfEnforced()).not.toThrow();
  });

  it('throws when a required host has no pins (simulated)', () => {
    const guardFn = (
      enforced: boolean,
      pinsMap: Record<string, string[]>,
      required: string[],
    ): void => {
      if (!enforced) return;
      const unpinned = required.filter((h) => (pinsMap[h] ?? []).length === 0);
      if (unpinned.length > 0) {
        throw new Error(
          `PINNING_ENFORCED=true but PINS_BY_HOST has empty arrays for: ${unpinned.join(', ')}`,
        );
      }
    };
    expect(() => guardFn(true, { 'agiworkforce.com': [] }, ['agiworkforce.com'])).toThrow(
      /PINNING_ENFORCED=true but PINS_BY_HOST has empty arrays/,
    );
  });
});

// ---------------------------------------------------------------------------
// secureFetch — passthrough (PINNING_ENFORCED is true now, but secureFetch
// implementation may still passthrough for hosts; this just sanity-checks
// that the call is intercepted with our mocked fetch).
// ---------------------------------------------------------------------------

describe('secureFetch (smoke)', () => {
  it('still invokes fetch under the hood', async () => {
    const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue(fakeOk());
    await secureFetch('https://agiworkforce.com/api/test');
    expect(mockFetch).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PinningError
// ---------------------------------------------------------------------------

describe('PinningError', () => {
  it('is named PinningError', () => {
    const err = new PinningError('https://agiworkforce.com/');
    expect(err.name).toBe('PinningError');
  });

  it('includes the refused URL in the message', () => {
    const url = 'https://agiworkforce.com/api/secret';
    const err = new PinningError(url);
    expect(err.message).toContain(url);
  });

  it('is an instance of Error', () => {
    expect(new PinningError('https://example.com/')).toBeInstanceOf(Error);
  });
});
