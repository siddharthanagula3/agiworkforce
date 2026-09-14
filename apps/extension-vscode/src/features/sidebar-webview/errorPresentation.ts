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

import { getModelMetadataById } from '@agiworkforce/types';

import { providerDisplayLabel } from '../model-picker/modelConstants';

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

export interface ChatErrorPresentation {
  category: ChatErrorCategory;
  /** One human sentence. Never the provider's own text. */
  headline: string;
  /** The raw failure, for the collapsed disclosure. Absent when it is the headline. */
  detail?: string;
  /** True only when resending the identical turn could plausibly succeed. */
  retryable: boolean;
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

function modelDisplayName(modelId: string): string {
  return getModelMetadataById(modelId)?.name ?? modelId;
}

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
      headline: `This conversation is longer than ${modelDisplayName(overflow[1])} can read at once.`,
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

export function presentChatError(raw: string, activeProvider?: string): ChatErrorPresentation {
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

  // Nothing matched. An extension-authored sentence is already readable and
  // becomes the headline unchanged; anything machine-shaped goes behind Details
  // so a raw provider string is never the first thing a user reads.
  if (text.length > MACHINE_LENGTH || MACHINE_SHAPED.test(text)) {
    return {
      category: 'unknown',
      headline: "AGI couldn't finish the reply.",
      detail: text,
      retryable: false,
    };
  }
  return { category: 'unknown', headline: text, retryable: false };
}
