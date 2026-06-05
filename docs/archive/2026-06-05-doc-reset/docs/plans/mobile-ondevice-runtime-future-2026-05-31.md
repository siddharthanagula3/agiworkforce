# On-Device Runtime — 2-Year Bet + Gemma/Audio Resolution (2026-05-31)

Status: RESEARCH COMPLETE + CODE-VERIFIED. **DECISION = OPTION B (founder, 2026-05-31).**
Owner: founder + platform
Last updated: 2026-05-31

Sources: deep-research `weciim595` (102 agents, 20 sources, 3-vote verify) + direct repo + npm/GitHub-API checks.
Supersedes the "Gemma-3n default" call. Read with `mobile-ondevice-llm-research-2026-05-31.md`.

## TL;DR

1. **The abstraction layer the research says to "build" is ALREADY BUILT.** `packages/local-llm/src/index.ts:1-3`
   is a 3-tier runtime selector: **Tier 1 = Apple Foundation Models / Gemini Nano (OS-bundled)** ·
   **Tier 2 = react-native-executorch** · **Tier 3 = llama.rn (universal GGUF fallback)**. This is exactly the
   "runtime abstraction + OS-bundled-models layer + bundled fallback" the report recommends. We are already
   future-proofed by design — the work is filling tiers in, not architecting them.
2. **Ship launch on ExecuTorch (Tier 2) with a Qwen3 default.** Production-safe, already wired (`.pte` presets).
3. **Gemma + on-device AUDIO is real but NOT on ExecuTorch.** Three runtime paths exist; **Cactus is the best fit
   for React Native** (first-class RN binding, runs Gemma-4 E2B/E4B with vision+audio+tools on Apple NPU) — better
   than LiteRT-LM (iOS/Swift still "Early Preview") for our stack. Evaluate Cactus as a post-launch tier.
4. **OS-bundled models (Apple Foundation ~3B, Gemini Nano via ML Kit) are a free, auto-updated inference layer** —
   our Tier 1 is already stubbed for exactly this. Lean on them where they fit; don't make them the only bet
   (device-gated to recent flagships, LoRA-only customization).

## ⚠️ Research claim CORRECTED by repo check

The report claimed "react-native-executorch latest is 0.6.7; the brief's 0.8.x doesn't exist on npm" and treated
two findings as 2-1 splits because of it. **That is wrong.** Verified: our install is **0.8.4**
(`apps/mobile/package.json:88`, `node_modules/.../package.json` = 0.8.4), and **npm latest = 0.9.0**. The 0.8.x
line is real and current. The load-bearing facts the report rested on this (active maintenance; no Gemma preset)
are still TRUE — but its version reasoning was stale. Lesson reinforced: verify against the actual install.

## Runtime landscape (verified 2026-05-31)

