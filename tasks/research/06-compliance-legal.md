# 06 — Compliance, legal, store policy, provider TOS, AI safety first pass

**Recommendation:** treat compliance as launch infrastructure. Ship the controls before public mobile launch; do not wait for user scale.

## Why

- The product is global and processes personal data, prompts, files, provider keys, and generated outputs.
- App-store rules apply even when inference is local.
- Provider terms distinguish customer applications from resale and impose user-responsibility obligations.
- EU AI Act, GDPR, CCPA/state privacy, OWASP, and NIST controls are all relevant to an AI app with tool use and model routing.

## Store policy

### Apple

Ship StoreKit IAP globally. Only show external purchase links where Apple entitlements and storefront rules permit. Use App Review notes for BYOK/local mode and payment-screen logic. Avoid copy that encourages a non-allowed alternate purchase outside permitted storefronts.

### Google Play

Generative-AI apps must keep AI-generated content safe and incorporate user feedback/reporting. AGI should ship report buttons, safety categories, and moderation incident handling even for local output.

## Provider TOS posture

| Provider      | Managed-cloud posture                                                                   | Required control                                                                  |
| ------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Anthropic     | Customer apps for own users are contemplated; resale needs approval                     | Flow down terms, abuse monitoring, commercial review threshold.                   |
| OpenAI        | Customer applications with end users are contemplated; account access resale prohibited | Do not sell raw API access; maintain end-user responsibility controls.            |
| Google Gemini | Paid-service price changes, grounding restrictions, agentic responsibility              | Human confirmation, no prohibited grounding caching/resale, route-specific terms. |
| OpenRouter    | Aggregator terms flow down model terms and prohibit competing resale                    | Use as route option, not legal simplifier.                                        |

## Privacy launch checklist

1. Privacy notice at collection covering prompts, files, keys, telemetry, crash logs, provider routing, retention, and subprocessors.
2. Data export and deletion workflow.
3. Retention settings for conversations, memories, telemetry, abuse logs, and cache metadata.
4. Consent ledger for telemetry, BYOK proxying, Apple 5.1.2(i) modal, and managed-cloud routing.
5. Global Privacy Control / opt-out flow where CCPA/state laws apply.
6. DPA/subprocessor list for Vercel, Supabase, Sentry, PostHog/Plausible, Stripe, and LLM providers.
7. Security controls: encryption at rest/in transit, key storage, least privilege, audit logs.
8. AI transparency: label managed cloud vs BYOK vs local, model/provider, limitations, and safety reporting.

## EU AI Act posture

Avoid regulated high-risk use cases at launch: employment decisions, education admissions/scoring, credit, health/medical advice, law enforcement, migration/asylum, or critical infrastructure control. Public copy should not imply the app performs regulated determinations. Maintain AI literacy/safety documentation and risk register.

## OWASP / NIST mapping

| Control                    | OWASP/NIST linkage             | AGI implementation                                                             |
| -------------------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| Prompt injection filtering | OWASP LLM / Agentic            | Prompt Guard or small classifier for tool routes; rule-based high-risk blocks. |
| Tool permission scopes     | OWASP Agentic                  | MCP scopes, least privilege, human confirmation.                               |
| Risk register              | NIST Govern/Map/Measure/Manage | `_risk_register.csv` maintained per release.                                   |
| Telemetry redaction        | Privacy/security               | Sentry/PostHog/OTel scrubbers and tests.                                       |
| Incident response          | Manage                         | App-store/provider abuse response playbook.                                    |

## Sources

- **S001 — Apple App Store Review Guidelines** (Apple, 2026-05). https://developer.apple.com/app-store/review/guidelines/. StoreKit/external purchase/link-out/store safety rules; web.run refs turn917227view0, turn917227view1.
- **S002 — Apple DMA and apps in the EU** (Apple, 2026-05). https://developer.apple.com/support/dma-and-apps-in-the-eu/. EU alternative terms, alternative marketplaces, payment processing, link-out; web.run ref turn917227view2.
- **S006 — Anthropic Commercial Terms of Service** (Anthropic, 2026-05). https://www.anthropic.com/legal/commercial-terms. Customer apps for own users, no resale except approved, pricing change notice; web.run ref turn938462view0.
- **S009 — OpenAI Services Agreement** (OpenAI, 2026-05). https://openai.com/policies/services-agreement/. No resale/lease of account access; customer responsible for end users; web.run refs turn503554view2/turn133782view3.
- **S012 — Google Gemini API Terms** (Google, 2026-05). https://ai.google.dev/terms. 30-day pricing change, agentic responsibility, grounding restrictions; web.run refs turn254275view2/0.
- **S023 — OpenRouter Docs and Terms** (OpenRouter, 2026-05). https://openrouter.ai/docs. Provider sticky caching, BYOK fee, model terms, no competing resale; web.run refs turn569811search3/7/25 and turn986870view0.
- **S024 — Google Play AI-generated content policy** (Google Play, 2026-05). https://support.google.com/googleplay/android-developer/answer/13985936. Developers responsible for safe AI-generated content and user feedback/reporting; web.run refs turn520427search3/14.
- **S031 — EU AI Act regulatory framework** (European Commission, 2026-05). https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai. AI Act entered force 2024, phased applicability 2025-2027; web.run refs turn288910search8/12.
- **S032 — GDPR full text / Article 13** (EU/GDPR-info, 2026-05). https://gdpr-info.eu/art-13-gdpr/. Controller transparency obligations at collection; web.run refs turn288910search1/5.
- **S033 — California CCPA official page** (California Attorney General, 2026-05). https://oag.ca.gov/privacy/ccpa. Consumer rights to know/delete/opt out/sale-sharing and non-discrimination; web.run ref turn288910search2.
- **S034 — IAPP US State Privacy Legislation Tracker** (IAPP, 2026-05-11). https://iapp.org/resources/article/us-state-privacy-legislation-tracker/. State privacy tracker updated May 11 2026; web.run ref turn237196search7.
- **S035 — NIST AI Risk Management Framework** (NIST, 2026-05). https://www.nist.gov/itl/ai-risk-management-framework. Govern/Map/Measure/Manage functions; web.run refs turn237196search0/4/27.
- **S036 — OWASP Top 10 for LLM Applications** (OWASP, 2026-05). https://genai.owasp.org/llm-top-10/. Prompt injection and other LLM application risks; web.run refs turn237196search1/5/28.
- **S037 — OWASP Top 10 for Agentic Applications 2026** (OWASP, 2026-04). https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/. Agentic threats and mitigations; web.run refs turn237196search14/24.
- **S025 — Granite Guardian 3.1 2B** (IBM/Hugging Face, 2026-05). https://huggingface.co/ibm-granite/granite-guardian-3.1-2b. Detects prompt/response risks across IBM AI Risk Atlas; web.run refs turn520427search1/5/15.
- **S026 — Meta Prompt Guard 2** (Meta/Hugging Face, 2026-05). https://huggingface.co/meta-llama/Prompt-Guard-86M. 86M/22M prompt-injection classifier variants, license constraints; web.run refs turn520427search2/10/16.
