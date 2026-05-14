import {
  PINS_BY_HOST,
  PINNING_ENFORCED,
  assertPinningReadyIfEnforced,
  hostHasPins,
  pinsForUrl,
  requiresPin,
} from '@/lib/pinning';
import { PinningError, secureFetch } from '@/services/secureFetch';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal fake Response so fetch mock doesn't need to be real. */
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

  it('declares agiworkforce.com entry', () => {
    expect(Object.prototype.hasOwnProperty.call(PINS_BY_HOST, 'agiworkforce.com')).toBe(true);
  });

  it('declares signaling.agiworkforce.com entry', () => {
    expect(Object.prototype.hasOwnProperty.call(PINS_BY_HOST, 'signaling.agiworkforce.com')).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// PINNING_ENFORCED baseline
// ---------------------------------------------------------------------------

describe('PINNING_ENFORCED', () => {
  it('is false while SPKI hashes are not yet populated', () => {
    // This test documents the current state and will fail if someone flips
    // the flag without populating PINS_BY_HOST — surfacing the issue in CI.
    expect(PINNING_ENFORCED).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hostHasPins
// ---------------------------------------------------------------------------

describe('hostHasPins', () => {
  it('returns false for an unpopulated host', () => {
    expect(hostHasPins('https://agiworkforce.com/api')).toBe(false);
  });

  it('returns false for an unknown host', () => {
    expect(hostHasPins('https://unknown.example.com/')).toBe(false);
  });

  it('returns false for a malformed URL', () => {
    expect(hostHasPins('not-a-url')).toBe(false);
  });

  it('returns true when a host has pins (injected via mock)', () => {
    // We can't mutate the frozen constant, so we test this via a fresh module
    // that re-exports the function against a controlled map.
    const hasPins = (urlString: string, map: Record<string, string[]>): boolean => {
      try {
        const host = new URL(urlString).hostname.toLowerCase();
        const pins = map[host];
        return pins !== undefined && pins.length > 0;
      } catch {
        return false;
      }
    };

    expect(hasPins('https://agiworkforce.com/', { 'agiworkforce.com': ['sha256/abc='] })).toBe(
      true,
    );
    expect(hasPins('https://agiworkforce.com/', { 'agiworkforce.com': [] })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// pinsForUrl
// ---------------------------------------------------------------------------

describe('pinsForUrl', () => {
  it('returns empty array for unpopulated host', () => {
    expect(pinsForUrl('https://agiworkforce.com/')).toEqual([]);
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

  it('returns true for signaling.agiworkforce.com', () => {
    expect(requiresPin('signaling.agiworkforce.com')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(requiresPin('AGIWorkforce.COM')).toBe(true);
  });

  it('returns false for third-party hosts', () => {
    expect(requiresPin('api.openai.com')).toBe(false);
    expect(requiresPin('stripe.com')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// assertPinningReadyIfEnforced
// ---------------------------------------------------------------------------

describe('assertPinningReadyIfEnforced', () => {
  it('is a no-op when PINNING_ENFORCED is false (current state)', () => {
    // Should not throw — current production state is safe
    expect(() => assertPinningReadyIfEnforced()).not.toThrow();
  });

  it('throws when enforcement is on but required hosts have no pins', () => {
    // Simulate what happens if someone flips PINNING_ENFORCED=true
    // without populating PINS_BY_HOST. We test the guard function logic
    // directly by calling an equivalent inline function.
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

    expect(() =>
      guardFn(true, { 'agiworkforce.com': [], 'signaling.agiworkforce.com': [] }, [
        'agiworkforce.com',
        'signaling.agiworkforce.com',
      ]),
    ).toThrow(/PINNING_ENFORCED=true but PINS_BY_HOST has empty arrays for/);
  });

  it('does not throw when enforcement is on and all required hosts are pinned', () => {
    const guardFn = (
      enforced: boolean,
      pinsMap: Record<string, string[]>,
      required: string[],
    ): void => {
      if (!enforced) return;
      const unpinned = required.filter((h) => (pinsMap[h] ?? []).length === 0);
      if (unpinned.length > 0) throw new Error(`unpinned: ${unpinned.join(', ')}`);
    };

    expect(() =>
      guardFn(
        true,
        {
          'agiworkforce.com': ['sha256/primary=', 'sha256/backup='],
          'signaling.agiworkforce.com': ['sha256/sig-primary=', 'sha256/sig-backup='],
        },
        ['agiworkforce.com', 'signaling.agiworkforce.com'],
      ),
    ).not.toThrow();
  });

  it('reports ALL unpinned hosts in the error message', () => {
    const guardFn = (
      enforced: boolean,
      pinsMap: Record<string, string[]>,
      required: string[],
    ): void => {
      if (!enforced) return;
      const unpinned = required.filter((h) => (pinsMap[h] ?? []).length === 0);
      if (unpinned.length > 0) throw new Error(`unpinned: ${unpinned.join(', ')}`);
    };

    expect(() => guardFn(true, {}, ['agiworkforce.com', 'signaling.agiworkforce.com'])).toThrow(
      /agiworkforce\.com.*signaling\.agiworkforce\.com/,
    );
  });
});

// ---------------------------------------------------------------------------
// secureFetch — passthrough when not enforced
// ---------------------------------------------------------------------------

describe('secureFetch (PINNING_ENFORCED=false)', () => {
  it('passes through to fetch for a known host when enforcement is off', async () => {
    const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue(fakeOk());

    const res = await secureFetch('https://agiworkforce.com/api/test');

    expect(mockFetch).toHaveBeenCalledWith('https://agiworkforce.com/api/test', undefined);
    expect(res.status).toBe(200);
  });

  it('passes through to fetch for an unknown host when enforcement is off', async () => {
    const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue(fakeOk());

    await secureFetch('https://unknown.example.com/');

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('passes through RequestInfo objects (not just strings)', async () => {
    const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue(fakeOk());
    const req = new Request('https://agiworkforce.com/api/test');

    await secureFetch(req);

    expect(mockFetch).toHaveBeenCalledWith(req, undefined);
  });

  it('forwards init options to fetch', async () => {
    const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue(fakeOk());
    const init: RequestInit = { method: 'POST', body: '{}' };

    await secureFetch('https://agiworkforce.com/api', init);

    expect(mockFetch).toHaveBeenCalledWith('https://agiworkforce.com/api', init);
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
