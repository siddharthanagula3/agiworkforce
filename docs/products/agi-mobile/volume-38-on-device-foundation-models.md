# AGI Mobile — Volume 38 — On-Device Foundation Models (Apple & Android)

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01
Authority: AGENTS.md, docs/current/source-of-truth.md, docs/products/README.md, apps/mobile/AGENTS.md, packages/local-llm/src/catalog.ts, apps/mobile/native/ios/AGIFoundationModels.swift, apps/mobile/native/android/withAGIAICore.cjs, Apple FoundationModels documentation (developer.apple.com/documentation/foundationmodels, doc-JSON verified 2026-07-01: iOS 26.0+, watchOS 27.0 beta), WWDC26 Apple Intelligence guide (developer.apple.com/wwdc26/guides/apple-intelligence/), Google ML Kit GenAI docs (developers.google.com/ml-kit/genai).

## Overview & stance

This volume specifies AGI Mobile's use of the **OS-resident foundation models**: Apple's FoundationModels framework on iOS and Gemini Nano via AICore/ML Kit GenAI on Android. These are the highest-leverage Local-mode engines — zero download, OS-managed, battery-optimized — alongside the downloadable open-weight models the catalog already ships. Trust stance: OS-resident inference is **Local mode**. Apple's Private Cloud Compute and any server-backed path are **not Local** — if AGI ever adopts PCC it is presented as its own labeled boundary, never silently blended into Local. Mobile has no BYOK; nothing here introduces key entry.

Platform facts verified from official sources (2026-07-01), superseding older assumptions where noted.

## Apple FoundationModels framework (iOS 26+)

🟡 Partial — the native module exists: `apps/mobile/native/ios/AGIFoundationModels.swift` + `.m`, wired by `apps/mobile/native/ios/withAGINativeModulesIOS.cjs`; the catalog entry `apple-foundation-models` (`packages/local-llm/src/catalog.ts`) is `shipsInV1: true` with visionIn + toolCalls + structuredOutput.

Verified framework facts (doc-JSON + WWDC26 guide):

- Platforms: iOS 26.0+, iPadOS 26.0+, macOS 26.0+, visionOS 26.0+, watchOS 27.0 (beta). Framework purpose: "models that specialize in language understanding, structured output, and tool calling."
- Documented capability areas: Sessions and prompts, **Prompt attachments** (multimodal image input), **Dynamic profiles** ("swap models, tools, and instructions on the fly" within a session), Structured output, Tools, System language model, Private Cloud Compute, **Custom language model provider**, Safety, Performance and evaluation.
- WWDC26: the on-device System Language Model was rebuilt — better instruction following and direct image input; Vision framework tools (OCR, barcode reading) are callable by the model on-device.
- **Evaluations framework** for verifying AI feature behavior; `fm` CLI and a Python SDK exist for scripted work; Instruments supports agentic profiling.

Requirements: route `apple-foundation-models` selections through the native module's `LanguageModelSession`; adopt structured output for tool-call-shaped answers; adopt prompt attachments for camera/gallery images in Local mode (replacing 🔭 cloud-only vision when the device supports it); gate availability on `SystemLanguageModel.availability` and degrade honestly (never a fake "Apple Intelligence" badge on unsupported devices — capability honesty rule).

## Custom language model provider (the strategic opening)

🔭 Planned — verified: the framework now accepts **any** LLM behind its API — "work with any language model, including Apple Foundation Models, cloud models like Claude and Gemini, or any other provider that conforms to the Language Model protocol" (WWDC26 guide; "Custom language model provider" is a first-class doc section).

This is directly aligned with AGI's multi-provider differentiation: implement one AGI provider conformance so **AGI Managed Cloud** (and desktop-relayed models later) can back a `LanguageModelSession` on iOS. Trust rules carry over unchanged: the custom provider is used only in Cloud mode, labeled as AGI Cloud, with 5.1.2(i) third-party-AI consent (Volume 37). Local mode never silently swaps to a network-backed provider via this protocol.

## Private Cloud Compute (evaluate, do not conflate)

🔭 Planned / decision-gated. Verified: apps in the App Store **Small Business Program with under 2 million total first-time downloads can access the next-generation Apple Foundation Model on Private Cloud Compute at no cloud API cost** (WWDC26 guide). WWDC26 also brought reasoning and a 32K-token context window to the PCC model (WWDC26 session coverage).

Product posture: this is a potentially free, private, server-grade model for exactly our early scale — attractive for the Free tier's cloud chat margin. But PCC is a **fourth execution venue** and must be modeled as what it is: Apple-operated server compute, distinct from Local, distinct from AGI Managed Cloud. Adopting it requires a founder decision recording: label text ("Apple Private Cloud"), consent copy, entitlement mapping per tier, and eligibility monitoring (the free access lapses past 2M downloads or outside Small Business Program). Do not ship it silently under the "Local" or "Cloud" labels.

