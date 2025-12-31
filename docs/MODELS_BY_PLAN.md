# Models by Subscription Plan

This document organizes all available LLM models by subscription plan tier, showing what models are available at each pricing level.

> **Note:** This document reflects only the LLM APIs currently configured in Vercel environment variables:
>
> - ✅ OpenAI (GPT-5 Series)
> - ✅ Anthropic (Claude 4.5 Series)
> - ✅ Google (Gemini 3 Series)
> - ✅ DeepSeek (DeepSeek Chat/V3)
> - ✅ xAI (Grok Series)
> - ✅ Moonshot (Kimi K2 Thinking)
> - ✅ Qwen (Qwen3-Max via MuleRouter)

---

## 💰 Input/Output Pricing Reference (Per 1M Tokens)

Quick reference for input/output costs. All costs are per 1 million tokens.

| Provider      | Model               | Input Cost  | Output Cost | Total (1M in + 1M out) |
| ------------- | ------------------- | ----------- | ----------- | ---------------------- |
| **OpenAI**    | GPT-5 Nano          | $0.05       | $0.40       | $0.45                  |
| **OpenAI**    | GPT-5.2             | $2.50       | $10.00      | $12.50                 |
| **OpenAI**    | GPT-5.2 Pro         | $5.00       | $15.00      | $20.00                 |
| **OpenAI**    | GPT-5.2 Codex       | $8.00       | $24.00      | $32.00                 |
| **Anthropic** | Claude Haiku 4.5    | $1.00       | $5.00       | $6.00                  |
| **Anthropic** | Claude Sonnet 4.5   | $3.00       | $15.00      | $18.00                 |
| **Anthropic** | Claude Opus 4.5     | $5.00       | $25.00      | $30.00                 |
| **Google**    | Gemini 3 Flash      | $0.075      | $0.30       | $0.375                 |
| **Google**    | Gemini 3 Pro        | $1.25-$1.50 | $5.00-$6.00 | $6.25-$7.50            |
| **Google**    | Gemini 3 Deep Think | $2.00       | $8.00       | $10.00                 |
| **DeepSeek**  | DeepSeek V3.2       | $0.14       | $0.14       | $0.28                  |
| **DeepSeek**  | DeepSeek Chat/V3    | $0.14       | $0.28       | $0.42                  |
| **xAI**       | Grok 4.1 Fast       | $0.10       | $0.40       | $0.50                  |
| **xAI**       | Grok 3 Mini         | $0.30       | $0.50       | $0.80                  |
| **xAI**       | Grok 4.1            | $5.50       | $16.50      | $22.00                 |
| **Moonshot**  | Kimi K2 Thinking    | $1.50       | $6.00       | $7.50                  |
| **Qwen**      | Qwen3-Max           | $2.50       | $10.00      | $12.50                 |
| **Ollama**    | Local Models        | $0.00       | $0.00       | $0.00                  |

**Cost Calculation:**

- **Input tokens**: Tokens in your prompt/messages
- **Output tokens**: Tokens in the model's response
- **Formula**: `(Input tokens / 1M) × Input cost + (Output tokens / 1M) × Output cost`

**Example:** GPT-5.2 with 50K input + 10K output tokens:

- Input: (50,000 / 1,000,000) × $2.50 = $0.125
- Output: (10,000 / 1,000,000) × $10.00 = $0.10
- **Total: $0.225**

---

## 📊 Plan Overview

| Plan           | Price/Month | Token Credits | Best For                         |
| -------------- | ----------- | ------------- | -------------------------------- |
| **Free**       | $0          | $0            | Local models only                |
| **Hobby**      | $10         | $1.00         | Speed-optimized, quick tasks     |
| **Pro**        | $29.99      | $12           | Balanced quality, everyday use   |
| **Max**        | $299.99     | $150          | Deep reasoning, complex analysis |
| **Enterprise** | Custom      | Unlimited     | All models, custom limits        |

---

## 🆓 Free Plan ($0/month)

