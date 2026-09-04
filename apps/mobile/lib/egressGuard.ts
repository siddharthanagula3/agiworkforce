import NetInfo from '@react-native-community/netinfo';
import {
  OUR_CLOUD_HOSTS as SHARED_OUR_CLOUD_HOSTS,
  isOurCloudHost as isSharedOurCloudHost,
  matchesCloudHost,
} from '@agiworkforce/trust-boundaries';
import { API_URL, WS_URL } from '@/lib/constants';
import { secureFetch, type SecureFetchOptions } from '@/services/secureFetch';

export class EgressBlockedError extends Error {
  readonly code = 'EGRESS_BLOCKED_LOCAL_MODE';
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

function hostnameOf(input: RequestInfo | URL): string {
  try {
    if (typeof input === 'string') return new URL(input).hostname.toLowerCase();
    if (input instanceof URL) return input.hostname.toLowerCase();
    return new URL((input as Request).url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function hostOfConfig(urlString: string): string {
  try {
    return new URL(urlString).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Config-derived managed-cloud hosts, discovered from the mobile config, NOT
 * invented. These are UNIONED on top of the shared floor
 * ({@link SHARED_OUR_CLOUD_HOSTS} from @agiworkforce/trust-boundaries) so a
 * non-default/staging deployment host still gets blocked in Local mode even if
 * it is not one of the shared apex domains.
 *
 *   - API_URL  → our HTTP API + api-gateway base (services/api.ts,
 *     services/streaming.ts, lib/providerStreamClient.ts all hit `${API_URL}/...`)
 *     Default: agiworkforce.com. The gateway lives at api.agiworkforce.com.
 *   - WS_URL   → signaling relay (lib/constants.ts) → signaling.agiworkforce.com
 *
 * The shared floor already covers agiworkforce.com / neon.tech / Clerk / Vercel;
 * these entries only ADD hosts (never remove), keeping the guard fail-closed.
 */
const apiHost = hostOfConfig(API_URL);
const wsHost = hostOfConfig(WS_URL);

const CONFIG_CLOUD_HOSTS: readonly string[] = Array.from(
  new Set([apiHost, wsHost].filter((h): h is string => h.length > 0)),
);

export const OUR_CLOUD_HOSTS: readonly string[] = Array.from(
  new Set([...SHARED_OUR_CLOUD_HOSTS, ...CONFIG_CLOUD_HOSTS]),
);

export function isOurCloudHost(host: string | undefined | null): boolean {
  return isSharedOurCloudHost(host) || matchesCloudHost(host, CONFIG_CLOUD_HOSTS);
}

function resolveAppMode(): 'local' | 'cloud' {
  try {
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
 * Guarded outbound fetch: the privacy chokepoint.
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
  void NetInfo.refresh().catch(() => {});
  return response;
}
