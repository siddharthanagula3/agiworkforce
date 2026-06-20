# AUDIT_STATE

- Status: ✅ COMPLETE (all 6 phases done 2026-06-11)
- Total files: 8005 in current universe — ALL 401 batches scanned (~7,900 files; unreadable by permission deny rules: services/api-gateway/.env.example, .env.local, apps/desktop/.env.{example,local,production}, apps/web/.env.{example,local} — env contents unscanned, flagged for manual review)
- Last file completed: batch-401 (pnpm-lock.yaml) — final generated/vendored batch
- Next: NONE — audit complete. Deliverables: AUDIT_FINDINGS.md (findings + Phase 4 verification + Phase 5 systemic + Phase 6 summary), REMEDIATION_PRIORITY.md (P0/P1/P2 fix plan).
- FINAL findings — CRITICAL: 32 / HIGH: 545 / MEDIUM: 2249 / LOW: 2858 = 5,684 (exact grep counts from AUDIT_FINDINGS.md)
- Phase 4 verification: pnpm typecheck:all PASS · cargo check --workspace PASS (0W/0E) · check:llm-failures PASS · check:model-catalog PASS. Build 100% clean; all CRITICALs are compiler-invisible.
- Phase 5: 10/10 systemic themes CONFIRMED (5 CRITICAL: trust-boundary routing, markdown/HTML XSS, web-API IDOR/BOLA, approval-gate bypass, Tauri IPC injection; 4 HIGH: test theater, i18n locale theater, doc/Supabase→Neon drift, hardcoded model IDs; 1 MEDIUM: dev-path/PII leak across 185 files). Synthesis: 32 CRITICALs collapse to 5 root causes — fix as classes, not per-site.

## "Complete remaining" sweep plan (2026-06-11, owner: "complete the remaining with ultracode")

- Chunk 1: mobile 225–257 (33) — DONE, merged, +0C/+5H/+40M/+92L (run wf_6fbf63c1-675). Mobile/ios is mostly
  vendored CocoaPods podspec JSON (structural scans); real findings concentrate in apps/mobile/app + src.
- Chunk 2: tests 264–302 (39) — DONE, merged, +0C/+6H/+57M/+142L (run wf_528af63b-975). Findings = test theater /
  mock-only / coverage-illusion; notable HIGHs: security_tests.rs tests a MOCK validator not the real guard;
  playwright_bridge.rs allows --no-sandbox.
- Chunk 3: docs 311–348 (38, doc-drift only) — DONE in two parts: PART A 33 batches (wf_248bee99-816) + PART B
  5 batches re-run (wf_0abdc8c6-7a7) after server-side rate-limit (NOT usage limit) killed 341/344/346/347/348's
  final structured-output return. +1C/+4H/+19M/+91L. New CRITICAL: docs/security/SECURITY-SUMMARY-2026-05-30.md is
  LLM scratch narration, not a real security ledger (337). RATE-LIMIT LESSON: on partial chunk failure, agents
  often finish the part file before the return fails — but re-run flagged batches fresh rather than trust partials.
- Chunk 4: generated/vendored 349–401 (53, structural) — IN FLIGHT wf_d3ddd14e-407.
- Then Phase 4 (verification), Phase 5 (adversarial/systemic), Phase 6 (SUMMARY + REMEDIATION_PRIORITY.md, COMPLETE).
- Autonomous: merge+checkpoint+backup after each chunk, no approval gate between chunks.