**Token Credits:** $0  
**Best For:** Testing, local development, privacy-sensitive tasks

### Available Models

| Model                     | Provider | Cost/1M | Context         | Features                           |
| ------------------------- | -------- | ------- | --------------- | ---------------------------------- |
| **Local Models (Ollama)** | Ollama   | $0.00   | Varies by model | Auto-detected, free, unlimited use |

**How It Works:**

- Application automatically detects models installed in Ollama
- No manual configuration needed
- Works with any Ollama-compatible model (LLaMA, Mistral, Qwen, etc.)
- Unlimited usage (no credit consumption)

**Limitations:**

- No cloud API access
- Local models only (requires Ollama running)
- Requires local GPU/CPU resources
- 5 automations limit
- 50 API calls/month

**Use Cases:**

- Privacy-sensitive applications
- Unlimited local testing
- Offline development
- High-volume local processing
- Custom model experimentation

---

## ⚡ Hobby Plan ($10/month = $1.00 credits)

**Token Credits:** $1.00/month  
**Best For:** Speed-optimized tasks, quick responses, cost-effective development

### Available Models (Speed Tier - Ranked by Cost Efficiency)

#### Ultra-Budget Models (<$1/1M tokens)

| Rank | Model                     | Provider | Input  | Output | Total/1M     | Key Benchmarks (Dec 2025)        | Best For                           |
| ---- | ------------------------- | -------- | ------ | ------ | ------------ | -------------------------------- | ---------------------------------- |
| 1    | **DeepSeek V3.2**         | DeepSeek | $0.14  | $0.14  | **$0.28** 🏆 | 73.1% SWE-bench, 87.5% AIME 2025 | Best cost efficiency, coding, math |
| 2    | **Gemini 3 Flash**        | Google   | $0.075 | $0.30  | **$0.375**   | 1240 Elo, 3,307 Elo/$            | Best value chat, high-volume       |
| 3    | **DeepSeek Chat/V3**      | DeepSeek | $0.14  | $0.28  | **$0.42**    | 73.1% SWE-bench                  | Ultra-cheap coding                 |
| 4    | **GPT-5 Nano**            | OpenAI   | $0.05  | $0.40  | **$0.45**    | 1200 Elo, 2,667 Elo/$            | Ultra-fast responses               |
| 5    | **Grok 4.1 Fast**         | xAI      | $0.10  | $0.40  | **$0.50**    | ~1230 Elo, 2M context            | Fast, large context, tool-calling  |
| 6    | **Grok 3 Mini**           | xAI      | $0.30  | $0.50  | **$0.80**    | ~1180 Elo                        | General tasks                      |
| 7    | **Local Models (Ollama)** | Ollama   | $0.00  | $0.00  | **$0.00**    | Auto-detected                    | Unlimited local use                |

#### Budget Models ($1-$6/1M tokens)

| Model                | Provider  | Input | Output | Total/1M  | Key Benchmarks (Dec 2025) | Best For                          |
| -------------------- | --------- | ----- | ------ | --------- | ------------------------- | --------------------------------- |
| **Claude Haiku 4.5** | Anthropic | $1.00 | $5.00  | **$6.00** | 1250 Elo, 208 Elo/$       | Best quality/price in budget tier |

### Default Models by Provider

| Provider  | Default Model        | Cost/1M | Why                                           |
| --------- | -------------------- | ------- | --------------------------------------------- |
| OpenAI    | GPT-5 Nano           | $0.45   | Cheapest OpenAI model, fast responses         |
| Anthropic | Claude Haiku 4.5     | $6.00   | Best quality/price ratio (208 Elo/$)          |
| Google    | Gemini 3 Flash       | $0.375  | Best value (3,307 Elo/$ - December 2025)      |
| xAI       | Grok 4.1 Fast        | $0.50   | Fast, 2M context, tool-calling (latest Grok)  |
| DeepSeek  | DeepSeek V3.2        | $0.28   | Best cost efficiency (261%/$ - December 2025) |
| Ollama    | Auto-detected models | $0.00   | Free local (auto-detected)                    |

