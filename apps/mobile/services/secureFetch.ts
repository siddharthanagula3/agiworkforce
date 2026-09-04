import Constants from 'expo-constants';
import {
  PINNING_ENFORCED,
  PINNING_ROLLOUT,
  PINNING_STAGE,
  hostHasPins,
  pinsAreProvisionedForUrl,
  type PinningStage,
} from '@/lib/pinning';
import { isReleaseRuntime } from '@/src/lib/runtimeMode';

export type PinningRefusalReason =
  | 'insecure-scheme'
  | 'ambiguous-host'
  | 'unprovisioned-pins'
  | 'no-native-enforcement'
  | 'redirected-off-pinned-host'
  | 'unverifiable-final-url';

function refusalDetail(reason: PinningRefusalReason, url: string): string {
  if (reason === 'insecure-scheme') {
    return (
      `"${url}" is not https. Hosts listed in lib/pinning.ts → PINS_BY_HOST carry session ` +
      `credentials and must never be reached over a transport an on-path attacker can read.`
    );
  }
  if (reason === 'ambiguous-host') {
    return (
      `"${url}" spells a pinned host in absolute form (trailing dot). It resolves to the same server, ` +
      `but iOS NSPinnedDomains and the Android pin-set match the name as written, so the connection ` +
      `would carry credentials to that host with nothing checking its certificate.`
    );
  }
  if (reason === 'no-native-enforcement') {
    return (
      `nothing verifies the certificate presented by "${url}". SPKI hashes in lib/pinning.ts → PINS_BY_HOST ` +
      `are inert until a build compiles them in: './native/withAGITlsPinning.cjs' is registered in app.config.js ` +
      `but emits the iOS NSPinnedDomains and Android network_security_config only once PINNING_ROLLOUT says ` +
      `'enforced', so this artifact was built before that flip. Cut a native build (expo prebuild, then EAS), ` +
      `an over-the-air update cannot add pins to a binary that compiled none.`
    );
  }
  if (reason === 'unverifiable-final-url') {
    return (
      `the response to "${url}" did not report the URL it came from, so this build cannot tell a direct ` +
      `answer from one that was redirected off the pinned host. A verified first hop says nothing about a ` +
      `second connection, so the response is refused rather than trusted.`
    );
  }
  if (reason === 'redirected-off-pinned-host') {
    return (
      `the request left the pinned host and landed on "${url}", which this build does not pin. ` +
      `Only the first hop was verified, so following the redirect would hand the response, and any ` +
      `credential the platform replays, to a certificate nothing checked.`
    );
  }
  return (
    `no provisioned pins are configured for "${url}". ` +
    `Add provisioned SPKI hashes to lib/pinning.ts → PINS_BY_HOST (node scripts/compute-spki-pins.mjs prints them).`
  );
}

export class PinningError extends Error {
  readonly url: string;
  readonly reason: PinningRefusalReason;

  constructor(url: string, reason: PinningRefusalReason = 'unprovisioned-pins') {
    super(`secureFetch refused: pinning is enforced but ${refusalDetail(reason, url)}`);
    this.name = 'PinningError';
    this.url = url;
    this.reason = reason;
  }
}

export interface SecureFetchOptions {
  stream?: boolean;
}

const NO_HOSTS: ReadonlySet<string> = new Set();
const TRAILING_DOTS = /\.+$/;

/**
 * Hosts the native pin config actually covered, stamped into the Expo config by
 * native/withAGITlsPinning.cjs at build time. Reading it back is the only way
 * the JS layer can tell real platform pinning from a pin table that was never
 * compiled into the app: React Native's fetch cannot inspect the peer
 * certificate itself.
 */
function nativelyPinnedHosts(): ReadonlySet<string> {
  const extra = Constants.expoConfig?.extra as
    | { tlsPinning?: { hosts?: unknown } | undefined }
    | undefined;
  const hosts = extra?.tlsPinning?.hosts;
  if (!Array.isArray(hosts)) return NO_HOSTS;
  return new Set(
    hosts
      .filter((host): host is string => typeof host === 'string')
      .map((host) => host.trim().toLowerCase().replace(TRAILING_DOTS, ''))
      .filter((host) => host.length > 0),
  );
}

