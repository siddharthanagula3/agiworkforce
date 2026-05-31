# Cloud Alpha + Remediation — Resolution Plan

Status: PROPOSED (awaiting founder approval to begin Phase 0)
Owner: Platform / founder
Last updated: 2026-05-30
Supersedes for cloud posture: the "managed cloud = waitlist only" lock (founder authorized canon update — see Phase 8).

This plan exists because the founder asked to align fully (no contradictions) before resolving. The Q&A below
is the single point of truth. **Primary goal: make the alpha cloud work like a finished SaaS without breaking
any working app.** Audit fixes follow in later non-breaking waves.

---

## 1. Aligned decisions (single source of truth — from Q&A 2026-05-30)

| #                    | Decision            | Answer                                                                                                                   |
| -------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Product              | What we're building | A polished ChatGPT/Claude-style **SaaS**: invite code → sign up/sign in → use like a finished product                    |
| Funding              | Who pays for tokens | **Both** — managed **free-tier** by default (founder-funded via free provider tiers, ~$0), **BYOK** as the overflow path |
| Scope                | One product or two  | **Build both now** (managed free-tier alpha + BYOK)                                                                      |
| Money                | Stripe during alpha | **Test-mode only** (no real charges)                                                                                     |
| Mobile               | Cloud + sync        | **Yes** — flip mobile auth on, build real cross-device sync                                                              |
| Backend              | Auth + DB           | **Keep Clerk + Neon** (NOT Supabase — "Supabase keys" was loose wording; do not reintroduce)                             |
| Sequence             | Priority order      | **Cloud-first & surgical**; audit fixes after, non-breaking                                                              |
| Secrets              | Handling            | **Founder places** in git-ignored `.env.local` + host dashboard; I wire references to named env vars only                |
| Surfaces             | Where cloud lives   | **web + desktop + mobile** (consumer); CLI/VS Code/Chrome stay BYOK-local                                                |
| OAuth                | Purpose             | **Both** — social login (Google/GitHub via Clerk) + provider-OAuth for BYOK onboarding                                   |
| Free-tier exhaustion | Behavior            | **Hard stop + prompt to add BYOK key** (guarantees $0 to founder)                                                        |
| Deploy               | Safety              | **Feature branch only**; founder deploys + verifies (Vercel); prod untouched                                             |
| Providers/caps       | Who sets            | I **propose defaults**, founder adjusts                                                                                  |
| Canon                | Override authorized | **Yes** — update source-of-truth / CLAUDE / AGENTS to the new posture                                                    |
| Execution            | Who implements      | I implement everything, wave-by-wave, with verification + checkpoints                                                    |

## 2. Non-negotiable constraints (apply on every step)

1. **Do not let any app go down.** Apps are at the verge of completion and work today. Changes are additive,
   feature-flagged, and reversible. No deletion of working code or cloud backend.
2. **Understand before acting.** Phase 0 is read-only comprehension; no edits until the wiring map is proven.
3. **Secrets never enter git or chat.** I reference `process.env.X`; founder sets values. `.env.example`
   documents names only. (Audit already flagged a plaintext service-role key for rotation — same discipline.)
4. **Feature branch only.** I never push to prod; founder controls deploy/verify on Vercel.
5. **Trust boundaries hold** (local / byok / cloud_managed separate); **key-first BYOK + visible provider label**.
6. **Verify each change**: typecheck + targeted tests + repo guardrail gates (`pnpm check:*`); founder does
   hands-on UX testing (no simulator/browser driving by me).

## 3. Grounding — what already exists (verified Phase-0 spot-check, 2026-05-30)

The cloud is ~half-built; this is finishing, not greenfield:

- `services/api-gateway/src/middleware/managedComputeGate.ts` — entitlement gate, fails closed (exists).
- `apps/web/lib/services/credit-service.ts` — `getBalance / reserveCredits / deductCredits / refundReservation / getUsage` (ledger surface exists; audit found pre-call reservation not invoked in the chat path — the gap to close).
- `apps/web/lib/services/invite-service.ts` — `redeemInviteCode / validateInviteCode / createInviteCode / listInviteCodes` (exists; UI `InviteCodeModal` is built but UNWIRED per audit — wire it).
- `apps/web/app/api/chat/conversations/route.ts` + `[id]/` — Neon `web_conversations` API (the canonical sync target).
- `apps/mobile/lib/v1FeatureFlags.ts` — `FEATURES = { v1LocalOnly:true, cloudChat:false, auth:false, byokKeys:false, crossDeviceSync:false }` (the flags to flip for mobile cloud).
- Confirmed: Clerk middleware in `apps/web/proxy.ts`; 32 Neon migrations in `apps/web/db/neon/`; Supabase = 0 live usage.

## 4. Phased plan (cloud-first; each phase = its own branch checkpoint)

### Phase 0 — Understand the cloud path (READ-ONLY, no edits)

