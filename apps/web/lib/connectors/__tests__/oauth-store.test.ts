import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockQuery = vi.fn();
const mockExecute = vi.fn();
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({
    query: (...a: unknown[]) => mockQuery(...a),
    execute: (...a: unknown[]) => mockExecute(...a),
  }),
}));

import {
  ConnectorOAuthStoreUnavailableError,
  consumePendingAuthorization,
  createPendingAuthorization,
  getConnectorOAuthGrant,
  getUserConnectorOAuthGrantSummaries,
  revokeConnectorOAuthGrant,
  upsertConnectorOAuthGrant,
} from '../oauth-store';
import { encryptConnectorToken } from '@/lib/custom-connector-crypto';

const STATE = 'c'.repeat(64);
const STATE_HASH = createHash('sha256').update(STATE).digest('hex');

function insertCall(): { sql: string; params: unknown[] } {
  const call = mockExecute.mock.calls.find(([sql]) => String(sql).includes('insert into'));
  return { sql: String(call?.[0]), params: (call?.[1] ?? []) as unknown[] };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockExecute.mockResolvedValue(undefined);
  mockQuery.mockResolvedValue([]);
});

describe('pending authorizations', () => {
  it('stores the state hash and an encrypted verifier, never the raw values', async () => {
    await createPendingAuthorization({
      userId: 'user-1',
      connectorId: 'linear',
      state: STATE,
      codeVerifier: 'verifier-value',
      codeChallengeMethod: 'S256',
      redirectUri: 'https://app.example.com/api/connectors/oauth/callback',
      requestedScopes: ['read'],
      returnPath: '/connectors',
    });

    const { params } = insertCall();
    expect(params).toContain(STATE_HASH);
    expect(params).not.toContain(STATE);
    expect(params).not.toContain('verifier-value');
    const ciphertext = params[3] as string;
    expect(ciphertext).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
  });

  it('clears this user stale and duplicate rows before inserting', async () => {
    await createPendingAuthorization({
      userId: 'user-1',
      connectorId: 'linear',
      state: STATE,
      codeVerifier: 'v',
      codeChallengeMethod: 'S256',
      redirectUri: 'https://app.example.com/api/connectors/oauth/callback',
      requestedScopes: [],
      returnPath: '/connectors',
    });

    const deleteCall = mockExecute.mock.calls[0];
    expect(String(deleteCall?.[0])).toMatch(/delete from public\.connector_oauth_authorizations/);
    expect(String(deleteCall?.[0])).toMatch(/expires_at < now\(\)/);
    expect(deleteCall?.[1]).toEqual(['user-1', 'linear']);
  });

  it('claims a pending row with a single conditional UPDATE', async () => {
    mockQuery.mockResolvedValue([
      {
        user_id: 'user-1',
        connector_id: 'linear',
        code_verifier_enc: encryptConnectorToken('verifier-value', 'oauth-code-verifier'),
        redirect_uri: 'https://app.example.com/api/connectors/oauth/callback',
        requested_scopes: ['read'],
        return_path: '/connectors',
      },
    ]);

    const pending = await consumePendingAuthorization(STATE);

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/update public\.connector_oauth_authorizations/);
    expect(sql).toMatch(/set consumed_at = now\(\)/);
    expect(sql).toMatch(/consumed_at is null/);
    expect(sql).toMatch(/expires_at > now\(\)/);
    expect(params).toEqual([STATE_HASH]);
    expect(pending?.codeVerifier).toBe('verifier-value');
  });

  it('returns null for an unknown, expired, or already-claimed state', async () => {
    mockQuery.mockResolvedValue([]);
    await expect(consumePendingAuthorization(STATE)).resolves.toBeNull();
  });

  it('refuses the exchange when the stored verifier cannot be decrypted', async () => {
    mockQuery.mockResolvedValue([
      {
        user_id: 'user-1',
        connector_id: 'linear',
        code_verifier_enc: 'not:valid:ciphertext',
        redirect_uri: 'https://app.example.com/api/connectors/oauth/callback',
        requested_scopes: [],
        return_path: '/connectors',
      },
    ]);

    await expect(consumePendingAuthorization(STATE)).resolves.toBeNull();
  });

  it('reports the broker as unavailable when the tables are not migrated', async () => {
    mockExecute.mockRejectedValue(
      Object.assign(new Error('relation does not exist'), { code: '42P01' }),
    );

    await expect(
      createPendingAuthorization({
        userId: 'user-1',
        connectorId: 'linear',
        state: STATE,
        codeVerifier: 'v',
        codeChallengeMethod: 'S256',
        redirectUri: 'https://app.example.com/api/connectors/oauth/callback',
        requestedScopes: [],
        returnPath: '/connectors',
      }),
    ).rejects.toBeInstanceOf(ConnectorOAuthStoreUnavailableError);
  });
});

