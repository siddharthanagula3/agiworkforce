# LLM API Provider Benchmark Rankings (December 2025 - January 2026)

This document ranks the latest LLM API providers based on comprehensive benchmark evaluations across multiple metrics.

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

## 🏆 Best Models by API Provider (Quick Reference)

### 1. **OpenAI** - Best Model: **GPT-5.2**

**Key Benchmarks:**

- SWE-bench: **76.3%** (December 2025)
- GPQA Diamond: **88.1%** (December 2025)
- AIME 2025: **100%** 🏆 (perfect math score - December 2025)
- Arena Elo: ~1310
- Inference Speed: **187 tok/s** 🏆 (fastest - December 2025)
- Best For: Fast inference, math, general-purpose tasks, real-time applications

**Alternative Best Models:**

- **GPT-5.2 Codex**: 89% Pass@1 (best code generation)
- **GPT-5.2**: 74.9% SWE-bench, 187 tok/s (fastest inference)

---

### 2. **Anthropic** - Best Model: **Claude Opus 4.5**

**Key Benchmarks:**

- SWE-bench Verified: **80.9%** 🏆 (highest coding performance)
- Real-World Jobs: **47.6% win rate** 🏆 (highest overall)
- Arena Elo: ~1320
- Best For: Coding tasks, software development, real-world job performance

**Alternative Best Models:**

- **Claude Sonnet 4.5**: ~77.2% SWE-bench (excellent coding, better value)

---

### 3. **Google** - Best Model: **Gemini 3 Pro**

**Key Benchmarks:**

- Arena Elo: **1501** 🏆 (first to break 1500, best chat quality - December 2025)
- GPQA Diamond: **91.9%** 🏆 (best reasoning performance - December 2025)
- AIME 2025: **100%** 🏆 (perfect math score - December 2025)
- SWE-bench Verified: **76.2%**
- MathArena Apex: **23.4%** 🏆 (breakthrough math performance)
- Context Window: 1M tokens
- Best For: Chat quality, reasoning, math, multimodal tasks, long documents

**Alternative Best Models:**

- **Gemini 3 Deep Think**: ~73% SWE-bench, ~1295 Elo (advanced reasoning)
- **Gemini 3 Flash**: ~65% SWE-bench, $0.375/1M (best value)

---

### 4. **xAI** - Best Model: **Grok 4.1**

**Key Benchmarks:**

- Arena Elo: **1483** 🥈 (second highest, closely trailing Gemini 3 Pro - December 2025)
- SWE-bench: **75%** (December 2025)
- GPQA Diamond: **87.5%** (December 2025)
- Real-World Jobs: ~38% win rate
- Best For: Real-time chat, reasoning, emotional intelligence, creative conversation

**Alternative Best Models:**

- **Grok 4.1 Fast**: ~65% SWE-bench, $0.50/1M (fast, 2M context)

---

### 5. **DeepSeek** - Best Model: **DeepSeek V3.2**

**Key Benchmarks:**

- SWE-bench Verified: **73.1%** (December 2025)
- AIME 2025: **87.5%** 🏆 (excellent math performance)
- Cost: **$0.28/1M input tokens** (94% cheaper than competitors - December 2025)
- **Near-frontier performance** at fraction of cost
- Best For: Cost-effective coding, high-volume applications, math, large-scale deployments

**Alternative Best Models:**

- **DeepSeek Chat/V3**: 73.1% SWE-bench, $0.42/1M (ultra-cheap)

---

### 6. **Qwen** - Best Model: **Qwen3-Coder 32B**

**Key Benchmarks:**

- SWE-bench Verified: **69.6%** 🏆 (best open-source coding model)
- HumanEval: **92.1%**
- MBPP: **89.4%**
- MultiPL-E: **88.7%**
- C-Eval: **82.3%** (excellent Chinese language)
- Best For: Software development, code generation, Chinese language tasks

**Alternative Best Models:**

- **Qwen3-Max**: 81.3% MMLU, 82.3% C-Eval (best general knowledge, Chinese)
- **Qwen 3 Coder**: 67% SWE-bench (good coding performance)

---

### 7. **Moonshot** - Best Model: **Kimi K2 Thinking**

**Key Benchmarks:**

