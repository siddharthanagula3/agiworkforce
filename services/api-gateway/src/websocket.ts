import { WebSocketServer, WebSocket, type RawData } from 'ws';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { authenticatedUserSchema } from './authenticated-user';
import { requireEnv } from './env';
import { logger } from './lib/logger';
import { getUserScopedClient } from './lib/neonClients';
import { resolveRequestId } from './middleware/requestContext';

const JWT_SECRET = requireEnv('JWT_SECRET');

const MAX_MESSAGE_SIZE = Number(process.env['WS_MAX_MESSAGE_SIZE'] ?? 65536);

const AUTH_TIMEOUT_MS = Number(process.env['WS_AUTH_TIMEOUT_MS'] ?? 30000);

const RATE_LIMIT_MAX_MESSAGES = Number(process.env['WS_RATE_LIMIT_MAX_MESSAGES'] ?? 100);
const RATE_LIMIT_WINDOW_MS = Number(process.env['WS_RATE_LIMIT_WINDOW_MS'] ?? 60000);

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  deviceId?: string;
  isAlive?: boolean;
  authTimeout?: ReturnType<typeof setTimeout>;
  requestId?: string;
}

const clients = new Map<string, Set<AuthenticatedWebSocket>>();

const rateLimitTracker = new Map<AuthenticatedWebSocket, { count: number; resetAt: number }>();

const pendingCommands = new Map<
  string,
  Array<{ commandId: string; type: string; payload: unknown; timestamp: number }>
>();
const MAX_PENDING_COMMANDS = 100;
const PENDING_COMMAND_TTL = 5 * 60 * 1000;

export function sendCommandToDesktop(
  userId: string,
  desktopId: string,
  commandId: string,
  type: string,
  payload: unknown,
): { delivered: boolean; queued: boolean } {
  const userClients = clients.get(userId);
  let delivered = false;

  if (userClients) {
    for (const client of userClients) {
      if (client.deviceId === desktopId && client.readyState === WebSocket.OPEN) {
        try {
          client.send(
            JSON.stringify({
              type: 'command',
              commandId,
              commandType: type,
              payload,
              timestamp: Date.now(),
            }),
          );
          delivered = true;
        } catch (error) {
          logger.warn({ error, desktopId }, 'Failed to send command to desktop');
        }
        break;
      }
    }
  }

  if (!delivered) {
    const queueKey = `${userId}:${desktopId}`;
    if (!pendingCommands.has(queueKey)) {
      pendingCommands.set(queueKey, []);
    }
    const queue = pendingCommands.get(queueKey)!;

    const now = Date.now();
    const validCommands = queue.filter((cmd) => now - cmd.timestamp < PENDING_COMMAND_TTL);

    if (validCommands.length >= MAX_PENDING_COMMANDS) {
      validCommands.shift();
    }

    validCommands.push({ commandId, type, payload, timestamp: now });
    pendingCommands.set(queueKey, validCommands);

    return { delivered: false, queued: true };
  }

  return { delivered: true, queued: false };
}

function flushPendingCommands(ws: AuthenticatedWebSocket) {
  if (!ws.userId || !ws.deviceId) return;

  const queueKey = `${ws.userId}:${ws.deviceId}`;
  const queue = pendingCommands.get(queueKey);

  if (queue && queue.length > 0) {
    const now = Date.now();
    const validCommands = queue.filter((cmd) => now - cmd.timestamp < PENDING_COMMAND_TTL);

    for (const cmd of validCommands) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(
            JSON.stringify({
              type: 'command',
              commandId: cmd.commandId,
              commandType: cmd.type,
              payload: cmd.payload,
              timestamp: cmd.timestamp,
            }),
          );
        } catch (error) {
          logger.warn({ error, deviceId: ws.deviceId }, 'Failed to flush pending command');
          break;
        }
      }
    }

    pendingCommands.delete(queueKey);
    logger.info({ deviceId: ws.deviceId, count: validCommands.length }, 'Flushed pending commands');
  }
}

const authMessageSchema = z.object({
  type: z.literal('auth'),
  token: z.string(),
  deviceId: z.string().optional(),
});

const wsCommandPayloadSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('chat'),
    text: z.string().min(1).max(10_000),
    targetDeviceId: z.string().uuid().optional(),
  }),
  z.object({
    type: z.literal('automation'),
    action: z.literal('run'),
    workflowId: z.string().uuid(),
    parameters: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    type: z.literal('query'),
    question: z.string().min(1).max(10_000),
  }),
]);

const wsSyncPayloadSchema = z
  .object({
    kind: z.string().min(1).max(64),
    data: z.record(z.string(), z.unknown()),
  })
  .refine((v) => JSON.stringify(v).length <= 4096, {
    message: 'Sync payload too large',
  });

const nonAuthMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ping'),
  }),
  z.object({
    type: z.literal('command'),
    payload: wsCommandPayloadSchema,
  }),
  z.object({
    type: z.literal('sync'),
    payload: wsSyncPayloadSchema,
  }),
]);

const gatewayMessageSchema = z.union([authMessageSchema, nonAuthMessageSchema]);

type GatewayMessage = z.infer<typeof gatewayMessageSchema>;
type AuthMessage = z.infer<typeof authMessageSchema>;
type NonAuthMessage = z.infer<typeof nonAuthMessageSchema>;

export function setupWebSocket(wss: WebSocketServer) {
  wss.on('error', (error) => {
    logger.error({ error }, 'WebSocketServer error');
  });

  wss.on('connection', (ws: AuthenticatedWebSocket, request) => {
    ws.requestId = resolveRequestId(request.headers['x-request-id']);

    const origin = request.headers['origin'];
    const configuredOrigins = process.env['ALLOWED_ORIGINS'];
    const wsAllowedOrigins = configuredOrigins
      ? configuredOrigins
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean)
      : [
          'http://localhost:3000',
          'http://localhost:3001',
          'tauri://localhost',
          'https://tauri.localhost',
          'https://chat.agiworkforce.com',
          'https://www.agiworkforce.com',
          'https://agiworkforce.com',
        ];
    if (origin && !wsAllowedOrigins.includes(origin)) {
      logger.warn(
        { origin, requestId: ws.requestId },
        'WebSocket connection rejected: disallowed origin',
      );
      ws.close(1008, 'Forbidden origin');
      return;
    }

    logger.debug({ requestId: ws.requestId }, 'New WebSocket connection');

    ws.isAlive = true;

    ws.on('error', (error) => {
      logger.error({ error: error.message, requestId: ws.requestId }, 'WebSocket client error');
      if (ws.authTimeout) {
        clearTimeout(ws.authTimeout);
        ws.authTimeout = undefined;
      }
      // The 'close' event will handle cleanup of client from the clients map
    });

    ws.authTimeout = setTimeout(() => {
      if (!ws.userId) {
        logger.warn(
          { requestId: ws.requestId },
          'WebSocket connection closed due to authentication timeout',
        );
        try {
          ws.send(
            JSON.stringify({
              type: 'error',
              error: 'Authentication timeout. Please authenticate within 30 seconds.',
            }),
          );
          ws.close(4001, 'Authentication timeout');
        } catch {
          /* socket may already be closed */
        }
      }
    }, AUTH_TIMEOUT_MS);

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (message: RawData) => {
      try {
        let messageSize: number;
        if (Buffer.isBuffer(message)) {
          messageSize = message.byteLength;
        } else if (Array.isArray(message)) {
          messageSize = message.reduce((acc, buf) => acc + buf.byteLength, 0);
        } else {
          messageSize = message.byteLength;
        }

        if (messageSize > MAX_MESSAGE_SIZE) {
          ws.send(
            JSON.stringify({
              type: 'error',
              error: `Message too large. Maximum size is ${MAX_MESSAGE_SIZE} bytes`,
            }),
          );
          return;
        }

        const now = Date.now();
        let rateLimit = rateLimitTracker.get(ws);
        if (!rateLimit || now >= rateLimit.resetAt) {
          rateLimit = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
          rateLimitTracker.set(ws, rateLimit);
        }
        rateLimit.count++;
        if (rateLimit.count > RATE_LIMIT_MAX_MESSAGES) {
          logger.warn(
            { userId: ws.userId, requestId: ws.requestId },
            'WebSocket rate limit exceeded, closing connection',
          );
          ws.close(1008, 'Rate limit exceeded');
          return;
        }

        const parsed = parseMessage(message);
        if (!parsed) {
          ws.send(
            JSON.stringify({
              type: 'error',
              error: 'Malformed message',
            }),
          );
          return;
        }

        if (parsed.type === 'auth') {
          handleAuthMessage(ws, parsed);
          return;
        }

        if (!ws.userId) {
          ws.send(
            JSON.stringify({
              type: 'error',
              error: 'Not authenticated',
            }),
          );
          return;
        }

        handleMessage(ws, parsed);
      } catch (error) {
        logger.error({ error, requestId: ws.requestId }, 'Error processing WebSocket message');
      }
    });

    ws.on('close', () => {
      if (ws.authTimeout) {
        clearTimeout(ws.authTimeout);
      }

      rateLimitTracker.delete(ws);

      if (ws.userId) {
        const userClients = clients.get(ws.userId);
        if (userClients) {
          userClients.delete(ws);
          if (userClients.size === 0) {
            clients.delete(ws.userId);
          }
        }
        logger.info({ userId: ws.userId, requestId: ws.requestId }, 'User disconnected');
      }
    });
  });

  const interval = setInterval(() => {
    wss.clients.forEach((ws: WebSocket) => {
      const client = ws as AuthenticatedWebSocket;
      if (client.isAlive === false) {
        return client.terminate();
      }

      client.isAlive = false;
      client.ping();
    });
  }, 30000);

  const pendingCleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, queue] of pendingCommands) {
      const valid = queue.filter((cmd) => now - cmd.timestamp < PENDING_COMMAND_TTL);
      if (valid.length === 0) {
        pendingCommands.delete(key);
      } else {
        pendingCommands.set(key, valid);
      }
    }
  }, 60_000);

  wss.on('close', () => {
    clearInterval(interval);
    clearInterval(pendingCleanup);
  });
}

