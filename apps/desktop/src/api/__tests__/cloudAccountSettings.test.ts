import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cloudFetch: vi.fn(),
  getAuthHeaders: vi.fn(),
  captureManagedCloudBoundary: vi.fn(),
  assertManagedCloudBoundary: vi.fn(),
}));

vi.mock('../cloudApi', () => ({
  cloudFetch: mocks.cloudFetch,
  getAuthHeaders: mocks.getAuthHeaders,
  CLOUD_API_BASE_URL: 'https://cloud.agi.example',
}));

vi.mock('../../services/managedCloudBoundary', () => ({
  captureManagedCloudBoundary: mocks.captureManagedCloudBoundary,
  assertManagedCloudBoundary: mocks.assertManagedCloudBoundary,
}));

import {
  createCloudApiKey,
  deleteCloudConversation,
  getCloudTwoFactorStatus,
  listCloudApiKeys,
  listCloudArchivedConversations,
  listCloudSecurityActivity,
  listCloudSharedLinks,
  requestCloudAccountDeletion,
  restoreCloudArchivedConversation,
  revokeCloudApiKey,
  revokeCloudSharedLink,
} from '../cloudAccountSettings';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function lastRequest(): { url: string; init: RequestInit } {
  const call = mocks.cloudFetch.mock.calls.at(-1);
  if (!call) throw new Error('cloudFetch was never called');
  return { url: String(call[0]), init: (call[1] ?? {}) as RequestInit };
}

