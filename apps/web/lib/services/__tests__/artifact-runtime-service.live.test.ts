import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  allowedWithoutRequest: vi.fn(),
  loadCatalog: vi.fn(),
  loadPolicy: vi.fn(),
  loadPermissions: vi.fn(),
  entitlement: vi.fn(),
  unattended: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/connectors/connector-capability', () => ({
  connectorsAllowedForTurn: vi.fn(),
  connectorsAllowedWithoutRequest: (...args: unknown[]) => mocks.allowedWithoutRequest(...args),
}));
vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveEntitlementBundle: (...args: unknown[]) => mocks.entitlement(...args),
}));
vi.mock('@/lib/user-connector-tools', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadUserConnectorToolCatalog: (...args: unknown[]) => mocks.loadCatalog(...args),
  makeUserConnectorExecutor: vi.fn(() => vi.fn()),
}));
vi.mock('@/lib/services/unattended-tool-gate', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  runsUnattendedWithoutAsking: (...args: unknown[]) => mocks.unattended(...args),
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

const { bindingCovers, liveArtifactMissingConnectors, readOwnedRunnableArtifact } =
  await import('../artifact-runtime-service');

function tool(serverId: string, toolName: string) {
  return {
    origin: 'connector',
    serverId,
    toolName,
    qualifiedName: `${serverId}__${toolName}`,
    description: '',
  };
}

describe('liveArtifactMissingConnectors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.entitlement.mockResolvedValue({ plan: 'pro', subscription: null });
    mocks.loadPolicy.mockResolvedValue({ mode: 'autonomous' });
    mocks.loadPermissions.mockResolvedValue({
      isDenied: () => false,
      isConnectorToolDenied: () => false,
    });
    mocks.unattended.mockReturnValue(true);
  });

  it('counts every bound app missing when the account cannot use connected apps, and dials none', async () => {
    mocks.allowedWithoutRequest.mockResolvedValue(false);
    await expect(
      liveArtifactMissingConnectors({ db: {} as never, userId: 'user-1', connectors: ['slack'] }),
    ).resolves.toEqual(['slack']);
    expect(mocks.loadCatalog).not.toHaveBeenCalled();
  });

  it('dials only the bound apps and reports the ones with no tool that runs unattended', async () => {
    mocks.allowedWithoutRequest.mockResolvedValue(true);
    mocks.loadCatalog.mockResolvedValue({
      tools: [tool('slack', 'search'), tool('linear', 'list_issues')],
      dropped: [],
      limit: null,
    });
    mocks.unattended.mockImplementation((name: string) => name.startsWith('slack'));

    const missing = await liveArtifactMissingConnectors({
      db: {} as never,
      userId: 'user-1',
      connectors: ['slack', 'linear', 'google_drive'],
    });

    expect(missing).toEqual(['linear', 'google_drive']);
    const options = mocks.loadCatalog.mock.calls[0]?.[1] as {
      isConnectorDenied: (id: string) => boolean;
    };
    expect(options.isConnectorDenied('slack')).toBe(false);
    expect(options.isConnectorDenied('notion')).toBe(true);
  });
});

describe('readOwnedRunnableArtifact', () => {
  it('reads only the caller’s HTML or React artifact from a live chat', async () => {
    const query = vi.fn(async () => [
      {
        id: 'a1',
        conversation_id: 'c1',
        message_id: 'm1',
        title: 'Dashboard',
        artifact_type: 'react',
      },
    ]);
    const artifact = await readOwnedRunnableArtifact(
      { query } as never,
      { userId: 'user-1', organizationId: null },
      'a1',
    );
    expect(artifact).toEqual({
      artifactId: 'a1',
      conversationId: 'c1',
      messageId: 'm1',
      title: 'Dashboard',
      type: 'react',
    });
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('conversations.deleted_at is null');
    expect(sql).toContain('messages.deleted_at is null');
    expect(sql).toContain('conversations.organization_id is not distinct from $4::uuid');
    expect(params).toEqual(['a1', 'user-1', ['html', 'react'], null]);
  });
});

describe('bindingCovers', () => {
  it('needs no binding for AI alone and the whole set for connected apps', () => {
    expect(bindingCovers(null, [])).toBe(true);
    expect(bindingCovers(null, ['slack'])).toBe(false);
    expect(bindingCovers({ connectors: ['slack'] }, ['slack'])).toBe(true);
    expect(bindingCovers({ connectors: ['slack'] }, ['slack', 'linear'])).toBe(false);
  });
});
