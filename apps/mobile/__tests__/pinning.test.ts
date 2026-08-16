import {
  PINS_BY_HOST,
  PINNING_ENFORCED,
  assertPinningReadyIfEnforced,
  hasPlaceholderPins,
  hasPlaceholderPinForUrl,
  hostHasPins,
  pinningStartupState,
  pinsAreProvisionedForUrl,
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

describe('PINS_BY_HOST', () => {
  it('is frozen (immutable)', () => {
    expect(Object.isFrozen(PINS_BY_HOST)).toBe(true);
  });

  it.each([
    'agiworkforce.com',
    'signaling.agiworkforce.com',
    'api.agiworkforce.com',
    'api.openai.com',
    'api.anthropic.com',
  ])('declares entry for %s', (host) => {
    expect(Object.prototype.hasOwnProperty.call(PINS_BY_HOST, host)).toBe(true);
    const pins = PINS_BY_HOST[host as keyof typeof PINS_BY_HOST] as ReadonlyArray<string>;
    expect(pins.length).toBeGreaterThanOrEqual(2);
  });
});

describe('PINNING_ENFORCED', () => {
  it('is false until ops provisions real SPKI pins (#387)', () => {
    expect(PINNING_ENFORCED).toBe(false);
  });
});

describe('startup pinning guard (P0-FIX 2026-05-29: release builds must LAUNCH, not crash)', () => {
  it('detects placeholder pins so the startup guard can warn', () => {
    expect(hasPlaceholderPins()).toBe(true);
  });

  it('release build with enforcement off is "disabled" and does NOT throw', () => {
    expect(() => pinningStartupState({ isDev: false, isTest: false })).not.toThrow();
    expect(pinningStartupState({ isDev: false, isTest: false })).toBe('disabled');
  });

  it('dev and test builds skip the guard (state "dev-or-test")', () => {
    expect(pinningStartupState({ isDev: true, isTest: false })).toBe('dev-or-test');
    expect(pinningStartupState({ isDev: false, isTest: true })).toBe('dev-or-test');
  });

  it('importing lib/pinning (runs the startup check at module load) does not crash', () => {
    expect(() => {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.isolateModules requires a synchronous require to re-evaluate the module's load-time guard.
        require('@/lib/pinning');
      });
    }).not.toThrow();
  });
});

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

describe('provisioned pin checks', () => {
  it('detects placeholder pins for a known host', () => {
    expect(hasPlaceholderPinForUrl('https://agiworkforce.com/')).toBe(true);
  });

  it('does not treat placeholder pins as provisioned', () => {
    expect(pinsAreProvisionedForUrl('https://agiworkforce.com/')).toBe(false);
  });

  it('does not treat unknown hosts as provisioned', () => {
    expect(pinsAreProvisionedForUrl('https://example.com/')).toBe(false);
  });
});

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

describe('secureFetch (smoke)', () => {
  it('passes through to fetch while enforcement is off (#387)', async () => {
    const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue(fakeOk());
    const res = await secureFetch('https://agiworkforce.com/api/test');
    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

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
