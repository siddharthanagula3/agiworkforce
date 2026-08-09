/**
 * apiFetch credential and gateway-resolution regression tests.
 *
 * `auth_token` is written as AES-GCM ciphertext by `APIClient.setToken`
 * (@shared/lib/api), and a relative `/api` base silently retargets gateway
 * calls at the web app's own route handlers.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  decryptAsync: vi.fn<(value: string) => Promise<string>>(),
}));

vi.mock('@shared/lib/security', () => ({
  securityManager: { decryptAsync: mocks.decryptAsync },
}));

import { apiFetch } from '../query-client';

function jsonResponse() {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({ data: null, success: true }),
  } as unknown as Response;
}

function lastRequestHeaders(fetchMock: ReturnType<typeof vi.fn>): Record<string, string> {
  const init = fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
  return (init.headers ?? {}) as Record<string, string>;
}

describe('apiFetch', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
    fetchMock = vi.fn(async () => jsonResponse());
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://gateway.example.com/api');
    // Deterministic stand-in for AES-GCM: the writer persists ciphertext and
    // caches the plaintext, so a correct reader must produce the plaintext.
    mocks.decryptAsync.mockImplementation(async (value: string) => {
      if (!value.startsWith('enc:')) throw new Error('Failed to decrypt data');
      return value.slice('enc:'.length);
    });
  });

  describe('bearer token', () => {
    it('sends the plaintext the writer cached, not the stored ciphertext', async () => {
      localStorage.setItem('auth_token', 'enc:eyJhbGciOiJIUzI1NiJ9.payload.sig');

      await apiFetch('/me');

      expect(lastRequestHeaders(fetchMock)['Authorization']).toBe(
        'Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig',
      );
    });

    it('passes through a pre-encryption plaintext JWT', async () => {
      localStorage.setItem('auth_token', 'eyJhbGciOiJIUzI1NiJ9.legacy.sig');

      await apiFetch('/me');

      expect(lastRequestHeaders(fetchMock)['Authorization']).toBe(
        'Bearer eyJhbGciOiJIUzI1NiJ9.legacy.sig',
      );
    });

    it('omits the header when the stored value cannot be decrypted', async () => {
      localStorage.setItem('auth_token', 'corrupted-ciphertext');

      await apiFetch('/me');

      expect(lastRequestHeaders(fetchMock)['Authorization']).toBeUndefined();
    });

    it('omits the header when nothing is stored', async () => {
      await apiFetch('/me');

      expect(lastRequestHeaders(fetchMock)['Authorization']).toBeUndefined();
    });
  });

  describe('gateway base URL', () => {
    it('targets the configured gateway', async () => {
      await apiFetch('/me');

      expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('https://gateway.example.com/api/me');
    });

    it('fails loudly instead of retargeting /api when the gateway is unconfigured', async () => {
      vi.stubEnv('NEXT_PUBLIC_API_URL', '');

      await expect(apiFetch('/me')).rejects.toThrow('NEXT_PUBLIC_API_URL not configured');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('falls back to the local gateway in development, matching @shared/lib/api', async () => {
      vi.stubEnv('NEXT_PUBLIC_API_URL', '');
      vi.stubEnv('NODE_ENV', 'development');

      await apiFetch('/me');

      expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('http://localhost:3001/api/me');
    });
  });
});
