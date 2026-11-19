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

/**
 * `shellOwnsCli` says whether this app is what signed the machine's CLI in. A
 * credential the user set up themselves is theirs: signing out of the app does
 * not sign the terminal out with it. `recordOwnership` is told the moment the
 * credential changes hands, before the model refresh that follows, so a refresh
 * that fails cannot leave the ownership record behind the credential.
 */
export async function reconcileDeveloperAccount(
  call: DeveloperAccountCall,
  bridge: DeveloperAccountBridge,
  shellOwnsCli = true,
  recordOwnership: (shellOwnsCli: boolean) => void = () => undefined,
): Promise<DeveloperAccountOutcome> {
  const identity = await bridge.readShellIdentity();
  if (identity === null) return 'unknown';

  const status = await call('account/status', {});
  const hostSignedIn = isRecord(status) && status['signedIn'] === true;

  if (!identity.signedIn) {
    if (!hostSignedIn || !shellOwnsCli) return 'unchanged';
    await call('account/logout', {});
    recordOwnership(false);
    await call('model/list', { refresh: true });
    return 'signed-out';
  }

  if (hostSignedIn) {
    if (sameAccount(readString(status, 'email'), identity.email)) return 'unchanged';
    await call('account/logout', {});
    recordOwnership(false);
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

  recordOwnership(true);
  await call('model/list', { refresh: true });
  return 'signed-in';
}
