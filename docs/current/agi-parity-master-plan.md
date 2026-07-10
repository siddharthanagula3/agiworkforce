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

- Research corpus in `docs/research/` (claude.ai live audit, component spec, competitor changelogs, visual gaps). The comprehensive reverse-engineering doc (architecture/flows/screens/components/streaming/runtime/prompt-pipeline/routing/state/shared-packages/platform-adapters/design-decisions) is assembled at **`docs/architecture/reverse-engineering/`** (index: [`README.md`](../architecture/reverse-engineering/README.md)). It now covers all required sections: areas 1–10 (architecture, shared packages, runtime/routing, streaming, data/sync, state, platform adapters, UI/design system, competitor mapping, design decisions), **area 11 the per-capability reverse-engineered → implementation → parity status matrix** for this plan's capability list, and **area 12 screens/user-flows/layout/interaction patterns**. Statuses are honestly downgraded to Partial/Gap where this plan or the live audits flag them; keep it updated as waves land.

## Execution model

Continue the wave pattern already in use: scoped worktree agents per capability/surface, each (1) researches official behavior, (2) implements against the shared package (no new dup), (3) is verified end-to-end by a separate agent/Playwright with screenshots, (4) merges only on green gates + the Validation Checklist. Coordinator (main loop) sequences to avoid file conflicts (chat-shell area single-owner at a time), merges, and keeps `main` green.

## Wave queue (post current in-flight)

Progress log (session 2026-07-10, all on `chore/repo-restructure-2026-07`, each gate-verified — tsc 0 + web suite + boundaries):

- ✅ **Composer parity** (`7eae67658` and predecessors): one-row no-overflow layout, plus-menu tools, Chat/AGI-Work toggle, model picker — live-verified 1440 + 375px.
- ✅ **Web search + persistence** (`751877973`): honest web-search toggle + fixed the stale-Bearer-on-long-stream bug (long answers were 401/CSRF-403 dropped on save; now fetch a fresh token at save time). Live-verified persist-across-reload.
- ✅ **Artifact viewer parity** (`d9f02a9ed`): type-specific header, eye/code pill gated to renderable, real content-keyed version chip, copy/export menu, empty + render-error states; fixed a duplicate-download + binary-doc-corruption bug.
- ✅ **Reasoning/thinking persistence** (`bdbdf2798`): fixed metadata-wholesale-replace that erased thinking on block-close; persists "Thought for Ns" across reload; multi-block reasoning flow.
- ✅ **Citations** (`6cbe3e042`): dedupe by real provider URL, stable numbering, favicons, "N sources" — no placeholders.
- ✅ **Media rendering** (`0dce24674`, `97ac9f701`): raster images render inline w/ lightbox + broken-image fallback (fixed sanitize schema stripping `data:`/`blob:` image srcs); PDF viewer given a real validated source + honest fallback (fixed markdown-text-as-PDF-src bug + sandbox-crashes-data-URL bug). PDF byte pipeline on web still unwired (honest fallback until then).
- ✅ **Reverse-engineering docs + capability parity gap board** (`089c9beea`): `docs/architecture/reverse-engineering/` (index + areas 1–12), honest done/partial/gap status per capability.
- ✅ **Consolidated signed-in live-verification checkpoint** — done; caught + fixed the P0 first-turn render race, 375px composer overlap, and citation-snippet issues that unit tests missed.
- ✅ **Per-model reasoning/effort capability system** (`dbf0fce79`…`9d2613fb7`): `reasoning` schema on all 57 served models (control type, supported efforts, request paths, sourced from `docs/research/reasoning-effort-capability-matrix-2026-07-10.md`); GPT-5.6 Sol/Terra/Luna as grayed non-routable `coming_soon` entries with exact pricing (incl. long-context tier); availability-invariant guardrail (`check:availability-invariant`, proves non-live ∉ 173 routable refs); real effort bugs fixed (Haiku 4.5 thinking suppressed → proper budget; Gemini 3.x → `thinkingLevel` with 2.5 wire preserved; Opus 4.8 adaptive both id forms); adaptive per-model effort flyout. Live-verified signed-in (chips per model, Haiku toggle, 5.6 disabled + user-facing tooltip).