function parseMessage(message: RawData): GatewayMessage | null {
  try {
    let text: string;
    if (Buffer.isBuffer(message)) {
      text = message.toString('utf-8');
    } else if (Array.isArray(message)) {
      text = Buffer.concat(message).toString('utf-8');
    } else {
      text = Buffer.from(message).toString('utf-8');
    }
    const payload = JSON.parse(text);
    return gatewayMessageSchema.parse(payload);
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(
        { validationError: z.treeifyError(error) },
        'WebSocket message failed validation',
      );
    } else {
      logger.warn({ error }, 'WebSocket message parse error');
    }
    return null;
  }
}

async function handleAuthMessage(ws: AuthenticatedWebSocket, message: AuthMessage) {
  try {
    const payload = jwt.verify(message.token, JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'agiworkforce-api-gateway',
      audience: 'agiworkforce',
    });
    const parseResult = authenticatedUserSchema.safeParse(payload);
    if (!parseResult.success) {
      ws.send(
        JSON.stringify({
          type: 'auth_error',
          error: 'Invalid token payload',
        }),
      );
      ws.close();
      return;
    }

    const { userId } = parseResult.data;
    ws.userId = userId;

    if (typeof message.deviceId === 'string' && message.deviceId.length > 0) {
      const wsUserDb = getUserScopedClient({ userId, token: message.token });
      const { data: desktop, error: desktopError } = await wsUserDb
        .from('desktop_devices')
        .select('id')
        .eq('id', message.deviceId)
        .eq('user_id', userId)
        .maybeSingle();

      if (desktop) {
        ws.deviceId = message.deviceId;
      } else {
        if (desktopError) {
          logger.warn(
            { userId, claimedDeviceId: message.deviceId, error: desktopError },
            'WebSocket auth: desktop device ownership lookup failed',
          );
        }

        const { data: pairing } = await wsUserDb
          .from('device_pairings')
          .select('id')
          .eq('user_id', userId)
          .eq('device_id', message.deviceId)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle();

        if (pairing) {
          ws.deviceId = message.deviceId;
        } else {
          logger.warn(
            { userId, claimedDeviceId: message.deviceId },
            'WebSocket auth: deviceId ownership verification failed — ignoring deviceId',
          );
          // Do not set ws.deviceId — connection proceeds without device binding
        }
      }
    } else if (ws.deviceId) {
      delete ws.deviceId;
    }

    if (ws.authTimeout) {
      clearTimeout(ws.authTimeout);
      ws.authTimeout = undefined;
    }

    if (!clients.has(userId)) {
      clients.set(userId, new Set());
    }
    clients.get(userId)!.add(ws);

    ws.send(
      JSON.stringify({
        type: 'auth_success',
        userId,
        requestId: ws.requestId,
      }),
    );

    logger.info({ userId, requestId: ws.requestId }, 'User authenticated via WebSocket');

    flushPendingCommands(ws);
  } catch {
    ws.send(
      JSON.stringify({
        type: 'auth_error',
        error: 'Invalid token',
      }),
    );
    ws.close();
    return;
  }
}

function handleMessage(ws: AuthenticatedWebSocket, data: NonAuthMessage) {
  switch (data.type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;

    case 'command':
      broadcastToUser(ws, {
        type: 'command',
        payload: data.payload,
        from: ws.deviceId,
      });
      break;

    case 'sync':
      broadcastToUser(ws, {
        type: 'sync',
        payload: data.payload,
        from: ws.deviceId,
      });
      break;

    default:
      assertUnreachable(data);
  }
}

interface BroadcastMessage {
  type: 'command' | 'sync';
  payload: unknown;
  from?: string | undefined;
}

function broadcastToUser(ws: AuthenticatedWebSocket, message: BroadcastMessage) {
  const userId = ws.userId;
  if (!userId) {
    ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
    return;
  }

  const userClients = clients.get(userId);
  if (!userClients) {
    return;
  }

  userClients.forEach((client) => {
    if (client !== ws && client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(message));
      } catch (error) {
        logger.warn({ error, userId }, 'Failed to broadcast to client');
      }
    }
  });
}

function assertUnreachable(_value: never): never {
  throw new Error('Unhandled WebSocket message type');
}
