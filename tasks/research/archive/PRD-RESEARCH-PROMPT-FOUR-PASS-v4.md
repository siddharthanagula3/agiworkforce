# AGI — Research Prompt (Four-Pass Workflow, filled-in template)

> **Methodology:** four-pass deep-research workflow per the reusable template. Pass 1 X.com → Pass 2 Reddit → Pass 3 GitHub → Pass 4 Primary/official sources → Extraction → Quality scoring → Synthesis → Decision brief. X/Reddit/GitHub generate hypotheses; official sources decide answers.
>
> **Audience:** the research agent. This document is the brief you execute. Output goes under `tasks/research/` in the repo at `/Users/siddhartha/Desktop/agiworkforce/`.

---

## 1 — Topic block (filled in for AGI)

```yaml
Topic: AGI multi-surface AI app — close 10 open architectural questions and lock final stack before Mobile public launch (target 2026-07-20 to 2026-08-16)

Decision to support: Mobile public launch on iOS App Store + Google Play (first implementation product per docs/PRD-MOBILE.md). Web Aug-1 paid-tier graduation. Lock the stack + answer 10 hard questions documented in §3.

Audience: Principal Architect (solo founder) + future engineering contributors and AI coding agents that will read the PRDs cold.

Date of research: 2026-05-17 kick-off → 2026-05-24 deliverable target.

Geography: global launch; specific regulatory attention to US (state-by-state privacy), EU (GDPR + AI Act + DMA), India (RBI/MeitY if any), China (PIPL where relevant to provider routing).

Budget: solo-founder time-bound; favor open-source / free tooling; research-agent compute budget 6-10 hours sequential OR 1-2 hours fanned-out (7 parallel sub-agents per §10).

Time horizon: research output feeds PRD revision pass within 7 days; Mobile M0 spike already in flight; M1 Local hidden alpha through 2026-06-21; M3 public launch by 2026-08-16.

Success criteria:
  - All six Tier-1 questions (Q1-Q6 in §3) have a concrete decision recommendation backed by ≥3 primary-source citations each
  - Competitive matrix for ≥12 current consumer AI apps + ≥12 privacy-first / local-first apps in May 2026
  - Per-provider API capability matrix for 15 LLM providers (cache, tool, vision, audio, structured-output, streaming, batch, reseller-TOS flags)
  - Per-runtime feature matrix for 12 on-device LLM runtimes with current benchmarks on iPhone 15 Pro / Pixel 8 Pro
  - Risk register addition: ≥10 new risks not in PRD V3 §17
  - ≥70 % of decision-driving claims cited to primary or official sources
  - Every benchmark claim has a logged setup or comparability caveat
  - Every eliminated candidate (e.g., Cactus, RunAnywhere) has a one-sentence written reason

Known constraints (locked, do not re-litigate):
  - AGI mobile stack: Expo SDK 55 + RN 0.84 + native modules. No Swift/Kotlin rewrite for v1.
  - Free-forever Local mode + BYOK Cloud free-forever are non-negotiable.
  - Apple 5.1.2(i) explicit consent modal ships in iOS onboarding.
  - Cactus / cactus-react-native excluded for license thresholds + telemetry defaults.
  - RunAnywhere SDK excluded for license thresholds + telemetry defaults.
  - MediaPipe LLM Inference (mobile) excluded — Google deprecated it; use LiteRT-LM if cross-platform is needed.
  - V3 PRD tier hierarchy: Apple Foundation Models (iOS Tier 1) / Gemini Nano via AICore (Android Tier 1) / react-native-executorch (Tier 2) / llama.rn (Tier 3).

Unspecified items (research may inform, but founder retains decision):
  - Exact mobile launch date within the 2026-07-20 to 2026-08-16 window (flexes with App Review)
  - Whether to ship Apple IAP in Mobile v1 or rely entirely on external-purchase routing to web Stripe
  - Whether Pro Max $99 tier flips live on mobile at v1 launch or only after web Aug-1 flip
  - Hardware test matrix beyond iPhone 15 Pro + Pixel 8 Pro (research should recommend additional devices)
  - Whether to ship on-device safety filter (Llama-Guard 1B or similar) in v1 or defer

Assumptions log (append as research proceeds):
  - [Auto-populate during research]
```

---

## 2 — Research objectives

