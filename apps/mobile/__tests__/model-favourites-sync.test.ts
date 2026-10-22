jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store) => {
    store?.persist?.rehydrate?.();
  }),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

const mockFetchPreferenceNamespace = jest.fn();
const mockPatchPreferenceNamespace = jest.fn();

jest.mock('@/services/preferences', () => ({
  fetchPreferenceNamespace: (...args: unknown[]) => mockFetchPreferenceNamespace(...args),
  patchPreferenceNamespace: (...args: unknown[]) => mockPatchPreferenceNamespace(...args),
}));

jest.mock('@/src/features/auth/store', () => {
  const { create } = jest.requireActual('zustand');
  return {
    useAuthStore: create(() => ({ isClerkSignedIn: false, clerkUserId: null })),
  };
});

import { useModelStore } from '../src/features/model-picker/store';
import { LOCAL_MODEL_LIST } from '../src/features/model-picker/service';
import { FAVOURITE_MODEL_IDS_KEY, MODEL_PICKER_PREFERENCES_NAMESPACE } from '@agiworkforce/types';
import { useAuthStore } from '../src/features/auth/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { useTierStore } from '../src/features/billing/store';
import { requireMobileCloudModel } from '../test-utils/modelFixtures';

const FIRST_CLOUD_ID = requireMobileCloudModel().id;
const SECOND_CLOUD_ID = requireMobileCloudModel((model) => model.id !== FIRST_CLOUD_ID).id;
const THIRD_CLOUD_ID = requireMobileCloudModel(
  (model) => model.id !== FIRST_CLOUD_ID && model.id !== SECOND_CLOUD_ID,
).id;
const LOCAL_ID = LOCAL_MODEL_LIST[0]!.id;
const UNKNOWN_ACCOUNT_ID = 'account-only-model-from-another-surface';

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function accountReturns(ids: string[]): void {
  mockFetchPreferenceNamespace.mockResolvedValue({ [FAVOURITE_MODEL_IDS_KEY]: ids });
}

function lastPushedIds(): string[] | undefined {
  const call = mockPatchPreferenceNamespace.mock.calls.at(-1);
  return call ? (call[1] as Record<string, string[]>)[FAVOURITE_MODEL_IDS_KEY] : undefined;
}

async function goCloud(userId = 'user_a'): Promise<void> {
  useAuthStore.setState({ isClerkSignedIn: true, clerkUserId: userId });
  useChatAppModeStore.setState({ appMode: 'cloud' });
  await settle();
}

async function goLocal(): Promise<void> {
  useChatAppModeStore.setState({ appMode: 'local' });
  await settle();
}

