jest.mock('../lib/mmkv', () => ({
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

import {
  accountScopedUiStateKey,
  captureAccountScopedUiState,
  isAccountScopedUiStateCurrent,
  isAccountScopedUiStateOwned,
} from '../src/features/auth/services/accountScopedUiState';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

describe('account-scoped transient UI provenance', () => {
  beforeEach(() => {
    __resetCloudAccountSessionForTests();
    activateCloudAccount('account-a');
  });

  it('invalidates account-A UI after account B activates', () => {
    const accountAState = captureAccountScopedUiState('cloud');

    expect(accountScopedUiStateKey(accountAState)).toMatch(/^cloud:account-a:/);
    expect(isAccountScopedUiStateCurrent(accountAState, 'cloud')).toBe(true);

    activateCloudAccount('account-b');

    expect(isAccountScopedUiStateOwned(accountAState)).toBe(false);
    expect(isAccountScopedUiStateCurrent(accountAState, 'cloud')).toBe(false);
  });

  it('keeps device-owned Local UI across Cloud account switches', () => {
    const localState = captureAccountScopedUiState('local');

    activateCloudAccount('account-b');

    expect(accountScopedUiStateKey(localState)).toBe('local');
    expect(isAccountScopedUiStateOwned(localState)).toBe(true);
    expect(isAccountScopedUiStateCurrent(localState, 'local')).toBe(true);
    expect(isAccountScopedUiStateCurrent(localState, 'cloud')).toBe(false);
  });

  it('fails closed when Cloud has no active owner', () => {
    __resetCloudAccountSessionForTests();

    expect(captureAccountScopedUiState('cloud')).toBeNull();
    expect(accountScopedUiStateKey(null)).toBe('unavailable');
  });
});
