# AUDIT_STATE

- Status: IN_PROGRESS
- Total files: 7865 (AUDIT_MANIFEST.txt, built 2026-06-10 with the exact Phase-0 find command)
- Files scanned: 2578 (batches 001–129 DONE, merged; batch-070 read 19/20 — services/api-gateway/.env.example denied by tool permissions, noted as coverage gap)
- Last file completed: last file of batch-129
- Next file to start: first file of batch-130
- Findings so far — CRITICAL: 25 / HIGH: 431 / MEDIUM: 1689 / LOW: 1721 (exact grep counts from merged AUDIT_FINDINGS.md)

⏸ AWAITING OWNER APPROVAL (2026-06-10 evening). Batches 001–129 done and merged; nothing in
flight. Owner is rationing usage limits: launch runs ONLY on explicit approval, sized per owner
instruction (last approved size: 30 batches). RESUME with:
`Workflow({scriptPath: ".claude/workflows/audit-scan-chunk.js", args: {start: 130, end: <approved>}})`
then merge each run into AUDIT_FINDINGS.md and update this file. 265 batches remain (130–394).
batch-097 note: agent died returning summary but part file IS complete on disk — never re-run it.

## Conventions

- File-level DONE tracking is batch-based: each batch's exact file list lives in `AUDIT_BATCHES/batch-NNN.txt`.
  A batch marked DONE below means every file in that list was read and scanned.
- Per-batch findings are written immediately to `AUDIT_PARTS/batch-NNN.md` as they are found,
  then merged into `AUDIT_FINDINGS.md` after each workflow chunk.
- Resume: find the first batch not marked DONE; its first file is "Next file to start".

## Repo Map

**Monorepo:** pnpm@9.15.3 workspace (`apps/*`, `packages/*`, `packages/providers/*`, `services/*`) + cargo workspace (`apps/desktop/src-tauri`, `apps/cli`, `crates/*`). Node 22, TS 5.9.3, Next.js (web) with `proxy.ts` (NOT middleware.ts — locked rule).

**Surfaces (manifest file counts):** desktop 2491, web 1492, mobile 803, extension-vscode 613, cli 192, extension (Chrome MV3) 127, sandbox 4. Plus docs/ 580, packages/ 564, ios/ 163, crates/ 121, services/ 104, tasks/ 146, .agents/ 147 (vendored skill templates), .playwright-mcp/ 111 (generated).

**Tauri IPC boundary:**

- `apps/desktop/src-tauri/src/sys/commands/` — ~100+ command modules with `#[tauri::command]` (agent, api, auth, automation, background_llm, browser, cloud, code_execution, computer_use, connector_permissions, database, dispatch_hmac, settings, …)
- `apps/desktop/src-tauri/tauri.conf.json` + capabilities config
- Backend core: `src-tauri/src/{core,sys,automation,features,integrations,ui,data}/` — core/llm, core/mcp, core/agent, core/hooks, core/skills, core/orchestration

**LLM provider integrations:**

- TS: `packages/providers/{anthropic,openai,ollama,google,deepseek,lmstudio,perplexity,xai}/`, `packages/{llm-normalize,llm-runtime,local-llm,routing,unified-chat}/`
- Desktop Rust: `src-tauri/src/core/llm/` (provider_adapter.rs, providers/{azure,bedrock,ollama,managed_cloud_provider,direct_api_provider}.rs, models_config.rs), `sys/commands/{ollama,background_llm,chat/provider_access}.rs`
- CLI Rust: `apps/cli/src/{models/,local_models.rs}`
- Web: `apps/web/app/api/llm/v1/chat/completions/` (gateway), `apps/web/app/api/{chat,completion,models,byok}/`
- Model catalog SSOT: `packages/types/src/models.json` (generated from models.curation.json + models.synced.json via scripts/sync-models.mjs)

**Auth/token/session:**

- CLI: `apps/cli/src/{auth.rs,auth_oauth.rs,oauth.rs,permissions.rs,sessions.rs,mcp/{oauth_flow,oauth_store}.rs,platform/runtime/session*.rs}`
- Desktop: `src-tauri/src/sys/commands/auth.rs`, `automation/computer_use/{app_permissions,session}.rs`
- Web (Clerk): `apps/web/app/api/auth/{clear-token,desktop-token,device/approve,set-token,sso-check}/`, `app/auth/**`, `app/api/llm/v1/chat/completions/lib/auth-gate.ts`, `app/api/csrf/`, `app/share/[token]/`
- Services: `services/{api-gateway,signaling-server}/`

**DB:** `apps/web/db/neon/` (canonical migrations) + `apps/web/db/`.

**Trust boundaries (locked product rules):** Local / BYOK / Managed Cloud are separate; no silent routing between them; cloud is waitlist-gated.

**Manifest caveat:** the exact find command excludes `dist/` but not `dist-web/`, `.vercel/output/`, or `.playwright-mcp/` — those generated artifacts ARE in the manifest and are scanned (secrets/leak focus), categorized last.

## Batches

394 batches of 20 files (AUDIT_BATCHES/batch-001.txt … batch-394.txt), priority-ordered via
`scripts/audit-classify-manifest.mjs` → `AUDIT_MANIFEST_ORDERED.txt` (category TAB path).

Category sizes: cat1 tauri-rust-core=549, cat2 tauri-ipc/config=166, cat3 llm-providers=327,
cat4 auth/token/session=214, cat5 api-routes/services=198, cat6 db/migrations=23,
cat7 contracts/packages=222, cat8 frontend-services=544, cat9 frontend-components=1428,
cat10 cli+crates=218, cat11 vscode-ext=477, cat12 chrome-ext=82, cat13 mobile+ios=688,
cat14 ci/infra=23, cat15 scripts/hooks=79, cat16 tests=801, cat17 configs=134,
cat18 docs=767, cat19 generated/vendored=925.

Scan chunks (sequential workflows; each batch = one scan agent reading all 20 files fully):

- CHUNK A: batches 001–063 (Rust core, IPC, providers, auth) — DONE (merged; C16/H216/M872/L807 cumulative)
- CHUNK B: batches 064–184 (API routes, DB, contracts, frontend services+components) — PENDING (re-queued)
- CHUNK C: batches 185–257 (CLI, VS Code ext, Chrome ext, mobile) — PENDING (re-queued)
- CHUNK D: batches 258–394 (CI, scripts, tests, configs, docs, generated) — PENDING

PACING (2026-06-10, after session-limit incident): the 121-agent and 73-agent chunk launches at ~12:40pm
both failed wholesale — every agent returned "session limit, resets 1:20pm". Owner directed "take less
batches". New policy: SEQUENTIAL workflow runs of 12 batches each ({start,end} args), merge + state
update after every run, never more than one workflow in flight. Next run: 064–075.

Per-batch findings land in `AUDIT_PARTS/batch-NNN.md` immediately; merged into AUDIT_FINDINGS.md
after each chunk. A chunk marked DONE means every batch in it is scanned (failures re-run and noted).
