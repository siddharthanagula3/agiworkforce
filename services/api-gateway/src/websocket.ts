import { WebSocketServer, WebSocket, type RawData } from 'ws';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { AuthenticatedUser } from './middleware/auth';

const JWT_SECRET = process.env['JWT_SECRET'] || 'your-secret-key-change-in-production';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  deviceId?: string;
  isAlive?: boolean;
}

const clients = new Map<string, Set<AuthenticatedWebSocket>>();

const authMessageSchema = z.object({
  type: z.literal('auth'),
  token: z.string(),
  deviceId: z.string().optional(),
});

const nonAuthMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ping'),
  }),
  z.object({
    type: z.literal('command'),
    payload: z.unknown(),
  }),
  z.object({
    type: z.literal('sync'),
    payload: z.unknown(),
  }),
]);

const gatewayMessageSchema = z.union([authMessageSchema, nonAuthMessageSchema]);

type GatewayMessage = z.infer<typeof gatewayMessageSchema>;
type AuthMessage = z.infer<typeof authMessageSchema>;
type NonAuthMessage = z.infer<typeof nonAuthMessageSchema>;

export function setupWebSocket(wss: WebSocketServer) {
  wss.on('connection', (ws: AuthenticatedWebSocket) => {
    console.log('New WebSocket connection');

    // Mark connection as alive
    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (message: RawData) => {
      try {
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
        console.error('Error processing WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      if (ws.userId) {
        const userClients = clients.get(ws.userId);
        if (userClients) {
          userClients.delete(ws);
          if (userClients.size === 0) {
            clients.delete(ws.userId);
          }
        }
        console.log(`User ${ws.userId} disconnected`);
      }
    });
  });

  // Heartbeat to detect broken connections
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

  wss.on('close', () => {
    clearInterval(interval);
  });
}

function parseMessage(message: RawData): GatewayMessage | null {
  try {
    const text = typeof message === 'string' ? message : message.toString();
    const payload = JSON.parse(text);
    return gatewayMessageSchema.parse(payload);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.warn('WebSocket message failed validation', error.flatten());
    } else {
      console.warn('WebSocket message parse error', error);
    }
    return null;
  }
}

function handleAuthMessage(ws: AuthenticatedWebSocket, message: AuthMessage) {
  try {
    const payload = jwt.verify(message.token, JWT_SECRET);
    if (!isAuthenticatedPayload(payload)) {
      ws.send(
        JSON.stringify({
          type: 'auth_error',
          error: 'Invalid token payload',
        }),
      );
      ws.close();
      return;
    }

    const { userId } = payload as { userId: string };
    ws.userId = userId;
    if (typeof message.deviceId === 'string') {
      ws.deviceId = message.deviceId;
    } else if (ws.deviceId) {
      delete ws.deviceId;
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

    console.log(`User ${userId} authenticated via WebSocket`);
  } catch (error) {
    ws.send(
      JSON.stringify({
        type: 'auth_error',
        error: 'Invalid token',
      }),
    );
    ws.close();
  }
}

function handleMessage(ws: AuthenticatedWebSocket, data: NonAuthMessage) {
  switch (data.type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;

    case 'command':
      // Broadcast command to all user's devices except sender
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

function isAuthenticatedPayload(payload: unknown): payload is AuthenticatedUser {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Partial<AuthenticatedUser>;
  return typeof candidate.userId === 'string';
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
      client.send(JSON.stringify(message));
    }
  });
}

function assertUnreachable(_value: never): never {
  throw new Error('Unhandled WebSocket message type');
}
