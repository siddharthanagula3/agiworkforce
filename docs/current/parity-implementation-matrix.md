# Parity Implementation Matrix

Status: Current
Owner: Founder + platform lead
Last updated: 2026-08-09

This is the implementation-facing parity matrix for AGI. It turns the high-level source of truth into feature, option, component, contract, and surface requirements that technical agents can execute without inventing their own product.

Use this with `docs/current/source-of-truth.md`. If they conflict, update both in the same change.

## How To Use

Each implementation agent should:

1. Pick one row or one tightly related group of rows.
2. Inspect the listed AGI paths before editing.
3. Verify competitor behavior from the listed source or the reference libraries at
   `/Users/siddhartha/Desktop/references-2`,
   `/Users/siddhartha/Desktop/claude_reference`, and
   `/Users/siddhartha/Desktop/chatgpt_reference` when the row depends on UI
   parity.
4. Implement the smallest end-to-end slice: UI control, state/store, backend/runtime path, persistence, permission/trust label, and test.
5. Mark incomplete behavior as a tracked gap. Do not claim parity from placeholder UI or passing typecheck alone.

The cross-product capability intake is tracked separately in
`audit/capability-gaps.csv`. It captures runtime and enterprise gaps that are
not necessarily visible UI differences and records explicit defer/decline
decisions so screenshot comparison does not silently expand product scope.

Status labels:

- `Present`: code exists and is wired enough to verify.
- `Partial`: code exists but is incomplete, placeholder, stale, or not end-to-end.
- `Missing`: no reliable implementation found in this audit.
- `Gated`: intentionally hidden behind feature flag, waitlist, invite, or trust-boundary control.

Surface abbreviations:

- `W`: Web
- `D`: Desktop
- `M`: Mobile
- `CLI`: terminal/agent CLI
- `VSC`: VS Code extension
- `CHR`: Chrome extension

## 2026-07-16 Mounted Frontend Reconciliation

The detailed current frontend contract is `docs/current/frontend-experience-contract.md`; the sanitized live Claude evidence is `docs/research/claude-live-frontend-system-2026-07-16.md`.

The table below records production mounts and end-to-end reality found by the 2026-07-16 source audit. It supersedes older optimistic row text elsewhere in this file when they conflict. A source file, mock route, feature flag, or component is not capability evidence without a production mount and runtime path.

| Capability                        | W                    | D                                                                                                                          | M                          | CLI                                                                                                                                   | VSC                                       | CHR                                      |
| --------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------- |
| Primary shell                     | Present              | Present                                                                                                                    | Present                    | Present                                                                                                                               | Present                                   | Present                                  |
| Chat/history                      | Present              | Present across Local/BYOK/Cloud, Cloud path still incomplete                                                               | Present across Local/Cloud | Developer sessions, not consumer history                                                                                              | Developer sessions through CLI app-server | Separate browser-task history            |
| AGI Work run (composer mode)      | Present              | Present                                                                                                                    | Present                    | N/A                                                                                                                                   | N/A                                       | Workflow UI is not Cloud Work            |
| Standalone Cowork session surface | Missing              | Missing                                                                                                                    | Missing                    | N/A                                                                                                                                   | N/A                                       | N/A                                      |
| Projects                          | Present              | Present                                                                                                                    | Present                    | Workspace only                                                                                                                        | Workspace only                            | N/A                                      |
| General file ingestion            | Partial              | Partial/Present                                                                                                            | Partial                    | Developer files                                                                                                                       | Developer context                         | Images/screenshots only                  |
| Artifacts/viewers                 | Present/Partial      | Present/Partial                                                                                                            | Partial                    | Developer files/diffs only                                                                                                            | Developer files/diffs only                | Missing                                  |
| Search/research                   | Present/Partial      | Present/Partial                                                                                                            | Partial                    | Tool-driven                                                                                                                           | Workspace search                          | Page operations, no research run         |
| Tools/approvals                   | Present/Partial      | Present/Partial                                                                                                            | Present/Partial            | Present                                                                                                                               | Present                                   | Present/Partial                          |
| Voice                             | Dictation input only | Composer voice; system-wide dictation honestly gated off (corrected 2026-08-09, cell was stale "broken system-wide claim") | Voice conversation present | Present (REPL voice: cpal capture, Whisper API/local binary, Local-mode egress gate — corrected 2026-08-05, cell was stale "Missing") | Missing                                   | Speech input only                        |
| Remote developer control          | Missing              | Companion components unmounted                                                                                             | Missing                    | Host relay missing                                                                                                                    | Host relay missing                        | Native bridge is not Code Remote Control |

Critical evidence:

- Web production chat is `apps/web/features/chat/pages/WebChatPage.tsx`; `UnifiedChatPage.tsx` and `features/chat/v3/WebShellV3.tsx` are unmounted alternatives.
- Desktop production shell is `apps/desktop/src/features/v3/DesktopShellV3.tsx`. AGI Code (`CodeWorkspace`, 3-pane IDE) was mounted into it on 2026-08-04, Local-only. CORRECTED 2026-08-05: `cowork` is no longer "a placeholder" — the restructure removed it entirely (`V3Mode` is literally `'chat'`); a Cowork mode is future scope, not a mounted stub. SPLIT 2026-08-06: the old single "First-class Work/Cowork run" row scored Missing on all three consumer surfaces, which conflated two different things. **AGI Work** — the composer-mode dispatch — is Present and wired end to end: `apps/web/lib/workflows/start-cloud-agent-workflow.ts` with durable server-side execution, `apps/web/app/tasks/page.tsx`, `apps/mobile/app/(app)/agents/index.tsx`, and `DesktopShellV3.tsx:24-34,774`, plus the desktop scheduler (`sys/commands/scheduler.rs`, registered `lib.rs:808-845`; `AgiWorkScheduled.tsx` mounted at `DesktopShellV3.tsx:811`) and mobile→desktop dispatch (`services/coworkDispatch.ts`, invoked `App.tsx:627`; `v1FeatureFlags.ts:87,92` default-true). What remains Missing is only the **standalone Cowork session surface** — a dedicated resumable async workspace rather than a mode inside chat. Its real sub-gaps are tracked under Section 14 of `audit/master-checklist-gap-audit-2026-08-05.md`, not by scoring the whole capability Missing.
- Mobile no longer advertises the hardcoded-empty Code Sessions surface. Managed
  Cloud code execution remains available inside chat and generated output remains
  available through Artifacts; cross-device developer-session control is missing.
- VS Code's primary chat uses the CLI app-server while code-action/provider-stream settings retain a second execution path.
- Chrome's production `apps/extension/src/side_panel.ts` is a 9,359-line ownership hotspot (count refreshed 2026-08-05; the split remains open tracked debt — the 2026-08-05 Class-1 pass fixed its 9 user-facing defects without attempting the split). Quick mode's previously cosmetic persistence is fixed: outgoing turns carry the preference and the Managed Cloud boundary applies the admitted `auto-economy` route without mutating the saved picker selection. The monolith split remains open.
- Chrome restricted-page UX now keeps Managed Cloud chat usable, shows an accessible restriction notice, and disables only page context/browser automation instead of silently removing the visible state.
- `packages/ai/model-registry/catalog/harnesses.json` remains the authority for `wired`, `partial`, and `unwired` runtime capability states.

## 2026-08-01 Founder Scope Decisions (Mobile Missing Surfaces)

