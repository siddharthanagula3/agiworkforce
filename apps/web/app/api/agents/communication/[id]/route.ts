import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import type { User } from '@supabase/supabase-js';

/**
 * Agent Delegation Response API
 *
 * PUT /api/agents/communication/[id]
 *     — Accept or reject a delegation
 */

const RespondToDelegationSchema = z.object({
  response: z.string().min(1).max(5000),
  accepted: z.boolean(),
});

async function getAuthenticatedUser(request: NextRequest): Promise<User> {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseAnonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, flowType: 'pkce' },
    });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) throw createError.unauthorized('Invalid token');
    return data.user;
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    auth: { flowType: 'pkce' },
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // ignore
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // ignore
        }
      },
    },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw createError.unauthorized();
  return user;
}

type RouteContext = { params: Promise<{ id: string }> };

async function handleRespondToDelegation(request: NextRequest, context: RouteContext) {
  // CSRF protection for state-changing PUT
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }

  const validationResult = RespondToDelegationSchema.safeParse(body);
  if (!validationResult.success) {
    throw createError.validation('Invalid request body', validationResult.error);
  }

  const { response, accepted } = validationResult.data;

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const newStatus = accepted ? 'accepted' : 'rejected';

  const { data, error } = await supabase
    .from('agent_delegations')
    .update({
      status: newStatus,
      response,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    if (error.code === '42P01' || (error.message && error.message.includes('does not exist'))) {
      // Table doesn't exist yet — return graceful success
      return NextResponse.json({ success: true, delegation: null });
    }
    if (error.code === 'PGRST116') {
      throw createError.notFound('Delegation not found');
    }
    logger.error({ error, userId: user.id, delegationId: id }, 'Failed to respond to delegation');
    throw createError.internal('Failed to respond to delegation');
  }

  logger.info(
    { userId: user.id, delegationId: id, status: newStatus },
    'Agent delegation response recorded',
  );

  return NextResponse.json({ success: true, delegation: data });
}

export const PUT = withErrorHandler(handleRespondToDelegation);