1. **Lock the final mobile on-device runtime selection** — confirm or revise the 3-tier stack (Apple Foundation Models + Gemini Nano + react-native-executorch + llama.rn) against May 2026 production reality.
2. **Lock the AI SDK abstraction strategy** — Vercel AI SDK v6 as facade, raw vendor SDKs, or `@agiworkforce/llm-normalize` custom abstraction. Single canonical decision across all six surfaces.
3. **Lock the token-caching strategy** for managed-cloud unit economics — per-provider cache directives, TTLs, discounts, cross-provider abstraction approach.
4. **Lock App Store IAP / external-purchase compliance** — exact technical pattern for routing $10-$299/mo subscriptions through web Stripe from iOS without violating reader rule or 2026 EU DMA rules.
5. **Lock provider TOS posture** for AGI as multi-tenant managed-cloud reseller routing through Anthropic / OpenAI / Google master keys.
6. **Lock content-moderation strategy** for on-device LLM output — deny-list-only vs running a small safety model on every Local-mode generation.
7. **Map cost-at-scale projections** for the full stack at 10K / 100K / 1M MAU; identify cost knee-points; recommend infra migration thresholds.
8. **Build competitive landscape** for May 2026 — what shipping consumer AI apps and privacy-first apps actually do (UX patterns, pricing, BYOK, local mode, voice, image, video, MCP, memory).
9. **Surface compliance obligations** — GDPR Articles 13/15/17/20/25/32/35, CCPA/CPRA, EU AI Act for general-purpose AI deployers, state privacy laws 2026, AI safety frameworks (OWASP LLM Top 10 v2.0, OWASP Agents Top 10).
10. **Define observability stack** for a privacy-first app where telemetry is opt-in only — production patterns for crash + analytics + performance that respect "off by default."

---

## 3 — Core questions (Q1-Q10)

**Tier 1 (must answer to unblock PRD revision):**

- **Q1:** What is the current (May 2026) prompt-caching feature set per provider (Anthropic, OpenAI, Google), and can `@agiworkforce/llm-normalize` provide a single API across all three? What is the realistic Hobby $10/mo unit-economics impact?
- **Q2:** Should AGI use Vercel AI SDK v6 as the canonical facade, raw vendor SDKs, or our own `@agiworkforce/llm-normalize`? What do production multi-provider apps (OpenRouter, TypingMind, Cline/Roo Code, Cursor, Continue.dev) actually use in May 2026?
- **Q3:** What are the exact current Apple App Store rules for routing subscription purchases to web (reader rule + EU DMA alternative payments)? Precedent rejections/approvals 2025-2026. Specific implementation pattern for AGI Mobile.
- **Q4:** What are the exact (May 2026) TOS clauses from Anthropic / OpenAI / Google on multi-tenant proxying and reselling? When does AGI need formal commercial / volume agreements?
- **Q5:** Current legal/liability landscape for on-device LLM output. What do PocketPal / Private Mind / AI Edge Gallery do? Should AGI ship on-device safety model (Llama-Guard 1B, Granite-Guardian 1B, Phi-Safety) in v1?
- **Q6:** Realistic monthly infra cost at 10K / 100K / 1M MAU for AGI's stack. Cost knee-points. When (if ever) to migrate off Vercel / Supabase to dedicated infra.

**Tier 2 (must answer before public launch):**

- **Q7:** What is the right cross-surface state-sync conflict-resolution pattern (CRDT vs OT vs LWW) when mobile + desktop + web are all open editing the same conversation?
- **Q8:** What is the production observability stack in 2026 for a privacy-first mobile app (Sentry / Plausible / PostHog / Firebase Crashlytics combinations) that respects "telemetry off by default"?
- **Q9:** What is the right MCP server safety / curation model — vetted-marketplace-only, open-with-warnings, or hybrid? How do Claude Desktop / Codex / AI Edge Gallery sandbox third-party MCP?
- **Q10:** What are the specific (May 2026) technical requirements AGI must ship to satisfy GDPR / CCPA / state privacy laws / EU AI Act at launch?

---

## 4 — Source priority

| Pass | Sources                 | Role                                                                                                                                                                                                    |
| ---- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | **x.com**               | Vendor launch notes, breaking changes, operator screenshots, last 90 days                                                                                                                               |
| 2    | **reddit.com**          | Operator pain, hardware reports, real-device benchmarks, failure modes (especially `/r/LocalLLaMA`, `/r/reactnative`, `/r/iOSProgramming`, `/r/Anthropic`, `/r/OpenAI`, `/r/privacy`, `/r/PocketPalAI`) |
| 3    | **github.com**          | Official repos, releases, issues, discussions, code samples, version constraints, deprecations                                                                                                          |
| 4    | **Primary / official**  | Anthropic / OpenAI / Google / Apple / Android / OWASP / regulator docs; model cards; license files; technical reports                                                                                   |
| 5    | **Secondary synthesis** | Only after primary verification: Simon Willison, Stratechery, TechCrunch, The Verge, InfoQ, Ars Technica                                                                                                |

**Hard rule:** X/Reddit/GitHub generate hypotheses; official sources decide answers. Every decision-driving claim in the final deliverable must trace to a primary source URL.

---

## 5 — Search queries per research area

Ten research areas. Each has X queries, Reddit queries, GitHub queries (use `gh search` CLI), and primary-source URLs to verify against. Run all four passes per area. Capture hypotheses → verify with primary → log as evidence rows.

### Area 1 — Mobile on-device LLM runtime selection

**X queries:**

