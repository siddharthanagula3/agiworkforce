# AGI — FINAL Research Brief

**Status:** canonical research brief for the AGI multi-surface AI app. **Supersedes** `tasks/research/PRD-RESEARCH-BRIEF.md` and `tasks/research/PRD-RESEARCH-PROMPT-FOUR-PASS.md`. The research agent reads only this one.

**Audience:** the research agent. Output goes under `tasks/research/` in this repo (`/Users/siddhartha/Desktop/agiworkforce/`).

**Mode:** can run as one long sequential pass, or fan out to 12 parallel sub-agents (one per research area in §6). Master synthesis (`00-MASTER-SYNTHESIS.md`) is always written last so it can cross-reference the area files.

**Date of research:** 2026-05-17 (kick-off) → 2026-05-24 (deliverable target).

---

## §0 — How to use this brief (read first)

This is the OS for the research. Follow it.

**Four-pass workflow (default):** Pass 1 X.com → Pass 2 Reddit → Pass 3 GitHub → Pass 4 Primary/official → Extraction → Quality scoring → Synthesis. Hypothesis-generation sources (X, Reddit, GitHub) cannot drive a final recommendation; only primary/official sources can.

**Pass-order inversion (mandatory for the topics below):** for regulatory, legal, license, store-policy, provider-TOS, and AI-safety topics, **start with primary sources first**, then use X/Reddit/GitHub only to discover edge cases, implementation pain, and enforcement precedent. Inverted areas in this brief: Area 7 (App Store IAP / EU DMA), Area 8 (Provider TOS), Area 9 (Content moderation liability), Area 10 (Privacy law / GDPR / CCPA / EU AI Act), Area 11 (API pricing-change history).

**Two artifacts are required alongside every deliverable:**

1. **PRISMA-style search log** (`tasks/research/_search_log.csv`) — every query run, count of records identified, duplicates removed, screened, excluded by reason, full texts assessed, evidence rows extracted, included in synthesis, decision-driving subset.
2. **NIST AI RMF risk register** (`tasks/research/_risk_register.csv`) — every risk surfaced, mapped to Govern/Map/Measure/Manage, with failure mode, likelihood (1-5), severity (1-5), mitigation, residual risk, revisit trigger.

**Reading-cold rule:** the final `00-MASTER-SYNTHESIS.md` must be readable by someone who has not seen the PRDs. Embed enough context inline that decisions are understandable without cross-references.