| Runtime                                                            | RN binding                                                                  | iOS                             | Gemma                                      | Vision                | AUDIO                                                 | Tools                | Format          | Verdict for us                              |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------ | --------------------- | ----------------------------------------------------- | -------------------- | --------------- | ------------------------------------------- |
| **ExecuTorch** (`react-native-executorch` 0.8.4, Software Mansion) | ✅ official-grade, monthly cadence                                          | ✅                              | ❌ no preset (license + in-progress #1062) | ✅ (Llava VLM)        | ❌                                                    | ✅ (Hammer/Qwen)     | `.pte`          | **Tier 2, launch runtime**                  |
| **LiteRT-LM** (Google AI Edge)                                     | ⚠️ 3rd-party `react-native-litert-lm` v0.3.4; own Swift API "Early Preview" | ⚠️ early                        | ✅ canonical (3n/4)                        | ✅                    | ✅ (batch ~30s, Gemma-3n, Android-first)              | ✅                   | `.litertlm`     | watch; iOS not production-ready             |
| **Cactus** (YC S25, from-scratch)                                  | ✅ `cactus-react-native` 1.13.1 (Nitro), MIT(npm)                           | ✅ first-class, Apple-NPU 5-11× | ✅ Gemma-4 E2B/E4B (vision+audio+tools)    | ✅ (LFM2-VL, Qwen-VL) | ✅ STT (Whisper/Parakeet/Moonshine) + VAD/diarization | ✅                   | GGUF + own INT4 | **best 2nd-runtime candidate** ⚠️ license   |
| **llama.rn / llama.cpp**                                           | ✅ (PocketPal ships both stores)                                            | ✅                              | via GGUF                                   | some                  | —                                                     | some                 | GGUF            | **Tier 3 fallback (already)**               |
| **Apple Foundation Models / Gemini Nano**                          | OS APIs                                                                     | ✅/✅                           | n/a (OS model)                             | n/a                   | n/a                                                   | ✅ (FM tool-calling) | OS-managed      | **Tier 1 (already stubbed)** free inference |
| **MediaPipe LLM**                                                  | —                                                                           | deprecated iOS/Android          | —                                          | —                     | —                                                     | —                    | `.task`         | dead path; → LiteRT-LM                      |

## Cactus — profile (the new option)

- **What:** from-scratch mobile inference (Cactus Graph/Engine/Kernels, ARM SIMD, OpenAI-compatible API) — NOT a
  llama.cpp wrapper. YC S25 (Cactus Compute, Inc.). Core repo 5.3k★, active (pushed 2026-05-29, v1.14).
- **RN:** `cactus-react-native` 1.13.1 (npm, MIT), Nitro Modules JSI → **needs a dev client, not Expo Go**
  (same constraint we already accept for ExecuTorch). RN repo smaller (174★, last push Apr 19) — newer/secondary.
- **Models on-device:** Gemma (incl. **gemma-4-E2B/E4B vision+audio+tools, Apple NPU**), Qwen 0.6–2B, LFM2
  350M–8B, LFM2-VL/Qwen-VL vision, Whisper/Parakeet/Moonshine STT, function-calling, embeddings, vector index,
  RAG. Loads **GGUF** from HF. INT4/INT8/FP16.
- **Privacy:** local-first; has an OPTIONAL cloud fallback we would disable (keep remoteChatGate fail-closed).
- **⚠️ LICENSE RISK — DUE DILIGENCE BEFORE ADOPTING:** the npm RN package says MIT, but the **core repo LICENSE is
  "NOASSERTION" / custom**: "All Rights Reserved … permission … subject to the following conditions … This grant of
  permission applies only to:" — i.e. a _restricted / source-available_ grant on the core, not plain MIT. Must read
  the full terms and confirm commercial app-store use is permitted before betting a runtime on it.
- **iOS Swift binding** less mature than RN/Kotlin/Flutter — but the **RN** binding is what we'd use, and it's
  claimed production-grade (apps with 100K+ users; 500k+ weekly inferences). Verify hands-on.

## What's feasible NOW vs in 2 years vs must-stay-cloud (verified)

- **NOW on-device (sub-4B):** text chat (Qwen3/Llama-3.2/LFM2), image understanding (Llava/LFM2-VL/Qwen-VL),
  **audio STT** (Whisper/Parakeet via Cactus or LiteRT), light single-shot tool-calls. Intermittent only (thermal).
- **NEXT 12–24 mo:** OS-bundled models become the easy free default on more devices (Apple FM, Gemini Nano);
  NPU acceleration (Qualcomm/MediaTek/Apple) matures → higher sustained throughput; Gemma-4/Qwen-next/LFM2 push
  small-model quality up; MatFormer/PLE + multi-token decoding (MTP) raise speed. On-device audio broadens beyond
  batch/Android-first.
- **MUST STAY CLOUD:** long-context, multi-step agentic loops, always-on/high-frequency, high-quality vision/large
  generations. (Matches our local-vs-cloud split.)

## Biggest risks + how we're already hedged

- **Runtime lock-in** → hedged: `local-llm` tier abstraction already isolates the runtime boundary; adding a tier
  (Cactus/LiteRT) is additive, not a rewrite.
- **Format lock-in** (`.pte` vs `.litertlm` vs GGUF) → the catalog already carries per-model presets; GGUF via
  Tier 3 / Cactus keeps us portable.
- **Betting on alpha** (LiteRT-LM iOS) → don't gate a shipped iOS feature on it; prefer Cactus or wait.
- **Cactus license / maturity** → due-diligence gate before adoption; it's a _candidate_, not yet a commitment.
- **OS-model device-gating** → keep a bundled fallback (ExecuTorch) for broad coverage; OS models are a bonus tier.

## ✅ DECISION = OPTION B (founder, 2026-05-31)

**Ship launch on ExecuTorch (Tier 2) + Qwen3 default; add Cactus as a post-launch tier for Gemma-4 + on-device
audio**, gated on a license review + a hands-on iOS spike.

Options considered (for the record):

- **(A) ExecuTorch-only, Qwen3 default.** Ship now, no audio, no Gemma. Lowest effort. Tiers 1/3 stay stubbed.
- **(B) ExecuTorch now + Cactus post-launch — ✅ CHOSEN.** Launch on Tier 2/Qwen3; after submission, evaluate
  Cactus (license + hands-on) and add it as a tier for Gemma-4 + on-device audio. Best RN fit for the multimodal
  future; keeps the fast launch.
- **(C) ExecuTorch now + LiteRT-LM post-launch.** Same shape but via Google's stack; worse for us today (iOS
  early-preview, 3rd-party RN binding). Pick only if Gemma-via-Google specifically matters.