### Usage Examples

**With $1.00 credits/month:**

- **DeepSeek V3.2**: ~3.6M tokens/month (best value - December 2025)
- **Gemini 3 Flash**: ~2.7M tokens/month (best chat value)
- **DeepSeek Chat/V3**: ~2.4M tokens/month (ultra-cheap coding)
- **GPT-5 Nano**: ~2.2M tokens/month (fast responses)
- **Grok 4.1 Fast**: ~2.0M tokens/month (latest Grok, 2M context, tool-calling)
- **Grok 3 Mini**: ~1.25M tokens/month
- **Claude Haiku 4.5**: ~167K tokens/month (limited but best quality)
- **Local Models (Ollama)**: Unlimited (no credit usage)

**Limitations:**

- 10 automations
- 100 API calls/month
- 1GB storage
- Speed models only

---

## ⭐ Pro Plan ($29.99/month = $12 credits)

**Token Credits:** $12/month  
**Best For:** Balanced quality, everyday tasks, production applications

### Available Models

**Includes all Hobby models PLUS:**

#### Balanced Models (Ranked by Quality/Value - December 2025)

| Rank | Model                   | Provider  | Input | Output | Total/1M   | Key Benchmarks (Dec 2025)                        | Best For                           |
| ---- | ----------------------- | --------- | ----- | ------ | ---------- | ------------------------------------------------ | ---------------------------------- |
| 1    | **Gemini 3 Pro**        | Google    | $1.50 | $6.00  | **$7.50**  | 1501 Elo, 91.9% GPQA, 100% AIME, 76.2% SWE-bench | Best chat, reasoning, math         |
| 2    | **Kimi K2 Thinking**    | Moonshot  | $1.50 | $6.00  | **$7.50**  | 99.1% AIME, 84.5% GPQA, 65.8% SWE-bench          | Exceptional math, reasoning        |
| 3    | **Qwen3-Max**           | Qwen      | $2.50 | $10.00 | **$12.50** | 81.3% MMLU, 82.3% C-Eval                         | Reasoning, Chinese language        |
| 4    | **Qwen3-Coder 32B**     | Qwen      | $2.50 | $10.00 | **$12.50** | 69.6% SWE-bench, 92.1% HumanEval                 | Best open-source coding            |
| 5    | **Gemini 3 Deep Think** | Google    | $2.00 | $8.00  | **$10.00** | ~1295 Elo, ~90% GPQA                             | Advanced reasoning                 |
| 6    | **Claude Sonnet 4.5**   | Anthropic | $3.00 | $15.00 | **$18.00** | ~77.2% SWE-bench, ~1300 Elo                      | Excellent coding                   |
| 7    | **Grok 4.1 Fast**       | xAI       | $4.00 | $12.00 | **$16.00** | Fast inference, 2M context                       | Fast, large context                |
| 8    | **Grok 4.1**            | xAI       | $5.50 | $16.50 | **$22.00** | 1483 Elo, 75% SWE-bench, 87.5% GPQA              | Enhanced reasoning (limited usage) |

> **Note:** Claude Opus 4.5 ($30/1M) is available in Max plan only due to cost constraints with $12 credits.

### Default Models by Provider

| Provider  | Default Model     | Cost/1M | Why                                                                       |
| --------- | ----------------- | ------- | ------------------------------------------------------------------------- |
| OpenAI    | GPT-5 Nano        | $0.45   | Still cheapest, but can upgrade                                           |
| Anthropic | Claude Sonnet 4.5 | $18.00  | Excellent coding performance (77.2% SWE-bench)                            |
| Google    | Gemini 3 Pro      | $7.50   | Best chat quality (1501 Elo - December 2025), best reasoning (91.9% GPQA) |
| xAI       | Grok 4.1 Fast     | $16.00  | Fast with 2M context                                                      |
| DeepSeek  | DeepSeek V3.2     | $0.28   | Best cost efficiency (still available)                                    |
| Qwen      | Qwen3-Coder 32B   | $12.50  | Best open-source coding (69.6% SWE-bench)                                 |
| Moonshot  | Kimi K2 Thinking  | $7.50   | Exceptional math (99.1% AIME - December 2025)                             |

