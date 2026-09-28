import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { decryptConnectorToken, encryptConnectorToken } from '@/lib/custom-connector-crypto';
import { logger } from '@/lib/logger';

import { isSlackTokenRevoked, revokeSlackToken } from './slack-api';

const BOT_TOKEN_PURPOSE = 'slack-bot-token';

export interface SlackInstallation {
  id: string;
  teamId: string;
  teamName: string;
  appId: string;
  botUserId: string;
}

export interface SlackInstallationWithToken extends SlackInstallation {
  botToken: string;
}

export interface InstalledSlackWorkspace {
  id: string;
  teamId: string;
  teamName: string;
  installedAt: string;
}

interface InstallationRow {
  id: string;
  team_id: string;
  team_name: string;
  app_id: string;
  bot_user_id: string;
}

function toIso(value: string | Date): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function mapInstallation(row: InstallationRow): SlackInstallation {
  return {
    id: row.id,
    teamId: row.team_id,
    teamName: row.team_name,
    appId: row.app_id,
    botUserId: row.bot_user_id,
  };
}

export async function saveSlackInstallation(
  db: DatabaseAdapter,
  input: {
    teamId: string;
    teamName: string;
    enterpriseId: string | null;
    appId: string;
    botUserId: string;
    scopes: readonly string[];
    botToken: string;
    installedByUserId: string;
  },
): Promise<SlackInstallation> {
  const [row] = await db.query<InstallationRow>(
    `insert into slack_installations (
       team_id, team_name, enterprise_id, app_id, bot_user_id, bot_scopes, bot_token_enc,
       installed_by_user_id
     ) values ($1, $2, $3, $4, $5, $6::text[], $7, $8)
     on conflict (team_id) do update
        set team_name = excluded.team_name,
            enterprise_id = excluded.enterprise_id,
            app_id = excluded.app_id,
            bot_user_id = excluded.bot_user_id,
            bot_scopes = excluded.bot_scopes,
            bot_token_enc = excluded.bot_token_enc,
            installed_by_user_id = excluded.installed_by_user_id
     returning id, team_id, team_name, app_id, bot_user_id`,
    [
      input.teamId,
      input.teamName.slice(0, 200),
      input.enterpriseId,
      input.appId,
      input.botUserId,
      [...input.scopes],
      encryptConnectorToken(input.botToken, BOT_TOKEN_PURPOSE),
      input.installedByUserId,
    ],
  );
  if (!row) throw new Error('The Slack installation was not saved');
  return mapInstallation(row);
}

export async function findSlackInstallation(
  db: DatabaseAdapter,
  teamId: string,
): Promise<SlackInstallationWithToken | null> {
  const [row] = await db.query<InstallationRow & { bot_token_enc: string }>(
    `select id, team_id, team_name, app_id, bot_user_id, bot_token_enc
       from slack_installations
      where team_id = $1
      limit 1`,
    [teamId],
  );
  if (!row) return null;
  return {
    ...mapInstallation(row),
    botToken: decryptConnectorToken(row.bot_token_enc, BOT_TOKEN_PURPOSE),
  };
}

export async function findSlackInstallationById(
  db: DatabaseAdapter,
  installationId: string,
): Promise<SlackInstallationWithToken | null> {
  const [row] = await db.query<InstallationRow & { bot_token_enc: string }>(
    `select id, team_id, team_name, app_id, bot_user_id, bot_token_enc
       from slack_installations
      where id = $1
      limit 1`,
    [installationId],
  );
  if (!row) return null;
  return {
    ...mapInstallation(row),
    botToken: decryptConnectorToken(row.bot_token_enc, BOT_TOKEN_PURPOSE),
  };
}

export async function deleteSlackInstallationForTeam(
  db: DatabaseAdapter,
  teamId: string,
): Promise<boolean> {
  const removed = await db.execute(`delete from slack_installations where team_id = $1`, [teamId]);
  return removed > 0;
}

export async function listSlackWorkspacesInstalledBy(
  scopedDb: DatabaseAdapter,
  userId: string,
): Promise<InstalledSlackWorkspace[]> {
  const rows = await scopedDb.query<{
    id: string;
    team_id: string;
    team_name: string;
    created_at: string | Date;
  }>(
    `select id, team_id, team_name, created_at
       from slack_installations
      where installed_by_user_id = $1
      order by created_at desc`,
    [userId],
  );
  return rows.map((row) => ({
    id: row.id,
    teamId: row.team_id,
    teamName: row.team_name,
    installedAt: toIso(row.created_at),
  }));
}

export async function uninstallSlackWorkspace(
  db: DatabaseAdapter,
  input: { installationId: string; userId: string },
): Promise<SlackInstallation | null> {
  const [row] = await db.query<InstallationRow & { bot_token_enc: string }>(
    `select id, team_id, team_name, app_id, bot_user_id, bot_token_enc
       from slack_installations
      where id = $1 and installed_by_user_id = $2
      limit 1`,
    [input.installationId, input.userId],
  );
  if (!row) return null;
  try {
    await revokeSlackToken(decryptConnectorToken(row.bot_token_enc, BOT_TOKEN_PURPOSE));
  } catch (error) {
    if (!isSlackTokenRevoked(error)) throw error;
    logger.info(
      { installationId: row.id, teamId: row.team_id },
      'Slack bot token was already revoked; removing the installation',
    );
  }
  await db.execute(`delete from slack_installations where id = $1 and installed_by_user_id = $2`, [
    input.installationId,
    input.userId,
  ]);
  return mapInstallation(row);
}
