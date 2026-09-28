import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { z } from 'zod';

import {
  UNATTENDED_RUN_DENIED_STATUSES,
  ownerMayRunUnattendedSql,
} from '@/lib/auth/account-lifecycle';
import {
  MEMBERSHIP_STATUSES_THAT_MAY_ACT,
  ownerIsActiveWorkspaceMemberSql,
} from '@/lib/server/workspace-scope';

import { SLACK_LINK_TTL_SECONDS } from './slack-config';
import { stopParkedSlackTasks } from './slack-runs';

const LINK_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export type SlackLinkResolution =
  | { status: 'linked'; linkId: string; userId: string; organizationId: string | null }
  | { status: 'unlinked' }
  | { status: 'account_unavailable' }
  | { status: 'workspace_left' };

export interface SlackLinkRequestPreview {
  installationId: string;
  teamId: string;
  teamName: string;
  slackUserId: string;
  expiresAt: string;
}

export interface SlackAccountLink {
  id: string;
  teamId: string;
  teamName: string;
  slackUserId: string;
  slackUserName: string | null;
  organizationId: string | null;
  organizationName: string | null;
  linkedAt: string;
}

export class SlackLinkConflictError extends Error {
  constructor() {
    super('This Slack account is already linked to another AGI Workforce account');
    this.name = 'SlackLinkConflictError';
  }
}

function hashLinkToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function toIso(value: string | Date): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

export function isSlackLinkToken(value: unknown): value is string {
  return typeof value === 'string' && LINK_TOKEN_RE.test(value);
}

export async function resolveSlackAccountLink(
  db: DatabaseAdapter,
  input: { installationId: string; slackUserId: string },
): Promise<SlackLinkResolution> {
  const [row] = await db.query<{
    id: string;
    user_id: string;
    organization_id: string | null;
    account_may_act: boolean;
    member_may_act: boolean;
  }>(
    `select link.id, link.user_id, link.organization_id,
            (${ownerMayRunUnattendedSql('link.user_id', 3)}) as account_may_act,
            (${ownerIsActiveWorkspaceMemberSql('link.user_id', 'link.organization_id', 4)}) as member_may_act
       from slack_account_links as link
      where link.installation_id = $1
        and link.slack_user_id = $2
      limit 1`,
    [
      input.installationId,
      input.slackUserId,
      UNATTENDED_RUN_DENIED_STATUSES,
      MEMBERSHIP_STATUSES_THAT_MAY_ACT,
    ],
  );
  if (!row) return { status: 'unlinked' };
  if (!row.account_may_act) return { status: 'account_unavailable' };
  if (!row.member_may_act) return { status: 'workspace_left' };
  return {
    status: 'linked',
    linkId: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
  };
}

export async function issueSlackLinkRequest(
  db: DatabaseAdapter,
  input: { installationId: string; slackUserId: string; eventId: string },
): Promise<string | null> {
  const token = randomBytes(32).toString('base64url');
  const rows = await db.query<{ id: string }>(
    `insert into slack_link_requests (
       installation_id, slack_user_id, token_sha256, last_event_id, expires_at
     ) values ($1, $2, $3, $4, now() + make_interval(secs => $5))
     on conflict (installation_id, slack_user_id) do update
        set token_sha256 = excluded.token_sha256,
            last_event_id = excluded.last_event_id,
            expires_at = excluded.expires_at,
            created_at = now()
      where slack_link_requests.last_event_id <> excluded.last_event_id
     returning id`,
    [
      input.installationId,
      input.slackUserId,
      hashLinkToken(token),
      input.eventId,
      SLACK_LINK_TTL_SECONDS,
    ],
  );
  return rows.length > 0 ? token : null;
}

export async function previewSlackLinkRequest(
  db: DatabaseAdapter,
  token: string,
): Promise<SlackLinkRequestPreview | null> {
  const [row] = await db.query<{
    installation_id: string;
    team_id: string;
    team_name: string;
    slack_user_id: string;
    expires_at: string | Date;
  }>(
    `select request.installation_id, installation.team_id, installation.team_name,
            request.slack_user_id, request.expires_at
       from slack_link_requests as request
       join slack_installations as installation on installation.id = request.installation_id
      where request.token_sha256 = $1
        and request.expires_at > now()
      limit 1`,
    [hashLinkToken(token)],
  );
  if (!row) return null;
  return {
    installationId: row.installation_id,
    teamId: row.team_id,
    teamName: row.team_name,
    slackUserId: row.slack_user_id,
    expiresAt: toIso(row.expires_at),
  };
}

