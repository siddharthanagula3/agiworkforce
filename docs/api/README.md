# AGI Workforce API Documentation

Welcome to the AGI Workforce API documentation! This comprehensive guide will help you integrate AGI Workforce's powerful AI capabilities into your applications.

## Overview

The AGI Workforce API provides:

- **OpenAI-Compatible LLM API**: Use multiple LLM providers (OpenAI, Anthropic, Google, etc.) through a unified interface
- **Subscription Management**: Stripe-powered subscription and credit system
- **Device Authorization**: Secure device linking with OAuth-style flow
- **Multi-Provider Routing**: Automatic routing to the best LLM provider based on model
- **Cost Optimization**: Prompt caching, automatic fallbacks, and credit-based billing

## Base URLs

```
Web API:        https://agiworkforce.com/api
API Gateway:    https://api.agiworkforce.com
LLM API:        https://agiworkforce.com/api/llm/v1
```

## Quick Links

### Getting Started

- **[API Quickstart](./API_QUICKSTART.md)** - Authentication, first request, and common patterns
- **[OpenAPI Specification](./openapi.yaml)** - Complete API reference in OpenAPI 3.1 format
- **[Postman Collection](./AGI_Workforce.postman_collection.json)** - Ready-to-use API testing collection

### Documentation

- **[API Routes Reference](./API_ROUTES.md)** - Detailed documentation for all endpoints
- **[Rate Limiting Guide](./RATE_LIMITS.md)** - Rate limits, policies, and handling strategies
- **[API Versioning Strategy](./API_VERSIONING.md)** - Versioning, deprecation, and migration

### Code Examples

- **[cURL Examples](./examples/curl.sh)** - Command-line examples
- **[JavaScript Examples](./examples/javascript.js)** - Node.js and browser examples
- **[Python Examples](./examples/python.py)** - Python examples with requests library

## Authentication

The API uses Bearer token authentication with Supabase JWT tokens:

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  https://agiworkforce.com/api/me
```

**Get Your Token:**

1. Sign up at [https://agiworkforce.com/signup](https://agiworkforce.com/signup)
2. Use Supabase SDK to authenticate
3. Extract the access token from the session

## Quick Example

```javascript
// Get user profile
const response = await fetch('https://agiworkforce.com/api/me', {
  headers: { Authorization: `Bearer ${token}` },
});
const user = await response.json();

// Create chat completion
const completion = await fetch('https://agiworkforce.com/api/llm/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'What is the capital of France?' }],
  }),
});
```

## Key Features

### 1. OpenAI-Compatible LLM API

Use the same API interface for multiple providers:

```javascript
// Works with OpenAI, Anthropic, Google, DeepSeek, Qwen, and more
const models = ['gpt-4', 'claude-sonnet-4', 'gemini-2.5-flash', 'deepseek-chat'];
```

### 2. Prompt Caching

Save up to 90% on costs with prompt caching:

```javascript
{
  "model": "claude-sonnet-4",
  "messages": [...],
  "use_prompt_cache": true  // Enable caching
}
```

### 3. Automatic Fallbacks

Automatically fall back to cheaper models on low credits:

```javascript
// Request: gpt-4
// Response: gpt-3.5-turbo (fallback due to insufficient credits)
{
  "x_agi_workforce": {
    "fallback": {
      "original_model": "gpt-4",
      "reason": "Insufficient credits"
    }
  }
}
```

### 4. Streaming Responses

Real-time streaming for better UX:

```javascript
{
  "model": "gpt-4",
  "messages": [...],
  "stream": true  // Enable streaming
}
```

### 5. Device Linking

Secure OAuth-style device authorization:

```javascript
// 1. Generate link code
const { link_code, verify_url } = await generateLinkCode(deviceId);

// 2. User visits verify_url in browser
console.log(`Visit: ${verify_url}`);

