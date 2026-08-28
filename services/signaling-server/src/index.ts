import 'dotenv/config';

if (!process.env['NODE_ENV']) {
  process.stderr.write(
    '[signaling-server] WARN: NODE_ENV is not set — defaulting to "development"\n',
  );
  process.env['NODE_ENV'] = 'development';
}

import cors from 'cors';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { createServer, type Server } from 'http';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import {
  issuePairToken as mintPairToken,
  verifyPairToken as checkPairToken,
} from './pair-token.js';
import {
  deleteSessionByCode,
  getSessionByCode,
  getSessionExpiresAtByCode,
  extendSessionExpiry,
  insertSession,
} from './db.js';
import { isProxyTrusted, resolveClientIp, resolveTrustedProxyHops } from './client-ip.js';
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
  SESSION_LONG_TTL_MS,
  STALE_SESSION_HEARTBEAT_THRESHOLD_MS,
  MAX_PENDING_APPROVALS_PER_SESSION,
  PENDING_APPROVAL_TTL_MS,
} from './constants.js';

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
  lastHeartbeatAt: number;
}

interface PendingApproval {
  id: string;
  payload: Record<string, unknown>;
  queuedAt: number;
}

interface ConnectedClient {
  code: string;
  role: Role;
}

let isShuttingDown = false;
let isReady = false;

const SIGNALING_SECRET = process.env['SIGNALING_INTERNAL_SECRET'];

const COMPARE_KEY = randomBytes(32);

function constantTimeCompare(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ha = createHmac('sha256', COMPARE_KEY).update(a).digest();
  const hb = createHmac('sha256', COMPARE_KEY).update(b).digest();
  return timingSafeEqual(ha, hb);
}

const REQUIRE_PAIR_TOKEN =
  (process.env['SIGNALING_REQUIRE_PAIR_TOKEN'] ?? '1').toLowerCase() === '1' ||
  process.env['NODE_ENV'] === 'production';

function buildPairTokenSecret(): string {
  return SIGNALING_SECRET ?? COMPARE_KEY.toString('hex');
}

function issuePairToken(code: string, role: Role, createdAt: number): string {
  return mintPairToken(buildPairTokenSecret(), code, role, createdAt);
}

function verifyPairToken(
  presented: string | undefined,
  code: string,
  role: Role,
  createdAt: number,
): boolean {
  if (!REQUIRE_PAIR_TOKEN) return true;
  return checkPairToken(buildPairTokenSecret(), presented, code, role, createdAt);
}

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

const app = express();

if (isProxyTrusted()) {
  app.set('trust proxy', resolveTrustedProxyHops());
}

disablePoweredBy(app);

app.use(securityHeadersMiddleware);

app.use((req: Request, _res: Response, next: NextFunction) => {
  (req as Request & { correlationId?: string }).correlationId =
    (req.headers['x-correlation-id'] as string) ?? generateCorrelationId();
  next();
});

export function resolveAllowedOrigins(env: NodeJS.ProcessEnv): string[] {
  const configured = env['ALLOWED_ORIGINS'];
  if (configured) {
    return configured
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  if (env['NODE_ENV'] === 'production') {
    return [];
  }

  return [...DEFAULT_ALLOWED_ORIGINS];
}

const allowedOrigins = resolveAllowedOrigins(process.env);

if (allowedOrigins.length === 0) {
  logger.error(
    'ALLOWED_ORIGINS resolved to an empty allow-list (unset in production, or set to no usable ' +
      'value). Every WebSocket connection presenting an Origin header is rejected, and only ' +
      'clients presenting a valid x-signaling-internal-secret can connect, until it is configured.',
  );
}

export type WsHandshakeDecision = { allowed: true } | { allowed: false; reason: string };

export function evaluateWsHandshake(params: {
  origin: unknown;
  internalSecret: unknown;
  allowedOrigins: readonly string[];
  internalSecretExpected: string | undefined;
}): WsHandshakeDecision {
  const { origin, internalSecret, internalSecretExpected } = params;

  if (typeof origin === 'string' && origin.length > 0) {
    if (params.allowedOrigins.includes(origin)) return { allowed: true };
    return {
      allowed: false,
      reason: params.allowedOrigins.length === 0 ? 'origin_not_configured' : 'forbidden_origin',
    };
  }

  if (
    !internalSecretExpected ||
    typeof internalSecret !== 'string' ||
    !constantTimeCompare(internalSecret, internalSecretExpected)
  ) {
    return { allowed: false, reason: 'origin_required' };
  }

  return { allowed: true };
}

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Correlation-ID'],
    maxAge: 86400, // 24 hours - cache preflight requests
  }),
);

