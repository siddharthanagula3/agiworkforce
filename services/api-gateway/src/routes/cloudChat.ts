/**
 * @file Cloud Chat API Routes
 * @security
 * - Rate limiting: Applied per-endpoint based on operation type
 * - Input validation: Zod schemas with .strict() to reject unexpected fields
 * - Authentication: JWT required (via authenticateToken)
 * - Plan enforcement: Pro/Max/Enterprise required (via requireProPlan)
 * - Ownership validation: Users can only access their own conversations
 *
 * Rate limit rationale (OWASP compliant):
 * - GET /: 60/min - read list, lightweight
 * - POST /: 30/min - write, creates DB row
 * - GET /:id: 60/min - read single, lightweight
 * - DELETE /:id: 10/min - destructive operation
 * - PATCH /:id: 30/min - metadata write
 * - POST /send: 30/min - action-based (future LLM proxy)
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
 * Send a message (placeholder — LLM proxying is implemented in a separate task).
 *
 * SECURITY: Rate limited to 30/min as it is an action-based operation.
 */
router.post('/send', createRateLimiter('cloud-chat-send'), async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const { conversation_id, message, model } = sendMessageSchema.parse(req.body);

  logger.info(
    { userId: user.userId, conversationId: conversation_id ?? null, model: model ?? null },
    'Cloud chat send placeholder called',
  );

  // Placeholder response — full LLM proxying is Task 6.
  res.status(202).json({
    status: 'accepted',
    message: 'LLM proxying not yet implemented. This endpoint will stream responses in Task 6.',
    conversation_id: conversation_id ?? null,
    echo: message,
    plan_tier: req.planTier,
  });
});

export { router as cloudChatRouter };