Decided by the founder on 2026-08-01 against the 22 missing-surface findings of
the mobile parity audit (backlog: `~/Desktop/mobile-parity-backlog-2026-08-01.md`
§Missing Surfaces; P0/P1 remediation tracked in CHANGELOG and PLAN.md). These
decisions add tracked scope; none of it is built until its row says so.

**Build (11):** Apple Health vertical (MS-1, needs HealthKit plugin +
entitlements — external gate), Parental account linking (MS-19, needs a new
account-linking server contract), Trusted contact flow (MS-20, real enrolment
replaces the dead announcement card), StoreKit purchase + restore (MS-5,
external gate: App Store Connect products; billing flag stays honest until the
flow is real), Location capability (MS-6, expo-location + coarse-location
preference, strictly excluded from Local Mode), Background/lock-screen voice
(MS-13, UIBackgroundModes audio + surviving session), Safety model fallback
(MS-16, retry path first, then the toggle), Code sessions (MS-3, blocked on a
real host-relay contract — build the contract, not a placeholder screen),
Remote-control device grants (MS-18, requires promoting session keys to
revocable device grants), Per-site browser permissions (MS-17, scoped to the
real in-app browser path), Live video/screen share in voice (MS-4, needs a
streaming media contract; screen capture never available in Local Mode without
explicit egress consent).

**Not built:** Finances hub (MS-21) — recorded as an unbuilt reference
capability, no empty destination ships.

**Resolved concept:** Plugins on mobile is permanently the Connectors surface
(MS-2); the drawer gains a Connectors entry point (MS-22) and the Plugins
matrix row scopes mobile out by decision, not omission.

**Also decided the same day:** the model picker stays in the "+" sheet and the
stacked control row — it does NOT need to be persistently visible (founder
reversed the earlier always-stack call the same evening; the composer keeps
its compact single-line pill). `claude-sonnet-5` low/medium effort is
catalog-correct (economy route, `3044350c5`) and the desktop tests follow the
catalog (resolved same day). Priority shifted the same evening: desktop Cloud
mode parity with web, verified through the wdio e2e harness, outranks the
remaining mobile P1/P2 queue.

## 2026-08-01 Completion Standard (Founder)

Goal, superseding the reference-parity goal: across the six shipping surfaces
**nothing is unwired, zero stubs, zero partial features**. Scope decisions
taken with it:

- **Surfaces held to the bar:** Web, Desktop, Mobile, CLI, VS Code, Chrome —
  the canonical six. `apps/slack-app` and `apps/github-app` are inventoried but
  not driven to zero in this program.
- **The 190 `missing` ledger rows:** build the ones that leave a dead end or a
  half-experience in a flow users actually reach. Purely un-started
  capabilities remain tracked scope, not defects. (46 of those rows arrived by
  reclassification out of `partial`/`stub`/`unwired`, so they are not
  automatically out of scope.)
- **Server contracts:** when a client fix needs a route, schema field, or auth
  shape that does not exist, build **both sides** — the `apps/web` contract and
  the client wiring — so the feature is end-to-end rather than an honest half.
  This authorizes, for example, making `/api/settings/sessions` bearer-aware
  for Desktop and adding a mobile content-report intake route.
- **Order:** Desktop to zero first (it is the demo surface), then the rest.
- **`audit/inventory.json` is not evidence.** It currently claims
  `partial=0/stub=0/unwired=0/broken=0` against a baseline of `62/13/30/10`;
  the arithmetic shows 46 items were reclassified rather than built, and
  independent sweeps keep finding live counterexamples. The ledger is corrected
  to match verified code at the end of this program, and the checker then
  enforces reality.

## 2026-08-05 Class-1 Closure Status (autonomous pass, fastest-first)

Per-item detail and evidence live in `docs/agent-context/known-flaws.md`
(dated 2026-08-05 sections); this records surface status only. Every closure
was independently verified (build + tests + code-read; web additionally driven
live via Playwright).

- **CLI — autonomous Class-1 at zero** (7/7: dead composable router cut per
  Decision #23/OQ-1; `/worktree` `/approve` `/raw` `/subagents` `/task` wired;
  verbose/debug real; session archive/unarchive/delete with confirmation;
  MCP add/remove/enable/disable with input validation; 1,838 tests green).
- **Chrome — autonomous Class-1 at zero** (9/9 user-facing fixed/cut; 1,429
  tests green; monolith split remains tracked debt, not a defect).
- **Web — autonomous Class-1 at zero** (theme toggle re-verified working —
  earlier "dead control" report retracted as a render-timing false alarm;
  Team-yearly wired fail-closed pending Stripe Price; `/agi-work` rewritten to
  the shipped feature).
- **Desktop — batch-1 at zero** (honest local-whisper gating, dead speech
  module cut, memory-decay bridge fixed, PdfEditor + Google Batch fully cut,
  symbol indexer cut, customize-nav premise stale/locked with test; `/git`
  slash panel NOT actionable — surface archived, product decision pending).
  Batch-2 (Fn-dictation honesty, progressive artifact streaming, CAP-032
  orphan sweep) in flight.
- **Mobile — autonomous Class-1 at zero** (7/7 incl. notification dead-end
  repoint, canonical provider-switch gate, privacy-manifest correction
  [code-read only — verify on next prebuild], rgba sweep + lint enforcement,
  TTS dead-state migration, content-report intake end-to-end, real fork/branch
  relation). Remaining Mobile items are external-gated (StoreKit, HealthKit,
  background-voice entitlement, device-grants host-relay, connector OAuth
  backend).
- **VS Code — autonomous side complete** (the one stub is unreachable and
  fail-closed by design, annotated in-code 2026-08-05; the substantive gap is
  the signed-CLI-distribution/bootstrap story — release infrastructure, not
  extension code).

Open cross-surface blockers awaiting the consolidated founder decision round
are tracked in the Class-1 task ledger, not re-listed here.

## 2026-08-05 Founder Decisions (Sequencing, Scope, Work-Run Correction)

Decided by the founder on 2026-08-05:

- **Ordering supersession:** the six surfaces are completed
  shortest-remaining-work-first — estimate remaining Class-1
  (partial/unwired/stub/broken) work per surface, complete the fastest surface
  first, then the next fastest, until all six are at zero. Supersedes this
  file's 2026-08-01 "Desktop to zero first" bullet and Decision #20's old
  serial order. The routing substrate (registry dated pricing + OpenAI
  cache-write billing, ExecutionPlan/CPST design doc, CPST telemetry,
  rules-based router) completes before surface closure begins.
- **Electron cloud-only shell is in scope** for the completion bar alongside
  Tauri (kept per the "one surface, two shells" architecture).
- **Class-2 scope:** dedicated deep research and a hosted plugin registry are
  approved builds (`audit/capability-gaps.csv` CAP-045/CAP-046), starting after
  Class-1 closure; in-chat commerce/checkout is declined (CAP-047). The
  2026-08-01 mobile Build list (incl. Apple Health MS-1) stands.
- **Work-run row correction (2026-08-05 code audit; runtime verification
  pending):** the 2026-07-16 "First-class Work/Cowork run: Missing" W cell is
  stale. Web AGI Work is production-mounted and substantially working: the
  composer Chat|AGI Work toggle in `ChatComposerNew.tsx` is gated by the
  `agi_work` billing capability client- and server-side; `applyWorkMode()`
  (request-processor.ts) forces web_search/web_fetch/code_execution into the
  real tool loop; durable initial turns are on by default; run history is
  mounted at `/tasks` backed by `cloud_agent_runs`; approvals UI exists inline
  and on Tasks; deliverables surface in `WorkSessionPanel`; Mobile and Desktop
  consume the same contract. Remaining gaps: no structured goal-intake UI; the
  visible "plan" is generic phase text, not a model-authored editable plan;
  custom E2B execution stays staged behind `AGI_E2B_EXECUTION` per Decision
  #22 (provider-native sandboxes serve by default); the `/agi-work` marketing
  page describes a separate, unshipped Desktop dispatch product (waitlist
  CTAs) — a naming collision to resolve. The row flips to Present/Partial only
  after runtime/UI verification per the Definition Of Done.
