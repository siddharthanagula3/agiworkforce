# AGI Workforce Backend Documentation

Complete documentation for AGI Workforce backend services (API Gateway & Signaling Server).

## 📚 Documentation Index

### Core Documentation

1. **[API Reference](./API_REFERENCE.md)** - Complete REST API specification
   - All endpoints with request/response examples
   - Authentication and authorization
   - Rate limiting and error codes
   - HTTP status codes and headers

2. **[WebSocket Protocol](./WEBSOCKET_PROTOCOL.md)** - Real-time communication protocols
   - API Gateway WebSocket (command delivery)
   - Signaling Server WebSocket (WebRTC pairing)
   - Message types and flows
   - Connection lifecycle

3. **[Backend Architecture](./BACKEND_ARCHITECTURE.md)** - System architecture and design
   - Service architecture overview
   - Technology stack
   - Database schema (PostgreSQL)
   - Security architecture
   - Deployment strategies
   - Performance optimization

4. **[Backend Examples](./BACKEND_EXAMPLES.md)** - Practical code examples
   - Authentication flows
   - Device management
   - Cross-device synchronization
   - Credit management
   - WebSocket communication
   - WebRTC pairing
   - Error handling patterns
   - Testing examples

---

## 🏗️ Quick Start

### Prerequisites

```bash
# Required
Node.js 22.12.0+
pnpm 9.15.3+
PostgreSQL (via Supabase)

# Environment variables
JWT_SECRET=your-secret-key
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Development Setup

```bash
# Install dependencies
pnpm install

# Start API Gateway (port 3000)
cd services/api-gateway
pnpm dev

# Start Signaling Server (port 4000)
cd services/signaling-server
pnpm dev
```

### Production Deployment

```bash
# Build services
pnpm build

# Start services
cd services/api-gateway && node dist/index.js
cd services/signaling-server && node dist/index.js
```

---

## 🔑 Key Features

### API Gateway (Port 3000)

**REST API:**

- User authentication (JWT)
- Desktop device management
- Mobile device management
- Cross-device synchronization
- Credit management (usage tracking)
- Rate limiting (per-user/per-IP)

**WebSocket Server:**

- Real-time command delivery
- Desktop-to-desktop sync
- Offline command queueing
- Heartbeat/keep-alive

### Signaling Server (Port 4000)

**HTTP Endpoints:**

- Pairing code generation
- Session management

**WebSocket Server:**

- WebRTC signaling (offer/answer/ICE)
- Desktop-mobile pairing
- Session persistence (database-backed)

---

## 📊 Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Clients                              │
│  Desktop  │  Mobile  │   Web   │   CLI                  │
└─────┬──────────┬──────────┬──────────┬──────────────────┘
      │          │          │          │
      │    JWT Authentication (7-day tokens)
      │          │          │          │
┌─────▼──────────▼──────────▼──────────▼──────────────────┐
│              API Gateway (Port 3000)                     │
│  ┌────────────────────────────────────────────────┐    │
│  │ REST API                                       │    │
│  │  - /api/auth (register, login, verify)        │    │
│  │  - /api/desktop (CRUD devices, commands)      │    │
│  │  - /api/mobile (CRUD devices, pairing)        │    │
│  │  - /api/sync (batch, updates, status)         │    │
│  │  - /api/credits (balance, check, deduct)      │    │
│  └────────────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────────────┐    │
│  │ WebSocket (/ws)                                │    │
│  │  - Command delivery                            │    │
│  │  - Sync broadcasting                           │    │
│  │  - Offline queueing (in-memory)                │    │
│  └────────────────────────────────────────────────┘    │
└──────────────────────┬──────────────────────────────────┘
                       │
                       │ Supabase SDK
                       │ (service_role key)
                       ▼
┌─────────────────────────────────────────────────────────┐
│           Supabase PostgreSQL Database                   │
│  - profiles, subscriptions, token_credits               │
│  - desktop_devices, mobile_devices, sync_data           │
│  - signaling_sessions, processed_stripe_events          │
│  - Row Level Security (RLS) enabled                     │
│  - Database functions for credits & webhooks            │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│         Signaling Server (Port 4000)                     │
│  ┌────────────────────────────────────────────────┐    │
│  │ HTTP REST                                      │    │
│  │  POST /pairings (create code)                  │    │
│  │  GET /pairings/:code (lookup)                  │    │
│  │  DELETE /pairings/:code (cleanup)              │    │
│  └────────────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────────────┐    │
│  │ WebSocket (/ws)                                │    │
│  │  - Device registration (desktop/mobile)        │    │
│  │  - WebRTC signaling (offer/answer/ICE)         │    │
│  │  - Session management (TTL cleanup)            │    │
│  └────────────────────────────────────────────────┘    │
└──────────────────────┬──────────────────────────────────┘
                       │
                       │ Supabase SDK
                       │ (session persistence)
                       ▼
                  signaling_sessions
                  (database table)
```

