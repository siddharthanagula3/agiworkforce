# V1 on-device model selection — from the user perspective (GLOBAL)

**Authored:** 2026-05-18 · **Owner:** research-engineer · **Due:** 2026-05-31 (Wave 0 Day 14)
**Timeline:** 14-day thorough — full benchmark suite + real-device tests + global multilingual coverage + open-source GitHub scan
**Output:** `tasks/research/V1-MODEL-SELECTION-REPORT.md` (~5000-7000 words)
**Gates:** Population of `packages/local-llm/src/catalog.ts` + vision architecture decision (Path A / B / C per plan)

---

## Frame

Users have ZERO LLM knowledge — globally. Pitch: "AGI on your device. Free. Works in airplane mode. Like ChatGPT/Claude/Gemini." If responses feel obviously dumber than the cloud apps users already know, our trust signal collapses. Don't optimize for tech-buyer appeal; optimize for "my mom can use this."

This evaluation is for **GLOBAL ship**. India is one specific launch market but the underlying model quality bar is universal: every recommended model must perform competitively for English-language users worldwide (US, EU, India, LATAM, SEA, MENA, East Asia), plus measurably support the top 10 in-scope languages for the launch window.

## Must-haves per candidate model

1. **Multi-turn chat quality** competitive with GPT-4o-mini / Claude Haiku 4 / Gemini 2 Flash on everyday tasks (write an email, summarize, brainstorm, factual Q&A, simple code help). Benchmarked on standard suites + real-world spot checks.

2. **Image understanding**:
   - Native: model accepts image input directly, OR
   - Via tool: model reliably calls a vision tool / MCP server / Apple Vision and uses the result. Quality must be comparable for the user — no visible degradation.

3. **Tool calls / MCP reliability**:
   - Format compliance (well-formed JSON)
   - Multi-turn chain (query → format → answer)
   - MCP-wrappable (thin glue, not deep rewrites)

4. **Runs on consumer hardware across markets**:
   - iPhone 13 / 13 Pro Max (A15, 4-6 GB RAM) — global mid-tier
   - Pixel 7a / 8a (mid Tensor) — US/EU primary
   - Snapdragon 7 Gen 1 / 8 Gen 1 Android (Redmi Note 13/14, Vivo Y200 class) — India / SEA primary
   - Snapdragon 8 Gen 2 / 3 (Galaxy S23/S24 mid) — global flagship floor
   - Floors: ≥ 5 t/s, ≤ 3s first-token, ≤ 2.5 GB Q4 disk per model

5. **Free / commercially usable, supports 10M+ MAU under license terms**

6. **Language coverage** — model should not catastrophically fail in:
   - English (global default)
   - Top European: Spanish, French, German, Portuguese, Italian, Polish
   - Top Asian: Mandarin, Japanese, Korean, Hindi, Bengali, Tamil, Indonesian, Vietnamese
   - Top LATAM: Brazilian Portuguese, Spanish
   - MENA: Arabic (verify RTL support)
     Need not be fluent in all — but no catastrophic refusals or garbage output.

---

## Candidate set to survey (May 2026)

### Mainstream model families

- Llama 3.2 family (3B, 1B, Vision 11B/90B)
- Llama 4 if shipped + mobile-friendly variants
- Phi 3.5 / Phi 4 family (mini, vision)
- Qwen 2.5 / Qwen 3 family (especially VL variants)
- Gemma 2 / Gemma 3 family (latest multimodal)
- MiniCPM-V family (specifically tuned for on-device vision)
- InternVL 2.x / 3.x, LLaVA-OneVision, InternLM-XComposer
- Liquid Foundation Models (LFM-2)
- DeepSeek small variants (V2-Lite etc.)
- Mistral small variants (Ministral)
- Apple Foundation Models (system, iOS 26+)
- Gemini Nano v3 (system, Android 17 eligible devices)
- Anything else shipped 2025-2026 in this size class

### Open-source GitHub scan (REQUIRED — not just HuggingFace mainstream)

Search GitHub explicitly for relevant repos:

- `ggerganov/llama.cpp` — GGUF runtime + community-quantized models in HF releases
- `mlc-ai/mlc-llm` — universal mobile inference + included models
- `mlc-ai/mlc-chat-android`, `mlc-ai/mlc-chat-ios` — reference apps; what models do they ship?
- `pytorch/executorch` examples + community ports + supported models
- `apple/ml-explore` (MLX) — Apple Silicon models + ports
- `huggingface/transformers` + `huggingface/text-generation-inference` discussions for on-device candidates
- `nomic-ai/gpt4all` model library + benchmarks
- `ollama/ollama` model library — what they bundle, why
- `LostRuins/koboldcpp` model recommendations
- `vllm-project/vllm` community-recommended small models
- `oobabooga/text-generation-webui` model lists
- `SillyTavern/SillyTavern` mobile-focused recommendations
- Mobile chat OSS apps (Pocket Pal AI etc.) — what production models do they ship?
- Apple `swift-transformers`, `swift-coreml-transformers`
- `tensorflow/tflite-micro` + on-device TFLite Gemma/Phi ports
- React Native specific: search for `react-native-llama`, `react-native-llm`, `expo-llama`
- Community fine-tunes for non-English (Hindi-tuned Llama, Tamil-tuned, Bengali-tuned, Mandarin-tuned, Arabic-tuned) — these may close language-quality gaps without changing base model
- Specialized small vision models (e.g. `vikhyatk/moondream2`, `THUDM/visualglm-6b`)
- Tool-calling-specialized small models (e.g. NexusRaven, ToolLlama, Hammer-7B, xLAM)
- Any GitHub repo with `mobile`, `on-device`, `edge`, `tiny`, `nano`, `local`, `private` in the name + LLM context

