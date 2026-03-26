import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { logger } from '@/lib/logger';
import { randomUUID } from 'crypto';

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

  // Authenticate user — never trust userId from request body
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  const authHeader = request.headers.get('authorization');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let userId: string;

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user) {
      throw createError.unauthorized('Invalid or expired token');
    }
    userId = user.id;
  } else {
    const { createServerClient } = await import('@supabase/ssr');
    const ssrClient = createServerClient(supabaseUrl, requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          // Read-only for this route
        },
      },
    });
    const {
      data: { user },
      error,
    } = await ssrClient.auth.getUser();
    if (error || !user) {
      throw createError.unauthorized('Authentication required');
    }
    userId = user.id;
  }

  // Rate limiting — collaboration uses the same budget as LLM completion
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
