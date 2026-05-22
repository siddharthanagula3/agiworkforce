# 00 — Master synthesis: AGI stack lock first-pass research pack

**Status:** first-pass evidence-backed package, not the full 17–26 hour research run. The uploaded brief requires 10 markdown files plus `_evidence.csv`, `_search_log.csv`, and `_risk_register.csv` under `tasks/research/`; this package creates that structure and gives decision-ready defaults, but it explicitly marks gaps that still need the longer pass before a final PRD lock.

**Retrieval date:** 2026-05-17.

## §0 Methodology summary

The working brief required primary/official sources to control final recommendations for legal, policy, license, provider-TOS, store-policy, AI-safety, pricing, and regulatory claims. This pack therefore starts from Apple, Anthropic, OpenAI, Google, provider docs, official GitHub repositories, regulator/standards pages, and official observability/infra docs. Community and social discovery is logged as hypothesis-generation only and is not allowed to drive a recommendation. The initial search log contains **16 query/source rows**. The evidence matrix contains **83 evidence rows**, below the requested 200-row full-run threshold; treat this as a useful first cut, not the final exhaustive matrix. The risk register contains **18 NIST AI RMF-aligned risks**, including multiple severity-4/5 escalations.

## §1 Executive recommendation

**Lock a dual-control architecture:** `@agiworkforce/llm-normalize` should be the canonical internal LLM contract; provider-specific raw SDK adapters should implement high-value capabilities; gateways should be optional runtime routes, not the core abstraction.

This is the safest path because provider capabilities are not converging at the edge cases that matter: prompt caching, TTL, cache-writes, structured output, files, grounding, safety policies, data-retention semantics, model aliases, and commercial terms all remain provider-specific. A generic gateway can reduce routing friction, but it cannot absorb provider TOS, pricing changes, model removal, or feature lag. The app needs its own normalized contract with explicit feature flags and per-provider escape hatches.

### Stack lock

| Layer                         | Recommendation                                                                                                 | Rejected alternative                     | Reason                                                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| iOS local runtime             | Apple Foundation Models as T1                                                                                  | llama.rn as iOS primary                  | Native platform path is better aligned with privacy, app review, and OS-managed eligibility; llama.rn remains useful as fallback. |
| Android local runtime         | Gemini Nano via AICore / ML Kit GenAI as T1                                                                    | Raw GGUF path as Android primary         | AICore handles model distribution, updates, safety, and device acceleration.                                                      |
| Cross-platform local fallback | React Native ExecuTorch as T2                                                                                  | ExecuTorch-only architecture             | Fits RN/native-module constraints while preserving direct PyTorch edge path.                                                      |
| Broad model fallback          | llama.rn as T3                                                                                                 | Drop GGUF support                        | GGUF ecosystem breadth is valuable, but GitHub issue volatility makes it unsuitable as launch-critical primary.                   |
| LLM API abstraction           | `@agiworkforce/llm-normalize` canonical contract                                                               | Raw SDKs only or Vercel AI SDK only      | Raw SDKs lock app logic to providers; Vercel AI SDK improves web UX but should not define mobile/provider edge semantics.         |
| Gateway                       | Optional: LiteLLM self-host or Vercel/OpenRouter/Portkey by route                                              | One gateway owns all traffic             | Gateways reduce switching friction but add vendor-of-vendor risk.                                                                 |
| Prompt caching                | Provider-specific cache adapters behind normalized cache intent                                                | One universal cache API                  | TTL, write billing, minimum token thresholds, explicit/implicit triggering, and storage billing differ materially.                |
| Payments                      | StoreKit IAP for global mobile; gated external links for allowed storefronts/entitlements                      | Web Stripe link everywhere               | Apple rules remain storefront/entitlement-specific.                                                                               |
| Safety                        | Policy gating + reporting + injection guard first; optional on-device classifier after device tests            | Heavy output safety model required v1    | Store policy requires safety and feedback; mobile classifier latency/accuracy needs controlled benchmarks.                        |
| Observability                 | Telemetry off by default; Sentry crash-only with scrubbing; PostHog/Plausible opt-in/cookieless; OTel redacted | Default product analytics/session replay | Privacy-first claim breaks if prompts/outputs leak into telemetry.                                                                |

