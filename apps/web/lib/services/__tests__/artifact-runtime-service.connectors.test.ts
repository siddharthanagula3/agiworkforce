import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectorsAllowed: vi.fn(),
  loadCatalog: vi.fn(),
  loadPolicy: vi.fn(),
  loadPermissions: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/connectors/connector-capability', () => ({
  connectorsAllowedForTurn: (...args: unknown[]) => mocks.connectorsAllowed(...args),
  connectorsAllowedWithoutRequest: vi.fn(),
}));
vi.mock('@/lib/user-connector-tools', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadUserConnectorToolCatalog: (...args: unknown[]) => mocks.loadCatalog(...args),
  makeUserConnectorExecutor: vi.fn(() => vi.fn()),
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/tool-approval-policy', () => ({
  autonomousToolApprovalsAvailable: vi.fn(),
  hostedToolRunsUnasked: vi.fn(),
  loadTurnToolPermissions: vi.fn(),
  policyAutoApprovesTool: vi.fn(),
  loadToolApprovalPolicy: (...args: unknown[]) => mocks.loadPolicy(...args),
}));
vi.mock(
  '@/app/api/llm/v1/chat/completions/lib/connector-tool-permissions',
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    loadConnectorToolPermissions: (...args: unknown[]) => mocks.loadPermissions(...args),
  }),
);
vi.mock('@agiworkforce/types', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getModelMetadataById: () => ({ capabilities: { tools: true } }),
}));

const { buildArtifactConnectorPlan } = await import('../artifact-runtime-service');

const input = {
  db: {} as never,
  userId: 'user-1',
  organizationId: null,
  planTier: 'pro',
  modelKey: 'tool-model',
  connectors: ['linear'],
  allowedTools: [],
  request: new NextRequest('https://agiworkforce.test/api/artifacts/runtime/token/complete'),
};

describe('buildArtifactConnectorPlan connector decision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadCatalog.mockResolvedValue({ tools: [], dropped: [], limit: null });
    mocks.loadPolicy.mockResolvedValue({ mode: 'autonomous' });
    mocks.loadPermissions.mockResolvedValue({
      isDenied: () => false,
      isConnectorToolDenied: () => false,
    });
  });

  it('offers no connectors when the connector decision is closed', async () => {
    mocks.connectorsAllowed.mockResolvedValue(false);

    await expect(buildArtifactConnectorPlan(input)).resolves.toBeNull();
    expect(mocks.loadCatalog).not.toHaveBeenCalled();
  });

  it('reads the catalog when the connector decision is open', async () => {
    mocks.connectorsAllowed.mockResolvedValue(true);

    const plan = await buildArtifactConnectorPlan(input);

    expect(mocks.connectorsAllowed).toHaveBeenCalledWith(input.request, 'user-1', {
      organizationId: null,
      subscriptionTier: 'pro',
      chatSurface: 'unknown',
    });
    expect(mocks.loadCatalog).toHaveBeenCalled();
    expect(plan?.unusable).toEqual(['linear']);
  });
});
