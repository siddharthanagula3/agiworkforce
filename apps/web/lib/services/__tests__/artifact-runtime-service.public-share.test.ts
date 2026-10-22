import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  reserve: vi.fn(),
  query: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  reserveManagedUsageRequest: mocks.reserve,
}));

const { completeArtifactPrompt } = await import('../artifact-runtime-service');
const { ManagedUsageRequestError } = await import('@/lib/services/managed-usage-request-service');
const { CONNECTOR_ARTIFACT_PUBLIC_SHARE_MESSAGE } =
  await import('@/lib/services/published-artifact-service');

const ROUTE = {
  provider: 'deepseek',
  providerModelId: 'provider-model',
  modelKey: 'tool-model',
  routeId: 'route-1',
};

const CONNECTOR_PLAN = {
  mcpTools: [
    {
      serverId: 'linear',
      toolName: 'list_issues',
      qualifiedName: 'mcp__linear__list_issues',
      origin: 'connector',
    },
  ],
} as never;

function input(overrides: Record<string, unknown> = {}) {
  return {
    db: { query: (...args: unknown[]) => mocks.query(...args) } as never,
    userId: 'viewer-1',
    organizationId: null,
    subject: { kind: 'published' as const, publishedArtifactId: 'publication-1' },
    prompt: 'list my open issues',
    route: ROUTE,
    planTier: 'pro',
    signal: new AbortController().signal,
    plan: CONNECTOR_PLAN,
    idempotencyKey: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reserve.mockRejectedValue(new Error('stop after the gate'));
});

describe('completeArtifactPrompt on a publicly shared artifact', () => {
  it('refuses connector use before reserving anything when the artifact is public', async () => {
    mocks.query.mockResolvedValue([{ allowed: false }]);

    const refusal = completeArtifactPrompt(input());

    await expect(refusal).rejects.toBeInstanceOf(ManagedUsageRequestError);
    await expect(refusal).rejects.toMatchObject({
      status: 403,
      code: 'connectors_not_on_public_share',
      message: CONNECTOR_ARTIFACT_PUBLIC_SHARE_MESSAGE,
    });
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it('treats an unanswered audience check as public', async () => {
    mocks.query.mockResolvedValue([]);

    await expect(completeArtifactPrompt(input())).rejects.toMatchObject({
      code: 'connectors_not_on_public_share',
    });
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it('fails closed when the visibility read fails', async () => {
    mocks.query.mockRejectedValue(new Error('database unavailable'));

    await expect(completeArtifactPrompt(input())).rejects.toThrow('database unavailable');
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it('keeps connectors on an artifact shared with a workspace or invited people', async () => {
    mocks.query.mockResolvedValue([{ allowed: true }]);

    await expect(completeArtifactPrompt(input())).rejects.toThrow('stop after the gate');
    expect(mocks.reserve).toHaveBeenCalledOnce();
  });

  it('lets a public artifact use AI without connectors', async () => {
    await expect(completeArtifactPrompt(input({ plan: null }))).rejects.toThrow(
      'stop after the gate',
    );
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.reserve).toHaveBeenCalledOnce();
  });

  it('does not consult publication visibility for the owner’s own artifact', async () => {
    await expect(
      completeArtifactPrompt(input({ subject: { kind: 'owned', artifactId: 'artifact-1' } })),
    ).rejects.toThrow('stop after the gate');
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
