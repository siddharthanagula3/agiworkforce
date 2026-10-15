export { getFriendlyError, formatErrorForChat, getErrorMessage } from '@agiworkforce/utils';
export type { FriendlyError } from '@agiworkforce/utils';

export const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';
export const CONNECTION_FAILED_MESSAGE = 'Connection failed. Check your internet connection.';
export const INVALID_API_KEY_MESSAGE =
  'Invalid API key. Update it in Settings, under Models & Keys.';
export const TOO_MANY_REQUESTS_MESSAGE = 'Too many requests. Wait a moment and try again.';
export const SERVER_ERROR_MESSAGE = 'Server error. Try again in a moment.';
export const TOOK_TOO_LONG_MESSAGE = 'The request took too long. Try again in a moment.';
export const REQUEST_REFUSED_MESSAGE = 'The server refused this request.';
export const STREAM_STALLED_MESSAGE =
  'The request took too long. Try a shorter message or switch models.';

const SHOWN_LINES = 2;
const SHOWN_LENGTH = 300;

interface ReadError {
  text: string;
  /** The `llm_error_type` of a native `LLMError`, or a Node errno. */
  code: string | null;
  status: number | null;
  /** Thrown by the JavaScript runtime or the browser, so its wording is theirs. */
  runtimeWording: boolean;
}

const RUNTIME_ERROR_NAMES = new Set([
  'TypeError',
  'ReferenceError',
  'RangeError',
  'SyntaxError',
  'EvalError',
  'URIError',
  'InternalError',
]);

const NATIVE_ERROR_TAGS = ['llm_error_type', 'tool_type', 'resource_type'] as const;

function stringField(source: object, field: string): string | null {
  const value = (source as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : null;
}

function statusField(source: object): number | null {
  const record = source as Record<string, unknown>;
  const status = record['status'] ?? record['statusCode'];
  return typeof status === 'number' ? status : null;
}

// jsdom and a second realm hand over a DOMException that fails `instanceof`.
function isDomException(error: object): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) return true;
  return Object.prototype.toString.call(error) === '[object DOMException]';
}

/**
 * A native command rejects with a string, or with a serialised `AGIError`:
 * `{ type, details }`, where `details` is the sentence or a nested
 * `{ llm_error_type | tool_type | resource_type, message }`.
 */
function readError(error: unknown): ReadError | null {
  if (typeof error === 'string') {
    return { text: error, code: null, status: null, runtimeWording: false };
  }
  if (typeof error !== 'object' || error === null) return null;

  const fromBrowser = isDomException(error);
  if (fromBrowser || error instanceof Error) {
    const name = stringField(error, 'name') ?? '';
    return {
      text: stringField(error, 'message') ?? '',
      code: name === 'TimeoutError' ? 'Timeout' : stringField(error, 'code'),
      status: statusField(error),
      runtimeWording: fromBrowser || RUNTIME_ERROR_NAMES.has(name),
    };
  }

  const details = (error as { details?: unknown }).details;
  if (typeof details === 'string') {
    return { text: details, code: null, status: null, runtimeWording: false };
  }
  if (typeof details === 'object' && details !== null) {
    const message = stringField(details, 'message');
    if (message !== null) {
      const tag = NATIVE_ERROR_TAGS.find((name) => stringField(details, name) !== null);
      return {
        text: message,
        code: tag === 'llm_error_type' ? stringField(details, tag) : null,
        status: null,
        runtimeWording: false,
      };
    }
  }

  const message = stringField(error, 'message');
  if (message === null) return null;
  return {
    text: message,
    code: stringField(error, 'code'),
    status: statusField(error),
    runtimeWording: false,
  };
}

const CODE_MESSAGES = new Map<string, string>([
  ['RateLimitError', TOO_MANY_REQUESTS_MESSAGE],
  ['AuthenticationError', INVALID_API_KEY_MESSAGE],
  ['NetworkError', CONNECTION_FAILED_MESSAGE],
  ['Timeout', TOOK_TOO_LONG_MESSAGE],
  ['ECONNREFUSED', CONNECTION_FAILED_MESSAGE],
  ['ECONNRESET', CONNECTION_FAILED_MESSAGE],
  ['ENOTFOUND', CONNECTION_FAILED_MESSAGE],
  ['EAI_AGAIN', CONNECTION_FAILED_MESSAGE],
  ['ENETUNREACH', CONNECTION_FAILED_MESSAGE],
  ['EHOSTUNREACH', CONNECTION_FAILED_MESSAGE],
  ['ETIMEDOUT', TOOK_TOO_LONG_MESSAGE],
]);

function statusMessage(status: number): string | null {
  if (status === 401) return INVALID_API_KEY_MESSAGE;
  if (status === 403) return REQUEST_REFUSED_MESSAGE;
  if (status === 408) return TOOK_TOO_LONG_MESSAGE;
  if (status === 429) return TOO_MANY_REQUESTS_MESSAGE;
  if (status >= 500 && status <= 599) return SERVER_ERROR_MESSAGE;
  return null;
}

const MODEL_SERVER = 'The model server';
const SERVER = 'The server';

