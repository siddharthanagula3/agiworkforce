import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  assertAccountActive: vi.fn(),
  readRunnableArtifact: vi.fn(),
  selectArtifactRuntimeRoute: vi.fn(),
  buildArtifactConnectorPlan: vi.fn(),
  completeArtifactPrompt: vi.fn(),
  evaluateActiveWorkspacePolicy: vi.fn(),
  resolveZeroDataRetentionPolicy: vi.fn(),
  resolveEntitlementBundle: vi.fn(),
  evaluateManagedComputeAccess: vi.fn(),
  buildManagedComputeAccessGateResponse: vi.fn(),
  moderateManagedPrompt: vi.fn(),
  enforceManagedContentSafetyPreference: vi.fn(),
  applySecretHandlingToTexts: vi.fn(),
  buildModelPolicyGateResponse: vi.fn(),
  buildProviderEgressGateResponse: vi.fn(),
  db: { query: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.getUserScopedDb }));
vi.mock('@/lib/api-auth', () => ({ assertAccountActive: mocks.assertAccountActive }));
vi.mock('@/lib/services/artifact-runtime-service', () => ({
  ArtifactRuntimeRouteUnavailableError: class ArtifactRuntimeRouteUnavailableError extends Error {},
  readRunnableArtifact: mocks.readRunnableArtifact,
  selectArtifactRuntimeRoute: mocks.selectArtifactRuntimeRoute,
  buildArtifactConnectorPlan: mocks.buildArtifactConnectorPlan,
  completeArtifactPrompt: mocks.completeArtifactPrompt,
}));
vi.mock('@/lib/services/published-artifact-service', () => ({
  PUBLISHED_TOKEN_REGEX: /^[A-Za-z0-9_-]{24}$/,
}));
vi.mock('@/lib/services/organization-policy-gate', () => ({
  evaluateActiveWorkspacePolicy: mocks.evaluateActiveWorkspacePolicy,
  resolveZeroDataRetentionPolicy: mocks.resolveZeroDataRetentionPolicy,
}));
vi.mock('@/lib/services/entitlement-resolution', () => ({
  resolveEntitlementBundle: mocks.resolveEntitlementBundle,
}));
vi.mock('@/lib/services/managed-compute-access', () => ({
  evaluateManagedComputeAccess: mocks.evaluateManagedComputeAccess,
  buildManagedComputeAccessGateResponse: mocks.buildManagedComputeAccessGateResponse,
}));
// The viewer's connector consent has its own tests; these cases start past it.
vi.mock('@/lib/services/artifact-connector-gate', () => ({
  artifactConnectorsGateResponse: vi.fn(async () => null),
}));
vi.mock('@/lib/moderation', () => ({ moderateManagedPrompt: mocks.moderateManagedPrompt }));
vi.mock('@/lib/services/managed-content-safety-service', () => ({
  enforceManagedContentSafetyPreference: mocks.enforceManagedContentSafetyPreference,
}));
vi.mock('@/lib/services/managed-usage-request-service', () => ({
  ManagedUsageRequestError: class ManagedUsageRequestError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/secret-handling-gate', () => ({
  applySecretHandlingToTexts: mocks.applySecretHandlingToTexts,
}));
vi.mock('@/lib/managed-compute-gate', () => ({
  buildModelPolicyGateResponse: mocks.buildModelPolicyGateResponse,
  buildProviderEgressGateResponse: mocks.buildProviderEgressGateResponse,
}));

import { createError } from '@/lib/errors';
import { ArtifactRuntimeRouteUnavailableError } from '@/lib/services/artifact-runtime-service';
import { ManagedUsageRequestError } from '@/lib/services/managed-usage-request-service';
import { POST } from '../route';

const TOKEN = 'Abcdefghijklmnopqrstuv_1';
const ARTIFACT = { token: TOKEN, ownerId: 'owner-9' };
const ROUTE = { provider: 'anthropic', modelKey: 'claude-fast' };

