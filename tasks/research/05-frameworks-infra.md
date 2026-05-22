# 05 — Frameworks, infra, auth, payments, observability first pass

**Recommendation:** keep the launch platform simple: Vercel + Supabase + Stripe web + StoreKit/Play Billing + Sentry crash reporting + opt-in privacy-preserving analytics. Add routing/cost dashboards before scaling, not after.

## Why

- Solo-founder time is the scarce resource; managed infra is rational until cost or reliability proves otherwise.
- Vercel/Supabase overages are easier to manage than premature infra ownership at 10K MAU.
- LLM COGS will dominate infra cost for managed-cloud users; optimizing hosting before token budgets is a false economy.
- Privacy-first observability requires explicit design, not later redaction.

## Launch stack

| Area              | Recommendation                             | Rationale                                                          | Evidence                 |
| ----------------- | ------------------------------------------ | ------------------------------------------------------------------ | ------------------------ |
| Web hosting/API   | Vercel                                     | Fast web iteration, existing ecosystem, AI SDK/Gateway optionality | S019,S020,S027           |
| Database/auth     | Supabase                                   | Fast auth/storage/Postgres; monitor realtime/edge limits           | S028                     |
| Payments web      | Stripe                                     | Locked brief says Stripe API version 2026-04-22.dahlia             | brief + full pass needed |
| iOS payments      | StoreKit IAP                               | Required global mobile-safe default                                | S001,S002                |
| Android payments  | Play Billing / external where allowed      | Must align with Google Play policy                                 | S024                     |
| Crash reporting   | Sentry RN                                  | Scrub PII/prompts/outputs; no default replay on AI screens         | S029                     |
| Product analytics | PostHog/Plausible                          | Opt-in/cookieless/minimal events                                   | S030                     |
| Tracing           | OpenTelemetry                              | Redacted server traces, no prompt bodies                           | S035,S036                |
| Gateway           | Optional LiteLLM/Vercel/OpenRouter/Portkey | Runtime route, not canonical contract                              | S020,S021,S022,S023      |

## Cost model

These are engineering estimates, not audited financial projections.

|  MAU | Infra posture                                                            | Infra estimate excluding LLM | Managed LLM posture                                                                     |
| ---: | ------------------------------------------------------------------------ | ---------------------------: | --------------------------------------------------------------------------------------- |
|  10K | Vercel/Supabase paid tiers, minimal observability                        |                 $100–$800/mo | Strict quotas; cheap default models; BYOK default for power users.                      |
| 100K | Managed infra with hot-path monitoring; possible worker/queue split      |                   $1K–$8K/mo | Route budgets, cache KPIs, margin alerts; negotiate/provider deals if paid usage grows. |
|   1M | Split traffic: queue, routing service, DB replicas, analytics separation |                $15K–$80K+/mo | LLM COGS is strategic; need committed-use/provider mix and pricing controls.            |

## Observability rules

1. Never log raw prompts, outputs, API keys, local file names, or user documents.
2. Event names should describe product actions, not content.
3. Crash reports must scrub breadcrumbs and custom contexts.
4. Session replay is disabled by default and not used on AI conversation screens in v1.
5. Server traces record route/provider/model/token counts/cost estimates, not content.
6. BYOK key presence can be recorded as boolean; key value never leaves secure storage unless explicit proxy route is enabled.

## Migration triggers

- Vercel/Supabase monthly cost >10% of monthly revenue.
- DB pool or realtime bottleneck blocks product UX.
- LLM cost >40% of paid subscription revenue after cache/model optimization.
- Analytics/observability vendor cannot meet privacy posture.
- Enterprise customer requires data residency or DPA features beyond current stack.

## Sources

- **S019 — Vercel AI SDK 6** (Vercel, 2026-05). https://sdk.vercel.ai/docs. Provider-agnostic TS AI toolkit, 20M monthly downloads; web.run refs turn569811search16/0/22.
- **S020 — Vercel AI Gateway** (Vercel, 2026-05). https://vercel.com/docs/ai-gateway. Unified API, budgets, monitoring, routing/fallbacks, BYOK; web.run refs turn569811search12/26/8.
- **S027 — Vercel pricing** (Vercel, 2026-05). https://vercel.com/pricing. Pro plan included credit and usage-based pricing; web.run refs turn760064search0/12/28.
- **S028 — Supabase pricing** (Supabase, 2026-05). https://supabase.com/pricing. Plans and edge-function included invocations/overage; web.run refs turn760064search1/13/21.
- **S029 — Sentry React Native docs** (Sentry, 2026-05). https://docs.sentry.io/platforms/react-native/. PII scrubbing/source maps/session replay masking; web.run refs turn760064search3/7/23.
- **S030 — PostHog privacy controls** (PostHog, 2026-05). https://posthog.com/docs/privacy. EU hosting, IP capture controls, sensitive autocapture controls, cookieless/opt-out; web.run refs turn760064search2/6/14.
- **S001 — Apple App Store Review Guidelines** (Apple, 2026-05). https://developer.apple.com/app-store/review/guidelines/. StoreKit/external purchase/link-out/store safety rules; web.run refs turn917227view0, turn917227view1.
- **S002 — Apple DMA and apps in the EU** (Apple, 2026-05). https://developer.apple.com/support/dma-and-apps-in-the-eu/. EU alternative terms, alternative marketplaces, payment processing, link-out; web.run ref turn917227view2.
- **S024 — Google Play AI-generated content policy** (Google Play, 2026-05). https://support.google.com/googleplay/android-developer/answer/13985936. Developers responsible for safe AI-generated content and user feedback/reporting; web.run refs turn520427search3/14.
- **S035 — NIST AI Risk Management Framework** (NIST, 2026-05). https://www.nist.gov/itl/ai-risk-management-framework. Govern/Map/Measure/Manage functions; web.run refs turn237196search0/4/27.
- **S036 — OWASP Top 10 for LLM Applications** (OWASP, 2026-05). https://genai.owasp.org/llm-top-10/. Prompt injection and other LLM application risks; web.run refs turn237196search1/5/28.
