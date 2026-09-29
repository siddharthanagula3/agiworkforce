/**
 * The one place the chat webview turns a failure into words.
 *
 * The app-server reports a turn failure as the CLI's `Display` string, not as
 * its `kind()`, so these shapes are the contract with `apps/cli/src/errors.rs`.
 *
 * Headlines name what the user knows: the provider they chose and AGI itself.
 * Nothing here says "developer runtime", "turn", "boundary" or any other word
 * that only means something inside this repository, and the provider is always
 * the catalog's display name, never the id the CLI printed.
 *
 * `cloudUtilityErrorActions` classifies a different thing: editor utility calls
 * that surface as VS Code notifications. Do not merge the two.
 */

import { modelDisplayLabel, providerDisplayLabel } from '../model-picker/modelConstants';
import { t, tPlural, type MessageKey } from '../../l10n';
import { accountRefusalMessage } from '../../utils/accountRefusal';

export type ChatErrorCategory =
  | 'network'
  | 'sign-in'
  | 'provider'
  | 'tool'
  | 'rate-limit'
  | 'subscription'
  | 'permission'
  | 'runtime'
  | 'unknown';

/** What the error block should offer besides Retry, when the runtime named one. */
export interface ChatErrorAction {
  kind:
    | 'sign-in-provider'
    | 'sign-in-account'
    | 'upgrade-plan'
    | 'open-settings'
    | 'switch-model'
    | 'update-extension'
    | 'open-recovery';
  label: string;
  provider?: string;
}

/**
 * What a call site that already knows the failure says about it, for the
 * sentences the extension writes itself. Those match none of the CLI rules
 * below and would otherwise arrive as `unknown` with nothing to click.
 */
type OfferKind = Exclude<ChatErrorAction['kind'], 'sign-in-provider'>;

export interface ChatErrorHint {
  category: ChatErrorCategory;
  retryable?: boolean;
  action?: OfferKind;
}

const OFFER_LABELS: Readonly<Record<OfferKind, MessageKey>> = Object.freeze({
  'sign-in-account': 'chatError.signInToAgi',
  'upgrade-plan': 'chatError.upgradePlan',
  'open-settings': 'chatError.openSettings',
  'switch-model': 'chatError.switchModel',
  'update-extension': 'chatError.updateExtension',
  'open-recovery': 'chatError.seeOptions',
});

function offer(kind: OfferKind): ChatErrorAction {
  return { kind, label: t(OFFER_LABELS[kind]) };
}

export interface ChatErrorPresentation {
  category: ChatErrorCategory;
  /** One human sentence. Never the provider's own text. */
  headline: string;
  /** The raw failure, for the collapsed disclosure. Absent when it is the headline. */
  detail?: string;
  /** True only when resending the identical turn could plausibly succeed. */
  retryable: boolean;
  action?: ChatErrorAction;
  alternative?: { model: string; label: string };
}

type Classification = Omit<ChatErrorPresentation, 'detail'>;

const API_ERROR = /^\[([^\]]+)\] API error \(HTTP (\d{3})\)/u;
const AUTH_FAILED = /^\[([^\]]+)\] Authentication failed\b/u;
const RATE_LIMITED = /^\[([^\]]+)\] Rate limited\b/u;
const STREAM_ERROR = /^\[([^\]]+)\] Stream error\b/u;
const TOOL_FAILED = /^Tool '([^']+)' failed\b/u;
const NETWORK_ERROR = /^Network error \(/u;
const CONTEXT_OVERFLOW = /^Context overflow for model '([^']+)'/u;
const CONFIG_ERROR = /^Configuration error\b/u;
const PAYWALL = /^Cloud chat requires (\S+) plan\b/u;
const UPDATE_EXTENSION = /\bupdate the extension\b/iu;

const PERMISSION_TEXT = /\b(?:EACCES|EPERM|permission denied|not permitted|Workspace Trust)\b/iu;
const NETWORK_TEXT =
  /\b(?:ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT)\b|fetch failed|socket hang up/iu;
const RUNTIME_TEXT = /\bruntime\b.*\b(?:unavailable|disconnected|not ready|exited)\b/iu;

/**
 * Shape, not length, is what separates a machine string from prose: JSON, a
 * bracketed provider prefix, a status line, a newline or a stack frame. Length
 * alone would have buried the extension's own boundary refusals, which are long
 * on purpose and are the most useful thing a user can read at that moment.
 */
