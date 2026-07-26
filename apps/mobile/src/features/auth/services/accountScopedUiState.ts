import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  type CloudAccountEpoch,
} from './cloudAccountSession';

export type AccountScopedUiState =
  | { scope: 'local' }
  | { scope: 'cloud'; account: CloudAccountEpoch };

/**
 * Capture the trust boundary that owns transient UI such as an open editor,
 * preview, quote, or confirmation callback.
 *
 * Cloud state must have a live account epoch. Local state is device-owned and
 * deliberately has no Clerk owner so it survives Cloud sign-out/switches.
 */
export function captureAccountScopedUiState(scope: 'local' | 'cloud'): AccountScopedUiState | null {
  if (scope === 'local') return { scope: 'local' };
  const account = captureCloudAccountEpoch();
  return account ? { scope: 'cloud', account } : null;
}

/**
 * A transient UI action is usable only while both its mode and account epoch
 * still match. The explicit current scope matters because account teardown
 * switches the app to Local before Clerk publishes the replacement owner.
 */
export function isAccountScopedUiStateCurrent(
  state: AccountScopedUiState | null | undefined,
  currentScope: 'local' | 'cloud',
): state is AccountScopedUiState {
  if (!state || state.scope !== currentScope) return false;
  return isAccountScopedUiStateOwned(state);
}

/** Check account ownership without imposing a mode match (for global galleries). */
export function isAccountScopedUiStateOwned(
  state: AccountScopedUiState | null | undefined,
): state is AccountScopedUiState {
  return Boolean(state && (state.scope === 'local' || isCloudAccountEpochCurrent(state.account)));
}

export function accountScopedUiStateKey(state: AccountScopedUiState | null): string {
  if (!state) return 'unavailable';
  return state.scope === 'local'
    ? 'local'
    : `cloud:${state.account.ownerId}:${state.account.epoch}`;
}
