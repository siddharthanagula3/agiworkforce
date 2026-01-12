/**
 * @file Signaling Server for WebRTC Pairing
 * @security
 * - Rate limiting: Applied to HTTP endpoints to prevent abuse
 * - Input validation: Zod schemas validate all WebSocket messages
 * - Message size limits: MAX_MESSAGE_SIZE_BYTES prevents DoS
 * - Session expiry: Automatic cleanup of expired sessions
 *
 * Rate limit rationale (OWASP compliant):
 * - POST /pairings: 10/min - strict to prevent enumeration attacks
 * - GET /pairings/:code: 60/min - lookups are read-only
 * - DELETE /pairings/:code: 10/min - destructive operation
 */

import 'dotenv/config';

import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import { supabase } from './db.js';

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

const DEFAULT_TTL_SECONDS = Number(process.env['SIGNALING_PAIRING_TTL'] ?? 300);
const MAX_MESSAGE_SIZE_BYTES = 64 * 1024; // 64KB max message size (SDPs can be large with many candidates)
const host = process.env['SIGNALING_HOST'] ?? '0.0.0.0';
const port = Number(process.env['PORT'] ?? process.env['SIGNALING_PORT'] ?? 4000);
const wsPath = process.env['SIGNALING_WS_PATH'] ?? '/ws';
const publicHttpUrl = process.env['SIGNALING_HTTP_URL'] ?? `http://${host}:${port}`;
const publicWsUrl =
  process.env['SIGNALING_WS_URL'] ??
  `${publicHttpUrl.startsWith('https') ? 'wss' : 'ws'}://${host}:${port}${wsPath}`;

const app = express();

// Configure CORS with allowed origins
const allowedOrigins = (() => {
  const configured = process.env['ALLOWED_ORIGINS'];
  if (!configured) {
    return ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:4000'];
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
  }),
);
app.use(express.json());

// SECURITY: Rate limiters for pairing endpoints
// Pairing creation - strict to prevent enumeration attacks (10/min)
const pairingCreateLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many pairing requests. Please try again after 60 seconds.',
    retryAfter: 60,
  },
});

// Pairing lookup - read-only operations (60/min)
const pairingLookupLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many lookup requests. Please try again after 60 seconds.',
    retryAfter: 60,
  },
});

// Pairing deletion - destructive operation (10/min)
const pairingDeleteLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many delete requests. Please try again after 60 seconds.',
    retryAfter: 60,
  },
});

// Health check - lenient for monitoring (100/min)
const healthLimiter = rateLimit({
  windowMs: 60_000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: wsPath });

// In-memory strictly for active socket lookup (transient)
// Sessions are persisted in DB, but we keep a local map if needed?
// No, let's trust the DB for existence, and only keep role mapping in memory.
// Actually, for routing to work, we need to know which socket corresponds to which role in a session.
// We can keep `clients` WeakMap, but `sessions` Map is dangerous if we want persistence.
// BUT, if we restart, the sockets die anyway.
// The benefit of DB is that if Mobile connects, and Desktop is waiting, and server restarts...
// well, if server restarts, both disconnect. They reconnect.
// If session data was in memory, it's gone. Desktop has a "code" it thinks is valid.
// Mobile tries to join. Server says "unknown code". Desktop has to re-pair.
// WITH DB: Server restarts. Desktop reconnects (or just stays on "bound" screen).
// Mobile joins. Server checks DB. Code is valid. Session proceeds.
// So we ONLY need DB for `code` validity and metadata. Routing is still transient.

// We will keep `activeSessions` for routing active sockets.
// But we will fetch from DB when a client registers.
const activeSessions = new Map<string, Session>();
const clients = new WeakMap<WebSocket, ConnectedClient>();

// Pending session rehydrations to prevent race conditions.
// When multiple clients connect simultaneously with the same code before
// the session is in activeSessions, we need to ensure only one rehydration
// occurs and all clients use the same session instance.
const pendingRehydrations = new Map<string, Promise<Session | null>>();

