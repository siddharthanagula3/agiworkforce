import { beforeEach, describe, expect, it, vi } from 'vitest';

const { assertManagedCloudBoundary, captureManagedCloudBoundary, cloudFetch, getAuthHeaders } =
  vi.hoisted(() => ({
    assertManagedCloudBoundary: vi.fn(),
    captureManagedCloudBoundary: vi.fn(() => ({
      accountId: 'account-1',
      accessToken: 'token-1',
    })),
    cloudFetch: vi.fn(),
    getAuthHeaders: vi.fn(async () => ({
      Authorization: 'Bearer token-1',
      'Content-Type': 'application/json',
    })),
  }));

vi.mock('../../api/cloudApi', () => ({
  CLOUD_API_BASE_URL: 'https://cloud.example.test',
  cloudFetch,
  getAuthHeaders,
}));

vi.mock('../managedCloudBoundary', () => ({
  assertManagedCloudBoundary,
  captureManagedCloudBoundary,
}));

import { createDesktopCloudShare } from '../desktopCloudShares';

describe('createDesktopCloudShare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('publishes only the validated Managed Cloud transcript and rechecks the boundary', async () => {
    cloudFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          shareUrl: 'https://agi.example/share/share-1',
          token: 'share-1',
          expiresAt: '2026-08-05T12:00:00.000Z',
          messageCount: 1,
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await createDesktopCloudShare({
      title: 'Planning notes',
      modelId: 'catalog-model',
      provider: 'catalog-provider',
      messages: [
        {
          role: 'user',
          content: 'Draft the launch checklist.',
          created_at: '2026-07-29T12:00:00.000Z',
        },
      ],
    });

    expect(captureManagedCloudBoundary).toHaveBeenCalledWith('Managed Cloud conversation sharing');
    expect(cloudFetch).toHaveBeenCalledWith('https://cloud.example.test/api/share', {
      method: 'POST',
      credentials: 'include',
      headers: {
        Authorization: 'Bearer token-1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Planning notes',
        model_id: 'catalog-model',
        provider: 'catalog-provider',
        messages: [
          {
            role: 'user',
            content: 'Draft the launch checklist.',
            created_at: '2026-07-29T12:00:00.000Z',
          },
        ],
      }),
    });
    expect(assertManagedCloudBoundary).toHaveBeenCalledWith({
      accountId: 'account-1',
      accessToken: 'token-1',
    });
    expect(result.token).toBe('share-1');
  });

  it('rejects invalid transcript timestamps before making a request', async () => {
    await expect(
      createDesktopCloudShare({
        title: 'Planning notes',
        messages: [
          {
            role: 'assistant',
            content: 'Done.',
            created_at: 'not-an-iso-timestamp',
          },
        ],
      }),
    ).rejects.toThrow();

    expect(cloudFetch).not.toHaveBeenCalled();
    expect(assertManagedCloudBoundary).not.toHaveBeenCalled();
  });
});
