# How to Get LLM APIs Cheap: Complete Cost Optimization Guide

## 🎯 Quick Wins (Immediate Savings)

### 1. Use Cheapest Models for Appropriate Tasks

**Ultra-Budget Models (<$1 per 1M tokens):**

- **LLaMA 4 Maverick**: $0.00 (free, local) - Best for unlimited use
- **Gemini 3 Flash**: $0.375/1M - Best for high-volume chat
- **GPT-5 Nano**: $0.45/1M - Best for fast responses
- **DeepSeek Chat/V3**: $0.42/1M - Best for coding tasks
- **Gemini 2.0 Flash**: $0.50/1M - Best for multimodal

**When to Use:**

- Simple Q&A, classification, summarization
- High-volume applications
- Prototyping and testing
- Non-critical tasks

**Savings:** 90-95% cost reduction vs premium models

---

### 2. Enable Prompt Caching (Already Implemented! ✅)

Your application **automatically enables** prompt caching for:

- Large system prompts (>1,000 tokens)
- RAG queries with documents
- Claude and GPT models

**How It Works:**

```
First Request:
  - System prompt: 10,000 tokens @ $5/MTok = $50.00
  - Cache write: 10,000 × 0.25 = $2.50
  - Total: $52.50

Subsequent Requests:
  - Cached prompt: 10,000 tokens @ $0.50/MTok = $5.00
  - User message: 100 tokens @ $5/MTok = $0.50
  - Total: $5.50
  - Savings: 90% per request!
```

**Real-World Example:**

```
RAG Application (10,000 token knowledge base):
  Without caching: 30 requests × $50 = $1,500/month
  With caching: $52.50 + (29 × $5.50) = $212/month
  Monthly savings: $1,288 (86% reduction)
```

**Already Active:** Your app auto-enables this - no action needed!

---

### 3. Optimize Prompts to Reduce Tokens

**Token Reduction Strategies:**

1. **Remove Redundancy**

   ```diff
   - "Please analyze the following document carefully and provide a detailed analysis..."
   + "Analyze: [document]"
   ```

2. **Use Shorter System Prompts**

   ```diff
   - "You are an expert AI assistant with extensive knowledge in..."
   + "Expert assistant. Analyze and respond concisely."
   ```

3. **Compress Context**
   - Use summaries instead of full documents
   - Extract only relevant sections
   - Use embeddings for semantic search

4. **Limit Output Tokens**
   ```typescript
   max_tokens: 500, // Instead of default 4096
   ```

**Savings:** 30-50% token reduction = 30-50% cost reduction

---

## 💰 Advanced Cost Optimization

### 4. Smart Model Routing

**Use Right Model for Right Task:**

| Task Type         | Recommended Model | Cost/1M     | Quality   |
| ----------------- | ----------------- | ----------- | --------- |
| Simple Q&A        | GPT-5 Nano        | $0.45       | Good      |
| Chat/Conversation | Gemini 3 Flash    | $0.375      | Good      |
| Coding            | DeepSeek Chat/V3  | $0.42       | Good      |
| Complex Reasoning | Claude Sonnet 4.5 | $18.00      | Excellent |
| Premium Chat      | Gemini 3 Pro      | $6.25-$7.50 | Excellent |

**Your Auto Router Already Does This!** ✅

The application's Auto routing strategy:

- Uses cheapest suitable model for task
- Prioritizes ManagedCloud for cost optimization
- Routes simple tasks to budget models
- Only uses premium models when needed

---

### 5. Batch Processing

**Combine Multiple Requests:**

Instead of:

```typescript
// 10 separate requests = 10 API calls
for (const item of items) {
  await llm.generate(item);
}
```

Do:

```typescript
// 1 batch request = 1 API call
const batch = items.map((item) => `Process: ${item}`).join('\n\n');
await llm.generate(batch);
```

**Savings:** 50-80% reduction in API calls

---

### 6. Response Caching

**Cache Similar Queries:**

