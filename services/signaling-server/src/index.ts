/**
 * @file Signaling Server for WebRTC Pairing
 * @security
 * - Rate limiting: Applied to HTTP endpoints and WebSocket messages to prevent abuse
 * - Input validation: Zod schemas validate all WebSocket messages with strict patterns
 * - Message size limits: MAX_MESSAGE_SIZE_BYTES prevents DoS
 * - Session expiry: Automatic cleanup of expired sessions
 * - Connection limits: Per-IP connection limits prevent resource exhaustion
 * - Security headers: OWASP-compliant headers on all HTTP responses
 * - Admin authentication: API key validation for admin/metrics endpoints
 * - DDoS protection: Automatic blacklisting of repeat offenders
 *
 * Rate limit rationale (OWASP compliant):
 * - POST /pairings: 10/min - strict to prevent enumeration attacks
 * - GET /pairings/:code: 60/min - lookups are read-only
 * - DELETE /pairings/:code: 10/min - destructive operation
 * - WebSocket messages: 100/min per IP - prevents message floods
 *
 * Health endpoints:
 * - GET /health: Detailed health status with uptime, connections, memory
 * - GET /ready: Returns 200 when server is ready to accept connections
 * - GET /live: Returns 200 if process is alive (liveness probe)
 * - GET /metrics: Prometheus-compatible metrics endpoint (requires admin auth)
 *
 * Admin endpoints (require ADMIN_API_KEY):
 * - GET /admin/status: Server configuration and status
 * - POST /admin/blacklist: Manually blacklist an IP address
 */

import 'dotenv/config';

if (!process.env.NODE_ENV) {
  console.warn('[signaling-server] NODE_ENV is not set — defaulting to "development"');
  process.env.NODE_ENV = 'development';
}

import cors from 'cors';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { createServer, type Server } from 'http';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import { supabase } from './db.js';
import { logger, generateCorrelationId } from './logger.js';
import { connectionManager } from './connection-manager.js';
import { metrics } from './metrics.js';
import {
  securityHeadersMiddleware,
  disablePoweredBy,
  adminAuthMiddleware,
  isAdminEnabled,
  cleanupAuthFailures,
  wsRateLimiter,
} from './middleware/index.js';
import {
  DEFAULT_PAIRING_TTL_SECONDS,
  DEFAULT_HOST,
  DEFAULT_PORT,
  DEFAULT_WS_PATH,
  MAX_MESSAGE_SIZE_BYTES,
  MAX_SDP_SIZE,
  MAX_ICE_CANDIDATE_SIZE,
  MAX_SDP_MID_SIZE,
  MAX_SDP_MLINE_INDEX,
  MAX_USERNAME_FRAGMENT_SIZE,
  MAX_CONTROL_PAYLOAD_SIZE,
  MAX_ACTION_NAME_SIZE,
  PAIRING_CODE_LENGTH,
  CODE_GENERATION_MAX_ATTEMPTS,
  SESSION_CLEANUP_INTERVAL_MS,
  MAX_PENDING_REHYDRATIONS,
  PENDING_REHYDRATION_TTL_MS,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_RETRY_AFTER_SECONDS,
  RATE_LIMIT_PAIRING_CREATE,
  RATE_LIMIT_PAIRING_LOOKUP,
  RATE_LIMIT_PAIRING_DELETE,
  RATE_LIMIT_HEALTH_CHECK,
  RATE_LIMIT_METRICS,
  RATE_LIMIT_ADMIN,
  DEFAULT_ALLOWED_ORIGINS,
  DB_ERROR_CODES,
  GRACEFUL_SHUTDOWN_TIMEOUT_MS,
  SHUTDOWN_DRAIN_TIMEOUT_MS,
  PAIRING_CODE_PATTERN,
  MAX_METADATA_SIZE_BYTES,
  MAX_METADATA_KEYS,
} from './constants.js';

// =============================================================================
// Types
// =============================================================================

type Role = 'desktop' | 'mobile';

interface Participant {
  socket: WebSocket;
  role: Role;
  connectedAt: number;
  metadata: Record<string, unknown> | null;
}

interface Session {
  code: string;
  createdAt: number;
  expiresAt: number;
  participants: Partial<Record<Role, Participant>>;
  metadata: Record<string, unknown> | null;
}

interface ConnectedClient {
  code: string;
  role: Role;
}

// =============================================================================
// Server State
// =============================================================================

let isShuttingDown = false;
let isReady = false;

