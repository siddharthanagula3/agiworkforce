import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * MATCH-005 — the account settings route is owned by the cloud contract.
 *
 * Web retyped `/api/settings/preferences` at six call sites across the settings
 * `_lib` client and `settingsService`, while its sibling `/api/settings/sync`
 * already had `MANAGED_CLOUD_SETTINGS_SYNC_PATH`. Relocating the contract is the
 * only way to tell a real reference from a value-equal literal: a literal keeps
 * the old URL and silently splits Web from Desktop and Mobile on a route move.
 */
const RELOCATED = '/api/relocated-preferences';

vi.mock('@agiworkforce/cloud-contracts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/cloud-contracts')>();
  return {
    ...actual,
    MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH: RELOCATED,
    managedCloudPreferencesNamespacePath: (namespace: string) =>
      `${RELOCATED}?namespace=${encodeURIComponent(namespace)}`,
  };
});

vi.mock('@shared/lib/get-auth-token', () => ({
  getAuthToken: vi.fn(),
}));
vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: vi.fn(),
  addCsrfHeaders: vi.fn(),
  clearCsrfToken: vi.fn(),
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

beforeEach(async () => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(ok({ settings: {} }));
  const { getAuthToken } = await import('@shared/lib/get-auth-token');
  const { getCsrfToken, addCsrfHeaders } = await import('@/lib/client/csrf');
  vi.mocked(getAuthToken).mockResolvedValue('test-auth-token');
  vi.mocked(getCsrfToken).mockResolvedValue('test-csrf-token');
  vi.mocked(addCsrfHeaders).mockImplementation(async (headers) => headers as HeadersInit);
});

function requestedUrls(): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

describe('settings preference paths come from the cloud contract', () => {
  it('reads and writes namespaces through the relocated contract path', async () => {
    const { fetchStoredPreferenceNamespace, savePreferenceNamespace } =
      await import('./preferences-client');

    await fetchStoredPreferenceNamespace('time focus');
    await savePreferenceNamespace('general', { chatFont: 'system' });

    expect(requestedUrls()).toEqual([`${RELOCATED}?namespace=time%20focus`, RELOCATED]);
  });

  it('routes settingsService reads and writes through the relocated contract path', async () => {
    const { settingsService } = await import('@/features/settings/services/user-preferences');

    await settingsService.getSettings();
    await settingsService.updateSettings({ session_timeout: 30 });
    await settingsService.getProfile();
    await settingsService.updateProfile({ bio: 'hello' });

    const preferenceUrls = requestedUrls().filter((url) => url.startsWith(RELOCATED));
    expect(preferenceUrls).toEqual([
      RELOCATED,
      RELOCATED,
      `${RELOCATED}?namespace=profile`,
      RELOCATED,
    ]);
    expect(requestedUrls().some((url) => url.startsWith('/api/settings/preferences'))).toBe(false);
  });
});
