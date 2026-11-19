import { getClerkInstance } from '@clerk/expo';
import { classifyAuthError } from '@agiworkforce/client-runtime';
import { CLERK_PUBLISHABLE_KEY } from '@/src/integrations/clerk';
import { getAuthToken } from '@/services/authSession';
import { releasePushDeviceForAccountChange } from '@/src/features/auth/services/pushTokenAccountLifecycle';

export type DeviceAccountsClerk = ReturnType<typeof getClerkInstance>;
type DeviceSession = NonNullable<DeviceAccountsClerk['client']>['signedInSessions'][number];

export interface DeviceAccount {
  sessionId: string;
  userId: string;
  name: string | null;
  email: string;
  imageUrl: string | null;
  active: boolean;
}

export interface DeviceAccounts {
  multiSession: boolean;
  accounts: DeviceAccount[];
}

export const NO_DEVICE_ACCOUNTS: DeviceAccounts = { multiSession: false, accounts: [] };

export class DeviceAccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeviceAccountError';
  }
}

export function getDeviceAccountsClerk(): DeviceAccountsClerk | null {
  try {
    return getClerkInstance({ publishableKey: CLERK_PUBLISHABLE_KEY }) ?? null;
  } catch {
    return null;
  }
}

/**
 * Clerk documents no public runtime read of the instance's session mode. Its own
 * Expo SDK reads instance settings from `__internal_environment.authConfig`, so
 * this does the same and treats anything but an explicit `false` as single-session.
 */
export function readMultiSessionAllowed(clerk: DeviceAccountsClerk): boolean {
  const environment = (
    clerk as unknown as {
      __internal_environment?: { authConfig?: { singleSessionMode?: unknown } } | null;
    }
  ).__internal_environment;
  return environment?.authConfig?.singleSessionMode === false;
}

function accountFromSession(session: DeviceSession, activeSessionId: string | null) {
  const user = session.user;
  const publicData = session.publicUserData;
  const userId = user?.id ?? publicData?.userId ?? null;
  const email = user?.primaryEmailAddress?.emailAddress ?? publicData?.identifier ?? null;
  if (!userId || !email) return null;
  const composedName = [publicData?.firstName, publicData?.lastName].filter(Boolean).join(' ');
  return {
    sessionId: session.id,
    userId,
    name: user?.fullName?.trim() || composedName.trim() || null,
    email,
    imageUrl: user?.imageUrl || publicData?.imageUrl || null,
    active: session.id === activeSessionId,
  } satisfies DeviceAccount;
}

export function readDeviceAccounts(clerk: DeviceAccountsClerk | null): DeviceAccounts {
  if (!clerk) return NO_DEVICE_ACCOUNTS;
  const multiSession = readMultiSessionAllowed(clerk);
  const activeSessionId = clerk.session?.id ?? null;
  const sessions = clerk.client?.signedInSessions ?? [];
  const accounts: DeviceAccount[] = [];
  for (const session of sessions) {
    if (session.status !== 'active') continue;
    const account = accountFromSession(session, activeSessionId);
    if (account) accounts.push(account);
  }
  return { multiSession, accounts };
}

export function sameDeviceAccounts(a: DeviceAccounts, b: DeviceAccounts): boolean {
  if (a.multiSession !== b.multiSession || a.accounts.length !== b.accounts.length) return false;
  return a.accounts.every((account, index) => {
    const other = b.accounts[index]!;
    return (
      account.sessionId === other.sessionId &&
      account.userId === other.userId &&
      account.name === other.name &&
      account.email === other.email &&
      account.imageUrl === other.imageUrl &&
      account.active === other.active
    );
  });
}

export function activeDeviceAccount(accounts: DeviceAccounts): DeviceAccount | null {
  return accounts.accounts.find((account) => account.active) ?? null;
}

export interface DeviceAccountHandover {
  ending: DeviceAccount;
  next: DeviceAccount;
}

export function planSignOutHandover(accounts: DeviceAccounts): DeviceAccountHandover | null {
  if (!accounts.multiSession) return null;
  const ending = activeDeviceAccount(accounts);
  const next = accounts.accounts.find((account) => !account.active);
  return ending && next ? { ending, next } : null;
}

export type DeviceAccountAction = 'switch' | 'sign-out' | 'add';

const DEVICE_ACCOUNT_FAILURE: Readonly<Record<DeviceAccountAction, string>> = {
  switch: 'Could not switch accounts. Try again.',
  'sign-out': 'Could not log out of this account. Try again.',
  add: 'Could not add an account. Try again.',
};

export function deviceAccountErrorMessage(cause: unknown, action: DeviceAccountAction): string {
  if (cause instanceof DeviceAccountError) return cause.message;
  switch (classifyAuthError(cause).kind) {
    case 'network_unreachable':
      return 'Could not reach the server. Check your connection and try again.';
    case 'rate_limited':
      return 'Too many attempts. Try again later.';
    default:
      return DEVICE_ACCOUNT_FAILURE[action];
  }
}

export async function releaseActiveAccountPushDevice(): Promise<void> {
  await releasePushDeviceForAccountChange(await getAuthToken().catch(() => null));
}

export async function activateDeviceSession(
  clerk: DeviceAccountsClerk,
  sessionId: string,
): Promise<void> {
  await clerk.setActive({ session: sessionId });
}

export function activeDeviceSessionId(clerk: DeviceAccountsClerk): string | null {
  return clerk.session?.id ?? null;
}

export async function endDeviceSession(
  clerk: DeviceAccountsClerk,
  sessionId: string,
): Promise<void> {
  await clerk.signOut({ sessionId });
}
