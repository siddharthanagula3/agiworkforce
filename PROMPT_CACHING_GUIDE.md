# Prompt Caching Implementation Guide

## Overview

Prompt caching is now implemented for Claude (Anthropic) and OpenAI models. This feature caches large system prompts and context, reducing token costs by **90%** on cached tokens after the first request.

## What Was Changed

### 1. Core Interface Updates (`apps/web/lib/llm-providers/base.ts`)

- Added `usePromptCache?: boolean` to `LLMProviderRequest`
- Added `cacheCreationInputTokens?: number` to `LLMProviderResponse`
- Added `cachedInputTokens?: number` to `LLMProviderResponse`

### 2. Anthropic Provider (`apps/web/lib/llm-providers/anthropic.ts`)

- System messages are now sent as content blocks with `cache_control: { type: 'ephemeral' }`
- Last user message includes `cache_control` when caching is enabled
- Response parsing extracts `cache_creation_input_tokens` and `cache_read_input_tokens`

### 3. OpenAI Provider (`apps/web/lib/llm-providers/openai.ts`)

- Last user message includes `cache_control: { type: 'ephemeral' }` when caching is enabled
- Response parsing extracts cache metrics

## How to Use Prompt Caching

### Enable Caching in Requests

When making LLM requests, set `usePromptCache: true`:

```typescript
const response = await anthropicProvider.sendRequest({
  model: 'claude-opus-4-5',
  messages: [
    {
      role: 'system',
      content: `You are an AI assistant. Follow these 10,000 token instructions...`,
    },
    {
      role: 'user',
      content: 'User question here',
    },
  ],
  usePromptCache: true, // ← Enable prompt caching
});
```

### Monitor Cache Performance

The response now includes cache metrics:

```typescript
console.log('Regular tokens:', response.promptTokens);
console.log('Cached tokens:', response.cachedInputTokens);
console.log('Cache write cost:', response.cacheCreationInputTokens);
```

### Cost Calculation

**First request (cache miss):**

- System prompt: 10,000 tokens @ $5/MTok = $50.00
- Cache write cost: 10,000 × 0.25 = $2.50 extra
- Total: $52.50

**Subsequent requests (cache hit):**

- System prompt: 10,000 cached tokens @ $0.50/MTok = $5.00
- User message: 100 tokens @ $5/MTok = $0.50
- Total: $5.50
- **Savings: 90%**

## Real-World Scenarios

### Scenario 1: RAG with Large Document Context

```typescript
// First request - document is cached
const firstResponse = await llmProvider.sendRequest({
  messages: [
    { role: 'system', content: `Context: ${largeDocument}` },
    { role: 'user', content: 'Question about document' },
  ],
  usePromptCache: true,
});
// Cost: Document tokens + 10% cache write cost

// Second request - document comes from cache
const secondResponse = await llmProvider.sendRequest({
  messages: [
    { role: 'system', content: `Context: ${largeDocument}` },
    { role: 'user', content: 'Different question' },
  ],
  usePromptCache: true,
});
// Cost: Only 10% of document tokens + new question tokens
// Total savings: 90%
```

### Scenario 2: System Prompt Caching for Agents

```typescript
const agentSystem = `You are an AI agent with extensive system instructions...`; // 5,000 tokens

// First user interaction
const response1 = await llmProvider.sendRequest({
  messages: [
    { role: 'system', content: agentSystem },
    { role: 'user', content: 'Task 1' },
  ],
  usePromptCache: true,
});
// Cost: ~$25 (system prompt + cache overhead)

// Second user interaction (same system prompt)
const response2 = await llmProvider.sendRequest({
  messages: [
    { role: 'system', content: agentSystem },
    { role: 'user', content: 'Task 2' },
  ],
  usePromptCache: true,
});
// Cost: ~$2.50 (only 10% of cached system prompt)
// Total savings from first request: ~$22.50
```

### Scenario 3: Multi-turn Conversations

```typescript
// Turn 1: Full context
const response1 = await llmProvider.sendRequest({
  messages: [
    { role: 'system', content: largeSystemPrompt },
    { role: 'user', content: 'Initial question' },
  ],
  usePromptCache: true,
});

// Turn 2: System prompt cached
const response2 = await llmProvider.sendRequest({
  messages: [
    { role: 'system', content: largeSystemPrompt },
    { role: 'user', content: 'Follow-up question' },
  ],
  usePromptCache: true,
});

// Turn 3: System prompt still cached
const response3 = await llmProvider.sendRequest({
  messages: [
    { role: 'system', content: largeSystemPrompt },
    { role: 'user', content: 'Another follow-up' },
  ],
  usePromptCache: true,
});
```

## Token Savings Estimation

For a typical Pro user with daily usage:

| Usage Pattern | Requests/Month | Avg Cache Hit Rate | Savings |
| ------------- | -------------- | ------------------ | ------- |
| Simple chat   | 100            | 0%                 | $0      |
| Document Q&A  | 500            | 80%                | $15-20  |
| Agent tasks   | 1000           | 90%                | $40-60  |
| RAG system    | 2000           | 95%                | $80-120 |

## Best Practices

1. **Enable for long system prompts** (>1,000 tokens)
   - Large system instructions
   - Detailed role definitions
   - Complex context

2. **Enable for repeated requests**
   - Same user asking multiple questions
   - Batch processing with same context
   - Agent loops with fixed instructions

3. **Disable for unique requests**
   - One-off queries with different contexts
   - Cache misses don't save tokens

4. **Monitor cache effectiveness**
   - Track `cachedInputTokens` in responses
   - Calculate actual savings
   - Adjust based on usage patterns

## Implementation Checklist

- [x] Base interface updated with cache control
- [x] Anthropic provider implements cache_control
- [x] OpenAI provider implements cache_control
- [x] Response parsing extracts cache metrics
- [x] TypeScript compilation succeeds
- [ ] Update UI to show cache metrics
- [ ] Add cache analytics dashboard
- [ ] Train team on using prompt caching

## Next Steps

1. **UI Integration**: Display cache metrics in chat UI
2. **Analytics Dashboard**: Show cache hit rates per provider/model
3. **Auto-enable for RAG**: Automatically enable for document Q&A
4. **Cache Warmup**: Pre-cache common system prompts
5. **Cost Tracking**: Break out cache savings in billing

## Migration Guide

For existing code, add `usePromptCache: true` to requests:

```typescript
// Before
const response = await llmProvider.sendRequest(request);

// After
const response = await llmProvider.sendRequest({
  ...request,
  usePromptCache: true, // Enable prompt caching
});
```

## Troubleshooting

### Cache not being used

- Ensure `usePromptCache: true` is set
- System prompt must be >1,000 tokens for write cost to be worthwhile
- Some API errors disable caching for that request

### High cache write costs

- Occurs on first request with new system prompt
- Subsequent requests save 90% on cached tokens
- Only enable for requests that will be repeated

### Cache invalidation

- Ephemeral cache lasts 5 minutes
- Create new cache if system prompt changes
- Different models maintain separate caches

## References

- [Anthropic Prompt Caching Docs](https://docs.anthropic.com/docs/build-a-chatbot/prompt-caching)
- [OpenAI Cache Control Docs](https://platform.openai.com/docs/guides/prompt-caching)
