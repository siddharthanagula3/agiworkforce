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

const {
  bindingCovers,
  liveArtifactMissingConnectors,
  readConversationOriginPrivacyMode,
  readOwnedRunnableArtifact,
} = await import('../artifact-runtime-service');

const OWNER = { userId: 'user-1', organizationId: null };
const MANAGED_MODEL_ID = 'auto-balanced';
const LOCAL_MODEL_ID = 'ollama/fixture-local-model';

function originSignal(
  model: string | null,
  privacyMode: string | null = null,
  providerMode: string | null = null,
) {
  return { model, privacy_mode: privacyMode, provider_mode: providerMode };
}

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
      liveArtifactMissingConnectors({
        db: {} as never,
        userId: 'user-1',
        organizationId: null,
        connectors: ['slack'],
      }),
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
      organizationId: 'org-1',
      connectors: ['slack', 'linear', 'google_drive'],
    });

    expect(missing).toEqual(['linear', 'google_drive']);
    expect(mocks.allowedWithoutRequest).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', organizationId: 'org-1' }),
    );
    expect(mocks.loadPermissions).toHaveBeenCalledWith({}, 'user-1', 'org-1');
    expect(mocks.loadCatalog).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ organizationId: 'org-1' }),
    );
    const options = mocks.loadCatalog.mock.calls[0]?.[1] as {
      isConnectorDenied: (id: string) => boolean;
    };
    expect(options.isConnectorDenied('slack')).toBe(false);
    expect(options.isConnectorDenied('notion')).toBe(true);
  });

  it('judges each bound tool on the annotations its connector published', async () => {
    mocks.allowedWithoutRequest.mockResolvedValue(true);
    const annotated = { ...tool('notes', 'archive_note'), annotations: { destructiveHint: true } };
    mocks.loadCatalog.mockResolvedValue({ tools: [annotated], dropped: [], limit: null });

    await liveArtifactMissingConnectors({
      db: {} as never,
      userId: 'user-1',
      organizationId: null,
      connectors: ['notes'],
    });

    expect(mocks.unattended).toHaveBeenCalledWith(
      annotated.qualifiedName,
      expect.anything(),
      expect.anything(),
      { destructiveHint: true },
    );
  });
});

describe('readOwnedRunnableArtifact', () => {
  it('reads only the caller’s HTML or React artifact from a live chat, with its chat’s origin', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'a1',
          conversation_id: 'c1',
          message_id: 'm1',
          title: 'Dashboard',
          artifact_type: 'react',
        },
      ])
      .mockResolvedValueOnce([originSignal(MANAGED_MODEL_ID)]);
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
      originPrivacyMode: 'managed',
    });
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('conversations.deleted_at is null');
    expect(sql).toContain('messages.deleted_at is null');
    expect(sql).toContain('conversations.organization_id is not distinct from $4::uuid');
    expect(params).toEqual(['a1', 'user-1', ['html', 'react'], null]);
    expect(query.mock.calls[1]?.[1]).toEqual(['c1', 'user-1', null]);
  });

  it('reads no origin for an artifact the caller does not own', async () => {
    const query = vi.fn().mockResolvedValueOnce([]);
    await expect(
      readOwnedRunnableArtifact(
        { query } as never,
        { userId: 'user-1', organizationId: null },
        'a1',
      ),
    ).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe('readConversationOriginPrivacyMode', () => {
  async function originOf(rows: ReturnType<typeof originSignal>[]) {
    const query = vi.fn(async () => rows);
    const mode = await readConversationOriginPrivacyMode({ query } as never, OWNER, 'c1');
    return { mode, query };
  }

  it('reads the conversation model and every live turn’s model and labels', async () => {
    const { mode, query } = await originOf([originSignal(MANAGED_MODEL_ID)]);
    expect(mode).toBe('managed');
    const [sql] = query.mock.calls[0] as unknown as [string];
    expect(sql).toContain('from public.web_conversations conversations');
    expect(sql).toContain('from public.web_messages messages');
    expect(sql).toContain("messages.metadata->>'privacyMode'");
    expect(sql).toContain("messages.metadata->>'providerMode'");
    expect(sql).toContain('messages.deleted_at is null');
  });

  it('reads only a live conversation of the caller in the active workspace', async () => {
    const { query } = await originOf([originSignal(MANAGED_MODEL_ID)]);
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('conversations.user_id = $2::text');
    expect(sql).toContain('conversations.deleted_at is null');
    expect(sql).toContain('conversations.organization_id is not distinct from $3::uuid');
    expect(params).toEqual(['c1', OWNER.userId, OWNER.organizationId]);
  });

  it('classes a chat with any Local turn as Local', async () => {
    const { mode } = await originOf([originSignal(MANAGED_MODEL_ID), originSignal(LOCAL_MODEL_ID)]);
    expect(mode).toBe('local');
  });

  it('classes a chat a turn labels as BYOK as BYOK', async () => {
    const { mode } = await originOf([
      originSignal(MANAGED_MODEL_ID),
      originSignal(null, null, 'DirectByok'),
    ]);
    expect(mode).toBe('byok');
    await expect(
      originOf([originSignal(MANAGED_MODEL_ID), originSignal(null, 'byok')]).then((r) => r.mode),
    ).resolves.toBe('byok');
  });

  it('reports no origin when the chat carries no signal at all', async () => {
    const { mode } = await originOf([originSignal(null), originSignal('not-a-known-model')]);
    expect(mode).toBeNull();
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
