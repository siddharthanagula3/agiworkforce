/**
 * Egress guard — the privacy chokepoint for our-cloud traffic.
 *
 * **Zero-leak invariant (PRD-MOBILE §13):** in Local mode the app is
 * on-device + BYOK. It must NEVER send chats, files, telemetry, or auth
 * material to *our* managed cloud (the AGI API, the Neon database, Clerk,
 * the signaling relay, the api-gateway, or our telemetry collector). BYOK
 * direct-to-provider traffic (Anthropic, OpenAI, Deepgram, …) is allowed
 * because the user's own key talks straight to the provider — our servers
 * never see it.
 *
 * This module mirrors the desktop egress chokepoint: a single place that
 * classifies a destination host as "ours" and refuses our-cloud requests
 * BEFORE the network call when the app is in Local mode.
 *
 * **Fail-closed:** if the app mode cannot be determined for any reason
 * (store not hydrated, threw, unexpected value) we treat the app as Local
 * and block our-cloud egress. A leak is worse than a blocked request.
 *
 * **Relationship to `secureFetch`:** `secureFetch` is the TLS-pinning
 * chokepoint. `guardedFetch` sits in front of it: it decides *whether* a
 * request is allowed to leave the device at all (mode/host policy), then
 * delegates the actual network call (and pin enforcement) to `secureFetch`.
 * Allowed requests keep all of secureFetch's behaviour.
 */
import NetInfo from '@react-native-community/netinfo';
import { API_URL, WS_URL } from '@/lib/constants';
import { secureFetch, type SecureFetchOptions } from '@/services/secureFetch';

/**
 * Error thrown when an our-cloud request is attempted while the app is in
 * Local mode. Thrown BEFORE any network I/O so nothing leaves the device.
 */
export class EgressBlockedError extends Error {
  readonly code = 'EGRESS_BLOCKED_LOCAL_MODE';
  /** The host that was refused. */
  readonly host: string;

  constructor(host: string) {
    super(
      `egressGuard refused: outbound request to our managed-cloud host "${host}" is blocked in ` +
        `Local mode. Local Mode is on-device + BYOK only; our servers must never see Local ` +
        `chats, files, or telemetry. Switch to Cloud mode to use managed-cloud features.`,
    );
    this.name = 'EgressBlockedError';
    this.host = host;
  }
}

