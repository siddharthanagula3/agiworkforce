import { beforeEach, describe, expect, it, vi } from 'vitest';

type AdmissionModule = typeof import('@/lib/server/managed-cloud-routing/admission');

const mocks = vi.hoisted(() => ({
  admit: vi.fn(),
  keepsOutOfTraining: vi.fn(),
  reserve: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/server/managed-cloud-routing/admission', async (importOriginal) => ({
  ...(await importOriginal<AdmissionModule>()),
  admitManagedCloudRoute: mocks.admit,
}));
vi.mock('@/lib/server/provider-training-opt-out', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  modelKeepsInputsOutOfTraining: mocks.keepsOutOfTraining,
}));
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  reserveManagedUsageRequest: mocks.reserve,
}));

const {
  ArtifactRuntimeGoogleUserDataRouteError,
  ArtifactRuntimeRouteUnavailableError,
  completeArtifactPrompt,
  selectArtifactRuntimeRoute,
} = await import('../artifact-runtime-service');
const { GMAIL_CONNECTOR_ID } = await import('@/lib/connectors/gmail-actions');

const db = {} as never;
const ACCOUNT = { db, userId: 'user-1', organizationId: 'org-1' };
const ROUTE = {
  provider: 'deepseek',
  providerModelId: 'provider-model',
  modelKey: 'training-model',
  routeId: 'route-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AGI_ARTIFACT_AI_ENABLED', '1');
  mocks.admit.mockResolvedValue({
    status: 'admitted',
    route: { status: 'selected', harnessId: 'deepseek/chat', ...ROUTE },
    dispatchProvider: ROUTE.provider,
  });
  mocks.keepsOutOfTraining.mockReturnValue(true);
});

function refused(reason: string) {
  return { status: 'refused', reason, code: null };
}

describe('selectArtifactRuntimeRoute', () => {
  it('asks for a background route for the account and workspace, keeping a Google run out of training', async () => {
    await selectArtifactRuntimeRoute(ACCOUNT, 'summarise my inbox', 'pro', {
      needsTools: true,
      googleUserData: true,
    });

    expect(mocks.admit).toHaveBeenCalledWith({
      kind: 'background',
      account: ACCOUNT,
      planTier: 'pro',
      need: {
        taskType: expect.any(String),
        keepOutOfTraining: true,
        requiredCapabilities: ['functionCalling'],
      },
    });
  });

  it('leaves training to the account preference when no Google connector is in reach', async () => {
    await selectArtifactRuntimeRoute(ACCOUNT, 'hello', 'pro');

    expect(mocks.admit).toHaveBeenCalledWith(
      expect.objectContaining({
        need: { taskType: expect.any(String), keepOutOfTraining: false },
      }),
    );
  });

  it('refuses with the Google copy when no model keeps inputs out of training', async () => {
    mocks.admit.mockResolvedValue(refused('no_training_route'));

    const refusal = selectArtifactRuntimeRoute(ACCOUNT, 'summarise my inbox', 'pro', {
      googleUserData: true,
    });

    await expect(refusal).rejects.toBeInstanceOf(ArtifactRuntimeGoogleUserDataRouteError);
    await expect(refusal).rejects.toBeInstanceOf(ArtifactRuntimeRouteUnavailableError);
  });

  it.each([['no_route'], ['policy_unreadable']])(
    'refuses with the general copy when admission refuses with %s',
    async (reason) => {
      mocks.admit.mockResolvedValue(refused(reason));

      const refusal = selectArtifactRuntimeRoute(ACCOUNT, 'hello', 'pro', {
        googleUserData: true,
      });

      await expect(refusal).rejects.toBeInstanceOf(ArtifactRuntimeRouteUnavailableError);
      await expect(refusal).rejects.not.toBeInstanceOf(ArtifactRuntimeGoogleUserDataRouteError);
    },
  );

  it('refuses a media-only route', async () => {
    mocks.admit.mockResolvedValue({
      status: 'admitted',
      route: { status: 'selected', harnessId: 'provider/media', ...ROUTE },
      dispatchProvider: ROUTE.provider,
    });

    await expect(selectArtifactRuntimeRoute(ACCOUNT, 'hello', 'pro')).rejects.toBeInstanceOf(
      ArtifactRuntimeRouteUnavailableError,
    );
  });
});

describe('completeArtifactPrompt and Google user data', () => {
  function input(serverId: string) {
    return {
      db: { query: async () => [{ allowed: true }] } as never,
      userId: 'user-1',
      organizationId: null,
      subject: { kind: 'published' as const, publishedArtifactId: 'artifact-1' },
      prompt: 'summarise my inbox',
      route: ROUTE,
      planTier: 'pro',
      signal: new AbortController().signal,
      plan: {
        mcpTools: [
          {
            serverId,
            toolName: 'search_threads',
            qualifiedName: `mcp__${serverId}__search_threads`,
            origin: 'connector',
          },
        ],
      } as never,
      idempotencyKey: null,
    };
  }

  it('never reserves or calls a model that may train when a Google tool is in the plan', async () => {
    mocks.keepsOutOfTraining.mockReturnValue(false);

    await expect(completeArtifactPrompt(input(GMAIL_CONNECTOR_ID))).rejects.toBeInstanceOf(
      ArtifactRuntimeGoogleUserDataRouteError,
    );
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it('lets a plan without Google tools proceed to billing on the same model', async () => {
    mocks.keepsOutOfTraining.mockReturnValue(false);
    mocks.reserve.mockRejectedValue(new Error('stop after the gate'));

    await expect(completeArtifactPrompt(input('linear'))).rejects.toThrow('stop after the gate');
    expect(mocks.reserve).toHaveBeenCalledOnce();
  });
});
