# AGI Workforce — Full Audit Index (COMPLETE)

Status: ✅ AUDIT COMPLETE (all 13 audits + synthesis). READ-ONLY — **no application code changed.**
Master tracker so the audit survives a context summary / session restart.
Final deliverable: **audit/CROSS-SURFACE-SYNTHESIS.md** (5 P0 · 7 P1 · 12+ P2; exec summary, scoreboard,
waves, founder decision). 21 report files, ~514 KB total.

## DECISION LOG

- **2026-05-30 — byok-route fix (P0-DESKTOP-001):** Founder asked for a RESEARCHED recommendation (did NOT
  pick an option yet). Recommendation delivered: **(c) key-first + always-visible provider label** (see
  research below). Awaiting founder's final pick. Fix target: `apps/desktop/src/features/chat/ChatInputArea.tsx:524-527,1051-1054`
  - send path; PRESERVE managed-cloud backend.
- **Remediation: NOT authorized.** Founder chose **"Report only — stop here."** No code changes. All 21
  audit files are the deliverable; founder will triage/assign fixes. Resume only on explicit go-ahead.

### byok-route recommendation — research basis (2026-05-30, web-researched)

Recommended fix = **(c) key-first routing + always-visible provider label**. Market norm is "user key first,
managed credits as a _disclosed_ fallback":

- Warp: "always prioritizes your API keys first, only uses Warp credits when necessary."
- LiteLLM / Inworld gateways: client key takes precedence; fallback is labeled (`credential_type:"system"`).
- Cursor is the lone subscription-precedence case, but it BLOCKS + discloses (never silently bills your sub).
- GDPR/trust: silent provider substitution breaks "which provider processed this request" accountability
  (CSO Online Gemini incident; DigitalApplied AI data-residency 2026). Label closes that gap.
  Concrete (when authorized): at ChatInputArea.tsx:524-527 & 1051-1054 →
  `hasByokKey(selectedProvider) ? selectedProvider : (isManagedPlan ? 'managed_cloud' : selectedProvider)`

* per-message provider badge from resolved provider. PRESERVE managed-cloud backend. Founder pick still open.

Method per audit: multi-agent Workflow → Map/Hunt → adversarial Verify (default-to-refute, **quote real
code**) → Synthesize (report + honesty ledger). Lesson baked in after I once hallucinated a "refutation"
of byok-route: every load-bearing claim must quote real code, cross-checked. Prior repo audits fed in &
re-verified: `docs/visual-verification/functional-audit-2026-05-22.md`, `docs/audit/*`, `docs/agent-context/known-flaws.md`.

## Surface audits — DONE, persisted to audit/honesty/

| Surface | File               | Findings | Verified C/P/R | Trust boundary                                         | Standout                                                     |
| ------- | ------------------ | -------- | -------------- | ------------------------------------------------------ | ------------------------------------------------------------ |
| desktop | honesty/desktop.md | ~22      | byok + 18      | ⚠️ **silent BYOK→managed_cloud (CRITICAL)**            | live Stripe UI; cosmetic capability toggles; dead v3 sidebar |
| web     | honesty/web.md     | 38       | 11/4/0         | ⚠️ **cross-surface sync broken**; /byok marketing-only | hardcoded model-name fallback routing                        |
| mobile  | honesty/mobile.md  | 43       | 1/0/0          | ✅ clean (remoteChatGate fail-closed verified)         | dead cross-device-sync code                                  |
| cli     | honesty/cli.md     | 35       | 9/1/6          | ✅ clean — Local fail-closed proven                    | refuted 6 stale claims (all 32 hooks fire)                   |
| chrome  | honesty/chrome.md  | 57       | 13/3/0         | ✅ clean — no-LLM-in-extension verified                | strong security posture                                      |
| vscode  | honesty/vscode.md  | 54       | 1/0/2          | ✅ clean                                               | 9–10 dead commands (contributed, never registered)           |

## Cross-cutting audits — status

| Audit                                   | Task ID   | Status                  | Output                              |
| --------------------------------------- | --------- | ----------------------- | ----------------------------------- |
| Code-quality (cats 2–6)                 | weeyb6zox | ✅ DONE (25 · 8C/1P/1R) | audit/codequality.md                |
| Supply-chain · security · MCP (1,7,8,9) | w5g2o6g5k | ⏳ running              | audit/supplychain-security-mcp.md   |
| Crates deep — v1 WRONG names            | widy3jvlj | ⚠️ partial/superseded   | audit/crates-PARTIAL-wrong-names.md |
| Crates deep — v2 CORRECT 17 dirs        | wwo88d31h | ⏳ running              | audit/crates.md                     |
| Docs-vs-implementation                  | wn3ty59vw | ⏳ running              | audit/docs-vs-impl.md               |
| Clerk-auth + Neon-DB completeness       | w59x3f96u | ⏳ running              | audit/clerk-neon-completeness.md    |
| Supabase hunt (18 agents)               | wt4r8z9dc | ⏳ running              | audit/supabase-hunt.md              |

Stopped accidental duplicates: wzqjl3qe4, w8hugtc77, w5vo788k1.

## Confirmed CRITICALs so far

