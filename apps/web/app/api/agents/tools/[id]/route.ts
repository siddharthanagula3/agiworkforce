/**
 * GET /api/agents/tools/[id] — get tool details by ID.
 * Returns global tools or tools owned by the authenticated user.
 */

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';

type RouteContext = { params: Promise<{ id: string }> };

type ToolRow = {
  id: string;
  user_id: string | null;
  name: string;
  description: string;
  type: string;
  integration_type: string;
  invocation_pattern: string;
  parameters: Record<string, unknown>;
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

async function handleGetTool(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'me');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const { id } = await context.params;

  const db = getNeonDb();
  const [row] = await db.query<ToolRow>(
    `
      select id, user_id, name, description, type, integration_type,
             invocation_pattern, parameters, config, is_active, created_at, updated_at
      from agent_tools
      where id = $1 and (user_id = $2 or user_id is null)
      limit 1
    `,
    [id, userId],
  );

  if (!row) throw createError.notFound('Tool not found');

  return NextResponse.json({
    tool: {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description,
      type: row.type,
      integrationType: row.integration_type,
      invocationPattern: row.invocation_pattern,
      parameters: row.parameters,
      config: row.config,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
}

export const GET = withErrorHandler(handleGetTool);
