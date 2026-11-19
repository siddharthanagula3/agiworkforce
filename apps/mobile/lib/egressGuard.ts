import NetInfo from '@react-native-community/netinfo';
import {
  AgentTaskStateSchema,
  MANAGED_CLOUD_ACCOUNT_DELETION_CANCEL_SCHEDULE_PATH,
  MANAGED_CLOUD_ACCOUNT_DELETION_PATH,
  MANAGED_CLOUD_AGENT_RUNS_BASE_PATH,
  MANAGED_CLOUD_DATA_EXPORT_PATH,
  MANAGED_CLOUD_SCHEDULES_PATH,
  MOBILE_INTENT_TOKEN_PATH,
  TERMS_ACCEPTANCE_PATH,
} from '@agiworkforce/cloud-contracts';
import {
  OUR_CLOUD_HOSTS as SHARED_OUR_CLOUD_HOSTS,
  isOurCloudHost as isSharedOurCloudHost,
  matchesCloudHost,
} from '@agiworkforce/trust-boundaries';
import { TERMINAL_AGENT_TASK_STATES } from '@agiworkforce/types';
import { API_URL, WS_URL } from '@/lib/constants';
import { secureFetch, type SecureFetchOptions } from '@/services/secureFetch';
import type { StepUpAction } from '@/src/features/auth/services/stepUp';

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
 *     services/streaming.ts all hit `${API_URL}/...`)
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

function sharingWithProvidersAllowed(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../services/providerConsent') as {
      hasCurrentCloudProviderConsent?: () => boolean;
    };
    return mod.hasCurrentCloudProviderConsent?.() === true;
  } catch {
    return false;
  }
}

function sharingWithdrawalInProgress(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../services/providerConsent') as {
      cloudProviderConsentWithdrawalInProgress: () => boolean;
    };
    return mod.cloudProviderConsentWithdrawalInProgress() !== false;
  } catch {
    return true;
  }
}

function managedCloudOpen(): boolean {
  return resolveAppMode() === 'cloud' && sharingWithProvidersAllowed();
}

interface GuardedFetchOptions extends SecureFetchOptions {
  authControl?: boolean;
  /** Set only for a content report the user chose to send with its own Send tap. */
  consentedReport?: boolean;
  /** Set only by the withdrawal helpers that stop standing Cloud work and revoke Ask from Siri. */
  withdrawalControl?: boolean;
}

export const CONTENT_REPORT_PATH = '/api/mobile/content-report';
export const STEP_UP_PATH = '/api/auth/step-up';
const ACCOUNT_DELETION_STEP_UP: StepUpAction = 'account.delete';

function managedCloudTarget(input: RequestInfo | URL): URL | null {
  try {
    const target = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    return target.origin === new URL(API_URL).origin ? target : null;
  } catch {
    return null;
  }
}

function carriesBearer(init?: RequestInit): boolean {
  const authorization =
    init?.headers && !Array.isArray(init.headers)
      ? Object.entries(init.headers).find(([name]) => name.toLowerCase() === 'authorization')?.[1]
      : undefined;
  return typeof authorization === 'string' && /^Bearer \S+$/.test(authorization);
}

function hasNoBody(init?: RequestInit): boolean {
  return init?.body === undefined || init.body === null;
}

function bodyIsExactly(init: RequestInit | undefined, expected: Record<string, unknown>): boolean {
  if (typeof init?.body !== 'string') return false;
  try {
    const parsed: unknown = JSON.parse(init.body);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    const entries = Object.entries(parsed);
    return (
      entries.length === Object.keys(expected).length &&
      entries.every(
        ([key, value]) =>
          Object.prototype.hasOwnProperty.call(expected, key) && expected[key] === value,
      )
    );
  } catch {
    return false;
  }
}

function queryUsesOnly(
  target: URL,
  repeatable: ReadonlySet<string>,
  single: ReadonlySet<string>,
): boolean {
  const keys = [...target.searchParams.keys()];
  return keys.every(
    (key) =>
      repeatable.has(key) || (single.has(key) && target.searchParams.getAll(key).length === 1),
  );
}

function isConsentedReportRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  const target = managedCloudTarget(input);
  return (
    target !== null &&
    target.pathname === CONTENT_REPORT_PATH &&
    target.search === '' &&
    init?.method === 'POST'
  );
}

type BodyRule = (init?: RequestInit) => boolean;
const ANY_BODY: BodyRule = () => true;

const SIGNED_IN_ACCOUNT_CONTROLS: ReadonlyMap<string, ReadonlyMap<string, BodyRule>> = new Map([
  [
    TERMS_ACCEPTANCE_PATH,
    new Map([
      ['GET', ANY_BODY],
      ['POST', ANY_BODY],
    ]),
  ],
  [
    MANAGED_CLOUD_ACCOUNT_DELETION_PATH,
    new Map([
      ['GET', ANY_BODY],
      ['DELETE', ANY_BODY],
    ]),
  ],
  [MANAGED_CLOUD_ACCOUNT_DELETION_CANCEL_SCHEDULE_PATH, new Map([['PUT', ANY_BODY]])],
  [
    STEP_UP_PATH,
    new Map<string, BodyRule>([
      ['GET', hasNoBody],
      ['POST', (init) => bodyIsExactly(init, { action: ACCOUNT_DELETION_STEP_UP })],
    ]),
  ],
  [MANAGED_CLOUD_DATA_EXPORT_PATH, new Map([['GET', hasNoBody]])],
]);

function isSignedInAccountControlRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  const target = managedCloudTarget(input);
  if (target === null || target.search !== '' || init?.method === undefined) return false;
  const bodyRule = SIGNED_IN_ACCOUNT_CONTROLS.get(target.pathname)?.get(init.method);
  return bodyRule !== undefined && bodyRule(init) && carriesBearer(init);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_KEYS: ReadonlySet<string> = new Set();
const SCHEDULE_PAGE_KEYS: ReadonlySet<string> = new Set(['limit', 'offset']);
const RUN_PAGE_KEYS: ReadonlySet<string> = new Set(['limit', 'cursor']);
const RUN_STATE_KEY: ReadonlySet<string> = new Set(['state']);
const ASK_TOKEN_REVOKE_KEYS: ReadonlySet<string> = new Set(['tokenId', 'installId']);

function lastSegmentUnder(pathname: string, base: string, suffix = ''): string | null {
  if (!pathname.startsWith(`${base}/`) || !pathname.endsWith(suffix)) return null;
  const segment = pathname.slice(base.length + 1, pathname.length - suffix.length);
  return segment.length > 0 && !segment.includes('/') ? segment : null;
}

function listsOnlyUnfinishedRuns(target: URL): boolean {
  const states = target.searchParams.getAll('state');
  return (
    states.length > 0 &&
    states.every((state) => {
      const parsed = AgentTaskStateSchema.safeParse(state);
      return parsed.success && !TERMINAL_AGENT_TASK_STATES.has(parsed.data);
    }) &&
    queryUsesOnly(target, RUN_STATE_KEY, RUN_PAGE_KEYS)
  );
}

function isWithdrawalControlRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  const target = managedCloudTarget(input);
  if (target === null || !carriesBearer(init)) return false;
  const method = (init?.method ?? 'GET').toUpperCase();
  const { pathname } = target;
  if (method === 'GET' && pathname === MANAGED_CLOUD_SCHEDULES_PATH) {
    return hasNoBody(init) && queryUsesOnly(target, NO_KEYS, SCHEDULE_PAGE_KEYS);
  }
  if (method === 'PATCH' && lastSegmentUnder(pathname, MANAGED_CLOUD_SCHEDULES_PATH) !== null) {
    return target.search === '' && bodyIsExactly(init, { isActive: false });
  }
  if (method === 'GET' && pathname === MANAGED_CLOUD_AGENT_RUNS_BASE_PATH) {
    return hasNoBody(init) && listsOnlyUnfinishedRuns(target);
  }
  if (method === 'POST') {
    const runId = lastSegmentUnder(pathname, MANAGED_CLOUD_AGENT_RUNS_BASE_PATH, '/pause');
    return runId !== null && UUID.test(runId) && target.search === '' && hasNoBody(init);
  }
  if (method === 'DELETE' && pathname === MOBILE_INTENT_TOKEN_PATH) {
    const keys = [...target.searchParams.keys()];
    return hasNoBody(init) && keys.length === 1 && ASK_TOKEN_REVOKE_KEYS.has(keys[0] ?? '');
  }
  return false;
}

/**
 * Guarded outbound fetch: the privacy chokepoint.
 *
 * Behaviour:
 *   - Cloud mode counts only while the signed-in account's permission to share
 *     with AI providers is current; otherwise the request is treated as Local.
 *     While that permission is being withdrawn it is not current.
 *   - Local mode + our-cloud host → throw `EgressBlockedError` BEFORE any
 *     network I/O. Nothing leaves the device.
 *   - Local mode + a content report the user chose to send (`consentedReport`,
 *     POST to {@link CONTENT_REPORT_PATH} only) → allowed, except while a
 *     withdrawal is in progress.
 *   - Local mode + a signed-in account control (`authControl`: Terms acceptance,
 *     account deletion status, scheduling and cancellation, the identity check
 *     for deletion only, and the data export) → allowed. None carries chat
 *     content to a provider, and these rights must not depend on sharing with
 *     AI providers.
 *   - Local mode + a withdrawal control (`withdrawalControl`: list schedules,
 *     set one inactive, list unfinished runs, pause a run, revoke the Ask from
 *     Siri token) → allowed. Each only stops work; none sends content.
 *   - Local mode + provider/other host (BYOK direct-to-provider) → allowed,
 *     delegated to `secureFetch`.
 *   - Cloud mode with a current permission → all hosts allowed, delegated to
 *     `secureFetch`.
 *
 * Use this for every our-cloud-capable call site instead of `fetch`/`secureFetch`.
 *
 * `opts.stream` opts the request into the streaming-capable fetch (expo/fetch)
 * so SSE replies can be read token-by-token; see {@link SecureFetchOptions}.
 */
export async function guardedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts?: GuardedFetchOptions,
): Promise<Response> {
  if (!managedCloudOpen()) {
    const host = hostnameOf(input);
    const consentedReport = opts?.consentedReport && isConsentedReportRequest(input, init);
    const allowed =
      (opts?.authControl && isSignedInAccountControlRequest(input, init)) ||
      (opts?.withdrawalControl && isWithdrawalControlRequest(input, init)) ||
      (consentedReport && !sharingWithdrawalInProgress());
    if (isOurCloudHost(host) && !allowed) {
      throw new EgressBlockedError(host || '(unparseable)');
    }
  }
  const response = opts?.stream
    ? await secureFetch(input, init, { stream: true })
    : await secureFetch(input, init);
  void NetInfo.refresh().catch(() => {});
  return response;
}
