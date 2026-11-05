const RELOCATED = '/api/relocated-preferences';

jest.mock('@agiworkforce/cloud-contracts', () => {
  const actual = jest.requireActual('@agiworkforce/cloud-contracts');
  return {
    ...actual,
    MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH: RELOCATED,
    managedCloudPreferencesNamespacePath: (namespace: string) =>
      `${RELOCATED}?namespace=${encodeURIComponent(namespace)}`,
  };
});

const mockGet = jest.fn();
const mockPut = jest.fn();

jest.mock('@/services/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    put: (...args: unknown[]) => mockPut(...args),
  },
}));

import {
  fetchAccountSettings,
  fetchPreferenceNamespace,
  fetchToolApprovalNamespace,
  patchPreferenceNamespace,
  saveAccountSettings,
  savePreferenceNamespace,
} from '@/services/preferences';

describe('mobile preference paths come from the cloud contract', () => {
  beforeEach(() => {
    mockGet.mockReset().mockResolvedValue({ settings: {} });
    mockPut.mockReset().mockResolvedValue(undefined);
  });

  it('reads namespaced and un-namespaced settings through the relocated path', async () => {
    await fetchPreferenceNamespace('time focus');
    await fetchAccountSettings();

    expect(mockGet.mock.calls.map((call) => call[0])).toEqual([
      `${RELOCATED}?namespace=time%20focus`,
      RELOCATED,
    ]);
  });

  it('forwards caller ownership and cancellation without changing legacy call shapes', async () => {
    const options = {
      accountEpoch: { ownerId: 'account-a', epoch: 4 },
      signal: new AbortController().signal,
    };
    await fetchPreferenceNamespace('time focus', options);
    await savePreferenceNamespace('time focus', { enabled: true }, options);
    expect(mockGet).toHaveBeenLastCalledWith(`${RELOCATED}?namespace=time%20focus`, options);
    expect(mockPut).toHaveBeenLastCalledWith(
      RELOCATED,
      { namespace: 'time focus', value: { enabled: true } },
      options,
    );

    await fetchPreferenceNamespace('legacy');
    await savePreferenceNamespace('legacy', {});
    expect(mockGet).toHaveBeenLastCalledWith(`${RELOCATED}?namespace=legacy`);
    expect(mockPut).toHaveBeenLastCalledWith(RELOCATED, { namespace: 'legacy', value: {} });
  });

  it('forwards approval read ownership and cancellation while preserving legacy arity', async () => {
    const options = {
      accountEpoch: { ownerId: 'account-a', epoch: 4 },
      signal: new AbortController().signal,
    };
    mockGet.mockResolvedValue({
      settings: { defaultPolicy: 'autonomous' },
      autonomousToolApprovalsAllowed: true,
    });
    expect(await fetchToolApprovalNamespace('tool approvals', options)).toEqual({
      settings: { defaultPolicy: 'autonomous' },
      autonomousToolApprovalsAllowed: true,
    });
    expect(mockGet).toHaveBeenLastCalledWith(
      `${RELOCATED}?namespace=tool%20approvals`, options,
    );
    await fetchToolApprovalNamespace('legacy');
    expect(mockGet).toHaveBeenLastCalledWith(`${RELOCATED}?namespace=legacy`);
  });

  it('writes namespaced and un-namespaced settings through the relocated path', async () => {
    await savePreferenceNamespace('safety', { reduceSensitiveContent: true });
    await saveAccountSettings({ session_timeout: 30 });

    expect(mockPut.mock.calls.map((call) => call[0])).toEqual([RELOCATED, RELOCATED]);
  });

  it('patches a namespace through the relocated path without a replacement value', async () => {
    await patchPreferenceNamespace('notifications', { mobilePushAgentActivity: false });

    expect(mockPut.mock.calls).toEqual([
      [RELOCATED, { namespace: 'notifications', patch: { mobilePushAgentActivity: false } }],
    ]);
  });
});
