# LLM API Usage Guide

This guide provides comprehensive documentation for using LLM APIs in the AGI Workforce platform, based on the latest best practices from Context7.

## Table of Contents

1. [OpenAI API](#openai-api)
2. [Anthropic Claude API](#anthropic-claude-api)
3. [Google Gemini API](#google-gemini-api)
4. [xAI Grok API](#xai-grok-api)
5. [Error Handling](#error-handling)
6. [Streaming Responses](#streaming-responses)
7. [Rate Limits](#rate-limits)
8. [Best Practices](#best-practices)

---

## OpenAI API

### Basic Chat Completion

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const response = await openai.chat.completions.create({
  model: 'gpt-5',
  messages: [
    {
      role: 'user',
      content: "Say 'double bubble bath' ten times fast.",
    },
  ],
});
```

### Streaming Chat Completions

```typescript
const stream = await openai.chat.completions.create({
  model: 'gpt-5',
  messages: [
    {
      role: 'user',
      content: "Say 'double bubble bath' ten times fast.",
    },
  ],
  stream: true,
});

for await (const chunk of stream) {
  if (chunk.choices[0]?.delta?.content) {
    process.stdout.write(chunk.choices[0].delta.content);
  }
}
```

### JSON Mode with Error Handling

```typescript
try {
  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo-0125',
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant designed to output JSON.',
      },
      {
        role: 'user',
        content: 'Who won the world series in 2020? Please respond in the format {winner: ...}',
      },
    ],
    response_format: { type: 'json_object' },
  });

  // Check finish_reason for error cases
  if (response.choices[0].message.finish_reason === 'length') {
    // Handle incomplete JSON due to context window limit
    console.error('Response was truncated');
  }

  if (response.choices[0].message.refusal) {
    // Handle refusal from safety system
    console.error('Request was refused:', response.choices[0].message.refusal);
  }

  if (response.choices[0].message.finish_reason === 'content_filter') {
    // Handle content filter blocking
    console.error('Content was filtered');
  }

  if (response.choices[0].message.finish_reason === 'stop') {
    // Successfully completed
    const result = JSON.parse(response.choices[0].message.content);
    console.log(result);
  }
} catch (error) {
  // Handle network errors, API errors, etc.
  console.error('API Error:', error);
}
```

### Endpoint

- **URL**: `https://api.openai.com/v1/chat/completions`
- **Method**: `POST`
- **Headers**:
  - `Authorization: Bearer YOUR_API_KEY`
  - `Content-Type: application/json`

---

## Anthropic Claude API

### Basic Messages API

```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const message = await anthropic.messages.create({
  model: 'claude-3-opus-20240229',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello, Claude' }],
});
```

### Streaming Messages

```typescript
const stream = await anthropic.messages.stream({
  model: 'claude-3-opus-20240229',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello, Claude' }],
});

for await (const chunk of stream) {
  if (chunk.type === 'content_block_delta') {
    process.stdout.write(chunk.delta.text);
  }
}
```

### Error Handling

The Anthropic API uses standard HTTP error codes:

- **400 - `invalid_request_error`**: Issue with request format or content
- **401 - `authentication_error`**: API key issue
- **403 - `permission_error`**: API key lacks permission
- **404 - `not_found_error`**: Resource not found
- **413 - `request_too_large`**: Request exceeds 32 MB limit
- **429 - `rate_limit_error`**: Rate limit exceeded (check `retry-after` header)
- **500 - `api_error`**: Internal Anthropic error
- **529 - `overloaded_error`**: API temporarily overloaded

```typescript
try {
  const message = await anthropic.messages.create({
    model: 'claude-3-opus-20240229',
    max_tokens: 1024,
    messages: [{ role: 'user', content: 'Hello' }],
  });
} catch (error) {
  if (error.status === 429) {
    const retryAfter = error.headers?.['retry-after'];
    console.error(`Rate limited. Retry after ${retryAfter} seconds`);
  } else if (error.status === 413) {
    console.error('Request too large (max 32 MB)');
  } else {
    console.error('API Error:', error.message);
  }
}
```

### Rate Limits

Rate limits are measured in:

- **RPM**: Requests per minute
- **ITPM**: Input tokens per minute
- **OTPM**: Output tokens per minute

Each model class has different limits. Check the `retry-after` header when receiving 429 errors.

### Endpoint

- **URL**: `https://api.anthropic.com/v1/messages`
- **Method**: `POST`
- **Headers**:
  - `x-api-key: YOUR_API_KEY`
  - `anthropic-version: 2023-06-01`
  - `Content-Type: application/json`

---

## Google Gemini API

### Basic Content Generation

```typescript
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: 'Explain how AI works',
});
```

### Streaming Content Generation

```typescript
const response = await ai.models.generateContentStream({
  model: 'gemini-2.5-flash',
  contents: 'Explain how AI works',
});

for await (const chunk of response) {
  console.log(chunk.text);
}
```

### Error Handling

Always check `finishReason` in the response:

```typescript
const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: 'Your prompt here',
});

const candidate = response.candidates[0];

if (candidate.finishReason === 'MAX_TOKENS') {
  console.error('Response was truncated due to token limit');
} else if (candidate.finishReason === 'SAFETY') {
  console.error('Response was blocked by safety filters');
} else if (candidate.finishReason === 'RECITATION') {
  console.error('Response was blocked due to recitation concerns');
} else if (candidate.finishReason === 'STOP') {
  // Successfully completed
  console.log(candidate.content.parts[0].text);
}
```

### Endpoints

- **Standard**: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- **Streaming**: `https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent`
- **Method**: `POST`
- **Headers**:
  - `x-goog-api-key: YOUR_API_KEY`
  - `Content-Type: application/json`

---

## xAI Grok API

### Basic Chat Completion

```typescript
import { Client } from 'xai-sdk';

const client = new Client({
  apiKey: process.env.XAI_API_KEY,
});

const response = await client.chat.completions.create({
  model: 'grok-4',
  messages: [
    {
      role: 'system',
      content: 'You are Grok, a highly intelligent, helpful AI assistant.',
    },
    {
      role: 'user',
      content: 'What is the meaning of life, the universe, and everything?',
    },
  ],
  stream: false,
});
```

### Streaming Chat Completions

```typescript
const chat = client.chat.create({ model: 'grok-4' });
chat.append(system('You are Grok, a chatbot inspired by the Hitchhikers Guide to the Galaxy.'));
chat.append(user('What is the meaning of life, the universe, and everything?'));

for await (const [response, chunk] of chat.stream()) {
  process.stdout.write(chunk.content || '');
}
```

### Deferred Completions

For long-running requests:

```typescript
// Initiate deferred request
const deferred = await client.chat.completions.create({
  model: 'grok-4',
  messages: [{ role: 'user', content: 'Your prompt' }],
  defer: true,
});

const requestId = deferred.request_id;

// Poll for result
let result;
do {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  result = await client.chat.deferredCompletion.retrieve(requestId);
} while (result.status === 202);

// Process result when ready
if (result.status === 200) {
  console.log(result.data.choices[0].message.content);
}
```

### Endpoint

- **URL**: `https://api.x.ai/v1/chat/completions`
- **Method**: `POST`
- **Headers**:
  - `Authorization: Bearer YOUR_API_KEY`
  - `Content-Type: application/json`

---

## Error Handling

### Common Error Patterns

All LLM APIs follow similar error handling patterns:

```typescript
async function makeLLMRequest(provider: string, request: LLMRequest) {
  try {
    const response = await sendRequest(provider, request);
    return response;
  } catch (error) {
    // Network errors
    if (error instanceof TypeError) {
      console.error('Network error:', error.message);
      throw new Error('Network connection failed');
    }

    // API errors
    if (error.status) {
      switch (error.status) {
        case 400:
          console.error('Invalid request:', error.message);
          throw new Error('Invalid request parameters');
        case 401:
          console.error('Authentication failed');
          throw new Error('Invalid API key');
        case 403:
          console.error('Permission denied');
          throw new Error('API key lacks required permissions');
        case 429:
          const retryAfter = error.headers?.['retry-after'] || 60;
          console.error(`Rate limited. Retry after ${retryAfter}s`);
          throw new Error(`Rate limit exceeded. Retry after ${retryAfter} seconds`);
        case 500:
        case 502:
        case 503:
          console.error('Server error:', error.status);
          throw new Error('Service temporarily unavailable');
        default:
          console.error('API error:', error.status, error.message);
          throw new Error(`API error: ${error.message}`);
      }
    }

    // Unknown errors
    console.error('Unknown error:', error);
    throw error;
  }
}
```

### Retry Logic

Implement exponential backoff for retries:

```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;

      const delay = baseDelay * Math.pow(2, attempt);
      const retryAfter = error.headers?.['retry-after'];
      const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : delay;

      console.log(`Retry attempt ${attempt + 1} after ${waitTime}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }
  throw new Error('Max retries exceeded');
}
```

---

## Streaming Responses

### Best Practices for Streaming

1. **Process chunks incrementally**: Don't wait for the full response
2. **Handle errors mid-stream**: Errors can occur after a 200 response
3. **Clean up resources**: Close streams properly
4. **Handle partial content**: Some chunks may be empty

```typescript
async function streamWithErrorHandling(stream: AsyncIterable<any>) {
  try {
    for await (const chunk of stream) {
      // Process chunk
      if (chunk.error) {
        console.error('Stream error:', chunk.error);
        break;
      }

      // Extract content
      const content = extractContent(chunk);
      if (content) {
        process.stdout.write(content);
      }
    }
  } catch (error) {
    console.error('Stream processing error:', error);
  } finally {
    // Cleanup
  }
}
```

---

## Rate Limits

### Handling Rate Limits

All providers implement rate limits. Best practices:

1. **Respect `retry-after` headers**: Wait the specified time
2. **Implement request queuing**: Queue requests when approaching limits
3. **Monitor usage**: Track requests per minute/token usage
4. **Use exponential backoff**: Gradually increase wait times

```typescript
class RateLimiter {
  private requests: number[] = [];
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    this.requests = this.requests.filter((time) => now - time < this.windowMs);

    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = this.windowMs - (now - oldestRequest);
      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    this.requests.push(Date.now());
  }
}
```

---

## Best Practices

### 1. Always Validate Responses

```typescript
function validateResponse(response: any): boolean {
  // Check for required fields
  if (!response.choices || !response.choices[0]) {
    return false;
  }

  // Check finish_reason
  const finishReason = response.choices[0].finish_reason;
  if (finishReason === 'length') {
    console.warn('Response was truncated');
  }

  // Check for content
  if (!response.choices[0].message?.content) {
    return false;
  }

  return true;
}
```

### 2. Implement Timeout Handling

```typescript
async function requestWithTimeout<T>(promise: Promise<T>, timeoutMs: number = 30000): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Request timeout')), timeoutMs);
  });

  return Promise.race([promise, timeout]);
}
```

### 3. Log Token Usage

```typescript
function logTokenUsage(response: any, model: string) {
  const usage = response.usage;
  if (usage) {
    console.log({
      model,
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      cost: calculateCost(model, usage),
    });
  }
}
```

### 4. Handle Partial Responses

```typescript
function handlePartialResponse(response: any): string {
  const content = response.choices[0]?.message?.content || '';
  const finishReason = response.choices[0]?.finish_reason;

  if (finishReason === 'length') {
    return content + '\n\n[Response truncated due to token limit]';
  }

  return content;
}
```

### 5. Use Structured Outputs When Possible

```typescript
// OpenAI JSON mode
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Extract user info' }],
  response_format: { type: 'json_object' },
});