function call(body: unknown, token = TOKEN) {
  return POST(
    new NextRequest(`http://localhost/api/artifacts/runtime/${token}/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ token }) },
  );
}

async function errorCode(response: Response): Promise<string> {
  return ((await response.json()) as { error: { code: string } }).error.code;
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
  mocks.assertAccountActive.mockResolvedValue(undefined);
  mocks.readRunnableArtifact.mockResolvedValue(ARTIFACT);
  mocks.evaluateActiveWorkspacePolicy.mockResolvedValue({ allowed: true });
  mocks.resolveEntitlementBundle.mockResolvedValue({ plan: 'pro', subscription: { tier: 'pro' } });
  mocks.evaluateManagedComputeAccess.mockResolvedValue({ allowed: true });
  mocks.buildManagedComputeAccessGateResponse.mockReturnValue(null);
  mocks.resolveZeroDataRetentionPolicy.mockResolvedValue({ required: false });
  mocks.moderateManagedPrompt.mockReturnValue({ allowed: true });
  mocks.enforceManagedContentSafetyPreference.mockResolvedValue({ allowed: true });
  mocks.applySecretHandlingToTexts.mockResolvedValue({ action: 'allowed', texts: ['Summarize'] });
  mocks.selectArtifactRuntimeRoute.mockResolvedValue(ROUTE);
  mocks.buildModelPolicyGateResponse.mockResolvedValue(null);
  mocks.buildProviderEgressGateResponse.mockResolvedValue(null);
  mocks.buildArtifactConnectorPlan.mockResolvedValue({ unusable: [] });
  mocks.completeArtifactPrompt.mockResolvedValue('A short summary');
});

describe('POST /api/artifacts/runtime/[token]/complete', () => {
  it('answers 404 for a malformed token before any auth', async () => {
    const response = await call({ prompt: 'Summarize' }, 'bad');

    expect(response.status).toBe(404);
    expect(await errorCode(response)).toBe('artifact_not_found');
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('returns the CSRF refusal', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await call({ prompt: 'Summarize' });

    expect(response.status).toBe(403);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('rejects a signed-out caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await call({ prompt: 'Summarize' });

    expect(response.status).toBe(401);
    expect(mocks.completeArtifactPrompt).not.toHaveBeenCalled();
  });

  it('rate limits per user', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await call({ prompt: 'Summarize' });

    expect(response.status).toBe(429);
    expect(mocks.withRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'llm-completion',
      'user:user-1',
    );
  });

  it('rejects an empty prompt', async () => {
    const response = await call({ prompt: '' });

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe('invalid_prompt');
    expect(mocks.readRunnableArtifact).not.toHaveBeenCalled();
  });

  it('answers 404 when the app is no longer runnable', async () => {
    mocks.readRunnableArtifact.mockResolvedValue(null);

    const response = await call({ prompt: 'Summarize' });

    expect(response.status).toBe(404);
  });

  it('refuses when the workspace privacy policy forbids managed AI', async () => {
    mocks.evaluateActiveWorkspacePolicy.mockResolvedValue({
      allowed: false,
      code: 'privacy_mode_local_only',
      reason: 'Local only',
    });

    const response = await call({ prompt: 'Summarize' });

    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe('privacy_mode_local_only');
    expect(mocks.completeArtifactPrompt).not.toHaveBeenCalled();
  });

  it('returns the plan gate answer when managed compute is not available', async () => {
    mocks.buildManagedComputeAccessGateResponse.mockReturnValue(
      new Response(null, { status: 402 }),
    );

    const response = await call({ prompt: 'Summarize' });

    expect(response.status).toBe(402);
    expect(mocks.completeArtifactPrompt).not.toHaveBeenCalled();
  });

  it('refuses when the workspace requires zero data retention', async () => {
    mocks.resolveZeroDataRetentionPolicy.mockResolvedValue({ required: true });

    const response = await call({ prompt: 'Summarize' });

    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe('organization_policy');
  });

  it('refuses a prompt that fails moderation', async () => {
    mocks.moderateManagedPrompt.mockReturnValue({ allowed: false, refusal: 'Not allowed' });

    const response = await call({ prompt: 'Summarize' });

    expect(response.status).toBe(422);
    expect(await errorCode(response)).toBe('content_policy_violation');
  });

  it('fails closed when the content safety preference cannot be read', async () => {
    mocks.enforceManagedContentSafetyPreference.mockRejectedValue(new Error('db down'));

    const response = await call({ prompt: 'Summarize' });

    expect(response.status).toBe(503);
    expect(await errorCode(response)).toBe('content_safety_preference_unavailable');
    expect(mocks.completeArtifactPrompt).not.toHaveBeenCalled();
  });

  it('blocks a prompt carrying credentials', async () => {
    mocks.applySecretHandlingToTexts.mockResolvedValue({ action: 'blocked', texts: [] });

    const response = await call({ prompt: 'Summarize' });

    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe('secrets_blocked');
  });

  it('answers 503 when no model route is available', async () => {
    mocks.selectArtifactRuntimeRoute.mockRejectedValue(
      new ArtifactRuntimeRouteUnavailableError('No model can answer right now.'),
    );

    const response = await call({ prompt: 'Summarize' });

    expect(response.status).toBe(503);
    expect(await errorCode(response)).toBe('model_unavailable');
  });

  it('refuses connectors the plan cannot use', async () => {
    mocks.buildArtifactConnectorPlan.mockResolvedValue(null);

    const response = await call({ prompt: 'Summarize', connectors: ['gmail'] });

    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe('connectors_unavailable');
  });

  it('asks the user to connect connectors that are not ready', async () => {
    mocks.buildArtifactConnectorPlan.mockResolvedValue({ unusable: ['google_drive'] });

    const response = await call({ prompt: 'Summarize', connectors: ['google_drive'] });

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('connectors_not_ready');
    expect(body.error.message).toContain('Google Drive');
  });

  it('maps a managed usage refusal to its status', async () => {
    mocks.completeArtifactPrompt.mockRejectedValue(
      new ManagedUsageRequestError(402, 'usage_limit_reached', 'Out of usage'),
    );

    const response = await call({ prompt: 'Summarize' });

    expect(response.status).toBe(402);
    expect(await errorCode(response)).toBe('usage_limit_reached');
  });

  it('completes the redacted prompt for the caller', async () => {
    mocks.applySecretHandlingToTexts.mockResolvedValue({
      action: 'redacted',
      texts: ['Summarize [redacted]'],
    });

    const response = await call({ prompt: 'Summarize sk-live-123' });

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ text: 'A short summary' });
    expect(mocks.readRunnableArtifact).toHaveBeenCalledWith(mocks.db, TOKEN);
    expect(mocks.completeArtifactPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        organizationId: 'org-1',
        artifact: ARTIFACT,
        prompt: 'Summarize [redacted]',
        route: ROUTE,
        planTier: 'pro',
        plan: null,
      }),
    );
    expect(mocks.buildArtifactConnectorPlan).not.toHaveBeenCalled();
  });
});
