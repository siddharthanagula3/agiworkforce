# Public-Alpha Cutover Runbook (private beta → public alpha)

Status: Active · founder decision 2026-06-28
Owner: Founder
Decision: **Web + Mobile managed cloud go public alpha now. Desktop cloud is a fast-follow** — wire it to the same shared backend as web (DESK-CLOUD below), then flip its copy. Until DESK-CLOUD verifies, desktop shows honest interim copy (PA-3), never "available." Desktop keeps Local + BYOK throughout. Resolves DESK-CLOUD-COPY-01.

Why desktop is a fast-follow, not "never": the Rust `ERR_CLOUD_NOT_IMPLEMENTED` in `cloud.rs:42` is an orphaned placeholder (no caller); cloud was always meant to go through the web API boundary. Streaming is already shared (`packages/llm-runtime`) and desktop already has Cloud-mode plumbing + auth + egress guard, so desktop cloud ≈ web cloud. The only missing piece is the persistence client (web-only today).
Companion: `docs/spec/AGI_CODE_MASTER_SPEC.md` (invariants), `11-execution-playbook.md` (loop), `03` (risks).

Guardrail (non-negotiable): never claim a surface's managed cloud is "available" where its runtime doesn't serve. Copy ≤ shipped scope. The kill-switch `AGI_MANAGED_COMPUTE_PRIVATE_BETA` stays as the instant rollback.

## Current state (verified 2026-06-28)

- Gate is already kill-switch/open-by-default: `apps/web/lib/managed-compute-gate.ts`, `services/api-gateway/src/middleware/managedComputeGate.ts`. (`apps/web/test/setup.ts` forces `=1` — test-only, leave it.)
- Mobile cloud chat **already enabled**: `apps/mobile/lib/v1FeatureFlags.ts` `cloudChat: true`; gated by entitlement (`access`) in `apps/mobile/services/remoteChatGate.ts`. Copy/comments still say invite/waitlist.
- Desktop cloud **not implemented**: `apps/desktop/src-tauri/src/sys/commands/chat/cloud.rs:42`.
- Extension gate **inverted/stale**: `apps/extension/src/features/computer-use/cloudAgentClient.ts` still requires `=1` to enable.
- Waitlist/invite copy scattered across ~24 web pages + extension + desktop.

---

## Agent increments (PA-1…PA-5) — code/copy, executed + verified + committed by the overnight agent

| ID       | Goal                                                             | Files                                                                                                                                                                                                                                                                                                                                                                      | Acceptance / verify                                                                                                                                                                                              |
| -------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PA-1** | Web managed cloud → public alpha; retire the cloud waitlist path | `features/chat/components/dialogs/CloudUpgradeWaitlistDialog.tsx` → sign-in/upgrade (no waitlist); `app/api/waitlist/cloud-managed/route.ts` (retire or repurpose to interest-list, not a gate); `lib/services/waitlistServiceClient.ts`; `features/chat/pages/WebChatPage.tsx` wiring; confirm `lib/managed-compute-gate.ts` grants signed-in entitled users (no invite). | Signed-in user starts a managed-cloud chat with no invite; no "private beta/waitlist" copy for managed cloud; `pnpm --filter @agiworkforce/web typecheck && test` green; Playwright cloud-chat flow green        |
| **PA-2** | Mobile managed cloud → public alpha (code flag already on)       | grant `access`/entitlement to signed-in users in the cloud-gate path (`services/remoteChatGate.ts` + entitlement source); update `lib/v1FeatureFlags.ts` comments + all UI copy from invite/waitlist → public alpha                                                                                                                                                        | Signed-in user gets cloud chat; Local Mode still fails closed (never auto-sends); copy = public alpha; `pnpm --filter @agiworkforce/mobile typecheck && test` + Detox green                                      |
| **PA-3** | Desktop cloud → honest "coming soon"                             | `features/cloud-bridge/InviteCodeModal.tsx`, `features/auth/{AuthPage,AuthForm}.tsx`, `features/chat/Sidebar.tsx`, `features/settings/tabs/{General,Account}/index.tsx`, `constants/pricing.ts`, `App.tsx`                                                                                                                                                                 | Desktop shows "AGI Cloud is available on Web & Mobile — desktop coming soon"; no UI path reaches `ERR_CLOUD_NOT_IMPLEMENTED`; Local + BYOK unaffected; `typecheck` + smoke green. **Closes DESK-CLOUD-COPY-01.** |
| **PA-4** | Extension gate → kill-switch model                               | `apps/extension/src/features/computer-use/cloudAgentClient.ts` (remove "requires `=1`" inversion); `features/cloud-bridge/InviteCodeModal.ts`, `lib/waitlistService.ts` copy                                                                                                                                                                                               | extension cloud path open by default; gate only when kill-switch on; `pnpm --filter @agiworkforce/extension test` green                                                                                          |
| **PA-5** | Consistency sweep + doc truth                                    | grep all surfaces; align remaining marketing pages; fix the mobile invite-vs-open self-contradiction in `docs/current/source-of-truth.md`; update parity matrix                                                                                                                                                                                                            | `grep -ri "private beta\|invite-only\|waitlist"` returns nothing tied to managed cloud (interest-list copy ok); claims-vs-parity check passes; commit                                                            |

