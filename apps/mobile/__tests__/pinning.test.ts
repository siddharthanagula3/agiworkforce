jest.mock('expo-constants', () => {
  const constants: { expoConfig: unknown } = { expoConfig: {} };
  return { __esModule: true, default: constants };
});

import fs from 'fs';
import os from 'os';
import path from 'path';
import Constants from 'expo-constants';
import {
  PINS_BY_HOST,
  PINNING_ENFORCED,
  PINNING_ROLLOUT,
  PINNING_STAGE,
  REQUIRED_PINNED_HOSTS,
  hasPlaceholderPins,
  hasPlaceholderPinForUrl,
  hostHasPins,
  pinningEnforcedFor,
  pinningStageFor,
  pinningStartupState,
  pinsAreProvisionedForUrl,
  pinsForUrl,
  requiresPin,
  type PinningStage,
} from '@/lib/pinning';
import { isDevOrTestRuntime, isReleaseRuntime } from '@/src/lib/runtimeMode';
import {
  PinningError,
  pinTransportFacts,
  pinTransportRefusal,
  pinTransportVerdict,
  redirectVerdict,
  reportsUnobservableFinalUrl,
  secureFetch,
  stagedRefusal,
  type PinTransportFacts,
} from '@/services/secureFetch';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the native pin generator is plain CommonJS so the Expo config plugin and this suite share one implementation.
const tlsPinConfig = require('../native/tlsPinConfig.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- same reason: the Expo config plugin is CommonJS.
const tlsPinPlugin = require('../native/withAGITlsPinning.cjs');
// The shipped pin table is all placeholders, so a provisioned build cannot be
// reached by any input. Spying on this module object drives the SHIPPED
// secureFetch into that state without replacing it with a mock.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- must be the same module instance the shipped secureFetch reads.
const pinningModule = require('@/lib/pinning') as typeof import('@/lib/pinning');

const MOBILE_ROOT = path.join(__dirname, '..');

const PIN_A = `sha256/${'A'.repeat(43)}=`;
const PIN_B = `sha256/${'B'.repeat(43)}=`;
const PIN_C = `sha256/${'C'.repeat(43)}=`;
const PLACEHOLDER_PIN = 'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_example=';

function readSource(...segments: string[]): string {
  return fs.readFileSync(path.join(MOBILE_ROOT, ...segments), 'utf8');
}

function foundersAssistanceEntry(marker: string): string {
  const doc = fs.readFileSync(
    path.join(MOBILE_ROOT, '..', '..', 'docs/work/founder-assistance.md'),
    'utf8',
  );
  return doc.split(/^## /m).find((section) => section.includes(marker)) ?? '';
}

function provisionedTable(): Record<string, string[]> {
  return Object.fromEntries(REQUIRED_PINNED_HOSTS.map((host) => [host, [PIN_A, PIN_B]]));
}

function fakeOk(): Response {
  return new Response(null, { status: 200 });
}

/**
 * Stands in for what native/withAGITlsPinning.cjs writes into the Expo config at
 * build time. Driving this instead of mocking @/lib/pinning is the point: every
 * enforcement assertion below runs the shipped pinning module and the shipped
 * pin table, with only the build artifact's own stamp substituted.
 */
function stampNativePins(hosts: readonly string[] | undefined): void {
  (Constants as unknown as { expoConfig: unknown }).expoConfig =
    hosts === undefined ? {} : { extra: { tlsPinning: { hosts } } };
}

beforeEach(() => {
  jest.restoreAllMocks();
  stampNativePins(undefined);
});

describe('PINS_BY_HOST', () => {
  it('is frozen (immutable)', () => {
    expect(Object.isFrozen(PINS_BY_HOST)).toBe(true);
  });

  it.each([
    'agiworkforce.com',
    'signaling.agiworkforce.com',
    'api.agiworkforce.com',
    'clerk.agiworkforce.com',
    'api.openai.com',
    'api.anthropic.com',
  ])('declares entry for %s', (host) => {
    expect(Object.prototype.hasOwnProperty.call(PINS_BY_HOST, host)).toBe(true);
    const pins = PINS_BY_HOST[host as keyof typeof PINS_BY_HOST] as ReadonlyArray<string>;
    expect(pins.length).toBeGreaterThanOrEqual(2);
  });
});

describe('every credential-bearing host is required (CWE-295 F6)', () => {
  it('pins the Clerk FAPI host, which issues the bearer token every other request carries', () => {
    expect(requiresPin('clerk.agiworkforce.com')).toBe(true);
    expect(pinsForUrl('https://clerk.agiworkforce.com/v1/client').length).toBeGreaterThanOrEqual(2);
  });

  it('cannot report enforcement while the auth handshake is unpinned', () => {
    const pins = provisionedTable();
    delete pins['clerk.agiworkforce.com'];
    expect(pinningEnforcedFor({ isDevOrTest: false, pins })).toBe(false);
  });
});

describe('enforcement is derived from provisioning (CWE-295 F6)', () => {
  const flipped = { isDevOrTest: false, rollout: 'enforced' } as const;

  it('turns on for a release build whose required hosts are all provisioned', () => {
    expect(pinningEnforcedFor({ ...flipped, pins: provisionedTable() })).toBe(true);
  });

  it('stays off while any required host still holds a placeholder', () => {
    const pins = provisionedTable();
    pins['api.agiworkforce.com'] = [PIN_A, PLACEHOLDER_PIN];
    expect(pinningEnforcedFor({ ...flipped, pins })).toBe(false);
  });

  it('stays off when a required host has no pins at all', () => {
    const pins = provisionedTable();
    delete pins['signaling.agiworkforce.com'];
    expect(pinningEnforcedFor({ ...flipped, pins })).toBe(false);
  });

  it('stays off when a pin is not a well-formed SHA-256 SPKI hash', () => {
    const pins = provisionedTable();
    pins['agiworkforce.com'] = [PIN_A, 'sha256/typo'];
    expect(pinningEnforcedFor({ ...flipped, pins })).toBe(false);
  });

  it('stays off in dev and test runtimes even with a fully provisioned table', () => {
    expect(pinningEnforcedFor({ ...flipped, isDevOrTest: true, pins: provisionedTable() })).toBe(
      false,
    );
  });

  it('is not a hardcoded literal in the shipped module', () => {
    const src = readSource('lib', 'pinning.ts');
    expect(src).not.toMatch(/export\s+const\s+PINNING_ENFORCED\s*=\s*(true|false)\s*;/);
    expect(src).toMatch(/export const PINNING_STAGE = pinningStageFor\(/);
    expect(src).toMatch(/export const PINNING_ENFORCED = PINNING_STAGE === 'enforced';/);
  });

  it('is therefore off in this build, because the shipped table is placeholders', () => {
    expect(hasPlaceholderPins()).toBe(true);
    expect(PINNING_ENFORCED).toBe(false);
  });
});

describe('provisioning the pins and turning pinning on are separate changes (CWE-295 F6)', () => {
  it('does not enforce on the paste alone, so six pasted hashes cannot flip the whole app', () => {
    expect(PINNING_ROLLOUT).not.toBe('enforced');
    expect(pinningStageFor({ isDevOrTest: false, pins: provisionedTable() })).toBe('report-only');
    expect(pinningEnforcedFor({ isDevOrTest: false, pins: provisionedTable() })).toBe(false);
  });

  it('enforces only once the rollout is flipped in its own change', () => {
    expect(
      pinningStageFor({ isDevOrTest: false, pins: provisionedTable(), rollout: 'enforced' }),
    ).toBe('enforced');
  });

  it('stages nothing while a required host is still a placeholder, however the rollout reads', () => {
    for (const rollout of ['off', 'report-only', 'enforced'] as const) {
      expect(pinningStageFor({ isDevOrTest: false, rollout })).toBe('off');
    }
  });

  it('stages nothing in dev and test runtimes, so a pin cannot break the local loop', () => {
    expect(
      pinningStageFor({ isDevOrTest: true, pins: provisionedTable(), rollout: 'enforced' }),
    ).toBe('off');
  });

  it('keeps the shipped rollout behind the pin table, which is what CI would gate on', () => {
    if (PINNING_ROLLOUT === 'enforced') expect(hasPlaceholderPins()).toBe(false);
    expect(PINNING_STAGE).toBe(pinningStageFor({ isDevOrTest: isDevOrTestRuntime() }));
  });
});

describe('runtime classification fails closed', () => {
  const globals = globalThis as { __DEV__?: boolean };

  function withRuntime<T>(dev: boolean | undefined, nodeEnv: string | undefined, run: () => T): T {
    const previousDev = globals.__DEV__;
    const previousEnv = process.env.NODE_ENV;
    const previousAppEnv = process.env.EXPO_PUBLIC_APP_ENV;
    globals.__DEV__ = dev;
    if (nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnv;
    delete process.env.EXPO_PUBLIC_APP_ENV;
    try {
      return run();
    } finally {
      globals.__DEV__ = previousDev;
      if (previousEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousEnv;
      if (previousAppEnv === undefined) delete process.env.EXPO_PUBLIC_APP_ENV;
      else process.env.EXPO_PUBLIC_APP_ENV = previousAppEnv;
    }
  }

  it('treats a release build with NODE_ENV unset as a release runtime', () => {
    expect(withRuntime(false, undefined, isReleaseRuntime)).toBe(true);
  });

  it('treats a release build with a non-production NODE_ENV as a release runtime', () => {
    expect(withRuntime(false, 'preview', isReleaseRuntime)).toBe(true);
  });

  it.each([
    ['__DEV__', true, undefined],
    ['NODE_ENV=test', false, 'test'],
  ])('treats %s as dev/test', (_label, dev, nodeEnv) => {
    expect(withRuntime(dev as boolean, nodeEnv as string | undefined, isDevOrTestRuntime)).toBe(
      true,
    );
  });
});

describe('startup pinning guard (release builds must LAUNCH, not crash)', () => {
  it('detects placeholder pins so the startup guard can warn', () => {
    expect(hasPlaceholderPins()).toBe(true);
  });

  it('reports a release build with placeholder pins as "unprovisioned", not "disabled"', () => {
    expect(() => pinningStartupState({ isDev: false, isTest: false })).not.toThrow();
    expect(pinningStartupState({ isDev: false, isTest: false })).toBe('unprovisioned');
  });

  it('dev and test builds skip the guard (state "dev-or-test")', () => {
    expect(pinningStartupState({ isDev: true, isTest: false })).toBe('dev-or-test');
    expect(pinningStartupState({ isDev: false, isTest: true })).toBe('dev-or-test');
  });

  it('reports a provisioned build that has not been flipped yet as "staged", not "ok"', () => {
    const pins = provisionedTable();
    expect(pinningStartupState({ isDev: false, isTest: false, pins })).toBe('staged');
    expect(pinningStartupState({ isDev: false, isTest: false, pins, rollout: 'off' })).toBe(
      'disabled',
    );
    expect(pinningStartupState({ isDev: false, isTest: false, pins, rollout: 'enforced' })).toBe(
      'ok',
    );
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

describe('a release runtime keeps the shipped build launchable', () => {
  it('derives enforcement as off there instead of throwing at import', () => {
    jest.isolateModules(() => {
      jest.doMock('@/src/lib/runtimeMode', () => ({
        isDevOrTestRuntime: () => false,
        isReleaseRuntime: () => true,
      }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.isolateModules needs a synchronous require to rebind the mocked runtime.
      const pinning = require('@/lib/pinning') as typeof import('@/lib/pinning');
      expect(pinning.PINNING_ENFORCED).toBe(false);
      expect(pinning.pinningStartupState({ isDev: false, isTest: false })).toBe('unprovisioned');
    });
    jest.dontMock('@/src/lib/runtimeMode');
  });
});

describe('secureFetch cleartext refusal (CWE-295 F6, shipped configuration)', () => {
  let mockFetch: jest.SpyInstance<ReturnType<typeof fetch>, Parameters<typeof fetch>>;

  beforeEach(() => {
    mockFetch = jest.spyOn(global, 'fetch');
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(fakeOk());
  });

  it.each([
    'http://agiworkforce.com/api/test',
    'http://api.agiworkforce.com/v1/chat',
    'http://signaling.agiworkforce.com/pairings/ABC/claim',
  ])('refuses %s with no network I/O', async (url) => {
    await expect(secureFetch(url)).rejects.toBeInstanceOf(PinningError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('reports the refusal as insecure-scheme', async () => {
    await expect(secureFetch('http://agiworkforce.com/api/test')).rejects.toMatchObject({
      reason: 'insecure-scheme',
    });
  });

  it('refuses a cleartext URL object for a pinned host', async () => {
    await expect(secureFetch(new URL('http://agiworkforce.com/api/test'))).rejects.toBeInstanceOf(
      PinningError,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('leaves unpinned hosts alone so local and BYOK endpoints keep working', async () => {
    await expect(secureFetch('http://localhost:8080/v1/models')).resolves.toEqual(
      expect.any(Response),
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('still passes https traffic to a pinned host through to fetch', async () => {
    const res = await secureFetch('https://agiworkforce.com/api/test');
    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('a pinned host reached in absolute form is refused (CWE-295 F6)', () => {
  let mockFetch: jest.SpyInstance<ReturnType<typeof fetch>, Parameters<typeof fetch>>;

  beforeEach(() => {
    mockFetch = jest.spyOn(global, 'fetch');
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(fakeOk());
  });

  it('resolves the trailing-dot spelling to the same pinned entry', () => {
    expect(hostHasPins('https://agiworkforce.com./api/test')).toBe(true);
    expect(pinsForUrl('https://api.agiworkforce.com./v1/chat').length).toBeGreaterThanOrEqual(2);
    expect(pinsAreProvisionedForUrl('https://api.agiworkforce.com./v1/chat')).toBe(false);
    expect(requiresPin('API.AGIWorkforce.com.')).toBe(true);
  });

  it.each([
    'https://api.agiworkforce.com./v1/chat',
    'http://agiworkforce.com./api/test',
    'https://agiworkforce.com../api/test',
  ])('refuses %s with no network I/O', async (url) => {
    await expect(secureFetch(url)).rejects.toBeInstanceOf(PinningError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('names the refusal so the spelling, not the scheme, is the reported cause', async () => {
    await expect(secureFetch('https://api.agiworkforce.com./v1/chat')).rejects.toMatchObject({
      reason: 'ambiguous-host',
    });
  });

  it('refuses it even in a build whose native config covers the canonical host', async () => {
    stampNativePins(['api.agiworkforce.com']);
    await inReleaseRuntime('production', async () => {
      await expect(secureFetch('https://api.agiworkforce.com./v1/chat')).rejects.toMatchObject({
        reason: 'ambiguous-host',
      });
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('leaves hosts outside the pin table alone in either spelling', async () => {
    await expect(secureFetch('https://byok.example.com./v1/chat')).resolves.toEqual(
      expect.any(Response),
    );
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

async function inReleaseRuntime<T>(nodeEnv: string | undefined, run: () => Promise<T>): Promise<T> {
  const globals = globalThis as { __DEV__?: boolean };
  const previousDev = globals.__DEV__;
  const previousEnv = process.env.NODE_ENV;
  globals.__DEV__ = false;
  if (nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = nodeEnv;
  try {
    return await run();
  } finally {
    globals.__DEV__ = previousDev;
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
  }
}

describe('the shipped secureFetch refuses a half-pinned release (CWE-295 F6)', () => {
  let mockFetch: jest.SpyInstance<ReturnType<typeof fetch>, Parameters<typeof fetch>>;

  beforeEach(() => {
    mockFetch = jest.spyOn(global, 'fetch');
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(fakeOk());
  });

  it.each([undefined, 'preview', 'production'])(
    'refuses a required host the native pin config left out (NODE_ENV=%s), with no network I/O',
    async (nodeEnv) => {
      stampNativePins(['agiworkforce.com']);
      await inReleaseRuntime(nodeEnv, async () => {
        await expect(secureFetch('https://api.agiworkforce.com/v1/chat')).rejects.toBeInstanceOf(
          PinningError,
        );
      });
      expect(mockFetch).not.toHaveBeenCalled();
    },
  );

  it('names the reason so a half-provisioned table is distinguishable from a missing plugin', async () => {
    stampNativePins(['agiworkforce.com']);
    await inReleaseRuntime('production', async () => {
      await expect(secureFetch('https://signaling.agiworkforce.com/ws')).rejects.toMatchObject({
        reason: 'unprovisioned-pins',
        url: 'https://signaling.agiworkforce.com/ws',
      });
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('allows the host the build actually stamped into extra.tlsPinning', async () => {
    stampNativePins(['  AGIWorkforce.com  ']);
    await inReleaseRuntime('production', async () => {
      await expect(secureFetch('https://agiworkforce.com/api/test')).resolves.toEqual(
        expect.any(Response),
      );
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('leaves hosts outside the pin table alone so local and BYOK endpoints keep working', async () => {
    stampNativePins(['agiworkforce.com']);
    await inReleaseRuntime('production', async () => {
      await expect(secureFetch('https://byok.example.com/v1/chat')).resolves.toEqual(
        expect.any(Response),
      );
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('leaves dev and test runtimes on platform TLS instead of failing closed', async () => {
    stampNativePins(['agiworkforce.com']);
    await expect(secureFetch('https://api.agiworkforce.com/v1/chat')).resolves.toEqual(
      expect.any(Response),
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("names today's build an accepted unverified transport rather than a pass", async () => {
    const entry = foundersAssistanceEntry('CLAUDE-SECURITY-20260821-170634 F6');
    expect(entry).toContain('BLOCKED_BY_HUMAN');
    expect(entry).toContain('./native/withAGITlsPinning.cjs');
    expect(hasPlaceholderPins()).toBe(true);

    await inReleaseRuntime('production', async () => {
      expect(
        pinTransportVerdict(pinTransportFacts('https://api.agiworkforce.com/v1/chat')),
      ).toEqual({ allow: 'unverified-accepted' });
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('the accepted gap is announced, not passed through in silence (CWE-295 F6)', () => {
  const PINNED_URL = 'https://api.agiworkforce.com/v1/chat';

  function freshSecureFetch(): typeof import('@/services/secureFetch') {
    let mod!: typeof import('@/services/secureFetch');
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.isolateModules needs a synchronous require to get a module whose warn-once state is empty.
      mod = require('@/services/secureFetch') as typeof import('@/services/secureFetch');
    });
    return mod;
  }

  it('warns once per credential-bearing host when a release build reaches it unverified', async () => {
    const mod = freshSecureFetch();
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(fakeOk());
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await inReleaseRuntime('production', async () => {
      await expect(mod.secureFetch(PINNED_URL)).resolves.toEqual(expect.any(Response));
      await expect(mod.secureFetch('https://api.agiworkforce.com/v1/other')).resolves.toEqual(
        expect.any(Response),
      );
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain('api.agiworkforce.com');
    expect(message).toContain('BLOCKED_BY_HUMAN');
    expect(message).not.toContain('/v1/chat');
  });

  it('stays quiet for hosts the pin table never claimed, so BYOK and LAN traffic is not noise', async () => {
    const mod = freshSecureFetch();
    jest.spyOn(global, 'fetch').mockResolvedValue(fakeOk());
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await inReleaseRuntime('production', async () => {
      await expect(mod.secureFetch('https://byok.example.com/v1/chat')).resolves.toEqual(
        expect.any(Response),
      );
    });

    expect(warn).not.toHaveBeenCalled();
  });

  it('stays quiet in dev and test runtimes', async () => {
    const mod = freshSecureFetch();
    jest.spyOn(global, 'fetch').mockResolvedValue(fakeOk());
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(mod.secureFetch(PINNED_URL)).resolves.toEqual(expect.any(Response));

    expect(warn).not.toHaveBeenCalled();
  });
});

describe('a verified request may not be redirected off its pinned host (CWE-295 F6)', () => {
  const START_URL = 'https://api.agiworkforce.com/v1/chat';

  let mockFetch: jest.SpyInstance<ReturnType<typeof fetch>, Parameters<typeof fetch>>;

  function landingOn(finalUrl: string): Response {
    return Object.defineProperty(fakeOk(), 'url', { value: finalUrl, configurable: true });
  }

  function provisionEveryHost(): void {
    jest.spyOn(pinningModule, 'pinsAreProvisionedForUrl').mockReturnValue(true);
  }

  beforeEach(() => {
    mockFetch = jest.spyOn(global, 'fetch');
    mockFetch.mockReset();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('refuses a response that came back from a host this build does not pin', async () => {
    stampNativePins([...REQUIRED_PINNED_HOSTS]);
    provisionEveryHost();
    mockFetch.mockResolvedValue(landingOn('https://evil.example.com/v1/chat'));

    await inReleaseRuntime('production', async () => {
      expect(pinTransportVerdict(pinTransportFacts(START_URL))).toEqual({
        allow: 'natively-verified',
      });
      await expect(secureFetch(START_URL)).rejects.toMatchObject({
        reason: 'redirected-off-pinned-host',
        url: 'https://evil.example.com/v1/chat',
      });
    });
  });

  it('allows a redirect that lands on another host the same build pinned', async () => {
    stampNativePins([...REQUIRED_PINNED_HOSTS]);
    provisionEveryHost();
    mockFetch.mockResolvedValue(landingOn('https://agiworkforce.com/api/test'));

    await inReleaseRuntime('production', async () => {
      await expect(secureFetch(START_URL)).resolves.toEqual(expect.any(Response));
    });
  });

  it('leaves a build that verified nothing alone, so no request changes today', async () => {
    mockFetch.mockResolvedValue(landingOn('https://evil.example.com/v1/chat'));

    await inReleaseRuntime('production', async () => {
      expect(pinTransportVerdict(pinTransportFacts(START_URL))).toEqual({
        allow: 'unverified-accepted',
      });
      await expect(secureFetch(START_URL)).resolves.toEqual(expect.any(Response));
    });
  });

  it('refuses a verified response that never says where it came from', async () => {
    stampNativePins([...REQUIRED_PINNED_HOSTS]);
    provisionEveryHost();
    mockFetch.mockResolvedValue(fakeOk());

    await inReleaseRuntime('production', async () => {
      expect(fakeOk().url).toBe('');
      await expect(secureFetch(START_URL)).rejects.toMatchObject({
        reason: 'unverifiable-final-url',
        url: START_URL,
      });
    });
  });

  it('reads an unreported final URL as unobservable rather than as a same-host answer', () => {
    expect(redirectVerdict(START_URL, '')).toBe('unobservable');
    expect(redirectVerdict(START_URL, '   ')).toBe('unobservable');
    expect(redirectVerdict(START_URL, undefined)).toBe('unobservable');
    expect(redirectVerdict(START_URL, 'not a url')).toBe('unobservable');
    expect(redirectVerdict(START_URL, 'https://api.agiworkforce.com/v1/other')).toBe('same-host');
  });

  it('still returns a verified response that came back from its own host', async () => {
    stampNativePins([...REQUIRED_PINNED_HOSTS]);
    provisionEveryHost();
    mockFetch.mockResolvedValue(landingOn(START_URL));

    await inReleaseRuntime('production', async () => {
      await expect(secureFetch(START_URL)).resolves.toEqual(expect.any(Response));
    });
  });

  it('names the reason so a redirect is distinguishable from a transport that stays quiet', () => {
    const message = new PinningError(START_URL, 'unverifiable-final-url').message;
    expect(message).toContain('did not report the URL it came from');
    expect(message).toContain(START_URL);
  });
});

describe('the flip is rehearsed before it can refuse (CWE-295 F6)', () => {
  const PINNED_URL = 'https://api.agiworkforce.com/v1/chat';

  const STAGED: PinTransportFacts = {
    isHttps: true,
    isRelease: true,
    hostHasPins: true,
    hostIsCanonical: true,
    pinsProvisioned: true,
    nativelyPinned: false,
    buildShipsNativePins: false,
    stage: 'report-only',
  };

  it('reports a transport that never names the final URL, which enforcement would refuse', () => {
    expect(reportsUnobservableFinalUrl(STAGED, PINNED_URL, '')).toBe(true);
    expect(reportsUnobservableFinalUrl(STAGED, PINNED_URL, undefined)).toBe(true);
  });

  it('stays quiet once the transport does name it', () => {
    expect(reportsUnobservableFinalUrl(STAGED, PINNED_URL, PINNED_URL)).toBe(false);
  });

  it('stays quiet on the shipped build, whose table is placeholders, and off the release path', () => {
    expect(reportsUnobservableFinalUrl({ ...STAGED, pinsProvisioned: false }, PINNED_URL, '')).toBe(
      false,
    );
    expect(reportsUnobservableFinalUrl({ ...STAGED, stage: 'off' }, PINNED_URL, '')).toBe(false);
    expect(reportsUnobservableFinalUrl({ ...STAGED, isRelease: false }, PINNED_URL, '')).toBe(
      false,
    );
  });

  it('stays quiet for hosts the pin table never claimed, so BYOK and LAN traffic is not noise', () => {
    expect(reportsUnobservableFinalUrl({ ...STAGED, hostHasPins: false }, PINNED_URL, '')).toBe(
      false,
    );
  });

  it('leaves the warning to the flip it precedes, not to the request it describes', async () => {
    const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue(fakeOk());
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await inReleaseRuntime('production', async () => {
      await expect(secureFetch(PINNED_URL)).resolves.toEqual(expect.any(Response));
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls.map((call) => call[0]).join('\n'))).not.toContain(
      'unverifiable-final-url',
    );
  });
});

describe('pinTransportRefusal decision table (CWE-295 F6)', () => {
  const SHIPPED_TODAY: PinTransportFacts = {
    isHttps: true,
    isRelease: true,
    hostHasPins: true,
    hostIsCanonical: true,
    pinsProvisioned: false,
    nativelyPinned: false,
    buildShipsNativePins: false,
    stage: 'off',
  };

  const FLAGS = [
    'isHttps',
    'isRelease',
    'hostHasPins',
    'hostIsCanonical',
    'pinsProvisioned',
    'nativelyPinned',
    'buildShipsNativePins',
  ] as const;

  function combination(bits: number, stage: PinningStage): PinTransportFacts {
    return {
      ...(Object.fromEntries(
        FLAGS.map((flag, index) => [flag, (bits & (1 << index)) !== 0]),
      ) as Omit<PinTransportFacts, 'stage'>),
      stage,
    };
  }

  function facts(overrides: Partial<PinTransportFacts>): PinTransportFacts {
    return { ...SHIPPED_TODAY, ...overrides };
  }

  it('allows the shipped build, which declares nothing real and pins nothing', () => {
    expect(pinTransportRefusal(SHIPPED_TODAY)).toBeUndefined();
  });

  it('refuses real pins that no native config compiled in once the rollout is on', () => {
    expect(pinTransportRefusal(facts({ pinsProvisioned: true, stage: 'enforced' }))).toBe(
      'no-native-enforcement',
    );
  });

  it('lets the same build through while the rollout is still staging it', () => {
    expect(
      pinTransportRefusal(facts({ pinsProvisioned: true, stage: 'report-only' })),
    ).toBeUndefined();
  });

  it('refuses a host a pinning build left unprovisioned', () => {
    expect(pinTransportRefusal(facts({ buildShipsNativePins: true }))).toBe('unprovisioned-pins');
  });

  it('allows a host the native config really covers', () => {
    expect(
      pinTransportRefusal(
        facts({ pinsProvisioned: true, nativelyPinned: true, buildShipsNativePins: true }),
      ),
    ).toBeUndefined();
  });

  it('refuses cleartext to a pinned host in every runtime', () => {
    expect(pinTransportRefusal(facts({ isHttps: false, isRelease: false }))).toBe(
      'insecure-scheme',
    );
  });

  it('refuses an absolute-form spelling of a pinned host in every runtime', () => {
    expect(pinTransportRefusal(facts({ hostIsCanonical: false, isRelease: false }))).toBe(
      'ambiguous-host',
    );
  });

  it('refuses it even when the build natively pinned the canonical spelling', () => {
    expect(
      pinTransportRefusal(
        facts({
          hostIsCanonical: false,
          stage: 'enforced',
          pinsProvisioned: true,
          nativelyPinned: true,
          buildShipsNativePins: true,
        }),
      ),
    ).toBe('ambiguous-host');
  });

  it('keeps dev builds on platform TLS even with real pins and no native config', () => {
    expect(pinTransportRefusal(facts({ isRelease: false, pinsProvisioned: true }))).toBeUndefined();
  });

  it('ignores hosts with no table entry while enforcement is off', () => {
    expect(pinTransportRefusal(facts({ hostHasPins: false }))).toBeUndefined();
  });

  it('turns into an allowlist once enforcement is on', () => {
    expect(pinTransportRefusal(facts({ hostHasPins: false, stage: 'enforced' }))).toBe(
      'unprovisioned-pins',
    );
  });

  it('reports that allowlist instead of applying it while the rollout is report-only', () => {
    const untabled = facts({ hostHasPins: false, stage: 'report-only' });
    expect(pinTransportRefusal(untabled)).toBeUndefined();
    expect(stagedRefusal(untabled)).toBe('unprovisioned-pins');
  });

  it('reports nothing once the rollout is the last thing left', () => {
    expect(
      stagedRefusal(
        facts({
          stage: 'report-only',
          pinsProvisioned: true,
          nativelyPinned: true,
          buildShipsNativePins: true,
        }),
      ),
    ).toBeUndefined();
  });

  it('still refuses an enforced build whose native config skipped the host', () => {
    expect(pinTransportRefusal(facts({ stage: 'enforced', pinsProvisioned: true }))).toBe(
      'no-native-enforcement',
    );
  });

  it('refuses a half-shipped native config at every stage, because the halves disagree', () => {
    for (const stage of ['off', 'report-only', 'enforced'] as const) {
      expect(
        pinTransportRefusal(facts({ stage, pinsProvisioned: true, buildShipsNativePins: true })),
      ).toBe('no-native-enforcement');
    }
  });

  it('allows an enforced build that pinned the host natively', () => {
    expect(
      pinTransportRefusal(
        facts({
          stage: 'enforced',
          pinsProvisioned: true,
          nativelyPinned: true,
          buildShipsNativePins: true,
        }),
      ),
    ).toBeUndefined();
  });

  it('names every allowed outcome, so nothing reaches the network by falling through', () => {
    expect(pinTransportVerdict(SHIPPED_TODAY)).toEqual({ allow: 'unverified-accepted' });
    expect(pinTransportVerdict(facts({ hostHasPins: false }))).toEqual({
      allow: 'no-pins-required',
    });
    expect(
      pinTransportVerdict(
        facts({ pinsProvisioned: true, nativelyPinned: true, buildShipsNativePins: true }),
      ),
    ).toEqual({ allow: 'natively-verified' });
    expect(pinTransportVerdict(facts({ isRelease: false, pinsProvisioned: true }))).toEqual({
      allow: 'unverified-accepted',
    });
    expect(pinTransportVerdict(facts({ pinsProvisioned: true, stage: 'enforced' }))).toEqual({
      refuse: 'no-native-enforcement',
    });
  });

  it('never changes a request when the rollout only stages it, so the paste is safe', () => {
    for (let bits = 0; bits < 1 << FLAGS.length; bits += 1) {
      expect(pinTransportVerdict(combination(bits, 'report-only'))).toEqual(
        pinTransportVerdict(combination(bits, 'off')),
      );
    }
  });

  it('reports under report-only exactly what enforcement would refuse', () => {
    for (let bits = 0; bits < 1 << FLAGS.length; bits += 1) {
      const enforced = pinTransportVerdict(combination(bits, 'enforced'));
      expect(stagedRefusal(combination(bits, 'report-only'))).toBe(
        'refuse' in enforced ? enforced.refuse : undefined,
      );
      expect(stagedRefusal(combination(bits, 'off'))).toBeUndefined();
      expect(stagedRefusal(combination(bits, 'enforced'))).toBeUndefined();
    }
  });

  it('agrees with pinTransportRefusal on every case, so one decision drives both', () => {
    for (const stage of ['off', 'report-only', 'enforced'] as const) {
      for (let bits = 0; bits < 1 << FLAGS.length; bits += 1) {
        const combined = combination(bits, stage);
        const verdict = pinTransportVerdict(combined);
        expect(pinTransportRefusal(combined)).toBe(
          'refuse' in verdict ? verdict.refuse : undefined,
        );
      }
    }
  });
});

describe('the shipped gate is wired to those facts, not to a flag (CWE-295 F6)', () => {
  const PINNED_URL = 'https://api.agiworkforce.com/v1/chat';

  let mockFetch: jest.SpyInstance<ReturnType<typeof fetch>, Parameters<typeof fetch>>;

  beforeEach(() => {
    mockFetch = jest.spyOn(global, 'fetch');
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(fakeOk());
  });

  it('reads every fact off the shipped modules in a release runtime', async () => {
    await inReleaseRuntime('production', async () => {
      expect(pinTransportFacts(PINNED_URL)).toEqual({
        isHttps: true,
        isRelease: true,
        hostHasPins: true,
        hostIsCanonical: true,
        pinsProvisioned: false,
        nativelyPinned: false,
        buildShipsNativePins: false,
        stage: 'off',
      });
    });
  });

  it('carries the derived stage, so provisioning and the rollout are what turn it on', () => {
    expect(pinTransportFacts(PINNED_URL).stage).toBe(PINNING_STAGE);
    expect(PINNING_STAGE).toBe(pinningStageFor({ isDevOrTest: isDevOrTestRuntime() }));
    expect(PINNING_ENFORCED).toBe(pinningEnforcedFor({ isDevOrTest: isDevOrTestRuntime() }));
  });

  const FACT_CASES: ReadonlyArray<[string, string[] | undefined]> = [
    ['https://api.agiworkforce.com/v1/chat', undefined],
    ['https://api.agiworkforce.com/v1/chat', ['agiworkforce.com']],
    ['http://api.agiworkforce.com/v1/chat', ['api.agiworkforce.com']],
    ['https://api.agiworkforce.com./v1/chat', ['api.agiworkforce.com']],
    ['https://clerk.agiworkforce.com/v1/client', ['agiworkforce.com']],
    ['https://byok.example.com/v1/chat', ['api.agiworkforce.com']],
    ['https://localhost:8080/v1/models', undefined],
  ];

  it.each(FACT_CASES)(
    'secureFetch(%s) does exactly what the shipped facts require',
    async (url, stamp) => {
      stampNativePins(stamp);
      await inReleaseRuntime('production', async () => {
        const expected = pinTransportRefusal(pinTransportFacts(url));
        if (expected === undefined) {
          await expect(secureFetch(url)).resolves.toEqual(expect.any(Response));
          expect(mockFetch).toHaveBeenCalledTimes(1);
        } else {
          await expect(secureFetch(url)).rejects.toMatchObject({ reason: expected, url });
          expect(mockFetch).not.toHaveBeenCalled();
        }
      });
    },
  );

  it('names provisioning as the one fact between this build and a verified request', async () => {
    const today = await inReleaseRuntime('production', async () => pinTransportFacts(PINNED_URL));
    expect(pinTransportRefusal(today)).toBeUndefined();
    expect(pinTransportRefusal({ ...today, pinsProvisioned: true, stage: 'enforced' })).toBe(
      'no-native-enforcement',
    );
    expect(
      pinTransportRefusal({
        ...today,
        pinsProvisioned: true,
        nativelyPinned: true,
        buildShipsNativePins: true,
        stage: 'enforced',
      }),
    ).toBeUndefined();
  });
});

describe('what the plugin covers is what the shipped gate reads back (CWE-295 F6)', () => {
  let workDir: string;
  let coveredHosts: string[];

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-tls-handshake-'));
    const source = path.join(workDir, 'pinning.ts');
    fs.writeFileSync(
      source,
      [
        "export const PINNING_ROLLOUT: PinningStage = 'enforced';",
        'export const PINS_BY_HOST: PinTable = Object.freeze({',
        ...REQUIRED_PINNED_HOSTS.map((host) => `  '${host}': ['${PIN_A}', '${PIN_B}'],`),
        '});',
        '',
      ].join('\n'),
      'utf8',
    );
    coveredHosts = (
      tlsPinPlugin.withTlsPinning({ name: 'test', slug: 'test' }, { source }) as {
        extra: { tlsPinning: { hosts: string[] } };
      }
    ).extra.tlsPinning.hosts;
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('covers every host the runtime gate requires once the table is provisioned', () => {
    expect(coveredHosts).toEqual([...REQUIRED_PINNED_HOSTS].sort());
  });

  it('makes the shipped gate see those hosts as natively pinned', async () => {
    stampNativePins(coveredHosts);
    await inReleaseRuntime('production', async () => {
      for (const host of REQUIRED_PINNED_HOSTS) {
        const facts = pinTransportFacts(`https://${host}/probe`);
        expect(facts.nativelyPinned).toBe(true);
        expect(facts.buildShipsNativePins).toBe(true);
        expect(
          pinTransportRefusal({ ...facts, pinsProvisioned: true, stage: 'enforced' }),
        ).toBeUndefined();
      }
    });
  });

  it('leaves a host the same build skipped refused, not silently unverified', async () => {
    stampNativePins(coveredHosts.filter((host) => host !== 'clerk.agiworkforce.com'));
    await inReleaseRuntime('production', async () => {
      const facts = pinTransportFacts('https://clerk.agiworkforce.com/v1/client');
      expect(facts.nativelyPinned).toBe(false);
      expect(pinTransportRefusal({ ...facts, pinsProvisioned: true })).toBe(
        'no-native-enforcement',
      );
      await expect(secureFetch('https://clerk.agiworkforce.com/v1/client')).rejects.toMatchObject({
        reason: 'unprovisioned-pins',
      });
    });
  });
});

describe('native pin config generation (native/tlsPinConfig.cjs)', () => {
  const REAL_TABLE = {
    'agiworkforce.com': [PIN_A, PIN_B],
    'api.openai.com': [PIN_C],
  };

  it('classifies a pin exactly like lib/pinning.ts does', () => {
    const src = readSource('lib', 'pinning.ts');
    const declared = /const PIN_PATTERN = (\/.+\/);/.exec(src);
    expect(declared?.[1]).toBe(String(tlsPinConfig.PIN_PATTERN));
  });

  it.each([
    [PIN_A, true],
    [PLACEHOLDER_PIN, false],
    ['sha256/typo', false],
    [`${'A'.repeat(43)}=`, false],
  ])('treats %s as provisioned=%s', (pin, expected) => {
    expect(tlsPinConfig.isProvisionedPin(pin)).toBe(expected);
  });

  it('reads every host of the shipped pin table out of lib/pinning.ts', () => {
    expect(Object.keys(tlsPinConfig.readPinTable()).sort()).toEqual([
      'agiworkforce.com',
      'api.agiworkforce.com',
      'api.anthropic.com',
      'api.openai.com',
      'clerk.agiworkforce.com',
      'signaling.agiworkforce.com',
    ]);
  });

  it('emits nothing while the shipped table is placeholders, so no build can pin garbage', () => {
    expect(tlsPinConfig.provisionedPins(tlsPinConfig.readPinTable())).toEqual({});
  });

  it('drops a host whose pin set is only partly provisioned', () => {
    expect(tlsPinConfig.provisionedPins({ 'agiworkforce.com': [PIN_A, PLACEHOLDER_PIN] })).toEqual(
      {},
    );
  });

  it('drops a host whose pin is malformed rather than shipping a chain nothing matches', () => {
    expect(tlsPinConfig.provisionedPins({ 'agiworkforce.com': [PIN_A, 'sha256/oops='] })).toEqual(
      {},
    );
  });

  it('generates the iOS NSPinnedDomains dictionary from real pins', () => {
    const pins = tlsPinConfig.provisionedPins(REAL_TABLE);
    expect(tlsPinConfig.iosPinnedDomains(pins)).toEqual({
      'agiworkforce.com': {
        NSIncludesSubdomains: false,
        NSPinnedCAIdentities: [
          { 'SPKI-SHA256-BASE64': PIN_A.slice('sha256/'.length) },
          { 'SPKI-SHA256-BASE64': PIN_B.slice('sha256/'.length) },
        ],
      },
      'api.openai.com': {
        NSIncludesSubdomains: false,
        NSPinnedCAIdentities: [{ 'SPKI-SHA256-BASE64': PIN_C.slice('sha256/'.length) }],
      },
    });
  });

  it('generates an Android pin-set that also refuses user-installed CAs', () => {
    const xml = tlsPinConfig.androidNetworkSecurityConfigXml(
      tlsPinConfig.provisionedPins(REAL_TABLE),
    );
    expect(xml).toContain('<certificates src="system" />');
    expect(xml).not.toContain('src="user"');
    expect(xml).toContain('cleartextTrafficPermitted="false"');
    expect(xml).toContain('<domain includeSubdomains="false">agiworkforce.com</domain>');
    expect(xml).toContain(`<pin digest="SHA-256">${PIN_A.slice('sha256/'.length)}</pin>`);
    expect(xml).toContain(`<pin digest="SHA-256">${PIN_B.slice('sha256/'.length)}</pin>`);
  });

  it('scopes every rule to a pinned host, so provisioning cannot break LAN or BYOK endpoints', () => {
    const xml: string = tlsPinConfig.androidNetworkSecurityConfigXml(
      tlsPinConfig.provisionedPins(REAL_TABLE),
    );
    expect(xml).not.toContain('<base-config');
    expect(xml.match(/cleartextTrafficPermitted="false"/g)).toHaveLength(2);
    expect(xml.match(/<certificates src="system" \/>/g)).toHaveLength(2);
  });

  it('reports the hosts the native layer would cover', () => {
    expect(tlsPinConfig.pinnedHostsFrom(tlsPinConfig.provisionedPins(REAL_TABLE))).toEqual([
      'agiworkforce.com',
      'api.openai.com',
    ]);
  });
});

describe('the Expo config plugin is what actually pins (native/withAGITlsPinning.cjs)', () => {
  let workDir: string;
  let pinSource: string;

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-tls-pins-'));
    pinSource = path.join(workDir, 'pinning.ts');
    fs.writeFileSync(
      pinSource,
      [
        "export const PINNING_ROLLOUT: PinningStage = 'enforced';",
        'export const PINS_BY_HOST: PinTable = Object.freeze({',
        `  'pinned.example.com': ['${PIN_A}', '${PIN_B}'],`,
        `  'half.example.com': ['${PIN_C}', '${PLACEHOLDER_PIN}'],`,
        '});',
        '',
      ].join('\n'),
      'utf8',
    );
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  function applyPlugin(): Record<string, never> & {
    extra?: { tlsPinning?: { hosts?: string[] } };
    mods?: {
      ios: { infoPlist: (config: unknown) => Promise<{ modResults: Record<string, unknown> }> };
      android: {
        manifest: (config: unknown) => Promise<{ modResults: Record<string, unknown> }>;
        dangerous: (config: unknown) => Promise<unknown>;
      };
    };
  } {
    return tlsPinPlugin.withTlsPinning({ name: 'test', slug: 'test' }, { source: pinSource });
  }

  it('stamps only the fully provisioned hosts into extra.tlsPinning', () => {
    expect(applyPlugin().extra?.tlsPinning?.hosts).toEqual(['pinned.example.com']);
  });

  it('writes the iOS pin dictionary into Info.plist as CA identities', async () => {
    const config = applyPlugin();
    const result = await config.mods!.ios.infoPlist({ modResults: {}, modRequest: {} });
    const ats = result.modResults.NSAppTransportSecurity as {
      NSPinnedDomains: Record<string, Record<string, unknown>>;
    };
    expect(Object.keys(ats.NSPinnedDomains)).toEqual(['pinned.example.com']);
    expect(ats.NSPinnedDomains['pinned.example.com'].NSPinnedCAIdentities).toEqual([
      { 'SPKI-SHA256-BASE64': PIN_A.slice('sha256/'.length) },
      { 'SPKI-SHA256-BASE64': PIN_B.slice('sha256/'.length) },
    ]);
    expect(ats.NSPinnedDomains['pinned.example.com'].NSPinnedLeafIdentities).toBeUndefined();
  });

  it('writes the Android pin-set file and points the manifest at it', async () => {
    const config = applyPlugin();
    const manifestResult = await config.mods!.android.manifest({
      modResults: { manifest: { application: [{ $: { 'android:name': '.MainApplication' } }] } },
      modRequest: {},
    });
    const application = (
      manifestResult.modResults as {
        manifest: { application: { $: Record<string, string> }[] };
      }
    ).manifest.application[0];
    expect(application.$['android:networkSecurityConfig']).toBe('@xml/network_security_config');

    const platformProjectRoot = path.join(workDir, 'android');
    await config.mods!.android.dangerous({
      modResults: {},
      modRequest: { platformProjectRoot },
    });
    const xml = fs.readFileSync(
      path.join(
        platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml',
        'network_security_config.xml',
      ),
      'utf8',
    );
    expect(xml).toContain('<domain includeSubdomains="false">pinned.example.com</domain>');
    expect(xml).toContain(`<pin digest="SHA-256">${PIN_A.slice('sha256/'.length)}</pin>`);
    expect(xml).not.toContain('half.example.com');
  });

  it('covers exactly the hosts the runtime gate will then let through', () => {
    const covered = new Set(applyPlugin().extra?.tlsPinning?.hosts ?? []);
    const factsFor = (host: string, pinsProvisioned: boolean): PinTransportFacts => ({
      isHttps: true,
      isRelease: true,
      hostHasPins: true,
      hostIsCanonical: true,
      pinsProvisioned,
      nativelyPinned: covered.has(host),
      buildShipsNativePins: covered.size > 0,
      stage: 'off',
    });

    expect(pinTransportRefusal(factsFor('pinned.example.com', true))).toBeUndefined();
    expect(pinTransportRefusal(factsFor('half.example.com', false))).toBe('unprovisioned-pins');
  });

  it('refuses to ship pins next to a plugin that would replace the Android pin-set', () => {
    expect(() =>
      tlsPinPlugin.withTlsPinning(
        { name: 'test', slug: 'test', plugins: ['./native/android/withAGIDetox.cjs'] },
        { source: pinSource },
      ),
    ).toThrow(/withAGIDetox/);
  });

  it('leaves that build alone while no pin is provisioned', () => {
    expect(() =>
      tlsPinPlugin.withTlsPinning({
        name: 'test',
        slug: 'test',
        plugins: ['./native/android/withAGIDetox.cjs'],
      }),
    ).not.toThrow();
  });

  it('is a no-op on the shipped table, so registering it need not wait for the pins', () => {
    const config = tlsPinPlugin.withTlsPinning({ name: 'test', slug: 'test' }) as {
      extra?: unknown;
      mods?: unknown;
    };
    expect(config.extra).toBeUndefined();
    expect(config.mods).toBeUndefined();
  });

  it('reads the required-host list out of the same file it reads the pin table from', () => {
    expect(tlsPinConfig.readRequiredHosts()).toEqual([...REQUIRED_PINNED_HOSTS]);
  });

  function writeTable(
    name: string,
    required: string[],
    table: Record<string, string[]>,
    rollout: PinningStage = 'enforced',
  ): string {
    const file = path.join(workDir, name);
    fs.writeFileSync(
      file,
      [
        `export const REQUIRED_PINNED_HOSTS = [${required.map((h) => `'${h}'`).join(', ')}] as const;`,
        `export const PINNING_ROLLOUT: PinningStage = '${rollout}';`,
        'export const PINS_BY_HOST: PinTable = Object.freeze({',
        ...Object.entries(table).map(
          ([host, pins]) => `  '${host}': [${pins.map((pin) => `'${pin}'`).join(', ')}],`,
        ),
        '});',
        '',
      ].join('\n'),
      'utf8',
    );
    return file;
  }

  it('fails the prebuild on a table that pins some required hosts and leaves others placeholder', () => {
    const source = writeTable('partial.ts', ['a.example.com', 'b.example.com'], {
      'a.example.com': [PIN_A, PIN_B],
      'b.example.com': [PLACEHOLDER_PIN],
    });
    expect(() => tlsPinPlugin.withTlsPinning({ name: 'test', slug: 'test' }, { source })).toThrow(
      /b\.example\.com/,
    );
  });

  it('covers the build once every required host is provisioned', () => {
    const source = writeTable('full.ts', ['a.example.com', 'b.example.com'], {
      'a.example.com': [PIN_A, PIN_B],
      'b.example.com': [PIN_C],
    });
    const config = tlsPinPlugin.withTlsPinning({ name: 'test', slug: 'test' }, { source }) as {
      extra: { tlsPinning: { hosts: string[] } };
    };
    expect(config.extra.tlsPinning.hosts).toEqual(['a.example.com', 'b.example.com']);
  });

  it('reads the rollout out of the same file as the pins, and treats an unreadable one as off', () => {
    expect(tlsPinConfig.readRollout()).toBe(PINNING_ROLLOUT);
    expect(tlsPinConfig.parseRollout('export const PINS_BY_HOST = {};')).toBe('off');
  });

  it('emits nothing while the rollout only stages a fully provisioned table', () => {
    const source = writeTable(
      'staged.ts',
      ['a.example.com'],
      { 'a.example.com': [PIN_A, PIN_B] },
      'report-only',
    );
    const config = tlsPinPlugin.withTlsPinning({ name: 'test', slug: 'test' }, { source }) as {
      extra?: unknown;
      mods?: unknown;
    };
    expect(config.extra).toBeUndefined();
    expect(config.mods).toBeUndefined();
  });

  it('emits the native config only once that rollout is flipped', () => {
    const source = writeTable(
      'flipped.ts',
      ['a.example.com'],
      { 'a.example.com': [PIN_A, PIN_B] },
      'enforced',
    );
    const config = tlsPinPlugin.withTlsPinning({ name: 'test', slug: 'test' }, { source }) as {
      extra: { tlsPinning: { hosts: string[] } };
    };
    expect(config.extra.tlsPinning.hosts).toEqual(['a.example.com']);
  });

  it('fails the prebuild when the rollout says enforced and the table provisions nothing', () => {
    const source = writeTable(
      'enforced-empty.ts',
      ['a.example.com'],
      { 'a.example.com': [PLACEHOLDER_PIN] },
      'enforced',
    );
    expect(() => tlsPinPlugin.withTlsPinning({ name: 'test', slug: 'test' }, { source })).toThrow(
      /PINNING_ROLLOUT/,
    );
  });

  it('is registered in app.config.js, so a provisioned table reaches a real build', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- app.config.js is CommonJS and must be read as the build reads it.
    const { expo } = require('../app.config.js') as { expo: { plugins: unknown[] } };
    expect(expo.plugins).toContain('./native/withAGITlsPinning.cjs');
    expect(fs.existsSync(path.join(MOBILE_ROOT, 'native', 'withAGITlsPinning.cjs'))).toBe(true);
  });

  it('puts the pinning state inside the fingerprint runtimeVersion, so no OTA can claim it', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- same reason.
    const { expo } = require('../app.config.js') as {
      expo: { runtimeVersion: { policy: string } };
    };
    expect(expo.runtimeVersion).toEqual({ policy: 'fingerprint' });
  });

  // @expo/fingerprint drops `extra` from the fingerprint when the
  // ExpoConfigExtraSection source-skip is configured, and `extra.tlsPinning` is
  // the stamp secureFetch reads back. Skipping it would let an update that
  // claims pinning reach a binary that compiled none, which refuses every pinned
  // host on the device with no remedy but a store release.
  it('keeps extra inside that fingerprint, so no source-skip can lift the pin stamp out of it', () => {
    expect(fs.existsSync(path.join(MOBILE_ROOT, 'fingerprint.config.js'))).toBe(false);
    expect(fs.existsSync(path.join(MOBILE_ROOT, 'fingerprint.config.cjs'))).toBe(false);
    expect(readSource('app.config.js')).not.toContain('sourceSkips');
  });

  it('sends a build that compiled no pin config to a native build, not to a registration it has', () => {
    const message = new PinningError(
      'https://api.agiworkforce.com/v1/chat',
      'no-native-enforcement',
    ).message;
    expect(message).not.toMatch(/add '\.\/native\/withAGITlsPinning\.cjs' to the plugins array/);
    expect(message).toContain('registered in app.config.js');
    expect(message).toContain('expo prebuild');
  });
});