- `site:x.com (apple OR FoundationModels) (ios26 OR "iOS 26") developer api since:2026-01-01`
- `site:x.com ("Apple Intelligence") on-device 3B model adapters fmadapter since:2025-09-01`
- `site:x.com ("Gemini Nano" OR "AICore" OR "ML Kit GenAI") android (pixel OR samsung OR mediatek) 2026`
- `site:x.com ("llama.rn" OR "react-native-executorch") expo (production OR app store OR play store)`
- `site:x.com ("MLX" OR "mlx-swift") production iphone (since:2026-01-01)`
- `site:x.com ("ExecuTorch" OR "@pytorch/executorch") meta production 2026`
- `site:x.com "LiteRT-LM" gemma android 2026`
- `site:x.com "whisper.cpp" mobile iphone production app store since:2026-01-01`

**Reddit queries:**

- `site:reddit.com/r/LocalLLaMA ("Qwen 2.5" OR "Llama 3.2" OR "Gemma 3" OR "Phi-4") (iphone OR pixel OR "samsung s24") tokens per second`
- `site:reddit.com/r/LocalLLaMA on-device offline ios android 2026`
- `site:reddit.com/r/reactnative (expo OR "expo dev client") llama executorch on-device`
- `site:reddit.com/r/iOSProgramming "Foundation Models" ios26 adapter`
- `site:reddit.com/r/PocketPalAI`
- `site:reddit.com/r/Android "Gemini Nano" AICore`
- `site:reddit.com/r/privacy offline ai assistant mobile`

**GitHub queries (use `gh search` CLI):**

- `gh search repos "llama.rn" sort:updated`
- `gh search issues "expo" "llama.rn" is:issue state:open created:>=2026-03-01`
- `gh search issues repo:ggml-org/llama.cpp ios state:open`
- `gh search issues repo:software-mansion/react-native-executorch state:open`
- `gh search code "FoundationModels" language:Swift extension:swift`
- `gh search repos "executorch" sort:updated stars:>500`
- `gh search issues repo:pytorch/executorch ios android state:open created:>=2026-02-01`
- `gh search repos "mlx-swift" sort:updated`
- `gh search issues repo:ggml-org/whisper.cpp ios coreml state:open`
- `gh search repos "LiteRT-LM" sort:updated`

**Primary sources to verify:**

- `developer.apple.com/documentation/FoundationModels`
- `developer.apple.com/videos/play/wwdc2025/286/` (Foundation Models intro)
- `developer.android.com/ai/gemini-nano`
- `developers.google.com/ml-kit/genai`
- `github.com/ggml-org/llama.cpp/releases`
- `github.com/mybigday/llama.rn` (README + releases)
- `github.com/pytorch/executorch/releases`
- `github.com/software-mansion/react-native-executorch` (Expo support)
- `github.com/ml-explore/mlx-swift`
- `github.com/google-ai-edge/LiteRT-LM`
- `github.com/google-ai-edge/gallery`
- `github.com/a-ghorbani/pocketpal-ai`
- `github.com/ggml-org/whisper.cpp`

**Area-specific inclusion:** runtime must have iOS + Android paths OR Expo / RN bindings; license must be MIT / Apache-2.0 / BSD (no funding/revenue thresholds); released or updated within last 90 days; ≥1 production app shipping with it on App Store or Play.

### Area 2 — Consumer AI app competitive landscape (May 2026)

**X queries:**

- `site:x.com ("Claude mobile" OR "Claude iOS") launch feature since:2026-02-01`
- `site:x.com ("ChatGPT" OR "ChatGPT mobile") launch (gpt-5.4 OR gpt-5.5 OR Atlas) since:2026-02-01`
- `site:x.com "Gemini" mobile launch ios android since:2026-02-01`
- `site:x.com "Perplexity" (mobile OR Comet OR Computer) launch since:2026-02-01`
- `site:x.com (Codex OR "OpenAI Codex desktop") launch since:2026-02-01`
- `site:x.com "Grok" (mobile OR ios OR android) 4.3 since:2026-02-01`
- `site:x.com "DeepSeek" chat mobile app since:2026-02-01`

**Reddit queries:**

- `site:reddit.com/r/ChatGPT ios android mobile feature missing complaint since:2026-02-01`
- `site:reddit.com/r/Anthropic claude mobile feature complaint`
- `site:reddit.com/r/Gemini complaint feature missing`
- `site:reddit.com/r/Perplexity_AI Comet computer feature`
- `site:reddit.com/r/cursor mobile ios feature`
- `site:reddit.com/r/OpenAI codex desktop`

**GitHub queries:**

- `gh search repos "ChatGPT clone" OR "claude clone" stars:>200 created:>=2025-09-01 sort:updated`
- `gh search repos multi-provider chat BYOK stars:>500 sort:updated`

**Primary sources to verify:**

- `claude.ai/download`, `apps.apple.com/app/claude` (Anthropic listings, May 2026)
- `chat.openai.com/download`, `apps.apple.com/app/chatgpt` (OpenAI listings)
- `gemini.google.com`, App Store + Play listings
- `perplexity.ai`, App Store + Play listings, comet.perplexity.ai
- `cursor.com`, App Store listing if any
- `x.ai/grok`, `apps.apple.com/app/grok`
- `deepseek.com`, App Store listings (US + CN regions)
- `kimi.moonshot.cn`, App Store listings
- `manus.im`
- `zhipuai.cn` / Z.ai

