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
  kind: 'sign-in-provider' | 'sign-in-account' | 'upgrade-plan' | 'open-settings' | 'switch-model';
  label: string;
  provider?: string;
}

/**
 * What a call site that already knows the failure says about it, for the
 * sentences the extension writes itself. Those match none of the CLI rules
 * below and would otherwise arrive as `unknown` with nothing to click.
 */
export interface ChatErrorHint {
  category: ChatErrorCategory;
  retryable?: boolean;
  action?: ChatErrorAction;
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

/** What to call the provider when the failure text does not name one. */
const UNNAMED_PROVIDER = 'the model provider';

function fromApiStatus(providerId: string, status: number): Classification {
  const provider = providerDisplayLabel(providerId);
  if (status === 401 || status === 403) {
    return {
      category: 'sign-in',
      headline: `Your ${provider} key was rejected.`,
      retryable: false,
    };
  }
  if (status === 402) {
    return {
      category: 'subscription',
      headline: `${provider} says this request is not covered by your plan.`,
      retryable: false,
    };
  }
  if (status === 429) {
    return {
      category: 'rate-limit',
      headline: `${provider} is rate limiting requests. Try again in a moment.`,
      retryable: true,
    };
  }
  if (status >= 500) {
    return {
      category: 'provider',
      headline: `${provider} had a problem and could not answer. Try again.`,
      retryable: true,
    };
  }
  return {
    category: 'provider',
    headline: `${provider} rejected the request.`,
    retryable: status === 408,
  };
}

function classify(raw: string, activeProvider: string | undefined): Classification | null {
  const api = API_ERROR.exec(raw);
  if (api?.[1] !== undefined && api[2] !== undefined) {
    return fromApiStatus(api[1], Number(api[2]));
  }

  const auth = AUTH_FAILED.exec(raw);
  if (auth?.[1] !== undefined) {
    return {
      category: 'sign-in',
      headline: `Your ${providerDisplayLabel(auth[1])} key was rejected.`,
      retryable: false,
    };
  }

  const limited = RATE_LIMITED.exec(raw);
  if (limited?.[1] !== undefined) {
    return {
      category: 'rate-limit',
      headline: `${providerDisplayLabel(limited[1])} is rate limiting requests. Try again in a moment.`,
      retryable: true,
    };
  }

  const stream = STREAM_ERROR.exec(raw);
  if (stream?.[1] !== undefined) {
    return {
      category: 'provider',
      headline: `${providerDisplayLabel(stream[1])} stopped replying part way through.`,
      retryable: true,
    };
  }

  const tool = TOOL_FAILED.exec(raw);
  if (tool?.[1] !== undefined) {
    return {
      category: 'tool',
      headline: `The ${tool[1]} tool failed, so the reply stopped.`,
      retryable: false,
    };
  }

  if (NETWORK_ERROR.test(raw) || NETWORK_TEXT.test(raw)) {
    return {
      category: 'network',
      headline: `Couldn't reach ${activeProvider ?? UNNAMED_PROVIDER}. Check your connection and try again.`,
      retryable: true,
    };
  }

  const overflow = CONTEXT_OVERFLOW.exec(raw);
  if (overflow?.[1] !== undefined) {
    return {
      category: 'provider',
      headline: `This conversation is longer than ${modelDisplayLabel(overflow[1])} can read at once.`,
      retryable: false,
    };
  }

  const paywall = PAYWALL.exec(raw);
  if (paywall?.[1] !== undefined) {
    return {
      category: 'subscription',
      headline: `Cloud chat needs the ${paywall[1]} plan.`,
      retryable: false,
    };
  }

  if (CONFIG_ERROR.test(raw)) {
    return {
      category: 'runtime',
      headline: "AGI's local runtime could not read its settings.",
      retryable: false,
    };
  }

  if (PERMISSION_TEXT.test(raw)) {
    return {
      category: 'permission',
      headline: "AGI doesn't have permission for that action.",
      retryable: false,
    };
  }

  if (RUNTIME_TEXT.test(raw)) {
    return {
      category: 'runtime',
      headline: "AGI's local runtime isn't running.",
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

function counted(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

/**
 * The wait in the words a reader reads, or nothing. There is no fallback: a
 * reader who waits out a figure nobody sent, and fails again, stops believing
 * the next one.
 */
export function statedWait(retryAfterSeconds: number | undefined): string | null {
  if (typeof retryAfterSeconds !== 'number' || !Number.isFinite(retryAfterSeconds)) return null;
  const seconds = Math.round(retryAfterSeconds);
  if (seconds < 1 || seconds > MAX_STATED_RETRY_AFTER_SECONDS) return null;
  if (seconds < 90) return `about ${counted(seconds, 'second')}`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `about ${counted(minutes, 'minute')}`;
  return `about ${counted(Math.round(seconds / 3600), 'hour')}`;
}

/** The one string a reader hands to support, appended only when there is one. */
export function withFailureReference(text: string, requestId: string | undefined): string {
  const reference = requestId?.trim();
  return reference ? `${text} Reference: ${reference}` : text;
}

function failureHeadline(failure: TurnFailureShape, provider: string): string {
  const wait = statedWait(failure.retryAfterSeconds);
  switch (failure.code) {
    case 'account_signed_out':
      return 'Sign in to AGI to run this model on your plan.';
    case 'plan_excludes_model':
      return 'Your plan does not include this model.';
    case 'usage_limit_reached':
      return wait
        ? `You have reached a usage limit on your account. It reopens in ${wait}.`
        : 'You have reached a usage limit on your account. Check your usage to see when it resets.';
    case 'provider_auth_missing':
      return `AGI has no ${provider} key to run this with.`;
    case 'provider_auth_invalid':
      return `Your ${provider} key was rejected.`;
    case 'provider_rate_limited':
      return wait
        ? `${provider} is taking too many requests right now. Try again in ${wait}.`
        : `${provider} is taking too many requests right now. Try again in a moment, or switch model.`;
    case 'free_allowance_exhausted':
      return wait
        ? `The free model has used up the allowance everyone on the Free plan shares, so this is not a limit on your account. Try again in ${wait}.`
        : "The free model has used up the allowance everyone on the Free plan shares, so this is not a limit on your account. It resets on the provider's schedule.";
    case 'provider_unavailable':
      return `${provider} could not answer.`;
    case 'stream_interrupted':
      return `${provider} stopped replying part way through.`;
    case 'context_window_exceeded':
      return 'This conversation is longer than the model can read at once.';
    case 'output_limit_reached':
      return "The answer reached this model's maximum length and stopped there. Ask for a shorter answer, or split the request.";
    case 'refused_by_safety':
      return 'The safety system stopped this response. Rephrase the request, or try a different model.';
    case 'network':
      return 'This machine could not reach the provider.';
    case 'tool_denied':
      return 'The turn stopped because a tool was not allowed to run.';
    case 'interrupted':
      return 'The turn was stopped.';
    case 'timeout':
      return `${provider} took too long to answer.`;
    case 'invalid_request':
      return `AGI sent ${provider} a request it refused.`;
    default:
      return "AGI couldn't finish the reply.";
  }
}

/** The offer a failure earns, in the words every surface shows for it. */
export function turnFailureOffer(failure: {
  action: TurnFailureShape['action'];
  provider?: string;
}): ChatErrorAction | undefined {
  if (failure.action === 'sign_in_provider') {
    const provider =
      failure.provider === undefined ? 'the provider' : providerDisplayLabel(failure.provider);
    return {
      kind: 'sign-in-provider',
      label: `Sign in to ${provider}`,
      ...(failure.provider === undefined ? {} : { provider: failure.provider }),
    };
  }
  if (failure.action === 'sign_in_account') {
    return { kind: 'sign-in-account', label: 'Sign in to AGI' };
  }
  if (failure.action === 'upgrade_plan') {
    return { kind: 'upgrade-plan', label: 'Upgrade your plan' };
  }
  if (failure.action === 'open_settings') {
    return { kind: 'open-settings', label: 'Open settings' };
  }
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
  return SWITCH_MODEL_CODES.has(code) ? { kind: 'switch-model', label: 'Switch model' } : undefined;
}

export function presentTurnFailure(failure: TurnFailureShape): ChatErrorPresentation {
  const provider =
    failure.provider === undefined ? 'the provider' : providerDisplayLabel(failure.provider);
  const headline = withFailureReference(failureHeadline(failure, provider), failure.requestId);
  const detail = failure.message.trim();
  const action = turnFailureOffer(failure) ?? switchModelOffer(failure.code);
  return {
    category: FAILURE_CATEGORY[failure.code] ?? 'unknown',
    headline,
    ...(detail === '' || detail === headline ? {} : { detail }),
    retryable: failure.retryable,
    ...(action === undefined ? {} : { action }),
  };
}

export function presentChatError(
  raw: string,
  activeProvider?: string,
  hint?: ChatErrorHint,
): ChatErrorPresentation {
  const text = raw.trim();
  if (text === '') {
    return { category: 'unknown', headline: "AGI couldn't finish the reply.", retryable: false };
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
  const offer = hint?.action === undefined ? {} : { action: hint.action };

  // Anything machine-shaped goes behind Details so a raw provider string is
  // never the first thing a user reads; an extension-authored sentence is
  // already readable and becomes the headline unchanged.
  if (text.length > MACHINE_LENGTH || MACHINE_SHAPED.test(text)) {
    return {
      category,
      headline: "AGI couldn't finish the reply.",
      detail: text,
      retryable,
      ...offer,
    };
  }
  return { category, headline: text, retryable, ...offer };
}