function hostnameOf(urlString: string): string | undefined {
  try {
    return new URL(urlString).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function canonicalHostOf(urlString: string): string | undefined {
  return hostnameOf(urlString)?.replace(TRAILING_DOTS, '');
}

/**
 * lib/pinning exports both the stage and the boolean the rest of the codebase
 * reads as "is pinning on". The gate takes the stronger of the two, so it can
 * never end up gentler than PINNING_ENFORCED reports.
 */
function currentStage(): PinningStage {
  return PINNING_ENFORCED ? 'enforced' : PINNING_STAGE;
}

function isHttps(urlString: string): boolean {
  try {
    return new URL(urlString).protocol === 'https:';
  } catch {
    return false;
  }
}

export interface PinTransportFacts {
  isHttps: boolean;
  isRelease: boolean;
  hostHasPins: boolean;
  hostIsCanonical: boolean;
  pinsProvisioned: boolean;
  nativelyPinned: boolean;
  buildShipsNativePins: boolean;
  stage: PinningStage;
}

export type PinTransportVerdict =
  | { allow: 'no-pins-required' }
  | { allow: 'natively-verified' }
  | { allow: 'unverified-accepted' }
  | { refuse: PinningRefusalReason };

export type PinTransportAllowance = Extract<PinTransportVerdict, { allow: string }>;

/**
 * The whole pinning decision, as data, with every outcome named, including the
 * ones that let a request through untouched. Four independent facts drive it:
 * which host the request really reaches (`hostHasPins`/`hostIsCanonical`), what
 * the pin table declares (`pinsProvisioned`), what the build really compiled in
 * (`nativelyPinned`/`buildShipsNativePins`), and how far the rollout has been
 * taken (`stage`). A build that compiled a native pin config and left a
 * credential-bearing host out of it is refused at every stage: the halves
 * disagree, and that is a shipping mistake rather than a rollout step.
 *
 * `unverified-accepted` is the one state where a pinned host still reaches the
 * network with nothing checking its certificate: the table is all placeholders
 * and the build compiled no pin config, which is today's shipped build. It is a
 * verdict rather than a fall-through so callers must handle it, and secureFetch
 * answers it with a warning instead of silence. It is tracked as
 * BLOCKED_BY_HUMAN in docs/work/founder-assistance.md.
 */
export function pinTransportVerdict(facts: PinTransportFacts): PinTransportVerdict {
  if (facts.hostHasPins && !facts.isHttps) return { refuse: 'insecure-scheme' };
  if (facts.hostHasPins && !facts.hostIsCanonical) return { refuse: 'ambiguous-host' };

  const verified = facts.pinsProvisioned && facts.nativelyPinned;

  if (facts.stage === 'enforced') {
    if (!facts.pinsProvisioned) return { refuse: 'unprovisioned-pins' };
    if (facts.isRelease && !facts.nativelyPinned) return { refuse: 'no-native-enforcement' };
    return verified ? { allow: 'natively-verified' } : { allow: 'unverified-accepted' };
  }

  if (facts.isRelease && facts.hostHasPins && facts.buildShipsNativePins && !facts.nativelyPinned) {
    return { refuse: facts.pinsProvisioned ? 'no-native-enforcement' : 'unprovisioned-pins' };
  }

  if (verified) return { allow: 'natively-verified' };
  if (!facts.hostHasPins) return { allow: 'no-pins-required' };
  return { allow: 'unverified-accepted' };
}

/**
 * What the same request would have met at the end of the rollout. A provisioned
 * build that has not been flipped to 'enforced' yet reports these instead of
 * refusing, so the hosts enforcement would cut off, every localhost, LAN
 * dispatch target and BYOK base URL the pin table has no entry for, surface
 * from a shipped build before the flip rather than after it.
 */
export function stagedRefusal(facts: PinTransportFacts): PinningRefusalReason | undefined {
  if (facts.stage !== 'report-only') return undefined;
  const verdict = pinTransportVerdict({ ...facts, stage: 'enforced' });
  return 'refuse' in verdict ? verdict.refuse : undefined;
}

export function pinTransportRefusal(facts: PinTransportFacts): PinningRefusalReason | undefined {
  const verdict = pinTransportVerdict(facts);
  return 'refuse' in verdict ? verdict.refuse : undefined;
}

export function pinTransportFacts(url: string): PinTransportFacts {
  const spelledHost = hostnameOf(url);
  const host = spelledHost?.replace(TRAILING_DOTS, '');
  const native = nativelyPinnedHosts();
  return {
    isHttps: isHttps(url),
    isRelease: isReleaseRuntime(),
    hostHasPins: hostHasPins(url),
    hostIsCanonical: spelledHost === undefined || !TRAILING_DOTS.test(spelledHost),
    pinsProvisioned: pinsAreProvisionedForUrl(url),
    nativelyPinned: host !== undefined && native.has(host),
    buildShipsNativePins: native.size > 0,
    stage: currentStage(),
  };
}

const warnedUnverifiedHosts = new Set<string>();
const warnedStagedHosts = new Set<string>();
const warnedUnobservableHosts = new Set<string>();

/**
 * The accepted gap is announced once per host rather than passed through in
 * silence: a release build that reaches a credential-bearing host with nothing
 * verifying its certificate is a tracked exception, and it has to be visible in
 * device logs and crash breadcrumbs to stay one. Only the host is logged, the
 * path and query of these requests carry tokens.
 */
function warnUnverifiedTransport(host: string): void {
  if (warnedUnverifiedHosts.has(host)) return;
  warnedUnverifiedHosts.add(host);
  console.warn(
    `[pinning] "${host}" is listed in lib/pinning.ts → PINS_BY_HOST, but this build verifies ` +
      `nothing about the certificate it presents: the pins are placeholders and no native pin ` +
      `config shipped. Requests to it rely on the OS trust store alone, so a device-trusted CA ` +
      `can read them. Tracked as BLOCKED_BY_HUMAN in docs/work/founder-assistance.md (mobile TLS pinning).`,
  );
}

/**
 * Reported once per host, host only: the paths and queries of these requests
 * carry tokens.
 */
function warnUnobservableFinalUrl(host: string): void {
  if (warnedUnobservableHosts.has(host)) return;
  warnedUnobservableHosts.add(host);
  console.warn(
    `[pinning] responses from "${host}" do not report the URL they came from, so an enforced build ` +
      `cannot tell a direct answer from one redirected off the pinned host and would refuse them ` +
      `(unverifiable-final-url). Settle that before setting PINNING_ROLLOUT to 'enforced'.`,
  );
}

/**
 * The rollout's dry run, once per host and reason. Only the host is logged, the
 * path and query of these requests carry tokens.
 */
function warnStagedRefusal(host: string, reason: PinningRefusalReason): void {
  const key = `${host}|${reason}`;
  if (warnedStagedHosts.has(key)) return;
  warnedStagedHosts.add(key);
  console.warn(
    `[pinning] rollout is report-only: "${host}" would be refused (${reason}) once ` +
      `PINNING_ROLLOUT in lib/pinning.ts is 'enforced'. Give it a PINS_BY_HOST entry, or accept ` +
      `losing it, before that flip ships. Current rollout: '${PINNING_ROLLOUT}'.`,
  );
}

export type RedirectVerdict = 'same-host' | 'stayed-pinned' | 'unobservable' | 'left-pinned-host';

/**
 * A redirect is a second connection the one-shot gate above never saw. When the
 * first hop was really pinned, the hop that leaves it must be pinned too, or the
 * response, and whatever the platform replays with it, comes from a
 * certificate nothing checked. A transport that does not report where the
 * response came from cannot answer that question at all, so it reads as
 * `unobservable` rather than as a same-host answer: treating silence as "no
 * redirect happened" is what let an unpinned hop through.
 */
export function redirectVerdict(requestUrl: string, finalUrl: unknown): RedirectVerdict {
  if (typeof finalUrl !== 'string' || finalUrl.trim() === '') return 'unobservable';
  const to = canonicalHostOf(finalUrl);
  if (to === undefined) return 'unobservable';
  if (to === canonicalHostOf(requestUrl)) return 'same-host';
  const verdict = pinTransportVerdict(pinTransportFacts(finalUrl));
  return 'allow' in verdict && verdict.allow === 'natively-verified'
    ? 'stayed-pinned'
    : 'left-pinned-host';
}

/**
 * Only a verified request is held to this, and only after the response is in
 * hand: React Native follows redirects in the platform layer, so a credential it
 * replayed on the second hop is already on the wire by the time this runs.
 * Refusing the response still denies the attacker the answer and surfaces the
 * hop, but the token is burned and must be rotated, recorded as a residual of
 * the 'enforced' stage in docs/work/founder-assistance.md.
 */
function assertResponseCameFromPinnedHost(requestUrl: string, finalUrl: unknown): void {
  const verdict = redirectVerdict(requestUrl, finalUrl);
  if (verdict === 'same-host' || verdict === 'stayed-pinned') return;
  if (verdict === 'unobservable') throw new PinningError(requestUrl, 'unverifiable-final-url');
  throw new PinningError(String(finalUrl), 'redirected-off-pinned-host');
}

/**
 * The report-only stage cannot rehearse the check above, no hop is verified
 * before the flip, so it never runs, and whether this transport reports a
 * response's URL is what decides, afterwards, between allowing that response and
 * refusing it. A provisioned build says so from the stage before, so the answer
 * is known when the flip is reviewed rather than discovered on installed apps.
 */
export function reportsUnobservableFinalUrl(
  facts: PinTransportFacts,
  requestUrl: string,
  finalUrl: unknown,
): boolean {
  if (!facts.isRelease || !facts.hostHasPins || !facts.pinsProvisioned) return false;
  if (facts.stage !== 'report-only') return false;
  return redirectVerdict(requestUrl, finalUrl) === 'unobservable';
}

function reportUnobservableFinalUrl(
  facts: PinTransportFacts,
  requestUrl: string,
  finalUrl: unknown,
): void {
  if (!reportsUnobservableFinalUrl(facts, requestUrl, finalUrl)) return;
  const host = canonicalHostOf(requestUrl);
  if (host !== undefined) warnUnobservableFinalUrl(host);
}

function checkResponseOrigin(
  facts: PinTransportFacts,
  allowance: PinTransportAllowance,
  requestUrl: string,
  finalUrl: unknown,
): void {
  if (allowance.allow === 'natively-verified') {
    assertResponseCameFromPinnedHost(requestUrl, finalUrl);
    return;
  }
  reportUnobservableFinalUrl(facts, requestUrl, finalUrl);
}

function normalizeRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export async function secureFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts?: SecureFetchOptions,
): Promise<Response> {
  const url = normalizeRequestUrl(input);
  const facts = pinTransportFacts(url);
  const verdict = pinTransportVerdict(facts);
  if ('refuse' in verdict) throw new PinningError(url, verdict.refuse);

  const host = canonicalHostOf(url);
  if (facts.isRelease && host !== undefined) {
    if (verdict.allow === 'unverified-accepted') warnUnverifiedTransport(host);
    else {
      const staged = stagedRefusal(facts);
      if (staged !== undefined) warnStagedRefusal(host, staged);
    }
  }

  if (opts?.stream && (typeof input === 'string' || input instanceof URL)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { fetch: expoFetch } = require('expo/fetch') as typeof import('expo/fetch');
    const streamed = await expoFetch(url, init as unknown as Parameters<typeof expoFetch>[1]);
    checkResponseOrigin(facts, verdict, url, streamed.url);
    return streamed as unknown as Response;
  }

  const response = await fetch(input, init);
  checkResponseOrigin(facts, verdict, url, response.url);
  return response;
}
