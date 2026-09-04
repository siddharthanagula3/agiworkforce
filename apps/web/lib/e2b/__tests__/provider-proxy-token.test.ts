import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const SECRET = 'a'.repeat(40);

async function loadModule() {
  vi.resetModules();
  return import('../provider-proxy-token');
}

describe('provider proxy token', () => {
  beforeEach(() => {
    vi.stubEnv('CSRF_SECRET', SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('mints a token that verifies back to the same subject', async () => {
    const mod = await loadModule();
    const token = mod.mintProviderProxyToken(
      { sessionId: 'sess-1', userId: 'user-1', providerId: 'anthropic' },
      60_000,
    );
    const verified = mod.verifyProviderProxyToken(token);
    expect(verified).toMatchObject({
      sessionId: 'sess-1',
      userId: 'user-1',
      providerId: 'anthropic',
    });
  });

  it('rejects a token past its expiry', async () => {
    const mod = await loadModule();
    const nowMs = 1_000_000;
    const token = mod.mintProviderProxyToken(
      { sessionId: 'sess-1', userId: 'user-1', providerId: 'anthropic' },
      1_000,
      nowMs,
    );
    expect(mod.verifyProviderProxyToken(token, nowMs + 999)).not.toBeNull();
    expect(mod.verifyProviderProxyToken(token, nowMs + 1_001)).toBeNull();
  });

  it('rejects a tampered payload', async () => {
    const mod = await loadModule();
    const token = mod.mintProviderProxyToken(
      { sessionId: 'sess-1', userId: 'user-1', providerId: 'anthropic' },
      60_000,
    );
    const [payload, signature] = token.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({
        purpose: 'e2b-provider-proxy',
        sessionId: 'sess-2',
        userId: 'user-1',
        providerId: 'anthropic',
        expiresAt: Date.now() + 60_000,
      }),
    ).toString('base64url');
    expect(mod.verifyProviderProxyToken(`${forgedPayload}.${signature}`)).toBeNull();
    void payload;
  });

  it('rejects garbage input', async () => {
    const mod = await loadModule();
    expect(mod.verifyProviderProxyToken('not-a-token')).toBeNull();
    expect(mod.verifyProviderProxyToken('')).toBeNull();
    expect(mod.verifyProviderProxyToken('a.b.c')).toBeNull();
  });

  it('refuses to mint or verify without a sufficiently long secret', async () => {
    vi.stubEnv('CSRF_SECRET', 'too-short');
    const mod = await loadModule();
    expect(() =>
      mod.mintProviderProxyToken(
        { sessionId: 'sess-1', userId: 'user-1', providerId: 'anthropic' },
        60_000,
      ),
    ).toThrow();
  });
});
