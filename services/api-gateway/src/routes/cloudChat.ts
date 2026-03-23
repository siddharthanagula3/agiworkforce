/**
 * @file Cloud Chat API Routes
 * @security
 * - Rate limiting: Applied per-endpoint based on operation type
 * - Input validation: Zod schemas with .strict() to reject unexpected fields
 * - Authentication: JWT required (via authenticateToken)
 * - Plan enforcement: Hobby/Pro/Max/Enterprise required (via requireProPlan)
 * - Ownership validation: Users can only access their own conversations
 *
 * Rate limit rationale (OWASP compliant):
 * - GET /: 60/min - read list, lightweight
 * - POST /: 30/min - write, creates DB row
 * - GET /:id: 60/min - read single, lightweight
 * - DELETE /:id: 10/min - destructive operation
 * - PATCH /:id: 30/min - metadata write
 * - POST /send: 30/min - SSE streaming LLM proxy (Anthropic, OpenAI, Google)
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { authenticateToken } from '../middleware/auth';
import { requireProPlan } from '../middleware/planGate';
import { AppError } from '../middleware/errorHandler';
import { supabase } from '../lib/supabase';
import { createRateLimiter } from '../middleware/rateLimit';
import { logger } from '../lib/logger';

const router: Router = Router();

// Apply authentication and plan enforcement to all routes on this router.
router.use(authenticateToken);
router.use(requireProPlan);

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const createConversationSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    model: z.string().max(100).optional(),
  })
  .strict();

const updateConversationSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    is_archived: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

const sendMessageSchema = z
  .object({
    conversation_id: z.string().uuid().optional(),
    message: z.string().min(1).max(32000),
    model: z.string().max(100).optional(),
  })
  .strict();

// =============================================================================
// HELPER: Verify conversation ownership
// =============================================================================

async function verifyConversationOwnership(conversationId: string, userId: string): Promise<void> {
  const { data: conversation, error } = await supabase
    .from('conversations')
    .select('id, user_id')
    .eq('id', conversationId)
    .eq('is_deleted', false)
    .single();

  if (error || !conversation) {
    throw new AppError('Conversation not found', 404);
  }

  // Mask ownership as 404 to prevent enumeration attacks
  if (conversation.user_id !== userId) {
    throw new AppError('Conversation not found', 404);
  }
}

// =============================================================================
// HELPERS: LLM Provider Resolution & Streaming
// =============================================================================

type Provider = 'anthropic' | 'openai' | 'google';

function resolveProvider(model: string): Provider {
  if (model.startsWith('claude-')) return 'anthropic';
  if (
    model.startsWith('gpt-') ||
    model.startsWith('o1-') ||
    model.startsWith('o3-') ||
    model.startsWith('o4-')
  )
    return 'openai';
  if (model.startsWith('gemini-')) return 'google';
  return 'anthropic'; // default
}

async function callUpstreamLLM(
  provider: Provider,
  model: string,
  messages: Array<{ role: string; content: string }>,
): Promise<globalThis.Response> {
  switch (provider) {
    case 'anthropic': {
      const apiKey = process.env['ANTHROPIC_API_KEY'];
      if (!apiKey) throw new AppError('Anthropic API key not configured', 500);

      // Convert to Anthropic format: extract system, rest are messages
      const systemMsg = messages.find((m) => m.role === 'system');
      const nonSystemMsgs = messages.filter((m) => m.role !== 'system');

      const body: Record<string, unknown> = {
        model,
        messages: nonSystemMsgs.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: 4096,
        stream: true,
      };
      if (systemMsg) {
        body['system'] = systemMsg.content;
      }

      return fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });
    }

    case 'openai': {
      const apiKey = process.env['OPENAI_API_KEY'];
      if (!apiKey) throw new AppError('OpenAI API key not configured', 500);

      return fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
        }),
      });
    }

    case 'google': {
      const apiKey = process.env['GOOGLE_AI_API_KEY'];
      if (!apiKey) throw new AppError('Google AI API key not configured', 500);

      // Convert to Gemini format
      const contents = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));

      const systemInstruction = messages.find((m) => m.role === 'system');

      const body: Record<string, unknown> = { contents };
      if (systemInstruction) {
        body['systemInstruction'] = { parts: [{ text: systemInstruction.content }] };
      }

      return fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
    }
  }
}

function extractTextFromChunk(parsed: unknown, provider: Provider): string | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  switch (provider) {
    case 'anthropic': {
      if (obj['type'] === 'content_block_delta') {
        const delta = obj['delta'] as Record<string, unknown> | undefined;
        if (delta && typeof delta['text'] === 'string') return delta['text'];
      }
      return null;
    }

    case 'openai': {
      const choices = obj['choices'] as Array<Record<string, unknown>> | undefined;
      if (choices?.[0]) {
        const delta = choices[0]['delta'] as Record<string, unknown> | undefined;
        if (delta && typeof delta['content'] === 'string') return delta['content'];
      }
      return null;
    }

    case 'google': {
      const candidates = obj['candidates'] as Array<Record<string, unknown>> | undefined;
      if (candidates?.[0]) {
        const content = candidates[0]['content'] as Record<string, unknown> | undefined;
        const parts = content?.['parts'] as Array<Record<string, unknown>> | undefined;
        if (parts?.[0] && typeof parts[0]['text'] === 'string') return parts[0]['text'];
      }
      return null;
    }
  }
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/cloud-chat
 * List all conversations for the authenticated user (excluding soft-deleted).
 *
 * SECURITY: Rate limited to 60/min for responsive UX on list operations.
 */