/**
 * A status that arrives with the server's own detail keeps it: "Server error.
 * Try again" for a local model that ran out of memory hides the one fact that
 * helps.
 */
function statusSentence(status: number, detail: string | null, server: string): string | null {
  const bare = statusMessage(status);
  if (bare === null || detail === null) return bare;
  if (status === 403) return `${server} refused this request: ${detail}`;
  if (status >= 500) return `${server} reported an error: ${detail}`;
  return `${bare} ${server} said: ${detail}`;
}

const OWN_OPENINGS = [
  GENERIC_ERROR_MESSAGE,
  CONNECTION_FAILED_MESSAGE,
  INVALID_API_KEY_MESSAGE,
  TOO_MANY_REQUESTS_MESSAGE,
  SERVER_ERROR_MESSAGE,
  TOOK_TOO_LONG_MESSAGE,
  REQUEST_REFUSED_MESSAGE,
  STREAM_STALLED_MESSAGE,
  `${MODEL_SERVER} `,
  `${SERVER} refused this request: `,
  `${SERVER} reported an error: `,
];

const HTTP_REASON =
  'Unauthorized|Forbidden|Request Timeout|Too Many Requests|Internal Server Error|Bad Gateway|Service Unavailable|Gateway Time-?out';
const BARE_HTTP_REASON = new RegExp(`^(?:${HTTP_REASON})[.!]?$`, 'i');
const DETAIL = '(?:(?:\\s*:\\s*|\\s+-\\s+)([\\s\\S]*))?';

interface StatusForm {
  form: RegExp;
  server: string;
}

/**
 * Where a status sits when it is a status: alone or leading, after `HTTP`,
 * in reqwest's `HTTP status client error (401 ...)`, in the native
 * `<provider> API error 429:` and in a trailing `(HTTP 500)`. A number inside
 * a sentence is not one. The second group, where a form has one, is the
 * detail that follows the status and a separator.
 */
const STATUS_FORMS: StatusForm[] = [
  { form: new RegExp(`^(\\d{3})(?:\\s+(?:${HTTP_REASON}))?${DETAIL}$`, 'i'), server: SERVER },
  {
    form: new RegExp(
      `^HTTP(?:\\/\\d(?:\\.\\d)?)?\\s+(?:status\\s+)?(?:code\\s+)?(\\d{3})\\b(?:\\s+(?:${HTTP_REASON}))?${DETAIL}`,
      'i',
    ),
    server: SERVER,
  },
  { form: /^HTTP status (?:client|server) error \((\d{3})\b/i, server: SERVER },
  { form: /^status(?: code)?:?\s+(\d{3})(?:\s*:\s*([\s\S]+)|$|[\s,.])/i, server: SERVER },
  { form: /^[\w .-]{0,40}\bAPI error \(?(\d{3})\)?:\s*([\s\S]*)/i, server: MODEL_SERVER },
  { form: /\(HTTP (\d{3})\)\.?$/i, server: SERVER },
];

const PROVIDER_CODE_FORM = /^[\w .-]{0,40}\bAPI error \(([A-Za-z_]+)\):\s*([\s\S]*)/;

const STREAM_WATCHDOG_MARKER = /\bstream_watchdog_timeout\b/i;
const AUTH_CODE = /\b(?:invalid_api_key|authentication_error|API_KEY_INVALID|UNAUTHENTICATED)\b/;
const RATE_LIMIT_CODE = /\b(?:rate_limit_exceeded|rate_limit_error|RESOURCE_EXHAUSTED)\b/;
const OVERLOADED_CODE = /\boverloaded_error\b/;
const RATE_LIMIT_PHRASE =
  /\brate limits? (?:exceeded|reached|hit)\b|\b(?:exceeded|reached|hit) (?:the |your |a )?rate limit\b|\brate[- ]limited\b|\btoo many requests\b/i;

const BROWSER_FETCH_FAILURE =
  /^(?:TypeError: )?(?:Failed to fetch|Load failed|NetworkError when attempting to fetch resource|Network request failed|fetch failed|The Internet connection appears to be offline|The network connection was lost|Could not connect to the server|A server with the specified hostname could not be found)\.?$|^Failed to fetch dynamically imported module\b/i;
const TRANSPORT_FAILURE =
  /^(?:error sending request\b|error trying to connect\b|tcp connect error\b|dns error\b|connection (?:refused|reset|closed)\b)/i;
const CONNECTION_ERRNO =
  /\b(?:ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH)\b|\bnet::ERR_[A-Z_]+/;

const TIMEOUT_INSIDE_TRANSPORT = /\boperation timed out\b|\bdeadline has elapsed\b/i;
const TIMEOUT_FORM =
  /^(?:(?:the )?(?:request|connection|operation) )?(?:timed out|timeout)\.?$|^operation timed out\b|^deadline has elapsed\b|^timeout of \d+ ?ms exceeded\b|^The operation was aborted due to timeout\b|^signal timed out\b/i;
const TIMEOUT_ERRNO = /\bETIMEDOUT\b/;

const BARE_UNAUTHORIZED = /^unauthori[sz]ed\.?$/i;
const BARE_SERVER_ERROR = /^(?:internal )?server error\.?$/i;

function cleaned(text: string): string {
  const lines = text
    .split(/\r\n|\r|\n/)
    .map((line) => line.replace(/\p{Cc}/gu, ' ').trim())
    .filter(Boolean);
  const shown = Array.from(lines.slice(0, SHOWN_LINES).join(' '));
  if (shown.length <= SHOWN_LENGTH) return shown.join('');
  return `${shown
    .slice(0, SHOWN_LENGTH - 1)
    .join('')
    .trimEnd()}…`;
}

function ownWording(text: string): string {
  return cleaned(text) || GENERIC_ERROR_MESSAGE;
}

const BODY_WORDS = ['message', 'error', 'detail'] as const;

/** The sentence inside a JSON error body, or nothing when it holds none. */
function wordsInBody(body: string): string {
  if (!body.startsWith('{')) return body;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return '';
  }
  for (let depth = 0; depth < 2; depth += 1) {
    if (typeof parsed !== 'object' || parsed === null) return '';
    const holder: object = parsed;
    const words = BODY_WORDS.map((field) => stringField(holder, field)).find(Boolean);
    if (words) return words;
    parsed = (holder as { error?: unknown }).error;
  }
  return '';
}