- **AGI Work scope (founder, 2026-08-05):** complete the Work shape on Web —
  structured goal-intake UI, model-authored editable plan surface, `/agi-work`
  naming-collision fix (executes within the web Class-1 pass, CAP-048) — AND
  build the Desktop dispatch/scheduled-routines product the `/agi-work` page
  advertises (CAP-049, after Class-1; depends on the host-relay/remote-control
  contract MS-3/MS-18).
- **Creation-four approvals (founder, 2026-08-05, all after Class-1):**
  Sites-style publishing (CAP-015 resolved as Wire: CloudPublisher + public
  serving route + web share UI on the existing `publishArtifact` service);
  Live artifacts (CAP-050); Design workspace v1 — mount the orphaned
  `CanvasWorkspace` whiteboard (CAP-051; full artboard/layers/prototype/deck
  parity remains a separate future decision); AI-powered artifacts (CAP-052 —
  approved despite security sensitivity; a security design review proving
  WEB-13 stays closed is a hard precondition).
- **Full-localization requirement (founder, 2026-08-05):** switching the app
  language must translate the ENTIRE surface — every user-facing string routes
  through i18n, every supported locale carries every bundle and key, no
  hardcoded UI literals. Audit at decision time (web): locales en/es/hi; es is
  key-complete vs en; hi is missing 4 of 7 bundles (`auth`, `chat`, `models`,
  `pricing`); only 5 of 490 TSX component files use i18n at all, so the
  settings LanguageSelector currently changes a small fraction of visible text
  — a false control under the completion standard. Mechanical guard added:
  `pnpm check:i18n-parity` (scripts/check-i18n-parity.mjs) enforces
  bundle/key parity per locale (currently red on hi, truthfully); hardcoded
  literals need the Class-1 i18n wiring pass plus a jsx-no-literals-style lint
  scoped to user-facing components. Mobile and desktop carry i18n dependencies
  with unaudited coverage — same requirement applies per surface.
  confirmed by founder same day):\*_ Team is $25/seat/mo and $240/seat/yr
  (Decision #22, founder-confirmed 2026-08-05 — superseding the earlier
  $30/$299 figure and the Pro-pinned $20 working-tree value). Yearly checkout
  is not yet wired: add `STRIPE*PRICE_TEAM_YEARLY*_`support end-to-end in the
web Class-1 pass, and verify the Stripe dashboard unit_amount behind`STRIPE_PRICE_TEAM_MONTHLY_USD` is $25.00 (catalog/Stripe mismatch fails
  checkout closed). Team INR remains founder-undecided (₹1,999 currently
  configured; flag, not a contradiction).

## Global Product Rules

| Rule                                             | Applies to             | Required implementation behavior                                                                                                                                                                                                                                               | AGI anchors                                                                                               |
| ------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| One AGI suite, six surfaces                      | W, D, M, CLI, VSC, CHR | Every feature must declare the surfaces it supports and the sync/trust boundary it crosses.                                                                                                                                                                                    | `packages/contracts/types/src/suite-contracts.ts`, `docs/agent-context/repo-map.json`                     |
| One chat, not split file-chat vs normal-chat     | W, D, M                | The same conversation accepts normal prompts, selected files, reference files, images, project context, tools, artifacts, and generated files. File-focused work is a conversation state, not a separate product.                                                              | `apps/web/features/chat`, `apps/desktop/src/features/v3`, `packages/ui/unified-chat`                      |
| Local/BYOK/Managed are separate trust boundaries | All                    | Local never silently routes to BYOK/Managed. Local to BYOK is explicit fork with selection, scan, preview, label, and consent. Managed cloud is public alpha, open by default (2026-06-27; env kill-switch only); it stays subscription/entitlement-gated, not waitlist-gated. | `packages/contracts/types/src/suite-contracts.ts`, `apps/cli/src/agent/mod.rs`, `apps/mobile/stores/chat` |
| Model IDs are catalog-owned                      | All                    | UI selectors, tests, route defaults, provider adapters, and docs read from `packages/contracts/types/src/models.json` and capability metadata. No invented/hardcoded current model IDs.                                                                                        | `packages/contracts/types/src/models.json`, `packages/contracts/types/src/model-catalog.ts`               |
| Feature completion requires an end-to-end path   | All                    | A feature is not complete unless user action reaches service/runtime, returns a visible result, persists when required, and has test/visual verification.                                                                                                                      | `docs/agent-context/commands.json`, `docs/agent-context/known-flaws.md`                                   |

## Chat Shell And Empty State

| Component / option        | Surfaces               | Competitive target                                                                                                           | AGI requirement                                                                                                                                               | Current AGI status                                                                                             |
| ------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Empty chat input          | W, D, M                | ChatGPT/Claude empty state with central message box and quick action affordances.                                            | Input box must be first screen, with plus, file attach, model selector, mic, send/stop, and visible mode/provider label.                                      | Partial: Desktop v3 composer has input/plus/model/mic/send; Web/Mobile need parity pass.                       |
| Plus menu                 | W, D, M, CHR           | ChatGPT plus opens upload/tools/apps; Claude add menu opens Files/Skills/Connectors/Plugins in Cowork references.            | Plus menu must expose file, image/photo/screenshot where supported, tools/apps/connectors, skills, project sources, and safe unavailable states.              | Partial: Desktop has composer controls and connector work, but not complete unified plus menu across surfaces. |
| File symbol / attachments | W, D, M, CLI, VSC, CHR | ChatGPT supports file uploads; Claude projects/artifacts support files; Codex/Claude Code accept file refs/images.           | Attachments must carry privacy mode, source surface, size/type, redaction/scan status, and storage scope.                                                     | Partial: generated-file contracts exist; one-chat reference-file flow incomplete.                              |
| Model dropdown            | W, D, M, CLI, VSC      | ChatGPT/Claude/Codex expose model switchers and effort/thinking controls.                                                    | Dropdown reads catalog/capabilities, shows provider, mode, model, context/tool/image capabilities, local availability, BYOK key state, and managed gate.      | Partial: shared model catalog and Desktop popover exist; hardcoded drift still exists in some tests/providers. |
| Mic / voice               | W, D, M, CLI, CHR      | ChatGPT voice supports mobile/web/desktop voice, separate/integrated modes, voices, background behavior, retention controls. | Mic must distinguish dictation vs live voice conversation; include voice choice, speed, subtitles/transcript, retention/training controls, and privacy label. | Partial: CLI voice and extension side-panel voice code exist; suite-wide voice settings incomplete.            |
| Send / stop               | W, D, M, CLI, VSC, CHR | All major chat/code products support send, streaming, stop/cancel, retry.                                                    | Send creates a typed request with mode/provider labels; stop cancels stream/tool execution and records interrupted state.                                     | Partial: chat streams exist; cross-surface stop semantics need audit.                                          |
| Recent chats              | W, D, M                | ChatGPT/Claude sidebars show history/search/projects; desktop refs show recents.                                             | Sidebar shows recent conversations, temporary chats, project chats, pinned/moved/deleted states, and sync status.                                             | Partial.                                                                                                       |
| Account menu              | W, D, M                | User initials/name/account with settings/help/logout/language/feedback.                                                      | Account chip must show initials, name, workspace/account, feedback, settings, language, help, learn more, logout.                                             | Partial: settings/account exist, IA incomplete.                                                                |