### Usage Examples

**With $12 credits/month:**

- **DeepSeek V3.2**: ~42.9M tokens/month (best value)
- **Gemini 3 Flash**: ~32M tokens/month (high volume)
- **GPT-5 Nano**: ~26.7M tokens/month (fast responses)
- **Gemini 3 Pro**: ~1.6M tokens/month (best chat quality - December 2025)
- **Kimi K2 Thinking**: ~1.6M tokens/month (exceptional math)
- **Qwen3-Coder 32B**: ~960K tokens/month (best open-source coding)
- **Claude Sonnet 4.5**: ~667K tokens/month (excellent coding)
- **Grok 4.1**: ~545K tokens/month (limited but available)

**Features:**

- Unlimited automations
- 10,000 API calls/month
- 10GB storage
- Balanced + Speed models
- Full computer use & browser automation
- Image generation & analysis
- Web search & research

---

## 🧠 Max Plan ($299.99/month = $150 credits)

**Token Credits:** $150/month  
**Best For:** Deep reasoning, complex analysis, agentic workflows, power users

### Available Models

**Includes all Pro models PLUS:**

#### Premium Models (Ranked by Performance - December 2025)

| Rank | Model                   | Provider  | Input | Output | Total/1M   | Key Benchmarks (Dec 2025)                          | Best For                      |
| ---- | ----------------------- | --------- | ----- | ------ | ---------- | -------------------------------------------------- | ----------------------------- |
| 1    | **GPT-5.2**             | OpenAI    | $2.50 | $10.00 | **$12.50** | 76.3% SWE-bench, 88.1% GPQA, 100% AIME, 187 tok/s  | Fastest premium, math, coding |
| 2    | **GPT-5.2 Pro**         | OpenAI    | $5.00 | $15.00 | **$20.00** | ~1325 Elo, 100% AIME, ~89% GPQA                    | Best all-around performance   |
| 3    | **Claude Opus 4.5**     | Anthropic | $5.00 | $25.00 | **$30.00** | 80.9% SWE-bench, 87.0% GPQA, 47.6% real-world jobs | Best coding, reasoning        |
| 4    | **GPT-5.2 Codex**       | OpenAI    | $8.00 | $24.00 | **$32.00** | 89% Pass@1, 97% HumanEval                          | Best code generation          |
| 5    | **Grok 4.1**            | xAI       | $5.50 | $16.50 | **$22.00** | 1483 Elo, 75% SWE-bench, 87.5% GPQA                | Second best chat, reasoning   |
| 6    | **Gemini 3 Deep Think** | Google    | $2.00 | $8.00  | **$10.00** | ~1295 Elo, ~90% GPQA                               | Advanced reasoning            |

> **Note:** All premium models from Pro plan are also available. Premium models listed here are Max-exclusive.

### Default Models by Provider

| Provider  | Default Model    | Cost/1M | Why                                                                                                         |
| --------- | ---------------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| OpenAI    | GPT-5.2          | $12.50  | Fastest premium (187 tok/s), perfect math (100% AIME), strong coding (76.3% SWE-bench - December 2025)      |
| Anthropic | Claude Opus 4.5  | $30.00  | Best coding (80.9% SWE-bench - December 2025), best reasoning (87.0% GPQA), highest real-world jobs (47.6%) |
| Google    | Gemini 3 Pro     | $7.50   | Best chat (1501 Elo), best reasoning (91.9% GPQA - December 2025)                                           |
| xAI       | Grok 4.1         | $22.00  | Second best chat (1483 Elo - December 2025), strong reasoning (87.5% GPQA)                                  |
| DeepSeek  | DeepSeek V3.2    | $0.28   | Best cost efficiency (still available for budget tasks)                                                     |
| Qwen      | Qwen3-Coder 32B  | $12.50  | Best open-source coding (69.6% SWE-bench)                                                                   |
| Moonshot  | Kimi K2 Thinking | $7.50   | Exceptional math (99.1% AIME - December 2025)                                                               |

