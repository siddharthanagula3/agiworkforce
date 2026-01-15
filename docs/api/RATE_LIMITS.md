# AGI Workforce API Rate Limiting

This document provides comprehensive information about rate limiting policies, enforcement mechanisms, and best practices for the AGI Workforce API.

## Table of Contents

- [Overview](#overview)
- [Rate Limit Policies](#rate-limit-policies)
- [Rate Limit Headers](#rate-limit-headers)
- [Handling Rate Limits](#handling-rate-limits)
- [Tier-Based Limits](#tier-based-limits)
- [Credit-Based Limits](#credit-based-limits)
- [Implementation Details](#implementation-details)

---

## Overview

Rate limiting protects the API infrastructure and ensures fair usage across all users. AGI Workforce implements a **sliding window** rate limiting algorithm with per-endpoint limits.

### Key Features

- **Sliding Window Algorithm**: More accurate than fixed windows, prevents burst abuse
- **Redis-Backed**: Distributed rate limiting across all servers
- **Graceful Degradation**: Falls back to in-memory limits if Redis unavailable (dev only)
- **Fail-Closed Security**: Security-sensitive endpoints block requests when rate limiter unavailable in production

---

## Rate Limit Policies

### Web API Endpoints

| Endpoint                            | Limit | Window   | Fail Mode  | Description                                 |
| ----------------------------------- | ----- | -------- | ---------- | ------------------------------------------- |
| `GET /api/me`                       | 60    | 1 minute | Open       | User profile access                         |
| `POST /api/checkout`                | 5     | 1 minute | **Closed** | Subscription checkout (security-sensitive)  |
| `POST /api/credit-topup`            | 5     | 1 minute | **Closed** | Credit purchase (security-sensitive)        |
| `POST /api/device/link`             | 10    | 1 minute | **Closed** | Device code generation (security-sensitive) |
| `POST /api/device/poll`             | 10    | 1 second | Open       | Device authorization polling                |
| `POST /api/claim-offer`             | 3     | 1 hour   | **Closed** | Beta invite redemption (security-sensitive) |
| `POST /api/sync-subscription`       | 10    | 1 minute | Open       | Subscription status sync                    |
| `POST /api/portal`                  | 10    | 1 minute | Open       | Billing portal access                       |
| `GET /api/health`                   | 30    | 1 minute | Open       | Health check                                |
| `GET /api/download`                 | 30    | 1 minute | Open       | App download                                |
| `GET /api/download-beta`            | 10    | 1 minute | Open       | Beta app download                           |
| `POST /api/llm/v1/chat/completions` | 100   | 1 minute | Open       | LLM chat completions                        |
| `GET /api/llm/v1/credits/balance`   | 60    | 1 minute | Open       | Credit balance check                        |
| `GET /api/llm/v1/models`            | 100   | 1 minute | Open       | Model listing                               |
| **Default**                         | 100   | 1 minute | Open       | All other endpoints                         |

### API Gateway Endpoints

| Endpoint                          | Limit | Window     | Description                 |
| --------------------------------- | ----- | ---------- | --------------------------- |
| `POST /api/auth/register`         | 5     | 15 minutes | User registration           |
| `POST /api/auth/login`            | 5     | 15 minutes | User login                  |
| `GET /api/auth/verify`            | 100   | 1 minute   | Token verification          |
| `POST /api/desktop/register`      | 10    | 1 minute   | Desktop device registration |
| `GET /api/desktop/:id/status`     | 60    | 1 minute   | Device status check         |
| `POST /api/desktop/:id/command`   | 30    | 1 minute   | Send command to device      |
| `GET /api/desktop/`               | 30    | 1 minute   | List user devices           |
| `POST /api/desktop/:id/heartbeat` | 600   | 1 minute   | Heartbeat (10/sec)          |
| `DELETE /api/desktop/:id`         | 10    | 1 minute   | Unregister device           |
| `GET /api/health`                 | 100   | 1 minute   | Health check                |

---

## Rate Limit Headers

Every API response includes rate limit information in the headers:

```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: Wed, 15 Jan 2026 10:30:00 GMT
```

### Header Reference

| Header                  | Type     | Description                                          |
| ----------------------- | -------- | ---------------------------------------------------- |
| `X-RateLimit-Limit`     | integer  | Maximum requests allowed in the current window       |
| `X-RateLimit-Remaining` | integer  | Remaining requests in the current window             |
| `X-RateLimit-Reset`     | ISO 8601 | ISO timestamp when the rate limit resets             |
| `Retry-After`           | integer  | Seconds to wait before retrying (429 responses only) |

### Rate Limit Exceeded Response

When you exceed a rate limit, you'll receive a `429 Too Many Requests` response:

```http
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: Wed, 15 Jan 2026 10:30:00 GMT
Retry-After: 60
Content-Type: application/json

{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Please try again after Wed, 15 Jan 2026 10:30:00 GMT",
    "type": "rate_limit_error"
  },
  "rateLimit": {
    "limit": 60,
    "remaining": 0,
    "reset": "2026-01-15T10:30:00Z"
  }
}
```

---

## Handling Rate Limits

### 1. Monitor Rate Limit Headers

Always check rate limit headers in your client:

```javascript
const response = await fetch('https://agiworkforce.com/api/me', {
  headers: { Authorization: `Bearer ${token}` },
});

const remaining = parseInt(response.headers.get('X-RateLimit-Remaining'));
const reset = new Date(response.headers.get('X-RateLimit-Reset'));

if (remaining < 5) {
  console.warn(`Low rate limit: ${remaining} requests remaining until ${reset}`);
}
```

### 2. Implement Exponential Backoff

When you hit a rate limit, wait before retrying:

```javascript
async function requestWithBackoff(url, options, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url, options);

    if (response.status !== 429) {
      return response;
    }

    // Use Retry-After header if available
    const retryAfter = response.headers.get('Retry-After');
    const delay = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * 1000;

    console.log(`Rate limited. Retrying in ${delay}ms...`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  throw new Error('Max retries exceeded');
}

// Usage
const response = await requestWithBackoff('https://agiworkforce.com/api/me', {
  headers: { Authorization: `Bearer ${token}` },
});
```

### 3. Use Request Queuing

For applications with high request volumes, implement a queue:

```javascript
class RateLimitedQueue {
  constructor(maxConcurrent = 5, minDelay = 100) {
    this.queue = [];
    this.active = 0;
    this.maxConcurrent = maxConcurrent;
    this.minDelay = minDelay;
  }

  async add(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.active >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.active++;
    const { fn, resolve, reject } = this.queue.shift();

    try {
      const result = await fn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.active--;
      setTimeout(() => this.process(), this.minDelay);
    }
  }
}

// Usage
const queue = new RateLimitedQueue(5, 100);

const results = await Promise.all(
  requests.map((request) => queue.add(() => fetch(request.url, request.options))),
);
```

### 4. Batch Requests When Possible

Instead of making multiple requests, batch operations when the API supports it:

```javascript
// Bad: Multiple requests
for (const question of questions) {
  await createCompletion({
    messages: [{ role: 'user', content: question }],
  });
}

// Good: Single batched request
const batchedQuestions = questions.map((q, i) => `Question ${i + 1}: ${q}`).join('\n\n');

await createCompletion({
  messages: [{ role: 'user', content: batchedQuestions }],
});
```

### 5. Cache Responses

Reduce API calls by caching responses:

```javascript
const cache = new Map();

async function getCachedUser(token, ttl = 60000) {
  const cached = cache.get(token);

  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data;
  }

  const response = await fetch('https://agiworkforce.com/api/me', {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await response.json();
  cache.set(token, { data, timestamp: Date.now() });

  return data;
}
```

---

## Tier-Based Limits

Rate limits may vary based on your subscription tier:

### Per-Tier Rate Limit Multipliers

| Tier       | Multiplier | Example (100 req/min) |
| ---------- | ---------- | --------------------- |
| Free       | 1.0x       | 100 requests/minute   |
| Hobby      | 1.0x       | 100 requests/minute   |
| Pro        | 2.0x       | 200 requests/minute   |
| Max        | 5.0x       | 500 requests/minute   |
| Enterprise | Custom     | Negotiable            |

**Note**: Currently all tiers share the same rate limits. Tier-based multipliers are reserved for future implementation.

---

## Credit-Based Limits

In addition to rate limits, LLM API calls are subject to **credit limits**:

### Monthly Credit Allocation

| Tier       | Monthly Credits | Value (USD)  |
| ---------- | --------------- | ------------ |
| Free       | 0               | $0           |
| Hobby      | $20             | 2,000 cents  |
| Pro        | $50             | 5,000 cents  |
| Max        | $500            | 50,000 cents |
| Enterprise | Custom          | Negotiable   |

### Daily Credit Limits

To prevent accidental overspending, daily limits apply:

| Tier  | Daily Limit | Percentage of Monthly |
| ----- | ----------- | --------------------- |
| Hobby | $2/day      | 10%                   |
| Pro   | $5/day      | 10%                   |
| Max   | $50/day     | 10%                   |

**Daily Reset**: Credits reset at 00:00 UTC daily.

### Credit Error Responses

**Monthly Limit Exceeded (402 Payment Required):**

```json
{
  "error": {
    "message": "Monthly credit limit reached. Please upgrade your plan or add credits.",
    "type": "insufficient_quota",
    "code": "monthly_limit_exceeded"
  }
}
```

**Daily Limit Exceeded (429 Too Many Requests):**

```json
{
  "error": {
    "message": "Daily credit limit reached. Credits reset at midnight UTC.",
    "type": "insufficient_quota",
    "code": "daily_limit_exceeded"
  }
}
```

### Automatic Fallback to Cheaper Models

When you're low on credits, the API automatically falls back to cheaper models:

```javascript
// Request
{
  "model": "gpt-4",
  "messages": [...]
}

// Response (with fallback)
{
  "model": "gpt-3.5-turbo",
  "x_agi_workforce": {
    "fallback": {
      "original_model": "gpt-4",
      "reason": "Insufficient credits for gpt-4, switched to gpt-3.5-turbo"
    }
  }
}
```

**Fallback Priority:**

1. `deepseek-chat` (most cost-effective)
2. `qwen-flash`
3. `gpt-3.5-turbo`
4. `gemini-2.5-flash-lite`
5. `claude-haiku-4-5`

---

## Implementation Details

### Sliding Window Algorithm

AGI Workforce uses **Upstash Redis** with a sliding window algorithm:

```
Window: 1 minute
Limit: 60 requests

Timeline:
10:00:00 - 10:00:59  |  60 requests allowed
10:00:30 - 10:01:29  |  60 requests allowed (sliding)
10:01:00 - 10:01:59  |  60 requests allowed (new window)
```

**Benefits over Fixed Windows:**

- Prevents burst traffic at window boundaries
- More accurate rate limiting
- Better user experience

### Fail-Closed vs Fail-Open

AGI Workforce implements two failure modes:

#### Fail-Closed (Security-Sensitive Endpoints)

When Redis is unavailable in production, **block all requests**:

```
Endpoints:
- POST /api/checkout
- POST /api/credit-topup
- POST /api/device/link
- POST /api/claim-offer
```

**Reason**: These endpoints involve payments or security-sensitive operations. Allowing unlimited requests could enable abuse or fraud.

#### Fail-Open (Non-Sensitive Endpoints)

When Redis is unavailable, **allow requests** but log warnings:

```
Endpoints:
- GET /api/me
- POST /api/llm/v1/chat/completions
- All other endpoints
```

**Reason**: These endpoints are less sensitive. Blocking them would severely impact user experience.

### In-Memory Fallback (Development Only)

In development environments, an in-memory rate limiter activates when Redis is unavailable:

**Limitations:**

- Per-process memory (doesn't work across serverless instances)
- Maximum 10,000 entries (prevents memory exhaustion)
- Periodic cleanup every 60 seconds

**Warning Logged:**

```
[SECURITY WARNING] Redis not configured in production environment.
In-memory rate limiting is NOT effective in serverless/distributed deployments.
Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables.
```

### Rate Limit Identifiers

Rate limits are tracked by:

1. **User ID** (when authenticated): `user:{user_id}`
2. **IP Address** (when not authenticated): `ip:{ip_address}`

**Example:**

```
user:123e4567-e89b-12d3-a456-426614174000
ip:203.0.113.42
```

---

## Best Practices

### 1. Track Rate Limit Headers

Always monitor rate limit headers in production:

```javascript
function logRateLimitMetrics(response) {
  const metrics = {
    endpoint: response.url,
    limit: response.headers.get('X-RateLimit-Limit'),
    remaining: response.headers.get('X-RateLimit-Remaining'),
    reset: response.headers.get('X-RateLimit-Reset'),
    timestamp: new Date().toISOString(),
  };

  // Send to monitoring system
  analytics.track('rate_limit', metrics);

  // Warn if approaching limit
  if (parseInt(metrics.remaining) < 10) {
    console.warn('Approaching rate limit:', metrics);
  }
}
```

### 2. Implement Circuit Breakers

Prevent cascading failures with circuit breakers:

```javascript
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.failures = 0;
    this.threshold = threshold;
    this.timeout = timeout;
    this.state = 'closed'; // closed, open, half-open
    this.nextAttempt = Date.now();
  }

  async execute(fn) {
    if (this.state === 'open') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is open');
      }
      this.state = 'half-open';
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }

  onFailure() {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.state = 'open';
      this.nextAttempt = Date.now() + this.timeout;
    }
  }
}
```

### 3. Use Webhook for Async Operations

For long-running operations, use webhooks instead of polling:

```javascript
// Bad: Polling (wastes rate limits)
let status = 'pending';
while (status === 'pending') {
  const response = await fetch('/api/status');
  status = response.status;
  await sleep(1000); // Polls every second
}

// Good: Webhook (register once, get notified)
await fetch('/api/subscribe-webhook', {
  method: 'POST',
  body: JSON.stringify({
    url: 'https://myapp.com/webhook',
    events: ['task.completed'],
  }),
});
```

### 4. Optimize for Caching

Design requests to maximize cache hits:

```javascript
// Bad: Different system prompts = separate cache entries
const prompts = [
  'You are a helpful assistant.',
  'You are a helpful AI assistant.',
  'You are a helpful coding assistant.',
];

// Good: Consistent system prompt = single cache entry
const prompt = 'You are a helpful assistant with expertise in multiple domains.';
```

### 5. Monitor and Alert

Set up alerts for rate limit issues:

```javascript
// Alert when frequently hitting limits
if (rateLimitHits > 10 per hour) {
  alert('Frequent rate limit hits - consider optimizing API usage')
}

// Alert when fail-closed endpoints are blocked
if (failClosedBlocks > 0) {
  alert('CRITICAL: Security-sensitive endpoint blocked due to rate limiter failure')
}
```

---

## Contact Support

If you need higher rate limits:

1. **Upgrade Plan**: Max tier offers 5x higher limits
2. **Enterprise Plan**: Custom rate limits available
3. **Contact Sales**: sales@agiworkforce.com

For technical issues:

- **Email**: support@agiworkforce.com
- **Discord**: https://discord.gg/agiworkforce
