/**
 * MATCH-005 — the account settings route is owned by the cloud contract.
 *
 * Mobile retyped `/api/settings/preferences` at four call sites in
 * `services/preferences.ts`, while its sibling `/api/settings/sync` already went
 * through `MANAGED_CLOUD_SETTINGS_SYNC_PATH` in `services/cloudSyncEngine.ts`.
 * Relocating the contract is the only way to tell a real reference from a
 * value-equal literal: a literal keeps the old URL and silently splits Mobile
 * from Web and Desktop on a route move.
 */
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

  it('writes namespaced and un-namespaced settings through the relocated path', async () => {
    await savePreferenceNamespace('safety', { reduceSensitiveContent: true });
    await saveAccountSettings({ session_timeout: 30 });

    expect(mockPut.mock.calls.map((call) => call[0])).toEqual([RELOCATED, RELOCATED]);
  });
});