describe('model favourites account sync', () => {
  beforeEach(async () => {
    await goLocal();
    useAuthStore.setState({ isClerkSignedIn: false, clerkUserId: null });
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max', billingTier: 'max' });
    useModelStore.setState({ favorites: [], favoriteChanges: {}, favoritesSyncedAccountId: null });
    mockFetchPreferenceNamespace.mockReset();
    mockPatchPreferenceNamespace.mockReset().mockResolvedValue(undefined);
    accountReturns([]);
    await settle();
  });

  it('keeps favourites on the device and sends nothing in Local mode', async () => {
    useModelStore.getState().toggleFavorite(FIRST_CLOUD_ID);
    useModelStore.getState().toggleFavorite(LOCAL_ID);
    await settle();

    expect(useModelStore.getState().favorites).toEqual([FIRST_CLOUD_ID, LOCAL_ID]);
    expect(mockFetchPreferenceNamespace).not.toHaveBeenCalled();
    expect(mockPatchPreferenceNamespace).not.toHaveBeenCalled();
  });

  it('merges device favourites into the account on the first Cloud sync, never sending on-device models', async () => {
    useModelStore.setState({ favorites: [FIRST_CLOUD_ID, LOCAL_ID] });
    accountReturns([SECOND_CLOUD_ID]);

    await goCloud();

    expect(mockFetchPreferenceNamespace).toHaveBeenCalledWith(MODEL_PICKER_PREFERENCES_NAMESPACE);
    expect(mockPatchPreferenceNamespace).toHaveBeenCalledWith(MODEL_PICKER_PREFERENCES_NAMESPACE, {
      [FAVOURITE_MODEL_IDS_KEY]: [SECOND_CLOUD_ID, FIRST_CLOUD_ID],
    });
    expect(useModelStore.getState().favorites).toEqual([LOCAL_ID, SECOND_CLOUD_ID, FIRST_CLOUD_ID]);
    expect(useModelStore.getState().favoriteChanges).toEqual({});
    expect(useModelStore.getState().favoritesSyncedAccountId).toBe('user_a');
  });

  it('shows favourites starred on another surface once the device has synced', async () => {
    useModelStore.setState({ favorites: [FIRST_CLOUD_ID], favoritesSyncedAccountId: 'user_a' });
    accountReturns([SECOND_CLOUD_ID]);

    await goCloud();

    expect(useModelStore.getState().favorites).toEqual([SECOND_CLOUD_ID]);
    expect(mockPatchPreferenceNamespace).not.toHaveBeenCalled();
  });

  it('saves a star toggled in Cloud mode to the account and keeps account-only models', async () => {
    accountReturns([UNKNOWN_ACCOUNT_ID, FIRST_CLOUD_ID]);
    useModelStore.setState({ favoritesSyncedAccountId: 'user_a' });
    await goCloud();

    useModelStore.getState().toggleFavorite(SECOND_CLOUD_ID);
    await settle();
    expect(lastPushedIds()).toEqual([UNKNOWN_ACCOUNT_ID, FIRST_CLOUD_ID, SECOND_CLOUD_ID]);

    useModelStore.getState().toggleFavorite(FIRST_CLOUD_ID);
    await settle();
    expect(lastPushedIds()).toEqual([UNKNOWN_ACCOUNT_ID, SECOND_CLOUD_ID]);
    expect(useModelStore.getState().favorites).toEqual([SECOND_CLOUD_ID]);
    expect(useModelStore.getState().favoriteChanges).toEqual({});
  });

  it('replays stars changed in Local mode onto newer account favourites', async () => {
    useModelStore.setState({
      favorites: [FIRST_CLOUD_ID, SECOND_CLOUD_ID],
      favoritesSyncedAccountId: 'user_a',
    });
    useModelStore.getState().toggleFavorite(FIRST_CLOUD_ID);
    accountReturns([FIRST_CLOUD_ID, SECOND_CLOUD_ID, THIRD_CLOUD_ID]);

    await goCloud();

    expect(lastPushedIds()).toEqual([SECOND_CLOUD_ID, THIRD_CLOUD_ID]);
    expect(useModelStore.getState().favorites).toEqual([SECOND_CLOUD_ID, THIRD_CLOUD_ID]);
  });

  it('does not carry one account’s unsaved stars into another account', async () => {
    useModelStore.setState({ favoritesSyncedAccountId: 'user_a' });
    useModelStore.getState().toggleFavorite(FIRST_CLOUD_ID);
    accountReturns([SECOND_CLOUD_ID]);

    await goCloud('user_b');

    expect(mockPatchPreferenceNamespace).not.toHaveBeenCalled();
    expect(useModelStore.getState().favorites).toEqual([SECOND_CLOUD_ID]);
    expect(useModelStore.getState().favoritesSyncedAccountId).toBe('user_b');
  });

  it('keeps an unsaved star and saves it on the next Cloud sync after a failure', async () => {
    useModelStore.setState({ favoritesSyncedAccountId: 'user_a' });
    await goCloud();
    mockPatchPreferenceNamespace.mockRejectedValueOnce(new Error('offline'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    useModelStore.getState().toggleFavorite(FIRST_CLOUD_ID);
    await settle();
    expect(useModelStore.getState().favoriteChanges).toEqual({ [FIRST_CLOUD_ID]: true });

    await goLocal();
    await goCloud();
    expect(lastPushedIds()).toEqual([FIRST_CLOUD_ID]);
    expect(useModelStore.getState().favoriteChanges).toEqual({});
    warn.mockRestore();
  });

  it('leaves the device list alone when the account cannot be read', async () => {
    useModelStore.setState({ favorites: [FIRST_CLOUD_ID], favoritesSyncedAccountId: 'user_a' });
    mockFetchPreferenceNamespace.mockRejectedValue(new Error('offline'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await goCloud();

    expect(useModelStore.getState().favorites).toEqual([FIRST_CLOUD_ID]);
    expect(mockPatchPreferenceNamespace).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