**Compliance:** see §17. Default to vendor APIs / CLIs / RSS / sitemaps. Do not script X.com (X's automation rules ban scripting their website). Treat Reddit scraping as high-risk; use search-engine discovery (`site:reddit.com ...`) instead. Respect robots.txt as coordination, not authorization.

---

## §1 — Topic block (filled in)

```yaml
Topic: AGI multi-surface AI app — close 12 open architectural questions and lock final stack before Mobile public launch (target 2026-07-20 to 2026-08-16), Web Aug-1 paid-tier graduation, and follow-on surfaces Desktop / CLI / Chrome ext / VS Code ext.

Decision to support:
  - lock the mobile on-device runtime selection across 3 tiers (Apple Foundation Models / Gemini Nano / react-native-executorch / llama.rn)
  - lock the AI SDK abstraction strategy (Vercel AI SDK vs raw vendor SDKs vs @agiworkforce/llm-normalize)
  - lock the token caching strategy across managed-cloud providers
  - lock the App Store IAP / external-purchase compliance pattern
  - lock the provider TOS posture for managed-cloud routing
  - lock the on-device content moderation strategy
  - lock the scaling roadmap with cost milestones at 10K/100K/1M MAU
  - lock the observability stack
  - lock the privacy / compliance technical requirements at launch
  - resolve the API-pricing-change risk for AGI's BYOK + managed-cloud lanes
  - map the vendor roadmap horizon (next 12 months) so AGI doesn't ship into known deprecations
  - build the May 2026 competitive landscape (consumer AI + privacy-first)

Audience: AGI Principal Architect (solo founder) + future engineering contributors + AI coding agents reading PRDs cold.

Date of research: 2026-05-17 kick-off → 2026-05-24 deliverable.

Geography: global launch; deep regulatory attention to US (state-by-state privacy), EU (GDPR + AI Act + DMA), India, China where regulators meaningfully differ.

Budget: solo-founder time-bound. Free / open-source tooling preferred. Agent compute budget: 6-10 hours sequential, or 1-3 hours wall-clock fanned out to 12 parallel sub-agents.

Time horizon: research feeds PRD revision pass within 7 days. Mobile M0 spike in flight; M1 Local hidden alpha by 2026-06-21; M3 public launch by 2026-08-16. Web Aug-1 graduation locked.

Success criteria:
  - All 6 Tier-1 questions (Q1-Q6) have decision recommendations backed by ≥3 primary-source citations each
  - All 6 Tier-2 questions (Q7-Q12) have at least an evidence-backed analysis with named risks
  - ≥70% of decision-driving claims cite a primary source
  - Competitive matrix for ≥12 consumer AI apps + ≥12 privacy-first apps current as of May 2026
  - Per-provider API capability matrix for 15 LLM providers
  - Per-runtime feature matrix for 12 on-device runtimes with current-month benchmarks
  - Risk register has ≥15 new risks not in existing PRD V3 §17
  - Every eliminated candidate has a one-sentence reason
  - PRISMA-style search log + NIST AI RMF risk register both delivered as artifacts

Known constraints (locked, do not re-litigate):
  - AGI mobile stack: Expo SDK 55 + RN 0.84 + native modules. No Swift/Kotlin rewrite v1.
  - Free-forever Local + BYOK Cloud non-negotiable.
  - Apple 5.1.2(i) explicit consent modal ships in iOS onboarding.
  - Cactus / cactus-react-native excluded (license thresholds + telemetry defaults).
  - RunAnywhere SDK excluded (license thresholds + telemetry defaults).
  - MediaPipe LLM Inference (mobile API) excluded — Google deprecated it; use LiteRT-LM if cross-platform local is needed.
  - V3 PRD tier hierarchy on mobile: Apple Foundation Models (iOS T1) / Gemini Nano via AICore (Android T1) / react-native-executorch (T2) / llama.rn (T3).
  - Stripe API version: 2026-04-22.dahlia.
  - Brand: AGI (public) / AGI Workforce (legal). Repo path agiworkforce.

Unspecified items (research may inform; founder retains decision):
  - Exact mobile launch date within 2026-07-20 to 2026-08-16
  - Whether to ship Apple IAP v1 or rely entirely on external-purchase to web Stripe
  - Whether Pro Max $99 tier flips live on mobile at v1 or only after web Aug-1 flip
  - Hardware test matrix beyond iPhone 15 Pro + Pixel 8 Pro
  - Whether to ship on-device safety filter (Llama-Guard 1B / Granite-Guardian / Phi-Safety) in v1 or defer
  - Whether to adopt a third-party AI gateway (OpenRouter / Portkey / LiteLLM) or build our own

Assumptions log: append every assumption made during research as `(assumption: X — basis: Y)`.
```

---

## §2 — Research objectives (12)

1. **Lock mobile on-device runtime selection** — confirm or revise the 3-tier stack against May 2026 production reality across iOS + Android.
2. **Lock AI SDK abstraction strategy** — one canonical decision across all six surfaces.
3. **Lock token-caching strategy** for managed-cloud unit economics — per-provider cache directives, TTLs, discounts, cross-provider abstraction.
4. **Lock App Store IAP / external-purchase compliance** — exact technical pattern for routing subscriptions through web Stripe from iOS without violating reader rule or EU DMA rules.
5. **Lock provider TOS posture** for AGI as multi-tenant managed-cloud reseller routing through Anthropic / OpenAI / Google master keys.
6. **Lock content-moderation strategy** for on-device LLM output — deny-list-only vs running a small safety model on every Local-mode generation.
7. **Map cost-at-scale projections** at 10K / 100K / 1M MAU; identify cost knee-points; recommend infra migration thresholds.
8. **Define observability stack** for a privacy-first app where telemetry is opt-in only.
9. **Surface compliance obligations** — GDPR Articles 13/15/17/20/25/32/35, CCPA/CPRA, EU AI Act for GP-AI deployers, US state privacy laws 2026-2027, AI safety frameworks.
10. **Build competitive landscape** for May 2026 — what shipping consumer AI apps and privacy-first apps actually do (UX, pricing, BYOK, local mode, voice, image, video, MCP, memory).
11. **Resolve API pricing-change risk** — past instances of vendor price hikes, developer-frustration patterns, lock-in via vendor SDKs, future-proofing strategies, role of abstraction layers. THIS IS NEW vs prior briefs.
12. **Map vendor roadmap horizon** — Anthropic / OpenAI / Google / Apple / Android / Stripe / MCP / OWASP / EU AI Act published roadmaps and announcements through May 2026; what's coming in next 12 months; what's deprecated and on what timeline. THIS IS NEW vs prior briefs.

---

## §3 — Core questions (Q1-Q15)

**Tier 1 (must answer to unblock PRD revision pass):**

- **Q1:** Current (May 2026) prompt-caching feature set per provider (Anthropic, OpenAI, Google, DeepSeek, Mistral). Can `@agiworkforce/llm-normalize` provide a single API across all? Realistic Hobby $10/mo unit-economics impact?
- **Q2:** Vercel AI SDK v6, raw vendor SDKs, or `@agiworkforce/llm-normalize`? What do production multi-provider apps (OpenRouter, TypingMind, Cline/Roo Code, Cursor, Continue.dev, LobeChat, OpenWebUI) actually use in May 2026? What about gateway products (LiteLLM, Portkey, Helicone)?
- **Q3:** Exact current Apple App Store rules for routing subscription purchases to web (reader rule + EU DMA alternative payments). Precedent rejections / approvals 2025-2026. Specific implementation pattern for AGI Mobile.
- **Q4:** Exact (May 2026) TOS clauses from Anthropic / OpenAI / Google on multi-tenant proxying, reselling, routing on behalf of end users. When does AGI need formal commercial / volume agreements? What attribution / abuse-mitigation obligations exist?
- **Q5:** Legal / liability landscape for on-device LLM output 2025-2026. What do PocketPal AI / Private Mind / AI Edge Gallery ship for content moderation? Should AGI ship on-device safety model (Llama-Guard 1B / Granite-Guardian / Phi-Safety) in v1 or defer? Sizes, accuracy, mobile-fit, license per safety-model candidate.
- **Q6:** Realistic monthly infra cost at 10K / 100K / 1M MAU for AGI's stack (Vercel + Supabase + Fly.io + Upstash + Hugging Face / R2 model CDN). Knee-points. When migrate off Vercel / Supabase to dedicated infra?

**Tier 2 (must answer before public launch):**

- **Q7:** Cross-surface state-sync conflict-resolution pattern (CRDT vs OT vs LWW) when mobile + desktop + web all edit same conversation? What do production multi-device apps use (Linear, Notion, Apple Notes, Google Keep, Signal, Matrix)?
- **Q8:** Production observability stack in May 2026 for privacy-first mobile app respecting "telemetry off by default" — Sentry / Plausible / PostHog / Firebase Crashlytics / OpenTelemetry combinations.
- **Q9:** Right MCP server safety / curation model — vetted-marketplace-only, open-with-warnings, or hybrid? How do Claude Desktop / Codex Desktop / AI Edge Gallery sandbox third-party MCP servers? How is the MCP spec evolving (2025-11-25 → next)?
- **Q10:** Specific (May 2026) technical requirements AGI must ship to satisfy GDPR Articles 13/15/17/20/25/32/35, CCPA/CPRA, state privacy laws taking effect 2026-2027, EU AI Act phased obligations, UK Online Safety Act, OWASP LLM Top 10 v2.0.

**Tier 3 (resolve before / inform Aug-1 + post-launch):**

- **Q11:** Past API pricing changes by Anthropic / OpenAI / Google / others — when, how much, what notice period, developer reaction. How were developers locked in via vendor SDKs? What abstraction strategies do production apps use to future-proof against this? Specifically: does using Vercel AI SDK / LiteLLM / Portkey / OpenRouter actually mitigate the risk vs raw SDKs? **THIS IS NEW.**
- **Q12:** What's on each vendor's published roadmap through May 2027? Anthropic announcements (anthropic.com/news), OpenAI announcements (openai.com/blog), Google AI (blog.google + ai.google.dev release notes), Apple (developer.apple.com/news + WWDC26 timing), Android (android-developers.googleblog.com), Stripe (docs.stripe.com/changelog), MCP spec (modelcontextprotocol.io), OWASP, NIST AI RMF, EU AI Act phased application timeline. What's deprecated and on what schedule (Sora 2 EOL 2026-09-24, Veo 3.0 preview EOL 2025-11-12, MediaPipe LLM mobile, etc.)? **THIS IS NEW.**
- **Q13:** Multi-provider gateways comparison: OpenRouter vs Portkey vs LiteLLM vs Helicone vs Vercel AI Gateway. Pricing, latency overhead, feature parity, production usage, vendor-lock-in implications, when to build our own vs adopt.
- **Q14:** Hardware acceleration roadmap — Apple Neural Engine evolution (A18 / M5 / A19 announced?), Qualcomm NPU roadmap, MediaTek NPU. What's coming that changes on-device LLM economics in the next 12 months?
- **Q15:** App Store Optimization (ASO) patterns for AI apps in 2026 — keywords, screenshots, video previews, what gets featured by Apple / Google. Privacy-first AI app precedents.

---

## §4 — Source priority + pass-order policy

**Default pass order (use unless overridden by §6 area):**

1. **x.com** — vendor launch notes, breaking changes, operator screenshots, last 90 days
2. **reddit.com** — operator pain, hardware reports, real-device benchmarks, failure modes
3. **github.com** — official repos, releases, issues, discussions, code samples, version constraints
4. **Primary / official** — vendor docs, model cards, license files, official changelogs, regulator publications, standards-body docs
5. **Secondary synthesis** — only after primary verification: Simon Willison, Stratechery, TechCrunch, The Verge, InfoQ, Ars Technica

**Inverted pass order (primary-first for these topic classes):**

- License / IP review
- Privacy law (GDPR, CCPA, EU AI Act, state laws)
- App store policies (Apple guidelines, Play policies, Chrome Web Store rules)
- Provider TOS (Anthropic, OpenAI, Google AUP/usage policies)
- AI safety / liability frameworks (OWASP, NIST AI RMF, ISO/IEC 42001)
- Standards-body specifications (MCP spec, IETF RFCs, W3C)

For inverted topics, start with the primary source URLs listed in §5. Use X/Reddit/GitHub _afterward_ only to discover enforcement precedent, recent edge cases, or unresolved community questions.

**Future-trends sources** (always include in §6 Area 12 and where relevant elsewhere):

- Vendor "News" / blog pages with last-90-days filter
- Vendor "Changelog" / "Release notes" pages
- Conference recordings (WWDC, Google I/O, AWS re:Invent — only as primary)
- Regulator notice pages (FTC, EDPB, EU Commission, California AG)
- Public earnings call transcripts (Anthropic IPO not yet; OpenAI / Microsoft / Google / Stripe quarterly remarks where AI-cost-relevant)
- Standards-body roadmap docs (MCP roadmap blog, OWASP project roadmap)

**HARD RULE:** every decision-driving claim in `00-MASTER-SYNTHESIS.md` must trace to a primary-source URL fetched during this research. Training-data-cached claims are flagged `[uncited]` and may not drive recommendations.

---

## §5 — Primary sources to verify FIRST

For inverted-pass-order areas, hit these URLs **before** running any X/Reddit/GitHub query. For default-pass-order areas, hit these during Pass 4 verification. Record retrieval date + section/page reference for every fetch.

### A. Apple

- developer.apple.com/documentation/FoundationModels
- developer.apple.com/videos/play/wwdc2025/286/ (Foundation Models WWDC25 intro)
- developer.apple.com/news/ (filter last 90 days)
- developer.apple.com/app-store/review/guidelines/ (full, current revision)
- developer.apple.com/support/dma-and-apps-in-the-eu/ (EU DMA alternative payments)
- developer.apple.com/app-store/external-payment-link-entitlement/ (reader rule + external purchase entitlement)
- developer.apple.com/storekit/ (StoreKit 2 docs)
- developer.apple.com/documentation/bundleresources/privacy_manifest_files (Privacy Manifest + Required Reason APIs)
- machinelearning.apple.com/research (Apple ML research papers)

### B. Anthropic

- docs.anthropic.com (full — Messages API, prompt caching, files, batches, tool use, computer use, extended thinking, citations, Skills)
- docs.anthropic.com/en/docs/build-with-claude/prompt-caching (critical for Q1)
- anthropic.com/news (filter last 90 days for Q12)
- anthropic.com/pricing
- anthropic.com/legal/aup (Acceptable Use Policy)
- anthropic.com/legal/consumer-terms
- anthropic.com/legal/commercial-terms
- github.com/anthropics (anthropic-sdk-typescript, anthropic-sdk-python, anthropic-cookbook)
- huggingface.co/anthropic (model cards if any)

### C. OpenAI

- platform.openai.com/docs (Chat Completions, Responses API, Realtime API, prompt caching, structured output, batch, files, vision, audio, embeddings, fine-tuning, Assistants)
- platform.openai.com/docs/guides/prompt-caching (critical for Q1)
- openai.com/pricing
- openai.com/blog (filter last 90 days for Q12)
- openai.com/policies/terms-of-use
- openai.com/policies/usage-policies
- openai.com/policies/business-terms (commercial)
- developers.openai.com
- help.openai.com (API tier rate limits, abuse mitigation)
- github.com/openai (openai-node, openai-python, openai-cookbook)

### D. Google AI

- ai.google.dev/gemini-api/docs (generateContent, context caching, files, function calling, code execution, grounding, structured output, multimodal Live API)
- ai.google.dev/gemini-api/docs/caching (critical for Q1)
- ai.google.dev/gemini-api/docs/pricing
- ai.google.dev/terms (Gemini API ToS)
- blog.google/technology/ai (filter last 90 days for Q12)
- developers.googleblog.com (filter last 90 days)
- developer.android.com/ai/gemini-nano (AICore)
- developers.google.com/ml-kit/genai
- android-developers.googleblog.com (filter last 90 days for Q12)
- aistudio.google.com
- github.com/google-gemini, github.com/google-ai-edge

### E. Other LLM providers

- docs.x.ai (Grok 4.20 / 4.3 / future); x.ai/pricing; x.ai/legal
- api-docs.deepseek.com (V4 Flash, V3.2, reasoning, prompt cache); deepseek.com
- platform.moonshot.ai / platform.moonshot.cn (Kimi K2.6)
- bigmodel.cn or z.ai/api-platform (GLM-4.7 / GLM-5)
- docs.perplexity.ai (Sonar, Sonar Deep Research)
- docs.mistral.ai (Codestral 2508, function calling, JSON mode)
- console.groq.com/docs (LPU inference)
- docs.together.ai
- docs.fireworks.ai
- learn.microsoft.com/azure/ai-services/openai
- docs.aws.amazon.com/bedrock
- openrouter.ai/docs (model catalog + their reseller TOS — important for Q4 + Q11)

### F. On-device runtimes

- github.com/ggml-org/llama.cpp + releases
- github.com/mybigday/llama.rn + Expo plugin docs
- github.com/pytorch/executorch + releases
- github.com/software-mansion/react-native-executorch + Expo support
- github.com/ml-explore/mlx-swift
- github.com/google-ai-edge/LiteRT-LM + LiteRT
- github.com/google-ai-edge/gallery
- github.com/a-ghorbani/pocketpal-ai
- github.com/ggml-org/whisper.cpp
- github.com/Vaibhavs10/insanely-fast-whisper (reference)
- github.com/janhq/jan
- github.com/open-webui/open-webui
- github.com/danny-avila/LibreChat
- github.com/CherryHQ/cherry-studio
- github.com/lobehub/lobe-chat

### G. Multi-provider gateways

- openrouter.ai/docs, openrouter.ai/terms (reseller TOS + pricing for Q4 + Q11 + Q13)
- github.com/BerriAI/litellm (LiteLLM)
- github.com/Portkey-AI/gateway (Portkey)
- github.com/Helicone/helicone (Helicone)
- sdk.vercel.ai/docs (Vercel AI SDK + Vercel AI Gateway)

### H. Frameworks

- nextjs.org/blog + nextjs.org/docs (Next.js 16.x)
- tauri.app/v2/ (Tauri 2)
- docs.expo.dev (Expo SDK 55+)
- reactnative.dev/blog (RN 0.84+ + New Architecture)
- developer.apple.com/swift (Swift 6 + SwiftUI)
- kotlinlang.org/docs
- sdk.vercel.ai/docs (v6 features + production parity)
- js.langchain.com/docs

### I. Infrastructure + hosting

- vercel.com/pricing (Turbo machines default behavior)
- vercel.com/docs/pricing
- supabase.com/pricing (Pro/Team/Enterprise connection pool numbers)
- fly.io/docs/about/pricing
- upstash.com/pricing (Redis REST)
- huggingface.co/pricing (Inference Endpoints + bandwidth)
- developers.cloudflare.com/r2/pricing
- developers.cloudflare.com/workers/platform/pricing

### J. Auth + payments

- supabase.com/docs/guides/auth (PKCE, SSR cookie, SSO, MFA)
- developers.google.com/identity
- developer.apple.com/sign-in-with-apple
- datatracker.ietf.org/doc/html/rfc8252 (OAuth 2.0 for native apps)
- docs.stripe.com/api/versioning + docs.stripe.com/changelog (current Dahlia 2026-04-22 + next version)
- docs.stripe.com/billing/subscriptions/overview
- docs.stripe.com/payments/checkout
- developer.android.com/google/play/billing
- developer.apple.com/storekit
- revenuecat.com/docs (subscription abstraction)
- paddle.com/docs, lemonsqueezy.com/docs, polar.sh/docs (MoR alternatives)

### K. Observability + analytics

- docs.sentry.io
- plausible.io/docs
- posthog.com/docs
- firebase.google.com/docs/crashlytics
- opentelemetry.io
- datadoghq.com (enterprise pricing)
- newrelic.com (enterprise pricing)
- honeycomb.io

### L. Privacy / compliance / AI safety

- gdpr-info.eu (Articles 13/15/17/20/25/32/35)
- digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai (EU AI Act consolidated text + phased application dates)
- eur-lex.europa.eu (AI Act full text)
- oag.ca.gov/privacy/ccpa (CCPA/CPRA)
- iapp.org/resources/article/us-state-privacy-legislation-tracker (state laws 2026-2027)
- gov.uk/government/publications/online-safety-act-guidance (UK Online Safety Act)
- ftc.gov/news-events (recent AI enforcement actions)
- edpb.europa.eu (European Data Protection Board AI guidance)
- genai.owasp.org/llm-top-10 (OWASP LLM Top 10 v2.0)
- owasp.org/www-project-ai-security-and-privacy-guide
- nist.gov/itl/ai-risk-management-framework (NIST AI RMF + Playbook)
- iso.org/standard/77304.html (ISO/IEC 42001 AI management system)

### M. AI safety models

- huggingface.co/meta-llama/Llama-Guard-3-1B (model card)
- huggingface.co/ibm-granite/granite-guardian-3.1-2b
- huggingface.co/meta-llama/Prompt-Guard-86M
- huggingface.co/HuggingFaceM4/idefics2-8b (multimodal safety)
- modelcards on HF for any Phi-Safety variants
- ai.meta.com/llama/responsible-use-guide

### N. Standards

- modelcontextprotocol.io (MCP spec home)
- github.com/modelcontextprotocol/specification (versioned spec)
- github.com/modelcontextprotocol/typescript-sdk
- blog.modelcontextprotocol.io (roadmap posts)

### O. Hardware

- developer.apple.com/wwdc26 (when accessible; WWDC26 timing)
- developer.qualcomm.com/software/ai-engine (NPU)
- developer.mediatek.com (NPU)

### P. App-store-listing references

- App Store + Play listing pages for: ChatGPT, Claude, Gemini, Perplexity, Copilot, Grok, DeepSeek, Kimi, PocketPal AI, Private Mind, AI Edge Gallery, Jan AI

---

## §6 — Search queries per research area

12 areas. Each lists pass-order (default vs inverted), then X / Reddit / GitHub / Primary queries. For inverted areas, Primary runs first.

### Area 1 — Mobile on-device LLM runtime selection

**Pass order:** default (X → Reddit → GitHub → Primary)

**X queries:**

- `site:x.com (apple OR FoundationModels) (ios26 OR "iOS 26") developer api since:2026-01-01`
- `site:x.com ("Apple Intelligence") on-device adapters fmadapter since:2025-09-01`
- `site:x.com ("Gemini Nano" OR "AICore" OR "ML Kit GenAI") android (pixel OR samsung OR mediatek) 2026`
- `site:x.com ("llama.rn" OR "react-native-executorch") expo (production OR "app store" OR "play store")`
- `site:x.com ("MLX" OR "mlx-swift") production iphone since:2026-01-01`
- `site:x.com ("ExecuTorch" OR "@pytorch/executorch") meta production 2026`
- `site:x.com "LiteRT-LM" gemma android 2026`
- `site:x.com "whisper.cpp" mobile iphone production "app store" since:2026-01-01`

**Reddit queries:**

- `site:reddit.com/r/LocalLLaMA ("Qwen 2.5" OR "Llama 3.2" OR "Gemma 3" OR "Phi-4") (iphone OR pixel OR "samsung s24") "tokens per second"`
- `site:reddit.com/r/LocalLLaMA on-device offline ios android 2026`
- `site:reddit.com/r/reactnative (expo OR "expo dev client") (llama OR executorch OR "on-device LLM")`
- `site:reddit.com/r/iOSProgramming "Foundation Models" ios26 adapter`
- `site:reddit.com/r/PocketPalAI review rating`
- `site:reddit.com/r/Android "Gemini Nano" AICore`
- `site:reddit.com/r/privacy "offline ai" assistant mobile 2026`

**GitHub queries:**

- `gh search repos "llama.rn" --sort updated`
- `gh search issues "expo" "llama.rn" is:issue state:open created:>=2026-03-01`
- `gh search issues repo:ggml-org/llama.cpp ios state:open`
- `gh search issues repo:software-mansion/react-native-executorch state:open`
- `gh search code "FoundationModels" language:Swift extension:swift`
- `gh search repos "executorch" --sort updated stars:>500`
- `gh search issues repo:pytorch/executorch (ios OR android) state:open created:>=2026-02-01`
- `gh search repos "mlx-swift" --sort updated`
- `gh search issues repo:ggml-org/whisper.cpp (ios OR coreml) state:open`
- `gh search repos "LiteRT-LM" --sort updated`

**Primary (verify after X/Reddit/GitHub):** see §5.F.

**Area-specific inclusion:** runtime must have iOS + Android paths or Expo/RN bindings; license MIT/Apache-2.0/BSD; updated within 90 days; ≥1 production app shipping on App Store or Play.

### Area 2 — Consumer AI app competitive landscape (May 2026)

**Pass order:** default

**X queries:**

- `site:x.com ("Claude mobile" OR "Claude iOS") feature launch since:2026-02-01`
- `site:x.com ("ChatGPT" OR "ChatGPT mobile") (gpt-5.4 OR gpt-5.5 OR Atlas) since:2026-02-01`
- `site:x.com "Gemini" mobile launch (ios OR android) since:2026-02-01`
- `site:x.com "Perplexity" (mobile OR Comet OR Computer) launch since:2026-02-01`
- `site:x.com (Codex OR "OpenAI Codex desktop") launch since:2026-02-01`
- `site:x.com "Grok" (mobile OR ios OR android) since:2026-02-01`
- `site:x.com "DeepSeek" chat mobile app since:2026-02-01`
- `site:x.com "Microsoft Copilot" (M365 OR Edge OR mobile) launch since:2026-02-01`

**Reddit queries:**

- `site:reddit.com/r/ChatGPT (ios OR android) "feature missing" complaint since:2026-02-01`
- `site:reddit.com/r/Anthropic claude mobile feature complaint`
- `site:reddit.com/r/Gemini complaint feature missing`
- `site:reddit.com/r/Perplexity_AI Comet computer feature`
- `site:reddit.com/r/cursor mobile ios feature`
- `site:reddit.com/r/OpenAI codex desktop launch`
- `site:reddit.com/r/MachineLearning OR /r/Singularity 2026 ai apps competitive`

**GitHub queries:**

- `gh search repos "ChatGPT clone" OR "claude clone" stars:>200 created:>=2025-09-01 sort:updated`
- `gh search repos "multi-provider" "BYOK" stars:>500 sort:updated`

**Primary (verify):** App Store + Play listings for each app; vendor "What's new" pages; vendor pricing pages. See §5.P.

**Area-specific inclusion:** app shipping on App Store / Play / web in May 2026; ≥1 tier-pricing page; review count ≥1,000 if mobile; verified vendor identity.

### Area 3 — Privacy-first / local-first apps

**Pass order:** default

(Queries as previously specified — see prior brief, unchanged.)

Primary verification: App Store + Play listings, GitHub READMEs for a-ghorbani/pocketpal-ai, software-mansion/private-mind, google-ai-edge/gallery, janhq/jan, open-webui, LibreChat, CherryHQ, lobehub/lobe-chat.

### Area 4 — Developer SDKs + provider APIs

**Pass order:** **inverted (primary-first)** because precise behavior + TOS depend on the vendor's own canonical docs.

**Primary (run FIRST):** all of §5.B, §5.C, §5.D, §5.E. Capture per-provider: model list with $/MTok, prompt-caching directives + TTL + discount, tool use schema + parallel + max tools, structured output (JSON mode + JSON schema strict), vision input (formats, sizes, multi-image), audio (PCM/Opus/WebM in; TTS out; Realtime/duplex), streaming (SSE format + partial tool-call deltas), rate limits (RPM, TPM), embeddings (model + dim + max tokens), files API, batch API discount + SLA, fine-tuning, free/trial tier, TOS for routing on behalf of paying users, last-90-days breaking changes.

**X queries:**

- `site:x.com "Anthropic" (prompt cache OR Files API OR batch API OR "Computer use") 2026`
- `site:x.com "OpenAI" (Responses API OR Realtime API OR "prompt cache" OR structured output) 2026`
- `site:x.com "Google AI" (Gemini API OR "context caching" OR Live API) 2026`
- `site:x.com (Vercel "AI SDK" OR @ai-sdk) v6 (tool use OR structured output OR streaming)`

**Reddit queries:**

- `site:reddit.com/r/OpenAI "prompt caching" cost`
- `site:reddit.com/r/Anthropic "prompt cache" 90 percent`
- `site:reddit.com/r/Bard OR /r/Gemini "context cache"`
- `site:reddit.com/r/MachineLearning multi-provider gateway 2026`

**GitHub queries:**

- `gh search repos owner:anthropics --sort updated`
- `gh search repos owner:openai openai-node --sort updated`
- `gh search repos owner:google-gemini generative-ai-js --sort updated`
- `gh search issues repo:vercel/ai (production OR migration OR breaking) state:open created:>=2026-02-01`
- `gh search repos owner:BerriAI litellm --sort updated`
- `gh search repos owner:portkey-ai gateway --sort updated`

**Cross-provider matrix in output:** prompt caching, tool use, structured output (strict), vision, audio in (live), streaming partial tool calls, batch API, reseller-TOS friendly, free trial credits as of May 2026.

### Area 5 — Token caching strategy

**Pass order:** **inverted (primary-first)** — provider docs are authoritative on caching directives + pricing.

**Primary (run FIRST):**

- docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- platform.openai.com/docs/guides/prompt-caching
- ai.google.dev/gemini-api/docs/caching
- api-docs.deepseek.com (DeepSeek prompt cache)
- docs.mistral.ai (Mistral prompt cache, if any)

**X queries (after primary):**

- `site:x.com "prompt caching" (anthropic OR claude) (TTL OR "5 minute" OR "1 hour" OR beta) since:2025-09-01`
- `site:x.com "OpenAI" "automatic prompt caching" (gpt-5.4 OR gpt-5.5) since:2025-09-01`
- `site:x.com "Gemini" "context caching" (explicit OR implicit OR TTL) since:2025-09-01`

**Reddit queries:**

- `site:reddit.com/r/Anthropic prompt cache cost reduction`
- `site:reddit.com/r/OpenAI prompt cache "50 percent" discount`

**GitHub queries:**

- `gh search issues repo:anthropics/anthropic-sdk-typescript "cache_control" state:closed`
- `gh search issues repo:openai/openai-node prompt cache`
- `gh search issues repo:google-gemini/generative-ai-js context cache`

**Extraction targets:** per provider — minimum cacheable tokens, TTL (standard + beta), cache-hit discount %, max cache fragments, explicit vs implicit triggering, behavior across model versions, abuse-mitigation, billing for cache writes, cross-provider abstraction options.

### Area 6 — AI SDK abstraction strategy

**Pass order:** default (X → Reddit → GitHub → Primary)

**X queries:**

- `site:x.com "Vercel AI SDK" v6 production (multi-provider OR tool use) since:2025-09-01`
- `site:x.com (LangChain OR LangGraph) production multi-provider`
- `site:x.com Mastra ai sdk launch`

**Reddit queries:**

- `site:reddit.com/r/nextjs vercel ai sdk v6 review`
- `site:reddit.com/r/LangChain production complaint`
- `site:reddit.com/r/MachineLearning multi-provider abstraction`

**GitHub queries:**

- `gh search repos owner:vercel ai --sort updated`
- `gh search issues repo:vercel/ai (production OR migration OR breaking) state:open created:>=2026-02-01`
- `gh search repos owner:langchain-ai langchainjs --sort updated`
- `gh search repos owner:cline cline --sort updated`
- `gh search repos owner:continuedev continue --sort updated`
- `gh search repos owner:RooCode --sort updated`
- `gh search code "createOpenAI" OR "createAnthropic" OR "createGoogleGenerativeAI" path:packages stars:>200`

**Primary:** sdk.vercel.ai/docs, js.langchain.com/docs, Cline / Roo Code / Continue.dev READMEs.

**Extraction targets:** Vercel AI SDK v6 feature parity vs raw vendor SDKs; what production multi-provider apps use; cancellation, retries, tool-use schemas, structured-output APIs, streaming chunk shapes, prompt-caching pass-through, batch API support.

### Area 7 — App Store IAP / external-purchase compliance

**Pass order:** **inverted (primary-first)** — store policy interpretation is binding.

**Primary (run FIRST):**

- developer.apple.com/app-store/review/guidelines (full guidelines — every paragraph)
- developer.apple.com/app-store/external-payment-link-entitlement
- developer.apple.com/support/dma-and-apps-in-the-eu
- developer.apple.com/news/?tags=app-store (filter to last 12 months)
- support.google.com/googleplay/android-developer (Play policies)
- support.google.com/googleplay/android-developer/answer/13985936 (AI-generated content)

**X queries:**

- `site:x.com (App Store OR "App Review") (BYOK OR "bring your own key" OR "5.1.2") rejected 2026`
- `site:x.com Apple "reader rule" OR "external purchase" subscription 2026`
- `site:x.com EU DMA "alternative payment provider" iOS 2026`

**Reddit queries:**

- `site:reddit.com/r/iOSProgramming "External purchase" OR "reader rule" 2026`
- `site:reddit.com/r/iOSProgramming "5.1.2" OR "BYOK" OR "API key" rejected`
- `site:reddit.com/r/iosdev subscription stripe web link 2026`

**GitHub queries:**

- `gh search code "appstoreconnect.apple.com" path:metadata language:Swift`
- `gh search repos "external purchase entitlement" sort:updated`

**Extraction targets:** exact technical disclosure UI required; banned patterns; reader rule eligibility criteria; EU DMA scope (EU users only? worldwide?); 2025-2026 successful precedent vs rejected precedent; what AGI must ship in its iOS subscription-routing flow.

### Area 8 — Provider TOS for managed-cloud reseller

**Pass order:** **inverted (primary-first)** — TOS clauses are dispositive.

**Primary (run FIRST):**

- anthropic.com/legal/aup, /consumer-terms, /commercial-terms
- openai.com/policies/terms-of-use, /usage-policies, /business-terms
- policies.google.com/terms/generative-ai/use-policy, ai.google.dev/terms
- openrouter.ai/terms (precedent reseller)

**X queries:**

- `site:x.com Anthropic "terms of service" (commercial OR reseller OR proxy OR multi-tenant) 2026`
- `site:x.com OpenAI "terms of use" (reseller OR proxy) 2026`
- `site:x.com Google "Gemini API" terms commercial reseller 2026`

**Reddit queries:**

- `site:reddit.com/r/OpenAI reseller TOS multi-tenant`
- `site:reddit.com/r/Anthropic reseller commercial`
- `site:reddit.com/r/SaaS multi-provider AI gateway TOS`

**GitHub queries:**

- `gh search repos openrouter OR portkey OR helicone OR berriai --sort updated stars:>100`
- `gh search issues repo:BerriAI/litellm (tos OR reseller OR proxy) state:closed`

**Extraction targets:** explicit reseller language per provider; volume / enterprise agreement thresholds; abuse-mitigation obligations; attribution / labeling requirements; pricing-change risk allocation (vendor raises rate — what happens to AGI?); minimum security/privacy obligations placed on AGI as routing party.

### Area 9 — Content moderation for on-device LLM output

**Pass order:** **inverted (primary-first)** — store policy + legal landscape first; community evidence second.

**Primary (run FIRST):**

- support.google.com/googleplay/android-developer/answer/13985936 (AI content policy)
- developer.apple.com/app-store/review/guidelines (4.0 Design, 1.1 Objectionable Content, 1.2 User-Generated Content)
- huggingface.co/meta-llama/Llama-Guard-3-1B (model card)
- huggingface.co/ibm-granite/granite-guardian-3.1-2b
- huggingface.co/meta-llama/Prompt-Guard-86M
- ai.meta.com/llama/responsible-use-guide

**X queries:**

- `site:x.com "Llama-Guard" mobile on-device 2026`
- `site:x.com "Granite Guardian" IBM safety small 2026`
- `site:x.com "Prompt Guard" Meta safety mobile`
- `site:x.com (PocketPal OR "Private Mind" OR "AI Edge Gallery") safety moderation`

**Reddit queries:**

- `site:reddit.com/r/LocalLLaMA "Llama Guard" OR "Granite Guardian" safety filter`
- `site:reddit.com/r/LocalLLaMA on-device safety filter mobile`
- `site:reddit.com/r/MachineLearning content moderation LLM small model`

**GitHub queries:**

- `gh search repos "Llama-Guard" --sort updated`
- `gh search repos "granite-guardian" --sort updated`
- `gh search repos "prompt-guard" --sort updated`

**Extraction targets:** smallest available safety model fitting mobile (size, accuracy, license); on-device deny-list patterns; production examples; legal precedent for publisher liability when 3B model generates harmful content with no filter; right v1 posture (filter-on-every-message vs deny-list + report-flow only).

### Area 10 — Scaling cost + observability + privacy compliance

**Pass order:** **inverted (primary-first)** for compliance items; default for cost / observability.

**Primary (run FIRST for compliance):**

- gdpr-info.eu/art-13-gdpr through art-35-gdpr
- oag.ca.gov/privacy/ccpa
- digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai (EU AI Act + phased application timeline)
- iapp.org/resources/article/us-state-privacy-legislation-tracker
- genai.owasp.org/llm-top-10
- nist.gov/itl/ai-risk-management-framework

**Primary (cost / observability):**

- vercel.com/pricing
- supabase.com/pricing
- fly.io/docs/about/pricing
- upstash.com/pricing
- huggingface.co/pricing
- developers.cloudflare.com/r2/pricing
- docs.sentry.io
- plausible.io/docs
- posthog.com/docs

**X queries:**

- `site:x.com Vercel pricing 2026 (Pro OR Turbo OR Edge function) cost`
- `site:x.com Supabase (Pro OR Team OR Enterprise) pricing 2026 connection pool`
- `site:x.com Fly.io pricing 2026 multi-region`
- `site:x.com (GDPR OR CCPA) AI app 2026 enforcement`
- `site:x.com "EU AI Act" "general-purpose AI" deployer 2026 obligations`

**Reddit queries:**

- `site:reddit.com/r/nextjs vercel cost 100k users monthly`
- `site:reddit.com/r/Supabase pro tier connection pool exhausted`
- `site:reddit.com/r/flyio multi-region cost`
- `site:reddit.com/r/privacy gdpr ai chat app obligations`

**GitHub queries:**

- `gh search repos owner:getsentry sentry-react-native --sort updated`
- `gh search repos owner:PostHog posthog --sort updated`
- `gh search repos owner:plausible analytics --sort updated`
- `gh search repos owner:open-telemetry opentelemetry-js --sort updated`

**Extraction targets:** monthly $$$ projections at 10K/100K/1M MAU per service; connection-pool / concurrent-Realtime limits per Supabase tier; GDPR articles requiring technical features (export, erasure, DPIA threshold); EU AI Act phased application dates relevant to AGI as GP-AI deployer; observability stack production patterns respecting telemetry-off-by-default.

### Area 11 — API pricing-change frustrations + future-proofing (NEW)

**Pass order:** **inverted (primary-first for pricing history) then heavy X/Reddit/GitHub for community frustration**

**Primary (run FIRST — pricing history):**

- anthropic.com/pricing + Wayback Machine snapshots for 2023-2026 (use `web.archive.org/web/2024*/anthropic.com/pricing` style)
- openai.com/pricing + Wayback Machine snapshots
- ai.google.dev/gemini-api/docs/pricing + Wayback
- web.archive.org snapshots for: x.ai/pricing, perplexity.ai/pricing, deepseek.com pricing, mistral.ai/pricing, console.groq.com/pricing
- Stripe's docs.stripe.com/api/versioning showing forced-upgrade history
- openrouter.ai/models (current $/MTok for routed providers)

**Primary (run FIRST — abstraction-layer claims):**

- sdk.vercel.ai/docs (multi-provider features)
- docs.litellm.ai (LiteLLM abstraction)
- portkey.ai/docs (Portkey gateway)
- openrouter.ai/docs (routing model + fallback behavior)
- helicone.ai/docs (observability + caching pass-through)

**X queries:**

- `site:x.com (OpenAI OR Anthropic OR "Google AI") "price increase" OR "price hike" 2024 OR 2025 OR 2026`
- `site:x.com (OpenAI OR Anthropic) "deprecated" model "still using"`
- `site:x.com vendor lock-in "AI SDK" frustration 2026`
- `site:x.com "OpenRouter" OR "LiteLLM" "lock-in" mitigation`
- `site:x.com "Sora 2" EOL deprecation discontinue user reaction`
- `site:x.com "veo-3.0" preview EOL Google migrate`

**Reddit queries:**

- `site:reddit.com/r/OpenAI price increase deprecation complaint`
- `site:reddit.com/r/Anthropic price model deprecation`
- `site:reddit.com/r/MachineLearning vendor lock-in API change`
- `site:reddit.com/r/ChatGPTPro price hike value`
- `site:reddit.com/r/SaaS multi-provider abstraction "vendor lock-in"`
- `site:reddit.com/r/LocalLLaMA "BYOK" "OpenRouter" cost saving`
- `site:reddit.com/r/programming "api pricing" hike frustration 2025 OR 2026`

**GitHub queries:**

- `gh search issues "deprecated" repo:openai/openai-node state:closed`
- `gh search issues "deprecated" repo:anthropics/anthropic-sdk-typescript state:closed`
- `gh search issues "deprecated" repo:google-gemini/generative-ai-js state:closed`
- `gh search issues "price increase" OR "pricing change" repo:BerriAI/litellm`
- `gh search issues "migration" OR "breaking change" repo:vercel/ai state:closed created:>=2025-09-01`
- `gh search code "fallback" "openai" "anthropic" "google" path:packages stars:>500`

**Hacker News queries (use Algolia HN API or `site:news.ycombinator.com`):**

- `site:news.ycombinator.com "price increase" OpenAI OR Anthropic OR Google 2024 OR 2025 OR 2026`
- `site:news.ycombinator.com deprecation API model 2025 OR 2026`
- `site:news.ycombinator.com "vendor lock-in" AI SDK 2026`

**Extraction targets:**

- Pricing-change history table: vendor / date / model / old $/MTok / new $/MTok / notice period / dev-community reaction (sentiment, top complaint, top mitigation)
- Deprecation timeline table: vendor / model / announced date / EOL date / migration path / community reaction
- Abstraction-layer evaluation: for each of OpenRouter / LiteLLM / Portkey / Vercel AI SDK / Helicone, does the abstraction actually let you swap providers when pricing changes (does it cost extra latency? extra $? feature lag?)
- Lock-in risk per SDK type: raw vendor SDK (high lock-in) vs Vercel AI SDK (medium) vs `@agiworkforce/llm-normalize` (low) vs gateway like OpenRouter (low but vendor-of-vendor risk)
- Recommendation for AGI: best abstraction strategy to insulate Hobby $10/mo unit economics from a vendor price hike

### Area 12 — Vendor roadmaps + future trends + deprecations (NEW)

**Pass order:** **inverted (primary-first)** — vendor announcements and standards-body roadmaps are authoritative; community speculation is secondary.

**Primary (run FIRST — vendor news / blogs, filter last 6 months):**

- anthropic.com/news
- openai.com/blog
- developers.openai.com (release notes)
- blog.google/technology/ai
- developers.googleblog.com
- ai.google.dev/release-notes (Gemini API changelog)
- android-developers.googleblog.com
- developer.apple.com/news
- machinelearning.apple.com/research
- docs.stripe.com/changelog (Stripe API version timeline)
- blog.modelcontextprotocol.io (MCP roadmap)
- nextjs.org/blog
- expo.dev/changelog
- reactnative.dev/blog
- docs.x.ai/announcements

**Primary (run FIRST — standards-body / regulatory):**

- digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai (EU AI Act phased application: Feb 2025 prohibited practices; Aug 2025 GP-AI obligations; Aug 2026 high-risk; full Aug 2027)
- iapp.org/resources/article/us-state-privacy-legislation-tracker (state laws taking effect 2026-2027)
- genai.owasp.org/llm-top-10 (OWASP LLM Top 10 v2.0 → v3 schedule)
- nist.gov/itl/ai-risk-management-framework (NIST AI RMF roadmap)

**X queries:**

- `site:x.com (Anthropic OR OpenAI OR Google) roadmap announcement (Q3 OR Q4 OR 2026 OR 2027)`
- `site:x.com (Apple OR Android) AI roadmap WWDC26 OR "Google I/O 2026"`
- `site:x.com EU AI Act 2026 enforcement deadline`
- `site:x.com "Sora 2" deprecation EOL 2026-09-24`
- `site:x.com "Veo 3.0" preview EOL`
- `site:x.com MCP spec 2.0 roadmap`

**Reddit queries:**

- `site:reddit.com/r/MachineLearning "OpenAI roadmap" OR "Anthropic roadmap" 2026 2027`
- `site:reddit.com/r/Anthropic claude future model`
- `site:reddit.com/r/OpenAI gpt-6 roadmap`
- `site:reddit.com/r/Bard OR /r/Gemini Gemini "2.0" OR "3.5" roadmap`

**GitHub queries:**

- `gh release list --repo modelcontextprotocol/specification --limit 20`
- `gh release list --repo vercel/next.js --limit 20`
- `gh release list --repo expo/expo --limit 10`
- `gh release list --repo pytorch/executorch --limit 10`
- `gh release list --repo ggml-org/llama.cpp --limit 10`
- `gh search issues repo:modelcontextprotocol/specification (roadmap OR "v2") state:open`

**Extraction targets:**

- **Vendor roadmap table:** vendor / announced item / target date / probability (announced/leaked/speculated) / impact on AGI
- **Deprecation schedule:** product / vendor / announce date / EOL date / migration path / AGI exposure
- **Regulatory timeline:** law / region / phased dates / specific AGI obligations / mitigation deadline
- **Standards roadmap:** standard / current version / next version target / change implications
- **12-month horizon table:** what's likely to happen in next 12 months that AGI must accommodate (e.g., GPT-6, Claude Opus 5, Gemini 4, Apple Foundation Models v2 in iOS 27, new EU AI Act milestones, new state privacy laws, OWASP LLM Top 10 v3)

### Areas 13-15

Cover Q13 (multi-provider gateways comparison), Q14 (hardware acceleration roadmap), Q15 (ASO for AI apps in 2026). Use default pass order. Each gets a ~700-word section in `07-cross-cutting.md`. Run X / Reddit / GitHub / Primary queries as needed; do not over-invest if Tier 1 budget is tight.

---

## §7 — Inclusion / exclusion criteria

**Inclusion (apply to every claim retained):**

- English-language sources first; non-English only for region-specific regulators or models with no English equivalent.
- Recency: primary sources within 6 months for fast-moving topics; standards within 24 months; foundational law within 5 years.
- Evidence type: primary docs, model cards, license files, official changelogs, vendor pricing pages, regulator publications, official GitHub README/releases, Wayback Machine snapshots when historical primary needed.
- Minimum detail: source contains specifics to reproduce or trace to a verifiable artifact.
- Required metadata: every claim has source URL + retrieval date + section/page reference.

**Exclusion:**

- Anonymous claims with no evidence.
- Reposts of reposts (every claim traces to a primary).
- Benchmark screenshots with no setup disclosed.
- Stale docs superseded by newer official docs.
- Medium tutorials when a primary source covers the same fact.
- Claims dated > 9 months ago for fast-moving topics.
- AI-generated summary sites (use the underlying primary).
- Vendor marketing copy presented as fact.

---

## §8 — Data extraction schema

Store evidence rows in `tasks/research/_evidence.csv` (DuckDB-readable) with the following schema (also load to `tasks/research/_evidence.duckdb`):

```sql
CREATE TABLE IF NOT EXISTS evidence (
  source_id TEXT PRIMARY KEY,           -- S-001, S-002, …
  source_type TEXT,                     -- official-doc / model-card / license / vendor-blog / wayback / github-release / github-issue / reddit-thread / x-post / regulator / standards-body
  title TEXT,
  publisher TEXT,
  url TEXT,
  publication_date DATE,
  retrieval_date DATE,
  topic TEXT,                           -- which Q1-Q15
  entity TEXT,                          -- what it describes
  claim TEXT,
  metric TEXT,
  benchmark_or_test TEXT,
  environment_setup TEXT,
  license_terms TEXT,
  hardware_note TEXT,
  implementation_note TEXT,
  known_issue_caveat TEXT,
  evidence_strength TEXT,               -- primary / corroborated-secondary / single-secondary
  confidence TEXT,                      -- High / Medium / Low
  primacy_score INTEGER,                -- 0-2
  recency_score INTEGER,                -- 0-2
  methodology_score INTEGER,            -- 0-2
  comparability_score INTEGER,          -- 0-2
  reproducibility_score INTEGER,        -- 0-2
  legal_clarity_score INTEGER,          -- 0-2
  operational_relevance_score INTEGER,  -- 0-2
  bias_risk_score INTEGER,              -- 0-2
  corroboration_score INTEGER,          -- 0-2
  gap_logged BOOLEAN,
  decision_use TEXT,                    -- which Q1-Q15 recommendation this evidence drives
  follow_up_needed TEXT
);
```

---

## §9 — Quality scoring rubric + thresholds

Score each evidence row 0/1/2 on each of 10 criteria (max 20). Use thresholds:

| Use case                                       | Threshold                                                               |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| Keep in evidence matrix                        | ≥ 8 / 20 overall                                                        |
| Cite in comparative analysis                   | ≥ 10 / 20 overall                                                       |
| Let claim materially drive a recommendation    | Relevant subset ≥ 7 / 10 AND no critical 0                              |
| Let legal claim drive exclusion of a candidate | Primacy + Recency + Legal clarity must be ≥ 5 / 6                       |
| Let benchmark claim drive ranking              | Primacy + Methodology + Comparability + Reproducibility must be ≥ 7 / 8 |

For pricing-change history (Q11), legal clarity + primacy + recency are the dominant subset.
For regulatory obligations (Q10), legal clarity + primacy + recency dominant.
For runtime / SDK performance, methodology + reproducibility + comparability dominant.

---

## §10 — Synthesis plan

1. **Cluster findings by Q1-Q15.** One section per question.
2. **Separate facts from estimates.** Engineering estimates are marked explicitly.
3. **Separate official claims from community reports.** Show both columns when they disagree.
4. **Reconcile disagreements.** Where X/Reddit/GitHub hypothesis conflicts with primary docs, primary wins; document the discrepancy.
5. **Write implications for AGI's decision.** For each Q, name the recommendation and the alternative we're rejecting.
6. **Map every recommendation to a specific PRD edit.** Format: `PRD edit target: file → section → exact text change`.
7. **Surface emerging trends** (Q12) as a separate section with 12-month horizon table.
8. **Document API-pricing risk** (Q11) with a quantified mitigation comparison across abstraction options.

---

## §11 — Uncertainty / gap analysis

For each Q1-Q15, log explicitly:

- **What is still unknown?** (e.g., Apple's exact EU DMA enforcement posture for AI BYOK subscriptions)
- **What is not comparable?** (e.g., provider benchmark setups differ in tokenizer / temperature)
- **What assumptions were required?** (e.g., Hobby ARPU $7 net after Stripe fees)
- **What would most change the conclusion?** (e.g., if Anthropic deprecates prompt caching, Hobby unit-economics collapse)

---

## §12 — PRISMA-style search log (required artifact)

Maintain `tasks/research/_search_log.csv` with rows per query / source-type:

| Flow stage              | Count           | What to record                                                                               |
| ----------------------- | --------------- | -------------------------------------------------------------------------------------------- |
| Records identified      | int             | X / Reddit / GitHub / official / secondary counts per area                                   |
| Duplicates removed      | int             | Deduplication rule applied                                                                   |
| Records screened        | int             | Title/snippet review count                                                                   |
| Records excluded        | int (by reason) | "stale", "duplicate", "no methodology", "not primary", "API-only when self-hosting required" |
| Full texts assessed     | int             | URLs opened, retrieval date                                                                  |
| Evidence rows extracted | int             | Source IDs entered                                                                           |
| Included in synthesis   | int             | Sources actually cited                                                                       |
| Decision-driving subset | int             | Claims used in final recommendation                                                          |

End of research: write a 1-paragraph methodology summary to `00-MASTER-SYNTHESIS.md` §0 citing these counts.

---

## §13 — NIST AI RMF risk register (required artifact)

Maintain `tasks/research/_risk_register.csv`:

| Risk ID | AI RMF function | Failure mode | Evidence (source IDs) | Likelihood (1-5) | Severity (1-5) | Mitigation | Residual risk | Revisit trigger |
| ------- | --------------- | ------------ | --------------------- | ---------------- | -------------- | ---------- | ------------- | --------------- |

`AI RMF function ∈ {Govern, Map, Measure, Manage}`. Include ≥15 rows. Highlight any with severity ≥4 in the executive verdict.

---

## §14 — Deliverables (11 files now)

| File                                                     | Purpose                                                                                                                                                 | Word budget |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `00-MASTER-SYNTHESIS.md`                                 | Executive verdict + decisions for Q1-Q15 + top-20 takeaways + tech-stack confirmation diff + risk-register additions + emerging-trends 12-month horizon | 4,000-5,500 |
| `01-consumer-ai-apps.md`                                 | 12 consumer AI app teardowns                                                                                                                            | 3,000-4,000 |
| `02-privacy-first-apps.md`                               | 12 privacy-first / local-first teardowns                                                                                                                | 2,500-3,500 |
| `03-developer-sdks-apis.md`                              | 15 LLM provider SDK / API deep-dives + cross-provider matrix                                                                                            | 4,000-5,000 |
| `04-ondevice-runtimes.md`                                | 12 on-device runtime deep-dives + comparison matrix + hardware roadmap                                                                                  | 3,000-4,000 |
| `05-frameworks-infra.md`                                 | Frameworks, hosting, auth, payments, observability                                                                                                      | 3,000-4,000 |
| `06-compliance-legal.md`                                 | Store policies, privacy law, AI safety, OWASP, NIST AI RMF mapping                                                                                      | 2,500-3,500 |
| `07-cross-cutting.md`                                    | Q1-Q15 hard-question recommendations with full evidence                                                                                                 | 3,500-5,000 |
| `08-api-pricing-history.md`                              | **NEW.** Vendor pricing-change history table + deprecation timeline + abstraction-layer mitigation evaluation + AGI recommendation                      | 2,000-3,000 |
| `09-vendor-roadmaps-future.md`                           | **NEW.** Vendor roadmap table + regulatory timeline + standards roadmap + 12-month horizon prediction                                                   | 2,500-3,500 |
| `_evidence.csv`, `_search_log.csv`, `_risk_register.csv` | Machine-readable artifacts (DuckDB-ready)                                                                                                               | —           |

Total corpus: ~30,000-40,500 words across 9 markdown files + 3 CSVs.

---

## §15 — Timeline + effort

| Phase                                                                                             | Sequential time | Parallel (12 agents)     |
| ------------------------------------------------------------------------------------------------- | --------------- | ------------------------ |
| Scope confirm (read this brief)                                                                   | 15-30 min       | 15-30 min                |
| Primary-first pass (inverted areas: 4, 5, 7, 8, 9, 10-compliance, 11-pricing-history, 12-roadmap) | 180-300 min     | 30-60 min                |
| X scan (all default-order areas)                                                                  | 60-120 min      | 15-30 min                |
| Reddit scan                                                                                       | 60-120 min      | 15-30 min                |
| GitHub scan                                                                                       | 90-180 min      | 20-40 min                |
| Primary verification on default-order areas                                                       | 90-150 min      | 20-40 min                |
| Extraction into `_evidence.csv`                                                                   | 120-180 min     | 30-60 min                |
| Quality scoring + PRISMA log + risk register                                                      | 60-90 min       | 15-30 min                |
| Synthesis (10 area files)                                                                         | 240-360 min     | 60-90 min                |
| Master synthesis (must be sequential, last)                                                       | 90-120 min      | 90-120 min               |
| Total                                                                                             | **17-26 hours** | **4-9 hours wall-clock** |

---

## §16 — Automation snippets

```bash
# GitHub issue discovery
gh search issues '"qwen3" repo:QwenLM/qwen3 is:issue state:open created:>=2026-01-01' \
  --limit 30 --json title,url,createdAt,state,repository

# GitHub repo trend
gh search repos "on-device LLM" --sort updated --limit 20 \
  --json name,description,stargazerCount,updatedAt,url

# Release notes
gh release list --repo ggml-org/llama.cpp --limit 10
gh release list --repo modelcontextprotocol/specification --limit 20

# Wayback Machine for pricing history (Q11)
curl -s "https://web.archive.org/cdx/search/cdx?url=anthropic.com/pricing&output=json&from=20230101&to=20260517" | head -20
```

```python
# Trafilatura + DuckDB extraction
from trafilatura import fetch_response, bare_extraction
import duckdb, pandas as pd

urls = [
    "https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching",
    "https://platform.openai.com/docs/guides/prompt-caching",
    "https://ai.google.dev/gemini-api/docs/caching",
]
rows = []
for url in urls:
    resp = fetch_response(url)
    if resp:
        doc = bare_extraction(resp.data, url=resp.url, favor_precision=True,
                              include_tables=True, with_metadata=True)
        rows.append({"url": url, "data": doc.as_dict() if hasattr(doc, 'as_dict') else doc})

df = pd.DataFrame(rows)
con = duckdb.connect('tasks/research/_evidence.duckdb')
con.execute("CREATE TABLE IF NOT EXISTS raw_pages AS SELECT * FROM df")
con.execute("COPY raw_pages TO 'tasks/research/_raw_pages.parquet' (FORMAT PARQUET)")
```

```python
# Playwright fallback for JS-rendered pages
from playwright.sync_api import sync_playwright
def fetch_rendered(url):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        result = {"final_url": page.url, "title": page.title(), "html": page.content()}
        browser.close()
        return result
```

```bash
# vLLM serving for any local benchmark
vllm serve Qwen/Qwen3-14B --dtype auto --api-key token-abc123

# GuideLLM benchmark
guidellm benchmark --target http://localhost:8000 \
  --data "prompt_tokens=256,output_tokens=128" --max-seconds 60 --outputs json csv html
```

For X.com and Reddit: prefer search-engine discovery (`site:x.com ...`, `site:reddit.com ...`) over scrapers. **Do not script X.com** — X's automation rules explicitly forbid non-API website scripting. Treat Reddit scraping as high-risk per Reddit's Developer Terms.

---

## §17 — Compliance guardrails (baked into the brief)

| Rule                                                               | Reason                                                                                                               |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Prefer official APIs / CLI / documented endpoints                  | Lowest legal and maintenance risk                                                                                    |
| Do not script X.com                                                | X explicitly bans non-API website automation                                                                         |
| Treat Reddit scraping as high-risk by default                      | API requires registration; commercial / research use may require separate agreement; deletion obligations are strong |
| Respect robots.txt as coordination, not authorization              | RFC 9309 is a polite protocol, not access rights                                                                     |
| Retain the minimum necessary data                                  | Limits privacy / storage / compliance exposure                                                                       |
| Keep URLs, timestamps, and excerpts; avoid bulk republishes        | Better copyright + traceability posture                                                                              |
| For Wayback Machine fetches, cite the specific snapshot URL        | Verifiable; reproducible                                                                                             |
| For HN: use Algolia's HN Search API or `site:news.ycombinator.com` | Public + permitted                                                                                                   |

---

## §18 — Hand-off checklist

Before declaring research complete:

- [ ] All 9 markdown files exist under `tasks/research/`
- [ ] All 3 CSV / DuckDB artifacts exist (`_evidence.csv`, `_search_log.csv`, `_risk_register.csv`)
- [ ] Each markdown file within word budget (±20 %)
- [ ] Each file has Sources section with ≥10 primary-source URLs
- [ ] `_evidence.csv` has ≥200 extracted rows across Q1-Q15
- [ ] `_risk_register.csv` has ≥15 rows, ≥3 with severity ≥4 escalated to `00-MASTER-SYNTHESIS.md` §1 executive verdict
- [ ] Every Q1-Q15 has a concrete decision recommendation in `00-MASTER-SYNTHESIS.md`
- [ ] Every recommendation has a "PRD edit target" naming file + section + change
- [ ] Quality scores logged for ≥40 highest-impact claims
- [ ] Assumptions log populated with anything inferred not directly cited
- [ ] No `[uncited]` claims in `00-MASTER-SYNTHESIS.md` (may remain in supporting phase files as flagged caveats)
- [ ] No markdown rendering errors (mismatched tables, broken code blocks, broken cross-links)
- [ ] PRISMA-style search log methodology summary (1 paragraph) at top of `00-MASTER-SYNTHESIS.md`

**Final agent message:** list all 9 markdown files + 3 CSVs with word/row counts. Name the single most surprising finding per area. Provide one-paragraph "what would most change the conclusion" per Q1-Q15. List the top 5 escalated risks from the register.

---

**END OF BRIEF. This document is the contract between AGI's architect and the research agent. Hypothesis-generation sources (X / Reddit / GitHub) cannot drive a final recommendation; only primary / official sources can. Where regulatory, legal, license, or AI-safety topics are in scope, primary sources run first.**
