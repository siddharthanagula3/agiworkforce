/**
 * Contract tests for `/api/code/sessions/[sessionId]/agent/approvals`, driven
 * through the real route handlers and the real approval service.
 *
 * WHAT THESE ARE FOR
 * An approval row and the turn row it gates are written by SEPARATE statements,
 * so they can disagree. `decideCloudCodeAgentApproval` refuses any turn that is
 * not `awaiting_approval`; before this suite existed, the GET path happily
 * listed pending rows whose turn had already failed, so the product showed an
 * approval prompt that every attempt to answer returned 409 for — permanently.
 * `cloud-code-agent-service` produces exactly that state on its reservation and
 * executor failure paths, which mark a turn 'failed' with no state guard.
 *
 * HOW THEY DISCRIMINATE
 * The fake adapter applies only the predicates the statement it was handed
 * actually contains. Deleting `t.state <> 'awaiting_approval'` from the sweep,
 * `and t.state = 'awaiting_approval'` from the list, or the retire-on-decide
 * UPDATE makes the corresponding test below fail rather than pass on the fake's
 * own good manners.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetUserScopedDb, mockCsrf, mockRateLimit, mockE2bReady, mockGetSession, mockExecute } =
  vi.hoisted(() => ({
    mockGetUserScopedDb: vi.fn(),
    mockCsrf: vi.fn(),
    mockRateLimit: vi.fn(),
    mockE2bReady: vi.fn(),
    mockGetSession: vi.fn(),
    mockExecute: vi.fn(),
  }));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mockRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mockCsrf }));
vi.mock('@/lib/e2b/gate', () => ({ e2bProvisioningReady: mockE2bReady }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockGetUserScopedDb }));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    getSubscription: vi.fn(async () => ({ plan_tier: 'pro', status: 'active' })),
  },
}));
vi.mock('@/lib/services/provider-adapter-service', () => ({
  resolveProviderFromModel: vi.fn(() => 'anthropic'),
}));
// The sandbox half of the turn is not what this route owns; stubbing it keeps
// the test on the decidability contract and off E2B.
vi.mock('@/lib/services/cloud-code-agent-service', () => ({
  executePersistedAgentTurn: mockExecute,
}));
vi.mock('@/lib/services/cloud-code-session-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/cloud-code-session-service')>();
  return { ...actual, getCloudCodeSession: mockGetSession };
});

import { GET, POST } from './route';

const TURN_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const STEP_INDEX = 4;
const COMMAND = 'rm -rf build';

/**
 * The two rows this surface turns on, plus a predicate-reading query fake.
 *
 * `failTurnAfterSweep` reproduces the interleaving the list predicate exists
 * for: the turn is still suspended when the read-path sweep runs and has failed
 * by the time the SELECT runs, so the sweep cannot have retired the row.
 */
function fakeDb(options: {
  turnState?: string;
  approvalState?: 'pending' | 'approved' | 'rejected' | 'expired';
  approvalExpired?: boolean;
  failTurnAfterSweep?: boolean;
}) {
  const approval = {
    state: options.approvalState ?? ('pending' as string),
    expired: options.approvalExpired ?? false,
  };
  const turn = { state: options.turnState ?? 'awaiting_approval' };

  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    const text = sql.replace(/\s+/g, ' ').trim();
    /** True only when the statement itself asks for the predicate. */
    const asks = (predicate: string) => text.includes(predicate);

    // Read-path sweep.
    if (text.startsWith('update cloud_code_agent_approvals a')) {
      const pending = !asks("and a.state = 'pending'") || approval.state === 'pending';
      const byExpiry = asks('a.expires_at <= now()') && approval.expired;
      const byTurn = asks("t.state <> 'awaiting_approval'") && turn.state !== 'awaiting_approval';
      const anyStalenessTest =
        asks('a.expires_at <= now()') || asks("t.state <> 'awaiting_approval'");
      if (pending && (!anyStalenessTest || byExpiry || byTurn)) approval.state = 'expired';
      if (options.failTurnAfterSweep) turn.state = 'failed';
      return [];
    }

    if (text.startsWith('select a.turn_id')) {
      if (asks("and a.state = 'pending'") && approval.state !== 'pending') return [];
      if (asks("and t.state = 'awaiting_approval'") && turn.state !== 'awaiting_approval')
        return [];
      return [
        {
          turn_id: TURN_ID,
          step_index: STEP_INDEX,
          command: COMMAND,
          reason: 'Destructive command',
          goal: 'Fix the failing test',
          expires_at: '2026-08-09T00:30:00.000Z',
          created_at: '2026-08-09T00:00:00.000Z',
        },
      ];
    }

    if (text.startsWith('select id, goal, model, provider, state')) {
      return [
        {
          id: TURN_ID,
          goal: 'Fix the failing test',
          model: 'fixture-model',
          provider: 'anthropic',
          state: turn.state,
        },
      ];
    }

    // Retire-on-decide, and the expiry transition on the decide path.
    if (text.startsWith("update cloud_code_agent_approvals set state = 'expired'")) {
      if (asks("and state = 'pending'") && approval.state !== 'pending') return [];
      approval.state = 'expired';
      return [];
    }

    if (text.startsWith('update cloud_code_agent_approvals set state = $3')) {
      if (asks("and state = 'pending'") && approval.state !== 'pending') return [];
      if (asks('and expires_at > now()') && approval.expired) return [];
      approval.state = String(params?.[2] ?? 'decided');
      return [{ command: COMMAND }];
    }

    if (text.startsWith('select state, expires_at <= now() as is_expired')) {
      return [{ state: approval.state, is_expired: approval.expired }];
    }

    if (text.startsWith("update cloud_code_agent_turns set state = 'running'")) {
      if (asks("and state = 'awaiting_approval'") && turn.state !== 'awaiting_approval') return [];
      turn.state = 'running';
      return [{ id: TURN_ID }];
    }

    return [];
  });

  return { db: { query }, approval, turn, query };
}

