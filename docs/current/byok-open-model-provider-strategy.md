# BYOK Open Model Provider Strategy

Status: Current
Owner: Founder + provider/platform lead
Last updated: 2026-05-28

This document defines how AGI should think about BYOK providers, open-weight models, hosted open-model APIs, and local model runtimes before implementation agents add or rank models.

Use this with `docs/current/source-of-truth.md`, `docs/current/parity-implementation-matrix.md`, and `packages/types/src/models.json`.

## Core Decision

BYOK Desktop is not only for OpenAI, Anthropic, and Google keys.

AGI Desktop must support three BYOK/open-model classes:

1. Direct frontier/provider keys: OpenAI, Anthropic, Google, xAI, Mistral, DeepSeek, Qwen/Alibaba Model Studio, Kimi/Moonshot, Z.ai/GLM, Cohere, AI21, Azure, Bedrock.
2. Hosted open-model providers: OpenRouter, NVIDIA NIM, Together AI, Fireworks AI, Groq, Cerebras Inference, DeepInfra, Hugging Face Inference Providers, Replicate, SambaNova, and selected specialist providers.
3. Local runtimes: Ollama, LM Studio, llama.cpp, vLLM, Text Generation Inference, MLX/Apple Silicon local runtimes, and AGI-managed local runtime adapters.

The user experience should feel like ChatGPT/Claude, but the execution source can be any capable model/provider combination the user connects.

## Non-Negotiable BYOK Rule

Model name is not enough.

AGI must treat each route as:

```text
provider + endpoint class + model id + capability metadata + pricing metadata + privacy/retention claim + runtime health
```

The same model served by two providers can differ in:

- context window,
- max output tokens,
- tool/function calling behavior,
- structured output support,
- reasoning/thinking parameter format,
- vision/audio/image support,
- file support,
- latency and throughput,
- uptime and fallback behavior,
- price,
- moderation/filtering,
- data retention and training policy.

A recent hosted-open-model measurement paper makes this explicit: production users consume a provider-specific service object, not just a model artifact. It found routing can materially change cost and throughput for the same model family.

## Current AGI Catalog Position

`packages/types/src/models.json` currently has:

- 25 providers,
- 84 model entries,
- direct model entries for managed cloud, OpenAI, Anthropic, Google, xAI, DeepSeek, Qwen, Moonshot, Mistral, Zhipu, Perplexity, Runway, NVIDIA NIM, Groq, and OpenRouter.

Important gap:

- `together`, `fireworks`, `cerebras`, `deepinfra`, `cohere`, `ai21`, `sambanova`, `azure`, and `bedrock` are provider definitions but currently have no direct model entries in the catalog.

That means the provider surface exists, but the BYOK model selector cannot honestly claim full support until model entries, capability metadata, request adapters, tests, and provider docs are added.

## Provider Priority

### P0: Add/Complete First

| Provider                         | Why AGI needs it                                                                                                                                                                                     | Implementation rule                                                                                                                              |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| OpenRouter                       | One key for 300+ models/providers, useful for breadth, discovery, fallback, rankings, and users who already route many models through it.                                                            | Treat as aggregator. Persist actual selected upstream/provider when returned. Do not assume native tools/files behave like direct provider APIs. |
| NVIDIA NIM                       | Important for enterprise/open-model hosted and self-hosted routes; official docs list Nemotron, Llama, Mistral, Kimi, Qwen, OpenAI gpt-oss, MiniMax, DeepSeek, and safety models.                    | Add NIM as both hosted API and self-hostable enterprise route. Track downloadable NIM vs hosted API differences.                                 |
| Together AI                      | Strong open-model platform with serverless and dedicated endpoints, 100+ open-source models, OpenAI-compatible inference, function calling, structured outputs, image/video/audio/embedding support. | Add direct model entries for recommended chat, reasoning, coding, vision, image, audio, embeddings.                                              |
| Fireworks AI                     | OpenAI-compatible platform for 100+ open-source models with fine-tuning, function calling, structured outputs, vision, audio, image, embeddings, reranking, and batch inference.                     | Use as high-priority hosted open-model provider. Add model discovery/capability sync rather than a stale hardcoded list only.                    |
| Groq                             | Very fast inference for production open models; official docs list Llama, GPT-OSS, Qwen, Whisper, and Groq Compound/tool systems with token speed/pricing/context metadata.                          | Treat as speed/low-latency provider. Verify supported tools, files, and compound tool semantics separately.                                      |
| Cerebras Inference               | Ultra-fast open-model inference; official docs expose public models and feature detection for streaming/tools/JSON mode.                                                                             | Treat as speed provider for supported public models, not a generic all-model provider.                                                           |
| DeepInfra                        | Broad hosted model API covering LLMs, image, speech, object detection, classification, embeddings, and OpenAI-compatible LLM paths.                                                                  | Good breadth provider; require model-specific capability metadata.                                                                               |
| Hugging Face Inference Providers | Meta-provider over providers such as Cerebras, Cohere, DeepInfra, Fal, Fireworks, Groq, Hyperbolic, Novita, Nscale, Replicate, SambaNova, Scaleway, Together, WaveSpeed, and Z.ai.                   | Treat as aggregator/proxy like OpenRouter, but with Hugging Face provider suffix semantics and Hub integration.                                  |
| Replicate                        | Useful for official always-on image/video/audio/model APIs and stable official model endpoints; less ideal as primary chat-provider abstraction.                                                     | Prioritize multimodal generation, not first-choice chat.                                                                                         |

