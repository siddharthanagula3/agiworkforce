# Current Models in AGI Workforce Application

This document lists all AI models currently configured and available in your AGI Workforce application as of January 2026.

---

## 📊 Quick Summary

**Total Models Configured:** 30+ models across 9 providers

**Providers Configured:**

- ✅ OpenAI (9 models)
- ✅ Anthropic (3 models)
- ✅ Google (3 models)
- ✅ xAI (4 models)
- ✅ DeepSeek (1 model)
- ✅ Qwen (1 model)
- ✅ Moonshot (1 model)
- ✅ Ollama (Local models - auto-detected)
- ⚠️ Mistral (1 model - Coming Soon, API key required)

---

## 🤖 LLM Models by Provider

### OpenAI Models (9 models)

| Model ID              | Display Name        | Cost/1M | Context | Best For           | Status    |
| --------------------- | ------------------- | ------- | ------- | ------------------ | --------- |
| `gpt-5-nano`          | GPT-5 Nano ⚡       | $0.45   | 400K    | Ultra Fast & Cheap | ✅ Active |
| `gpt-5.2`             | GPT-5.2 ⭐          | $12.50  | 128K    | Flagship           | ✅ Active |
| `gpt-5.2-pro`         | GPT-5.2 Pro 🧠      | $20.00  | 128K    | High Performance   | ✅ Active |
| `gpt-5.2-chat-latest` | GPT-5.2 Chat        | $16.00  | 128K    | Efficient          | ✅ Active |
| `gpt-5.2-codex`       | GPT-5.2 Codex       | $32.00  | 256K    | Agentic Coding     | ✅ Active |
| `gpt-5.1`             | GPT-5.1             | $22.00  | 128K    | Balanced           | ✅ Active |
| `gpt-5.1-chat-latest` | GPT-5.1 Instant     | $16.00  | 128K    | Quick Responses    | ✅ Active |
| `gpt-5.1-thinking`    | GPT-5.1 Thinking 🧠 | $28.00  | 128K    | Deep Reasoning     | ✅ Active |
| `gpt-5.1-codex-max`   | GPT-5.1-Codex-Max   | $32.00  | 256K    | Extended Context   | ✅ Active |

**Key Benchmarks (December 2025):**

- GPT-5.2: 76.3% SWE-bench, 88.1% GPQA, 100% AIME, 187 tok/s (fastest)
- GPT-5.2 Codex: 89% Pass@1, 97% HumanEval
- GPT-5.1 Codex Max: 77.9% SWE-bench

---

### Anthropic Models (3 models)

| Model ID            | Display Name         | Cost/1M | Context | Best For                      | Status    |
| ------------------- | -------------------- | ------- | ------- | ----------------------------- | --------- |
| `claude-haiku-4-5`  | Claude Haiku 4.5 ⚡  | $6.00   | 200K    | Fast & Cost Effective         | ✅ Active |
| `claude-sonnet-4-5` | Claude Sonnet 4.5 ⭐ | $18.00  | 200K    | Best Coding (77.2% SWE-bench) | ✅ Active |
| `claude-opus-4-5`   | Claude Opus 4.5 🧠   | $30.00  | 200K    | Deep Reasoning/Thinking       | ✅ Active |

**Key Benchmarks (December 2025):**

- Claude Opus 4.5: 80.9% SWE-bench (highest coding), 47.6% real-world jobs (highest)
- Claude Sonnet 4.5: 77.2% SWE-bench (excellent coding)

---

### Google Models (3 models)

| Model ID              | Display Name           | Cost/1M | Context | Best For                        | Status    |
| --------------------- | ---------------------- | ------- | ------- | ------------------------------- | --------- |
| `gemini-3-flash`      | Gemini 3 Flash ⚡      | $0.375  | 2M      | Ultra Fast & Cheap (Best Value) | ✅ Active |
| `gemini-3-pro`        | Gemini 3 Pro ⭐        | $7.50   | 2M      | Top Benchmarks                  | ✅ Active |
| `gemini-3-deep-think` | Gemini 3 Deep Think 🧠 | $10.00  | 2M      | Advanced Reasoning              | ✅ Active |

**Key Benchmarks (December 2025):**

