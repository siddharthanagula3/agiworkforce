# V1 On-Device Model Selection for Global Users — Final Report

**Delivered:** 2026-05-18 (ahead of original 2026-05-31 schedule)
**Status:** ✅ LOCKED — supersedes preliminary `V1-MODEL-LANDSCAPE-PRELIMINARY-2026-05-18.md`
**Decision:** Ship **Path C** — mixed system-native multimodal + downloaded text model
**Primary model:** **Qwen3-4B-Instruct-2507**

---

## Recommendation

Ship Path C. Use **Qwen3-4B-Instruct-2507** as the default downloaded text model, use **Apple Foundation Models** on Apple Intelligence devices and **AICore / ML Kit GenAI** on supported Android devices for native on-device multimodal assist, and keep any 1B-class fallback behind an explicitly labeled **Lite** switch instead of making it the default. That is the most defensible global v1 because the public evidence still does not show a single small open model that is simultaneously:

- cloud-mini-competitive in everyday chat
- strong enough in multilingual use
- natively multimodal
- under the 2.5 GB Q4 disk budget
- realistically deployable across iPhone 13, Pixel 7a/8a, and Snapdragon 7 / 8 class Android phones

---

## Locked picks

| Role                                         | Model                                        | Size                         | License           | Where it runs                                                                        |
| -------------------------------------------- | -------------------------------------------- | ---------------------------- | ----------------- | ------------------------------------------------------------------------------------ |
| **Default downloaded text brain**            | **Qwen3-4B-Instruct-2507**                   | 4.0B / ~2 GB Q4              | **Apache-2.0**    | All supported devices (universal)                                                    |
| **Native multimodal — Apple side**           | Apple Foundation Models + Vision framework   | 3B (system)                  | Apple entitlement | Apple Intelligence devices (iPhone 15 Pro+, iPad M, Mac M, Vision Pro, paired Watch) |
| **Native multimodal — Android side**         | AICore / ML Kit GenAI (Gemini Nano variants) | system                       | Google AICore     | Supported AICore devices (Pixel 9/10+ class)                                         |
| **Premium optional vision pack**             | Qwen2.5-VL-3B-Instruct (preferred)           | 3B                           | Apache-2.0        | Devices with storage + RAM headroom                                                  |
| **Premium native multimodal (premium pack)** | Gemma 4 E4B                                  | 8B-with-embeddings, ~4 GB Q4 | Gemma terms       | Premium devices only (busts 2.5 GB budget for universal default)                     |
| **Lite-mode storage fallback**               | Llama 3.2 1B QLoRA / SpinQuant               | 1B / ~1.1 GB                 | Llama Community   | Lite switch (user opt-in, never silent default)                                      |
| **Internal evaluation hedge**                | Phi-4-mini-instruct                          | 3.8B                         | MIT               | Not shipped — strict-JSON/extraction reliability baseline only                       |

---

## Why Qwen3-4B-Instruct-2507 as default

1. **Apache-2.0**, no distribution friction
2. **262,144-token context window**
3. **Multilingual reach** — Qwen3 family expanded from 29 → 119 languages and dialects
4. **Real product metrics published** — MMLU-Pro 69.6, MMLU-Redux 84.2, GPQA 62.0, AIME25 47.4, LiveBench 63.0, LiveCodeBench v6 35.1, WritingBench 83.4, Arena-Hard v2 43.4, BFCL-v3 61.9, MultiIF 69.0, MMLU-ProX 61.6, INCLUDE 60.1
5. **Real ecosystem momentum** — Hugging Face quantization community is active; supports llama.cpp, Ollama, LM Studio, MLX-LM out of the box
6. **Plausible 2.5 GB Q4 packaging** — 4B dense parameters → roughly 2 GB raw at 4-bit, edge of budget but achievable
7. **Agentic Use section** with explicit MCP examples via Qwen-Agent — proves the tool-call story works

