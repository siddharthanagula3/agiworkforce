import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockGetNeonDb } = vi.hoisted(() => ({ mockGetNeonDb: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: mockGetNeonDb }));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  evaluateActiveWorkspaceModelAccess,
  evaluateModelAccessForRequest,
} from '../model-policy-gate';

const ORG = '11111111-1111-4111-8111-111111111111';
const MODEL = 'fixture-model-alpha';

function harness({
  organizationId = ORG as string | null,
  policyRow = null as Record<string, unknown> | null,
  workspaceThrows = false,
  policyThrows = false,
} = {}) {
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    const text = String(sql);
    if (/from public\.user_settings/i.test(text)) {
      if (workspaceThrows) throw new Error('connection reset');
      return organizationId ? [{ organization_id: organizationId }] : [];
    }
    if (/from public\.organization_model_policies/i.test(text)) {
      if (policyThrows) throw new Error('relation does not exist');
      return policyRow ? [policyRow] : [];
    }
    return [];
  });
  return { db: { query, execute: vi.fn() } as unknown as DatabaseAdapter, query };
}

function row(over: Record<string, unknown> = {}) {
  return {
    organization_id: ORG,
    allowed_providers: [],
    blocked_providers: [],
    allowed_models: [],
    blocked_models: [],
    updated_by_user_id: 'user-admin',
    updated_at: '2026-08-23T00:00:00.000Z',
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('evaluateActiveWorkspaceModelAccess', () => {
  it('treats a personal-scope caller as ungoverned', async () => {
    const h = harness({ organizationId: null });
    const decision = await evaluateActiveWorkspaceModelAccess(h.db, 'user-1', {
      provider: 'openai',
      modelId: MODEL,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe('ungoverned');
  });

  it('treats a workspace with no policy row as ungoverned', async () => {
    const h = harness({ policyRow: null });
    const decision = await evaluateActiveWorkspaceModelAccess(h.db, 'user-1', {
      provider: 'openai',
      modelId: MODEL,
    });
    expect(decision.code).toBe('ungoverned');
  });

  it('denies a blocked model for a governed workspace', async () => {
    const h = harness({ policyRow: row({ blocked_models: [MODEL] }) });
    const decision = await evaluateActiveWorkspaceModelAccess(h.db, 'user-1', {
      provider: 'openai',
      modelId: MODEL,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('model_blocked');
  });

  it('does not turn a policy read failure into a denial', async () => {
    // A database fault is an infrastructure problem, not an administrator's
    // decision. Denying here would stop every member chatting the moment the
    // policy table is briefly unreachable.
    const h = harness({ policyThrows: true });
    const decision = await evaluateActiveWorkspaceModelAccess(h.db, 'user-1', {
      provider: 'openai',
      modelId: MODEL,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe('ungoverned');
  });

  it('does not turn an unresolvable workspace into a denial', async () => {
    const h = harness({ workspaceThrows: true });
    const decision = await evaluateActiveWorkspaceModelAccess(h.db, 'user-1', {
      provider: 'openai',
      modelId: MODEL,
    });
    expect(decision.allowed).toBe(true);
  });

  it('binds the resolved organization, never a caller-supplied one', async () => {
    const h = harness({ policyRow: row() });
    await evaluateActiveWorkspaceModelAccess(h.db, 'user-1', {
      provider: 'openai',
      modelId: MODEL,
    });

    const policyCall = h.query.mock.calls.find((call) =>
      /organization_model_policies/i.test(String(call[0])),
    );
    expect(policyCall?.[1]).toEqual([ORG]);
  });
});

describe('evaluateModelAccessForRequest', () => {
  it('does not throw when the database is unconfigured', async () => {
    // Acquiring the adapter throws BEFORE the gate can treat it as ungoverned,
    // which is how this exact bug reached production once already in the
    // managed-compute gate.
    mockGetNeonDb.mockImplementation(() => {
      throw new Error('AGI_DATABASE_URL is not set');
    });

    const decision = await evaluateModelAccessForRequest('user-1', {
      provider: 'openai',
      modelId: MODEL,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe('ungoverned');
  });

  it('evaluates normally when the database is available', async () => {
    const h = harness({ policyRow: row({ blocked_providers: ['openai'] }) });
    mockGetNeonDb.mockReturnValue(h.db);

    const decision = await evaluateModelAccessForRequest('user-1', {
      provider: 'openai',
      modelId: MODEL,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('provider_blocked');
  });
});
