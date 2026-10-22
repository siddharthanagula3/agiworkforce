import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  SlackChannelToolListSchema,
  type SlackChannelMode,
  type SlackChannelPolicy,
  type SlackChannelPolicyList,
  type SlackChannelTool,
} from '@agiworkforce/cloud-contracts';

import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';

const SEEN_CHANNELS_LIMIT = 200;

export interface SlackChannelSetting {
  mode: SlackChannelMode | null;
  tools: SlackChannelTool[] | null;
}

function toolsFromRow(value: unknown): SlackChannelTool[] | null {
  if (value === null || value === undefined) return null;
  const parsed = SlackChannelToolListSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export async function readSlackChannelSetting(
  serviceDb: DatabaseAdapter,
  installationId: string,
  channelId: string,
): Promise<SlackChannelSetting> {
  const [row] = await serviceDb.query<{ mode: SlackChannelMode; allowed_tools: unknown }>(
    `select mode, allowed_tools from public.slack_channel_policies
      where installation_id = $1 and channel_id = $2
      limit 1`,
    [installationId, channelId],
  );
  return row
    ? { mode: row.mode, tools: toolsFromRow(row.allowed_tools) }
    : { mode: null, tools: null };
}

export async function readSlackChannelToolsOrNone(
  serviceDb: DatabaseAdapter,
  installationId: string,
  channelId: string,
): Promise<SlackChannelTool[] | null> {
  try {
    return (await readSlackChannelSetting(serviceDb, installationId, channelId)).tools;
  } catch (error) {
    logger.warn(
      { error, installationId, channelId },
      'Slack channel tool policy unreadable; the run gets no tools',
    );
    return [];
  }
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
    scopedDb.query<{
      channel_id: string;
      mode: SlackChannelMode;
      allowed_tools: unknown;
      updated_at: string | Date;
    }>(
      `select channel_id, mode, allowed_tools, updated_at from public.slack_channel_policies
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
      tools: null,
      seen: true,
      updatedAt: null,
    });
  }
  for (const row of policies) {
    byChannel.set(row.channel_id, {
      channelId: row.channel_id,
      mode: row.mode,
      tools: toolsFromRow(row.allowed_tools),
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
  input: {
    installationId: string;
    channelId: string;
    mode: SlackChannelMode | null;
    tools?: readonly SlackChannelTool[] | null;
  },
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
    `insert into public.slack_channel_policies
       (installation_id, channel_id, mode, allowed_tools, updated_by)
     values ($1, $2, $3, $5::text[], $4)
     on conflict (installation_id, channel_id)
     do update set mode = excluded.mode,
                   allowed_tools = case when $6::boolean then excluded.allowed_tools
                                        else slack_channel_policies.allowed_tools end,
                   updated_by = excluded.updated_by`,
    [
      input.installationId,
      input.channelId,
      input.mode,
      userId,
      input.tools === undefined || input.tools === null ? null : [...input.tools],
      input.tools !== undefined,
    ],
  );
}