const DEFAULT_TTL_SECONDS = Number(
  process.env['SIGNALING_PAIRING_TTL'] ?? DEFAULT_PAIRING_TTL_SECONDS,
);
const host = process.env['SIGNALING_HOST'] ?? DEFAULT_HOST;
const port = Number(process.env['PORT'] ?? process.env['SIGNALING_PORT'] ?? DEFAULT_PORT);
const wsPath = process.env['SIGNALING_WS_PATH'] ?? DEFAULT_WS_PATH;
const publicHttpUrl = process.env['SIGNALING_HTTP_URL'] ?? `http://${host}:${port}`;
const publicWsUrl =
  process.env['SIGNALING_WS_URL'] ??
  `${publicHttpUrl.startsWith('https') ? 'wss' : 'ws'}://${host}:${port}${wsPath}`;

// =============================================================================
// Express App Setup
// =============================================================================

const app = express();

// SECURITY: Disable X-Powered-By header to reduce information leakage
disablePoweredBy(app);

// SECURITY: Apply security headers to all responses (OWASP compliant)
app.use(securityHeadersMiddleware);

// Add correlation ID to requests for distributed tracing
app.use((req: Request, _res: Response, next: NextFunction) => {
  (req as Request & { correlationId?: string }).correlationId =
    (req.headers['x-correlation-id'] as string) ?? generateCorrelationId();
  next();
});

// Configure CORS with allowed origins
const allowedOrigins = (() => {
  const configured = process.env['ALLOWED_ORIGINS'];
  if (!configured) {
    return [...DEFAULT_ALLOWED_ORIGINS];
  }
  return configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
})();

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Correlation-ID'],
    maxAge: 86400, // 24 hours - cache preflight requests
  }),
);

// SECURITY: Limit JSON body size to prevent large payload attacks
app.use(express.json({ limit: '16kb' }));

// =============================================================================
// Rate Limiters
// =============================================================================

// Pairing creation - strict to prevent enumeration attacks
const pairingCreateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_PAIRING_CREATE,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'RATE_LIMIT_EXCEEDED',
    message: `Too many pairing requests. Please try again after ${RATE_LIMIT_RETRY_AFTER_SECONDS} seconds.`,
    retryAfter: RATE_LIMIT_RETRY_AFTER_SECONDS,
  },
});

// Pairing lookup - read-only operations
const pairingLookupLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_PAIRING_LOOKUP,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'RATE_LIMIT_EXCEEDED',
    message: `Too many lookup requests. Please try again after ${RATE_LIMIT_RETRY_AFTER_SECONDS} seconds.`,
    retryAfter: RATE_LIMIT_RETRY_AFTER_SECONDS,
  },
});

// Pairing deletion - destructive operation
const pairingDeleteLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_PAIRING_DELETE,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'RATE_LIMIT_EXCEEDED',
    message: `Too many delete requests. Please try again after ${RATE_LIMIT_RETRY_AFTER_SECONDS} seconds.`,
    retryAfter: RATE_LIMIT_RETRY_AFTER_SECONDS,
  },
});

// Health check - lenient for monitoring
const healthLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_HEALTH_CHECK,
  standardHeaders: true,
  legacyHeaders: false,
});

// Metrics endpoint - moderate limit
const metricsLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_METRICS,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'RATE_LIMIT_EXCEEDED',
    message: `Too many metrics requests. Please try again after ${RATE_LIMIT_RETRY_AFTER_SECONDS} seconds.`,
    retryAfter: RATE_LIMIT_RETRY_AFTER_SECONDS,
  },
});

// Admin endpoints - stricter limit
const adminLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_ADMIN,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'RATE_LIMIT_EXCEEDED',
    message: `Too many admin requests. Please try again after ${RATE_LIMIT_RETRY_AFTER_SECONDS} seconds.`,
    retryAfter: RATE_LIMIT_RETRY_AFTER_SECONDS,
  },
});

// =============================================================================
// HTTP Server and WebSocket Setup
// =============================================================================

const server: Server = createServer(app);
const wss = new WebSocketServer({ server, path: wsPath });

// =============================================================================
// Session Storage
// =============================================================================

// In-memory session storage for active connections
// Sessions are persisted in DB, but socket routing is in-memory
const activeSessions = new Map<string, Session>();
const clients = new WeakMap<WebSocket, ConnectedClient>();

// Pending session rehydrations to prevent race conditions
const pendingRehydrations = new Map<
  string,
  { promise: Promise<Session | null>; createdAt: number }
>();

// Configure metrics callbacks
metrics.setConnectionCountCallback(() => connectionManager.getConnectionCount());
metrics.setSessionCountCallback(() => activeSessions.size);

