import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  CONNECTOR_MCP_OPERATION_MAX_BYTES,
  ConnectorMcpOperationRequestSchema,
  ConnectorRefSchema,
  type ConnectorMcpOperationResponse,
} from '@agiworkforce/cloud-contracts';

import { loadConnectorToolPermissions } from '@/app/api/llm/v1/chat/completions/lib/connector-tool-permissions';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { recordAuditEvent } from '@/lib/security-audit';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { withUserConnectorMcpHandle } from '@/lib/user-connector-tools';
import { bindMcpTask, isMcpTaskBound } from '@/lib/connectors/mcp-state-store';

export const runtime = 'nodejs';

async function handlePost(
  request: NextRequest,
  context: { params: Promise<{ connectorId: string }> },
): Promise<NextResponse> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;
  const limited = await withRateLimit(request, 'chat-conversation');
  if (limited) return limited;

  const connectorRef = ConnectorRefSchema.parse((await context.params).connectorId);
  const body = ConnectorMcpOperationRequestSchema.parse(await request.json().catch(() => null));
  if (JSON.stringify(body).length > CONNECTOR_MCP_OPERATION_MAX_BYTES) {
    throw createError.validation('MCP operation payload is too large');
  }

  const { db, userId, organizationId } = await getUserScopedDb(request);
  const permissions = await loadConnectorToolPermissions(db, userId, organizationId ?? null);
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
  const readOperation = ['readResource', 'getPrompt', 'taskGet'].includes(body.operation);
  const approvalOnly = body.operation === 'callTool' && output.approvalRequired === true;
  if (!approvalOnly) {
    await recordAuditEvent({
      userId,
      organizationId,
      request,
      eventType: readOperation ? 'data_accessed' : 'tool_executed',
      detail: {
        resourceType: 'connector',
        resourceId: output.connectorId,
        connectorId: output.connectorId,
        status: body.operation,
      },
    });
  }
  return NextResponse.json(output satisfies ConnectorMcpOperationResponse, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export const POST = withCorsRoute(withErrorHandler(handlePost));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
