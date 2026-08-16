
const REQUIRED_PINNED_HOSTS = [
  'agiworkforce.com',
  'signaling.agiworkforce.com',
  'api.agiworkforce.com',
  'api.openai.com',
  'api.anthropic.com',
] as const;

export const PINS_BY_HOST: Readonly<Record<string, ReadonlyArray<string>>> = Object.freeze({
  'agiworkforce.com': [
    'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_agiworkforce_leaf=',
    'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_agiworkforce_intermediate=',
  ],
  'signaling.agiworkforce.com': [
    'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_signaling_leaf=',
    'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_signaling_intermediate=',
  ],
  'api.agiworkforce.com': [
    'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_api_leaf=',
    'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_api_intermediate=',
  ],
  'api.openai.com': [
    'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_openai_leaf=',
    'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_openai_intermediate=',
  ],
  'api.anthropic.com': [
    'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_anthropic_leaf=',
    'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_anthropic_intermediate=',
  ],
});

export const PINNING_ENFORCED = false;

const PLACEHOLDER_PREFIX = 'PLACEHOLDER_REPLACE_BEFORE_LAUNCH_';

function isPlaceholderPin(pin: string): boolean {
  return pin.includes(PLACEHOLDER_PREFIX);
}

export function hasPlaceholderPins(): boolean {
  return Object.values(PINS_BY_HOST).flat().some(isPlaceholderPin);
}

export function hostHasPins(urlString: string): boolean {
  try {
    const host = new URL(urlString).hostname.toLowerCase();
    const pins = PINS_BY_HOST[host];
    return pins !== undefined && pins.length > 0;
  } catch {
    return false;
  }
}

export function pinsForUrl(urlString: string): ReadonlyArray<string> {
  try {
    const host = new URL(urlString).hostname.toLowerCase();
    return PINS_BY_HOST[host] ?? [];
  } catch {
    return [];
  }
}

export function hasPlaceholderPinForUrl(urlString: string): boolean {
  return pinsForUrl(urlString).some(isPlaceholderPin);
}

export function pinsAreProvisionedForUrl(urlString: string): boolean {
  const pins = pinsForUrl(urlString);
  return pins.length > 0 && pins.every((pin) => !isPlaceholderPin(pin));
}

export function requiresPin(host: string): boolean {
  const normalized = host.toLowerCase();
  return (REQUIRED_PINNED_HOSTS as ReadonlyArray<string>).includes(normalized);
}

/**
 * Deploy-time safety guard. Throws if PINNING_ENFORCED is true but any
 * required prod host has no pins. Call from app bootstrap so a
 * misconfigured release fails loudly before users are affected.
 */
export function assertPinningReadyIfEnforced(): void {
  if (!PINNING_ENFORCED) return;

  const unpinned = REQUIRED_PINNED_HOSTS.filter((host) => {
    const pins = PINS_BY_HOST[host] ?? [];
    return pins.length === 0 || pins.some(isPlaceholderPin);
  });
  if (unpinned.length > 0) {
    throw new Error(
      `PINNING_ENFORCED=true but PINS_BY_HOST is missing real pins for: ${unpinned.join(', ')}. ` +
        `Follow the pin-capture runbook in lib/pinning.ts before enabling enforcement.`,
    );
  }
}

export type PinningStartupState = 'dev-or-test' | 'disabled' | 'unprovisioned' | 'ok';

export function pinningStartupState(opts: {
  isDev: boolean;
  isTest: boolean;
}): PinningStartupState {
  if (opts.isDev || opts.isTest) return 'dev-or-test';
  if (!PINNING_ENFORCED) return 'disabled';
  if (hasPlaceholderPins()) return 'unprovisioned';
  return 'ok';
}

function reportPinningStatusAtStartup(): PinningStartupState {
  const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
  const isTest =
    (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') ||
    (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_APP_ENV === 'development');
  const state = pinningStartupState({ isDev, isTest });
  if (state === 'unprovisioned') {
    console.warn(
      '[pinning] TLS pins are not provisioned (placeholder values present). ' +
        'Requests to pinned hosts will fail closed; the app still launches. ' +
        'Provision real SPKI pins before public launch (runbook in lib/pinning.ts).',
    );
  }
  return state;
}

reportPinningStatusAtStartup();