// =============================================================================
// Validation Schemas with Enhanced Security
// =============================================================================

// SECURITY: Validate metadata size and structure to prevent DoS
const metadataSchema = z
  .record(z.string().max(100), z.unknown())
  .refine((obj) => Object.keys(obj).length <= MAX_METADATA_KEYS, {
    message: `Metadata cannot have more than ${MAX_METADATA_KEYS} keys`,
  })
  .refine((obj) => JSON.stringify(obj).length <= MAX_METADATA_SIZE_BYTES, {
    message: `Metadata size exceeds ${MAX_METADATA_SIZE_BYTES} bytes`,
  })
  .optional();

const pairingRequestSchema = z.object({
  ttlSeconds: z.number().min(30).max(900).optional(),
  metadata: metadataSchema,
});

// SECURITY: Enhanced pairing code validation with pattern check
const pairingCodeSchema = z
  .string()
  .length(PAIRING_CODE_LENGTH)
  .refine((code) => PAIRING_CODE_PATTERN.test(code), {
    message: 'Invalid pairing code format',
  });

const registerMessageSchema = z.object({
  type: z.literal('register'),
  code: pairingCodeSchema,
  role: z.union([z.literal('desktop'), z.literal('mobile')]),
  metadata: metadataSchema,
});

// WebRTC SDP payload validation (offer/answer)
const sdpPayloadSchema = z.object({
  type: z.enum(['offer', 'answer']),
  sdp: z.string().max(MAX_SDP_SIZE),
});

// WebRTC ICE candidate payload validation
const icePayloadSchema = z.object({
  candidate: z.string().max(MAX_ICE_CANDIDATE_SIZE).nullable().optional(),
  sdpMid: z.string().max(MAX_SDP_MID_SIZE).nullable().optional(),
  sdpMLineIndex: z.number().int().min(0).max(MAX_SDP_MLINE_INDEX).nullable().optional(),
  usernameFragment: z.string().max(MAX_USERNAME_FRAGMENT_SIZE).nullable().optional(),
});

// Control message payload
const controlPayloadSchema = z
  .object({
    action: z.string().max(MAX_ACTION_NAME_SIZE),
    data: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((val) => JSON.stringify(val).length <= MAX_CONTROL_PAYLOAD_SIZE, {
    message: 'Control payload too large',
  });

const signalMessageSchema = z.object({
  type: z.literal('signal'),
  kind: z.union([z.literal('offer'), z.literal('answer'), z.literal('ice'), z.literal('control')]),
  payload: z.unknown(),
});

const heartbeatMessageSchema = z.object({
  type: z.literal('heartbeat'),
});

type RegisterMessage = z.infer<typeof registerMessageSchema>;
type SignalMessage = z.infer<typeof signalMessageSchema>;

// =============================================================================
// Health & Monitoring Endpoints
// =============================================================================

/**
 * Liveness probe - returns 200 if process is alive
 * Used by Kubernetes/Docker to check if container should be restarted
 */
app.get('/live', (_req, res) => {
  res.status(200).json({ status: 'alive', timestamp: Date.now() });
});

/**
 * Readiness probe - returns 200 when server is ready to accept connections
 * Used by load balancers to know when to route traffic
 */
app.get('/ready', (_req, res) => {
  if (isShuttingDown) {
    return res.status(503).json({ status: 'shutting_down', timestamp: Date.now() });
  }
  if (!isReady) {
    return res.status(503).json({ status: 'not_ready', timestamp: Date.now() });
  }
  return res.status(200).json({ status: 'ready', timestamp: Date.now() });
});

/**
 * Health check endpoint - detailed health status
 * Returns comprehensive server health information
 */
app.get('/health', healthLimiter, (_req, res) => {
  const memUsage = process.memoryUsage();
  const stats = connectionManager.getStats();
  const topCloseReasons = Array.from(stats.closeReasons.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }));

  const healthStatus = {
    status: isShuttingDown ? 'shutting_down' : isReady ? 'healthy' : 'starting',
    uptime: metrics.getUptimeSeconds(),
    timestamp: Date.now(),
    connections: {
      total: stats.totalConnections,
      uniqueIps: stats.uniqueIps,
      topCloseReasons,
    },
    sessions: {
      active: activeSessions.size,
    },
    memory: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024),
      unit: 'MB',
    },
  };

  const httpStatus = isShuttingDown ? 503 : isReady ? 200 : 503;
  return res.status(httpStatus).json(healthStatus);
});