- **(D) Lean hard on OS-bundled models (Tier 1) + ExecuTorch fallback.** Prioritize Apple FM / Gemini Nano for
  free auto-updated inference; bundle ExecuTorch only where OS models are unavailable. Most "future" but
  device-gated and least control today.

### What Option B commits us to

- **Launch (unchanged from hardening-first):** ExecuTorch + **Qwen3** default (already wired `.pte`); no new
  runtime work blocks submission. Tier 1 (Apple FM / Gemini Nano) and Tier 3 (llama.rn) stay as the existing
  stubbed/fallback tiers.
- **Post-launch, BEFORE writing any Cactus code — two hard gates:**
  1. **License due-diligence** — the Cactus _core_ repo LICENSE is custom/NOASSERTION ("All Rights Reserved… grant
     applies only to:"), even though the npm RN package says MIT. Confirm in writing that commercial App Store /
     Play Store distribution is permitted. **If the license doesn't clear, fall back to Option C (LiteRT-LM) or
     stay on A.**
  2. **iOS hands-on spike** — `cactus-react-native` 1.13.1 (Nitro Modules → dev client, not Expo Go) running a
     Gemma-4 E2B turn on a real iPhone, confirming the RN binding's iOS path is production-grade (Swift core is
     less mature than RN/Kotlin — verify the RN route specifically).
- **Then:** add Cactus as a tier in `packages/local-llm` (additive — Tier 2.5 alongside executorch), wire its
  Gemma-4 + STT models into the catalog, keep its optional cloud-fallback **disabled** (remoteChatGate stays
  fail-closed; local stays local).

Rationale: ships the hardening-first launch unchanged, uses the runtime abstraction we already have
(`packages/local-llm`), and lines up Cactus — the only option with a first-class RN binding that runs Gemma-4 +
vision + **audio** on Apple NPU — as the post-launch path to the multimodal/audio product we originally wanted
from Gemma-3n.

## Launch model lineup + watchlist

- **Launch (ExecuTorch):** default **Qwen3 1.7B/4B** (wired, `.pte`, tool-use+vision) or **Llama-3.2-1B**;
  **Hammer** for function-calling; **LFM2** (350M/700M/1.2B) as a strong newly-available candidate to A/B.
- **Watchlist (12–24 mo):** Gemma-4 E2B/E4B (via Cactus/LiteRT), Qwen-next small, LFM2/-VL, Apple Foundation
  Models + Gemini Nano (Tier 1), SmolVLM2, NPU-accelerated builds, MTP/speculative-decoding model variants.
