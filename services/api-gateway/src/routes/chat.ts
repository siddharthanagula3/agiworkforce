
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { getUserScopedClient, type UserAuth } from '../lib/neonClients';
import { createRateLimiter } from '../middleware/rateLimit';
import { sendCommandToDesktop } from '../websocket';
import { logger } from '../lib/logger';
import { isValidUuid } from '../validations/ids';
import { randomUUID } from 'crypto';

const router: Router = Router();

router.use(authenticateToken);

router.use(createRateLimiter('default'));

const sendMessageSchema = z
  .object({
    desktopId: z.string().uuid(),
    conversationId: z.string().uuid().optional(),
    message: z.string().min(1).max(32000),
    model: z.string().max(100).optional(),
    temperature: z.number().min(0).max(2).optional(),
  })
  .strict();

const historyQuerySchema = z.object({
  desktopId: z.string().optional(),
  conversationId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  before: z.string().optional(),
});

async function verifyDesktopOwnership(desktopId: string, user: UserAuth): Promise<void> {
  if (!isValidUuid(desktopId)) {
    throw new AppError('Invalid desktop ID format', 400);
  }

  const db = getUserScopedClient(user);
  const { data: desktop, error } = await db
    .from('desktop_devices')
    .select('id, user_id')
    .eq('id', desktopId)
    .single();

  if (error || !desktop) {
    throw new AppError('Desktop not found', 404);
  }

  if (desktop.user_id !== user.userId) {
    throw new AppError('Desktop not found', 404);
  }
}

router.post(
  '/message',
  createRateLimiter('device-command'),
  async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const { desktopId, conversationId, message, model, temperature } = sendMessageSchema.parse(
      req.body,
    );

    await verifyDesktopOwnership(desktopId, user);

    const messageId = randomUUID();
    const timestamp = Date.now();

    const db = getUserScopedClient(user);
    const { error: insertError } = await db.from('chat_messages').insert({
      id: messageId,
      user_id: user.userId,
      desktop_id: desktopId,
      conversation_id: conversationId ?? null,
      role: 'user',
      content: message,
      source: 'mobile',
      created_at: new Date(timestamp).toISOString(),
    });

    if (insertError) {
      logger.debug({ error: insertError }, 'Failed to persist chat message');
    }

    const { delivered, queued } = sendCommandToDesktop(user.userId, desktopId, messageId, 'chat', {
      message,
      messageId,
      conversationId: conversationId ?? null,
      model: model ?? null,
      temperature: temperature ?? null,
      source: 'mobile',
      timestamp,
    });

    logger.info(
      {
        userId: user.userId,
        desktopId,
        messageId,
        conversationId,
        delivered,
        messageLength: message.length,
      },
      'Chat message sent from mobile',
    );

    res.json({
      messageId,
      conversationId: conversationId ?? null,
      status: delivered ? 'delivered' : queued ? 'queued' : 'failed',
      message: delivered
        ? 'Message delivered to desktop'
        : queued
          ? 'Desktop offline — message queued for delivery'
          : 'Failed to deliver message',
      timestamp,
    });
  },
);

router.get('/history', createRateLimiter('device-status'), async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const query = historyQuerySchema.parse(req.query);

  if (query.desktopId) {
    await verifyDesktopOwnership(query.desktopId, user);
  }

  const db = getUserScopedClient(user);
  let dbQuery = db
    .from('chat_messages')
    .select('*')
    .eq('user_id', user.userId)
    .order('created_at', { ascending: false })
    .limit(query.limit);

  if (query.desktopId) {
    dbQuery = dbQuery.eq('desktop_id', query.desktopId);
  }

  if (query.conversationId) {
    dbQuery = dbQuery.eq('conversation_id', query.conversationId);
  }

  if (query.before) {
    dbQuery = dbQuery.lt('created_at', query.before);
  }

  const { data: messages, error } = await dbQuery;

  if (error) {
    logger.debug({ error }, 'Failed to fetch chat history');
    res.json({ messages: [], hasMore: false });
    return;
  }

  const formattedMessages = (messages ?? []).map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    source: m.source,
    conversationId: m.conversation_id,
    desktopId: m.desktop_id,
    createdAt: m.created_at,
    model: m.model ?? null,
  }));

  res.json({
    messages: formattedMessages,
    hasMore: formattedMessages.length === query.limit,
  });
});

router.get(
  '/conversations',
  createRateLimiter('device-list'),
  async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const desktopId =
      typeof req.query['desktopId'] === 'string' ? req.query['desktopId'] : undefined;

    if (desktopId) {
      await verifyDesktopOwnership(desktopId, user);
    }

    const db = getUserScopedClient(user);
    let dbQuery = db
      .from('chat_messages')
      .select('conversation_id, desktop_id, content, role, created_at')
      .eq('user_id', user.userId)
      .not('conversation_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100);

    if (desktopId) {
      dbQuery = dbQuery.eq('desktop_id', desktopId);
    }

    const { data: messages, error } = await dbQuery;

    if (error) {
      logger.debug({ error }, 'Failed to fetch conversations');
      res.json({ conversations: [] });
      return;
    }

    const conversationMap = new Map<
      string,
      {
        conversationId: string;
        desktopId: string;
        lastMessage: string;
        lastRole: string;
        lastMessageAt: string;
        messageCount: number;
      }
    >();

    for (const msg of messages ?? []) {
      const convId = msg.conversation_id;
      if (!convId) continue;

      const existing = conversationMap.get(convId);
      if (existing) {
        existing.messageCount++;
      } else {
        conversationMap.set(convId, {
          conversationId: convId,
          desktopId: msg.desktop_id,
          lastMessage: typeof msg.content === 'string' ? msg.content.slice(0, 200) : '',
          lastRole: msg.role,
          lastMessageAt: msg.created_at,
          messageCount: 1,
        });
      }
    }

    res.json({
      conversations: Array.from(conversationMap.values()),
    });
  },
);

export { router as chatRouter };