- Gemini 3 Pro: 1501 Elo (best chat), 91.9% GPQA (best reasoning), 100% AIME (perfect math), 76.2% SWE-bench
- Gemini 3 Flash: 1240 Elo, 3,307 Elo/$ (best value)

---

### xAI (Grok) Models (4 models)

| Model ID                  | Display Name     | Cost/1M | Context | Best For                 | Status    |
| ------------------------- | ---------------- | ------- | ------- | ------------------------ | --------- |
| `grok-3-mini`             | Grok 3 Mini ⚡   | $0.80   | 131K    | Fast & Affordable        | ✅ Active |
| `grok-4.1-fast-reasoning` | Grok 4.1 Fast 🧠 | $0.50   | 2M      | Reasoning, 2M Context    | ✅ Active |
| `grok-4.1-fast`           | Grok 4.1 Fast ⚡ | $0.50   | 2M      | Tool-calling, 2M Context | ✅ Active |
| `grok-4.1`                | Grok 4.1 ⭐      | $22.00  | 128K    | Enhanced Reasoning       | ✅ Active |

**Key Benchmarks (December 2025):**

- Grok 4.1: 1483 Elo (second highest), 75% SWE-bench, 87.5% GPQA

---

### DeepSeek Models (1 model)

| Model ID      | Display Name     | Cost/1M | Context | Best For    | Status    |
| ------------- | ---------------- | ------- | ------- | ----------- | --------- |
| `deepseek-v3` | DeepSeek V3.2 ⚡ | $0.28   | 128K    | Ultra Cheap | ✅ Active |

**Key Benchmarks (December 2025):**

- DeepSeek V3.2: 73.1% SWE-bench, 87.5% AIME, $0.28/1M (94% cheaper than competitors)

---

### Qwen Models (1 model)

| Model ID    | Display Name    | Cost/1M | Context | Best For      | Status    |
| ----------- | --------------- | ------- | ------- | ------------- | --------- |
| `qwen3-max` | Qwen3-Max ⭐ 🧠 | $12.50  | 128K    | Thinking Mode | ✅ Active |

**Key Benchmarks:**

- Qwen3-Max: 81.3% MMLU, 82.3% C-Eval (excellent Chinese language)

---

### Moonshot Models (1 model)

| Model ID           | Display Name           | Cost/1M | Context | Best For           | Status    |
| ------------------ | ---------------------- | ------- | ------- | ------------------ | --------- |
| `kimi-k2-thinking` | Kimi K2 Thinking ⭐ 🧠 | $7.50   | 256K    | Advanced Reasoning | ✅ Active |

**Key Benchmarks (December 2025):**

- Kimi K2 Thinking: 99.1% AIME (near-perfect math), 84.5% GPQA, 66.1% Tau2-Bench, 76.5% ACEBench (excellent agentic)

---

### Ollama (Local Models)

| Model ID          | Display Name        | Cost/1M | Context | Best For       | Status                    |
| ----------------- | ------------------- | ------- | ------- | -------------- | ------------------------- |
| `llama4-maverick` | Llama 4 Maverick ⭐ | $0.00   | 1M      | Local, Privacy | ✅ Active (Auto-detected) |

**Note:** Application auto-detects all Ollama models installed locally. Default is Llama 4 Maverick.

---

### Mistral Models (1 model - Coming Soon)

| Model ID         | Display Name        | Cost/1M | Context | Best For    | Status              |
| ---------------- | ------------------- | ------- | ------- | ----------- | ------------------- |
| `devstral-small` | Devstral Small 2 ⚡ | $0.40   | 128K    | Fast Coding | ⚠️ API Key Required |

**Note:** Requires `MISTRAL_API_KEY` to be configured in Vercel environment variables.

---

## 🎨 Image Generation Models

Your application supports the following image generation providers:

