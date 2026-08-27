import 'server-only';

import { randomUUID } from 'node:crypto';

import type { McpCallToolResult, McpCreateTaskResult } from '@agiworkforce/mcp';

import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';

const APP_PAYLOAD_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const APP_PAYLOAD_MAX_BYTES = 2 * 1024 * 1024;
const PG_UNDEFINED_TABLE = '42P01';
const PG_UNDEFINED_COLUMN = '42703';

function schemaUnavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as Record<string, unknown>)['code'];
  return code === PG_UNDEFINED_TABLE || code === PG_UNDEFINED_COLUMN;
}

export interface McpAppPayload {
  id: string;
  connectorId: string;
  resourceUri: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResult: McpCallToolResult;
}

export async function saveMcpAppPayload(params: {
  userId: string;
  connectorId: string;
  resourceUri: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResult: McpCallToolResult;
}): Promise<string | null> {
  const inputJson = JSON.stringify(params.toolInput);
  const resultJson = JSON.stringify(params.toolResult);
  if (Buffer.byteLength(inputJson) + Buffer.byteLength(resultJson) > APP_PAYLOAD_MAX_BYTES) {
    logger.warn(
      { connectorId: params.connectorId, toolName: params.toolName },
      '[mcp-app] payload exceeded the persisted app limit',
    );
    return null;
  }
  const id = randomUUID();
  try {
    await getNeonDb().execute(
      `insert into public.mcp_app_payloads
         (id, user_id, connector_id, resource_uri, tool_name, tool_input, tool_result, expires_at)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb,
               now() + ($8 * interval '1 millisecond'))`,
      [
        id,
        params.userId,
        params.connectorId,
        params.resourceUri,
        params.toolName,
        inputJson,
        resultJson,
        APP_PAYLOAD_TTL_MS,
      ],
    );
    return id;
  } catch (error) {
    if (!schemaUnavailable(error)) {
      logger.warn({ error }, '[mcp-app] could not persist app payload');
    }
    return null;
  }
}

interface AppPayloadRow {
  id: string;
  connector_id: string;
  resource_uri: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_result: McpCallToolResult;
}

export async function loadMcpAppPayload(userId: string, id: string): Promise<McpAppPayload | null> {
  try {
    const [row] = await getNeonDb().query<AppPayloadRow>(
      `select id, connector_id, resource_uri, tool_name, tool_input, tool_result
         from public.mcp_app_payloads
        where id = $1 and user_id = $2 and expires_at > now()`,
      [id, userId],
    );
    return row
      ? {
          id: row.id,
          connectorId: row.connector_id,
          resourceUri: row.resource_uri,
          toolName: row.tool_name,
          toolInput: row.tool_input,
          toolResult: row.tool_result,
        }
      : null;
  } catch (error) {
    if (!schemaUnavailable(error)) logger.warn({ error }, '[mcp-app] payload read failed');
    return null;
  }
}

export async function bindMcpTask(params: {
  userId: string;
  connectorId: string;
  task: McpCreateTaskResult;
}): Promise<boolean> {
  const ttlMs = params.task.ttlMs;
  try {
    await getNeonDb().execute(
      `insert into public.mcp_task_bindings (user_id, connector_id, task_id, expires_at)
       values ($1, $2, $3,
               case when $4::bigint is null then null
                    else now() + ($4 * interval '1 millisecond') end)
       on conflict (user_id, connector_id, task_id) do update set
         expires_at = excluded.expires_at`,
      [params.userId, params.connectorId, params.task.taskId, ttlMs],
    );
    return true;
  } catch (error) {
    if (!schemaUnavailable(error)) logger.warn({ error }, '[mcp-tasks] task binding failed');
    return false;
  }
}

export async function isMcpTaskBound(
  userId: string,
  connectorId: string,
  taskId: string,
): Promise<boolean> {
  try {
    const [row] = await getNeonDb().query<{ exists: boolean }>(
      `select exists(
         select 1 from public.mcp_task_bindings
          where user_id = $1 and connector_id = $2 and task_id = $3
            and (expires_at is null or expires_at > now())
       ) as exists`,
      [userId, connectorId, taskId],
    );
    return row?.exists === true;
  } catch (error) {
    if (!schemaUnavailable(error)) logger.warn({ error }, '[mcp-tasks] task binding read failed');
    return false;
  }
}
