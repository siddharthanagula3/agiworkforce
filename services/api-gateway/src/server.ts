import { createServer, type Server } from 'node:http';
import type { Socket } from 'node:net';
import { clearTimeout, setTimeout } from 'node:timers';
import type { Express } from 'express';
import { WebSocketServer } from 'ws';

import { createApp, type GatewayAppOptions } from './app';
import { disposeUserScopedClientPool } from './lib/neonClients';
import { logger } from './lib/logger';
import { setupWebSocket } from './websocket';

const DEFAULT_SHUTDOWN_GRACE_MS = 25_000;

export interface GatewayRuntimeOptions extends Pick<GatewayAppOptions, 'readinessCheck'> {
  app?: Express;
  host?: string;
  port?: number;
  shutdownGraceMs?: number;
  setupWebSocketHandlers?: boolean;
  dispose?: () => Promise<void>;
}

export interface GatewayRuntime {
  readonly server: Server;
  readonly wss: WebSocketServer;
  readonly isAcceptingTraffic: () => boolean;
  readonly start: () => Promise<void>;
  readonly shutdown: (signal?: string) => Promise<void>;
}

function closeHttpServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function closeWebSocketServer(wss: WebSocketServer): Promise<void> {
  return new Promise((resolve, reject) => {
    wss.close((err) => (err ? reject(err) : resolve()));
  });
}

export function createGatewayRuntime(options: GatewayRuntimeOptions = {}): GatewayRuntime {
  const host = options.host ?? process.env['HOST'] ?? '0.0.0.0';
  const port = options.port ?? Number(process.env['PORT'] ?? '3000');
  const shutdownGraceMs =
    options.shutdownGraceMs ??
    Number(process.env['SHUTDOWN_GRACE_MS'] ?? DEFAULT_SHUTDOWN_GRACE_MS);
  const dispose = options.dispose ?? disposeUserScopedClientPool;
  const state = { acceptingTraffic: false };
  const app =
    options.app ??
    createApp({
      isAcceptingTraffic: () => state.acceptingTraffic,
      readinessCheck: options.readinessCheck,
    });
  const server = createServer(app);
  const sockets = new Set<Socket>();
  const maxPayload = Number(process.env['WS_MAX_MESSAGE_SIZE'] ?? 65_536);
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload });
  let shutdownPromise: Promise<void> | undefined;

  if (options.setupWebSocketHandlers !== false) {
    setupWebSocket(wss);
  }

  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });

  const start = (): Promise<void> =>
    new Promise((resolve, reject) => {
      const onError = (err: Error) => {
        server.off('listening', onListening);
        reject(err);
      };
      const onListening = () => {
        server.off('error', onError);
        state.acceptingTraffic = true;
        const address = server.address();
        logger.info({ address, host, port }, 'API Gateway running');
        logger.info({ address, path: '/ws' }, 'WebSocket server available');
        resolve();
      };

      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, host);
    });

  const shutdown = (signal = 'shutdown'): Promise<void> => {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    state.acceptingTraffic = false;
    shutdownPromise = (async () => {
      logger.info({ signal, shutdownGraceMs }, 'Gateway shutdown started');

      for (const client of wss.clients) {
        client.close(1001, 'Server shutting down');
      }

      const forceClose = setTimeout(() => {
        logger.warn({ openSockets: sockets.size }, 'Shutdown deadline reached; closing sockets');
        for (const socket of sockets) {
          socket.destroy();
        }
        for (const client of wss.clients) {
          client.terminate();
        }
      }, shutdownGraceMs);

      const results = await Promise.allSettled([
        closeWebSocketServer(wss),
        closeHttpServer(server),
      ]);
      clearTimeout(forceClose);

      for (const result of results) {
        if (result.status === 'rejected') {
          logger.error({ err: result.reason }, 'Gateway transport failed to close cleanly');
        }
      }

      try {
        await dispose();
      } catch (err) {
        logger.error({ err }, 'Failed to dispose gateway database resources');
      }

      logger.info({}, 'Gateway shutdown complete');
    })();

    return shutdownPromise;
  };

  return {
    server,
    wss,
    isAcceptingTraffic: () => state.acceptingTraffic,
    start,
    shutdown,
  };
}

export function installSignalHandlers(runtime: GatewayRuntime): void {
  const handleSignal = (signal: NodeJS.Signals) => {
    runtime
      .shutdown(signal)
      .then(() => process.exit(0))
      .catch((err) => {
        logger.fatal({ err, signal }, 'Gateway shutdown failed');
        process.exit(1);
      });
  };

  process.once('SIGTERM', handleSignal);
  process.once('SIGINT', handleSignal);
}