| Provider         | Model               | Cost/Image   | Best For                                        | Status              |
| ---------------- | ------------------- | ------------ | ----------------------------------------------- | ------------------- |
| **Google**       | Imagen 3.1 Pro      | ~$0.025      | Photoreal + design quality, best default        | ✅ Active           |
| **Google**       | Imagen 3.1 Nano     | ~$0.0035     | Fast lightweight for drafts & UI mocks          | ✅ Active           |
| **OpenAI**       | DALL-E 3            | ~$0.040      | Strong compositional control and text rendering | ✅ Active           |
| **Stability AI** | Stable Diffusion XL | ~$0.010      | Local/cheap SDXL with style presets             | ✅ Active           |
| **Midjourney**   | Midjourney          | Subscription | Creative, artistic styles                       | ✅ Active (via API) |

**Implementation:** `apps/desktop/src-tauri/src/integrations/api_integrations/image_gen.rs`

---

## 🎬 Video Generation Models

| Provider   | Model   | Cost        | Best For            | Status    |
| ---------- | ------- | ----------- | ------------------- | --------- |
| **Google** | Veo 3.1 | Usage-based | 4K video generation | ✅ Active |

**Implementation:** Referenced in `apps/desktop/src-tauri/src/sys/prompt_enhancement/api_router.rs`

---

## 📋 Default Models by Plan Tier

### Free Plan

- **Ollama:** `llama4-maverick` (local only)

### Hobby Plan ($10/month)

- **OpenAI:** `gpt-5-nano` ($0.45/1M)
- **Anthropic:** `claude-haiku-4-5` ($6.00/1M)
- **Google:** `gemini-3-flash` ($0.375/1M) - Best value 🏆
- **xAI:** `grok-4.1-fast-reasoning` ($0.50/1M)
- **DeepSeek:** `deepseek-v3` ($0.28/1M)
- **Ollama:** `llama4-maverick` (auto-detected)

### Pro Plan ($29.99/month)

- **OpenAI:** `gpt-5.2` ($12.50/1M) - Fast inference
- **Anthropic:** `claude-sonnet-4-5` ($18.00/1M) - Best coding 🏆
- **Google:** `gemini-3-pro` ($7.50/1M) - Best chat quality 🏆
- **xAI:** `grok-4.1-fast-reasoning` ($0.50/1M)
- **DeepSeek:** `deepseek-v3` ($0.28/1M)
- **Qwen:** `qwen3-max` ($12.50/1M)
- **Moonshot:** `kimi-k2-thinking` ($7.50/1M)
- **Ollama:** `llama4-maverick` (auto-detected)

### Max Plan ($299.99/month)

- **OpenAI:** `gpt-5.2` ($12.50/1M) - Fastest premium
- **Anthropic:** `claude-opus-4-5` ($30.00/1M) - Best coding & reasoning
- **Google:** `gemini-3-pro` ($7.50/1M) - Best overall
- **xAI:** `grok-4.1` ($22.00/1M)
- Plus all Pro plan models

### Enterprise Plan (Custom)

- **OpenAI:** `gpt-5.2-pro` ($20.00/1M) - Best all-around
- **Anthropic:** `claude-opus-4-5` ($30.00/1M) - Best coding
- **Google:** `gemini-3-pro` ($7.50/1M) - Best chat
- All models available with custom limits

---

## 🔧 Model Capabilities Matrix

### Capabilities by Model Type

| Capability                 | Models Supporting                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Streaming**              | All models                                                                                                        |
| **Tools/Function Calling** | All models except some local                                                                                      |
| **Vision**                 | GPT-5 series, Claude 4.5 series, Gemini 3 series, Grok 4.1                                                        |
| **JSON Mode**              | All models                                                                                                        |
| **Thinking Mode**          | GPT-5.1 Thinking, Claude Opus 4.5, Gemini 3 Deep Think, Grok 4.1 Fast Reasoning, Qwen3-Max, Kimi K2 Thinking      |
| **Computer Use**           | Claude Sonnet 4.5, Claude Opus 4.5                                                                                |
| **Agentic**                | GPT-5.2, GPT-5.2 Pro, GPT-5.2 Codex, Claude Sonnet 4.5, Claude Opus 4.5, Gemini 3 Pro, Grok 4.1, Kimi K2 Thinking |
| **Search**                 | GPT-5 series, Claude Opus 4.5, Gemini 3 Pro, Grok 4.1                                                             |
| **Research**               | GPT-5.2 Pro, Claude Opus 4.5, Gemini 3 Deep Think, Grok 4.1 Fast Reasoning, Qwen3-Max, Kimi K2 Thinking           |

