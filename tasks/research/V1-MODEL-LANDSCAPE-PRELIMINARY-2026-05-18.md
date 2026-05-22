# V1 model selection — preliminary landscape (2026-05-18)

**Author:** Claude Code (exploratory pass, ahead of research-engineer's 14-day formal report due 2026-05-31)
**Purpose:** Pre-research signal-gathering across GitHub, X, Reddit, dev community, model cards. Pins down major findings + constrains the candidate set the formal research validates.
**Status:** PRELIMINARY — not a locked picks list. Final catalog ships after `V1-MODEL-SELECTION-REPORT.md` May 31.

---

## TL;DR — 7 major shifts vs my prior assumptions

1. **Apple Foundation Models cannot process images today** ([source](https://www.remio.ai/post/integrating-on-device-ai-a-guide-to-apple-s-foundation-models-for-ios-26)). Multimodal is documented in API but **no image input support as of iOS 26.3**. Apple recommends pairing with Vision framework for image-to-text bridge.

2. **Apple Foundation Models is NOT a chat model.** Apple explicitly warns against code generation, math, factual Q&A, world knowledge, advanced reasoning ([source](https://www.natashatherobot.com/p/apple-foundation-models)). It's a system AI primitive for summarization / extraction / classification / structured output / guided generation. Our "Apple FM = primary on-device chat" positioning was wrong.

3. **Phi 4 Mini outperforms Llama 3.2 3B on every benchmark** ([source](https://www.promptquorum.com/power-local-llm/mobile-llm-models-phi4-gemma-smollm)). MMLU 73% vs 65%, MATH 62% vs 48%. ~2.7 GB Q4. MIT license. Should be our v1 default text chat model, not Llama 3.2 3B.

4. **Gemma 3n is the leading mobile-tuned multimodal model** ([source](https://developers.googleblog.com/en/introducing-gemma-3n-developer-guide/)). E2B (5B raw / ~2B effective) and E4B (8B raw / ~4B effective). Text + vision + audio. Google's LiteRT-optimized — NPU acceleration delivers 3× over GPU on prefill on Galaxy S25 Ultra ([source](https://developers.googleblog.com/litert-the-universal-framework-for-on-device-ai/)).

5. **Hammer 2.1 is the on-device function-calling specialist** ([source](https://huggingface.co/MadeAgents/Hammer2.1-3b)). Available in 0.5B / 1.5B / 3B / 7B (Qwen 2.5 coder base). Multi-step + multi-turn function calling. Competes with GPT-4o on BFCL v2 at 7B. Mobile-viable at 3B.

6. **MiniCPM-V 4.6 is the vision specialist for size-constrained devices** ([source](https://chatgate.ai/post/minicpm-v-4-6)). 1.3B params. Beats Gemma 4-E2B-it on OpenCompass + OCRBench. Real-time image + video on iOS/Android/HarmonyOS.

7. **`callstack/ai` is the production-ready React Native AI abstraction** ([source](https://github.com/callstackincubator/ai)). Vercel AI SDK compatible, multi-runtime (ExecuTorch + MediaPipe + Llama.cpp + MLX), unified provider for cloud + on-device, tool calling built-in. Saves us months of plumbing.

---

## §1 Production-shipping mobile chat apps (model picks to learn from)

These are mobile chat apps already in production on App Store / Play Store as of May 2026. Their model picks tell us what works.

| App                                                                                                               | Stack                                      | Models shipped                                             | Status                                                     |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------- |
| **Private Mind** ([App Store](https://apps.apple.com/us/app/private-mind/id6746713439), open source)              | react-native-executorch (Software Mansion) | Qwen 3, Llama 3.2, SmolLM 2, Hammer 2.1, CLIP, Whisper     | Reference RN app — proves the stack works in production    |
| **PocketPal AI** ([Play Store](https://play.google.com/store/apps/details?id=com.pocketpalai&hl=en), open source) | llama.rn (mybigday)                        | Any GGUF model — supports HuggingFace direct download      | Reference for llama.rn ecosystem                           |
| **MLC Chat** (Android)                                                                                            | MLC LLM runtime                            | Qwen3 1.7B + others, NPU-accelerated on Snapdragon Hexagon | Fastest Android — ~40 t/s on Galaxy S25 Ultra / OnePlus 13 |
| **Private LLM** (iOS)                                                                                             | Custom                                     | GGUF + custom                                              | App Store competitor                                       |
| **PocketLLM**                                                                                                     | Custom                                     | Custom small models                                        | On-device chat                                             |
| **Maid** (Android, F-Droid)                                                                                       | llama.cpp                                  | GGUF direct import                                         | Open-source purist option                                  |
| **Layla** (Android)                                                                                               | Curated                                    | Beginner-friendly curated set                              | UX-first                                                   |

**Key learning:** Hammer 2.1 ships in production today (Private Mind). Our "function calling specialist" path is proven.

---

## §2 Best on-device chat models (text)

| Model                                                                                                   | Size            | Params                | License           | Mobile-viable?      | Notes                                                                       |
| ------------------------------------------------------------------------------------------------------- | --------------- | --------------------- | ----------------- | ------------------- | --------------------------------------------------------------------------- |
| **Phi 4 Mini** ([Microsoft](https://localaimaster.com/models/phi-4-mini))                               | ~2.7 GB Q4      | 3.8B                  | MIT               | ✅ (4 GB RAM min)   | **BEST OVERALL benchmarks** — MMLU 73%, MATH 62%. Strong code. Strong JSON. |
| **Gemma 3 1B** ([Google LiteRT](https://huggingface.co/google/gemma-3n-E2B-it-litert-preview))          | ~600 MB Q4      | 1B                    | Gemma terms       | ✅ (low RAM)        | LiteRT-optimized, NPU-accelerated. Multimodal at 4B+ only.                  |
| **Gemma 3n E2B** ([Google](https://developers.googleblog.com/en/introducing-gemma-3n-developer-guide/)) | ~2 GB effective | 5B raw / 2B effective | Gemma terms       | ✅                  | **Multimodal native** (text+vision+audio). LiteRT-tuned.                    |
| **Gemma 3n E4B**                                                                                        | ~4 GB effective | 8B raw / 4B effective | Gemma terms       | ⚠️ (8 GB phone)     | Same multimodal capabilities, bigger budget                                 |
| **Llama 3.2 3B Instruct**                                                                               | ~2.2 GB Q4      | 3B                    | Llama 3 Community | ✅                  | Hindi support official. Beaten by Phi 4 Mini on benchmarks.                 |
| **Llama 3.2 1B Instruct**                                                                               | ~730 MB Q4      | 1B                    | Llama 3 Community | ✅                  | Tier 3 fallback. Weak tool calling.                                         |
| **SmolLM3-3B** ([HuggingFace](https://smollm3.com/))                                                    | ~2 GB Q4        | 3B                    | Apache 2.0        | ✅                  | /think and /no_think reasoning modes. 128K context. 6 languages.            |
| **Qwen 3 / 3.5 (2B, 4B)** ([Alibaba](https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct))                 | varies          | 2B / 4B               | Apache 2.0        | ✅                  | Strong multilingual incl Mandarin/Asian languages.                          |
| **Apple Foundation Models**                                                                             | 0 (system)      | ~3B                   | Apple entitlement | ✅ (iPhone 15 Pro+) | **NOT for chat** — summarization/extraction/structured-output primitive.    |
| **Gemini Nano v3**                                                                                      | 0 (system)      | ~3-4B                 | Google AICore     | ✅ (Pixel 10 only)  | Limited reach. Multimodal.                                                  |

---

## §3 Best on-device vision-language models

| Model                                                                | Size        | Params                  | Multimodal                       | Notes                                                                                        |
| -------------------------------------------------------------------- | ----------- | ----------------------- | -------------------------------- | -------------------------------------------------------------------------------------------- |
| **MiniCPM-V 4.6** ([source](https://chatgate.ai/post/minicpm-v-4-6)) | ~700 MB Q4  | 1.3B                    | Image + video                    | **Surpasses Gemma 4-E2B on OpenCompass + OCRBench.** Real-time. iOS/Android/HarmonyOS tuned. |
| **Gemma 3n E2B**                                                     | ~2 GB       | 5B/2B effective         | Text + image + audio             | LiteRT-tuned. NPU-accelerated.                                                               |
| **Gemma 3n E4B**                                                     | ~4 GB       | 8B/4B effective         | Text + image + audio             | Larger budget multimodal                                                                     |
| **Phi 4 Multimodal**                                                 | ~3 GB Q4    | ~4B                     | Text + image                     | Microsoft multimodal Phi                                                                     |
| **Qwen 3-VL 2B / 4B** ([source](https://github.com/QwenLM/Qwen3-VL)) | 1.5-3 GB Q4 | 2B / 4B                 | Text + image                     | Strong multilingual vision                                                                   |
| **Qwen 2.5-VL 3B**                                                   | ~2 GB Q4    | 3B                      | Text + image (+ document, video) | Dynamic-resolution ViT. AWQ-quantized variants available.                                    |
| **SmolVLM** ([HuggingFace](https://huggingface.co/blog/smolvlm))     | ~1 GB       | 1.7B (SmolLM2 + SigLIP) | Text + image sequence            | HuggingFace lightweight. Runs on consumer hardware.                                          |
| **PaliGemma**                                                        | ~2 GB       | 3B (2B + 400M SigLIP)   | Text + image                     | Google's multimodal Gemma                                                                    |
| **Moondream2**                                                       | ~1.2 GB     | 1.8B (Phi-1.5 + SigLIP) | Text + image                     | OCR/description/counting/classification. Edge-tuned.                                         |
| **Phi-4-Vision**                                                     | ~3 GB       | ~4B                     | Text + image                     | Microsoft. Good for AR glasses / kiosks.                                                     |
| **DeepSeek-VL2**                                                     | varies      | varies                  | Text + image                     | Edge-deployable                                                                              |
| **Pixtral**                                                          | varies      | varies                  | Text + image                     | Mistral multimodal                                                                           |

**Top picks for v1:**

- **MiniCPM-V 4.6** (1.3B, best benchmark/size ratio)
- **Gemma 3n E2B** (Google-canonical multimodal via LiteRT, native audio too)
- **Phi 4 Vision** (when license simplicity matters — MIT)

---

## §4 Best on-device tool-calling / function-calling models

The Berkeley Function Calling Leaderboard (BFCL) is the standard. Top picks as of 2026:

| Model                                                                                     | Size   | Notes                                                                                              |
| ----------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| **xLAM-2 8B** ([Salesforce](https://llm-stats.com/leaderboards/best-ai-for-tool-calling)) | 8B     | **#1 on BFCL — outperforms GPT-4o + Claude 3.5 Sonnet**. Too heavy for mobile but flagship-viable. |
| **Hammer 2.1 7B** ([MadeAgents](https://github.com/MadeAgents/Hammer))                    | 7B     | Competes with GPT-4o on BFCL v2. Heavy for mobile.                                                 |
| **Hammer 2.1 3B** ([source](https://huggingface.co/MadeAgents/Hammer2.1-3b))              | 3B     | **Mobile-viable.** Multi-step + multi-turn function calling. Qwen 2.5 coder base.                  |
| **Hammer 2.1 1.5B** ([source](https://huggingface.co/MadeAgents/Hammer2.1-1.5b))          | 1.5B   | Mid-range mobile. Strong for size.                                                                 |
| **Hammer 2.1 0.5B** ([source](https://huggingface.co/MadeAgents/Hammer2.1-0.5b))          | 0.5B   | Tier 3 mobile. Best function-calling for size class.                                               |
| **Mistral Small 3.2**                                                                     | varies | Tool-call specialist                                                                               |
| **ToolACE-trained 8B models**                                                             | 8B     | SOTA on BFCL via synthetic training                                                                |
| **NexusRaven**                                                                            | varies | Earlier specialist (likely superseded by Hammer/xLAM)                                              |

**Strong recommendation:** Use **Hammer 2.1** family as our function-calling specialist. Already shipping in production (Private Mind). MIT-license-compatible Qwen 2.5 coder base. Multi-size lineup covers all tiers.

---

## §5 Mobile inference runtimes

Three options, all production-grade:

### Option A — react-native-executorch (Software Mansion)

- **Repo:** `software-mansion/react-native-executorch`
- **NPM:** `react-native-executorch`
- **Backend:** PyTorch ExecuTorch
- **Supported models:** Qwen 3, Llama 3.2, SmolLM 2, Hammer 2.1, CLIP, Whisper, computer vision
- **Production app:** Private Mind (App Store + Play Store)
- **Pros:** Declarative API, RN-native, official Software Mansion support, broad model coverage
- **Cons:** ExecuTorch ecosystem is younger than llama.cpp

### Option B — llama.rn (mybigday)

- **Repo:** `mybigday/llama.rn`
- **Backend:** llama.cpp (C/C++)
- **Supported models:** Any GGUF
- **Production app:** PocketPal AI
- **Pros:** Massive GGUF ecosystem, mature llama.cpp, supports Hugging Face direct download
- **Cons:** Less NPU acceleration than ExecuTorch on iOS

### Option C — callstack/ai (Vercel AI SDK compatible)

- **Repo:** `callstackincubator/ai`
- **Backend:** ExecuTorch + MediaPipe + Llama.cpp + MLX (unified)
- **Compatibility:** Vercel AI SDK — `useChat()`, `useCompletion()`, etc. work out of the box
- **Tool calling:** Built-in
- **Apple Foundation Models:** Supported via Apple provider with tool calling
- **MLC LLM:** Supported via MLC runtime
- **Pros:** **Strongest production abstraction.** Unified API across runtimes + cloud + on-device. Vercel AI SDK compat means cloud-fallback is trivial when waitlist opens. Tool calling first-class.
- **Cons:** Newer than the others; production deployments still emerging.

**STRONG RECOMMENDATION: Adopt `callstack/ai` as our RN AI abstraction.** It:

- Wraps all the runtimes we'd otherwise pick separately (ExecuTorch + llama.cpp + MLX + MediaPipe)
- Gives us Vercel AI SDK compatibility — same code path for on-device today + cloud waitlist later
- Has tool calling built in (we need it for HealthKit, Calendar, MCP)
- Includes Apple Foundation Models support with tool calling
- Means our native-runtime-engineer can stop building custom bridges and instead integrate a maintained library

This is a **major plan update** — drop our custom-bridge plan in favor of `callstack/ai`. Software Mansion's `react-native-executorch` is the secondary fallback if `callstack/ai` doesn't ship something we need.

---

## §6 Apple Foundation Models — corrected understanding

**What Apple FM IS:**

- A system-provided AI primitive for: summarization, extraction, classification, structured output, guided generation, tool calling, light language understanding
- Free at inference, no API keys, works offline
- 4K context window (today; may expand at WWDC26)
- `@Generable` schema for type-safe structured output
- Adapter (LoRA) training supported
- iOS 26+, iPad M-series, Mac M-series, Vision Pro, paired Apple Watch

**What Apple FM is NOT:**

- Image input (text-only as of iOS 26.3 — workaround: Vision framework → text → FM)
- Code generation (Apple explicitly warns against)
- Math (Apple explicitly warns against)
- Factual Q&A / world knowledge (severe limitations)
- Advanced reasoning
- A drop-in chat model

**What v1 should do with Apple FM:**

- Use it for: structured output extraction (parsing user prompts into intent + parameters), summarization of long chat threads, classification (is this query about HealthKit vs general?), guarded generation when we need deterministic JSON
- Do NOT use it for: primary user-facing chat responses
- Pair it with Phi 4 Mini (for chat) + Apple Vision (for OCR) + system Speech (for STT) on iPhone 15 Pro+ devices

**Developer pain points to be aware of:**

- Guardrails create false positives — needs extensive testing per prompt
- Beta seeds can break working features (one developer: 95% → 0% success rate in a beta update)
- Non-deterministic — regressions can land silently

---

## §7 Recommended v1 model stack (PRELIMINARY)

This list is what model-catalog-engineer scaffolds against. **Specific picks land in catalog.ts after research-engineer's May 31 report.**

| Tier                                                                                  | Default chat                                     | Default vision                        | Function-call specialist  | Notes                                                                           |
| ------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------- | ------------------------- | ------------------------------------------------------------------------------- |
| **iOS Tier 1** (iPhone 15 Pro+, iPad M, Mac M)                                        | **Phi 4 Mini** (via `callstack/ai` / ExecuTorch) | **MiniCPM-V 4.6** OR Gemma 3n E2B     | **Hammer 2.1 3B**         | Apple FM as side-by-side system primitive for summarization + structured output |
| **iOS Tier 2** (A15+ iPhone)                                                          | **Phi 4 Mini**                                   | **MiniCPM-V 4.6**                     | **Hammer 2.1 1.5B** or 3B |                                                                                 |
| **Android Tier 1** (Pixel 10, Galaxy S26, OnePlus 15, eligible)                       | **Gemma 3n E4B via LiteRT**                      | Gemma 3n E4B (native multimodal)      | Hammer 2.1 3B via LiteRT  | Google's canonical path                                                         |
| **Android Tier 2** (Snapdragon 7 Gen 1+, mid-range, Redmi/Realme/Vivo Y/Oppo A class) | **Phi 4 Mini OR Gemma 3n E2B**                   | **Gemma 3n E2B** OR **MiniCPM-V 4.6** | **Hammer 2.1 1.5B**       | India primary tier                                                              |
| **Tier 3** (older devices, < 4GB RAM, < 256GB storage)                                | **Llama 3.2 1B** (via llama.rn)                  | MiniCPM-V 4.6 (still fits)            | **Hammer 2.1 0.5B**       | Fallback                                                                        |

**Model files to provision in `packages/local-llm/src/catalog.ts` scaffolding:**

- `phi-4-mini-instruct-q4` (~2.7 GB, MIT)
- `gemma-3n-e2b-it-litert` (~2 GB effective, Gemma terms)
- `gemma-3n-e4b-it-litert` (~4 GB effective, Gemma terms)
- `gemma-3-1b-it-litert` (~600 MB, Gemma terms)
- `minicpm-v-4-6-q4` (~700 MB, vision specialist)
- `hammer-2.1-3b-q4` (~2 GB, tool-call specialist, MIT-derived)
- `hammer-2.1-1.5b-q4` (~1 GB, mid-range tool calls, MIT-derived)
- `hammer-2.1-0.5b-q4` (~400 MB, Tier 3 tool calls, MIT-derived)
- `llama-3.2-1b-instruct-q4` (~730 MB, Llama Community, Tier 3 fallback)
- `smollm3-3b-q4` (~2 GB, Apache 2.0, alt chat option)
- `qwen3-vl-4b-instruct-q4` (~3 GB, Apache 2.0, alt vision option)

---

## §8 Architecture changes to the plan

### 1. Drop "Apple FM = iOS hero chat" framing

Replace with: **"On iOS, AGI runs Phi 4 Mini for chat + uses Apple's Foundation Models for structured output assists + uses Apple Vision for OCR/image understanding."**

### 2. Adopt callstack/ai as our RN AI abstraction

This replaces our plan to build custom executorch / llama.rn / Apple FM bridges. native-runtime-engineer's scope shifts from "build bridges" to "integrate callstack/ai + validate on real devices + contribute back any missing pieces."

### 3. Lock Hammer 2.1 family as tool-calling specialist

Don't try to make Llama 3.2 3B do function calls. Route tool-call-heavy paths to Hammer 2.1 (3B for Tier 1/2, 1.5B for mid, 0.5B for Tier 3).

### 4. Gemma 3n family is the multimodal hero on Android

For Android Tier 1 + 2, default to Gemma 3n via LiteRT. Multimodal (text + vision + audio) in a single model. Google-canonical.

### 5. MiniCPM-V 4.6 as the vision fallback when Gemma is too big

When the device or storage budget doesn't fit Gemma 3n E2B, fall back to MiniCPM-V 4.6 (1.3B). Beats Gemma E2B on vision benchmarks for a fraction of the size.

### 6. Phi 4 Mini wins the chat default crown over Llama 3.2 3B

Pure benchmark + license + size tradeoff. Llama 3.2 3B becomes the Hindi-specific fallback (because Llama has Hindi in its 8 official languages).

---

## §9 Sources

### GitHub repos referenced (canonical)

- [software-mansion/react-native-executorch](https://github.com/software-mansion/react-native-executorch) — RN ExecuTorch toolkit
- [mybigday/llama.rn](https://github.com/mybigday/llama.rn) — RN llama.cpp binding
- [callstackincubator/ai](https://github.com/callstackincubator/ai) — RN AI with Vercel AI SDK compatibility
- [MadeAgents/Hammer](https://github.com/MadeAgents/Hammer) — Hammer function-calling models
- [QwenLM/Qwen3-VL](https://github.com/QwenLM/Qwen3-VL) — Qwen vision-language family
- [huggingface/smollm](https://github.com/huggingface/smollm) — SmolLM + SmolVLM family
- [rudrankriyam/Foundation-Models-Framework-Example](https://github.com/rudrankriyam/Foundation-Models-Framework-Example) — Apple FM examples
- [Dimillian/FoundationChat](https://github.com/Dimillian/FoundationChat) — Apple FM chat reference
- [Khalidelommali/Foundation-Model-Tutorial](https://github.com/Khalidelommali/Foundation-Model-Tutorial) — Apple FM iOS 26 tutorial w/ tools

### Production apps (App Store / Play Store)

- [Private Mind](https://apps.apple.com/us/app/private-mind/id6746713439) — RN-ExecuTorch, models: Qwen 3, Llama 3.2, SmolLM 2, Hammer 2.1
- [PocketPal AI](https://play.google.com/store/apps/details?id=com.pocketpalai&hl=en) — llama.rn, any GGUF
- [Apple-Intelligence-Chat](https://github.com/PallavAg/Apple-Intelligence-Chat) — Apple FM chat reference

### Benchmark sources

- [Best Mobile LLM Models 2026: Phi-4 Mini vs Gemma 3 vs SmolLM](https://www.promptquorum.com/power-local-llm/mobile-llm-models-phi4-gemma-smollm)
- [Best Local LLM Apps for Android in 2026](https://www.promptquorum.com/power-local-llm/best-local-llm-apps-android-2026)
- [I Tested 13 Local LLMs on Tool Calling | 2026 Eval Results](https://www.jdhodges.com/blog/local-llms-on-tool-calling-2026-pt1-local-lm/)
- [Best AI for Tool Calling 2026 — LLM Stats](https://llm-stats.com/leaderboards/best-ai-for-tool-calling)
- [Top 10 Vision Language Models in 2026 | Benchmark](https://dextralabs.com/blog/top-10-vision-language-models/)

### Tech papers

- [Hammer: Robust Function-Calling for On-Device Language Models](https://arxiv.org/html/2410.04587v2)
- [ToolACE: Winning the Points of LLM Function Calling](https://arxiv.org/html/2409.00920v1)
- [Qwen3-VL Technical Report (arXiv 2511.21631)](https://arxiv.org/abs/2511.21631)
- [SmolVLM: Redefining small and efficient multimodal models](https://www.researchgate.net/publication/390601640_SmolVLM_Redefining_small_and_efficient_multimodal_models)

### Google official

- [LiteRT: The Universal Framework for On-Device AI](https://developers.googleblog.com/litert-the-universal-framework-for-on-device-ai/)
- [Introducing Gemma 3n: The developer guide](https://developers.googleblog.com/en/introducing-gemma-3n-developer-guide/)
- [Gemma 3 Technical Report (arXiv)](https://arxiv.org/pdf/2503.19786)
- [google/gemma-3n-E2B-it-litert-preview](https://huggingface.co/google/gemma-3n-E2B-it-litert-preview)

### Apple official

- [Apple's Foundation Models framework — Apple Newsroom Sep 2025](https://www.apple.com/newsroom/2025/09/apples-foundation-models-framework-unlocks-new-intelligent-app-experiences/)
- [Acceptable use requirements — Foundation Models framework](https://developer.apple.com/apple-intelligence/acceptable-use-requirements-for-the-foundation-models-framework/)
- [Foundation Models | Apple Developer Documentation](https://developer.apple.com/documentation/FoundationModels)
- [Meet the Foundation Models framework — WWDC25 video](https://developer.apple.com/videos/play/wwdc2025/286/)

### Developer reception / limitations

- [Apple's FoundationModels: Limitations, Capabilities, Tools (Natasha The Robot)](https://www.natashatherobot.com/p/apple-foundation-models)
- [Integrating On-Device AI: A Guide to Apple's Foundation Models for iOS 26](https://www.remio.ai/post/integrating-on-device-ai-a-guide-to-apple-s-foundation-models-for-ios-26)
- [Apple Foundations Models Framework — 10 Best Practices](https://datawizz.ai/blog/apple-foundations-models-framework-10-best-practices-for-developing-ai-apps)
- [Apple Foundation Models Tutorial iOS 26 [2025]](https://www.iphonedevelopers.co.uk/2025/07/apple-foundation-models-ios-tutorial.html)
- [Foundation Models framework — Apple Developer Forums thread](https://developer.apple.com/forums/thread/793599)

### Callstack tutorials

- [How to Run LLMs on-device in React Native with Vercel AI SDK](https://www.callstack.com/blog/meet-react-native-ai-llms-running-on-mobile-for-real)
- [MLC LLM + React Native: On-Device AI Without the Pain](https://www.callstack.com/tutorials/mlc-llm-react-native-on-device-ai-without-the-pain)
- [Build Smarter Apps: Tool Calling & AI Orchestration Explained](https://www.callstack.com/tutorials/build-smarter-apps-tool-calling-ai-orchestration-explained)
- [What Is the React Native AI SDK? A Complete Intro](https://www.callstack.com/tutorials/what-is-the-react-native-ai-sdk-a-complete-intro-quickstart)

---

## §10 Open questions for research-engineer's 14-day formal report

The preliminary findings narrow the candidate set. research-engineer should validate with measured benchmarks:

1. **Phi 4 Mini real-device tok/s** on iPhone 13 Pro Max (A15), iPhone 15 Pro (A17), Pixel 7a, Pixel 8 Pro, Snapdragon 7 Gen 1 mid-range
2. **Hammer 2.1 3B BFCL benchmarks** in our specific tool-call use cases (HealthKit query, Calendar write, MCP server invocation)
3. **MiniCPM-V 4.6 vision quality** on global diverse subjects (food, currency, signage in Hindi/Mandarin/Arabic, charts)
4. **Gemma 3n E2B vs E4B** on real Android mid-range hardware
5. **callstack/ai production maturity** — bug reports, breaking change frequency, support responsiveness. Worth depending on for v1?
6. **Apple FM + Phi 4 Mini composition pattern** — can we route summarization to FM and chat to Phi 4 Mini smoothly?
7. **Hindi quality:** Phi 4 Mini vs Llama 3.2 3B vs Gemma 3n vs Qwen 3 — which actually produces good Hindi chat output (not just claims it)?
8. **Tier 3 sub-1B viability** — is Qwen 2.5 0.5B / Hammer 0.5B actually useful, or should we just refuse to install on devices that can't run 1B+?

---

## §11 Recommended next plan updates

After the founder reviews this preliminary report, the plan should:

1. **Update LLM lineup table** in plan: replace Llama 3.2 3B as primary text model with Phi 4 Mini; add Gemma 3n E2B/E4B; add Hammer 2.1 family for tool calls; add MiniCPM-V 4.6 for vision.

2. **Update positioning copy**: "AGI runs Phi 4 Mini for chat + Apple Foundation Models for structured-output assists + Apple Vision for OCR on iOS. On Android, AGI runs Gemma 3n via LiteRT — Google's own canonical mobile multimodal model."

3. **Adopt `callstack/ai` library** as the RN AI abstraction. native-runtime-engineer's scope: integrate + validate + contribute back, NOT build custom bridges from scratch.

4. **Add Hammer 2.1 to scope** for the tool-call-heavy paths (HealthKit, Calendar, MCP).

5. **Update model-catalog-engineer scaffolding list** to the §7 preliminary picks.

6. **Tighten Apple FM use cases** — internal-only structured output / summarization, NOT user-facing chat.

7. **Update App Store screenshot copy** — replace "Apple FM = primary chat" with "Phi 4 Mini on your device + Apple FM for instant summaries."

---

End of preliminary report. research-engineer's formal report May 31 supersedes specific picks; this report's role is to bound the candidate set + correct Apple FM positioning.
