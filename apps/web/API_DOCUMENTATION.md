# AGI Workforce API Documentation

Complete REST API reference for AGI Workforce web platform.

## Base URL

```
Production: https://agiworkforce.com/api
Development: http://localhost:3000/api
```

## Authentication

Most API endpoints require authentication via Supabase JWT tokens. Include the token in the Authorization header:

```
Authorization: Bearer <supabase-jwt-token>
```

## Endpoints

### LLM API (OpenAI-Compatible)

#### POST /api/llm/v1/chat/completions

OpenAI-compatible chat completions endpoint for LLM inference.

**Authentication:** Required

**Request Body:**

```json
{
  "model": "gpt-4",
  "messages": [
    {
      "role": "user",
      "content": "Hello, world!"
    }
  ],
  "stream": false,
  "temperature": 0.7,
  "max_tokens": 1000
}
```

**Response:**

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "gpt-4",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 20,
    "total_tokens": 30
  }
}
```

**Supported Models:**

- OpenAI: `gpt-4`, `gpt-3.5-turbo`, `gpt-5`
- Anthropic: `claude-3-opus`, `claude-3.5-sonnet`, `claude-4.5-sonnet`
- Google: `gemini-pro`, `gemini-3-pro`
- X.AI: `grok-beta`, `grok-4.1`
- DeepSeek: `deepseek-chat`, `deepseek-v3`
- Qwen: `qwen-turbo`, `qwen-3-72b`

---

#### GET /api/llm/v1/models

List all available LLM models for the authenticated user.

**Authentication:** Required

**Response:**

```json
{
  "object": "list",
  "data": [
    {
      "id": "gpt-4",
      "object": "model",
      "created": 1234567890,
      "owned_by": "openai"
    }
  ]
}
```

---

#### GET /api/llm/v1/credits/balance

Get credit balance for authenticated user.

**Authentication:** Required

**Response:**

```json
{
  "credits_remaining_cents": 10000,
  "credits_allocated_cents": 50000,
  "usage_percentage": 80.0,
  "reset_at": "2025-02-01T00:00:00Z"
}
```

---

### Billing & Subscriptions

#### POST /api/checkout

Create Stripe checkout session for subscription purchase.

**Authentication:** Required

**Request Body:**

```json
{
  "plan": "pro",
  "billingInterval": "annual"
}
```

**Response:**

```json
{
  "url": "https://checkout.stripe.com/c/pay/cs_test_..."
}
```

**Supported Plans:**

- `hobby`: $4.99/mo (annual) or $10/mo (monthly)
- `pro`: $24.99/mo (annual) or $29.99/mo (monthly)
- `max`: $249.99/mo (annual) or $299.99/mo (monthly)

---

#### POST /api/portal

Access Stripe billing portal for subscription management.

**Authentication:** Required

**Response:**

```json
{
  "url": "https://billing.stripe.com/p/session/..."
}
```

---

#### POST /api/stripe-webhook

Stripe webhook endpoint for payment events (internal use).

**Authentication:** Stripe signature verification

**Handles Events:**

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

---

### Device Management

#### POST /api/device/link

Link desktop device to user account.

**Authentication:** Required

**Request Body:**

```json
{
  "pairing_code": "123456",
  "device_name": "MacBook Pro",
  "device_id": "unique-device-identifier"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Device linked successfully",
  "device": {
    "id": "dev_abc123",
    "name": "MacBook Pro",
    "linked_at": "2025-01-15T10:30:00Z"
  }
}
```

---

#### POST /api/device/poll

Poll for device approval status (used by desktop app).

**Authentication:** Required

**Request Body:**

```json
{
  "pairing_code": "123456"
}
```

**Response:**

```json
{
  "status": "approved",
  "user_id": "user_abc123",
  "access_token": "jwt_token..."
}
```

---

#### POST /api/device/approve

Approve device linking request.

**Authentication:** Required

**Request Body:**

```json
{
  "pairing_code": "123456"
}
```

---

### User Management

#### GET /api/me

Get current authenticated user profile.

**Authentication:** Required

**Response:**

```json
{
  "id": "user_abc123",
  "email": "user@example.com",
  "subscription": {
    "plan_tier": "pro",
    "status": "active",
    "current_period_end": "2025-02-15T00:00:00Z"
  },
  "credits": {
    "remaining_cents": 10000,
    "allocated_cents": 50000
  }
}
```

---

### Utility Endpoints

#### GET /api/health

Health check endpoint.

**Authentication:** None

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

---

#### GET /api/download

Download latest desktop app release.

**Authentication:** None

**Query Parameters:**

- `platform`: `mac`, `windows`, `linux`

**Response:** Binary file download (DMG, EXE, or AppImage)

---

#### GET /api/download-beta

Download beta release with authentication.

**Authentication:** Required

**Query Parameters:**

- `platform`: `mac`, `windows`, `linux`

---

### Admin Endpoints

#### POST /api/sync-subscription

Force sync subscription with Stripe (admin only).

**Authentication:** Required (admin)

**Request Body:**

```json
{
  "user_id": "user_abc123"
}
```

---

#### POST /api/cron/reset-credits

Cron job to reset monthly credits (scheduled task).

**Authentication:** Cron secret

---

## Rate Limiting

Rate limits are enforced per endpoint:

- **LLM API:** 60 requests/minute (free tier), 600 requests/minute (pro/max)
- **Checkout/Portal:** 10 requests/minute
- **Device Management:** 20 requests/minute
- **General APIs:** 100 requests/minute

Rate limit headers:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 59
X-RateLimit-Reset: 1234567890
```

## Error Codes

Standard HTTP status codes:

- `200 OK`: Success
- `201 Created`: Resource created
- `400 Bad Request`: Invalid request
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

Error response format:

```json
{
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE",
    "details": {}
  }
}
```

## Webhooks

### Stripe Webhooks

Configure in Stripe Dashboard: `https://agiworkforce.com/api/stripe-webhook`

**Events Handled:**

- Payment success/failure
- Subscription creation/updates/cancellation
- Invoice events

## SDK Integration

### OpenAI Python SDK

```python
from openai import OpenAI

client = OpenAI(
    api_key="your-supabase-jwt-token",
    base_url="https://agiworkforce.com/api/llm/v1"
)

response = client.chat.completions.create(
    model="gpt-4",
    messages=[
        {"role": "user", "content": "Hello!"}
    ]
)
```

### JavaScript/TypeScript

```typescript
const response = await fetch('https://agiworkforce.com/api/llm/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${supabaseToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Hello!' }],
  }),
});

const data = await response.json();
```

## Security

- All API requests use HTTPS/TLS 1.3
- JWT tokens expire after 1 hour
- Refresh tokens valid for 7 days
- API keys stored encrypted in database
- Rate limiting enforces fair usage
- Webhook signatures verified (Stripe)

## Support

For API support:

- Email: support@agiworkforce.com
- Documentation: https://agiworkforce.com/docs
- Status Page: https://status.agiworkforce.com (planned)