**Area-specific inclusion:** app shipping on App Store / Play / web in May 2026; native or PWA; at least one tier-pricing page accessible; review count ≥1,000 if mobile; verified vendor identity.

### Area 3 — Privacy-first / local-first AI app patterns

**X queries:**

- `site:x.com (PocketPal OR "Pocket Pal") ai (review OR rating OR feature) since:2025-09-01`
- `site:x.com "Private Mind" ai mobile`
- `site:x.com "AI Edge Gallery" google android`
- `site:x.com (LM Studio OR Ollama) mobile ios android`
- `site:x.com "Jan AI" privacy local`
- `site:x.com Msty TypingMind multi-provider BYOK`

**Reddit queries:**

- `site:reddit.com/r/LocalLLaMA "PocketPal" OR "Private Mind" OR "AI Edge Gallery" review`
- `site:reddit.com/r/Ollama mobile ios android wrapper`
- `site:reddit.com/r/LocalLLaMA TypingMind OR Msty OR "Jan AI"`
- `site:reddit.com/r/privacy local-first ai mobile`
- `site:reddit.com/r/selfhosted OpenWebUI LibreChat 2026`

**GitHub queries:**

- `gh search repos "pocketpal" sort:updated`
- `gh search repos "Private Mind" stars:>50 sort:updated`
- `gh search repos owner:google-ai-edge gallery sort:updated`
- `gh search repos owner:janhq jan sort:updated`
- `gh search repos owner:open-webui open-webui sort:updated`
- `gh search repos owner:danny-avila LibreChat sort:updated`
- `gh search repos owner:CherryHQ cherry-studio sort:updated`

**Primary sources to verify:**

- App Store + Play listings for PocketPal AI, Private Mind, AI Edge Gallery
- GitHub READMEs: a-ghorbani/pocketpal-ai, software-mansion/private-mind, google-ai-edge/gallery
- LM Studio + Ollama + Jan AI + Msty + TypingMind + OpenWebUI + LibreChat + Cherry Studio official sites + release notes

**Area-specific inclusion:** app must offer at least one on-device LLM path OR multi-provider BYOK; license discoverable; reviewers can run it without an account creation flow (where applicable).

### Area 4 — Developer SDK + provider API capabilities

**X queries:**

- `site:x.com ("prompt caching" OR "context caching") (anthropic OR openai OR gemini) (price OR discount OR TTL)`
- `site:x.com "Anthropic" (prompt cache OR Files API OR batch API OR Computer use) 2026`
- `site:x.com "OpenAI" (Responses API OR Realtime API OR prompt cache OR structured output) 2026`
- `site:x.com "Google AI" (Gemini API OR context caching OR Live API) 2026`
- `site:x.com (Vercel "AI SDK" OR @ai-sdk) v6 (tool use OR structured output OR streaming)`
- `site:x.com (Groq OR Together OR Fireworks OR OpenRouter) (pricing OR latency OR model)`

**Reddit queries:**

- `site:reddit.com/r/OpenAI prompt caching cost`
- `site:reddit.com/r/Anthropic prompt cache cost 90 percent`
- `site:reddit.com/r/Bard OR /r/Gemini context cache`
- `site:reddit.com/r/MachineLearning multi-provider gateway OpenRouter`
- `site:reddit.com/r/LocalLLaMA Groq vs Together vs Fireworks latency`

**GitHub queries:**

- `gh search repos owner:anthropics anthropic-sdk-typescript sort:updated`
- `gh search repos owner:openai openai-node sort:updated`
- `gh search repos owner:google-gemini generative-ai-js sort:updated`
- `gh search repos owner:vercel ai sort:updated` (Vercel AI SDK)
- `gh search issues repo:vercel/ai prompt cache state:open`
- `gh search repos owner:OpenRouterTeam` (if exists; check Wong/Discord)
- `gh search repos owner:BerriAI litellm sort:updated`
- `gh search repos owner:portkey-ai gateway sort:updated`

**Primary sources to verify:**

- `docs.anthropic.com` (latest, esp. prompt caching, files, batches, computer use, extended thinking, citations)
- `platform.openai.com/docs` (Chat Completions, Responses API, Realtime, prompt caching, structured output, batch, files, embeddings)
- `ai.google.dev/gemini-api/docs` (generateContent, context caching, files, function calling, code execution, grounding, Live API)
- `docs.x.ai/api` (Grok 4.20/4.3)
- `api-docs.deepseek.com` (V4 Flash, V3.2, prompt cache)
- `docs.perplexity.ai` (Sonar, Sonar Deep Research)
- `docs.mistral.ai` (Codestral 2508)
- `console.groq.com/docs` (LPU)
- `docs.together.ai`, `docs.fireworks.ai`, `learn.microsoft.com/azure/ai-services/openai/`, `docs.aws.amazon.com/bedrock/`, `openrouter.ai/docs`

**Area-specific inclusion:** SDK or API doc dated within last 6 months OR with explicit "no breaking changes since" statement; license discoverable; pricing page with current $/MTok.

