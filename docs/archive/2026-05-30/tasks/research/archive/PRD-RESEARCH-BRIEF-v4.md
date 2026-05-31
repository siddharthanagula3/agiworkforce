# AGI — Mega Research Brief (for Research Agent)

**Audience:** the research agent that will execute this brief. | **Date:** 2026-05-17. | **Output home:** `tasks/research/` in this repo. | **Mode:** can run as one long single-agent pass, or fanned out to 7 parallel sub-agents (one per phase). The cross-cutting Phase 7 should run last so it can synthesize from Phases 1-6.

This brief produces the technical corpus AGI needs to lock the final architectural and product decisions for: (a) AGI Mobile app (first implementation, public launch July-Aug 2026), (b) AGI Web (Aug 1 paid-tier graduation), (c) AGI Desktop, CLI, Chrome ext, VS Code ext (follow-on surfaces). The principal architect has shipped PRDs at `docs/PRD.md` and `docs/PRD-MOBILE.md` but flagged 6 categories where the PRD is thin: **token caching, AI SDK strategy, scaling cost, App Store IAP rules, content moderation, provider TOS as reseller.** This brief closes those gaps and gives the architect the full competitive + technical landscape.

---

## §0 — Mission context (read before everything)

**What AGI is.** A multi-provider AI client shipping on six surfaces (Mobile / Web / Desktop / CLI / Chrome ext / VS Code ext) with three locked differentiators: (1) multi-provider mid-conversation switching, (2) BYOK + Local LLM as first-class, (3) cross-provider session continuity via tool-schema normalization. Tagline: "Beyond one model. Beyond one surface. AGI in your hands." Brand short-form: "AGI."

**What's locked, what isn't.** Locked (in PRDs): personas, pricing tiers, vendor partnership reality (excluded SDKs Cactus/RunAnywhere/MediaPipe-LLM-deprecated), Apple 5.1.2(i) consent flow, mobile stack (Expo + native modules; `react-native-executorch` Tier 2 + `llama.rn` Tier 3 + Apple Foundation Models / Gemini Nano Tier 1), Wave-6 platform critical path with dates. **Unlocked (this brief resolves):** token-caching strategy across providers, AI SDK abstraction layer choice, infrastructure cost-at-scale projections, App Store reader-rule technical compliance, content moderation for on-device LLM output, provider TOS classification for managed-cloud routing, MCP server safety/curation model, cross-surface state-sync conflict resolution patterns, mobile observability stack, GDPR/CCPA technical obligations.

**Why we need this research.** My training data is at minimum 5 months stale by the user's framing. Vendor APIs, store policies, framework versions, model pricing, and SDK ecosystems all move fast. Every decision below depends on **current (May 2026) ecosystem truth**, not pre-trained knowledge. Use primary sources (vendor docs, official guidelines, repo READMEs, release notes) over secondary (blog posts, tutorials) wherever possible. When secondary is the only source, mark it clearly.

**What I'll do with the output.** I will fold findings into a PRD revision pass:

- Updates to `docs/PRD.md` §11 (vendor reality), §12 (security), §16 (pricing), §17 (risks).
- Updates to `docs/PRD-MOBILE.md` §8 (stack), §13 (security), §14 (compliance), §15 (pricing).
- New appendices: `docs/PRD-APPENDIX-D-OBSERVABILITY-AND-SCALING.md`, `docs/PRD-APPENDIX-E-COMPLIANCE.md`.

---

## §1 — Output deliverables (file structure)

Produce these eight markdown files under `tasks/research/`. Every file targets the word budget shown. Every file ends with a **Sources** section listing primary-source URLs as `[Title](URL)`.

| File                        | Purpose                                                                                                           | Word budget |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------- |
| `00-MASTER-SYNTHESIS.md`    | Executive synthesis answering the architect's 6 Tier-1 questions in §7 below + top 20 takeaways across all phases | 3,500-5,000 |
| `01-consumer-ai-apps.md`    | Phase 1 teardowns of 12 consumer AI apps                                                                          | 3,000-4,000 |
| `02-privacy-first-apps.md`  | Phase 2 teardowns of 12 privacy-first / local-first apps                                                          | 2,500-3,500 |
| `03-developer-sdks-apis.md` | Phase 3 deep dives on 15 LLM provider SDKs / APIs                                                                 | 4,000-5,000 |
| `04-ondevice-runtimes.md`   | Phase 4 deep dives on 12 on-device runtimes                                                                       | 3,000-4,000 |
| `05-frameworks-infra.md`    | Phase 5 framework + infra + auth + payments + observability                                                       | 3,000-4,000 |
| `06-compliance-legal.md`    | Phase 6 store policies + privacy law + AI safety                                                                  | 2,500-3,500 |
| `07-cross-cutting.md`       | Phase 7 the architect's six hard questions, each with a decision recommendation                                   | 3,000-4,500 |

Total corpus: ~25,000-33,500 words. Each file is self-contained but cross-referenced by hyperlink.

---

## §2 — Sources policy

**Primary sources (preferred):**

