import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock('../../lib/tauri-mock', () => ({
  invoke: tauri.invoke,
  isTauri: true,
}));

import { accountApi } from '../accountApi';

describe('accountApi native transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the shared Tauri invoke boundary for the account snapshot', async () => {
    const profile = {
      id: 'user-1',
      email: 'user@example.com',
      credits: null,
    };
    tauri.invoke.mockResolvedValue(profile);

    await expect(accountApi.fetchUserProfile('account-token')).resolves.toEqual(profile);
    expect(tauri.invoke).toHaveBeenCalledOnce();
    expect(tauri.invoke).toHaveBeenCalledWith('fetch_user_profile', {
      accessToken: 'account-token',
    });
  });
});