### Area 5 — Token caching strategy

**X queries:**

- `site:x.com "prompt caching" (anthropic OR claude) (TTL OR 5 minute OR 1 hour OR beta) since:2025-09-01`
- `site:x.com "OpenAI" "automatic prompt caching" (gpt-5.4 OR gpt-5.5) since:2025-09-01`
- `site:x.com "Gemini" "context caching" (explicit OR implicit OR TTL) since:2025-09-01`

**Reddit queries:**

- `site:reddit.com/r/Anthropic prompt cache cost reduction`
- `site:reddit.com/r/OpenAI prompt cache 50 percent discount`
- `site:reddit.com/r/MachineLearning context caching gemini`

**GitHub queries:**

- `gh search issues repo:anthropics/anthropic-sdk-typescript "cache_control" state:closed`
- `gh search issues repo:openai/openai-node prompt cache`
- `gh search issues repo:google-gemini/generative-ai-js context cache`

**Primary sources to verify:**

- `docs.anthropic.com/en/docs/build-with-claude/prompt-caching`
- `platform.openai.com/docs/guides/prompt-caching`
- `ai.google.dev/gemini-api/docs/caching`

**Extraction targets:** per provider — minimum cacheable tokens, TTL (5-min standard / 1-hour beta?), cache-hit discount % on input tokens, max cache fragments, explicit vs implicit triggering, behavior across model versions, abuse-mitigation, billing for cache writes.

### Area 6 — AI SDK abstraction strategy

**X queries:**

- `site:x.com "Vercel AI SDK" v6 production (multi-provider OR tool use) since:2025-09-01`
- `site:x.com (LangChain OR LangGraph) production multi-provider`
- `site:x.com Mastra ai sdk launch`

**Reddit queries:**

- `site:reddit.com/r/nextjs vercel ai sdk v6 review`
- `site:reddit.com/r/LangChain production complaint`
- `site:reddit.com/r/MachineLearning multi-provider abstraction`

**GitHub queries:**

- `gh search repos owner:vercel ai sort:updated`
- `gh search issues repo:vercel/ai (production OR migration OR breaking) state:open created:>=2026-02-01`
- `gh search repos owner:langchain-ai langchainjs sort:updated`
- `gh search repos owner:cline cline sort:updated` (production multi-provider RN/VSCode reference)
- `gh search repos owner:continuedev continue sort:updated` (production multi-provider VS Code ref)
- `gh search code "fromOpenAI" OR "createAnthropic" OR "createGoogleGenerativeAI" path:packages stars:>200`

**Primary sources to verify:**

- `sdk.vercel.ai/docs` (current version + features)
- `js.langchain.com/docs`
- Cline / Roo-Code / Continue.dev production architectures (READMEs + ARCHITECTURE.md)
- OpenRouter docs (`openrouter.ai/docs`) — what they expose

**Extraction targets:** Vercel AI SDK v6 feature parity vs raw vendor SDKs; what production multi-provider apps use as their layer; cancellation, retries, tool-use schemas, structured output, streaming chunk shapes.

### Area 7 — App Store IAP / external-purchase compliance

**X queries:**

- `site:x.com (App Store OR "App Review") (BYOK OR "bring your own key" OR "5.1.2") rejected 2026`
- `site:x.com Apple "reader rule" OR "external purchase" subscription 2026`
- `site:x.com EU DMA alternative payment provider iOS 2026`

**Reddit queries:**

- `site:reddit.com/r/iOSProgramming "External purchase" OR "reader rule" 2026`
- `site:reddit.com/r/iOSProgramming "5.1.2" OR "BYOK" OR "API key" rejected`
- `site:reddit.com/r/iosdev subscription stripe web link 2026`

**GitHub queries:**

- `gh search code "appstoreconnect.apple.com" path:metadata language:Swift`
- `gh search repos owner:Apple-Pay sort:updated`

**Primary sources to verify:**

- `developer.apple.com/app-store/review/guidelines/` (full guidelines, current revision)
- Apple's "external purchase entitlement" docs
- EU DMA implementation: `developer.apple.com/support/dma-and-apps-in-the-eu/`
- App Store reader-rule docs
- Recent App Store Review precedent (search official Apple Developer forum + Hacker News)

**Extraction targets:** exact technical disclosure UI required; banned patterns; reader rule eligibility criteria; EU DMA scope (only EU users? worldwide?); what successful 2025-2026 apps shipped this pattern; what got rejected.

### Area 8 — Provider TOS for managed-cloud reseller

**X queries:**

- `site:x.com Anthropic "terms of service" (commercial OR reseller OR proxy OR multi-tenant) 2026`
- `site:x.com OpenAI "terms of use" (reseller OR proxy) 2026`
- `site:x.com Google "Gemini API" terms commercial reseller 2026`

**Reddit queries:**

- `site:reddit.com/r/OpenAI reseller TOS multi-tenant`
- `site:reddit.com/r/Anthropic reseller commercial`
- `site:reddit.com/r/SaaS multi-provider AI gateway TOS`

**GitHub queries:**

