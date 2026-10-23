import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  reserve: vi.fn(),
  started: vi.fn(),
  finalize: vi.fn(),
  runToolLoop: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  reserveManagedUsageRequest: mocks.reserve,
  markManagedUsageProviderStarted: mocks.started,
  finalizeManagedUsageRequest: mocks.finalize,
}));
vi.mock('@/lib/services/aggregator-routing', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  dispatchProviderForSelectedRoute: () => 'tool-provider',
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/adapter-providers', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ADAPTER_PROVIDERS: { 'tool-provider': {} },
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/tool-loop', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  runToolLoop: mocks.runToolLoop,
}));

const { completeArtifactPrompt } = await import('../artifact-runtime-service');
const { ManagedUsageRequestError } = await import('@/lib/services/managed-usage-request-service');

const ROUTE = {
  provider: 'deepseek',
  providerModelId: 'provider-model',
  modelKey: 'tool-model',
  routeId: 'route-1',
};

const PUBLISHED = {
  kind: 'published' as const,
  publishedArtifactId: '6f1c2a7e-0b1d-4c3e-9a8f-1234567890ab',
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
  toolApprovalPolicy: 'ask_every_time',
} as never;

function input(overrides: Record<string, unknown> = {}) {
  return {
    db: { query: async () => [{ allowed: true }] } as never,
    userId: 'viewer-1',
    organizationId: null,
    subject: PUBLISHED,
    prompt: 'list my open issues',
    route: ROUTE,
    planTier: 'pro',
    signal: new AbortController().signal,
    plan: null,
    idempotencyKey: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AGI_ARTIFACT_AI_ENABLED', '1');
  mocks.reserve.mockRejectedValue(new Error('stop after the reservation'));
  mocks.started.mockResolvedValue(undefined);
  mocks.finalize.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('completeArtifactPrompt while AI in apps is switched off', () => {
  it('refuses before anything is reserved', async () => {
    vi.stubEnv('AGI_ARTIFACT_AI_ENABLED', undefined);

    const refusal = completeArtifactPrompt(input());

    await expect(refusal).rejects.toBeInstanceOf(ManagedUsageRequestError);
    await expect(refusal).rejects.toMatchObject({ status: 403, code: 'artifact_ai_off' });
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
});

describe('completeArtifactPrompt usage attribution', () => {
  it('reserves on the signed-in viewer and names the published app it ran in', async () => {
    await expect(completeArtifactPrompt(input())).rejects.toThrow('stop after the reservation');

    expect(mocks.reserve).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'viewer-1', artifactSubject: PUBLISHED }),
    );
  });

  it('names an app in the viewer’s own chat the same way', async () => {
    const owned = { kind: 'owned' as const, artifactId: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d' };

    await expect(completeArtifactPrompt(input({ subject: owned }))).rejects.toThrow(
      'stop after the reservation',
    );

    expect(mocks.reserve).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'viewer-1', artifactSubject: owned }),
    );
  });
});

describe('completeArtifactPrompt prompt-injection boundary', () => {
  it('runs a connector call as a run carrying untrusted content', async () => {
    mocks.reserve.mockResolvedValue({ userId: 'viewer-1', idempotencyKey: 'key-1' });
    mocks.runToolLoop.mockImplementation(async function* () {
      yield* [];
    });

    await completeArtifactPrompt(input({ plan: CONNECTOR_PLAN }));

    expect(mocks.runToolLoop).toHaveBeenCalledOnce();
    const [processed, options] = mocks.runToolLoop.mock.calls[0]! as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(processed['untrustedContextPresent']).toBe(true);
    expect(options['unattended']).toBe(true);
  });
});