Sources: ChatGPT capabilities and file/voice/tool overview, ChatGPT macOS Chat Bar, ChatGPT projects, Claude artifacts/projects, OpenAI Codex IDE features, Claude Code overview, local Claude reference folder.

## Messages And Conversation Actions

| Component / option             | Surfaces               | Competitive target                                                                                                | AGI requirement                                                                                                                                        | Current AGI status                                    |
| ------------------------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| User/assistant message bubbles | W, D, M, CLI, VSC, CHR | ChatGPT/Claude message stream with Markdown/code/math/media/tool traces.                                          | Message renderer supports Markdown, code, tables, math, citations, attachments, artifacts, tool calls, provider labels, and privacy labels.            | Partial.                                              |
| Streaming states               | W, D, M, CLI, VSC, CHR | Streaming text, thinking/tool progress, stop button, retry on failure.                                            | Persist stream lifecycle: queued, running, tool_wait, completed, interrupted, failed.                                                                  | Partial.                                              |
| Message actions                | W, D, M                | Copy, edit, regenerate/retry, branch, feedback, share, save to project/source.                                    | Actions must preserve provenance, branch/fork semantics, and trust boundary.                                                                           | Partial.                                              |
| Temporary chat                 | W, D, M                | ChatGPT temporary chat avoids memory/history reference/update.                                                    | Temporary conversations must not update memory, sync only when policy allows, and visibly carry temp label.                                            | Partial: Web temporary-store bug fixed in this audit. |
| Branch/fork conversation       | W, D, M, CLI, VSC      | Claude edit/fork and Codex follow-up/cloud continuation.                                                          | Branching must record source, selected context, redaction/preview hash when crossing trust boundary.                                                   | Partial.                                              |
| Feedback                       | W, D, M                | Thumbs/reason feedback and account-level feedback entry.                                                          | Capture rating, reason, optional text, message ids, provider/model, privacy mode, no raw local content unless consented.                               | Partial.                                              |
| Structured result tables       | W, D, M, CLI           | Claude desktop references show sortable/paginated structured results; ChatGPT data analysis returns tables/files. | Tool/model tabular output should render as a sortable table with pagination when large, export/download where allowed, and visible source/trust label. | Missing/Partial.                                      |

## Models, Providers, And Routing

| Component / option        | Surfaces          | Competitive target                                                              | AGI requirement                                                                                                                                                                                                                                                                                  | Current AGI status                                                                      |
| ------------------------- | ----------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Local model mode          | D, M, CLI, VSC    | AGI differentiator; Claude/OpenAI do not make this first-class in consumer app. | Detect local providers such as Ollama/LM Studio/local runtime, show installed/running state, never require AGI account for local.                                                                                                                                                                | Partial: CLI/provider dispatch and mobile local gates exist; Desktop needs complete UX. |
| BYOK mode                 | D, CLI, VSC       | AGI differentiator.                                                             | Provider key setup, encrypted/local storage where applicable, direct provider label, usage/cost disclosure, explicit Local-to-BYOK fork. Web and Mobile v1 do not expose BYOK.                                                                                                                   | Partial: Desktop Models/Keys and developer surfaces need hardening.                     |
| Managed cloud mode        | W, D, M, CLI, VSC | ChatGPT/Claude/Codex managed compute baseline.                                  | Public alpha, open by default (2026-06-27); subscription/entitlement-gated, not waitlist-gated. Ledgering/abuse/billing controls keep pace but no longer gate access. `AGI_MANAGED_COMPUTE_PRIVATE_BETA` env is a kill-switch only. UI should label public alpha and not over-claim full GA/SLA. | Public alpha.                                                                           |
| Mid-chat model switch     | W, D, M, CLI, VSC | ChatGPT/Claude/Codex allow model changes in composer/session.                   | Switching within same trust boundary is allowed; crossing Local to BYOK/Managed requires fork/preview/consent.                                                                                                                                                                                   | Partial.                                                                                |
| Reasoning/thinking/effort | W, D, M, CLI, VSC | Claude thinking/effort; Codex low/medium/high effort.                           | Expose only when model/provider capability supports it; persist per message/session; show cost/speed tradeoff.                                                                                                                                                                                   | Partial: Desktop thinking badge; broader routing incomplete.                            |
| Capability-aware tools    | All               | Frontier apps expose tools only when model/tool/runtime can support them.       | Tool options must reflect provider capabilities: function calling/tool use, vision, image generation, search, code execution, file creation, structured output.                                                                                                                                  | Partial.                                                                                |
| Auto-routing              | All               | Competitors route internally; AGI must be explicit.                             | Auto-routing must explain chosen provider/model, ask before trust-boundary crossing, and never silently substitute from Local.                                                                                                                                                                   | Partial/Gated.                                                                          |

Code anchors: `packages/contracts/types/src/models.json`, `packages/contracts/types/src/model-catalog.ts`, `packages/contracts/types/src/suite-contracts.ts`, `packages/ai/providers`, `apps/web/core/ai/llm`, `apps/cli/src/models`, `apps/desktop/src/features/settings/tabs/ModelsKeys`.

## Files, Artifacts, Canvas, And Generated Outputs

| Component / option              | Surfaces               | Competitive target                                                                                                            | AGI requirement                                                                                                                                                                                                                                              | Current AGI status                                                                        |
| ------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| File upload / local file select | W, D, M, CLI, VSC, CHR | ChatGPT file upload; Claude project knowledge; Codex image/file refs.                                                         | Support file select, drag/drop, screenshot/photo where native, type/size limits, virus/secret scan where relevant, preview, remove, and storage label.                                                                                                       | Partial.                                                                                  |
| Reference files in one chat     | W, D, M                | User explicitly wants no separate reference-file chat.                                                                        | Attach/reference existing files inside normal chat; allow per-message and conversation-level context chips.                                                                                                                                                  | Missing/Partial.                                                                          |
| Project files / sources         | W, D, M                | ChatGPT and Claude projects group files/instructions/chats.                                                                   | Project sources include files, links, saved responses, app links/connectors, and instructions; project memory respects project boundary.                                                                                                                     | Partial.                                                                                  |
| Generated files                 | W, D, M                | ChatGPT data analysis/output files; Claude artifacts export; Codex generated file previews.                                   | Every generated file has `ComputeSession`, `GeneratedFile`, `ArtifactManifest`, checksum, MIME, TTL/retention, owner, privacy/provider mode, and deletion behavior.                                                                                          | Present/Partial: shared contracts and Desktop document paths exist; UI parity incomplete. |
| Artifact side panel             | W, D, M                | Claude artifacts open in right-side dedicated window, with source/preview/copy/download/version/error-fix.                    | Sidecar/panel must support preview/source, copy/download, open deep workspace, version/history, multi-artifact list, and error-fix prompt.                                                                                                                   | Partial: Web sidecar and Desktop artifact workbench exist.                                |
| Canvas/document editing         | W, D, M                | ChatGPT Canvas for co-writing/code editing; Claude artifacts for standalone content.                                          | AGI should support editable writing/code canvases, inline suggestions, versioning, and export.                                                                                                                                                               | Partial/Missing depending surface.                                                        |
| Visual design workspace         | W, D, M                | Local Claude reference shows Claude Design-style canvas, artboards, prototype mode, files/assets, and deck/design generation. | AGI-owned workspace with pan/zoom canvas, artboards, layers/assets/files, properties panel, prototype/deck preview, versioning, selected-object iteration, export, and artifact trust labels. Mobile can start with preview/share only if explicitly scoped. | Missing/Gated.                                                                            |
| AI-powered artifacts            | W, D                   | Claude AI-powered artifacts and artifact MCP/storage.                                                                         | Gate by capability and trust mode; artifacts that call models/tools require user/auth/permission and clear usage billing mode.                                                                                                                               | Missing/Gated.                                                                            |
| Persistent artifact storage     | W, D                   | Claude artifact storage personal/shared.                                                                                      | Define storage scope, quota, retention, publication state, personal/shared isolation, delete/unpublish behavior.                                                                                                                                             | Partial.                                                                                  |

