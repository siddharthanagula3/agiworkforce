import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockQuery = vi.fn();
const mockExecute = vi.fn();
const mockTransaction = vi.fn();
const mockTxQuery = vi.fn();
const mockTxExecute = vi.fn();
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({
    transaction: (...a: unknown[]) => mockTransaction(...a),
    query: (...a: unknown[]) => mockQuery(...a),
    execute: (...a: unknown[]) => mockExecute(...a),
  }),
}));

import {
  cancelPendingConnectorAuthorizations,
  captureAndRevokeConnectorOAuthGrants,
  consumePendingAuthorization,
  createPendingAuthorization,
  listPendingConnectorIds,
  getConnectorOAuthGrant,
  getUserConnectorOAuthGrantSummaries,
  listConnectorAccounts,
  listRevocableConnectorTokens,
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
  mockTxQuery.mockReset().mockResolvedValue([]);
  mockTxExecute.mockReset().mockResolvedValue(undefined);
  mockTransaction.mockReset().mockImplementation(async (run) =>
    run({
      query: mockTxQuery,
      execute: mockTxExecute,
    }),
  );
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

    const pending = await consumePendingAuthorization(STATE, 'user-1');

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/update public\.connector_oauth_authorizations/);
    expect(sql).toMatch(/set consumed_at = now\(\)/);
    expect(sql).toMatch(/consumed_at is null/);
    expect(sql).toMatch(/expires_at > now\(\)/);
    expect(sql).toMatch(/and user_id = \$2/);
    expect(params).toEqual([STATE_HASH, 'user-1']);
    expect(pending?.codeVerifier).toBe('verifier-value');
  });

  it('returns null for an unknown, expired, or already-claimed state', async () => {
    mockQuery.mockResolvedValue([]);
    await expect(consumePendingAuthorization(STATE, 'user-1')).resolves.toBeNull();
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

    await expect(consumePendingAuthorization(STATE, 'user-1')).resolves.toBeNull();
  });

  it('surfaces a missing table instead of reporting the broker as unavailable', async () => {
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
    ).rejects.toMatchObject({ code: '42P01' });
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
      accountKey: 'default',
      accountLabel: null,
      accountScope: 'personal',
      isDefault: true,
    });
    expect(JSON.stringify(summaries)).not.toMatch(/token_enc|accessToken|refreshToken/);
  });

  it('surfaces a missing table instead of reading it as no grants', async () => {
    mockQuery.mockRejectedValue(
      Object.assign(new Error('relation does not exist'), { code: '42P01' }),
    );

    await expect(getUserConnectorOAuthGrantSummaries('user-1')).rejects.toMatchObject({
      code: '42P01',
    });
    await expect(getConnectorOAuthGrant('user-1', 'linear')).rejects.toMatchObject({
      code: '42P01',
    });
    await expect(revokeConnectorOAuthGrant('user-1', 'linear')).rejects.toMatchObject({
      code: '42P01',
    });
  });
});

