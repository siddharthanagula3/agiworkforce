import 'dotenv/config';

import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import { randomInt } from 'node:crypto';
import { AddressInfo } from 'node:net';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';

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
const host = process.env['SIGNALING_HOST'] ?? '0.0.0.0';
const port = Number(process.env['PORT'] ?? process.env['SIGNALING_PORT'] ?? 4000);
const wsPath = process.env['SIGNALING_WS_PATH'] ?? '/ws';
const publicHttpUrl = process.env['SIGNALING_HTTP_URL'] ?? `http://localhost:${port}`;
const publicWsUrl =
  process.env['SIGNALING_WS_URL'] ??
  `${publicHttpUrl.startsWith('https') ? 'wss' : 'ws'}://${publicHttpUrl.replace(/^https?:\/\//, '')}${wsPath}`;

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server, path: wsPath });

const sessions = new Map<string, Session>();
const clients = new WeakMap<WebSocket, ConnectedClient>();

const pairingRequestSchema = z.object({
  ttlSeconds: z.number().min(30).max(900).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const registerMessageSchema = z.object({
  type: z.literal('register'),
  code: z.string().length(6),
  role: z.union([z.literal('desktop'), z.literal('mobile')]),
  metadata: z.record(z.string(), z.unknown()).optional(),
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

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/pairings', (req, res) => {
  const parseResult = pairingRequestSchema.safeParse(req.body ?? {});

  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.flatten() });
  }

  const { ttlSeconds = DEFAULT_TTL_SECONDS, metadata } = parseResult.data;

  const code = generateUniqueCode();
  const now = Date.now();
  const expiresAt = now + ttlSeconds * 1000;

  sessions.set(code, {
    code,
    createdAt: now,
    expiresAt,
    participants: {},
    metadata: metadata ?? null,
  });

  return res.json({
    code,
    expiresAt,
    expiresIn: ttlSeconds,
    httpUrl: publicHttpUrl,
    wsUrl: publicWsUrl,
    qrData: buildQrPayload(code),
  });
});

app.get('/pairings/:code', (req, res) => {
  const code = req.params['code'];
  const session = sessions.get(code);
  if (!session) {
    return res.status(404).json({ error: 'pairing_not_found' });
  }
  if (isSessionExpired(session)) {
    sessions.delete(code);
    return res.status(410).json({ error: 'pairing_expired' });
  }

  return res.json({
    code: session.code,
    expiresAt: session.expiresAt,
    roles: {
      desktop: Boolean(session.participants.desktop),
      mobile: Boolean(session.participants.mobile),
    },
  });
});

app.delete('/pairings/:code', (req, res) => {
  const code = req.params['code'];
  const session = sessions.get(code);
  if (!session) {
    return res.status(404).json({ error: 'pairing_not_found' });
  }

  disconnectParticipants(session);
  sessions.delete(code);
  return res.json({ success: true });
});

wss.on('connection', (socket) => {
  socket.on('message', (raw) => {
    let data: unknown;
    try {
      data = JSON.parse(raw.toString());
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

    if (signalMessageSchema.safeParse(data).success) {
      handleSignal(socket, data as SignalMessage);
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

    const session = sessions.get(client.code);
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
      session.expiresAt < Date.now() + DEFAULT_TTL_SECONDS * 500
    ) {
      sessions.delete(client.code);
    }
  });
});

const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const session of sessions.values()) {
    if (session.expiresAt <= now) {
      disconnectParticipants(session, 'session_expired');
      sessions.delete(session.code);
    }
  }
}, 30_000);

server.listen(port, host, () => {
  const address = server.address() as AddressInfo;
  console.log(
    `[signaling] listening on http://${address.address}:${address.port} (ws path: ${wsPath})`,
  );
});

process.on('SIGTERM', () => {
  clearInterval(cleanupInterval);
  wss.close();
  server.close(() => {
    process.exit(0);
  });
});

function handleRegister(socket: WebSocket, message: RegisterMessage) {
  const session = sessions.get(message.code);
  if (!session) {
    socket.send(JSON.stringify({ type: 'error', error: 'pairing_not_found' }));
    socket.close();
    return;
  }

  if (isSessionExpired(session)) {
    sessions.delete(message.code);
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
  const session = sessions.get(client.code);
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

function generateUniqueCode(): string {
  let attempts = 0;
  while (attempts < 5) {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    if (!sessions.has(code)) {
      return code;
    }
    attempts += 1;
  }
  throw new Error('failed_to_generate_pairing_code');
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
  const payload = {
    v: 1,
    code,
    ws: publicWsUrl,
  };
  return `agiw://pair?data=${encodeURIComponent(JSON.stringify(payload))}`;
}
