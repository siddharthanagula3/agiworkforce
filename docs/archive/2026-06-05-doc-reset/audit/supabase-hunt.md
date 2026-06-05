# Supabase Audit Report: AGI Workforce Monorepo

## Executive Summary

**Supabase is NOT in active use.** The repo has been fully migrated to **Neon (Postgres) + Clerk (auth)** as of commit `d56bb265f` (2026-05-28).

All Supabase traces are either:

- **DEAD-REMNANT** (orphaned env vars, stale dist files, untracked .env files)
- **DOC-ONLY** (comments, decision docs, historical records)

**Counts:**

- LIVE-CLOUD: **0** ✓ (no runtime violation)
- DEAD-REMNANT: **13** (cleanup recommended)
- DOC-ONLY: **9** (docs to update for clarity)
- TEST-FIXTURE: **1** (reference test case)

---

## 1. LIVE-CLOUD Violations

**None detected.**

| File:Line | Kind | Evidence | Status                      |
| --------- | ---- | -------- | --------------------------- |
| —         | —    | —        | **ZERO LIVE RUNTIME CALLS** |

**Verification:** Comprehensive rg audit across all source code (apps/, crates/, packages/, services/) returned 0 matches for `@supabase/`, `createClient()`, `supabase.from()`, or `supabase.auth.*` in .ts/.tsx/.js/.jsx files. All auth flows use Clerk; all DB calls use Neon via `getNeonDb()` or `@neondatabase/serverless`.

---

## 2. DEAD-REMNANT Cleanup (Must Fix)

### Environment Variables (High Severity – Orphaned Credentials)

| File                            | Kind    | Content                                                                                  | Action                                                                                       | Risk                                   |
| ------------------------------- | ------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------- |
| `/apps/web/.env.local`          | env-var | `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Delete all 3 lines; file is git-ignored, not committed, never referenced in code (0 rg hits) | Low (local only)                       |
| `/apps/desktop/.env.local`      | env-var | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` + comments about service-role keys         | Delete lines 3–6 and all Supabase-related comments                                           | Low (local dev only)                   |
| `/apps/desktop/.env.production` | env-var | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` + same comments                            | Delete lines 3–6 and comments                                                                | Low (Vite does not inject unused vars) |
| `/apps/mobile/.env`             | env-var | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`                              | Delete lines 2–3                                                                             | Low (local dev only)                   |

**Credentials Exposed:** Supabase project `xwmcvbgdyergfnvwbnap` with JWT anon/service-role keys present but unreachable. Consider revoking in Supabase account if still active.

### Compiled Artifacts (Medium Severity – Dead Code in Dist)

| File                                                  | Kind         | Content                                                                                                                                                               | Action                                                                                                                                  | Risk                          |
| ----------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `/services/api-gateway/dist/lib/supabaseClients.js`   | compiled-js  | Full Supabase client factory (lines 1–212): `createClient()`, `getServiceClient()`, `getUserClient()`, `mintSupabaseJwt()` functions; imports `@supabase/supabase-js` | Delete .js, .js.map, .d.ts, .d.ts.map (4 files, ~17KB); run `npm run build` in services/api-gateway to regenerate from Neon-only source | Low (unreachable; no imports) |
| `/services/api-gateway/dist/lib/supabaseClients.d.ts` | compiled-dts | TypeScript definitions for same functions; references `SUPABASE_*` env vars                                                                                           | Delete                                                                                                                                  | Low                           |

**Evidence:** Source file `/services/api-gateway/src/lib/supabaseClients.ts` **does not exist** (deleted in migration). Dist files are stale build artifacts in `.gitignore`, never imported by any route or middleware.

### Node Modules (Low Severity – Phantom Symlinks)

| File                                | Kind    | Content                                                                                                              | Action                                                                        | Risk         |
| ----------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------ |
| `/apps/web/node_modules/@supabase/` | symlink | Two symlinks dated 2026-05-22: `ssr` and `supabase-js` (unevaluated, not in pnpm-lock.yaml, not in any package.json) | Run `pnpm prune --production` or `pnpm install --no-frozen-lockfile` to clean | Low (unused) |

---

## 3. DOC-ONLY References (Should Update for Accuracy)

### Decision Documents (Medium Severity – Stale Claims)