describe('credentials a disconnect has to hand back', () => {
  it('returns one credential per live account, unlimited and unordered by default', async () => {
    mockQuery.mockResolvedValue([
      {
        account_key: 'work',
        access_token_enc: encryptConnectorToken('work-access', 'oauth-access-token'),
        refresh_token_enc: encryptConnectorToken('work-refresh', 'oauth-refresh-token'),
      },
      {
        account_key: 'personal',
        access_token_enc: encryptConnectorToken('personal-access', 'oauth-access-token'),
        refresh_token_enc: null,
      },
    ]);

    const tokens = await listRevocableConnectorTokens('user-1', 'gmail');

    expect(tokens).toEqual([
      {
        accountKey: 'work',
        token: 'work-refresh',
        tokenTypeHint: 'refresh_token',
        companionAccessToken: 'work-access',
        issuer: null,
        mcpUrl: null,
      },
      {
        accountKey: 'personal',
        token: 'personal-access',
        tokenTypeHint: 'access_token',
        companionAccessToken: null,
        issuer: null,
        mcpUrl: null,
      },
    ]);
    const sql = String(mockQuery.mock.calls[0]?.[0]);
    expect(sql).toMatch(/revoked_at is null/);
    expect(sql).not.toMatch(/limit/i);
  });

  it('carries the issuer a discovered grant has to be revoked at', async () => {
    mockQuery.mockResolvedValue([
      {
        account_key: 'default',
        access_token_enc: encryptConnectorToken('vendor-access', 'oauth-access-token'),
        refresh_token_enc: encryptConnectorToken('vendor-refresh', 'oauth-refresh-token'),
        issuer: 'https://auth.vendor.test',
        mcp_url: 'https://mcp.vendor.test/mcp',
      },
    ]);

    const [token] = await listRevocableConnectorTokens('user-1', 'custom:abc');

    expect(token).toMatchObject({
      token: 'vendor-refresh',
      companionAccessToken: 'vendor-access',
      issuer: 'https://auth.vendor.test',
      mcpUrl: 'https://mcp.vendor.test/mcp',
    });
    expect(String(mockQuery.mock.calls[0]?.[0])).toMatch(/issuer, mcp_url/);
  });

  it('narrows to one account when a key is named', async () => {
    mockQuery.mockResolvedValue([]);

    await listRevocableConnectorTokens('user-1', 'gmail', 'work');

    expect(String(mockQuery.mock.calls[0]?.[0])).toMatch(/account_key = \$3/);
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(['user-1', 'gmail', 'work']);
  });

  it('skips a credential that no longer decrypts instead of failing the disconnect', async () => {
    mockQuery.mockResolvedValue([
      { account_key: 'work', access_token_enc: 'not:valid:ciphertext', refresh_token_enc: null },
      {
        account_key: 'personal',
        access_token_enc: encryptConnectorToken('personal-access', 'oauth-access-token'),
        refresh_token_enc: null,
      },
    ]);

    const tokens = await listRevocableConnectorTokens('user-1', 'gmail');

    expect(tokens.map((token) => token.accountKey)).toEqual(['personal']);
  });

  it.each(['broken', 'empty', 'wrong-purpose'] as const)(
    'uses readable access credentials when refresh ciphertext is %s',
    async (kind) => {
      mockQuery.mockResolvedValue([
        {
          account_key: ' work ',
          access_token_enc: encryptConnectorToken('fallback-access', 'oauth-access-token'),
          refresh_token_enc:
            kind === 'wrong-purpose'
              ? encryptConnectorToken('not-a-refresh-token', 'oauth-access-token')
              : kind === 'empty'
                ? ''
                : 'broken',
          issuer: 'https://auth.vendor.test',
          mcp_url: 'https://mcp.vendor.test/mcp',
        },
      ]);

      await expect(listRevocableConnectorTokens('user-1', 'custom:abc')).resolves.toEqual([
        {
          accountKey: 'work',
          token: 'fallback-access',
          tokenTypeHint: 'access_token',
          companionAccessToken: null,
          issuer: 'https://auth.vendor.test',
          mcpUrl: 'https://mcp.vendor.test/mcp',
        },
      ]);
    },
  );

  it('surfaces a missing table instead of reporting nothing to revoke', async () => {
    mockQuery.mockRejectedValue(
      Object.assign(new Error('relation does not exist'), { code: '42P01' }),
    );

    await expect(listRevocableConnectorTokens('user-1', 'gmail')).rejects.toMatchObject({
      code: '42P01',
    });
  });
});

describe('listing unfinished authorizations', () => {
  it('asks only for rows that were never consumed and have not expired', async () => {
    mockQuery.mockResolvedValue([{ connector_id: 'io.acme/one' }]);

    expect(await listPendingConnectorIds('user_1')).toEqual(['io.acme/one']);

    const sql = String(mockQuery.mock.calls[0]?.[0]);
    expect(sql).toContain('consumed_at is null');
    expect(sql).toContain('expires_at > now()');
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(['user_1']);
  });
});