## §2 Tier-1 decisions

### Q1 — Prompt caching and Hobby $10/mo economics

**Decision:** implement a normalized `CacheIntent` contract, not a single universal prompt-cache API. The contract should express: stable prefix hash, provider, model, cacheability, desired TTL, observed cached tokens, write tokens, hit tokens, storage TTL cost, and failure reason. Provider adapters should translate this into Anthropic `cache_control`, OpenAI automatic cache plus `prompt_cache_key`, Gemini cached-content resources/TTL, and best-effort handling for DeepSeek/Mistral/xAI.

Why:

- Anthropic caching is explicit and TTL-priced: 5-minute cache write is above base input, 1-hour write is higher, and cache reads are cheap.
- OpenAI caching is automatic for supported models and prompts at or above 1,024 tokens, with `prompt_cache_key` as an optimization signal.
- Gemini context caching has a storage-duration billing dimension, so a careless long TTL can create a hidden cost line.
- Mistral, DeepSeek, and xAI support prefix/context caching patterns, but the operational knobs differ.

**Unit economics:** caching helps only if AGI has long, repeated static prefixes: system policy, tool schemas, product ontology, and reusable instructions. It will not save output tokens, it will not save short prompts, and it will not fix agent-loop costs. Hobby $10/mo is realistic only with strict managed-cloud quotas, model laddering, BYOK default, and per-user stop-loss.

**PRD edit target:** PRD V3 §LLM Routing: add `CacheIntent` and `CacheObservation` schemas; add cache-hit KPI and per-provider adapter tests.

### Q2 — AI SDK abstraction

**Decision:** use `@agiworkforce/llm-normalize` as the app-owned contract. Use raw OpenAI/Anthropic/Google adapters for primary providers. Use Vercel AI SDK where it provides web streaming/UI leverage. Add LiteLLM or Vercel AI Gateway only as a pluggable route.

Why:

- Vercel AI SDK is strong for TypeScript and UI streaming, but provider-specific features still leak.
- Gateways offer routing, fallback, budgets and observability, but they do not remove provider terms, model removal risk, or feature lag.
- An owned contract lets AGI preserve mobile/local semantics, BYOK, privacy controls, and provider-specific cache/safety data without hard-wiring the app to any vendor.

**PRD edit target:** PRD V3 §AI SDK: replace “choose Vercel vs raw” with “owned contract + adapter/gateway plugin architecture.”

### Q3 — App Store IAP and external purchase

**Decision:** ship StoreKit IAP for mobile subscriptions globally. Permit external web purchase only where Apple rules and entitlements clearly allow it, currently US storefront patterns and EU DMA/alternative-terms contexts. Do not put a global “subscribe on web” CTA in the iOS app.

Why:

- Apple’s guidelines allow link-outs only under specific entitlements/conditions and otherwise restrict encouraging alternate purchase methods.
- EU DMA support creates expanded alternatives inside the EU, but only within Apple’s alternative business terms/entitlement structure.
- A solo founder should avoid making App Review a launch-critical legal edge case.

**Implementation pattern:** onboarding shows the locked 5.1.2(i) explicit consent modal for BYOK/local behavior; subscription screens show IAP by default; external web links are hidden unless storefront and entitlement checks pass; App Review notes include screenshots and entitlement explanation.

**PRD edit target:** Mobile PRD §Payments: “Global default StoreKit IAP; external purchase link gated by storefront + entitlement + review notes.”

### Q4 — Provider TOS for managed-cloud routing