Sources: Claude artifacts official help, ChatGPT capabilities, ChatGPT projects, OpenAI Codex app/IDE features.

## Search, Research, And Citations

| Component / option            | Surfaces          | Competitive target                                                | AGI requirement                                                                                                   | Current AGI status                                                           |
| ----------------------------- | ----------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Web search                    | W, D, M, CLI, VSC | ChatGPT Search; Codex web_search; Claude web/research references. | Search tool must show query, status, result list, citations, freshness, provider/source, and whether live/cached. | Partial: Web Perplexity search path and Desktop inline search results exist. |
| Deep research                 | W, D, M           | ChatGPT deep research; Claude research-like flows.                | Multi-step plan, source queue, citations panel, progress states, report artifact, export, and retry.              | Partial/Missing.                                                             |
| Global app search             | W, D, M           | ChatGPT/Claude sidebars and project search.                       | Search chats, projects, artifacts, files, settings, connectors, and allowed memories; preserve trust boundary.    | Partial/Missing; reference docs say prior global search was stubbed.         |
| Citations panel               | W, D, M           | Search/research answers show sources.                             | Citations must map to message spans/results and survive reload/export.                                            | Partial.                                                                     |
| Internal/app connector search | W, D, M           | ChatGPT apps with search/sync; Claude connectors.                 | Apps can search third-party data only with explicit connector permission and context label.                       | Partial.                                                                     |

## Projects And Workspaces

| Component / option   | Surfaces         | Competitive target                                                      | AGI requirement                                                                                                    | Current AGI status |
| -------------------- | ---------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------ |
| Create project       | W, D, M          | ChatGPT/Claude projects with name/icon/color/instructions/files/chats.  | New project modal/page with name, icon/color, privacy mode, provider mode, instructions, sources, members if team. | Partial.           |
| Project memory       | W, D, M          | ChatGPT project memory and Claude project knowledge/RAG.                | Project-only vs default memory behavior, source visibility, chat/file scoping, and shared-project isolation.       | Partial/Missing.   |
| Move chat to project | W, D, M          | ChatGPT move/drag chats into projects.                                  | Move action must update context, instructions, memory boundary, and sync.                                          | Partial/Missing.   |
| Project sources      | W, D, M          | Files, saved responses, app links/connectors.                           | Sources list supports upload, app links, saved responses, remove, refresh, permission state.                       | Partial.           |
| Project sharing      | W, D, M          | ChatGPT Business/Enterprise and Claude Team/Enterprise project sharing. | Private/team/org share, permissions, invite, audit, no leakage of personal memories.                               | Gated/Partial.     |
| Developer projects   | CLI, VSC, D Code | Codex projects/worktrees, Claude Code project scopes.                   | Workspace roots, local dirs, worktrees, branch prefix, repo connection, permission profile.                        | Partial.           |

Sources: ChatGPT projects official help, Claude projects official help, Codex app features.

## Memory And Personalization

| Component / option                    | Surfaces | Competitive target                                           | AGI requirement                                                                                                                  | Current AGI status                               |
| ------------------------------------- | -------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Saved memory                          | W, D, M  | ChatGPT saved memories; Claude personalization.              | View/add/edit/delete, disable, account/workspace scope, privacy-mode scope.                                                      | Partial: shared MemoryEditor exists but limited. |
| Reference chat history                | W, D, M  | ChatGPT memory can reference chat history.                   | Toggle reference chats; search relevant past chats; generate memory from history; exclude temporary/private chats.               | Missing/Partial.                                 |
| Project memory                        | W, D, M  | Project-only memory in ChatGPT, project knowledge in Claude. | Memory must respect project and sharing boundary.                                                                                | Partial/Missing.                                 |
| Import memory from other AI providers | W, D, M  | User-specified AGI feature.                                  | Provide prompt/instructions for exporting from other provider, import review screen, dedupe, edit, approve, start import button. | Missing.                                         |
| Custom instructions/profile           | W, D, M  | ChatGPT custom instructions/profile; Claude personalization. | Full name, what AGI should call you, work description, instructions/preferences.                                                 | Partial.                                         |
| Temporary chat excludes memory        | W, D, M  | ChatGPT Temporary Chat.                                      | Temporary chats neither reference nor update saved/chat-history memory.                                                          | Partial.                                         |

Sources: ChatGPT memory official help/FAQ, ChatGPT projects, Anthropic personalization, local Claude reference settings captures.

## Connectors, Apps, MCP, Plugins, And Skills

| Component / option           | Surfaces               | Competitive target                                                      | AGI requirement                                                                                                    | Current AGI status                                     |
| ---------------------------- | ---------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Connector/app directory      | W, D, M, CLI, VSC, CHR | ChatGPT Apps directory; Claude connectors; Codex plugins.               | Directory with categories, search, details, connect/install, permissions, admin policy, connected list.            | Partial: Desktop connector gallery exists.             |
| Apps with search             | W, D, M                | ChatGPT apps can search/reference third-party services.                 | User can invoke via @ mention, plus menu, or automatic "load tools when needed" policy; show connector label.      | Partial.                                               |
| Apps with sync               | W, D, M                | ChatGPT apps with sync index selected sources.                          | Sync must have plan gate, admin control, delete/disconnect behavior, memory implications, and data controls.       | Missing/Partial.                                       |
| Write actions                | W, D, M, CHR, CLI, VSC | ChatGPT apps require confirmation; Claude/Codex permissions.            | External writes require confirmation, target preview, permission scope, audit trail, and rollback where possible.  | Partial.                                               |
| Local MCP servers            | D, CLI, VSC            | Claude Desktop local MCP; Claude Code MCP.                              | Add/config/edit/view logs, status, OAuth where available, per-tool permissions, local path restrictions.           | Partial.                                               |
| Remote MCP/custom connectors | W, D, CLI, VSC         | Claude custom connectors using remote MCP; ChatGPT custom apps via MCP. | URL/auth headers, OAuth/bearer token, timeout, SSL, tool discovery, permission review, admin allow/deny.           | Partial: Desktop custom remote MCP dialog exists.      |
| Plugins                      | D, CLI, VSC, CHR       | Codex plugins, Claude plugin-style references.                          | Bundle apps/skills/MCP servers, categories, install/update/uninstall, trust policy, marketplace/source controls.   | Partial.                                               |
| Skills                       | W, D, CLI, VSC         | Claude skills/customization and Codex skills.                           | Skill directory, create/import/edit, slash/menu invocation, project/user scope, permission limits, testing/evals.  | Partial.                                               |
| Tool access mode             | W, D, M, CLI, VSC      | User controls when tools/connectors load.                               | Settings must support load tools when needed, always/ask/off, connector discovery, and per-conversation overrides. | Partial: Desktop capabilities settings has first pass. |

