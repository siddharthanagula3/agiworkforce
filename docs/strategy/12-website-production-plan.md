# Website Production Plan (Surface 1 of 3)

Status: Active execution plan — Website first
Owner: Founder + web lead
Last updated: 2026-06-28
Sequence: **Website (this doc) → Mobile → Desktop**, one at a time.
Companion: `11-execution-playbook.md` (loop protocol + IP rules), `03-code-reality-and-tech-debt.md` (audit), `10-oss-corpus-port-plan.md` (donors)

This is the detailed, increment-by-increment plan to take **`apps/web` to production**, planned ahead per your request. It assumes the loop protocol and hard IP/license rules in `11` (learn from references, adapt only from license-clean donors, never copy proprietary).

---

## 0. Why website first, and how we test it

You picked the right starter: the web surface is the **most tool-testable**. It already ships `playwright.config.ts` + an `e2e/` suite, so we verify every increment with real browser automation, not vibes.

**Testing toolchain for this surface:**

- **Playwright** (`apps/web/e2e/`, existing) — automated e2e for every launch-critical flow; runs in CI (`e2e-tests.yml`). Each increment adds/extends a spec.
- **Chrome MCP** (live, interactive) — I drive the running app like a user to confirm flows + capture screenshots, and to debug console/network errors.
- **Per-increment gate** (from `11` §1): `pnpm --filter @agiworkforce/web typecheck` + targeted `vitest` + the increment's Playwright spec + a Chrome-MCP screenshot of the flow + zero new console errors.

---

## 1. Current state of `apps/web` (audit-grounded)

Mature Next.js app-router monorepo package. The spine is real (per `03`: ~80% real, Production-ish core).

**Real / working:** Clerk auth → CSRF + CORS allowlist + rate-limit + credit metering → 13-provider streaming chat → Neon persistence; conversation routes are IDOR-safe; trust/security pages already hedged honestly.

**Gaps to production (the backlog below):** settings IA parity; global search; connectors/apps directory; artifacts polish; non-image attachment ingestion; regenerate drops turn metadata; pre-send temporary/incognito chat; billing-history UI returns empty; search-citations metadata shape mismatch; cloud-waitlist copy vs. public-alpha-open reality; brand drift (`agi.workforce` vs `AGI`); dead Vite/Netlify image/video leftovers to delete; marketing-vs-shipped copy alignment.

**Definition of "production-ready" (web):** every launch-critical flow works end-to-end and is Playwright-covered; no dead controls; no overclaims; correct trust/provider labels; security headers + error boundaries + 404/500; WCAG 2.1 AA baseline; LCP/perf budget met; zero console errors on core flows; billing + usage correct; deployed to prod with green smoke tests.

---

## 2. Increment backlog (run in order; each = one work order)

Status tracked in `PORTING-TRACKER.md`. "Donor" = license-clean source to _learn from / adapt_; most web work is original (the spine exists), so donors are advisory.

### Stage A — Readiness baseline & cleanup

| ID        | Goal                                                                                                                                                      | Source/learn | Acceptance & test                                                           |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------- |
| **WEB-0** | Alpha-readiness audit: run existing Playwright; Chrome-MCP walk every core flow; inventory dead buttons, console/network errors, broken links, overclaims | —            | A baseline report + green/red list; existing e2e runs                       |
| **WEB-1** | Delete dead code (Vite/Netlify `google-imagen/veo` leftovers) + fix brand drift (`agi.workforce` → `AGI` in header/footer)                                | `03` R13/F15 | grep shows leftovers gone; header/footer render `AGI`; typecheck green      |
| **WEB-2** | Normalize search-citations metadata to one shape (writer + renderer)                                                                                      | `03` F03     | citations persist + render; Playwright asserts sources visible after reload |

### Stage B — Core chat completeness