router.get('/', createRateLimiter('cloud-chat-list'), async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const { data: conversations, error } = await supabase
    .from('conversations')
    .select('id, title, model, is_archived, created_at, updated_at')
    .eq('user_id', user.userId)
    .eq('is_deleted', false)
    .order('updated_at', { ascending: false })
    .limit(100);

  if (error) {
    logger.error({ error, userId: user.userId }, 'Failed to list conversations');
    throw new AppError('Failed to list conversations', 500);
  }

  res.json({ conversations: conversations ?? [] });
});

/**
 * POST /api/cloud-chat
 * Create a new conversation for the authenticated user.
 *
 * SECURITY: Rate limited to 30/min for write operations.
 */
router.post('/', createRateLimiter('cloud-chat-create'), async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const { title, model } = createConversationSchema.parse(req.body);

  const conversationId = randomUUID();
  const now = new Date().toISOString();

  const { data: conversation, error } = await supabase
    .from('conversations')
    .insert({
      id: conversationId,
      user_id: user.userId,
      title: title ?? null,
      model: model ?? null,
      is_archived: false,
      is_deleted: false,
      created_at: now,
      updated_at: now,
    })
    .select('id, title, model, is_archived, created_at, updated_at')
    .single();

  if (error || !conversation) {
    logger.error({ error, userId: user.userId }, 'Failed to create conversation');
    throw new AppError('Failed to create conversation', 500);
  }

  logger.info({ userId: user.userId, conversationId }, 'Conversation created');

  res.status(201).json({ conversation });
});

/**
 * GET /api/cloud-chat/:id
 * Get a single conversation with its messages.
 *
 * SECURITY: Rate limited to 60/min; ownership verified before returning data.
 */
router.get('/:id', createRateLimiter('cloud-chat-get'), async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const rawId = req.params['id'];
  const conversationId = typeof rawId === 'string' ? rawId : undefined;
  if (!conversationId) {
    throw new AppError('Conversation ID is required', 400);
  }

  await verifyConversationOwnership(conversationId, user.userId);

  // Fetch conversation metadata and messages in parallel.
  const [convResult, msgsResult] = await Promise.all([
    supabase
      .from('conversations')
      .select('id, title, model, is_archived, created_at, updated_at')
      .eq('id', conversationId)
      .single(),
    supabase
      .from('messages')
      .select('id, role, content, model, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(500),
  ]);

  if (convResult.error || !convResult.data) {
    logger.error({ error: convResult.error, conversationId }, 'Failed to fetch conversation');
    throw new AppError('Failed to fetch conversation', 500);
  }

  if (msgsResult.error) {
    // Non-fatal: return conversation with empty messages if table not ready.
    logger.debug({ error: msgsResult.error, conversationId }, 'Failed to fetch messages');
  }

  res.json({
    conversation: convResult.data,
    messages: msgsResult.data ?? [],
  });
});

/**
 * DELETE /api/cloud-chat/:id
 * Soft-delete a conversation (sets is_deleted=true).
 *
 * SECURITY: Rate limited to 10/min for destructive operations.
 */
router.delete(
  '/:id',
  createRateLimiter('cloud-chat-delete'),
  async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const rawId = req.params['id'];
    const conversationId = typeof rawId === 'string' ? rawId : undefined;
    if (!conversationId) {
      throw new AppError('Conversation ID is required', 400);
    }

    await verifyConversationOwnership(conversationId, user.userId);

    const { error } = await supabase
      .from('conversations')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', conversationId)
      .eq('user_id', user.userId);

    if (error) {
      logger.error({ error, conversationId, userId: user.userId }, 'Failed to delete conversation');
      throw new AppError('Failed to delete conversation', 500);
    }

    logger.info({ userId: user.userId, conversationId }, 'Conversation soft-deleted');

    res.json({ success: true, id: conversationId });
  },
);