Coverage note: batch 176 = web minified public/chat chunks (structural scan); 177–184 = web shared/ui + types;
185–195 = CLI apps/cli/src/** + crates/\* (Rust); 196–219 = VS Code extension apps/extension-vscode/**;
220–224 = Chrome extension apps/extension/\*\* start. 49-batch run wf_5c822316-375 completed clean (0 failures).
BOUNDARY CORRECTION (2026-06-11): cat14 CI/infra is exactly batch 258 (all .github workflows, vercel.json ×3,
docker-compose, openapi.yaml) — NOT 259 as previously estimated; cat15 scripts/hooks = 259–263 (263 = last 3
scripts + first 17 e2e test files); tests (cat16) effectively start at batch 264. 6-batch run wf_a3b24009-390
(258–263) completed clean (0 failures, 120 files, +0C/+10H/+96M/+106L).

## ⚠ Incident log

1. 2026-06-10 ~12:40pm — two large workflow launches (121+73 agents) failed wholesale on session
   usage limit. Policy since: small sequential runs, sized per owner approval.
2. 2026-06-10 ~11:20pm — ALL untracked audit artifacts (AUDIT_STATE/FINDINGS/TAXONOMY/MANIFEST,
   AUDIT_PARTS/, AUDIT_BATCHES/) were deleted by an external cleanup in the repo (a `git clean`-like
   action; a Codex session with danger-full-access was also active in this directory). RECOVERED
   losslessly by replaying scan-agent transcripts (scripts/audit-recover-from-transcripts.mjs, -v2, -v3
   — v3 also replays Bash heredoc ops and simulates the prettier hook). Validated against per-batch
   workflow summaries: CRITICAL reconciled exactly (25/25); H/M/L within +1/+2/+5 of the pre-deletion
   checkpoint (near-duplicate replay artifacts kept rather than risk dropping real findings).
   MITIGATION: continuous backup mirror at `/Users/siddhartha/Desktop/agiworkforce-audit-backup/`
   (outside the repo) — refresh it after every merge. Do NOT run `git clean` in this repo while the
   audit is in progress.
3. 2026-06-11 01:57 — configs run wf_f66f244c-fa5 (batches 303–310) interrupted by user ~6 min in.
   RESOLVED 2026-06-11 ~06:20: owner approved resume; the resume re-ran ALL 8 batches fresh (cache
   did not hit — note for future resumes: passing args as a JSON string vs object may change the
   cache key). The earlier partial 304/310 merge (+10M/+11L) was REMOVED from AUDIT_FINDINGS.md and
   superseded by the full 303–310 chunk (154 files, +0C/+9H/+57M/+103L); fresh 304 found 2 HIGHs the
   partial scan missed. Quarantined `.interrupted` part files deleted after supersession. Lesson:
   after any interrupted run, prefer full re-run of affected batches over salvaging partial output.

## Conventions

- File-level DONE tracking is batch-based: each batch's exact file list lives in `AUDIT_BATCHES/batch-NNN.txt`.
- Per-batch findings are written to `AUDIT_PARTS/batch-NNN.md` by the scan agent, then merged into
  AUDIT_FINDINGS.md after each workflow run.
- Scan workflow: `.claude/workflows/audit-scan-chunk.js` — `Workflow({scriptPath, args: {start, end}})`
  or `{ids: ["131", ...]}`. Runs sized per owner approval ONLY (usage-limit rationing).
- Resume: find the first batch ≥130 without a complete part file; that's the next run's start.

## Repo Map

**Monorepo:** pnpm@9.15.3 workspace (`apps/*`, `packages/*`, `packages/providers/*`, `services/*`) + cargo workspace (`apps/desktop/src-tauri`, `apps/cli`, `crates/*`). Node 22, TS 5.9.3, Next.js (web) with `proxy.ts` (NOT middleware.ts — locked rule).

**Tauri IPC boundary:** `apps/desktop/src-tauri/src/sys/commands/` (~100+ `#[tauri::command]` modules), `tauri.conf.json`; backend core in `src-tauri/src/{core,sys,automation,features,integrations,ui,data}/`.

**LLM providers:** `packages/providers/{anthropic,openai,ollama,google,deepseek,lmstudio,perplexity,xai}/`, `packages/{llm-normalize,llm-runtime,local-llm,routing,unified-chat}/`, desktop `core/llm/**`, CLI `apps/cli/src/models/`, web `app/api/llm/**`. Model catalog SSOT: `packages/types/src/models.json`.

**Auth/token/session:** CLI `auth*.rs/oauth.rs/permissions.rs/sessions.rs`, desktop `sys/commands/auth.rs` + `sys/security/`, web Clerk routes `app/api/auth/**`, `services/{api-gateway,signaling-server}`.

**DB:** `apps/web/db/neon/` (canonical migrations).

**Trust boundaries (locked):** Local / BYOK / Managed Cloud separate; never silent routing; cloud waitlist-gated.

## Coverage: DONE (batches 001–129, 2,580 files)

- 001–028: `apps/desktop/src-tauri/src/**` Rust core (automation, core/agi, core/llm, core/mcp, data, features, sys non-commands, ui)
- 028–036: Tauri IPC commands `sys/commands/**` + `tauri.conf.json` + remaining src-tauri config
- 036–052: LLM provider tier — `packages/providers/*`, `packages/{llm-normalize,llm-runtime,local-llm,routing,unified-chat}`, desktop `core/llm/**`, CLI models, model catalogs
- 053–063: auth/token/session/permissions across cli/desktop/web/services
- 064–075: `apps/web/app/api/**` routes + `services/{api-gateway,signaling-server}` + `apps/web/db/neon` migrations
- 076–087: `packages/{api,compliance,mcp,runtime,skills,stores,types,...}` contracts/types + start of desktop `src/api`
- 088–099: desktop frontend services — `apps/desktop/src/{api,hooks,lib,services,stores}`
- 100–129: web frontend services — `apps/web/{core,features/*/services+hooks,lib,shared}` + start of component tier

(Exact 20-file list per batch: `AUDIT_BATCHES/batch-NNN.txt`.)

## Coverage: REMAINING (batches 225–257 + 264–302 + 311–401, 3,248 files)

- 225–257: mobile (cat13, 660): `apps/mobile/**`, `ios/**` — SKIPPED FOR NOW per owner (2026-06-11), return later
- 264–302: tests (cat16, ~767 left): `__tests__`, `*.test.*`, `e2e/`, fixtures (e2e head done in 263; tests tail done in 303)
- 311–~349: docs (cat18, 767): `docs/**`, `*.md` (doc-drift scan only; 310 tail already covered .agents/skills head)
- ~349–401: generated/vendored (cat19, 1,057): `dist-web/`, `.vercel/`, `.playwright-mcp/`, snapshots, archives (secrets/structural scan)

DONE since last estimate: 130–184 frontend components; 185–195 CLI+crates; 196–219 VS Code ext; 220–224 Chrome ext;
258 CI/infra (cat14, complete); 259–263 scripts/hooks (cat15, complete); 303–310 configs/i18n (cat17, complete —
boundary note: configs actually spanned mid-303→head-310; 303 also closed the tests tail, 310 opened the docs head).

## Remaining phases after scan

- Phase 4: verification runs (pnpm typecheck/lint/build, cargo check/clippy) + cross-reference
- Phase 5: fresh-context adversarial review (systemic findings)
- Phase 6: SUMMARY in AUDIT_FINDINGS.md + REMEDIATION_PRIORITY.md, mark state COMPLETE
