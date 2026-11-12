import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

type PolicyGateModule = typeof import('@/lib/services/organization-policy-gate');

const { evaluateActiveWorkspacePolicy } = vi.hoisted(() => ({
  evaluateActiveWorkspacePolicy: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({}) }));
vi.mock('@/lib/services/organization-policy-gate', async (importOriginal) => ({
  ...(await importOriginal<PolicyGateModule>()),
  evaluateActiveWorkspacePolicy,
}));

import {
  buildChatSyncGateResponse,
  buildWorkspaceAccessGateResponse,
  buildWorkspaceFeatureGateResponse,
} from '../managed-compute-gate';
import { WORKSPACE_POLICY_UNAVAILABLE_DECISION } from '@/lib/services/organization-policy-evaluator';

const ORG_ID = '11111111-1111-4111-8111-111111111111';

function request(): NextRequest {
  return new NextRequest('https://app.test/api/schedules');
}

const SURFACE_REFUSAL = {
  allowed: false,
  code: 'surface_not_allowed',
  reason:
    'Your workspace administrator does not allow access to this workspace from the Chrome extension.',
  obligations: [],
  organizationId: ORG_ID,
};

describe('workspace access gate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks the workspace policy about the client the credential is bound to', async () => {
    evaluateActiveWorkspacePolicy.mockResolvedValueOnce(SURFACE_REFUSAL);

    const response = await buildWorkspaceAccessGateResponse('user-1', request(), 'chrome');

    expect(evaluateActiveWorkspacePolicy).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      { resource: 'workspace_access', surface: 'chrome' },
      expect.any(NextRequest),
    );
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({
      error: {
        message: SURFACE_REFUSAL.reason,
        type: 'organization_policy',
        code: 'surface_not_allowed',
      },
    });
  });

  it('passes a permitted client through', async () => {
    evaluateActiveWorkspacePolicy.mockResolvedValueOnce({
      allowed: true,
      code: 'allowed',
      reason: 'Allowed by workspace policy.',
      obligations: [],
      organizationId: ORG_ID,
    });

    await expect(buildWorkspaceAccessGateResponse('user-1', request(), 'web')).resolves.toBeNull();
  });

  it('fails closed with a 503 and a retry hint when the policy cannot be read', async () => {
    evaluateActiveWorkspacePolicy.mockRejectedValueOnce(new Error('connection terminated'));

    const response = await buildWorkspaceAccessGateResponse('user-1', request(), 'chrome');

    expect(response?.status).toBe(503);
    expect(Number(response?.headers.get('retry-after'))).toBeGreaterThan(0);
    await expect(response?.json()).resolves.toMatchObject({
      error: { code: WORKSPACE_POLICY_UNAVAILABLE_DECISION.code, type: 'organization_policy' },
    });
  });

  it('gives a feature refusal for an unreadable policy the same retry hint', async () => {
    evaluateActiveWorkspacePolicy.mockResolvedValueOnce({
      ...WORKSPACE_POLICY_UNAVAILABLE_DECISION,
      organizationId: null,
    });

    const response = await buildWorkspaceFeatureGateResponse(
      'user-1',
      request(),
      'schedules',
      'vscode',
    );

    expect(response?.status).toBe(503);
    expect(Number(response?.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});

describe('chat sync gate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks the chat sync question for the bound client and refuses what the administrator switched off', async () => {
    evaluateActiveWorkspacePolicy.mockResolvedValueOnce({
      allowed: false,
      code: 'surface_sync_disabled',
      reason: 'Your workspace administrator has turned off cloud sync for the Chrome extension.',
      obligations: [],
      organizationId: ORG_ID,
    });

    const response = await buildChatSyncGateResponse('user-1', request(), 'chrome');

    expect(evaluateActiveWorkspacePolicy).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      { resource: 'chat_sync', surface: 'chrome' },
      expect.any(NextRequest),
    );
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toMatchObject({
      error: { code: 'surface_sync_disabled', type: 'organization_policy' },
    });
  });
});