### Usage Examples

**With $150 credits/month:**

- **DeepSeek V3.2**: ~535.7M tokens/month (best value)
- **Gemini 3 Flash**: ~400M tokens/month (high volume)
- **GPT-5 Nano**: ~333M tokens/month (if using budget models)
- **Gemini 3 Pro**: ~20M tokens/month (best chat quality)
- **GPT-5.2**: ~12M tokens/month (fastest premium - December 2025)
- **GPT-5.2 Pro**: ~7.5M tokens/month (best all-around)
- **Claude Opus 4.5**: ~5M tokens/month (best coding - December 2025)
- **GPT-5.2 Codex**: ~4.7M tokens/month (best code generation)

**Features:**

- All Pro features
- Deep reasoning & thinking models
- Advanced agentic coding models
- Video generation & analysis
- Priority support
- Unlimited API calls
- 50GB storage

---

## 🏢 Enterprise Plan (Custom Pricing)

**Token Credits:** Unlimited  
**Best For:** Large organizations, custom requirements, on-premise deployment

### Available Models

**All models from all tiers PLUS:**

- Custom model access
- On-premise deployment options
- Custom integrations
- Unlimited team members
- Custom SLA agreements

### Default Models by Provider

| Provider  | Default Model    | Cost/1M | Why                                                                        |
| --------- | ---------------- | ------- | -------------------------------------------------------------------------- |
| OpenAI    | GPT-5.2 Pro      | $20.00  | Best all-around (1325 Elo, 100% AIME - December 2025)                      |
| Anthropic | Claude Opus 4.5  | $30.00  | Best coding (80.9% SWE-bench), best reasoning (87.0% GPQA - December 2025) |
| Google    | Gemini 3 Pro     | $7.50   | Best chat (1501 Elo), best reasoning (91.9% GPQA - December 2025)          |
| xAI       | Grok 4.1         | $22.00  | Second best chat (1483 Elo - December 2025)                                |
| DeepSeek  | DeepSeek V3.2    | $0.28   | Best cost efficiency (73.1% SWE-bench - December 2025)                     |
| Qwen      | Qwen3-Coder 32B  | $12.50  | Best open-source coding (69.6% SWE-bench)                                  |
| Moonshot  | Kimi K2 Thinking | $7.50   | Exceptional math (99.1% AIME - December 2025)                              |

**Features:**

- Everything in Max
- Unlimited team members
- On-premise deployment
- Custom integrations
- Dedicated support
- Custom pricing
- Volume discounts

---

## 📈 Model Comparison by Plan

### Cost Efficiency by Plan (December 2025)

| Plan           | Best Model            | Cost/1M      | Tokens/Month | Key Benchmarks (Dec 2025)              | Use Case             |
| -------------- | --------------------- | ------------ | ------------ | -------------------------------------- | -------------------- |
| **Free**       | Local Models (Ollama) | $0.00        | Unlimited    | Auto-detected                          | Local development    |
| **Hobby**      | DeepSeek V3.2         | **$0.28** 🏆 | ~3.6M        | 73.1% SWE-bench, 87.5% AIME            | Best cost efficiency |
| **Hobby**      | Gemini 3 Flash        | $0.375       | ~2.7M        | 1240 Elo, 3,307 Elo/$                  | High volume chat     |
| **Pro**        | Gemini 3 Pro          | $7.50        | ~1.6M        | 1501 Elo, 91.9% GPQA, 100% AIME        | Best quality/price   |
| **Max**        | GPT-5.2               | $12.50       | ~12M         | 76.3% SWE-bench, 88.1% GPQA, 187 tok/s | Fastest premium      |
| **Enterprise** | GPT-5.2 Pro           | $20.00       | Unlimited    | 1325 Elo, 100% AIME                    | All access           |