const MACHINE_SHAPED = /^\[|[{}]|\bHTTP \d{3}\b|\n|\bat [A-Za-z$_][\w$.]*\s\(/u;
const MACHINE_LENGTH = 600;

function fromApiStatus(providerId: string, status: number): Classification {
  const provider = providerDisplayLabel(providerId);
  if (status === 401 || status === 403) {
    return {
      category: 'sign-in',
      headline: t('chatError.keyRejected', { provider }),
      retryable: false,
    };
  }
  if (status === 402) {
    return {
      category: 'subscription',
      headline: t('chatError.notCoveredByPlan', { provider }),
      retryable: false,
    };
  }
  if (status === 429) {
    return {
      category: 'rate-limit',
      headline: t('chatError.rateLimiting', { provider }),
      retryable: true,
    };
  }
  if (status >= 500) {
    return {
      category: 'provider',
      headline: t('chatError.providerProblem', { provider }),
      retryable: true,
    };
  }
  return {
    category: 'provider',
    headline: t('chatError.providerRejected', { provider }),
    retryable: status === 408,
  };
}

function accountRefusalIn(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body.replace(/^:\s*/u, '')) as { error?: unknown } | null;
    return accountRefusalMessage(parsed?.error);
  } catch {
    return undefined;
  }
}

function classify(raw: string, activeProvider: string | undefined): Classification | null {
  if (UPDATE_EXTENSION.test(raw)) {
    return {
      category: 'runtime',
      headline: raw,
      retryable: false,
      action: offer('update-extension'),
    };
  }

  const api = API_ERROR.exec(raw);
  if (api?.[1] !== undefined && api[2] !== undefined) {
    const refusal = api[2] === '403' ? accountRefusalIn(raw.slice(api[0].length)) : undefined;
    if (refusal) return { category: 'sign-in', headline: refusal, retryable: false };
    return fromApiStatus(api[1], Number(api[2]));
  }

  const auth = AUTH_FAILED.exec(raw);
  if (auth?.[1] !== undefined) {
    return {
      category: 'sign-in',
      headline: t('chatError.keyRejected', { provider: providerDisplayLabel(auth[1]) }),
      retryable: false,
    };
  }

  const limited = RATE_LIMITED.exec(raw);
  if (limited?.[1] !== undefined) {
    return {
      category: 'rate-limit',
      headline: t('chatError.rateLimiting', { provider: providerDisplayLabel(limited[1]) }),
      retryable: true,
    };
  }

  const stream = STREAM_ERROR.exec(raw);
  if (stream?.[1] !== undefined) {
    return {
      category: 'provider',
      headline: t('chatError.stoppedPartWay', { provider: providerDisplayLabel(stream[1]) }),
      retryable: true,
    };
  }

  const tool = TOOL_FAILED.exec(raw);
  if (tool?.[1] !== undefined) {
    return {
      category: 'tool',
      headline: t('chatError.toolFailed', { tool: tool[1] }),
      retryable: false,
    };
  }

  if (NETWORK_ERROR.test(raw) || NETWORK_TEXT.test(raw)) {
    return {
      category: 'network',
      headline: t('chatError.couldNotReach', {
        provider: activeProvider ?? t('chatError.theModelProvider'),
      }),
      retryable: true,
    };
  }

  const overflow = CONTEXT_OVERFLOW.exec(raw);
  if (overflow?.[1] !== undefined) {
    return {
      category: 'provider',
      headline: t('chatError.tooLongForModel', { model: modelDisplayLabel(overflow[1]) }),
      retryable: false,
    };
  }

  const paywall = PAYWALL.exec(raw);
  if (paywall?.[1] !== undefined) {
    return {
      category: 'subscription',
      headline: t('chatError.planRequired', { plan: paywall[1] }),
      retryable: false,
    };
  }

  if (CONFIG_ERROR.test(raw)) {
    return {
      category: 'runtime',
      headline: t('chatError.runtimeSettings'),
      retryable: false,
    };
  }

  if (PERMISSION_TEXT.test(raw)) {
    return {
      category: 'permission',
      headline: t('chatError.noPermission'),
      retryable: false,
    };
  }

  if (RUNTIME_TEXT.test(raw)) {
    return {
      category: 'runtime',
      headline: t('chatError.runtimeNotRunning'),
      retryable: false,
    };
  }

  return null;
}

/**
 * The typed failure the app-server now sends. A closed code is the only thing
 * a client can branch on: the prose changes with every provider, so matching it
 * could never decide whether to offer a sign-in, a retry, or nothing.
 * `presentChatError` stays for a runtime that predates the object.
 */
