export const BANK_ACCOUNTS_CONNECTOR_ID = 'bank-accounts';
export const BANK_ACCOUNTS_LINK_PATH = '/api/connectors/bank-accounts/link';
export const BANK_ACCOUNTS_EXCHANGE_PATH = '/api/connectors/bank-accounts/exchange';

type PlaidEnvironment = 'sandbox' | 'production';

export interface PlaidCredentials {
  readonly clientId: string;
  readonly secret: string;
  readonly origin: string;
}

const PLAID_API_ORIGINS: Readonly<Record<PlaidEnvironment, string>> = {
  sandbox: 'https://sandbox.plaid.com',
  production: 'https://production.plaid.com',
};

export const PLAID_LINK_SCRIPT_URL = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
const PLAID_LINK_FRAME_ORIGIN = 'https://cdn.plaid.com';

function plaidEnvironment(): PlaidEnvironment | null {
  const value = process.env['PLAID_ENV']?.trim().toLowerCase();
  return value === 'sandbox' || value === 'production' ? value : null;
}

export function plaidApiOrigin(): string | null {
  const environment = plaidEnvironment();
  return environment ? PLAID_API_ORIGINS[environment] : null;
}

export function plaidCredentials(): PlaidCredentials | null {
  const clientId = process.env['PLAID_CLIENT_ID']?.trim();
  const secret = process.env['PLAID_SECRET']?.trim();
  const origin = plaidApiOrigin();
  return clientId && secret && origin ? { clientId, secret, origin } : null;
}

export function missingPlaidEnv(): string[] {
  const missing: string[] = [];
  if (!process.env['PLAID_CLIENT_ID']?.trim()) missing.push('PLAID_CLIENT_ID');
  if (!process.env['PLAID_SECRET']?.trim()) missing.push('PLAID_SECRET');
  if (!plaidEnvironment()) missing.push('PLAID_ENV');
  return missing;
}

export function isPlaidConfigured(): boolean {
  return plaidCredentials() !== null;
}

export function plaidLinkContentSecurityOrigins(): {
  script: string[];
  frame: string[];
  connect: string[];
} {
  const origin = plaidApiOrigin();
  if (!origin) return { script: [], frame: [], connect: [] };
  return { script: [PLAID_LINK_SCRIPT_URL], frame: [PLAID_LINK_FRAME_ORIGIN], connect: [origin] };
}