**Decision:** AGI can ship managed-cloud routing as a customer application, but must not market it as raw API resale. Flow down provider terms to end users, add abuse controls, and seek formal commercial approvals before enterprise resale, high-volume aggregator behavior, or regulated/high-risk workflows.

Why:

- Anthropic terms contemplate customer products for a customer’s own users, but prohibit resale except as approved.
- OpenAI prohibits reselling/leasing account access and holds customers responsible for end users in customer applications.
- Google terms include paid-service pricing-change mechanics and special restrictions for Grounding with Search.
- OpenRouter’s terms flow down provider model terms and prohibit using its service to compete/resell API access.

**PRD edit target:** PRD V3 §Managed Cloud: define “customer application access” vs “API resale,” user AUP, provider terms flowdown, abuse monitoring, and commercial-threshold review.

### Q5 — On-device content moderation

**Decision:** v1 should ship safety UX and injection controls, not a mandatory heavy output classifier on all local generations. Implement: visible local-output disclaimer, report button, local denylist for narrow prohibited categories, jailbreak/prompt-injection classifier for tool routes, optional Granite Guardian/Prompt Guard path where hardware can handle it, and app-store incident playbook.

Why:

- Google Play requires safe AI-generated content and user feedback/reporting for generative-AI apps.
- Apple App Review content-safety rules still apply even if inference is local and private.
- Granite Guardian 2B is likely too heavy for every mobile path; Prompt Guard 22M/86M is more plausible for injection/jailbreak classification.
- Native Apple/Google local paths include platform-managed guardrails and privacy semantics that should be preferred when available.

**PRD edit target:** PRD V3 §Safety: add local-output safety UX, report flow, prompt-injection guard, optional classifier decision gate, and launch-blocking device benchmark acceptance criteria.

### Q6 — Infra cost at 10K/100K/1M MAU

**Decision:** stay managed at 10K MAU; prepare hot-path extraction around 100K MAU; split infra at 1M MAU. The knee point is not user count alone; it is managed-cloud LLM token COGS plus chat/session volume plus realtime sync and storage/egress.

Engineering estimate under conservative assumptions:

|  MAU | Expected posture                                | Infra excluding LLM |                        LLM COGS risk | Move trigger                                                                        |
| ---: | ----------------------------------------------- | ------------------: | -----------------------------------: | ----------------------------------------------------------------------------------- |
|  10K | Vercel + Supabase + Sentry/PostHog minimal      |        $100–$800/mo | $500–$5K/mo if managed-cloud is used | Cache hit <30%, abuse, or support load.                                             |
| 100K | Still possible managed, but hot paths monitored |          $1K–$8K/mo |     $10K–$80K/mo without strict caps | Infra >10% revenue or DB/edge saturation.                                           |
|   1M | Split gateway/queue/DB analytics                |       $15K–$80K+/mo |    Dominant cost; must be tier-gated | Move to custom routing, committed-use deals, self-hosted analytics where justified. |

**PRD edit target:** PRD V3 §Scale: add cost guardrails by MAU and COGS, not only cloud-service tiers.

## §3 Tier-2 / Tier-3 decisions

### Q7 — Cross-surface state sync

**Decision:** use LWW for low-risk preferences, append-only event log for conversation/message history, and CRDT only for collaborative editable artifacts. OT is overkill for v1 unless real-time co-editing is a launch feature.

**PRD edit target:** Sync PRD: classify objects into preferences, conversations, memories, documents, and tool states with different conflict semantics.

### Q8 — Observability

**Decision:** telemetry-off-by-default. Crash-only Sentry with PII scrubbing. Optional product analytics via PostHog or Plausible with event minimization. OpenTelemetry for server traces with prompt/output redaction. No default session replay on AI screens.

**PRD edit target:** Observability PRD: add redaction test suite and telemetry consent state machine.

### Q9 — MCP safety model

**Decision:** hybrid marketplace. Default allowlist/vetted servers. Let advanced users import custom servers only behind warnings, scopes, OAuth, sandboxing, and audit logs. Treat MCP as a tool supply-chain surface.

