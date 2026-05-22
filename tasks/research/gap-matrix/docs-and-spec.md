# Gap Matrix — Documentation & Spec vs Anthropic Suite (May 2026)

**Scope:** `docs/` (62 .md files in 11 subdirs), root `*.md` (`AGI_WORKFORCE.md`, `BUILD.md`, `CLAUDE.md`, `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `THIRD_PARTY_LICENSES.md`), plus `tasks/lessons.md` and `tasks/auto-routing-spec.md`.
**Reference:** `tasks/research/anthropic-claude-suite-may-2026.md` (776 lines covering claude.ai, Desktop, Cowork, Claude Code, CLI, Mobile, Chrome ext, VS Code ext, JetBrains, Console, Trust Center, Computer Use, Pricing, Connectors, MCP, Skills, Memory, Projects, threat model).
**Verdict at the top:** Internal/engineering docs are strong; **public/customer/compliance/reference docs are mostly missing**. Of the ~24 doc categories Anthropic ships, AGI Workforce ships **3 fully, 6 partially, 15 missing**. Per-axis parity ≈ **18%**.

---

## HAVE (per file, 1-line)

### Root markdown (7 files)

- `AGI_WORKFORCE.md:1-887` — Single source of truth: surface inventory, locked differentiators, pricing locks, OpenClaw porting plan (S1-S13), audit deltas. Strong **internal** spec.
- `README.md:1-122` — User-facing quick start: install paths (brew/cargo/curl/npm pending), 6-surface table, comparison vs Anthropic/ChatGPT.
- `BUILD.md:1-160` — Per-surface build commands + Tauri OS prereqs + CI overview. Good **engineering** entry point.
- `CLAUDE.md:1-178` — Engineering rules for AI agents: locked rules (models.json, web-search-before-facts), workflow orchestration, task management.
- `CHANGELOG.md:1-103` — Keep-a-Changelog format, [Unreleased]/Wave 2/Wave 3 sections, [1.0.0] CLI entry with 22 subcommands + 10+ Providers + audit summary.
- `CONTRIBUTING.md:1-7` — Stub; says "proprietary, no external contributions, contact security@agiworkforce.com." Effectively missing as a contributor guide.
- `THIRD_PARTY_LICENSES.md:1-77` — Provenance ledger for OpenClaw MIT-licensed code (~14 files in `packages/llm-normalize/`, `packages/types/`, `packages/mcp/`, `packages/skills/`, `packages/apply-patch/`).

### docs/ root (12 files)

- `docs/README.md:1-71` — Doc index: links to ARCHITECTURE/SCALING/HOSTING/PERFORMANCE/PRICING/ROADMAP/DESIGN/HANDOFF and the per-domain folders.
- `docs/VISION.md:1-86` — "ONE chat layout" product vision; 28+ separate views to delete; 3 differentiators locked.
- `docs/ROADMAP.md:1-127` — Wave 0/1/2/3 status; current sprint (Wave 2 Desktop v1.0); decisions log.
- `docs/PRICING.md:1-94` — 6-tier matrix (Local/BYOK/Hobby/Pro/Max/Enterprise), Local↔Cloud transfer rules, Stripe wiring pointers, "how to launch a new tier" runbook.
- `docs/DESIGN.md:1-185` — UI north star = Claude Desktop reference at `~/Desktop/reference/ui/`; 5-7 sidebar items; inline tool patterns; color/typography deferred to Wave 2.
- `docs/ARCHITECTURE.md:1-241` — 6 surfaces × shared packages × providers × data-layer × backend services + cross-surface contracts (5 listed: Agent SDK protocol, Dispatch parity, MCP, Skills, llm-normalize).
- `docs/SCALING.md:1-437` — Migration playbooks: Supabase→Neon, Auth provider swap, Storage S3/R2/B2, Realtime Pusher/Ably/DO, pooling, read replicas, rate limits, vertical-slice migration log.
- `docs/HOSTING.md:1-403` — Multi-cloud deployment: Vercel/CF Pages/Netlify/self-hosted; Fly.io/Railway/Render/ECS; signaling on DOs; multi-region; CI/CD workflows; DR.
- `docs/PERFORMANCE.md:1-353` — Pool sizing, 3-tier caching, streaming backpressure, provider failover, cost-aware routing (linked to `tasks/auto-routing-spec.md`), edge vs origin, ws scaling, indexes.
- `docs/HANDOFF.md:1-283` — Wave 1 operator runbook (NPM_TOKEN, Homebrew tap, launch posts).
- `docs/BILLION_DOLLAR_PLAYBOOK.md:1-100+` — Strategic + 6-criterion billion-dollar-ready scorecard; today's stack ticks 5/6 (compliance pending).
- `docs/SURFACE_VERIFICATION.md:1-80` — Working-state definition + smoke-test commands per surface.
- `docs/VERIFICATION_2026-05-08.md` — verification snapshot.

### docs/ subdirs (50+ files)

- `docs/api/` — OpenAPI 3.1 (`openapi.yaml`, 2,771 LOC) + Postman collection + curl/JS/Python examples. Documents 25 tags incl. Health/Auth/User/Billing/LLM/Chat/Agents/Memory/Device/Media/Schedules/Share/Models/Voice/Downloads/Releases/Admin/Connectors/Marketplace/Messaging/Autotag/GitHub/Webhooks. **Strongest customer-facing doc.**
- `docs/audit/` — `AUDIT_2026-05-03.md` (P0/P1 inventory), `AUDIT_REPORT_2026-05-01.md`, `FIX_QUEUE.md` (47 fix prompts, runnable).
- `docs/security/` — Cross-surface red team (`REVIEW.md`, 305 LOC), per-surface findings (web/desktop/cli/mobile/chrome-ext/vscode-ext/supply-chain), `red-team-2026-05-04.md`, `auth-role-service-role-body-checks.md`. **Internal** posture only.
- `docs/plans/` — `UNIFIED_LAUNCH_PLAN.md` (canonical, 280+ LOC ship-blocker punch list), `wave2-desktop-v1.md`, `wave3-mobile-extensions-web.md`, `SHIP_RUNBOOK.md`, `master-remediation.md` (legacy).
- `docs/launch/` — Show HN / Twitter / r/LocalLLaMA drafts (×2 generations), `hobby-tier-checklist.md`, `wave-3-playbook.md`, `store-listings/` (App Store, Play, Chrome Web Store, VS Code Marketplace).
- `docs/superpowers/` — UI audits per surface (`2026-05-05-ui-audit/{cli,desktop,web,mobile,chrome-extension,vscode-extension}.md`, 7 files), `MASTER.md` (cross-surface), `DECISIONS.md`, `2026-05-05-phase1-design-system-foundation.md`, `2026-05-01-cli-reference-port.md` + design.
- `docs/planning/cli-modernization-spec.md` — abandoned codex-rs port spec; pending archive per UNIFIED_LAUNCH_PLAN §6.
- `docs/archive/` — superseded plans.

### tasks/ (3 files in scope)

- `tasks/lessons.md:1-25` — 5 audit lessons captured 2026-05-06 (single-file vs distributed grep, migration completeness, sentinel constants, partial dead-code, false-alarm classification). **Self-improvement loop is working** but only one audit cycle has produced lessons.
- `tasks/auto-routing-spec.md:1-300+` — Frozen 2026-05-07 routing spec: 6-tier matrix, Pool A/B/C definitions, classifier internals, geo/Indic detection. Strong locked spec.
- `tasks/todo.md` — sprint todos.

---

## PARTIAL (per doc, gap detail)

| File                                  | What's there                                                                                              | What's missing                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`                           | Install paths, comparison table, surface list, pricing teaser                                             | **No** customer-facing security/privacy commitments, no Trust Center link, no quickstart per surface (only CLI shown), no GDPR/data-deletion pointer, no SLA, no list of what's BYOK vs cloud-managed at the data plane. Reference shows Anthropic ships per-surface quickstarts at `code.claude.com/docs/en/desktop-quickstart` — we ship only one inline shell example. |
| `AGI_WORKFORCE.md`                    | Internal SSOT covering 887 lines, OpenClaw provenance, Sprint 1-13, audit deltas                          | **Mixes** internal engineering state (audit P0 status, Sprint table) with product spec — not appropriate as canonical for external readers. No section on threat model, data residency, retention windows, customer rights (GDPR/CCPA Article 15-22), or incident response.                                                                                               |
| `BUILD.md`                            | Prereqs + per-surface build commands + CI overview                                                        | **No** distribution/release-cutting runbook for non-CLI surfaces; signing/notarization steps abridged ("currently in-progress, builds ship unsigned until the EV cert lands" per `BUILD.md:75`); no Mac App Store or Microsoft Store path; no air-gap install guide. Reference Anthropic Desktop has MSIX/Squirrel/macOS-VF VM bundle docs we don't mirror.               |
| `CLAUDE.md`                           | Locked rules, workflow orchestration, single-test commands                                                | **No** `settings.json` reference (Anthropic publishes ~125+ keys per ref §5.10). No subagent guide (refs §5.7). No skill authoring guide (refs §E.1 — schema, eval flow, lifecycle, monetization). No hook reference table (refs §5.4 — 12-event × 4-handler matrix). Effectively no parity with Anthropic's `code.claude.com/docs/`.                                     |
| `CHANGELOG.md`                        | One released entry (CLI v1.0), Wave 2/3 progress                                                          | **No** per-surface changelogs; no Desktop v1.x entries even though `v-desktop-1.2.0` shipped (per memory `v1-2-0-release-state.md`); no Mobile/Chrome ext/VS Code ext changelogs at all. Reference: Anthropic ships separate `code.claude.com/docs/en/changelog` for Claude Code that lists every weekly drop.                                                            |
| `THIRD_PARTY_LICENSES.md`             | OpenClaw MIT entries with file-by-file mapping                                                            | **No** vendor SDK attributions (`@anthropic-ai/sdk`, `openai`, `ollama`, `@modelcontextprotocol/sdk`, `@aws-sdk/client-s3`, etc.). No Rust dependency licenses (Tauri MIT/Apache, Ratatui MIT, Tokio MIT, Clap MIT, etc.). No image/icon attributions. Compliance gap for any enterprise-vetting questionnaire.                                                           |
| `docs/PRICING.md`                     | 6-tier matrix + mode definitions + Stripe wiring + "how to launch a new tier" runbook                     | **No** rate-limit / quota numbers per tier (refs §A: "~15-40 msg / 5 hr ... 5× Free, weekly cap" — we don't publish equivalents). No promised SLA. No managed-cloud privacy commitment ("does Hobby send data to subprocessors?"). No region availability per tier. **Hobby price still TBD** (`docs/PRICING.md:11`).                                                     |
| `docs/ROADMAP.md`                     | Wave 0/1 done, Wave 2/3 in progress                                                                       | **No** Pro/Max launch criteria beyond "after security audit" (refs §A documents Anthropic's Pro $200/yr concrete spec). No EU data-residency ETA (currently us-east-2 only per `docs/ROADMAP.md:97`). No Linux computer-use ETA.                                                                                                                                          |
| `docs/ARCHITECTURE.md`                | 6 surfaces, data layer, providers, contracts                                                              | **Stale**: claims React Native 0.84.0 at `:67` but `package.json:61` is 0.83.6 (per MEMORY). No threat model section (deferred to `docs/security/REVIEW.md` which is internal). No detailed `dispatchHmac`/`dispatchSalt` wire format (mentioned, not specified — refs §6.5 Anthropic Dispatch parity is what we copy).                                                   |
| `docs/DESIGN.md`                      | Claude Desktop pixel-close intent, 5-7 sidebar pattern, inline-tool catalog mapped to existing components | **Color palette + typography deferred** (`docs/DESIGN.md:155` "To be extracted from screenshots in Wave 2 design phase"). No tokens. No accessibility audit (WCAG 2.1 AA criteria). No localized typography for Indic / CJK.                                                                                                                                              |
| `docs/api/openapi.yaml`               | 25 tags, 2,771 LOC of OpenAPI 3.1 + Postman + 3 SDK examples                                              | **No** SSE / streaming protocol documentation (refs Anthropic Messages API documents `text_delta`, `tool_use_delta`, `thinking_delta`, etc. — ours OpenAPI doesn't model streaming). No webhook reference for Stripe / GitHub. No API key issuance flow. No errors taxonomy expansion (only generic shape shown).                                                         |
| `docs/security/REVIEW.md`             | 124 cross-surface findings (1 CRIT / 20 HIGH / 41 MEDIUM / 40 LOW / 29 INFO + 27 ARCH + 28 PERF)          | **Internal**, not a customer-facing security policy. Has no "report a vulnerability" flow, no CVE history, no SOC 2 statement, no penetration test cadence.                                                                                                                                                                                                               |
| `docs/audit/FIX_QUEUE.md`             | 47 actionable fix prompts                                                                                 | **Internal engineering doc**; not a public bug bounty / known issues page.                                                                                                                                                                                                                                                                                                |
| `docs/launch/hobby-tier-checklist.md` | Operator steps to flip Hobby live                                                                         | **No** customer-facing pricing/billing terms doc; no auto-renewal disclosure (called out as TODO in `docs/PRICING.md:62` referencing FIX-035 "ToS rewrite").                                                                                                                                                                                                              |
| `tasks/auto-routing-spec.md`          | 6-tier × Pool A/B/C × classifier × geo + Indic                                                            | **Spec only**; not customer-visible. Users don't know which model handles their query (per `auto-routing-spec.md:71` "fully silent. No model chip, no toast, no model name visible to user"). Anthropic at refs §1.1 surfaces model picker explicitly. We hide; they expose.                                                                                              |
| `tasks/lessons.md`                    | 5 lessons captured 2026-05-06                                                                             | **Only one audit cycle's worth.** No corrections from any other source feed (user feedback, customer support, security disclosures). The self-improvement loop is alive but undertested — see CLAUDE.md §"Self-Improvement Loop".                                                                                                                                         |

---

## MISSING (per category — Trust/Compliance/API/Quickstart/Skill/Hook/Plugin/MCP/Connector/Settings/Migration/etc.)

### Compliance & Trust (CRIT — blocks any enterprise customer)

- **No `trust.agiworkforce.com` equivalent.** Anthropic ships `trust.anthropic.com` (refs §11) listing SOC 2 Type I+II, ISO 27001:2022, ISO/IEC 42001:2023 (AI mgmt), HIPAA-ready BAA, GDPR/CCPA, NIST 800-171r3, FedRAMP High, DoD IL4/IL5, AWS Secret Region IL6. We have zero compliance attestations documented. `docs/BILLION_DOLLAR_PLAYBOOK.md:96-98` admits **SOC 2 Type II is Q3 2026 target** and HIPAA is "not in scope for any tier today."
- **No Privacy Policy.** Repo has zero `PRIVACY.md`. Web has `agiworkforce.com/privacy` referenced in mobile launch plan (`docs/plans/wave3-mobile-extensions-web.md:26`) but the doc that backs it is not in the repo. UNIFIED_LAUNCH_PLAN MK1 (`apps/web/app/faq/page.tsx:39`) admits FAQ contradicts pricing — privacy wording untested.
- **No Terms of Service / Subprocessor list.** No DPA template. No SCC / data-export commitments. UNIFIED_LAUNCH_PLAN FIX-035 (referenced in `docs/PRICING.md:62`) calls out "ToS rewrite (auto-renewal disclosure required)" as a known unblocked task.
- **No data residency statement.** Per `MEMORY.md` and `docs/SCALING.md:411` — **us-east-2 only, no EU residency**. Refs §11.1 Anthropic offers EU at 1.1× pricing + Bedrock/Vertex regional choices.
- **No retention policy.** No documented default retention window per tier or for safety-flagged content (refs §11.2 ships specific 30-day default + 2yr/7yr safety carve-outs).
- **No `SECURITY.md`.** No vulnerability disclosure policy file at repo root. CONTRIBUTING.md says contact `security@agiworkforce.com` but there's no scope, no rewards, no triage SLA, no PGP key. `gh security policy` would 404.
- **No bug bounty / VDP page.**

### Reference docs (CRIT — blocks customer onboarding)

- **No Skill authoring guide.** Refs §E.1 documents schema (`name` ≤ 64 chars, `description` ≤ 1024 chars, recommended ≤ 500 LOC body, optional `scripts/`/`references/`/`assets/`), authoring flow (skill-creator meta-skill + ~20 eval queries), discovery surface, invocation triggers ("pushy" descriptions per Anthropic). We have `packages/skills/` code but **zero authoring docs**.
- **No Plugin authoring guide.** Refs §5.11 — Anthropic ships `claude plugin marketplace add <repo>` + `.claude-plugin/marketplace.json` schema; community at `claudemarketplaces.com` reports 4,200+ skills, 770+ MCP servers, 2,500+ marketplaces. We ship `apps/cli/src/plugins.rs` but have zero docs on how to author/publish.
- **No MCP authoring guide.** Refs §D + §1.4 — three transports (stdio/sse/streamable-http), three scopes (local/project/user), `claude mcp add` workflow, OAuth callback patterns. Our `packages/mcp/` is implemented; the **how-to-build-one-yourself** is unwritten.
- **No Connector authoring / directory.** Refs §1.4 — 200+ connector directory at `claude.com/directory/connectors` with categories (Productivity, Storage, Engineering, Finance, Health, Consumer). MCP Apps spec (refs §C, 26 Jan 2026) for interactive UI rendering. Our `apps/web` has connector wiring but no public directory page and no authoring spec.
- **No `settings.json` reference.** Refs §5.10 lists ~125+ top-level keys (`model`, `env`, `permissions{allow,deny,ask,defaultMode,disableBypassPermissionsMode,additionalDirectories}`, `hooks`, `mcpServers`, `enabledPlugins`, `extraKnownMarketplaces`, `strictKnownMarketplaces`, `disableAllHooks`, `allowManagedHooksOnly`, `allowedHookHttpUrls`, `allowedHookEnvVars`, `outputStyle`, `disableAutoMode`, `useAutoModeInPlanMode`, `worktree.baseRef`, `sandbox.bwrapPath`, `sandbox.socatPath`, `forceLoginMethod`, `forceLoginOrgUUID`, `otelHeadersHelper`, `parentSettingsBehavior`). Our CLI has analogous config but no key-by-key reference.
- **No Hooks reference.** Refs §5.4 — 12 documented events (`SessionStart`, `SessionEnd`, `Setup`, `InstructionsLoaded`, `UserPromptSubmit`, `UserPromptExpansion`, `PreToolUse`, `PermissionRequest`, `PermissionDenied`, `PostToolUse`, `PostToolUseFailure`, `Notification`, `Stop`, `SubagentStart/Stop/StopFailure`, `PreCompact`) × 4 handler types (command/HTTP/prompt/agent) × env vars (`CLAUDE_FILE_PATH`, etc.) × JSON output schema (`hookSpecificOutput.permissionDecision: allow|deny|ask`). Our CLI has 22 canonical hook events at `hooks.rs:179-200` (per MEMORY) but no reference table published.
- **No Subagent guide.** Refs §5.7 — built-in subagents (Explore, Plan, general-purpose), custom format (markdown + YAML frontmatter `name`/`description`/`tools`/`model`/`permissionMode`), `/agents` Library tab + "Generate with Claude" wizard, marketplaces (`VoltAgent/awesome-claude-code-subagents` 100+, `wshobson/agents` 80+).
- **No Computer Use guide.** Refs §12 — tool name `computer_20251124`, action vocabulary (16 actions: screenshot, left/right/middle/double/triple_click, mouse_down/up, mouse_move, cursor_position, key, type, scroll, hold_key, wait, zoom), beta header, system-prompt overhead 466-499 tokens. Our Tauri Rust has computer use code but no public guide. `docs/audit/AUDIT_REPORT_2026-05-01.md:14` admits gates were missing as a P0.
- **No Cowork-equivalent guide** (we don't have Cowork; refs §3.9 documents Anthropic excludes it from audit logs which we'd want to disclose differently).
- **No Dispatch guide.** Refs §6.5 Anthropic Dispatch is documented (QR pair, 30-min approval window, mobile→desktop persistent thread). We claim "Dispatch parity" but only `apps/mobile/lib/dispatchHmac.ts` is mentioned in `docs/ARCHITECTURE.md:174-177` — no user-facing how-to.

### Quickstart & guides (HIGH — blocks first-run UX)

- **No per-surface quickstart pages.** Refs ships `code.claude.com/docs/en/desktop-quickstart` and equivalents per surface. We have inline `README.md:44-90` (CLI-heavy) but no Desktop / Mobile / Web / Chrome / VS Code first-run guides.
- **No admin / org-management guide.** No SSO setup, SCIM, audit-log export, role-based perms doc. Refs §10.5 documents Anthropic's Console.
- **No incident-response runbook.** `docs/HOSTING.md:396-398` lists 4 TODOs (`runbooks/db-down.md`, `runbooks/region-out.md`, `runbooks/stripe-webhook-storm.md`, `runbooks/llm-provider-down.md`) — none authored.

### Operational docs (HIGH)

- **No release notes** beyond `CHANGELOG.md` (one CLI v1.0 entry). No dedicated per-surface release notes RSS / page.
- **No known-issues page.** Refs §5.16 documents Anthropic's edge cases (MCP-stuck-connecting, PostToolUse-hooks-not-firing, OAuth 401 retry loop, Auto-mode bubblewrap bypass, Memory leaks). We have `docs/audit/FIX_QUEUE.md` but it's an internal action list, not a customer "what's broken right now" page.
- **No migration guide** (e.g., legacy → new schema, Local → Cloud). `docs/PRICING.md:28-34` mentions Local↔Cloud migration as a feature but the actual migration steps live in code, not docs.
- **No effort-downgrade / postmortem catalog.** Refs §C documents Anthropic's 7 Apr 2026 effort-downgrade postmortem. We have no postmortem template, no past postmortems published.
- **No threat-model doc** for customer trust. `docs/security/REVIEW.md` is engineering-internal.

### Specific authoring schemas (MED)

- **No `.claude-plugin/marketplace.json` schema** for our marketplace (do we even have one? `apps/cli/src/marketplace.rs` exists but unspecced).
- **No SKILL.md frontmatter spec** for our skills (refs §E.1).
- **No subagent frontmatter spec** for `~/.agiworkforce/agents/`.
- **No MCPB / desktop-extension spec** equivalent to Anthropic's `.mcpb` format (refs §1.2).
- **No output-styles spec** (refs §5.12 — Anthropic ships `default`/`explanatory`/`learning` + user-authored).

### Cross-surface gaps from the canonical research

- No `docs/CONNECTORS.md` directory page.
- No `docs/SAFETY.md` documenting our Auto Mode / sandbox classifier behavior (refs §F.2 — Anthropic publishes 0.4% FP / 5.7% FN / ~17% overeager rates publicly).
- No `docs/OPENTELEMETRY.md` — refs §3.6 documents Cowork → OTel exporter contract; we'd want analog for our Dispatch.
- No `docs/DATA_PROCESSING_AGREEMENT.md` template.
- No `docs/SUBPROCESSORS.md` listing Stripe/Supabase/Vercel/Fly.io/Upstash/etc.

---

## Per-axis percentage

| Axis                                   | Anthropic ships                                                                           | We ship                                                                                                              | %                                            |
| -------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Trust Center / compliance              | SOC 2 I+II + ISO 27001 + ISO 42001 + HIPAA + GDPR + NIST + FedRAMP + DoD IL4/5 (refs §11) | None                                                                                                                 | **0%**                                       |
| Privacy policy / data handling         | Privacy Center + retention windows + ZDR options + per-product gates                      | Mentioned in mobile plan, not in repo                                                                                | **5%**                                       |
| API reference                          | Messages API + streaming events + SDK Python/TS                                           | OpenAPI 3.1 (2,771 LOC, 25 tags) + Postman + 3 SDK examples                                                          | **40%** (no streaming spec, no webhook spec) |
| Per-surface quickstart                 | 6 quickstart pages                                                                        | README has inline CLI quickstart only                                                                                | **15%**                                      |
| Admin guide                            | Org SSO + SCIM + spend caps + Compliance API + workspaces (refs §10.5)                    | None                                                                                                                 | **0%**                                       |
| Skill authoring                        | Schema + eval flow + lifecycle + monetization (refs §E.1)                                 | Code in `packages/skills/`, zero docs                                                                                | **5%**                                       |
| Plugin authoring                       | Marketplace JSON + install flow + 4,200+ ecosystem (refs §5.11)                           | `apps/cli/src/plugins.rs` code, zero docs                                                                            | **5%**                                       |
| MCP authoring                          | Three transports + scopes + 770+ servers (refs §D)                                        | `packages/mcp/`, zero docs                                                                                           | **5%**                                       |
| Connectors directory                   | 200+ connector directory page (refs §1.4)                                                 | Code wired, no directory page                                                                                        | **0%**                                       |
| Pricing matrix                         | 9-tier matrix with rate caps + features × surfaces (refs §A + §B)                         | 6-tier with TBD prices on 3 tiers + no rate caps                                                                     | **40%**                                      |
| Effort-downgrade postmortems           | 7 Apr 2026 postmortem published (refs §C)                                                 | No postmortem template, no past postmortems                                                                          | **0%**                                       |
| Vulnerability disclosure / SECURITY.md | trust.anthropic.com + responsible disclosure                                              | CONTRIBUTING.md mentions email; no SECURITY.md                                                                       | **5%**                                       |
| Release notes                          | `code.claude.com/docs/en/changelog` per-surface                                           | Single `CHANGELOG.md` with one entry                                                                                 | **15%**                                      |
| Known issues page                      | Refs §5.16 documented                                                                     | `docs/audit/FIX_QUEUE.md` is internal                                                                                | **10%**                                      |
| Migration guides                       | Legacy/version migration docs                                                             | None for end users                                                                                                   | **5%**                                       |
| Settings.json reference                | ~125+ keys documented (refs §5.10)                                                        | `CLAUDE.md` mentions config; no key reference                                                                        | **5%**                                       |
| Hooks reference                        | 12-event × 4-handler matrix (refs §5.4)                                                   | 22 events in code; no reference table                                                                                | **10%**                                      |
| Subagent guide                         | Built-ins + frontmatter + Library + marketplaces (refs §5.7)                              | None                                                                                                                 | **0%**                                       |
| Computer Use guide                     | Tool name + 16 actions + tokens overhead (refs §12)                                       | Internal Tauri code, no guide                                                                                        | **0%**                                       |
| Cowork guide                           | Multi-page (refs §3) — N/A for us (we don't ship Cowork)                                  | N/A                                                                                                                  | **N/A**                                      |
| Dispatch guide                         | Refs §6.5 — QR pair + 30-min approval                                                     | Code mentioned in `docs/ARCHITECTURE.md:174-177`, no user guide                                                      | **5%**                                       |
| Threat model / safety layer            | Refs §F published with FP/FN/overeager rates                                              | Internal `docs/security/REVIEW.md` only                                                                              | **15%**                                      |
| Architecture reference                 | refs ARCHITECTURE-equivalent                                                              | `docs/ARCHITECTURE.md` solid                                                                                         | **80%**                                      |
| Cloud-portability migration playbooks  | N/A                                                                                       | `docs/SCALING.md` + `docs/HOSTING.md` + `docs/PERFORMANCE.md` (1,193 LOC) — **stronger than refs in this dimension** | **150%**                                     |

**Weighted overall parity: ~18%** (excluding cloud-portability where we exceed the reference and excluding Cowork which is N/A).

---

## Effort to ship docs to parity (engineer-days)

Ordered by `severity × customer-blocker × effort`. S = ≤2 days, M = 3-7, L = 8-15, XL = 16-30.

|   # | Doc                                                              | Effort | Notes                                                                                                         |
| --: | ---------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
|   1 | `SECURITY.md` (root)                                             | S      | Disclosure scope, contact, PGP key, triage SLA. Unblocks `gh security policy` 404.                            |
|   2 | `PRIVACY.md` (root) + `docs/PRIVACY_POLICY.md`                   | M      | Counsel sign-off required (per `docs/ROADMAP.md` Wave 2 "Privacy Policy rewrite").                            |
|   3 | `docs/TRUST.md` + status board                                   | M      | Per-tier compliance posture; admit "SOC 2 Type II Q3 2026" as documented goal.                                |
|   4 | `docs/SUBPROCESSORS.md` + `docs/DPA.md`                          | M      | Stripe/Supabase/Vercel/Fly.io/Upstash listing + DPA template.                                                 |
|   5 | `docs/api/STREAMING.md` + webhooks reference                     | M      | Document SSE event types (`text_delta`/`tool_use_delta`/`thinking_delta`); Stripe + GitHub webhook reference. |
|   6 | `docs/quickstart-{cli,desktop,web,mobile,chrome,vscode}.md` (×6) | M      | Per-surface 5-min quickstart.                                                                                 |
|   7 | `docs/SKILL_AUTHORING.md` + SKILL.md schema                      | M      | Mirror refs §E.1; ship 1-2 example skills.                                                                    |
|   8 | `docs/PLUGIN_AUTHORING.md` + marketplace.json schema             | M      | `.claude-plugin/marketplace.json`-equivalent for `apps/cli/src/marketplace.rs`.                               |
|   9 | `docs/MCP_AUTHORING.md`                                          | S      | Three transports + scopes + scaffolding template.                                                             |
|  10 | `docs/CONNECTORS.md` + directory page                            | L      | Connector directory + per-connector permission UI spec; depends on web team.                                  |
|  11 | `docs/SETTINGS_REFERENCE.md` (CLI + Desktop)                     | L      | Key-by-key reference; auto-generate from Rust `Config` structs + TS types where possible.                     |
|  12 | `docs/HOOKS_REFERENCE.md`                                        | M      | 22 canonical events × handler types × env vars × JSON schema.                                                 |
|  13 | `docs/SUBAGENT_GUIDE.md`                                         | S      | Frontmatter spec + built-in list + custom subagent example.                                                   |
|  14 | `docs/COMPUTER_USE_GUIDE.md`                                     | M      | Action vocabulary, gates, sandbox, supported platforms.                                                       |
|  15 | `docs/DISPATCH_GUIDE.md`                                         | S      | QR-pair flow, 30-min approval, scope levels (file / browser / full computer).                                 |
|  16 | Per-surface `CHANGELOG.md` (×6)                                  | M      | Especially Desktop (v1.2.0 shipped, no entry).                                                                |
|  17 | `docs/KNOWN_ISSUES.md`                                           | S      | Surface 5-10 user-visible bugs from FIX_QUEUE.md.                                                             |
|  18 | `docs/MIGRATION_GUIDES.md` (Local↔Cloud, schema migrations)      | M      | Document the migration steps from `docs/PRICING.md:28-34`.                                                    |
|  19 | `docs/POSTMORTEMS/` template + retroactive postmortems           | M      | Effort-downgrade postmortem analog for any past incident; ship template.                                      |
|  20 | `docs/SAFETY.md` (Auto Mode + sandbox classifier)                | M      | Publish FP/FN rates analogous to refs §F.2.                                                                   |
|  21 | `docs/OPENTELEMETRY.md`                                          | S      | Cowork-style exporter contract (we'd surface for Dispatch / api-gateway).                                     |
|  22 | `docs/RUNBOOKS/` (4 stubs from `HOSTING.md:396-398`)             | M      | db-down / region-out / stripe-webhook-storm / llm-provider-down.                                              |
|  23 | `THIRD_PARTY_LICENSES.md` expansion                              | S      | Add vendor SDK licenses + Rust crate licenses.                                                                |
|  24 | Admin / org-management guide                                     | M      | After Enterprise tier launch; defer.                                                                          |
|  25 | `docs/ACCESSIBILITY.md` (WCAG 2.1 AA)                            | M      | Tied to `docs/DESIGN.md:155` deferred design system.                                                          |

**Total: ~110-150 engineer-days for full parity.** Pragmatic minimum (items #1-#9 + #12 + #17) = **~25-35 engineer-days** to clear the critical compliance/customer-onboarding gaps and de-risk Hobby-tier launch.

**Critical-path order for next sprint:**

1. SECURITY.md + vuln disclosure (1 day) — unblocks `gh security policy`
2. PRIVACY_POLICY.md draft (counsel-pending, 3 days) — unblocks Hobby tier per UNIFIED_LAUNCH_PLAN MK1/MK2
3. TRUST.md compliance posture (2 days) — admit gaps publicly (matches Anthropic's own Trust Center pattern of admitting Cowork-excluded-from-audit-logs)
4. Per-surface quickstarts (6 × 0.5 day = 3 days) — unblocks public MVP launch
5. CHANGELOG per surface (4 days) — unblocks store submissions
6. SKILL_AUTHORING / PLUGIN_AUTHORING / MCP_AUTHORING (8 days) — required to monetize differentiator #1 (multi-provider) into an ecosystem