/**
 * Prometheus metrics endpoint
 * Returns metrics in Prometheus text format for scraping
 * SECURITY: Requires admin authentication when ADMIN_API_KEY is configured
 */
app.get(
  '/metrics',
  metricsLimiter,
  (req, res, next) => {
    // If admin API key is configured, require authentication
    if (isAdminEnabled()) {
      adminAuthMiddleware(req, res, next);
    } else {
      next();
    }
  },
  (_req, res) => {
    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.send(metrics.toPrometheusFormat());
  },
);

// =============================================================================
// Admin Endpoints (Require ADMIN_API_KEY)
// =============================================================================

/**
 * Admin status endpoint
 * Returns server configuration and status
 */
app.get('/admin/status', adminLimiter, adminAuthMiddleware, (_req, res) => {
  const wsStats = wsRateLimiter.getStats();

  res.json({
    adminEnabled: isAdminEnabled(),
    server: {
      host,
      port,
      wsPath,
      publicHttpUrl,
      publicWsUrl,
    },
    config: {
      defaultTtl: DEFAULT_TTL_SECONDS,
      maxMessageSize: MAX_MESSAGE_SIZE_BYTES,
      allowedOrigins,
    },
    security: {
      blacklistedIps: wsStats.blacklistedIps,
      topOffenders: wsStats.topOffenders,
    },
    timestamp: Date.now(),
  });
});

/**
 * Admin blacklist endpoint
 * Manually blacklist an IP address
 */
app.post('/admin/blacklist', adminLimiter, adminAuthMiddleware, (req, res) => {
  const { ip, reason, durationMs } = req.body as {
    ip?: string;
    reason?: string;
    durationMs?: number;
  };

  if (!ip || typeof ip !== 'string') {
    return res.status(400).json({ error: 'INVALID_REQUEST', message: 'IP address required' });
  }

  if (!reason || typeof reason !== 'string') {
    return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Reason required' });
  }

  wsRateLimiter.blacklistIp(ip, reason, durationMs);
  logger.warn({ ip, reason, durationMs }, 'IP manually blacklisted via admin endpoint');

  return res.json({ success: true, message: `IP ${ip} blacklisted` });
});

// =============================================================================
// Pairing Endpoints
// =============================================================================

// SECURITY: Rate limited to 10/min to prevent enumeration attacks
app.post('/pairings', pairingCreateLimiter, async (req, res) => {
  const correlationId = (req as Request & { correlationId?: string }).correlationId;
  const parseResult = pairingRequestSchema.safeParse(req.body ?? {});

  if (!parseResult.success) {
    logger.warn(
      { correlationId, error: z.treeifyError(parseResult.error) },
      'Invalid pairing request',
    );
    metrics.recordError('invalid_pairing_request');
    return res.status(400).json({ error: z.treeifyError(parseResult.error) });
  }

  const { ttlSeconds = DEFAULT_TTL_SECONDS, metadata } = parseResult.data;

  logger.info({ correlationId, ttlSeconds }, 'Creating pairing session');

  const result = await insertSessionWithRetry(ttlSeconds, metadata);

  if ('error' in result) {
    logger.error({ correlationId, error: result.error }, 'Failed to create pairing session');
    metrics.recordPairingRequest(false);
    return res.status(500).json({ error: result.error });
  }

  const { code, expiresAt } = result;

  logger.info({ correlationId, code, expiresAt }, 'Pairing session created');
  metrics.recordPairingRequest(true);

  return res.json({
    code,
    expiresAt,
    expiresIn: ttlSeconds,
    httpUrl: publicHttpUrl,
    wsUrl: publicWsUrl,
    qrData: buildQrPayload(code),
    // Nested shape expected by desktop client (connectionStore PairingResponse)
    signaling: {
      httpUrl: publicHttpUrl,
      wsUrl: publicWsUrl,
    },
  });
});

// SECURITY: Rate limited to 60/min - read-only operations
app.get('/pairings/:code', pairingLookupLimiter, async (req, res) => {
  const rawCode = req.params['code'];
  if (!rawCode) {
    return res.status(400).json({ error: 'missing_code' });
  }

  // SECURITY: Validate pairing code format before database lookup
  const codeValidation = pairingCodeSchema.safeParse(rawCode);
  if (!codeValidation.success) {
    return res.status(400).json({ error: 'invalid_code_format' });
  }

  // Use validated code (guaranteed to be string)
  const code = codeValidation.data;

  const { data: sessionData } = await supabase
    .from('signaling_sessions')
    .select('*')
    .eq('code', code)
    .single();

  if (!sessionData) {
    return res.status(404).json({ error: 'pairing_not_found' });
  }

  const activeSession = activeSessions.get(code);

  if (sessionData.expires_at <= Date.now()) {
    return res.status(410).json({ error: 'pairing_expired' });
  }

  return res.json({
    code: sessionData.code,
    expiresAt: sessionData.expires_at,
    roles: {
      desktop: Boolean(activeSession?.participants.desktop),
      mobile: Boolean(activeSession?.participants.mobile),
    },
  });
});