export async function consumeSlackLinkRequest(
  db: DatabaseAdapter,
  token: string,
): Promise<SlackLinkRequestPreview | null> {
  const [row] = await db.query<{
    installation_id: string;
    team_id: string;
    team_name: string;
    slack_user_id: string;
    expires_at: string | Date;
  }>(
    `with consumed as (
       delete from slack_link_requests
        where token_sha256 = $1
          and expires_at > now()
        returning installation_id, slack_user_id, expires_at
     )
     select consumed.installation_id, installation.team_id, installation.team_name,
            consumed.slack_user_id, consumed.expires_at
       from consumed
       join slack_installations as installation on installation.id = consumed.installation_id`,
    [hashLinkToken(token)],
  );
  if (!row) return null;
  return {
    installationId: row.installation_id,
    teamId: row.team_id,
    teamName: row.team_name,
    slackUserId: row.slack_user_id,
    expiresAt: toIso(row.expires_at),
  };
}

export async function linkSlackAccount(
  scopedDb: DatabaseAdapter,
  input: {
    userId: string;
    organizationId: string | null;
    installationId: string;
    slackUserId: string;
    slackUserName: string | null;
  },
): Promise<string> {
  const [inserted] = await scopedDb.query<{ id: string }>(
    `insert into slack_account_links (
       user_id, organization_id, installation_id, slack_user_id, slack_user_name
     ) values ($1, $2, $3, $4, $5)
     on conflict (installation_id, slack_user_id) do nothing
     returning id`,
    [
      input.userId,
      input.organizationId,
      input.installationId,
      input.slackUserId,
      input.slackUserName?.slice(0, 200) ?? null,
    ],
  );
  if (inserted) return inserted.id;
  const [existing] = await scopedDb.query<{ id: string }>(
    `select id from slack_account_links
      where installation_id = $1 and slack_user_id = $2 and user_id = $3
      limit 1`,
    [input.installationId, input.slackUserId, input.userId],
  );
  if (!existing) throw new SlackLinkConflictError();
  return existing.id;
}

export async function listSlackAccountLinks(
  scopedDb: DatabaseAdapter,
  userId: string,
): Promise<SlackAccountLink[]> {
  const rows = await scopedDb.query<{
    id: string;
    team_id: string;
    team_name: string;
    slack_user_id: string;
    slack_user_name: string | null;
    organization_id: string | null;
    organization_name: string | null;
    created_at: string | Date;
  }>(
    `select link.id, installation.team_id, installation.team_name, link.slack_user_id,
            link.slack_user_name, link.organization_id, organization.name as organization_name,
            link.created_at
       from slack_account_links as link
       join slack_installations as installation on installation.id = link.installation_id
       left join organizations as organization on organization.id = link.organization_id
      where link.user_id = $1
      order by link.created_at desc`,
    [userId],
  );
  return rows.map((row) => ({
    id: row.id,
    teamId: row.team_id,
    teamName: row.team_name,
    slackUserId: row.slack_user_id,
    slackUserName: row.slack_user_name,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    linkedAt: toIso(row.created_at),
  }));
}

export async function unlinkSlackAccount(
  scopedDb: DatabaseAdapter,
  input: { userId: string; linkId: string },
): Promise<{ teamId: string; slackUserId: string } | null> {
  const [row] = await scopedDb.query<{
    team_id: string;
    slack_user_id: string;
    parked_task_ids: unknown;
  }>(
    `with removed as (
       delete from slack_account_links
        where id = $1 and user_id = $2
        returning installation_id, slack_user_id
     ),
     forgotten as (
       delete from slack_assistant_runs as run
        using removed
        where run.user_id = $2
          and run.installation_id = removed.installation_id
          and run.slack_user_id = removed.slack_user_id
        returning run.status, run.agent_run_id
     )
     select installation.team_id, removed.slack_user_id,
            (select coalesce(json_agg(forgotten.agent_run_id), '[]'::json)
               from forgotten
              where forgotten.status = 'awaiting_approval'
                and forgotten.agent_run_id is not null) as parked_task_ids
       from removed
       join slack_installations as installation on installation.id = removed.installation_id`,
    [input.linkId, input.userId],
  );
  if (!row) return null;
  const parked = z.array(z.string()).safeParse(row.parked_task_ids);
  await stopParkedSlackTasks(
    scopedDb,
    (parked.success ? parked.data : []).map((agentRunId) => ({ userId: input.userId, agentRunId })),
    'cancelled',
  );
  return { teamId: row.team_id, slackUserId: row.slack_user_id };
}
