/**
 * Agent Tools Registry API.
 *
 * GET  /api/agents/tools               — list tools (scoped to user + global)
 * GET  /api/agents/tools?type=X        — filter by tool type
 * GET  /api/agents/tools?integrationType=X — filter by integration type
 * POST /api/agents/tools               — register a new tool (user-scoped)
 *
 * Tools are persisted in agent_tools (migration 0024). Global tools have
 * user_id = null and are visible to all authenticated users.
 */

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';

const TOOL_TYPES = ['analysis', 'generation', 'automation', 'search', 'communication'] as const;

const INTEGRATION_TYPES = [
  'n8n_workflow',
  'openai_api',
  'anthropic_api',
  'cursor_agent',
  'replit_agent',
  'claude_code',
  'custom_api',
  'webhook',
  'database',
  'file_system',
] as const;

const RegisterToolSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(''),
  type: z.string().min(1).max(100),
  integrationType: z.string().min(1).max(100),
  invocationPattern: z.string().max(1000).optional().default(''),
  parameters: z.record(z.string(), z.unknown()).optional().default({}),
  config: z.record(z.string(), z.unknown()).optional().default({}),
  isActive: z.boolean().optional().default(true),
});

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

function mapTool(row: ToolRow) {
  return {
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
  };
}

async function handleGetTools(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'me');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);

  const url = new URL(request.url);
  const typeFilter = url.searchParams.get('type');
  const integrationFilter = url.searchParams.get('integrationType');

  const db = getNeonDb();

  try {
    // Return tools that are either global (user_id IS NULL) or owned by this user
    const rows = await db.query<ToolRow>(
      `
        select id, user_id, name, description, type, integration_type,
               invocation_pattern, parameters, config, is_active, created_at, updated_at
        from agent_tools
        where (user_id = $1 or user_id is null)
          and ($2::text is null or type = $2)
          and ($3::text is null or integration_type = $3)
        order by created_at desc
      `,
      [userId, typeFilter ?? null, integrationFilter ?? null],
    );

    return NextResponse.json({ tools: rows.map(mapTool) });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to list tools');
    throw createError.internal('Failed to list tools');
  }
}

async function handleRegisterTool(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'me');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }

  const parsed = RegisterToolSchema.safeParse(rawBody);
  if (!parsed.success) throw createError.validation('Invalid request body', parsed.error);

  const {
    name,
    description,
    type,
    integrationType,
    invocationPattern,
    parameters,
    config,
    isActive,
  } = parsed.data;

  // Strip potentially sensitive keys from config before persisting
  const safeConfig = { ...config };
  for (const key of Object.keys(safeConfig)) {
    if (/apiKey|api_key|secret|password|token/i.test(key)) {
      delete safeConfig[key];
    }
  }

  void TOOL_TYPES;
  void INTEGRATION_TYPES;

  const db = getNeonDb();

  try {
    const [row] = await db.query<ToolRow>(
      `
        insert into agent_tools
          (user_id, name, description, type, integration_type,
           invocation_pattern, parameters, config, is_active)
        values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
        returning id, user_id, name, description, type, integration_type,
                  invocation_pattern, parameters, config, is_active, created_at, updated_at
      `,
      [
        userId,
        name,
        description,
        type,
        integrationType,
        invocationPattern,
        JSON.stringify(parameters),
        JSON.stringify(safeConfig),
        isActive,
      ],
    );

    return NextResponse.json({ tool: mapTool(row!) }, { status: 201 });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to register tool');
    throw createError.internal('Failed to register tool');
  }
}

export const GET = withErrorHandler(handleGetTools);
export const POST = withErrorHandler(handleRegisterTool);
