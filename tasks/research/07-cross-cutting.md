# 07 — Cross-cutting recommendations Q1–Q15

**Recommendation:** lock interfaces, policies and fallbacks now; leave provider/model choices configurable. This is the only approach that preserves speed while reducing legal, cost and deprecation risk.

### Q1

**Recommendation:** Use provider-specific caching adapters behind normalized CacheIntent; do not claim universal prompt-cache parity.

**PRD edit target:** Add this recommendation as a concrete section-level acceptance criterion and route any exception through the risk register.

### Q2

**Recommendation:** Own `@agiworkforce/llm-normalize` as canonical contract; use Vercel AI SDK and gateways as adapters/routes.

**PRD edit target:** Add this recommendation as a concrete section-level acceptance criterion and route any exception through the risk register.

### Q3

**Recommendation:** Ship StoreKit IAP globally; gate external purchase by storefront/entitlement.

**PRD edit target:** Add this recommendation as a concrete section-level acceptance criterion and route any exception through the risk register.

### Q4

**Recommendation:** Managed cloud is a customer app, not API resale; flow down provider terms and add commercial review threshold.

**PRD edit target:** Add this recommendation as a concrete section-level acceptance criterion and route any exception through the risk register.

### Q5

**Recommendation:** Ship safety UX and injection controls v1; optional on-device classifier after benchmark.

**PRD edit target:** Add this recommendation as a concrete section-level acceptance criterion and route any exception through the risk register.

### Q6

**Recommendation:** Stay managed at 10K; hot-path split at 100K; custom routing/infra at 1M if cost triggers fire.

**PRD edit target:** Add this recommendation as a concrete section-level acceptance criterion and route any exception through the risk register.

### Q7

**Recommendation:** Use LWW for preferences, append-only events for conversations, CRDT only for collaborative docs.

**PRD edit target:** Add this recommendation as a concrete section-level acceptance criterion and route any exception through the risk register.

### Q8

**Recommendation:** Telemetry off by default; scrubbed crash reports; opt-in analytics; no session replay on AI screens.

**PRD edit target:** Add this recommendation as a concrete section-level acceptance criterion and route any exception through the risk register.

### Q9

**Recommendation:** Hybrid MCP marketplace: vetted default, custom servers with warnings/scopes/sandbox/audit.

**PRD edit target:** Add this recommendation as a concrete section-level acceptance criterion and route any exception through the risk register.

### Q10

**Recommendation:** Launch with privacy notice, delete/export/retention/consent controls, AI labels, NIST risk register.

**PRD edit target:** Add this recommendation as a concrete section-level acceptance criterion and route any exception through the risk register.

### Q11

**Recommendation:** Use model substitution, price watch, explicit IDs, budgets and margin alerts; gateways help but do not eliminate risk.

**PRD edit target:** Add this recommendation as a concrete section-level acceptance criterion and route any exception through the risk register.

### Q12

**Recommendation:** Plan for churn in MCP, EU AI Act, model aliases, platform runtimes and cache semantics.

**PRD edit target:** Add this recommendation as a concrete section-level acceptance criterion and route any exception through the risk register.

### Q13

**Recommendation:** Gateway as optional route: LiteLLM for FOSS control, Vercel for convenience, OpenRouter for breadth, Portkey for managed reliability.

**PRD edit target:** Add this recommendation as a concrete section-level acceptance criterion and route any exception through the risk register.

### Q14

**Recommendation:** Platform-managed on-device acceleration first; RN ExecuTorch second; llama.rn third.

**PRD edit target:** Add this recommendation as a concrete section-level acceptance criterion and route any exception through the risk register.

### Q15

**Recommendation:** ASO wedge: private/local/BYOK/multi-provider work AI, not generic chatbot.

**PRD edit target:** Add this recommendation as a concrete section-level acceptance criterion and route any exception through the risk register.

## Rejected candidates and one-line reasons