**PRD edit target:** MCP PRD: add server trust levels, scopes, signed metadata, revocation, and user-visible risk labels.

### Q10 — Compliance requirements

**Decision:** launch with minimum viable privacy/compliance controls: privacy notice, DSAR/delete/export, retention settings, consent ledger, subprocessor list, telemetry off by default, GPC handling, AI safety labels, incident response, and NIST AI RMF risk register.

**PRD edit target:** Compliance PRD: implement GDPR/CCPA/state privacy launch checklist and EU AI Act launch classification note.

### Q11 — API pricing-change risk

**Decision:** do not depend on one provider’s “cheap current model.” Enforce a model substitution table, per-route budgets, provider price watch, explicit model IDs, and margin alerts. Gateways help routing but do not remove pricing or deprecation risk.

**PRD edit target:** Pricing PRD: add provider-price monitor and automatic fallback model policy.

### Q12 — Vendor roadmap horizon

**Decision:** assume 12 months of churn in on-device runtimes, MCP spec, EU AI Act obligations, model aliases, cache mechanics, and agentic APIs. Lock only to stable contracts that AGI owns.

**PRD edit target:** Roadmap PRD: add quarterly architecture review and model/runtime deprecation register.

### Q13 — Gateways

**Decision:** LiteLLM self-host is the best FOSS control plane if AGI wants own infra. Vercel AI Gateway is best if the web app remains Vercel-centric. OpenRouter is best for breadth and fast experiments but carries aggregator/model-term risk. Portkey is best for managed reliability/observability if budget permits.

### Q14 — Hardware acceleration

**Decision:** rely on platform-managed acceleration first: Apple Foundation Models and Android AICore. Use RN ExecuTorch for controlled fallback. Keep llama.rn/GGUF for breadth, not launch-critical latency.

### Q15 — ASO

**Decision:** position AGI as **private, local/BYOK, multi-provider, cross-surface work AI**. Do not compete with ChatGPT/Claude on “best general chatbot.” Screenshots should prove privacy and control: local mode, BYOK, model chooser, no-cloud telemetry, app-store-safe safety UX.

## §4 Top 20 takeaways

1. The single biggest architectural risk is confusing API abstraction with legal/commercial abstraction.
2. Gateways do not launder provider terms.
3. Prompt caching is a layout discipline, not a switch.
4. Output tokens dominate COGS when users ask for long answers or agents loop.
5. Gemini cache storage introduces a TTL cost dimension missing from many simple token calculators.
6. Anthropic’s explicit cache controls are powerful but require prefix discipline.
7. OpenAI’s automatic caching is easier to adopt but less deterministic.
8. Apple external purchase routing is not globally free-form; storefront gating matters.
9. EU DMA helps, but only if AGI follows Apple’s alternative terms and entitlements.
10. Native local runtimes reduce privacy risk and support burden but constrain feature availability to devices/OS.
11. llama.rn is valuable but should not be a launch blocker.
12. RN ExecuTorch is the best cross-platform fallback candidate under the locked Expo/RN constraint.
13. Heavy safety classifiers are not automatically viable on mobile v1.
14. Prompt Guard-style small classifiers are more plausible for injection/tool routes.
15. App-store AI safety expectations apply even when output is local and private.
16. Observability has to prove privacy-first claims through redaction and opt-in design.
17. MCP should be treated as a supply-chain and permissions product.
18. EU AI Act timing collides with the public launch window; avoid high-risk positioning.
19. State privacy law coverage is moving; implement generic DSAR/delete/export rather than one-state patches.
20. The PRD should lock interfaces and policy gates, not model/provider names.

## §5 Assumptions log