const context = { params: Promise.resolve({ sessionId: SESSION_ID }) };

function getRequest(): NextRequest {
  return new NextRequest(`http://localhost:3000/api/code/sessions/${SESSION_ID}/agent/approvals`, {
    method: 'GET',
  });
}

function postRequest(body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/code/sessions/${SESSION_ID}/agent/approvals`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  mockCsrf.mockResolvedValue(null);
  mockRateLimit.mockResolvedValue(null);
  mockE2bReady.mockReturnValue(true);
  mockGetSession.mockResolvedValue({
    state: 'ready',
    repositoryUrl: null,
    networkAccess: 'none',
    workspacePath: '/workspace',
  });
  mockExecute.mockResolvedValue({
    turnId: TURN_ID,
    stopReason: 'done',
    stepsUsed: 3,
    finalMessage: 'done',
  });
});

function useDb(harness: ReturnType<typeof fakeDb>) {
  mockGetUserScopedDb.mockResolvedValue({
    db: harness.db,
    userId: 'user-1',
    organizationId: null,
  });
}

describe('GET only offers approvals the decide path will actually accept', () => {
  it('still lists a pending approval whose turn is genuinely suspended', async () => {
    const harness = fakeDb({});
    useDb(harness);
    const response = await GET(getRequest(), context);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { approvals: Array<{ turnId: string }> };
    expect(body.approvals).toHaveLength(1);
    expect(body.approvals[0]?.turnId).toBe(TURN_ID);
    expect(harness.approval.state).toBe('pending');
  });

  it('retires a pending approval whose turn already failed, instead of listing it forever', async () => {
    // Exactly the state cloud-code-agent-service leaves behind when a turn is
    // marked 'failed' by the reservation or executor path while its approval row
    // is still pending.
    const harness = fakeDb({ turnState: 'failed' });
    useDb(harness);
    const response = await GET(getRequest(), context);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { approvals: unknown[] };
    expect(body.approvals).toHaveLength(0);
    // The sweep — not the SELECT — is what must have moved the row, or it comes
    // back on the next load.
    expect(harness.approval.state).toBe('expired');
  });

  it('still hides an approval whose turn fails between the sweep and the read', async () => {
    const harness = fakeDb({ failTurnAfterSweep: true });
    useDb(harness);
    const response = await GET(getRequest(), context);
    const body = (await response.json()) as { approvals: unknown[] };
    // The sweep ran while the turn was healthy, so the row is still pending here
    // and only the SELECT's own turn-state predicate can keep it hidden.
    expect(harness.approval.state).toBe('pending');
    expect(body.approvals).toHaveLength(0);
  });

  it('still retires an approval that simply expired', async () => {
    const harness = fakeDb({ approvalExpired: true });
    useDb(harness);
    const response = await GET(getRequest(), context);
    const body = (await response.json()) as { approvals: unknown[] };
    expect(body.approvals).toHaveLength(0);
    expect(harness.approval.state).toBe('expired');
  });
});

describe('POST refuses an undecidable approval and does not leave it pending', () => {
  it('409s on a turn that is no longer suspended and retires the orphaned row', async () => {
    const harness = fakeDb({ turnState: 'failed' });
    useDb(harness);
    const response = await POST(
      postRequest({ turnId: TURN_ID, stepIndex: STEP_INDEX, decision: 'approve' }),
      context,
    );
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error?: { message?: string } };
    expect(JSON.stringify(body)).toContain('not waiting for an approval');
    expect(mockExecute).not.toHaveBeenCalled();
    // Without this the row stays 'pending' for a client that only ever POSTs,
    // and the same approval is offered again on the next list.
    expect(harness.approval.state).toBe('expired');
  });

  it('approves and resumes when the turn really is suspended', async () => {
    const harness = fakeDb({});
    useDb(harness);
    const response = await POST(
      postRequest({ turnId: TURN_ID, stepIndex: STEP_INDEX, decision: 'approve' }),
      context,
    );
    expect(response.status).toBe(200);
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute.mock.calls[0]?.[0]).toMatchObject({
      turnId: TURN_ID,
      preApproved: { command: COMMAND, approved: true },
    });
    expect(harness.turn.state).toBe('running');
  });
});
