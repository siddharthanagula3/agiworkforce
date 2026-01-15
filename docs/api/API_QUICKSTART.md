# AGI Workforce API Quickstart

Welcome to the AGI Workforce API! This guide will help you get started with authentication, making your first request, and understanding common patterns.

## Table of Contents

- [Getting Started](#getting-started)
- [Authentication](#authentication)
- [Making Your First Request](#making-your-first-request)
- [Common Patterns](#common-patterns)
- [Rate Limiting](#rate-limiting)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)

---

## Getting Started

### Base URLs

Choose the appropriate base URL for your use case:

```
Web API:        https://agiworkforce.com/api
API Gateway:    https://api.agiworkforce.com
LLM API:        https://agiworkforce.com/api/llm/v1
```

### Prerequisites

Before using the API, you'll need:

1. **AGI Workforce Account**: Sign up at [https://agiworkforce.com/signup](https://agiworkforce.com/signup)
2. **Active Subscription**: Free tier has limited access; Pro/Max recommended for full features
3. **Authentication Token**: Obtain via Supabase authentication

---

## Authentication

AGI Workforce uses **Bearer Token authentication** with Supabase JWT tokens.

### Step 1: Get Your Authentication Token

#### Option A: Via Supabase SDK (Recommended)

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient('YOUR_SUPABASE_URL', 'YOUR_SUPABASE_ANON_KEY');

// Sign in
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'your@email.com',
  password: 'your-password',
});

const token = data.session?.access_token;
// Use this token for API requests
```

#### Option B: Via Direct API Call

```bash
curl -X POST https://YOUR_SUPABASE_URL/auth/v1/token?grant_type=password \
  -H "Content-Type: application/json" \
  -H "apikey: YOUR_SUPABASE_ANON_KEY" \
  -d '{
    "email": "your@email.com",
    "password": "your-password"
  }'
```

### Step 2: Use the Token

Include the token in the `Authorization` header:

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  https://agiworkforce.com/api/me
```

---

## Making Your First Request

### Get User Profile

The simplest way to verify your authentication:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://agiworkforce.com/api/me
```

**Response:**

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "email": "user@example.com",
  "name": "John Doe",
  "plan": {
    "tier": "pro",
    "status": "active",
    "current_period_end": 1706745600
  },
  "credits": {
    "credits_remaining_cents": 150000,
    "daily_remaining_cents": 7500
  }
}
```

### Create a Chat Completion

Use the OpenAI-compatible endpoint:

```bash
curl -X POST https://agiworkforce.com/api/llm/v1/chat/completions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {
        "role": "user",
        "content": "What is the capital of France?"
      }
    ],
    "temperature": 0.7,
    "max_tokens": 150
  }'
```

**Response:**

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
    "total_tokens": 33
  },
  "x_agi_workforce": {
    "provider": "openai",
    "cost_cents": 50
  }
}
```

---

## Common Patterns

### 1. Check Credit Balance Before Request

```bash
# Check balance
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://agiworkforce.com/api/llm/v1/credits/balance

# Response
{
  "credits_remaining_cents": 150000,
  "daily_remaining_cents": 7500,
  "daily_limit_cents": 10000
}
```

### 2. Device Linking Flow

**Step 1: Generate Link Code (Desktop App)**

```bash
curl -X POST https://agiworkforce.com/api/device/link \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "550e8400-e29b-41d4-a716-446655440000",
    "device_name": "MacBook Pro",
    "device_type": "desktop"
  }'

# Response
{
  "link_code": "A1B2C3D4E5F67890",
  "verify_url": "https://agiworkforce.com/verify?code=A1B2C3D4E5F67890",
  "expires_at": 1705325400
}
```

**Step 2: User Visits Verify URL (Browser)**

The user opens `verify_url` in their browser and authorizes the device.

**Step 3: Poll for Authorization (Desktop App)**

```bash
# Poll every 2-3 seconds
curl -X POST https://agiworkforce.com/api/device/poll \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "550e8400-e29b-41d4-a716-446655440000"
  }'

# While pending
{
  "status": "pending"
}

# When authorized
{
  "status": "authorized",
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "v1.MU...",
  "user": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "user@example.com"
  }
}
```

### 3. Subscription Management

**Create Checkout Session**

```bash
curl -X POST https://agiworkforce.com/api/checkout \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "plan": "pro",
    "billingInterval": "monthly"
  }'

