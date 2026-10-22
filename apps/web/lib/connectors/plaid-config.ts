import { BANK_ACCOUNTS_CONNECTOR_ID as BANK_ID } from '@agiworkforce/cloud-contracts';

export {
  BANK_ACCOUNTS_CONNECTOR_ID,
  BANK_ACCOUNTS_EXCHANGE_PATH,
  BANK_ACCOUNTS_LINK_PATH,
} from '@agiworkforce/cloud-contracts';

import type { CloudChatSurface } from '@/lib/free-chat-surface-policy';

type PlaidEnvironment = 'sandbox' | 'production';

// The store builds do not declare financial data, so bank tools never reach a
// turn that the mobile app started.
const BANK_ACCOUNTS_UNAVAILABLE_SURFACES: ReadonlySet<CloudChatSurface> = new Set(['mobile']);

export function bankAccountsAvailableOnSurface(surface: CloudChatSurface): boolean {
  return !BANK_ACCOUNTS_UNAVAILABLE_SURFACES.has(surface);
}

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

export function connectorUnavailableOnSurface(
  connectorId: string,
  surface: CloudChatSurface,
): boolean {
  return connectorId === BANK_ID && !bankAccountsAvailableOnSurface(surface);
}