/** Lower-cased hostname extracted from a string/URL/Request, or '' if malformed. */
function hostnameOf(input: RequestInfo | URL): string {
  try {
    if (typeof input === 'string') return new URL(input).hostname.toLowerCase();
    if (input instanceof URL) return input.hostname.toLowerCase();
    // RequestInfo → Request
    return new URL((input as Request).url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** Extract the registrable host of a configured URL (http/ws). Returns '' on parse failure. */
function hostOfConfig(urlString: string): string {
  try {
    return new URL(urlString).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Real managed-cloud hosts, discovered from the mobile config — NOT invented.
 *
 *   - API_URL  → our HTTP API + api-gateway base (services/api.ts,
 *     services/streaming.ts, lib/providerStreamClient.ts all hit `${API_URL}/...`)
 *     Default: agiworkforce.com. The gateway lives at api.agiworkforce.com.
 *   - WS_URL   → signaling relay (lib/constants.ts) → signaling.agiworkforce.com
 *   - *.neon.tech → our managed Postgres (cloud chat persistence)
 *   - Clerk    → our managed auth (@clerk/expo)
 *
 * We block by exact host AND by apex-suffix so any current/future subdomain of
 * our domains (api., signaling., telemetry., …) is covered without guessing
 * exact names.
 */
const apiHost = hostOfConfig(API_URL); // e.g. agiworkforce.com
const wsHost = hostOfConfig(WS_URL); // e.g. signaling.agiworkforce.com

/** Apex domains whose every subdomain is our managed cloud. */
const OUR_CLOUD_APEX_SUFFIXES: readonly string[] = [
  // Our product domain + every subdomain (api., signaling., telemetry., app., …).
  'agiworkforce.com',
  // Our managed Postgres (Neon) — any project/branch subdomain.
  'neon.tech',
  // Our managed auth (Clerk) — FAPI + accounts subdomains across Clerk's domains.
  'clerk.com',
  'clerk.accounts.dev',
  'clerk.dev',
  'clerk.services',
].filter(Boolean);

/** Exact hosts that are our managed cloud (derived from config; deduped). */
export const OUR_CLOUD_HOSTS: readonly string[] = Array.from(
  new Set([apiHost, wsHost].filter((h): h is string => h.length > 0)),
);

/**
 * True if `host` is one of our managed-cloud hosts.
 *
 * Matches: an exact configured host, OR a host that is the apex / a subdomain
 * of one of our apex domains. Empty/malformed hosts are treated as NOT-ours so
 * the caller still falls through to `secureFetch` (which fails closed on
 * malformed URLs when pinning is enforced) — we never want a parse failure to
 * *whitelist* an our-cloud bypass, and our-cloud hosts always parse cleanly.
 */
export function isOurCloudHost(host: string | undefined | null): boolean {
  if (!host) return false;
  const h = host.toLowerCase();
  if (OUR_CLOUD_HOSTS.includes(h)) return true;
  for (const apex of OUR_CLOUD_APEX_SUFFIXES) {
    if (h === apex || h.endsWith(`.${apex}`)) return true;
  }
  return false;
}

/**
 * Resolve the current app mode, fail-closed to 'local'.
 *
 * Reads the persisted app-mode zustand store (the same source the chat stack
 * uses: `useChatAppModeStore.getState().appMode`). Any failure — module not
 * loadable, store not hydrated, unexpected value — yields 'local' so we block
 * our-cloud egress rather than risk a leak.
 *
 * The store is required lazily so this module stays importable in non-RN
 * contexts (and so the require can be mocked per-test).
 */
function resolveAppMode(): 'local' | 'cloud' {
  try {
    // Lazy require avoids a hard import cycle (store → mmkv → …) at module load
    // and keeps fail-closed behaviour if the store module ever fails to load.
    // Relative specifier (not '@/'): an aliased *dynamic* require is not
    // guaranteed to be rewritten by Metro/babel at runtime, which would make
    // this silently resolve to undefined and pin the app to Local forever.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../src/features/chat/store/appModeStore') as {
      useChatAppModeStore?: { getState?: () => { appMode?: unknown } };
    };
    const state = mod.useChatAppModeStore?.getState?.();
    return state?.appMode === 'cloud' ? 'cloud' : 'local';
  } catch {
    return 'local';
  }
}

/**
 * Guarded outbound fetch — the privacy chokepoint.
 *
 * Behaviour:
 *   - Local mode + our-cloud host → throw `EgressBlockedError` BEFORE any
 *     network I/O. Nothing leaves the device.
 *   - Local mode + provider/other host (BYOK direct-to-provider) → allowed,
 *     delegated to `secureFetch`.
 *   - Cloud mode → all hosts allowed, delegated to `secureFetch`.
 *
 * Use this for every our-cloud-capable call site instead of `fetch`/`secureFetch`.
 *
 * `opts.stream` opts the request into the streaming-capable fetch (expo/fetch)
 * so SSE replies can be read token-by-token; see {@link SecureFetchOptions}.
 */
export async function guardedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts?: SecureFetchOptions,
): Promise<Response> {
  const mode = resolveAppMode();
  if (mode === 'local') {
    const host = hostnameOf(input);
    if (isOurCloudHost(host)) {
      throw new EgressBlockedError(host || '(unparseable)');
    }
  }
  const response = await secureFetch(input, init, opts);
  // A response resolving here (regardless of HTTP status — even a 4xx/5xx
  // proves a real round-trip completed) is stronger evidence of connectivity
  // than NetInfo's own passive reachability probe, which only re-checks on OS
  // connectivity-change events and can lag behind reality (most visible on the
  // iOS Simulator, where it has been observed reporting stale "offline" state
  // for minutes while real chat/API traffic kept succeeding). Force a refresh
  // so useNetworkStatus's isOnline corrects itself immediately instead of
  // showing a false "you're offline" banner during otherwise-working traffic.
  void NetInfo.refresh().catch(() => {});
  return response;
}