```typescript
// Cache responses for identical or similar prompts
const cacheKey = hash(prompt);
if (cache.has(cacheKey)) {
  return cache.get(cacheKey);
}
```

**Your App Has This!** ✅ Check `cache_manager.rs`

**Savings:** 100% on repeated queries

---

### 7. Use Free Tiers & Credits

**Free Tier Options:**

1. **Google AI Studio (Gemini)**
   - 1M tokens/minute free
   - Gemini 2.5 Flash: Free tier available
   - Best for: Development and testing

2. **OpenAI**
   - $5 free credits for new users
   - Best for: Initial testing

3. **Anthropic**
   - Free tier for Claude Haiku
   - Best for: Simple tasks

4. **Local Models (Ollama)**
   - LLaMA 4 Maverick: Completely free
   - Unlimited usage
   - Best for: High-volume, privacy-sensitive

**Savings:** 100% on free tier usage

---

## 🏢 Enterprise Strategies

### 8. Volume Discounts & Negotiated Pricing

**Contact Providers for:**

- High-volume discounts (100M+ tokens/month)
- Enterprise agreements
- Custom pricing tiers
- Reserved capacity discounts

**Expected Savings:** 20-40% on high volume

**How to Qualify:**

- Monthly usage > 10M tokens
- Annual commitment
- Enterprise features needed

---

### 9. Use Open-Source Models

**Self-Hosted Options:**

1. **LLaMA 4 Maverick** (Already in your app!)
   - Cost: $0.00
   - Context: 10M tokens
   - Best for: Unlimited local use

2. **Ollama** (Local deployment)
   - Cost: Infrastructure only
   - Models: LLaMA, Mistral, Qwen
   - Best for: Privacy-sensitive, high-volume

**Infrastructure Costs:**

- Cloud GPU: ~$0.50-$2.00/hour
- Break-even: ~10M tokens/month
- Best for: >50M tokens/month

**Savings:** 100% on API costs (infrastructure only)

---

### 10. Smart Context Management

**Reduce Context Window Usage:**

1. **Truncate Long Contexts**

   ```typescript
   const maxContext = 8000; // Instead of 128K
   const truncated = context.slice(0, maxContext);
   ```

2. **Use Summaries**
   - Summarize old messages in conversations
   - Extract key points from documents
   - Use embeddings for retrieval

3. **Streaming Responses**
   - Stop generation when sufficient
   - Use `max_tokens` limits
   - Early stopping on completion

**Savings:** 20-60% on context costs

---

## 📊 Cost Comparison Examples

### Example 1: High-Volume Chat Application

**Scenario:** 1M messages/month, average 500 tokens each

| Strategy     | Model           | Cost/Month | Savings  |
| ------------ | --------------- | ---------- | -------- |
| Premium      | GPT-5.2 Pro     | $20,000    | Baseline |
| Balanced     | GPT-5.2         | $6,250     | 69%      |
| Budget       | GPT-5 Nano      | $225       | 99%      |
| Ultra-Budget | Gemini 3 Flash  | $187.50    | 99%      |
| Free         | LLaMA 4 (local) | $0         | 100%     |

**Best Choice:** Gemini 3 Flash or LLaMA 4 for local

---

### Example 2: RAG Application with Documents

**Scenario:** 10,000 token knowledge base, 100 queries/month

| Strategy            | Cost/Month | Savings  |
| ------------------- | ---------- | -------- |
| No caching          | $5,000     | Baseline |
| With prompt caching | $550       | 89%      |
| + Budget model      | $55        | 99%      |
| + Local model       | $0         | 100%     |

**Best Choice:** Prompt caching + budget model

---

### Example 3: Coding Assistant

**Scenario:** 50,000 code generations/month

| Strategy | Model             | Cost/Month | Savings  |
| -------- | ----------------- | ---------- | -------- |
| Premium  | GPT-5.2 Codex     | $1,600     | Baseline |
| Balanced | Claude Sonnet 4.5 | $900       | 44%      |
| Budget   | DeepSeek Chat/V3  | $21.00     | 96-98%   |
| Free     | LLaMA 4 (local)   | $0         | 100%     |

