# On-Device LLMs for AGI Mobile — Cited Research (2026)

Status: RESEARCH COMPLETE (2026-05-31). Unblocks Phase-A coding (was gated on this).
Source: deep-research workflow `wsq6bzm62` — 109 agents, 17 sources, 3-vote adversarial verification
(2/3 refutes to kill a claim). High-confidence claims passed 3-0; medium passed 2-1 with dissent kept as caveat.
Owner: founder + platform

## Why this matters for our thesis

Our local-first USP is **privacy, not raw capability** (sensitive/company/private info, emotional support,
personalization, offline). The research independently confirms this is the _only_ posture that survives the
hardware: phones can't do heavy on-device AI, but they can do **intermittent, private, personal** AI very well.
The constraint validates the strategy.

---

## 1. The binding constraint is THERMAL, not memory or compute — confidence: HIGH (3-0)

Sub-4B 4-bit models are the practical ceiling for usable speed, and phones are viable only for **intermittent**
inference (~5–10 queries/hour), **not** always-on/agentic workloads.

- A 7B 4-bit model decodes at only single-digit→low-tens tok/s on mobile CPU (Dimensity 9300 = 8.22 tok/s,
  ~5× faster than Snapdragon 870) — so mid-range phones need **sub-4B** for usable speed.
- Under sustained load, **iPhone 16 Pro (A18 Pro)** running Qwen2.5-1.5B 4-bit via MLX loses **~44%** of
  throughput within two iterations (40.35 → 22.56 tok/s) and sits thermally throttled ("Hot") **65%** of the run.
  The paper: _"thermal management supersedes peak compute as the primary constraint."_
- **Galaxy S24 Ultra (Snapdragon 8 Gen 3)** GPU is OS-floored 629–680 MHz → 231 MHz at iteration 6, **terminating
  GPU inference entirely** after ~9.93 tok/s sustained. Device temp can rise 42.6 °C → 66.8 °C in one round.
- Conclusion: phones _"support intermittent queries at approximately 5-10 per hour before thermal constraints
  dominate"_ and are _"poorly suited for always-on agent workloads."_
- CAVEAT: the sustained-load figure rests substantially on one non-peer-reviewed 2026 preprint (N=1 model,
  N=2 phones, single 258-token prompt). Directionally corroborated; the exact 5–10/hr number is the least
  generalizable element. A related "4-bit 7B hits a hard ~4GB memory ceiling" sub-claim was **REFUTED (1-2)** and
  removed — the sub-4B recommendation stands via the throughput/thermal route, not the memory route.