| ID        | Goal                                                                        | Source/learn                                   | Acceptance & test                                                  |
| --------- | --------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------ |
| **WEB-3** | Non-image attachment ingestion (text/PDF/code → context)                    | learn: `liteparse` (Apache) server-side parse  | upload a PDF → content reaches the model; e2e covers upload→answer |
| **WEB-4** | Regenerate preserves turn metadata (attachments, search/think/skill intent) | `03` F13                                       | regenerated turn keeps metadata; e2e diff before/after             |
| **WEB-5** | Pre-send temporary/incognito conversation (no persist until policy allows)  | `03` F11                                       | temp chat not written to history; e2e asserts no DB row            |
| **WEB-6** | Global search across chats/projects/artifacts/files (trust-scoped)          | learn: `odysseus` search; `continue` retrieval | search returns ranked results; e2e + Chrome-MCP screenshot         |

### Stage C — Platform surfaces

| ID        | Goal                                                                                                                                   | Source/learn                                                    | Acceptance & test                                |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| **WEB-7** | Settings IA to locked spec (General/Account/Privacy/Billing/Usage/Capabilities/Connectors/AGI Code/AGI in Chrome/Extensions/Developer) | `source-of-truth.md` UX Lock                                    | all sections present + wired; e2e navigates each |
| **WEB-8** | Connectors/apps directory (categories, search, per-tool permissions, OAuth/custom MCP)                                                 | learn: ChatGPT/Claude dir; MCP SDK                              | install + permission flow e2e; admin controls    |
| **WEB-9** | Artifacts polish (versioning, publish/share, error-fix loop, source/preview)                                                           | learn: `CopilotKit` `defineToolCallRenderer` (MIT `packages/*`) | artifact lifecycle e2e green                     |

### Stage D — Commerce & honesty

| ID         | Goal                                                                                | Source/learn                         | Acceptance & test                                       |
| ---------- | ----------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------- |
| **WEB-10** | Billing-history UI wired (invoices/usage/plan correct)                              | `03` R10                             | billing page shows real data; e2e with test account     |
| **WEB-11** | Managed-cloud presented as public alpha (open by default); fix waitlist auth wiring | `03` F02; source-of-truth 2026-06-27 | signed-in users can use managed; no stale waitlist copy |
| **WEB-12** | Marketing-vs-shipped copy alignment (no unshipped claim in present tense)           | `03` F05/F09                         | a claims-vs-parity check passes                         |

### Stage E — Production hardening & launch

| ID         | Goal                                                                                                                  | Acceptance & test                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **WEB-13** | Hardening: security headers (CSP/HSTS), error boundaries, 404/500, SEO/meta/OG, WCAG 2.1 AA, perf budget (LCP < 2.5s) | Lighthouse + axe pass thresholds; headers verified |
| **WEB-14** | Full Playwright e2e for all launch-critical flows + CI gate (`e2e-tests.yml`)                                         | suite green in CI; flake < 1%                      |
| **WEB-15** | Production deploy (Vercel) + smoke tests on prod URL + rollback plan                                                  | prod smoke e2e green; trust-boundary tests green   |

---

## 3. Sequencing & exit criteria

Run A → B → C → D → E. **Website is "done" when:** WEB-13/14/15 pass, the full e2e suite is green in CI, Lighthouse/axe thresholds are met, and a Chrome-MCP walkthrough of every core flow shows zero dead controls, zero console errors, and correct trust/provider labels. Only then do we start **Mobile** (next plan: `13-mobile-production-plan.md`, tested via Xcode MCP tools per your note), then **Desktop** (`14-desktop-production-plan.md`, using `odysseus` as the workspace reference).

---

## 4. Operating model note (important)

This Cowork sandbox can write the working tree but **cannot land git commits** (restricted `.git` perms). So the loop runs as: **I implement + verify each increment in the working tree; you commit** in your dev env (after `rm -f .git/index.lock` to clear the stale lock from this session), OR you run the agent in an environment with full git-write access and I commit + verify per `11` §1. Either way, verification (typecheck/tests/Playwright/Chrome-MCP) happens before each handoff.

---

## 5. First action

Begin **WEB-0** (readiness baseline) — run the existing Playwright suite, then a Chrome-MCP walkthrough of the core chat + auth + billing flows, and produce the green/red inventory that orders WEB-1…WEB-15. That requires the running web app; confirm the dev/staging URL (or that `pnpm --filter @agiworkforce/web dev` is reachable) and I'll start.
