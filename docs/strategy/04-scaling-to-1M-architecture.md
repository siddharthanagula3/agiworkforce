# Scaling Architecture — From Today to 1M Users

Status: Strategy analysis (not source-of-truth)
Owner: Platform lead
Last updated: 2026-06-27
Companion docs: `06-fundraising-and-financial-plan.md`, `docs/current/technical-architecture.md`

This answers "what would it take to build this for 1 million users from this point?" It is a systems-design doc plus a cost model plus four architecture decision records (ADRs). It assumes the trust-mode model from your source-of-truth is non-negotiable.

The key framing: **most of your scaling problem is other people's problem.** Because Local and BYOK push inference (the dominant cost and the hardest-to-scale component) onto the user's device or the user's provider account, AGI's own backend only has to scale for **Managed Cloud** users. That is a structural advantage — design around it deliberately.

---

## 1. What "1M users" actually means here

"1M users" is not one number. Define it by trust mode, because each mode has a radically different backend cost:

| Population               | What AGI's backend must do                                                  | Marginal cost to AGI                              |
| ------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------- |
| 1M **Local Mode** users  | Auth (optional), updates, telemetry (opt-in). No inference.                 | ~$0 inference; cents/user infra                   |
| 1M **BYOK** users        | Same as Local + key management UX. Inference billed to the user's provider. | ~$0 inference; cents/user infra                   |
| 1M **Managed Cloud** MAU | Auth + metering + inference proxy + sync + storage + abuse                  | **$27K–$2.3M / month inference** (see §4) + infra |

**Plan for a mix.** A realistic 1M-MAU product might be, say, 600K Local/BYOK + 400K Managed. Your inference bill scales only with the Managed slice and with engagement — not with headline user count. This is the single most important number to model honestly (`06`).

---

## 2. Current architecture (verified from the repo)

- **Clients:** Web (Next.js on Vercel), Desktop (Tauri v2 + Rust), Mobile (Expo/RN), CLI (Rust), two extensions. Thin clients over shared `packages/` (TS) and `crates/` (Rust).
- **Backend:** `services/api-gateway` (route-based: streaming provider proxy, credits, sync, worker assignment, MCP, enterprise) + `services/signaling-server`. Real SSE streaming (`providerStream.ts:218-232`).
- **Data:** Neon Postgres (44 migrations, RLS-oriented schema) is canonical (`apps/web/db/neon`).
- **Inference:** for Managed, the gateway proxies to 15 providers; for Local/BYOK, the client talks to local runtime or the user's provider directly.

This is a sound shape. The scaling work is hardening and capacity, not a rewrite.

---

## 3. The bottlenecks between here and 1M (ranked)

1. **The inference proxy (Managed Cloud).** Every Managed token flows through `api-gateway`. At scale this is a long-lived-streaming-connection problem (thousands of concurrent SSE streams), a provider-rate-limit problem (you share quota across all users against each provider), and a cost-attribution problem (metering must be exact — see R-billing below).
2. **Postgres as the single source of truth.** Neon scales well but conversation history + sync + metering write-amplify. Hot paths (message append, usage events) need careful indexing, connection pooling, and eventually read replicas / partitioning.
3. **Sync fan-out.** Cross-device sync (Web/Desktop/Mobile app chats) via the signaling server is a fan-out and conflict-resolution problem. The P2 sync engine (referenced in your TODO) is the gating dependency for several features — get its data model right once.
4. **Credit/billing reconciliation.** Your own `BILL-01` flags agentic-credit reconciliation as a revenue-leak risk at scale. Metering that under-bills or double-spends on retries is an existential margin bug when inference is your COGS.
5. **Rate-limit + abuse at the edge.** 1M users includes abusers. The gateway needs per-user, per-IP, per-provider throttling and fraud detection before Managed opens wide.
6. **Provider reliability.** With 15 providers, provider outages are routine, not exceptional. Routing must fail over and degrade gracefully (this is also a product feature — multi-provider resilience).

---

## 4. The cost model (order of magnitude)

Cost to serve **1M Managed-Cloud MAU**, from the funding research (assumptions: 20–100 queries/user/mo, ~1.5–4K input + 0.5–1K output tokens/query):

| Scenario    | Model tier         | Monthly inference |
| ----------- | ------------------ | ----------------- |
| Light usage | budget/open models | **~$27K**         |
| Light usage | frontier           | **~$205K**        |
| Heavy usage | budget/open models | **~$310K**        |
| Heavy usage | frontier           | **~$2.3M**        |

That is **~$0.03 to $2.30 per active Managed user per month** — a ~75× spread driven by engagement and model tier, _not_ by provider choice. Three consequences:

- **Routing is a margin lever, not just UX.** Your `auto-economy`/`auto-balanced`/`auto-premium` tiers directly control COGS. Defaulting casual queries to cheap/open models is the difference between $27K and $2.3M.
- **Caching is free money.** Prompt caching (0.1× input on hits) and batch (50% off) materially cut the bill. Bake them into the gateway by default.
- **Inference prices are falling ~50×/year for fixed capability** (Epoch AI). Today's expensive query is next year's cheap one — but the _frontier floor_ stays ~$1–5/MTok, so premium stays premium.

