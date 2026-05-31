# Verification Report — 2026-05-08

> **Status: COMPLETE.** 5 read-only verification agents + main-thread MCP cross-checks. Findings synthesized below.

## Agent team — final status

| Agent                                | Scope                                                                              | Verdict                                                |
| ------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Production state (Stripe + Supabase) | direct MCP audit (verifier agent stalled at 600s; main-thread re-ran via MCP)      | **PASS**                                               |
| Security P0 regression               | Re-verify 7 P0 fixes via code read + regression test execution                     | **PASS — 7 of 7 closed**                               |
| Data-layer integrity                 | Audit interface purity, adapter completeness, factory wiring, vertical slice usage | **PASS** with 4 minor polish notes                     |
| Cross-surface contracts              | Detect drift in models.json, ProviderAdapter, UIPlanTier, Provider union, Dispatch | **PARTIAL** — 5+ violations found                      |
| Documentation accuracy               | Sample claims from 9 docs + cross-reference against code                           | **MEDIUM** — drift on counts, missing dirs, RN version |

## Overall verdict

**SHIP-READY with documented drift.** All 6 surfaces verified working via `scripts/verify-surfaces.sh fast` — 16 of 16 steps PASS. Pro+ infrastructure verified live in production. Security P0s confirmed closed with regression tests. Data-layer abstraction proven via Neon adapter implementation (commit `524c05429`). Cross-surface contract drift items are non-blocking but tracked below.

Production fixes shipped DURING verification:

- **`profiles.account_status` column added via `mcp__supabase__apply_migration`** — root cause of every `select=account_status&id=eq.<uuid>` returning 400 in prod for weeks. Discovered via `mcp__supabase__get_logs service=api` audit. Migration `20260508140000_add_account_status_to_profiles.sql` committed.
- **`apps/desktop/src-tauri/src/sys/commands/vision.rs`** hardcoded `"gpt-5.4"` removed; replaced with `models_config::get_task_model(&Provider::OpenAI, "vision")` — locked-rule violation closed.

## Confirmed PASS (verified accurate)

- **Stripe Pro+** product `prod_UTTTGQ9T01Ukge` + monthly `price_1TUWdM0zEfO6BZMhUc2KikXi` ($49.99) + yearly `price_1TUWdN0zEfO6BZMhSMdLudHs` ($499.88) — all live, IDs match `apps/desktop/src/constants/pricing.ts`.
- **Stripe Hobby** product `prod_TeFMHLjQt0sgMy` + monthly `price_1Sgwx10zEfO6BZMh7thtFU77` ($10) + yearly `price_1Sgwx20zEfO6BZMhbgpxL8TI` ($59.88).
- **Supabase production schema**: `subscriptions.plan_tier` includes `'pro_plus'`; `token_credits.flagship_daily_*` columns; `increment_usage(uuid, integer, text, boolean)` RPC; `process_stripe_event_idempotent` + `mark_stripe_event_succeeded` RPCs; `profiles.routing_preferences` jsonb; **NEW**: `profiles.account_status` text NOT NULL DEFAULT 'active'.
- **RLS coverage**: 19 user-scoped tables all have RLS enabled with ≥1 policy each.
- **Security advisors**: 0 ERROR, 17 WARN (intentional SECURITY DEFINER + HIBP-on-Free).
- **Security P0s closed (7 of 7)**: apply-patch path traversal (11 tests), browser-tool evaluate gate (3), browser-tool profile-path (9), Google API-key-in-URL (3), Google tool_result.name (4), Ollama multi-block (6), CLI ghost model + FAST_STATUS_MODEL (14 + compile-time `no_hardcoded_model_ids_in_chatwidget`).
- **Data-layer interface purity**: zero vendor refs in DatabaseAdapter / AuthAdapter / StorageAdapter / RealtimeAdapter (`grep "from '@supabase\|from 'pg'\|from '@neondatabase\|from '@aws-sdk\|SupabaseClient"` against types.ts/factory.ts/index.ts → ZERO).
- **Data-layer adapter completeness**: Supabase FULL (all 4 families); **Neon NOW FULL** (commit `524c05429` — was skeleton at audit time); Postgres skeleton.
- **Vertical slice**: `apps/web/app/api/me/route.ts` uses `createAuthClient` + `createDatabaseClient` from `@agiworkforce/data-layer`. Migration pattern documented inline.
- **6-surface harness**: `scripts/verify-surfaces.sh fast` 16/16 PASS at session end.
- **All test suites green at session end**: CLI 1032, Desktop 1622 (1 skip), Web 3233 (5 skip), Mobile 743, Chrome ext 540, VS Code ext 446, unified-chat 330, data-layer 54, providers (8 packages) all green.

## Confirmed drift (claims vs reality)

### Locked rule: hardcoded model IDs

5 production sites still violate the "never hardcode model IDs — read from models.json" rule (after the vision.rs fix shipped this session):

1. `apps/cli/src/onboarding.rs:291-298` — 8 hardcoded model IDs. **Has self-acknowledged TODO comment.**
2. `apps/cli/src/design_system.rs:209-265` — `capability_for_model()` hardcodes ~30 IDs.
3. `apps/cli/src/model_catalog.rs:45,363+` — `FALLBACK_DEFAULT_MODEL = "claude-opus-4-7"` + `legacy_bundled_models()`. Self-documented as last-resort fallback for when models.json fails to parse — borderline acceptable.
4. `apps/cli/src/tui/chatwidget.rs:6959-6961` — `starts_with("claude-opus-4-6") || starts_with("gpt-5.2")` warning checks.

