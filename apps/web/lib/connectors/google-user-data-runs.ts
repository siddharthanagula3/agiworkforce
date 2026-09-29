import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { ExternalResourceReferenceInput } from '@agiworkforce/types';
import { CUSTOM_SERVER_PREFIX, ORG_SHARED_SERVER_PREFIX } from '@/lib/connectors/custom-server-ids';
import {
  conversationHoldsGoogleUserData,
  googleHostedCustomServerIds,
  GOOGLE_USER_DATA_CONNECTOR_IDS,
  isGoogleApiUrl,
  isGoogleUserDataConnector,
  messagesCarryGoogleToolUse,
} from '@/lib/connectors/google-user-data';
import {
  isDirectoryServerId,
  resolveDirectoryTarget,
} from '@/lib/connectors/mcp-directory-targets';
import { logger } from '@/lib/logger';

type GoogleUserDataDb = Pick<DatabaseAdapter, 'query'>;

// Runs that call connector tools outside a chat conversation (published app
// runtime, Slack) have no conversation to mark, so the decision is made per
// run from what the run can reach: any Google connector offered to the run
// keeps the whole run on models whose provider does not train on inputs.

// Shown to whoever opens a published app, who may not be its owner, so it says
// nothing about the owner's accounts or data.
export const GOOGLE_USER_DATA_ARTIFACT_NO_MODEL_MESSAGE =
  "This app can't run right now. Try again later.";

export const GOOGLE_USER_DATA_SLACK_RESUME_MESSAGE =
  'This answer used data from your Google account, and its model does not keep that data out of training, so it cannot continue. Ask again in Slack.';

export const GOOGLE_USER_DATA_SCAN_WITHHELD_MESSAGE =
  'This file came from your Google account and has scanned pages. No model that keeps Google data out of training can read them right now, so their text was not extracted. The file is still in the project.';

export function connectorIdsReachGoogleUserData(connectorIds: readonly string[]): boolean {
  return connectorIds.some(isGoogleUserDataConnector);
}

export function toolsReachGoogleUserData(
  tools: readonly { serverId: string; googleUserData?: true }[],
): boolean {
  return tools.some(
    (tool) => tool.googleUserData === true || isGoogleUserDataConnector(tool.serverId),
  );
}

interface RunTool {
  serverId: string;
  googleUserData?: true;
}

/**
 * Drops every tool of a Google connector from a run plan, the reconnect tool
 * included, since a surface that never offers Google data has no reason to
 * prompt for a Google reconnect either. A tool the catalog flagged as served
 * from a Google API host goes too.
 */
export function withoutGoogleUserDataTools<T extends RunTool>(tools: readonly T[]): T[] {
  return tools.filter(
    (tool) => tool.googleUserData !== true && !isGoogleUserDataConnector(tool.serverId),
  );
}

async function directoryServerOnGoogleHost(serverId: string): Promise<boolean> {
  try {
    const target = await resolveDirectoryTarget(serverId);
    return target === null || isGoogleApiUrl(target.mcpUrl);
  } catch (error) {
    logger.warn(
      { error, serverId },
      'Directory server host unreadable; treating it as served from Google',
    );
    return true;
  }
}

/**
 * For a surface that never carries Google user data, such as Slack: removes
 * Google connectors and every custom, workspace or directory server hosted on
 * a Google API host. A host that cannot be read counts as a Google one.
 */
export async function withoutGoogleHostedTools<T extends RunTool>(
  db: GoogleUserDataDb,
  userId: string,
  organizationId: string | null,
  tools: readonly T[],
): Promise<T[]> {
  const candidates = withoutGoogleUserDataTools(tools);
  const customIds = candidates
    .map((tool) => tool.serverId)
    .filter((id) => id.startsWith(CUSTOM_SERVER_PREFIX) || id.startsWith(ORG_SHARED_SERVER_PREFIX));
  const directoryIds = [
    ...new Set(candidates.map((tool) => tool.serverId).filter(isDirectoryServerId)),
  ];
  if (customIds.length === 0 && directoryIds.length === 0) return candidates;

  const hosted =
    customIds.length > 0 ? await googleHostedCustomServerIds(db, userId, organizationId) : [];
  const blocked = new Set<string>(hosted ?? customIds);
  const directoryHosts = await Promise.all(
    directoryIds.map(async (id) => [id, await directoryServerOnGoogleHost(id)] as const),
  );
  for (const [id, onGoogle] of directoryHosts) if (onGoogle) blocked.add(id);
  return candidates.filter((tool) => !blocked.has(tool.serverId));
}

/**
 * Whether a file imported from outside came from a Google connector or a
 * Google API host, so any model that reads it must keep inputs out of training.
 */
export function externalOriginHoldsGoogleUserData(
  origin: Pick<ExternalResourceReferenceInput, 'provider' | 'uri' | 'connectorId'> | undefined,
): boolean {
  if (!origin) return false;
  return (
    (origin.connectorId ? isGoogleUserDataConnector(origin.connectorId) : false) ||
    isGoogleUserDataConnector(origin.provider) ||
    isGoogleUserDataConnector(origin.provider.replace(/_/g, '-')) ||
    isGoogleApiUrl(origin.uri)
  );
}

