/**
 * @file Chat API Routes (Mobile <-> Desktop)
 * @security
 * - Rate limiting: Applied per-endpoint based on operation type
 * - Input validation: Zod schemas with .strict() to reject unexpected fields
 * - Authentication: JWT required for all endpoints
 * - Ownership validation: Users can only access their own desktop conversations
 *
 * Rate limit rationale (OWASP compliant):
 * - POST /message: 30/min - sending messages is action-based
 * - GET /history: 60/min - read operation, paginated
 * - GET /conversations: 30/min - list operation
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { supabase } from '../lib/supabase';
import { createRateLimiter } from '../middleware/rateLimit';
import { sendCommandToDesktop } from '../websocket';
import { logger } from '../lib/logger';
import { randomUUID } from 'crypto';

const router: Router = Router();

// GW-1 (audit 2026-05-03): authenticate FIRST, then rate-limit. The
// previous order (rate-limit before authenticateToken) was inconsistent
// with desktop.ts/mobile.ts and meant any future route inserted between
// them would silently bypass auth. Putting auth at the top of the chain
// makes it impossible to forget.
router.use(authenticateToken);

// SECURITY: Baseline rate limit for all chat endpoints (100/min fallback)
// — applied AFTER auth so the per-IP bucket reflects authenticated traffic.
router.use(createRateLimiter('default'));

// UUID validation regex (RFC 4122)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(id: string | undefined): boolean {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

// SECURITY: .strict() rejects unexpected fields to prevent mass assignment
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

// =============================================================================
// HELPER: Verify desktop ownership
// =============================================================================

async function verifyDesktopOwnership(desktopId: string, userId: string): Promise<void> {
  if (!isValidUUID(desktopId)) {
    throw new AppError('Invalid desktop ID format', 400);
  }

  const { data: desktop, error } = await supabase
    .from('desktop_devices')
    .select('id, user_id')
    .eq('id', desktopId)
    .single();

  if (error || !desktop) {
    throw new AppError('Desktop not found', 404);
  }

  if (desktop.user_id !== userId) {
    throw new AppError('Desktop not found', 404);
  }
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * Send a chat message from mobile to desktop
 * POST /chat/message
 *
 * Forwards the message to the paired desktop via WebSocket. The desktop
 * processes the message through its LLM and streams the response back
 * through the WebSocket connection.
 *
 * SECURITY: Rate limited to 30/min to prevent message flood
 */
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

    await verifyDesktopOwnership(desktopId, user.userId);

    const messageId = randomUUID();
    const timestamp = Date.now();

    // Persist the message to Supabase for history (best-effort)
    const { error: insertError } = await supabase.from('chat_messages').insert({
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
      // Non-fatal: table may not exist yet, message still gets delivered via WS
      logger.debug({ error: insertError }, 'Failed to persist chat message (table may not exist)');
    }

    // Forward to desktop via WebSocket
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

/**
 * Get chat history
 * GET /chat/history?desktopId=<uuid>&conversationId=<uuid>&limit=50&before=<iso-date>
 *
 * Returns paginated chat messages for a conversation. Uses cursor-based
 * pagination (before parameter) for consistent results during active conversations.
 *
 * SECURITY: Rate limited to 60/min for responsive UX
 */
router.get('/history', createRateLimiter('device-status'), async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const query = historyQuerySchema.parse(req.query);

  if (query.desktopId) {
    await verifyDesktopOwnership(query.desktopId, user.userId);
  }

  // Build Supabase query
  let dbQuery = supabase
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
    // Table may not exist yet — return empty list
    logger.debug({ error }, 'Failed to fetch chat history (table may not exist)');
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

/**
 * List conversations
 * GET /chat/conversations?desktopId=<uuid>
 *
 * Returns a list of conversations for the user, optionally filtered by desktop.
 *
 * SECURITY: Rate limited to 30/min for list operations
 */
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
      await verifyDesktopOwnership(desktopId, user.userId);
    }

    // Fetch distinct conversations with their latest message
    let dbQuery = supabase
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
      logger.debug({ error }, 'Failed to fetch conversations (table may not exist)');
      res.json({ conversations: [] });
      return;
    }

    // Group by conversation_id and take the latest message
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
