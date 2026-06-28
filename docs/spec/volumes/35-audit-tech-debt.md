# Volume 35 — Implementation Audit & Tech Debt

Status: Canonical · program volume (depth of Master Spec Vol 35)
Authority: `docs/strategy/03-code-reality-and-tech-debt.md`, `docs/agent-context/known-flaws.md`, `docs/agent-context/risk-map.json`. The risk register (R1–R17) and verdict below summarize `strategy/03`; that doc holds the per-line evidence.

## Philosophy & Cloud/Local stance

Two things must be held at once, and both are in `strategy/03`.

First, **the codebase is not "AI slop."** The audit rates it **~80–85% real / ~15–20% honestly-deferred-or-gated**, with **genuinely deceptive theater under ~5% and almost none user-reachable**. ~618K LOC first-party TS/Rust; **6,782 Rust test functions** + **824 TS/TSX test files**; **zero** `expect(true).toBe(true)` hollow tests; **zero** `unimplemented!()`/`todo!()` panics in non-test Rust (gaps return graceful `Err(...)`). Stubs are labeled stubs, scripted demos labeled scripted, empty endpoints return empty (not fabricated) data, and the team has _deleted_ fabricated data (Math.random heatmaps, fake latency curves). Treat this as the starting position: a working multi-surface product, not a pile to rewrite.

Second, **audits are triage queues, not remediation.** A generated audit/report markdown is evidence, never a fix. The only thing that closes a finding is patched production code or an explicitly recorded, evidenced blocker (Master Spec Operating Law 4; CLAUDE.md critical rules).

Cloud/Local stance: the highest-severity debt is concentrated at the **trust boundary** (R1–R3) because privacy _is_ the product — a Local leak is existential, not cosmetic. Cloud peripherals (billing-history UI, SCIM) are honest stubs and lower severity. Fix the trust-boundary tier first, always.

## Binding rules

1. **Audits are triage queues.** Do not treat audit/report `.md` as remediation. Open the cited source file, confirm the issue in implementation, patch the production path when safe, and only then summarize. Record unfixed items as concrete, evidenced blockers in `known-flaws.md`/`risk-map.json`.
2. **Fix R1–R3 before any public scale or any security/compliance claim.** They are the trust-boundary tier; each is cheap and existential.
3. **No theater, ever.** No fake tests, swallowed mock assertions, fabricated data, dead controls, or production stubs that masquerade as complete (Operating Law 5).
4. **Every honest stub gets an owner + date, or an explicit "won't build."** Labeled stubs are good engineering but become permanent debt if untracked (`strategy/03` §4 theme 3).
5. **A capability cannot enter marketing until its parity-matrix row is `Present`.** This is the recurring debt class — public copy outrunning shipped scope (`strategy/03` §4 theme 2; Vol 34).
6. **Don't chase ghosts.** Several TODO items are already fixed or over-stated (F07/F08/F09/F10/F04 below). Verify a finding against current code before working it; update the ledger when reality is better than the ledger says.

## Repository map / authority docs

- The verdict + register: `docs/strategy/03-code-reality-and-tech-debt.md`.
- Live ledgers (source of truth for status): `docs/agent-context/known-flaws.md`, `docs/agent-context/risk-map.json`.
- Surface-specific debt anchors: per the register, `apps/web/db/neon/0014_security.sql` (R1), `apps/mobile/lib/pinning.ts` (R2), `risk-map.json` `BYOK-RUST-EGRESS-01` (R3), desktop `edit_excel.rs`/`edit_word.rs` (R4), mobile vision/translate services (R5/R6), desktop research `agents.rs` (R8).
- Guardrails: `pnpm check:llm-failures` (+ `:staged`, `:strict`), `check:tls-pins`, `check:boundaries`, `check:agent-context`.

## Competitor notes

The incumbents pay a continuous **trust & safety tax** (prompt-injection program, classifiers, continuous vuln patching — `strategy/01` §4) that AGI must also budget for the moment an agent touches a browser or the OS (Chrome/computer-use surfaces). AGI's diligence advantage is the **self-auditing culture itself**: `known-flaws.md`, `risk-map.json`, and the F01–F24 ledger are assets most startups cannot show (`strategy/02` §4, `03` §6). Do not lose that by letting audits rot into unactioned markdown.

## Risk register R1–R17 (severity-ranked; evidence + fix in `strategy/03` §2)

### Tier 1 — fix before public scale / any security or compliance claim

