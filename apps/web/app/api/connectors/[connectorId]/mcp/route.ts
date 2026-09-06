import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { loadConnectorToolPermissions } from '@/app/api/llm/v1/chat/completions/lib/connector-tool-permissions';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { withUserConnectorMcpHandle } from '@/lib/user-connector-tools';
import { bindMcpTask, isMcpTaskBound } from '@/lib/connectors/mcp-state-store';

export const runtime = 'nodejs';

const ConnectorRefSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/);
const OperationSchema = z.discriminatedUnion('operation', [
  z
    .object({
      operation: z.literal('callTool'),
      name: z.string().min(1).max(128),
      arguments: z.record(z.string(), z.unknown()).default({}),
      approved: z.boolean().optional().default(false),
      inputResponses: z.record(z.string(), z.unknown()).optional(),
      requestState: z.string().max(16_384).optional(),
    })
    .strict(),
  z.object({ operation: z.literal('readResource'), uri: z.string().min(1).max(4_096) }).strict(),
  z
    .object({
      operation: z.literal('getPrompt'),
      name: z.string().min(1).max(128),
      arguments: z.record(z.string(), z.string().max(8_192)).optional(),
      inputResponses: z.record(z.string(), z.unknown()).optional(),
      requestState: z.string().max(16_384).optional(),
    })
    .strict(),
  z.object({ operation: z.literal('taskGet'), taskId: z.string().min(1).max(512) }).strict(),
  z
    .object({
      operation: z.literal('taskUpdate'),
      taskId: z.string().min(1).max(512),
      inputResponses: z.record(z.string(), z.unknown()),
    })
    .strict(),
  z.object({ operation: z.literal('taskCancel'), taskId: z.string().min(1).max(512) }).strict(),
]);

async function handlePost(
  request: NextRequest,
  context: { params: Promise<{ connectorId: string }> },
): Promise<NextResponse> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;
  const limited = await withRateLimit(request, 'chat-conversation');
  if (limited) return limited;

  const connectorRef = ConnectorRefSchema.parse((await context.params).connectorId);
  const body = OperationSchema.parse(await request.json().catch(() => null));
  if (JSON.stringify(body).length > 128_000) {
    throw createError.validation('MCP operation payload is too large');
  }

  const { db, userId } = await getUserScopedDb(request);
  const permissions = await loadConnectorToolPermissions(db, userId);
  const output = await withUserConnectorMcpHandle(userId, connectorRef, async (connection) => {
    const { handle } = connection;
    switch (body.operation) {
      case 'callTool': {
        const level = permissions.levelForConnectorTool(connection.connectorId, body.name);
        if (level === 'deny') throw createError.forbidden('This connector tool is denied');
        if (level !== 'allow' && !body.approved) {
          return { approvalRequired: true as const, connectorId: connection.connectorId };
        }
        const result = await handle.callTool(body.name, body.arguments, {
          allowInputRequired: true,
          ...(body.inputResponses ? { inputResponses: body.inputResponses } : {}),
          ...(body.requestState ? { requestState: body.requestState } : {}),
        });
        if (
          result.task &&
          !(await bindMcpTask({
            userId,
            connectorId: connection.connectorId,
            task: result.task,
          }))
        ) {
          throw createError.serviceUnavailable('MCP Tasks storage is not available');
        }
        return { approvalRequired: false as const, connectorId: connection.connectorId, result };
      }
      case 'readResource':
        return { connectorId: connection.connectorId, result: await handle.readResource(body.uri) };
      case 'getPrompt':
        return {
          connectorId: connection.connectorId,
          result: await handle.getPrompt(body.name, body.arguments, {
            allowInputRequired: true,
            ...(body.inputResponses ? { inputResponses: body.inputResponses } : {}),
            ...(body.requestState ? { requestState: body.requestState } : {}),
          }),
        };
      case 'taskGet':
        if (!handle.tasks) throw createError.validation('This server does not support MCP Tasks');
        if (!(await isMcpTaskBound(userId, connection.connectorId, body.taskId))) {
          throw createError.notFound('MCP task not found');
        }
        return { connectorId: connection.connectorId, result: await handle.tasks.get(body.taskId) };
      case 'taskUpdate':
        if (!handle.tasks) throw createError.validation('This server does not support MCP Tasks');
        if (!(await isMcpTaskBound(userId, connection.connectorId, body.taskId))) {
          throw createError.notFound('MCP task not found');
        }
        return {
          connectorId: connection.connectorId,
          result: await handle.tasks.update(body.taskId, body.inputResponses),
        };
      case 'taskCancel':
        if (!handle.tasks) throw createError.validation('This server does not support MCP Tasks');
        if (!(await isMcpTaskBound(userId, connection.connectorId, body.taskId))) {
          throw createError.notFound('MCP task not found');
        }
        return {
          connectorId: connection.connectorId,
          result: await handle.tasks.cancel(body.taskId),
        };
    }
  });
  if (!output) throw createError.notFound('Connected MCP connector not found');
  return NextResponse.json(output, { headers: { 'Cache-Control': 'private, no-store' } });
}

export const POST = withCorsRoute(withErrorHandler(handlePost));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