// Claude structured outputs
const response = await anthropic.messages.create({
  model: 'claude-3-opus-20240229',
  messages: [{ role: 'user', content: 'Extract user info' }],
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: 'user_info',
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
        },
      },
    },
  },
});
```

---

## Integration with AGI Workforce

The AGI Workforce platform automatically handles:

1. **Automatic fallback**: When credits are exhausted, automatically switches to cheaper models
2. **Error handling**: Comprehensive error handling with retries
3. **Rate limiting**: Built-in rate limit management
4. **Token tracking**: Automatic credit deduction based on usage
5. **Streaming support**: Full streaming support for all providers

### Example Usage

```typescript
// The platform handles all complexity
const response = await fetch('/api/llm/completion', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'gpt-5.2',
    messages: [{ role: 'user', content: 'Hello!' }],
  }),
});

// Response includes fallback info if model was switched
const data = await response.json();
if (data.fallback) {
  console.log(`Switched from ${data.fallback.original_model} to ${data.model}`);
}
```

---

## Additional Resources

- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Anthropic Claude API Documentation](https://docs.anthropic.com/claude/reference)
- [Google Gemini API Documentation](https://ai.google.dev/docs)
- [xAI Grok API Documentation](https://docs.x.ai)

---

_Last updated: Based on Context7 documentation as of 2025_