/**
 * PATCH /api/cloud-chat/:id
 * Update conversation title or archive status.
 *
 * SECURITY: Rate limited to 30/min for metadata writes.
 */
router.patch('/:id', createRateLimiter('cloud-chat-patch'), async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const rawId = req.params['id'];
  const conversationId = typeof rawId === 'string' ? rawId : undefined;
  if (!conversationId) {
    throw new AppError('Conversation ID is required', 400);
  }

  const updates = updateConversationSchema.parse(req.body);

  await verifyConversationOwnership(conversationId, user.userId);

  const { data: updated, error } = await supabase
    .from('conversations')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .eq('user_id', user.userId)
    .select('id, title, model, is_archived, created_at, updated_at')
    .single();

  if (error || !updated) {
    logger.error({ error, conversationId, userId: user.userId }, 'Failed to update conversation');
    throw new AppError('Failed to update conversation', 500);
  }

  logger.info({ userId: user.userId, conversationId, updates }, 'Conversation updated');

  res.json({ conversation: updated });
});

/**
 * POST /api/cloud-chat/send
 * Send a message and stream the LLM response via SSE.
 * Supports Anthropic, OpenAI, and Google providers.
 *
 * SSE protocol:
 * - First event: { conversation_id: string }
 * - Content events: { text: string }
 * - Error events: { error: string }
 * - Terminal event: [DONE]
 *
 * SECURITY: Rate limited to 30/min as it is an action-based operation.
 */
router.post('/send', createRateLimiter('cloud-chat-send'), async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const { conversation_id, message, model } = sendMessageSchema.parse(req.body);

  // Auto-create conversation if none provided
  let conversationId = conversation_id;
  if (!conversationId) {
    const newId = randomUUID();
    const now = new Date().toISOString();
    const { error: createErr } = await supabase.from('conversations').insert({
      id: newId,
      user_id: user.userId,
      title: message.slice(0, 100),
      model: model ?? null,
      is_archived: false,
      is_deleted: false,
      created_at: now,
      updated_at: now,
    });
    if (createErr) {
      logger.error({ error: createErr }, 'Failed to auto-create conversation');
      throw new AppError('Failed to create conversation', 500);
    }
    conversationId = newId;
  } else {
    await verifyConversationOwnership(conversationId, user.userId);
  }

  // Persist user message
  const userMsgId = randomUUID();
  const { error: userMsgErr } = await supabase.from('messages').insert({
    id: userMsgId,
    conversation_id: conversationId,
    role: 'user',
    content: message,
    model: null,
    created_at: new Date().toISOString(),
  });
  if (userMsgErr) {
    logger.error({ error: userMsgErr }, 'Failed to persist user message');
    throw new AppError('Failed to save message', 500);
  }

  // Fetch conversation history for context
  const { data: history } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(50);

  const messages = (history ?? []).map((m: { role: string; content: string }) => ({
    role: m.role as 'user' | 'assistant' | 'system',
    content: m.content,
  }));

  // Resolve provider and call upstream LLM
  const resolvedModel = model ?? 'claude-haiku-4-5-20251001';
  const provider = resolveProvider(resolvedModel);

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let fullContent = '';

  try {
    // Send conversation_id as first event
    res.write(`data: ${JSON.stringify({ conversation_id: conversationId })}\n\n`);

    const upstreamRes = await callUpstreamLLM(provider, resolvedModel, messages);

    if (!upstreamRes.body) {
      res.write(`data: ${JSON.stringify({ error: 'No response body from upstream' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    const reader = upstreamRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed === 'data: [DONE]') {
          continue;
        }

        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6);
          try {
            const parsed = JSON.parse(jsonStr);
            const text = extractTextFromChunk(parsed, provider);
            if (text) {
              fullContent += text;
              res.write(`data: ${JSON.stringify({ text })}\n\n`);
            }
          } catch {
            // Skip unparseable lines
          }
        }
      }
    }

    // Persist assistant message
    const { error: assistantMsgErr } = await supabase.from('messages').insert({
      id: randomUUID(),
      conversation_id: conversationId,
      role: 'assistant',
      content: fullContent,
      model: resolvedModel,
      created_at: new Date().toISOString(),
    });
    if (assistantMsgErr) {
      logger.error({ error: assistantMsgErr }, 'Failed to persist assistant message');
    }

    // Update conversation timestamp
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    logger.error({ error: err }, 'SSE stream error');
    try {
      res.write(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } catch {
      // Response already ended
    }
  }
});

export { router as cloudChatRouter };