// SECURITY: Rate limited to 10/min - destructive operation
app.delete('/pairings/:code', pairingDeleteLimiter, async (req, res) => {
  const rawCode = req.params['code'];
  if (!rawCode) {
    return res.status(400).json({ error: 'missing_code' });
  }

  // SECURITY: Validate pairing code format before database operation
  const codeValidation = pairingCodeSchema.safeParse(rawCode);
  if (!codeValidation.success) {
    return res.status(400).json({ error: 'invalid_code_format' });
  }

  // Use validated code (guaranteed to be string)
  const code = codeValidation.data;

  const active = activeSessions.get(code);
  if (active) {
    disconnectParticipants(active);
    activeSessions.delete(code);
  }

  const { error } = await supabase.from('signaling_sessions').delete().eq('code', code);

  if (error) {
    logger.error({ code, error }, 'Failed to delete pairing session');
    return res.status(500).json({ error: 'db_delete_error' });
  }

  logger.info({ code }, 'Pairing session deleted');
  return res.json({ success: true });
});

// =============================================================================
// WebSocket Connection Handling
// =============================================================================

wss.on('connection', (socket, request) => {
  // Reject connections during shutdown
  if (isShuttingDown) {
    socket.send(JSON.stringify({ type: 'error', error: 'server_shutting_down' }));
    socket.close(1001, 'server_shutting_down');
    return;
  }

  // Extract client IP
  const forwardedFor = request.headers['x-forwarded-for'];
  const ip =
    (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0]?.trim() : undefined) ??
    request.socket.remoteAddress ??
    'unknown';

  // SECURITY: Check if IP is blacklisted
  const blacklistStatus = wsRateLimiter.isBlacklisted(ip);
  if (blacklistStatus.blacklisted) {
    logger.warn({ ip, reason: blacklistStatus.reason }, 'Blacklisted IP attempted connection');
    metrics.recordError('blacklisted_ip_connection');
    socket.send(
      JSON.stringify({
        type: 'error',
        error: 'ip_blacklisted',
        retryAfter: blacklistStatus.retryAfter,
      }),
    );
    socket.close(1008, 'ip_blacklisted');
    return;
  }

  // SECURITY: Check WebSocket connection rate limit
  const connectionResult = wsRateLimiter.checkConnection(ip);
  if (!connectionResult.allowed) {
    logger.warn({ ip, reason: connectionResult.reason }, 'Connection rate limit exceeded');
    metrics.recordError('ws_connection_rate_limited');
    socket.send(
      JSON.stringify({
        type: 'error',
        error: 'rate_limit_exceeded',
        retryAfter: connectionResult.retryAfter,
      }),
    );
    socket.close(1008, 'rate_limit_exceeded');
    return;
  }

  // Check connection limit per IP (existing per-connection limit)
  if (!connectionManager.canConnect(ip)) {
    logger.warn({ ip }, 'Connection limit exceeded for IP');
    metrics.recordError('connection_limit_exceeded');
    socket.send(JSON.stringify({ type: 'error', error: 'connection_limit_exceeded' }));
    socket.close(1008, 'connection_limit_exceeded');
    return;
  }

  const correlationId = generateCorrelationId();
  connectionManager.addConnection(socket, ip, correlationId);

  logger.debug({ ip, correlationId }, 'WebSocket connection established');
  metrics.recordMessage('connection');

  // Handle WebSocket errors
  socket.on('error', (error) => {
    logger.error({ correlationId, error: error.message }, 'WebSocket error');
    metrics.recordError('websocket_error');

    const client = clients.get(socket);
    if (client) {
      const session = activeSessions.get(client.code);
      if (session && session.participants[client.role]?.socket === socket) {
        delete session.participants[client.role];
        notifyPeer(session, client.role, { type: 'peer_left', role: client.role, reason: 'error' });
      }
      clients.delete(socket);
    }
  });

  socket.on('pong', () => {
    connectionManager.updateActivity(socket);
    metrics.recordMessage('pong');
  });

  socket.on('message', (raw) => {
    connectionManager.updateActivity(socket);

    // SECURITY: Check message rate limit before processing
    const messageResult = wsRateLimiter.checkMessage(ip);
    if (!messageResult.allowed) {
      logger.warn(
        { ip, correlationId, reason: messageResult.reason },
        'Message rate limit exceeded',
      );
      metrics.recordError('ws_message_rate_limited');
      socket.send(
        JSON.stringify({
          type: 'error',
          error: 'rate_limit_exceeded',
          retryAfter: messageResult.retryAfter,
        }),
      );
      return;
    }

    const rawStr = raw.toString();

    // Check message size before parsing
    if (rawStr.length > MAX_MESSAGE_SIZE_BYTES) {
      logger.warn({ correlationId, size: rawStr.length }, 'Message too large');
      metrics.recordError('message_too_large');
      socket.send(JSON.stringify({ type: 'error', error: 'message_too_large' }));
      return;
    }

    let data: unknown;
    try {
      data = JSON.parse(rawStr);
    } catch {
      logger.warn({ correlationId }, 'Invalid JSON received');
      metrics.recordError('invalid_json');
      socket.send(JSON.stringify({ type: 'error', error: 'invalid_json' }));
      return;
    }

    if (!clients.has(socket)) {
      const parsed = registerMessageSchema.safeParse(data);
      if (!parsed.success) {
        socket.send(JSON.stringify({ type: 'error', error: 'registration_required' }));
        return;
      }
      handleRegister(socket, parsed.data, correlationId);
      return;
    }

    const signalParsed = signalMessageSchema.safeParse(data);
    if (signalParsed.success) {
      const signalData = signalParsed.data;
      if (!validateSignalPayload(signalData.kind, signalData.payload)) {
        socket.send(JSON.stringify({ type: 'error', error: 'invalid_signal_payload' }));
        return;
      }
      handleSignal(socket, signalData, correlationId);
      return;
    }

    if (heartbeatMessageSchema.safeParse(data).success) {
      metrics.recordMessage('heartbeat');
      socket.send(JSON.stringify({ type: 'heartbeat_ack', timestamp: Date.now() }));
      return;
    }

    socket.send(JSON.stringify({ type: 'error', error: 'unsupported_message' }));
  });

  socket.on('close', (code, reasonBuffer) => {
    const closeReason = reasonBuffer.toString() || 'client_disconnect';
    connectionManager.removeConnection(socket, {
      trigger: 'socket_close',
      closeCode: code,
      closeReason,
    });
    logger.debug({ correlationId, closeCode: code, closeReason }, 'WebSocket connection closed');
    metrics.recordMessage('disconnection');
    metrics.recordError(`ws_close_${code}`);

    const client = clients.get(socket);
    if (!client) {
      return;
    }
    clients.delete(socket);

    const session = activeSessions.get(client.code);
    if (!session) {
      return;
    }

    if (session.participants[client.role]?.socket === socket) {
      delete session.participants[client.role];
      notifyPeer(session, client.role, { type: 'peer_left', role: client.role });
    }

    // Clean up session if no participants and expired
    if (
      !session.participants.desktop &&
      !session.participants.mobile &&
      session.expiresAt <= Date.now()
    ) {
      activeSessions.delete(client.code);
    }
  });
});

