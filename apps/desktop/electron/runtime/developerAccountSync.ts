export interface ShellIdentity {
  signedIn: boolean;
  email: string | null;
}

export interface DeveloperAccountBridge {
  readShellIdentity: () => Promise<ShellIdentity | null>;
  approveDeviceCode: (userCode: string) => Promise<void>;
}

export type DeveloperAccountCall = (
  method: string,
  params: Record<string, unknown>,
  timeoutMs?: number,
) => Promise<unknown>;

export type DeveloperAccountOutcome = 'unknown' | 'unchanged' | 'signed-in' | 'signed-out';

const ACCOUNT_LOGIN_WAIT_TIMEOUT_MS = 180_000;

const USER_CODE_PATTERN = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(source: unknown, key: string): string | null {
  if (!isRecord(source)) return null;
  const value = source[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * An unknown email on either side is not a mismatch. Reading it as one would
 * sign the app-server out and in again on every reconcile.
 */
function sameAccount(host: string | null, shell: string | null): boolean {
  if (host === null || shell === null) return true;
  return host.trim().toLowerCase() === shell.trim().toLowerCase();
}

export async function reconcileDeveloperAccount(
  call: DeveloperAccountCall,
  bridge: DeveloperAccountBridge,
): Promise<DeveloperAccountOutcome> {
  const identity = await bridge.readShellIdentity();
  if (identity === null) return 'unknown';

  const status = await call('account/status', {});
  const hostSignedIn = isRecord(status) && status['signedIn'] === true;

  if (!identity.signedIn) {
    if (!hostSignedIn) return 'unchanged';
    await call('account/logout', {});
    await call('model/list', { refresh: true });
    return 'signed-out';
  }

  if (hostSignedIn) {
    if (sameAccount(readString(status, 'email'), identity.email)) return 'unchanged';
    await call('account/logout', {});
  }

  const login = await call('account/login', {});
  const loginId = readString(login, 'loginId');
  const userCode = readString(login, 'userCode');
  if (!loginId || !userCode || !USER_CODE_PATTERN.test(userCode)) {
    throw new Error('The AGI CLI started no device sign-in this app could approve.');
  }

  await bridge.approveDeviceCode(userCode);

  const waited = await call('account/login/wait', { loginId }, ACCOUNT_LOGIN_WAIT_TIMEOUT_MS);
  if (readString(waited, 'outcome') !== 'completed') {
    throw new Error(
      readString(waited, 'message') ?? 'The AGI CLI did not finish signing in to this account.',
    );
  }

  await call('model/list', { refresh: true });
  return 'signed-in';
}
