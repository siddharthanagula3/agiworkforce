export const CONNECTOR_FAILURE_KINDS = [
  'authorization',
  'rate-limit',
  'not-found',
  'unavailable',
  'invalid-request',
  'blocked',
  'unknown',
] as const;
export type ConnectorFailureKind = (typeof CONNECTOR_FAILURE_KINDS)[number];

export interface ConnectorIdentity {
  connectorId: string;
  connectorLabel?: string | null;
  accountLabel?: string | null;
}

export function connectorIdentityName(identity: ConnectorIdentity): string {
  const label = identity.connectorLabel?.trim() || identity.connectorId;
  const account = identity.accountLabel?.trim();
  return account ? `${label} (${account})` : label;
}

const AUTHORIZATION_PATTERN =
  /\b(unauthori[sz]ed|forbidden|invalid[_ -]?grant|invalid[_ -]?token|token[_ -]?expired|expired[_ -]?token|revoked|insufficient[_ -]?(scope|permission)|reauthori[sz]|re-?connect)\b/i;
const RATE_LIMIT_PATTERN = /\b(rate[_ -]?limit|too many requests|quota exceeded|throttl)/i;
const NOT_FOUND_PATTERN = /\b(not[_ -]?found|no such|does not exist)\b/i;
const UNAVAILABLE_PATTERN =
  /\b(unavailable|timed? ?out|timeout|econnrefused|enotfound|bad gateway|gateway timeout|network error)\b/i;

export function classifyConnectorFailure(input: {
  status?: number | null;
  message?: string | null;
}): ConnectorFailureKind {
  const status = input.status ?? null;
  if (status === 401 || status === 403) return 'authorization';
  if (status === 429) return 'rate-limit';
  if (status === 404) return 'not-found';
  if (status !== null && status >= 500) return 'unavailable';
  if (status === 400 || status === 422) return 'invalid-request';

  const message = input.message ?? '';
  if (!message.trim()) return 'unknown';
  if (AUTHORIZATION_PATTERN.test(message)) return 'authorization';
  if (RATE_LIMIT_PATTERN.test(message)) return 'rate-limit';
  if (UNAVAILABLE_PATTERN.test(message)) return 'unavailable';
  if (NOT_FOUND_PATTERN.test(message)) return 'not-found';
  return 'unknown';
}

const FAILURE_SENTENCE: Record<ConnectorFailureKind, string> = {
  authorization: 'refused the authorization for this account. Reconnect it and run this again.',
  'rate-limit': 'is rate limiting this account. Wait for its limit to reset and run this again.',
  'not-found': 'answered that the thing this asked for does not exist.',
  unavailable: 'did not answer.',
  'invalid-request': 'rejected the request as invalid.',
  blocked: 'was never called: this platform refused the arguments before they left.',
  unknown: 'returned an error.',
};

export interface ConnectorFailureContext extends ConnectorIdentity {
  toolName: string;
  kind: ConnectorFailureKind;
  detail?: string | null;
}

/**
 * The sentence a failed connector call reports. It always names the connector,
 * the account and what failed, so no caller can reduce it to "no results".
 */
export function describeConnectorFailure(context: ConnectorFailureContext): string {
  const detail = context.detail?.trim();
  const base = `${connectorIdentityName(context)} ${FAILURE_SENTENCE[context.kind]}`;
  const attempted = ` This is a connector failure, not an empty result: ${context.toolName} did not return data.`;
  return detail ? `${base}${attempted} Provider said: ${detail}` : `${base}${attempted}`;
}

export type ConnectorOutcomeKind = 'ok' | 'empty' | 'failed' | 'reconnect';

export interface ConnectorOutcomeNotice {
  kind: ConnectorOutcomeKind;
  title: string;
  detail: string;
  actionLabel: string | null;
}

/**
 * The single decision that keeps an expired grant from rendering as "no
 * results": a call that failed is never an empty result, whatever it returned.
 */
export function connectorOutcomeNotice(
  input: ConnectorIdentity & {
    toolName: string;
    failure: ConnectorFailureKind | null;
    resultCount?: number | null;
    detail?: string | null;
  },
): ConnectorOutcomeNotice {
  const name = connectorIdentityName(input);
  if (input.failure === 'authorization') {
    return {
      kind: 'reconnect',
      title: `${name} needs to be reconnected`,
      detail: describeConnectorFailure({ ...input, kind: 'authorization' }),
      actionLabel: 'Reconnect',
    };
  }
  if (input.failure !== null) {
    return {
      kind: 'failed',
      title: `${name} could not answer`,
      detail: describeConnectorFailure({ ...input, kind: input.failure }),
      actionLabel: input.failure === 'unavailable' ? 'Try again' : null,
    };
  }
  if (input.resultCount === 0) {
    return {
      kind: 'empty',
      title: `${name} returned no results`,
      detail: `${name} answered ${input.toolName} and had nothing matching. The connector itself is working.`,
      actionLabel: null,
    };
  }
  return {
    kind: 'ok',
    title: `${name} answered`,
    detail: `${input.toolName} ran against ${name}.`,
    actionLabel: null,
  };
}