describe('grants', () => {
  it('encrypts both tokens and clears any prior revocation on reconnect', async () => {
    await upsertConnectorOAuthGrant('user-1', 'linear', {
      accessToken: 'access-value',
      refreshToken: 'refresh-value',
      tokenType: 'Bearer',
      grantedScopes: ['read'],
      accessTokenExpiresAt: new Date('2026-08-05T00:00:00.000Z'),
      tokenEndpoint: 'https://auth.example.com/token',
    });

    const { sql, params } = insertCall();
    expect(sql).toMatch(/revoked_at = null/);
    expect(params).not.toContain('access-value');
    expect(params).not.toContain('refresh-value');
    expect(params[2]).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    expect(params[3]).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
  });

  it('reads back a decrypted grant, filtered to live rows', async () => {
    mockQuery.mockResolvedValue([
      {
        connector_id: 'linear',
        access_token_enc: encryptConnectorToken('access-value', 'oauth-access-token'),
        refresh_token_enc: encryptConnectorToken('refresh-value', 'oauth-refresh-token'),
        token_type: 'Bearer',
        granted_scopes: ['read'],
        access_token_expires_at: '2026-08-05T00:00:00.000Z',
        token_endpoint: 'https://auth.example.com/token',
        connected_at: '2026-08-01T00:00:00.000Z',
        updated_at: '2026-08-01T00:00:00.000Z',
      },
    ]);

    const grant = await getConnectorOAuthGrant('user-1', 'linear');

    expect(String(mockQuery.mock.calls[0]?.[0])).toMatch(/revoked_at is null/);
    expect(grant?.accessToken).toBe('access-value');
    expect(grant?.refreshToken).toBe('refresh-value');
  });

  it('treats a revoked row (no ciphertext) as no grant', async () => {
    mockQuery.mockResolvedValue([
      {
        connector_id: 'linear',
        access_token_enc: null,
        refresh_token_enc: null,
        token_type: 'Bearer',
        granted_scopes: [],
        access_token_expires_at: null,
        token_endpoint: 'https://auth.example.com/token',
        connected_at: '',
        updated_at: '',
      },
    ]);

    await expect(getConnectorOAuthGrant('user-1', 'linear')).resolves.toBeNull();
  });

  it('drops both ciphertext columns in the same statement that flags revocation', async () => {
    mockQuery.mockResolvedValue([{ connector_id: 'linear' }]);

    await expect(revokeConnectorOAuthGrant('user-1', 'linear')).resolves.toBe(true);

    const sql = String(mockQuery.mock.calls[0]?.[0]);
    expect(sql).toMatch(/revoked_at = now\(\)/);
    expect(sql).toMatch(/access_token_enc = null/);
    expect(sql).toMatch(/refresh_token_enc = null/);
    expect(sql).toMatch(/revoked_at is null/);
  });

  it('summarises grants without exposing any credential material', async () => {
    mockQuery.mockResolvedValue([
      {
        connector_id: 'linear',
        granted_scopes: ['read'],
        access_token_expires_at: '2020-01-01T00:00:00.000Z',
        refresh_token_enc: null,
        connected_at: '2026-08-01T00:00:00.000Z',
        updated_at: '2026-08-01T00:00:00.000Z',
      },
    ]);

    const summaries = await getUserConnectorOAuthGrantSummaries('user-1');

    expect(summaries[0]).toEqual({
      connectorId: 'linear',
      grantedScopes: ['read'],
      connectedAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      needsReauthorization: true,
    });
    expect(JSON.stringify(summaries)).not.toMatch(/token_enc|accessToken|refreshToken/);
  });

  it('degrades to empty rather than throwing when the tables are missing', async () => {
    mockQuery.mockRejectedValue(
      Object.assign(new Error('relation does not exist'), { code: '42P01' }),
    );

    await expect(getUserConnectorOAuthGrantSummaries('user-1')).resolves.toEqual([]);
    await expect(getConnectorOAuthGrant('user-1', 'linear')).resolves.toBeNull();
    await expect(revokeConnectorOAuthGrant('user-1', 'linear')).resolves.toBe(false);
  });
});