describe('a callback that was replaced or cancelled before it saved', () => {
  const tokens = {
    accessToken: 'access-value',
    refreshToken: null,
    tokenType: 'Bearer',
    grantedScopes: ['read'],
    accessTokenExpiresAt: null,
    tokenEndpoint: 'https://auth.example.com/token',
  };

  it('hands back the id of the authorization it consumed', async () => {
    mockQuery.mockResolvedValue([
      {
        id: 'auth-1',
        user_id: 'user-1',
        connector_id: 'linear',
        code_verifier_enc: encryptConnectorToken('verifier-value', 'oauth-code-verifier'),
        redirect_uri: 'https://app.example.com/api/connectors/oauth/callback',
        requested_scopes: [],
        return_path: '/connectors',
      },
    ]);

    const pending = await consumePendingAuthorization(STATE, 'user-1');

    expect(String(mockQuery.mock.calls[0]?.[0])).toMatch(/returning id, user_id/);
    expect(pending?.authorizationId).toBe('auth-1');
  });

  it('saves nothing once the consumed authorization row is gone', async () => {
    mockTxQuery.mockResolvedValue([]);

    await expect(upsertConnectorOAuthGrant('user-1', 'linear', tokens, {}, 'auth-1')).resolves.toBe(
      false,
    );

    expect(mockTxQuery.mock.calls[0]?.[0]).toMatch(/consumed_at is not null\s+for update/);
    expect(mockTxQuery.mock.calls[0]?.[1]).toEqual(['auth-1', 'user-1', 'linear']);
    expect(mockTxExecute).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('saves under the lock on its own authorization row while that row is still there', async () => {
    mockTxQuery.mockResolvedValue([{ id: 'auth-1' }]);

    await expect(upsertConnectorOAuthGrant('user-1', 'linear', tokens, {}, 'auth-1')).resolves.toBe(
      true,
    );

    expect(String(mockTxExecute.mock.calls[0]?.[0])).toContain(
      'insert into public.connector_oauth_grants',
    );
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('deletes the in-flight authorizations of a connector, or of one account', async () => {
    await cancelPendingConnectorAuthorizations('user-1', 'gmail');
    await cancelPendingConnectorAuthorizations('user-1', 'gmail', ' work ');

    const [all, one] = mockExecute.mock.calls as Array<[string, unknown[]]>;
    expect(all[0]).toMatch(/delete from public\.connector_oauth_authorizations/);
    expect(all[0]).not.toContain('account_key');
    expect(all[1]).toEqual(['user-1', 'gmail']);
    expect(one[0]).toContain('account_key = $3');
    expect(one[1]).toEqual(['user-1', 'gmail', 'work']);
  });
});

describe('multiple accounts per connector', () => {
  it('keys a second account of the same connector on its own row', async () => {
    await upsertConnectorOAuthGrant(
      'user-1',
      'gmail',
      {
        accessToken: 'token',
        refreshToken: null,
        tokenType: 'Bearer',
        grantedScopes: ['gmail.readonly'],
        accessTokenExpiresAt: null,
        tokenEndpoint: 'https://oauth2.googleapis.com/token',
      },
      { accountKey: 'work', accountLabel: 'work@example.com', accountScope: 'work' },
    );

    const { sql, params } = insertCall();
    expect(sql).toContain('on conflict (user_id, connector_id, account_key)');
    expect(params).toContain('work');
    expect(params).toContain('work@example.com');
  });

  it('reads back every connected account with its scope and default flag', async () => {
    mockQuery.mockResolvedValue([
      {
        connector_id: 'gmail',
        granted_scopes: ['gmail.readonly'],
        access_token_expires_at: null,
        refresh_token_enc: 'enc',
        connected_at: '2026-09-01T00:00:00.000Z',
        updated_at: '2026-09-01T00:00:00.000Z',
        account_key: 'work',
        account_label: 'work@example.com',
        account_scope: 'work',
        is_default: false,
      },
      {
        connector_id: 'gmail',
        granted_scopes: ['gmail.readonly'],
        access_token_expires_at: null,
        refresh_token_enc: 'enc',
        connected_at: '2026-08-01T00:00:00.000Z',
        updated_at: '2026-08-01T00:00:00.000Z',
        account_key: 'default',
        account_label: 'me@example.com',
        account_scope: 'personal',
        is_default: true,
      },
    ]);

    const accounts = await listConnectorAccounts('user-1', 'gmail');

    expect(accounts).toHaveLength(2);
    expect(accounts.map((account) => account.scope).sort()).toEqual(['personal', 'work']);
    expect(accounts.find((account) => account.scope === 'work')?.isDefault).toBe(false);
  });
});

describe('atomic disconnect capture (modeled transaction ordering, not database concurrency)', () => {
  const capturedRow = () => ({
    id: '00000000-0000-0000-0000-000000000001',
    account_key: 'work',
    access_token_enc: encryptConnectorToken('rotated-access', 'oauth-access-token'),
    refresh_token_enc: encryptConnectorToken('rotated-refresh', 'oauth-refresh-token'),
  });

  it('locks in stable order and targets only captured IDs', async () => {
    const row = capturedRow();
    mockTxQuery.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ id: row.id }]);
    const result = await captureAndRevokeConnectorOAuthGrants('user-1', 'gmail');
    expect(result).toMatchObject({ disconnected: true, incomplete: false });
    expect(result.tokens[0]?.token).toBe('rotated-refresh');
    expect(mockTxQuery.mock.calls[0]?.[0]).toMatch(/order by id\s+for update/);
    expect(mockTxQuery.mock.calls[0]?.[1]).toEqual(['user-1', 'gmail']);
    expect(mockTxQuery.mock.calls[1]?.[0]).toContain('id = any($3::uuid[])');
    expect(mockTxQuery.mock.calls[1]?.[1]).toEqual(['user-1', 'gmail', [row.id]]);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockTxExecute.mock.calls[0]?.[0]).toContain('set is_default = true');
    expect(mockTxExecute.mock.calls[0]?.[0]).toContain('and not exists');
    expect(mockTxExecute.mock.calls[0]?.[1]).toEqual(['user-1', 'gmail']);
  });

  it('normalizes a named account and preserves the same capture scope', async () => {
    await captureAndRevokeConnectorOAuthGrants('user-1', 'gmail', ' work ');
    expect(mockTxQuery.mock.calls[0]?.[0]).toContain('account_key = $3');
    expect(mockTxQuery.mock.calls[0]?.[1]).toEqual(['user-1', 'gmail', 'work']);
  });

  it('returns no credentials for a repeated disconnect, but captures a later reconnect', async () => {
    await expect(captureAndRevokeConnectorOAuthGrants('user-1', 'gmail')).resolves.toEqual({
      disconnected: false,
      tokens: [],
      incomplete: false,
    });
    expect(mockTxExecute).not.toHaveBeenCalled();
    mockTxQuery
      .mockResolvedValueOnce([capturedRow()])
      .mockResolvedValueOnce([{ id: capturedRow().id }]);
    expect((await captureAndRevokeConnectorOAuthGrants('user-1', 'gmail')).disconnected).toBe(true);
  });

  it('captures readable access credentials without concealing incomplete refresh cleanup', async () => {
    mockTxQuery
      .mockResolvedValueOnce([
        { ...capturedRow(), refresh_token_enc: 'broken' },
        {
          ...capturedRow(),
          id: '00000000-0000-0000-0000-000000000002',
          access_token_enc: null,
          refresh_token_enc: null,
        },
      ])
      .mockResolvedValueOnce([
        { id: capturedRow().id },
        { id: '00000000-0000-0000-0000-000000000002' },
      ]);
    await expect(captureAndRevokeConnectorOAuthGrants('user-1', 'gmail')).resolves.toEqual({
      disconnected: true,
      tokens: [
        {
          accountKey: 'work',
          token: 'rotated-access',
          tokenTypeHint: 'access_token',
          companionAccessToken: null,
          issuer: null,
          mcpUrl: null,
        },
      ],
      incomplete: true,
    });
    expect(mockTxQuery.mock.calls[1]?.[1]).toEqual([
      'user-1',
      'gmail',
      ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002'],
    ]);
  });

  it.each(['broken', null])(
    'preserves readable refresh credentials with %s companion access',
    async (access) => {
      const row = { ...capturedRow(), access_token_enc: access };
      mockTxQuery.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ id: row.id }]);

      await expect(captureAndRevokeConnectorOAuthGrants('user-1', 'gmail')).resolves.toEqual({
        disconnected: true,
        tokens: [
          {
            accountKey: 'work',
            token: 'rotated-refresh',
            tokenTypeHint: 'refresh_token',
            companionAccessToken: null,
            issuer: null,
            mcpUrl: null,
          },
        ],
        incomplete: true,
      });
    },
  );

  it.each(['broken', 'empty', 'wrong-purpose'] as const)(
    'keeps a single access fallback incomplete when refresh ciphertext is %s',
    async (kind) => {
      const row = {
        ...capturedRow(),
        refresh_token_enc:
          kind === 'wrong-purpose'
            ? encryptConnectorToken('not-a-refresh-token', 'oauth-access-token')
            : kind === 'empty'
              ? ''
              : 'broken',
      };
      mockTxQuery.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ id: row.id }]);

      await expect(captureAndRevokeConnectorOAuthGrants('user-1', 'gmail')).resolves.toEqual({
        disconnected: true,
        tokens: [
          {
            accountKey: 'work',
            token: 'rotated-access',
            tokenTypeHint: 'access_token',
            companionAccessToken: null,
            issuer: null,
            mcpUrl: null,
          },
        ],
        incomplete: true,
      });
      expect(mockTxQuery.mock.calls[1]?.[1]).toEqual(['user-1', 'gmail', [row.id]]);
    },
  );

  it('removes a row with two unreadable credentials without returning either one', async () => {
    const row = {
      ...capturedRow(),
      access_token_enc: 'broken-access',
      refresh_token_enc: 'broken-refresh',
    };
    mockTxQuery.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ id: row.id }]);

    await expect(captureAndRevokeConnectorOAuthGrants('user-1', 'gmail')).resolves.toEqual({
      disconnected: true,
      tokens: [],
      incomplete: true,
    });
    expect(mockTxQuery.mock.calls[1]?.[1]).toEqual(['user-1', 'gmail', [row.id]]);
  });

  it.each([
    { receipt: [] },
    { receipt: [{ id: '00000000-0000-0000-0000-000000000001' }] },
    { receipt: [{ id: 'unexpected' }, { id: '00000000-0000-0000-0000-000000000002' }] },
    {
      receipt: [
        { id: '00000000-0000-0000-0000-000000000001' },
        { id: '00000000-0000-0000-0000-000000000001' },
      ],
    },
  ])(
    'rejects a missing, partial, unexpected or duplicate mutation receipt: $receipt',
    async ({ receipt }) => {
      mockTxQuery
        .mockResolvedValueOnce([
          capturedRow(),
          { ...capturedRow(), id: '00000000-0000-0000-0000-000000000002' },
        ])
        .mockResolvedValueOnce(receipt);
      await expect(captureAndRevokeConnectorOAuthGrants('user-1', 'gmail')).rejects.toThrow(
        'Connector grant revocation did not match the locked credentials',
      );
      expect(mockTxExecute).not.toHaveBeenCalled();
      expect(mockQuery).not.toHaveBeenCalled();
    },
  );

  it('surfaces a lock failure without a mutation or unlocked retry', async () => {
    const error = Object.assign(new Error('lock timeout'), { code: '55P03' });
    mockTxQuery.mockRejectedValueOnce(error);
    await expect(captureAndRevokeConnectorOAuthGrants('user-1', 'gmail')).rejects.toBe(error);
    expect(mockTxQuery).toHaveBeenCalledTimes(1);
    expect(mockTxExecute).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('does not expose captured credentials when commit fails', async () => {
    mockTxQuery
      .mockResolvedValueOnce([capturedRow()])
      .mockResolvedValueOnce([{ id: capturedRow().id }]);
    mockTransaction.mockImplementationOnce(async (run) => {
      await run({ query: mockTxQuery, execute: mockTxExecute });
      throw new Error('commit failed');
    });
    await expect(captureAndRevokeConnectorOAuthGrants('user-1', 'gmail')).rejects.toThrow(
      'commit failed',
    );
  });
});

