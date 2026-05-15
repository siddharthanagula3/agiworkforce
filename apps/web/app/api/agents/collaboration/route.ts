import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { logger } from '@/lib/logger';
import { randomUUID } from 'crypto';
import { getAuthenticatedUser } from '@/lib/api-auth';

/**
 * Agent Collaboration API
 * Endpoint: POST /api/agents/collaboration
 *
 * Accepts multi-agent collaboration requests and returns a collaboration session
 * with a coordinator managing multiple agent participants.
 */

const CollaborationRequestSchema = z.object({
  task: z.string().min(1).max(10_000),
  sessionId: z.string().optional(),
  agents: z.array(z.string()).min(1).max(10),
});

export type CollaborationStatus = 'pending' | 'active' | 'completed' | 'failed';

export interface CollaborationResponse {
  collaborationId: string;
  agents: string[];
  status: CollaborationStatus;
  sessionId: string;
  createdAt: string;
}

async function handleCollaboration(request: NextRequest): Promise<NextResponse> {
  // CORS preflight
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) return preflightResponse;

  // CSRF protection for state-changing POST endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  // Authenticate user - never trust userId from request body.
  // getAuthenticatedUser handles Bearer + cookie flows and uses the service-role
  // client only for JWT verification (never for DB ops).
  const user = await getAuthenticatedUser(request);
  const userId = user.id;

  // Rate limiting - collaboration uses the same budget as LLM completion
  const rateLimitResponse = await withRateLimit(request, 'llm-completion');
  if (rateLimitResponse) return rateLimitResponse;

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON in request body' },
      {
        status: 400,
        headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
      },
    );
  }

  const validationResult = CollaborationRequestSchema.safeParse(body);
  if (!validationResult.success) {
    return NextResponse.json(
      {
        error: 'Invalid request body',
        details: validationResult.error.issues,
      },
      {
        status: 400,
        headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
      },
    );
  }

  const { task, sessionId, agents } = validationResult.data;

  // Generate a collaboration ID for this session
  const collaborationId = randomUUID();
  const resolvedSessionId = sessionId ?? randomUUID();

  logger.info(
    {
      collaborationId,
      userId,
      agentCount: agents.length,
      sessionId: resolvedSessionId,
      taskLength: task.length,
    },
    'Agent collaboration session created',
  );

  const response: CollaborationResponse = {
    collaborationId,
    agents,
    status: 'active',
    sessionId: resolvedSessionId,
    createdAt: new Date().toISOString(),
  };

  return NextResponse.json(response, {
    status: 200,
    headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
  });
}

export const POST = withErrorHandler(handleCollaboration);

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
