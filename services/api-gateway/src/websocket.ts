import { WebSocketServer, WebSocket, type RawData } from 'ws';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { authenticatedUserSchema } from './authenticated-user';
import { requireEnv } from './env';
import { logger } from './lib/logger';
import { supabase } from './lib/supabase';

const JWT_SECRET = requireEnv('JWT_SECRET');

// Maximum message size in bytes (64KB default)
const MAX_MESSAGE_SIZE = Number(process.env['WS_MAX_MESSAGE_SIZE'] ?? 65536);

// Authentication timeout - close connection if not authenticated within this time
const AUTH_TIMEOUT_MS = Number(process.env['WS_AUTH_TIMEOUT_MS'] ?? 30000); // 30 seconds default

// Rate limiting: max messages per connection within a sliding window
const RATE_LIMIT_MAX_MESSAGES = Number(process.env['WS_RATE_LIMIT_MAX_MESSAGES'] ?? 100);
const RATE_LIMIT_WINDOW_MS = Number(process.env['WS_RATE_LIMIT_WINDOW_MS'] ?? 60000); // 60 seconds default

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  deviceId?: string;
  isAlive?: boolean;
  authTimeout?: ReturnType<typeof setTimeout>;
}

const clients = new Map<string, Set<AuthenticatedWebSocket>>();

// Per-connection rate limiting tracker
const rateLimitTracker = new Map<AuthenticatedWebSocket, { count: number; resetAt: number }>();

// Pending commands queue for offline desktops (in-memory, limited to 100 per user/device)
const pendingCommands = new Map<
  string,
  Array<{ commandId: string; type: string; payload: unknown; timestamp: number }>
>();
const MAX_PENDING_COMMANDS = 100;
const PENDING_COMMAND_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Send a command to a specific desktop device via WebSocket
 * Returns true if delivered, false if queued for later delivery
 */
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
    // Queue command for later delivery
    const queueKey = `${userId}:${desktopId}`;
    if (!pendingCommands.has(queueKey)) {
      pendingCommands.set(queueKey, []);
    }
    const queue = pendingCommands.get(queueKey)!;

    // Remove expired commands
    const now = Date.now();
    const validCommands = queue.filter((cmd) => now - cmd.timestamp < PENDING_COMMAND_TTL);

    // Enforce max queue size
    if (validCommands.length >= MAX_PENDING_COMMANDS) {
      validCommands.shift(); // Remove oldest
    }

    validCommands.push({ commandId, type, payload, timestamp: now });
    pendingCommands.set(queueKey, validCommands);

    return { delivered: false, queued: true };
  }

  return { delivered: true, queued: false };
}

/**
 * Flush pending commands to a newly connected desktop
 */
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

// SECURITY (H3, redteam-services 2026-05-04): the WS broadcast endpoints
// previously accepted `payload: z.unknown()` which let a compromised peer
// device send arbitrary commands to the user's other devices, bypassing
// the desktop ownership/approval pipeline enforced over HTTPS at
// services/api-gateway/src/routes/desktop.ts. We now require an explicit
// allowlist of command types and a small payload schema for each. New
// command types MUST be added here AND mirror the discriminated union in
// the desktop's commandSchema (desktop.ts).
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
    // sync events are descriptive — they carry small state deltas that the
    // receiver applies to its local cache. We bound the size with a JSON
    // serialization check at parse time.
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
  // Handle WebSocket server errors
  wss.on('error', (error) => {
    logger.error({ error }, 'WebSocketServer error');
  });

  wss.on('connection', (ws: AuthenticatedWebSocket, request) => {
    // SECURITY: Validate Origin header to prevent cross-site WebSocket hijacking.
    // Uses ALLOWED_ORIGINS (same env var as HTTP CORS) with sensible defaults
    // so the check is never bypassed when the env var is unset.
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
      logger.warn({ origin }, 'WebSocket connection rejected: disallowed origin');
      ws.close(1008, 'Forbidden origin');
      return;
    }

    logger.debug({}, 'New WebSocket connection');

    ws.isAlive = true;

    // Handle individual socket errors to prevent unhandled exceptions
    ws.on('error', (error) => {
      logger.error({ error: error.message }, 'WebSocket client error');
      // Clean up auth timeout if exists
      if (ws.authTimeout) {
        clearTimeout(ws.authTimeout);
        ws.authTimeout = undefined;
      }
      // The 'close' event will handle cleanup of client from the clients map
    });

    // Set authentication timeout - close connection if not authenticated in time
    ws.authTimeout = setTimeout(() => {
      if (!ws.userId) {
        logger.warn({}, 'WebSocket connection closed due to authentication timeout');
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
        // Check message size before processing
        // RawData is Buffer | ArrayBuffer | Buffer[]
        let messageSize: number;
        if (Buffer.isBuffer(message)) {
          messageSize = message.byteLength;
        } else if (Array.isArray(message)) {
          // Buffer[] - sum up all buffer sizes
          messageSize = message.reduce((acc, buf) => acc + buf.byteLength, 0);
        } else {
          // ArrayBuffer
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

        // Per-connection rate limiting (sliding window)
        const now = Date.now();
        let rateLimit = rateLimitTracker.get(ws);
        if (!rateLimit || now >= rateLimit.resetAt) {
          rateLimit = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
          rateLimitTracker.set(ws, rateLimit);
        }
        rateLimit.count++;
        if (rateLimit.count > RATE_LIMIT_MAX_MESSAGES) {
          logger.warn({ userId: ws.userId }, 'WebSocket rate limit exceeded, closing connection');
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
        logger.error({ error }, 'Error processing WebSocket message');
      }
    });

    ws.on('close', () => {
      // Clear auth timeout on disconnect
      if (ws.authTimeout) {
        clearTimeout(ws.authTimeout);
      }

      // Clean up rate limit tracking to prevent memory leaks
      rateLimitTracker.delete(ws);

      if (ws.userId) {
        const userClients = clients.get(ws.userId);
        if (userClients) {
          userClients.delete(ws);
          if (userClients.size === 0) {
            clients.delete(ws.userId);
          }
        }
        logger.info({ userId: ws.userId }, 'User disconnected');
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

  // Periodic cleanup of expired pending commands to prevent memory leaks
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
    // RawData is Buffer | ArrayBuffer | Buffer[], convert to string
    let text: string;
    if (Buffer.isBuffer(message)) {
      text = message.toString('utf-8');
    } else if (Array.isArray(message)) {
      text = Buffer.concat(message).toString('utf-8');
    } else {
      // ArrayBuffer
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

    // SECURITY: Verify deviceId ownership before accepting it
    if (typeof message.deviceId === 'string' && message.deviceId.length > 0) {
      const { data: pairing } = await supabase
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
    } else if (ws.deviceId) {
      delete ws.deviceId;
    }

    // Clear auth timeout on successful authentication
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
      }),
    );

    logger.info({ userId }, 'User authenticated via WebSocket');

    // Flush any pending commands for this device
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
