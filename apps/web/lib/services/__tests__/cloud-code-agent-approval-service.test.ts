import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/services/provider-adapter-service', () => ({
  resolveProviderFromModel: vi.fn(() => 'anthropic'),
  buildServerProviderAdapter: vi.fn(),
}));
vi.mock('@/lib/services/cloud-code-agent-service', () => ({
  executePersistedAgentTurn: vi.fn(async () => ({
    turnId: 'turn-1',
    stopReason: 'done' as const,
    stepsUsed: 3,
    finalMessage: 'done',
  })),
}));
vi.mock('@/lib/services/cloud-code-session-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/cloud-code-session-service')>();
  return { ...actual, getCloudCodeSession: vi.fn() };
});

import type { ToolResultBlock, ToolUseBlock } from '@agiworkforce/types';
import {
  CloudCodeConflictError,
  CloudCodeNotFoundError,
  getCloudCodeSession,
} from '@/lib/services/cloud-code-session-service';
import { executePersistedAgentTurn } from '@/lib/services/cloud-code-agent-service';
import {
  CloudCodeApprovalExpiredError,
  decideCloudCodeAgentApproval,
  listCloudCodeAgentApprovals,
} from '@/lib/services/cloud-code-agent-approval-service';

const TURN_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const OWNER = { userId: 'user-1', organizationId: null };
const DANGEROUS_COMMAND = 'rm -rf build';

function fakeDb(options: {
  approvalState?: 'pending' | 'approved' | 'rejected' | 'expired';
  approvalExpired?: boolean;
  turnState?: string;
  turnFound?: boolean;
  steps?: Array<{
    step_index: number;
    tool_name: string;
    tool_args: unknown;
    output: string;
    is_error: boolean;
  }>;
}) {
  const approval: { state: string; expired: boolean; command: string } = {
    state: options.approvalState ?? 'pending',
    expired: options.approvalExpired ?? false,
    command: DANGEROUS_COMMAND,
  };
  const turn = { state: options.turnState ?? 'awaiting_approval' };
  const steps = options.steps ?? [];
  const sqlLog: string[] = [];

  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    sqlLog.push(sql);
    const text = sql.replace(/\s+/g, ' ').trim();
    const guards = (predicate: string) => text.includes(predicate);

    if (text.startsWith('select id, goal, model, provider, state')) {
      if (options.turnFound === false) return [];
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

    if (text.startsWith('update cloud_code_agent_approvals set state = $3')) {
      if (guards("and state = 'pending'") && approval.state !== 'pending') return [];
      if (guards('and expires_at > now()') && approval.expired) return [];
      approval.state = String(params?.[2] ?? 'decided');
      return [{ command: approval.command }];
    }

    if (text.startsWith('select state, expires_at <= now() as is_expired')) {
      return [{ state: approval.state, is_expired: approval.expired }];
    }

    if (text.startsWith("update cloud_code_agent_approvals set state = 'expired'")) {
      if (guards("and state = 'pending'") && approval.state !== 'pending') return [];
      approval.state = 'expired';
      return [];
    }

    if (text.startsWith("update cloud_code_agent_turns set state = 'running'")) {
      if (guards("and state = 'awaiting_approval'") && turn.state !== 'awaiting_approval') {
        return [];
      }
      turn.state = 'running';
      return [{ id: TURN_ID }];
    }

    if (text.startsWith('select step_index, tool_name')) return steps;

    if (text.startsWith('update cloud_code_agent_approvals a')) {
      const stale = !guards('and a.expires_at <= now()') || approval.expired;
      const pending = !guards("and a.state = 'pending'") || approval.state === 'pending';
      if (stale && pending) approval.state = 'expired';
      return [];
    }

    if (text.startsWith('select a.turn_id')) {
      if (guards("and a.state = 'pending'") && approval.state !== 'pending') return [];
      return [
        {
          turn_id: TURN_ID,
          step_index: 4,
          command: approval.command,
          reason: 'Destructive command',
          goal: 'Fix the failing test',
          expires_at: '2026-08-09T00:30:00.000Z',
          created_at: '2026-08-09T00:00:00.000Z',
        },
      ];
    }

    return [];
  });

  return { db: { query } as never, approval, turn, sqlLog, query };
}

function decide(db: unknown, decision: 'approve' | 'reject' = 'approve') {
  return decideCloudCodeAgentApproval({
    db: db as never,
    owner: OWNER,
    sessionId: SESSION_ID,
    turnId: TURN_ID,
    stepIndex: 4,
    decision,
    planTier: 'pro',
    signal: new AbortController().signal,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCloudCodeSession).mockResolvedValue({
    state: 'ready',
    repositoryUrl: null,
    networkAccess: 'none',
    workspacePath: '/workspace',
  } as never);
});

describe('a pending Cloud Code approval can actually be decided', () => {
  it('approving records the decision and resumes the suspended turn', async () => {
    const harness = fakeDb({});
    const record = await decide(harness.db);

    expect(vi.mocked(executePersistedAgentTurn)).toHaveBeenCalledTimes(1);
    const call = vi.mocked(executePersistedAgentTurn).mock.calls[0]?.[0];
    expect(call?.preApproved).toMatchObject({ approved: true, command: DANGEROUS_COMMAND });
    expect(call?.turnId).toBe(TURN_ID);
    expect(record.stopReason).toBe('done');
    expect(harness.turn.state).toBe('running');
  });

  it('rejecting also resumes, so the model is told instead of the turn being abandoned', async () => {
    const harness = fakeDb({});
    await decide(harness.db, 'reject');
    const call = vi.mocked(executePersistedAgentTurn).mock.calls[0]?.[0];
    expect(call?.preApproved?.approved).toBe(false);
  });

  it('runs the command stored with the approval, not one supplied by the caller', async () => {
    const harness = fakeDb({});
    await decide(harness.db);
    const call = vi.mocked(executePersistedAgentTurn).mock.calls[0]?.[0];
    expect(call?.preApproved?.command).toBe(DANGEROUS_COMMAND);
  });
});

