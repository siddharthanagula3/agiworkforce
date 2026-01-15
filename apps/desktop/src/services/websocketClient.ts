import { invoke } from '../lib/tauri-mock';
import { calculateDelay } from '../lib/retry';

export interface RealtimeEvent {
  type: string;
  [key: string]: unknown;
}

export interface UserPresence {
  user_id: string;
  status: 'Online' | 'Away' | 'Busy' | 'Offline';
  last_seen: number;
  current_activity?: UserActivity;
}

export interface UserActivity {
  activity_type: 'EditingGoal' | 'EditingWorkflow' | 'ViewingAnalytics' | 'RunningAutomation';
  resource_id: string;
  started_at: number;
}

export interface CursorPosition {
  x: number;
  y: number;
  element_id?: string;
}

type EventHandler = (event: RealtimeEvent) => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private eventHandlers: Map<string, Set<EventHandler>> = new Map();
  private userId: string | null = null;
  private teamId: string | null = null;

  async connect(userId: string, teamId?: string): Promise<void> {
    this.userId = userId;
    this.teamId = teamId || null;

    try {
      const url = await invoke<string>('connect_websocket', { userId, teamId });

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;

        this.send({
          type: 'Authenticate',
          user_id: userId,
          team_id: teamId,
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as RealtimeEvent;
          this.handleEvent(data);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onclose = () => {
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        // Notify error handlers about the connection error
        const errorHandlers = this.eventHandlers.get('error');
        if (errorHandlers) {
          errorHandlers.forEach((handler) => {
            try {
              handler({ type: 'error', error: 'WebSocket connection error' });
            } catch (handlerError) {
              console.error('Error in WebSocket error handler:', handlerError);
            }
          });
        }
      };
    } catch (error) {
      console.error('Failed to connect to WebSocket:', error);

      this.reconnectAttempts++;
      throw error;
    }
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.reconnectAttempts = 0;
  }

  send(event: RealtimeEvent): boolean {
    if (!this.ws) {
      console.warn('WebSocket not initialized, cannot send event:', event.type);
      return false;
    }

    if (this.ws.readyState !== WebSocket.OPEN) {
      console.warn(
        `WebSocket not connected (state: ${this.ws.readyState}), cannot send event:`,
        event.type,
      );
      return false;
    }

    try {
      this.ws.send(JSON.stringify(event));
      return true;
    } catch (error) {
      console.error('Failed to send WebSocket event:', error);
      // Notify error handlers about the send failure
      const errorHandlers = this.eventHandlers.get('error');
      if (errorHandlers) {
        errorHandlers.forEach((handler) => {
          try {
            handler({ type: 'error', error: 'Failed to send WebSocket message', event });
          } catch (handlerError) {
            console.error('Error in WebSocket error handler:', handlerError);
          }
        });
      }
      return false;
    }
  }

  on(eventType: string, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);

    return () => {
      const handlers = this.eventHandlers.get(eventType);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.eventHandlers.delete(eventType);
        }
      }
    };
  }

  private handleEvent(event: RealtimeEvent): void {
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(event);
        } catch (error) {
          console.error('Error in event handler:', error);
        }
      });
    }

    const wildcardHandlers = this.eventHandlers.get('*');
    if (wildcardHandlers) {
      wildcardHandlers.forEach((handler) => {
        try {
          handler(event);
        } catch (error) {
          console.error('Error in wildcard event handler:', error);
        }
      });
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts && this.userId) {
      this.reconnectAttempts++;

      // Use exponential backoff with jitter to prevent thundering herd
      const delay = calculateDelay(this.reconnectAttempts, {
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
        jitter: true,
        jitterFactor: 0.25,
      });

      console.log(
        `WebSocket reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`,
      );

      this.reconnectTimeout = setTimeout(() => {
        if (this.userId) {
          this.connect(this.userId, this.teamId || undefined).catch((error) => {
            console.error('Reconnection failed:', error);
          });
        }
      }, delay);
    } else {
      console.error('Max reconnection attempts reached');
      // Notify subscribers about connection failure
      const errorHandlers = this.eventHandlers.get('error');
      if (errorHandlers) {
        errorHandlers.forEach((handler) => {
          try {
            handler({
              type: 'error',
              error: 'Max reconnection attempts reached',
              fatal: true,
            });
          } catch (handlerError) {
            console.error('Error in WebSocket error handler:', handlerError);
          }
        });
      }
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const websocketClient = new WebSocketClient();
