# Research prompt — Apple LoRA adapter distribution under Guideline 2.5.2

**Date:** 2026-05-17 · **Target:** research agent (Explore-class with web tools) · **Output:** memo + question list to bring to an Apple App Review one-on-one consultation.

---

## Mission

In 4-8 working hours, answer: **"As of May 2026, what is Apple's publicly-knowable position on third-party iOS apps distributing custom LoRA adapters that bolt onto Apple Foundation Models (iOS 26) — and is this position compatible with App Review Guideline 2.5.2 ('apps may not download, install, or execute code which introduces or changes features or functionality')?"**

The memo is NOT a substitute for an actual Apple consultation. It is the homework that maximizes the value of that free 30-60 minute call. The deliverable lets you walk into the consultation with a concrete adapter-distribution plan and a yes/no question list, not an open-ended "is this allowed?"

## Why this matters

If Apple says **YES** (adapters are allowed as data assets, not code) → AGI can ship task-specialized LoRAs (legal, medical, coding, voice-rewrite, summary) and have a _real_ on-device differentiator vs every competitor. No one else ships custom on-device adapters in a consumer mobile AI app.

If Apple says **NO** (adapters count as "code that changes functionality" under 2.5.2) → AGI ships base Foundation Models capability only on iOS. We accept the 3B model's generic floor and differentiate via routing + multi-provider + privacy, not local-specialization.

The answer determines a v1 product surface. Worth the research.

## V4 PRD facts to ground in (don't re-decide)

- Local-mode Tier 1 = Apple Foundation Models (iOS 26+, GA WWDC 2025), called via Swift native module
- Foundation Models is a 3B-parameter model, 2-bit quantized, free at OS level
- iOS Mobile launch target: 2026-08-06
- PRD §10 lock #25: mobile v1 = controller + chat only, NO in-app code execution UI (verified against Apple's enforcement of 2.5.2 vs Replit / Vibecode / Anything Mar-Apr 2026)

## Specific questions to answer

### Q1 — Apple's official framework documentation

Search and read these in depth:

- developer.apple.com/documentation/foundationmodels
- developer.apple.com/documentation/foundationmodels/adapter (if exists)
- developer.apple.com/documentation/backgroundassets
- developer.apple.com/documentation/backgroundassets/assetpackmanager

Capture: any mention of "adapter," "LoRA," "fine-tuning," "specialization," "custom model," "asset pack model." Quote verbatim. Cite section URL.

### Q2 — WWDC 2025 sessions

- Session 286 (Meet the Foundation Models framework) at developer.apple.com/videos/play/wwdc2025/286/
- Any related sessions on Background Assets, Asset Pack Manager, Apple Intelligence
- Search session transcripts for adapter / LoRA / custom-model language

### Q3 — Apple Developer Forums

Search developer.apple.com/forums for:

- "LoRA adapter Foundation Models"
- "custom adapter on-device model"
- "AssetPackManager LLM"
- "Foundation Models fine-tuned"
- Capture any Apple Engineer (verified badge) responses verbatim

### Q4 — Apps shipping on-device AI today

For each of these apps (named in WWDC 2025 keynote + Apple Newsroom), find their App Store listing + blog posts + any technical writeups. Determine: are they using base Foundation Models only, or shipping custom adapters?

- **Signeasy** (contract analysis) — blog.signeasy.com
- **Dark Noise** (soundscape descriptions)
- **Lights Out** (F1 race commentary summary)
- **Capture** (note-taking with category suggestions)
- Any iOS 26 launch-partner app that uses Foundation Models

### Q5 — Guideline 2.5.2 enforcement record

Re-read App Review Guideline 2.5.2 verbatim. Then read every public account of recent enforcement actions:

- **Replit** update-block (2026-03-18) — Replit's official statement + CNBC coverage. What specifically did Apple say was the violation?
- **Vibecode** update-block (same window) — founder statements
- **Anything** removal (2026-03-30) — co-founder Dhruv Amin's statements; what changes did Apple require for reinstatement (returned 2026-04-03)?

