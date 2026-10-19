import { BILLING_PLAN_PRICING } from '@agiworkforce/types';
import { devAccountEmail, devAccountExternalId, type DevAccountSpec } from './catalog';

const CLERK_API = 'https://api.clerk.com/v1';
const DEV_ACCOUNT_FIRST_NAME = 'Test';

interface ClerkUser {
  id: string;
  external_id: string | null;
}

async function clerkRequest<T>(
  secretKey: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${CLERK_API}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  if (!response.ok) {
    throw new Error(
      `Clerk ${init.method ?? 'GET'} ${path} failed: HTTP ${response.status} ${await response.text()}`,
    );
  }
  return (await response.json()) as T;
}

export async function findDevAccountUserId(
  secretKey: string,
  name: string,
): Promise<string | null> {
  const users = await clerkRequest<ClerkUser[]>(
    secretKey,
    `/users?${new URLSearchParams({ external_id: devAccountExternalId(name) })}`,
  );
  return users.find((user) => user.external_id === devAccountExternalId(name))?.id ?? null;
}

/**
 * The development-instance user behind a test account. The address uses
 * Clerk's +clerk_test subaddress, so no mail is ever sent and the instance
 * accepts its fixed test code wherever a code is asked for.
 */
export async function ensureDevAccountUser(
  secretKey: string,
  account: DevAccountSpec,
): Promise<{ userId: string; created: boolean }> {
  const existing = await findDevAccountUserId(secretKey, account.name);
  if (existing) return { userId: existing, created: false };

  const created = await clerkRequest<ClerkUser>(secretKey, '/users', {
    method: 'POST',
    body: {
      external_id: devAccountExternalId(account.name),
      email_address: [devAccountEmail(account.name)],
      first_name: DEV_ACCOUNT_FIRST_NAME,
      last_name: `${BILLING_PLAN_PRICING[account.plan].label} (${account.name})`,
      skip_password_requirement: true,
      public_metadata: { agiDevAccount: account.name },
    },
  });
  return { userId: created.id, created: true };
}