### Quality vs Cost by Plan (December 2025)

| Plan           | Quality Tier | Best Model      | Key Metrics (Dec 2025)                 | Cost/1M      |
| -------------- | ------------ | --------------- | -------------------------------------- | ------------ |
| **Hobby**      | Good         | DeepSeek V3.2   | 73.1% SWE-bench, 87.5% AIME            | **$0.28** 🏆 |
| **Hobby**      | Good         | Gemini 3 Flash  | 1240 Elo, 3,307 Elo/$                  | $0.375       |
| **Pro**        | Excellent    | Gemini 3 Pro    | 1501 Elo, 91.9% GPQA, 100% AIME        | $7.50        |
| **Max**        | Excellent    | GPT-5.2         | 76.3% SWE-bench, 88.1% GPQA, 187 tok/s | $12.50       |
| **Max**        | Excellent    | Claude Opus 4.5 | 80.9% SWE-bench, 87.0% GPQA            | $30.00       |
| **Enterprise** | Excellent    | GPT-5.2 Pro     | 1325 Elo, 100% AIME                    | $20.00       |

---

## 🎯 Choosing the Right Plan

### Choose Hobby If:

- ✅ You need speed over quality
- ✅ High-volume simple tasks
- ✅ Budget-conscious development
- ✅ Testing and prototyping
- ✅ Simple Q&A, classification

### Choose Pro If:

- ✅ You need balanced quality/cost
- ✅ Production applications
- ✅ Coding tasks (Claude Sonnet 4.5)
- ✅ Chat applications (Gemini 3 Pro)
- ✅ Everyday AI assistance

### Choose Max If:

- ✅ You need deep reasoning
- ✅ Complex problem-solving
- ✅ Agentic workflows
- ✅ Advanced coding tasks
- ✅ Research and analysis

### Choose Enterprise If:

- ✅ Large organization
- ✅ Custom requirements
- ✅ On-premise deployment
- ✅ Unlimited usage
- ✅ Dedicated support

---

## 💡 Cost Optimization Tips by Plan

### Hobby Plan Optimization (December 2025)

1. Use **DeepSeek V3.2** for most tasks ($0.28/1M - best cost efficiency, 73.1% SWE-bench)
2. Use **Gemini 3 Flash** for chat ($0.375/1M - best value, 3,307 Elo/$)
3. Use **GPT-5 Nano** for OpenAI tasks ($0.45/1M - fast responses)
4. Use **DeepSeek Chat/V3** for coding ($0.42/1M - ultra-cheap, 73.1% SWE-bench)
5. Enable prompt caching (automatic)
6. Use local Ollama models for unlimited local tasks (auto-detected)

### Pro Plan Optimization (December 2025)

1. Use **Gemini 3 Pro** for chat (best quality/price - 1501 Elo, 91.9% GPQA, $7.50/1M)
2. Use **Kimi K2 Thinking** for math (exceptional - 99.1% AIME, $7.50/1M)
3. Use **Claude Sonnet 4.5** for coding (excellent - 77.2% SWE-bench, $18/1M)
4. Use **Qwen3-Coder 32B** for open-source coding (best - 69.6% SWE-bench, $12.50/1M)
5. Mix budget models (DeepSeek V3.2, Gemini 3 Flash) for simple tasks
6. Monitor usage to stay within credits

### Max Plan Optimization (December 2025)

1. Use **GPT-5.2** for speed-critical tasks (187 tok/s - fastest premium, 76.3% SWE-bench, $12.50/1M)
2. Use **Claude Opus 4.5** for coding (best - 80.9% SWE-bench, 87.0% GPQA, $30/1M)
3. Use **GPT-5.2 Codex** for code generation (best - 89% Pass@1, 97% HumanEval, $32/1M)
4. Use **Gemini 3 Pro** for chat (best - 1501 Elo, 91.9% GPQA, $7.50/1M)
5. Still use budget models (DeepSeek V3.2) for simple tasks
6. Leverage all premium features