Sources: ChatGPT apps/connectors, ChatGPT apps with sync, Anthropic MCP/local MCP/custom connectors, Claude Code MCP/settings, Codex app features.

## Scheduled Tasks, Automations, Dispatch, And Cowork

| Component / option  | Surfaces       | Competitive target                                         | AGI requirement                                                                                                         | Current AGI status                                                                                                                                                                                               |
| ------------------- | -------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scheduled tasks     | W, D, M, CHR   | ChatGPT Tasks; Claude/Cowork scheduled; Codex automations. | Create/edit/pause/delete, one-time/recurring/API trigger, notification/email/push, run history, failure state.          | Partial: Desktop `AgiWorkScheduled` (renamed from the deleted `CoworkScheduled`, corrected 2026-08-09) and Chrome scheduled tasks exist; suite parity incomplete.                                                |
| Thread automations  | D, CLI, VSC, W | Codex thread automations preserve thread context.          | Schedule a recurring wake-up on the same thread with context retention and trust labels.                                | Partial/Missing.                                                                                                                                                                                                 |
| Project automations | D, CLI, VSC, W | Codex automations run in background worktrees/projects.    | Background worktree/session per project, schedule, prompt, permissions, notifications, result artifact/PR.              | Partial/Missing.                                                                                                                                                                                                 |
| Dispatch            | D, M, W        | Claude Cowork Dispatch reference and user requirement.     | Accept tasks from mobile/web/extension, require confirmation, output list, notification, handoff to Desktop/local host. | Partial (corrected 2026-08-09 — the `CoworkDispatch` page component was deleted): the surviving desktop dispatch path is the `services/coworkDispatch.ts` runtime plus its `settings/tabs/Cowork` enable toggle. |
| Live artifacts      | D, W           | Claude Cowork live artifacts.                              | Long-running/live artifact state, refresh, share/publish, owner/session.                                                | Partial/Missing.                                                                                                                                                                                                 |
| Customize hub       | D, W           | Claude Cowork customize skills/connectors.                 | Central hub for skills, connectors, plugins, task templates, permissions.                                               | Partial.                                                                                                                                                                                                         |

Sources: ChatGPT tasks, Codex app automations/worktrees, local Claude Desktop/Cowork references.

## Settings IA

This is a locked AGI IA target. Agents must not invent new top-level settings categories unless a current decision changes this list.

| Section       | Required options/components                                                                                                                                                                                                                                                                                                            | Current AGI status                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| General       | Profile, full name, what AGI should call you, work description, instructions/preferences, appearance, chat font, voice, voice speed, notifications, response/completion/code preferences, code permission requests, AGI Code emails, web, dispatch, dispatch messages.                                                                 | Partial.                                              |
| Account       | Logout all devices, delete account, subscription cancellation warning, organization ID, active sessions, device, location, created, updated.                                                                                                                                                                                           | Partial.                                              |
| Privacy       | Location, metadata, improve AGI, data export, shared chats, memory preferences, reference chat search, generate memory from history, view/manage memory, import memory.                                                                                                                                                                | Partial/Missing.                                      |
| Billing       | Current plan, adjust plan, payment/Stripe link, invoices table, due date, total, status, action.                                                                                                                                                                                                                                       | Partial/Missing by surface.                           |
| Usage         | Current session, weekly limits, credits spent, monthly spend limit, current balance, auto reload.                                                                                                                                                                                                                                      | Partial/Missing.                                      |
| Capabilities  | Tool access mode, connector discovery, visuals, artifacts, AI-powered artifacts, inline visualizations, code execution, file creation, network egress, domain allow list, skills.                                                                                                                                                      | Partial: Desktop has CapabilitiesSettings first pass. |
| Connectors    | Directory, connected list, MCP servers, OAuth, custom remote MCP, per-tool permissions, logs/config, details/uninstall.                                                                                                                                                                                                                | Partial.                                              |
| AGI Code      | Appearance/interface/form, transcript size, session state classification, local sessions, bypass permissions mode, remote control default, notification attention, worktree location, branch prefix, preview-first, persist previews, create PR automatically, autofix PR, auto-achieve after PR, authorization, dispatch/co-dispatch. | Missing/Partial.                                      |
| AGI in Chrome | Pairing, side panel, ask/act mode, saved prompts, workflow recording, page permissions, blocked sites, shortcut, native host status, file URL access, memory/browser-history controls.                                                                                                                                                 | Partial.                                              |
| Extensions    | Desktop extensions installed locally, filesystem, contact7/context7, desktop commander, Apify, app notes, Excel/local apps, configure/details/uninstall.                                                                                                                                                                               | Partial.                                              |
| Developer     | MCP config/logs, hooks, skills/plugins, provider diagnostics, feature flags, local runtime logs, sandbox/network allowlist, crash reports.                                                                                                                                                                                             | Partial.                                              |

Code anchors: `apps/desktop/src/features/settings`, `apps/mobile/src/features/settings`, `apps/web/features/settings`, `packages/contracts/types/src/suite-contracts.ts`.

## Desktop Surface

| Mode / component      | Required behavior                                                                                                                                                                | Current AGI status                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat mode             | Full local/BYOK/managed-gated chat with unified composer, artifacts, files, model selector, settings, sidebar.                                                                   | Partial/strongest current desktop area.                                                                                                                                                                                                                                                                                                                                                     |
| AGI Work views        | Home, projects, scheduled tasks, live artifacts, dispatch, customize, task list/status, onboarding checklist, task composer.                                                     | Partial (corrected 2026-08-09 — the old "Cowork mode" row claimed `DesktopShellV3` "still shows placeholder for `cowork`"; that placeholder was deleted with the mode and the pages were renamed): `AgiWorkProjects`, `AgiWorkArtifacts`, and `AgiWorkScheduled` are rendered from `DesktopShellV3.tsx`; onboarding checklist, customize hub, and a standalone task composer remain absent. |
| Code mode / AGI Code  | Repo/folder dashboard, local folder add, branch/worktree, permissions, model/effort, usage plan, sessions, PRs, routines, terminal/actions, diff review.                         | Partial: `CodeWorkspace` (file tree, Monaco tabs, diff viewer) mounted in `DesktopShellV3` 2026-08-04, Local-only; dashboard, PRs, routines, terminal/actions remain absent.                                                                                                                                                                                                                |
| Sidebar               | Search, collapse/expand, new chat, projects, artifacts, recent chats, modes, account.                                                                                            | Partial.                                                                                                                                                                                                                                                                                                                                                                                    |
| Desktop app controls  | Run on startup, quick access, voice shortcut, menu bar, keep awake, browser use, computer use, accessibility, screen recording, extensions.                                      | Partial.                                                                                                                                                                                                                                                                                                                                                                                    |
| Local compute host    | File generation, MCP, local models, native messaging, browser/computer-use approvals.                                                                                            | Partial.                                                                                                                                                                                                                                                                                                                                                                                    |
| Cloud mode onboarding | Managed cloud is public alpha on Web, Mobile, and Desktop. Desktop DCL-4 selects the shared `CloudRuntime` only for explicit signed-in Cloud mode; Local + BYOK remain isolated. | Public alpha; shared backend wired.                                                                                                                                                                                                                                                                                                                                                         |

Primary paths: `apps/desktop/src/features/v3`, `apps/desktop/src/features/settings`, `apps/desktop/src/features/connectors`, `apps/desktop/src-tauri`, `packages/ui/unified-chat`.

## Web Surface

