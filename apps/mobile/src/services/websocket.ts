export type GatewayEvent =
  | { type: 'auth_success'; userId: string }
  | { type: 'auth_error'; error: string }
  | { type: 'command'; payload: unknown; from?: string }
  | { type: 'sync'; payload: unknown; from?: string }
  | { type: 'pong'; timestamp: number }
  | { type: 'error'; error: string };

export interface GatewayClientOptions {
  token: string;
  deviceId?: string;
  url?: string;
  onEvent: (event: GatewayEvent) => void;
}

export interface GatewayClient {
  sendCommand(payload: unknown): void;
  sendSync(payload: unknown): void;
  disconnect(): void;
}

export function createGatewayClient({
  token,
  deviceId,
  url = 'ws://localhost:3000/ws',
  onEvent,
}: GatewayClientOptions): GatewayClient {
  const socket = new WebSocket(url);

  const send = (data: unknown) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    }
  };

  socket.addEventListener('open', () => {
    send({
      type: 'auth',
      token,
      deviceId,
    });
  });

  socket.addEventListener('message', (message) => {
    try {
      const data = JSON.parse(message.data as string) as GatewayEvent;
      onEvent(data);
    } catch (error) {
      console.warn('Failed to parse gateway message', error);
    }
  });

  socket.addEventListener('close', () => {
    onEvent({ type: 'error', error: 'Connection closed' });
  });

  socket.addEventListener('error', () => {
    onEvent({ type: 'error', error: 'Connection error' });
  });

  const pingInterval = setInterval(() => {
    send({ type: 'ping' });
  }, 30000);

  return {
    sendCommand(payload: unknown) {
      send({
        type: 'command',
        payload,
      });
    },
    sendSync(payload: unknown) {
      send({
        type: 'sync',
        payload,
      });
    },
    disconnect() {
      clearInterval(pingInterval);
      socket.close();
    },
  };
}
