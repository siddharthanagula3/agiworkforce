import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  DEFAULT_ENTERPRISE_ADMIN_POLICY,
  type AdminPolicy,
  type SourceSurface,
} from '@agiworkforce/types';

type CsrfModule = typeof import('@/lib/csrf');
type RateLimitModule = typeof import('@/lib/rate-limit');
type RlsDbModule = typeof import('@/lib/server/rls-db');
type WorkspaceAuditModule = typeof import('@/lib/workspace-audit');
type DenialsModule = typeof import('@/lib/observability/denials');
type DataRegionModule = typeof import('@/lib/server/data-region');
type FlagStoreModule = typeof import('@/lib/feature-flags/flag-store');
type EntitlementResolutionModule = typeof import('@/lib/services/entitlement-resolution');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type PolicyGateModule = typeof import('@/lib/services/organization-policy-gate');

const ORG_ID = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  signaling: vi.fn(),
  surface: undefined as string | undefined,
  policy: null as unknown,
  evaluateActiveWorkspacePolicy: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  requireCsrfToken: vi.fn(async () => null),
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: vi.fn(async () => ({
    db: { query: vi.fn(async () => []), execute: vi.fn(async () => 0) },
    userId: 'user_workspace_member',
    organizationId: ORG_ID,
    ...(mocks.surface ? { surface: mocks.surface } : {}),
  })),
}));
vi.mock('@/lib/workspace-audit', async (importOriginal) => ({
  ...(await importOriginal<WorkspaceAuditModule>()),
  recordWorkspaceAuditEvent: vi.fn(async () => undefined),
}));
vi.mock('@/lib/observability/denials', async (importOriginal) => ({
  ...(await importOriginal<DenialsModule>()),
  recordCapabilityDenial: vi.fn(),
}));
vi.mock('@/lib/server/data-region', async (importOriginal) => ({
  ...(await importOriginal<DataRegionModule>()),
  managedCloudDataRegion: () => 'us-east-1',
}));
vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<EntitlementResolutionModule>()),
  resolveEntitledPlanTier: vi.fn(async () => 'team'),
}));
vi.mock('@/lib/feature-flags/flag-store', async (importOriginal) => ({
  ...(await importOriginal<FlagStoreModule>()),
  getActiveFlagDefinitions: async () => [],
  getSubjectOverrides: async () => [],
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<NeonDbModule>()),
  getNeonDb: () => ({}),
}));
vi.mock('@/lib/services/organization-policy-gate', async (importOriginal) => ({
  ...(await importOriginal<PolicyGateModule>()),
  evaluateActiveWorkspacePolicy: mocks.evaluateActiveWorkspacePolicy,
}));

import {
  WORKSPACE_POLICY_UNAVAILABLE_DECISION,
  evaluateOrganizationPolicy,
  type PolicyAsk,
} from '@/lib/services/organization-policy-evaluator';
import { SERVICE_UNAVAILABLE_RETRY_AFTER_SECONDS } from '@/lib/service-unavailable-retry';

import { POST as initiate } from '../initiate/route';
import { POST as claim } from '../claim/route';

function workspaceAllowing(allowedSurfaces: SourceSurface[]): AdminPolicy {
  return {
    ...DEFAULT_ENTERPRISE_ADMIN_POLICY,
    organizationId: ORG_ID,
    updatedAt: '2026-11-01T00:00:00.000Z',
    controls: { ...DEFAULT_ENTERPRISE_ADMIN_POLICY.controls, allowedSurfaces },
  };
}

function post(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const halves = [
  {
    half: 'starting',
    surface: 'desktop',
    send: () => initiate(post('/api/pair/initiate', { initiator: 'desktop' })),
  },
  {
    half: 'claiming',
    surface: 'mobile',
    send: () => claim(post('/api/pair/claim', { code: 'ABCD1234WXYZ' })),
  },
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.surface = undefined;
  mocks.policy = workspaceAllowing(['web']);
  mocks.evaluateActiveWorkspacePolicy.mockImplementation(
    async (_db: unknown, _userId: string, ask: PolicyAsk) => ({
      ...evaluateOrganizationPolicy(mocks.policy as AdminPolicy, ask),
      organizationId: ORG_ID,
    }),
  );
  mocks.signaling.mockImplementation(
    async () => new Response(JSON.stringify({ error: 'unused' }), { status: 502 }),
  );
  vi.stubGlobal('fetch', mocks.signaling);
  vi.stubEnv('SIGNALING_HTTP_URL', 'https://signal.example.test');
  vi.stubEnv('SIGNALING_INTERNAL_SECRET', 'signal-secret');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Remote Control pairing under a workspace that limits client apps', () => {
  it.each(halves)(
    'refuses $half a pairing from the $surface app the workspace leaves out',
    async ({ surface, send }) => {
      mocks.surface = surface;

      const response = await send();

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: {
          type: 'organization_policy',
          code: 'surface_not_allowed',
          feature: 'remote_control',
          message: expect.stringContaining('does not allow access to this workspace from'),
        },
      });
      expect(mocks.evaluateActiveWorkspacePolicy).toHaveBeenCalledWith(
        expect.anything(),
        'user_workspace_member',
        { resource: 'feature', feature: 'remote_control', surface },
        expect.any(NextRequest),
      );
      expect(mocks.signaling).not.toHaveBeenCalled();
    },
  );

  it.each(halves)(
    'lets $half a pairing through from the $surface app the workspace allows',
    async ({ surface, send }) => {
      mocks.surface = surface;
      mocks.policy = workspaceAllowing(['desktop', 'mobile']);

      await send();

      expect(mocks.signaling).toHaveBeenCalledTimes(1);
    },
  );

  it.each(halves)(
    'fails $half a pairing closed, with a retry hint, when the policy cannot be read',
    async ({ surface, send }) => {
      mocks.surface = surface;
      mocks.evaluateActiveWorkspacePolicy.mockRejectedValue(new Error('connection terminated'));

      const response = await send();

      expect(response.status).toBe(503);
      expect(response.headers.get('retry-after')).toBe(
        String(SERVICE_UNAVAILABLE_RETRY_AFTER_SECONDS),
      );
      expect(await response.json()).toEqual({
        error: {
          type: 'organization_policy',
          code: WORKSPACE_POLICY_UNAVAILABLE_DECISION.code,
          feature: 'remote_control',
          message: WORKSPACE_POLICY_UNAVAILABLE_DECISION.reason,
        },
      });
      expect(mocks.signaling).not.toHaveBeenCalled();
    },
  );
});
