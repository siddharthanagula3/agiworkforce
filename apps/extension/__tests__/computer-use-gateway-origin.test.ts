import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('chrome', { storage: { local: { get: vi.fn(async () => ({})) } } });
  vi.stubEnv('VITE_API_BASE_URL', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('computer-use configured API origin', () => {
  it('rejects other loopback ports, private hosts and credential-bearing origins', async () => {
    vi.stubEnv('VITE_AGI_WEB_API_BASE_URL', 'http://localhost:3000');
    const { validateGatewayUrl } = await import('../src/background/policy');
    expect(validateGatewayUrl('http://localhost:3000')).toBe('http://localhost:3000');
    expect(validateGatewayUrl('http://localhost:3100')).toBeNull();
    expect(validateGatewayUrl('http://127.0.0.1:3000')).toBeNull();
    expect(validateGatewayUrl('http://192.168.1.2:3000')).toBeNull();
    expect(validateGatewayUrl('http://user:password@localhost:3000')).toBeNull();
  });

  it('uses the same configured development API as chat without a private gateway override', async () => {
    vi.stubEnv('VITE_AGI_WEB_API_BASE_URL', 'http://localhost:3000');
    const { callCloud, resolveGatewayBase } =
      await import('../src/features/computer-use/cloudAgentClient');
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response('data: [DONE]\n\n', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    expect(await resolveGatewayBase()).toBe('http://localhost:3000');
    await callCloud([], 'qa-token');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:3000/api/llm/v1/chat/completions');
  });

  it('refuses invalid configuration before contacting a different deployment', async () => {
    vi.stubEnv('VITE_AGI_WEB_API_BASE_URL', 'https://unapproved.example');
    const { callCloud } = await import('../src/features/computer-use/cloudAgentClient');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(callCloud([], 'qa-token')).rejects.toThrow('gateway URL not in allowlist');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves an explicitly configured and validated gateway override', async () => {
    vi.stubEnv('VITE_AGI_WEB_API_BASE_URL', 'http://localhost:3000');
    const { resolveGatewayBase } = await import('../src/features/computer-use/cloudAgentClient');
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({ agi_gateway_url: 'https://gateway.agiworkforce.com' })),
        },
      },
    });

    expect(await resolveGatewayBase()).toBe('https://gateway.agiworkforce.com');
  });
});