/**
 * A published app belongs to the conversation it was made in. When that chat
 * holds Google user data, or its state cannot be read, every run of the app
 * stays on models that keep inputs out of training.
 */
export async function publishedArtifactSourceHoldsGoogleUserData(
  db: GoogleUserDataDb,
  publishedArtifactId: string,
): Promise<boolean> {
  try {
    const [row] = await db.query<{ marked: boolean }>(
      `select coalesce(c.google_user_data_at is not null, false) as marked
         from public.published_artifacts p
         left join public.web_conversations c on c.id = p.conversation_id
        where p.id = $1::uuid
        limit 1`,
      [publishedArtifactId],
    );
    return !row || row.marked !== false;
  } catch (error) {
    logger.warn(
      { error, publishedArtifactId },
      'Published app source chat unreadable; running it only on models that keep inputs out of training',
    );
    return true;
  }
}

/**
 * True when a resumed run's own transcript already carried a Google tool call,
 * so the model it continues on must keep inputs out of training.
 */
export function runMessagesCarryGoogleUserData(messages: readonly unknown[]): boolean {
  return messagesCarryGoogleToolUse(messages);
}

export interface RetrievalDocumentSource {
  source_kind: string;
  source_id: string;
  user_id: string;
}

async function originConversationId(
  db: GoogleUserDataDb,
  sql: string,
  document: RetrievalDocumentSource,
): Promise<string | null> {
  const [row] = await db.query<{ conversation_id: string | null }>(sql, [
    document.source_id,
    document.user_id,
  ]);
  return row?.conversation_id ?? null;
}

async function conversationOrigin(
  db: GoogleUserDataDb,
  userId: string,
  conversationId: string | null,
): Promise<boolean> {
  return conversationId !== null && conversationHoldsGoogleUserData(db, userId, conversationId);
}

/**
 * Whether the text a retrieval document is built from came from, or sits in a
 * conversation that holds, Google user data. Such text is embedded only by a
 * provider that keeps inputs out of training. Unreadable state is treated as
 * holding Google data.
 */
export async function retrievalDocumentHoldsGoogleUserData(
  db: GoogleUserDataDb,
  document: RetrievalDocumentSource,
): Promise<boolean> {
  try {
    switch (document.source_kind) {
      case 'conversation':
        return await conversationHoldsGoogleUserData(db, document.user_id, document.source_id);
      case 'artifact':
        return await conversationOrigin(
          db,
          document.user_id,
          await originConversationId(
            db,
            'select conversation_id::text as conversation_id from public.web_artifacts where id = $1::uuid and user_id = $2',
            document,
          ),
        );
      case 'research_report':
        return await conversationOrigin(
          db,
          document.user_id,
          await originConversationId(
            db,
            'select conversation_id::text as conversation_id from public.research_reports where id = $1::uuid and user_id = $2',
            document,
          ),
        );
      case 'library_file':
        return await conversationOrigin(
          db,
          document.user_id,
          await originConversationId(
            db,
            'select conversation_id::text as conversation_id from public.media_assets where id = $1::uuid and user_id = $2',
            document,
          ),
        );
      case 'project_knowledge': {
        const [row] = await db.query<{ google: boolean }>(
          `select exists (
             select 1
               from public.project_knowledge_files f
               join public.user_projects p
                 on p.id = f.project_id
                and p.user_id = $3
               join public.external_resource_references r
                 on r.id = f.external_reference_id
              where f.id = $1::uuid
                and r.connector_id = any($2::text[])
           ) as google`,
          [document.source_id, GOOGLE_USER_DATA_CONNECTOR_IDS, document.user_id],
        );
        return row?.google === true;
      }
      case 'developer_session':
        return false;
      default:
        return true;
    }
  } catch (error) {
    logger.warn(
      { error, sourceKind: document.source_kind, sourceId: document.source_id },
      'Retrieval source Google data state unreadable; embedding only with providers that keep inputs out of training',
    );
    return true;
  }
}

/**
 * A search query is typed or generated inside a chat, and the search path does
 * not know which one. Any chat of the user's that holds Google data may be the
 * one asking, so the query is embedded as if it came from it.
 */
export async function retrievalQueryMayCarryGoogleUserData(
  db: GoogleUserDataDb,
  userId: string,
): Promise<boolean> {
  try {
    const [row] = await db.query<{ holds: boolean }>(
      `select exists (
         select 1
           from public.web_conversations
          where user_id = $1
            and google_user_data_at is not null
            and deleted_at is null
       ) as holds`,
      [userId],
    );
    return row?.holds === true;
  } catch (error) {
    logger.warn(
      { error, userId },
      'Google data markers unreadable; embedding the search query only with providers that keep inputs out of training',
    );
    return true;
  }
}