- [ ] **R1 (HIGH)** Audit-log tampering: `app_rls` can UPDATE/DELETE audit rows (`0014_security.sql`; `AUDIT-IMMUT-01`). Apply append-only migration (REVOKE + trigger/partition); verify in Neon.
- [ ] **R2 (HIGH→MED)** Mobile TLS pinning unprovisioned/disabled for all 5 prod hosts (`pinning.ts`, `PINNING_ENFORCED=false`). Provision real SPKI pins + enable; `check:tls-pins` green.
- [ ] **R3 (MED, latent)** Rust-transport egress not covered by the JS egress guard (`BYOK-RUST-EGRESS-01`; `SyncManager` dormant). Keep gated; if `SyncManager` is ever wired it MUST be privacy-mode-gated. Watch forever.

### Tier 2 — real feature gaps that limit "parity" claims

- [ ] **R4 (MED)** Office-doc _editing_ ~50% stubbed (creation works) — finish ops or scope claim to "create + limited edit."
- [ ] **R5 (MED)** Mobile "vision/Image Q&A" is OCR-only — ship a real on-device VL model or relabel as OCR.
- [ ] **R6 (MED)** "60+ language translation" is en↔hi only — align marketing to shipped scope.
- [ ] **R7 (MED)** iOS Apple Foundation Models (advertised Tier 1) is a stub (`isAvailable=false`) — implement or drop from the tier list.
- [ ] **R8 (MED)** Research email/calendar agents stubbed — wire to connectors or hide (web/document/memory research are real).
- [ ] **R9 (MED)** Cross-platform speech gaps (local Whisper STT; non-mac TTS) — fill or document platform support honestly.
- [ ] **R10 (LOW-MED)** Web billing-history UI returns `[]` pending endpoints — build endpoints.
- [ ] **R11 (LOW-MED)** Enterprise SCIM/directory-sync not implemented — required before enterprise sales (Vol 37).

### Tier 3 — hygiene + honestly-labeled deferrals

- [ ] **R12 (LOW)** Desktop `CodeModeHome.tsx` orphaned (exported, never mounted) — mount with real data or delete.
- [ ] **R13 (LOW)** Dead Vite/Netlify image/video leftovers — delete unreachable dead code.
- [ ] **R14 (LOW)** CLI SDK-mode flags accepted but bail — implement or remove from `--help`.
- [ ] **R15 (LOW)** `/api/messaging/stats/[platform]` returns hardcoded zeros — delete or build.
- [ ] **R16 (LOW)** Mobile Settings "Skills"/"Plugins" dead-end — gate or build.
- [ ] **R17 (LOW)** Chrome/VS Code sign-in vs. API-key copy drift — align copy to reality.

### Do-not-chase (ledger stricter than reality — update the ledger)

- [ ] **F08** desktop `RateLimitState` panic — false (registered at `lib.rs:406`).
- [ ] **F09** web compliance overclaims — remediated (pages hedge "Planned"/"In progress").
- [ ] **F07** mobile dispatch accepts unsigned — fixed (HMAC-SHA-256/HKDF/nonce-replay).
- [ ] **F10** dead sidebar search button — false for current code (`WebSidebar.tsx:337` wired).
- [ ] **F04** AgiChatDemo "live" overclaim — not theater (self-labeled "preview · example").

### Structural tech-debt themes (pay down systematically)

- [ ] **Surface drift** — six surfaces re-implement chat/model-select/settings. Push logic into `packages/`/`crates/` so behavior is defined once.
- [ ] **Marketing-vs-reality drift** — gate copy to `Present` rows; wire a claims-vs-parity check.
- [ ] **Stubs that never finish** — assign owner + date or "won't build" to every Tier-2/3 stub.
- [ ] **Dead code from prior stacks** — sweep Vite/Netlify leftovers and orphaned components.

## Definition of Done

A finding is "done" only when the cited production path is patched and verified (typecheck/clippy + targeted test + surface check + trust-boundary tests where relevant), or an explicit, evidenced blocker is recorded in `known-flaws.md`/`risk-map.json` with an owner. Tier 1 (R1–R3) must be green before any public-scale or compliance claim. The audit/report markdown that surfaced the finding is closed only after code changes or a recorded blocker — never on its own.

## Anti-patterns

- Treating a generated audit/report `.md` as the fix ("remediation by document").
- Marking work complete on build success alone (Operating Law 4).
- Letting a labeled stub live untracked until it becomes permanent.
- Chasing a ledger ghost (F07/F08/F09/F10/F04) instead of verifying current code first.
- Shipping marketing for a `Partial`/`Missing` capability.
- Under-selling the codebase as "slop" — it is ~80–85% real; that framing costs you in diligence and over-cuts in refactors.
