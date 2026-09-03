import { isDevOrTestRuntime } from '@/src/lib/runtimeMode';

export const REQUIRED_PINNED_HOSTS = [
  'agiworkforce.com',
  'signaling.agiworkforce.com',
  'api.agiworkforce.com',
  'clerk.agiworkforce.com',
  'api.openai.com',
  'api.anthropic.com',
] as const;

export type PinTable = Readonly<Record<string, ReadonlyArray<string>>>;

export const PINS_BY_HOST: PinTable = Object.freeze({
  'agiworkforce.com': [
    'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_agiworkforce_ca=',
    'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_agiworkforce_backup_ca=',
  ],
  'signaling.agiworkforce.com': [
    'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_signaling_ca=',
    'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_signaling_backup_ca=',
  ],
  'api.agiworkforce.com': [
    'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_api_ca=',
    'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_api_backup_ca=',
  ],
  // Clerk FAPI. The Clerk SDK does its own networking and never reaches
  // secureFetch, so only the native pin config can cover the auth handshake --
  // the exact exchange that hands the app the bearer token every other request
  // carries. It is required here so no build can report itself pinned while the
  // credential-issuing host rides on bare platform TLS.
  'clerk.agiworkforce.com': [
    'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_clerk_ca=',
    'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_clerk_backup_ca=',
  ],
  'api.openai.com': [
    'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_openai_ca=',
    'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_openai_backup_ca=',
  ],
  'api.anthropic.com': [
    'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_anthropic_ca=',
    'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_anthropic_backup_ca=',
  ],
});

const PLACEHOLDER_PREFIX = 'PLACEHOLDER_REPLACE_BEFORE_LAUNCH_';
const PIN_PATTERN = /^sha256\/[A-Za-z0-9+/]{43}=$/;
const TRAILING_DOTS = /\.+$/;

/**
 * Table lookups key on the destination, not on the spelling: "agiworkforce.com."
 * is the same host as "agiworkforce.com", so an absolute-form URL must not slip
 * past a pinned entry. secureFetch refuses that spelling outright rather than
 * treating it as pinned, because the native pin configs match the name as
 * written and would not apply their pin-set to it.
 */
function canonicalHost(host: string): string {
  return host.toLowerCase().replace(TRAILING_DOTS, '');
}

function canonicalHostOfUrl(urlString: string): string | undefined {
  try {
    return canonicalHost(new URL(urlString).hostname);
  } catch {
    return undefined;
  }
}

function isPlaceholderPin(pin: string): boolean {
  return pin.includes(PLACEHOLDER_PREFIX);
}

function isProvisionedPin(pin: string): boolean {
  return !isPlaceholderPin(pin) && PIN_PATTERN.test(pin);
}

function pinsAreProvisioned(pins: ReadonlyArray<string>): boolean {
  return pins.length > 0 && pins.every(isProvisionedPin);
}

export function hasPlaceholderPins(): boolean {
  return Object.values(PINS_BY_HOST).flat().some(isPlaceholderPin);
}

export type PinningStage = 'off' | 'report-only' | 'enforced';

export const PINNING_ROLLOUT: PinningStage = 'report-only';

/**
 * The stage a build really runs at: never more than the rollout asks for, and
 * nothing at all until every required host carries a well-formed,
 * non-placeholder hash. A half-provisioned table stages nothing rather than
 * refusing the hosts it missed, and dev and test runtimes always stay off so a
 * pin can never break the local loop.
 */
export function pinningStageFor(opts: {
  isDevOrTest: boolean;
  pins?: PinTable;
  rollout?: PinningStage;
}): PinningStage {
  const rollout = opts.rollout ?? PINNING_ROLLOUT;
  if (rollout === 'off' || opts.isDevOrTest) return 'off';
  const pins = opts.pins ?? PINS_BY_HOST;
  const provisioned = REQUIRED_PINNED_HOSTS.every((host) => pinsAreProvisioned(pins[host] ?? []));
  return provisioned ? rollout : 'off';
}

export function pinningEnforcedFor(opts: {
  isDevOrTest: boolean;
  pins?: PinTable;
  rollout?: PinningStage;
}): boolean {
  return pinningStageFor(opts) === 'enforced';
}

export const PINNING_STAGE = pinningStageFor({ isDevOrTest: isDevOrTestRuntime() });
export const PINNING_ENFORCED = PINNING_STAGE === 'enforced';

export function pinsForUrl(urlString: string): ReadonlyArray<string> {
  const host = canonicalHostOfUrl(urlString);
  return host === undefined ? [] : (PINS_BY_HOST[host] ?? []);
}

export function hostHasPins(urlString: string): boolean {
  return pinsForUrl(urlString).length > 0;
}

export function hasPlaceholderPinForUrl(urlString: string): boolean {
  return pinsForUrl(urlString).some(isPlaceholderPin);
}

export function pinsAreProvisionedForUrl(urlString: string): boolean {
  return pinsAreProvisioned(pinsForUrl(urlString));
}

export function requiresPin(host: string): boolean {
  return (REQUIRED_PINNED_HOSTS as ReadonlyArray<string>).includes(canonicalHost(host));
}

export type PinningStartupState = 'dev-or-test' | 'disabled' | 'unprovisioned' | 'staged' | 'ok';

export function pinningStartupState(opts: {
  isDev: boolean;
  isTest: boolean;
  pins?: PinTable;
  rollout?: PinningStage;
}): PinningStartupState {
  if (opts.isDev || opts.isTest) return 'dev-or-test';
  const pins = opts.pins ?? PINS_BY_HOST;
  const rollout = opts.rollout ?? PINNING_ROLLOUT;
  if (Object.values(pins).flat().some(isPlaceholderPin)) return 'unprovisioned';
  if (rollout === 'off') return 'disabled';
  return pinningEnforcedFor({ isDevOrTest: false, pins, rollout }) ? 'ok' : 'staged';
}

function reportPinningStatusAtStartup(): PinningStartupState {
  const isDevOrTest = isDevOrTestRuntime();
  const state = pinningStartupState({ isDev: isDevOrTest, isTest: isDevOrTest });
  if (state === 'unprovisioned') {
    console.warn(
      '[pinning] TLS pins are not provisioned (placeholder values present). ' +
        'Requests to pinned hosts stay on platform TLS with no pin check; the app still launches. ' +
        'Provision real SPKI pins before public launch ' +
        '(runbook at the top of lib/pinning.ts, tracked in docs/work/founder-assistance.md).',
    );
  }
  if (state === 'staged') {
    console.warn(
      `[pinning] pins are provisioned but PINNING_ROLLOUT is '${PINNING_ROLLOUT}', so nothing is ` +
        'pinned yet: this build reports what enforcement would refuse instead of refusing it. ' +
        "Set PINNING_ROLLOUT to 'enforced' and cut a native build to turn pinning on.",
    );
  }
  return state;
}

reportPinningStatusAtStartup();