For each GitHub-discovered candidate report: stars, last-commit date, license, claimed performance, who's deploying it in production, community sentiment.

---

## Research deliverables

### §1. Candidate inventory

For each candidate (mainstream + GitHub-discovered): params, modality (text/vision/audio), tool-call support, MCP compat, license terms, Q4 size, release date, where it currently runs in production.

### §2. Cloud benchmark comparison

For top 5 candidates, real measured numbers (not marketing claims) on:

- MMLU + MMLU-Pro (general knowledge)
- BBH (reasoning)
- HellaSwag (commonsense)
- GSM8K (math)
- HumanEval / MBPP (code)
- MMMU (multimodal text+vision)
- ChartQA (charts/tables)

Compare each to GPT-4o-mini / Claude Haiku 4 / Gemini 2 Flash. Deltas in %.

### §2.5. Multilingual benchmarks

- MGSM (multilingual math, 11 languages)
- FLORES-200 or XLSum (multilingual summarization quality)
- Report per-language quality drops vs English baseline

### §3. Real-world UX (global app review pass)

For top 3 candidates, find iOS/Android apps already shipping these models (Pocket Pal, Private LLM, MLC Chat, Ollama mobile, LM Studio Mobile, etc.). Read App Store + Play Store reviews across multiple regions (US, UK, IN, BR, ID, DE, JP, MX) — English plus translated where possible. Report:

- Common complaints
- Common praises
- Failure modes (loops, refuses, hallucinations, long-context degradation)
- Region-specific or language-specific issues

### §4. Vision quality (globally diverse subjects, NOT India-only)

Test prompts: "what's in this image" against globally diverse subjects:

- Food: Western, Indian, East Asian, Latin American, African, MENA dishes
- Currency: USD, EUR, GBP, INR, JPY, BRL, IDR, MXN
- Signage / OCR: English, Hindi, Mandarin, Japanese, Arabic, Cyrillic
- Documents: receipts, invoices, forms in various languages
- Charts / diagrams / whiteboard photos
- Family / portrait scenes from multiple cultures
- Outdoor / nature / wildlife
- Brand recognition (cars, logos, products — globally varied)

Compare to GPT-4o-vision / Claude vision / Gemini vision. Identify failure cases per category and region.

For text-only candidates: evaluate Apple-Vision-OCR + text-LLM pipeline (and Android ML Kit equivalent) vs dedicated vision encoder. Latency, quality, user-visible delta.

### §5. Tool call / MCP reliability

For top 3 candidates, run BFCL-style tests (Berkeley Function Calling Leaderboard):

- Single tool call
- Multi-turn tool chain (query → format → answer)
- Nested schemas with complex parameters
- Error recovery + partial parameter prompts

Write thin MCP wrapper for each model's tool-call format. Measure end-to-end MCP success rate per task class.

### §6. Recommended shipping configuration

Concrete picks:

- **Primary on-device model** (default for most users, tier-aware)
- **Vision capability** — native multimodal model OR text-model + vision-tool path (justify choice from §2-§5 evidence). Choose **Path A** (native multimodal), **Path B** (text + vision tool), or **Path C** (mixed per tier — system models native, downloaded text+tool).
- **Storage-constrained fallback** (Tier 3)
- **Justification per pick** (benchmarks + real-world + tool-call data)
- **Per-pick risks** (e.g. "Llama 3.2 3B is fine but Hindi/Bengali quality is noticeably weaker than English — consider fine-tune in v1.1")
- **Alternative configurations** if launch timeline forces narrower scope

---

## Anti-deliverables

- No recommendations without measured benchmarks (no vibe-checks)
- No cloud-only models (we're on-device v1)
- No restrictive-license models (research-only, sub-100M-MAU caps)
- No "coming soon" models without published weights
- No anchoring on what other apps use without verifying their model is current
- No model-card paraphrasing without independent verification
- **No India-only evaluations** (this is a global ship — India is one market)
- **No US-centric assumptions either** (this is for global users)

---

## Verification

- [ ] Every factual claim has a primary-source URL (model card, paper, app review, blog post, GitHub release)
- [ ] Every benchmark number has a citation
- [ ] Every license claim verified against current upstream terms
- [ ] Language coverage tested across ≥6 markets (US/UK/IN/BR/JP/DE/MX)
- [ ] Vision categories tested globally (food, currency, signage, brands, portraits, charts — NOT single region)
- [ ] WWDC 2026 Apple FM expansion factored in (if known by 2026-05-31)
- [ ] Gemini Intelligence Android constraint factored in
- [ ] All recommended models obtainable legally (HuggingFace official, vendor download, system framework, GitHub release)
- [ ] Report frames India as ONE launch market among many — NOT the dominant evaluation frame
- [ ] GitHub scan section included (separate from HuggingFace mainstream)
