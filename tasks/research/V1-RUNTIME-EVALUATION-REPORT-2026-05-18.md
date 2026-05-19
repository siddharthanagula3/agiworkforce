# V1 On-Device Inference Runtime Evaluation

**Date:** 2026-05-18
**Author:** runtime-engineer
**Status:** FINAL — recommendation approved; integration shipped (2026-05-18)

---

## Context

Model picks are locked (V1-MODEL-SELECTION-REPORT.md, 2026-05-18):

- **Default downloaded text brain:** Qwen3-4B-Instruct-2507 (Apache-2.0)
- **Lite-mode fallback:** Llama 3.2 1B SpinQuant / QLoRA (Llama Community)
- **Tier 1 iOS:** Apple Foundation Models (system, no download)
- **Tier 1 Android:** AICore / ML Kit GenAI (system, no download)

The existing `@agiworkforce/local-llm` package already wires Tier 1/2/3 with:

- `react-native-executorch` 0.8.4 installed (Tier 2)
- `llama.rn` 0.10.1 installed (Tier 3)
- `callstack/ai` not yet installed

All four runtime candidates are evaluated against **these two locked model picks only**.

---

## §1 — Capability matrix

| Dimension                                | callstack/ai                                                                                  | react-native-executorch 0.8.4                                                                                                   | Cactus AI                                                                                                 | Google LiteRT-LM                                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **License**                              | MIT (GitHub: callstackincubator/ai)                                                           | MIT                                                                                                                             | Apache-2.0 (GitHub: cactus-compute/cactus)                                                                | Apache-2.0                                                                                            |
| **iOS — production-ready**               | Yes — wraps ExecuTorch, MLX, Apple FM; ships as npm                                           | Yes — production apps confirmed (Private Mind on App Store)                                                                     | Yes — production (500K+ weekly tasks claimed)                                                             | **No — iOS "in dev" per official repo**                                                               |
| **Android — production-ready**           | Yes — wraps ExecuTorch; Android path confirmed                                                | Yes — Private Mind Play Store confirmed                                                                                         | Partially — NPU (Qualcomm/Google/MediaTek) March-April 2026 (status: just launched, limited war stories)  | Yes — Android stable, primary supported target                                                        |
| **Qwen3-4B support**                     | Via ExecuTorch or llama.cpp backends — model-agnostic, but depends on which backend is chosen | **Verified: `qwen3-4b` and `qwen3-4b-quantized` in `LLMModelName` enum; pre-built `.pte` URLs present in modelUrls.ts**         | No verified Qwen3-4B artifact — YC pitch mentions "any GGUF" compatibility; not confirmed at launch scale | Apache-2.0 repo officially names Gemma + Llama + Phi-4 + Qwen in README; Qwen3 specifically unclear   |
| **Llama 3.2 1B SpinQuant/QLoRA support** | Via ExecuTorch backend — model-agnostic                                                       | **Verified: `llama-3.2-1b-qlora` and `llama-3.2-1b-spinquant` in LLMModelName enum with explicit .pte URLs**                    | Not verified for these specific quantized variants                                                        | Not verified for SpinQuant/QLoRA format; GGUF may work                                                |
| **Apple Foundation Models integration**  | Yes — listed as a dedicated provider in multi-runtime architecture                            | No — does not wrap or manage Apple FM                                                                                           | No explicit Apple FM integration documented                                                               | No                                                                                                    |
| **Tool calling built-in**                | Yes — Vercel AI SDK compatible; tool call schema passes through                               | **Yes — `LLMTool[]`, `ToolsConfig`, `executeToolCallback`, `ToolCall` types verified in 0.8.4 source; driven by chat template** | Not documented in public README for RN bindings                                                           | Not documented for RN use                                                                             |
| **NPU acceleration**                     | Depends on backend chosen (ExecuTorch uses XNNPACK/CoreML; MLX uses Metal)                    | XNNPACK (Android/iOS CPU), CoreML (iOS), reported Metal where applicable                                                        | NPU (Qualcomm Hexagon, Google Tensor NPU, MediaTek APU) — primary differentiator                          | GPU-accelerated (OpenCL, Vulkan, Metal in dev)                                                        |
| **RN bindings maturity**                 | Alpha / pre-1.0; incubator project under Callstack                                            | **Production-shipped; 0.8.x release series; Software Mansion's track record strong**                                            | Alpha; YC-backed startup, limited public RN-specific changelogs                                           | No official RN bindings; this is a native C++ library. Integration would require custom native module |
| **Latest release**                       | No published npm release confirmed as of 2026-05-18 (incubator, likely git-only)              | 0.8.4 (confirmed installed in this repo)                                                                                        | No npm package confirmed; GitHub-only integration path                                                    | No RN npm package; C++ / Android-native API only                                                      |
| **Commit cadence**                       | Active (GitHub callstackincubator/ai has recent activity per model selection report)          | Active — 0.8.x series ongoing                                                                                                   | Active — YC S24 batch, early 2026 launch                                                                  | Active — Google AI Edge org                                                                           |
| **Production deployments visible**       | No public consumer apps cited in docs                                                         | **Yes — Private Mind (App Store + Play Store, cited in official docs)**                                                         | 500K+ weekly tasks claimed (no specific RN apps named)                                                    | No RN production deployments; Android native apps only                                                |