# Response
{
  "url": "https://checkout.stripe.com/c/pay/cs_test_..."
}
```

**Access Billing Portal**

```bash
curl -X POST https://agiworkforce.com/api/portal \
  -H "Authorization: Bearer YOUR_TOKEN"

# Response
{
  "url": "https://billing.stripe.com/session/..."
}
```

### 4. Streaming Responses

Enable streaming for real-time output:

```bash
curl -X POST https://agiworkforce.com/api/llm/v1/chat/completions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -N \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Write a haiku"}],
    "stream": true
  }'
```

**Response (Server-Sent Events):**

```
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1705325400,"model":"gpt-4","choices":[{"index":0,"delta":{"role":"assistant","content":"Cherry"},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1705325400,"model":"gpt-4","choices":[{"index":0,"delta":{"content":" blossoms"},"finish_reason":null}]}

data: [DONE]
```

### 5. Prompt Caching

Enable prompt caching to reduce costs:

```bash
curl -X POST https://agiworkforce.com/api/llm/v1/chat/completions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4",
    "messages": [
      {
        "role": "system",
        "content": "You are a helpful coding assistant with expertise in Python and JavaScript."
      },
      {
        "role": "user",
        "content": "How do I read a CSV file in Python?"
      }
    ],
    "use_prompt_cache": true
  }'
```

**Benefits:**

- First request creates cache (small fee)
- Subsequent requests read from cache (90% cost reduction)
- Cache TTL: 5 minutes

---

## Rate Limiting

All endpoints have rate limits to ensure fair usage.

### Rate Limit Headers

Every response includes rate limit information:

```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 2026-01-15T10:30:00Z
```

### Rate Limits by Endpoint

| Endpoint                       | Rate Limit   | Window   |
| ------------------------------ | ------------ | -------- |
| `/api/me`                      | 60 requests  | 1 minute |
| `/api/checkout`                | 5 requests   | 1 minute |
| `/api/device/link`             | 10 requests  | 1 minute |
| `/api/device/poll`             | 10 requests  | 1 second |
| `/api/llm/v1/chat/completions` | 100 requests | 1 minute |
| `/api/llm/v1/credits/balance`  | 60 requests  | 1 minute |
| `/api/portal`                  | 10 requests  | 1 minute |

### Handling Rate Limits

When rate limit is exceeded, you'll receive a `429` response:

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Please try again after 2026-01-15T10:30:00Z",
    "type": "rate_limit_error"
  }
}
```

**Best Practice: Exponential Backoff**

```javascript
async function requestWithBackoff(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url, options);

    if (response.status !== 429) {
      return response;
    }

    const retryAfter = response.headers.get('Retry-After');
    const delay = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, i) * 1000;

    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  throw new Error('Max retries exceeded');
}
```

---

## Error Handling

### HTTP Status Codes

| Code  | Meaning          | Action                        |
| ----- | ---------------- | ----------------------------- |
| `200` | Success          | Process response              |
| `400` | Bad Request      | Check request parameters      |
| `401` | Unauthorized     | Verify authentication token   |
| `402` | Payment Required | Add credits or upgrade plan   |
| `403` | Forbidden        | Check plan tier requirements  |
| `404` | Not Found        | Verify endpoint URL           |
| `429` | Rate Limit       | Implement exponential backoff |
| `500` | Server Error     | Retry with backoff            |

### Error Response Format

All errors follow this structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "type": "error_type",
    "param": "field_name"
  }
}
```

### Common Error Codes

| Code                    | Description                             |
| ----------------------- | --------------------------------------- |
| `RATE_LIMIT_EXCEEDED`   | Too many requests                       |
| `INSUFFICIENT_CREDITS`  | Not enough credits for operation        |
| `DAILY_LIMIT_EXCEEDED`  | Daily spending limit reached            |
| `INVALID_API_KEY`       | Invalid authentication token            |
| `MODEL_NOT_AVAILABLE`   | Model requires higher subscription tier |
| `SUBSCRIPTION_REQUIRED` | Endpoint requires active subscription   |
| `SUBSCRIPTION_INACTIVE` | Subscription is not active              |
| `VALIDATION_ERROR`      | Invalid request parameters              |

### Example Error Handler

```javascript
async function handleApiRequest(url, options) {
  try {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      const error = data.error;

      switch (error.code) {
        case 'RATE_LIMIT_EXCEEDED':
          // Wait and retry
          await new Promise((r) => setTimeout(r, 60000));
          return handleApiRequest(url, options);

        case 'INSUFFICIENT_CREDITS':
          // Prompt user to add credits
          throw new Error('Please add credits to continue');

        case 'MODEL_NOT_AVAILABLE':
          // Suggest alternative model
          throw new Error(`${error.message}. Try using 'gpt-3.5-turbo' instead.`);

        default:
          throw new Error(error.message);
      }
    }

    return data;
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}
```

---

## Best Practices

### 1. Token Management

**DO:**

- Store tokens securely (encrypted storage, environment variables)
- Refresh tokens before expiry
- Use separate tokens for different environments

**DON'T:**

- Commit tokens to version control
- Share tokens between users
- Store tokens in browser localStorage (use httpOnly cookies instead)

```javascript
// Good: Environment variable
const token = process.env.AGI_WORKFORCE_TOKEN;

