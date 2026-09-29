import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { GMAIL_CONNECTOR_ID } from '@/lib/connectors/gmail-actions';
import { GOOGLE_DRIVE_CONNECTOR_ID } from '@/lib/connectors/google-drive-files';
import { customServerId, orgSharedServerId } from '@/lib/connectors/custom-server-ids';
import { directoryServerId } from '@/lib/connectors/mcp-directory-targets';
import { logger } from '@/lib/logger';
import { CONNECTOR_RECONNECT_TOOL_NAME, parseQualifiedToolName } from '@/lib/mcp-tool-executor';

type GoogleUserDataDb = Pick<DatabaseAdapter, 'query'>;

// Google API Services User Data Policy, Limited Use: data these connectors read
// may only reach a model whose provider keeps inputs out of training. Every
// Google-owned connector belongs here; google-user-data.test.ts fails when the
// directory, catalog or OAuth registry gains one that is missing.
export const GOOGLE_USER_DATA_CONNECTOR_IDS: readonly string[] = [
  GMAIL_CONNECTOR_ID,
  'google-calendar',
  GOOGLE_DRIVE_CONNECTOR_ID,
  'google-contacts',
  'google-sheets',
  'google-analytics',
  'youtube',
  'bigquery',
  'gcp',
  'google-compute-engine',
];

const GOOGLE_USER_DATA_CONNECTOR_ID_SET: ReadonlySet<string> = new Set([
  ...GOOGLE_USER_DATA_CONNECTOR_IDS,
  ...GOOGLE_USER_DATA_CONNECTOR_IDS.map(directoryServerId),
]);

const GOOGLE_API_DOMAINS = ['googleapis.com', 'google.com', 'youtube.com'];

export function isGoogleApiUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return false;
  }
  return GOOGLE_API_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

// A generic `connector` trigger is an external webhook that records no
// connector id, so what it relays cannot be told apart from Google data.
export const GOOGLE_USER_DATA_TRIGGER_SOURCES: ReadonlySet<string> = new Set([
  'gmail',
  'google_calendar',
  'connector',
]);

export const GOOGLE_USER_DATA_MODEL_MAY_TRAIN_MESSAGE =
  "This chat includes data from your Google account, and that data only goes to models whose provider does not train on it. This model's provider may train on what you send. Choose another model.";

export const GOOGLE_USER_DATA_CONNECTED_MODEL_MAY_TRAIN_MESSAGE =
  "Your Google connectors are on for this chat, and data from them only goes to models whose provider does not train on it. This model's provider may train on what you send. Choose another model, or turn off your Google connectors for this chat.";

export const GOOGLE_USER_DATA_NO_MODEL_MESSAGE =
  'This chat includes data from your Google account, and no model on your plan that keeps it out of training is available right now. Try again later.';

export const GOOGLE_USER_DATA_MEMORY_REFUSAL =
  'Not saved. This chat includes data from your Google account, and Memory does not keep facts drawn from Google data.';

export const GOOGLE_USER_DATA_FILE_HELD_MESSAGE =
  'This file holds data from your Google account, and this turn may reach a model whose provider trains on what it is sent, so it was not opened. The chat now keeps to models that do not train on Google data; ask again to read it.';

export const GOOGLE_USER_DATA_VOICE_MESSAGE =
  'This chat includes data from your Google account, and live voice runs on a provider that may train on what it is sent, so voice is not available in this chat. Start voice in another chat.';

export const GOOGLE_USER_DATA_UNROUTED_MESSAGE =
  'This Google connector did not run because this run is not limited to models that keep Google data out of training.';

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

export async function googleHostedCustomServerIds(
  db: GoogleUserDataDb,
  userId: string,
  organizationId: string | null,
): Promise<string[] | null> {
  try {
    const [own, published] = await Promise.all([
      db.query<{ short_id: string; url: string }>(
        `select short_id, url from public.user_custom_connectors where user_id = $1`,
        [userId],
      ),
      organizationId
        ? db.query<{ short_id: string; url: string }>(
            `select short_id, url
               from public.organization_mcp_servers
              where organization_id = $1::uuid
                and published
                and retired_at is null`,
            [organizationId],
          )
        : Promise.resolve([]),
    ]);
    return [
      ...own.filter((row) => isGoogleApiUrl(row.url)).map((row) => customServerId(row.short_id)),
      ...published
        .filter((row) => isGoogleApiUrl(row.url))
        .map((row) => orgSharedServerId(row.short_id)),
    ];
  } catch (error) {
    logger.warn(
      { error, userId },
      'Custom connector hosts unreadable; treating a Google-hosted one as available',
    );
    return null;
  }
}