## Android — Gemini Nano via AICore / ML Kit GenAI

🟡 Partial — native wiring exists: `apps/mobile/native/android/withAGIAICore.cjs` injects the `com.google.mlkit:genai-common` Gradle dependency and registers `AGIAICoreModule` + `AGIAICorePackage` into `MainApplication.kt`; catalog entry `gemini-nano-aicore` is `shipsInV1: true`.

Verified platform facts (official ML Kit GenAI docs + Android developer blog):

- ML Kit GenAI APIs run on **AICore** (Android system service executing Gemini Nano on-device); features run locally, cost nothing, and require no App Functions registration.
- **Prompt API (Alpha)**: custom text-only or multimodal requests to Gemini Nano; plus packaged Summarization and Proofreading APIs.
- Latest Gemini Nano (**nano-v3**) performs best on the Pixel 10 series; capability varies sharply by device — treat device support as a runtime capability query, not a build-time constant.

Requirements: route `gemini-nano-aicore` through `AGIAICoreModule` using the Prompt API; keep the Summarization API as the engine for local conversation-title generation 🔭; surface per-device availability in the model picker exactly as the Apple entry does; catalog metadata (context window, vision, nano version) must be refreshed against the shipping AICore rather than hardcoded assumptions — the current `contextWindow: 1_024` / nano-v2 notes need re-verification against nano-v3 devices (🟡 tracked gap).

## Catalog & routing integration

🟡 Partial — `packages/local-llm/src/catalog.ts` models both entries as OS-resident (`fileSizeBytes: 0`), and the mobile picker consumes them via `apps/mobile/src/features/model-picker/{localModelRuntime,service,installStore}.ts` with onboarding/settings surfaces (`app/(public)/onboarding.tsx`, `app/(app)/settings/performance.tsx`).

Requirements: OS-resident entries never show a download affordance; availability probes run per-launch and cache per-device; the catalog's Apple FM `contextWindow: 4_096` and capability flags must track the OS release (WWDC26 rebuilt model) — update from runtime introspection where the API exposes it instead of frozen constants. Non-LLM engine IDs here (OS model identifiers) are exempt from the models.json LLM-catalog SSOT but must stay grounded in `packages/local-llm/src/catalog.ts` (canon rule).

## Repository map

- `packages/local-llm/src/catalog.ts` — OS-resident + downloadable on-device model catalog (✅).
- `apps/mobile/native/ios/AGIFoundationModels.{swift,m}` + `withAGINativeModulesIOS.cjs` — Apple FM bridge (🟡).
- `apps/mobile/native/android/withAGIAICore.cjs` — AICore/ML Kit wiring (🟡).
- `apps/mobile/src/features/model-picker/` — runtime selection, availability, install store (✅/🟡).
- `apps/mobile/app/(app)/settings/performance.tsx`, `app/(public)/onboarding.tsx` — user-facing surfaces (✅).

## Competitor notes

ChatGPT and Claude mobile run **no on-device inference** — every prompt is server-bound. Apple/Google OS models give AGI a structural privacy + offline + zero-marginal-cost edge neither competitor's business model rewards. The WWDC26 custom-provider protocol cuts the other way too: competitors can now sit behind Apple's framework — so AGI's defensible position is the **combination** (OS models for Local, multi-provider Cloud, visible trust labels), not framework access itself. On Android, ChatGPT/Claude do not use AICore; shipping Nano-backed Local chat is differentiation on the largest mobile OS.

## Acceptance / Definition of Done

Done when: on a supported iOS 26 device, Local chat runs on the Apple system model through `AGIFoundationModels` with image attachments and structured output; on a supported Android device, Local chat runs on Gemini Nano through `AGIAICoreModule`; unsupported devices degrade to downloadable catalog models with honest copy; and no OS-model path ever emits network traffic (verified by capture).

- [ ] Trust: OS-resident inference verified offline (airplane-mode test) on both platforms; PCC absent from the product until its own labeled boundary + founder decision exists.
- [ ] Build: availability probing, model picker labels, and capability flags driven by runtime introspection; Apple Evaluations framework + Jest/native tests cover the happy path and unavailability path.
- [ ] Guidelines: no inaccurate presentation of Apple model access (June 2026 review posture); 5.1.2(i) consent covers any future PCC/custom-provider path.

## Anti-patterns

- Presenting PCC or any server model under the Local label — Local means on-device, full stop.
- Hardcoding device support lists or context windows instead of runtime availability/introspection.
- Showing a download button, progress bar, or file size for OS-resident models.
- Faking an "Apple Intelligence" or "Gemini Nano" badge on devices where the OS model is unavailable.
- Adding BYOK/API-key entry anywhere in model configuration (mobile has none, ever).
- Referencing Supabase, removed tiers (Plus/pro_plus/Hobby), or invented INR prices in model-tier gating copy.