### P1: Add After P0 Is Solid

| Provider         | Reason                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| SambaNova        | Hosted open-model API; useful through direct API and Hugging Face provider routing.                       |
| Baseten          | Dedicated model deployment and inference for custom/fine-tuned models.                                    |
| Nebius AI Studio | Hosted open model APIs and GPU cloud path.                                                                |
| Novita           | Useful image/video/open-model provider, also present in Hugging Face provider ecosystem.                  |
| Hyperbolic       | Hosted open models/GPU inference; useful for cost-sensitive routes.                                       |
| Fal              | Strong image/video/media model provider; useful for artifact/media parity.                                |
| Lambda           | GPU/cloud route for dedicated/self-hosted open models.                                                    |
| Chutes           | Popular in open-model communities and OpenRouter routes; verify official docs before first-class support. |

## Model Family Priority

### P0 Model Families

| Family          | Why it matters for AGI                                                                                                                                                                                                                       | Routes to support                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI gpt-oss  | OpenAI's open-weight reasoning models, `gpt-oss-120b` and `gpt-oss-20b`, are Apache 2.0 open-weight models for local or hosted infrastructure; OpenAI says they are not served through OpenAI API or ChatGPT.                                | Local runtime, NVIDIA NIM, Together, Groq, Cerebras, OpenRouter, Hugging Face providers.                                                  |
| Qwen            | Broad model family for chat, coding, reasoning, vision, and agentic workflows. Qwen3 includes dense and MoE models from 0.6B to 235B; Qwen3-Coder-Next targets coding agents.                                                                | Alibaba Model Studio direct, OpenRouter, Together, NVIDIA NIM, Fireworks, DeepInfra, Cerebras, local runtime where weights are available. |
| DeepSeek        | Strong cost/performance and reasoning models. Official DeepSeek API currently lists `deepseek-v4-flash` and `deepseek-v4-pro`, with 1M context, tool calls, JSON output, thinking/non-thinking modes, and OpenAI/Anthropic-format base URLs. | DeepSeek direct, OpenRouter, Together, Fireworks, DeepInfra, NVIDIA NIM, local runtime where weights are available.                       |
| Kimi / Moonshot | Kimi K2.x is heavily used for agentic/coding/general workflows. Together recommends Kimi K2.6 for chat and reasoning.                                                                                                                        | Moonshot direct, OpenRouter, Together, NVIDIA NIM, Fireworks.                                                                             |
| Z.ai / GLM      | GLM-5/5.1 and GLM-4.6-class models are important open-model/code/function-calling options. Together recommends GLM-5.1 for coding agents and function calling.                                                                               | Z.ai direct, OpenRouter, Together, Cerebras, Hugging Face providers.                                                                      |
| Mistral         | Mistral has open-weight and premier models across Large, Medium, Small, Devstral, Magistral, Codestral, Voxtral, and embeddings, with cloud/self-host routes.                                                                                | Mistral direct, Bedrock/Azure/Google Cloud/Snowflake where relevant, NVIDIA NIM, Together, Fireworks, OpenRouter, local runtime.          |
| Meta Llama      | Still essential for open-model compatibility, local runtimes, enterprise self-hosting, and many hosted APIs.                                                                                                                                 | Local runtime, NVIDIA NIM, Groq, Together, Fireworks, Cerebras, DeepInfra, OpenRouter, Bedrock/Azure/Vertex where relevant.               |
| Google Gemma    | Google says Gemma 4 is its most capable open model family, with 2B/4B/26B MoE/31B sizes and large adoption.                                                                                                                                  | Local runtime, Together, Hugging Face providers, OpenRouter, Google AI Studio/Vertex where available.                                     |
| NVIDIA Nemotron | Key NVIDIA open/reasoning/safety model family, especially for NIM and enterprise/local deployment.                                                                                                                                           | NVIDIA NIM, OpenRouter, local/self-host NIM where available.                                                                              |
| MiniMax         | Important hosted open-model family; Together lists MiniMax M2.7 and NVIDIA lists MiniMax M2.5/M2.7.                                                                                                                                          | Together, NVIDIA NIM, OpenRouter, direct provider if API/docs are verified.                                                               |