// =============================================================================
// Session Cleanup
// =============================================================================

const cleanupInterval = setInterval(() => {
  const now = Date.now();
  let expiredCount = 0;

  for (const session of activeSessions.values()) {
    if (session.expiresAt <= now) {
      disconnectParticipants(session, 'session_expired');
      activeSessions.delete(session.code);
      expiredCount++;
    }
  }

  // SECURITY: Cleanup auth failure entries to prevent memory leaks
  cleanupAuthFailures();

  if (expiredCount > 0) {
    logger.info({ expiredCount }, 'Cleaned up expired sessions');
  }
}, SESSION_CLEANUP_INTERVAL_MS);

// =============================================================================
// Graceful Shutdown
// =============================================================================

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    logger.warn({ signal }, 'Shutdown already in progress, ignoring signal');
    return;
  }

  isShuttingDown = true;
  isReady = false;

  logger.info({ signal }, 'Starting graceful shutdown');

  // Set a hard deadline for shutdown
  const shutdownTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, GRACEFUL_SHUTDOWN_TIMEOUT_MS);

  try {
    // Stop accepting new connections
    clearInterval(cleanupInterval);
    connectionManager.stop();

    // SECURITY: Shutdown rate limiter cleanup intervals
    wsRateLimiter.shutdown();

    // Close all WebSocket connections gracefully
    logger.info('Closing WebSocket connections');
    await connectionManager.closeAllConnections('server_shutdown');

    // Wait for pending operations to drain
    logger.info('Waiting for pending operations to complete');
    await new Promise((resolve) => setTimeout(resolve, SHUTDOWN_DRAIN_TIMEOUT_MS));

    // Close WebSocket server
    await new Promise<void>((resolve, reject) => {
      wss.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Close HTTP server
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    clearTimeout(shutdownTimeout);
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    clearTimeout(shutdownTimeout);
    logger.error({ error }, 'Error during graceful shutdown');
    process.exit(1);
  }
}

// Register signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.fatal({ error: error.message, stack: error.stack }, 'Uncaught exception');
  gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ reason, promise }, 'Unhandled promise rejection');
  gracefulShutdown('unhandledRejection');
});