| Component          | Required behavior                                                                                                                                                                                                                                                             | Current AGI status |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Synced app chat    | ChatGPT/Claude-style chat with projects, files, artifacts, tools, settings, account.                                                                                                                                                                                          | Partial.           |
| Projects           | Create/manage/share/move chat/sources/project memory.                                                                                                                                                                                                                         | Partial.           |
| Artifacts          | Sidecar, cards, source/preview, export, share/publish gates.                                                                                                                                                                                                                  | Partial.           |
| Billing/usage      | Stripe/payment links, invoices, credits, limits. Managed cloud is public alpha (open by default); Team is a real, purchasable per-seat tier (reinstated 2026-07-11), not an interest list — only genuinely-unavailable hosted capacity should route to a request-access flow. | Partial/Gated.     |
| Connectors/apps    | Directory, OAuth/custom apps, sync/search/write action permissions.                                                                                                                                                                                                           | Partial/Missing.   |
| AGI Code dashboard | Repo selector, activity heatmap, sessions, PRs, routines, run history; managed cloud sessions are public alpha (entitlement-gated, not invite-gated).                                                                                                                         | Partial/Missing.   |
| Admin/team         | Organization policy, audit, connector controls, managed compute readiness.                                                                                                                                                                                                    | Partial/Gated.     |

Primary paths: `apps/web/app`, `apps/web/features`, `apps/web/core`, `apps/web/stores`, `services/api-gateway`, `apps/web/db/neon`.

## Mobile Surface

| Component              | Required behavior                                                                                                                                        | Current AGI status                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Local-first onboarding | Choose Local or Cloud (Mobile v1 does not expose BYOK). Cloud is public alpha — signed-in users use it now, no invite/waitlist; Local stays fail-closed. | Partial: Local + public-alpha Cloud (sign-in gated). |
| Mobile chat            | Same one-chat UX scaled to mobile: composer, model/mode, attachments, voice, artifacts preview/share.                                                    | Partial.                                             |
| BYOK handoff           | Local to BYOK reviewed fork with scan/preview/consent.                                                                                                   | Partial: tests and store paths exist.                |
| Approvals/continuity   | Approve Desktop/Code/Chrome tasks, review outputs, preview generated files.                                                                              | Partial/Missing.                                     |
| Heavy generation       | Mobile receives/previews/shares Desktop or managed outputs; not first heavy local generator.                                                             | Gated/Partial.                                       |

Primary paths: `apps/mobile/app`, `apps/mobile/src/features`, `apps/mobile/stores`, `apps/mobile/services`, `apps/mobile/lib/v1FeatureFlags.ts`.

## CLI And AGI Code

| Component / option   | Competitive target                                   | AGI requirement                                                                                                          | Current AGI status                                                                                                      |
| -------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Interactive REPL/TUI | Claude Code/Codex CLI interactive prompt.            | Slash commands, model/mode, memory, tools, permissions, hooks, sessions, voice, status.                                  | Partial.                                                                                                                |
| Privacy modes        | AGI differentiator plus Claude/Codex permissions.    | `/privacy-mode`, local block, `/continue-with-byok`, managed gate.                                                       | Present/Partial.                                                                                                        |
| Slash commands       | Claude Code slash commands and Codex slash commands. | Built-ins plus custom project/user commands; discoverable `/` menu; MCP prompt commands.                                 | Partial; `/worktree`, `/subagents`, `/task list`, `/approve`, `/raw` wired 2026-08-05.                                  |
| Permissions          | Claude Code permissions and Codex approvals.         | allow/ask/deny/workspace/network/bypass modes; sensitive file deny; per-tool audit.                                      | Partial; `/approve` alias over `PermissionStore` added 2026-08-05.                                                      |
| Hooks                | Claude Code hook events.                             | Pre/Post tool, notification, prompt submit, stop, subagent stop, compact, session start/end, config change where needed. | Partial/strong: hook coverage check passes.                                                                             |
| Subagents            | Claude Code/Codex subagents.                         | User/project subagents with separate context, tools, model, when-to-use metadata.                                        | Partial; read-only `/subagents` (model/tools/when-to-use) + `/task list` views added 2026-08-05.                        |
| MCP/plugins/skills   | Claude/Codex integrations.                           | Install/update/config/list/status, OAuth, logs, managed allow/deny, slash prompts.                                       | Partial; `/mcp add/remove/enable/disable/reconfigure/restart` over a validated writable registry added 2026-08-05.      |
| Sessions/worktrees   | Codex projects/worktrees and Claude sessions.        | Resume/fork/branch, worktree isolation, PR creation/review, diff preview, local/cloud continuation.                      | Partial; `agi session archive/unarchive/delete` (confirmation-gated) + `/worktree` list/create/remove wired 2026-08-05. |
| Voice                | Claude Code voice and AGI voice requirement.         | Dictation/transcription, local fallback, voice settings.                                                                 | Partial.                                                                                                                |

Primary paths: `apps/cli/src`, `crates/agiworkforce-*`, `packages/contracts/types/src/suite-contracts.ts`.

## VS Code Extension

| Component / option       | Competitive target                                                                             | AGI requirement                                                                                           | Current AGI status |
| ------------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------ |
| Sidebar/chat participant | Claude Code IDE and Codex IDE.                                                                 | Chat, edit, review/agent modes, model selector, effort, approvals, file context.                          | Partial.           |
| Editor context           | Codex IDE uses open files/selection and `@file`; Claude IDE shares selection/tabs/diagnostics. | Add current file/selection, @ file picker, diagnostics/problems, terminal capture, images/screenshots.    | Partial.           |
| Diff review/apply        | Claude/Codex IDE diff viewing and local apply.                                                 | Preview patch, accept/reject hunks, checkpoint/stash, apply cloud task locally.                           | Partial.           |
| Cloud/local continuation | Codex cloud delegation/follow-up, AGI Local/BYOK/Managed boundaries.                           | Cloud tasks public alpha (open by default); local conversation can hand off only with preview/consent.    | Partial.           |
| Settings                 | Models, approval mode, endpoint/provider, permissions, shortcuts.                              | Settings must not trust workspace config for sensitive endpoints or security policy without confirmation. | Partial.           |

Primary paths: `apps/extension-vscode/src`.

## Chrome Extension

| Component / option   | Competitive target                                                     | AGI requirement                                                                                                     | Current AGI status |
| -------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Side panel           | Claude in Chrome / Codex Chrome plugin.                                | Ask/act chat panel with page context, attachments, saved prompts, mode/provider label, native status.               | Partial.           |
| Page context capture | Chrome extension and Codex browser tasks.                              | Capture visible page/text/metadata/screenshot only with user-visible scope; page data is untrusted.                 | Partial.           |
| Browser actions      | Claude/Codex browser control.                                          | Per-site approval, allowlist/blocklist, high-impact confirmation, prompt-injection defenses, audit.                 | Partial.           |
| Workflow recording   | User requirement and current extension code.                           | Selector-only vs value-capture mode, visible recording state, secret/credential protections, replay approval.       | Partial.           |
| Native bridge        | Codex Chrome native app and AGI Desktop bridge.                        | Pairing, HMAC/session secret, reconnect, native host status, Desktop handoff, cloud invite unlock only behind gate. | Partial.           |
| Permissions/settings | Chrome permissions, file URL access, browser history, memory controls. | Explicit install permission copy, file URL toggle instructions, browser-history prompt, memories on/off behavior.   | Partial.           |

Primary paths: `apps/extension/src`, `apps/extension/native-host`, `apps/extension/THREAT_MODEL.md`.

## Billing, Usage, Waitlist, And Commercial Gates

