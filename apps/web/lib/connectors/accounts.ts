export const CONNECTOR_ACCOUNT_SCOPES = ['personal', 'work', 'service'] as const;
export type ConnectorAccountScope = (typeof CONNECTOR_ACCOUNT_SCOPES)[number];

/** The key every grant written before multi-account support carries. */
export const DEFAULT_CONNECTOR_ACCOUNT_KEY = 'default';
export const MAX_CONNECTOR_ACCOUNT_KEY_LENGTH = 128;

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

export function normalizeConnectorAccountKey(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return DEFAULT_CONNECTOR_ACCOUNT_KEY;
  return trimmed.slice(0, MAX_CONNECTOR_ACCOUNT_KEY_LENGTH);
}

const IDENTITY_CLAIMS = ['email', 'preferred_username', 'upn'] as const;
const MAX_ACCOUNT_LABEL_LENGTH = 200;

export function accountLabelFromIdToken(idToken: string | null | undefined): string | null {
  const payload = idToken?.split('.')[1];
  if (!payload) return null;
  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!claims || typeof claims !== 'object') return null;
  for (const claim of IDENTITY_CLAIMS) {
    const value = (claims as Record<string, unknown>)[claim];
    if (typeof value === 'string' && value.trim()) {
      return value.trim().slice(0, MAX_ACCOUNT_LABEL_LENGTH);
    }
  }
  return null;
}