## Why NOT Gemma 4 E4B as universal default

Gemma 4 E4B is the **strongest small native multimodal candidate on paper** — MMLU-Pro 69.4, GPQA Diamond 58.6, MMMU-Pro 52.6, MATH-Vision 59.5, native function calling, 140+ pretraining languages, 35+ supported out of the box.

**But:** Google's own card states **4.5B effective parameters / 8B with embeddings**. A 4-bit floor for 8B total params is ~4 GB before metadata + non-quantized tensors. **Busts the 2.5 GB universal budget by ~60%.** Premium devices fine; mass-market global default no.

## Why NOT Llama 3.2 3B as default

- **Llama Community license** (not permissive Apache/MIT)
- **Only 8 official languages** (EN, DE, FR, IT, PT, Hindi, ES, TH) — misses Arabic, Japanese, Korean, Bengali, Tamil, Polish, Indonesian, Vietnamese
- Best **mobile packaging evidence** (ExecuTorch metrics on OnePlus 12 are clean — 19.7 tok/s, 0.7s TTFT, 2435 MB) but narrow language envelope kills it for global default

## Why NOT Apple FM as universal default

- **Apple Intelligence excludes iPhone 13** — large chunk of our global floor unavailable
- **Language envelope narrower than global needs**: EN, FR, DE, IT, BR-PT, ES, ZH-CN, JA, KO. **No Hindi, Bengali, Tamil, Arabic, Indonesian, Vietnamese, Polish.**
- Text-only today (no image input as of iOS 26.3)
- Excellent **system-native primitive** when available, but cannot stand alone

## Why NOT AICore / Gemini Nano as universal Android default

- Current device matrix begins at **Pixel 9 (nano-v2)** and **Pixel 10 (nano-v3)** plus a growing premium Android OEM list
- **Excludes Pixel 7a/8a and the broader Snapdragon 7-class mid-range Android** that constitutes our India launch floor
- Foreground-only inference + per-app quotas
- Valuable additive layer where available; cannot stand alone

---

## Cloud-gap reality (don't pretend we match GPT-4o mini)

Microsoft's published Phi-4-mini comparative table (best aligned cross-model benchmark available):

| Metric        | Phi-4-mini | Llama 3.2 3B | Qwen2.5 3B | GPT-4o mini (cloud) | Claude Haiku (cloud) | Gemini Flash (cloud) |
| ------------- | ---------- | ------------ | ---------- | ------------------- | -------------------- | -------------------- |
| MMLU          | 67.3       | 61.8         | 65.0       | **82.0**            | 73.8                 | 77.9                 |
| MGSM          | 63.9       | 49.6         | 53.5       | **87.0**            | 71.7                 | 75.5                 |
| HumanEval     | 74.4       | 62.8         | 72.0       | **87.2**            | 75.9                 | 71.5                 |
| BFCL          | 70.3       | 78.6         | 74.2       | —                   | —                    | —                    |
| MMMU (vision) | —          | —            | —          | **59.4**            | 50.2                 | 56.1                 |

**Translation:** the best validated small open text model (Phi-4-mini) still trails GPT-4o mini by **~14.7 MMLU, ~23.1 MGSM, ~12.8 HumanEval**. Qwen3-4B isn't on this aligned table but its own card numbers suggest similar territory.

**Product implication:** v1 must NOT claim "like ChatGPT/Claude/Gemini" — that promise can't be kept at 4B. Claim what we actually have: "fast, private, offline AI on your phone — good at writing / summarizing / translating / image understanding on supported devices."

---

## Vision architecture (Path C in detail)

**Apple Intelligence devices:**

- Apple Foundation Models for guided generation + tool calling + structured output
- Apple Vision framework (`VNRecognizeTextRequest`) for OCR + scene analysis + on-device text recognition
- Pattern: Apple News reference apps already combine FM + Vision for Scan Mode / video analysis / PDF citation extraction

