/**
 * Chat Messages API
 *
 * POST /api/chat/conversations/[id]/messages - Send a message and get AI response
 */

import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { CreditService } from '@/lib/services/credit-service';
import { CreateMessageSchema } from '@/lib/validations/chat';
import type { User } from '@supabase/supabase-js';

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
    if (error || !data.user) {
      throw createError.unauthorized('Invalid token');
    }
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

  // Use getUser() (not getSession()) so the JWT is re-validated against Supabase
  // on every server-side request. getSession() trusts the cookie without revalidation.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    throw createError.unauthorized();
  }
  return user;
}

type RouteContext = { params: Promise<{ id: string }> };

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

async function handleSendMessage(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-message');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);
  const { id: conversationId } = await context.params;
  const rawBody = await request.json();

  // AUDIT-008-004: Validate input with Zod schema (max content length 100k chars)
  const validationResult = CreateMessageSchema.safeParse(rawBody);
  if (!validationResult.success) {
    throw createError.validation('Invalid request body', validationResult.error);
  }

  const { content, model, role, skipLlm } = validationResult.data;

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Verify conversation ownership
  const { data: conversation, error: convError } = await supabase
    .from('web_conversations')
    .select('id, model')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single();

  if (convError || !conversation) {
    throw createError.notFound('Conversation not found');
  }

  // If skipLlm is true, just save the message and return (used for streaming where LLM is called separately)
  if (skipLlm) {
    const { data: message, error: msgError } = await supabase
      .from('web_messages')
      .insert({
        conversation_id: conversationId,
        role,
        content: content.trim(),
        model: role === 'assistant' ? model : undefined,
      })
      .select()
      .single();

    if (msgError) {
      logger.error({ error: msgError }, 'Failed to save message');
      throw createError.internal('Failed to save message');
    }

    // Auto-title conversation from first user message
    if (role === 'user') {
      const { count } = await supabase
        .from('web_messages')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', conversationId);

      if (count && count <= 1) {
        // First message - generate title
        const title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
        await supabase.from('web_conversations').update({ title }).eq('id', conversationId);
      }
    }

    return NextResponse.json({ message });
  }

  // Normal flow: save user message, call LLM, save assistant message

  // Check credits
  const hasCredits = await CreditService.checkAvailable(user.id, 0.01);
  if (!hasCredits) {
    throw createError.paymentRequired('Insufficient credits');
  }

  // Save user message
  const { data: userMessage, error: userMsgError } = await supabase
    .from('web_messages')
    .insert({
      conversation_id: conversationId,
      role: 'user',
      content: content.trim(),
    })
    .select()
    .single();

  if (userMsgError) {
    logger.error({ error: userMsgError }, 'Failed to save user message');
    throw createError.internal('Failed to save message');
  }

  // Get conversation history for context
  const { data: history } = await supabase
    .from('web_messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(20);

  const messages: ChatMessage[] = (history || []).map((m) => ({
    role: m.role as 'user' | 'assistant' | 'system',
    content: m.content,
  }));

  // Call LLM API
  const llmApiUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001';
  const llmEndpoint = `${llmApiUrl}/api/llm/v1/chat/completions`;

  // Validate outbound URL uses a trusted origin
  const trustedOrigin = new URL(llmApiUrl).origin;
  const actualOrigin = new URL(llmEndpoint).origin;
  if (actualOrigin !== trustedOrigin) {
    logger.error({ llmEndpoint, trustedOrigin, actualOrigin }, 'LLM endpoint origin mismatch');
    // Rollback: delete the user message we already saved
    await supabase.from('web_messages').delete().eq('id', userMessage.id);
    throw createError.internal('LLM API configuration error');
  }

  const llmResponse = await fetch(llmEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: request.headers.get('authorization') || '',
      // Do not forward cookies to internal LLM endpoint — Authorization header is sufficient.
    },
    body: JSON.stringify({
      model: model || conversation.model || 'auto',
      messages,
      stream: false,
    }),
  });

  if (!llmResponse.ok) {
    const errorData = await llmResponse.json().catch(() => ({}));
    logger.error({ status: llmResponse.status, error: errorData }, 'LLM API error');
    // Rollback: delete the user message so the conversation stays consistent
    await supabase.from('web_messages').delete().eq('id', userMessage.id);
    throw createError.internal('Failed to get AI response');
  }

  const llmData = await llmResponse.json();
  const assistantContent =
    llmData.choices?.[0]?.message?.content || 'I could not generate a response.';
  const usage = llmData.usage || {};

  // Save assistant message
  const { data: assistantMessage, error: asstMsgError } = await supabase
    .from('web_messages')
    .insert({
      conversation_id: conversationId,
      role: 'assistant',
      content: assistantContent,
      model: llmData.model || model,
      provider: llmData.provider,
      input_tokens: usage.prompt_tokens || 0,
      output_tokens: usage.completion_tokens || 0,
      cost_cents: llmData.cost_cents || 0,
    })
    .select()
    .single();

  if (asstMsgError) {
    logger.error({ error: asstMsgError, conversationId }, 'Failed to save assistant message');
    throw createError.internal('Failed to save AI response');
  }

  // Auto-title conversation from first message
  const { count } = await supabase
    .from('web_messages')
    .select('*', { count: 'exact', head: true })
    .eq('conversation_id', conversationId);

  if (count && count <= 2) {
    // First exchange - generate title
    const title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
    await supabase.from('web_conversations').update({ title }).eq('id', conversationId);
  }

  return NextResponse.json({
    userMessage,
    assistantMessage,
    usage: {
      prompt_tokens: usage.prompt_tokens || 0,
      completion_tokens: usage.completion_tokens || 0,
      total_tokens: usage.total_tokens || 0,
    },
  });
}

export const POST = withErrorHandler(handleSendMessage);
