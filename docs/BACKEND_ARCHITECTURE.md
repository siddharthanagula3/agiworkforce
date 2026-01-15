# Backend Architecture

Comprehensive architecture documentation for AGI Workforce backend services.

## Table of Contents

- [Overview](#overview)
- [Service Architecture](#service-architecture)
- [Technology Stack](#technology-stack)
- [Database Schema](#database-schema)
- [Authentication & Authorization](#authentication--authorization)
- [Security Architecture](#security-architecture)
- [Data Flow](#data-flow)
- [Deployment](#deployment)
- [Monitoring & Observability](#monitoring--observability)
- [Performance Optimization](#performance-optimization)
- [Common Backend Operations](#common-backend-operations)

---

## Overview

AGI Workforce backend consists of two Node.js microservices and a Supabase PostgreSQL database:

1. **API Gateway** (Port 3000): REST API and WebSocket server for desktop/mobile device management
2. **Signaling Server** (Port 4000): WebRTC signaling for peer-to-peer device pairing
3. **Supabase PostgreSQL**: Persistent data store with Row Level Security (RLS)

**Architecture Pattern:** Microservices with shared database

**Communication:**

- REST API for CRUD operations
- WebSocket for real-time communication
- PostgreSQL for persistent storage
- Service-to-service HTTP for internal communication

---

## Service Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Desktop  │  │  Mobile  │  │   Web    │  │  CLI     │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
└───────┼─────────────┼─────────────┼─────────────┼──────────────┘
        │             │             │             │
        │ JWT Auth    │ JWT Auth    │ JWT Auth    │ JWT Auth
        │             │             │             │
┌───────▼─────────────▼─────────────▼─────────────▼──────────────┐
│                     API Gateway (Port 3000)                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Express.js Server                                        │  │
│  │  - REST API Routes                                       │  │
│  │  - JWT Authentication Middleware                         │  │
│  │  - Rate Limiting (per-user, per-IP)                      │  │
│  │  - Request Validation (Zod schemas)                      │  │
│  │  - Security Headers (Helmet)                             │  │
│  │  - Error Handling                                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ WebSocket Server (/ws)                                   │  │
│  │  - Command delivery to desktop clients                   │  │
│  │  - Real-time sync broadcasting                           │  │
│  │  - Offline command queueing (in-memory)                  │  │
│  │  - Heartbeat/keep-alive (30s interval)                   │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────┬────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
┌───────────────┐ ┌──────────────┐ ┌──────────────────┐
│  Auth Routes  │ │Device Routes │ │  Sync Routes     │
│  /api/auth/*  │ │/api/desktop/*│ │  /api/sync/*     │
│               │ │/api/mobile/* │ │  /api/credits/*  │
└───────────────┘ └──────────────┘ └──────────────────┘
        │                 │                 │
        └─────────────────┼─────────────────┘
                          │
                          │ Supabase SDK
                          │ (service_role key)
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Supabase PostgreSQL                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Core Tables                                              │  │
│  │  - profiles (user metadata)                              │  │
│  │  - subscriptions (Stripe integration)                    │  │
│  │  - token_credits (usage tracking)                        │  │
│  │  - desktop_devices (registered desktop clients)          │  │
│  │  - mobile_devices (registered mobile clients)            │  │
│  │  - sync_data (cross-device synchronization)              │  │
│  │  - signaling_sessions (WebRTC pairing codes)             │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Row Level Security (RLS)                                 │  │
│  │  - Users can only access their own data                  │  │
│  │  - Service role has full access                          │  │
│  │  - Authenticated role has filtered access               │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Database Functions (RPCs)                                │  │
│  │  - get_credit_balance()                                  │  │
│  │  - check_credits_available()                             │  │
│  │  - deduct_credits() (with idempotency)                   │  │
│  │  - process_stripe_event_idempotent()                     │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              Signaling Server (Port 4000)                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ HTTP REST Endpoints                                      │  │
│  │  POST /pairings (create pairing code)                    │  │
│  │  GET /pairings/:code (lookup status)                     │  │
│  │  DELETE /pairings/:code (cleanup)                        │  │
│  │  - Rate limiting (per-IP)                                │  │
│  │  - Input validation (Zod schemas)                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ WebSocket Server (/ws)                                   │  │
│  │  - Device registration (desktop/mobile)                  │  │
│  │  - WebRTC signal routing (offer/answer/ICE)              │  │
│  │  - Session management (TTL-based expiry)                 │  │
│  │  - Race condition prevention (pending rehydrations)      │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ In-Memory State                                          │  │
│  │  - activeSessions (Map<code, Session>)                   │  │
│  │  - clients (WeakMap<socket, ConnectedClient>)            │  │
│  │  - pendingRehydrations (Map<code, Promise>)              │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ Supabase SDK
                         │ (service_role key)
                         ▼
              ┌─────────────────────┐
              │ signaling_sessions  │
              │  - code (PK)        │
              │  - created_at       │
              │  - expires_at       │
              │  - metadata         │
              └─────────────────────┘
```

---

## Technology Stack

### Core Technologies

| Component        | Technology         | Version     | Purpose                 |
| ---------------- | ------------------ | ----------- | ----------------------- |
| Runtime          | Node.js            | 22.12.0+    | JavaScript runtime      |
| Package Manager  | pnpm               | 9.15.3+     | Workspace management    |
| API Framework    | Express.js         | 5.2.1       | REST API server         |
| WebSocket        | ws                 | 8.18.3      | Real-time communication |
| Database         | PostgreSQL         | (Supabase)  | Persistent storage      |
| ORM/Client       | Supabase SDK       | 2.89.0      | Database access         |
| Validation       | Zod                | 4.3.5       | Schema validation       |
| Authentication   | jsonwebtoken       | 9.0.3       | JWT handling            |
| Password Hashing | bcryptjs           | 3.0.3       | Password security       |
| Security Headers | Helmet             | 8.1.0       | HTTP security           |
| Rate Limiting    | express-rate-limit | 7.5.0-8.2.1 | DoS protection          |
| CORS             | cors               | 2.8.5       | Cross-origin handling   |

### Development Tools

| Tool       | Purpose                            |
| ---------- | ---------------------------------- |
| tsx        | TypeScript execution (development) |
| TypeScript | Type safety & compilation          |
| ESLint     | Code linting                       |
| Prettier   | Code formatting                    |
| Vitest     | Unit testing                       |

---

## Database Schema

### Core Tables

#### profiles

User profile metadata linked to Supabase auth.

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Indexes:**

- Primary key on `id`

**RLS Policies:**

- Users can view and update their own profile
- Service role has full access

---

#### subscriptions

Stripe subscription data for billing.

```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,
  plan_tier TEXT NOT NULL DEFAULT 'free'
    CHECK (plan_tier IN ('free', 'hobby', 'pro', 'max', 'enterprise')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', ...)),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  canceled_at TIMESTAMPTZ,
  stripe_coupon_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Indexes:**

- Primary key on `id`
- Unique on `stripe_customer_id`
- Unique on `stripe_subscription_id`

**RLS Policies:**

- Users can view their own subscription
- Service role manages subscriptions

**Plan Tier Hierarchy:**

1. `free` (0)
2. `hobby` (1)
3. `pro` (2)
4. `max` (3)
5. `enterprise` (4)

---

#### token_credits

API usage credits tracking.

```sql
CREATE TABLE token_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  subscription_id UUID REFERENCES subscriptions(id),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  credits_allocated_cents INTEGER NOT NULL DEFAULT 0,
  credits_used_cents INTEGER NOT NULL DEFAULT 0,
  credits_remaining_cents INTEGER NOT NULL DEFAULT 0 CHECK (>= 0),
  daily_used_cents INTEGER DEFAULT 0,
  last_daily_reset_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Indexes:**

- Primary key on `id`
- Index on `user_id`

**RLS Policies:**

- Users can view their own credits
- Service role manages credits

**Database Functions:**

- `get_credit_balance(user_id)`: Get current balance
- `check_credits_available(user_id, amount)`: Check if sufficient
- `deduct_credits(user_id, amount, description, metadata, idempotency_key)`: Deduct with idempotency

---

#### desktop_devices

Registered desktop client devices.

```sql
CREATE TABLE desktop_devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  platform TEXT NOT NULL CHECK (platform IN ('macos', 'windows', 'linux')),
  version TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Indexes:**

- Primary key on `id`
- Index on `user_id`
- Index on `last_seen_at DESC` (for online status)

**RLS Policies:**

- Users CRUD their own devices
- Service role has full access

**Online Status Logic:**

- Device is online if `last_seen_at` < 60 seconds ago
- Desktop clients should POST heartbeat every 30-60 seconds

---

#### mobile_devices

Registered mobile client devices.

```sql
CREATE TABLE mobile_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  name TEXT NOT NULL,
  push_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Indexes:**

- Primary key on `id`
- Index on `user_id`
- Index on `push_token` (where not null)

**RLS Policies:**

- Users CRUD their own devices
- Service role has full access

---

#### sync_data

Cross-device synchronization data.

```sql
CREATE TABLE sync_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  sync_type TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, device_id, sync_type, created_at)
);
```

**Indexes:**

- Primary key on `id`
- Index on `(user_id, created_at DESC)` (main query pattern)
- Index on `(device_id, created_at DESC)`
- Unique constraint on `(user_id, device_id, sync_type, created_at)`

**RLS Policies:**

- Users can SELECT, INSERT, DELETE their own sync data
- Service role has full access

**Data Lifecycle:**

- TTL: 24 hours (automatic cleanup via trigger)
- Max entries per user: 1000 (enforced via trigger)
- Oldest entries deleted when limit exceeded

**Triggers:**

- `cleanup_old_sync_data()`: Delete data older than 24 hours
- `enforce_sync_data_limit()`: Keep only 1000 most recent entries per user

---

#### signaling_sessions

WebRTC pairing session codes.

```sql
CREATE TABLE signaling_sessions (
  code TEXT PRIMARY KEY,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  metadata JSONB DEFAULT '{}'
);
```

**Indexes:**

- Primary key on `code` (unique constraint for atomic generation)
- Index on `expires_at` (for cleanup queries)

**RLS Policies:**

- Service role only (not exposed to users)

**Session Lifecycle:**

- TTL: 30-900 seconds (configurable, default 300)
- Code format: 8-character alphanumeric (base64url, ~48 bits entropy)
- Automatic cleanup: Every 30 seconds (in-memory + DB)

---

#### processed_stripe_events

Webhook idempotency tracking.

```sql
CREATE TABLE processed_stripe_events (
  event_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Purpose:** Prevent duplicate processing of Stripe webhook events

**RLS Policies:**

- Service role only

---

### Database Functions (RPCs)

#### get_credit_balance

Get current credit balance for a user.

**Signature:**

```sql
FUNCTION get_credit_balance(p_user_id UUID)
RETURNS TABLE (
  account_id UUID,
  credits_allocated_cents INTEGER,
  credits_used_cents INTEGER,
  credits_remaining_cents INTEGER,
  daily_limit_cents INTEGER,
  daily_used_cents INTEGER,
  daily_remaining_cents INTEGER,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  last_daily_reset_at TIMESTAMPTZ
)
```

**Security:** SECURITY DEFINER (runs with function owner permissions)

---

#### check_credits_available

Check if user has enough credits for an amount.

**Signature:**

```sql
FUNCTION check_credits_available(
  p_user_id UUID,
  p_amount_cents INTEGER
) RETURNS BOOLEAN
```

**Logic:**

- Checks `credits_remaining_cents >= p_amount_cents`
- Checks daily limit if applicable

**Security:** SECURITY DEFINER

---

#### deduct_credits

Deduct credits from user account with idempotency.

**Signature:**

```sql
FUNCTION deduct_credits(
  p_user_id UUID,
  p_amount_cents INTEGER,
  p_description TEXT,
  p_metadata JSONB,
  p_idempotency_key TEXT
) RETURNS TABLE (
  success BOOLEAN,
  error TEXT,
  code TEXT,
  remaining_cents INTEGER,
  daily_limit INTEGER,
  daily_used INTEGER,
  daily_remaining INTEGER,
  reset_in_hours INTEGER
)
```

**Features:**

- Atomic deduction (transaction)
- Idempotency via `idempotency_key` (cached in `credit_transactions` table)
- Daily limit enforcement
- Automatic daily reset (24h TTL)
- Returns detailed error info on failure

**Error Codes:**

- `INSUFFICIENT_CREDITS`: Not enough credits remaining
- `DAILY_LIMIT_EXCEEDED`: Daily limit reached
- `NO_ACCOUNT`: No credit account found

**Security:** SECURITY DEFINER

---

#### process_stripe_event_idempotent

Process Stripe webhook event with idempotency.

**Signature:**

```sql
FUNCTION process_stripe_event_idempotent(
  p_event_id TEXT
) RETURNS BOOLEAN
```

**Logic:**

- Checks if `event_id` already processed
- Inserts into `processed_stripe_events` if not
- Returns `TRUE` if should process, `FALSE` if duplicate

**Security:** SECURITY DEFINER

---

## Authentication & Authorization

### JWT Authentication

**Token Structure:**

```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "iat": 1234567890,
  "exp": 1234567890
}
```

**Token Lifecycle:**

- Issued on login/register
- 7-day expiration
- HS256 algorithm (HMAC with SHA-256)
- Secret stored in `JWT_SECRET` environment variable

**Token Validation:**

```typescript
// Middleware: authenticateToken
try {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const payload = jwt.verify(token, JWT_SECRET);
  req.user = authenticatedUserSchema.parse(payload);
  next();
} catch (error) {
  res.status(403).json({ error: 'Invalid or expired token' });
}
```

**Security Features:**

- HMAC signature prevents tampering
- Expiration enforced by JWT library
- No token refresh endpoint (re-authenticate to get new token)
- Token includes minimal data (no sensitive fields)

---

### Password Security

**Hashing:**

- Algorithm: bcrypt
- Cost factor: 10 (2^10 = 1,024 rounds)
- Automatic salt generation

**Registration:**

```typescript
const passwordHash = await bcrypt.hash(password, 10);
// Store passwordHash in database
```

**Login with Timing Attack Prevention:**

```typescript
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7...';

// Always run bcrypt.compare even if user doesn't exist
const hashToCompare = userRecord ? userRecord.password_hash : DUMMY_HASH;
const isValid = await bcrypt.compare(password, hashToCompare);

// Check both conditions after bcrypt (prevents timing leak)
if (!userRecord || !isValid) {
  throw new AppError('Invalid credentials', 401);
}
```

**Security Features:**

- No plaintext password storage
- Timing attack prevention (constant-time comparison)
- User enumeration prevention (same error for non-existent/wrong password)

---

### Row Level Security (RLS)

All tables use PostgreSQL Row Level Security for authorization.

**Pattern:**

```sql
-- Enable RLS
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

-- User policy (authenticated users)
CREATE POLICY "users_policy" ON table_name
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role policy (full access)
CREATE POLICY "service_policy" ON table_name
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

**Role Hierarchy:**

1. `anon`: Unauthenticated (public access, if any)
2. `authenticated`: Logged-in users (RLS filtered)
3. `service_role`: Backend services (full access)

**API Gateway Connection:**

- Uses `service_role` key (bypasses RLS)
- Implements authorization logic in application code
- Returns 404 for "not found" AND "not owned" (prevents enumeration)

---

## Security Architecture

### Defense in Depth

AGI Workforce implements multiple layers of security:

1. **Network Layer:**
   - HTTPS/TLS in production
   - CORS with whitelisted origins
   - Helmet security headers

2. **Application Layer:**
   - JWT authentication
   - Rate limiting per user/IP
   - Input validation (Zod schemas)
   - Content-Type validation
   - Message size limits

3. **Data Layer:**
   - Row Level Security (RLS)
   - Encrypted at rest (Supabase)
   - Connection pooling with SSL

4. **Business Logic:**
   - Ownership verification
   - Idempotency for financial operations
   - Audit logging (credit transactions)

---

### OWASP Top 10 Mitigations

| Threat                         | Mitigation                                                            |
| ------------------------------ | --------------------------------------------------------------------- |
| A01: Broken Access Control     | RLS policies, ownership checks, 404 for enumeration prevention        |
| A02: Cryptographic Failures    | bcrypt password hashing, JWT signatures, HTTPS in production          |
| A03: Injection                 | Zod validation, parameterized queries (Supabase SDK), UUID validation |
| A04: Insecure Design           | Threat modeling, security by default, fail-secure defaults            |
| A05: Security Misconfiguration | Helmet headers, CORS whitelist, disabled x-powered-by                 |
| A06: Vulnerable Components     | Automated dependency updates, npm audit in CI                         |
| A07: Auth Failures             | JWT with expiration, timing attack prevention, rate limiting          |
| A08: Software & Data Integrity | Webhook idempotency, event deduplication, version pinning             |
| A09: Logging Failures          | Error logging, credit transaction audit trail                         |
| A10: SSRF                      | Input validation, URL parsing, no user-controlled fetch               |

---

### Rate Limiting Strategy

**Implementation:** `express-rate-limit` with in-memory store

**Key Generation:**

```typescript
function keyGenerator(req: Request): string {
  // Prefer user ID from JWT
  const userId = req.user?.userId;
  if (userId) return `user:${userId}`;

  // Fallback to IP for unauthenticated
  return `ip:${req.ip || 'unknown'}`;
}
```

**Limit Tiers:**

| Tier               | Window | Max | Use Case                 |
| ------------------ | ------ | --- | ------------------------ |
| Financial Strict   | 1 min  | 5   | Credit deductions        |
| Financial Moderate | 1 min  | 10  | Credit checks, balance   |
| Device Management  | 1 min  | 10  | Register, delete         |
| Operations         | 1 min  | 30  | Commands, sync batch     |
| Reads              | 1 min  | 60  | Status, updates, polling |
| Heartbeat          | 1 min  | 600 | 10/sec for real-time     |
| Health             | 1 min  | 100 | Monitoring systems       |

**Headers:**

```http
RateLimit-Limit: 30
RateLimit-Remaining: 29
RateLimit-Reset: 1609459200
```

**Error Response (429):**

```json
{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests. Please try again after 60 seconds.",
  "retryAfter": 60
}
```

**Production Considerations:**

- In-memory store suitable for single-instance deployments
- For distributed systems, use Redis store (e.g., `rate-limit-redis`)
- Configure `trust proxy` if behind load balancer

---

### Input Validation

**Strategy:** Strict validation with Zod schemas

**Pattern:**

```typescript
const schema = z
  .object({
    name: z.string().min(1).max(100),
    platform: z.enum(['macos', 'windows', 'linux']),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
  })
  .strict(); // Rejects unexpected fields

const data = schema.parse(req.body); // Throws on validation error
```

**Security Benefits:**

- `.strict()` prevents mass assignment attacks
- Regex validation prevents injection
- Type coercion disabled (must be exact type)
- Enum validation prevents invalid values

**UUID Validation:**

```typescript
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(id: string | undefined): boolean {
  return typeof id === 'string' && UUID_REGEX.test(id);
}
```

---

### Security Headers (Helmet)

Automatically applied by Helmet middleware:

```typescript
app.use(helmet());
```

**Headers Set:**

- `X-Content-Type-Options: nosniff` (prevents MIME sniffing)
- `X-Frame-Options: DENY` (prevents clickjacking)
- `X-XSS-Protection: 1; mode=block` (XSS protection)
- `Strict-Transport-Security` (HTTPS enforcement)
- `Content-Security-Policy` (resource loading restrictions)

**Additional Custom Security:**

```typescript
app.disable('x-powered-by'); // Remove server fingerprinting
```

---

## Data Flow

### User Registration Flow

```
┌─────────┐
│  Client │
└────┬────┘
     │ POST /api/auth/register
     │ { email, password }
     ▼
┌─────────────────────────────┐
│    API Gateway              │
│  1. Validate input (Zod)    │
│  2. Check if user exists    │────► Supabase: SELECT from users
│  3. Hash password (bcrypt)  │
│  4. Insert user             │────► Supabase: INSERT into users
│  5. Generate JWT            │
│  6. Return token + user     │
└────┬────────────────────────┘
     │ { token, user }
     ▼
┌─────────┐
│  Client │
│  Stores │
│  JWT    │
└─────────┘
```

---

### Desktop Command Flow

```
┌─────────────┐                          ┌─────────────┐
│   Mobile    │                          │   Desktop   │
│   Client    │                          │   Client    │
└──────┬──────┘                          └──────┬──────┘
       │                                        │
       │ 1. Connect WebSocket                   │ 2. Connect WebSocket
       │    ws://localhost:3000/ws              │    ws://localhost:3000/ws
       ▼                                        ▼
┌─────────────────────────────────────────────────────────────┐
│                   API Gateway WebSocket                      │
│  3. Both authenticate with JWT                               │
│  4. Desktop provides deviceId                                │
└───────────┬─────────────────────────────────────────────────┘
            │
            │ 5. Mobile sends command via REST
            │    POST /api/desktop/{desktopId}/command
            ▼
┌─────────────────────────────────────────────────────────────┐
│                   API Gateway REST                           │
│  6. Validate JWT + ownership                                 │
│  7. Check if desktop online (WebSocket connected)            │
│  8a. If online: Send via WebSocket                           │
│  8b. If offline: Queue in memory (max 100, 5-min TTL)        │
└───────────┬─────────────────────────────────────────────────┘
            │
            │ 9a. WebSocket delivery (if online)
            ▼
┌─────────────┐
│   Desktop   │
│  Receives   │
│  Command    │
└─────────────┘
            │
            │ 9b. Queued delivery (if offline, sent on reconnect)
            ▼
┌─────────────────────────────────────────────────────────────┐
│              Pending Commands Queue (In-Memory)              │
│  - Max 100 per device                                        │
│  - 5-minute TTL                                              │
│  - Flushed on reconnect                                      │
└─────────────────────────────────────────────────────────────┘
```

---

### Cross-Device Sync Flow

```
┌────────────┐                                         ┌────────────┐
│  Device A  │                                         │  Device B  │
└─────┬──────┘                                         └─────┬──────┘
      │                                                      │
      │ 1. Local changes made                                │
      │    - Create conversation                             │
      │    - Update message                                  │
      │                                                      │
      │ 2. POST /api/sync/batch                              │
      │    X-Device-Id: device-a-uuid                        │
      │    [sync items with timestamps]                      │
      ▼                                                      │
┌────────────────────────────────────────┐                  │
│         API Gateway                     │                  │
│  3. Validate items (max 100)           │                  │
│  4. Check for conflicts                │                  │
│     (compare timestamps)               │                  │
│  5a. If newer: Insert into sync_data   │──────────┐       │
│  5b. If older: Return conflict         │          │       │
└────────────────────────────────────────┘          │       │
      │                                             │       │
      │ 6. Response                                 │       │
      │    { synced_ids, conflicts }                ▼       │
      ▼                                    ┌─────────────────────────┐
┌────────────┐                             │  Supabase sync_data     │
│  Device A  │                             │  - user_id              │
│  Handles   │                             │  - device_id: device-a  │
│  Conflicts │                             │  - sync_type            │
└────────────┘                             │  - data (JSONB)         │
                                           │  - created_at           │
                                           └────────┬────────────────┘
                                                    │
      │ 7. Device B polls for updates               │
      │    GET /api/sync/updates?since=<timestamp>  │
      │    X-Device-Id: device-b-uuid               │
      ▼                                             │
┌────────────────────────────────────────┐          │
│         API Gateway                     │          │
│  8. Query sync_data                    │◄─────────┘
│     WHERE user_id = ? AND               │
│           device_id != device-b AND     │
│           created_at > ?                │
│  9. Return updates                      │
└────────────────────────────────────────┘
      │
      │ 10. Updates returned
      │     [{ entity_type, data, timestamp }]
      ▼
┌────────────┐
│  Device B  │
│  Applies   │
│  Changes   │
└────────────┘
```

---

### WebRTC Pairing Flow

```
┌──────────┐                 ┌─────────────────┐                 ┌──────────┐
│  Mobile  │                 │  Signaling      │                 │ Desktop  │
└────┬─────┘                 │  Server         │                 └────┬─────┘
     │                       └────────┬────────┘                      │
     │ 1. Request pairing code        │                               │
     │    POST /pairings              │                               │
     ├───────────────────────────────>│                               │
     │                                │                               │
     │                                │ 2. Generate code (DB insert)  │
     │                                │    - Atomic with retry        │
     │                                │    - 8-char base64url         │
     │                                │    - Unique constraint        │
     │                                │                               │
     │ 3. Return code + WS URL        │                               │
     │    { code: "A3B7C9D2", ... }   │                               │
     │<───────────────────────────────┤                               │
     │                                │                               │
     │ 4. Display code                │                               │
     │                                │ 5. User enters code           │
     │                                │<──────────────────────────────┤
     │                                │                               │
     │ 6. Connect WS                  │ 7. Connect WS                 │
     ├───────────────────────────────>│<──────────────────────────────┤
     │                                │                               │
     │ 8. Register                    │ 9. Register                   │
     │    {type: "register",          │    {type: "register",         │
     │     code: "A3B7C9D2",          │     code: "A3B7C9D2",         │
     │     role: "mobile"}            │     role: "desktop"}          │
     ├───────────────────────────────>│<──────────────────────────────┤
     │                                │                               │
     │                                │ 10. Validate code (DB lookup) │
     │                                │     - Check expiry            │
     │                                │     - Check role available    │
     │                                │     - Add to activeSessions   │
     │                                │                               │
     │ 11. Registered                 │ 12. Registered                │
     │<───────────────────────────────┤───────────────────────────────>│
     │                                │                               │
     │ 13. peer_ready                 │ 14. peer_ready                │
     │<───────────────────────────────┤───────────────────────────────>│
     │                                │                               │
     │ 15. Desktop creates offer      │                               │
     │                                │<──────────────────────────────┤
     │                                │                               │
     │ 16. Forward offer              │                               │
     │<───────────────────────────────┤                               │
     │                                │                               │
     │ 17. Mobile creates answer      │                               │
     ├───────────────────────────────>│                               │
     │                                │                               │
     │                                │ 18. Forward answer            │
     │                                ├───────────────────────────────>│
     │                                │                               │
     │ 19. Exchange ICE candidates (bidirectional)                    │
     │<═══════════════════════════════════════════════════════════════>│
     │                                │                               │
     │ 20. WebRTC P2P established     │                               │
     │<═══════════════════════════════════════════════════════════════>│
     │                                │                               │
     │ 21. Disconnect from signaling  │ 22. Disconnect from signaling │
     ├───────────────────────────────>│<──────────────────────────────┤
```

---

## Deployment

### Environment Variables

#### API Gateway (.env)

```bash
# Required
JWT_SECRET=your-random-secret-key-here
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Optional
PORT=3000
NODE_ENV=production
ALLOWED_ORIGINS=https://app.agiworkforce.com,https://www.agiworkforce.com
TRUST_PROXY=true
WS_MAX_MESSAGE_SIZE=65536
WS_AUTH_TIMEOUT_MS=30000
SIGNALING_HTTP_URL=http://localhost:4000
```

#### Signaling Server (.env)

```bash
# Required
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Optional
PORT=4000
SIGNALING_HOST=0.0.0.0
SIGNALING_PORT=4000
SIGNALING_WS_PATH=/ws
SIGNALING_HTTP_URL=http://localhost:4000
SIGNALING_WS_URL=ws://localhost:4000/ws
SIGNALING_PAIRING_TTL=300
ALLOWED_ORIGINS=https://app.agiworkforce.com
```

---

### Docker Deployment

**API Gateway Dockerfile:**

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm@9.15.3
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

**Docker Compose:**

```yaml
version: '3.8'

services:
  api-gateway:
    build:
      context: ./services/api-gateway
    ports:
      - '3000:3000'
    environment:
      - JWT_SECRET=${JWT_SECRET}
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - PORT=3000
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health']
      interval: 30s
      timeout: 10s
      retries: 3

  signaling-server:
    build:
      context: ./services/signaling-server
    ports:
      - '4000:4000'
    environment:
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - PORT=4000
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:4000/health']
      interval: 30s
      timeout: 10s
      retries: 3
```

---

### Production Deployment (Railway/Vercel/Fly.io)

**Build Commands:**

```bash
# API Gateway
cd services/api-gateway && pnpm install && pnpm build

# Signaling Server
cd services/signaling-server && pnpm install && pnpm build
```

**Start Commands:**

```bash
# API Gateway
cd services/api-gateway && node dist/index.js

# Signaling Server
cd services/signaling-server && node dist/index.js
```

**Health Check Endpoints:**

- API Gateway: `GET /health`
- Signaling Server: `GET /health`

**Scaling Considerations:**

- **API Gateway:** Stateful (WebSocket connections) - use sticky sessions for horizontal scaling
- **Signaling Server:** Ephemeral (short-lived connections) - can scale horizontally without sticky sessions
- **Database:** Supabase handles connection pooling and scaling

---

## Monitoring & Observability

### Health Checks

Both services expose `/health` endpoints:

```bash
# API Gateway
curl http://localhost:3000/health
# Response: { "status": "ok", "timestamp": 1609459200000 }

# Signaling Server
curl http://localhost:4000/health
# Response: { "status": "ok" }
```

---

### Logging

**Console Logging:**

```typescript
console.log('[INFO]', message);
console.error('[ERROR]', message, error);
console.warn('[WARN]', message);
```

**Key Events Logged:**

- User authentication (login, register)
- WebSocket connections (connect, auth, disconnect)
- Command delivery (sent, queued, failed)
- Database errors
- Rate limit violations
- Validation failures

**Production Recommendations:**

- Use structured logging (e.g., winston, pino)
- Add correlation IDs for request tracing
- Send logs to aggregation service (e.g., Datadog, Logtail)
- Set log levels via environment variable

---

### Metrics

**Key Metrics to Monitor:**

| Metric                | Type      | Description             |
| --------------------- | --------- | ----------------------- |
| HTTP request rate     | Counter   | Requests per second     |
| HTTP response time    | Histogram | p50, p95, p99 latency   |
| HTTP error rate       | Counter   | 4xx, 5xx errors         |
| WebSocket connections | Gauge     | Active connections      |
| WebSocket messages    | Counter   | Messages sent/received  |
| Database query time   | Histogram | Query latency           |
| Rate limit hits       | Counter   | 429 responses           |
| Credit deductions     | Counter   | API usage tracking      |
| Pairing sessions      | Gauge     | Active pairing sessions |

**Instrumentation Recommendations:**

- Prometheus client for metrics collection
- Grafana for visualization
- Alert on error rate > 5%
- Alert on p95 latency > 1s

---

## Performance Optimization

### Database Optimization

**Indexing Strategy:**

- All foreign keys indexed
- Query patterns analyzed and indexed
- Covering indexes for hot queries
- Partial indexes where appropriate

**Connection Pooling:**

- Supabase handles connection pooling
- Default pool size: 15 connections (configurable)
- Connection timeout: 30 seconds

**Query Optimization:**

- Use `.select()` to limit columns
- Use `.single()` for expected single rows
- Use `.limit()` for pagination
- Avoid N+1 queries

---

### WebSocket Optimization

**Memory Management:**

- Use WeakMap for client storage (automatic GC)
- Limit pending command queue (100 per device)
- Clean up on disconnect

**Message Throughput:**

- Binary frames for large data
- Message compression (if needed)
- Batch messages when possible

---

### Caching Strategy

**Current:** No caching layer (all requests hit database)

**Recommendations for Scale:**

- Redis for session caching
- Credit balance caching (1-minute TTL)
- Device status caching (30-second TTL)
- Rate limit storage in Redis (distributed rate limiting)

---

## Common Backend Operations

### Adding a New REST Endpoint

1. **Create route handler in `/src/routes/`:**

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimit';
import { asyncHandler } from '../middleware/asyncHandler';
import { supabase } from '../lib/supabase';

const router = Router();

const schema = z
  .object({
    field: z.string().min(1).max(100),
  })
  .strict();

router.post(
  '/endpoint',
  authenticateToken,
  createRateLimiter('endpoint-key'),
  asyncHandler(async (req, res) => {
    const data = schema.parse(req.body);
    const user = req.user!;

    // Implement logic

    res.json({ success: true });
  }),
);

export { router as newRouter };
```

2. **Register in `/src/index.ts`:**

```typescript
import { newRouter } from './routes/new';
app.use('/api/new', newRouter);
```

3. **Add rate limit config in `/src/middleware/rateLimit.ts`:**

```typescript
export const rateLimitConfigs = {
  // ... existing configs
  'endpoint-key': { windowMs: 60_000, max: 30 },
} as const;
```

4. **Update API documentation in `/docs/API_REFERENCE.md`**

---

### Adding a Database Table

1. **Create migration SQL in `/apps/web/supabase/migrations/`:**

```sql
-- YYYYMMDD000000_add_new_table.sql

CREATE TABLE new_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for common query
CREATE INDEX idx_new_table_user_id ON new_table(user_id);

-- Enable RLS
ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;

-- User policy
CREATE POLICY new_table_user_policy ON new_table
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role policy
CREATE POLICY new_table_service_policy ON new_table
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON new_table TO authenticated;
GRANT ALL ON new_table TO service_role;
```

2. **Apply migration:**

```bash
# Via Supabase CLI
supabase db push

# Or in Supabase dashboard: Database → Migrations → New migration
```

3. **Update TypeScript types (if needed)**

---

### Adding a WebSocket Message Type

1. **Define schema in WebSocket handler:**

```typescript
const newMessageSchema = z.object({
  type: z.literal('new_type'),
  payload: z
    .object({
      // ... fields
    })
    .strict(),
});
```

2. **Add to discriminated union:**

```typescript
const messageSchema = z.discriminatedUnion('type', [
  authMessageSchema,
  newMessageSchema, // Add here
  // ... other types
]);
```

3. **Handle in message router:**

```typescript
function handleMessage(ws: AuthenticatedWebSocket, data: Message) {
  switch (data.type) {
    case 'new_type':
      handleNewType(ws, data);
      break;
    // ... other cases
  }
}
```

4. **Update WEBSOCKET_PROTOCOL.md documentation**

---

## Support & Resources

**Documentation:**

- [API Reference](./API_REFERENCE.md)
- [WebSocket Protocol](./WEBSOCKET_PROTOCOL.md)
- [CLAUDE.md](../CLAUDE.md) - Project overview

**Repository:**

- GitHub: https://github.com/agiworkforce/agiworkforce

**Contact:**

- Email: support@agiworkforce.com
- Issues: https://github.com/agiworkforce/agiworkforce/issues