**Supported AICore Android devices** (Pixel 9/10+, recent flagships):

- ML Kit GenAI APIs (Image Description, Summarization, Proofreading, Rewriting)
- Prompt API where available
- Foreground-only + per-app quotas constraints

**Unsupported devices (iPhone 13, Pixel 7a/8a, mid-tier Snapdragon Android):**

- Text model (Qwen3-4B) + OCR/document tooling via Apple Vision (iOS) / ML Kit Text Recognition (Android)
- Sufficient for: receipts, invoices, signage, forms, screenshots, scanned pages
- **Not sufficient for:** culturally diverse food photos, portraits, wildlife, logos, ambiguous real-world images — surface gracefully ("AGI can read text from this image — full image understanding is available on newer devices")
- Optional download of **Qwen2.5-VL-3B-Instruct** for users who want native vision and have storage headroom

---

## Tool-calling architecture

| Use case                                                             | Primary path                                           | Notes                                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| **Standard tool calls (MCP, HealthKit query, Calendar write, etc.)** | Qwen3-4B + thin MCP wrapper via Qwen-Agent pattern     | BFCL-v3 61.9 is solid for everyday tool use                                  |
| **Strict JSON / extraction / structured tasks**                      | Internal eval against Phi-4-mini (BFCL 70.3) as hedge  | If Qwen3-4B fails an extraction repeatedly, fall back to Phi-4-mini per-task |
| **Native tool calling on Apple Intelligence devices**                | Apple FM `@Generable` schema + tool descriptors        | Use for in-iOS structured output where available                             |
| **Function calling reliability metric**                              | 95%+ JSON parse success on our top 20 structured tasks | Ship gate                                                                    |

---

## GitHub ecosystem signals (May 16-18, 2026)

| Project          | Stars  | License    | Latest commit                                      | Notes                                                                                                                                 |
| ---------------- | ------ | ---------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **llama.cpp**    | ~111k  | MIT        | May 16-18                                          | Portability king. Recent multimodal + MCP tool-call work. Downstream: LM Studio, GPT4All, Ollama, PocketPal AI, koboldcpp, llamafile. |
| **MLC-LLM**      | ~22.7k | Apache-2.0 | May 11                                             | Universal mobile/web compilation. Active engine, MLC Chat Android APK release trail comparatively stale.                              |
| **ExecuTorch**   | ~4.6k  | BSD        | May 18 (Gemma 4 + Android LLM runner docs landing) | Official mobile stack for Meta + cross-family.                                                                                        |
| **PocketPal AI** | ~7k    | MIT        | May 12 (release)                                   | Consumer mobile shell. Phi + Gemma + Qwen support. 1M+ Play Store installs, 3.5-star — real demand + real friction.                   |

**Runtime recommendation:** llama.cpp via `callstack/ai` abstraction (preserves Vercel AI SDK compatibility for cloud-fallback when waitlist opens) is the strongest path. ExecuTorch as Apple-side alternative when iOS-specific packaging discipline is needed.

---

## Mobile runtime evidence (Llama 3.2 reference numbers)

Meta's official ExecuTorch packaging on OnePlus 12 Android, ARM CPU backend:

| Package      | Tokens/sec | TTFT | Model size | RSS     |
| ------------ | ---------- | ---- | ---------- | ------- |
| 3B SpinQuant | 19.7       | 0.7s | 2435 MB    | 3726 MB |
| 3B QLoRA     | 18.5       | 0.7s | 2529 MB    | 4060 MB |
| 1B QLoRA     | 45.8       | 0.3s | 1127 MB    | —       |

**Takeaway:** 3B text models can meet latency floor on modern flagship Android. **2.5 GB disk budget is extremely tight** even for text-only 3B — Meta's own packaging has one 3B artifact just under, one just over.

---

## Success metrics (v1 ship-gate criteria)

These are the **5 product metrics** that gate launch. Not benchmark aesthetics.

