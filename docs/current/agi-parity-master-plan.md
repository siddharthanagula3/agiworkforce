# AGI Suite — ChatGPT/Claude Parity + Capability-First Restructure (Master Plan)

Status: Active governing spec (founder directive 2026-07-10)
Owner: Founder + platform lead
Supersedes-for-priority: this is the top-level goal; `docs/plans/monorepo-restructure-2026-07-08.md`, `docs/current/parity-implementation-matrix.md`, `docs/current/unit-economics-and-pricing-model.md`, and `docs/research/claudeai-component-spec-2026-07-10.md` are its execution inputs.

## Goal

Make the six AGI surfaces (Web, Desktop, Mobile, VS Code, CLI, Chrome) behave as closely as possible to the CURRENT ChatGPT and Claude apps, for features that ALREADY EXIST in this repo. No new user-facing features — only make existing features production-ready. Capability-first shared architecture, zero duplication. Claude reference images are the primary UI reference.

## Non-negotiables (from the directive)

- **Scope discipline:** NO new features / no speculative roadmap. Internal infra only where it makes an existing feature production-ready.
- **Research before implementing:** official docs, Context7 MCP, WebSearch/WebFetch, curl to verify current behavior. Never rely on stale assumptions.
- **Verify end-to-end by another agent** — not "it compiles." Web=Playwright, Mobile=XcodeBuildMCP/Android, Desktop/CLI/VSCode/Chrome per their tooling. The per-task Validation Checklist (UI matches ref, E2E works, streaming, tool calls, artifacts/markdown/files/images render, sandbox, nav, state restore, loading/empty/error/retry/cancel, a11y not regressed, perf not regressed, no console/runtime errors, no leaks, no dup impls, shared packages = SSOT) must pass before "done."
- **Quality order:** 1 UI/UX · 2 E2E functionality · 3 reliability · 4 stability · 5 performance · 6 code quality · 7 maintainability.

## UX parity targets (existing features to match ChatGPT/Claude)

Web Search · Deep Research · URL Fetch · Artifact Rendering · Sandbox Execution · File Creation · Tool Calling · Tool Results · Thinking/Reasoning blocks · Markdown · Code · File Preview · PDF · Image · Spreadsheet · Presentation · Email rendering · Streaming (responses/tool-calls/artifacts) · Citations · Status/Progress/Error/Loading/Retry indicators · Cancellation · Continue Generation.

## Current state → directive mapping (as of 2026-07-10)

### Restructure (capability-first, no duplication) — LARGELY DONE

- Waves 0–5 complete on `main`: one provider layer (`packages/providers`), one MCP/LLM/agent-core Rust crate set (CLI+desktop), one sync-apply, one settings shell, cloud-contracts data seam, ts-rs protocol types. Provider/LLM/MCP/turn-loop de-duplicated across surfaces.
- UI consolidation ongoing: `@agiworkforce/ui` + `unified-chat` are the shared chat/primitive owners; web migrated; residual per-surface forks tracked. **Remaining dup to kill (this plan):** the last per-surface chat shells (desktop v3 / mobile RN via `unified-chat/core`), settings sections, connector catalog, billing tier math — see `docs/current/parity-implementation-matrix.md` + the roadmap in the (now-superseded-in-priority) core-UX plan.

### UX parity — IN PROGRESS

- **Composer/chat shell (web):** claude.ai parity in flight — one-row layout (no overflow), tools in the `+` plus-menu (persistent web-search toggle), Chat/AGI-Work toggle, Code tab removed, model picker (latest + Effort/More-models flyouts), assistant-always/user-hover message actions. Grounded in `docs/research/claudeai-component-spec-2026-07-10.md`.
- **Artifact viewer (web):** type-specific header, inline-vs-panel for small artifacts, eye/code pill, version chip — SPEC'd, build queued.
- **Streaming:** artifact content live-streaming + tool audit-trail landed; message-lifecycle status (queued/running/tool_wait/completed/interrupted/failed) unification still to do per matrix.
- **Web search / Deep research / Sandbox / File creation / rendering (PDF/spreadsheet/presentation/email):** per-capability parity + real backend wiring is the next wave set; the capability×provider build list is in `docs/current/unit-economics-and-pricing-model.md` §5 and the live-audit found web-search currently non-functional (being fixed).

### Verification — ESTABLISHED

- Live Playwright/browser audit of the running web app as a real Pro account is the standing verification method (found + drove fixes for delete-project, search-500, usage-ceiling, provider bugs, theme). Continue this per feature; extend to mobile/desktop/CLI/VSCode/Chrome tooling as those surfaces get parity passes.

### Documentation — STARTED

- Research corpus in `docs/research/` (claude.ai live audit, component spec, competitor changelogs, visual gaps). The comprehensive reverse-engineering doc (architecture/flows/screens/components/streaming/runtime/prompt-pipeline/routing/state/shared-packages/platform-adapters/design-decisions) is a deliverable of this plan — assemble from these inputs as surfaces reach parity.

## Execution model

Continue the wave pattern already in use: scoped worktree agents per capability/surface, each (1) researches official behavior, (2) implements against the shared package (no new dup), (3) is verified end-to-end by a separate agent/Playwright with screenshots, (4) merges only on green gates + the Validation Checklist. Coordinator (main loop) sequences to avoid file conflicts (chat-shell area single-owner at a time), merges, and keeps `main` green.

## Wave queue (post current in-flight)

1. Land composer parity + SEO/GEO/AEO (in flight) → then delete the used `.agents/skills/*` (frontend-design, seo-geo, ai-seo, programmatic-seo, web-design-guidelines) after max-value extraction.
2. Artifact-viewer parity build (spec-driven) + inline-vs-panel + type-specific headers + version history.
3. Capability parity + real wiring: web search, deep research, URL fetch, sandbox (E2B fallback metered), file creation, tool-call/result rendering, thinking blocks — each researched vs official docs, wired, Playwright-verified.
4. Rendering parity: PDF, image, spreadsheet, presentation, email, code-block chrome, citations.
5. Message-lifecycle unification (shared status enum, persisted interrupted/cancel/continue).
6. Cross-surface parity: desktop v3 + mobile onto shared chat core; then VSCode/CLI/Chrome capability verification.
7. Roll marketing redesign across all 105 pages (after founder aesthetic sign-off).
8. Assemble the comprehensive reverse-engineering documentation.

## Founder-gated

- Aesthetic sign-off on the marketing redesign before site-wide rollout.
- Canonical legal address (Austin vs Sheridan). Models-picker approach confirmation. P7 pricing. Stripe price IDs. Fresh keys already provided (5 live).
