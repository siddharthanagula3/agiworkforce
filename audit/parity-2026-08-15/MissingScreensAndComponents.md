# Missing Screens, Dialogs, Menus, Settings, and Components

Audit date 2026-08-15 · commit `e15df56e3` (`compliance/dpdp`), working tree clean.

## Scope and method

This document enumerates every absent screen, dialog, menu/context-menu,
setting, and reusable component identified across the parity audit's 16
domain passes and 9 screenshot teardowns of ChatGPT/Codex/Claude (288 real
screens). It is a synthesis, not new discovery — every row cites the domain
`.md`/`.json` file, inventory file, or `shots-*.md` line where the underlying
evidence lives.

**"Should exist" baseline.** Derived from `research/shots-codex-macos-settings.md`
(37 screens, the full Personal/Integrations/Coding/Archived settings tree,
approval/sandbox model, 99-row keyboard-shortcut catalog), `shots-codex-macos-shell.md`
(9 screens, sidebar/PR/Sites/Scheduled/Plugins), `shots-chatgpt-ios-shell-settings.md`
(34 screens), `shots-chatgpt-ios-health-voice-work.md` (44 screens, Health/Voice/Work/Remote),
`shots-chatgpt-web-macos.md` (37 screens across web settings + macOS app + Chrome
extension), `shots-codex-vscode-ios.md` (29 screens, VS Code extension + iOS
Remote), `shots-claude-desktop.md` (39 screens, Cowork task view + Record-a-Skill

- full settings tree), `shots-claude-web.md` (27 screens), and `shots-claude-ios.md`
  (31 screens).

**Status legend used in every table:**

| Status                                | Meaning                                                                                                                                                               |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Needed**                            | Absent, benchmark sets a bar, no tracked decision to skip it                                                                                                          |
| **Wiring, not building**              | The screen/dialog/component already exists in code — it just has no navigation entry, caller, or is bound to the wrong data source                                    |
| **Declined (`GAP-xxx`, Not Planned)** | Already adjudicated in `audit/ui-gaps.csv`'s 73 Not Planned rows with a written reason — **do not reopen**                                                            |
| **Correctly out of scope**            | A benchmark screen this audit's own domain passes explicitly recommend _not_ building (wrong product fit, unbuilt legal/safety infrastructure, or engagement theater) |

Per `CLAUDE.md` and this audit's own standards, every row below carries a
`path/file:line` or domain-doc citation. Nothing here is asserted from a
filename or a marketing page.

---

## A. Missing screens (per surface)

### A.1 Web

