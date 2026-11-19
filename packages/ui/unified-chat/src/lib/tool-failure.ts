import type { ConnectorAuthorizationReason } from './connector-connect-required';

const TOOL_ERROR_LABEL_PREFIX = /^Tool error:\s*/;
const TRUST_FENCE_WITH_SENTINEL =
  /^<([a-zA-Z][\w-]*)\b[^>]*>\n<!--[^\n]*-->\n([\s\S]*)\n<\/\1>\s*$/;
const SEALED_ENVELOPE = /^<([a-zA-Z][\w-]*)\b[^>]*>([\s\S]*)<\/\1>\s*$/;
const STACK_FRAME_LINE = /^\s*at\s+\S/;
const FENCE_ENTITY = /&lt;|&gt;|&amp;/g;
const FENCE_ENTITY_DECODE: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&amp;': '&' };
const MAX_ERROR_DISPLAY_CHARS = 500;
const NO_ERROR_DETAIL_TEXT = 'The tool failed without further details.';

function stripTrustFence(text: string): string {
  const fenced = TRUST_FENCE_WITH_SENTINEL.exec(text);
  if (fenced) return fenced[2] ?? '';
  const sealed = SEALED_ENVELOPE.exec(text);
  if (sealed) return sealed[2] ?? '';
  return text;
}

function stripStackFrames(text: string): string {
  const lines = text.split('\n');
  const firstFrame = lines.findIndex((line) => STACK_FRAME_LINE.test(line));
  if (firstFrame <= 0) return text;
  return lines.slice(0, firstFrame).join('\n');
}

export function humanizeToolErrorText(raw: string): string {
  let text = raw.trim().replace(TOOL_ERROR_LABEL_PREFIX, '');
  text = stripTrustFence(text.trim()).trim();
  text = text.replace(FENCE_ENTITY, (entity) => FENCE_ENTITY_DECODE[entity] ?? entity);
  text = stripStackFrames(text).trim();
  if (!text) return NO_ERROR_DETAIL_TEXT;
  return text.length > MAX_ERROR_DISPLAY_CHARS
    ? `${text.slice(0, MAX_ERROR_DISPLAY_CHARS).trimEnd()}…`
    : text;
}

export type ToolFailureKind =
  'rate-limited' | 'authorization' | 'permission-denied' | 'not-found' | 'timed-out' | 'unknown';

const HOST_TOOL_TIMEOUT = /^Tool \S+ timed out after [\d.]+s and was abandoned\.$/;
const HOST_PERMISSION_BLOCK =
  /^Tool "[^"\n]+" is blocked by this account's connector permissions and was not executed\./;
const UNTRUSTED_FENCE_OPEN = /<(?:mcp_tool_result|untrusted_tool_error)\b/;
const MCP_RESULT_ENVELOPE = /<mcp_tool_result\b([^>]*)>\n[^\n]*\n([^\n]*)/;
const MCP_ENVELOPE_STATUS = /\bstatus="([^"]*)"/;
const MCP_ENVELOPE_CODE = /\bcode="(-?\d+)"/;
const MCP_TRANSPORT_HTTP_STATUS = /^Error POSTing to endpoint \(HTTP (\d{3})\):/;
const HOST_HTTP_STATUS = /\bHTTP (\d{3})\b|\brefused the request \((\d{3})\)\./;
const MCP_RESOURCE_NOT_FOUND_CODE = '-32002';

const FAILURE_KIND_BY_HTTP_STATUS: Readonly<Record<string, ToolFailureKind>> = {
  '401': 'authorization',
  '403': 'permission-denied',
  '404': 'not-found',
  '408': 'timed-out',
  '410': 'not-found',
  '429': 'rate-limited',
  '504': 'timed-out',
};

function failureKindForHttpStatus(status: string | undefined): ToolFailureKind {
  return (status && FAILURE_KIND_BY_HTTP_STATUS[status]) || 'unknown';
}

// Everything inside a fence is the remote server's own text, so only the host's
// envelope attributes and the transport's status frame are read from it; a
// server that writes "HTTP 429" into its message must not choose the reason.
function classifyFencedToolFailure(text: string): ToolFailureKind {
  const envelope = MCP_RESULT_ENVELOPE.exec(text);
  if (!envelope) return 'unknown';
  const attributes = envelope[1] ?? '';
  const status = MCP_ENVELOPE_STATUS.exec(attributes)?.[1];
  if (status === 'server_error') {
    return MCP_ENVELOPE_CODE.exec(attributes)?.[1] === MCP_RESOURCE_NOT_FOUND_CODE
      ? 'not-found'
      : 'unknown';
  }
  if (status !== 'rejected') return 'unknown';
  return failureKindForHttpStatus(MCP_TRANSPORT_HTTP_STATUS.exec(envelope[2] ?? '')?.[1]);
}

export function classifyToolFailure(raw: string | undefined): ToolFailureKind {
  const text = raw?.trim();
  if (!text) return 'unknown';
  if (HOST_TOOL_TIMEOUT.test(text)) return 'timed-out';
  if (HOST_PERMISSION_BLOCK.test(text)) return 'permission-denied';
  if (UNTRUSTED_FENCE_OPEN.test(text)) return classifyFencedToolFailure(text);
  const status = HOST_HTTP_STATUS.exec(text);
  return failureKindForHttpStatus(status?.[1] ?? status?.[2]);
}

const TOOL_FAILURE_REASONS: Readonly<Record<ToolFailureKind, string | undefined>> = {
  'rate-limited': 'Rate limited, try again in a minute.',
  authorization: 'The saved credential was rejected.',
  'permission-denied': 'Permission denied.',
  'not-found': 'The item was not found.',
  'timed-out': 'It took too long to respond.',
  unknown: undefined,
};

export function toolFailureReason(kind: ToolFailureKind): string | undefined {
  return TOOL_FAILURE_REASONS[kind];
}

export const CONNECTOR_AUTHORIZATION_REASONS: Readonly<
  Record<ConnectorAuthorizationReason, string>
> = {
  not_connected: 'It is not connected.',
  authorization_expired: 'Its authorization expired or was revoked.',
  insufficient_scope: 'It needs more permission.',
  authorization_unavailable: 'The saved authorization was rejected.',
};