### P1 Model Families

| Family                                                     | Reason                                                                                                                        |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Microsoft Phi                                              | Useful small/local/edge models; not first choice for Claude/OpenAI parity but valuable for low-resource local mode.           |
| Cohere Command / Aya                                       | Enterprise, multilingual, RAG/rerank ecosystem; verify current direct model lineup before first-class BYOK expansion.         |
| AI21 Jamba                                                 | Enterprise long-context/hybrid architecture option; add after high-demand providers.                                          |
| IBM Granite                                                | Enterprise/open models useful for regulated customers and local/enterprise routes.                                            |
| Liquid AI LFM                                              | Efficient open models showing up in hosted catalogs.                                                                          |
| Falcon                                                     | Regional/open models; add if user demand or provider coverage justifies it.                                                   |
| Wan / Flux / Stable Diffusion / Imagen / Veo / Sora routes | Not LLM chat, but needed for artifact/media parity through image/video providers. Keep separate from LLM chat model selector. |

## Desktop BYOK UX Requirements

Desktop BYOK should have four clear groups in the model/provider setup:

1. Direct provider keys
   - OpenAI, Anthropic, Google, xAI, Mistral, DeepSeek, Qwen, Kimi, Z.ai, Cohere, AI21.
2. Open model cloud keys
   - OpenRouter, NVIDIA NIM, Together, Fireworks, Groq, Cerebras, DeepInfra, Hugging Face, Replicate, SambaNova.
3. Local runtimes
   - Ollama, LM Studio, llama.cpp, vLLM, TGI, MLX.
4. AGI Managed Cloud
   - waitlist/private beta/invite only.

The model selector must show:

- provider,
- route type: direct BYOK, hosted open model, local runtime, managed beta,
- model family,
- model id,
- context window,
- max output tokens,
- modalities,
- tool/function calling support,
- structured output support,
- reasoning/thinking support and format,
- file/image/audio/video support,
- pricing if known,
- rate-limit/health state if known,
- privacy/retention claim source,
- "same model via different provider" warning when applicable.

## Adapter Requirements

AGI should implement provider adapters in this order:

1. OpenAI-compatible chat completions adapter with provider quirks table.
2. Native direct adapters for OpenAI, Anthropic, Google, DeepSeek, Mistral, Qwen, Kimi, Z.ai where native APIs matter.
3. Aggregator adapters for OpenRouter and Hugging Face Inference Providers.
4. Hosted open-model adapters for NVIDIA NIM, Together, Fireworks, Groq, Cerebras, DeepInfra, Replicate, SambaNova.
5. Local runtime adapters for Ollama, LM Studio, llama.cpp/vLLM/TGI/MLX.

Do not assume every OpenAI-compatible endpoint supports the same parameters.

Per provider, AGI needs a capability normalizer for:

- tools,
- parallel tools,
- JSON/schema output,
- reasoning effort/thinking format,
- vision input,
- image generation,
- audio input/output,
- file upload,
- prompt caching,
- server-side state,
- streaming/event format,
- token usage reporting,
- pricing and billing units,
- retention/ZDR claims.

## Popularity Signals To Track

AGI should not choose models from one leaderboard alone.

Track all of these:

