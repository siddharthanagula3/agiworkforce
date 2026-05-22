# 09 — Vendor roadmaps, standards and deprecations first pass

**Recommendation:** the next 12 months should be treated as a churn window. AGI should freeze its own contracts while expecting provider, platform, regulatory and standard-layer changes.

## 12-month horizon

| Horizon item                                         | Probability | Impact on AGI                                             | Action                                                |
| ---------------------------------------------------- | ----------: | --------------------------------------------------------- | ----------------------------------------------------- |
| Apple expands/changes Foundation Models capabilities |        High | iOS local features and device eligibility change          | Keep capability detection and adapter layer.          |
| Android AICore/Gemini Nano expands devices/APIs      |        High | More Android local capability; fewer custom runtime needs | Prefer AICore T1; do not hardcode device assumptions. |
| LiteRT-LM matures as MediaPipe replacement           |        High | Android/edge fallback improves                            | Track, test, but do not block v1.                     |
| MCP spec changes after 2025-11-25 stable             |        High | Server safety/auth model may need update                  | Version MCP server registry and scopes.               |
| EU AI Act applicability milestones hit launch window |        High | Transparency/risk controls needed                         | Maintain compliance checklist and risk register.      |
| Provider model aliases/deprecations                  |        High | Broken routes if aliases used                             | Pin explicit IDs and migration table.                 |
| Prompt caching semantics/pricing shift               | Medium-high | Margin estimates change                                   | Price watch and cache telemetry.                      |
| Consumer AI app subscriptions tighten usage          |        High | Users expect quota/credit transparency                    | Show managed-cloud budgets honestly.                  |
| Gateways add better routing/observability            |      Medium | Could reduce AGI infra work                               | Keep optional plugin interface.                       |
| On-device hardware acceleration improves             |        High | Local mode becomes more viable                            | Make local paths modular and benchmark-driven.        |

## Regulatory timeline

| Regulation/standard | Current signal                                     | AGI obligation                                                       |
| ------------------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| EU AI Act           | Entered force 2024; phased milestones through 2027 | Avoid high-risk launch claims; maintain transparency/risk controls.  |
| GDPR                | Long-standing direct privacy obligations           | Notice, DSAR, deletion, export, retention, security, DPIA if needed. |
| CCPA/state privacy  | US state coverage evolving                         | Generic privacy rights implementation, GPC handling, opt-out model.  |
| NIST AI RMF         | Govern/Map/Measure/Manage risk framework           | Risk register and release review.                                    |
| OWASP LLM/Agentic   | Prompt/tool/security risk catalog                  | Injection/tool-call controls and red-team tests.                     |
| MCP                 | 2025-11-25 stable with active 2026 roadmap         | Versioned server policy and auth controls.                           |

## Deprecation posture

- Do not ship launch-critical routes on preview or alias-only models.
- Every model in production has owner, provider, explicit ID, status, fallback, and last-verification date.
- User-facing model names can be friendly, but route config must be explicit.
- Any provider EOL notice triggers a PRD/risk-register update within 7 days.

## Sources

- **S003 — Apple Foundation Models framework** (Apple, 2026-05). https://developer.apple.com/documentation/FoundationModels. Framework access to Apple Intelligence on-device language model; web.run refs turn375646search1/10.
- **S013 — Gemini Nano on Android** (Google/Android, 2026-04-02). https://developer.android.com/ai/gemini-nano. AICore, ML Kit GenAI, offline/private, no direct internet, managed model distribution; web.run ref turn254275view4.
- **S017 — LiteRT-LM** (Google AI Edge, 2026-05). https://github.com/google-ai-edge/LiteRT-LM. Open-source high-performance edge LLM inference, Apache-2.0; web.run refs turn150822search3/11/27.
- **S031 — EU AI Act regulatory framework** (European Commission, 2026-05). https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai. AI Act entered force 2024, phased applicability 2025-2027; web.run refs turn288910search8/12.
- **S034 — IAPP US State Privacy Legislation Tracker** (IAPP, 2026-05-11). https://iapp.org/resources/article/us-state-privacy-legislation-tracker/. State privacy tracker updated May 11 2026; web.run ref turn237196search7.
- **S035 — NIST AI Risk Management Framework** (NIST, 2026-05). https://www.nist.gov/itl/ai-risk-management-framework. Govern/Map/Measure/Manage functions; web.run refs turn237196search0/4/27.
- **S036 — OWASP Top 10 for LLM Applications** (OWASP, 2026-05). https://genai.owasp.org/llm-top-10/. Prompt injection and other LLM application risks; web.run refs turn237196search1/5/28.
- **S037 — OWASP Top 10 for Agentic Applications 2026** (OWASP, 2026-04). https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/. Agentic threats and mitigations; web.run refs turn237196search14/24.
- **S038 — MCP specification 2025-11-25** (Model Context Protocol, 2025-11-25). https://modelcontextprotocol.io/specification/2025-11-25. Open protocol for model apps to integrate tools/data; web.run refs turn255816search0/1/9.
- **S039 — MCP roadmap 2026** (Model Context Protocol / GitHub, 2026-05). https://github.com/modelcontextprotocol/specification/milestones. 2026-06-30-RC milestone and working-group roadmap; web.run refs turn255816search4/6.
- **S040 — DeepSeek API pricing and caching** (DeepSeek, 2026-05). https://api-docs.deepseek.com/quick_start/pricing. Cache-hit discounts, model deprecation warning, default context caching; web.run refs turn843348search1/5/26.
- **S023 — OpenRouter Docs and Terms** (OpenRouter, 2026-05). https://openrouter.ai/docs. Provider sticky caching, BYOK fee, model terms, no competing resale; web.run refs turn569811search3/7/25 and turn986870view0.
- **S020 — Vercel AI Gateway** (Vercel, 2026-05). https://vercel.com/docs/ai-gateway. Unified API, budgets, monitoring, routing/fallbacks, BYOK; web.run refs turn569811search12/26/8.