describe('disconnect transaction completion boundary', () => {
  it('does not resolve until the modeled commit completes', async () => {
    let commit!: () => void;
    const commitReady = new Promise<void>((resolve) => {
      commit = resolve;
    });
    let bodyDone!: () => void;
    const bodyReady = new Promise<void>((resolve) => {
      bodyDone = resolve;
    });
    mockTransaction.mockImplementationOnce(async (run) => {
      const result = await run({ query: mockTxQuery, execute: mockTxExecute });
      bodyDone();
      await commitReady;
      return result;
    });
    let resolved = false;
    const pending = captureAndRevokeConnectorOAuthGrants('user-1', 'gmail').then((result) => {
      resolved = true;
      return result;
    });
    await bodyReady;
    expect(resolved).toBe(false);
    commit();
    await expect(pending).resolves.toEqual({ disconnected: false, tokens: [], incomplete: false });
  });

  it('propagates a promotion deadlock without retrying or falling back', async () => {
    const error = Object.assign(new Error('deadlock detected'), { code: '40P01' });
    mockTxQuery
      .mockResolvedValueOnce([
        {
          id: '00000000-0000-0000-0000-000000000001',
          account_key: 'work',
          access_token_enc: encryptConnectorToken('access', 'oauth-access-token'),
          refresh_token_enc: null,
        },
      ])
      .mockResolvedValueOnce([{ id: '00000000-0000-0000-0000-000000000001' }]);
    mockTxExecute.mockRejectedValueOnce(error);
    await expect(captureAndRevokeConnectorOAuthGrants('user-1', 'gmail')).rejects.toBe(error);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('disconnect staged adapter model (not PostgreSQL concurrency proof)', () => {
  type ModelRow = {
    id: string;
    account_key: string;
    access_token_enc: string | null;
    refresh_token_enc: string | null;
    revoked_at: string | null;
    is_default: boolean;
  };

  function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  }

  function modelRow(id: string, accountKey: string, token: string): ModelRow {
    return {
      id,
      account_key: accountKey,
      access_token_enc: encryptConnectorToken(`${token}-access`, 'oauth-access-token'),
      refresh_token_enc: encryptConnectorToken(token, 'oauth-refresh-token'),
      revoked_at: null,
      is_default: accountKey === 'work',
    };
  }

  function installModel(
    options: {
      beforeSelect?: Promise<void>;
      beforeCommit?: Promise<void>;
      failure?: 'receipt' | 'promotion' | 'commit-before-persist' | 'commit-after-persist';
    } = {},
  ) {
    const firstId = '00000000-0000-0000-0000-000000000001';
    const state = new Map<string, ModelRow>([[firstId, modelRow(firstId, 'work', 'old-refresh')]]);
    const selected = deferred();
    const bodyFinished = deferred();
    const committed = deferred();
    const events: string[] = [];
    const transactionQuery = vi.fn();
    const transactionExecute = vi.fn();
    mockQuery.mockImplementation(() => {
      throw new Error('unexpected outer query');
    });
    mockExecute.mockImplementation(() => {
      throw new Error('unexpected outer execute');
    });
    mockTransaction.mockImplementation(async (run) => {
      const staged = new Map<string, ModelRow>();
      transactionQuery.mockImplementation(async (sql: string, params: unknown[]) => {
        if (sql.trimStart().startsWith('select id,')) {
          expect(sql).toMatch(/order by id\s+for update/);
          await options.beforeSelect;
          const accountKey = params[2];
          const rows = [...state.values()]
            .filter(
              (row) =>
                row.revoked_at === null &&
                (accountKey === undefined || row.account_key === accountKey),
            )
            .map((row) => ({ ...row }));
          for (const row of rows) staged.set(row.id, { ...row });
          events.push('locked-select');
          selected.resolve();
          return rows;
        }
        expect(sql).toContain('id = any($3::uuid[])');
        expect(sql).toContain('returning id');
        const ids = params[2] as string[];
        for (const id of ids) {
          const row = staged.get(id);
          if (!row) throw new Error('mutation targeted an uncaptured row');
          staged.set(id, {
            ...row,
            revoked_at: 'modeled-removal',
            access_token_enc: null,
            refresh_token_enc: null,
            is_default: false,
          });
        }
        events.push('staged-removal');
        return options.failure === 'receipt' ? [] : ids.map((id) => ({ id }));
      });
      transactionExecute.mockImplementation(async (sql: string) => {
        expect(sql).toContain('set is_default = true');
        if (options.failure === 'promotion') throw new Error('modeled promotion failure');
        events.push('staged-promotion');
        return 0;
      });
      try {
        const result = await run({ query: transactionQuery, execute: transactionExecute });
        bodyFinished.resolve();
        await options.beforeCommit;
        if (options.failure === 'commit-before-persist')
          throw new Error('modeled commit failure before persistence');
        for (const [id, row] of staged) state.set(id, row);
        if (options.failure === 'commit-after-persist') {
          throw new Error('modeled lost commit acknowledgement');
        }
        events.push('commit');
        committed.resolve();
        return result;
      } catch (error) {
        events.push(
          options.failure === 'commit-after-persist' ? 'commit-outcome-uncertain' : 'rollback',
        );
        throw error;
      }
    });
    return {
      state,
      firstId,
      selected,
      bodyFinished,
      committed,
      events,
      transactionQuery,
      transactionExecute,
    };
  }

  it('captures rotated tokens when a staged refresh commits before the locked read resolves', async () => {
    const refreshCommitted = deferred();
    const model = installModel({ beforeSelect: refreshCommitted.promise });
    const pending = captureAndRevokeConnectorOAuthGrants('user-1', 'gmail');
    model.state.set(model.firstId, modelRow(model.firstId, 'work', 'rotated-refresh'));
    model.events.push('refresh-commit');
    refreshCommitted.resolve();
    const result = await pending;
    expect(result.tokens[0]?.token).toBe('rotated-refresh');
    expect(result.tokens[0]?.companionAccessToken).toBe('rotated-refresh-access');
    expect(model.events).toEqual([
      'refresh-commit',
      'locked-select',
      'staged-removal',
      'staged-promotion',
      'commit',
    ]);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('makes a staged waiting refresh observe no live row only after disconnect commits', async () => {
    const allowCommit = deferred();
    const model = installModel({ beforeCommit: allowCommit.promise });
    const pending = captureAndRevokeConnectorOAuthGrants('user-1', 'gmail');
    const refreshProvider = vi.fn();
    const waitingRefresh = (async () => {
      await model.committed.promise;
      model.events.push('waiting-refresh-read');
      const current = model.state.get(model.firstId);
      if (current?.revoked_at === null) refreshProvider();
      return current?.revoked_at === null ? current : null;
    })();
    await model.bodyFinished.promise;
    expect(model.state.get(model.firstId)?.revoked_at).toBeNull();
    expect(model.events).not.toContain('waiting-refresh-read');
    allowCommit.resolve();
    await pending;
    await expect(waitingRefresh).resolves.toBeNull();
    expect(refreshProvider).not.toHaveBeenCalled();
    expect(model.events.slice(-2)).toEqual(['commit', 'waiting-refresh-read']);
  });

  it('preserves an uncaptured account inserted after selection when committing exact-ID removal', async () => {
    const allowCommit = deferred();
    const model = installModel({ beforeCommit: allowCommit.promise });
    const pending = captureAndRevokeConnectorOAuthGrants('user-1', 'gmail');
    await model.selected.promise;
    const newId = '00000000-0000-0000-0000-000000000002';
    const newAccount = modelRow(newId, 'personal', 'new-refresh');
    model.state.set(newId, newAccount);
    await model.bodyFinished.promise;
    allowCommit.resolve();
    const result = await pending;
    expect(result.tokens.map((token) => token.accountKey)).toEqual(['work']);
    expect(model.state.get(model.firstId)?.revoked_at).toBe('modeled-removal');
    expect(model.state.get(newId)).toEqual(newAccount);
    expect(model.transactionQuery.mock.calls[1]?.[1]).toEqual(['user-1', 'gmail', [model.firstId]]);
  });

  it('withholds credentials when removal persists but commit acknowledgement is lost', async () => {
    const model = installModel({ failure: 'commit-after-persist' });
    let returnedCredentials = false;
    const pending = captureAndRevokeConnectorOAuthGrants('user-1', 'gmail').then((result) => {
      returnedCredentials = result.tokens.length > 0;
      return result;
    });
    await expect(pending).rejects.toThrow('modeled lost commit acknowledgement');
    expect(returnedCredentials).toBe(false);
    expect(model.state.get(model.firstId)?.revoked_at).toBe('modeled-removal');
    expect(model.events.at(-1)).toBe('commit-outcome-uncertain');
    expect(model.events).not.toContain('rollback');
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it.each(['receipt', 'promotion', 'commit-before-persist'] as const)(
    'rolls back staged removal on %s failure without outer-adapter fallback',
    async (failure) => {
      const model = installModel({ failure });
      const original = { ...model.state.get(model.firstId)! };
      await expect(captureAndRevokeConnectorOAuthGrants('user-1', 'gmail')).rejects.toThrow();
      expect(model.state.get(model.firstId)).toEqual(original);
      expect(model.events).toContain('staged-removal');
      expect(model.events.at(-1)).toBe('rollback');
      expect(model.events).not.toContain('commit');
      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockQuery).not.toHaveBeenCalled();
      expect(mockExecute).not.toHaveBeenCalled();
    },
  );
});