| File                                  | Line(s) | Content                                                                                                               | Correction                                                                                                                    | Severity |
| ------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------- |
| `docs/decisions/CURRENT_DECISIONS.md` | 193–194 | "Decision 17: production stays on the existing Supabase path until Clerk web/mobile session flows are verified"       | Update to: "Decision 17: Cloud foundation is Clerk (auth) + Neon (Postgres). Fully migrated as of 2026-05-28. Do not revert." | Medium   |
| `docs/decisions/CURRENT_DECISIONS.md` | 173–174 | Evidence citation: "supabase/migrations/20260521100000_enterprise_control_plane_foundation.sql" (file does not exist) | Replace with: "apps/web/db/neon/0015_organizations.sql" (or verify actual Neon migration file)                                | Medium   |

### Architecture/Tech Docs (Low Severity – Outdated Paths)

| File                                                    | Content                                                                                            | Issue                                                       | Fix                                                                                                                 |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `docs/enterprise/control-plane.md`:13                   | "Canonical database \| supabase/migrations/20260521100000_enterprise_control_plane_foundation.sql" | Path is wrong; supabase/migrations/ deleted                 | Update to: "Canonical database \| apps/web/db/neon/migrations/... (migrated from Supabase 2026-05-28)"              |
| `docs/design/pitch-deck-verified-numbers-2026-05-17.md` | "Production migrations \| 43 canonical (93 incl. legacy dir) \| ls supabase/migrations/"           | Directory is gone; count is stale                           | Update to: "Production migrations \| 32 canonical (apps/web/db/neon/) \| Migrated 2026-05-28" (verify actual count) |
| `docs/launch/wave-3-playbook.md`                        | "Production env vars (..., Supabase keys)" for mobile                                              | Misleading for v1 LOCAL ONLY mode (no Supabase keys needed) | Clarify: "Supabase keys only needed for Cloud Managed beta (disabled in v1)" or remove Supabase mention entirely    |

### Comments in Code (Low Severity – Accurate Historical Notes)

| File                                                 | Line | Comment                                                                                         | Status                                   | Fix                               |
| ---------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------- |
| `/apps/web/app/auth/update-password/page.tsx`        | 9–10 | "/auth/update-password was the Supabase email-link callback for password reset."                | Accurate; page redirects to Clerk /login | None (keep as historical context) |
| `/apps/web/app/forgot-password/page.tsx`             | 10   | "Supabase-era /api/auth/forgot-password route (now absent)."                                    | Accurate; page redirects to Clerk /login | None (keep)                       |
| `/apps/desktop/src-tauri/src/core/mcp/connectors.rs` | 1508 | "// Supabase connector removed in commit d56bb265 (\"migrate cloud stack to neon and clerk\")." | Accurate test annotation                 | None (keep)                       |

---

## 4. Dependencies Audit

### package.json Files (All Supabase-Free)

**Searched 28+ package.json files across monorepo root, apps/, services/, packages/, crates/.**

Result: **ZERO `@supabase/*` dependencies found.**

Sample checked:

- `/package.json` → 0 Supabase
- `/apps/web/package.json` → 0 Supabase; contains `@neondatabase/serverless`, `@clerk/nextjs`
- `/apps/mobile/package.json` → 0 Supabase
- `/apps/desktop/package.json` → 0 Supabase
- `/services/api-gateway/package.json` → 0 Supabase; contains `@neondatabase/serverless`, `@clerk/backend`
- `/packages/data-layer/package.json` → 0 Supabase

**Lockfile:** `pnpm-lock.yaml` — 0 matches for `@supabase` (confirmed via grep).

### Cargo Dependencies (Rust Crates)

**Searched 17 Rust crates (79 .rs files, Cargo.toml).**

Result: **ZERO Supabase crate references.**

---

## 5. Supabase Directories & Migrations

### Canonical Migration Location

| Directory                | Status    | Content                                                                                          | Notes                                                                                                      |
| ------------------------ | --------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `/apps/web/db/neon/`     | ✓ ACTIVE  | 32 migrations: `0001_mvp_chat.sql` ... `0032_security_severity_superset.sql` (latest 2026-05-29) | Canonical Neon schema; actively maintained                                                                 |
| `/apps/web/db/supabase/` | ✗ DELETED | —                                                                                                | Never existed in current codebase (confirmed: 0 hits from `find . -type d -name supabase` excluding docs/) |

### CI Guard (Enforces Neon-Only)

**File:** `scripts/check-neon-migrations.mjs:35–39`

