import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  callTool: vi.fn(),
  permissions: vi.fn(),
  catalogTools: [] as Array<{ toolName: string; annotations?: Record<string, unknown> }>,
}));

vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  requireCsrfToken: vi.fn(async () => null),
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<SecurityAuditModule>()),
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(async () => undefined),
  recordAuditEvent: vi.fn(async () => undefined),
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: vi.fn(async () => ({ db: {}, userId: 'user-1', organizationId: null })),
}));
vi.mock(
  '@/app/api/llm/v1/chat/completions/lib/connector-tool-permissions',
  async (importOriginal) => ({
    ...(await importOriginal<ConnectorToolPermissionsModule>()),
    loadConnectorToolPermissions: mocks.permissions,
  }),
);
vi.mock('@/lib/user-connector-tools', async (importOriginal) => ({
  ...(await importOriginal<UserConnectorToolsModule>()),
  withUserConnectorMcpHandle: vi.fn(
    async (_userId: string, _ref: string, run: (connection: unknown) => unknown) =>
      run({
        connectorId: 'custom-abc',
        handle: { callTool: mocks.callTool, catalog: { tools: mocks.catalogTools } },
      }),
  ),
}));
vi.mock('@/lib/connectors/mcp-state-store', async (importOriginal) => ({
  ...(await importOriginal<McpStateStoreModule>()),
  bindMcpTask: vi.fn(async () => true),
  isMcpTaskBound: vi.fn(async () => true),
  saveMcpAppPayload: vi.fn(async () => null),
}));

import { connectorToolPermissionsFromEntries } from '@/app/api/llm/v1/chat/completions/lib/connector-tool-permissions';
import { POST } from './route';

type RlsDbModule = typeof import('@/lib/server/rls-db');

type SecurityAuditModule = typeof import('@/lib/security-audit');

type RateLimitModule = typeof import('@/lib/rate-limit');

type CsrfModule = typeof import('@/lib/csrf');

type ConnectorToolPermissionsModule =
  typeof import('@/app/api/llm/v1/chat/completions/lib/connector-tool-permissions');

type UserConnectorToolsModule = typeof import('@/lib/user-connector-tools');
type McpStateStoreModule = typeof import('@/lib/connectors/mcp-state-store');

function callTool(name: string, approved = false) {
  return POST(
    new NextRequest('http://localhost/api/connectors/custom-abc/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: 'callTool', name, arguments: {}, approved }),
    }),
    { params: Promise.resolve({ connectorId: 'custom-abc' }) },
  );
}

describe('POST /api/connectors/[connectorId]/mcp, critical tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.callTool.mockResolvedValue({ content: [] });
    mocks.permissions.mockResolvedValue(
      connectorToolPermissionsFromEntries([
        { connectorId: 'custom-abc', toolName: 'purge', level: 'allow' },
        { connectorId: 'custom-abc', toolName: 'list', level: 'allow' },
      ]),
    );
    mocks.catalogTools.splice(0, mocks.catalogTools.length, {
      toolName: 'purge',
      annotations: { destructiveHint: true },
    });
  });

  it('asks for a destructiveHint tool even when an allow is saved for it', async () => {
    const response = await callTool('purge');
    expect(await response.json()).toMatchObject({ approvalRequired: true });
    expect(mocks.callTool).not.toHaveBeenCalled();
  });

  it('runs it once the person approved this call', async () => {
    const response = await callTool('purge', true);
    expect(await response.json()).toMatchObject({ approvalRequired: false });
    expect(mocks.callTool).toHaveBeenCalledOnce();
  });

  it('still honours a saved allow for a tool that is not critical', async () => {
    const response = await callTool('list');
    expect(await response.json()).toMatchObject({ approvalRequired: false });
    expect(mocks.callTool).toHaveBeenCalledOnce();
  });
});
