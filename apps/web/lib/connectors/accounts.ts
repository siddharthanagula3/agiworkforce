export const CONNECTOR_ACCOUNT_SCOPES = ['personal', 'work', 'service'] as const;
export type ConnectorAccountScope = (typeof CONNECTOR_ACCOUNT_SCOPES)[number];

/** The key every grant written before multi-account support carries. */
export const DEFAULT_CONNECTOR_ACCOUNT_KEY = 'default';
export const MAX_CONNECTOR_ACCOUNT_KEY_LENGTH = 128;

export function isConnectorAccountScope(value: unknown): value is ConnectorAccountScope {
  return (
    typeof value === 'string' && (CONNECTOR_ACCOUNT_SCOPES as readonly string[]).includes(value)
  );
}

export interface ConnectorAccount {
  connectorId: string;
  accountKey: string;
  accountLabel: string | null;
  scope: ConnectorAccountScope;
  isDefault: boolean;
  grantedScopes: string[];
  connectedAt: string;
  updatedAt: string;
  needsReauthorization: boolean;
}

const SCOPE_NOUN: Record<ConnectorAccountScope, string> = {
  personal: 'Personal',
  work: 'Work',
  service: 'Service account',
};

export function connectorAccountDisplayName(account: ConnectorAccount): string {
  if (account.accountLabel?.trim()) return account.accountLabel.trim();
  if (account.accountKey === DEFAULT_CONNECTOR_ACCOUNT_KEY) return SCOPE_NOUN[account.scope];
  return `${SCOPE_NOUN[account.scope]} (${account.accountKey})`;
}

export function normalizeConnectorAccountKey(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return DEFAULT_CONNECTOR_ACCOUNT_KEY;
  return trimmed.slice(0, MAX_CONNECTOR_ACCOUNT_KEY_LENGTH);
}

/** Default first, then work before personal before service, then newest. */
export function sortConnectorAccounts(accounts: readonly ConnectorAccount[]): ConnectorAccount[] {
  const order: Record<ConnectorAccountScope, number> = { work: 0, personal: 1, service: 2 };
  return [...accounts].sort((left, right) => {
    if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
    if (left.scope !== right.scope) return order[left.scope] - order[right.scope];
    return Date.parse(right.connectedAt) - Date.parse(left.connectedAt);
  });
}

export interface ConnectorAccountRequest {
  accountKey?: string | null;
  scope?: ConnectorAccountScope | null;
}

export type ConnectorAccountSelectionFailure =
  'no-accounts' | 'unknown-account' | 'scope-mismatch' | 'ambiguous';

export type ConnectorAccountSelection =
  | { status: 'selected'; account: ConnectorAccount }
  | { status: 'unresolved'; reason: ConnectorAccountSelectionFailure; message: string };

function listNames(accounts: readonly ConnectorAccount[]): string {
  return accounts.map(connectorAccountDisplayName).join(', ');
}

/**
 * Which connected account a call uses. Nothing here guesses across a scope
 * boundary: a request that asks for work never resolves to a personal account,
 * and several candidates with no default are reported rather than picked, since
 * picking one is exactly how a personal mailbox ends up answering for work.
 */
export function selectConnectorAccount(
  accounts: readonly ConnectorAccount[],
  connectorId: string,
  request: ConnectorAccountRequest = {},
): ConnectorAccountSelection {
  const label = connectorId;
  const own = accounts.filter((account) => account.connectorId === connectorId);
  if (own.length === 0) {
    return {
      status: 'unresolved',
      reason: 'no-accounts',
      message: `No account is connected for ${label}.`,
    };
  }

  const requestedKey = request.accountKey?.trim();
  if (requestedKey) {
    const match = own.find((account) => account.accountKey === requestedKey);
    if (!match) {
      return {
        status: 'unresolved',
        reason: 'unknown-account',
        message: `${label} has no connected account "${requestedKey}". Connected: ${listNames(own)}.`,
      };
    }
    if (request.scope && match.scope !== request.scope) {
      return {
        status: 'unresolved',
        reason: 'scope-mismatch',
        message: `${connectorAccountDisplayName(match)} is a ${match.scope} account for ${label}, and this request is ${request.scope}. Nothing was sent.`,
      };
    }
    return { status: 'selected', account: match };
  }

  const candidates = request.scope ? own.filter((account) => account.scope === request.scope) : own;
  if (candidates.length === 0) {
    return {
      status: 'unresolved',
      reason: 'scope-mismatch',
      message: `${label} has no ${request.scope} account connected. Connected: ${listNames(own)}.`,
    };
  }
  if (candidates.length === 1)
    return { status: 'selected', account: candidates[0] as ConnectorAccount };

  const preferred = candidates.find((account) => account.isDefault);
  if (preferred) return { status: 'selected', account: preferred };
  return {
    status: 'unresolved',
    reason: 'ambiguous',
    message: `${label} has more than one connected account and none is the default: ${listNames(candidates)}. Choose one before running this.`,
  };
}