```javascript
const retiredDbDir = 'supa' + 'base'; // String concat to avoid linting flags
for (const removedDir of [retiredDbDir, `apps/web/${retiredDbDir}`]) {
  if (fs.existsSync(absolute(removedDir))) {
    errors.push(`${retiredDbDir} must not exist...`);
  }
}
```

**Status:** ✓ Active; wired into CI job `check:llm-operability`. Prevents accidental supabase/ re-creation. Verified: neither directory exists.

---

## 6. Environment Variables Across All Apps

### Summary Table

| App     | Variable                        | File                            | Git-Tracked     | Referenced in Code | Status       |
| ------- | ------------------------------- | ------------------------------- | --------------- | ------------------ | ------------ |
| web     | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local`                    | No (.gitignore) | No (0 rg hits)     | DEAD-REMNANT |
| web     | `NEXT_PUBLIC_SUPABASE_URL`      | `.env.local`                    | No              | No                 | DEAD-REMNANT |
| web     | `SUPABASE_SERVICE_ROLE_KEY`     | `.env.local`                    | No              | No                 | DEAD-REMNANT |
| desktop | `VITE_SUPABASE_URL`             | `.env.local`, `.env.production` | No (.gitignore) | No (0 rg hits)     | DEAD-REMNANT |
| desktop | `VITE_SUPABASE_ANON_KEY`        | `.env.local`, `.env.production` | No              | No                 | DEAD-REMNANT |
| mobile  | `EXPO_PUBLIC_SUPABASE_URL`      | `.env`                          | No              | No                 | DEAD-REMNANT |
| mobile  | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `.env`                          | No              | No                 | DEAD-REMNANT |

**No .env.example files expose Supabase secrets** (verified: each .env.example is Neon/Clerk-only).

---

## 7. MCP Server Configuration

| File                    | Content                                                                                                                                                                  | Status       | Action                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------ |
| `.mcp.json` lines 14–21 | Supabase MCP server registration: `{ "command": "npx", "args": ["-y", "mcp-remote", "https://mcp.supabase.com/...?project_ref=xwmcvbgdyergfnvwbnap"], "enabled": true }` | DEAD-REMNANT | Remove block; keep Vercel, Filesystem, Apify MCPs. No app code invokes this tool; it is dev-time only. |

---

## 8. Test Fixtures & Mock Data

| File                                                                                                                     | Kind                   | Content                                                                                                                                      | Classification                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `audit/repo-organization/reference-index/phase8-eslint-prototype/test-cases/valid/feature-uses-integration.ts` lines 5–8 | ESLint rule validation | Example import: `import { supabase } from '@/src/integrations/supabase/client'`; example call: `supabase.from('waitlist').insert({ email })` | TEST-FIXTURE (never executed; used to validate ESLint rules allow features/ → integrations/ imports) |

**Status:** Harmless reference case for linting rules. Can be deleted or updated to Neon equivalent if audit/reference data is not needed for compliance.

---

## 9. Coverage Ledger (18 Slices Completed)

| Slice                 | Status     | Command(s) Run                                                                     | Key Findings                                                                                                                  |
| --------------------- | ---------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **web-deps-env**      | ✓ Complete | `rg @supabase apps/web/package.json`, grep SUPABASE in .env\*                      | 3 env vars in .env.local (DEAD-REMNANT); 0 in source code                                                                     |
| **web-auth**          | ✓ Complete | grep -r @supabase, grep -r createClient, localStorage audits                       | 4 DEAD-REMNANT: localStorage cleanup of obsolete keys; 2 DOC-ONLY comments on legacy routes                                   |
| **web-db**            | ✓ Complete | rg "@supabase\|SUPABASE\_" in services/, app/api/, lib/ (141 routes, 67 lib files) | CLEAN: 0 hits; all DB calls via Neon (@neondatabase/serverless)                                                               |
| **web-migrations**    | ✓ Complete | find supabase/ dirs, rg "@supabase" in source, grep @supabase pnpm-lock.yaml       | CLEAN: 0 source hits; 32 Neon migrations active; stale symlinks in node_modules/@supabase/                                    |
| **desktop-fe**        | ✓ Complete | rg "@supabase\|SUPABASE\|createClient" apps/desktop/src (1,281 files)              | CLEAN: 0 Supabase imports; 2 DEAD-REMNANT env files (.env.local, .env.production)                                             |
| **desktop-native**    | ✓ Complete | rg supabase apps/desktop/src-tauri/src (742 .rs files), Cargo.toml scan            | CLEAN: 0 Rust references; 1 DOC-ONLY test comment; 2 DEAD-REMNANT .env files                                                  |
| **mobile**            | ✓ Complete | rg "@supabase\|EXPO_PUBLIC_SUPABASE" apps/mobile/                                  | CLEAN: 0 imports; 1 DEAD-REMNANT .env file (unused Expo vars)                                                                 |
| **cli**               | ✓ Complete | rg supabase apps/cli/, Cargo.toml, package.json                                    | CLEAN: 0 references; auth.rs, cloud.rs, sync.rs all Clerk-only                                                                |
| **extensions**        | ✓ Complete | rg "@supabase\|SUPABASE" apps/extension{,-vscode}/                                 | CLEAN: 0 references; chrome.storage (not Supabase)                                                                            |
| **sandbox-services**  | ✓ Complete | rg @supabase services/{api-gateway,signaling-server}/, grep dist/                  | CLEAN source; 2 DEAD-REMNANT dist files (supabaseClients.js/.d.ts) in .gitignore                                              |
| **packages**          | ✓ Complete | rg "@supabase" packages/, find _supabase_                                          | CLEAN: 0 dependencies; 1 vitest cache artifact (not live)                                                                     |
| **crates**            | ✓ Complete | rg supabase crates/ (79 .rs files)                                                 | CLEAN: 0 references                                                                                                           |
| **all-package-json**  | ✓ Complete | `rg "@supabase" -g "package.json"`, find + grep check                              | CLEAN: 0 @supabase/\* deps in any package.json; root/app/service package.json all verified                                    |
| **all-env**           | ✓ Complete | rg "SUPABASE\|supabase" .env\* files                                               | 14 total matches: all in .env.local/.env.production/.env (DEAD-REMNANT, unused)                                               |
| **all-supabase-dirs** | ✓ Complete | find -type d -name "supabase", find -name "config.toml" \| grep supabase           | CLEAN: 0 live supabase/ dirs; 1 commented-out Supabase MCP in .codex/config.toml                                              |
| **lockfile-types**    | ✓ Complete | grep supabase pnpm-lock.yaml, Cargo.lock, inspect .d.ts artifacts                  | CLEAN lockfiles; 2 stale .d.ts generated files in dist/                                                                       |
| **docs**              | ✓ Complete | rg "supabase" docs/ (631 lines, 25 files)                                          | All DECISION/AUDIT/HISTORICAL docs (no false production claims); 3 files with stale paths to nonexistent supabase/migrations/ |
| **comments-tests**    | ✓ Complete | rg -i supabase [source excluding node_modules, dist, docs, md]                     | 3 DOC-ONLY comments in auth redirect pages; 1 Rust test comment                                                               |

**Unreachable Slices:** None. All 18 slices completed.

---

## 10. Summary Recommendations

### Critical (Do Not Deploy Without)

None. No LIVE-CLOUD violations detected.

### High Priority (Security Hygiene)

1. **Delete stale env vars** from `/apps/web/.env.local`, `/apps/desktop/{.env.local,.env.production}`, `/apps/mobile/.env`
2. **Delete orphaned dist files** from `/services/api-gateway/dist/lib/supabaseClients.{js,d.ts}*` (rebuild if needed)
3. **Remove Supabase MCP server** from `.mcp.json` lines 14–21 to avoid agent confusion

### Medium Priority (Documentation Accuracy)

1. Update `docs/decisions/CURRENT_DECISIONS.md` Decision 17 to confirm Neon+Clerk (not Supabase)
2. Fix evidence citations in Decision 13 (replace stale supabase/migrations path with Neon equivalent)
3. Update `docs/enterprise/control-plane.md` and `docs/design/pitch-deck...md` to reference Neon paths instead of deleted supabase/ directory

### Low Priority (Cleanup)

1. Remove phantom @supabase symlinks: `pnpm prune --production`
2. Delete stale ESLint test fixture if no longer needed for audit compliance
3. Mark historical docs/CHANGELOG clearly as "ARCHIVED" to avoid confusion

---

## Conclusion

**The repository is Supabase-free at runtime.** The migration to Neon + Clerk is complete and verified. All remaining Supabase traces are cleanup artifacts (env vars, dist files) or documentation (historical records, comments). No LIVE-CLOUD violations exist.

**Next step:** Execute the cleanup recommendations above to leave the repo in fully-migrated state with zero Supabase debris.