// 3. Poll for authorization
const { access_token } = await pollDeviceStatus(deviceId);
```

## Rate Limits

All endpoints have rate limits to ensure fair usage:

| Endpoint                       | Rate Limit |
| ------------------------------ | ---------- |
| `/api/me`                      | 60/min     |
| `/api/checkout`                | 5/min      |
| `/api/device/link`             | 10/min     |
| `/api/llm/v1/chat/completions` | 100/min    |

See [RATE_LIMITS.md](./RATE_LIMITS.md) for complete details.

## Credit System

LLM API calls are billed via a credit system:

| Tier  | Monthly Credits | Daily Limit |
| ----- | --------------- | ----------- |
| Hobby | $20             | $2/day      |
| Pro   | $50             | $5/day      |
| Max   | $500            | $50/day     |

**Check Balance:**

```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://agiworkforce.com/api/llm/v1/credits/balance
```

## Subscription Tiers

| Feature         | Free | Hobby                 | Pro                  | Max                |
| --------------- | ---- | --------------------- | -------------------- | ------------------ |
| **Price**       | $0   | $10/mo                | $30/mo               | $300/mo            |
| **LLM Access**  | ❌   | ✅ Basic              | ✅ Advanced          | ✅ Premium         |
| **Models**      | -    | GPT-3.5, Claude Haiku | GPT-4, Claude Sonnet | GPT-5, Claude Opus |
| **Credits**     | $0   | $20/mo                | $50/mo               | $500/mo            |
| **Daily Limit** | -    | $2                    | $5                   | $50                |

## Webhook Endpoints

### Stripe Webhook

Handle subscription lifecycle events:

```
POST /api/stripe-webhook
Signature: stripe-signature header
```

**Events**:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `charge.refunded`

See [API_ROUTES.md](./API_ROUTES.md#stripe-webhook) for details.

## Error Handling

The API uses standard HTTP status codes:

| Code  | Meaning                                 |
| ----- | --------------------------------------- |
| `200` | Success                                 |
| `400` | Bad Request                             |
| `401` | Unauthorized                            |
| `402` | Payment Required (insufficient credits) |
| `403` | Forbidden                               |
| `429` | Rate Limit Exceeded                     |
| `500` | Server Error                            |

**Error Response Format:**

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Please try again after...",
    "type": "rate_limit_error"
  }
}
```

## Best Practices

### 1. Monitor Rate Limits

```javascript
const response = await fetch(url, options);
const remaining = response.headers.get('X-RateLimit-Remaining');

if (remaining < 5) {
  console.warn('Low rate limit remaining!');
}
```

### 2. Implement Exponential Backoff

```javascript
async function retryWithBackoff(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.status !== 429 || i === maxRetries - 1) throw error;

      const delay = Math.pow(2, i) * 1000;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
```

### 3. Use Prompt Caching

```javascript
// First request: creates cache
const response1 = await createCompletion({
  messages: [
    { role: 'system', content: 'Long system prompt...' },
    { role: 'user', content: 'Question 1' },
  ],
  use_prompt_cache: true,
});

// Subsequent requests: reads from cache (90% cheaper)
const response2 = await createCompletion({
  messages: [
    { role: 'system', content: 'Long system prompt...' }, // Same prompt
    { role: 'user', content: 'Question 2' },
  ],
  use_prompt_cache: true,
});
```

### 4. Check Credits Before Expensive Operations

```javascript
const balance = await getCreditBalance();

if (balance.credits_remaining_cents < 10000) {
  // $100
  console.warn('Low credits!');
}

if (balance.daily_remaining_cents < 1000) {
  // $10
  throw new Error('Insufficient daily credits');
}
```

### 5. Use Idempotency Keys

```javascript
await fetch('https://agiworkforce.com/api/checkout', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Idempotency-Key': uniqueKey,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ plan: 'pro', billingInterval: 'monthly' }),
});
```

## Testing

### Import Postman Collection

1. Open Postman
2. Click "Import"
3. Select `AGI_Workforce.postman_collection.json`
4. Set `bearer_token` variable
5. Start testing!

### Run cURL Examples

```bash
chmod +x examples/curl.sh
export TOKEN="YOUR_JWT_TOKEN"
./examples/curl.sh
```

### Try JavaScript Examples

```bash
cd examples
npm install node-fetch  # If using Node.js < 18
export TOKEN="YOUR_JWT_TOKEN"
node javascript.js
```

### Try Python Examples

```bash
cd examples
pip install requests
export TOKEN="YOUR_JWT_TOKEN"
python python.py
```

## Support

Need help?

- **Documentation**: [https://docs.agiworkforce.com](https://docs.agiworkforce.com)
- **Discord**: [https://discord.gg/agiworkforce](https://discord.gg/agiworkforce)
- **Email**: support@agiworkforce.com
- **GitHub Issues**: [https://github.com/agiworkforce/api-feedback](https://github.com/agiworkforce/api-feedback)

## Changelog

See [API_VERSIONING.md](./API_VERSIONING.md#changelog) for the complete changelog.

**Latest Updates:**

- **v1.5.2** (2026-01-15): Added `thinking_mode` parameter, prompt caching support for Claude Sonnet 4
- **v1.5.1** (2026-01-10): Fixed credit reconciliation bug in streaming mode
- **v1.5.0** (2026-01-05): Added device polling optimizations

## Version

Current API version: **v1**

Full version: **1.5.2**

See [API_VERSIONING.md](./API_VERSIONING.md) for versioning strategy and lifecycle.

## Contributing

We welcome contributions to our API documentation!

1. Fork the repository
2. Make your changes
3. Submit a pull request

## License

API documentation is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

API usage is subject to [AGI Workforce Terms of Service](https://agiworkforce.com/terms).

---

**Ready to get started?** Check out the [API Quickstart Guide](./API_QUICKSTART.md)!
