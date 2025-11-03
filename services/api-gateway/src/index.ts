import express, { type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import dotenv from 'dotenv';

import { authRouter } from './routes/auth';
import { desktopRouter } from './routes/desktop';
import { syncRouter } from './routes/sync';
import { setupWebSocket } from './websocket';
import { mobileRouter } from './routes/mobile';

dotenv.config();

const app = express();
const port = Number(process.env['PORT'] ?? '3000');

const corsOrigins = (() => {
  const configured = process.env['ALLOWED_ORIGINS'];
  if (!configured) {
    return ['http://localhost:5173'];
  }
  return configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
})();

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  }),
);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use('/api/auth', authRouter);
app.use('/api/desktop', desktopRouter);
app.use('/api/sync', syncRouter);
app.use('/api/mobile', mobileRouter);

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Create HTTP server
const server = createServer(app);

// WebSocket server for real-time communication
const wss = new WebSocketServer({ server, path: '/ws' });
setupWebSocket(wss);

// Start server
server.listen(port, () => {
  console.log(`API Gateway running on port ${port}`);
  console.log(`WebSocket server available at ws://localhost:${port}/ws`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