---

## 📊 Model Availability by Plan

| Model                     | Free | Hobby | Pro | Max | Enterprise |
| ------------------------- | ---- | ----- | --- | --- | ---------- |
| **Local Models (Ollama)** | ✅   | ✅    | ✅  | ✅  | ✅         |
| **DeepSeek V3.2**         | ❌   | ✅    | ✅  | ✅  | ✅         |
| **Gemini 3 Flash**        | ❌   | ✅    | ✅  | ✅  | ✅         |
| **GPT-5 Nano**            | ❌   | ✅    | ✅  | ✅  | ✅         |
| **Grok 3 Mini**           | ❌   | ✅    | ✅  | ✅  | ✅         |
| **Claude Haiku 4.5**      | ❌   | ✅    | ✅  | ✅  | ✅         |
| **Gemini 3 Pro**          | ❌   | ❌    | ✅  | ✅  | ✅         |
| **Kimi K2 Thinking**      | ❌   | ❌    | ✅  | ✅  | ✅         |
| **Qwen3-Max**             | ❌   | ❌    | ✅  | ✅  | ✅         |
| **Claude Sonnet 4.5**     | ❌   | ❌    | ✅  | ✅  | ✅         |
| **Grok 4.1**              | ❌   | ❌    | ✅  | ✅  | ✅         |
| **GPT-5.2**               | ❌   | ❌    | ❌  | ✅  | ✅         |
| **GPT-5.2 Pro**           | ❌   | ❌    | ❌  | ✅  | ✅         |
| **Claude Opus 4.5**       | ❌   | ❌    | ❌  | ✅  | ✅         |
| **GPT-5.2 Codex**         | ❌   | ❌    | ❌  | ✅  | ✅         |

---

## 🔑 Required API Keys

Based on your current configuration, you need these API keys in Vercel environment variables:

### Core Providers (Required)

- `OPENAI_API_KEY` - For GPT-5 models
- `ANTHROPIC_API_KEY` - For Claude 4.5 models
- `GOOGLE_API_KEY` - For Gemini 3 models

### Additional Providers (Configured)

- `DEEPSEEK_API_KEY` - For DeepSeek V3.2
- `XAI_API_KEY` - For Grok models
- `QWEN_API_KEY` + `QWEN_BASE_URL` - For Qwen3-Max (via MuleRouter)
- `MOONSHOT_API_KEY` - For Kimi K2 Thinking

### Optional (Coming Soon)

- `MISTRAL_API_KEY` - For Devstral Small 2

---

## 📁 Code Locations

### Model Configuration

- **Frontend:** `apps/desktop/src/constants/llm.ts` - Model metadata and presets
- **Backend:** `apps/desktop/src-tauri/src/sys/commands/llm.rs` - Model availability check
- **Plan Models:** `apps/desktop/src/constants/planModels.ts` - Plan-based model restrictions

### Image Generation

- **Backend:** `apps/desktop/src-tauri/src/integrations/api_integrations/image_gen.rs`
- **Frontend:** `apps/desktop/src/components/UnifiedAgenticChat/MediaLab.tsx`

### API Routing

- **Backend:** `apps/desktop/src-tauri/src/sys/prompt_enhancement/api_router.rs`

---

## 🎯 Summary

**Total Models:** 30+ LLM models + 5 image generation providers + 1 video generation provider

**Most Used Models (by plan):**

- **Hobby:** Gemini 3 Flash (best value), DeepSeek V3.2 (cheapest)
- **Pro:** Gemini 3 Pro (best chat), Claude Sonnet 4.5 (best coding)
- **Max:** GPT-5.2 (fastest premium), Claude Opus 4.5 (best coding)

**Best Value Models:**

1. **DeepSeek V3.2** - $0.28/1M (best cost efficiency)
2. **Gemini 3 Flash** - $0.375/1M (best chat value)
3. **Gemini 3 Pro** - $7.50/1M (best quality/price)

---

_Last Updated: January 2, 2026_
_Based on codebase analysis of `apps/desktop/src/constants/llm.ts` and related files_