- assumption: Launch traffic has a material free/local/BYOK cohort — basis: brief states Free-forever Local + BYOK Cloud are non-negotiable.
- assumption: Managed-cloud usage is quota-limited for Hobby — basis: $10/mo economics cannot survive uncapped long-output or agent-loop usage.
- assumption: Apple and Google local runtimes remain device/OS gated — basis: platform runtime docs describe OS/device managed model paths.
- assumption: AGI does not ship regulated high-risk use cases at launch — basis: consumer/productivity positioning and conservative compliance posture.
- assumption: Web remains Vercel/Supabase-oriented through early launch — basis: requested scale questions and infra source list.

## §6 Highest escalated risks

| Risk                                        | Severity | Immediate mitigation                                                                  |
| ------------------------------------------- | -------: | ------------------------------------------------------------------------------------- |
| App Store rejection from payment steering   |        5 | StoreKit default; entitlement/storefront-gated external link.                         |
| Provider TOS breach from API resale posture |        5 | Position managed cloud as customer app; flow down terms; commercial review threshold. |
| Token COGS blowout                          |        5 | User/provider budgets, output caps, BYOK, cache hit KPIs, abuse detection.            |
| Prompt/output telemetry leak                |        5 | Telemetry off, scrubbing, no session replay, redaction tests.                         |
| MCP/tool-call exploit                       |        5 | Vetted servers, scopes, sandbox, human confirmation, audit logs.                      |

## §7 Source catalog