app.use(express.json({ limit: '16kb' }));

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

const healthLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_HEALTH_CHECK,
  standardHeaders: true,
  legacyHeaders: false,
});

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

const server: Server = createServer(app);
const wss = new WebSocketServer({ server, path: wsPath });

const activeSessions = new Map<string, Session>();
const clients = new WeakMap<WebSocket, ConnectedClient>();

const pendingApprovals = new Map<string, PendingApproval[]>();

const pendingRehydrations = new Map<
  string,
  { promise: Promise<Session | null>; createdAt: number }
>();

metrics.setConnectionCountCallback(() => connectionManager.getConnectionCount());
metrics.setSessionCountCallback(() => activeSessions.size);

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

const manualPairingClaimSchema = z
  .object({
    role: z.literal('mobile'),
  })
  .strict();

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
  pairToken: z.string().min(1).max(512).optional(),
});

const sdpPayloadSchema = z.object({
  type: z.enum(['offer', 'answer']),
  sdp: z.string().max(MAX_SDP_SIZE),
});

const icePayloadSchema = z.object({
  candidate: z.string().max(MAX_ICE_CANDIDATE_SIZE).nullable().optional(),
  sdpMid: z.string().max(MAX_SDP_MID_SIZE).nullable().optional(),
  sdpMLineIndex: z.number().int().min(0).max(MAX_SDP_MLINE_INDEX).nullable().optional(),
  usernameFragment: z.string().max(MAX_USERNAME_FRAGMENT_SIZE).nullable().optional(),
});

const ALLOWED_CONTROL_ACTIONS = [
  'approval_request',
  'approval_response',
  'sync_request',
  'sync_response',
  'dispatch_request',
  'dispatch_response',
  'heartbeat',
  'heartbeat_ack',
  'cancel',
] as const;

