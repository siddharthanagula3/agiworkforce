import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sideCallRouting: vi.fn(),
  resolveAutoRoute: vi.fn(),
  keepsOutOfTraining: vi.fn(),
  reserve: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/server/side-call-training-policy', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sideCallRoutingRequest: mocks.sideCallRouting,
}));
vi.mock('@/lib/server/provider-training-opt-out', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  modelKeepsInputsOutOfTraining: mocks.keepsOutOfTraining,
}));
vi.mock('@agiworkforce/routing', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveAutoRoute: mocks.resolveAutoRoute,
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
const ROUTE = {
  provider: 'deepseek',
  providerModelId: 'provider-model',
  modelKey: 'training-model',
  routeId: 'route-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sideCallRouting.mockImplementation(async (_db, _user, request) => request);
  mocks.resolveAutoRoute.mockReturnValue({ status: 'ok', harnessId: 'deepseek/chat', ...ROUTE });
  mocks.keepsOutOfTraining.mockReturnValue(true);
});

describe('selectArtifactRuntimeRoute and Google user data', () => {
  it('forces no-training routing for a run that can reach a Google connector', async () => {
    await selectArtifactRuntimeRoute(db, 'user-1', 'summarise my inbox', 'pro', {
      needsTools: true,
      googleUserData: true,
    });

    expect(mocks.sideCallRouting).toHaveBeenCalledWith(db, 'user-1', expect.any(Object), {
      forceNoTraining: true,
    });
  });

  it('leaves routing to the account preference when no Google connector is in reach', async () => {
    await selectArtifactRuntimeRoute(db, 'user-1', 'hello', 'pro', { needsTools: true });

    expect(mocks.sideCallRouting).toHaveBeenCalledWith(db, 'user-1', expect.any(Object), {
      forceNoTraining: false,
    });
  });

  it('refuses with the Google copy when no model keeps inputs out of training', async () => {
    mocks.sideCallRouting.mockResolvedValue(null);

    await expect(
      selectArtifactRuntimeRoute(db, 'user-1', 'summarise my inbox', 'pro', {
        googleUserData: true,
      }),
    ).rejects.toBeInstanceOf(ArtifactRuntimeGoogleUserDataRouteError);
  });

  it('refuses a resolved route whose model may train, even if routing let it through', async () => {
    mocks.keepsOutOfTraining.mockReturnValue(false);

    const refusal = selectArtifactRuntimeRoute(db, 'user-1', 'summarise my inbox', 'pro', {
      googleUserData: true,
    });

    await expect(refusal).rejects.toBeInstanceOf(ArtifactRuntimeGoogleUserDataRouteError);
    await expect(refusal).rejects.toBeInstanceOf(ArtifactRuntimeRouteUnavailableError);
  });
});

describe('completeArtifactPrompt and Google user data', () => {
  function input(serverId: string) {
    return {
      db,
      userId: 'user-1',
      organizationId: null,
      artifact: { publishedArtifactId: 'artifact-1', ownerUserId: 'owner-1' },
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
