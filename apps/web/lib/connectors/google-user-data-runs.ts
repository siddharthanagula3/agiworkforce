import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  conversationHoldsGoogleUserData,
  GOOGLE_USER_DATA_CONNECTOR_IDS,
  isGoogleUserDataConnector,
  messagesCarryGoogleToolUse,
} from '@/lib/connectors/google-user-data';
import { logger } from '@/lib/logger';

type GoogleUserDataDb = Pick<DatabaseAdapter, 'query'>;

// Runs that call connector tools outside a chat conversation (published app
// runtime, Slack) have no conversation to mark, so the decision is made per
// run from what the run can reach: any Google connector offered to the run
// keeps the whole run on models whose provider does not train on inputs.

export const GOOGLE_USER_DATA_ARTIFACT_NO_MODEL_MESSAGE =
  'This app reads data from your Google account, and no model on your plan that keeps it out of training is available right now. Try again later.';

export const GOOGLE_USER_DATA_SLACK_RESUME_MESSAGE =
  'This answer used data from your Google account, and its model does not keep that data out of training, so it cannot continue. Ask again in Slack.';

export function connectorIdsReachGoogleUserData(connectorIds: readonly string[]): boolean {
  return connectorIds.some(isGoogleUserDataConnector);
}

export function toolsReachGoogleUserData(tools: readonly { serverId: string }[]): boolean {
  return tools.some((tool) => isGoogleUserDataConnector(tool.serverId));
}

/**
 * Drops every tool of a Google connector from a run plan, the reconnect tool
 * included, since a surface that never offers Google data has no reason to
 * prompt for a Google reconnect either.
 */
export function withoutGoogleUserDataTools<T extends { serverId: string }>(
  tools: readonly T[],
): T[] {
  return tools.filter((tool) => !isGoogleUserDataConnector(tool.serverId));
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
