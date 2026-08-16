
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { authenticateToken } from '../middleware/auth';
import { requireManagedChatPlan } from '../middleware/planGate';
import { AppError } from '../middleware/errorHandler';
import { getUserScopedClient, type UserAuth } from '../lib/neonClients';
import { createRateLimiter } from '../middleware/rateLimit';
import { logger } from '../lib/logger';

const router: Router = Router();

router.use(authenticateToken);
router.use(requireManagedChatPlan);

router.use(createRateLimiter('default'));

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

async function verifyConversationOwnership(conversationId: string, user: UserAuth): Promise<void> {
  const db = getUserScopedClient(user);
  const { data: conversation, error } = await db
    .from('conversations')
    .select('id, user_id')
    .eq('id', conversationId)
    .eq('is_deleted', false)
    .single();

  if (error || !conversation) {
    throw new AppError('Conversation not found', 404);
  }

  if (conversation.user_id !== user.userId) {
    throw new AppError('Conversation not found', 404);
  }
}

router.get('/', createRateLimiter('cloud-chat-list'), async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const db = getUserScopedClient(user);
  const { data: conversations, error } = await db
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

router.post('/', createRateLimiter('cloud-chat-create'), async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const { title, model } = createConversationSchema.parse(req.body);

  const conversationId = randomUUID();
  const now = new Date().toISOString();

  const db = getUserScopedClient(user);
  const { data: conversation, error } = await db
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

  await verifyConversationOwnership(conversationId, user);

  const db = getUserScopedClient(user);
  const [convResult, msgsResult] = await Promise.all([
    db
      .from('conversations')
      .select('id, title, model, is_archived, created_at, updated_at')
      .eq('id', conversationId)
      .single(),
    db
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
    logger.debug({ error: msgsResult.error, conversationId }, 'Failed to fetch messages');
  }

  res.json({
    conversation: convResult.data,
    messages: msgsResult.data ?? [],
  });
});

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

    await verifyConversationOwnership(conversationId, user);

    const db = getUserScopedClient(user);
    const { error } = await db
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

  await verifyConversationOwnership(conversationId, user);

  const db = getUserScopedClient(user);
  const { data: updated, error } = await db
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

router.post('/send', createRateLimiter('cloud-chat-send'), (_req: Request, res: Response) => {
  res.status(410).json({
    error: 'Legacy cloud chat execution is no longer available',
    code: 'CANONICAL_COMPLETION_REQUIRED',
    completion_url: '/api/llm/v1/chat/completions',
  });
});

export { router as cloudChatRouter };