export interface TurnFailureShape {
  code: string;
  message: string;
  provider?: string;
  retryable: boolean;
  action:
    'sign_in_provider' | 'sign_in_account' | 'upgrade_plan' | 'open_settings' | 'retry' | 'none';
  /** Seconds, and only ever the figure a provider itself asked for. */
  retryAfterSeconds?: number;
  /** The id the host logged this failure under, shown so a reader can quote it. */
  requestId?: string;
  alternativeModel?: string;
  resetsAt?: string;
  recoveryHref?: string;
}

const FAILURE_CATEGORY: Readonly<Record<string, ChatErrorCategory>> = Object.freeze({
  provider_auth_missing: 'sign-in',
  provider_auth_invalid: 'sign-in',
  account_signed_out: 'sign-in',
  plan_excludes_model: 'subscription',
  usage_limit_reached: 'subscription',
  provider_rate_limited: 'rate-limit',
  free_allowance_exhausted: 'rate-limit',
  provider_unavailable: 'provider',
  stream_interrupted: 'provider',
  context_window_exceeded: 'provider',
  output_limit_reached: 'provider',
  refused_by_safety: 'provider',
  network: 'network',
  tool_denied: 'permission',
  interrupted: 'unknown',
  timeout: 'network',
  invalid_request: 'runtime',
  unknown: 'unknown',
});

/**
 * A day is the longest wait worth putting in a sentence; past that the figure
 * is a provider's clock skew rather than a time to come back at. The host
 * applies the same bound (`MAX_STATED_RETRY_AFTER_SECONDS` in
 * crates/agiworkforce-protocol/src/developer_session.rs), so a figure that
 * reaches here outside the range came from somewhere that did not.
 */
const MAX_STATED_RETRY_AFTER_SECONDS = 86_400;

/**
 * The wait in the words a reader reads, or nothing. There is no fallback: a
 * reader who waits out a figure nobody sent, and fails again, stops believing
 * the next one.
 */
export function statedWait(retryAfterSeconds: number | undefined): string | null {
  if (typeof retryAfterSeconds !== 'number' || !Number.isFinite(retryAfterSeconds)) return null;
  const seconds = Math.round(retryAfterSeconds);
  if (seconds < 1 || seconds > MAX_STATED_RETRY_AFTER_SECONDS) return null;
  if (seconds < 90) return tPlural('chatError.aboutSeconds', seconds);
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return tPlural('chatError.aboutMinutes', minutes);
  return tPlural('chatError.aboutHours', Math.round(seconds / 3600));
}

/** The one string a reader hands to support, appended only when there is one. */
export function withFailureReference(text: string, requestId: string | undefined): string {
  const reference = requestId?.trim();
  return reference ? t('chatError.withReference', { text, reference }) : text;
}

function resetTime(resetsAt: string | undefined): string | null {
  if (resetsAt === undefined) return null;
  const at = Date.parse(resetsAt);
  if (!Number.isFinite(at) || at <= Date.now()) return null;
  return new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

const LOCAL_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);

export function safeRecoveryHref(href: string | undefined): string | undefined {
  if (href === undefined) return undefined;
  try {
    const url = new URL(href);
    const secure =
      url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname));
    return secure && url.username === '' && url.password === '' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

const RECOVERY_LABELS: Readonly<Record<string, MessageKey>> = Object.freeze({
  '/settings/billing': 'chatError.addCredits',
  '/pricing': 'chatError.comparePlans',
  '/settings/usage': 'chatError.seeUsage',
});

function recoveryOffer(href: string | undefined): ChatErrorAction | undefined {
  const safe = safeRecoveryHref(href);
  if (safe === undefined) return undefined;
  const label = RECOVERY_LABELS[new URL(safe).pathname] ?? 'chatError.seeOptions';
  return { kind: 'open-recovery', label: t(label) };
}

function failureHeadline(failure: TurnFailureShape, provider: string): string {
  const wait = statedWait(failure.retryAfterSeconds);
  switch (failure.code) {
    case 'account_signed_out':
      return t('chatError.signInToRun');
    case 'plan_excludes_model':
      return t('chatError.planExcludesModel');
    case 'usage_limit_reached': {
      if (wait) return t('chatError.usageLimitWait', { wait });
      const time = resetTime(failure.resetsAt);
      return time ? t('chatError.usageLimitResetsAt', { time }) : t('chatError.usageLimit');
    }
    case 'provider_auth_missing':
      return t('chatError.noProviderKey', { provider });
    case 'provider_auth_invalid':
      return t('chatError.keyRejected', { provider });
    case 'provider_rate_limited':
      return wait
        ? t('chatError.providerBusyWait', { provider, wait })
        : t('chatError.providerBusy', { provider });
    case 'free_allowance_exhausted':
      return wait ? t('chatError.freeAllowanceWait', { wait }) : t('chatError.freeAllowance');
    case 'provider_unavailable':
      return t('chatError.providerCouldNotAnswer', { provider });
    case 'stream_interrupted':
      return t('chatError.stoppedPartWay', { provider });
    case 'context_window_exceeded':
      return t('chatError.tooLong');
    case 'output_limit_reached':
      return t('chatError.outputLimit');
    case 'refused_by_safety':
      return t('chatError.safety');
    case 'network':
      return t('chatError.network');
    case 'tool_denied':
      return t('chatError.toolDenied');
    case 'interrupted':
      return t('chatError.interrupted');
    case 'timeout':
      return t('chatError.timeout', { provider });
    case 'invalid_request':
      return t('chatError.invalidRequest', { provider });
    default:
      return t('chatError.generic');
  }
}