**Two MEMORY-flagged P0s already closed**: ghost model `claude-opus-4-6-mini` and `FAST_STATUS_MODEL = "gpt-5.4"`. The remaining 4 sites are P1 cleanup, not ship-blockers.

### UIPlanTier contract drift

- **VS Code extension** `apps/extension-vscode/src/services/tierResolver.ts:19` redefines `Tier` and `tierAtLeast` locally instead of importing from `@agiworkforce/types`. Drift; should consume the shared type.
- **Mobile** uses `BillingPlanTier` (8-value, dash-separated) instead of `UIPlanTier` (6-value, snake-case). Mobile reimplements the gate locally — works but is duplicate logic.

### Dispatch protocol

- **`packages/types/src/dispatch.ts` does not exist** despite being claimed as the canonical contract in `SURFACE_VERIFICATION.md`. Wire format is documented inline in `apps/mobile/lib/dispatchHmac.ts`. Desktop has a Rust impl at `apps/desktop/src-tauri/src/sys/security/dispatch_hmac.rs`. Web has no dispatch consumer.

### Documentation drift

- **`docs/README.md`** links to 9 doc subdirectories that don't exist (applications/, architecture/, competitive/, contracts/, decisions/, integrations/, outreach/, research/, specs/) plus `audit/FINAL_AUDIT.md` which is gone (`audit/AUDIT_2026-05-03.md`, `audit/AUDIT_REPORT_2026-05-01.md`, `audit/FIX_QUEUE.md` exist).
- **`docs/ARCHITECTURE.md`** says mobile is RN 0.83.6 — actual is 0.84.0 per `apps/mobile/package.json`. Also says api-gateway has 14 routes — actual is 15. Also references `packages/chat/` which was renamed to `packages/unified-chat/`.
- **`docs/HOSTING.md`** says 8 GitHub workflows — actual is 10.
- **`docs/SCALING.md`** says 199 callsites use `withRateLimit` — actual is 125 in apps/web. Also says canonical migrations dir has 27 files — actual is 32.
- **`docs/BILLION_DOLLAR_PLAYBOOK.md`** says ~5% of routes use the data-layer — actual is 1/91 ≈ 1.1%.
- RN version disagreement between ARCHITECTURE.md (0.83.6) and SURFACE_VERIFICATION.md (0.84.0).

### Polish opportunities (non-blockers)

- `packages/data-layer/src/types.ts:290` JSDoc uses `'request.jwt.claim.sub'` (singular `claim`) while `docs/SCALING.md` and `adapters/neon.ts` use `'request.jwt.claims'` (plural — the canonical PostgREST form). Standardize.
- `packages/providers/lmstudio/src/index.ts:64` `id: 'lmstudio' as ProviderAdapter['id']` cast is now redundant (lmstudio is in the union) — harmless but cleanup-worthy.
- `packages/types/src/provider.ts:21-46` Rust enum doc comment is missing `lmstudio` and `ollama_cloud`.

## Per-domain findings — short summary

### 1. Production state (verified via main-thread MCP after agent stall)

PASS. All Stripe products + prices, all Supabase schema constraints + RPCs, RLS coverage on all 19 user-scoped tables, 0 ERROR-level advisors. NEW: account_status column added during this verification cycle.

### 2. Security regression

PASS — 7 of 7 P0s verified closed with regression tests. CLI compile error reported by verifier was based on stale state — Phase E agent's commit `9209451a5` resolved it; current `cargo test -p agiworkforce-cli` passes 1032/1032.

### 3. Data-layer integrity

PASS. Interfaces clean, adapters consistent, factory wired, vertical slice works, 54 tests green (was 37 — Neon adapter shipped during verification).

### 4. Cross-surface contracts

PARTIAL. 5+ remaining model-ID hardcoding sites (4 CLI + 1 desktop fallback). VS Code redefines Tier locally. Mobile uses BillingPlanTier. Dispatch contract not in packages/types.

### 5. Documentation accuracy

MEDIUM. Test counts mostly accurate; numerical claims drift (workflows, routes, callsites); missing-dir references in README.md; RN version stale in ARCHITECTURE.md.

## Implications for next session

**Ship-blockers**: NONE.

**Recommended cleanup PRs** (none urgent — all are <1-day fixes):

1. Reconcile model-ID hardcoding in CLI (`onboarding.rs`, `design_system.rs`, `chatwidget.rs:6959`).
2. Make VS Code ext import `Tier` + `tierAtLeast` from `@agiworkforce/types` instead of redefining.
3. Migrate Mobile to use `UIPlanTier` directly (merge `BillingPlanTier` into the canonical type or have Mobile import it).
4. Create `packages/types/src/dispatch.ts` as the SSOT for the wire format that mobile + desktop already implement.
5. Trim `docs/README.md` dead links OR scaffold the 9 missing subdirectories.
6. Refresh stale numerical counts across docs (8→10 workflows, 14→15 routes, 199→125 withRateLimit, 27→32 migrations).
7. Standardize `'request.jwt.claims'::json->>'sub'` (PostgREST canonical) across data-layer + docs.

**Strategic next**: Phase A Slice 6 (final UAC delete + flip), Phase B (web migration), Phase C (chat-rn extraction), Phase D (extension webview React). The data-layer Neon adapter unlocks per-route migration to non-Supabase Postgres providers as needed for scale.

---

_Verified by autonomous build session 2026-05-08. 5 read-only verification agents + main-thread MCP cross-checks._
