/**
 * @file API Gateway Entry Point
 * @security
 * - Helmet: Security headers (XSS protection, content-type sniffing, etc.)
 * - CORS: Configured allowed origins
 * - CSRF: Custom header (X-Requested-With) required on state-changing requests
 * - Rate limiting: Applied per-route (see individual route files)
 * - Content-Type validation: Enforces application/json
 * - Security header monitoring: Logs suspicious headers in production
 */

import express, { type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';

import { authRouter } from './routes/auth';
import { desktopRouter } from './routes/desktop';
import { syncRouter } from './routes/sync';
import { creditsRouter } from './routes/credits';
import { setupWebSocket } from './websocket';
import { mobileRouter } from './routes/mobile';
import { providerHealthRouter } from './services/providerHealth';
import { modelCatalogRouter } from './routes/models';
import { cloudChatRouter } from './routes/cloudChat';
import { llmRouter } from './routes/llm';
import { providerStreamRouter } from './routes/providerStream';
import { usageRouter } from './routes/usage';
import { deviceAuthRouter } from './routes/deviceAuth';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import {
  validateContentType,
  validateSecurityHeaders,
  validateCsrf,
} from './middleware/requestValidation';
import { createRateLimiter } from './middleware/rateLimit';
import { logger } from './lib/logger';
import { validateStartupEnv } from './env';
import { supabase } from './lib/supabase';

try {
  validateStartupEnv();
} catch (err) {
  logger.fatal({}, (err as Error).message);
  process.exit(1);
}

const app = express();
const port = Number(process.env['PORT'] ?? '3000');

// Configure application settings
app.set('port', port);
app.set('json spaces', 0); // Compact JSON output for APIs
app.disable('x-powered-by'); // Remove X-Powered-By header for security

// Trust proxy if behind a reverse proxy (e.g., Nginx, load balancer)
if (process.env['TRUST_PROXY'] === 'true') {
  app.set('trust proxy', 1);
}

const corsOrigins = (() => {
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
})();

// Security middleware - helmet provides security headers
app.use(helmet());
app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  }),
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// SECURITY: Request validation middleware (Content-Type, security headers, CSRF)
app.use(validateContentType);
app.use(validateSecurityHeaders);
app.use(validateCsrf);

app.use('/api/auth', authRouter);
app.use('/auth/device', deviceAuthRouter);
app.use('/api/auth/device', deviceAuthRouter);
app.use('/api/desktop', desktopRouter);
app.use('/api/sync', syncRouter);
app.use('/api/mobile', mobileRouter);
app.use('/api/credits', creditsRouter);
app.use('/api/providers', providerHealthRouter);
app.use('/api/models', modelCatalogRouter);
app.use('/api/cloud-chat', cloudChatRouter);
app.use('/api/llm/v1', llmRouter);
app.use('/api/v1/providers', providerStreamRouter);
app.use('/api/v1/usage', usageRouter);

// SECURITY: Rate limited to 100/min for monitoring endpoints
app.get('/health', createRateLimiter('health'), (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    version: '1.1.5',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// SECURITY: Rate limited to 100/min for status checks
app.get('/api/v1/status', createRateLimiter('status'), async (_req: Request, res: Response) => {
  try {
    // Check Supabase connectivity with a simple query
    const { error } = await supabase.from('users').select('count', { count: 'exact', head: true });

    res.json({
      database: error ? 'error' : 'connected',
      gateway: 'ok',
    });
  } catch (err) {
    logger.error({ err }, 'Status check failed');
    res.status(500).json({
      database: 'error',
      gateway: 'ok',
    });
  }
});

// 404 handler for undefined routes (must be before error handler)
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

const server = createServer(app);

const MAX_WS_PAYLOAD = Number(process.env['WS_MAX_MESSAGE_SIZE'] ?? 65536);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_WS_PAYLOAD });
setupWebSocket(wss);

server.listen(port, () => {
  logger.info({ port }, 'API Gateway running');
  logger.info({ port, path: '/ws' }, 'WebSocket server available');
});

process.on('SIGTERM', () => {
  logger.info({}, 'SIGTERM received, closing server');
  // Close all WebSocket connections gracefully before shutting down
  wss.clients.forEach((client) => {
    client.close(1001, 'Server shutting down');
  });
  wss.close();
  server.close(() => {
    logger.info({}, 'Server closed');
    process.exit(0);
  });
});
