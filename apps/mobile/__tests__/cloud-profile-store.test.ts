const mockGet = jest.fn();
const mockPatch = jest.fn();

jest.mock('@/services/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
  },
}));

import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import { useCloudProfileStore } from '../src/features/settings/cloud-account/cloudProfileStore';

function me(ownerId: string, name: string, avatarUrl: string | null = null) {
  return {
    id: ownerId,
    email: null,
    name,
    profile: { display_name: name, preferred_name: null, work_description: null },
    avatar_url: avatarUrl,
    created_at: null,
    updated_at: 1,
    plan: { tier: 'free', display_name: 'Free', status: 'active', current_period_end: null },
    feature_flags: { advanced_model_access: false },
    routing_preferences: {},
  };
}

describe('Cloud profile name', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPatch.mockReset();
    __resetCloudAccountSessionForTests();
    useCloudProfileStore.getState().reset();
  });

  it('loads and saves the server-owned name for the signed-in account', async () => {
    activateCloudAccount('account-a');
    mockGet.mockResolvedValue(me('account-a', 'Original'));
    mockPatch.mockResolvedValue({});

    await useCloudProfileStore.getState().load('account-a');
    expect(useCloudProfileStore.getState().displayName).toBe('Original');
    expect(await useCloudProfileStore.getState().save('account-a', '  Updated  ')).toBe(true);
    expect(mockPatch).toHaveBeenCalledWith('/api/me', { display_name: 'Updated' });
    expect(useCloudProfileStore.getState().displayName).toBe('Updated');
  });

  it('does not place an old account response into the new account', async () => {
    activateCloudAccount('account-a');
    let resolveOld: (value: unknown) => void = () => undefined;
    mockGet.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    const oldLoad = useCloudProfileStore.getState().load('account-a');

    activateCloudAccount('account-b');
    mockGet.mockResolvedValueOnce(me('account-b', 'New Account', 'https://example.com/b.png'));
    await useCloudProfileStore.getState().load('account-b');
    resolveOld(me('account-a', 'Old Account'));
    await oldLoad;

    expect(useCloudProfileStore.getState()).toMatchObject({
      ownerId: 'account-b',
      displayName: 'New Account',
      avatarUrl: 'https://example.com/b.png',
      loading: false,
    });
  });

  it('updates the account-owned avatar after a successful photo upload', async () => {
    activateCloudAccount('account-a');
    mockGet.mockResolvedValue(me('account-a', 'Original', 'https://example.com/old.png'));
    await useCloudProfileStore.getState().load('account-a');

    useCloudProfileStore.getState().setAvatar('account-a', 'https://example.com/new.png');
    expect(useCloudProfileStore.getState().avatarUrl).toBe('https://example.com/new.png');

    activateCloudAccount('account-b');
    useCloudProfileStore.getState().setAvatar('account-a', 'https://example.com/stale.png');
    expect(useCloudProfileStore.getState().avatarUrl).toBe('https://example.com/new.png');
    useCloudProfileStore.getState().reset();
    expect(useCloudProfileStore.getState().avatarUrl).toBeNull();
  });

  it('keeps a new photo when an earlier profile read completes later', async () => {
    activateCloudAccount('account-a');
    let resolveProfile: (value: unknown) => void = () => undefined;
    mockGet.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveProfile = resolve;
        }),
    );
    const load = useCloudProfileStore.getState().load('account-a');
    useCloudProfileStore.getState().setAvatar('account-a', 'https://example.com/new.png');
    resolveProfile(me('account-a', 'Original', 'https://example.com/old.png'));
    await load;

    expect(useCloudProfileStore.getState()).toMatchObject({
      displayName: 'Original',
      avatarUrl: 'https://example.com/new.png',
    });
  });

  it('does not claim a failed save succeeded', async () => {
    activateCloudAccount('account-a');
    mockGet.mockResolvedValue(me('account-a', 'Original'));
    mockPatch.mockRejectedValue(new Error('offline'));
    await useCloudProfileStore.getState().load('account-a');

    expect(await useCloudProfileStore.getState().save('account-a', 'Updated')).toBe(false);
    expect(useCloudProfileStore.getState()).toMatchObject({
      displayName: 'Original',
      error: 'Could not save your account name. Try again.',
      saving: false,
    });
  });

  it('refuses to write the previous account after a switch', async () => {
    activateCloudAccount('account-a');
    mockGet.mockResolvedValue(me('account-a', 'Original'));
    await useCloudProfileStore.getState().load('account-a');
    activateCloudAccount('account-b');

    expect(await useCloudProfileStore.getState().save('account-a', 'Wrong Account')).toBe(false);
    expect(mockPatch).not.toHaveBeenCalled();
  });
});