const pairingRequestSchema = z.object({
  ttlSeconds: z.number().min(30).max(900).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const registerMessageSchema = z.object({
  type: z.literal('register'),
  code: z.string().length(8),
  role: z.union([z.literal('desktop'), z.literal('mobile')]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// WebRTC SDP payload validation (offer/answer)
const sdpPayloadSchema = z.object({
  type: z.enum(['offer', 'answer']),
  sdp: z.string().max(100000), // SDP can be large but bounded
});

// WebRTC ICE candidate payload validation
const icePayloadSchema = z.object({
  candidate: z.string().max(500).nullable().optional(),
  sdpMid: z.string().max(50).nullable().optional(),
  sdpMLineIndex: z.number().int().min(0).max(100).nullable().optional(),
  usernameFragment: z.string().max(100).nullable().optional(),
});

// Control message payload (limited structure)
const controlPayloadSchema = z
  .object({
    action: z.string().max(50),
    data: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((val) => JSON.stringify(val).length <= 4096, { message: 'Control payload too large' });

const signalMessageSchema = z.object({
  type: z.literal('signal'),
  kind: z.union([z.literal('offer'), z.literal('answer'), z.literal('ice'), z.literal('control')]),
  payload: z.unknown(), // Validated per-kind below
});

// Validate payload based on signal kind
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

const heartbeatMessageSchema = z.object({
  type: z.literal('heartbeat'),
});

type RegisterMessage = z.infer<typeof registerMessageSchema>;
type SignalMessage = z.infer<typeof signalMessageSchema>;

// SECURITY: Rate limited to 100/min for monitoring
app.get('/health', healthLimiter, (_req, res) => {
  res.json({ status: 'ok' });
});

// SECURITY: Rate limited to 10/min to prevent enumeration attacks
app.post('/pairings', pairingCreateLimiter, async (req, res) => {
  const parseResult = pairingRequestSchema.safeParse(req.body ?? {});

  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.flatten() });
  }

  const { ttlSeconds = DEFAULT_TTL_SECONDS, metadata } = parseResult.data;

  const code = await generateUniqueCode();
  const now = Date.now();
  const expiresAt = now + ttlSeconds * 1000;

  // Persist to DB
  const { error } = await supabase.from('signaling_sessions').insert({
    code,
    created_at: now,
    expires_at: expiresAt,
    metadata: metadata ?? {},
  });

  if (error) {
    console.error('DB Insert Error', error);
    return res.status(500).json({ error: 'database_error' });
  }

  // We don't need to put it in activeSessions until someone connects.

  return res.json({
    code,
    expiresAt,
    expiresIn: ttlSeconds,
    httpUrl: publicHttpUrl,
    wsUrl: publicWsUrl,
    qrData: buildQrPayload(code),
  });
});

// SECURITY: Rate limited to 60/min - read-only operations
app.get('/pairings/:code', pairingLookupLimiter, async (req, res) => {
  const code = req.params['code'];
  if (!code) {
    return res.status(400).json({ error: 'missing_code' });
  }
  // Check DB
  const { data: sessionData } = await supabase
    .from('signaling_sessions')
    .select('*')
    .eq('code', code)
    .single();

  if (!sessionData) {
    return res.status(404).json({ error: 'pairing_not_found' });
  }

  // Check active participants for the response status
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
  const code = req.params['code'];
  if (!code) {
    return res.status(400).json({ error: 'missing_code' });
  }

  // Cleanup active connections
  const active = activeSessions.get(code);
  if (active) {
    disconnectParticipants(active);
    activeSessions.delete(code);
  }

  // Delete from DB
  const { error } = await supabase.from('signaling_sessions').delete().eq('code', code);

  if (error) {
    return res.status(500).json({ error: 'db_delete_error' });
  }

  return res.json({ success: true });
});

wss.on('connection', (socket) => {
  socket.on('message', (raw) => {
    const rawStr = raw.toString();

    // Check message size before parsing to prevent DoS
    if (rawStr.length > MAX_MESSAGE_SIZE_BYTES) {
      socket.send(JSON.stringify({ type: 'error', error: 'message_too_large' }));
      return;
    }

    let data: unknown;
    try {
      data = JSON.parse(rawStr);
    } catch {
      socket.send(JSON.stringify({ type: 'error', error: 'invalid_json' }));
      return;
    }

    if (!clients.has(socket)) {
      const parsed = registerMessageSchema.safeParse(data);
      if (!parsed.success) {
        socket.send(JSON.stringify({ type: 'error', error: 'registration_required' }));
        return;
      }
      handleRegister(socket, parsed.data);
      return;
    }

    const signalParsed = signalMessageSchema.safeParse(data);
    if (signalParsed.success) {
      const signalData = signalParsed.data;
      // Validate payload structure based on signal kind
      if (!validateSignalPayload(signalData.kind, signalData.payload)) {
        socket.send(JSON.stringify({ type: 'error', error: 'invalid_signal_payload' }));
        return;
      }
      handleSignal(socket, signalData);
      return;
    }

    if (heartbeatMessageSchema.safeParse(data).success) {
      socket.send(JSON.stringify({ type: 'heartbeat_ack', timestamp: Date.now() }));
      return;
    }

    socket.send(JSON.stringify({ type: 'error', error: 'unsupported_message' }));
  });

  socket.on('close', () => {
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

    // Clean up session from memory if no participants and session is expired
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
  // Cleanup active memory sessions that are expired
  for (const session of activeSessions.values()) {
    if (session.expiresAt <= now) {
      disconnectParticipants(session, 'session_expired');
      activeSessions.delete(session.code);
    }
  }
  // Optional: Clean DB for old sessions? Supabase can handle this with a cron or we do it lazily.
}, 30_000);

server.listen(port, host, () => {
  console.log(`[signaling] listening on http://${host}:${port} (WS: ${publicWsUrl})`);
});

process.on('SIGTERM', () => {
  clearInterval(cleanupInterval);
  wss.close();
  server.close(() => {
    process.exit(0);
  });
});

async function handleRegister(socket: WebSocket, message: RegisterMessage) {
  // Check active session first
  let session = activeSessions.get(message.code);

  if (!session) {
    // Check if there's a pending rehydration for this code (race condition prevention)
    // This ensures that if two clients connect simultaneously with the same code,
    // they both wait for and use the same rehydrated session instance.
    let pendingRehydration = pendingRehydrations.get(message.code);

    if (!pendingRehydration) {
      // No pending rehydration, start one
      pendingRehydration = (async (): Promise<Session | null> => {
        // Double-check activeSessions in case it was set while we were waiting
        const existingSession = activeSessions.get(message.code);
        if (existingSession) {
          return existingSession;
        }

        // Check DB
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

        // Rehydrate session
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

      pendingRehydrations.set(message.code, pendingRehydration);

      // Clean up pending map after rehydration completes
      pendingRehydration.finally(() => {
        pendingRehydrations.delete(message.code);
      });
    }

    // Wait for rehydration to complete (convert null to undefined for type compatibility)
    session = (await pendingRehydration) ?? undefined;

    if (!session) {
      // Session not found or expired - check DB one more time to distinguish errors
      const { data: dbSession } = await supabase
        .from('signaling_sessions')
        .select('expires_at')
        .eq('code', message.code)
        .single();

      if (!dbSession) {
        socket.send(JSON.stringify({ type: 'error', error: 'pairing_not_found' }));
      } else {
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

function handleSignal(socket: WebSocket, message: SignalMessage) {
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

function notifyParticipant(participant: Participant, payload: Record<string, unknown>) {
  if (participant.socket.readyState === WebSocket.OPEN) {
    participant.socket.send(JSON.stringify(payload));
  }
}

function notifyPeer(session: Session, role: Role, payload: Record<string, unknown>) {
  const peer = getPeer(session, role);
  if (peer) {
    notifyParticipant(peer, payload);
  }
}

function isSessionExpired(session: Session): boolean {
  return session.expiresAt <= Date.now();
}

// Generate a unique 8-character alphanumeric code with cryptographically secure randomness
// Uses base64url encoding for higher entropy (~48 bits vs ~20 bits for 6 digits)
async function generateUniqueCode(): Promise<string> {
  const MAX_ATTEMPTS = 10;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Generate 6 random bytes and encode as base64url, take first 8 characters
    // This provides ~48 bits of entropy (vs ~20 bits for 6 digits = 1M combinations)
    const code = randomBytes(6).toString('base64url').substring(0, 8).toUpperCase();

    // Check if code already exists in active sessions
    if (activeSessions.has(code)) {
      continue;
    }

    // Check if code exists in database
    const { data: existing } = await supabase
      .from('signaling_sessions')
      .select('code')
      .eq('code', code)
      .single();

    if (!existing) {
      return code;
    }
  }

  throw new Error('Failed to generate unique pairing code after maximum attempts');
}

function disconnectParticipants(
  session: Session,
  reason: 'session_expired' | 'terminated' = 'terminated',
) {
  for (const role of ['desktop', 'mobile'] as const) {
    const participant = session.participants[role];
    if (!participant) continue;
    try {
      notifyParticipant(participant, { type: reason });
      participant.socket.close();
    } catch (error) {
      console.warn(`[signaling] failed to close socket for role ${role}`, error);
    }
  }
}

function buildQrPayload(code: string): string {
  return `agiw:${code}`;
}
