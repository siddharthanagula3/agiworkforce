// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  decrypt: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: mocks.query, execute: mocks.execute }),
}));
vi.mock('@/lib/custom-connector-crypto', () => ({
  decryptConnectorToken: (...args: unknown[]) => mocks.decrypt(...args),
  encryptConnectorToken: (value: string) => `enc:${value}`,
}));

import { getMcpOAuthClient } from '../mcp-oauth-clients';

const ISSUER = 'https://auth.example.test';

function row(secret: string | null) {
  return [
    {
      issuer: ISSUER,
      client_id: 'client-1',
      client_secret_enc: secret,
      registration_method: 'dynamic',
      client_metadata_url: null,
      client_secret_expires_at: null,
    },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.execute.mockResolvedValue(undefined);
});

describe('getMcpOAuthClient', () => {
  it('returns the record when the stored secret opens', async () => {
    mocks.query.mockResolvedValue(row('sealed'));
    mocks.decrypt.mockReturnValue('plain-secret');

    await expect(getMcpOAuthClient(ISSUER)).resolves.toMatchObject({
      clientId: 'client-1',
      clientSecret: 'plain-secret',
    });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('drops the registration instead of failing forever when the secret cannot be opened', async () => {
    mocks.query.mockResolvedValue(row('sealed-under-a-retired-key'));
    mocks.decrypt.mockImplementation(() => {
      throw new Error('envelope could not be opened by any ring key');
    });

    await expect(getMcpOAuthClient(ISSUER)).resolves.toBeNull();
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('delete from'), [ISSUER]);
  });
});