| Component / option       | Required behavior                                                                                                                                                                                                   | Current AGI status |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Plan display             | Current plan, local/BYOK/free state, managed public-alpha status, adjust plan.                                                                                                                                      | Partial.           |
| Stripe/payment           | Payment link/checkout, invoices, due date, status, action.                                                                                                                                                          | Partial/Missing.   |
| Usage limits             | Current session, weekly limits, credits, monthly spend limit, current balance, auto reload.                                                                                                                         | Partial/Missing.   |
| Enterprise interest list | Early-access interest list for genuinely-unavailable hosted capacity only (managed cloud chat itself is public alpha, open; Team is a real, purchasable per-seat tier as of 2026-07-11, not an interest-list item). | Partial/Gated.     |
| Promo/invite codes       | Optional promo codes redeem plan credits/offers; they do NOT gate managed-cloud access (cloud is open public alpha).                                                                                                | Partial/Gated.     |
| Abuse/fraud controls     | Metering, quotas, refund/chargeback reserve, provider terms.                                                                                                                                                        | Missing/Gated.     |
| Enterprise               | Org policy, audit, SSO/SCIM, connector policy, managed-credit ledger, support workflow.                                                                                                                             | Partial/Gated.     |

Primary paths: `apps/web/features`, `apps/mobile/app/(app)/billing`, `services/api-gateway`, `packages/contracts/types/src/enterprise`, `apps/web/db/neon`.

## Competitor Deltas (verified 2026-07-09 — fold into rows on next full matrix pass)

Both vendors shipped major releases on 2026-07-09. Full sourced report: session scratchpad `competitor-changelogs-2026-07.md` (regenerate from the URLs below if absent). Screenshots in `/Users/siddhartha/Desktop/reference` win for UI/IA; official docs win for feature existence/naming.

- **ChatGPT Work (2026-07-09):** third agent mode beside Chat/Codex — goal in, hours of autonomous cross-connector work, finished docs/sheets/slides/"Sites" out. No matrix row exists; nearest AGI analog is the Cowork/dispatch surface. https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex
- **Codex merged into one ChatGPT desktop app** (Chat + Work + Codex modes, all plans): reword any "standalone Codex app" parity target — the one-app-multi-mode shape now matches AGI's own single-window philosophy. Old `developers.openai.com/codex/app/features` 308-redirects to `learn.chatgpt.com/docs/features`.
- **GPT-5.6 GA (Sol/Terra/Luna tiers)** replacing mini/nano naming. `models.json` tops out at gpt-5.5 — exact API IDs pending primary-source verification before any catalog change (SSOT rule).
- **ChatGPT Atlas browser sunsetting** into desktop app + Chrome extension (shutdown date UNVERIFIED, press-only).
- **Claude in Chrome GA (2026-07-01):** all paid plans, multi-tab group control, native-app navigation, saved-prompt shortcuts — raises the Chrome-extension parity bar above the old "preview" target.
- **Claude Cowork on web + mobile (2026-07-07, Max first):** async agent, cross-device review — both vendors converged on this shape; affects Dispatch/Cowork rows.
- **Claude Trusted Devices (2026-06-25):** remote control of Claude Code sessions from another device — no matrix row; relevant to AGI remote-control product spec.
- **Claude usage-recap personalization (2026-07-09):** monthly "reflect on how you use Claude" — no ChatGPT equivalent, no matrix row.
- Ledger-link rot: `docs.anthropic.com/en/docs/claude-code/*` soft-redirects to `platform.claude.com` (links resolve with an extra hop). ChatGPT release-notes pages 403 direct fetches — verify via cached search or alternate official hosts and mark UNVERIFIED when only cache-sourced.

## Required Research Ledger

Future agents updating parity must use official sources for current competitor claims and the local reference folder for visual/UI details.

OpenAI official sources:

- ChatGPT capabilities: https://help.openai.com/en/articles/9260256-chatgpt-capabilities-overview
- ChatGPT apps/connectors: https://help.openai.com/en/articles/11487775-connectors-in-chatgpt
- ChatGPT apps with sync: https://help.openai.com/en/articles/10847137
- ChatGPT projects: https://help.openai.com/en/articles/10169521-using-projects-in-chatgpt
- ChatGPT memory: https://help.openai.com/en/articles/8983136-what-is-memory
- ChatGPT memory FAQ: https://help.openai.com/en/articles/8590148-memory-faq
- ChatGPT tasks: https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt
- ChatGPT voice: https://help.openai.com/en/articles/8400625-voice-mode
- ChatGPT Canvas: https://help.openai.com/en/articles/9930697-what-is-the-canvas-featue-in-chatgpt-and-how-do-i-use-it
- ChatGPT macOS Chat Bar: https://help.openai.com/en/articles/9295241-accessing-the-launcher-chatgpt-macos-app
- Codex app features: https://developers.openai.com/codex/app/features
- Codex CLI features: https://developers.openai.com/codex/cli/features
- Codex IDE features: https://developers.openai.com/codex/ide/features
- Codex Chrome extension: https://developers.openai.com/codex/app/chrome-extension

Anthropic official sources:

- Claude Desktop install: https://support.anthropic.com/en/articles/10065433-installing-claude-for-desktop
- Claude projects: https://support.anthropic.com/en/articles/9517075-what-are-projects
- Claude artifacts: https://support.anthropic.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them
- Claude personalization: https://support.anthropic.com/en/articles/10185728-understanding-claude-s-personalization-features
- Claude local MCP desktop: https://support.anthropic.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop
- Claude custom remote MCP connectors: https://support.anthropic.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp
- Claude Code overview: https://docs.anthropic.com/en/docs/claude-code/overview
- Claude Code IDE integrations: https://docs.anthropic.com/en/docs/claude-code/ide-integrations
- Claude Code settings: https://docs.anthropic.com/en/docs/claude-code/settings
- Claude Code permissions/IAM: https://docs.anthropic.com/en/docs/claude-code/iam
- Claude Code hooks: https://docs.anthropic.com/en/docs/claude-code/hooks
- Claude Code subagents: https://docs.anthropic.com/en/docs/claude-code/sub-agents
- Claude Code slash commands: https://docs.anthropic.com/en/docs/claude-code/slash-commands
- Claude Code MCP: https://docs.anthropic.com/en/docs/claude-code/mcp
- Claude in Chrome: https://www.anthropic.com/news/claude-for-chrome

Local evidence:

- `/Users/siddhartha/Desktop/claude_reference/CLAUDE_REFERENCE.md`
- `/Users/siddhartha/Desktop/claude_reference/COMPARISON.md`
- `/Users/siddhartha/Desktop/claude_reference/claude/2026-05-13/manifest.md`
- `/Users/siddhartha/Desktop/claude_reference/claude/2026-05-15/claude-desktop-post-update-notes.md`
- `/Users/siddhartha/Desktop/claude_reference/**`

Do not copy proprietary source, screenshots, icons, text, or layouts exactly. Use these references to define AGI-owned feature parity and implementation requirements.

## Implementation Definition Of Done

A parity row is done only when:

- UI exists on the claimed surface with real controls, disabled states, empty/loading/error/success states, and responsive layout.
- State/store/service/runtime path is wired from user action to result.
- Trust boundary, provider label, and data retention behavior are visible where applicable.
- Persistence and reload behavior are correct where the feature claims history/sync.
- Tests cover core behavior and trust-boundary failure cases.
- Launch-critical UI has screenshot/e2e verification.
- The relevant row in this matrix or the active plan is updated from `Partial/Missing/Gated` to the verified state.