- **desktop:** silent BYOK→managed_cloud at `ChatInputArea.tsx:524-527` & `:1051-1054` → traced through Rust
  `send_message.rs`/`provider_access.rs`/`llm_router.rs`; bypasses BYOK key, no consent/label.
- **web:** cross-surface chat sync broken — web `web_conversations`/`web_messages` (Neon) vs desktop
  `conversations`/`messages` (SQLite); mobile gated off. "chats follow you across devices" implied, false.
- **codequality:** `packages/data-layer/src/adapters/postgres.ts` — selectable provider, all methods throw
  `NotImplementedError` → `AGI_DATABASE_PROVIDER=postgres` constructs OK then fails on first query.
- **crates v1 (re-verify in v2):** `crates/agiworkforce-protocol/src/protocol.rs:1243-1245`
  `SandboxPolicy::has_full_disk_read_access()` returns `true` for ALL variants — security boundary lies.

## Cross-surface patterns (high-value signal — confirm in final synthesis)

1. Cross-surface chat sync broken at DB layer (web/desktop different tables; mobile off).
2. Hardcoded model fallbacks recur: desktop `'GPT-5.1 Instant'`; web `includes('gpt-')` routing; crates
   scattered `gpt-5*`/`claude-*` literals. models.json / protocol presets are SSOT.
3. Cloud-billing overpromise: desktop live Stripe; web /byok marketing-only. Rule: gate/hide UI, NEVER delete cloud backend.
4. Dead/unregistered UI: desktop v3 sidebar; vscode 9–10 commands.
5. Trust boundary BREAKS on desktop (byok) + web (sync); HOLDS on cli/chrome/mobile (verified).
6. Two divergent provider-adapter codebases (web `lib/llm-providers` vs `packages/providers`); legacy vs
   canonical sandbox-policy (crates).

## Environment facts (for supply-chain / supabase audits)

- Scanners AVAILABLE: cargo audit, pnpm, npm. MISSING (report install cmd, don't install): semgrep, gitleaks,
  trufflehog, cargo-deny, osv-scanner, syft, license-checker.
- Manifests: 20 Cargo.toml, 145 package.json, 0 Python. Lockfiles: Cargo.lock, pnpm-lock.yaml.
- Secret-bearing files present (verify git-tracked!): `.env.local`, `.mcp.json`, `apps/desktop/.env.production`,
  `apps/mobile/.env`, `apps/web/.env.local`, `services/*/.env.example`, fixture legacy_mcp/.mcp.json.
- Supabase→Neon+Clerk migration: web confirmed Clerk+Neon; KNOWN leads to verify for remnants —
  `apps/desktop/src-tauri/src/data/supabase_sync.rs` (live or dead stub?), `apps/web/supabase/migrations/`
  vs `apps/web/db/neon/`, mobile `auth/store.ts` session shape, any `@supabase/*` deps in package.json.

## Real crate dirs (authoritative, from Cargo.toml) — 17

agiworkforce-{app-server, apply-patch, async-utils, command-registry, execpolicy, network-proxy,
plugin-runtime, protocol, task-runtime, utils-absolute-path, utils-cache, utils-home-dir, utils-image,
utils-rustls-provider, utils-string, utils-template}, sandbox-policy.

## Next steps (resume here if interrupted)

1. As each running workflow completes: `jq -r .result.report <task>.output` → its `audit/*.md`.
2. Re-verify the 6 cross-surface patterns + 4 confirmed criticals (don't trust single-agent claims).
3. Write **audit/CROSS-SURFACE-SYNTHESIS.md**: unified P0/P1/P2, recurring patterns, deadline plan
   (resolve root causes — merge duplicates into canonical impl, wire dead UI, gate overpromising cloud;
   PRESERVE cloud backend).
4. Founder decision before fixes: byok-route fix = (a) prefer stored BYOK key when present, or
   (b) managed-cloud-only + explicit consent + visible provider label?

---

## DOC CLEANUP EXECUTED (2026-05-30)

- **299 docs archived** via git mv → `docs/archive/2026-05-30/` (288 bulk + 11 detailed security), subpaths preserved, fully reversible. Restore guide in that dir's README.md.
- **Security corpus**: 12 red-team files → consolidated into `docs/security/SECURITY-SUMMARY-2026-05-30.md` (112 still-open of 229 re-verified; 11 detailed files archived; `auth-role-...` pattern doc kept). ⚠️ Stamped a correction: red-team CRIT-1 "rename proxy.ts→middleware.ts" is REFUTED (Next.js 16 uses proxy.ts by design); Supabase-referencing findings are N/A (Supabase removed).
- **Kept in place**: docs/current, docs/agent-context, root control docs, full new audit/ suite, neon migrations, security summary.
- **Throwaway** `audit/consolidated/sources/` copies removed (originals archived).
- **Validation**: check:repo-organization, agent-context, doc-status, report-retention, readme-ownership, codeowners, structure-conventions, boundaries — ALL PASS. git status = 299 renames (R), 0 unexpected deletes.
- Manifest: `audit/consolidated/DOC-CLEANUP-MANIFEST.md`. Register: `audit/consolidated/MASTER-AUDIT-REGISTER.md`.
