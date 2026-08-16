import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import helmet from 'helmet';

import { agentsRouter } from './routes/agents';
import { authRouter } from './routes/auth';
import { chatRouter } from './routes/chat';
import { cloudChatRouter } from './routes/cloudChat';
import { creditsRouter } from './routes/credits';
import { desktopRouter } from './routes/desktop';
import { deviceAuthRouter } from './routes/deviceAuth';
import { enterpriseRouter } from './routes/enterprise';
import { llmRouter } from './routes/llm';
import { mobileRouter } from './routes/mobile';
import { modelCatalogRouter } from './routes/models';
import { pairRouter } from './routes/pair';
import { providerStreamRouter } from './routes/providerStream';
import { syncRouter } from './routes/sync';
import { usageRouter } from './routes/usage';
import { mcpRouter } from './mcp/mcpRoutes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestContext, getRequestId } from './middleware/requestContext';
import { responseCompression } from './middleware/responseCompression';
import {
  validateContentType,
  validateCsrf,
  validateSecurityHeaders,
} from './middleware/requestValidation';
import { getSystemClient } from './lib/neonClients';
import { logger } from './lib/logger';
import { providerHealthRouter } from './services/providerHealth';

const SERVICE_NAME = 'api-gateway';

export interface GatewayAppOptions {
  isAcceptingTraffic?: () => boolean;
  readinessCheck?: () => Promise<void>;
}

async function checkDatabaseReadiness(): Promise<void> {
  const { error } = await getSystemClient('gateway-health')
    .from('profiles')
    .select('id', { count: 'exact', head: true });

  if (error) {
    throw new Error(error.message);
  }
}

function configuredCorsOrigins(): string[] {
  const configured = process.env['ALLOWED_ORIGINS'];
  if (!configured) {
    return [
      'http://localhost:3000',
      'http://localhost:3001',
      'tauri://localhost',
      'https://tauri.localhost',
      'https://chat.agiworkforce.com',
      'https://www.agiworkforce.com',
      'https://agiworkforce.com',
    ];
  }

  return configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function createApp(options: GatewayAppOptions = {}): Express {
  const app = express();
  const isAcceptingTraffic = options.isAcceptingTraffic ?? (() => true);
  const readinessCheck = options.readinessCheck ?? checkDatabaseReadiness;

  app.set('json spaces', 0);
  app.disable('x-powered-by');

  if (process.env['TRUST_PROXY'] === 'true') {
    app.set('trust proxy', 1);
  }

  app.use(requestContext);
  // Ahead of the routers so it wraps every response body, and ahead of helmet
  // only in the sense that ordering here does not matter for header-setting
  // middleware. Fly does not compress at the edge the way Vercel does, so
  // without this the gateway ships every JSON body uncompressed.
  app.use(responseCompression());
  app.use(helmet());
  app.use(
    cors({
      origin: configuredCorsOrigins(),
      credentials: true,
    }),
  );

  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: SERVICE_NAME,
      release: process.env['RELEASE_SHA'] ?? 'development',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/ready', async (_req: Request, res: Response) => {
    const requestId = getRequestId(res);

    if (!isAcceptingTraffic()) {
      res.status(503).json({
        status: 'not_ready',
        service: SERVICE_NAME,
        requestId,
      });
      return;
    }

    try {
      await readinessCheck();
      res.json({
        status: 'ready',
        service: SERVICE_NAME,
        requestId,
      });
    } catch (err) {
      logger.warn({ err, requestId }, 'Readiness dependency check failed');
      res.status(503).json({
        status: 'not_ready',
        service: SERVICE_NAME,
        requestId,
      });
    }
  });

  app.use(express.json({ limit: '128kb' }));
  app.use(express.urlencoded({ extended: true, limit: '128kb' }));
  app.use(validateContentType);
  app.use(validateSecurityHeaders);
  app.use(validateCsrf);

  app.use('/api/auth', authRouter);
  app.use('/auth/device', deviceAuthRouter);
  app.use('/api/auth/device', deviceAuthRouter);
  app.use('/api/desktop', desktopRouter);
  app.use('/api/sync', syncRouter);
  app.use('/api/mobile', mobileRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/pair', pairRouter);
  app.use('/api/credits', creditsRouter);
  app.use('/api/providers', providerHealthRouter);
  app.use('/api/models', modelCatalogRouter);
  app.use('/api/cloud-chat', cloudChatRouter);
  app.use('/api/llm/v1', llmRouter);
  app.use('/api/v1/providers', providerStreamRouter);
  app.use('/api/v1/usage', usageRouter);
  app.use('/api/v1/enterprise', enterpriseRouter);
  app.use('/api/agents', agentsRouter);
  app.use('/api/mcp', mcpRouter);

  app.get('/api/v1/status', async (_req: Request, res: Response) => {
    const requestId = getRequestId(res);
    try {
      await readinessCheck();
      res.json({ database: 'connected', gateway: 'ok', requestId });
    } catch (err) {
      logger.warn({ err, requestId }, 'Status dependency check failed');
      res.status(503).json({ database: 'error', gateway: 'ok', requestId });
    }
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