| Screen                                                                                        | Benchmark reference                                                                                                                         | Status               | Backend                                                                                                                                  | Evidence                                                                    |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Standalone Cowork/AGI-Work creation surface (independent of the chat composer's mode toggle)  | Claude's Home/Code tabs each a first-class destination (`shots-claude-web.md` §Home launcher); ChatGPT Work as a sibling mode to Chat/Codex | Needed               | Backend fully exists — `cloud-agent-run-service.ts` durable run journal is real and complete (`domain-agentic-work.md` Strengths #1)     | `domain-agentic-work.md` AGENTIC-WORK-006 / prior-art `P2-001`              |
| "Hand a task to an agent" Cloud Code screen — today `/chat/code` only sends terminal commands | Codex's Pull Requests/Sites/Scheduled/Plugins sidebar destinations (`shots-codex-macos-shell.md`); Claude Code web's agent session model    | Needed, P1           | Fully built — `apps/web/app/api/code/sessions/[sessionId]/agent/route.ts` (124 ln) + `agent/approvals/route.ts` (136 ln), zero UI caller | `domain-backend-runtime.md` BACKEND-RUNTIME-001                             |
| Chat export dialog reachable from the conversation header (currently Print-only)              | Standard export action in both competitors                                                                                                  | Wiring, not building | `EnhancedExportDialog.tsx` — complete multi-format (Markdown/PDF/DOCX) dialog, barrel-exported, zero importers                           | `domain-dead-code.md` §2.6 DEAD-CODE-009; `CurrentProductInventory.md` §2.7 |
| Knowledge-file version history view                                                           | — (internal consistency: the API already returns `version`)                                                                                 | Wiring, not building | Full version/supersede tracking server-side; zero UI reads `version`/`supersede`                                                         | `domain-projects-files.md` PROJECTS-FILES-006                               |

### A.2 Mobile

| Screen                | Benchmark reference                                                                | Status                                        | Backend                                                                                             | Evidence                                                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Skills catalog        | ChatGPT iOS Skills tab (`shots-chatgpt-ios-shell-settings.md` §Skills, screen 072) | **Wiring, not building** — the archetype case | Fully built, 655 lines: search, source badges, Cloud-mode gate, loading/error/empty states          | `done-claim-verification.md` GAP-001 REGRESSED; `domain-shell-nav-ia.md` SHELL-NAV-IA-003; `domain-extensibility.md` EXTENSIBILITY-001 |
| `widget-setup` screen | —                                                                                  | Wiring, not building (low severity)           | Screen exists, no nav entry, and no WidgetKit/AppWidget code exists to make a widget meaningful yet | `CurrentProductInventory.md` §3; `domain-dead-code.md` DEAD-CODE-018                                                                   |

### A.3 Desktop (Tauri)

| Screen                                                                                         | Benchmark reference                                                                                                                | Status                                                           | Backend                                                                                                                                                                                                              | Evidence                                                                                           |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Background-agent monitor/control panel (list, pause, resume, cancel, take-over, live progress) | Codex's agent-view dashboard (`claude-code-chrome-ide.md` §2.12, "full multi-session terminal dashboard"); Claude Cowork task rail | **Needed, P0** — the single flagship finding of this audit round | Full Rust subsystem: 8 parallel agents, complete state machine, 11 registered Tauri commands, 9 native events. UI listens to only 2 of 9 events (`completed`/`failed`) and cannot list/pause/resume/take-over at all | `domain-agentic-work.md` AGENTIC-WORK-001                                                          |
| Live full-duplex voice conversation screen                                                     | ChatGPT GPT-Live / Advanced Voice Mode; Claude Voice mode                                                                          | Needed, P1 (built, unwired — see §E)                             | `VoiceMode.tsx`, wake-word, barge-in, persona preview all real; zero live render calls anywhere in the app                                                                                                           | `domain-voice-media.md` VOICE-MEDIA-005; `known-flaws.md` `DESKTOP-VOICE-CONVERSATIONS-UNWIRED-01` |
| Image/video generation reachable from the live chat composer and message renderer              | Same capability Web/Mobile already ship                                                                                            | Needed, **P0**                                                   | `CloudRuntime.ts` declares `supportsImageGeneration = true`; a fully-built, correctly-URL-resolving `generateCloudImage` exists; nothing in the shared composer reads the flag or calls it                           | `domain-voice-media.md` VOICE-MEDIA-001                                                            |
| Project-scoped memory view (fix the data source, not the screen)                               | Claude/ChatGPT project-isolated memory                                                                                             | Wiring, not building                                             | The real, tested project-scoped Rust memory pipeline (`ProjectMemoryManager`, `projectMemoryStore.ts`) exists one layer below the visible Memory tab, which shows the global store instead                           | `domain-memory.md` MEMORY-001                                                                      |
| Inline file-diff (red/green line) view inside the chat transcript for tool-call file edits     | Claude Code / Codex diff review UI (`shots-claude-web.md` screen 169, "Files Changed 3" preview)                                   | Needed, P2 — reusable component exists elsewhere                 | `EnhancedDiffViewer.tsx`/`GitDiffViewer.tsx` are real, but live only in the separate Code/Git workspace, unreachable from a chat-transcript tool result                                                              | `domain-rendering.md` RENDERING-007                                                                |
| Cloud-mode Deep Research plan/progress panel                                                   | Web's own `ResearchActivity` component                                                                                             | Wiring, not building                                             | Events are parsed into state on the Tauri Cloud shell and then never rendered; no caller can reopen a saved report either                                                                                            | `domain-search-research.md` SEARCH-RESEARCH-002                                                    |

### A.4 Desktop (Electron)

Electron's default shell is a thin wrapper around the hosted web app and
inherits every Web gap in §A.1 above by construction
(`CurrentProductInventory.md` §5). The bundled-renderer fallback mode shares
`apps/desktop/src`, so it inherits every Tauri gap in §A.3 when that mode is
active. No Electron-specific missing _screen_ was found beyond what those two
inheritance paths already cover — the Electron-specific findings are wiring
defects (shortcut customization, tray refresh), not absent screens; see §E.

### A.5 Chrome extension

| Screen                                                     | Benchmark reference                                                                                                                                                        | Status                                                                    | Backend                                                                                                                                                                                                                                                                          | Evidence                                        |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Skills/Connectors/Plugins section in the Options page      | Claude Cowork-in-Chrome (Aug 12–13, 2026 merge) ships skills/connectors/plugin history in-panel for the first time (`claude-code-chrome-ide.md` §4.2); Codex's Plugins tab | Needed, P2 — explicitly **not** covered by the adjacent declined decision | `apps/extension/src/options.ts` has zero `connector`/`plugin`/`skill` strings anywhere. `GAP-122` declines file-upload/agent-mode contracts for the attach menu specifically, but its own reasoning doesn't extend to Skills, "a real, working feature on web/desktop/CLI today" | `domain-extensibility.md` EXTENSIBILITY-007     |
| Deep Research entry point / manual "Search the web" toggle | Claude in Chrome's composer; ChatGPT's composer web-search tool entry                                                                                                      | Needed, P2                                                                | No toggle exists at all — the extension composer never sends `research: true`                                                                                                                                                                                                    | `domain-search-research.md` SEARCH-RESEARCH-005 |

### A.6 VS Code extension

| Screen                                                                | Benchmark reference                                                                      | Status                                                             | Backend                                                                                  | Evidence                                                        |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Pull-request creation/review UI                                       | Codex's dedicated Pull Requests destination (`shots-codex-macos-shell.md` §2.6)          | Needed, low confidence (inventory-only, no formal `GAP-xxx` filed) | No command, menu item, or webview control found anywhere                                 | `CurrentProductInventory.md` §7 (`extension-vscode.md:360`)     |
| Structured plan approve/reject/edit UI (currently a typed chat reply) | Codex's plan-mode drill-down; Claude Code's `/rewind` menu with explicit restore options | Needed, P2                                                         | Plan rendering itself is real and injection-safe; no approve/reject/edit control surface | `CurrentProductInventory.md` §7 (`extension-vscode.md:340-342`) |

### A.7 CLI

`domain-shell-nav-ia.md` (§Method, and repeated in `prior-art-reconciliation.md`
§Resulting scope) states plainly that `apps/cli` carries **zero rows** in
`audit/ui-gaps.csv` and received only a light slash-command pass this round
(`/plan`, `/model`, `/resume`, `/theme`, `/doctor`, `/status`, `/keybindings`).
No missing-screen claim is made here for the CLI — this is a genuine coverage
gap in the audit itself, recorded honestly rather than papered over with
invented findings.

---

## B. Missing dialogs and modals

| Dialog                                                                                    | Surface                   | Benchmark reference                                                                                                                          | Status                                           | Backend                                                                                                                                                                                                  | Evidence                                      |
| ----------------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Reasoning-effort / thinking picker                                                        | Desktop                   | Claude Desktop / ChatGPT macOS effort dropdown                                                                                               | Needed, **P1**                                   | Full type + runtime pass-through exists; no control anywhere ever sets a non-default effort                                                                                                              | `domain-models.md` MODELS-001                 |
| Message-edit dialog                                                                       | Desktop                   | Web's own edit-and-branch flow                                                                                                               | Wiring, not building                             | `chatStore.ts`'s `editMessage(messageId, newContent)` action is fully implemented, zero UI callers                                                                                                       | `domain-rendering.md` RENDERING-004           |
| Share dialog                                                                              | Desktop                   | Web's own Share action                                                                                                                       | Needed, P1                                       | No prop, callback, or UI exists anywhere in `ActionBar.tsx`/`MessageBubble.tsx`                                                                                                                          | `domain-rendering.md` RENDERING-004           |
| Provider-fallback / model-substitution disclosure toast                                   | Cross-surface (Web first) | Neither competitor is a model to copy here (both are worse — see §F); internal consistency with AGI's own `X-AGI-Resolved-Model` relabel fix | Needed, P2                                       | Server already computes and returns the fallback reason; never surfaced to the user                                                                                                                      | `domain-models.md` MODELS-004                 |
| Retired-model silent-substitution notice                                                  | Web                       | Cross-cutting complaint theme against silently swapping deprecated capability                                                                | Needed, P2                                       | Opening a conversation whose persisted model was retired silently substitutes the default with zero notice                                                                                               | `domain-models.md` MODELS-006                 |
| Image region-select / inpaint editor                                                      | Web, Mobile, Desktop      | ChatGPT's July 2026 "expanded image-editing viewer with Canvas and Focused modes" (`chatgpt-web-desktop.md` §11)                             | Needed, P2 — wire contract already exists        | `managed-media.ts:81-121` already defines `operation`/`source_image`/`mask_image`; server route has a code path; zero clients ever send them                                                             | `domain-voice-media.md` VOICE-MEDIA-008       |
| Knowledge-file capacity indicator ("N of 20 files in context," which files were excluded) | Web                       | —                                                                                                                                            | Needed, P2                                       | `loadProjectContext()` already computes the include/exclude decision and discards it                                                                                                                     | `domain-projects-files.md` PROJECTS-FILES-002 |
| `FileUnreadableModal` wired into the real unreadable-attachment path                      | Mobile                    | —                                                                                                                                            | Wiring, not building (for this one specifically) | Built, tested, zero import sites; the two size-limit siblings (`FileTooLargeModal`, `ImageTooLargeModal`) should instead be **deleted** — the real path already shows correct inline composer error text | `domain-projects-files.md` PROJECTS-FILES-008 |

---

## C. Missing menus, context menus, and menu items

| Menu / action row                                           | Surface                           | What's missing                                                                                                                                                  | Benchmark reference                                                                                                            | Status                                                              | Evidence                                      |
| ----------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | --------------------------------------------- |
| Per-message response-action row                             | Chrome extension                  | Everything except Copy: no Regenerate, Edit, Share, Read Aloud, thumbs feedback, Fork, Report                                                                   | ChatGPT/Claude Chrome extensions' full action rows                                                                             | Needed, **P1**                                                      | `domain-rendering.md` RENDERING-005           |
| Per-message response-action row                             | Desktop                           | Thumbs feedback (dead-wired — `onFeedback` never passed), Edit (dead store action), Share, Read Aloud, Branch/Fork, Report — only Copy + conditional Retry work | Web's own action row already has all of these; ChatGPT/Claude desktop apps ship feedback+edit                                  | Needed, **P1**                                                      | `domain-rendering.md` RENDERING-004           |
| Branch/fork conversation switcher                           | Desktop, Mobile, Chrome extension | Web is the _only_ surface with a visible branch switcher                                                                                                        | Internal consistency — Claude's own branching is fully **invisible** in claude.ai, an actively-requested gap Web already beats | Needed, P2                                                          | `domain-rendering.md` RENDERING-009           |
| "Attach to chat" action on a Library/generated-file card    | Web, Desktop                      | `LibraryTransport` exposes `listPage`/`fetchAsset`/`deleteItem`/etc. but no attach callback; only Download/Preview render                                       | Mobile's own `AddToChatSheet` "Attach from Library" (`GAP-020`, Done)                                                          | Needed, **P1** — reference implementation already shipped on Mobile | `domain-projects-files.md` PROJECTS-FILES-007 |
| Composer attach/mode menu — 6 missing items                 | Chrome extension                  | Skill `@mention` picker, explicit Research toggle, explicit web-search toggle, code-execution toggle, writing-style picker, Ask/Auto/Plan/Bypass agent-mode row | The shared `AttachmentMenu.tsx` these were hand-mirrored from                                                                  | Needed, P2 (none desktop-specific)                                  | `domain-cross-surface.md` CROSS-SURFACE-002   |
| Composer attach menu — "Attach from Library"                | Web, Desktop, Chrome extension    | Reuse of an existing Cloud asset without re-uploading bytes                                                                                                     | Mobile's own `AddToChatSheet`                                                                                                  | Needed, P2                                                          | `domain-composer.md` COMPOSER-003             |
| Composer attach menu — large-paste-to-attachment conversion | Web, Desktop, Chrome extension    | Pasting ≥10k characters becomes a file attachment                                                                                                               | ChatGPT converts large pastes automatically; Mobile already has `LARGE_PASTE_THRESHOLD=10_000`                                 | Needed, P1                                                          | `domain-composer.md` COMPOSER-002             |
| Composer mode row — image/video generation                  | Desktop (shared package)          | Entirely absent; only a prompt-template `/image` command exists                                                                                                 | Web and Mobile in this same codebase already have full image/video mode                                                        | Needed, **P1**                                                      | `domain-composer.md` COMPOSER-004             |
| Follow-up queue — multi-slot, editable                      | Web                               | Single-slot, cancel-only                                                                                                                                        | Claude's multi-item, drag-reorderable, per-row-editable queue                                                                  | Needed, P2                                                          | `domain-composer.md` COMPOSER-005             |
| Send button — queue-and-flush after stream                  | Mobile                            | Send button becomes Stop-only mid-response; no queue                                                                                                            | Web/Desktop in this same codebase already have queue-and-flush                                                                 | Needed, P2                                                          | `domain-composer.md` COMPOSER-006             |

**Correctly declined, do not reopen:** a contextual per-site "Allow once /
Always / Deny" card for the Chrome extension's browser-automation permission
flow (`GAP-123`, Not Planned) — the audit's own conclusion is that the
extension's existing approved-sites + per-action approval model is
**architecturally ahead of** Codex's dropdown UI, not behind it
(`domain-settings.md` §5, last bullet; `domain-extensibility.md`).

---

## D. Missing settings

### D.1 Settings that exist in code but are unreachable from any UI

This is the audit brief's seed example generalized. Every row below is a real,
tested (or at least type-checked) setter/field with **zero call sites** outside
its own definition, confirmed by a repo-wide grep excluding the defining file
and tests. Full table with file:line in `domain-settings.md` §2 — reproduced
here because it is the archetype this whole document is organized around.

| Setter / field                                                                                                                                                                                                                                                                                                                               | File:line                                                         | Surface                        | Backend/runtime consumes it?                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setSendShortcut`                                                                                                                                                                                                                                                                                                                            | `apps/desktop/src/stores/settingsStore.ts:1252`                   | Desktop                        | Read only at hydration; never called                                                                                                               |
| `setDefaultProvider`, `setTemperature`, `setMaxTokens`, `setTaskRouting`, `setFavoriteModels`                                                                                                                                                                                                                                                | `settingsStore.ts:921,942,952,975,991`                            | Desktop                        | No                                                                                                                                                 |
| `setProviderMode`                                                                                                                                                                                                                                                                                                                            | `settingsStore.ts:1030`                                           | Desktop                        | Only called from an **archived** file, not the active build                                                                                        |
| `setStartupPosition`, `setDockOnStartup`                                                                                                                                                                                                                                                                                                     | `settingsStore.ts:1192,1202`                                      | Desktop                        | No                                                                                                                                                 |
| `setAutoSaveMemories`                                                                                                                                                                                                                                                                                                                        | `settingsStore.ts:1301`                                           | Desktop                        | No                                                                                                                                                 |
| `setChatStorageMode`                                                                                                                                                                                                                                                                                                                         | `settingsStore.ts:1378`                                           | Desktop                        | No                                                                                                                                                 |
| `setEnableCheckpointing`, `setCheckpointInterval`, `setAutoResumeOnRestart`                                                                                                                                                                                                                                                                  | `settingsStore.ts:698,708,719`                                    | Desktop                        | No — agent checkpointing is fully modeled with zero UI (`SETTINGS-004`)                                                                            |
| `setFeature`                                                                                                                                                                                                                                                                                                                                 | `settingsStore.ts:653`                                            | Desktop                        | No                                                                                                                                                 |
| `apps/web/app/settings/voice/page.tsx` (whole page)                                                                                                                                                                                                                                                                                          | —                                                                 | Web                            | Real, honest content — but absent from `SETTINGS_NAV_GROUPS_WEB`, reachable only via a **miswired** rail icon and a typed URL (`SETTINGS-001`, P1) |
| `toolAccessMode`/`setToolAccessMode`, `inlineVisualizationsEnabled`/`toggleInlineViz`, `notifyCompletions`/`toggleNotifyCompletions`, `notifyAgentUpdates`/`toggleNotifyAgentUpdates`, `notifyResearch`/`toggleNotifyResearch`, `memorySearchChats`/`toggleMemorySearchChats`, `memoryGenerateFromHistory`/`toggleMemoryGenerateFromHistory` | `packages/ui/unified-chat/.../settingsStore.ts:24,39-45,51,55-61` | Web + Desktop (shared package) | No — 7 dead field/setter pairs                                                                                                                     |

**Total: 15 dead setters in the desktop store + 7 in the shared web/desktop
store + one entire unreachable settings page.** Cross-reference
`SETTINGS-002/003/004/005` in `domain-settings.md`.

### D.2 Settings that are thinner or narrower than the benchmark bar

| Setting area                                                       | Surface             | Gap                                                                                                                                                                | Benchmark reference                                                                                                          | Status                                                                                                                                      | Evidence                                                                                           |
| ------------------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Accent color / contrast                                            | Web                 | Absent (Mobile and Desktop both have it)                                                                                                                           | ChatGPT iOS/web accent-color popover (`shots-chatgpt-ios-shell-settings.md` screen 067)                                      | Needed, P2                                                                                                                                  | `SETTINGS-007` (`GAP-275`)                                                                         |
| Capabilities (Artifacts/Code-exec/Network-egress/Tool-access-mode) | Web + Desktop       | Only 3 Memory toggles on Web; Desktop's `CapabilitiesTab` self-documents these as unfinished                                                                       | Claude's Capabilities → Memory & Tools + Artifacts & Execution pages (`shots-claude-desktop.md` §Capabilities)               | Needed, P2                                                                                                                                  | `SETTINGS-006`                                                                                     |
| Passkey/WebAuthn, SMS MFA                                          | Web                 | TOTP-only, honestly disclosed                                                                                                                                      | ChatGPT/Claude both offer passkeys + multiple MFA methods                                                                    | **Declined** (`GAP-115`, Not Planned) — "pending account contracts," honestly disclosed in `SecuritySection.tsx`                            | `SETTINGS-008`                                                                                     |
| Cowork settings breadth                                            | Desktop             | 1 control (Dispatch toggle) vs. Claude's 5 (`Dispatch`, `Cowork files` path, `Trusted Cowork folders`, `Run new tasks in the cloud`, `Global instructions`)        | `shots-claude-desktop.md` §Cowork                                                                                            | Needed, P2                                                                                                                                  | `SETTINGS-011` (`GAP-006` slice)                                                                   |
| Notification categories                                            | Web                 | 3 categories vs. benchmark's 6–8                                                                                                                                   | ChatGPT's 8-category Notifications page                                                                                      | **Declined** (deliberately narrow — `GAP-119`, Not Planned) — Web only exposes the channel with a real sender                               | `SETTINGS-012`                                                                                     |
| Settings-panel/nav-entry authoring discipline                      | Cross-surface       | Recurring "shipped a settings panel with no nav entry" pattern — 4 historical instances + `setSendShortcut`/`apps/web/app/settings/voice` as 2 new ones this round | Neither competitor's captured settings tree shows an equivalent orphaned-panel pattern                                       | Needed, architecture-level fix (a generalized nav-drift test, on the model of the VS Code extension's own config-key/schema lock-step test) | `SETTINGS-010`                                                                                     |
| Project-scoped memory                                              | Web                 | No project column exists at all in `user_memories`; team honestly removed a fake dropdown rather than fake the capability                                          | Claude/ChatGPT both isolate project memory from account-wide memory                                                          | Needed, P2                                                                                                                                  | `domain-memory.md` MEMORY-004                                                                      |
| Memory search/pin/summary                                          | Web                 | No search, no pin UI, no summary screen — the `pinned` column exists in Postgres but the REST contract never exposes it                                            | Mobile's own `memory.tsx` (search bar, All/Pinned filter, `memory-summary.tsx`)                                              | Needed, P2 — reference implementation already shipped on Mobile                                                                             | `domain-memory.md` MEMORY-006                                                                      |
| Import memory from another AI provider                             | Web, Desktop        | Mobile-only; and Mobile's automated JSON parser is already **better** than Claude's own copy-paste-a-prompt flow                                                   | Claude's "Import memory from other AI providers" (`shots-claude-desktop.md:374`)                                             | Needed, P2 — port Mobile's better version, don't clone Claude's                                                                             | `domain-memory.md` MEMORY-003                                                                      |
| Desktop "Connections" vs. "Connectors" naming collision            | Desktop             | Two adjacent settings tabs share a near-identical name for unrelated features (mobile pairing vs. MCP/cloud-storage/5 subsystems)                                  | Claude Desktop: Skills/Connectors/Plugins as three clean, separately-scoped tabs (`shots-claude-desktop.md:306-308,545-547`) | Needed, **P1** (rename/IA fix, not new capability)                                                                                          | `domain-shell-nav-ia.md` SHELL-NAV-IA-002; `domain-extensibility.md` EXTENSIBILITY-002 (`GAP-083`) |
| MCP slopsquatting allowlist                                        | Desktop             | Real code exists but fails open in every packaged build (loaded via CWD-relative path, never bundled into `resources`)                                             | n/a — security control, not a benchmarked UX                                                                                 | Needed, **P1**, security-relevant                                                                                                           | `domain-extensibility.md` EXTENSIBILITY-003                                                        |
| 87 of 89 catalog connectors                                        | Web                 | `501` unless an operator sets provider env vars; only GitHub + custom remote-MCP connect out of the box                                                            | Claude/ChatGPT connector directories work for major providers by default                                                     | Needed, P2 — architecture is real, zero-configured                                                                                          | `domain-extensibility.md` EXTENSIBILITY-006                                                        |
| Workspace/org-level model access policy & default reasoning level  | Backend + Web admin | Contract types exist (`ProviderPolicy.allowedModels/blockedModels`), zero consumers                                                                                | ChatGPT Business/Enterprise "starting chat model and reasoning level"                                                        | Needed, **P1**                                                                                                                              | `domain-models.md` MODELS-002                                                                      |
| Context-window usage indicator                                     | Web                 | Not shown anywhere in the chat surface                                                                                                                             | Codex's "Show context window usage"; Mobile's own `ContextWarningChip`                                                       | Needed, P2                                                                                                                                  | `domain-models.md` MODELS-003                                                                      |

### D.3 Settings correctly declined — do not reopen

73 rows in `audit/ui-gaps.csv` are `Not Planned` with a written rationale.
Most are settings-shaped. They are reproduced here **grouped by surface** so
this document doesn't silently omit them, but no further work is recommended
against any row below — each already has an owner's reasoning on file.

**Web (9):** `GAP-108` hosted cloud-browser settings (no browser runtime to
back it — matches ChatGPT's "Cloud browser" page, `shots-chatgpt-ios-shell-settings.md` §Cloud browser)
· `GAP-112` unified Chats+Tasks list (matches Claude's `shots-claude-web.md`
Home tab — lifecycles differ here) · `GAP-113` unified Directory modal
(matches Claude's Skills/Connectors/Plugins Directory, `shots-claude-web.md`
§Directories — catalogs have different authority here) · `GAP-115` passkeys
(see D.2) · `GAP-116` coding-session preferences (no mounted Web code-session
product) · `GAP-117` interactive plugin install (no account-owned marketplace
yet) · `GAP-119` notification breadth (see D.2) · `GAP-120` trusted-contact
escalation (no verified consent/safety service).

**Desktop (44):** the large majority of Not Planned rows. Representative
clusters: **Cowork/AGI Code parity items gated on missing runtime ownership**
(`GAP-052` AGI Code transcript toggles, `GAP-053` per-device coding tokens,
`GAP-054` diff theme/font, `GAP-055` worktree/browser-tool settings, `GAP-098`
Git policy settings, `GAP-099` Hooks — matches Codex's Hooks/Git/Worktrees
group, `shots-codex-macos-settings.md` §12 "Coding") · **Recorder/Cowork-task
UI gated on missing durable assets** (`GAP-061` unified Progress/Outputs/Context
rail, `GAP-062` recording attachments, `GAP-068`–`070` recording processing/playback
states) — _worth a second look_: `AGENTIC-WORK-001`'s own Strengths list
independently confirms `cloud-agent-run-service.ts` is a real durable event
journal, which is close to (if not exactly) the blocker `GAP-061` names; this
is flagged as a decision worth revisiting given newer evidence, not silently
reopened · **Pairing/session controls gated on ephemeral single-session pairing**
(`GAP-040`, `GAP-049`, `GAP-080`, `GAP-081`, `GAP-096`, `GAP-097`) · **Native
OS lifecycle controls with no native owner yet** (`GAP-082` startup/global-voice/menu-bar/keep-awake,
`GAP-084` prevent-sleep, `GAP-085` menu-bar persistence, `GAP-089` unbind
shortcuts, `GAP-091` chat-switch shortcuts, `GAP-100` Unassigned shortcut state)
· **Account/session controls with no account API** (`GAP-073` org ID/delete/logout-all,
`GAP-074` cross-surface Active Sessions, `GAP-103` credits purchase, `GAP-105`
MFA gate) · **Browser/Chrome settings deferred to the extension's own enforcement**
(`GAP-078`, `GAP-094`, `GAP-095`) · plus `GAP-059` (per-conversation approval
mode — native policy is global), `GAP-063` (computer-off pickup claims), `GAP-065`/`066`/`102`
(plugin catalog install/state), `GAP-067` (PR inbox), `GAP-071` (unified
Review/Terminal/Browser/Files rail — Codex's right-panel launcher, `shots-codex-macos-shell.md`
§2.2 — terminal correctly uses its own real dock instead), `GAP-072` (scheduler
templates), `GAP-079` (tool-runtime self-repair), `GAP-087` (Queue vs. Steer
follow-ups), `GAP-092` (training/location toggles — neither data use exists),
`GAP-093` (dictation dictionary — matches Codex's, `shots-codex-macos-settings.md`
§11), `GAP-104` (project membership vs. flat Recents — deliberate IA choice),
`GAP-211` (pairing-card Phone/Computer tabs, enlarge-QR, copy-code button —
matches Codex's remote-pairing modal, `shots-codex-macos-settings.md` §3–4).

**Mobile (14):** `GAP-019` policy-picker authority, `GAP-023` family account
linking (matches ChatGPT's Parental controls, `shots-chatgpt-ios-shell-settings.md`
§Parental controls — correctly declined, see §F), `GAP-024` interactive plugin
install, `GAP-025` code-session diffstat card (cited surface removed), `GAP-027`
paired-Desktop-folder ownership, `GAP-029` scheduled-task context disclosure,
`GAP-032` model-training opt-in (training is always off), `GAP-036` unsupported
notification categories, `GAP-040` reusable pairing, `GAP-043` storage-quota
totals, `GAP-044` trusted-contact (matches ChatGPT's, `shots-chatgpt-ios-health-voice-work.md`
§Trusted contact — correctly declined, see §F), `GAP-045` background voice,
`GAP-047` Plugins drawer destination, `GAP-048` background connector scanning.

**Extension (Chrome, 2):** `GAP-122` (attach menu stays image-only — does
**not** cover Skills, see A.5), `GAP-123` (per-site approval model — already
ahead of the benchmark, see §C).

**Extension (VS Code, 7):** `GAP-128` (hosted background tasks hand to Web),
`GAP-131` (sandbox controls the local runtime can't enforce), `GAP-133`
(Hooks — matches Codex's Hooks tab, `shots-codex-macos-settings.md` §31),
`GAP-134` (per-server MCP controls — matches Codex's `MCP servers` tab,
`shots-codex-vscode-ios.md` §1.7), `GAP-135` (MCP provenance groups — matches
`shots-codex-vscode-ios.md`'s "From plugins" section), `GAP-137` (Plugins tab —
matches Codex's Plugins tab, `shots-codex-vscode-ios.md` §1.7). Every one of
these directly maps to a screen this audit's own teardown of the Codex VS
Code extension documented in detail — and every one is declined for the same
consistent reason: **the local runtime has no inventory/mutation contract to
back it**, which this audit's `domain-extensibility.md` and `domain-settings.md`
independently endorse as the correct trade-off rather than faking availability.

---

## E. Missing reusable components

| Component                                                                                                  | Why it's needed                                                                                                                                                                                                      | Reaches which surfaces today                                                                                                                                                 | Should reach                                                                                                                                                                               | Evidence                                                                           |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Shared per-message `ActionBar` with full action parity (feedback, edit, share, read-aloud, branch, report) | Root cause of both response-action gaps in §C                                                                                                                                                                        | Web only (full set); Desktop and Chrome extension have Copy + maybe Retry                                                                                                    | Desktop, Chrome extension                                                                                                                                                                  | `domain-rendering.md` RENDERING-004/005                                            |
| Single converged markdown/AST rendering engine                                                             | Three independent hand-rolled implementations exist; a fix to the shared one never reaches Mobile or the extension                                                                                                   | Web + Desktop (shared `remark`/`rehype` pipeline)                                                                                                                            | Mobile (regex parser drops nested lists, ignores inline formatting in table cells), Chrome extension (no tables/images/math/syntax highlighting at all)                                    | `domain-rendering.md` RENDERING-001/002/003                                        |
| Inline diff (red/green line) viewer for tool-call file-edit results                                        | Desktop already built two full diff viewers (`EnhancedDiffViewer.tsx`, `GitDiffViewer.tsx`) — they just live in the wrong place                                                                                      | Desktop's separate Code/Git workspace only                                                                                                                                   | Every surface's chat transcript, wherever a file-edit tool result renders                                                                                                                  | `domain-rendering.md` RENDERING-007                                                |
| Code-execution output block (stdout/stderr renderer)                                                       | Web's `CodeExecutionBlock.tsx` was never ported into `unified-chat`                                                                                                                                                  | Web only                                                                                                                                                                     | Desktop (which renders through the shared package and currently shows nothing but a generic tool-call name for a `print()`-only turn)                                                      | `domain-rendering.md` RENDERING-006                                                |
| Claim-adjacent citation chip with rich hover popover (favicon/headline/snippet, pagination)                | Current implementation is a flat trailing-row pill with only a native `title` tooltip; Chrome extension has **zero** citation component                                                                              | Web, Mobile (both thin)                                                                                                                                                      | Chrome extension (build from scratch), Web/Mobile (upgrade) — P2, not urgent per §F                                                                                                        | `domain-rendering.md` RENDERING-008                                                |
| Shared composer behavior core (attachments, slash commands, mode toggles)                                  | Four independently-authored composer implementations, only the slash-command registry is genuinely shared                                                                                                            | Web (primary, 3,621 ln), Desktop/Web-secondary (shared, 1,422 ln), Mobile (1,249 ln, RN-only by necessity), Chrome extension (10,933 ln, hand-mirrored by comment admission) | A real shared behavior layer beyond the slash-command registry, for the surfaces that _can_ share (Web-primary, Desktop, Chrome extension)                                                 | `domain-composer.md` COMPOSER-001; `domain-cross-surface.md` CROSS-SURFACE-001/002 |
| Capacity/budget indicator (files-in-context, memory limits, storage quotas)                                | The underlying budget-walk data already exists and is discarded                                                                                                                                                      | Nowhere currently                                                                                                                                                            | Knowledge Files panel, Memory settings, any future bounded-resource UI                                                                                                                     | `domain-projects-files.md` PROJECTS-FILES-002                                      |
| Shared workspace/team switcher                                                                             | Real, complete on Web (`WorkspaceMenuItems.tsx`) with live-selection state — "better than what any competitor screenshot in this audit shows"                                                                        | Web only                                                                                                                                                                     | Desktop, Mobile (Team is a real shared feature; switching is currently impossible on both)                                                                                                 | `domain-shell-nav-ia.md` SHELL-NAV-IA-005                                          |
| `LibraryTransport.onAttach` callback + "Attach to chat" card action                                        | Interface already exposes `listPage`/`fetchAsset`/`deleteItem`/`restoreItem`/`openPreview`/`startChat` — just not attach                                                                                             | Mobile only (`AddToChatSheet`)                                                                                                                                               | Web, Desktop (both consume the same shared `LibraryView.tsx`, so Desktop inherits the fix for free once Web wires it)                                                                      | `domain-projects-files.md` PROJECTS-FILES-007                                      |
| Shared `EmptyState`/`Spinner` primitive adoption                                                           | Duplicated ad-hoc implementations regress the shared primitive's own documented WCAG contrast fix                                                                                                                    | 2 of 6 UI surfaces use the shared 56-component library at all; even within Web, `EmptyState` and `Spinner` are barely adopted (60+ ad-hoc loading spinners)                  | `ArtifactsPanel.tsx`/`ResearchPanel.tsx` first, then the rest of Web                                                                                                                       | `domain-design-system.md` DESIGN-SYSTEM-008/012                                    |
| Mounted `SkipLink` + a real (non-mocked) accessibility audit surface                                       | `SkipLink` is fully built and simply never mounted in `apps/web/app/layout.tsx`; the sibling `accessibility/` directory (650 LOC) is 100% dead code including a fabricated "95%, all checks passed" mock audit panel | Nowhere                                                                                                                                                                      | `apps/web/app/layout.tsx` (one line); fix-or-delete decision for the rest of the directory                                                                                                 | `domain-design-system.md` DESIGN-SYSTEM-009                                        |
| Model-substitution/fallback disclosure toast                                                               | See §B                                                                                                                                                                                                               | Nowhere                                                                                                                                                                      | Web first (the fallback-reason computation already lives server-side)                                                                                                                      | `domain-models.md` MODELS-004/006                                                  |
| Reduce-motion hook for Mobile animations, mirroring the existing `useSystemHighContrast` pattern           | Only 2 of 23 animation files respect reduce-motion                                                                                                                                                                   | Mobile: 1 hook exists for contrast, none for motion                                                                                                                          | Every Mobile animation call site                                                                                                                                                           | `domain-design-system.md` DESIGN-SYSTEM-011                                        |
| Version-history badge (`v{n}`) + "prior versions" expansion                                                | Same underlying need appears in two places                                                                                                                                                                           | Nowhere renders it despite both backends tracking it                                                                                                                         | Web/Desktop knowledge files (PROJECTS-FILES-006), Mobile artifact viewer (no version history at all — ARTIFACTS-004)                                                                       | `domain-projects-files.md`, `domain-artifacts.md` ARTIFACTS-004                    |
| Settings-search index over control body copy, not just section titles                                      | Every result is currently keyed to a hand-maintained per-nav-entry `keywords` array (section-level granularity)                                                                                                      | `settings-nav.ts:196-198` (section-level only)                                                                                                                               | Control-level, matching Codex's demonstrated behavior (`shots-codex-macos-settings.md:59`, searching "remo" surfaces "Remote control"/"Remove"/"Reduce motion" from three different pages) | `domain-settings.md` §4, explicitly P3/differentiation-tier — not urgent           |
| Live full-duplex voice conversation loop (orb overlay, listen→transcribe→LLM→speak)                        | Desktop already built this — it's just never rendered                                                                                                                                                                | Desktop (built, zero live callers)                                                                                                                                           | Desktop first (wire the existing loop), then design for Web/Chrome extension from scratch with camera/screen context from day one — see §F for what not to copy                            | `domain-voice-media.md` VOICE-MEDIA-004/005                                        |

---

## F. Explicitly out of scope — correctly not chased

Per this audit's standard that the benchmark is not a specification, several
screens documented in exhaustive detail in the `shots-*.md` teardowns are
**not** filed as gaps anywhere in this document, and should not be inferred
as missing work from their absence above:

- **The entire ChatGPT iOS Health vertical** (`shots-chatgpt-ios-health-voice-work.md`
  §1 — 24 screens: Apple Health onboarding, ~49 HealthKit data types,
  SNOMED-backed condition search, RxNorm-backed medication search, a
  dashboard of Activity/Heart/Blood/Body-Measurement cards). No domain pass
  in this audit round found any trace of health-data integration anywhere in
  the codebase, and none recommends building one — this is a different
  product category, not a missing screen.
- **ChatGPT's "Pet" companion picker** and **"Record mode"** (reference prior
  voice-recording transcripts as personalization context). `domain-memory.md`
  explicitly calls both "personalization novelties with no clear product fit
  here… pure engagement theater," recommending against building either. Codex's
  gamified Profile page (lifetime/peak tokens, streaks, contribution heatmap,
  a "most used plugins" leaderboard, `shots-codex-macos-settings.md` §8) and
  its 9-character Pets roster (§14–15) fall in the same bucket.
- **Trusted-contact crisis-escalation** (ChatGPT: `shots-chatgpt-ios-health-voice-work.md`
  §Trusted contact; Claude has an equivalent). `domain-settings.md` §5 is
  explicit: this implies a backend classifier over conversation content, a
  contact-verification/consent pipeline, and clinical-risk review — "a
  serious safety/legal undertaking, not a settings-page toggle." Already
  correctly declined twice (`GAP-044` mobile, `GAP-120` web).
- **Parental controls / family account linking** (`shots-chatgpt-ios-shell-settings.md`
  §Parental controls). Same reasoning, already declined (`GAP-023`).
- **A Chrome-extension contextual per-site Allow-once/Always/Deny card** to
  match Codex's dropdown-based permission UI (see §C) — this repo's existing
  approved-sites + per-action approval model is independently assessed as
  architecturally _ahead of_ the benchmark, not behind it. Copying the
  benchmark's UI here would be a regression.
- **A hosted "cloud browser" product** (ChatGPT's `Cloud browser` settings
  page) — no such runtime exists in this product and none is planned;
  correctly declined (`GAP-108`).
- **A single "Directory" modal unifying Skills/Connectors/Plugins** (Claude's
  pattern, `shots-claude-web.md` §Directories) — declined (`GAP-113`) because
  the three catalogs have genuinely different authority/lifecycle in this
  product; keeping them as separate, deep pages (`/skills`, `/connectors`,
  `/apps`, each with real search/filter) is a defensible, not-lesser, IA
  choice per `domain-shell-nav-ia.md` §3.
- **ChatGPT's three-widget inconsistency for one "effort" concept**
  (checkmarked dropdown on macOS, a pair of unrelated toggles on web, an
  unlabeled 5-dot slider in the Chrome extension) — cited repeatedly across
  `domain-composer.md`, `domain-models.md`, and `domain-settings.md` as the
  single clearest "what NOT to copy" in the whole benchmark. Any new effort
  control (Desktop's MODELS-001 fix, in particular) must reuse the existing
  catalog-driven chip component, never invent a fourth widget shape.
- **Live-voice-without-camera**, the way GPT-Live shipped after replacing
  Advanced Voice Mode (`chatgpt-mobile.md` §4, a dated, sourced, still-current
  regression) — when full-duplex voice is eventually built here (§E), it
  should carry camera/screen context from its first release rather than
  bolting it on later under complaint pressure, per `domain-voice-media.md`'s
  explicit recommendation.

---

## Summary counts

| Category              | Needed (new work) |                            Wiring-not-building (code exists) |                                Declined, honored |              Correctly out of scope |
| --------------------- | ----------------: | -----------------------------------------------------------: | -----------------------------------------------: | ----------------------------------: |
| Screens (§A)          |                11 |                                                            5 | — (declined items are settings-shaped, see §D.3) |    1 vertical + several sub-screens |
| Dialogs/modals (§B)   |                 6 |                                                            2 |                                                — |                                   — |
| Menus/menu items (§C) |                 9 |                                                            — |                                    1 (`GAP-123`) |                                   — |
| Settings (§D)         |                12 | 8 (`setSendShortcut` archetype, 23 total dead setters/pages) |                        73 rows across 5 surfaces | 2 (family linking, trusted-contact) |
| Components (§E)       |                10 |                                                            5 |                                                — |                                   — |

This document does not re-litigate the 197 still-Open rows in
`audit/ui-gaps.csv` or re-derive `GapMatrix.md`'s 168 filed gaps — it extracts
and organizes the subset of those 168 gaps (plus the dead-code inventory
findings) that are specifically shaped as an absent screen, dialog, menu,
setting, or reusable component, and states for each one whether the
underlying capability already exists and simply needs a caller.
