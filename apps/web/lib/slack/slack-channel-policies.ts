import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type {
  SlackChannelMode,
  SlackChannelPolicy,
  SlackChannelPolicyList,
} from '@agiworkforce/cloud-contracts';

import { createError } from '@/lib/errors';

const SEEN_CHANNELS_LIMIT = 200;

export async function readSlackChannelMode(
  serviceDb: DatabaseAdapter,
  installationId: string,
  channelId: string,
): Promise<SlackChannelMode | null> {
  const [row] = await serviceDb.query<{ mode: SlackChannelMode }>(
    `select mode from public.slack_channel_policies
      where installation_id = $1 and channel_id = $2
      limit 1`,
    [installationId, channelId],
  );
  return row?.mode ?? null;
}

export function slackRunModeFor(
  policy: SlackChannelMode | null,
  taskAvailable: boolean,
): 'answer' | 'task' | null {
  if (policy === 'off') return null;
  if (policy === 'answer') return 'answer';
  return taskAvailable ? 'task' : 'answer';
}

async function requireInstaller(
  scopedDb: DatabaseAdapter,
  userId: string,
  installationId: string,
): Promise<{ teamId: string }> {
  const [row] = await scopedDb.query<{ team_id: string }>(
    `select team_id from public.slack_installations
      where id = $1 and installed_by_user_id = $2
      limit 1`,
    [installationId, userId],
  );
  if (!row) throw createError.notFound('That Slack workspace is not one you installed');
  return { teamId: row.team_id };
}

export async function listSlackChannelPolicies(
  scopedDb: DatabaseAdapter,
  serviceDb: DatabaseAdapter,
  userId: string,
  installationId: string,
): Promise<SlackChannelPolicyList> {
  const { teamId } = await requireInstaller(scopedDb, userId, installationId);
  const [policies, seen] = await Promise.all([
    scopedDb.query<{ channel_id: string; mode: SlackChannelMode; updated_at: string | Date }>(
      `select channel_id, mode, updated_at from public.slack_channel_policies
        where installation_id = $1
        order by channel_id`,
      [installationId],
    ),
    serviceDb.query<{ channel_id: string }>(
      `select distinct run.channel_id
         from public.slack_assistant_runs run
         join public.slack_installations installation
           on installation.id = run.installation_id
          and installation.installed_by_user_id = $2
        where run.installation_id = $1
          and run.surface = 'channel'
        limit ${SEEN_CHANNELS_LIMIT}`,
      [installationId, userId],
    ),
  ]);
  const byChannel = new Map<string, SlackChannelPolicy>();
  for (const row of seen) {
    byChannel.set(row.channel_id, {
      channelId: row.channel_id,
      mode: null,
      seen: true,
      updatedAt: null,
    });
  }
  for (const row of policies) {
    byChannel.set(row.channel_id, {
      channelId: row.channel_id,
      mode: row.mode,
      seen: byChannel.has(row.channel_id),
      updatedAt: (row.updated_at instanceof Date
        ? row.updated_at
        : new Date(row.updated_at)
      ).toISOString(),
    });
  }
  return {
    teamId,
    channels: [...byChannel.values()].sort((left, right) =>
      left.channelId.localeCompare(right.channelId),
    ),
  };
}

export async function setSlackChannelPolicy(
  scopedDb: DatabaseAdapter,
  userId: string,
  input: { installationId: string; channelId: string; mode: SlackChannelMode | null },
): Promise<void> {
  await requireInstaller(scopedDb, userId, input.installationId);
  if (input.mode === null) {
    await scopedDb.execute(
      `delete from public.slack_channel_policies where installation_id = $1 and channel_id = $2`,
      [input.installationId, input.channelId],
    );
    return;
  }
  await scopedDb.execute(
    `insert into public.slack_channel_policies (installation_id, channel_id, mode, updated_by)
     values ($1, $2, $3, $4)
     on conflict (installation_id, channel_id)
     do update set mode = excluded.mode, updated_by = excluded.updated_by`,
    [input.installationId, input.channelId, input.mode, userId],
  );
}