---

## 📊 Model Availability Matrix (Latest Models - December 2025)

| Model                 | Free | Hobby | Pro | Max | Enterprise |
| --------------------- | ---- | ----- | --- | --- | ---------- |
| Local Models (Ollama) | ✅   | ✅    | ✅  | ✅  | ✅         |
| DeepSeek V3.2         | ❌   | ✅    | ✅  | ✅  | ✅         |
| Gemini 3 Flash        | ❌   | ✅    | ✅  | ✅  | ✅         |
| DeepSeek Chat/V3      | ❌   | ✅    | ✅  | ✅  | ✅         |
| GPT-5 Nano            | ❌   | ✅    | ✅  | ✅  | ✅         |
| Grok 3 Mini           | ❌   | ✅    | ✅  | ✅  | ✅         |
| Claude Haiku 4.5      | ❌   | ✅    | ✅  | ✅  | ✅         |
| Gemini 3 Pro          | ❌   | ❌    | ✅  | ✅  | ✅         |
| Kimi K2 Thinking      | ❌   | ❌    | ✅  | ✅  | ✅         |
| Qwen3-Max             | ❌   | ❌    | ✅  | ✅  | ✅         |
| Qwen3-Coder 32B       | ❌   | ❌    | ✅  | ✅  | ✅         |
| Gemini 3 Deep Think   | ❌   | ❌    | ✅  | ✅  | ✅         |
| Claude Sonnet 4.5     | ❌   | ❌    | ✅  | ✅  | ✅         |
| Grok 4.1 Fast         | ❌   | ❌    | ✅  | ✅  | ✅         |
| Grok 4.1              | ❌   | ❌    | ✅  | ✅  | ✅         |
| GPT-5.2               | ❌   | ❌    | ❌  | ✅  | ✅         |
| GPT-5.2 Pro           | ❌   | ❌    | ❌  | ✅  | ✅         |
| Claude Opus 4.5       | ❌   | ❌    | ❌  | ✅  | ✅         |
| GPT-5.2 Codex         | ❌   | ❌    | ❌  | ✅  | ✅         |

---

## 🔄 Plan Upgrade Path

### Free → Hobby

**Gain access to:**

- All speed-optimized cloud models
- $1.00/month in token credits
- 10 automations
- 100 API calls/month

### Hobby → Pro

**Gain access to:**

- Balanced quality models
- **Gemini 3 Pro** (best chat - 1501 Elo, best reasoning - 91.9% GPQA, December 2025)
- **Kimi K2 Thinking** (exceptional math - 99.1% AIME, December 2025)
- **Claude Sonnet 4.5** (excellent coding - 77.2% SWE-bench)
- **Qwen3-Coder 32B** (best open-source coding - 69.6% SWE-bench)
- $12/month in token credits
- Unlimited automations
- 10,000 API calls/month

### Pro → Max

**Gain access to:**

- All premium reasoning models
- **GPT-5.2** (fastest premium - 187 tok/s, 76.3% SWE-bench, 100% AIME, December 2025)
- **GPT-5.2 Pro** (best all-around - 1325 Elo, 100% AIME)
- **Claude Opus 4.5** (best coding - 80.9% SWE-bench, best reasoning - 87.0% GPQA, December 2025)
- **GPT-5.2 Codex** (best code generation - 89% Pass@1, 97% HumanEval)
- $150/month in token credits
- Unlimited API calls
- Priority support

### Max → Enterprise

**Gain access to:**

- All models
- Unlimited credits
- Custom pricing
- On-premise deployment
- Dedicated support
- Custom integrations

---

_Last Updated: January 2, 2026 - Updated with December 2025 benchmark rankings and latest models only_
