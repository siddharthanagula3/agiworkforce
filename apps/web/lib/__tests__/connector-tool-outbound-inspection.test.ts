import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  neonQuery: vi.fn(),
  connectMcpServer: vi.fn(),
  secretMode: vi.fn(),
  recordAuditEvent: vi.fn(async (_event: unknown) => undefined),
}));

vi.mock('@/lib/server/neon-db', () => {
  const adapter = {
    query: (...args: unknown[]) => mocks.neonQuery(...args),
    execute: async () => 0,
    transaction: async (callback: (tx: unknown) => unknown) => callback(adapter),
  };
  return { getNeonDb: () => adapter };
});
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/github-app', () => ({
  getInstallationAccessToken: vi.fn(),
  getPrDiff: vi.fn(),
  isGitHubAppConfigured: () => false,
  isGitHubInstallationLinkingAvailable: () => false,
  postIssueComment: vi.fn(),
  postPrReview: vi.fn(),
}));
vi.mock('@/lib/egress-policy', async (importOriginal) => ({
  ...(await importOriginal()),
  assertResolvedPublicHostname: vi.fn(async () => undefined),
}));
vi.mock('@agiworkforce/mcp', () => ({
  buildMcpToolCatalog: vi.fn(),
  connectMcpServer: (...a: unknown[]) => mocks.connectMcpServer(...a),
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/security-audit')>()),
  recordAuditEvent: mocks.recordAuditEvent,
}));
vi.mock('@/lib/services/organization-policy-gate', () => ({
  resolveSecretHandlingPolicy: (...a: unknown[]) => mocks.secretMode(...a),
}));

import {
  __resetConnectorMcpMapCacheForTests,
  makeUserConnectorExecutor,
} from '../user-connector-tools';

const SECRET = `sk_live_${'c'.repeat(30)}`;

beforeEach(() => {
  vi.clearAllMocks();
  __resetConnectorMcpMapCacheForTests();
  process.env['CONNECTOR_MCP_SERVERS_JSON'] = JSON.stringify({
    connectors: [{ connectorId: 'notion', url: 'https://mcp.notion.example/mcp' }],
  });
  mocks.neonQuery.mockImplementation((sql: string) =>
    Promise.resolve(String(sql).includes('user_connectors') ? [{ connector_id: 'notion' }] : []),
  );
});

describe('connector writes pass outbound content inspection', () => {
  it('never sends a secret to the connector when the workspace blocks secrets', async () => {
    mocks.secretMode.mockResolvedValue({ mode: 'block', organizationId: 'org-1' });
    const callTool = vi.fn();
    mocks.connectMcpServer.mockResolvedValue({ serverName: 'notion', callTool, close: vi.fn() });

    const result = await makeUserConnectorExecutor('user-1', 'org-1')('notion', 'create_page', {
      body: `token ${SECRET}`,
    });

    expect(result.isError).toBe(true);
    expect(mocks.connectMcpServer).not.toHaveBeenCalled();
    expect(callTool).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'dlp_content_blocked', organizationId: 'org-1' }),
    );
  });

  it('sends the redacted payload when the workspace redacts', async () => {
    mocks.secretMode.mockResolvedValue({ mode: 'redact', organizationId: 'org-1' });
    const callTool = vi
      .fn()
      .mockResolvedValue({ isError: false, content: [{ type: 'text', text: 'ok' }] });
    mocks.connectMcpServer.mockResolvedValue({ serverName: 'notion', callTool, close: vi.fn() });

    await makeUserConnectorExecutor('user-1', 'org-1')('notion', 'create_page', {
      body: `token ${SECRET}`,
    });

    expect(callTool).toHaveBeenCalledWith('create_page', { body: 'token [REDACTED]' });
  });

  it('does not consult policy for a clean call', async () => {
    const callTool = vi
      .fn()
      .mockResolvedValue({ isError: false, content: [{ type: 'text', text: 'ok' }] });
    mocks.connectMcpServer.mockResolvedValue({ serverName: 'notion', callTool, close: vi.fn() });

    await makeUserConnectorExecutor('user-1')('notion', 'search_pages', { q: 'roadmap' });

    expect(mocks.secretMode).not.toHaveBeenCalled();
    expect(callTool).toHaveBeenCalledWith('search_pages', { q: 'roadmap' });
  });
});