- `gh search repos openrouter OR portkey OR helicone OR berriai sort:updated stars:>100`
- `gh search issues repo:BerriAI/litellm tos OR reseller OR proxy state:closed`

**Primary sources to verify:**

- `anthropic.com/legal/aup` (Acceptable Use Policy)
- `anthropic.com/legal/consumer-terms` + `anthropic.com/legal/commercial-terms`
- `openai.com/policies/usage-policies`, `openai.com/policies/terms-of-use`
- `policies.google.com/terms/generative-ai/use-policy`, `ai.google.dev/terms`
- OpenRouter ToS (`openrouter.ai/terms`) — they ARE a reseller; what do they require of users

**Extraction targets:** explicit reseller language per provider; volume thresholds for commercial agreements; abuse-mitigation obligations on the routing party; attribution / labeling requirements; pricing-change risk (provider raises rate, what happens to our SaaS contract).

### Area 9 — Content moderation for on-device LLM

**X queries:**

- `site:x.com "Llama-Guard" mobile on-device 2026`
- `site:x.com "Granite Guardian" IBM safety small 2026`
- `site:x.com "Prompt Guard" Meta safety mobile`
- `site:x.com PocketPal "Private Mind" "AI Edge Gallery" safety moderation`

**Reddit queries:**

- `site:reddit.com/r/LocalLLaMA "Llama Guard" OR "Granite Guardian" safety filter`
- `site:reddit.com/r/LocalLLaMA on-device safety filter mobile`
- `site:reddit.com/r/MachineLearning content moderation LLM small model`

**GitHub queries:**

- `gh search repos "Llama-Guard" sort:updated`
- `gh search repos "granite-guardian" sort:updated`
- `gh search repos "prompt-guard" sort:updated`
- `gh search repos "phi-safety" OR "phi-guard" sort:updated`

**Primary sources to verify:**

- `huggingface.co/meta-llama/Llama-Guard-3-1B` model card
- `huggingface.co/ibm-granite/granite-guardian-3.1-2b` model card
- `huggingface.co/meta-llama/Prompt-Guard-86M` model card
- Google Play AI-generated content policy (`support.google.com/googleplay/android-developer/answer/13985936`)
- Apple App Store guidelines on user-generated AI content

**Extraction targets:** smallest available safety model that fits mobile (size, accuracy, license); on-device deny-list patterns; production examples of on-device-only safety filters; legal precedent for app publisher liability when 3B model generates harmful content with no filter.

### Area 10 — Scaling cost projections + observability + compliance

**X queries:**

- `site:x.com Vercel pricing 2026 (Pro OR Turbo OR Edge function) cost`
- `site:x.com Supabase (Pro OR Team OR Enterprise) pricing 2026 connection pool`
- `site:x.com Fly.io pricing 2026 multi-region machines`
- `site:x.com (GDPR OR CCPA) AI app 2026 enforcement`
- `site:x.com "EU AI Act" general-purpose AI deployer 2026 obligations`

**Reddit queries:**

- `site:reddit.com/r/nextjs vercel cost 100k users monthly`
- `site:reddit.com/r/Supabase pro tier connection pool exhausted`
- `site:reddit.com/r/flyio multi-region cost`
- `site:reddit.com/r/privacy gdpr ai chat app obligations`

**GitHub queries:**

- `gh search repos owner:getsentry sentry-react-native sort:updated`
- `gh search repos owner:PostHog posthog sort:updated`
- `gh search repos owner:plausible analytics sort:updated`
- `gh search repos owner:open-telemetry opentelemetry-js sort:updated`

**Primary sources to verify:**

- `vercel.com/pricing` (current; Turbo machines default behavior)
- `supabase.com/pricing` (Pro/Team/Enterprise tiers; connection pool numbers)
- `fly.io/docs/about/pricing/`
- `upstash.com/pricing` (Redis)
- `huggingface.co/pricing` (Inference Endpoints + bandwidth)
- `gdpr-info.eu/art-13-gdpr/` through `gdpr-info.eu/art-35-gdpr/`
- `oag.ca.gov/privacy/ccpa`
- `eur-lex.europa.eu` (AI Act, current consolidated text)
- `genai.owasp.org/llm-top-10/`

**Extraction targets:** monthly $$$ projections at 10K/100K/1M MAU per service; connection-pool / concurrent-Realtime limits per Supabase tier; GDPR articles requiring technical features (export, erasure, DPIA threshold); OWASP LLM Top 10 v2.0 mapping to AGI surfaces; observability stack production patterns.

---

## 6 — Inclusion criteria (apply across all 10 areas)

- **Language:** English-language sources first; non-English (CN, JP, KR) only when documenting region-specific regulators or models with no English equivalent.
- **Recency window:** primary sources published or last-modified within 6 months. Older sources only acceptable if the source is a stable standard (RFC, OWASP, GDPR text).
- **Evidence type:** primary docs, model cards, license files, official changelogs, vendor pricing pages, regulator publications, official GitHub README/release notes. Secondary only after primary verification.
- **Minimum detail:** the source must contain enough specifics to either reproduce a claim or trace it to a verifiable artifact (URL, hash, version number, screenshot).
- **Required metadata:** every claim must carry source URL + retrieval date + section/page reference where applicable.

