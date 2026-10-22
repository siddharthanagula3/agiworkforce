import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  assertAccountActive: vi.fn(),
  readOwnedRunnableArtifact: vi.fn(),
  readLiveArtifact: vi.fn(),
  recordLiveArtifactRefresh: vi.fn(),
  conversationHoldsGoogleUserData: vi.fn(),
  respondToArtifactCompletion: vi.fn(),
  db: { query: vi.fn() },
}));

vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.getUserScopedDb }));
vi.mock('@/lib/api-auth', () => ({
  assertAccountActive: mocks.assertAccountActive,
  getClerkAuthUser: vi.fn(),
}));
vi.mock('@/lib/connectors/google-user-data', () => ({
  conversationHoldsGoogleUserData: mocks.conversationHoldsGoogleUserData,
}));
vi.mock('@/lib/services/artifact-runtime-service', () => ({
  ArtifactRuntimeRouteUnavailableError: class ArtifactRuntimeRouteUnavailableError extends Error {},
  buildArtifactConnectorPlan: vi.fn(),
  completeArtifactPrompt: vi.fn(),
  selectArtifactRuntimeRoute: vi.fn(),
  bindingCovers: (binding: { connectors: string[] } | null, connectors: string[]) =>
    connectors.length === 0 ||
    (binding !== null && connectors.every((id) => binding.connectors.includes(id))),
  readLiveArtifact: mocks.readLiveArtifact,
  readOwnedRunnableArtifact: mocks.readOwnedRunnableArtifact,
  recordLiveArtifactRefresh: mocks.recordLiveArtifactRefresh,
}));
vi.mock('@/app/api/artifacts/runtime/artifact-completion', () => ({
  artifactRuntimeRefusal: (status: number, code: string, message: string) =>
    NextResponse.json({ error: { code, message } }, { status }),
  respondToArtifactCompletion: mocks.respondToArtifactCompletion,
}));

import { POST } from '../route';

const ARTIFACT_ID = 'c0ffee00-0000-4000-8000-000000000001';
const OWNED = {
  artifactId: ARTIFACT_ID,
  conversationId: 'c0ffee00-0000-4000-8000-0000000000aa',
  messageId: 'c0ffee00-0000-4000-8000-0000000000bb',
  title: 'Weekly growth',
  type: 'html',
};
const BINDING = {
  artifactId: ARTIFACT_ID,
  connectors: ['google_drive'],
  allowedTools: ['google_drive__search'],
};

function call(body: unknown, artifactId = ARTIFACT_ID) {
  return POST(
    new NextRequest(`http://localhost/api/artifacts/runtime/live/${artifactId}/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ artifactId }) },
  );
}

async function errorCode(response: Response): Promise<string> {
  return ((await response.json()) as { error: { code: string } }).error.code;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.getUserScopedDb.mockResolvedValue({ db: mocks.db, userId: 'user-1', organizationId: null });
  mocks.assertAccountActive.mockResolvedValue(undefined);
  mocks.readOwnedRunnableArtifact.mockResolvedValue(OWNED);
  mocks.readLiveArtifact.mockResolvedValue(null);
  mocks.respondToArtifactCompletion.mockResolvedValue(NextResponse.json({ text: 'ok' }));
});

describe('POST /api/artifacts/runtime/live/[artifactId]/complete', () => {
  it('refuses an id that is not an artifact id before authenticating', async () => {
    const response = await call({ prompt: 'hi' }, 'not-an-id');
    expect(response.status).toBe(404);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('stops at the CSRF gate', async () => {
    mocks.requireCsrfToken.mockResolvedValue(NextResponse.json({}, { status: 403 }));
    expect((await call({ prompt: 'hi' })).status).toBe(403);
    expect(mocks.respondToArtifactCompletion).not.toHaveBeenCalled();
  });

  it('checks the account and the completion rate limit for the caller', async () => {
    mocks.withRateLimit.mockResolvedValue(NextResponse.json({}, { status: 429 }));
    expect((await call({ prompt: 'hi' })).status).toBe(429);
    expect(mocks.assertAccountActive).toHaveBeenCalledWith('user-1', expect.any(NextRequest));
    expect(mocks.withRateLimit).toHaveBeenCalledWith(
      expect.any(NextRequest),
      'llm-completion',
      'user:user-1',
    );
  });

  it('serves only an artifact the caller owns', async () => {
    mocks.readOwnedRunnableArtifact.mockResolvedValue(null);
    const response = await call({ prompt: 'hi' });
    expect(response.status).toBe(404);
    expect(await errorCode(response)).toBe('artifact_not_found');
    expect(mocks.readOwnedRunnableArtifact).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({ userId: 'user-1', organizationId: null }),
      ARTIFACT_ID,
    );
    expect(mocks.respondToArtifactCompletion).not.toHaveBeenCalled();
  });

  it('refuses connected apps the owner has not bound to this artifact', async () => {
    const response = await call({ prompt: 'hi', connectors: ['google_drive'] });
    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe('live_binding_required');
    expect(mocks.respondToArtifactCompletion).not.toHaveBeenCalled();
  });

  it('refuses a connected app outside the saved binding', async () => {
    mocks.readLiveArtifact.mockResolvedValue(BINDING);
    const response = await call({ prompt: 'hi', connectors: ['google_drive', 'slack'] });
    expect(response.status).toBe(409);
  });

  it('runs a bound request through the shared gates with the saved tools, not the caller list', async () => {
    mocks.readLiveArtifact.mockResolvedValue(BINDING);
    const response = await call({
      prompt: 'Signups this week',
      connectors: ['google_drive'],
      allowedTools: ['google_drive__delete_everything'],
    });
    expect(response.status).toBe(200);
    expect(mocks.respondToArtifactCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: { kind: 'owned', artifactId: ARTIFACT_ID },
        prompt: 'Signups this week',
        connectors: ['google_drive'],
        allowedTools: ['google_drive__search'],
      }),
    );
    const input = mocks.respondToArtifactCompletion.mock.calls[0]?.[0] as {
      onCompleted?: () => Promise<void>;
      sourceHoldsGoogleUserData: () => Promise<boolean>;
    };
    await input.onCompleted?.();
    expect(mocks.recordLiveArtifactRefresh).toHaveBeenCalledWith(mocks.db, 'user-1', ARTIFACT_ID);
    await input.sourceHoldsGoogleUserData();
    expect(mocks.conversationHoldsGoogleUserData).toHaveBeenCalledWith(
      mocks.db,
      'user-1',
      OWNED.conversationId,
    );
  });

  it('runs an AI-only request without a binding and records no refresh', async () => {
    const response = await call({ prompt: 'hi', allowedTools: ['anything'] });
    expect(response.status).toBe(200);
    const input = mocks.respondToArtifactCompletion.mock.calls[0]?.[0] as {
      allowedTools: string[];
      onCompleted?: unknown;
    };
    expect(input.allowedTools).toEqual([]);
    expect(input.onCompleted).toBeUndefined();
  });
});
