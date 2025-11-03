# AGI Workforce Milestone Execution Plan

## References
- Development Plan v2.1 (see `AGI_Workforce_Complete_Development_Plan.md`, Milestones Â§1-18)
- PRD v4.0 (see `AGI_Workforce_PRD_v4_0.md`, Launch Readiness Â§8, Success Metrics Â§2)

## Guiding Targets (PRD v4.0)
- Hit v1.0 launch in 90 days with all 16 MCPs live.
- Maintain <0.1% crash rate and >95% task success during internal & paid betas.
- Achieve cost transparency: real-time per-task cost dashboard and <\$0.0002 average task cost.
- Support Product-Led Growth funnel: ready for 20 internal users by Day 45, 50 paid beta users by Day 60.
- Ensure security posture acceptable for public launch (milestone 18 hard gate).

## Global Pre-Flight TODO
- [ ] Confirm dev environments (Windows focus, macOS/Linux secondary) & shared .env secrets vault.
- [ ] Stand up CI matrix (`pnpm lint`, `pnpm typecheck`, `pnpm --filter @agiworkforce/desktop exec vitest run`, cargo checks, Playwright smoke placeholder).
- [ ] Create central test data fixtures for conversations, automation tasks, settings.
- [ ] Define documentation cadence (weekly changelog, milestone demo notes, updated README references).
- [ ] Align agent responsibilities (see below) and communication channel (#product-dev).

## Cross-Cutting Workstreams & Agents
| Workstream | Description | Lead Agent(s) | Notes |
|------------|-------------|---------------|-------|
| Frontend (React/Tauri UI) | Desktop shell, chat UX, MCP frontends | Codex (primary), Gemini UI Agent | Coordinate with Tailwind design system tasks. |
| Backend (Rust + SQLite) | MCP commands, LLM router, API | Claude (Rust), Gemini Analysis Agent | Pair with Perplexity for doc updates. |
| Automation MCP QA | Windows, browser, filesystem, etc. | Claude QA, Codex QA, Gemini Automation | Establish sandbox VMs early. |
| Documentation & Knowledge | Docs, in-app help, PRD deltas | Perplexity Doc Agent | Weekly audit to keep artifacts fresh. |
| Security & Compliance | Sandbox execution, logging, guardrails | Claude Security Agent, Human QA | Start threat modeling by Milestone 11. |

## Milestone Roadmap & TODOs
Status legend: `[ ]` not started, `[~]` in progress, `[x]` done.

### Milestone 1 â€” Foundation & Infrastructure (Dev Plan Â§M1)
**Objectives:** finalize DB schema, logging, and core build tooling.

- [x] Implement SQLite schema + migrations (conversations, messages, settings, automation_history, overlay_events) â€” Claude.
- [x] Add `tracing-subscriber` JSON logging with rotation & Sentry wiring â€” Claude Security Agent.
- [x] Verify `pnpm test` scaffolding + placeholder suites (unit + integration folders) â€” Codex QA.
- [x] Smoke-test `cargo build`, `pnpm lint`, `pnpm --filter desktop exec vitest run` in CI â€” Codex.

**Testing:** Rust unit tests for DB layer, Vitest smoke, CI gating.
**Exit Gate:** DB auto-created on first run, base tests pass.

_Notes:_ OCR runtime remains optional; the default build disables the `ocr` feature to avoid native Tesseract dependencies, while stub commands provide user-facing messaging until feature flag is enabled.

### Milestone 2 â€” Core UI Shell (Dev Plan Â§M2)
**Objectives:** frameless window, title bar, tray, docking, design system.

- [x] Implement frameless Tauri window with persistence + multi-monitor support â€” Codex.
- [x] Build custom title bar, always-on-top toggle, tray menu actions â€” Codex + Claude (tauri commands).
- [x] Implement snapping/docking logic with persisted state â€” Codex.
- [ ] Stand up Tailwind design tokens + base Radix components + theme toggle â€” Codex & Gemini UI.
- [ ] DPI scaling regression suite (125%, 150%, 200%) manual checklist â€” Human QA.

**Testing:** Storybook/visual regression (or snapshot), Vitest component specs, manual dock tests.
**Exit Gate:** Window state persists, tray toggles, themes switch per acceptance criteria.

### Milestone 3 â€” Chat Interface (Dev Plan Â§M3)
**Objectives:** chat UI, Zustand stores, conversation management, mock backend.

- [x] Flesh out Zustand `chatStore` & `settingsStore` with persistence â€” Codex.
- [x] Implement virtualized message list + markdown/code rendering â€” Codex.
- [x] Build input composer (attachments, model selector) â€” Codex.
- [ ] Implement sidebar conversation UX (search, pin, rename, delete) â€” Codex.
- [x] Mock Rust chat commands returning deterministic responses â€” Claude.

**Testing:** Vitest for stores & components, Playwright E2E (create conversation, send message), DB persistence check.
**Exit Gate:** Conversations persist across restarts; 1000+ message scroll remains smooth.

### Milestone 4 â€” LLM Router & Cost Tracking (Dev Plan Â§M4)
**Objectives:** multi-LLM routing engine, cost telemetry, caching.

- [ ] Implement routing rules engine (provider selection, failover) in Rust â€” Claude.
- [ ] Integrate cost tracking (per message, per conversation) with DB â€” Claude + Perplexity for docs.
- [ ] Build in-app cost dashboard widgets â€” Codex.
- [ ] Add settings UI for router rules & API keys (with secure storage) â€” Codex.
- [ ] Establish unit/integration tests for routing + billing math â€” Claude QA & Gemini Analysis.

**Testing:** Rust integration tests with mocked LLM clients, Vitest UI tests (cost overlays), Playwright scenario (provider fallback).
**Exit Gate:** Accurate per-task cost appears within UI; router handles provider outage gracefully.

### Milestone 5 â€” Windows Automation MCP (Dev Plan Â§M5)
**Objectives:** Windows UI Automation end-to-end control via chat commands.

- [ ] Implement UIA wrappers (element search, interactions, focus management) â€” Claude.
- [ ] Create task DSL for button clicks, text entry, navigation â€” Claude.
- [ ] Build chat commands & UI for describing automation tasks â€” Codex.
- [ ] Log automation history entries into DB â€” Claude.
- [ ] Develop Windows VM automated tests (WinAppDriver/PowerShell harness) â€” Claude QA + Human QA.

**Testing:** Integration tests on Windows VM, telemetry verification, safety prompts for destructive actions.
**Exit Gate:** User can request â€œclick start menu and open Notepadâ€ via chat; logs stored with success flag.

### Milestone 6 â€” Browser Automation MCP (Dev Plan Â§M6)
**Objectives:** Playwright-driven browser workflows (Chrome/Edge), cookie/session management.

- [ ] Implement Playwright controller (launch, context isolation, auth) â€” Claude.
- [ ] Expose high-level chat commands (navigate, fill forms, scrape) â€” Codex.
- [ ] Add browser artifact preview (screenshots, extracted data) â€” Codex.
- [ ] Capture decision history in automation log â€” Claude.
- [ ] Create Playwright test suite (headless + headed) for key flows â€” Codex QA + Gemini Browser Agent.

**Testing:** Playwright scenarios (login, data entry), security review for credential handling.
**Exit Gate:** Chat-driven â€œlog into example app and capture tableâ€ demo works in beta env.

### Milestone 7 â€” Code Editor MCP (Dev Plan Â§M7)
**Objectives:** Monaco-based editor, diff/patch flows, integration with repo actions.

- [x] Embed Monaco editor with multi-file tabs, syntax support - Codex.
- [x] Implement Rust backend for file read/write, diff previews - Claude.
- [x] Support code generation artifact insertion from chat - Codex.
- [x] Add versioning/undo safety (snapshot + revert) - Claude.
- [x] Build unit tests (Vitest) and integration tests (Rust) for file operations - Codex QA, Claude QA.

**Exit Gate:** Users can ask agent to edit code file and review diff before applying.

### Milestone 8 â€” Terminal MCP (Dev Plan Â§M8)
**Objectives:** Embedded terminal with PTY support, command history, safe execution.

- [ ] Implement PTY bridge (Tokio) with stream handling â€” Claude.
- [ ] Build terminal UI (xterm.js) with session management â€” Codex.
- [ ] Introduce sandbox policies + confirmation prompts for risky commands â€” Claude Security.
- [ ] Persist session transcripts for audit â€” Claude.
- [ ] Automated tests for command execution, prompt injection detection â€” Claude QA.

**Exit Gate:** Chat can request â€œrun npm installâ€ and stream terminal output with guardrails.

### Milestone 9 â€” Filesystem MCP (Dev Plan Â§M9)
**Objectives:** File exploration, CRUD, search, upload/download hooking.

- [ ] Implement Rust file service (list, read/write, delete with recycle bin) â€” Claude.
- [ ] Build UI file browser & search with filters â€” Codex.
- [ ] Integrate permission prompts & safe zones â€” Claude Security.
- [ ] Add unit tests for path sanitization, integration tests for operations â€” Claude QA.

**Exit Gate:** User can browse directories, view files, and execute safe file operations.

### Milestone 10 â€” Database MCP (Dev Plan Â§M10)
**Objectives:** Connect to SQLite/Postgres/MySQL, run queries, visualize results.

- [ ] Build DB connection manager with credential storage â€” Claude.
- [ ] Implement query runner with result grids + saved queries â€” Codex.
- [ ] Provide schema explorer + ER diagram placeholders â€” Codex.
- [ ] Add integration tests hitting local sample DBs â€” Gemini Data Agent + Claude QA.

**Exit Gate:** Chat-driven request runs SQL against sample DB and returns structured output.

### Milestone 11 â€” API MCP (Dev Plan Â§M11)
**Objectives:** REST/GraphQL client, authentication support, response inspection.

- [ ] Implement HTTP client with templated requests/signing â€” Claude.
- [ ] Build UI for request builder, history, and environment variables â€” Codex.
- [ ] Add response viewers (JSON tree, headers, latency) â€” Codex.
- [ ] Contract tests using mocked servers, Postman parity â€” Claude QA.

**Exit Gate:** Users can define API calls, execute, and reuse them safely.

### Milestone 12 â€” Communications MCP (Dev Plan Â§M12)
**Objectives:** Email/SMS/slack-style communications automation.

- [ ] Integrate IMAP/SMTP + provider SDKs (Gmail, Outlook) â€” Claude.
- [ ] Build templates + scheduling UI â€” Codex.
- [ ] Implement chat-driven email triage workflows â€” Codex + Claude.
- [ ] Add unit tests with mocked providers + manual QA on sandbox accounts â€” Gemini Comms Agent.

**Exit Gate:** Agent can draft/send email from chat with audit log and confirmation.

### Milestone 13 â€” Calendar MCP (Dev Plan Â§M13)
**Objectives:** Calendar sync, meeting scheduling, conflict resolution.

- [ ] Connect to Google & Microsoft calendar APIs â€” Claude.
- [ ] Implement availability visualization + suggestion algorithm â€” Codex.
- [ ] Build reminders and follow-up actions â€” Codex.
- [ ] Integration tests against sandbox calendars, timezone regression cases â€” Gemini Calendar Agent.

**Exit Gate:** Chat can book meeting, handle conflicts, and sync updates bi-directionally.

### Milestone 14 â€” Productivity MCP (Dev Plan Â§M14)
**Objectives:** Task/project management integrations (Notion, Trello, Jira).

- [ ] Build connectors for top productivity tools w/ OAuth â€” Claude.
- [ ] Create Kanban-like overview UI inside desktop app â€” Codex.
- [ ] Support task creation/update workflows via chat â€” Codex.
- [ ] Regression suite covering CRUD operations per provider â€” Gemini Productivity Agent.

**Exit Gate:** Users manage tasks across providers from AGI Workforce with reliable sync.

### Milestone 15 â€” Cloud Storage MCP (Dev Plan Â§M15)
**Objectives:** Integrate Dropbox/Drive/OneDrive for file operations.

- [x] Implement storage adapters (SDK auth, file streaming) â€” Claude.
- [x] Build unified storage browser with previews â€” Codex.
- [x] Add large-file upload/download with pause/resume â€” Codex.
- [x] Load/Stress tests for 1GB transfers, checksum validation — Gemini Perf Agent.

**Exit Gate:** Cloud files accessible/manipulable with proper audit/logging.

### Milestone 16 â€” Document MCP (Dev Plan Â§M16)
**Objectives:** Advanced document parsing, OCR (extends screen capture), summarization.

- [ ] Expand OCR pipeline (language packs, accuracy metrics) â€” Claude.
- [ ] Implement document ingestion (PDF, DOCX) with parsing + annotation â€” Codex.
- [ ] Hook into chat for summarize/translate commands â€” Codex.
- [ ] Accuracy/regression tests (golden docs) â€” Codex QA + Perplexity Doc Agent.

**Exit Gate:** Documents can be ingested and manipulated with high OCR accuracy (>90%).

### Milestone 17 â€” Mobile Companion MCP (Dev Plan Â§M17)
**Objectives:** iOS/Android companion app for notifications, lightweight control.

- [ ] Stand up React Native/Flutter app skeleton with auth â€” Mobile Contractor + Gemini Mobile Agent.
- [x] Implement push notifications and quick actions â€” Mobile team.
- [x] Sync conversation context and MCP triggers â€” Claude (API), Codex (desktop hooks).
- [x] Mobile unit tests for state management and manual test plan

**Exit Gate:** Mobile app receives workflow alerts and can trigger core MCPs remotely. Status: ✅

### Milestone 18 â€” Security & Polish (Dev Plan Â§M18)
**Objectives:** Final hardening, telemetry, accessibility, release packaging.

- [ ] Complete threat modeling + penetration testing â€” Claude Security Agent.
- [ ] Implement permissioning, audit dashboards, and kill-switches â€” Claude.
- [ ] Finalize accessibility audit (WCAG 2.1 AA) â€” Codex + Human QA.
- [ ] Package installers (Windows MSI, macOS DMG, Linux AppImage) w/ code signing â€” Claude + Release engineer.
- [ ] Run release readiness checklist (PRD Â§8 Launch Readiness) â€” Product Lead.

**Exit Gate:** All launch checklist items complete, release candidate signed and smoke-tested.

## Monitoring & Reporting
- Weekly milestone stand-up: track checkbox status, blockers, and risk burndown.
- Maintain rolling burndown chart (velocity vs. 13-week timeline).
- Update PRD and Development Plan with amendments after each milestone review.

## Validation Strategy
- Every milestone requires: unit tests (Rust/TS), integration/E2E coverage, manual scenario validation, and documentation update.
- Beta readiness (Day 45, Day 60) checkpoints map to milestones 8 & 12 respectivelyâ€”ensure gating tests automated in CI.
- Success metrics tracked via telemetry dashboard (task success %, crash rate, cost) beginning Milestone 4.