// =============================================================================
// Server Startup
// =============================================================================

server.listen(port, host, () => {
  connectionManager.start();
  isReady = true;
  logger.info(
    {
      host,
      port,
      wsPath,
      publicHttpUrl,
      publicWsUrl,
      security: {
        adminEndpoints: isAdminEnabled() ? 'enabled' : 'disabled',
        httpRateLimiting: 'enabled',
        wsRateLimiting: 'enabled',
        securityHeaders: 'enabled',
        inputValidation: 'enabled',
        ddosProtection: 'enabled',
      },
    },
    'Signaling server started with security features',
  );
});

// =============================================================================
// Helper Functions
// =============================================================================

function validateSignalPayload(kind: string, payload: unknown): boolean {
  switch (kind) {
    case 'offer':
    case 'answer':
      return sdpPayloadSchema.safeParse(payload).success;
    case 'ice':
      return icePayloadSchema.safeParse(payload).success;
    case 'control':
      return controlPayloadSchema.safeParse(payload).success;
    default:
      return false;
  }
}

async function handleRegister(
  socket: WebSocket,
  message: RegisterMessage,
  correlationId: string,
): Promise<void> {
  metrics.recordMessage('register');

  let session = activeSessions.get(message.code);

  if (!session) {
    // Check for pending rehydration (race condition prevention)
    let pendingEntry = pendingRehydrations.get(message.code);

    // Clean up stale pending entries
    if (pendingRehydrations.size > MAX_PENDING_REHYDRATIONS) {
      const now = Date.now();
      for (const [code, entry] of pendingRehydrations.entries()) {
        if (now - entry.createdAt > PENDING_REHYDRATION_TTL_MS) {
          pendingRehydrations.delete(code);
        }
      }
      if (pendingRehydrations.size > MAX_PENDING_REHYDRATIONS) {
        logger.error({ correlationId }, 'Server overloaded with pending rehydrations');
        socket.send(JSON.stringify({ type: 'error', error: 'server_overloaded' }));
        socket.close();
        return;
      }
    }

    if (!pendingEntry) {
      const rehydrationPromise = (async (): Promise<Session | null> => {
        const existingSession = activeSessions.get(message.code);
        if (existingSession) {
          return existingSession;
        }

        const { data: dbSession } = await supabase
          .from('signaling_sessions')
          .select('*')
          .eq('code', message.code)
          .single();

        if (!dbSession) {
          return null;
        }

        if (dbSession.expires_at <= Date.now()) {
          return null;
        }

        const rehydratedSession: Session = {
          code: dbSession.code,
          createdAt: dbSession.created_at,
          expiresAt: dbSession.expires_at,
          participants: {},
          metadata: dbSession.metadata,
        };
        activeSessions.set(message.code, rehydratedSession);
        return rehydratedSession;
      })();

      pendingEntry = { promise: rehydrationPromise, createdAt: Date.now() };
      pendingRehydrations.set(message.code, pendingEntry);

      rehydrationPromise.finally(() => {
        pendingRehydrations.delete(message.code);
      });
    }

    session = (await pendingEntry.promise) ?? undefined;

    if (!session) {
      const { data: dbSession } = await supabase
        .from('signaling_sessions')
        .select('expires_at')
        .eq('code', message.code)
        .single();

      if (!dbSession) {
        logger.warn({ correlationId, code: message.code }, 'Pairing not found');
        socket.send(JSON.stringify({ type: 'error', error: 'pairing_not_found' }));
      } else {
        logger.warn({ correlationId, code: message.code }, 'Pairing expired');
        socket.send(JSON.stringify({ type: 'error', error: 'pairing_expired' }));
      }
      socket.close();
      return;
    }
  }

  if (isSessionExpired(session)) {
    activeSessions.delete(message.code);
    socket.send(JSON.stringify({ type: 'error', error: 'pairing_expired' }));
    socket.close();
    return;
  }

  if (session.participants[message.role]) {
    logger.warn(
      { correlationId, code: message.code, role: message.role },
      'Role already connected',
    );
    socket.send(JSON.stringify({ type: 'error', error: 'role_already_connected' }));
    socket.close();
    return;
  }

  const participant: Participant = {
    socket,
    role: message.role,
    connectedAt: Date.now(),
    metadata: message.metadata ?? null,
  };

  session.participants[message.role] = participant;
  clients.set(socket, { code: message.code, role: message.role });

  logger.info(
    { correlationId, code: message.code, role: message.role },
    'Client registered to session',
  );

  socket.send(
    JSON.stringify({
      type: 'registered',
      role: message.role,
      code: message.code,
      expiresAt: session.expiresAt,
      peerConnected: Boolean(getPeer(session, message.role)),
    }),
  );

  const peer = getPeer(session, message.role);
  if (peer) {
    notifyParticipant(participant, {
      type: 'peer_ready',
      role: peer.role,
      metadata: peer.metadata ?? null,
    });
    notifyParticipant(peer, {
      type: 'peer_ready',
      role: participant.role,
      metadata: participant.metadata ?? null,
    });
  }
}