**Best Choice:** DeepSeek Chat/V3 or LLaMA 4

---

## 🎯 Implementation Checklist

### Immediate Actions (Do Today)

- [x] **Prompt caching** - Already enabled automatically
- [x] **Auto routing** - Already uses cheapest suitable models
- [ ] **Review model selection** - Use budget models for simple tasks
- [ ] **Enable response caching** - Use existing cache_manager
- [ ] **Set max_tokens limits** - Prevent over-generation

### Short-Term (This Week)

- [ ] **Optimize prompts** - Reduce token count by 30-50%
- [ ] **Implement batch processing** - Combine similar requests
- [ ] **Set up usage monitoring** - Track costs per model
- [ ] **Test local models** - Evaluate LLaMA 4 for high-volume

### Long-Term (This Month)

- [ ] **Negotiate volume discounts** - Contact providers
- [ ] **Set up local infrastructure** - For >50M tokens/month
- [ ] **Implement smart context management** - Reduce context usage
- [ ] **Create cost alerts** - Monitor and optimize continuously

---

## 📈 Expected Savings

### Conservative Estimates

| Optimization       | Monthly Savings | Annual Savings        |
| ------------------ | --------------- | --------------------- |
| Use budget models  | 70-90%          | $84,000-$108,000      |
| Prompt caching     | 50-90%          | $60,000-$108,000      |
| Token optimization | 30-50%          | $36,000-$60,000       |
| Response caching   | 20-40%          | $24,000-$48,000       |
| **Combined**       | **85-97%**      | **$102,000-$116,400** |

_Based on $10,000/month baseline usage_

---

## 🔧 Your App's Built-In Optimizations

### Already Implemented ✅

1. **Auto Prompt Caching**
   - Automatically enabled for large prompts
   - 90% savings on cached tokens
   - No configuration needed

2. **Smart Model Routing**
   - Auto selects cheapest suitable model
   - Prioritizes ManagedCloud
   - Removes local models from cloud routing

3. **Response Caching**
   - Cache manager for repeated queries
   - Cost tracking and savings calculation
   - Automatic cache invalidation

4. **Cost Calculator**
   - Real-time cost estimation
   - Per-model pricing
   - Usage tracking

---

## 💡 Pro Tips

1. **Monitor First, Optimize Second**
   - Track costs per model/task
   - Identify expensive operations
   - Optimize highest-cost items first

2. **Test Before Scaling**
   - Try budget models on test data
   - Compare quality vs cost
   - Gradually migrate high-volume tasks

3. **Combine Strategies**
   - Use prompt caching + budget models
   - Implement response caching + token optimization
   - Layer multiple optimizations

4. **Set Budget Alerts**
   - Monitor daily/weekly costs
   - Alert on unusual spikes
   - Auto-switch to cheaper models if over budget

5. **Use ManagedCloud**
   - Your app's ManagedCloud provides:
     - Unified pricing
     - Automatic optimization
     - Cost tracking
     - Best model selection

---

## 📚 Resources

- **Cost Calculator**: `apps/web/lib/services/llm-cost-calculator.ts`
- **Prompt Cache Helper**: `apps/web/lib/prompt-cache-helper.ts`
- **Cache Manager**: `apps/desktop/src-tauri/src/core/router/cache_manager.rs`
- **Model Pricing**: `docs/LLM_BENCHMARK_RANKINGS.md`

---

## 🎓 Summary

**Quick Wins:**

1. Use cheapest models for simple tasks → 90% savings
2. Prompt caching (already enabled) → 90% on cached tokens
3. Optimize prompts → 30-50% token reduction

**Advanced:** 4. Batch processing → 50-80% fewer API calls 5. Response caching → 100% on repeats 6. Local models → 100% on high-volume

**Enterprise:** 7. Volume discounts → 20-40% savings 8. Negotiated pricing → Custom rates 9. Self-hosting → 100% on >50M tokens/month

**Combined Savings:** Up to 97% cost reduction! 🎉

_Last Updated: December 30, 2025_