export interface GoogleUserDataTurnInput {
  conversationId: string | null | undefined;
  organizationId?: string | null;
  messages: readonly unknown[];
  connectorToolsEnabled: boolean;
  disabledConnectorIds: readonly string[] | undefined;
  researchConnectorIds: readonly string[] | undefined;
  contextConnectorIds?: readonly string[] | undefined;
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
  const named = [...(input.researchConnectorIds ?? []), ...(input.contextConnectorIds ?? [])];
  if (named.some(isGoogleUserDataConnector)) return 'connectors';
  if (!input.connectorToolsEnabled && named.length === 0) return null;
  const hosted = await googleHostedCustomServerIds(db, userId, input.organizationId ?? null);
  if (hosted === null || named.some((id) => hosted.includes(id))) return 'connectors';
  if (!input.connectorToolsEnabled) return null;
  const disabled = new Set(input.disabledConnectorIds ?? []);
  const connected = [...(await connectedGoogleUserDataConnectorIds(db, userId)), ...hosted];
  return connected.some((connectorId) => !disabled.has(connectorId)) ? 'connectors' : null;
}

/**
 * SQL that is true when a memory row may reach a chat that is not kept to
 * no-training providers: it was not learned in a conversation holding Google
 * user data. A memory with no recorded source cannot be traced, so it is
 * eligible only while its owner has no such conversation at all.
 * `sourceConversationId` is a text expression for the row's source
 * conversation and `ownerUserId` one for its owner.
 */
export function memoryFreeOfGoogleUserDataSql(
  sourceConversationId: string,
  ownerUserId: string,
): string {
  return `case when ${sourceConversationId} is null then not exists (
    select 1
      from public.web_conversations google_any
     where google_any.user_id = ${ownerUserId}
       and google_any.google_user_data_at is not null
  ) else not exists (
    select 1
      from public.web_conversations google_source
     where google_source.id::text = ${sourceConversationId}
       and google_source.google_user_data_at is not null
  ) end`;
}

/**
 * Whether a finished turn carried Google user data, for deciding if what it
 * taught may be kept in Memory. Unreadable state counts as carrying it.
 */
export async function turnHoldsGoogleUserData(
  db: GoogleUserDataDb,
  userId: string,
  turn: {
    conversationId: string | null | undefined;
    messages: readonly unknown[];
    googleToolRan: boolean;
  },
): Promise<boolean> {
  if (turn.googleToolRan || messagesCarryGoogleToolUse(turn.messages)) return true;
  return turn.conversationId
    ? conversationHoldsGoogleUserData(db, userId, turn.conversationId)
    : false;
}

export function mcpContextConnectorIds(selection: {
  prompt?: { connectorId: string } | undefined;
  resources?: ReadonlyArray<{ connectorId: string }> | undefined;
}): string[] {
  return [
    ...(selection.prompt ? [selection.prompt.connectorId] : []),
    ...(selection.resources ?? []).map((resource) => resource.connectorId),
  ];
}