---

## §2 — Per-candidate fit assessment for locked models

### react-native-executorch 0.8.4

**Fit: EXCELLENT**

This is the only candidate where both locked models are **verified in the installed source**:

- `qwen3-4b` and `qwen3-4b-quantized` have pre-built `.pte` artifact URLs in `modelUrls.ts`
- `llama-3.2-1b-qlora` and `llama-3.2-1b-spinquant` have pre-built `.pte` artifact URLs with explicit SpinQuant/QLoRA path segments
- Tool calling is implemented as `LLMTool[] / ToolsConfig / ToolCall` — driven by each model's chat template, which Qwen3 explicitly supports
- `react-native-executorch-expo-resource-fetcher` 0.8.0 (MIT) is already installed and compatible with Expo 55
- Production confidence: Software Mansion has shipped Private Mind on both App Store and Play Store
- Already a declared dependency in `apps/mobile/package.json` — zero additional install risk

The only current integration gap is that `tier2.ts` uses a low-level `ETLLMModule.loadModel / runInference` interface that does not use the higher-level `LLMController` class (which provides tool calling and streaming). The `LLMController` is the right integration target for Qwen3-4B.

### callstack/ai

**Fit: PROMISING but NOT READY**

- Multi-runtime orchestration (ExecuTorch + MLX + Apple FM) is exactly the right abstraction for our Path C architecture
- Vercel AI SDK compatibility is genuinely valuable for the cloud-fallback path when the waitlist opens
- However: no npm release, no confirmed production deployment, no evidence it ships with pre-built Qwen3-4B or Llama 3.2 1B `.pte` artifacts
- Using it would require building custom model artifacts rather than consuming Software Mansion's pre-built ExecuTorch binaries
- Appropriate as a **Wave 2+ abstraction layer** once it reaches a stable release, not a Wave 0 dependency

### Cactus AI

**Fit: INTERESTING but UNVERIFIED for our models**