---

## 🔒 Security Features

### Defense in Depth

**Network Layer:**

- HTTPS/TLS in production
- CORS with whitelisted origins
- Helmet security headers

**Application Layer:**

- JWT authentication (HS256)
- Rate limiting (per-user/per-IP)
- Input validation (Zod schemas)
- Message size limits (64KB)

**Data Layer:**

- Row Level Security (RLS)
- Encrypted at rest (Supabase)
- Connection pooling with SSL

**Business Logic:**

- Ownership verification
- Idempotency (financial operations)
- Audit logging (credit transactions)
- Timing attack prevention

### OWASP Top 10 Coverage

All OWASP Top 10 threats are mitigated. See [BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md#owasp-top-10-mitigations) for details.

---

## 📈 Performance Characteristics

### API Gateway

**Throughput:**

- ~10,000 concurrent WebSocket connections per instance
- REST API: 1000+ req/sec (rate limited per user)
- Database queries: <50ms p95 latency

**Memory:**

- Base: ~50MB
- Per WebSocket connection: ~1KB
- Pending command queue: ~100KB per user (100 commands × 1KB)

### Signaling Server

**Throughput:**

- Ephemeral connections (10-30 second sessions)
- Typical pairing: 20-100 messages total
- 1:1 message routing (no broadcast)

**Memory:**

- Base: ~30MB
- Active sessions: <100 concurrent typical
- Database-backed (no memory leaks)

---

## 🧪 Testing

### Running Tests

```bash
# API Gateway
cd services/api-gateway
pnpm test

# Signaling Server
cd services/signaling-server
pnpm test

# Integration tests (requires services running)
pnpm test:integration
```

### Test Coverage

See [BACKEND_EXAMPLES.md](./BACKEND_EXAMPLES.md#testing-examples) for:

- Unit testing API endpoints
- Integration testing WebSocket
- Mock server patterns

---

## 📖 Common Use Cases

### 1. User Authentication

```typescript
// Register new user
const { token, user } = await fetch('/api/auth/register', {
  method: 'POST',
  body: JSON.stringify({ email, password }),
}).then((r) => r.json());

// Use token for authenticated requests
const response = await fetch('/api/desktop', {
  headers: { Authorization: `Bearer ${token}` },
});
```

**Reference:** [API Reference - Authentication](./API_REFERENCE.md#authentication-endpoints)

---

### 2. Desktop Command Delivery

```typescript
// Mobile sends command to desktop
await fetch(`/api/desktop/${desktopId}/command`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    type: 'chat',
    payload: { message: 'Hello, AI!' },
  }),
});

// Desktop receives via WebSocket
ws.onmessage = (event) => {
  const { type, commandType, payload } = JSON.parse(event.data);
  if (type === 'command') {
    handleCommand(commandType, payload);
  }
};
```

**Reference:** [WebSocket Protocol - Command Delivery](./WEBSOCKET_PROTOCOL.md#command-delivery)

---

### 3. Cross-Device Sync

```typescript
// Push local changes
await fetch('/api/sync/batch', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'X-Device-Id': deviceId,
  },
  body: JSON.stringify({
    items: [
      /* sync items */
    ],
    device_id: deviceId,
    user_id: userId,
    timestamp: new Date().toISOString(),
  }),
});

// Pull remote changes
const updates = await fetch(`/api/sync/updates?since=${lastSyncTime}`, {
  headers: {
    Authorization: `Bearer ${token}`,
    'X-Device-Id': deviceId,
  },
}).then((r) => r.json());
```

**Reference:** [API Reference - Sync](./API_REFERENCE.md#sync)

---

### 4. WebRTC Device Pairing

```typescript
// Mobile: Request pairing code
const { code, signaling } = await fetch('/api/mobile/pairing-code', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
}).then((r) => r.json());

// Display code to user
console.log('Pairing code:', code);

// Both devices connect to signaling server
const ws = new WebSocket(signaling.wsUrl);

ws.onopen = () => {
  ws.send(
    JSON.stringify({
      type: 'register',
      code: code,
      role: 'mobile', // or 'desktop'
    }),
  );
};

// Exchange WebRTC signals...
```

**Reference:** [WebSocket Protocol - Pairing Flow](./WEBSOCKET_PROTOCOL.md#device-pairing-flow)

---

### 5. Credit Management

```typescript
// Check balance
const balance = await fetch('/api/credits/balance', {
  headers: { Authorization: `Bearer ${token}` },
}).then((r) => r.json());

console.log(`Remaining: $${balance.credits_remaining_cents / 100}`);

// Deduct credits
await fetch('/api/credits/deduct', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    amount_cents: 1000,
    description: 'LLM usage',
    metadata: { model: 'claude-3-sonnet', tokens: 1000 },
    idempotency_key: `request-${Date.now()}`,
  }),
});
```

**Reference:** [API Reference - Credits](./API_REFERENCE.md#credits)

---

## 🐛 Debugging

### Enable Debug Logging

```bash
# API Gateway
DEBUG=* pnpm dev

# Signaling Server
DEBUG=signaling:* pnpm dev
```

### Common Issues

| Issue                        | Solution                                         |
| ---------------------------- | ------------------------------------------------ |
| WebSocket closes immediately | Check JWT token validity, ensure auth within 30s |
| Commands not routing         | Verify deviceId set during WebSocket auth        |
| Pairing fails                | Check code hasn't expired (5 min TTL)            |
| Rate limit hit               | Wait for window expiry or increase limits        |
| Database connection errors   | Verify SUPABASE_URL and SERVICE_ROLE_KEY         |

**Reference:** [WebSocket Protocol - Debugging](./WEBSOCKET_PROTOCOL.md#debugging-tips)

---

## 🚀 Deployment

### Environment Variables

#### API Gateway (.env)

```bash
# Required
JWT_SECRET=random-secret-key-min-32-chars
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Optional
PORT=3000
NODE_ENV=production
ALLOWED_ORIGINS=https://app.agiworkforce.com
TRUST_PROXY=true
```

#### Signaling Server (.env)

```bash
# Required
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Optional
PORT=4000
SIGNALING_PAIRING_TTL=300
```

### Production Deployment

**Platforms:**

- Railway
- Fly.io
- Vercel
- DigitalOcean App Platform
- AWS ECS/Fargate

**Requirements:**

- Node.js 22+ runtime
- PostgreSQL (Supabase)
- SSL/TLS certificates
- Persistent storage not required (stateless services)

**Reference:** [Backend Architecture - Deployment](./BACKEND_ARCHITECTURE.md#deployment)

---

## 📊 Monitoring

### Health Check Endpoints

```bash
# API Gateway
curl http://localhost:3000/health
# { "status": "ok", "timestamp": 1609459200000 }

# Signaling Server
curl http://localhost:4000/health
# { "status": "ok" }
```

### Key Metrics

- HTTP request rate & latency (p50, p95, p99)
- WebSocket connections (active count)
- Database query time
- Rate limit hits (429 responses)
- Error rate (4xx, 5xx)

**Reference:** [Backend Architecture - Monitoring](./BACKEND_ARCHITECTURE.md#monitoring--observability)

---

## 🤝 Contributing

### Adding New Endpoints

1. Create route handler in `/src/routes/`
2. Add rate limit config in `/src/middleware/rateLimit.ts`
3. Register route in `/src/index.ts`
4. Update API documentation

**Reference:** [Backend Architecture - Common Operations](./BACKEND_ARCHITECTURE.md#common-backend-operations)

### Adding Database Tables

1. Create migration SQL in `/apps/web/supabase/migrations/`
2. Apply migration via Supabase CLI or dashboard
3. Update TypeScript types

---

## 📚 Additional Resources

### Documentation Files

- [CLAUDE.md](../CLAUDE.md) - Project overview and development guide
- [API_REFERENCE.md](./API_REFERENCE.md) - Complete API specification
- [WEBSOCKET_PROTOCOL.md](./WEBSOCKET_PROTOCOL.md) - Real-time protocols
- [BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md) - System design
- [BACKEND_EXAMPLES.md](./BACKEND_EXAMPLES.md) - Code examples

### External Links

- [Supabase Documentation](https://supabase.com/docs)
- [Express.js Guide](https://expressjs.com/)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [WebRTC Documentation](https://webrtc.org/getting-started/overview)

---

## 🆘 Support

**Email:** support@agiworkforce.com

**GitHub Issues:** https://github.com/agiworkforce/agiworkforce/issues

**Documentation:** https://docs.agiworkforce.com

---

## 📝 License

See [LICENSE](../LICENSE) in the root directory.

---

## ✅ Checklist for Backend Developers

- [ ] Read [API_REFERENCE.md](./API_REFERENCE.md)
- [ ] Review [BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md)
- [ ] Set up development environment (Node.js, pnpm, Supabase)
- [ ] Configure environment variables (.env files)
- [ ] Start both services (API Gateway + Signaling Server)
- [ ] Test authentication flow
- [ ] Test WebSocket connection
- [ ] Test device registration
- [ ] Review security practices (RLS, rate limiting, input validation)
- [ ] Run test suite
- [ ] Review deployment guide

---

**Last Updated:** 2026-01-15

**Version:** 1.0.0