- **S001 — Apple App Store Review Guidelines** (Apple, 2026-05). https://developer.apple.com/app-store/review/guidelines/. StoreKit/external purchase/link-out/store safety rules; web.run refs turn917227view0, turn917227view1.
- **S002 — Apple DMA and apps in the EU** (Apple, 2026-05). https://developer.apple.com/support/dma-and-apps-in-the-eu/. EU alternative terms, alternative marketplaces, payment processing, link-out; web.run ref turn917227view2.
- **S003 — Apple Foundation Models framework** (Apple, 2026-05). https://developer.apple.com/documentation/FoundationModels. Framework access to Apple Intelligence on-device language model; web.run refs turn375646search1/10.
- **S004 — Anthropic Prompt Caching** (Anthropic, 2026-05). https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching. Explicit cache_control, 5-minute/1-hour TTL, cache write/read multipliers, isolation; web.run ref turn648069view0.
- **S005 — Anthropic API pricing** (Anthropic, 2026-05). https://platform.claude.com/docs/en/about-claude/pricing. Model pricing, cache multipliers, batch discount; web.run refs turn648069view1/turn401711search5.
- **S006 — Anthropic Commercial Terms of Service** (Anthropic, 2026-05). https://www.anthropic.com/legal/commercial-terms. Customer apps for own users, no resale except approved, pricing change notice; web.run ref turn938462view0.
- **S007 — OpenAI Prompt Caching guide** (OpenAI, 2026-05). https://platform.openai.com/docs/guides/prompt-caching. Automatic caching >=1024 tokens, prompt_cache_key, retention, cached token privacy; web.run refs turn133782view0/1.
- **S008 — OpenAI API pricing** (OpenAI, 2026-05). https://openai.com/api/pricing/. GPT-5.x pricing and cached input rates; web.run ref turn133782view2.
- **S009 — OpenAI Services Agreement** (OpenAI, 2026-05). https://openai.com/policies/services-agreement/. No resale/lease of account access; customer responsible for end users; web.run refs turn503554view2/turn133782view3.
- **S010 — Google Gemini API context caching** (Google, 2026-05). https://ai.google.dev/gemini-api/docs/caching. Context cache TTL, storage duration, billing, prefix semantics; web.run ref turn606457view0.
- **S011 — Google Gemini API pricing** (Google, 2026-05). https://ai.google.dev/gemini-api/docs/pricing. Gemini model pricing, cached token rates, storage per MTok-hour; web.run ref turn606457view1.
- **S012 — Google Gemini API Terms** (Google, 2026-05). https://ai.google.dev/terms. 30-day pricing change, agentic responsibility, grounding restrictions; web.run refs turn254275view2/0.
- **S013 — Gemini Nano on Android** (Google/Android, 2026-04-02). https://developer.android.com/ai/gemini-nano. AICore, ML Kit GenAI, offline/private, no direct internet, managed model distribution; web.run ref turn254275view4.
- **S014 — React Native ExecuTorch** (Software Mansion, 2026-05). https://github.com/software-mansion/react-native-executorch. RN on-device AI powered by ExecuTorch, MIT license; web.run refs turn150822search0/4.
- **S015 — llama.rn** (mybigday, 2026-05). https://github.com/mybigday/llama.rn. RN binding for llama.cpp, iOS Metal, Android experimental acceleration; web.run refs turn150822search1/9/17.
- **S016 — ExecuTorch** (PyTorch, 2026-05). https://github.com/pytorch/executorch. Unified on-device deployment for mobile/edge; packages for iOS/Android; web.run refs turn150822search2/6/10.
- **S017 — LiteRT-LM** (Google AI Edge, 2026-05). https://github.com/google-ai-edge/LiteRT-LM. Open-source high-performance edge LLM inference, Apache-2.0; web.run refs turn150822search3/11/27.
- **S018 — Google AI Edge Gallery** (Google AI Edge, 2026-05). https://github.com/google-ai-edge/gallery. On-device offline/private LLM mobile app; web.run ref turn150822search15.
- **S019 — Vercel AI SDK 6** (Vercel, 2026-05). https://sdk.vercel.ai/docs. Provider-agnostic TS AI toolkit, 20M monthly downloads; web.run refs turn569811search16/0/22.
- **S020 — Vercel AI Gateway** (Vercel, 2026-05). https://vercel.com/docs/ai-gateway. Unified API, budgets, monitoring, routing/fallbacks, BYOK; web.run refs turn569811search12/26/8.
- **S021 — LiteLLM Router/Fallbacks** (BerriAI, 2026-05). https://docs.litellm.ai/docs/routing. Budget routing, fallbacks, Redis for production limits; web.run refs turn569811search1/5/27.
- **S022 — Portkey Gateway** (Portkey, 2026-05). https://portkey.ai/docs. Fallbacks, load balancing, retries, caching; web.run refs turn569811search2/14/17.
- **S023 — OpenRouter Docs and Terms** (OpenRouter, 2026-05). https://openrouter.ai/docs. Provider sticky caching, BYOK fee, model terms, no competing resale; web.run refs turn569811search3/7/25 and turn986870view0.
- **S024 — Google Play AI-generated content policy** (Google Play, 2026-05). https://support.google.com/googleplay/android-developer/answer/13985936. Developers responsible for safe AI-generated content and user feedback/reporting; web.run refs turn520427search3/14.
- **S025 — Granite Guardian 3.1 2B** (IBM/Hugging Face, 2026-05). https://huggingface.co/ibm-granite/granite-guardian-3.1-2b. Detects prompt/response risks across IBM AI Risk Atlas; web.run refs turn520427search1/5/15.
- **S026 — Meta Prompt Guard 2** (Meta/Hugging Face, 2026-05). https://huggingface.co/meta-llama/Prompt-Guard-86M. 86M/22M prompt-injection classifier variants, license constraints; web.run refs turn520427search2/10/16.
- **S027 — Vercel pricing** (Vercel, 2026-05). https://vercel.com/pricing. Pro plan included credit and usage-based pricing; web.run refs turn760064search0/12/28.
- **S028 — Supabase pricing** (Supabase, 2026-05). https://supabase.com/pricing. Plans and edge-function included invocations/overage; web.run refs turn760064search1/13/21.
- **S029 — Sentry React Native docs** (Sentry, 2026-05). https://docs.sentry.io/platforms/react-native/. PII scrubbing/source maps/session replay masking; web.run refs turn760064search3/7/23.
- **S030 — PostHog privacy controls** (PostHog, 2026-05). https://posthog.com/docs/privacy. EU hosting, IP capture controls, sensitive autocapture controls, cookieless/opt-out; web.run refs turn760064search2/6/14.
- **S031 — EU AI Act regulatory framework** (European Commission, 2026-05). https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai. AI Act entered force 2024, phased applicability 2025-2027; web.run refs turn288910search8/12.
- **S032 — GDPR full text / Article 13** (EU/GDPR-info, 2026-05). https://gdpr-info.eu/art-13-gdpr/. Controller transparency obligations at collection; web.run refs turn288910search1/5.
- **S033 — California CCPA official page** (California Attorney General, 2026-05). https://oag.ca.gov/privacy/ccpa. Consumer rights to know/delete/opt out/sale-sharing and non-discrimination; web.run ref turn288910search2.
- **S034 — IAPP US State Privacy Legislation Tracker** (IAPP, 2026-05-11). https://iapp.org/resources/article/us-state-privacy-legislation-tracker/. State privacy tracker updated May 11 2026; web.run ref turn237196search7.
- **S035 — NIST AI Risk Management Framework** (NIST, 2026-05). https://www.nist.gov/itl/ai-risk-management-framework. Govern/Map/Measure/Manage functions; web.run refs turn237196search0/4/27.
- **S036 — OWASP Top 10 for LLM Applications** (OWASP, 2026-05). https://genai.owasp.org/llm-top-10/. Prompt injection and other LLM application risks; web.run refs turn237196search1/5/28.
- **S037 — OWASP Top 10 for Agentic Applications 2026** (OWASP, 2026-04). https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/. Agentic threats and mitigations; web.run refs turn237196search14/24.
- **S038 — MCP specification 2025-11-25** (Model Context Protocol, 2025-11-25). https://modelcontextprotocol.io/specification/2025-11-25. Open protocol for model apps to integrate tools/data; web.run refs turn255816search0/1/9.
- **S039 — MCP roadmap 2026** (Model Context Protocol / GitHub, 2026-05). https://github.com/modelcontextprotocol/specification/milestones. 2026-06-30-RC milestone and working-group roadmap; web.run refs turn255816search4/6.
- **S040 — DeepSeek API pricing and caching** (DeepSeek, 2026-05). https://api-docs.deepseek.com/quick_start/pricing. Cache-hit discounts, model deprecation warning, default context caching; web.run refs turn843348search1/5/26.
- **S041 — Mistral AI prompt caching** (Mistral, 2026-05). https://docs.mistral.ai/capabilities/prefix/. Prompt prefix cache tokens billed at 10% standard input; web.run ref turn843348search4.
- **S042 — xAI prompt caching and pricing** (xAI, 2026-05). https://docs.x.ai/docs/guides/prompt-caching. Automatic caching and reduced cached prompt token price; web.run refs turn843348search2/6/16.
- **S043 — LM Studio** (LM Studio, 2026-05). https://lmstudio.ai/. Local/private local LLM desktop app; web.run ref turn614778search3.
- **S044 — Ollama** (Ollama, 2026-05). https://ollama.com/. Build/run open models locally while keeping data safe; web.run ref turn614778search5.
- **S045 — Perplexity App Store/Play descriptions** (Perplexity, 2026-05). https://apps.apple.com/us/app/perplexity-ai-search-chat/id1668000334. Answer engine with sources/citations and model access; web.run refs turn401711search7/10.
- **S046 — Google Gemini app listing** (Google, 2026-05). https://play.google.com/store/apps/details?id=com.google.android.apps.bard. Gemini AI assistant mobile app; web.run ref turn401711search13.
- **S047 — ChatGPT app/site** (OpenAI, 2026-05). https://chatgpt.com/. ChatGPT public AI assistant; web.run ref turn401711search0.
- **S048 — Google Gemini / DeepMind model page** (Google DeepMind, 2026-05). https://deepmind.google/models/gemini/. Gemini 3 model family/current marketing page; web.run ref turn401711search6.