- 5-11x NPU speedup on Apple silicon is credible (Apple's ANE is underutilized by most RN runtimes)
- YC S24 pedigree provides some credibility
- No verified support for Qwen3-4B-Instruct-2507 specifically (the "any GGUF" claim is unverified for our exact target)
- No npm package confirmed as of 2026-05-18 — integration path unclear
- 500K weekly tasks claimed but no specific RN production apps named
- Android NPU support (Qualcomm/Google/MediaTek) launched March-April 2026 — limited real-world stability data
- Risk: if NPU path for Qwen3-4B is unstable, there is no fallback within this library
- Appropriate for **Wave 3+ evaluation** if NPU performance becomes a product differentiator

### Google LiteRT-LM

**Fit: BLOCKED for iOS (our primary v1 platform)**

- iOS support is explicitly "in dev" in the official repo as of 2026-05-18
- No RN bindings exist; integration would require building a custom native module from scratch
- Android path is stable but Android-first at launch (our India market) makes it interesting for Wave 1-2
- Qwen3 mention in README is promising but not specifically confirmed for Qwen3-4B-Instruct-2507
- No ExecuTorch `.pte` format — requires conversion to LiteRT format (separate tooling)
- LiteRT-LM is a strong candidate for **Android Wave 1-2** if Software Mansion's Android ExecuTorch performance proves inadequate on Snapdragon 7-class devices

---

## §3 — Recommendation

### Primary recommendation: stay on react-native-executorch, upgrade tier2.ts to LLMController

**iOS v1 runtime:** `react-native-executorch` 0.8.4 via ExecuTorch + CoreML backend
**Android v1 runtime:** `react-native-executorch` 0.8.4 via ExecuTorch + XNNPACK backend
**Abstraction pattern:** Single cross-platform path (not platform-split), using `LLMController` class

**Rationale:**

1. Both locked model variants (`qwen3-4b-quantized`, `llama-3.2-1b-spinquant`) are already verified in installed source with pre-built artifact URLs. No model packaging work needed.
2. Tool calling is already implemented in `LLMController` — our locked 95% JSON parse success gate is achievable without DIY prompt engineering.
3. Software Mansion ships this in production apps on both platforms. This is the lowest integration risk available.
4. `react-native-executorch-expo-resource-fetcher` is already installed and handles EAS asset delivery correctly for Expo 55.
5. The existing `tier2.ts` already integrates this package but uses the low-level module interface. The upgrade path is minimal: swap `ETLLMModule.runInference` for `LLMController.generate()` to unlock tool calling.

**What NOT to do now:**

- Do not add `callstack/ai` — no stable release, would bypass pre-built `.pte` model artifacts
- Do not add Cactus AI — no npm package, no verified Qwen3-4B support
- Do not add LiteRT-LM — no iOS support, no RN bindings

**Wave 2+ consideration:** Once `callstack/ai` reaches a stable npm release, evaluate it as an abstraction layer that puts `react-native-executorch` under it on Android/iOS and Apple FM on Apple Intelligence devices. This would give us the Vercel AI SDK streaming interface consistently across local and cloud.

---

## §4 — Integration plan (if recommendation approved)

No new packages required. All changes are in existing files.

### Files to modify

**`packages/local-llm/src/tier2.ts`** — current low-level interface uses `ETLLMModule.loadModel / runInference`. Upgrade to `LLMController` class:

- Replace `ETLLMModule` import with `LLMController` from `react-native-executorch`
- Replace `tier2LoadModel` to call `LLMController.load({ modelSource, tokenizerSource, tokenizerConfigSource })`
- Replace `tier2Generate` to call `LLMController.generate(messages, tools?)`
- Wire `tokenCallback` to `opts.onToken` for streaming
- Wire `toolsConfig` when `opts.tools` is present (MCP bridge — coordinate with model-catalog-engineer)

**`packages/local-llm/src/types.ts`** — add `tools?: LLMTool[]` to `GenerateOptions` so the tool-call path can flow through from the selector without type errors

**`packages/local-llm/src/catalog.ts`** — add `executorchModelName` field to `OnDeviceModel` entries for Qwen3-4B and Llama 3.2 1B so `tier2.ts` can load the correct pre-built preset (e.g., `QWEN3_4B_QUANTIZED`) without hardcoding

### Model wiring (coordinate with model-catalog-engineer via SendMessage)

The catalog entry for `qwen3-4b-instruct-2507` needs:

- `executorchPreset: 'qwen3-4b-quantized'` — maps to `QWEN3_4B_QUANTIZED` constant
- `executorchPreset: 'llama-3.2-1b-spinquant'` for the Lite model — maps to `LLAMA3_2_1B_SPINQUANT` constant

### Native module wiring

No native module changes required for this upgrade — `react-native-executorch` ships its own native module via the existing podspec/gradle files. No config plugin changes needed.

### Files NOT created yet (research-only)

`apps/mobile/services/inferenceRuntime.ts` would be a product-layer wrapper that calls `localGenerate()` from `@agiworkforce/local-llm`. This is appropriate after the Tier 2 upgrade is landed and typechecked.

---

## §5 — Risks

### Risk 1: Qwen3-4B-Instruct-2507 vs qwen3-4b-quantized tag mismatch — MEDIUM

The locked model pick is `Qwen3-4B-Instruct-2507` (the "2507" suffix refers to the July 2025 checkpoint date). The `react-native-executorch` pre-built artifact uses `qwen3-4b-quantized` without a version tag. We need to verify the artifact hosted at Software Mansion's CDN matches the July 2025 checkpoint, not an earlier Qwen3-4B release. **Mitigation:** confirm artifact SHA before launch gate; fall back to self-hosting the checkpoint on our CDN if version doesn't match.

### Risk 2: ExecuTorch `.pte` format vs GGUF — LOW

`llama.rn` (Tier 3) uses GGUF format while `react-native-executorch` (Tier 2) uses `.pte` (ExecuTorch compiled format). These are different artifact types and cannot be shared. We need two separate model artifacts on our asset host. **Mitigation:** budget both artifact types in storage cost calculations for download infrastructure.

### Risk 3: Tool calling depends on model chat template — MEDIUM

`react-native-executorch` tool calling "will only have effect if your model's chat template supports it" (per source comment in `types/llm.ts`). Qwen3-4B's Instruct variant does have a tool-call chat template (Qwen-Agent pattern documented in the model card). However, the ExecuTorch tokenizer_config.json must include the full Jinja template for this to work. **Mitigation:** smoke-test tool calling in the first hardware test (Task #12) before declaring Tier 2 tool-calling production-ready.

### Risk 4: LiteRT-LM iOS timeline — LOW (deferred risk)

LiteRT-LM's iOS "in dev" status means it cannot be a Wave 0 or Wave 1 dependency. If Google ships iOS support before our Aug 16 launch, it may offer Android performance advantages (Gemma 4 MTP multi-token prediction on mobile GPUs). **Mitigation:** track LiteRT-LM iOS release; if it lands by July, evaluate as optional Android-performance enhancement in Wave 2. Do not block the launch on it.

### Risk 5: callstack/ai release timing — LOW (deferred risk)

`callstack/ai` is the right long-term abstraction but has no stable npm release as of 2026-05-18. If they ship a stable release before our Aug 16 launch, re-evaluate as a Wave 2 orchestration layer. **Mitigation:** monitor the GitHub releases page; do not pull from git main.

### Risk 6: Cactus AI NPU path stability — LOW (deferred risk)

Cactus AI's NPU support for Android was just launching March-April 2026. No production RN app war stories. If performance testing shows Tier 2 (ExecuTorch XNNPACK) is below our 7 tok/s floor on Snapdragon 7-class devices, Cactus NPU path becomes worth evaluating. **Mitigation:** run Tier 2 performance benchmarks on Snapdragon 7 class (Pixel 7a equivalent) in Task #12 smoke test. Only escalate to Cactus evaluation if we miss 7 tok/s.

---

## Summary

**Recommendation:** Use `react-native-executorch` 0.8.4 for both iOS and Android Tier 2 inference. Upgrade `tier2.ts` to use `LLMModule` to unlock tool calling and fix the silent-null blocker. No new packages required. `callstack/ai`, Cactus AI, and LiteRT-LM are tracked for Wave 2-3 evaluation — none are Wave 0 dependencies.

**August 16 launch risk from this decision:** LOW. Both locked model artifacts (Qwen3-4B quantized + Llama 3.2 1B SpinQuant) are pre-built and hosted by Software Mansion. iOS and Android are both production-confirmed. Tool calling is implemented. The only action before shipping is confirming the Qwen3-4B artifact checkpoint date matches the locked 2507 pick.

---

## §6 — Wave 0 blocker: ETLLMModule does not exist (FIXED)

**Severity: BLOCKER — fixed 2026-05-18**

The original `tier2.ts` imported `ETLLMModule` from `react-native-executorch`. This export does not exist in 0.8.4. The `require()` call returned `{ ETLLMModule: undefined }`, which the `?? null` guard silently turned into `null`, causing every `tier2Generate` call to throw `'react-native-executorch not installed'` even with the package correctly installed. All Tier 2 inference silently fell through to Tier 3 (llama.rn).

**Fix shipped:** `tier2.ts` now uses `LLMModule` (the actual export), which wraps `LLMController` and provides `generate(messages, tools?)` with streaming token callbacks. The `executorchPreset` field was added to `OnDeviceModel` in `@agiworkforce/types` and populated in `catalog.ts` for both locked models. The selector now resolves the preset from the catalog and passes it to `tier2Generate` instead of a bare file path. `@agiworkforce/local-llm typecheck` passes clean.

---

## §7 — Sources

| Claim                                                                 | Source                                                                                                           |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| react-native-executorch GitHub repo                                   | https://github.com/software-mansion/react-native-executorch                                                      |
| react-native-executorch docs (Private Mind production deployment)     | https://docs.swmansion.com/react-native-executorch                                                               |
| react-native-executorch 0.8.4 `qwen3-4b-quantized` model constant     | Installed source: `node_modules/react-native-executorch/src/constants/modelUrls.ts:82,152`                       |
| react-native-executorch 0.8.4 `llama-3.2-1b-spinquant` model constant | Installed source: `node_modules/react-native-executorch/src/constants/modelUrls.ts:12,69`                        |
| react-native-executorch 0.8.4 `LLMModule` export (not ETLLMModule)    | Installed source: `node_modules/react-native-executorch/src/index.ts:182`                                        |
| react-native-executorch 0.8.4 tool calling types                      | Installed source: `node_modules/react-native-executorch/src/types/llm.ts` (`LLMTool`, `ToolsConfig`, `ToolCall`) |
| callstack/ai GitHub repo                                              | https://github.com/callstackincubator/ai                                                                         |
| callstack/ai not on npm (404 Not Found)                               | `npm view @callstack/ai` → E404 (verified 2026-05-18)                                                            |
| Cactus AI GitHub repo                                                 | https://github.com/cactus-compute/cactus                                                                         |
| Cactus AI "500K+ weekly tasks" claim                                  | GitHub README at cactus-compute/cactus (unverified independent source — treat as vendor claim)                   |
| Google LiteRT-LM GitHub repo                                          | https://github.com/google-ai-edge/LiteRT-LM                                                                      |
| LiteRT-LM iOS "in dev"                                                | https://github.com/google-ai-edge/LiteRT-LM README iOS section (verified 2026-05-18)                             |
| LiteRT-LM Apache-2.0 license                                          | https://github.com/google-ai-edge/LiteRT-LM/blob/main/LICENSE                                                    |
