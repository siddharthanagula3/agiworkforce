import 'server-only';

import { z } from 'zod';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  ManagedCloudScheduleRunApprovalToolCallSchema,
  type ManagedCloudScheduleRunApproval,
} from '@agiworkforce/cloud-contracts';

import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';

import { claimSlackApproval } from './slack-assistant';
import { SLACK_APPROVE_ACTION_ID, SLACK_DENY_ACTION_ID } from './slack-messages';

const SLACK_RESPONSE_URL_HOST = 'hooks.slack.com';

const SlackBlockActionSchema = z.object({
  type: z.literal('block_actions'),
  team: z.object({ id: z.string().regex(/^[A-Z0-9]{2,32}$/) }),
  user: z.object({ id: z.string().regex(/^[A-Z0-9]{2,32}$/) }),
  response_url: z.string().url().optional(),
  actions: z.array(z.object({ action_id: z.string(), value: z.string().optional() })).min(1),
});

export interface SlackApprovalClick {
  teamId: string;
  slackUserId: string;
  runId: string;
  decision: ManagedCloudScheduleRunApproval['decision'];
  responseUrl: string | null;
}

export type SlackInteractionOutcome =
  | {
      kind: 'decided';
      decision: SlackApprovalClick['decision'];
      userId: string;
      organizationId: string | null;
      toolCallCount: number;
      resume: () => Promise<void>;
    }
  | { kind: 'refused'; message: string };

function slackResponseUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === SLACK_RESPONSE_URL_HOST
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function readSlackApprovalClick(payload: unknown): SlackApprovalClick | null {
  const parsed = SlackBlockActionSchema.safeParse(payload);
  if (!parsed.success) return null;
  const action = parsed.data.actions.find(
    (entry) =>
      entry.action_id === SLACK_APPROVE_ACTION_ID || entry.action_id === SLACK_DENY_ACTION_ID,
  );
  const runId = z.string().uuid().safeParse(action?.value);
  if (!action || !runId.success) return null;
  return {
    teamId: parsed.data.team.id,
    slackUserId: parsed.data.user.id,
    runId: runId.data,
    decision: action.action_id === SLACK_APPROVE_ACTION_ID ? 'approved' : 'rejected',
    responseUrl: slackResponseUrl(parsed.data.response_url),
  };
}

const PendingRequestSchema = z.object({
  toolCalls: z.array(ManagedCloudScheduleRunApprovalToolCallSchema).min(1),
});

const NOT_YOURS =
  'Only the person who asked can approve this, from the Slack account linked to their AGI account.';

export async function decideSlackApprovalFromSlack(
  serviceDb: DatabaseAdapter,
  click: SlackApprovalClick,
): Promise<SlackInteractionOutcome> {
  const [row] = await serviceDb.query<{
    user_id: string;
    organization_id: string | null;
    slack_user_id: string;
    approval_request: unknown;
    linked_user_id: string | null;
  }>(
    `select run.user_id, run.organization_id, run.slack_user_id, run.approval_request,
            link.user_id as linked_user_id
       from slack_assistant_runs run
       join slack_installations installation
         on installation.id = run.installation_id
        and installation.team_id = $2
       left join slack_account_links link
         on link.installation_id = run.installation_id
        and link.slack_user_id = run.slack_user_id
        and link.user_id = run.user_id
      where run.id = $1
        and run.status = 'awaiting_approval'
      limit 1`,
    [click.runId, click.teamId],
  );
  if (!row) return { kind: 'refused', message: 'This request is no longer waiting for approval.' };
  if (row.slack_user_id !== click.slackUserId || row.linked_user_id !== row.user_id) {
    return { kind: 'refused', message: NOT_YOURS };
  }
  const pending = PendingRequestSchema.safeParse(row.approval_request);
  if (!pending.success) {
    return { kind: 'refused', message: 'This request can no longer be resumed.' };
  }
  try {
    const resume = await claimSlackApproval({
      serviceDb,
      scopedDb: createClaimedUserScopedDb(serviceDb, {
        userId: row.user_id,
        organizationId: row.organization_id,
      }),
      userId: row.user_id,
      runId: click.runId,
      approval: {
        decision: click.decision,
        toolCallIds: pending.data.toolCalls.map((call) => call.id),
      },
    });
    return {
      kind: 'decided',
      decision: click.decision,
      userId: row.user_id,
      organizationId: row.organization_id,
      toolCallCount: pending.data.toolCalls.length,
      resume,
    };
  } catch (error) {
    return {
      kind: 'refused',
      message:
        error instanceof Error && error.message
          ? error.message
          : 'The decision could not be recorded. Try again in AGI.',
    };
  }
}

export function interactionReply(outcome: SlackInteractionOutcome): string {
  if (outcome.kind === 'refused') return outcome.message;
  return outcome.decision === 'approved'
    ? 'Approved. AGI is continuing and will answer in this thread.'
    : 'Denied. Nothing was run, and AGI will answer without that step.';
}