describe('cloudAccountSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthHeaders.mockResolvedValue({
      Authorization: 'Bearer desktop-device-token',
      'Content-Type': 'application/json',
    });
    mocks.captureManagedCloudBoundary.mockReturnValue({
      accountId: 'user_1',
      accessToken: 'desktop-device-token',
    });
  });

  describe('shared links', () => {
    it('lists shared links with the device bearer', async () => {
      mocks.cloudFetch.mockResolvedValue(
        jsonResponse({
          shares: [
            {
              token: 'tok_1',
              title: 'Quarterly plan',
              shareUrl: 'https://agiworkforce.com/share/tok_1',
              modelId: null,
              provider: null,
              messageCount: 4,
              createdAt: '2026-07-01T00:00:00.000Z',
              expiresAt: '2026-08-01T00:00:00.000Z',
              expired: false,
            },
          ],
        }),
      );

      const shares = await listCloudSharedLinks();

      const { url, init } = lastRequest();
      expect(url).toBe('https://cloud.agi.example/api/share');
      expect(init.method).toBe('GET');
      expect((init.headers as Record<string, string>)['Authorization']).toBe(
        'Bearer desktop-device-token',
      );
      expect(shares).toEqual([
        {
          token: 'tok_1',
          title: 'Quarterly plan',
          shareUrl: 'https://agiworkforce.com/share/tok_1',
          messageCount: 4,
          createdAt: '2026-07-01T00:00:00.000Z',
          expiresAt: '2026-08-01T00:00:00.000Z',
          expired: false,
        },
      ]);
      expect(mocks.assertManagedCloudBoundary).toHaveBeenCalledOnce();
    });

    it('drops malformed share rows instead of rendering a half-built link', async () => {
      mocks.cloudFetch.mockResolvedValue(
        jsonResponse({
          shares: [
            { token: 'tok_ok', shareUrl: 'https://x/y', createdAt: 'a', expiresAt: 'b' },
            { title: 'no token' },
          ],
        }),
      );

      await expect(listCloudSharedLinks()).resolves.toHaveLength(1);
    });

    it('percent-encodes the token when revoking', async () => {
      mocks.cloudFetch.mockResolvedValue(jsonResponse({ success: true }));

      await revokeCloudSharedLink('tok/1');

      const { url, init } = lastRequest();
      expect(url).toBe('https://cloud.agi.example/api/share/tok%2F1');
      expect(init.method).toBe('DELETE');
    });

    it('surfaces the server error message on failure', async () => {
      mocks.cloudFetch.mockResolvedValue(
        jsonResponse({ error: { message: 'Share not found' } }, 404),
      );

      await expect(revokeCloudSharedLink('tok_1')).rejects.toThrow('Share not found');
    });
  });

  describe('archived chats', () => {
    it('requests only archived conversations and normalizes the wire rows', async () => {
      mocks.cloudFetch.mockResolvedValue(
        jsonResponse({
          conversations: [
            {
              id: 'conv_1',
              title: 'Old plan',
              model: 'auto',
              project_id: null,
              pinned: false,
              starred: false,
              archived: true,
              is_temporary: false,
              created_at: '2026-06-01T00:00:00.000Z',
              updated_at: '2026-06-02T00:00:00.000Z',
            },
          ],
          hasMore: false,
          nextOffset: 1,
        }),
      );

      const page = await listCloudArchivedConversations(0);

      const { url } = lastRequest();
      expect(url).toContain('/api/chat/conversations?');
      expect(url).toContain('archived=only');
      expect(page.conversations).toEqual([
        { id: 'conv_1', title: 'Old plan', updatedAt: '2026-06-02T00:00:00.000Z' },
      ]);
      expect(page.hasMore).toBe(false);
    });

    it('restores by writing archived=false on the managed conversation path', async () => {
      mocks.cloudFetch.mockResolvedValue(
        jsonResponse({
          conversation: {
            id: 'conv_1',
            title: 'Old plan',
            model: null,
            project_id: null,
            pinned: false,
            starred: false,
            archived: false,
            is_temporary: false,
            created_at: '2026-06-01T00:00:00.000Z',
            updated_at: '2026-06-03T00:00:00.000Z',
          },
        }),
      );

      await restoreCloudArchivedConversation('conv_1');

      const { url, init } = lastRequest();
      expect(url).toBe('https://cloud.agi.example/api/chat/conversations/conv_1');
      expect(init.method).toBe('PUT');
      expect(JSON.parse(String(init.body))).toEqual({ archived: false });
    });

    it('deletes a conversation through the managed conversation path', async () => {
      mocks.cloudFetch.mockResolvedValue(jsonResponse({ success: true }));

      await deleteCloudConversation('conv_1');

      const { url, init } = lastRequest();
      expect(url).toBe('https://cloud.agi.example/api/chat/conversations/conv_1');
      expect(init.method).toBe('DELETE');
    });
  });

  describe('security posture', () => {
    it('reads two-factor status', async () => {
      mocks.cloudFetch.mockResolvedValue(
        jsonResponse({ enabled: true, backup_codes_remaining: 3 }),
      );

      await expect(getCloudTwoFactorStatus()).resolves.toEqual({
        enabled: true,
        backupCodesRemaining: 3,
      });
      expect(lastRequest().url).toBe('https://cloud.agi.example/api/settings/2fa');
    });

    it('clamps the activity limit and skips rows without an id or timestamp', async () => {
      mocks.cloudFetch.mockResolvedValue(
        jsonResponse({
          activities: [
            { id: 'a1', type: 'login', description: 'Signed in', createdAt: '2026-07-01' },
            { type: 'login', description: 'no id' },
          ],
        }),
      );

      const activity = await listCloudSecurityActivity(5_000);

      expect(lastRequest().url).toContain('limit=100');
      expect(activity).toHaveLength(1);
      expect(activity[0]?.id).toBe('a1');
    });
  });

  describe('API keys', () => {
    it('lists masked keys', async () => {
      mocks.cloudFetch.mockResolvedValue(
        jsonResponse({
          api_keys: [
            {
              id: 'key_1',
              name: 'Laptop CLI',
              key_prefix: 'sk_live_abc',
              scopes: ['models:read'],
              created_at: '2026-07-01T00:00:00.000Z',
              last_used_at: null,
            },
          ],
        }),
      );

      await expect(listCloudApiKeys()).resolves.toEqual([
        {
          id: 'key_1',
          name: 'Laptop CLI',
          keyPrefix: 'sk_live_abc',
          scopes: ['models:read'],
          createdAt: '2026-07-01T00:00:00.000Z',
          lastUsedAt: null,
        },
      ]);
    });

    it('returns the one-time full key from creation', async () => {
      mocks.cloudFetch.mockResolvedValue(
        jsonResponse(
          {
            api_key: {
              id: 'key_2',
              name: 'CI',
              key_prefix: 'sk_live_xyz',
              scopes: ['inference:write'],
              created_at: '2026-07-02T00:00:00.000Z',
              last_used_at: null,
            },
            full_key: 'sk_live_xyz_secret',
          },
          201,
        ),
      );

      const created = await createCloudApiKey('CI', ['inference:write']);

      const { init } = lastRequest();
      expect(JSON.parse(String(init.body))).toEqual({
        name: 'CI',
        scopes: ['inference:write'],
      });
      expect(created.fullKey).toBe('sk_live_xyz_secret');
      expect(created.apiKey.id).toBe('key_2');
    });

    it('rejects a creation response without the issued key rather than reporting success', async () => {
      mocks.cloudFetch.mockResolvedValue(jsonResponse({ api_key: { id: 'key_3' } }, 201));

      await expect(createCloudApiKey('CI', ['usage:read'])).rejects.toThrow('invalid key');
    });

    it('revokes a key by id', async () => {
      mocks.cloudFetch.mockResolvedValue(jsonResponse({ message: 'API key revoked' }));

      await revokeCloudApiKey('key_1');

      const { url, init } = lastRequest();
      expect(url).toBe('https://cloud.agi.example/api/settings/api-keys/key_1');
      expect(init.method).toBe('DELETE');
    });
  });

  describe('account deletion', () => {
    it('reports the server message rather than promising a grace window', async () => {
      mocks.cloudFetch.mockResolvedValue(
        jsonResponse({ message: 'Account deletion scheduled for 24 hours from now' }),
      );

      await expect(requestCloudAccountDeletion()).resolves.toEqual({
        message: 'Account deletion scheduled for 24 hours from now',
      });
      const { url, init } = lastRequest();
      expect(url).toBe('https://cloud.agi.example/api/user/delete-account');
      expect(init.method).toBe('DELETE');
    });

    it('throws with the server error when deletion fails', async () => {
      mocks.cloudFetch.mockResolvedValue(
        jsonResponse({ error: 'Account deletion failed. Please contact support.' }, 500),
      );

      await expect(requestCloudAccountDeletion()).rejects.toThrow('Account deletion failed');
    });
  });
});