describe('a decision resumes the turn exactly once', () => {
  it('refuses a replayed decision on an already-decided approval', async () => {
    const harness = fakeDb({});
    await decide(harness.db);
    await expect(decide(harness.db)).rejects.toBeInstanceOf(CloudCodeConflictError);
    expect(vi.mocked(executePersistedAgentTurn)).toHaveBeenCalledTimes(1);
  });

  it('lets only one of two concurrent decisions through', async () => {
    const harness = fakeDb({});
    const results = await Promise.allSettled([decide(harness.db), decide(harness.db, 'reject')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(vi.mocked(executePersistedAgentTurn)).toHaveBeenCalledTimes(1);
  });

  it('refuses a decision on a turn that is not suspended', async () => {
    const harness = fakeDb({ turnState: 'completed' });
    await expect(decide(harness.db)).rejects.toBeInstanceOf(CloudCodeConflictError);
    expect(vi.mocked(executePersistedAgentTurn)).not.toHaveBeenCalled();
  });
});

describe('expiry is enforced rather than described', () => {
  it('refuses an expired approval and transitions the row out of pending', async () => {
    const harness = fakeDb({ approvalExpired: true });
    await expect(decide(harness.db)).rejects.toBeInstanceOf(CloudCodeApprovalExpiredError);
    expect(harness.approval.state).toBe('expired');
    expect(vi.mocked(executePersistedAgentTurn)).not.toHaveBeenCalled();
  });

  it('hides an expired approval from the pending list', async () => {
    const harness = fakeDb({ approvalExpired: true });
    const approvals = await listCloudCodeAgentApprovals(harness.db, OWNER, SESSION_ID);
    expect(approvals).toHaveLength(0);
    expect(harness.sqlLog.some((sql) => sql.includes("set state = 'expired'"))).toBe(true);
  });
});

describe('the resumed turn continues instead of restarting', () => {
  it('rebuilds the transcript from the persisted steps and appends the approved call', async () => {
    const harness = fakeDb({
      steps: [
        {
          step_index: 1,
          tool_name: 'list_files',
          tool_args: { path: '.' },
          output: 'src\nbuild',
          is_error: false,
        },
        {
          step_index: 2,
          tool_name: 'read_file',
          tool_args: { path: 'src/a.ts' },
          output: 'export const a = 1;',
          is_error: false,
        },
      ],
    });
    await decide(harness.db);
    const call = vi.mocked(executePersistedAgentTurn).mock.calls[0]?.[0];
    const messages = call?.priorMessages ?? [];

    expect(messages[0]).toEqual({ role: 'user', content: 'Fix the failing test' });
    const toolUses = messages
      .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
      .filter((b): b is ToolUseBlock => b.type === 'tool_use');
    expect(toolUses.map((b) => b.name)).toEqual(['list_files', 'read_file', 'run_command']);

    const results = messages
      .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
      .filter((b): b is ToolResultBlock => b.type === 'tool_result');
    const useIds = new Set(toolUses.map((b) => b.id));
    for (const result of results) expect(useIds.has(result.toolUseId)).toBe(true);

    expect(toolUses.at(-1)?.input).toEqual({ command: DANGEROUS_COMMAND });
    expect(call?.preApproved?.toolUseId).toBe(toolUses.at(-1)?.id);
  });

  it('continues step numbering above the stored steps so resumed work is not swallowed', async () => {
    const harness = fakeDb({
      steps: [
        { step_index: 1, tool_name: 'list_files', tool_args: {}, output: 'a', is_error: false },
        { step_index: 2, tool_name: 'read_file', tool_args: {}, output: 'b', is_error: false },
      ],
    });
    await decide(harness.db);
    expect(vi.mocked(executePersistedAgentTurn).mock.calls[0]?.[0].initialStepIndex).toBe(2);
  });

  it('derives its own reservation key rather than reusing the turn key', async () => {
    const harness = fakeDb({});
    await decide(harness.db);
    const key = vi.mocked(executePersistedAgentTurn).mock.calls[0]?.[0].idempotencyKey ?? '';
    expect(key).toContain(TURN_ID);
    expect(key).toContain('4');
    expect(key.length).toBeGreaterThanOrEqual(8);
  });
});

describe('approvals are owner-scoped', () => {
  it('reports a turn outside the caller scope as not found', async () => {
    const harness = fakeDb({ turnFound: false });
    await expect(decide(harness.db)).rejects.toBeInstanceOf(CloudCodeNotFoundError);
    expect(vi.mocked(executePersistedAgentTurn)).not.toHaveBeenCalled();
  });

  it('rejects a turn id that is not a uuid before touching the database', async () => {
    const harness = fakeDb({});
    await expect(
      decideCloudCodeAgentApproval({
        db: harness.db,
        owner: OWNER,
        sessionId: SESSION_ID,
        turnId: "' or '1'='1",
        stepIndex: 0,
        decision: 'approve',
        planTier: 'pro',
        signal: new AbortController().signal,
      }),
    ).rejects.toBeInstanceOf(CloudCodeNotFoundError);
    expect(harness.query).not.toHaveBeenCalled();
  });
});