export async function connectorIdsReadGoogleUserData(
  db: GoogleUserDataDb,
  userId: string,
  organizationId: string | null,
  connectorIds: readonly string[],
): Promise<boolean> {
  if (connectorIds.length === 0) return false;
  if (connectorIds.some(isGoogleUserDataConnector)) return true;
  const hosted = await googleHostedCustomServerIds(db, userId, organizationId);
  return hosted === null || connectorIds.some((id) => hosted.includes(id));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function serverIdOfToolName(name: unknown): string[] {
  if (typeof name !== 'string') return [];
  const parsed = parseQualifiedToolName(name);
  return parsed ? [parsed.serverId] : [];
}

/**
 * The connector servers a stored message says it called, read with the same
 * evidence rules as the 0344 backfill: `metadata.tools` entries by connector id
 * or tool name, `toolInvocations.offered` when a tool was observed to run, and
 * any `tool_calls` the message carries.
 */
export function storedMessageToolServerIds(metadata: unknown): string[] {
  const record = asRecord(metadata);
  if (!record) return [];
  const ids: string[] = [];
  for (const entry of Array.isArray(record['tools']) ? record['tools'] : []) {
    const tool = asRecord(entry);
    if (!tool) continue;
    if (typeof tool['connectorId'] === 'string') ids.push(tool['connectorId']);
    ids.push(...serverIdOfToolName(tool['name']));
  }
  const invocations = asRecord(record['toolInvocations']);
  if (invocations?.['observed'] === true && Array.isArray(invocations['offered'])) {
    for (const name of invocations['offered']) ids.push(...serverIdOfToolName(name));
  }
  for (const key of ['tool_calls', 'toolCalls']) {
    for (const entry of Array.isArray(record[key]) ? record[key] : []) {
      const call = asRecord(entry);
      ids.push(...serverIdOfToolName(asRecord(call?.['function'])?.['name'] ?? call?.['name']));
    }
  }
  return ids;
}

/**
 * Marks every conversation a synced or imported batch shows a Google connector
 * ran in. A custom or workspace server counts when its host is Google's, and
 * when the hosts cannot be read.
 */
export async function markSyncedConversationsGoogleUserData(
  db: GoogleUserDataDb,
  userId: string,
  organizationId: string | null,
  messages: ReadonlyArray<{ conversationId: string; metadata?: unknown }>,
): Promise<void> {
  const byConversation = new Map<string, string[]>();
  for (const message of messages) {
    const ids = storedMessageToolServerIds(message.metadata);
    if (ids.length > 0) {
      byConversation.set(message.conversationId, [
        ...(byConversation.get(message.conversationId) ?? []),
        ...ids,
      ]);
    }
  }
  let hosted: Promise<string[] | null> | null = null;
  const marked: string[] = [];
  for (const [conversationId, ids] of byConversation) {
    if (ids.some(isGoogleUserDataConnector)) {
      marked.push(conversationId);
      continue;
    }
    hosted ??= googleHostedCustomServerIds(db, userId, organizationId);
    const hostedIds = await hosted;
    if (hostedIds === null || ids.some((id) => hostedIds.includes(id))) {
      marked.push(conversationId);
    }
  }
  if (marked.length === 0) return;
  await db.query(
    `update public.web_conversations
        set google_user_data_at = now()
      where id = any($1::uuid[])
        and user_id = $2
        and google_user_data_at is null`,
    [marked, userId],
  );
}

export function googleUserDataConnectorRefs(): string[] {
  return [...GOOGLE_USER_DATA_CONNECTOR_ID_SET];
}

/**
 * SQL that is true when an indexed retrieval document holds Google user data:
 * it came from a conversation, artifact, report or library file whose chat is
 * marked, or it is a project file imported from a Google connector. Each alias
 * names the joined row; `connectorRefsParam` binds googleUserDataConnectorRefs().
 */
export function retrievalDocumentGoogleUserDataSql(aliases: {
  document: string;
  artifact: string;
  report: string;
  asset: string;
  connectorRefsParam: number;
}): string {
  const { document, artifact, report, asset, connectorRefsParam } = aliases;
  return `(exists (
      select 1
        from public.web_conversations google_origin
       where google_origin.id in (
               ${document}.conversation_id,
               ${artifact}.conversation_id,
               ${report}.conversation_id,
               ${asset}.conversation_id
             )
         and google_origin.google_user_data_at is not null
    ) or exists (
      select 1
        from public.project_knowledge_files google_file
        join public.external_resource_references google_ref
          on google_ref.id = google_file.external_reference_id
       where google_file.id = ${document}.project_knowledge_file_id
         and google_ref.connector_id = any($${connectorRefsParam}::text[])
    ))`;
}

/**
 * Whether a stored conversation carries Google user data: it is marked, or a
 * stored message shows a Google connector ran (the same evidence the sync path
 * reads). Evidence found in an unmarked conversation marks it. Unreadable state
 * counts as carrying it.
 */
export async function storedConversationCarriesGoogleUserData(
  db: GoogleUserDataDb,
  userId: string,
  organizationId: string | null,
  conversationId: string,
): Promise<boolean> {
  if (await conversationHoldsGoogleUserData(db, userId, conversationId)) return true;
  try {
    const rows = await db.query<{ metadata: unknown }>(
      `select m.metadata
         from public.web_messages m
         join public.web_conversations c on c.id = m.conversation_id
        where m.conversation_id = $1::uuid
          and c.user_id = $2
          and m.deleted_at is null
          and (m.metadata ? 'tools' or m.metadata ? 'toolInvocations'
               or m.metadata ? 'tool_calls' or m.metadata ? 'toolCalls')`,
      [conversationId, userId],
    );
    const ids = rows.flatMap((row) => storedMessageToolServerIds(row.metadata));
    if (ids.length === 0) return false;
    if (!(await connectorIdsReadGoogleUserData(db, userId, organizationId, ids))) return false;
    await markConversationGoogleUserData(db, userId, conversationId);
    return true;
  } catch (error) {
    logger.warn(
      { error, userId, conversationId },
      'Stored conversation tool evidence unreadable; treating it as holding Google data',
    );
    return true;
  }
}