Run them PA-1 → PA-5 via the loop in `11`: study → edit → verify (typecheck/lint/tests/e2e/trust-boundary) → commit on `feat/agi-alpha` → update `PORTING-TRACKER.md`.

---

## Founder steps (credentials required — not doable headless)

1. **Vercel (web + any separately-hosted api-gateway):**
   - `vercel env ls` — if `AGI_MANAGED_COMPUTE_PRIVATE_BETA` is `1/true/on` in Production, `vercel env rm AGI_MANAGED_COMPUTE_PRIVATE_BETA production` (or set `0`). Leave it documented as the kill-switch.
   - After PA-1 merges: `vercel --prod` (or let CI deploy).
2. **Neon:** usually nothing for the flag. Verify the entitlement check grants managed access to any signed-in subscriber (not an invite list); if a DB table gates access by invite, stop gating on it (no schema change needed otherwise).
3. **Mobile public-alpha build (after PA-2):** `pnpm --filter @agiworkforce/mobile release:ios:beta:submit` and `release:android:beta:submit` → TestFlight/Play internal → promote to public alpha (`release:ios:prod:submit`, `release:android:prod:submit`). Needs Apple/Google credentials + privacy labels.
4. **Verify live:** sign in on web (no invite) → start a managed-cloud chat → confirms public alpha. Desktop shows "coming soon," Local/BYOK work.

## DESK-CLOUD — fast-follow: desktop cloud on the shared backend (then flip desktop copy)

Goal: desktop Cloud mode uses the **same backend as web** (the "one logical cloud" invariant), so desktop managed cloud is genuinely public alpha. Local + BYOK stay on the Rust runtime untouched.

Grounded scope (verified 2026-06-28):

- Cloud **streaming** already shared — `packages/llm-runtime` (gateway/retry/history). Reuse as-is.
- Cloud **persistence** is web-only — `apps/web/features/chat/hooks/use-chat-persistence.ts` → relative `/api/chat/conversations*`. This is the piece to share.
- Rust `apps/desktop/src-tauri/src/sys/commands/chat/cloud.rs:42` is an orphaned placeholder — cloud goes via the web API boundary, not Rust.
- Desktop already has Cloud-mode plumbing + Clerk auth (`features/auth`) + `lib/egressGuard.ts`.

Increments (agent-executable; verify + commit each):
| ID | Goal | Acceptance / verify |
|---|---|---|
| **DCL-1** | Extract the cloud chat persistence client from `apps/web/features/chat/hooks/use-chat-persistence.ts` into a shared package (`packages/unified-chat` or `packages/api`) with a configurable base URL (relative for web, absolute for desktop). Web refactored to use it (no behavior change). | web typecheck+test green; web cloud chat unchanged; no duplicated logic |
| **DCL-2** | Wire desktop Cloud mode to the shared persistence client + streaming, using the Clerk session token and an absolute base URL (agiworkforce.com / api-gateway). Local + BYOK still route to the Rust runtime. | signed-in desktop user starts a managed-cloud chat that persists via the shared backend |
| **DCL-3** | Trust boundary: extend `lib/egressGuard.ts` to allow the cloud API host **only in Cloud mode**; Local never reaches it; add/extend egress contract test. Repurpose/remove the orphaned Rust placeholder (document that local-runtime cloud persistence is intentionally absent). | egress test green: Local emits no non-local calls; Cloud reaches only the allowed host |
| **DCL-4** | Cross-surface proof + copy flip: a managed-cloud chat created on desktop appears on web (one logical cloud). Replace desktop "coming soon" (PA-3) copy with public alpha. | desktop↔web continuity verified; `typecheck` + `cargo test` + Playwright/smoke + signed-build smoke green; no overclaim |

Sequencing: ship Web + Mobile public alpha now (PA-1/PA-2); run DCL-1→DCL-4 as the immediate fast-follow; desktop copy flips only when DCL-4 verifies. Moderate scope (shared-client extraction + wiring + egress + signed-build verify), not a blocker for the web/mobile flip.

## Rollback

Set `AGI_MANAGED_COMPUTE_PRIVATE_BETA=1` (Vercel + api-gateway) and redeploy — instantly re-gates managed cloud without code changes.

## Definition of done

Web + Mobile: signed-in users use managed cloud with no invite; copy says public alpha; gates green. Desktop: honest "coming soon," no path to the not-implemented error. No "private beta/invite-only/waitlist" copy remains for managed cloud on any surface. Kill-switch verified working.