function handleSignal(socket: WebSocket, message: SignalMessage, correlationId: string): void {
  metrics.recordMessage(`signal_${message.kind}`);

  const client = clients.get(socket);
  if (!client) {
    socket.send(JSON.stringify({ type: 'error', error: 'registration_required' }));
    return;
  }

  const session = activeSessions.get(client.code);
  if (!session) {
    socket.send(JSON.stringify({ type: 'error', error: 'pairing_not_found' }));
    return;
  }

  const peer = getPeer(session, client.role);
  if (!peer) {
    socket.send(JSON.stringify({ type: 'error', error: 'peer_not_connected' }));
    return;
  }

  logger.debug({ correlationId, kind: message.kind, from: client.role }, 'Forwarding signal');

  notifyParticipant(peer, {
    type: 'signal',
    from: client.role,
    kind: message.kind,
    payload: message.payload,
  });
}

function getPeer(session: Session, role: Role): Participant | undefined {
  return role === 'desktop' ? session.participants.mobile : session.participants.desktop;
}

function notifyParticipant(participant: Participant, payload: Record<string, unknown>): void {
  if (participant.socket.readyState === WebSocket.OPEN) {
    participant.socket.send(JSON.stringify(payload));
  }
}

function notifyPeer(session: Session, role: Role, payload: Record<string, unknown>): void {
  const peer = getPeer(session, role);
  if (peer) {
    notifyParticipant(peer, payload);
  }
}

function isSessionExpired(session: Session): boolean {
  return session.expiresAt <= Date.now();
}

function generateCode(): string {
  return randomBytes(6).toString('base64url').substring(0, 8).toUpperCase();
}

async function insertSessionWithRetry(
  ttlSeconds: number,
  metadata: Record<string, unknown> | undefined,
): Promise<{ code: string; expiresAt: number } | { error: string }> {
  const now = Date.now();
  const expiresAt = now + ttlSeconds * 1000;

  for (let attempt = 0; attempt < CODE_GENERATION_MAX_ATTEMPTS; attempt++) {
    const code = generateCode();

    if (activeSessions.has(code)) {
      continue;
    }

    const { error } = await supabase.from('signaling_sessions').insert({
      code,
      created_at: now,
      expires_at: expiresAt,
      metadata: metadata ?? {},
    });

    if (!error) {
      return { code, expiresAt };
    }

    if (error.code === DB_ERROR_CODES.UNIQUE_VIOLATION) {
      logger.debug({ attempt: attempt + 1 }, 'Code collision, retrying');
      continue;
    }

    logger.error({ error }, 'Database insert error');
    return { error: 'database_error' };
  }

  return { error: 'failed_to_generate_code' };
}

function disconnectParticipants(
  session: Session,
  reason: 'session_expired' | 'terminated' = 'terminated',
): void {
  for (const role of ['desktop', 'mobile'] as const) {
    const participant = session.participants[role];
    if (!participant) continue;
    try {
      notifyParticipant(participant, { type: reason });
      participant.socket.close();
    } catch (error) {
      logger.warn({ error, role }, 'Failed to close socket');
    }
  }
}

function buildQrPayload(code: string): string {
  return `agiw:${code}`;
}