**Infra (non-inference) at 1M users** is comparatively modest: Postgres (Neon scale tier), Vercel/edge, object storage for artifacts/files, observability. Budget low-hundreds-of-thousands/year, dwarfed by the Managed inference line if engagement is high.

---

## 5. Target architecture for 1M users

Keep the shape; harden these layers.

**Edge / gateway.** Put the inference proxy behind an autoscaling, stream-aware tier (the gateway already does SSE). Add: per-user/per-IP/per-provider rate limiting; a circuit breaker per provider; request hedging/failover across providers; a global request ID for tracing every token to a usage event. Keep credentials out of client reach (server-side provider keys for Managed; user keys never transit AGI servers for BYOK).

**Routing service.** Promote routing to a first-class service: capability-aware (only offer tools a provider supports), cost-aware (respect the economy/balanced/premium tier), health-aware (route around degraded providers), and trust-aware (never silently cross Local→BYOK→Managed). This is both your differentiator and your margin control.

**Data tier.** Neon as canonical OLTP. Add read replicas for history/search reads; partition high-volume tables (`messages`, `usage_events`) by time or tenant; move analytics off the OLTP path. Enforce RLS everywhere (already the pattern). Make `security_audit_logs` append-only (R1 in `03`).

**Sync engine.** One conflict-resolution model (CRDT-style or version-vector) for app-chat sync across Web/Desktop/Mobile, scoped strictly to the app-chat boundary (CLI/VSC/Chrome stay workspace/task-scoped per source-of-truth). Get this right once; many features depend on it.

**Metering & billing.** Exactly-once usage accounting: idempotent debit on retries/partial runs, reserve-then-settle (you already do reserve-then-refund), and a periodic drift audit between `usage_events`/metering and `credit_transactions` (your `BILL-01`). This must land before Managed agentic billing opens at scale.

**Storage.** Object storage for artifacts/generated files with TTL/retention, checksums, per-trust-mode isolation (contracts already exist). The sandbox renderer pattern (cross-origin iframe) is the right isolation primitive — keep it.

**Abuse/fraud.** Signup fraud, payment fraud, prompt-abuse, and scraping defenses at the edge before Managed opens. This is a launch gate for the revenue engine, not a nice-to-have.

**Observability.** OpenTelemetry end-to-end (you already emit `gen_ai.*` attributes). SLOs per surface; alerting on provider error rates, stream stalls, metering drift, and trust-boundary violations.

---

## 6. Four ADRs

### ADR-1 — One shared agent runtime, not six

**Decision:** Consolidate the agent loop, tool execution, MCP client, and permission/policy engine into shared `crates/` + `packages/`, consumed by all surfaces.
**Why:** `03` shows surface drift is the top structural debt; `01` shows both incumbents win by building the runtime once. **Status:** partially true today (strong CLI + desktop loops); make it the explicit target. **Consequence:** slower per-surface feature velocity short-term, far higher reliability and lower maintenance at scale.

### ADR-2 — Routing is a service and a margin control

**Decision:** Treat provider routing as a standalone, testable service governing capability/cost/health/trust.
**Why:** it is simultaneously the multi-provider differentiator and the lever that turns a $2.3M bill into a $200K bill. **Consequence:** must be observable and load-tested; provider-contract tests (`03`) protect it.

### ADR-3 — Keep Local/BYOK as the default cost sink

**Decision:** Architect so the _cheapest path for AGI_ (Local/BYOK, ~$0 inference cost to you) is also a first-class, encouraged product path — not a second-class fallback.
**Why:** it is both the privacy differentiator and the reason your backend cost stays sub-linear to user count. **Consequence:** invest in local-runtime UX and BYOK ergonomics; resist the temptation to push everyone to Managed for revenue (it inverts your cost advantage — see `05`).

### ADR-4 — Managed Cloud is gated by safety controls, not by waitlist

**Decision:** Per your 2026-06-27 founder decision, Managed is open by default; the controls (metering exactness, abuse/fraud, refund/chargeback, retention/deletion) must _keep pace_ with usage and act as the real gates.
**Why:** waitlists slow growth; unmetered/abusable Managed burns founder money. **Consequence:** R1/R-billing and abuse defenses are launch-critical; the env kill-switch stays for incident response only.

---

## 7. Reliability targets (proposed, pre-scale)

| Metric                                 | Target at 1M                            |
| -------------------------------------- | --------------------------------------- |
| Chat send → first token (Managed, p95) | < 2.5 s                                 |
| Stream completion success rate         | > 99.5%                                 |
| Gateway availability                   | 99.9% monthly                           |
| Metering accuracy (usage vs. billed)   | > 99.99%, drift-audited daily           |
| Trust-boundary violations              | **0** (hard gate; any is a P0 incident) |
| Provider failover time                 | < 1 request, transparent to user        |

---

## 8. The honest engineering reality

You do **not** need OpenAI/Anthropic-scale infrastructure to serve 1M users, because you are not training models and most of your users cost you ~$0 in inference. What you need is: a hardened streaming gateway, exact metering, a correct sync engine, real abuse defenses, and the discipline to keep logic in the shared runtime. That is a **small-team-achievable** scope (it is mostly hardening what exists), with one caveat: if Managed Cloud engagement is high and defaults to frontier models, the inference bill — not the engineering — becomes the constraint. Control it with routing defaults, caching, and the Local/BYOK cost sink.
