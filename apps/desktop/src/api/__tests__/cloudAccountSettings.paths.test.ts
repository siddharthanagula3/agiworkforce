import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * MATCH-005 — the account settings route is owned by the cloud contract.
 *
 * Desktop retyped `/api/settings/preferences` in `cloudAccountSettings.ts`
 * while its sibling `/api/settings/sync` already had
 * `MANAGED_CLOUD_SETTINGS_SYNC_PATH`. `cloudAccountSettings.test.ts` asserts the
 * literal URL, which a retyped string satisfies just as well as a real
 * reference, so it cannot catch drift. Relocating the contract can: a literal
 * keeps the old URL and splits Desktop from Web and Mobile on a route move.
 */
const { RELOCATED } = vi.hoisted(() => ({ RELOCATED: '/api/relocated-preferences' }));

const mocks = vi.hoisted(() => ({
  cloudFetch: vi.fn(),
  getAuthHeaders: vi.fn(),
  createManagedCloudRequestContext: vi.fn(),
  assertManagedCloudBoundary: vi.fn(),
}));

vi.mock('@agiworkforce/cloud-contracts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/cloud-contracts')>();
  return {
    ...actual,
    MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH: RELOCATED,
    managedCloudPreferencesNamespacePath: (namespace: string) =>
      `${RELOCATED}?namespace=${encodeURIComponent(namespace)}`,
  };
});

vi.mock('../cloudApi', () => ({
  CLOUD_API_BASE_URL: 'https://cloud.agi.example',
}));

vi.mock('../../services/managedCloudRequestContext', () => ({
  createManagedCloudRequestContext: mocks.createManagedCloudRequestContext,
}));

import { getCloudPreferenceNamespace, saveCloudPreferenceNamespace } from '../cloudAccountSettings';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestedUrls(): string[] {
  return mocks.cloudFetch.mock.calls.map((call) => String(call[0]));
}

describe('cloudAccountSettings preference paths come from the cloud contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthHeaders.mockResolvedValue({
      Authorization: 'Bearer desktop-device-token',
      'Content-Type': 'application/json',
    });
    mocks.createManagedCloudRequestContext.mockReturnValue({
      fetch: mocks.cloudFetch,
      getHeaders: mocks.getAuthHeaders,
      assertBoundary: mocks.assertManagedCloudBoundary,
    });
    mocks.cloudFetch.mockResolvedValue(jsonResponse({ settings: {} }));
  });

  it('reads and writes namespaces through the relocated contract path', async () => {
    await getCloudPreferenceNamespace('time focus');
    await saveCloudPreferenceNamespace('safety', { reduceSensitiveContent: true });

    expect(requestedUrls()).toEqual([
      `https://cloud.agi.example${RELOCATED}?namespace=time%20focus`,
      `https://cloud.agi.example${RELOCATED}`,
    ]);
  });
});