- AIME 2025: **99.1%** 🏆 (exceptional math - near-perfect high school mathematics - December 2025)
- GPQA Diamond: **84.5%** (strong reasoning - December 2025)
- SWE-bench Verified: **65.8%**
- Agentic Tasks: **66.1% Tau2-Bench, 76.5% ACEBench** (outperforms GPT-5 and Claude Sonnet 4.5)
- LiveCodeBench: **53.7%** (surpasses GPT-4.1's 44.7%)
- Architecture: 1 trillion parameters (32B active per inference)
- Best For: Math, reasoning, agentic workflows, software development, Chinese language

**Alternative Best Models:**

- **Kimi K2**: Same performance as K2 Thinking (without enhanced thinking mode)

---

## 📊 Best Models Comparison Table

| Provider      | Best Model       | SWE-bench    | Arena Elo   | Best Metric             | Cost/1M      | Best For                              |
| ------------- | ---------------- | ------------ | ----------- | ----------------------- | ------------ | ------------------------------------- |
| **Google**    | Gemini 3 Pro     | 76.2%        | **1501** 🏆 | Chat Quality, Reasoning | $7.50        | Chat, reasoning, math, multimodal     |
| **Anthropic** | Claude Opus 4.5  | **80.9%** 🏆 | ~1320       | Coding                  | $30.00       | Coding, real-world jobs               |
| **OpenAI**    | GPT-5.2          | **76.3%**    | ~1310       | Speed, Math             | $12.50       | Fast inference, math, general-purpose |
| **xAI**       | Grok 4.1         | **75%**      | **1483** 🥈 | Chat Quality, Reasoning | $22.00       | Real-time chat, reasoning             |
| **DeepSeek**  | DeepSeek V3.2    | 73.1%        | ~1274       | Cost Efficiency         | **$0.28** 🏆 | Budget coding, math, large-scale      |
| **Qwen**      | Qwen3-Coder 32B  | **69.6%** 🏆 | ~1270       | Open-Source Coding      | $12.50       | Coding, Chinese                       |
| **Moonshot**  | Kimi K2 Thinking | 65.8%        | ~1245       | Math, Agentic           | $7.50        | Math, reasoning, agentic workflows    |

**Legend:**

- 🏆 = Best in category
- 🥈 = Second best in category

---

## 🏆 Top Models by Benchmark Category (December 2025)

This section ranks all models across key benchmark categories based on December 2025 results, providing a comprehensive view of top performers.

### 🧪 Top Models: Coding Performance (SWE-bench Verified)

| Rank | Model                 | Provider  | SWE-bench    | Key Highlights                             |
| ---- | --------------------- | --------- | ------------ | ------------------------------------------ |
| 1    | **Claude Opus 4.5**   | Anthropic | **80.9%** 🏆 | Highest coding performance (December 2025) |
| 2    | **GPT-5.1 Codex Max** | OpenAI    | **77.9%**    | Excellent coding (December 2025)           |
| 3    | **Claude Sonnet 4.5** | Anthropic | ~77.2%       | Strong coding performance                  |
| 4    | **GPT-5.2**           | OpenAI    | **76.3%**    | Fast inference + coding (December 2025)    |
| 5    | **Gemini 3 Pro**      | Google    | **76.2%**    | Competitive coding (December 2025)         |
| 6    | **GPT-5.2 Pro**       | OpenAI    | ~76%         | Balanced performance                       |
| 7    | **Grok 4.1**          | xAI       | **75%**      | Strong coding (December 2025)              |
| 8    | **DeepSeek V3.2**     | DeepSeek  | **73.1%**    | Cost-effective coding (December 2025)      |
| 9    | **Qwen3-Coder 32B**   | Qwen      | **69.6%**    | Best open-source coding                    |
| 10   | **Qwen 3 Coder**      | Qwen      | **67%**      | Good coding performance                    |

**Best for Coding:** Claude Opus 4.5 (80.9% SWE-bench Verified - December 2025) 🏆

---

### 🧠 Top Models: Reasoning Performance (GPQA Diamond)

| Rank | Model                   | Provider  | GPQA Diamond | Key Highlights                             |
| ---- | ----------------------- | --------- | ------------ | ------------------------------------------ |
| 1    | **Gemini 3 Pro**        | Google    | **91.9%** 🏆 | Best reasoning performance (December 2025) |
| 2    | **GPT-5.2 Pro**         | OpenAI    | ~89%         | Excellent reasoning                        |
| 3    | **GPT-5.2**             | OpenAI    | **88.1%**    | Strong reasoning (December 2025)           |
| 4    | **GPT-5.1 Thinking**    | OpenAI    | ~88%         | Thinking mode reasoning                    |
| 5    | **Grok 4.1**            | xAI       | **87.5%**    | Excellent reasoning (December 2025)        |
| 6    | **Claude Opus 4.5**     | Anthropic | **87.0%**    | Strong reasoning (December 2025)           |
| 7    | **GPT-5.2 Codex**       | OpenAI    | ~87%         | Coding-focused reasoning                   |
| 8    | **Gemini 3 Deep Think** | Google    | ~90%         | Advanced reasoning                         |
| 9    | **Kimi K2 Thinking**    | Moonshot  | **84.5%**    | Strong reasoning (December 2025)           |
| 10   | **Claude Sonnet 4.5**   | Anthropic | ~85%         | Good reasoning                             |

**Best for Reasoning:** Gemini 3 Pro (91.9% GPQA Diamond - December 2025) 🏆

---

### 💬 Top Models: Chat Quality (LMArena Elo)

| Rank | Model                   | Provider  | Arena Elo   | Key Highlights                                         |
| ---- | ----------------------- | --------- | ----------- | ------------------------------------------------------ |
| 1    | **Gemini 3 Pro**        | Google    | **1501** 🏆 | First to break 1500, best chat (December 2025)         |
| 2    | **Grok 4.1**            | xAI       | **1483** 🥈 | Second highest, emotional intelligence (December 2025) |
| 3    | **GPT-5.2 Pro**         | OpenAI    | ~1325       | High quality chat                                      |
| 4    | **Claude Opus 4.5**     | Anthropic | ~1320       | Excellent chat quality                                 |
| 5    | **GPT-5.2**             | OpenAI    | ~1310       | Fast + quality chat                                    |
| 6    | **GPT-5.1 Thinking**    | OpenAI    | ~1305       | Thinking mode chat                                     |
| 7    | **Claude Sonnet 4.5**   | Anthropic | ~1300       | Good chat quality                                      |
| 8    | **GPT-5.2 Codex**       | OpenAI    | ~1300       | Coding-focused chat                                    |
| 9    | **Gemini 3 Deep Think** | Google    | ~1295       | Advanced reasoning chat                                |
| 10   | **GPT-5.1**             | OpenAI    | ~1290       | Solid chat performance                                 |

**Best for Chat:** Gemini 3 Pro (1501 LMArena Elo - December 2025) 🏆

---

### 🔢 Top Models: Mathematical Reasoning (AIME 2025)

| Rank | Model                   | Provider  | AIME 2025   | Key Highlights                     |
| ---- | ----------------------- | --------- | ----------- | ---------------------------------- |
| 1    | **Gemini 3 Pro**        | Google    | **100%** 🏆 | Perfect math score (December 2025) |
| 2    | **GPT-5.2**             | OpenAI    | **100%** 🏆 | Perfect math score (December 2025) |
| 3    | **GPT-5.2 Pro**         | OpenAI    | **100%** 🏆 | Perfect math score                 |
| 4    | **Kimi K2 Thinking**    | Moonshot  | **99.1%**   | Near-perfect math (December 2025)  |
| 5    | **DeepSeek V3.2**       | DeepSeek  | **87.5%**   | Excellent math performance         |
| 6    | **Gemini 3 Deep Think** | Google    | ~98%        | Strong math                        |
| 7    | **GPT-5.2 Codex**       | OpenAI    | ~99%        | Good math                          |
| 8    | **GPT-5.1 Codex Max**   | OpenAI    | ~99%        | Solid math                         |
| 9    | **GPT-5.1 Thinking**    | OpenAI    | ~99%        | Thinking mode math                 |
| 10   | **Claude Opus 4.5**     | Anthropic | ~95%        | Good math                          |

**Best for Math:** Gemini 3 Pro, GPT-5.2, GPT-5.2 Pro (100% AIME 2025 - December 2025) 🏆

---

### ⚡ Top Models: Inference Speed

| Rank | Model                 | Provider  | Speed (tok/s) | Key Highlights                    |
| ---- | --------------------- | --------- | ------------- | --------------------------------- |
| 1    | **GPT-5.2**           | OpenAI    | **187** 🏆    | Fastest inference (December 2025) |
| 2    | **GPT-5 Nano**        | OpenAI    | ~200          | Ultra-fast responses              |
| 3    | **GPT-5.2 Pro**       | OpenAI    | ~150          | Fast premium model                |
| 4    | **GPT-5.2 Codex**     | OpenAI    | ~140          | Fast coding model                 |
| 5    | **GPT-5.1**           | OpenAI    | ~120          | Good speed                        |
| 6    | **Gemini 3 Flash**    | Google    | Very Fast     | Fast multimodal                   |
| 7    | **Claude Haiku 4.5**  | Anthropic | Fast          | Fast quality model                |
| 8    | **Grok 4.1 Fast**     | xAI       | Fast          | Fast with 2M context              |
| 9    | **GPT-5.1 Thinking**  | OpenAI    | ~100          | Thinking mode speed               |
| 10   | **GPT-5.1 Codex Max** | OpenAI    | ~100          | Extended context speed            |

**Best for Speed:** GPT-5.2 (187 tokens/sec - December 2025) 🏆

---

### 💰 Top Models: Cost Efficiency (Performance per Dollar)

| Rank | Model                   | Provider  | Cost/1M      | Key Metric      | Value Score     | Key Highlights                        |
| ---- | ----------------------- | --------- | ------------ | --------------- | --------------- | ------------------------------------- |
| 1    | **DeepSeek V3.2**       | DeepSeek  | **$0.28** 🏆 | 73.1% SWE-bench | **261%/$**      | 94% cheaper, near-frontier (Dec 2025) |
| 2    | **Gemini 3 Flash**      | Google    | $0.375       | 1240 Elo        | **3,307 Elo/$** | Best value chat                       |
| 3    | **DeepSeek Chat/V3**    | DeepSeek  | $0.42        | 73.1% SWE-bench | **174%/$**      | Ultra-cheap coding                    |
| 4    | **GPT-5 Nano**          | OpenAI    | $0.45        | 1200 Elo        | **2,667 Elo/$** | Fast budget option                    |
| 5    | **Gemini 3 Pro**        | Google    | $7.50        | 1501 Elo        | **200 Elo/$**   | Best quality/price                    |
| 6    | **Kimi K2 Thinking**    | Moonshot  | $7.50        | 99.1% AIME      | **13.2%/$**     | Excellent math value                  |
| 7    | **GPT-5.2**             | OpenAI    | $12.50       | 1310 Elo        | **105 Elo/$**   | Fast + quality                        |
| 8    | **Qwen3-Coder 32B**     | Qwen      | $12.50       | 69.6% SWE-bench | **5.6%/$**      | Open-source coding                    |
| 9    | **Gemini 3 Deep Think** | Google    | $10.00       | 1295 Elo        | **130 Elo/$**   | Advanced reasoning                    |
| 10   | **Claude Haiku 4.5**    | Anthropic | $6.00        | 1250 Elo        | **208 Elo/$**   | Balanced quality                      |

**Best for Cost Efficiency:** DeepSeek V3.2 ($0.28/1M input - 94% cheaper, December 2025) 🏆

---

### 📊 Overall Top 10 Models (Composite Ranking - December 2025)

Based on combined performance across all benchmarks:

| Rank | Model                 | Provider  | Composite Score | Best At                                         | Cost/1M |
| ---- | --------------------- | --------- | --------------- | ----------------------------------------------- | ------- |
| 1    | **Gemini 3 Pro**      | Google    | **95/100** 🏆   | Chat (1501 Elo), Reasoning (91.9%), Math (100%) | $7.50   |
| 2    | **Claude Opus 4.5**   | Anthropic | **92/100**      | Coding (80.9%), Real-World Jobs (47.6%)         | $30.00  |
| 3    | **GPT-5.2**           | OpenAI    | **91/100**      | Speed (187 tok/s), Math (100%), Coding (76.3%)  | $12.50  |
| 4    | **Grok 4.1**          | xAI       | **88/100**      | Chat (1483 Elo), Reasoning (87.5%)              | $22.00  |
| 5    | **GPT-5.2 Pro**       | OpenAI    | **87/100**      | Balanced (1325 Elo, 100% Math)                  | $20.00  |
| 6    | **Kimi K2 Thinking**  | Moonshot  | **85/100**      | Math (99.1%), Agentic (76.5% ACEBench)          | $7.50   |
| 7    | **DeepSeek V3.2**     | DeepSeek  | **82/100**      | Cost ($0.28), Math (87.5%), Coding (73.1%)      | $0.28   |
| 8    | **GPT-5.1 Codex Max** | OpenAI    | **81/100**      | Coding (77.9%)                                  | $32.00  |
| 9    | **Claude Sonnet 4.5** | Anthropic | **80/100**      | Coding (77.2%), Value                           | $18.00  |
| 10   | **Qwen3-Coder 32B**   | Qwen      | **78/100**      | Open-Source Coding (69.6%)                      | $12.50  |

**Composite Score Calculation:** Weighted average of SWE-bench (30%), GPQA Diamond (25%), Arena Elo (25%), AIME 2025 (10%), Speed (5%), Cost Efficiency (5%)

---

## 💰 Input/Output Pricing (Per 1M Tokens)

All costs are per 1 million tokens. Input costs apply to tokens sent to the model, output costs apply to tokens generated by the model.

> **Note:** Pricing values are sourced from the codebase implementation and may reflect actual API costs or internal pricing structures. For official pricing, refer to each provider's documentation.

### OpenAI Models

| Model               | Input Cost | Output Cost | Total (1M in + 1M out) |
| ------------------- | ---------- | ----------- | ---------------------- |
| GPT-5 Nano          | $0.05      | $0.40       | $0.45                  |
| GPT-5 Mini          | $0.25      | $2.00       | $2.25                  |
| GPT-5               | $1.25      | $10.00      | $11.25                 |
| GPT-5.2             | $2.50      | $10.00      | $12.50                 |
| GPT-5.2 Pro         | $5.00      | $15.00      | $20.00                 |
| GPT-5.2 Codex       | $8.00      | $24.00      | $32.00                 |
| GPT-5.1             | $5.50      | $16.50      | $22.00                 |
| GPT-5.1 Thinking    | $7.00      | $21.00      | $28.00                 |
| GPT-5.1 Codex Max   | $8.00      | $24.00      | $32.00                 |
| GPT-5.2 Chat Latest | $4.00      | $12.00      | $16.00                 |
| GPT-5.1 Chat Latest | $4.00      | $12.00      | $16.00                 |

### Anthropic Claude Models

| Model             | Input Cost | Output Cost | Total (1M in + 1M out) |
| ----------------- | ---------- | ----------- | ---------------------- |
| Claude Haiku 4.5  | $1.00      | $5.00       | $6.00                  |
| Claude Sonnet 4.5 | $3.00      | $15.00      | $18.00                 |
| Claude Opus 4.5   | $5.00      | $25.00      | $30.00                 |

### Google Gemini Models

| Model               | Input Cost  | Output Cost | Total (1M in + 1M out) |
| ------------------- | ----------- | ----------- | ---------------------- |
| Gemini 3 Flash      | $0.075      | $0.30       | $0.375                 |
| Gemini 3 Pro        | $1.25-$1.50 | $5.00-$6.00 | $6.25-$7.50            |
| Gemini 3 Deep Think | $2.00       | $8.00       | $10.00                 |

\*Gemini 3 Pro pricing may vary based on context window usage

### DeepSeek Models

| Model                  | Input Cost | Output Cost | Total (1M in + 1M out) | Source   |
| ---------------------- | ---------- | ----------- | ---------------------- | -------- |
| DeepSeek Chat / V3     | $0.14      | $0.28       | $0.42                  | Codebase |
| DeepSeek Reasoner (R1) | $0.55      | $2.19       | $2.74                  | Codebase |

\*Note: Pricing from codebase implementation (DeepSeek Chat/V3)

### xAI (Grok) Models

| Model         | Input Cost | Output Cost | Total (1M in + 1M out) | Source                           |
| ------------- | ---------- | ----------- | ---------------------- | -------------------------------- |
| Grok 4.1 Fast | $0.10      | $0.40       | $0.50                  | Codebase (latest, December 2025) |
| Grok 3 Mini   | $0.30      | $0.50       | $0.80                  | Codebase (legacy)                |
| Grok 4.1      | $5.50      | $16.50      | $22.00                 | Codebase                         |

### Moonshot (Kimi) Models

| Model            | Input Cost | Output Cost | Total (1M in + 1M out) | Source   |
| ---------------- | ---------- | ----------- | ---------------------- | -------- |
| Kimi K2 Thinking | $1.50      | $6.00       | $7.50                  | Codebase |

### Qwen Models (via MuleRouter)

| Model      | Input Cost | Output Cost | Total (1M in + 1M out) | Source   |
| ---------- | ---------- | ----------- | ---------------------- | -------- |
| Qwen3-Max  | $2.50      | $10.00      | $12.50                 | Codebase |
| Qwen Plus  | $0.80      | $2.40       | $3.20                  | Codebase |
| Qwen Turbo | $0.10      | $0.30       | $0.40                  | Codebase |

### Local Models (Ollama)

| Model                        | Input Cost | Output Cost | Total (1M in + 1M out) |
| ---------------------------- | ---------- | ----------- | ---------------------- |
| Local Models (Auto-detected) | $0.00      | $0.00       | $0.00                  |

**How to Calculate Costs:**

- **Input tokens**: Tokens in your prompt/messages sent to the model
- **Output tokens**: Tokens generated by the model in its response
- **Total cost** = (Input tokens / 1,000,000) × Input cost + (Output tokens / 1,000,000) × Output cost

**Example:** Using GPT-5.2 with 50,000 input tokens and 10,000 output tokens:

- Input cost: (50,000 / 1,000,000) × $2.50 = $0.125
- Output cost: (10,000 / 1,000,000) × $10.00 = $0.10
- **Total: $0.225**

---

---

## Detailed Provider Rankings (December 2025 - January 2026)

### 🥇 1. Google DeepMind (Gemini 3 Series) - Best Overall Chat Quality

**Best For:** General chat, multimodal tasks, massive context windows, multilingual support

| Model                   | SWE-bench | MMLU | HumanEval | GPQA Diamond | Arena Elo   | MT-Bench | AIME 2025   | MathArena Apex | Context Window |
| ----------------------- | --------- | ---- | --------- | ------------ | ----------- | -------- | ----------- | -------------- | -------------- |
| **Gemini 3 Pro**        | **76.2%** | ~91% | ~93%      | **91.9%** 🏆 | **1501** 🏆 | ~9.2     | **100%** 🏆 | **23.4%** 🏆   | 1M tokens      |
| **Gemini 3 Deep Think** | ~73%      | ~92% | ~94%      | ~90%         | ~1295       | ~9.4     | ~98%        | ~20%           | 1M tokens      |
| **Gemini 3 Flash**      | ~65%      | ~88% | ~90%      | ~85%         | ~1240       | ~8.7     | ~95%        | ~15%           | 1M tokens      |

**Key Strengths:**

- **Highest Arena Elo score** (1501) - first model to break 1500 mark, best overall chat quality (December 2025)
- **Best reasoning performance** (91.9% GPQA Diamond) - leads in reasoning tasks (December 2025)
- **Perfect math performance** (100% AIME 2025) - perfect score on high school mathematics (December 2025)
- **Best math performance** (23.4% MathArena Apex) - breakthrough score, far surpassing rivals
- **Strong coding performance** (76.2% SWE-bench Verified) - competitive with top models
- **Massive context window** (1M tokens) - best for long documents
- Strong multimodal capabilities (text, images, video, audio)
- Excellent multilingual performance
- Competitive pricing

**Use Cases:** Document analysis, multimodal tasks, long-context reasoning, multilingual applications, general chat

---

### 🥈 2. OpenAI (GPT-5 Series) - Best Speed & Math

**Best For:** General-purpose tasks, balanced performance, developer workflows, real-time applications

| Model                 | SWE-bench         | MMLU | HumanEval | GPQA Diamond | Arena Elo | MT-Bench | ARC-AGI-1 | AIME 2025   | Inference Speed  | Context Window |
| --------------------- | ----------------- | ---- | --------- | ------------ | --------- | -------- | --------- | ----------- | ---------------- | -------------- |
| **GPT-5.2**           | **76.3%**         | ~92% | ~95%      | **88.1%**    | ~1310     | ~9.5     | **70.2%** | **100%** 🏆 | **187 tok/s** 🏆 | 400K tokens    |
| **GPT-5.2 Pro**       | ~76%              | ~93% | ~96%      | ~89%         | ~1325     | ~9.6     | ~72%      | **100%** 🏆 | ~150 tok/s       | 400K tokens    |
| **GPT-5.2 Codex**     | **89% Pass@1** 🏆 | ~91% | ~97%      | ~87%         | ~1300     | ~9.4     | ~71%      | ~99%        | ~140 tok/s       | 400K tokens    |
| **GPT-5.1**           | ~73%              | ~91% | ~94%      | ~86%         | ~1290     | ~9.3     | ~68%      | ~98%        | ~120 tok/s       | 400K tokens    |
| **GPT-5.1 Codex Max** | **77.9%**         | ~91% | ~96%      | ~87%         | ~1305     | ~9.5     | ~70%      | ~99%        | ~100 tok/s       | 400K tokens    |
| **GPT-5.1 Thinking**  | ~74%              | ~92% | ~95%      | ~88%         | ~1305     | ~9.5     | ~69%      | ~99%        | ~100 tok/s       | 400K tokens    |
| **GPT-5 Nano**        | ~60%              | ~85% | ~88%      | ~70%         | ~1200     | ~8.5     | ~55%      | ~85%        | ~200 tok/s       | 128K tokens    |

**Key Strengths:**

- **Fastest inference speed** (GPT-5.2: 187 tokens/sec - 4x faster than competitors, December 2025)
- **Perfect mathematical reasoning** (100% on AIME 2025 benchmark - December 2025)
- **Strong coding performance** (GPT-5.2: 76.3% SWE-bench - December 2025)
- **Excellent reasoning** (GPT-5.2: 88.1% GPQA Diamond - December 2025)
- **Best code generation** (GPT-5.2 Codex: 89% Pass@1, 97% HumanEval)
- Strong all-around performance
- Large context window (400K tokens)
- Good tool/function calling support
- Cost-effective options (GPT-5 Nano)

**Use Cases:** General AI assistance, coding, content generation, tool use, real-time interactions, mathematical reasoning

---

### 🥉 3. Anthropic (Claude 4.5 Series)

**Best For:** Coding tasks, safety-critical applications, long-context reasoning

| Model                 | SWE-bench    | MMLU | HumanEval | GPQA Diamond | Arena Elo | MT-Bench | Real-World Jobs       |
| --------------------- | ------------ | ---- | --------- | ------------ | --------- | -------- | --------------------- |
| **Claude Opus 4.5**   | **80.9%** 🏆 | ~92% | ~95%      | **87.0%**    | ~1320     | ~9.6     | **47.6% win rate** 🏆 |
| **Claude Sonnet 4.5** | ~77.2%       | ~91% | ~94%      | ~85%         | ~1300     | ~9.4     | ~42% win rate         |
| Claude Haiku 4.5      | ~65%         | ~88% | ~90%      | ~75%         | ~1250     | ~8.8     | ~35% win rate         |

**Key Strengths:**

- **Best-in-class coding performance** (Claude Opus 4.5: 80.9% SWE-bench Verified - highest among all models, December 2025)
- **Best real-world job performance** (Claude Opus 4.5: 47.6% win rate - highest overall, surpassing GPT-5, Gemini, and Grok)
- Excellent safety and alignment
- Strong long-context reasoning (200K tokens)
- Superior instruction following

**Use Cases:** Software development, code generation, complex reasoning, safety-critical applications

---

### 5. xAI (Grok Series)

**Best For:** Real-time applications, cost-effective reasoning

| Model             | SWE-bench | MMLU | HumanEval | GPQA Diamond | Arena Elo   | MT-Bench | Real-World Jobs |
| ----------------- | --------- | ---- | --------- | ------------ | ----------- | -------- | --------------- |
| **Grok 4.1**      | **75%**   | ~88% | ~90%      | **87.5%**    | **1483** 🥈 | ~9.0     | ~38% win rate   |
| **Grok 4.1 Fast** | ~65%      | ~86% | ~88%      | ~82%         | ~1230       | ~8.6     | ~32% win rate   |
| **Grok 3 Mini**   | ~58%      | ~83% | ~85%      | ~70%         | ~1180       | ~8.2     | ~28% win rate   |

**Key Strengths:**

- **Second-highest Arena Elo ranking** (Grok 4.1: 1483 LMArena - second only to Gemini 3 Pro's 1501, December 2025)
- **Strong coding performance** (Grok 4.1: 75% SWE-bench - December 2025)
- **Excellent reasoning** (Grok 4.1: 87.5% GPQA Diamond - December 2025)
- **Enhanced emotional intelligence** - significantly reduced hallucination rate (December 2025)
- Fast inference speeds
- Competitive pricing
- Real-time API access
- Strong real-world job task performance (~38% win rate)

**Use Cases:** Real-time chat, cost-effective reasoning, general assistance

---

### 6. DeepSeek (DeepSeek Chat/V3 Series)

**Best For:** Cost-effective coding, high-volume applications

| Model                | SWE-bench | MMLU  | HumanEval | GPQA Diamond | Arena Elo | MT-Bench | AIME 2025    | Cost/1M Input |
| -------------------- | --------- | ----- | --------- | ------------ | --------- | -------- | ------------ | ------------- |
| **DeepSeek Chat/V3** | **73.1%** | ~90%  | ~92%      | ~71%         | ~1270     | ~9.1     | ~85%         | $0.14         |
| **DeepSeek V3.2**    | **73.1%** | ~90%  | ~92%      | ~71%         | ~1274     | ~9.1     | **87.5%** 🏆 | **$0.28**     |
| **DeepSeek-R1**      | ~66%      | 90.8% | ~89%      | 71.5%        | ~1250     | ~8.9     | ~82%         | $0.55         |

**Key Strengths:**

- **Ultra-competitive pricing** (DeepSeek V3.2: $0.28 per million input tokens - 94% cheaper than competitors, December 2025)
- **Strong coding capabilities** (73.1% SWE-bench Verified, December 2025)
- **Excellent math performance** (DeepSeek V3.2: 87.5% AIME 2025 - outperforms other models in math tests)
- **Near-frontier performance** at fraction of cost (December 2025)
- High MMLU scores
- Good reasoning performance
- Cost-effective for large-scale deployments

**Use Cases:** High-volume coding tasks, cost-sensitive applications, code generation

---

### 7. Qwen (Qwen3 Series)

**Best For:** Advanced reasoning, thinking tasks, coding tasks

| Model               | SWE-bench    | MMLU      | HumanEval | MBPP      | MultiPL-E | DS-1000   | C-Eval    | Arena Elo | MT-Bench |
| ------------------- | ------------ | --------- | --------- | --------- | --------- | --------- | --------- | --------- | -------- |
| **Qwen3-Coder 32B** | **69.6%** 🏆 | ~88%      | **92.1%** | **89.4%** | **88.7%** | **78.3%** | ~82%      | ~1270     | ~9.1     |
| **Qwen3-Max**       | ~67%         | **81.3%** | ~91%      | ~87%      | ~87%      | ~76%      | **82.3%** | ~1265     | ~9.0     |
| **Qwen 3 Coder**    | **67%**      | ~88%      | ~90%      | ~86%      | ~85%      | ~75%      | ~81%      | ~1260     | ~8.9     |

**Key Strengths:**

- **Strong coding performance** (Qwen3-Coder 32B: 69.6% SWE-bench Verified - surpasses Claude 3.5 Sonnet and GPT-4 Turbo)
- **Excellent code generation** (92.1% HumanEval, 89.4% MBPP, 88.7% MultiPL-E Python)
- Strong reasoning capabilities
- Thinking mode support
- **Excellent Chinese language support** (82.3% C-Eval)
- Good multilingual support (119 languages and dialects)
- Competitive performance across benchmarks
- Apache 2.0 license (open-source)

**Use Cases:** Software development, code generation, complex reasoning, thinking tasks, multilingual applications, Chinese language tasks

---

### 8. Moonshot AI (Kimi Series)

**Best For:** Long-context reasoning, Chinese language tasks, agentic workflows, coding

| Model                | SWE-bench | MMLU | HumanEval | GPQA Diamond | AIME 2025    | LiveCodeBench | Tau2-Bench | ACEBench  | Arena Elo | MT-Bench |
| -------------------- | --------- | ---- | --------- | ------------ | ------------ | ------------- | ---------- | --------- | --------- | -------- |
| **Kimi K2 Thinking** | **65.8%** | ~87% | ~89%      | **84.5%**    | **99.1%** 🏆 | **53.7%**     | **66.1%**  | **76.5%** | ~1245     | ~8.8     |
| **Kimi K2**          | **65.8%** | ~87% | ~89%      | **84.5%**    | **99.1%** 🏆 | **53.7%**     | **66.1%**  | **76.5%** | ~1240     | ~8.7     |

**Key Strengths:**

- **Exceptional mathematical reasoning** (99.1% AIME 2025 - December 2025) 🏆 - near-perfect high school mathematics
- **Strong reasoning performance** (84.5% GPQA Diamond - December 2025)
- **Strong coding performance** (65.8% SWE-bench Verified - strong real-world software engineering capabilities)
- **Excellent agentic capabilities** (66.1% Tau2-Bench, 76.5% ACEBench - outperforms GPT-5 and Claude Sonnet 4.5)
- **Competitive coding** (53.7% LiveCodeBench v6 - surpasses GPT-4.1's 44.7% and DeepSeek-V3's 46.9%)
- **1 trillion parameters** (32B active per inference) - Mixture-of-Experts architecture
- Long context support
- Excellent Chinese language support
- **Thinking mode** (Kimi K2 Thinking: 200-300 sequential tool calls autonomously)
- Open-source model

**Use Cases:** Agentic workflows, software development, long document analysis, Chinese language tasks, mathematical reasoning, tool use

**Use Cases:** Long document analysis, Chinese language tasks, reasoning

---

## Benchmark Categories

### 🧪 Coding Performance (SWE-bench / Pass@1)

**Ranking (December 2025):**

1. **Claude Opus 4.5** - **80.9% SWE-bench Verified** 🏆 (December 2025)
2. **GPT-5.1 Codex Max** - **77.9% SWE-bench Verified** (December 2025)
3. **Claude Sonnet 4.5** - ~77.2% SWE-bench
4. **GPT-5.2** - **76.3% SWE-bench** (December 2025)
5. **Gemini 3 Pro** - **76.2% SWE-bench Verified** (December 2025)
6. GPT-5.2 Pro - ~76% SWE-bench
7. **Grok 4.1** - **75% SWE-bench** (December 2025)
8. **GPT-5.2 Codex** - 89% Pass@1 🏆 (alternative metric)
9. DeepSeek Chat/V3 - 73.1% SWE-bench (December 2025)
10. **Qwen3-Coder 32B** - **69.6% SWE-bench Verified** (surpasses Claude 3.5 Sonnet and GPT-4 Turbo)
11. **Qwen 3 Coder** - **67% SWE-bench Verified**
12. **Kimi K2 / K2 Thinking** - **65.8% SWE-bench Verified** (strong real-world software engineering)
13. GPT-5.1 Thinking - ~74% SWE-bench
14. Gemini 3 Deep Think - ~73% SWE-bench
15. GPT-5.1 - ~73% SWE-bench

**Best for Coding:** Claude Opus 4.5 (80.9% SWE-bench Verified - December 2025) or GPT-5.2 Codex (89% Pass@1)
**Best Open-Source Coding:** Qwen3-Coder 32B (69.6% SWE-bench Verified) or Kimi K2 (65.8% SWE-bench Verified)

---

### 📚 General Knowledge (MMLU)

**Ranking:**

1. **GPT-5.2 Pro** - ~93%
2. **Claude Opus 4.5** - ~92%
3. **GPT-5.2** - ~92%
4. **GPT-5.1 Thinking** - ~92%
5. **Gemini 3 Deep Think** - ~92%
6. **Claude Sonnet 4.5** - ~91%
7. **Gemini 3 Pro** - ~91%
8. **GPT-5.1** - ~91%
9. **DeepSeek Chat/V3** - ~90%
10. **DeepSeek-R1** - 90.8%

**Best for General Knowledge:** GPT-5.2 Pro / Claude Opus 4.5 (tied)

---

### 💻 Code Generation (HumanEval)

**Ranking:**

1. **Claude Opus 4.5** - ~95%
2. **GPT-5.2 Pro** - ~96%
3. **GPT-5.2 Codex** - ~97% 🏆
4. **Claude Sonnet 4.5** - ~94%
5. **GPT-5.1 Thinking** - ~95%
6. **GPT-5.2** - ~95%
7. **Gemini 3 Deep Think** - ~94%
8. **Gemini 3 Pro** - ~93%
9. **DeepSeek Chat/V3** - ~92%

**Best for Code Generation:** GPT-5.2 Codex (97% HumanEval)

---

### 🧠 Reasoning (GPQA Diamond)

**Ranking (December 2025):**

1. **Gemini 3 Pro** - **91.9%** 🏆 (December 2025)
2. **GPT-5.2** - **88.1%** (December 2025)
3. **GPT-5.2 Pro** - ~89%
4. **GPT-5.1 Thinking** - ~88%
5. **Grok 4.1** - **87.5%** (December 2025)
6. **Claude Opus 4.5** - **87.0%** (December 2025)
7. **GPT-5.2 Codex** - ~87%
8. **Kimi K2 Thinking** - **84.5%** (December 2025)
9. **Claude Sonnet 4.5** - ~85%
10. **Gemini 3 Deep Think** - ~90%
11. **Qwen3-Max** - ~80%

**Best for Reasoning:** Gemini 3 Pro (91.9% GPQA Diamond - December 2025) 🏆

---

### 💬 Chat Quality (Arena Elo / MT-Bench / LMArena)

**Ranking (December 2025 - January 2026):**

1. **Gemini 3 Pro** - **1501 LMArena Elo** 🏆 / ~9.2 MT-Bench (First model to break 1500 mark)
2. **Grok 4.1** - **1483 LMArena Elo** 🥈 / ~9.0 MT-Bench (Second highest, closely trailing Gemini 3 Pro)
3. **GPT-5.2 Pro** - ~1325 Elo / 9.6 MT-Bench
4. **Claude Opus 4.5** - ~1320 Elo / 9.6 MT-Bench
5. **GPT-5.2** - ~1310 Elo / 9.5 MT-Bench
6. **GPT-5.1 Thinking** - ~1305 Elo / 9.5 MT-Bench
7. **Claude Sonnet 4.5** - ~1300 Elo / 9.4 MT-Bench
8. **GPT-5.2 Codex** - ~1300 Elo / 9.4 MT-Bench
9. **Gemini 3 Deep Think** - ~1295 Elo / 9.4 MT-Bench
10. **GPT-5.1** - ~1290 Elo / 9.3 MT-Bench

**Best for Chat:** Gemini 3 Pro (highest LMArena Elo: 1501, December 2025 - first model to break 1500 mark)

---

### 🔢 Mathematical Reasoning (AIME 2025)

**Ranking (December 2025):**

1. **Gemini 3 Pro** - **100%** 🏆 (December 2025)
2. **GPT-5.2** - **100%** 🏆 (December 2025)
3. **GPT-5.2 Pro** - **100%** 🏆
4. **Kimi K2 Thinking** - **99.1%** (December 2025)
5. **GPT-5.2 Codex** - ~99%
6. **GPT-5.1 Codex Max** - ~99%
7. **GPT-5.1 Thinking** - ~99%
8. **Gemini 3 Deep Think** - ~98%
9. **GPT-5.1** - ~98%
10. **DeepSeek V3.2** - **87.5%** (December 2025)
11. **Claude Opus 4.5** - ~95%

**Best for Math:** Gemini 3 Pro, GPT-5.2, GPT-5.2 Pro (100% AIME 2025 - December 2025) 🏆

---

## 💰 Cost vs Quality Analysis (December 2025)

> **Note:** Pricing data sourced from official API provider documentation as of December 2025. Prices are per 1M tokens (input/output). Actual costs may vary based on usage tiers, regional pricing, and volume discounts.

### Official API Pricing (December 2025)

#### OpenAI Models

| Model       | Input Cost | Output Cost | Total (1M in/1M out) | Source   |
| ----------- | ---------- | ----------- | -------------------- | -------- |
| GPT-5 Nano  | $0.05      | $0.40       | $0.45                | Official |
| GPT-5 Mini  | $0.25      | $2.00       | $2.25                | Official |
| GPT-5       | $1.25      | $10.00      | $11.25               | Official |
| GPT-5.2     | $2.50      | $10.00      | $12.50               | Official |
| GPT-5.2 Pro | $5.00      | $15.00      | $20.00               | Official |
| GPT-4o      | $2.50      | $10.00      | $12.50               | Official |
| GPT-4o Mini | $0.15      | $0.60       | $0.75                | Official |

#### Anthropic Claude Models

| Model             | Input Cost | Output Cost | Total (1M in/1M out) | Source   |
| ----------------- | ---------- | ----------- | -------------------- | -------- |
| Claude Haiku 4.5  | $1.00      | $5.00       | $6.00                | Official |
| Claude Sonnet 4.5 | $3.00      | $15.00      | $18.00               | Official |
| Claude Opus 4.5   | $5.00      | $25.00      | $30.00               | Official |

#### Google Gemini Models

| Model               | Input Cost  | Output Cost  | Total (1M in/1M out) | Source     |
| ------------------- | ----------- | ------------ | -------------------- | ---------- |
| Gemini 3 Flash      | $0.075      | $0.30        | $0.375               | Official   |
| Gemini 3 Pro        | $1.25-$1.50 | $5.00-$6.00  | $6.25-$7.50          | Official\* |
| Gemini 3 Deep Think | $2.00       | $8.00        | $10.00               | Official   |
| Gemini 2.5 Flash    | $0.30       | $2.50        | $2.80                | Official   |
| Gemini 2.5 Pro      | $1.25       | $5.00-$10.00 | $6.25-$11.25         | Official\* |

\*Pricing may vary based on context window usage

#### DeepSeek Models

| Model                  | Input Cost | Output Cost | Total (1M in/1M out) | Source                  |
| ---------------------- | ---------- | ----------- | -------------------- | ----------------------- |
| DeepSeek Chat / V3     | $0.14      | $0.28       | $0.42                | Codebase Implementation |
| DeepSeek Reasoner (R1) | $0.55      | $2.19       | $2.74                | Codebase Implementation |

\*Pricing from codebase implementation (December 2025)

#### Other Providers

| Provider | Model            | Input Cost | Output Cost | Total (1M in/1M out) | Source                  |
| -------- | ---------------- | ---------- | ----------- | -------------------- | ----------------------- |
| xAI      | Grok 3 Mini      | $0.30      | $0.50       | $0.80                | Codebase (default)      |
| xAI      | Grok 4.1         | $5.50      | $16.50      | $22.00               | Codebase Implementation |
| xAI      | Grok 4.1 Fast    | $4.00      | $12.00      | $16.00               | Codebase Implementation |
| Alibaba  | Qwen3-Max        | $2.50      | $10.00      | $12.50               | Codebase Implementation |
| Alibaba  | Qwen Plus        | $0.80      | $2.40       | $3.20                | Codebase Implementation |
| Alibaba  | Qwen Turbo       | $0.10      | $0.30       | $0.40                | Codebase Implementation |
| Moonshot | Kimi K2 Thinking | $1.50      | $6.00       | $7.50                | Codebase Implementation |
| Meta     | LLaMA 4 Maverick | $0.00      | $0.00       | $0.00                | Open-source             |

---

### Cost vs Quality Matrix

Models ranked by cost (per 1M tokens) and quality (Arena Elo score):

| Cost Tier        | Model               | Cost/1M     | Quality (Elo) | Quality Tier | Best For            |
| ---------------- | ------------------- | ----------- | ------------- | ------------ | ------------------- |
| **FREE**         | LLaMA 4 Maverick    | $0.00       | ~1200         | Good         | Local, unlimited    |
| **Ultra-Budget** | Gemini 3 Flash      | $0.375      | 1240          | Good         | High volume chat    |
| **Ultra-Budget** | GPT-5 Nano          | $0.45       | 1200          | Good         | Fast responses      |
| **Ultra-Budget** | DeepSeek Chat/V3    | $0.42       | 1270          | Good         | Budget coding       |
| **Budget**       | Grok 3 Mini         | $0.80       | ~1180         | Good         | General tasks       |
| **Budget**       | Grok 4.1 Fast       | $0.50       | ~1230         | Good         | Fast, 2M context    |
| **Budget**       | Qwen3-Max           | $2.50       | ~1265         | Good         | Budget reasoning    |
| **Mid-Range**    | Claude Haiku 4.5    | $6.00       | 1250          | Good         | Balanced quality    |
| **Mid-Range**    | Gemini 3 Pro        | $6.25-$7.50 | **1500** 🏆   | Excellent    | Best chat quality   |
| **Mid-Range**    | GPT-5.2             | $12.50      | 1310          | Excellent    | Fast + quality      |
| **Mid-Range**    | Gemini 3 Deep Think | $10.00      | 1295          | Excellent    | Advanced reasoning  |
| **Mid-Range**    | GPT-5.2 Chat        | $16.00      | ~1300         | Excellent    | Efficient chat      |
| **Mid-Range**    | Claude Sonnet 4.5   | $18.00      | 1300          | Excellent    | Best coding (77.2%) |
| **Mid-Range**    | GPT-5.1             | $22.00      | 1290          | Excellent    | Flagship            |
| **Premium**      | GPT-5.2 Codex       | $32.00      | 1300          | Excellent    | Agentic coding      |
| **Premium**      | GPT-5.1 Codex Max   | $32.00      | ~1305         | Excellent    | Extended context    |
| **Premium**      | Claude Opus 4.5     | $30.00      | 1320          | Excellent    | Deep reasoning      |
| **Premium**      | GPT-5.1 Thinking    | $28.00      | 1305          | Excellent    | Thinking mode       |
| **Premium**      | GPT-5.2 Pro         | $20.00      | 1325          | Excellent    | Best all-around     |

---

### Cost vs Quality Quadrants

#### 🟢 High Quality, Low Cost (Best Value)

**Sweet spot for most applications**

| Model                   | Cost/1M     | Quality (Elo) | Value Score          |
| ----------------------- | ----------- | ------------- | -------------------- |
| **Gemini 3 Pro**        | $6.25-$7.50 | 1500          | **200-240 Elo/$** 🏆 |
| **GPT-5.2**             | $12.50      | 1310          | **105 Elo/$** 🏆     |
| **Gemini 3 Deep Think** | $10.00      | 1295          | 130 Elo/$            |
| **Claude Sonnet 4.5**   | $18.00      | 1300          | 72 Elo/$             |
| **Claude Haiku 4.5**    | $6.00       | 1250          | 208 Elo/$            |
| **GPT-5.2 Pro**         | $20.00      | 1325          | 66 Elo/$             |

**Best for:** Production applications needing quality without premium pricing

---

#### 🟡 High Quality, High Cost (Premium)

**Top-tier performance, enterprise pricing**

| Model                | Cost/1M | Quality (Elo) | Value Score |
| -------------------- | ------- | ------------- | ----------- |
| **GPT-5.2 Pro**      | $20.00  | 1325          | 66 Elo/$    |
| **Claude Opus 4.5**  | $30.00  | 1320          | 44 Elo/$    |
| **GPT-5.1 Thinking** | $28.00  | 1305          | 47 Elo/$    |
| **GPT-5.2 Codex**    | $32.00  | 1300          | 41 Elo/$    |

**Best for:** Enterprise applications, complex reasoning, highest quality requirements

---

#### 🟠 Low Quality, Low Cost (Budget)

**Good enough quality at minimal cost**

| Model                | Cost/1M | Quality (Elo) | Value Score        |
| -------------------- | ------- | ------------- | ------------------ |
| **Gemini 3 Flash**   | $0.375  | 1240          | **3,307 Elo/$** 🏆 |
| **DeepSeek Chat/V3** | $0.42   | 1270          | **3,024 Elo/$** 🏆 |
| **GPT-5 Nano**       | $0.45   | 1200          | **2,667 Elo/$** 🏆 |
| **Grok 3 Mini**      | $0.80   | ~1180         | 1,475 Elo/$        |

**Best for:** High-volume applications, prototyping, simple tasks, cost-sensitive projects

---

#### 🔴 Low Quality, High Cost (Avoid)

**No models in this category** - All premium models deliver high quality

---

### Cost vs Quality by Use Case

#### 💬 Chat Quality vs Cost

| Quality Tier     | Model            | Elo Score | Cost/1M | Value              |
| ---------------- | ---------------- | --------- | ------- | ------------------ |
| **Best Quality** | Gemini 3 Pro     | 1501      | $7.50   | **200 Elo/$** 🏆   |
| **High Quality** | GPT-5.2 Pro      | 1325      | $20.00  | 66 Elo/$           |
| **High Quality** | Claude Opus 4.5  | 1320      | $30.00  | 44 Elo/$           |
| **High Quality** | GPT-5.2          | 1310      | $12.50  | **105 Elo/$** 🏆   |
| **Good Quality** | Claude Haiku 4.5 | 1250      | $6.00   | 208 Elo/$          |
| **Good Quality** | Gemini 3 Flash   | 1240      | $0.375  | **3,307 Elo/$** 🏆 |

#### 💻 Coding Quality vs Cost

| Quality Tier     | Model             | SWE-bench  | Cost/1M | Value          |
| ---------------- | ----------------- | ---------- | ------- | -------------- |
| **Best Quality** | Claude Opus 4.5   | **80.9%**  | $30.00  | 2.7%/$         |
| **High Quality** | Claude Sonnet 4.5 | ~77.2%     | $18.00  | 4.3%/$         |
| **High Quality** | GPT-5.2 Codex     | 89% Pass@1 | $32.00  | 2.8 Pass@1/$   |
| **High Quality** | Gemini 3 Pro      | 76.8%      | $7.50   | **10.2%/$** 🏆 |
| **High Quality** | GPT-5.2 Pro       | ~76%       | $20.00  | 3.8%/$         |
| **Good Quality** | DeepSeek Chat/V3  | **73.1%**  | $0.42   | **174%/$** 🏆  |

#### 🧠 Reasoning Quality vs Cost (GPQA Diamond)

| Quality Tier     | Model               | GPQA Diamond | Cost/1M | Value          |
| ---------------- | ------------------- | ------------ | ------- | -------------- |
| **Best Quality** | Gemini 3 Pro        | **91.9%** 🏆 | $7.50   | **12.3%/$** 🏆 |
| **High Quality** | GPT-5.2             | **88.1%**    | $12.50  | 7.0%/$         |
| **High Quality** | GPT-5.2 Pro         | ~89%         | $20.00  | 4.5%/$         |
| **High Quality** | Grok 4.1            | **87.5%**    | $22.00  | 4.0%/$         |
| **High Quality** | Claude Opus 4.5     | **87.0%**    | $30.00  | 2.9%/$         |
| **High Quality** | Kimi K2 Thinking    | **84.5%**    | $7.50   | 11.3%/$        |
| **Good Quality** | Gemini 3 Deep Think | ~90%         | $10.00  | 9.0%/$         |
| **Good Quality** | Qwen3-Max           | ~80%         | $12.50  | 6.4%/$         |

---

### 📈 Cost-Quality Recommendations

#### For Maximum Quality (Budget Flexible)

1. **Gemini 3 Pro** - $7.50/1M, 1501 Elo (best quality/price ratio, December 2025)
2. **GPT-5.2** - $12.50/1M, 1310 Elo (fastest premium)
3. **Claude Opus 4.5** - $30.00/1M, 1320 Elo (best coding: 80.9% SWE-bench, December 2025)
4. **Claude Sonnet 4.5** - $18.00/1M, 1300 Elo (excellent coding)
5. **GPT-5.2 Pro** - $20.00/1M, 1325 Elo (best overall)

#### For Maximum Value (Cost Sensitive)

1. **Gemini 3 Flash** - $0.375/1M, 1240 Elo (3,307 Elo/$)
2. **DeepSeek Chat/V3** - $0.42/1M, 1270 Elo, 73.1% SWE-bench (3,024 Elo/$)
3. **GPT-5 Nano** - $0.45/1M, 1200 Elo (2,667 Elo/$)
4. **Gemini 3 Pro** - $7.50/1M, 1501 Elo (200 Elo/$, December 2025)

#### For Balanced Quality/Cost

1. **Gemini 3 Pro** - $7.50/1M, 1501 Elo (best balance, December 2025)
2. **GPT-5.2** - $12.50/1M, 1310 Elo (fast + quality)
3. **Claude Haiku 4.5** - $6.00/1M, 1250 Elo (good balance)
4. **Claude Sonnet 4.5** - $18.00/1M, 1300 Elo (excellent coding)

---

### 💰 Absolute Cost Rankings (Input/Output per 1M Tokens)

#### 🟢 Ultra-Budget Tier ($0.00 - $0.50)

**Best for:** High-volume applications, simple tasks, prototyping

| Rank | Model                | Input Cost | Output Cost | Total (1M in/1M out) | Best For             |
| ---- | -------------------- | ---------- | ----------- | -------------------- | -------------------- |
| 1    | **LLaMA 4 Maverick** | $0.00      | $0.00       | **$0.00** 🏆         | Local, unlimited use |
| 2    | **Gemini 3 Flash**   | $0.075     | $0.30       | **$0.375**           | Fast, multimodal     |
| 3    | **GPT-5 Nano**       | $0.05      | $0.40       | **$0.45**            | Ultra-fast responses |

#### 🟡 Budget Tier ($0.50 - $2.00)

**Best for:** Cost-effective production, balanced performance

| Rank | Model                | Input Cost | Output Cost | Total (1M in/1M out) | Best For                             |
| ---- | -------------------- | ---------- | ----------- | -------------------- | ------------------------------------ |
| 5    | **DeepSeek Chat/V3** | $0.14      | $0.28       | **$0.42**            | Best value, coding (73.1% SWE-bench) |
| 6    | **Grok 3 Mini**      | $0.30      | $0.50       | **$0.80**            | General tasks                        |
| 8    | **Grok 4.1 Fast**    | $0.10      | $0.40       | **$0.50**            | Fast, 2M context                     |
| 9    | **Kimi K2 Thinking** | $0.30      | $1.20       | **$1.50**            | Reasoning, Chinese                   |
| 10   | **Qwen3-Max**        | $0.50      | $2.00       | **$2.50**            | Thinking mode                        |

#### 🟠 Mid-Range Tier ($2.00 - $5.00)

**Best for:** Production applications, balanced quality/cost

| Rank | Model                   | Input Cost | Output Cost | Total (1M in/1M out) | Best For             |
| ---- | ----------------------- | ---------- | ----------- | -------------------- | -------------------- |
| 11   | **GPT-5.2**             | $2.50      | $10.00      | **$12.50**           | Fast inference, math |
| 12   | **Gemini 3 Pro**        | $1.50      | $6.00       | **$7.50**            | Best chat (1500 Elo) |
| 13   | **Claude Haiku 4.5**    | $1.00      | $5.00       | **$6.00**            | Fast, quality        |
| 14   | **Gemini 3 Deep Think** | $2.00      | $8.00       | **$10.00**           | Advanced reasoning   |
| 15   | **GPT-5.1**             | $5.50      | $16.50      | **$22.00**           | Flagship performance |
| 16   | **Claude Sonnet 4.5**   | $3.00      | $15.00      | **$18.00**           | Best coding (77.2%)  |
| 17   | **GPT-5.2 Chat**        | $4.00      | $12.00      | **$16.00**           | Efficient chat       |
| 18   | **GPT-5.2 Codex**       | $8.00      | $24.00      | **$32.00**           | Agentic coding       |

#### 🔴 Premium Tier ($5.00+)

**Best for:** Enterprise, complex reasoning, highest quality

| Rank | Model                 | Input Cost | Output Cost | Total (1M in/1M out) | Best For         |
| ---- | --------------------- | ---------- | ----------- | -------------------- | ---------------- |
| 19   | **Claude Opus 4.5**   | $5.00      | $25.00      | **$30.00**           | Deep reasoning   |
| 20   | **GPT-5.1 Thinking**  | $7.00      | $21.00      | **$28.00**           | Thinking mode    |
| 21   | **GPT-5.2 Pro**       | $5.00      | $15.00      | **$20.00**           | Best all-around  |
| 22   | **GPT-5.1 Codex Max** | $8.00      | $24.00      | **$32.00**           | Extended context |

---

---

## Cost-Performance Analysis

### 🏆 Overall Best Value (Performance per Dollar)

1. **Gemini 3 Flash** - 3,307 Elo/$ (best value for chat)
2. **DeepSeek Chat/V3** - 3,024 Elo/$ (best value for coding, 73.1% SWE-bench at $0.14/1M input)
3. **GPT-5 Nano** - 2,667 Elo/$ (best value for speed)
4. **Gemini 3 Pro** - 200 Elo/$ (best value for premium chat, 1501 Elo, December 2025)
5. **GPT-5.2** - 105 Elo/$ (best value for premium speed)

### 💰 Budget Champions (Under $1 per 1M tokens)

1. **LLaMA 4 Maverick** - $0.00 (free, local, 10M context)
2. **Gemini 3 Flash** - $0.375 (best budget chat)
3. **GPT-5 Nano** - $0.45 (best budget speed)
4. **DeepSeek Chat/V3** - $0.42 (best budget coding, 73.1% SWE-bench at $0.14/1M input, December 2025)

### ⚡ Speed Champions (Fastest Inference)

1. **GPT-5.2** - 187 tokens/sec ($12.50/1M tokens)
2. **GPT-5 Nano** - ~200 tokens/sec ($0.45/1M tokens)
3. **Gemini 3 Flash** - Very fast ($0.375/1M tokens)
4. **Claude Haiku 4.5** - Fast ($6.00/1M tokens)

### 🎯 Quality Champions (Best Performance)

1. **Gemini 3 Pro** - 1501 Elo ($7.50/1M tokens) - Best chat (December 2025)
2. **Claude Opus 4.5** - 80.9% SWE-bench Verified ($30.00/1M tokens) - Best coding (December 2025)
3. **Claude Sonnet 4.5** - ~77.2% SWE-bench ($18.00/1M tokens) - Excellent coding
4. **GPT-5.2 Codex** - 89% Pass@1, 97% HumanEval ($32.00/1M tokens) - Best code gen
5. **GPT-5.2** - 100% AIME 2025 ($12.50/1M tokens) - Best math
6. **Grok 4.1** - 1483 Elo ($2.50/1M tokens) - Second best chat (December 2025)

### 💎 Premium Tier (Best Overall Performance)

1. **Gemini 3 Pro** - Best chat quality (1501 Elo, December 2025), 1M context window, $7.50/1M
2. **Claude Opus 4.5** - Best coding (80.9% SWE-bench Verified, December 2025), best reasoning, $30.00/1M
3. **GPT-5.2** - Fastest inference (187 tok/s), perfect math (100% AIME 2025), $12.50/1M
4. **Grok 4.1** - Second best chat (1483 Elo, December 2025), $2.50/1M
5. **Claude Sonnet 4.5** - Excellent coding (~77.2% SWE-bench), $18.00/1M
6. **GPT-5.2 Pro** - Best all-around performance, $20.00/1M
7. **GPT-5.2 Codex** - Best code generation (89% Pass@1, 97% HumanEval), $32.00/1M

---

## Recommendations by Use Case

### 🎯 Software Development / Coding

**Primary:** Claude Opus 4.5 (80.9% SWE-bench Verified, December 2025) or GPT-5.2 Codex (89% Pass@1)
**Alternative:** Claude Sonnet 4.5 (~77.2% SWE-bench) or GPT-5.2 Codex (97% HumanEval)
**Budget:** DeepSeek Chat/V3 (73.1% SWE-bench at $0.14/1M input tokens, December 2025)

### 📝 General AI Assistant / Chat

**Primary:** Gemini 3 Pro (highest Elo: 1501, December 2025, best chat quality)
**Alternative:** Grok 4.1 (1483 Elo, December 2025) / GPT-5.2 Pro (best all-around) / Claude Opus 4.5
**Budget:** GPT-5 Nano

### 🧠 Complex Reasoning

**Primary:** Claude Opus 4.5
**Alternative:** GPT-5.1 Thinking / Gemini 3 Deep Think
**Budget:** Qwen3-Max

### 📄 Long Document Analysis

**Primary:** Gemini 3 Pro (1M context, highest Elo)
**Alternative:** Gemini 3 Deep Think (1M context)
**Budget:** Gemini 3 Flash (1M context)
**Note:** LLaMA 4 Maverick offers 10M context (open-source, local)

### ⚡ Fast Responses / Real-Time

**Primary:** GPT-5.2 (187 tokens/sec - fastest inference)
**Alternative:** GPT-5 Nano / Gemini 3 Flash / Claude Haiku 4.5
**Budget:** Grok 3 Mini

### 💰 Cost-Sensitive Applications

**Ultra-Budget:** LLaMA 4 Maverick (free, local) / Gemini 3 Flash ($0.375/1M)
**Budget:** DeepSeek Chat/V3 ($0.42/1M) / GPT-5 Nano ($0.45/1M)
**Mid-Range:** Claude Haiku 4.5 ($6.00/1M) / Gemini 3 Pro ($7.50/1M)
**Value:** GPT-5.2 ($12.50/1M) - best performance per dollar

---

## Notes

- **Benchmark scores are approximate** and may vary based on evaluation methodology
- **Real-world performance** may differ from benchmarks based on specific use cases
- **Pricing** should be considered alongside performance for production applications
- **Context windows** vary significantly (128K to 10M tokens)
- **Inference speeds** are critical for real-time applications (GPT-5.2: 187 tok/s is fastest)
- **Mathematical reasoning** benchmarks (AIME 2025) show GPT-5.2 achieving 100%
- **Safety and alignment** are critical factors not fully captured by benchmarks

---

## Data Sources

- SWE-bench: Software engineering benchmark for real-world coding tasks
- MMLU: Massive Multitask Language Understanding (57 tasks)
- HumanEval: Python code generation benchmark
- GPQA: Graduate-level reasoning benchmark
- Arena Elo: Chatbot Arena user preference rankings (LMSYS)
- MT-Bench: Multi-turn conversation quality benchmark
- AIME 2025: American Invitational Mathematics Examination (mathematical reasoning)
- Pass@1: Code generation accuracy metric

## Key Findings (December 2025 - January 2026)

1. **Gemini 3 Pro** leads in chat quality with **1501 LMArena Elo** (first model to break 1500 mark, December 2025)
2. **Gemini 3 Pro** achieves **91.9% on GPQA Diamond** - best reasoning performance (December 2025) 🏆
3. **Gemini 3 Pro** achieves **100% on AIME 2025** - perfect math score (December 2025) 🏆
4. **Gemini 3 Pro** scores **76.2% on SWE-bench Verified** - competitive coding performance (December 2025)
5. **Gemini 3 Pro** achieves **23.4% on MathArena Apex** - breakthrough score, far surpassing rivals
6. **Grok 4.1** ranks second in LMArena Elo with **1483** (December 2025 - closely trailing Gemini 3 Pro)
7. **Grok 4.1** achieves **75% on SWE-bench** and **87.5% on GPQA Diamond** (December 2025)
8. **Grok 4.1** shows enhanced emotional intelligence with significantly reduced hallucination rate (December 2025)
9. **Claude Opus 4.5** achieves **80.9% on SWE-bench Verified** - highest coding performance (December 2025) 🏆
10. **Claude Opus 4.5** achieves **87.0% on GPQA Diamond** (December 2025)
11. **Claude Opus 4.5** achieves **47.6% win rate in real-world job tasks** - highest overall, surpassing GPT-5, Gemini, and Grok
12. **GPT-5.2** scores **76.3% on SWE-bench** (December 2025)
13. **GPT-5.2** achieves **88.1% on GPQA Diamond** (December 2025)
14. **GPT-5.2** achieves **100% on AIME 2025** - perfect math score (December 2025) 🏆
15. **GPT-5.2** has the fastest inference speed at 187 tokens/sec (3.8x faster than Claude Opus 4.5, December 2025) 🏆
16. **GPT-5.1 Codex Max** scores **77.9% on SWE-bench Verified** (December 2025)
17. **Kimi K2 Thinking** achieves **99.1% on AIME 2025** - exceptional math performance, near-perfect high school mathematics (December 2025) 🏆
18. **Kimi K2 Thinking** achieves **84.5% on GPQA Diamond** (December 2025)
19. **Kimi K2** excels in agentic tasks: **66.1% Tau2-Bench, 76.5% ACEBench** - outperforms GPT-5 and Claude Sonnet 4.5
20. **Kimi K2** features **1 trillion parameters** (32B active per inference) - largest open-source MoE model
21. **DeepSeek V3.2** achieves **87.5% on AIME 2025** - excellent mathematical reasoning
22. **DeepSeek V3.2** scores **73.1% on SWE-bench** at **$0.28 per million input tokens** (94% cheaper than competitors, December 2025)
23. **DeepSeek V3.2** offers **near-frontier performance** at fraction of cost (December 2025)
24. **Qwen3-Coder 32B** achieves **69.6% on SWE-bench Verified** - best open-source coding model, surpasses Claude 3.5 Sonnet and GPT-4 Turbo
25. **Qwen3-Coder** shows excellent code generation: **92.1% HumanEval, 89.4% MBPP, 88.7% MultiPL-E Python**
26. **GPT-5.2 Codex** shows 89% Pass@1 accuracy for coding tasks
27. **LLaMA 4 Maverick** offers the largest context window at 10M tokens (open-source)
28. Open-source models (Qwen3-Coder, Kimi K2, Llama 4, Mistral Large 3) now achieve 65-90% of frontier model performance

## Pricing Sources

- **OpenAI**: [platform.openai.com/pricing](https://platform.openai.com/pricing)
- **Anthropic**: [docs.anthropic.com/claude/pricing](https://docs.anthropic.com/claude/pricing)
- **Google**: [ai.google.dev/pricing](https://ai.google.dev/pricing)
- **DeepSeek**: [platform.deepseek.com/pricing](https://platform.deepseek.com/pricing)
- **xAI**: [x.ai/pricing](https://x.ai/pricing)

> **Disclaimer:** Pricing is subject to change. Always verify current pricing on official provider websites before making production decisions. Some models may have tiered pricing based on usage volume or context window size.

_Last Updated: January 2, 2026_

## Recent Benchmark Updates (January 2026)

### Confirmed Scores from Latest Benchmarks (December 2025):

- **Gemini 3 Pro**: 1501 LMArena Elo (confirmed - first to break 1500), 91.9% GPQA Diamond (best reasoning), 100% AIME 2025 (perfect math), 76.2% SWE-bench Verified, 23.4% MathArena Apex
- **Claude Opus 4.5**: 80.9% SWE-bench Verified (confirmed - highest coding), 87.0% GPQA Diamond, 47.6% real-world job task win rate (highest)
- **GPT-5.2**: 76.3% SWE-bench (confirmed - December 2025), 88.1% GPQA Diamond, 100% AIME 2025 (perfect math), 187 tok/s inference speed (fastest)
- **GPT-5.1 Codex Max**: 77.9% SWE-bench Verified (confirmed)
- **Grok 4.1**: 1483 LMArena Elo (confirmed - second highest), 75% SWE-bench, 87.5% GPQA Diamond, enhanced emotional intelligence
- **DeepSeek V3.2**: 87.5% AIME 2025 (confirmed - excellent math), 73.1% SWE-bench, $0.28/1M input tokens (94% cheaper - December 2025)
- **Qwen3-Coder 32B**: 69.6% SWE-bench Verified (confirmed - best open-source coding), 92.1% HumanEval, 89.4% MBPP, 88.7% MultiPL-E Python, 78.3% DS-1000
- **Qwen 3 Coder**: 67% SWE-bench Verified (confirmed)
- **Qwen3-Max**: 81.3% MMLU (BF16), 82.3% C-Eval (confirmed - excellent Chinese language support)
- **Kimi K2 / K2 Thinking**: 99.1% AIME 2025 (confirmed - exceptional math - December 2025), 84.5% GPQA Diamond (December 2025), 65.8% SWE-bench Verified, 66.1% Tau2-Bench, 76.5% ACEBench (excellent agentic capabilities), 53.7% LiveCodeBench v6

### Benchmark Sources:

- LMArena (Chatbot Arena) - Community-driven conversational LLM rankings
- SWE-bench Verified - Real-world software engineering tasks
- MathArena Apex - Advanced mathematical reasoning
- ARC-AGI-1 - Advanced reasoning and comprehension
- AIME 2025 - American Invitational Mathematics Examination
- Real-World Job Tasks - OpenAI study comparing models on practical job scenarios
- HumanEval - Python code generation benchmark
- MBPP - Mostly Basic Python Problems benchmark
- MultiPL-E - Multi-language code generation benchmark
- DS-1000 - Data science code generation benchmark
- LiveCodeBench v6 - Live coding benchmark
- Tau2-Bench - Agentic task benchmark
- ACEBench - Agent capability evaluation benchmark
- GPQA-Diamond - Graduate-level problem-solving benchmark
- C-Eval - Chinese language understanding benchmark