1. **Performance floor**: p50 generated-token speed ≥ **7 tok/s** on supported 4B text installs, TTFT under **2.2s** on a 64-token prompt for the primary model on the supported tier matrix.
2. **First-run clarity**: ≥ **90% of users** who finish download/setup get a successful first reply without touching advanced settings.
3. **Tool reliability**: **95%+ JSON parse success** on the top 20 structured tasks we actually ship, measured end-to-end through MCP wrapper.
4. **Vision honesty**: < **2% of photo tasks** trigger "this answer was useless / wrong modality" complaints on supported devices. Unsupported devices fail gracefully into OCR/document mode instead of pretending.
5. **Global usefulness**: complaint rates in the first **6 launch markets** show no single supported language producing more than **1.5×** the "bad answer / nonsense answer" rate of English for the same task classes.

---

## Risk register

| Risk                                                                                                                                                 | Mitigation                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Quality gap vs cloud-mini products** is large and irreducible at 4B                                                                                | Scope control, better defaults, retrieval/tool augmentation, product surface that leans into fast/private/offline utility instead of pretending cloud-scale intelligence                           |
| **Multilingual unevenness outside vendor-highlighted languages** (Arabic, Bengali, Tamil specifically not validated to ship-grade in public sources) | Block launch on real prompt-set validation in those languages — not on "100+ languages" marketing claims                                                                                           |
| **Device fragmentation** (Apple Intelligence excludes iPhone 13; AICore excludes Pixel 7a/8a + mid-tier Android)                                     | Path C itself: system-native multimodal where available, text-first fallback everywhere else                                                                                                       |
| **UX confusion from local-LLM hobbyist patterns**                                                                                                    | Ruthless simplification — one default model, one optional Lite, one optional premium multimodal pack. **No "choose your model" UI at launch.** Capability sheet in user language, not model names. |
| **2.5 GB disk budget tight even for text-only 4B**                                                                                                   | Pick Qwen3-4B specifically because it fits; reject Gemma 4 E4B as default for this reason                                                                                                          |
| **Apple FM regressions across beta seeds** (one developer reported 95%→0% success rate)                                                              | Don't depend on Apple FM as sole path — use as additive primitive                                                                                                                                  |

---

## Architecture decision: Path C wins because

> A global v1 can do one of two things:
>
> 1. optimize around a small text-first model that actually fits and runs broadly, then layer multimodal capability opportunistically; or
> 2. optimize around a premium native multimodal experience and accept that a large share of the global device base will get a meaningfully different product.
>
> **For a mainstream launch where trust is fragile, choose the first.**

---

## Alternate (faster) configuration if schedule slips

If launch timing forces narrower scope:

- **Qwen3-4B-Instruct as the only downloaded model**
- Docs / OCR / screenshots / forms as the supported image surface on unsupported devices
- Native multimodal only on Apple Intelligence + supported AICore phones
- **No public "choose your model" UI at launch**

That gives a clean consumer pitch: the assistant can chat, write, summarize, answer, brainstorm, and handle text-heavy photos offline on most devices; it can do richer image understanding on newer premium hardware. **Smaller promise, but one we can keep.**

---

## Bottom line

If the goal is to ship something a normal global user can trust, the answer is not "pick the smartest small open model and hope." The answer is to separate the problem into what phones can actually do well today.

- **Use Qwen3-4B-Instruct-2507** as the default downloaded text brain
- **Use system-native** Apple Foundation Models and AICore / ML Kit GenAI where the OS already gives you a good multimodal substrate
- **Treat Qwen2.5-VL-3B and Gemma 4 E4B** as premium / optional native-vision packs, not universal baseline
- **If a true low-storage fallback** is needed, ship it as **Lite mode** with explicit quality labeling, not as the default assistant

This configuration is most likely to avoid the two failures that matter most: **a product that feels obviously dumber than the cloud**, and **a product that feels too technical to use at all**.