function serverDetail(raw: string | undefined): string | null {
  const words = wordsInBody((raw ?? '').trim());
  if (BARE_HTTP_REASON.test(words.trim())) return null;
  return cleaned(words) || null;
}

function statusShaped(text: string): string | null {
  for (const { form, server } of STATUS_FORMS) {
    const found = form.exec(text);
    if (!found?.[1]) continue;
    const sentence = statusSentence(Number(found[1]), serverDetail(found[2]), server);
    if (sentence) return sentence;
  }
  return null;
}

function providerCodeStatus(code: string): number | null {
  if (AUTH_CODE.test(code)) return 401;
  if (RATE_LIMIT_CODE.test(code)) return 429;
  if (OVERLOADED_CODE.test(code)) return 529;
  return null;
}

function providerCodeShaped(text: string): string | null {
  const found = PROVIDER_CODE_FORM.exec(text);
  const status = found?.[1] ? providerCodeStatus(found[1]) : null;
  return status === null ? null : statusSentence(status, serverDetail(found?.[2]), MODEL_SERVER);
}

function providerCodeInText(text: string): string | null {
  if (AUTH_CODE.test(text)) return INVALID_API_KEY_MESSAGE;
  if (RATE_LIMIT_CODE.test(text)) return TOO_MANY_REQUESTS_MESSAGE;
  if (OVERLOADED_CODE.test(text)) return SERVER_ERROR_MESSAGE;
  return null;
}

function transportMessage(text: string): string | null {
  if (STREAM_WATCHDOG_MARKER.test(text)) return STREAM_STALLED_MESSAGE;

  const shaped = providerCodeShaped(text) ?? statusShaped(text) ?? providerCodeInText(text);
  if (shaped) return shaped;

  if (RATE_LIMIT_PHRASE.test(text)) return TOO_MANY_REQUESTS_MESSAGE;
  if (TIMEOUT_FORM.test(text) || TIMEOUT_ERRNO.test(text)) return TOOK_TOO_LONG_MESSAGE;
  if (TRANSPORT_FAILURE.test(text)) {
    return TIMEOUT_INSIDE_TRANSPORT.test(text) ? TOOK_TOO_LONG_MESSAGE : CONNECTION_FAILED_MESSAGE;
  }
  if (BROWSER_FETCH_FAILURE.test(text) || CONNECTION_ERRNO.test(text)) {
    return CONNECTION_FAILED_MESSAGE;
  }
  if (BARE_UNAUTHORIZED.test(text)) return INVALID_API_KEY_MESSAGE;
  if (BARE_SERVER_ERROR.test(text)) return SERVER_ERROR_MESSAGE;
  return null;
}

/**
 * The sentence to show for a caught error.
 *
 * What a native command says is its own reason and is shown: its first lines,
 * bounded, with control characters removed. Only a transport or provider
 * failure is reworded, and it is recognised by its shape, a status standing as
 * a status, a provider's error code, the browser's fetch wording, never by a
 * word that a sentence of ours might also contain. A sentence this function
 * wrote is left as it is, so a caller may pass one through again. The generic
 * sentence is for an error that carries no words, and for the runtime's own
 * wording.
 */
export function getSimpleErrorMessage(err: unknown): string {
  const read = readError(err);
  if (read === null) return GENERIC_ERROR_MESSAGE;

  const text = read.text.trim();
  if (OWN_OPENINGS.some((opening) => text.startsWith(opening))) return ownWording(text);

  const fromCode = read.code === null ? undefined : CODE_MESSAGES.get(read.code);
  if (fromCode) return fromCode;

  if (read.status !== null) {
    const fromStatus =
      statusShaped(text) ?? statusSentence(read.status, serverDetail(text), SERVER);
    if (fromStatus) return fromStatus;
  }

  const transport = transportMessage(text);
  if (transport) return transport;

  if (read.runtimeWording) return GENERIC_ERROR_MESSAGE;
  return ownWording(text);
}
