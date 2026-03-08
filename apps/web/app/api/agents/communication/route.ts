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
import { handleCorsPreflightRequest } from '@/lib/cors';
import type { User } from '@supabase/supabase-js';

/**
 * Agent Communication API
 *
 * GET  /api/agents/communication?agentId=<id>[&type=delegations]
 *      — List messages or delegations for an agent
 *
 * POST /api/agents/communication
 *      — Send a message from one agent to another
 */

const SendMessageSchema = z.object({
  type: z.literal('message'),
  from: z.string().min(1).max(255),
  to: z.string().min(1).max(255),
  content: z.string().min(1).max(10000),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
  taskId: z.string().optional(),
  messageType: z
    .enum(['request', 'response', 'update', 'delegation', 'completion'])
    .optional()
    .default('request'),
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

/**
 * GET /api/agents/communication
 * Returns messages or delegations for the specified agentId.
 */
async function handleGetCommunication(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);

  const url = new URL(request.url);
  const agentId = url.searchParams.get('agentId');
  const type = url.searchParams.get('type') ?? 'messages';

  if (!agentId) {
    throw createError.validation('agentId query parameter is required');
  }

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  if (type === 'delegations') {
    // Fetch delegations where this agent is the delegate
    const { data, error } = await supabase
      .from('agent_delegations')
      .select('*')
      .eq('user_id', user.id)
      .eq('delegate_agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      // Table may not exist in all environments — return empty list gracefully
      if (error.code === '42P01' || (error.message && error.message.includes('does not exist'))) {
        return NextResponse.json({ delegations: [] });
      }
      logger.error({ error, userId: user.id, agentId }, 'Failed to fetch agent delegations');
      throw createError.internal('Failed to fetch agent delegations');
    }

    const delegations = (data ?? []).map((row) => ({
      id: row['id'] as string,
      from: (row['delegator_agent_id'] as string) ?? '',
      to: (row['delegate_agent_id'] as string) ?? '',
      delegatorId: row['delegator_agent_id'] as string | undefined,
      status: (row['status'] as string) ?? 'pending',
      timestamp: row['created_at'] as string,
      task: {
        title: (row['task_title'] as string | undefined) ?? 'Task',
        description: (row['task_description'] as string) ?? '',
        requirements: (row['task_requirements'] as string[]) ?? [],
        expectedOutput: (row['task_expected_output'] as string) ?? '',
        priority: (row['priority'] as string | undefined) ?? 'medium',
        deadline: row['deadline'] as string | undefined,
      },
      response: row['response'] as string | undefined,
      result: row['result'] as { output: string } | undefined,
    }));

    return NextResponse.json({ delegations });
  }

  // Default: fetch messages
  const { data, error } = await supabase
    .from('agent_messages')
    .select('*')
    .eq('user_id', user.id)
    .eq('to_agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    // Table may not exist in all environments — return empty list gracefully
    if (error.code === '42P01' || (error.message && error.message.includes('does not exist'))) {
      return NextResponse.json({ messages: [] });
    }
    logger.error({ error, userId: user.id, agentId }, 'Failed to fetch agent messages');
    throw createError.internal('Failed to fetch agent messages');
  }

  const messages = (data ?? []).map((row) => ({
    id: row['id'] as string,
    from: (row['from_agent_id'] as string) ?? '',
    to: (row['to_agent_id'] as string) ?? '',
    fromAgentId: row['from_agent_id'] as string | undefined,
    content: (row['content'] as string) ?? '',
    timestamp: row['created_at'] as string,
    createdAt: row['created_at'] as string,
    type: (row['message_type'] as string) ?? 'request',
    messageType: row['message_type'] as string | undefined,
    status: (row['status'] as string) ?? 'delivered',
    priority: (row['priority'] as string) ?? 'medium',
    taskId: row['task_id'] as string | undefined,
  }));

  return NextResponse.json({ messages });
}

/**
 * POST /api/agents/communication
 * Send a message from one agent to another.
 */
async function handleSendMessage(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }

  const validationResult = SendMessageSchema.safeParse(body);
  if (!validationResult.success) {
    throw createError.validation('Invalid request body', validationResult.error);
  }

  const { from, to, content, priority, taskId, messageType } = validationResult.data;

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from('agent_messages')
    .insert({
      user_id: user.id,
      from_agent_id: from,
      to_agent_id: to,
      content,
      priority,
      task_id: taskId ?? null,
      message_type: messageType,
      status: 'delivered',
    })
    .select()
    .single();

  if (error) {
    // Table may not exist in all environments
    if (error.code === '42P01' || (error.message && error.message.includes('does not exist'))) {
      logger.warn(
        { userId: user.id, from, to },
        'agent_messages table does not exist; message dropped',
      );
      return NextResponse.json({ success: true, message: null });
    }
    logger.error({ error, userId: user.id, from, to }, 'Failed to send agent message');
    throw createError.internal('Failed to send message');
  }

  logger.info({ userId: user.id, messageId: data?.['id'], from, to }, 'Agent message sent');

  return NextResponse.json({ success: true, message: data }, { status: 201 });
}

export const GET = withErrorHandler(handleGetCommunication);
export const POST = withErrorHandler(handleSendMessage);

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
