import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/services/cloud-agent-run-service', () => ({ transitionCloudAgentRun: vi.fn() }));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import {
  SlackRunApprovalError,
  claimSlackRunApproval,
  slackApprovalGeneration,
} from './slack-runs';

const RUN_ID = '0190a000-0000-7000-8000-0000000000e1';

function checkpoint(patch: Record<string, unknown> = {}) {
  return {
    sessionId: 'session-1',
    turnId: 'turn-1',
    nextEventSequence: 4,
    completedSteps: 1,
    messages: [],
    pendingToolCalls: [{ id: 'call_a', name: 'send_email', input: {} }],
    route: { modelKey: 'model-key' },
    sensitiveContextPresent: false,
    ...patch,
  };
}

function parkedDb(parked: ReturnType<typeof checkpoint>) {
  const execute = vi.fn(async () => undefined);
  const tx = {
    query: vi.fn(async () => [
      {
        id: RUN_ID,
        user_id: 'user_1',
        organization_id: null,
        installation_id: 'installation-1',
        slack_user_id: 'U123',
        channel_id: 'C1',
        message_ts: '1.1',
        thread_ts: null,
        surface: 'dm',
        mode: 'answer',
        agent_run_id: null,
        status: 'awaiting_approval',
        approval_checkpoint: parked,
        approval_expires_at: new Date(Date.now() + 60_000).toISOString(),
        task_stopped: false,
      },
    ]),
    execute,
  };
  const db = {
    transaction: async (work: (inner: unknown) => unknown) => work(tx),
    execute: vi.fn(),
  } as unknown as DatabaseAdapter;
  return { db, execute };
}

const approved = (ids: string[]) => ({ decision: 'approved' as const, toolCallIds: ids });

describe('Slack approval generation', () => {
  it('differs for a later checkpoint of the same run', () => {
    const first = slackApprovalGeneration(checkpoint());
    expect(slackApprovalGeneration(checkpoint())).toBe(first);
    expect(slackApprovalGeneration(checkpoint({ completedSteps: 2 }))).not.toBe(first);
    expect(slackApprovalGeneration(checkpoint({ nextEventSequence: 9 }))).not.toBe(first);
    expect(
      slackApprovalGeneration(
        checkpoint({ pendingToolCalls: [{ id: 'call_b', name: 'send_email', input: {} }] }),
      ),
    ).not.toBe(first);
  });

  it('claims the run when the card generation matches the parked checkpoint', async () => {
    const parked = checkpoint();
    const { db, execute } = parkedDb(parked);
    const claimed = await claimSlackRunApproval(db, {
      userId: 'user_1',
      runId: RUN_ID,
      generation: slackApprovalGeneration(parked),
      approval: approved(['call_a']),
    });
    expect(claimed.run.id).toBe(RUN_ID);
    expect(execute).toHaveBeenCalledOnce();
  });

  it('refuses a card from an earlier checkpoint even when the pending call ids are current', async () => {
    const earlier = checkpoint();
    const later = checkpoint({ completedSteps: 2, nextEventSequence: 9 });
    const { db, execute } = parkedDb(later);
    await expect(
      claimSlackRunApproval(db, {
        userId: 'user_1',
        runId: RUN_ID,
        generation: slackApprovalGeneration(earlier),
        approval: approved(['call_a']),
      }),
    ).rejects.toMatchObject({ name: SlackRunApprovalError.name, reason: 'stale' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('still claims without a generation for the in-app decision', async () => {
    const { db } = parkedDb(checkpoint());
    const claimed = await claimSlackRunApproval(db, {
      userId: 'user_1',
      runId: RUN_ID,
      approval: approved(['call_a']),
    });
    expect(claimed.checkpoint.turnId).toBe('turn-1');
  });
});