- Vendor / official developer docs (developer.apple.com, developer.android.com, ai.google.dev, docs.anthropic.com, platform.openai.com, docs.x.ai, etc.)
- Official GitHub repos (READMEs, releases, CHANGELOG, LICENSE files)
- Official changelogs / release notes
- Official pricing pages
- App Store / Google Play listing pages
- Government / regulator pages (gdpr-info.eu, oag.ca.gov, eur-lex.europa.eu)
- OWASP foundation publications
- Standards-body docs (IETF, W3C)

**Secondary sources (use sparingly, flag clearly):**

- Reputable tech publications (TechCrunch, The Verge, Ars Technica, Stratechery, InfoQ, Simon Willison's blog)
- Reddit threads from `/r/LocalLLaMA`, `/r/MachineLearning`, `/r/iOSProgramming`, `/r/reactnative` for "what is the community actually shipping"
- X.com posts only for vendor announcements with verifiable links

**Discouraged:**

- Medium tutorials (often outdated, low signal)
- YouTube videos as primary source (cite only for vendor-official content)
- AI-generated summary sites (use the underlying primary source instead)

**Hard rule:** every factual claim in the output must be either (a) cited to a primary source URL, or (b) marked `[secondary, dated YYYY-MM]` if from a blog/comment with the publication date.

---

## §3 — Phase 1: Consumer AI app teardowns

**Goal.** Understand what the leading consumer AI apps actually ship in May 2026 so AGI can compete on feature parity where required and differentiate where structural openings exist.

**Apps to teardown (12), ordered by priority:**

| Priority | App                                                              | Why it matters to AGI                                                                                      |
| -------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1        | **Anthropic Claude** (mobile, web, desktop, Chrome ext, Cowork)  | Most directly aligned product; best UX reference for chat shell, artifacts, connectors                     |
| 2        | **OpenAI ChatGPT** (mobile, web, desktop, Atlas)                 | Largest consumer share; composer + voice + projects + Atlas browser are reference patterns                 |
| 3        | **Google Gemini** (web, mobile, NotebookLM) + Apple Intelligence | Gemini's rich inline content (Maps, Flights, YouTube embeds); Apple Intelligence is the on-device baseline |
| 4        | **Perplexity** (web, mobile, Comet browser, Perplexity Computer) | The only competitor with a public multi-provider composer dropdown; closest to AGI positioning             |
| 5        | **OpenAI Codex Desktop / Codex CLI**                             | Codex composer chips (plan-mode, speed, permissions, model) are the reference UX for coding agents         |
| 6        | **Cursor**                                                       | Coding-agent depth + IDE integration                                                                       |
| 7        | **xAI Grok** (X integration, standalone app, web)                | New entrant; what does their mobile UX look like? Multi-tier pricing?                                      |
| 8        | **Microsoft Copilot** (web, mobile, Edge, M365)                  | Enterprise positioning, deep integration with productivity stack                                           |
| 9        | **DeepSeek chat app** (web, mobile, Hugging Face Spaces)         | Reasoning-mode UX, Chinese consumer-AI patterns                                                            |
| 10       | **Moonshot Kimi** (mobile, web)                                  | Long-context chat patterns                                                                                 |
| 11       | **Manus AI**                                                     | Agentic workflow patterns                                                                                  |
| 12       | **Z.AI Glm / Z.AI Chat**                                         | GLM-5 consumer surface                                                                                     |

**Per-app extraction template.** Produce a section per app with this exact schema:

```markdown
### {App Name}

- **Vendor:** ...
- **Surfaces shipping in May 2026:** iOS / Android / web / desktop / Chrome ext / VS Code ext / CLI (mark each yes/no with URL)
- **App Store / Play listing (mobile only):** title, subtitle, primary category, rating, review count, last update date, screenshots count, has video preview yes/no, top 5 keywords inferred from listing copy
- **Pricing tiers (May 2026):** table of tiers with name, monthly USD, yearly USD, what's included, free-tier limitations
- **BYOK available?** Yes/No. If yes, which providers can user bring keys for? Where is the BYOK setting?
- **Local mode / on-device LLM?** Yes/No. If yes, model name, parameter count, format, download size, OS requirements.
- **Account requirement to use the app:** Required / Optional / Not required
- **Voice support:** No / Push-to-talk / Always-on duplex / Wispr-Flow-style paste. STT engine if disclosed.
- **Image input (vision):** Yes/No, format
- **Image generation:** Yes/No, provider/model
- **Video generation:** Yes/No, provider/model, tier-gated to
- **Tool use / agents / function calling:** Yes/No, depth
- **MCP support:** Yes/No, transport
- **Connectors / 3rd-party integrations:** count + top 10 named
- **Memory / cross-device sync:** Yes/No, default-on or opt-in, encryption posture
- **Privacy posture:** telemetry default, encryption at rest, on-device option, account-required posture
- **Streaming format on wire:** SSE / WebSocket / other (note: requires technical inspection)
- **Notable UX patterns** (3-7 bullets): composer chips, mode tabs, sheet patterns, model picker UI
- **Recent feature launches (last 90 days):** 3-5 bullets with launch date
- **Top complaints from App Store / Play / Reddit:** 3-5 patterns with example quote and source
- **What AGI can learn / steal / differ from:** 5 bullets
- **Source URLs:** primary first, dates noted
```

**Output:** `tasks/research/01-consumer-ai-apps.md` (3,000-4,000 words total; ~300 words per app).

---

## §4 — Phase 2: Privacy-first / local-first app teardowns

**Goal.** AGI Mobile's primary differentiator is "works offline, free forever, no account." The closest existing examples are local-LLM apps. We need to understand what they actually ship, how they handle App Store policy, and what UX patterns we should adopt or improve.

**Apps to teardown (12), ordered by priority:**

| Priority | App                                                       | Why                                                                      |
| -------- | --------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1        | **PocketPal AI** (iOS + Android)                          | Closest to AGI Mobile Local mode; ships downloadable GGUF on both stores |
| 2        | **Google AI Edge Gallery** (Android + iOS coming)         | Reference architecture for model catalog + downloads + on-device chat    |
| 3        | **Private Mind** (RN + ExecuTorch)                        | Reference for "private mobile AI app on RN"                              |
| 4        | **LM Studio** (desktop)                                   | Reference for desktop local-LLM UX                                       |
| 5        | **Ollama** (desktop + iOS Ollama app)                     | Reference for local-runtime daemon model                                 |
| 6        | **Jan AI** (desktop, local-first)                         | Reference for "ChatGPT replacement on desktop" UX                        |
| 7        | **Msty** (multi-provider desktop chat)                    | Reference for multi-provider UX patterns                                 |
| 8        | **TypingMind** (multi-provider BYOK web)                  | Reference for BYOK web UX; pricing model                                 |
| 9        | **OpenWebUI** (self-hosted, multi-provider)               | Reference for "BYOK everything" UX, OSS leader                           |
| 10       | **LibreChat** (multi-provider self-host)                  | Same category as OpenWebUI; pattern divergences                          |
| 11       | **Cherry Studio** (multi-provider desktop, RU/CN-popular) | Different market context                                                 |
| 12       | **Faraday / Backyard AI**                                 | Character-AI / persona apps for comparison                               |

**Per-app extraction template:**

```markdown
### {App Name}

- **Vendor / maintainer + license** (vendor name, OSS license if applicable)
- **Surfaces:** iOS / Android / web / desktop (Windows/macOS/Linux) — note which
- **App Store / Play status** (if mobile): listed?, rating, top complaints
- **Local-LLM runtime:** llama.cpp / ExecuTorch / MLX / MLC / other
- **Default models shipped / suggested**
- **Model catalog UX:** how is it presented; download UX
- **Download flow:** bundled / on-first-run / user-selected
- **Storage management UX**
- **Account requirement**
- **Cloud / BYOK option** (if multi-provider)
- **Chat persistence + encryption posture**
- **Voice / image support**
- **MCP / tool use support**
- **Public production usage indicators** (App Store rank, GitHub stars, recent releases)
- **Notable architecture decisions** discoverable from public source (if OSS): runtime abstraction, store, sync
- **What AGI can borrow / what AGI should do differently:** 3-5 bullets
- **Sources**
```

**Output:** `tasks/research/02-privacy-first-apps.md` (2,500-3,500 words).

---

## §5 — Phase 3: Developer SDKs + provider APIs

**Goal.** Every provider AGI routes to (managed-cloud Hobby+ tier) or accepts BYOK from has its own API quirks. We need a single normalized reference table so the gateway, `@agiworkforce/llm-normalize`, and the mobile native module know exactly what each provider can do.

**Providers to deep-dive (15):**

| #   | Provider                                                                                                                                                                                     | Why                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 1   | **Anthropic** (Messages API, prompt caching, files, batches, tool use, computer use, extended thinking, citations)                                                                           | Primary managed cloud + Claude BYOK |
| 2   | **OpenAI** (Chat Completions, Responses API, Realtime API, prompt caching, structured outputs, batch, files, vision, audio, embeddings, fine-tuning)                                         | Primary managed cloud + GPT BYOK    |
| 3   | **Google AI / Gemini** (generateContent, context caching explicit + implicit, files, function calling, code execution, grounding with Google Search, structured output, multimodal Live API) | Primary managed cloud + Gemini BYOK |
| 4   | **xAI Grok** (chat completions, current Grok 4.20 / 4.3)                                                                                                                                     | BYOK                                |
| 5   | **DeepSeek** (V4 Flash, V3.2, reasoning mode, prompt cache)                                                                                                                                  | BYOK                                |
| 6   | **Moonshot Kimi** (K2.6)                                                                                                                                                                     | BYOK                                |
| 7   | **Zhipu GLM** (4.7, 5)                                                                                                                                                                       | BYOK                                |
| 8   | **Perplexity** (Sonar, Sonar Deep Research, multi-component billing)                                                                                                                         | BYOK                                |
| 9   | **Mistral / Codestral** (Codestral 2508, function calling, JSON mode)                                                                                                                        | BYOK                                |
| 10  | **Groq** (LPU inference, sub-100ms latency)                                                                                                                                                  | BYOK                                |
| 11  | **Together AI**                                                                                                                                                                              | BYOK                                |
| 12  | **Fireworks AI** (multimodal, function calling)                                                                                                                                              | BYOK                                |
| 13  | **Azure OpenAI** (managed regions, content filter)                                                                                                                                           | BYOK + enterprise                   |
| 14  | **AWS Bedrock** (multi-vendor under one API)                                                                                                                                                 | BYOK + enterprise                   |
| 15  | **OpenRouter** (300+ models, drop-in OpenAI API)                                                                                                                                             | reference for our own routing       |

**Per-provider extraction template:**

```markdown
### {Provider}

**Snapshot (May 2026):**

- Latest stable API version + endpoint base URL
- Models offered (table: name, params, context window, input $/MTok, output $/MTok, cache discount if any)
- **Prompt / context caching:** how is it triggered (auto / explicit `cache_control`), minimum cacheable tokens, TTL (5-min, 1-hour beta?), discount on hit (e.g., 90 %, 75 %), max cache fragments
- **Tool use:** format (OpenAI / Anthropic / Gemini schema), parallel calls supported, max tools per call, streaming partial tool calls
- **Structured output:** JSON mode, JSON schema, strict mode (refusal on non-conformance)
- **Vision input:** formats accepted, max image dimensions, multi-image support
- **Audio:** input (PCM / Opus / WebM), output (TTS available?), Realtime / duplex API
- **Streaming:** SSE format, event types, partial tool call deltas
- **Rate limits:** RPM, TPM, batch concurrency
- **Embeddings:** model, dim, max tokens
- **Files API:** upload, retain, max size, formats
- **Batch API:** async pricing discount (e.g., 50 %), max batch size, turnaround SLA
- **Fine-tuning availability:** yes/no, formats
- **Free / trial tier:** free credits, rate-limit floor
- **TOS for routing on behalf of paying users** (i.e., AGI as reseller): explicit language on multi-tenant proxying, attribution requirements, abuse-mitigation obligations
- **Recent (last 90 days) breaking / non-breaking changes**
- **Migration notes** if any deprecations are scheduled
- **Sources** (primary docs URL + last-modified date)
```

**Cross-provider comparison table.** End the file with a single matrix:

| Capability                   | Anthropic         | OpenAI        | Google            | xAI | DeepSeek | Kimi | GLM | Perplexity | Mistral | Groq | Together | Fireworks | Azure | Bedrock | OpenRouter |
| ---------------------------- | ----------------- | ------------- | ----------------- | --- | -------- | ---- | --- | ---------- | ------- | ---- | -------- | --------- | ----- | ------- | ---------- |
| Prompt caching               | ✓ explicit (90 %) | ✓ auto (50 %) | ✓ explicit (75 %) | ... |          |      |     |            |         |      |          |           |       |         |            |
| Tool use                     |                   |               |                   |     |          |      |     |            |         |      |          |           |       |         |            |
| Structured output (strict)   |                   |               |                   |     |          |      |     |            |         |      |          |           |       |         |            |
| Vision                       |                   |               |                   |     |          |      |     |            |         |      |          |           |       |         |            |
| Audio in (live)              |                   |               |                   |     |          |      |     |            |         |      |          |           |       |         |            |
| Streaming partial tool calls |                   |               |                   |     |          |      |     |            |         |      |          |           |       |         |            |
| Batch API                    |                   |               |                   |     |          |      |     |            |         |      |          |           |       |         |            |
| Reseller TOS friendly        |                   |               |                   |     |          |      |     |            |         |      |          |           |       |         |            |
| Free trial credits May 2026  |                   |               |                   |     |          |      |     |            |         |      |          |           |       |         |            |

**Output:** `tasks/research/03-developer-sdks-apis.md` (4,000-5,000 words).

---

## §6 — Phase 4: On-device runtime deep dives

**Goal.** Lock the mobile + desktop on-device LLM runtime choices with confidence. Confirm tier picks made in PRD-MOBILE §8 against current ecosystem reality.

**Runtimes to deep-dive (12):**

| #   | Runtime                                                                                                    | Relevance                      |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1   | **Apple Foundation Models** (iOS 26+, Swift API, adapters, `.fmadapter`)                                   | iOS Tier 1                     |
| 2   | **Gemini Nano via AICore + ML Kit GenAI** (Android)                                                        | Android Tier 1                 |
| 3   | **llama.cpp** + **llama.rn** (RN bindings, Expo plugin)                                                    | Mobile Tier 3 universal        |
| 4   | **ExecuTorch** + **react-native-executorch** (RN bindings, Expo fetcher)                                   | Mobile Tier 2                  |
| 5   | **MLX** + **MLX-Swift** + **mlx-lm** (Apple Silicon)                                                       | Desktop / future-Swift app     |
| 6   | **MLC-LLM** (TVM-based, cross-platform)                                                                    | Alternative consideration      |
| 7   | **LiteRT** + **LiteRT-LM** (Google's TFLite successor)                                                     | Cross-platform alternative     |
| 8   | **ONNX Runtime Mobile**                                                                                    | Cross-platform                 |
| 9   | **whisper.cpp** (offline STT)                                                                              | Mobile + Desktop voice Tier 2  |
| 10  | **Piper TTS** (offline TTS)                                                                                | Desktop voice; mobile possible |
| 11  | **Core ML** (Apple's general ML, including Whisper Core ML pack)                                           | iOS Tier 2 for non-LLM tasks   |
| 12  | **TensorFlow Lite + MediaPipe** (note: MediaPipe LLM Inference deprecated for mobile, but other features?) | Reference                      |

**Per-runtime extraction template:**

```markdown
### {Runtime}

- **Latest stable version (May 2026)** + release date
- **License** (exact: MIT / Apache-2.0 / BSD / proprietary / source-available-with-thresholds — quote the LICENSE file if relevant)
- **Platforms:** iOS / Android / Windows / macOS / Linux / web
- **Native bindings:** Swift, Kotlin, React Native (which lib? Expo support?), Flutter, Python
- **Model formats supported:** GGUF / MLX / ONNX / .pte / .litertlm / Core ML / .mlpackage / .task
- **Hardware acceleration:** Apple Neural Engine, Metal, NPU (Qualcomm/MediaTek), GPU, CPU SIMD (NEON, AMX)
- **Performance benchmarks** on flagship phones (iPhone 15 Pro / 16 Pro, Pixel 8 Pro / 9 Pro, Samsung S24+) for representative models (1B/3B/7B): TTFT, decode tok/s, peak RAM, battery delta per 10 generations, thermal throttle behavior
- **App-store-shipping production users:** named apps, with App Store / Play listings as proof
- **Active issues / known bugs:** scan GitHub issues for production-blocking items
- **Recent breaking changes** (last 90 days)
- **Recommended for AGI usage at which tier?** Yes/No with rationale
- **Sources**
```

**Comparison matrix at end of file:**

| Feature                   | Apple FM | Gemini Nano | llama.cpp | llama.rn | ExecuTorch | RN-ExecuTorch | MLX-Swift | MLC-LLM | LiteRT-LM | ONNX Mobile | whisper.cpp |
| ------------------------- | -------- | ----------- | --------- | -------- | ---------- | ------------- | --------- | ------- | --------- | ----------- | ----------- |
| iOS ✓                     |          |             |           |          |            |               |           |         |           |             |             |
| Android ✓                 |          |             |           |          |            |               |           |         |           |             |             |
| Expo plugin ✓             |          |             |           |          |            |               |           |         |           |             |             |
| GGUF support ✓            |          |             |           |          |            |               |           |         |           |             |             |
| Vision multimodal ✓       |          |             |           |          |            |               |           |         |           |             |             |
| License permissive ✓      |          |             |           |          |            |               |           |         |           |             |             |
| Production app shipping ✓ |          |             |           |          |            |               |           |         |           |             |             |

**Output:** `tasks/research/04-ondevice-runtimes.md` (3,000-4,000 words).

---

## §7 — Phase 5: Frameworks + infrastructure + auth + payments + observability

**Goal.** Lock the platform-level technical choices. We have V3 PRD claims (Next.js 16.2, Tauri 2.11.1, Expo 55 + RN 0.84, Stripe Dahlia, Supabase 2.105, etc.) — confirm each is current and best-in-class for May 2026, and surface anything that should change.

**Topics to research:**

### Frameworks (web + desktop + mobile + cross-platform)

| Topic                                           | What to confirm / research                                                                                                                                                                                                                          |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Next.js 16**                                  | Current LTS minor, breaking changes since 15, App Router patterns, Server Actions vs Route Handlers, `proxy.ts` migration from `middleware.ts`, React Compiler 1.0 status, Turbopack default, Edge Runtime cost / pricing, Vercel hosting specifics |
| **Tauri 2**                                     | Current minor, capabilities system, plugin ecosystem (auto-updater, secure-storage, global-shortcut), sandboxing, performance vs Electron                                                                                                           |
| **Expo SDK 55 + 56**                            | What's new, RN 0.84/0.85 changes, dev-client + EAS workflows, Expo Router stability, native module patterns (Expo Modules API vs raw Turbo Modules)                                                                                                 |
| **React Native New Architecture**               | Fabric + TurboModules + Nitro Modules: which production patterns work in 2026, JSI overhead measurements, common gotchas                                                                                                                            |
| **Apple Swift 6 + SwiftUI**                     | If we ever do a native Swift split app, current best practices                                                                                                                                                                                      |
| **Vercel AI SDK v6**                            | Capabilities (streaming, tool use, structured output, multi-step agentic), comparison with raw vendor SDKs, production shippability                                                                                                                 |
| **LangChain / LangGraph / Mastra / LlamaIndex** | When (if ever) do these add value vs writing it ourselves; current state May 2026                                                                                                                                                                   |

### Hosting / infra

| Topic                                                | What to research                                                                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vercel**                                           | Pro plan pricing May 2026, Edge Function vs Serverless Function cost knee-points, Turbo machines default, KV / Postgres / Blob pricing            |
| **Fly.io**                                           | Current pricing, machine sizes, multi-region patterns, volume snapshot billing, inter-region traffic costs                                        |
| **Supabase**                                         | Pro vs Team vs Enterprise tiers, connection pool limits per tier, Realtime concurrent connection limits, Storage egress, RLS performance at scale |
| **Cloudflare** (R2 / Workers / D1 / Durable Objects) | Pricing comparison; R2 as model-file CDN                                                                                                          |
| **Upstash Redis**                                    | Pricing per request, REST vs native, rate-limit pattern best practices                                                                            |
| **Hugging Face**                                     | Inference Endpoints pricing, model hosting (private vs public), download bandwidth                                                                |

### Auth + payments

| Topic                                              | What to research                                                                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Supabase Auth**                                  | PKCE flow on mobile native, SSR cookie pattern, SSO support (SAML, OIDC), MFA, SOC 2 status                                                 |
| **Apple Sign In** + **Google Sign In**             | Latest SDK versions, mobile + web integration patterns, Apple Sign-In-only-for-iOS rule                                                     |
| **OAuth 2.1 + PKCE (RFC 8252)**                    | Native-app best practices for desktop CLI flow                                                                                              |
| **Stripe Dahlia (2026-04-22)**                     | Managed Payments features, Subscriptions API best practices, Webhooks 2.0, Customer Portal, Stripe Tax automation, link to MoR alternatives |
| **Apple In-App Purchase (StoreKit 2)**             | When required vs when external purchase allowed, reader rule technical implementation, EU DMA alternative payment provider rules            |
| **Google Play Billing**                            | Latest version, alternative billing in EU, sub plans, Promo codes                                                                           |
| **RevenueCat**                                     | Cross-platform subscription abstraction; pricing; production usage                                                                          |
| **MoR alternatives (Paddle, LemonSqueezy, Polar)** | When MoR makes sense vs direct Stripe                                                                                                       |

### Observability + analytics

| Topic                               | What to research                                                   |
| ----------------------------------- | ------------------------------------------------------------------ |
| **Sentry**                          | Pricing tier, mobile SDK, privacy posture (data scrubbing options) |
| **Plausible**                       | Self-hosted vs cloud, pricing, mobile SDK quality                  |
| **PostHog**                         | Open-source self-host, vs cloud pricing, privacy posture           |
| **Mixpanel**                        | Mobile analytics quality                                           |
| **Firebase Crashlytics**            | If using; Google account requirement                               |
| **OpenTelemetry**                   | Mobile + Node.js + Rust support; vendor-neutrality                 |
| **Datadog / New Relic / Honeycomb** | Enterprise observability; pricing                                  |

**Output:** `tasks/research/05-frameworks-infra.md` (3,000-4,000 words).

---

## §8 — Phase 6: Compliance + legal + store policies + AI safety

**Goal.** Surface every law / guideline / policy that AGI must satisfy at launch, with the exact current (May 2026) version and the technical implementation we must ship.

**Topics to research:**

### Mobile store policies

| Topic                                                                  | What to research                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Apple App Store Guidelines May 2026**                                | All sections relevant to AI apps: 2.5.2 (downloaded code), 4.0 (design), 4.3 (spam/clone), 5.1.1 (privacy), 5.1.2 (data collection), 5.1.2(i) (third-party AI sharing — Nov 2025 update), 4.5.3 (text-to-image gen), age rating for generative AI |
| **Apple — In-App Purchase / external purchase / reader rule / EU DMA** | Current exact rules for routing subscriptions to web; technical disclosure requirements; recent precedent rejections                                                                                                                              |
| **Apple Privacy Manifest**                                             | Required declarations, Required Reason APIs, tracking domains posture                                                                                                                                                                             |
| **Google Play Policies May 2026**                                      | AI-generated content policy (in-app reporting required), Dynamic Code policy, Health Connect, Financial features declaration                                                                                                                      |
| **Google Play Data Safety**                                            | Required disclosures, no-data-collected category criteria                                                                                                                                                                                         |
| **Chrome Web Store**                                                   | MV3 enforcement, native messaging host requirements, permission justifications                                                                                                                                                                    |
| **VS Code Marketplace**                                                | Publisher requirements, content policies, license metadata                                                                                                                                                                                        |

### Privacy law

| Topic                        | What to research                                                                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GDPR May 2026**            | Art. 13 (information to data subjects), 15 (access), 17 (erasure), 20 (portability), 25 (privacy by design), 32 (security), 35 (DPIA threshold for AI). Recent EDPB AI guidance. |
| **CCPA / CPRA (California)** | Opt-out of sale/share, sensitive personal info treatment, automated-decision-making disclosure                                                                                   |
| **State privacy laws 2026**  | Colorado, Connecticut, Virginia, Texas TDPSA, Florida, Oregon — what specifically applies to AI                                                                                  |
| **EU AI Act**                | When obligations kick in for general-purpose AI deployers, transparency requirements                                                                                             |
| **UK Online Safety Act**     | Relevance to AI chat apps that may surface harmful content                                                                                                                       |
| **HIPAA**                    | Only if AGI serves regulated health-data users; what would it take to be HIPAA-eligible (BAA with vendors)                                                                       |
| **SOC 2**                    | Timeline + cost; required for enterprise tier                                                                                                                                    |
| **ISO 27001**                | Same                                                                                                                                                                             |

### AI safety + content moderation

| Topic                              | What to research                                                                                                                                                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **On-device safety models**        | Llama-Guard 3 (1B / 8B variants), Granite-Guardian, Prompt-Guard, Phi-Safety. Sizes, formats, mobile suitability, license                                                                                                                    |
| **Cloud-side content filters**     | Anthropic safety filters, OpenAI moderation API, Google Safety Settings, Azure content safety                                                                                                                                                |
| **OWASP LLM Top 10 v2.0 (2025)**   | Each of 10 risks + current 2026 update status, mapping to AGI surfaces                                                                                                                                                                       |
| **OWASP Top 10 for Agents (2026)** | Latest, mapping to AGI's tool-use + computer-use                                                                                                                                                                                             |
| **Liability landscape**            | Recent (2025-2026) court cases / regulatory actions against AI publishers for on-device-generated harmful content; what's the precedent for liability when a 3B model generates something harmful but the publisher has no cloud-side filter |
| **Voice cloning prevention**       | If shipping local TTS (Piper), what liability exists if user clones a voice; what voice fingerprint / watermarking standards exist                                                                                                           |

**Output:** `tasks/research/06-compliance-legal.md` (2,500-3,500 words).

---

## §9 — Phase 7: Cross-cutting questions (the six hard ones)

**Goal.** Give the architect a clear recommendation on each of the six unresolved questions from the post-PRD audit. Each question gets a section with: (a) what the question is, (b) findings from Phases 1-6, (c) recommendation with rationale, (d) sources.

### Q1 — Token caching strategy across providers

What to answer:

- For each of Anthropic, OpenAI, Google: current (May 2026) prompt-caching features, cache TTL (5-min standard / 1-hour beta?), minimum cacheable tokens, cache-hit pricing discount, max cache fragments, explicit vs implicit triggering
- Can `@agiworkforce/llm-normalize` provide a single API to opt into caching across all three providers?
- For a Hobby $10/mo user with a 5,000-token system prompt + 2,000-token tool definitions, what's the realistic cost reduction per 1,000 daily messages if caching is on?
- What's the right managed-cloud unit economics: with caching, what fraction of input tokens are cache hits vs misses?
- **Recommendation:** explicit caching strategy for AGI managed-cloud, with pseudo-code for `@agiworkforce/llm-normalize` cache-directive translation

### Q2 — AI SDK strategy

What to answer:

- Vercel AI SDK v6 in May 2026: production-grade for serious multi-provider apps? Feature lag vs raw vendor SDKs?
- What do production multi-provider apps (OpenRouter, TypingMind, Cline/Roo Code, Cursor, Continue.dev) actually use as the SDK layer?
- Should AGI use Vercel AI SDK as the canonical facade, raw vendor SDKs everywhere, or our own `@agiworkforce/llm-normalize`?
- **Recommendation:** one canonical architecture with rationale; map of which surfaces use what

### Q3 — App Store IAP external-purchase rules in 2026

What to answer:

- Current exact (May 2026) Apple App Store rules for routing subscription purchases to web
- Reader rule, external link allowances, EU DMA alternative payment provider rules
- Technical implementation required for a SaaS-style subscription that routes to web Stripe checkout from an iOS app — exact UI patterns, disclosure copy, what's banned
- Precedent: in 2025-2026, which apps successfully shipped this pattern? Which got rejected for it?
- **Recommendation:** specific implementation pattern for AGI Mobile + risk assessment

### Q4 — Provider TOS classification for AGI managed-cloud reseller

What to answer:

- For each of Anthropic, OpenAI, Google, exact (May 2026) TOS clauses on multi-tenant proxying, reselling, routing on behalf of paying end users
- Volume / enterprise agreement thresholds at which we should pursue a formal commercial relationship
- Rate-limit pooling implications: if 1,000 AGI Hobby users share one Anthropic key, what's the abuse-mitigation obligation
- Pricing-change risk: if Anthropic raises rates 20 % overnight, what's our contractual position vs an enterprise customer's
- **Recommendation:** managed-cloud TOS posture for Aug 1 launch + risk mitigations

### Q5 — Content moderation for on-device LLM output

What to answer:

- Current (2025-2026) legal/liability landscape for app publishers when a small on-device model (1-3B) generates harmful content
- Production examples: PocketPal AI, Private Mind, AI Edge Gallery — what content moderation do they ship?
- Available on-device safety models (Llama-Guard 3 1B, Granite-Guardian 1B, Phi-Safety) — size, license, mobile-fit, accuracy
- Right v1 posture: deny-list + report-flow only (cheap, fast) vs running a safety model on every Local-mode output (expensive, slow, more compute)
- **Recommendation:** AGI Local mode content-moderation strategy with implementation cost

### Q6 — Scaling cost projections + when to move off serverless

What to answer:

- For AGI's stack (Vercel Pro + Supabase Pro + Upstash Redis + Fly.io api-gateway + Fly.io signaling-server + Hugging Face / R2 model CDN), monthly infra cost at:
  - 10K MAU (90% BYOK / 10% Hobby)
  - 100K MAU (70% BYOK / 30% Hobby)
  - 1M MAU (60% BYOK / 30% Hobby / 10% Pro+)
- Cost knee-points: where does the unit cost per MAU spike?
- When (if ever) should AGI move parts of the stack off Vercel / Supabase to dedicated infra (Kubernetes, bare metal, AWS)?
- Multi-region considerations for mobile users globally
- **Recommendation:** scaling-architecture roadmap with cost milestones

**Output:** `tasks/research/07-cross-cutting.md` (3,000-4,500 words).

---

## §10 — Master synthesis

**File:** `tasks/research/00-MASTER-SYNTHESIS.md` (3,500-5,000 words).

**Required structure:**

```markdown
# AGI Research — Master Synthesis (May 2026)

## §1 — Executive verdict (1 page)

[Single most important takeaway per phase, bulleted]

## §2 — Decisions the architect should make this week

[Top 6 decisions, each with: question, evidence summary, recommendation]
[Map directly to the six Q1–Q6 of Phase 7]

## §3 — Top-20 takeaways across all phases

[Bulleted, with one-line source citation each]

## §4 — Competitive landscape one-pager

[Single table: AGI vs top 6 competitors on the dimensions that matter for May 2026 launch]

## §5 — Tech-stack confirmation / revisions

[For every locked stack item in PRD V3 and PRD-MOBILE: confirmed-as-current, needs-update, or fully-revised. Concrete diff.]

## §6 — Risk-register additions

[Any new risks the research surfaced that aren't in PRD §17]

## §7 — Open questions still requiring founder input

[Things research can't answer — must be a founder decision (e.g., brand mark choice, EU Enterprise SLA terms)]

## §8 — Re-prioritization recommendations

[Should AGI shift roadmap / mobile timeline / Aug 1 graduation based on findings?]
```

This synthesis is the architect's single read. Phases 1-7 are reference material; this synthesis is the action plan.

---

## §11 — Output format + style rules

- **Markdown only.** No HTML, no images embedded (use links to source images if needed).
- **Tables for comparisons, prose for analysis, bullets for lists.**
- **Cite primary sources inline** as `[Title](URL)` immediately after the claim. End each file with a consolidated **Sources** section.
- **Dates on every URL** when fetched if the source is time-sensitive (e.g., pricing pages).
- **Sentence-case section headers** (`## §1 — Executive verdict`, not `## §1 — EXECUTIVE VERDICT`).
- **No marketing language.** Direct, terse, factual. If something is uncertain, say "uncertain" with the reason.
- **Word budget enforcement:** if a phase file exceeds the budget by >20 %, cut filler before submitting.
- **No emoji.**
- **No filler phrases:** "It's worth noting that…", "As we can see…", "Interestingly…". Cut.
- **Cross-reference between files** using relative links: `[Phase 3 — OpenAI deep dive](03-developer-sdks-apis.md#openai)`.

---

## §12 — Time budget hint

A single research agent running all 7 phases sequentially: estimate 6-10 hours of compute. Fan out to 7 parallel agents: 1-2 hours wall-clock for the same coverage. The Master Synthesis (Phase 8) should run last, sequentially, after Phases 1-7 are written, so it can read and cross-reference them.

---

## §13 — Constraints + anti-patterns

- **Do not produce marketing copy.** The architect will reject anything that reads like a vendor blog post.
- **Do not invent benchmark numbers.** If a number isn't in a cited source, say "no public benchmark found for this configuration, range estimate based on N similar setups: X-Y tok/s."
- **Do not cite training-data-cached info.** If a claim isn't backed by a URL fetched during this research, mark it `[uncited]` so the architect can decide whether to discard.
- **Do not skip the Sources section** of any file. A file without a sources section is rejected.
- **Do not include screenshots without URLs.** Reference image URLs in source pages.
- **Do not write generic prose.** Every paragraph should narrow a decision or contradict a prior assumption.

---

## §14 — Hand-off checklist

Before declaring the research complete, the agent should:

- [ ] Confirm all 8 files exist under `tasks/research/`
- [ ] Confirm each file is within its word budget (±20 %)
- [ ] Confirm each file has a Sources section with ≥10 primary-source URLs
- [ ] Confirm cross-references between files resolve (no broken `[Phase N](...)` links)
- [ ] Confirm the Master Synthesis (`00-MASTER-SYNTHESIS.md`) gives a concrete decision recommendation for each of Phase 7's six Q1–Q6 questions
- [ ] Confirm no "[uncited]" claims remain in `00-MASTER-SYNTHESIS.md` (they may remain in supporting phase files as flagged caveats)
- [ ] Confirm no markdown-rendering errors (mismatched tables, broken code blocks)

When the checklist is complete, the agent's final message should list the 8 files with word counts and a one-paragraph summary of the most surprising finding from each phase.

---

_End of research brief. This document is the contract between the architect and the research agent. The output of this brief becomes the input to the next PRD revision pass._
