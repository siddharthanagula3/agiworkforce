# AGI Web — Volume 01 — Product Overview

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `apps/web/AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); grounded in `apps/web/proxy.ts`, `apps/web/app/api/{chat,memory,projects}/sync/route.ts`, `apps/web/db/neon/*.sql`, `apps/web/lib/pricing.ts`, `packages/contracts/types/src/{billing-catalog,models}` (`.ts`/`.json`).

## Overview & stance

AGI Web is the **cloud-only** surface of the AGI suite. It runs on Next.js 16 (App Router, `proxy.ts` with an exported `proxy` function — never `middleware.ts`), Clerk auth, Neon Postgres with RLS, and Stripe billing, on Vercel. It is one of six user surfaces (Mobile, Web, Desktop, CLI, Chrome, VS Code); no seventh product.

Trust stance is deliberately narrow: Web exposes **only** Managed Cloud. It **never** offers BYOK or Local — those belong to Desktop/CLI/VS Code (BYOK) and on-device runtimes (Local). Managed Cloud is public alpha, **open by default** for signed-in users (founder decision 2026-06-27) — present as available, never waitlist-gated. Web chat is subscription-backed through Neon/account state; no free env-key chat. Web is the account home: it owns account, projects, synced app chats, artifacts, billing, and admin, and hosts the suite's Neon delta-sync APIs.

## Vision

Be the account and cloud home of AGI Workforce: the browser destination where a signed-in user reaches their models, chats, projects, artifacts, and billing, synced with Mobile and Desktop. 🔭 (aspirational; capabilities labeled below).

## Mission

Deliver subscription-backed, multi-provider cloud chat and workspace tooling in the browser, with per-user isolation enforced in the database, so users get parity-class capability without installing anything. ✅ Built foundation: user-scoped store and RLS isolation exist (`apps/web/db/neon/0037_rls_user_isolation.sql`; `apps/web/app/api/chat/sync/route.ts`).

## Product Goals

- **Zero-install cloud chat** backed by account entitlements, not an ambient key. 🟡 — chat routes exist (`apps/web/app/{chat,chat-multi}`); plan-gated model access is not fully wired.
- **Cross-device continuity**: chats, memory, projects sync Web ↔ Mobile ↔ Desktop for Managed-Cloud rows only. ✅: `apps/web/app/api/{chat,memory,projects}/sync/route.ts` (cursor + tombstones + server-side idempotent upsert; RLS backstop).
- **Account + billing home**: sign-in, subscriptions, admin on Web. 🟡 — `apps/web/app/{billing,admin}`, `apps/web/db/neon/0012_stripe.sql` exist; catalog reconciliation outstanding.
- **Multi-provider model access** from the shared catalog, never hardcoded. ✅ SSOT: `packages/contracts/types/src/models.json`.

## User Personas

- **Individual builder / prosumer** — wants capable cloud chat and artifacts without local setup; upgrades Free → Basic/Pro.
- **Mobile-first cross-device user** — starts a chat on phone, continues in the browser; depends on delta-sync. ✅ (`.../sync/route.ts`).
- **Team / enterprise admin** — manages seats, org controls, access; served by Enterprise. 🟡 (`apps/web/db/neon/0015_organizations.sql`, `apps/web/app/enterprise`).
- **Evaluator comparing to claude.ai / chatgpt.com** — judges Web on capability, price, trust clarity.

## User Stories

- As a signed-in user, I start a cloud chat billed to my account, not a shared key. 🟡 (`apps/web/app/chat`).
- As a returning user, chats/projects/memory made on Mobile appear on Web with no manual export. ✅ (`.../sync/route.ts`).
- As a paying user, I view and change my plan and see it in entitlements. 🟡 (`apps/web/app/billing`, `apps/web/db/neon/0003_subscriptions.sql`).
- As any user, my rows are never visible to another user. ✅ (`apps/web/db/neon/0037_rls_user_isolation.sql`).
- As a user, I am **never** asked for a provider API key on Web. ✅ by stance (no BYOK route).

## Success Metrics

- Signed-in → first-cloud-chat conversion; Free → Basic/Pro upgrade rate. 🔭.
- Sync success rate and median latency for `.../sync`. 🟡 — endpoints exist; SLO dashboards 🔭.
- Zero cross-tenant data-leak incidents. ✅ mechanism built (`0037_rls_user_isolation.sql`); continuous probe 🔭.
- Web availability / error rate (Vercel). 🔭.

## Business Goals

Convert free cloud users into paying subscribers and anchor the suite's account/billing home. Pricing (founder decision 2026-06-30), used **everywhere**: **Free $0**; **Basic $8/mo (₹399/mo)**; **Pro $20/mo**; **Max $100/mo and $200/mo** (two tiers); **Enterprise custom**. Local and BYOK are free access modes, not plans. INR is fixed only for Basic (₹399); Pro/Max INR are TBD — do not invent them. No credit top-ups. 🟡 — code still encodes older tiers: `packages/contracts/types/src/billing-catalog.ts` lists `free/pro/max/team/enterprise` (no `basic`, still `team`), and `apps/web/lib/pricing.ts` wires `pro/max/team` Stripe prices. Reconciliation is a separate tracked task.

## Market Position

AGI Web sits alongside claude.ai and chatgpt.com as a browser AI home, but differentiates on **multi-provider** model access from one catalog, **explicit per-surface trust** (BYOK and Local exist elsewhere, never on Web), and one coherent **six-surface suite** with real cross-device sync, not a lone web app. 🔭 positioning; sync foundation ✅.

## Competitive Analysis — vs claude.ai and chatgpt.com

- **Model choice**: claude.ai serves Anthropic models, chatgpt.com serves OpenAI models; AGI Web presents **multiple providers** from the shared catalog. ✅ SSOT (`packages/contracts/types/src/models.json`); model-picker wiring 🟡.
- **Trust clarity**: neither competitor exposes BYOK in-browser; AGI matches that on Web (cloud-only) **by design**, offering BYOK only on Desktop/CLI/VS Code. ✅ by stance.
- **Pricing**: competitors run ~$20 primary tiers plus power tiers; AGI adds an $8 Basic below the $20 anchor (Free / Basic / Pro / Max $100 & $200 / Enterprise). 🟡 (catalog gap above).
- **Continuity**: both sync within their own web/app; AGI syncs Web ↔ Mobile ↔ Desktop for Managed-Cloud rows. ✅ (`.../sync/route.ts`).

## Product Principles

- Cloud-only on Web: no BYOK, no Local affordance — ever. ✅ stance.
- Managed Cloud is open by default; never render a waitlist gate for signed-in users. ✅ (`AGENTS.md` managed-cloud rule).
- Model IDs come only from `packages/contracts/types/src/models.json`; never hardcode. ✅.
- Isolation is enforced in the DB, not just the app layer. ✅ (`0037_rls_user_isolation.sql`).
- Only Managed-Cloud rows sync; Local/BYOK rows never reach `.../sync`. ✅ (trust-boundary comment, `chat/sync/route.ts`).

## Constraints

- Next.js 16 requires `proxy.ts` exporting `proxy` — renaming to `middleware.ts` is prohibited. ✅ (`apps/web/proxy.ts:114`).
- Stack is Clerk + Neon + Stripe only; **never** reference Supabase (fully migrated away). ✅.
- Canonical migrations live in `apps/web/db/neon`; RLS/user-scoping is mandatory. ✅.
- Pricing ladder is fixed; removed forever: "Plus", `pro_plus`, "Hobby". "Team" is a real, separate per-seat tier (reinstated 2026-07-11, supersedes the 2026-06-30 "served by Enterprise" framing). Code predates this (🟡, tracked).
- `apps/web/AGENTS.md` lane contract: shared schemas/adapters/desktop-CLI behavior must not live in Web.

## Assumptions

- Signed-in identity comes from Clerk; the Neon subject GUC binds RLS (`0037_rls_user_isolation.sql`). ✅.
- Stripe env price IDs are provisioned per environment (`apps/web/lib/pricing.ts` validates `STRIPE_PRICE_*`). 🟡.
- Vercel is the deploy target; CSP/nonce in `proxy.ts` reflects that. ✅.
- Delta-sync clients honor the cursor + tombstone contract. ✅ server side; client conformance 🔭.

## Risks

- **Billing catalog drift** — UI/catalog still show `team`/omit `basic`, risking wrong prices. 🟡 (`billing-catalog.ts`, `pricing.ts`); high priority.
- **Trust-boundary regression** — adding a BYOK/Local affordance, or letting Local/BYOK rows into `.../sync`. Mitigation: server forces `user_id` from session; RLS WITH CHECK backstop (`chat/sync/route.ts`).
- **Waitlist copy** regressing the open-by-default alpha. Mitigation: unusual-behavior loop (`apps/web/AGENTS.md`).
- **Cross-tenant leak** if the RLS GUC is unset. Mitigation: `0037_rls_user_isolation.sql` + probe.

## Repository map

- `apps/web/proxy.ts` — Clerk `proxy` + CSP (Next.js 16).
- `apps/web/app/api/{chat,memory,projects}/sync/route.ts` — Neon delta-sync (Managed-Cloud only).
- `apps/web/db/neon/*.sql` — canonical migrations (`0003_subscriptions`, `0012_stripe`, `0015_organizations`, `0037_rls_user_isolation`, `0038`–`0041` cloud-sync).
- `apps/web/app/{chat,chat-multi,projects,billing,admin,connectors,enterprise}` — product surfaces.
- `apps/web/lib/pricing.ts`, `packages/contracts/types/src/billing-catalog.ts` — pricing (🟡 drift).
- `packages/contracts/types/src/models.json` — model-ID SSOT; `apps/web/AGENTS.md` — lane/trust rules.

## Competitor notes

Claude/ChatGPT are single-provider browser homes; Codex adds cloud-run and QR-paired remote sessions steering a host. AGI's deliberate divergence: **multi-provider** from one catalog; **per-surface trust** (BYOK on Desktop/CLI/VS Code only, never Web/Mobile; Local on-device only); **local-first** where the surface allows — but Web itself is cloud-only by mandate. Remote Control (a secure remote window over a locally-running session) and cloud-run Managed sessions are distinct paths owned by other volumes, not Web trust modes.

## Acceptance / Definition of Done

Web is production-ready when the stance, sync, isolation, and billing contracts hold and are verifiable against real paths.

- [ ] **Build**: `pnpm --filter @agiworkforce/web typecheck`, `test`, `build` pass; `proxy.ts` exports `proxy` (no `middleware.ts`).
- [ ] **Trust**: no BYOK or Local affordance renders on Web; `.../sync` sets `user_id` server-side and rejects Local/BYOK rows; Managed Cloud shows as open (no waitlist gate).
- [ ] **Security**: RLS on user-scoped tables (`0037_rls_user_isolation.sql`) with a passing cross-tenant probe; no Supabase references; model IDs only from `packages/contracts/types/src/models.json`; pricing renders the canonical ladder (Basic $8/₹399 present; `team`/`pro_plus`/`Plus`/`Hobby` absent).

## Anti-patterns

- Adding a BYOK key field or Local-mode toggle to Web (forbidden — cloud-only surface).
- Silently routing Local/BYOK chats into `.../sync` or presenting them as cloud rows.
- Renaming `proxy.ts` to `middleware.ts`, or removing the exported `proxy` function.
- Hardcoding or inventing model IDs instead of reading `packages/contracts/types/src/models.json`.
- Shipping removed tiers (`Plus`, `pro_plus`, `Hobby`) or a consumer `Team` plan; inventing Pro/Max INR prices; adding credit top-ups.
- Referencing Supabase; claiming a capability "shipped" without a real repo path; re-adding a waitlist gate for signed-in Managed-Cloud access.