Deep-read end-to-end and produce `docs/plans/cloud-alpha-wiring-map.md`: auth (Clerk) → invite gate → managed
routing → metering/credit reservation → free-tier provider selection → hard-stop → BYOK overflow → sync. List
exactly what's built, half-built, missing. **Founder checkpoint before any code.**

### Phase 1 — Secrets + config contract (no real secrets in repo)

Define env var names (free-tier provider keys, Clerk social, provider-OAuth, Stripe test); update `.env.example`
(names only) for web/desktop/mobile; write `docs/plans/cloud-alpha-env-setup.md` telling founder exactly which
vars to set where (`.env.local` + Vercel). Founder fills values.

### Phase 2 — Auth + invite gate (the "sign up like a real product" feel)

Clerk social login (Google/GitHub); wire the existing `InviteCodeModal` → `redeemInviteCode`; seat cap +
allowlist so only invited testers get managed access. Provider-OAuth scaffolding for BYOK onboarding.

### Phase 3 — Managed free-tier routing + hard-stop metering (the $0 guarantee)

Route managed requests to free-tier providers (defaults in §5); finish pre-call `reserveCredits` →
`deductCredits` in the chat path; per-user usage cap; **hard stop at limit → "add your own key (BYOK)" prompt**.
This directly closes audit finding P0-DOCSVSIMPL-001 (controls present but not enforced).

### Phase 4 — BYOK overflow (real key entry + key-first routing)

Real BYOK key entry + secure storage on web (currently marketing-only) + desktop + mobile; implement the
**byok-route P0 fix** (key-first: use stored BYOK key when present; managed_cloud only as fallback) + a
**visible provider label** on every reply. Closes P0-DESKTOP-001.

### Phase 5 — Cross-device sync (make "chats follow you" true)

Unify web + desktop + mobile on the Neon `web_conversations`/`web_messages` schema; wire desktop + mobile to the
cloud conversations API; flip mobile `auth`/`crossDeviceSync` flags on. Closes P0-WEB-001.

### Phase 6 — Stripe test-mode + honest billing UI

Wire Stripe in **test mode** end-to-end; billing UI shows accurate states (test/alpha), not a live paywall.
Resolves the billing-overpromise findings without taking real money.

### Phase 7 — Cloud-data compliance (real user data now in Neon)

Wire **delete-account** (currently a dead Rust command / missing UI), data export, and a retention/deletion
policy. Basic duty of care + diligence once testers' chats live in the cloud.

### Phase 8 — Canon update (founder-authorized)

Rewrite `docs/current/source-of-truth.md`, `CLAUDE.md`, `AGENTS.md` to the new posture: managed cloud ships in
invite-gated, free-tier-capped, hard-stop alpha + BYOK overflow; sync real; mobile cloud on; Stripe test-mode.
Keeps docs and code in agreement (no new drift).

### Phase 9+ — Audit remediation waves (AFTER cloud works, non-breaking)

Security P0s (`has_full_disk_read_access` always-true, certs.rs TOCTOU, mobile biometric fail-open, master-pw
lockout, rotate the flagged Supabase key) → P1 dead-UI/mock → P2 dedup/reuse/doc-drift. Each wave: branch,
guardrail gates, founder checkpoint.

## 5. PROPOSED defaults (founder adjusts — Phase 1)

- **Free managed providers** (verify against `models.json` in Phase 0): Groq (Llama-class, fast/generous free) +
  Google Gemini flash-free as primary; DeepSeek/OpenRouter-free as backups.
- **Caps**: 50 alpha seats; per-user 25 messages/day or ~50k tokens/day, whichever first; hard-stop → BYOK.
- **Model UX**: a curated "Auto (free)" default so it feels finished; full catalog unlocked on BYOK.

## 6. Verification model

Per change: `pnpm typecheck:all` (or surface typecheck) + targeted tests + relevant `pnpm check:*` gates +
`cargo check` where Rust. Heavy/e2e runs in CI/Vercel preview. Founder does manual UX verification. No
build-success-only sign-off (per repo rule).

## 7. How the working apps stay up (break-safety)

- Everything additive + behind feature flags (`FEATURES.*`, entitlement checks) defaulting to current behavior
  until explicitly enabled.
- No edits that change a passing surface's existing path without a test proving parity.
- Guardrail gates run before each checkpoint; any red = stop.
- Feature branch; founder promotes to prod.

## 8. Founder to provide (when Phase 1 starts)

- Free-tier LLM provider keys (Groq/Gemini/etc.) → `.env.local` + Vercel env (names I'll specify).
- Clerk social-login + provider-OAuth credentials.
- Stripe **test-mode** keys.
- Adjusted cap numbers (or accept §5 defaults).
- Deploy/verify ownership on Vercel.

## 9. Open items to confirm at Phase 0 checkpoint

- Exact free providers/models available in `models.json` (validate §5 defaults).
- Whether desktop/mobile BYOK key entry reuses the same secure-store path as existing CLI/desktop BYOK.
- Provider-OAuth scope per provider (which providers actually support OAuth vs key-only).