## 7 — Exclusion criteria (apply across all 10 areas)

- Anonymous claims with no evidence.
- Reposts of reposts (each claim must trace to a primary).
- Benchmark screenshots with no setup disclosed.
- Stale docs superseded by newer official docs.
- Medium tutorials or blog posts when a primary source covers the same fact.
- Claims dated > 9 months ago for fast-moving topics (model pricing, framework versions, store policies).
- AI-generated summary sites (use the underlying primary).
- Vendor marketing copy presented as fact.

## 8 — Data extraction fields (single schema for all evidence)

For every claim worth keeping, capture:

| Field                 | Description                                                                                                            | Example                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `source_id`           | Unique sortable ID                                                                                                     | `S-001`                                                                               |
| `source_type`         | official-doc / model-card / license / vendor-blog / github-release / github-issue / reddit-thread / x-post / regulator | `official-doc`                                                                        |
| `title`               | Source title                                                                                                           | "Anthropic prompt caching"                                                            |
| `publisher`           | Owner / vendor                                                                                                         | "Anthropic"                                                                           |
| `url`                 | Full URL                                                                                                               | `https://docs.anthropic.com/...`                                                      |
| `publication_date`    | When published                                                                                                         | `2026-04-15`                                                                          |
| `retrieval_date`      | When fetched                                                                                                           | `2026-05-17`                                                                          |
| `topic`               | Which Q1-Q10 area                                                                                                      | `Q1 token caching`                                                                    |
| `entity`              | What it describes                                                                                                      | "Claude Sonnet 4.6 prompt caching"                                                    |
| `claim`               | The factual claim                                                                                                      | "Cache hits discounted 90% on input tokens, 5-min default TTL, 1-hour beta available" |
| `metric`              | Numeric or measurable                                                                                                  | `90% discount`, `TTL=5min`                                                            |
| `benchmark_or_test`   | If applicable                                                                                                          | `Anthropic internal docs`                                                             |
| `environment_setup`   | Conditions for claim                                                                                                   | "Standard Messages API, cache_control on system + tools"                              |
| `license_terms`       | If applicable                                                                                                          | "Anthropic commercial terms"                                                          |
| `hardware_note`       | If applicable                                                                                                          | n/a                                                                                   |
| `implementation_note` | What it takes to use                                                                                                   | "Add `cache_control: { type: 'ephemeral' }` on cacheable blocks"                      |
| `known_issue_caveat`  | Risk / gotcha                                                                                                          | "Min cacheable tokens: 1024 (Sonnet) / 2048 (Opus)"                                   |
| `evidence_strength`   | Primary / corroborated-secondary / single-secondary                                                                    | `primary`                                                                             |
| `confidence`          | High / Medium / Low                                                                                                    | `High`                                                                                |
| `follow_up_needed`    | Any open thread                                                                                                        | "Verify 1-hour beta GA date"                                                          |

Store extracted rows in `tasks/research/_evidence.csv` (DuckDB-friendly format).

## 9 — Quality assessment checklist (0-2 score each, ≥7/10 to drive conclusion)

| Criterion             | What to check                                     | Score 0/1/2 |
| --------------------- | ------------------------------------------------- | ----------- |
| Primacy               | Official, first-party, or original paper/license? |             |
| Recency               | Current for the decision window?                  |             |
| Methodology           | Setup and conditions disclosed?                   |             |
| Comparability         | Metrics align across candidates?                  |             |
| Reproducibility       | Can you rerun or verify independently?            |             |
| Legal clarity         | License or usage terms explicit?                  |             |
| Operational relevance | Affects cost, latency, safety, maintenance?       |             |
| Bias risk             | Promotional, anecdotal, conflicted?               |             |
| Corroboration         | Independently supported elsewhere?                |             |
| Gap logging           | Missing fields flagged not guessed?               |             |

For benchmark claims, weight Primacy + Methodology + Comparability + Reproducibility. For licensing claims, weight Primacy + Recency + Legal clarity.

## 10 — Synthesis plan

After extraction:

1. **Cluster findings by Q1-Q10.** One section per question.
2. **Separate facts from estimates.** Mark engineering estimates explicitly (e.g., "tok/s range estimated from N similar reports, official benchmark unavailable").
3. **Separate official claims from community reports.** Two columns when they disagree.
4. **Reconcile disagreements.** Where X/Reddit/GitHub hypothesis conflicts with primary docs, primary wins; document the discrepancy.
5. **Write implications for the AGI decision.** For each Q, name the recommendation and the alternative we're rejecting.
6. **Map findings into specific PRD revisions.** Each recommendation gets a "PRD edit target": which file, which section, what text change.

## 11 — Uncertainty / gap analysis

For every Q, log:

