import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  loadConnectorToolPermissions: vi.fn(),
  withUserConnectorMcpHandle: vi.fn(),
  bindMcpTask: vi.fn(),
  isMcpTaskBound: vi.fn(),
  recordAuditEvent: vi.fn(),
  levelForConnectorTool: vi.fn(),
  callTool: vi.fn(),
  readResource: vi.fn(),
  getPrompt: vi.fn(),
  taskGet: vi.fn(),
  db: { query: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/csrf', () => ({
  generateCsrfToken: vi.fn(),
  getOrCreateAnonSession: vi.fn(),
  getSessionIdFromRequest: vi.fn(),
  isBearerTokenValid: vi.fn(),
  readCookie: vi.fn(),
  resetCsrfCache: vi.fn(),
  validateCsrfFromRequest: vi.fn(),
  verifyCsrfToken: vi.fn(),
  requireCsrfToken: mocks.requireCsrfToken,
}));
vi.mock('@/lib/rate-limit', () => ({
  REDIS_OUTAGE_POLICY_ENV: 'AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY',
  acquireManagedTurnSlot: vi.fn(),
  checkRateLimit: vi.fn(),
  clientIpRateLimitIdentifier: vi.fn(),
  getClientIpForRateLimit: vi.fn(),
  isSharedStoreQuotaExhausted: vi.fn(),
  rateLimitConfigs: vi.fn(),
  readManagedTurnSlots: vi.fn(),
  resolveRedisOutagePolicy: vi.fn(),
  resolveTierRateLimit: vi.fn(),
  withRateLimitHandler: vi.fn(),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/server/rls-db', () => ({
  ACTIVE_ORG_HEADER: vi.fn(),
  getCurrentUserRlsDb: vi.fn(),
  getVerifiedBearerUserScopedDb: vi.fn(),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/security-audit', () => ({
  BLOCK_APPEAL_PATH: '/support',
  SECURITY_EVENT_ACTIVITY_REDIS_KEY: 'agi-security-audit:pending-anomaly-check',
  auditEnvelopeFields: vi.fn(),
  auditRetentionClassFor: vi.fn(),
  consumePendingSecurityAnomalyCheck: vi.fn(),
  getClientIp: vi.fn(),
  logAuthFailure: vi.fn(),
  logAuthorizationFailure: vi.fn(),
  logCsrfFailure: vi.fn(),
  logInvalidSignature: vi.fn(),
  logRateLimitExceeded: vi.fn(),
  logSecurityEvent: vi.fn(),
  logSuspiciousActivity: vi.fn(),
  sanitizeAuditDetail: vi.fn(),
  recordAuditEvent: mocks.recordAuditEvent,
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/connector-tool-permissions', () => ({
  scopeConnectorPermissionsToTurn: vi.fn(),
  EMPTY_CONNECTOR_TOOL_PERMISSIONS: vi.fn(),
  LOCKED_DOWN_CONNECTOR_TOOL_PERMISSIONS: vi.fn(),
  connectorToolPermissionsFromEntries: vi.fn(),
  isLockedDown: vi.fn(),
  withDisabledConnectorIds: vi.fn(),
  withWorkspaceToolRules: vi.fn(),
  withoutStandingApprovals: vi.fn(),
  loadConnectorToolPermissions: mocks.loadConnectorToolPermissions,
}));
vi.mock('@/lib/user-connector-tools', () => ({
  ConnectorCredentialError: class ConnectorCredentialError extends Error {},
  MAX_CONNECTOR_TOOLS_PER_USER: 32,
  __resetConnectorMcpMapCacheForTests: vi.fn(),
  evictConnectorOAuthCaches: vi.fn(),
  evictCustomConnectorCaches: vi.fn(),
  evictOrgSharedConnectorCaches: vi.fn(),
  findUserCustomConnectorByServerId: vi.fn(),
  findUserCustomConnectorByUrl: vi.fn(),
  getOperatorMappedConnectorIds: vi.fn(),
  getUserCustomConnectorSummaries: vi.fn(),
  getUserGithubInstallations: vi.fn(),
  loadUserConnectorCapabilityCatalog: vi.fn(),
  loadUserConnectorToolCatalog: vi.fn(),
  loadUserConnectorToolDefs: vi.fn(),
  makeUserConnectorExecutor: vi.fn(),
  researchConnectorSources: vi.fn(),
  withUserConnectorMcpHandle: mocks.withUserConnectorMcpHandle,
}));
vi.mock('@/lib/connectors/mcp-state-store', () => ({
  loadMcpAppPayload: vi.fn(),
  saveMcpAppPayload: vi.fn(),
  bindMcpTask: mocks.bindMcpTask,
  isMcpTaskBound: mocks.isMcpTaskBound,
}));

import { createError } from '@/lib/errors';
import { POST } from '../route';

const CONNECTOR = 'notion';
const connection = {
  connectorId: CONNECTOR,
  handle: {
    callTool: mocks.callTool,
    readResource: mocks.readResource,
    getPrompt: mocks.getPrompt,
    tasks: { get: mocks.taskGet, update: vi.fn(), cancel: vi.fn() },
  },
};