const controlPayloadSchema = z
  .object({
    action: z.enum(ALLOWED_CONTROL_ACTIONS),
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

app.get('/live', (_req, res) => {
  res.status(200).json({ status: 'alive', timestamp: Date.now() });
});

app.get('/ready', (_req, res) => {
  if (isShuttingDown) {
    return res.status(503).json({ status: 'shutting_down', timestamp: Date.now() });
  }
  if (!isReady) {
    return res.status(503).json({ status: 'not_ready', timestamp: Date.now() });
  }
  return res.status(200).json({ status: 'ready', timestamp: Date.now() });
});

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

app.get(
  '/metrics',
  metricsLimiter,
  (req, res, next) => {
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

const adminBlacklistSchema = z.object({
  ip: z.string().min(1, 'IP address required'),
  reason: z.string().min(1, 'Reason required'),
  durationMs: z.number().int().positive().optional(),
});

app.post('/admin/blacklist', adminLimiter, adminAuthMiddleware, (req, res) => {
  const parseResult = adminBlacklistSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res
      .status(400)
      .json({ error: 'INVALID_REQUEST', message: z.treeifyError(parseResult.error) });
  }

  const { ip, reason, durationMs } = parseResult.data;

  wsRateLimiter.blacklistIp(ip, reason, durationMs);
  logger.warn({ ip, reason, durationMs }, 'IP manually blacklisted via admin endpoint');

  return res.json({ success: true, message: `IP ${ip} blacklisted` });
});

app.post('/pairings', pairingCreateLimiter, async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');

  if (!SIGNALING_SECRET || !token || !constantTimeCompare(token, SIGNALING_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

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

  const { code, createdAt, expiresAt } = result;

  logger.info({ correlationId, code, expiresAt }, 'Pairing session created');
  metrics.recordPairingRequest(true);

  const desktopPairToken = issuePairToken(code, 'desktop', createdAt);
  const mobilePairToken = issuePairToken(code, 'mobile', createdAt);

  return res.json({
    code,
    expiresAt,
    expiresIn: ttlSeconds,
    httpUrl: publicHttpUrl,
    wsUrl: publicWsUrl,
    qrData: buildQrPayload(code),
    signaling: {
      httpUrl: publicHttpUrl,
      wsUrl: publicWsUrl,
    },
    pairTokens: {
      desktop: desktopPairToken,
      mobile: mobilePairToken,
    },
  });
});

app.get('/pairings/:code', pairingLookupLimiter, async (req, res) => {
  const generic404 = { error: 'pairing_not_found' };
  const rawCode = req.params['code'];
  if (!rawCode) {
    return res.status(404).json(generic404);
  }

  const codeValidation = pairingCodeSchema.safeParse(rawCode);
  if (!codeValidation.success) {
    return res.status(404).json(generic404);
  }

  const code = codeValidation.data;

  const { data: sessionData } = await getSessionByCode(code);

  if (!sessionData) {
    return res.status(404).json(generic404);
  }

  const activeSession = activeSessions.get(code);

  if (sessionData.expires_at <= Date.now()) {
    return res.status(404).json(generic404);
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

app.post('/pairings/:code/claim', pairingCreateLimiter, async (req, res) => {
  const generic404 = { error: 'pairing_not_found' };
  const parsedBody = manualPairingClaimSchema.safeParse(req.body ?? {});
  const codeValidation = pairingCodeSchema.safeParse(req.params['code']);
  if (!parsedBody.success || !codeValidation.success) {
    return res.status(404).json(generic404);
  }

  const code = codeValidation.data;
  const { data: sessionData } = await getSessionByCode(code);
  if (!sessionData || sessionData.expires_at <= Date.now()) {
    return res.status(404).json(generic404);
  }

  const activeSession = activeSessions.get(code);
  if (activeSession?.participants.mobile) {
    return res.status(409).json({ error: 'pairing_role_in_use' });
  }

  return res.json({
    code,
    role: parsedBody.data.role,
    pairToken: issuePairToken(code, parsedBody.data.role, sessionData.created_at),
    expiresAt: sessionData.expires_at,
    wsUrl: publicWsUrl,
  });
});

app.delete('/pairings/:code', pairingDeleteLimiter, async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');

  if (!SIGNALING_SECRET || !token || !constantTimeCompare(token, SIGNALING_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const rawCode = req.params['code'];
  if (!rawCode) {
    return res.status(400).json({ error: 'missing_code' });
  }

  const codeValidation = pairingCodeSchema.safeParse(rawCode);
  if (!codeValidation.success) {
    return res.status(400).json({ error: 'invalid_code_format' });
  }

  const code = codeValidation.data;

  const active = activeSessions.get(code);
  if (active) {
    disconnectParticipants(active);
    activeSessions.delete(code);
  }

  const { error } = await deleteSessionByCode(code);

  if (error) {
    logger.error({ code, error }, 'Failed to delete pairing session');
    return res.status(500).json({ error: 'db_delete_error' });
  }

  logger.info({ code }, 'Pairing session deleted');
  return res.json({ success: true });
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'NOT_FOUND', message: 'Route not found' });
});

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof z.ZodError) {
    logger.warn({ path: req.path, method: req.method }, 'Request validation failed');
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: z.treeifyError(err),
    });
    return;
  }

  logger.error({ error: err.message, path: req.path, method: req.method }, 'Unhandled error');
  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
});

wss.on('connection', (socket, request) => {
  if (isShuttingDown) {
    socket.send(JSON.stringify({ type: 'error', error: 'server_shutting_down' }));
    socket.close(1001, 'server_shutting_down');
    return;
  }

  const ip = resolveClientIp(request);

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

  const handshake = evaluateWsHandshake({
    origin: request.headers['origin'],
    internalSecret: request.headers['x-signaling-internal-secret'],
    allowedOrigins,
    internalSecretExpected: SIGNALING_SECRET,
  });
  if (!handshake.allowed) {
    logger.warn(
      { ip, origin: request.headers['origin'], reason: handshake.reason },
      'WebSocket connection rejected by origin policy',
    );
    metrics.recordError('ws_origin_rejected');
    socket.close(1008, handshake.reason);
    return;
  }

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
      const heartbeatClient = clients.get(socket);
      if (heartbeatClient) {
        const heartbeatSession = activeSessions.get(heartbeatClient.code);
        if (heartbeatSession) {
          heartbeatSession.lastHeartbeatAt = Date.now();
        }
      }
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

    if (
      !session.participants.desktop &&
      !session.participants.mobile &&
      session.expiresAt <= Date.now()
    ) {
      activeSessions.delete(client.code);
    }
  });
});