// Bad: Hardcoded
const token = 'eyJhbGciOiJIUzI1NiIs...';
```

### 2. Credit Management

**Monitor Credits Regularly:**

```javascript
async function checkCreditsBeforeRequest(requiredCents) {
  const balance = await fetch('https://agiworkforce.com/api/llm/v1/credits/balance', {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());

  if (balance.credits_remaining_cents < requiredCents) {
    throw new Error('Insufficient credits');
  }
}
```

**Enable Prompt Caching:**

```javascript
// First request - creates cache
const response1 = await createCompletion({
  model: 'claude-sonnet-4',
  messages: [
    { role: 'system', content: 'Long system prompt...' },
    { role: 'user', content: 'Question 1' },
  ],
  use_prompt_cache: true,
});

// Subsequent requests - reads from cache (90% cheaper)
const response2 = await createCompletion({
  model: 'claude-sonnet-4',
  messages: [
    { role: 'system', content: 'Long system prompt...' }, // Same prompt
    { role: 'user', content: 'Question 2' },
  ],
  use_prompt_cache: true,
});
```

### 3. Model Selection

**Choose the right model for your use case:**

| Use Case            | Recommended Model | Tier Required |
| ------------------- | ----------------- | ------------- |
| Simple Q&A          | `gpt-3.5-turbo`   | Hobby         |
| Code generation     | `gpt-4`           | Pro           |
| Complex reasoning   | `claude-sonnet-4` | Pro           |
| Maximum performance | `claude-opus-4-5` | Max           |
| Cost-optimized      | `deepseek-chat`   | Hobby         |

### 4. Request Optimization

**Batch Related Requests:**

```javascript
// Bad: Multiple sequential requests
for (const question of questions) {
  await createCompletion({ messages: [{ role: 'user', content: question }] });
}

// Good: Single request with multiple questions
const allQuestions = questions.join('\n\n');
await createCompletion({ messages: [{ role: 'user', content: allQuestions }] });
```

**Use Streaming for Better UX:**

```javascript
const response = await fetch('https://agiworkforce.com/api/llm/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Write a story' }],
    stream: true,
  }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  console.log('Chunk:', chunk);
  // Update UI with partial response
}
```

### 5. Error Recovery

**Implement Retry Logic:**

```javascript
async function retryWithExponentialBackoff(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      if (i === maxRetries - 1) throw error

      const delay = Math.pow(2, i) * 1000
      await new Promise(r => setTimeout(r, delay))
    }
  }
}

// Usage
const result = await retryWithExponentialBackoff(() =>
  createCompletion({ model: 'gpt-4', messages: [...] })
)
```

### 6. Idempotency

**Use Idempotency Keys for Critical Operations:**

```javascript
const idempotencyKey = `request-${Date.now()}-${Math.random()}`;

await fetch('https://agiworkforce.com/api/checkout', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Idempotency-Key': idempotencyKey,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ plan: 'pro', billingInterval: 'monthly' }),
});
```

---

## Next Steps

- **Full API Reference**: See [openapi.yaml](./openapi.yaml) for complete endpoint documentation
- **Rate Limits**: Review [RATE_LIMITS.md](./RATE_LIMITS.md) for detailed rate limiting policies
- **Code Examples**: Check [examples/](./examples/) for language-specific samples
- **Postman Collection**: Import [AGI_Workforce.postman_collection.json](./AGI_Workforce.postman_collection.json) for testing

## Support

Need help?

- **Documentation**: [https://docs.agiworkforce.com](https://docs.agiworkforce.com)
- **Discord**: [https://discord.gg/agiworkforce](https://discord.gg/agiworkforce)
- **Email**: support@agiworkforce.com
