/**
 * @file API Gateway Entry Point
 * @security
 * - Helmet: Security headers (XSS protection, content-type sniffing, etc.)
 * - CORS: Configured allowed origins
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
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { validateContentType, validateSecurityHeaders } from './middleware/requestValidation';
import { createRateLimiter } from './middleware/rateLimit';

if (!process.env['JWT_SECRET']) {
  console.error('FATAL: JWT_SECRET environment variable is required but not set.');
  console.error(
    'Please set JWT_SECRET in your deployment environment (e.g., Vercel, Railway, etc.)',
  );
  console.error('Example: JWT_SECRET=your-randomly-generated-secret-key-here');
  process.exit(1);
}

if (!process.env['SUPABASE_URL'] || !process.env['SUPABASE_SERVICE_ROLE_KEY']) {
  console.error('FATAL: Supabase configuration missing.');
  console.error('Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.');
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
  app.set('trust proxy', true);
}

const corsOrigins = (() => {
  const configured = process.env['ALLOWED_ORIGINS'];
  if (!configured) {
    return ['http://localhost:3000', 'http://localhost:3001'];
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

// SECURITY: Request validation middleware (Content-Type and security headers)
app.use(validateContentType);
app.use(validateSecurityHeaders);

app.use('/api/auth', authRouter);
app.use('/api/desktop', desktopRouter);
app.use('/api/sync', syncRouter);
app.use('/api/mobile', mobileRouter);
app.use('/api/credits', creditsRouter);

// SECURITY: Rate limited to 100/min for monitoring endpoints
app.get('/health', createRateLimiter('health'), (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// 404 handler for undefined routes (must be before error handler)
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

const server = createServer(app);

const wss = new WebSocketServer({ server, path: '/ws' });
setupWebSocket(wss);

server.listen(port, () => {
  console.log(`API Gateway running on port ${port}`);
  console.log(`WebSocket server available at ws://localhost:${port}/ws`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