- OpenRouter rankings: benchmark plus real usage data from OpenRouter users.
- Artificial Analysis open-source comparison: intelligence, speed, price, context, size, and licensing.
- Provider recommended-model pages, especially Together's use-case recommendations.
- Hugging Face downloads/trending/likes and model-card activity.
- Local runtime support: Ollama, LM Studio, llama.cpp, vLLM, TGI, MLX support.
- Developer workflow adoption: coding-agent performance, tool-calling reliability, structured outputs, context length.
- License and commercial usability.
- Availability across at least two strong providers.

Current popularity/quality signals from this research:

- Artificial Analysis highlights Kimi K2.6 and MiMo-V2.5-Pro as highest-intelligence open models, followed by DeepSeek V4 Pro and GLM-5.1.
- OpenRouter's rankings page is explicitly based on benchmarks and real usage data from millions of users.
- Together recommends Kimi K2.6 for chat/reasoning, GLM-5.1 for coding agents/function calling, Gemma 4 31B for small/fast use, and Qwen variants for reasoning/vision alternatives.
- Google says Gemma has crossed 400M downloads and 100,000+ variants, and positions Gemma 4 as its most capable open model family.

## AGI Product Implication

For a user, BYOK Desktop should mean:

> "Bring any serious model route you already pay for, including open-model clouds and local runtimes, and AGI gives you the Claude/ChatGPT-style application layer on top."

But AGI must be honest:

- If a BYOK model cannot call tools, AGI should not show tool parity for that model.
- If a BYOK provider does not support vision, AGI should not accept images for that route.
- If a provider cannot guarantee no training/retention, AGI must show "provider policy unknown" or the exact provider claim.
- If a hosted open model is quantized, compressed, moderated, or routed through an aggregator, AGI must label that route.
- If a local runtime is offline or too small for the requested task, AGI must show install/run/upgrade guidance instead of silently using cloud.

## Required Research Sources

Official provider/model docs:

- OpenRouter model API and 300+ model/provider catalog: https://openrouter.ai/docs/api/api-reference/models/get-models
- OpenRouter rankings: https://openrouter.ai/rankings
- NVIDIA NIM LLM APIs: https://docs.api.nvidia.com/nim/reference/llm-apis
- NVIDIA NIM supported models: https://docs.nvidia.com/nim/large-language-models/latest/supported-models.html
- Together serverless model catalog: https://docs.together.ai/docs/serverless/models
- Together recommended models: https://docs.together.ai/docs/inference/recommended-models
- Fireworks docs overview: https://docs.fireworks.ai/getting-started/introduction
- Groq supported models: https://console.groq.com/docs/models
- Cerebras model catalog: https://inference-docs.cerebras.ai/models/overview
- Cerebras public models API: https://inference-docs.cerebras.ai/api-reference/models/public-models
- DeepInfra native/OpenAI-compatible API: https://docs.deepinfra.com/apis/deepinfra-native
- Hugging Face Inference Providers: https://huggingface.co/docs/inference-providers/en/index
- Replicate official models: https://replicate.com/docs/topics/models/official-models
- DeepSeek list models: https://api-docs.deepseek.com/api/list-models
- DeepSeek models/pricing: https://api-docs.deepseek.com/quick_start/pricing
- Alibaba Cloud Model Studio model list: https://www.alibabacloud.com/help/en/model-studio/models
- Kimi API model list: https://platform.kimi.ai/docs/models
- Z.ai developer overview: https://docs.z.ai/guides/overview/overview
- Mistral model docs: https://docs.mistral.ai/models/overview
- Mistral model families: https://mistral.ai/models
- OpenAI open-weight gpt-oss help: https://help.openai.com/en/articles/11870455-openai-open-weight-models-gpt-oss
- OpenAI open models: https://openai.com/open-models
- Google Gemma 4 announcement: https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/
- Qwen3 technical report: https://arxiv.org/abs/2505.09388
- Qwen3-Coder-Next technical report: https://arxiv.org/abs/2603.00729
- Hosted open-weight service measurement: https://arxiv.org/abs/2605.02821
- Artificial Analysis open-source model comparison: https://artificialanalysis.ai/models/open-source

## Next Implementation Step

Before adding more models to `packages/types/src/models.json`, create a model-provider sync task that records:

- official source URL,
- source checked date,
- API model id,
- display name,
- provider,
- endpoint class,
- capabilities,
- context/output limits,
- pricing units,
- retention/privacy claim,
- deprecation date if any,
- local-runtime compatibility if any.

Then update the Desktop BYOK model selector to group providers by direct keys, open-model clouds, local runtimes, and managed beta.
