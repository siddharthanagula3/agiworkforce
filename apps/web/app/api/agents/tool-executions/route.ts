/**
 * POST /api/agents/tool-executions — execute a registered tool.
 *
 * Looks up the tool in agent_tools, validates the user owns it (or it is global),
 * logs the execution attempt in agent_tool_executions, then delegates to the
 * appropriate integration handler. Sensitive integration calls (LLM providers)
 * are proxied through existing internal routes rather than calling third-party
 * APIs directly from this route.
 *
 * Request body: { toolId, parameters, context? }
 * Response:     { execution: AgentToolExecutionRow, result? }
 */

import 'server-only';
import { assertNonInternalHostname } from '@/lib/egress-policy';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';

const ExecuteToolSchema = z.object({
  toolId: z.string().uuid(),
  parameters: z.record(z.string(), z.unknown()).optional().default({}),
  context: z.record(z.string(), z.unknown()).optional(),
});

type ToolRow = {
  id: string;
  user_id: string | null;
  name: string;
  type: string;
  integration_type: string;
  parameters: Record<string, unknown>;
  config: Record<string, unknown>;
  is_active: boolean;
};

type ExecutionRow = {
  id: string;
  tool_id: string;
  user_id: string;
  parameters: Record<string, unknown>;
  result: Record<string, unknown> | null;
  success: boolean;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
};

async function handleExecuteTool(request: NextRequest) {
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

  const parsed = ExecuteToolSchema.safeParse(rawBody);
  if (!parsed.success) throw createError.validation('Invalid request body', parsed.error);

  const { toolId, parameters, context } = parsed.data;

  const db = getNeonDb();

  // Fetch tool (must be owned by user or global)
  const [tool] = await db.query<ToolRow>(
    `
      select id, user_id, name, type, integration_type, parameters, config, is_active
      from agent_tools
      where id = $1 and (user_id = $2 or user_id is null)
      limit 1
    `,
    [toolId, userId],
  );

  if (!tool) throw createError.notFound('Tool not found');
  if (!tool.is_active) throw createError.badRequest('Tool is not active');

  const startMs = Date.now();
  let success = false;
  let errorMessage: string | null = null;
  let result: Record<string, unknown> | null = null;

  try {
    // Delegate to integration-specific handler.
    // Complex integrations (LLM calls, webhooks) are stubbed here to avoid
    // re-implementing the full handler logic server-side. The full execution
    // is handled by the client-side ToolInvocationService for now.
    switch (tool.integration_type) {
      case 'webhook': {
        const config = tool.config as Record<string, string>;
        const webhookUrl = config['webhookUrl'];
        if (!webhookUrl) throw new Error('webhookUrl not configured');
        // SSRF guard: a user-registered webhookUrl must never be fetched if it
        // points at an internal/link-local/private host (e.g. the cloud metadata
        // endpoint 169.254.169.254) or uses a non-http(s) scheme. Reject BEFORE
        // any server-side request is made.
        let parsedWebhook: URL;
        try {
          parsedWebhook = new URL(webhookUrl);
        } catch {
          throw new Error('webhookUrl is not a valid URL');
        }
        if (parsedWebhook.protocol !== 'http:' && parsedWebhook.protocol !== 'https:') {
          throw new Error('webhookUrl must use http or https');
        }
        assertNonInternalHostname(webhookUrl);
        const resp = await fetch(webhookUrl, {
          method: config['method'] ?? 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parameters, context: context ?? {} }),
          // SSRF redirect bypass: the pre-fetch guard only validates the initial
          // URL. A 3xx Location could point at an internal host (e.g. IMDS), so
          // do not auto-follow — surface the redirect as a failed webhook.
          redirect: 'manual',
        });
        if (resp.status >= 300 && resp.status < 400) {
          throw new Error('Webhook redirects are not allowed');
        }
        if (!resp.ok) throw new Error(`Webhook returned ${resp.status}`);
        result = (await resp.json()) as Record<string, unknown>;
        success = true;
        break;
      }
      default:
        // For LLM integrations and other types, return a pending result.
        // The client should call the appropriate proxy route for LLM calls.
        result = {
          status: 'delegated',
          message: `Integration type "${tool.integration_type}" must be executed client-side via the appropriate proxy route.`,
          toolId,
          toolName: tool.name,
        };
        success = true;
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    success = false;
    logger.error({ err, toolId, userId }, 'Tool execution failed');
  }

  const durationMs = Date.now() - startMs;

  // Log execution to DB
  const [execution] = await db.query<ExecutionRow>(
    `
      insert into agent_tool_executions
        (tool_id, user_id, parameters, result, success, error_message, duration_ms)
      values ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7)
      returning id, tool_id, user_id, parameters, result, success, error_message, duration_ms, created_at
    `,
    [
      toolId,
      userId,
      JSON.stringify(parameters),
      result ? JSON.stringify(result) : null,
      success,
      errorMessage,
      durationMs,
    ],
  );

  if (!success) {
    return NextResponse.json({ execution, error: errorMessage }, { status: 422 });
  }

  return NextResponse.json({ execution, result });
}

export const POST = withErrorHandler(handleExecuteTool);