/** The offer a failure earns, in the words every surface shows for it. */
export function turnFailureOffer(failure: {
  action: TurnFailureShape['action'];
  provider?: string;
}): ChatErrorAction | undefined {
  if (failure.action === 'sign_in_provider') {
    const provider =
      failure.provider === undefined
        ? t('chatError.theProvider')
        : providerDisplayLabel(failure.provider);
    return {
      kind: 'sign-in-provider',
      label: t('chatError.signInToProvider', { provider }),
      ...(failure.provider === undefined ? {} : { provider: failure.provider }),
    };
  }
  if (failure.action === 'sign_in_account') return offer('sign-in-account');
  if (failure.action === 'upgrade_plan') return offer('upgrade-plan');
  if (failure.action === 'open_settings') return offer('open-settings');
  return undefined;
}

/**
 * Another model is the move for every failure that belongs to this one route
 * and would happen again on a retry, which is why a spent free allowance is
 * here and a signed-out account is not.
 */
const SWITCH_MODEL_CODES: ReadonlySet<string> = new Set([
  'provider_unavailable',
  'provider_rate_limited',
  'free_allowance_exhausted',
  'stream_interrupted',
  'refused_by_safety',
]);

function switchModelOffer(code: TurnFailureShape['code']): ChatErrorAction | undefined {
  return SWITCH_MODEL_CODES.has(code) ? offer('switch-model') : undefined;
}

export function presentTurnFailure(failure: TurnFailureShape): ChatErrorPresentation {
  const provider =
    failure.provider === undefined
      ? t('chatError.theProvider')
      : providerDisplayLabel(failure.provider);
  const headline = withFailureReference(failureHeadline(failure, provider), failure.requestId);
  const detail = failure.message.trim();
  const action =
    recoveryOffer(failure.recoveryHref) ??
    turnFailureOffer(failure) ??
    switchModelOffer(failure.code);
  const alternative =
    failure.alternativeModel === undefined
      ? undefined
      : {
          model: failure.alternativeModel,
          label: t('chatError.continueWith', {
            model: modelDisplayLabel(failure.alternativeModel),
          }),
        };
  return {
    category: FAILURE_CATEGORY[failure.code] ?? 'unknown',
    headline,
    ...(detail === '' || detail === headline ? {} : { detail }),
    retryable: failure.retryable,
    ...(action === undefined ? {} : { action }),
    ...(alternative === undefined ? {} : { alternative }),
  };
}

export function presentChatError(
  raw: string,
  activeProvider?: string,
  hint?: ChatErrorHint,
): ChatErrorPresentation {
  const text = raw.trim();
  if (text === '') {
    return { category: 'unknown', headline: t('chatError.generic'), retryable: false };
  }

  const classified = classify(text, activeProvider);
  if (classified !== null) {
    // A classified failure always keeps its own text, so nothing the provider
    // said is lost, but the user reads the sentence first.
    return classified.headline === text ? classified : { ...classified, detail: text };
  }

  // Nothing matched, so the hint applies. A call site that caught a provider
  // string still loses to `classify`: what the provider said about itself beats
  // the situation the call site happened to be in.
  const category = hint?.category ?? 'unknown';
  const retryable = hint?.retryable ?? false;
  const hinted = hint?.action === undefined ? {} : { action: offer(hint.action) };

  // Anything machine-shaped goes behind Details so a raw provider string is
  // never the first thing a user reads; an extension-authored sentence is
  // already readable and becomes the headline unchanged.
  if (text.length > MACHINE_LENGTH || MACHINE_SHAPED.test(text)) {
    return {
      category,
      headline: t('chatError.generic'),
      detail: text,
      retryable,
      ...hinted,
    };
  }
  return { category, headline: text, retryable, ...hinted };
}