- ✅ **Deep research parity** (`309e480ac`, `9f8e03273`, `490380831`, `267bc3263`, `7dce143c8`): multi-turn research loop on the chat-completions route (plan → bounded search rounds → cited synthesis; iteration/search/wall-clock budgets, env-tunable), ResearchActivity UI (phase + elapsed + search/source counts), cancel→interrupted persistence of partials, honest empty-synthesis error. Live-verified signed-in on gemini-3.5-flash: multi-round activity, budget-forced synthesis, cited report (30 sources, [n] citations) persisting across reload. Live verify also exposed + fixed GOOGLE-SSE-CRLF-FRAMING-01 (google adapter dropped ALL CRLF-framed Gemini content — every google stream affected, not just research; see known-flaws).
- ✅ **Desktop artifact dedup** (`e6ca5e76d`, audit extraction #10): deleted desktop ReactPreview/Spreadsheet/Presentation forks (−625 LOC) onto shared unified-chat renderers; ported markdown slide rendering + sandbox security tests + `component` artifact type INTO the shared package. Desktop in-app visual pass still owed at the desktop parity sweep.

- ✅ **URL fetch** (`33d9500ad`, `49a8738bf`, `fa729228a`, `f9a917803`): SSRF-guarded `url_fetch` function tool (redirect-hop validation, timeout/size/content-type caps, readability extraction, honest truncation/errors) on the tool loop's auto path; Search toggle implies fetch; executes inside deep-research gathering rounds with sources deduped into the shared citation list; 46+6 tests. Fix wave: Gemini 400 mixing built-in grounding + function tools → `toolConfig.includeServerSideToolInvocations` (both-kinds requests only, byte-stable otherwise) + documented dummy `thoughtSignature` on replayed tool_use (also unblocks plain Gemini-3 multi-turn function calling; full-fidelity signature continuity tracked as GEMINI-FUNCTIONCALL-THOUGHT-SIGNATURE-01 in known-flaws). Live-verified in the signed-in UI: Gemini + search + URL → "Fetched a page" + grounded answer, no 400.
- ✅ **Rendering parity: spreadsheet/presentation/email** (`04fec03b5`, `f11e44751`): shared RFC-4180 CSV parser (real tool-emitted CSV previously showed "Invalid spreadsheet data"), sort/sticky-header/copy/row-cap, CSV download via existing artifact menus; presentation keyboard nav + dots + working fullscreen; email chrome for the `email` type (renderer ready; no producer exists yet — honest). 31 tests; visually verified light+dark against the real ArtifactPreview. Deferred: ArtifactPanel's simpler table render could adopt parseTabular; authed model-generated artifact E2E.

Remaining queue:

1. Delete the used `.agents/skills/*` (frontend-design, seo-geo, ai-seo, programmatic-seo, web-design-guidelines) after max-value extraction (SEO/GEO/AEO already merged `98fdb14ab`).
2. Capability wiring gaps (grounded, from the gap board): sandbox (E2B fallback metered), file-creation/generated-file byte pipeline on web (unblocks the PDF/image byte path), tool-call/result rendering polish. Deep-research follow-ups: OpenAI path has 0 sources on chat-completions (`web_search_preview` is Responses-only — pair with the at-GA Responses work), google `legacy-web` usage reconciliation now feasible (usage chunks flow post-CRLF-fix). Composer model/toggle prefs reset on new chat/reload (LOW, seen repeatedly in live QA).
3. Rendering parity remainder: spreadsheet, presentation, email, code-block chrome (image + PDF + citations + thinking DONE this session).
4. Message-lifecycle unification (shared status enum, persisted interrupted/cancel/continue).
5. Cross-surface parity (the Stop hook's largest open area — only web addressed so far): desktop v3 + mobile onto shared chat core; then VSCode/CLI/Chrome capability verification — each needs its own surface tooling (Tauri / XcodeBuildMCP / etc.).
6. Roll marketing redesign across all 105 pages (after founder aesthetic sign-off).

## Founder-gated

- Aesthetic sign-off on the marketing redesign before site-wide rollout.
- Canonical legal address (Austin vs Sheridan). Models-picker approach confirmation. P7 pricing. Stripe price IDs. Fresh keys already provided (5 live).

## Restructure — remaining-duplication extraction sequence (from `docs/research/remaining-duplication-audit-2026-07-10.md`, 2026-07-10)

Sequenced trust-boundary-first, then safe migrations, then new packages — and demo-web-safe: nothing that destabilizes the live, just-polished web chat runs before the demo.

- **DEFERRED (post-demo, deliberate) — #1 web chat-shell consolidation (~5,600 LOC fork, the single biggest dup):** web `/chat` routes render the forked `WebChatPage.tsx` + local `ChatMessageList`/`MessageBubble`/`ChatComposerNew`; the shared `unified-chat` `ChatInterface` path (`UnifiedChatPage`/`WebShellV3`) exists but is wired to zero routes; desktop already consumes `ChatInterface`. The correct end-state is web on the shared shell too — BUT the claude.ai composer-parity work just landed on the LIVE fork (`ChatComposerNew`/`MessageBubble`/`WebChatPage`), and the shared web path is unverified/dormant. Rushing this pre-demo would rework the parity work and risk the working chat. **Decision:** do NOT blindly promote the dormant shell. The extraction is a careful multi-step refactor — (a) port the composer-parity + message-render fixes INTO `unified-chat` `ChatInput`/`MessageList` so all surfaces gain them, (b) verify the shared `ChatInterface` end-to-end on web (Playwright), (c) point web routes at it and delete the fork. Run it as its own verified wave AFTER the demo. The composer parity must be carried into unified-chat, not lost.
- **Safe extractions (post-demo-critical, low web risk), in order:** #2 delete desktop parallel `StripeService` → route through web `/api/checkout` (trust-boundary, small, high-value); #10 delete desktop artifact-component forks → import shared `unified-chat` renderers (desktop-only, ready); #5+#9 collapse desktop/mobile memory + projects stores onto `unified-chat` stores (sync rules already shared); #3 connector catalog → new `packages/connectors` (+ Rust codegen); #7 headless search-service → `packages/services`; #4 `@agiworkforce/api-client` (needs-design); #6 `@agiworkforce/telemetry` (needs-design); #8 settings sections lift (largest spread, mobile headless design) — last.
- **NOT duplication (do not chase):** tool loop (Rust crate vs TS, mobile delegates), Clerk auth refresh (per-platform correct), billing tier/usage math (already one source: `billing-catalog.ts`), skills (`packages/skills` shared), plugins (web-only), files/notification/storage delivery (platform-bound).
