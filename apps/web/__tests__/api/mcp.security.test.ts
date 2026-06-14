import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const dnsMocks = vi.hoisted(() => ({
  lookup: vi.fn(),
}));

const mcpMocks = vi.hoisted(() => ({
  connectMcpServer: vi.fn(),
  close: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  getClerkAuthUser: vi.fn(),
}));

vi.mock('node:dns/promises', () => ({
  default: { lookup: dnsMocks.lookup },
  lookup: dnsMocks.lookup,
}));

vi.mock('server-only', () => ({}));

vi.mock('@agiworkforce/mcp', () => ({
  connectMcpServer: mcpMocks.connectMcpServer,
}));

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: authMocks.getClerkAuthUser,
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/error-handler', () => ({
  withErrorHandler: (handler: (req: NextRequest) => Promise<Response>) => (req: NextRequest) =>
    handler(req),
}));

import { POST, WEB_MCP_PRIVATE_BETA_ENV } from '@/app/api/mcp/route';

function postMcp(url: string): NextRequest {
  return new NextRequest('http://localhost/api/mcp', {
    method: 'POST',
    body: JSON.stringify({
      serverName: 'docs',
      config: {
        url,
        transport: 'streamable-http',
      },
    }),
  });
}

describe('POST /api/mcp security gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env[WEB_MCP_PRIVATE_BETA_ENV];
    dnsMocks.lookup.mockReset();
    authMocks.getClerkAuthUser.mockResolvedValue({ userId: 'user_test' });
    mcpMocks.close.mockResolvedValue(undefined);
    mcpMocks.connectMcpServer.mockResolvedValue({
      catalog: { serverName: 'docs', safeServerName: 'docs', tools: [] },
      close: mcpMocks.close,
    });
  });

  it('fails closed unless Web MCP private beta is explicitly enabled', async () => {
    const response = await POST(postMcp('https://mcp.example.com'));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe('WEB_MCP_PRIVATE_BETA_REQUIRED');
    expect(dnsMocks.lookup).not.toHaveBeenCalled();
    expect(mcpMocks.connectMcpServer).not.toHaveBeenCalled();
  });

  it('blocks private resolved addresses before connecting', async () => {
    process.env[WEB_MCP_PRIVATE_BETA_ENV] = '1';
    dnsMocks.lookup.mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }]);

    await expect(POST(postMcp('https://mcp.example.com'))).rejects.toThrow(
      'config.url targets a private or unsafe network address',
    );
    expect(mcpMocks.connectMcpServer).not.toHaveBeenCalled();
  });

  it('connects only after beta gate and public DNS validation pass', async () => {
    process.env[WEB_MCP_PRIVATE_BETA_ENV] = '1';
    dnsMocks.lookup.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]);

    const response = await POST(postMcp('https://mcp.example.com'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.server).toEqual({ serverName: 'docs', safeServerName: 'docs', tools: [] });
    expect(mcpMocks.connectMcpServer).toHaveBeenCalledWith({
      serverName: 'docs',
      config: {
        url: 'https://mcp.example.com',
        transport: 'streamable-http',
        connectionTimeoutMs: 30_000,
      },
    });
    expect(mcpMocks.close).toHaveBeenCalled();
  });
});
