import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { GMAIL_CONNECTOR_ID } from '@/lib/connectors/gmail-actions';
import { GOOGLE_DRIVE_CONNECTOR_ID } from '@/lib/connectors/google-drive-files';
import { logger } from '@/lib/logger';
import { CONNECTOR_RECONNECT_TOOL_NAME, parseQualifiedToolName } from '@/lib/mcp-tool-executor';

type GoogleUserDataDb = Pick<DatabaseAdapter, 'query'>;

// Google API Services User Data Policy, Limited Use: data these connectors read
// may only reach a model whose provider keeps inputs out of training.
export const GOOGLE_USER_DATA_CONNECTOR_IDS: readonly string[] = [
  GMAIL_CONNECTOR_ID,
  'google-calendar',
  GOOGLE_DRIVE_CONNECTOR_ID,
  'google-contacts',
];

const GOOGLE_USER_DATA_CONNECTOR_ID_SET: ReadonlySet<string> = new Set(
  GOOGLE_USER_DATA_CONNECTOR_IDS,
);

export const GOOGLE_USER_DATA_TRIGGER_SOURCES: ReadonlySet<string> = new Set([
  'gmail',
  'google_calendar',
]);

export const GOOGLE_USER_DATA_MODEL_MAY_TRAIN_MESSAGE =
  "This chat includes data from your Google account, and that data only goes to models whose provider does not train on it. This model's provider may train on what you send. Choose another model.";

export const GOOGLE_USER_DATA_CONNECTED_MODEL_MAY_TRAIN_MESSAGE =
  "Your Google connectors are on for this chat, and data from them only goes to models whose provider does not train on it. This model's provider may train on what you send. Choose another model, or turn off your Google connectors for this chat.";

export const GOOGLE_USER_DATA_NO_MODEL_MESSAGE =
  'This chat includes data from your Google account, and no model on your plan that keeps it out of training is available right now. Try again later.';

export const GOOGLE_USER_DATA_TOOL_UNRECORDED_MESSAGE =
  'This Google connector did not run because the chat could not be marked as holding Google data. Try again.';

export function isGoogleUserDataConnector(connectorId: string): boolean {
  return GOOGLE_USER_DATA_CONNECTOR_ID_SET.has(connectorId);
}

export function readsGoogleUserData(serverId: string, toolName: string): boolean {
  return isGoogleUserDataConnector(serverId) && toolName !== CONNECTOR_RECONNECT_TOOL_NAME;
}

export function isGoogleUserDataToolName(qualifiedName: string): boolean {
  const parsed = parseQualifiedToolName(qualifiedName);
  return parsed !== null && readsGoogleUserData(parsed.serverId, parsed.toolName);
}

function toolCallNames(message: unknown): string[] {
  if (!message || typeof message !== 'object') return [];
  const toolCalls = (message as { tool_calls?: unknown }).tool_calls;
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls.flatMap((call: unknown) => {
    const name = (call as { function?: { name?: unknown } } | null)?.function?.name;
    return typeof name === 'string' ? [name] : [];
  });
}

export function messagesCarryGoogleToolUse(messages: readonly unknown[]): boolean {
  return messages.some((message) => toolCallNames(message).some(isGoogleUserDataToolName));
}

export async function connectedGoogleUserDataConnectorIds(
  db: GoogleUserDataDb,
  userId: string,
): Promise<string[]> {
  try {
    const rows = await db.query<{ connector_id: string }>(
      `select connector_id
         from public.connector_oauth_grants
        where user_id = $1
          and revoked_at is null
          and connector_id = any($2::text[])
       union
       select connector_id
         from public.user_connectors
        where user_id = $1
          and is_active = true
          and connector_id = any($2::text[])`,
      [userId, GOOGLE_USER_DATA_CONNECTOR_IDS],
    );
    return [...new Set(rows.map((row) => row.connector_id).filter(isGoogleUserDataConnector))];
  } catch (error) {
    logger.warn(
      { error, userId },
      'Google connector state unreadable; treating every Google connector as connected',
    );
    return [...GOOGLE_USER_DATA_CONNECTOR_IDS];
  }
}