function call(body: unknown, connectorId = CONNECTOR) {
  return POST(
    new NextRequest(`http://localhost/api/connectors/${connectorId}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ connectorId }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.getUserScopedDb.mockResolvedValue({
    db: mocks.db,
    userId: 'user-1',
    organizationId: 'org-1',
  });
  mocks.loadConnectorToolPermissions.mockResolvedValue({
    levelForConnectorTool: mocks.levelForConnectorTool,
  });
  mocks.levelForConnectorTool.mockReturnValue('allow');
  mocks.withUserConnectorMcpHandle.mockImplementation(
    async (_userId: string, _ref: string, run: (c: typeof connection) => Promise<unknown>) =>
      run(connection),
  );
  mocks.callTool.mockResolvedValue({ content: [{ type: 'text', text: 'done' }] });
  mocks.readResource.mockResolvedValue({ contents: [] });
  mocks.bindMcpTask.mockResolvedValue(true);
  mocks.isMcpTaskBound.mockResolvedValue(true);
  mocks.taskGet.mockResolvedValue({ status: 'working' });
});

describe('POST /api/connectors/[connectorId]/mcp', () => {
  it('returns the CSRF refusal', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await call({ operation: 'readResource', uri: 'notion://page/1' });

    expect(response.status).toBe(403);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('rejects an invalid connector id and an unknown operation', async () => {
    expect((await call({ operation: 'readResource', uri: 'x' }, '../etc')).status).toBe(400);
    expect((await call({ operation: 'deleteEverything' })).status).toBe(400);
    expect(mocks.withUserConnectorMcpHandle).not.toHaveBeenCalled();
  });

  it('rejects a payload over the operation size cap', async () => {
    const response = await call({
      operation: 'callTool',
      name: 'search',
      arguments: { q: 'x'.repeat(130_000) },
    });

    expect(response.status).toBe(400);
    expect(mocks.withUserConnectorMcpHandle).not.toHaveBeenCalled();
  });

  it('rejects a signed-out caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await call({ operation: 'readResource', uri: 'notion://page/1' });

    expect(response.status).toBe(401);
    expect(mocks.withUserConnectorMcpHandle).not.toHaveBeenCalled();
  });

  it('answers 404 when the caller has no such connected connector', async () => {
    mocks.withUserConnectorMcpHandle.mockResolvedValue(null);

    const response = await call({ operation: 'readResource', uri: 'notion://page/1' });

    expect(response.status).toBe(404);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('refuses a denied tool without calling it', async () => {
    mocks.levelForConnectorTool.mockReturnValue('deny');

    const response = await call({ operation: 'callTool', name: 'delete_page', approved: true });

    expect(response.status).toBe(403);
    expect(mocks.callTool).not.toHaveBeenCalled();
  });

  it('asks for approval for an ask-level tool and audits nothing', async () => {
    mocks.levelForConnectorTool.mockReturnValue('ask');

    const response = await call({ operation: 'callTool', name: 'create_page' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ approvalRequired: true, connectorId: CONNECTOR });
    expect(mocks.callTool).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('answers 503 when a returned task cannot be bound to the caller', async () => {
    mocks.callTool.mockResolvedValue({ task: { taskId: 't-1' } });
    mocks.bindMcpTask.mockResolvedValue(false);

    const response = await call({ operation: 'callTool', name: 'export' });

    expect(response.status).toBe(503);
  });

  it('answers 404 for a task that is not bound to the caller', async () => {
    mocks.isMcpTaskBound.mockResolvedValue(false);

    const response = await call({ operation: 'taskGet', taskId: 't-other' });

    expect(response.status).toBe(404);
    expect(mocks.isMcpTaskBound).toHaveBeenCalledWith('user-1', CONNECTOR, 't-other');
    expect(mocks.taskGet).not.toHaveBeenCalled();
  });

  it('calls an approved tool for the caller and audits the execution', async () => {
    const response = await call({
      operation: 'callTool',
      name: 'create_page',
      arguments: { title: 'Notes' },
      approved: true,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      approvalRequired: false,
      connectorId: CONNECTOR,
      result: { content: [{ type: 'text', text: 'done' }] },
    });
    expect(mocks.loadConnectorToolPermissions).toHaveBeenCalledWith(mocks.db, 'user-1', 'org-1');
    expect(mocks.withUserConnectorMcpHandle).toHaveBeenCalledWith(
      'user-1',
      CONNECTOR,
      expect.any(Function),
    );
    expect(mocks.callTool).toHaveBeenCalledWith(
      'create_page',
      { title: 'Notes' },
      { allowInputRequired: true },
    );
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        organizationId: 'org-1',
        eventType: 'tool_executed',
        detail: expect.objectContaining({ connectorId: CONNECTOR, status: 'callTool' }),
      }),
    );
  });

  it('audits a resource read as data access', async () => {
    const response = await call({ operation: 'readResource', uri: 'notion://page/1' });

    expect(response.status).toBe(200);
    expect(mocks.readResource).toHaveBeenCalledWith('notion://page/1');
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'data_accessed' }),
    );
  });
});