- Sources: arXiv:2410.03613 (https://arxiv.org/html/2410.03613v1), arXiv:2603.23640 (https://arxiv.org/html/2603.23640v1)

**Product implication:** our "local = intermittent personal assistant, cloud = heavy" split is the _correct and
only_ design. Don't promise sustained/agentic local work. Do design for short, private, personal turns.

## 2. Quantization is the #1 battery lever — confidence: HIGH (3-0)

Q3/Q4 cuts per-token **energy by up to ~79%** vs FP16 on edge-class ARM.

- Llama 3.2 1B FP16 → Q3_K_S: 17.60 J/token → 3.75 J/token (−79%), measured with a Joulescope JS110 hardware
  power analyzer on a Cortex-A72 ARM CPU (directly analogous to mid-range phone CPUs).
- Best-practice battery stack: **4-bit (or lower) quantization · small context windows · NPU/GPU offload ·
  intermittent (not sustained) use.** Corroborating sources reported ~1% battery/min and 2–4 hr life under
  _sustained_ load — i.e. fine for bursts, not for always-on.
- Source: arXiv:2504.03360 (https://arxiv.org/html/2504.03360v1)

## 3. Runtime: React Native ExecuTorch — confidence: HIGH (3-0) ← CONFIRMS our existing choice

React Native ExecuTorch (Software Mansion), wrapping Meta's **ExecuTorch v1.3.1 (May 2026)**, is the recommended
production-grade runtime for our Expo/RN app — and is **what we already use** (`@agiworkforce/local-llm`).

- Fully on-device, no API calls, data stays private; ships pre-exported ready-to-use models.
- iOS + Android; delegates: **XNNPACK (CPU), Core ML + MPS (Apple GPU/NPU), Vulkan (Android GPU)**; built-in
  quantization down to **4-bit**.
- Ships `useLLM` (Llama/Qwen) **and** `useVLM` (Llava vision-language) example workflows — directly relevant to
  our auto-model-selection-by-modality feature.
- CAVEAT: needs a **custom dev client / config plugin — NOT Expo Go compatible** (already true for us).
- Sources: https://docs.swmansion.com/react-native-executorch/docs/fundamentals/getting-started ,
  https://github.com/pytorch/executorch

## 4. Recommended on-device models — confidence: MEDIUM (2-1, dissent kept)

| Model                                          | Size      | Tool/Function-calling                     | Vision                                    | Notes                                                                                                                          | Confidence |
| ---------------------------------------------- | --------- | ----------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| **Qwen3-VL 2B / 4B** (dense)                   | 2B / 4B   | ✅ native (Qwen-Agent, structured output) | ✅                                        | Vendor edge-positioned; on-phone VL speed is thermally constrained / intermittent-only                                         | medium     |
| **Arch-Function 1.5B / 3B** (on Qwen2.5-Coder) | 1.5B / 3B | ✅ near-GPT-4o on BFCL at 3B              | ❌                                        | Best for **simple, well-scoped tools** (set reminder, search memory, single API). Degrades on complex/nested multi-tool chains | medium     |
| **SmolVLM 2B** (256M/500M variants too)        | 2B        | —                                         | ✅ ~5GB RAM, 7.5–16× faster than Qwen2-VL | Leading light-vision pick for mid/high-tier; ~5GB still excludes 3–4GB budget phones; quality < cloud VLMs                     | medium     |
| **Gemma-3 1B / Gemma-2 2B / Gemma-3n E2B/E4B** | 1–4B      | partial                                   | ✅ (3n: text+image+audio)                 | Google's edge line; multimodal at the top end                                                                                  | medium     |

Dissent preserved: "near-GPT-4o" and "7.5–16×" are **vendor/HF self-benchmarks**; on-device reproduction wasn't
independently verified, and function-calling reliability falls off below 4B on complex chains. Treat
**capability** as solid, **on-phone speed** as device-dependent and intermittent.

- Sources: https://github.com/QwenLM/Qwen3-VL , https://qwenlm.github.io/blog/qwen3/ ,
  https://huggingface.co/katanemo/Arch-Function-3B , https://github.com/katanemo/archgw ,
  https://huggingface.co/blog/smolvlm , https://huggingface.co/HuggingFaceTB/SmolVLM-Instruct

## 5. Google MediaPipe LLM Inference API — deprecated direction — confidence: MEDIUM (2-1)

Google's on-device GenAI stack has shifted to **LiteRT (ex-TF-Lite) / LiteRT-LM / AI Edge**; the older MediaPipe
LLM Inference path is being phased out. Safer phrasing: LiteRT-LM is the strategic direction; MediaPipe tasks
still function but are no longer the recommended path. Not our runtime anyway (we're on ExecuTorch), so this is
informational. Sources: https://ai.google.dev/edge/litert , https://github.com/google-ai-edge/gallery

## 6. OSS apps to learn from — confidence: HIGH (3-0)

google-ai-edge/gallery (Google's official demo), PocketPal AI (llama.cpp + HF download), MLC Chat (GPU via TVM),
Maid, Private LLM, Layla, Cactus, react-native-ai / RN ExecuTorch bindings. **Consistent pattern:** in-app model
browse/download from Hugging Face, fully-local chat (privacy USP), quantized GGUF/MLC/.pte management, some add
on-device RAG over local docs. **Heavy/agentic/large-context/high-quality-vision is deliberately left to cloud or
omitted** — exactly our split. Direct references for model-download UX, quantization handling, privacy framing.

- Sources: https://github.com/google-ai-edge/gallery , https://github.com/a-ghorbani/pocketpal-ai ,
  https://github.com/mlc-ai/mlc-llm

---

## Bottom line for product

1. **Target sub-4B 4-bit models.** It's the ceiling and it's enough for our use-cases.
2. **Keep React Native ExecuTorch** — research confirms our existing runtime is the right one.
3. **Model lineup:** **Gemma-3n (E2B/E4B) is the DECIDED default** (multimodal text+image+audio, one download) ·
   SmolVLM 2B as a flagship-only optional download for heavier vision · Arch-Function 1.5B/3B for reliable simple
   tool-calls · Qwen3-VL 2B/4B as an alternative VLM where stronger vision is needed.
4. **Design for intermittent local use** (sensitive data, emotional support, personalization). Push
   heavy/agentic/large-context/high-quality-vision to **cloud mode**.
5. **Battery:** 4-bit quant · small context · NPU/GPU offload · no sustained always-on inference. Surface this in
   UX (don't let users expect a sustained agent on-device).

## ⚠️ VERIFIED CONTRADICTION (2026-05-31) — Gemma-3n needs LiteRT-LM; our runtime is ExecuTorch — FOUNDER IS CORRECT

> A deeper future-proofing deep-research (workflow `weciim595`) is in flight to pick the 2-year runtime bet
> (ExecuTorch vs LiteRT-LM vs OS-bundled models). The verified findings below stand; the A/B/C pick waits on it.

Founder flagged: "for Gemma we need **LiteRT-LM** (https://github.com/google-ai-edge/LiteRT-LM), not ExecuTorch."
**Verified true.** This overturns the Gemma-3n default decision below.

VERIFIED (primary sources, web-checked 2026-05-31):

1. **Gemma 3n's canonical on-device runtime IS LiteRT-LM.** Official HF repos are literally named
   `google/gemma-3n-E2B-it-litert-lm`; LiteRT-LM README quick-start runs exactly that; README lists
   "Broad Model Support: Gemma, Llama, Phi-4, Qwen" + "Multi-Modality: vision and audio inputs". Gemma 3n weights
   ship in LiteRT/MediaPipe `.litertlm`/`.task` format. (github.com/google-ai-edge/LiteRT-LM;
   huggingface.co/google/gemma-3n-E2B-it-litert-lm)
2. **Our runtime is ExecuTorch ONLY** — `apps/mobile/package.json:88` (`react-native-executorch ^0.8.4`);
   `packages/local-llm` tiers = Tier2 ExecuTorch / Tier3 llama.rn; catalog ships `.pte` presets (Qwen3-4B,
   Llama-3.2-1B-spinquant). **No LiteRT in the repo.**
3. **react-native-executorch has NO published Gemma preset.** Its HF org publishes Llama, Qwen, SmolLM, Hammer,
   Phi, Bielik, LFM2.5 `.pte` presets — **no Gemma / no Gemma 3n.** RNE _exported_ Gemma 3 270M/1B to `.pte`
   (text-only) but **could not publish due to Gemma license restrictions** (issue #642). Gemma 3/4 support is an
   **open/in-progress issue** (RNE #1062 "Gemma4 support"; pytorch/executorch #14941) — **not shipped.** Gemma 3n's
   audio + MatFormer/PLE architecture is LiteRT/MediaPipe-optimized, not on the ExecuTorch path.
4. **A React-Native LiteRT-LM binding exists but is third-party + early:** `react-native-litert-lm`
   (hung-yueh, v0.3.4 Jan 2026, Nitro Modules JSI, optimized for Gemma 4, image+audio). NOT official Google.
   LiteRT-LM's own Swift (iOS) API is **"Early Preview."** So adopting it = a 2nd runtime via a community lib (or a
   hand-written native bridge).

NAMING NOTE: 2026 sources conflate **Gemma 3n** and **Gemma 4** (both use E2B/E4B effective-size naming, both
multimodal, both LiteRT-first). Runtime story is identical for both → LiteRT, not ExecuTorch.

OPTIONS:

- **(A) Stay ExecuTorch-only** → switch default to **Qwen3 (1.7B/4B)** — _already in our catalog with a published
  `.pte` preset and native tool-use+vision_ — or Llama-3.2-1B. **Ships now, zero new runtime.** Loses Gemma-3n
  audio + Gemma brand. **Lowest risk.**
- **(B) Adopt LiteRT-LM now** (via `react-native-litert-lm` or a native bridge) → run Gemma 3n/4 with audio. Cost:
  second runtime, community/early-preview dependency, integration + testing time. **Slows the fast launch.**
- **(C) Tiered (recommended pending the future-proofing research):** ship ExecuTorch + **Qwen3 default** for the
  fast hardening-first launch; add **LiteRT-LM as a post-launch tier** (Tier-2.5) for Gemma 3n/4 once stable. Fits
  the release strategy and keeps Gemma 3n on the roadmap without blocking submission.

## Founder decisions (2026-05-31) — DEFAULT-MODEL OVERTURNED (Gemma-3n needs LiteRT-LM)

- ~~**Default download model: Gemma-3n (E2B/E4B)**~~ **— NOT VIABLE on our current runtime.** Gemma 3n requires
  **LiteRT-LM**; we are **ExecuTorch-only**, and ExecuTorch has no shipped Gemma preset (license + in-progress).
  **ExecuTorch-safe default = Qwen3 1.7B/4B** (already wired, published `.pte`, tool-use+vision) — or Llama-3.2-1B.
  Gemma 3n/4 → only if we adopt a 2nd runtime. **RESOLVED 2026-05-31 → Option B:** ship ExecuTorch + **Qwen3**
  default now; add **Cactus** (not LiteRT-LM — better RN binding) post-launch for Gemma-4 + on-device audio, gated
  on license review + iOS spike. Full rationale: `docs/plans/mobile-ondevice-runtime-future-2026-05-31.md`.
- **Min device tier: mid-range and up — 6GB+ RAM (≈ iPhone 12+, Android 6GB last ~4 yrs).** (Unaffected by the
  runtime question — still resolved.) Comfortably runs Qwen3 1.7B / Llama-3.2-1B + light vision. NOTE: SmolVLM
  (~5GB) is tight at this floor — keep it a flagship-only optional download, not a 6GB-tier default. Heavier/large
  models gate to flagships; older phones use cloud mode.

These set: model-card "requires" copy, the default-download size shown in onboarding, the battery/heat
expectation messaging, and the capability flags. NOTE: the "Gemma-3n = vision+audio default" assumption is
overturned (see verified contradiction above) — on ExecuTorch the default is Qwen3 (text+vision, no audio); audio
only arrives if we adopt LiteRT-LM.

## How this feeds the release plan

- **Phase A (harden, pre-submission):** the model-card / tokens-per-sec / capability-flag / download-UX polish
  items in `mobile-release-strategy-2026-05-31.md` can now proceed with real numbers and the confirmed runtime.
- **Phase C (TestFlight):** auto-model-selection-by-modality
  (`mobile-local-auto-model-selection-2026-05-31.md`) is validated — ExecuTorch ships both `useLLM` and `useVLM`,
  so text→text-model / image→VLM switching is buildable on the runtime we already have.