const cleanupInterval = setInterval(() => {
  const now = Date.now();
  let expiredCount = 0;
  let staleCount = 0;

  for (const session of activeSessions.values()) {
    if (session.expiresAt <= now) {
      disconnectParticipants(session, 'session_expired');
      activeSessions.delete(session.code);
      pendingApprovals.delete(session.code);
      expiredCount++;
      continue;
    }

    const hasParticipants =
      Boolean(session.participants.desktop) || Boolean(session.participants.mobile);
    const heartbeatAge = now - session.lastHeartbeatAt;
    if (!hasParticipants && heartbeatAge > STALE_SESSION_HEARTBEAT_THRESHOLD_MS) {
      logger.info(
        { code: session.code, heartbeatAge },
        'Removing stale session (no heartbeat, no participants)',
      );
      activeSessions.delete(session.code);
      pendingApprovals.delete(session.code);
      staleCount++;
    }
  }

  for (const [code, approvals] of pendingApprovals.entries()) {
    const filtered = approvals.filter((a) => now - a.queuedAt < PENDING_APPROVAL_TTL_MS);
    if (filtered.length === 0) {
      pendingApprovals.delete(code);
    } else if (filtered.length < approvals.length) {
      pendingApprovals.set(code, filtered);
    }
  }

  cleanupAuthFailures();

  if (expiredCount > 0 || staleCount > 0) {
    logger.info({ expiredCount, staleCount }, 'Cleaned up expired/stale sessions');
  }
}, SESSION_CLEANUP_INTERVAL_MS);

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    logger.warn({ signal }, 'Shutdown already in progress, ignoring signal');
    return;
  }

  isShuttingDown = true;
  isReady = false;

  logger.info({ signal }, 'Starting graceful shutdown');

  const shutdownTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, GRACEFUL_SHUTDOWN_TIMEOUT_MS);

  try {
    clearInterval(cleanupInterval);
    connectionManager.stop();

    wsRateLimiter.shutdown();

    logger.info('Closing WebSocket connections');
    await connectionManager.closeAllConnections('server_shutdown');

    logger.info('Waiting for pending operations to complete');
    await new Promise((resolve) => setTimeout(resolve, SHUTDOWN_DRAIN_TIMEOUT_MS));

    await new Promise<void>((resolve, reject) => {
      wss.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

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

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  logger.fatal({ error: error.message, stack: error.stack }, 'Uncaught exception');
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ reason, promise }, 'Unhandled promise rejection');
  gracefulShutdown('unhandledRejection');
});

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
        pairingAuth: SIGNALING_SECRET ? 'enabled' : 'DISABLED_NO_SECRET',
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
    let pendingEntry = pendingRehydrations.get(message.code);

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

        const DB_QUERY_TIMEOUT_MS = 10_000;
        const dbQuery = getSessionByCode(message.code);
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Rehydration DB query timed out')),
            DB_QUERY_TIMEOUT_MS,
          ),
        );
        const { data: dbSession } = await Promise.race([dbQuery, timeout]);

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
          lastHeartbeatAt: Date.now(),
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
      const { data: dbSession } = await getSessionExpiresAtByCode(message.code);

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

  if (!verifyPairToken(message.pairToken, message.code, message.role, session.createdAt)) {
    logger.warn(
      {
        correlationId,
        code: message.code,
        role: message.role,
        hasToken: Boolean(message.pairToken),
      },
      'Pair token verification failed',
    );
    metrics.recordError('pair_token_invalid');
    socket.send(JSON.stringify({ type: 'error', error: 'pairing_not_found' }));
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

  session.lastHeartbeatAt = Date.now();

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
    const longExpiry = Date.now() + SESSION_LONG_TTL_MS;
    if (session.expiresAt < longExpiry) {
      session.expiresAt = longExpiry;
      const { error } = await extendSessionExpiry(message.code, longExpiry);
      if (error) {
        logger.error(
          { code: message.code, newExpiresAt: longExpiry, error },
          'Session TTL extended in memory but not persisted; a restart will expire this pair',
        );
      } else {
        logger.info(
          { code: message.code, newExpiresAt: longExpiry },
          'Session TTL extended to 24h (both peers connected)',
        );
      }
    }

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

  if (message.role === 'mobile') {
    deliverPendingApprovals(session.code, participant);
  }

  if (message.role === 'mobile' && peer) {
    notifyParticipant(peer, {
      type: 'sync_request',
      reason: 'mobile_reconnected',
      timestamp: Date.now(),
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

  if (!peer && message.kind === 'control' && client.role === 'desktop') {
    const controlPayload = message.payload as
      | { action?: string; data?: Record<string, unknown> }
      | undefined;
    if (controlPayload?.action === 'approval_request') {
      queuePendingApproval(client.code, controlPayload);
      socket.send(JSON.stringify({ type: 'approval_queued', code: client.code }));
      logger.info({ correlationId, code: client.code }, 'Approval queued for disconnected mobile');
      return;
    }
  }

  if (!peer) {
    socket.send(JSON.stringify({ type: 'error', error: 'peer_not_connected' }));
    return;
  }

  logger.debug({ correlationId, kind: message.kind, from: client.role }, 'Forwarding signal');

  let payloadToForward: unknown = message.payload;
  if (message.kind === 'control') {
    const reparsed = controlPayloadSchema.safeParse(message.payload);
    if (!reparsed.success) {
      socket.send(JSON.stringify({ type: 'error', error: 'invalid_control_payload' }));
      logger.warn(
        { correlationId, issues: reparsed.error.issues },
        'Refusing to forward malformed control payload',
      );
      return;
    }
    payloadToForward = reparsed.data;
  }

  notifyParticipant(peer, {
    type: 'signal',
    from: client.role,
    kind: message.kind,
    payload: payloadToForward,
  });
}

function getPeer(session: Session, role: Role): Participant | undefined {
  return role === 'desktop' ? session.participants.mobile : session.participants.desktop;
}

function notifyParticipant(participant: Participant, payload: Record<string, unknown>): void {
  if (participant.socket.readyState === WebSocket.OPEN) {
    try {
      participant.socket.send(JSON.stringify(payload));
    } catch (error) {
      logger.warn({ error, role: participant.role }, 'Failed to send message to participant');
    }
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
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const len = charset.length;
  const limit = 256 - (256 % len);
  let code = '';
  while (code.length < PAIRING_CODE_LENGTH) {
    const bytes = randomBytes(PAIRING_CODE_LENGTH - code.length + 4);
    for (let i = 0; i < bytes.length && code.length < PAIRING_CODE_LENGTH; i++) {
      const byte = bytes.readUInt8(i);
      if (byte < limit) {
        code += charset[byte % len];
      }
    }
  }
  return code;
}

async function insertSessionWithRetry(
  ttlSeconds: number,
  metadata: Record<string, unknown> | undefined,
): Promise<{ code: string; createdAt: number; expiresAt: number } | { error: string }> {
  const now = Date.now();
  const expiresAt = now + ttlSeconds * 1000;

  for (let attempt = 0; attempt < CODE_GENERATION_MAX_ATTEMPTS; attempt++) {
    const code = generateCode();

    if (activeSessions.has(code)) {
      continue;
    }

    const { error } = await insertSession(code, now, expiresAt, metadata ?? {});

    if (!error) {
      return { code, createdAt: now, expiresAt };
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

function queuePendingApproval(code: string, payload: Record<string, unknown>): void {
  let queue = pendingApprovals.get(code);
  if (!queue) {
    queue = [];
    pendingApprovals.set(code, queue);
  }

  if (queue.length >= MAX_PENDING_APPROVALS_PER_SESSION) {
    queue.shift();
  }

  queue.push({
    id: `approval_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    payload,
    queuedAt: Date.now(),
  });
}

function deliverPendingApprovals(code: string, mobileParticipant: Participant): void {
  const queue = pendingApprovals.get(code);
  if (!queue || queue.length === 0) {
    return;
  }

  const now = Date.now();
  const validApprovals = queue.filter((a) => now - a.queuedAt < PENDING_APPROVAL_TTL_MS);

  if (validApprovals.length === 0) {
    pendingApprovals.delete(code);
    return;
  }

  logger.info(
    { code, count: validApprovals.length },
    'Delivering pending approvals to reconnected mobile',
  );

  for (const approval of validApprovals) {
    notifyParticipant(mobileParticipant, {
      type: 'signal',
      from: 'desktop',
      kind: 'control',
      payload: approval.payload,
    });
  }

  pendingApprovals.delete(code);
}

function buildQrPayload(code: string): string {
  return `agiw:${code}`;
}