export async function userHoldsGoogleUserDataConversation(
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
      'Google data markers unreadable; treating past chats as holding Google data',
    );
    return true;
  }
}

export async function projectHoldsGoogleUserData(
  db: GoogleUserDataDb,
  projectId: string,
): Promise<boolean> {
  try {
    const [row] = await db.query<{ holds: boolean }>(
      `select exists (
         select 1
           from public.project_knowledge_files f
           join public.external_resource_references r
             on r.id = f.external_reference_id
          where f.project_id::text = $1
            and r.connector_id = any($2::text[])
       ) as holds`,
      [projectId, GOOGLE_USER_DATA_CONNECTOR_IDS],
    );
    return row?.holds === true;
  } catch (error) {
    logger.warn(
      { error, projectId },
      'Project Google sources unreadable; treating the project as holding Google data',
    );
    return true;
  }
}

export async function markConversationGoogleUserData(
  db: GoogleUserDataDb,
  userId: string,
  conversationId: string,
): Promise<void> {
  await db.query(
    `update public.web_conversations
        set google_user_data_at = now()
      where id = $1::uuid
        and user_id = $2
        and google_user_data_at is null`,
    [conversationId, userId],
  );
}

/**
 * Sticky per conversation: once a Google connector ran in it, or its project
 * holds a source imported from one, every later turn is routed the same way.
 * A project source marks the conversation so removing the source later does not
 * release the text an earlier turn already carried. Unreadable state is
 * treated as tainted.
 */
export async function conversationHoldsGoogleUserData(
  db: GoogleUserDataDb,
  userId: string,
  conversationId: string,
): Promise<boolean> {
  try {
    const [row] = await db.query<{ marked: boolean; project_id: string | null }>(
      `select google_user_data_at is not null as marked, project_id
         from public.web_conversations
        where id = $1::uuid
          and user_id = $2
        limit 1`,
      [conversationId, userId],
    );
    if (!row) return false;
    if (row.marked) return true;
    if (!row.project_id || !(await projectHoldsGoogleUserData(db, row.project_id))) return false;
    await markConversationGoogleUserData(db, userId, conversationId);
    return true;
  } catch (error) {
    logger.warn(
      { error, userId, conversationId },
      'Conversation Google data marker unreadable; routing only to models that keep inputs out of training',
    );
    return true;
  }
}

export interface GoogleUserDataTurnInput {
  conversationId: string | null | undefined;
  messages: readonly unknown[];
  connectorToolsEnabled: boolean;
  disabledConnectorIds: readonly string[] | undefined;
  researchConnectorIds: readonly string[] | undefined;
}

export type GoogleUserDataTurnReason = 'conversation' | 'connectors' | null;

/**
 * Why this turn must stay on models that keep inputs out of training because
 * of Google user data, or null when it carries none. `conversation` means Google
 * data already entered the chat; `connectors` means a Google connector can be
 * called in this turn, whose result reaches the model inside the same request.
 */
export async function resolveGoogleUserDataTurn(
  db: GoogleUserDataDb,
  userId: string,
  input: GoogleUserDataTurnInput,
): Promise<GoogleUserDataTurnReason> {
  if (messagesCarryGoogleToolUse(input.messages)) return 'conversation';
  if (
    input.conversationId &&
    (await conversationHoldsGoogleUserData(db, userId, input.conversationId))
  ) {
    return 'conversation';
  }
  if (input.researchConnectorIds?.some(isGoogleUserDataConnector)) return 'connectors';
  if (!input.connectorToolsEnabled) return null;
  const disabled = new Set(input.disabledConnectorIds ?? []);
  const connected = await connectedGoogleUserDataConnectorIds(db, userId);
  return connected.some((connectorId) => !disabled.has(connectorId)) ? 'connectors' : null;
}