Specifically: did Apple cite _dynamic code generation_, _executing the generated code_, or _the rendering of generated UI_? Different framings have different implications for LoRA adapters.

### Q6 — Adjacent precedents

- **Game DLC + Asset Packs:** games legally download multi-GB asset packs that "change app features" (new levels, new characters, new game modes). What makes those OK under 2.5.2? Read Apple's "App Thinning + Background Assets" docs.
- **MLX models:** Apple's own MLX framework lets users download arbitrary models from Hugging Face. How does Apple frame MLX vs LoRA distribution? developer.apple.com/machine-learning/mlx
- **Core ML model updates:** apps update Core ML models server-side all the time. Has Apple ever flagged this under 2.5.2? Search developer forums.
- **App Clip + Live Activity:** any new asset-distribution patterns introduced in iOS 26 / iOS 27 beta?

### Q7 — Comparable Apple SDK gates

- Has Apple historically blocked apps for downloading model weights (any model, not just LoRAs)?
- Has any app been rejected under 2.5.2 specifically for ML asset distribution?
- Search r/iOSProgramming, Hacker News, developer forums for rejection war-stories.

## Methodology

Four passes:

1. **Apple primary docs + WWDC** (Q1 + Q2) — verbatim only.
2. **Apple Developer Forums** (Q3) — only Apple Engineer verified responses count as authoritative.
3. **App shipping evidence** (Q4 + Q6) — what production apps actually do.
4. **Rejection history** (Q5 + Q7) — what's blocked, what's allowed, what's silent.

## Deliverable

Single markdown file at `tasks/research/apple-lora-adapter-research-2026-05-17.md`, ~2500-4000 words:

1. **Executive verdict** — three sentences. "YES with conditions" / "NO" / "AMBIGUOUS — file consultation."
2. **Q1-Q7 answers** with verbatim Apple citations + URLs.
3. **Comparison table:** {vibe-coding apps (rejected) vs game DLC (allowed) vs MLX models (?) vs Core ML updates (allowed) vs LoRA adapters (?)} × {is-code, changes-functionality, requires-entitlement, App-Review-status}.
4. **AGI's concrete adapter-distribution plan** for the App Review consult — 1 page describing exactly: which adapters, how many, who creates them, how they're delivered (AssetPackManager / Background Assets / custom CDN), how the user opts in, how a reviewer can verify the user-facing flow.
5. **Question list for the Apple consult** — 5-8 specific questions to put in the consultation, each phrased so the reviewer can give a yes/no/qualified answer. Sample format:
   - "Is shipping a 30 MB LoRA adapter via AssetPackManager that the user explicitly opts into ('Download legal-drafting specialization?') compatible with Guideline 2.5.2 if the adapter is signed and ships through the App Store CDN?"
6. **Booking instructions** — link to the Apple Developer one-on-one consultation booking page; account requirements; how to brief Apple in advance.
7. **Fallback plan** — if Apple says NO, what's the iOS-side strategy? (probably: ship base Foundation Models only, differentiate via routing + multi-provider in cloud mode).

## Quality bar

- Every Apple-attributed claim has either (a) a documentation URL, (b) a WWDC session timestamp, or (c) a developer-forum thread URL with a verified-Apple-engineer responder.
- No "I think Apple meant…" without a citation.
- Game DLC analogies are stated as analogies, not legal arguments.
- If Apple has been silent on a specific point, log it as `awaiting-review-team` — do not speculate.

## Stop criteria

- If Q1 + Q2 return a clean "adapters are OK as long as X, Y, Z" → write up + done.
- If Q1 + Q2 + Q3 are all silent → escalate to consultation immediately; the rest of the research is corroboration, not decision.
- 8 hours total cap. Better to file the consultation with a partial-but-sharp brief than a complete-but-late one.

---

_End of brief. Self-contained. This memo gates the iOS-side on-device-AI differentiation strategy — high leverage if YES, scoping clarity if NO._
