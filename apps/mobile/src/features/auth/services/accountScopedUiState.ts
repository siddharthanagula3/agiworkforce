import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  type CloudAccountEpoch,
} from './cloudAccountSession';

export type AccountScopedUiState =
  | { scope: 'local' }
  | { scope: 'cloud'; account: CloudAccountEpoch };

export function captureAccountScopedUiState(scope: 'local' | 'cloud'): AccountScopedUiState | null {
  if (scope === 'local') return { scope: 'local' };
  const account = captureCloudAccountEpoch();
  return account ? { scope: 'cloud', account } : null;
}

export function isAccountScopedUiStateCurrent(
  state: AccountScopedUiState | null | undefined,
  currentScope: 'local' | 'cloud',
): state is AccountScopedUiState {
  if (!state || state.scope !== currentScope) return false;
  return isAccountScopedUiStateOwned(state);
}

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
