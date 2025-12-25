import express, { type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';

import { authRouter } from './routes/auth';
import { desktopRouter } from './routes/desktop';
import { syncRouter } from './routes/sync';
import { setupWebSocket } from './websocket';
import { mobileRouter } from './routes/mobile';

if (!process.env['JWT_SECRET']) {
  console.error('FATAL: JWT_SECRET environment variable is required but not set.');
  console.error(
    'Please set JWT_SECRET in your deployment environment (e.g., Vercel, Railway, etc.)',
  );
  console.error('Example: JWT_SECRET=your-randomly-generated-secret-key-here');
  process.exit(1);
}

const app = express();
const port = Number(process.env['PORT'] ?? '3000');

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

app.use(helmet());
app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRouter);
app.use('/api/desktop', desktopRouter);
app.use('/api/sync', syncRouter);
app.use('/api/mobile', mobileRouter);

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

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
