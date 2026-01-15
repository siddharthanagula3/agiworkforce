# AGI Workforce API Routes Documentation

Complete reference for all API routes in the AGI Workforce platform, including request/response formats, authentication requirements, and implementation details.

## Table of Contents

- [Web API Routes](#web-api-routes)
  - [User Management](#user-management)
  - [Subscription & Billing](#subscription--billing)
  - [Device Management](#device-management)
  - [LLM API](#llm-api)
  - [Credits](#credits)
  - [Health & Monitoring](#health--monitoring)
- [API Gateway Routes](#api-gateway-routes)
  - [Authentication](#authentication)
  - [Desktop Devices](#desktop-devices)
  - [Sync Operations](#sync-operations)
- [Implementation Notes](#implementation-notes)

---

## Web API Routes

Base URL: `https://agiworkforce.com/api`

### User Management

#### `GET /me`

Get the authenticated user's profile, subscription, and credit balance.

**Authentication**: Required (Bearer token or cookie)

**Rate Limit**: 60 requests/minute

**Request:**

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://agiworkforce.com/api/me
```

**Response (200 OK):**

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "email": "user@example.com",
  "name": "John Doe",
  "avatar_url": null,
  "created_at": 1704067200,
  "updated_at": 1704153600,
  "plan": {
    "tier": "pro",
    "display_name": "Pro",
    "status": "active",
    "current_period_end": 1706745600
  },
  "feature_flags": {
    "beta_features": true,
    "advanced_model_access": true
  },
  "credits": {
    "credits_remaining_cents": 150000,
    "credits_allocated_cents": 200000,
    "credits_used_cents": 50000,
    "daily_limit_cents": 10000,
    "daily_used_cents": 2500,
    "daily_remaining_cents": 7500,
    "period_start": "2026-01-01T00:00:00Z",
    "period_end": "2026-02-01T00:00:00Z"
  }
}
```

**Implementation Details:**

- Located in: `apps/web/app/api/me/route.ts`
- Uses `SubscriptionService.getSubscription()` for subscription data
- Uses `CreditService.getBalance()` for credit information
- Supports both Bearer token and cookie authentication

**Error Responses:**

- `401 Unauthorized`: Missing or invalid authentication

---

### Subscription & Billing

#### `POST /checkout`

Create a Stripe Checkout session for subscription purchase or upgrade.

**Authentication**: Required

**Rate Limit**: 5 requests/minute (security-sensitive, fail-closed)

**Request:**

```bash
curl -X POST https://agiworkforce.com/api/checkout \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "plan": "pro",
    "billingInterval": "monthly"
  }'
```

**Request Body:**

```typescript
{
  plan: "hobby" | "pro" | "max",
  billingInterval: "monthly" | "annual"
}
```

**Response (200 OK):**

```json
{
  "url": "https://checkout.stripe.com/c/pay/cs_test_..."
}
```

**Implementation Details:**

- Located in: `apps/web/app/api/checkout/route.ts`
- Uses strict price ID mapping via `lib/pricing.ts`
- If user has active subscription, redirects to Billing Portal instead
- Stores `stripe_customer_id` in profiles table for future lookups
- Passes `supabase_user_id` in Checkout session metadata

**Stripe Price ID Environment Variables:**

- `STRIPE_PRICE_HOBBY_MONTHLY`
- `STRIPE_PRICE_HOBBY_YEARLY`
- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_PRICE_PRO_YEARLY`
- `STRIPE_PRICE_MAX_MONTHLY`
- `STRIPE_PRICE_MAX_YEARLY`

**Error Responses:**

- `400 Bad Request`: Invalid plan or billingInterval
- `401 Unauthorized`: Not authenticated
- `429 Too Many Requests`: Rate limit exceeded

---

#### `POST /credit-topup`

Create a Stripe Checkout session for credit top-up purchase.

**Authentication**: Required

**Rate Limit**: 5 requests/minute (security-sensitive, fail-closed)

**Request:**

```bash
curl -X POST https://agiworkforce.com/api/credit-topup \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 2000
  }'
```

**Request Body:**

```typescript
{
  amount: number; // Credit amount in cents (e.g., 2000 = $20)
}
```

**Response (200 OK):**

```json
{
  "url": "https://checkout.stripe.com/c/pay/cs_test_..."
}
```

**Implementation Details:**

- Located in: `apps/web/app/api/credit-topup/route.ts`
- Mode: `payment` (one-time payment, not subscription)
- Metadata includes `type: "credit_topup"` and `credit_amount_cents`
- Credits are added via `add_credits` RPC function in webhook handler

---

#### `POST /portal`

Create a Stripe Billing Portal session for subscription management.

**Authentication**: Required

**Rate Limit**: 10 requests/minute

**Request:**

```bash
curl -X POST https://agiworkforce.com/api/portal \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response (200 OK):**

```json
{
  "url": "https://billing.stripe.com/session/..."
}
```

**Implementation Details:**

- Located in: `apps/web/app/api/portal/route.ts`
- Return URL: `{NEXT_PUBLIC_APP_URL}/pricing`
- Requires existing `stripe_customer_id`
- Users can cancel, upgrade, update payment methods

**Error Responses:**

- `404 Not Found`: No subscription found

---

#### `POST /sync-subscription`

Manually sync subscription status from Stripe.

**Authentication**: Required

**Rate Limit**: 10 requests/minute

**Request:**

```bash
curl -X POST https://agiworkforce.com/api/sync-subscription \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response (200 OK):**

```json
{
  "subscription": {
    "status": "active",
    "plan_tier": "pro",
    "current_period_end": "2026-02-01T00:00:00Z"
  }
}
```

**Implementation Details:**

- Located in: `apps/web/app/api/sync-subscription/route.ts`
- Fetches latest subscription from Stripe API
- Updates local database with current status
- Useful after payment success or status discrepancies

---

#### `POST /stripe-webhook`

Stripe webhook handler for subscription lifecycle events.

**Authentication**: None (validates Stripe signature)

**Rate Limit**: None (Stripe-initiated)

**Headers:**

- `stripe-signature`: Required for signature verification

**Events Handled:**

- `checkout.session.completed`: Create subscription, allocate credits
- `checkout.session.async_payment_succeeded`: Handle async payment
- `customer.subscription.created`: Create subscription record
- `customer.subscription.updated`: Update subscription status, reset credits on new period
- `customer.subscription.deleted`: Cancel subscription, revoke remaining credits
- `invoice.payment_succeeded`: Mark subscription active, update period
- `invoice.payment_failed`: Mark subscription past_due
- `charge.refunded`: Revoke proportional credits
- `charge.dispute.created`: Revoke all credits, flag subscription

**Implementation Details:**

- Located in: `apps/web/app/api/stripe-webhook/route.ts`
- Uses `process_stripe_event_idempotent` database function for idempotency
- Stores `stripe_customer_id` in profiles table (CRITICAL for proper mapping)
- Email fallback for legacy data only (security warning logged)
- Allocates/resets credits via `SubscriptionService`
- Handles both top-level and items-level period dates (Stripe v20+ compatibility)

**Idempotency:**

- Events tracked in `processed_stripe_events` table
- Uses `INSERT ... ON CONFLICT` for atomic idempotency check
- Retries marked as failed can be reprocessed

---

### Device Management

#### `POST /device/link`

Generate a secure device linking code for authorization.

**Authentication**: None (public endpoint)

**Rate Limit**: 10 requests/minute (security-sensitive, fail-closed)

**Request:**

```bash
curl -X POST https://agiworkforce.com/api/device/link \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "550e8400-e29b-41d4-a716-446655440000",
    "device_name": "MacBook Pro",
    "device_type": "desktop",
    "device_fingerprint": "macos-arm64-..."
  }'
```

**Request Body:**

```typescript
{
  device_id: string,          // UUID generated by client
  device_name?: string,       // Human-readable name
  device_type?: "desktop" | "mobile" | "web",
  device_fingerprint?: string // Hardware/software fingerprint
}
```

**Response (200 OK):**

```json
{
  "link_code": "A1B2C3D4E5F67890",
  "device_id": "550e8400-e29b-41d4-a716-446655440000",
  "verify_url": "https://agiworkforce.com/verify?code=A1B2C3D4E5F67890",
  "expires_at": 1705325400,
  "qr_code_url": null
}
```

**Implementation Details:**

- Located in: `apps/web/app/api/device/link/route.ts`
- Uses `randomBytes(8)` for 64-bit entropy (2^64 possibilities)
- Code format: 16-character hexadecimal (e.g., `A1B2C3D4E5F67890`)
- Expiry: 15 minutes from creation
- Upserts by `device_id` (supports re-linking without error)
- Stores in `device_authorization_codes` table

**Security:**

- 64-bit entropy prevents brute-force attacks within 15-minute window
- Rate limiting prevents code generation abuse
- Codes are single-use (marked as consumed when used)

---

#### `POST /device/poll`

Poll device authorization status (used by desktop/mobile apps).

**Authentication**: None (device polls before authorization)

**Rate Limit**: 10 requests/second

**Request:**

```bash
curl -X POST https://agiworkforce.com/api/device/poll \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

**Request Body:**

```typescript
{
  device_id: string; // UUID from link request
}
```

**Response (200 OK - Pending):**

```json
{
  "status": "pending",
  "access_token": null,
  "refresh_token": null,
  "user": null
}
```

**Response (200 OK - Authorized):**

```json
{
  "status": "authorized",
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "v1.MU...",
  "user": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

**Possible Status Values:**

- `pending`: Waiting for user authorization
- `authorized`: User approved, tokens available
- `denied`: User denied authorization
- `expired`: Code expired (15 minutes)

**Implementation Details:**

- Located in: `apps/web/app/api/device/poll/route.ts`
- Poll interval: 2-3 seconds recommended
- Status updated by `/device/approve` endpoint (browser)
- Marks code as `consumed_at` when tokens are retrieved

---

#### `POST /device/approve`

Approve a device linking request (called by web browser).

**Authentication**: Required (user authorizing the device)

**Rate Limit**: 10 requests/minute

**Request:**

```bash
curl -X POST https://agiworkforce.com/api/device/approve \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "A1B2C3D4E5F67890",
    "approved": true
  }'
```

**Request Body:**

```typescript
{
  code: string,      // 16-character link code
  approved: boolean  // true = approve, false = deny
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "device": {
    "name": "MacBook Pro",
    "type": "desktop"
  }
}
```

**Implementation Details:**

- Located in: `apps/web/app/api/device/approve/route.ts`
- Generates Supabase session tokens for the device
- Updates `device_authorization_codes` table with tokens and user info
- Sets `status` to `authorized` or `denied`

---

### LLM API

#### `POST /llm/v1/chat/completions`

OpenAI-compatible chat completions endpoint with multi-provider routing.

**Authentication**: Required

**Rate Limit**: 100 requests/minute

**Request:**

```bash
curl -X POST https://agiworkforce.com/api/llm/v1/chat/completions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "What is the capital of France?"}
    ],
    "temperature": 0.7,
    "max_tokens": 150,
    "stream": false,
    "use_prompt_cache": false,
    "thinking_mode": false
  }'
```

**Request Body:**

```typescript
{
  model: string,
  messages: Array<{
    role: "system" | "user" | "assistant" | "tool",
    content: string | Array<ContentPart>
  }>,
  temperature?: number,         // 0-2, default: 1
  max_tokens?: number,          // Max completion tokens
  max_completion_tokens?: number, // Alias for max_tokens
  stream?: boolean,             // Enable streaming, default: false
  stop?: string | string[],     // Stop sequences
  top_p?: number,               // 0-1
  presence_penalty?: number,    // -2 to 2
  frequency_penalty?: number,   // -2 to 2
  tools?: Array<Tool>,          // Function calling tools
  tool_choice?: ToolChoice,     // Tool selection strategy
  response_format?: {           // Output format
    type: "text" | "json_object" | "json_schema",
    json_schema?: object
  },
  seed?: number,                // Deterministic sampling
  // AGI Workforce extensions
  thinking_mode?: boolean,      // Extended thinking for reasoning models
  use_prompt_cache?: boolean    // Enable prompt caching
}
```

**Response (200 OK - Non-Streaming):**

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1705325400,
  "model": "gpt-4",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "The capital of France is Paris."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 25,
    "completion_tokens": 8,
    "total_tokens": 33,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 0
  },
  "x_agi_workforce": {
    "provider": "openai",
    "cost_cents": 50,
    "fallback": null,
    "cache": {
      "tokens_saved": 0,
      "cost_saved_cents": 0
    }
  }
}
```

**Response (200 OK - Streaming):**

Server-Sent Events (SSE) format:

```
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1705325400,"model":"gpt-4","choices":[{"index":0,"delta":{"role":"assistant","content":"The"},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1705325400,"model":"gpt-4","choices":[{"index":0,"delta":{"content":" capital"},"finish_reason":null}]}

data: [DONE]
```

**Implementation Details:**

- Located in: `apps/web/app/api/llm/v1/chat/completions/route.ts`
- Credit reservation before request (prevents overspending)
- Reconciliation after completion (refund/charge difference)
- Automatic fallback to cheaper models on insufficient credits
- Idempotency keys prevent duplicate charges on retry
- Supports providers: OpenAI, Anthropic, Google, DeepSeek, Qwen, Moonshot, Perplexity, xAI
- Model tier enforcement (Pro tier required for advanced models)

**Model Tier Requirements:**

- Free: Not supported
- Hobby: Basic models (gpt-3.5-turbo, claude-haiku, gemini-flash)
- Pro+: Advanced models (gpt-4, claude-sonnet-4, gpt-4.5)
- Max+: Premium models (claude-opus-4-5, o3, gpt-5, gemini-2.5-pro)

**Cost Calculation:**

- Input tokens: Provider-specific rate per million tokens
- Output tokens: Provider-specific rate per million tokens
- Cache creation: 25% of input cost (Anthropic/Google)
- Cache reads: 10% of input cost (90% savings)

**Error Responses:**

- `400 Bad Request`: Invalid request parameters
- `401 Unauthorized`: Missing/invalid token
- `402 Payment Required`: Insufficient monthly credits
- `403 Forbidden`: Model not available for subscription tier
- `429 Too Many Requests`: Daily credit limit exceeded or rate limit
- `500 Server Error`: Provider error or internal failure

---

#### `GET /llm/v1/models`

List available LLM models based on user's subscription tier.

**Authentication**: Required

**Rate Limit**: 100 requests/minute

**Request:**

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://agiworkforce.com/api/llm/v1/models
```

**Response (200 OK):**

```json
{
  "data": [
    {
      "id": "gpt-4",
      "object": "model",
      "created": 1687882410,
      "owned_by": "openai",
      "tier_required": "pro"
    },
    {
      "id": "claude-sonnet-4",
      "object": "model",
      "created": 1698796800,
      "owned_by": "anthropic",
      "tier_required": "pro"
    },
    {
      "id": "gpt-3.5-turbo",
      "object": "model",
      "created": 1677649963,
      "owned_by": "openai",
      "tier_required": "hobby"
    }
  ]
}
```

**Implementation Details:**

- Located in: `apps/web/app/api/llm/v1/models/route.ts`
- Filters models based on user's subscription tier
- Returns OpenAI-compatible model list format

---

### Credits

#### `GET /llm/v1/credits/balance`

Get current credit balance and usage statistics.

**Authentication**: Required

**Rate Limit**: 60 requests/minute

**Request:**

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://agiworkforce.com/api/llm/v1/credits/balance
```

**Response (200 OK):**

```json
{
  "credits_remaining_cents": 150000,
  "credits_allocated_cents": 200000,
  "credits_used_cents": 50000,
  "daily_limit_cents": 10000,
  "daily_used_cents": 2500,
  "daily_remaining_cents": 7500,
  "period_start": "2026-01-01T00:00:00Z",
  "period_end": "2026-02-01T00:00:00Z"
}
```

**Implementation Details:**

- Located in: `apps/web/app/api/llm/v1/credits/balance/route.ts`
- Uses `CreditService.getBalance()` with service role access
- Returns both monthly and daily credit information

---

### Health & Monitoring

#### `GET /health`

Health check endpoint for monitoring and uptime checks.

**Authentication**: None

**Rate Limit**: 30 requests/minute

**Request:**

```bash
curl https://agiworkforce.com/api/health
```

**Response (200 OK):**

```json
{
  "status": "ok",
  "timestamp": 1705325400000
}
```

**Implementation Details:**

- Located in: `apps/web/app/api/health/route.ts`
- Simple status check with timestamp
- Useful for load balancer health checks

---

#### `GET /download`

Download AGI Workforce desktop application.

**Authentication**: Required (subscription required)

**Rate Limit**: 30 requests/minute

**Request:**

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://agiworkforce.com/api/download?platform=macos
```

**Query Parameters:**

- `platform`: `macos` | `windows` | `linux`

**Response:**

- Redirects to download URL (DMG, EXE, or AppImage)

**Implementation Details:**

- Located in: `apps/web/app/api/download/route.ts`
- Verifies active subscription (hobby+ required)
- Redirects to latest release from GitHub/CDN

---

#### `GET /download-beta`

Download beta version of AGI Workforce.

**Authentication**: Required (beta access required)

**Rate Limit**: 10 requests/minute

**Request:**

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://agiworkforce.com/api/download-beta?platform=macos
```

**Implementation Details:**

- Located in: `apps/web/app/api/download-beta/route.ts`
- Requires beta invite redemption
- Redirects to beta release

---

## API Gateway Routes

Base URL: `https://api.agiworkforce.com`

### Authentication

#### `POST /api/auth/register`

Register a new user account (legacy endpoint - use Supabase Auth for new integrations).

**Rate Limit**: 5 requests/15 minutes

**Request:**

```bash
curl -X POST https://api.agiworkforce.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!"
  }'
```

**Response (200 OK):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "user@example.com"
  }
}
```

---

#### `POST /api/auth/login`

Login with email and password (legacy endpoint - use Supabase Auth for new integrations).

**Rate Limit**: 5 requests/15 minutes

**Request:**

```bash
curl -X POST https://api.agiworkforce.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!"
  }'
```

**Response (200 OK):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "user@example.com",
    "desktopId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Implementation Details:**

- Uses bcrypt for password hashing
- Implements timing attack prevention (always runs bcrypt.compare)
- JWT token valid for 7 days

---

### Desktop Devices

#### `POST /api/desktop/register`

Register a new desktop device.

**Authentication**: Required

**Rate Limit**: 10 requests/minute

**Request:**

```bash
curl -X POST https://api.agiworkforce.com/api/desktop/register \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "MacBook Pro",
    "platform": "macos",
    "version": "1.0.0"
  }'
```

**Request Body:**

```typescript
{
  name: string,                        // Device name
  platform: "macos" | "windows" | "linux",
  version: string                      // Semver format (e.g., "1.0.0")
}
```

**Response (200 OK):**

```json
{
  "desktopId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Desktop registered successfully"
}
```

---

#### `GET /api/desktop/:desktopId/status`

Get desktop device status.

**Authentication**: Required

**Rate Limit**: 60 requests/minute

**Request:**

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.agiworkforce.com/api/desktop/550e8400-e29b-41d4-a716-446655440000/status
```

**Response (200 OK):**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "MacBook Pro",
  "platform": "macos",
  "version": "1.0.0",
  "online": true,
  "lastSeen": 1705325400000
}
```

**Implementation Details:**

- Online status: device seen within last 60 seconds
- Returns 404 for both "not found" and "not owned" (prevents enumeration)

---

#### `POST /api/desktop/:desktopId/command`

Send command to desktop device via WebSocket.

**Authentication**: Required

**Rate Limit**: 30 requests/minute

**Request:**

```bash
curl -X POST https://api.agiworkforce.com/api/desktop/550e8400-e29b-41d4-a716-446655440000/command \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "chat",
    "payload": {
      "message": "Hello, world!",
      "conversationId": "conv-123",
      "model": "gpt-4"
    }
  }'
```

**Command Types:**

**Chat Command:**

```typescript
{
  type: "chat",
  payload: {
    message: string,
    conversationId?: string,
    model?: string,
    temperature?: number
  }
}
```

**Automation Command:**

```typescript
{
  type: "automation",
  payload: {
    action: "run" | "stop" | "pause" | "resume",
    workflowId: string,
    parameters?: Record<string, string | number | boolean>,
    timeout?: number
  }
}
```

**Query Command:**

```typescript
{
  type: "query",
  payload: {
    query: string,
    collection?: string,
    limit?: number,
    offset?: number
  }
}
```

**Response (200 OK):**

```json
{
  "commandId": "cmd-123",
  "status": "delivered",
  "message": "Command delivered to desktop",
  "type": "chat",
  "payload": {
    "message": "Hello, world!"
  }
}
```

**Possible Status:**

- `delivered`: Command sent via WebSocket
- `queued`: Device offline, command queued for delivery
- `failed`: Delivery failed

---

#### `POST /api/desktop/:desktopId/heartbeat`

Update device heartbeat (last seen timestamp).

**Authentication**: Required

**Rate Limit**: 600 requests/minute (10 requests/second)

**Request:**

```bash
curl -X POST https://api.agiworkforce.com/api/desktop/550e8400-e29b-41d4-a716-446655440000/heartbeat \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response (200 OK):**

```json
{
  "success": true
}
```

---

#### `DELETE /api/desktop/:desktopId`

Unregister (delete) a desktop device.

**Authentication**: Required

**Rate Limit**: 10 requests/minute

**Request:**

```bash
curl -X DELETE https://api.agiworkforce.com/api/desktop/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Desktop device unregistered"
}
```

---

## Implementation Notes

### Database Schema

**Relevant Tables:**

```sql
-- User profiles (FK for subscriptions)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT,
  stripe_customer_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscriptions
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) UNIQUE,
  status TEXT NOT NULL,
  plan_tier TEXT NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  stripe_coupon_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  canceled_at TIMESTAMPTZ
);

-- Device authorization codes
CREATE TABLE device_authorization_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID UNIQUE NOT NULL,
  user_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  user_id UUID REFERENCES profiles(id),
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  authorized_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Desktop devices (API Gateway)
CREATE TABLE desktop_devices (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  version TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Token credits
CREATE TABLE token_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  subscription_id UUID REFERENCES subscriptions(id),
  balance_cents INTEGER NOT NULL,
  allocated_cents INTEGER NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stripe event processing (idempotency)
CREATE TABLE processed_stripe_events (
  event_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'processing'
);
```

### Security Best Practices

1. **Customer ID Mapping**: Always store `stripe_customer_id` in profiles table
2. **Idempotency**: Use database functions for atomic idempotency checks
3. **Rate Limiting**: Fail-closed for security-sensitive endpoints
4. **Device Linking**: 64-bit entropy prevents brute-force attacks
5. **Webhook Validation**: Always validate Stripe signatures
6. **Enumeration Prevention**: Return 404 for both "not found" and "not owned"

### Cost Optimization

1. **Prompt Caching**: Use `use_prompt_cache: true` for 90% cost savings
2. **Model Fallback**: Automatic fallback to cheaper models on low credits
3. **Credit Reservation**: Reserve credits before request to prevent overspending
4. **Daily Limits**: Prevent accidental overspending with daily caps

### Testing

- **Postman Collection**: Use provided collection for API testing
- **Webhook Testing**: Use `stripe listen --forward-to localhost:3000/api/stripe-webhook`
- **Device Linking**: Test with desktop app or simulate with curl

---

## Support

For API support:

- **Documentation**: [https://docs.agiworkforce.com](https://docs.agiworkforce.com)
- **Discord**: [https://discord.gg/agiworkforce](https://discord.gg/agiworkforce)
- **Email**: support@agiworkforce.com
