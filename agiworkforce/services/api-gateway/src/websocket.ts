import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  deviceId?: string;
  isAlive?: boolean;
}

const clients = new Map<string, Set<AuthenticatedWebSocket>>();

export function setupWebSocket(wss: WebSocketServer) {
  wss.on('connection', (ws: AuthenticatedWebSocket, req) => {
    console.log('New WebSocket connection');

    // Mark connection as alive
    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());

        // Handle authentication
        if (data.type === 'auth') {
          try {
            const payload = jwt.verify(data.token, JWT_SECRET) as {
              userId: string;
              email: string;
            };
            ws.userId = payload.userId;
            ws.deviceId = data.deviceId;

            // Add to clients map
            if (!clients.has(payload.userId)) {
              clients.set(payload.userId, new Set());
            }
            clients.get(payload.userId)!.add(ws);

            ws.send(JSON.stringify({
              type: 'auth_success',
              userId: payload.userId,
            }));

            console.log(`User ${payload.userId} authenticated via WebSocket`);
          } catch (error) {
            ws.send(JSON.stringify({
              type: 'auth_error',
              error: 'Invalid token',
            }));
            ws.close();
          }
        }

        // Handle messages from authenticated clients
        else if (ws.userId) {
          handleMessage(ws, data);
        } else {
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Not authenticated',
          }));
        }
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

function handleMessage(ws: AuthenticatedWebSocket, data: any) {
  switch (data.type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;

    case 'command':
      // Broadcast command to all user's devices except sender
      if (ws.userId) {
        const userClients = clients.get(ws.userId);
        if (userClients) {
          userClients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'command',
                payload: data.payload,
                from: ws.deviceId,
              }));
            }
          });
        }
      }
      break;

    case 'sync':
      // Sync state across devices
      if (ws.userId) {
        const userClients = clients.get(ws.userId);
        if (userClients) {
          userClients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'sync',
                payload: data.payload,
                from: ws.deviceId,
              }));
            }
          });
        }
      }
      break;

    default:
      ws.send(JSON.stringify({
        type: 'error',
        error: `Unknown message type: ${data.type}`,
      }));
  }
}
