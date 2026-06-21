# P1 — Local↔Cloud↔BYOK Separation Enforcement — 2026-06-20

Status: Current
Owner: Founder + platform lead
Spec: `docs/current/trust-mode-surface-matrix.md`

Per-surface compliance audit (6 agents vs the matrix, adversarially verified) + fixes for the confirmed live violations. Grounded in real Claude architecture (claude-code-guide: subscription+API-key coexist with precedence; Claude syncs web+mobile but not desktop; coding-agent history stays local).

## Audit result

| Surface | Verdict |
|---|---|
| **Mobile** | ✅ Compliant — Local + Cloud only, no live BYOK (FEATURES.byokKeys=false; only vestigial DirectByok labels), local/cloud stores physically separated, cloud wired to shared store. |
| **Chrome** | ✅ Compliant — cloud-only via bridge; chats separate. |
| **Web** | ✅ Live chat is cloud-only (all keys server-env; v2 route rejects Local/DirectByok provider modes). The 4 raw hits are **vestigial dead modules** (local/BYOK provider entry not reachable by live chat) — recommend deleting; not live violations. |
| **Desktop** | ❌ 3 live violations (fixed below). |
| **CLI** | ❌ 1 live violation (fixed below). |
| **VS Code** | ❌ 1 low mislabel (noted; see deferred). |

## Fixed — verified (cargo check, typecheck, router tests 79 incl. new trust-boundary test, CLI cargo check)

| # | Sev | Surface | Fix |
|---|-----|---------|-----|
| 1/3 | **critical/high** | desktop | Added `local_only` to `RouterPreferences`, derived from `active_mode` in `build_router_preferences`, and `candidates()` now hard-excludes `Provider::ManagedCloud` when set (both the explicit-provider early-return and the main path). A pure-Local chat can no longer receive a ManagedCloud candidate via prefer_cloud_credits, context, strategy, or the fallback loop. New regression test `local_only_excludes_managed_cloud_candidate`. (`llm_router.rs`, `send_message_setup.rs` + 16 internal construction sites set `local_only:false` = no behavior change.) |
| 2 | **critical** | desktop | BYOK was routed through AGI Managed Cloud: `preferCloudCredits: activeMode === 'cloud'` is true for both byok+managed. Changed to `selectPrivacyMode(...) === 'managed'` so BYOK goes direct-to-provider, never billed/routed through AGI cloud (mirrors the canonical `features/chat/index.tsx` logic). (`TauriRuntime.ts`) |
| 4 | **high** | cli | `/btw` side-query (`send_btw`) skipped the Local→cloud guard that `send()` runs. Added `self.validate_privacy_boundary()?;` as the first statement. (`chat.rs`) |

## Deferred / noted

- **VS Code #5 (low)** — `usageMeter` labels an unbounded-source model "Local model" while routing is cloud-only. This is really a symptom of **VS Code local mode being unimplemented** (matrix says VS Code should have local + BYOK + subscription). Fold the label fix into building real VS Code local support, not a speculative relabel.
- **Web vestigial cleanup** — delete the dead local/BYOK modules under `apps/web` (provider-entry code unreachable by live chat) so they can't be accidentally re-enabled. Founder decision: delete vs leave dormant.
- **Mobile note (not a violation)** — `lib/pinning.ts` lists `api.openai.com`/`api.anthropic.com` as pinnable hosts (inert; `PINNING_ENFORCED=false`, no direct fetch). If mobile must stay permanently no-BYOK, ensure those never become live routing targets.
- **Internal agent paths** — the 16 internal `RouterPreferences` sites (agi planner/executors, computer-use, vision) default `local_only:false`. For full local-mode integrity during a Local-mode *agent* run, thread the session trust mode into these too (follow-up).