| Candidate                                            | Rejection reason                                                       |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| Cactus SDK                                           | Excluded by brief due license thresholds/telemetry defaults.           |
| RunAnywhere SDK                                      | Excluded by brief due license thresholds/telemetry defaults.           |
| MediaPipe LLM Inference mobile                       | Excluded by brief; use LiteRT-LM path instead.                         |
| llama.rn as T1 mobile runtime                        | Too much device/OS issue volatility for launch-critical primary.       |
| Vercel AI SDK as sole canonical contract             | Good web SDK but provider-specific semantics still leak.               |
| OpenRouter as sole provider layer                    | Fast breadth, but aggregator terms/model removal/resale risk remain.   |
| Raw SDK-only architecture                            | Fast short term; high lock-in and duplicated policy/cost logic.        |
| Heavy on-device output safety model for all v1 users | Unproven mobile latency/accuracy/storage fit.                          |
| Global web Stripe link in iOS app                    | App Store policy risk outside allowed storefront/entitlement patterns. |
| Unlimited Hobby usage                                | Token economics break under long outputs and agent loops.              |

## Decision dependencies

1. Provider adapters need a common test harness.
2. Mobile runtime detection must be implemented before marketing local/offline claims.
3. Payment screen gating must be tested by storefront and entitlement state.
4. Prompt cache telemetry must be visible before managed-cloud public launch.
5. MCP cannot ship open marketplace defaults before scopes and sandboxing exist.

## Sources

- **S001 — Apple App Store Review Guidelines** (Apple, 2026-05). https://developer.apple.com/app-store/review/guidelines/. StoreKit/external purchase/link-out/store safety rules; web.run refs turn917227view0, turn917227view1.
- **S002 — Apple DMA and apps in the EU** (Apple, 2026-05). https://developer.apple.com/support/dma-and-apps-in-the-eu/. EU alternative terms, alternative marketplaces, payment processing, link-out; web.run ref turn917227view2.
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
- **S019 — Vercel AI SDK 6** (Vercel, 2026-05). https://sdk.vercel.ai/docs. Provider-agnostic TS AI toolkit, 20M monthly downloads; web.run refs turn569811search16/0/22.
- **S020 — Vercel AI Gateway** (Vercel, 2026-05). https://vercel.com/docs/ai-gateway. Unified API, budgets, monitoring, routing/fallbacks, BYOK; web.run refs turn569811search12/26/8.
- **S021 — LiteLLM Router/Fallbacks** (BerriAI, 2026-05). https://docs.litellm.ai/docs/routing. Budget routing, fallbacks, Redis for production limits; web.run refs turn569811search1/5/27.
- **S023 — OpenRouter Docs and Terms** (OpenRouter, 2026-05). https://openrouter.ai/docs. Provider sticky caching, BYOK fee, model terms, no competing resale; web.run refs turn569811search3/7/25 and turn986870view0.
- **S024 — Google Play AI-generated content policy** (Google Play, 2026-05). https://support.google.com/googleplay/android-developer/answer/13985936. Developers responsible for safe AI-generated content and user feedback/reporting; web.run refs turn520427search3/14.
- **S031 — EU AI Act regulatory framework** (European Commission, 2026-05). https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai. AI Act entered force 2024, phased applicability 2025-2027; web.run refs turn288910search8/12.
- **S035 — NIST AI Risk Management Framework** (NIST, 2026-05). https://www.nist.gov/itl/ai-risk-management-framework. Govern/Map/Measure/Manage functions; web.run refs turn237196search0/4/27.
- **S036 — OWASP Top 10 for LLM Applications** (OWASP, 2026-05). https://genai.owasp.org/llm-top-10/. Prompt injection and other LLM application risks; web.run refs turn237196search1/5/28.
- **S037 — OWASP Top 10 for Agentic Applications 2026** (OWASP, 2026-04). https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/. Agentic threats and mitigations; web.run refs turn237196search14/24.
- **S038 — MCP specification 2025-11-25** (Model Context Protocol, 2025-11-25). https://modelcontextprotocol.io/specification/2025-11-25. Open protocol for model apps to integrate tools/data; web.run refs turn255816search0/1/9.
- **S039 — MCP roadmap 2026** (Model Context Protocol / GitHub, 2026-05). https://github.com/modelcontextprotocol/specification/milestones. 2026-06-30-RC milestone and working-group roadmap; web.run refs turn255816search4/6.