- **What is still unknown?** (e.g., Apple's exact handling of EU DMA external-purchase entitlement at scale)
- **What is not comparable?** (e.g., provider benchmark setups differ in tokenizer / temperature)
- **What assumptions were required?** (e.g., assumed Hobby ARPU is $7 net after Stripe fees)
- **What would most change the conclusion?** (e.g., if Anthropic deprecates prompt caching, the Hobby unit economics collapse)

## 12 — Deliverables

Produce these 8 files under `tasks/research/`:

| File                        | Purpose                                                                                                         | Word budget |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------- |
| `00-MASTER-SYNTHESIS.md`    | Decision recommendations for Q1-Q10 + top-20 takeaways + tech-stack confirmation diff + risk-register additions | 3,500-5,000 |
| `01-consumer-ai-apps.md`    | 12 consumer AI app teardowns                                                                                    | 3,000-4,000 |
| `02-privacy-first-apps.md`  | 12 privacy-first / local-first app teardowns                                                                    | 2,500-3,500 |
| `03-developer-sdks-apis.md` | 15 LLM provider SDK / API deep-dives + cross-provider matrix                                                    | 4,000-5,000 |
| `04-ondevice-runtimes.md`   | 12 on-device runtime deep-dives + comparison matrix                                                             | 3,000-4,000 |
| `05-frameworks-infra.md`    | Frameworks, hosting, auth, payments, observability                                                              | 3,000-4,000 |
| `06-compliance-legal.md`    | Store policies, privacy law, AI safety, OWASP                                                                   | 2,500-3,500 |
| `07-cross-cutting.md`       | Q1-Q10 hard-question recommendations with full evidence                                                         | 3,000-4,500 |

Plus `tasks/research/_evidence.csv` with the data-extraction schema rows.

Total corpus: ~25,000-33,500 words.

## 13 — Timeline + effort

| Phase                                                                      | Time                 |
| -------------------------------------------------------------------------- | -------------------- |
| Scope confirm (read this brief)                                            | 15-30 min            |
| X scan (all 10 areas)                                                      | 60-120 min           |
| Reddit scan (all 10 areas)                                                 | 60-120 min           |
| GitHub scan (all 10 areas)                                                 | 90-180 min           |
| Primary-source pass + verification                                         | 120-180 min          |
| Extraction into `_evidence.csv`                                            | 90-120 min           |
| Quality scoring                                                            | 30-60 min            |
| Synthesis (per-area files)                                                 | 180-300 min          |
| Master synthesis                                                           | 60-90 min            |
| Total (sequential)                                                         | 11-19 hours          |
| Total (7 parallel sub-agents fanned out, then master synthesis sequential) | 2-4 hours wall-clock |

## 14 — Automation snippets (use these to avoid manual scraping)

```bash
# GitHub issue discovery (use throughout)
gh search issues "expo" "llama.rn" is:issue state:open --limit 30 \
  --json title,url,createdAt,state,repository

# GitHub repo trend
gh search repos "on-device LLM" --sort updated --limit 20 \
  --json name,description,stargazerCount,updatedAt,url

# Discover release notes
gh release list --repo ggml-org/llama.cpp --limit 10

# Extract main text from a web page (Trafilatura + DuckDB)
python -c "
from trafilatura import fetch_url, extract
import duckdb, pandas as pd
urls = ['https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching']
rows = [{'url': u, 'text': extract(fetch_url(u), favor_precision=True)} for u in urls]
df = pd.DataFrame(rows)
con = duckdb.connect('tasks/research/_evidence.duckdb')
con.execute('CREATE TABLE IF NOT EXISTS raw_pages AS SELECT * FROM df')
"

# Convert to evidence rows
duckdb tasks/research/_evidence.duckdb "
INSERT INTO evidence (source_id, source_type, url, retrieval_date, claim)
SELECT 'S-' || row_number() OVER (), 'official-doc', url, current_date, '...'
FROM raw_pages
"
```

For X.com and Reddit, prefer search-engine discovery (`site:x.com ...` + `site:reddit.com ...` via Google / DuckDuckGo) over scrapers; do not build brittle or non-compliant scrapers.

## 15 — Hand-off checklist

Before declaring research complete:

- [ ] All 8 markdown files exist under `tasks/research/`
- [ ] Each file within word budget (±20%)
- [ ] Each file has Sources section with ≥10 primary-source URLs
- [ ] `_evidence.csv` has ≥150 extracted rows across all 10 areas
- [ ] Every Q1-Q10 has a concrete decision recommendation in `00-MASTER-SYNTHESIS.md`
- [ ] Every recommendation has a "PRD edit target" naming file + section + change
- [ ] Quality scores logged for ≥30 highest-impact claims
- [ ] Assumptions log populated with anything inferred not directly cited
- [ ] No `[uncited]` claims remain in `00-MASTER-SYNTHESIS.md`
- [ ] No markdown rendering errors

Final agent message: list 8 files with word counts + the single most surprising finding per phase + a one-paragraph "what would most change the conclusion" statement per Q1-Q10.

---

**END OF BRIEF.** This document is the contract between AGI's architect and the research agent. Execute the four-pass workflow with discipline. X/Reddit/GitHub generate hypotheses; primary/official sources decide.
