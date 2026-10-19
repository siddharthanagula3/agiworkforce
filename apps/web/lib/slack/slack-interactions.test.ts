import { beforeEach, describe, expect, it, vi } from 'vitest';

type AssistantModule = typeof import('./slack-assistant');

const mocks = vi.hoisted(() => ({ claimSlackApproval: vi.fn() }));

vi.mock('./slack-assistant', async (importOriginal) => ({
  ...(await importOriginal<AssistantModule>()),
  claimSlackApproval: mocks.claimSlackApproval,
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { isServerToServerRoute } from '@/lib/eu-access';
import {
  decideSlackApprovalFromSlack,
  interactionReply,
  readSlackApprovalClick,
} from './slack-interactions';
import { SLACK_APPROVE_ACTION_ID, SLACK_DENY_ACTION_ID, approvalMessage } from './slack-messages';

const RUN_ID = '0190a000-0000-7000-8000-0000000000e1';

function payload(actionId: string, patch: Record<string, unknown> = {}) {
  return {
    type: 'block_actions',
    team: { id: 'T123' },
    user: { id: 'U123' },
    response_url: 'https://hooks.slack.com/actions/T123/1/abc',
    actions: [{ action_id: actionId, value: RUN_ID }],
    ...patch,
  };
}

function db(row: Record<string, unknown> | null) {
  return { query: vi.fn(async () => (row ? [row] : [])) } as unknown as DatabaseAdapter;
}

const pendingRow = {
  user_id: 'user_1',
  organization_id: null,
  slack_user_id: 'U123',
  linked_user_id: 'user_1',
  approval_request: {
    requestedAt: '2026-10-19T10:00:00.000Z',
    toolCalls: [
      { id: 'call_1', name: 'send_email', summary: 'Send the weekly update', input: null },
    ],
  },
};

beforeEach(() => mocks.claimSlackApproval.mockReset());

describe('approving in Slack', () => {
  it('puts Approve and Deny on the approval message for this run', () => {
    const message = approvalMessage(
      [{ id: 'call_1', name: 'send_email', summary: 'Send the weekly update' } as never],
      'https://agi.invalid/settings/slack',
      'task',
      RUN_ID,
    );
    const actions = JSON.stringify(message.blocks);
    expect(actions).toContain(SLACK_APPROVE_ACTION_ID);
    expect(actions).toContain(SLACK_DENY_ACTION_ID);
    expect(actions).toContain(RUN_ID);
  });

  it('reads a click and keeps only Slack response URLs', () => {
    expect(readSlackApprovalClick(payload(SLACK_APPROVE_ACTION_ID))).toEqual({
      teamId: 'T123',
      slackUserId: 'U123',
      runId: RUN_ID,
      decision: 'approved',
      responseUrl: 'https://hooks.slack.com/actions/T123/1/abc',
    });
    expect(
      readSlackApprovalClick(
        payload(SLACK_DENY_ACTION_ID, { response_url: 'https://attacker.invalid/x' }),
      ),
    ).toMatchObject({ decision: 'rejected', responseUrl: null });
    expect(readSlackApprovalClick(payload('slack_view_task'))).toBeNull();
    expect(readSlackApprovalClick({ type: 'view_submission' })).toBeNull();
  });

  it('decides every pending call for the person who asked', async () => {
    const resume = vi.fn(async () => undefined);
    mocks.claimSlackApproval.mockResolvedValue(resume);
    const click = readSlackApprovalClick(payload(SLACK_APPROVE_ACTION_ID))!;
    const outcome = await decideSlackApprovalFromSlack(db(pendingRow), click);
    expect(outcome).toMatchObject({ kind: 'decided', decision: 'approved' });
    expect(mocks.claimSlackApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        runId: RUN_ID,
        approval: { decision: 'approved', toolCallIds: ['call_1'] },
      }),
    );
    expect(interactionReply(outcome)).toMatch(/^Approved/);
  });

  it('refuses a click from anyone else, or from an unlinked account, without deciding', async () => {
    const click = readSlackApprovalClick(payload(SLACK_APPROVE_ACTION_ID))!;
    const other = await decideSlackApprovalFromSlack(
      db({ ...pendingRow, slack_user_id: 'U999' }),
      click,
    );
    expect(other.kind).toBe('refused');
    const unlinked = await decideSlackApprovalFromSlack(
      db({ ...pendingRow, linked_user_id: null }),
      click,
    );
    expect(unlinked.kind).toBe('refused');
    const gone = await decideSlackApprovalFromSlack(db(null), click);
    expect(gone).toEqual({
      kind: 'refused',
      message: 'This request is no longer waiting for approval.',
    });
    expect(mocks.claimSlackApproval).not.toHaveBeenCalled();
  });

  it('is reachable from Slack servers like the events receiver', () => {
    expect(isServerToServerRoute('/api/webhooks/slack-interactions')).toBe(true);
  });
});
