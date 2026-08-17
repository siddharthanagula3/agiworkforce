# Dead and Disconnected Code — Master Ledger

Audited at commit `e15df56e3`, branch `compliance/dpdp`, working tree clean.
Synthesized from `gaps/domain-dead-code.md` + `domain-dead-code.json` (23
filed gaps, DEAD-CODE-001…023), `gaps/done-claim-verification.md` +
`.json` (71 re-verified "Done" claims, 9 exceptions), and the per-surface
inventories (`inventory/desktop-tauri.md`, `desktop-electron.md`,
`mobile.md`, `web-frontend.md`, `web-backend.md`, `shared-packages.md`,
`extension-vscode.md`, `runtime-infra.md`). Every count below was either
lifted directly from that evidence or re-derived from the primary source
file listed in its citation during this pass (`apps/desktop/wiring-allowlist.json`
and the `apps/desktop/archive/` / `apps/web/shared/` file trees were
re-counted directly with `find` against HEAD).

**Scope note.** This ledger is deliberately broader than the 23
`DEAD-CODE-*` IDs: it also folds in (a) the VS Code extension's one
self-documented dead command pair, not filed as a `DEAD-CODE-*` ID because
it was already tracked as `GAP-284`; (b) the CLI's one whole-file
`#[allow(dead_code)]`; and (c) the `done-claim-verification.md` findings
where a feature is fully built but structurally unreachable — a
built-but-unreachable feature is dead code by any useful definition, per
the brief.

## Verdict legend

| Verdict                     | Meaning                                                                                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DELETE**                  | No product value identified; removing it reduces surface area with no loss.                                                                                          |
| **WIRE**                    | Real, working implementation exists; the cheapest fix is connecting it to a reachable entry point, not building it again.                                            |
| **DOCUMENT-AS-INTENTIONAL** | Correctly inert by design (retired subsystem, operator gate, compliance retention, tracked debt ledger) — do not delete or wire; at most, tighten the documentation. |
| **NEEDS VALIDATION**        | The evidence base does not carry enough detail (name, file, or specific recommendation) to assign a confident verdict; flagged rather than guessed.                  |

---

## 1. Headline numbers

| Metric                                                                                               | Count                                                                                                                                                                                                             | Source                                                                               |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Gaps filed under the `dead-code` domain                                                              | 23 (0 P0, 3 P1, 17 P2, 3 P3)                                                                                                                                                                                      | `domain-dead-code.md` §6                                                             |
| Tauri commands registered, total                                                                     | 1,268                                                                                                                                                                                                             | `desktop-tauri.md` §1                                                                |
| Tauri commands with **zero literal caller** anywhere in `apps/desktop/src`                           | 154 (~12%)                                                                                                                                                                                                        | `desktop-tauri.md` §2                                                                |
| Tauri commands **reachable-by-import-graph** exempted via `wiring-allowlist.json`                    | 69 (4 `registeredWithoutFrontendCaller` + 65 `registeredWithoutReachableCaller`) — re-counted directly from the file at HEAD; the domain doc's own prose says "~58," so this ledger uses the exact, larger number | `apps/desktop/wiring-allowlist.json` (last touched `4354d3d8b`, an ancestor of HEAD) |
| Desktop feature-directory files unmounted by `App.tsx` (second dead body, distinct from `archive/`)  | 183, across ~30 directories                                                                                                                                                                                       | `domain-dead-code.md` §2.2                                                           |
| `apps/desktop/archive/` — correctly isolated, already excluded from build/test                       | 204 files                                                                                                                                                                                                         | re-counted: `find apps/desktop/archive -type f \| wc -l` → 204                       |
| `apps/web/shared/` legacy tree                                                                       | 198 files on disk; ~130 knip-flagged unused (spanning `shared/` + `features/`)                                                                                                                                    | re-counted: `find apps/web/shared -type f` → 198; `domain-dead-code.md` §2.5         |
| DB tables: GDPR/DPDP-erasure-only                                                                    | 9                                                                                                                                                                                                                 | `web-backend.md` §11                                                                 |
| DB tables: fully dead (zero references, even erasure)                                                | 2 (`referrals`, `cloud_waitlist`)                                                                                                                                                                                 | `web-backend.md` §11                                                                 |
| DB tables: pending founder-gated drop migration                                                      | 2 (`teams`, `team_members`, `0058_drop_legacy_teams.sql`, unapplied)                                                                                                                                              | `web-backend.md` §11                                                                 |
| Retired-410 route families (intentional, good design)                                                | 13                                                                                                                                                                                                                | `web-backend.md` §3a, §12                                                            |
| Orphaned legacy `/api/usage/*` alias routes                                                          | 3                                                                                                                                                                                                                 | `domain-dead-code.md` DEAD-CODE-010                                                  |
| Mobile: edge-case UX components with zero import sites                                               | 9 of 10 in the library (`OfflineBanner.tsx` is the 10th, and is live)                                                                                                                                             | `mobile.md` §14                                                                      |
| Mobile: superseded pre-drawer sidebar                                                                | 8 files (7 components + barrel)                                                                                                                                                                                   | re-counted: `find apps/mobile/src/features/sidebar -type f` → 8                      |
| `done-claim-verification.md` exceptions relevant to this ledger (built-but-unreachable / half-wired) | 6 of 9 (GAP-001, GAP-051, GAP-205, GAP-064, GAP-086, GAP-101, GAP-210 — 7 rows, 2 of the 9 total exceptions excluded, see §11 note)                                                                               | `done-claim-verification.md`                                                         |

---

## 2. Desktop (Tauri) — native command surface

### 2.1 Registration integrity — strong, self-enforcing (report honestly)

`desktop-tauri.md` §1: of 1,268 `#[tauri::command]` functions, only 2
apparent mismatches against `generate_handler!` exist, and both are
doc-comment examples, not real gaps. **Zero** frontend `invoke*()` calls
reference a command that doesn't exist. A second, independent allowlist
(`apps/desktop/src/utils/registeredCommands.ts`, 1,273 entries) is
CI-enforced against the Rust registry via `ipc.test.ts`. This is the
strongest single finding in the whole domain and should not be
re-litigated — **DOCUMENT-AS-INTENTIONAL**, keep the check running.

One coverage gap in the check itself: 4 renderer modules
(`StartupRecoveryBootstrap.tsx`, `analyticsQueries.ts`, `newChatReset.ts`,
`browserAutomation.ts`) import `@tauri-apps/api/core` directly, bypassing
`assertRegisteredCommand`, so a typo'd command name in any of them would
ship undetected by `ipc.test.ts`. Not proven broken. **Verdict: NEEDS
VALIDATION** (`desktop-tauri.md` §1a).

### 2.2 The 154 commands with no literal frontend caller

Categorized by `desktop-tauri.md` §2 into named subsystems (121 of 154
individually named) plus an unenumerated remainder (33 of 154 — the full
list was saved to a transient `/tmp` path during the audit run, not
committed to the repo, and is not reconstructable from retained evidence).

| Command family                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Count | Verdict                                                | Why                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----: | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hooks_*` (`hooks_add/create_example/export/get_config_path/get_event_types/get_stats/import/initialize/list/reload/remove/toggle/update`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |    12 | **WIRE** (deprioritized)                               | Full Claude-Code-style hooks backend (`core/hooks/{config,event,executor}.rs`), zero UI. Doc's own framing: a real parity capability that "should not stay silently built-and-hidden," but scoping (should this even be user-facing?) is a bigger product call than `background_agent_*`.                                        |
| `background_agent_*` (`cancel/cleanup/get/list/list_active/pause/push/resume/should_push/stats/take_over`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |    11 | **WIRE** (recommended first)                           | Frontend only `listen()`s to status events; no UI can pause/resume/cancel/take over a running background agent. Extends an already-live, already-watched feature — cheapest high-value wire in this ledger.                                                                                                                      |
| `messaging_connect_discord/signal/telegram`, `messaging_disconnect/get_status/send`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |     6 | **DOCUMENT-AS-INTENTIONAL** (product decision pending) | ~1,777 real lines across `discord.rs`/`signal.rs`/`telegram.rs`/`whatsapp.rs`, no stubs, zero UI. A 4-platform build/cut call belongs to product, not this audit.                                                                                                                                                                |
| `gmail_oauth_start/complete/refresh/list_accounts/disconnect/get_account`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |     6 | **WIRE** (recommended)                                 | Complete Google OAuth2 flow exists; the UI's only "connect email" path calls the generic credential-based `email_connect` instead (`apps/desktop/src/api/email.ts:52`). Smallest, highest-value slice per the domain doc's own recommendation.                                                                                   |
| `settings_v2_get/set/delete/get_batch/get_category/list_all/load_app_settings/save_app_settings/clear_cache`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |     9 | **DELETE**                                             | Fully-migrated parallel `settings_v2` SQLite table + CRUD layer; frontend exclusively uses the older `settings_load`/`settings_save`/`settings_load_from_disk` (`settingsStore.ts:1433-1833`). Deleting is the lower-risk action; migrating the store onto the newer schema is the higher-effort alternative the doc also names. |
| `checkpoint_create/restore/list/delete` (conversation-level)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |     4 | **DELETE**                                             | `coding_checkpoint_create/list/rewind` (file-snapshot checkpoints) is what the UI actually uses (`codingCheckpointStore.ts:92,129`). Doc's own verdict: "delete it outright."                                                                                                                                                    |
| `document_create_excel/excel_simple/excel_numbers/pdf/pdf_simple/powerpoint/powerpoint_simple/word/word_simple` (non-manifest siblings)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |     9 | **DELETE**                                             | Frontend exclusively calls the `*_manifest`-suffixed siblings (`documentStore.ts:161-306`, `editingStore.ts:719-836`); these are superseded leftovers.                                                                                                                                                                           |
| `document_edit_excel`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |     1 | **DOCUMENT-AS-INTENTIONAL**                            | `wiring-allowlist.json`'s own entry for this command gives a different, more authoritative reason than the "dead, superseded" framing above: it's an agent-selected tool the LLM tool executor calls directly after `tool_guard` approval, deliberately with no renderer `invoke()` call site.                                   |
| "Smaller dead pockets" — `account_disconnect_device`/`_list_devices`, `auth_store_session`/`_retrieve_session`/`_remove_session`, `automation_record_action_narration` family (5), `connector_permission_get/list/set`, `conversation_share`, `conversation_export_pdf`, the `~/.agiworkforce/` dotfile bridge (`dotfile_*`, `read/write_shared_config`, 8), `intent_*` (9), `knowledge_add`/`knowledge_query`, `master_password_is_configured`/`_is_unlocked`/`_needs_migration`/`_verify` (likely redundant with `master_password_get_status`), `project_get`/`_get_settings`/`_add_knowledge_file`/`_search_knowledge`, `route_to_best_api`, `skill_create_from_recording`, `save_global_config`/`save_project_config`, 17 assorted `get_*` helpers |   ~63 | **NEEDS VALIDATION**                                   | Named individually in `desktop-tauri.md` §2 prose but with no per-family recommendation attached — assigning a confident DELETE/WIRE here would be inventing a verdict the evidence doesn't support.                                                                                                                             |
| Unenumerated remainder (154 total − 121 named above)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |   ~33 | **NEEDS VALIDATION**                                   | Only recoverable by regenerating the three-set diff described in `desktop-tauri.md` §1; not in retained evidence.                                                                                                                                                                                                                |

**Subtotal, 154-command bucket:** WIRE 29 · DELETE 22 · DOCUMENT-AS-INTENTIONAL
7 · NEEDS VALIDATION 96.

### 2.3 `wiring-allowlist.json` — 69 self-tracked entries, re-derived exactly

The domain doc (`DEAD-CODE-023`) calls this "a real, working self-governance
mechanism, not a bypass hatch" — it fails CI if a waived entry becomes
reachable without being removed, and the file's own boilerplate on every
entry says "this list may only shrink." **Mechanism verdict:
DOCUMENT-AS-INTENTIONAL** — keep the gate.

Re-parsed directly from `apps/desktop/wiring-allowlist.json` (schema v1) at
HEAD — this supersedes the "~58" approximation in `domain-dead-code.md`:

| Section                            | Entries |
| ---------------------------------- | ------: |
| `registeredWithoutFrontendCaller`  |       4 |
| `registeredWithoutReachableCaller` |      65 |
| **Total**                          |  **69** |

Per-family breakdown of `registeredWithoutReachableCaller` (all 65 carry the
identical "SIX-32 baseline" boilerplate reason — none has an individually
customized justification):

| Family                                | Commands                                                                                                                                                                                                                                          | Count | Verdict                                                                                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `undo_*` / `form_undo_*`              | `undo_can_undo/change/get_changes/get_summary/last/task` (6) + `form_undo_attempt/can_undo/clear/clear_old/get/list/list_undoable/record/stats` (9)                                                                                               |    15 | **WIRE** — doc's own strongest-candidate pick: "a full undo/redo subsystem... generically useful capabilities with no UI at all."                                               |
| `task_*` / `scheduler_get_*`          | `task_cancel/complete/create/get_resumable/get_status/list/list_by_status/pause/resume/save_context/update_progress` (11) + `scheduler_get_history/get_job` (2)                                                                                   |    13 | **WIRE** — doc's other strongest-candidate pick, same reasoning.                                                                                                                |
| `api_*`                               | `api_delete/extract_json_path/extract_template_variables/get/oauth_client_credentials/oauth_create_client/oauth_exchange_code/oauth_get_auth_url/oauth_refresh_token/parse_response/post_json/put_json/render_template/request/validate_template` |    15 | **DOCUMENT-AS-INTENTIONAL** — generic HTTP/OAuth/template client; tracked, no specific steer given.                                                                             |
| Project-memory                        | `clear_project_memories`, `delete_project_memory`, `get_project_context`, `get_project_memory_stats`, `update_memory_importance`                                                                                                                  |     5 | **DOCUMENT-AS-INTENTIONAL**                                                                                                                                                     |
| Architectural-decision / coding-style | `get_architectural_decisions`, `get_coding_styles`, `save_architectural_decision`, `save_coding_style`                                                                                                                                            |     4 | **DOCUMENT-AS-INTENTIONAL**                                                                                                                                                     |
| Coordination / approvals              | `coord_get_pending_approvals`, `coord_request_approval`, `coord_update_app_state`                                                                                                                                                                 |     3 | **DOCUMENT-AS-INTENTIONAL**                                                                                                                                                     |
| Lovable migration importer            | `migration_launch_lovable`, `migration_list_lovable_workflows`, `migration_test_lovable_connection`                                                                                                                                               |     3 | **DELETE** — doc's explicit pick: "strongest deletion candidate... narrow, single-purpose, likely abandoned."                                                                   |
| Ungrouped                             | `auto_save_decision`, `automation_generate_code`, `automation_save_recording_as_script`, `budget_get_status`, `chat_detect_intent`, `chat_is_stop_command`, `execute_code`                                                                        |     7 | **DOCUMENT-AS-INTENTIONAL** — no specific steer in evidence; `execute_code` in particular warrants a closer look before any action, but that look is outside this pass's scope. |

`registeredWithoutFrontendCaller` (4):

| Command                                                                        | Verdict                                                                      | Why                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `document_edit_excel`                                                          | **DOCUMENT-AS-INTENTIONAL**                                                  | Agent-tool-only by design (see §2.2).                                                                                                                                                                                                                                                                              |
| `llm_list_llamacpp_models`, `llm_list_lmstudio_models`, `llm_list_vllm_models` | **DOCUMENT-AS-INTENTIONAL** — likely a stale allowlist entry, not truly dead | The file's own reason string says these ARE invoked, through "the runtime-selected local model command table in `apps/desktop/src/App.tsx`" — i.e., this specific check's method can't see the call, not that no call exists. Worth a cheap allowlist-hygiene pass to remove these 3 rather than a functional fix. |

**Subtotal, 69-entry bucket:** WIRE 28 · DELETE 3 · DOCUMENT-AS-INTENTIONAL 38.

**Overlap warning:** at least one command (`document_edit_excel`) appears
in both the 154-command sweep (§2.2) and this 69-entry list, because the
two checks use different methodologies — §2.2 is a literal-string sweep for
any mention anywhere in `src/`, §2.3 is a true reachable-import-graph walk
from `main.tsx`. **Do not sum the two totals** (154 + 69 ≠ a meaningful
grand total); they are reported separately by design.

---

## 3. Desktop (Tauri) — frontend feature-directory dead code

### 3.1 `apps/desktop/archive/` — 204 files, correctly isolated

**Verdict: DOCUMENT-AS-INTENTIONAL.** Old MessageBubble/Cards/Timeline/
Sidecar/InlinePanels/Visualizations/Widgets component trees, excluded from
`tsconfig.json`'s include list and from Vitest with an explicit "Superseded
... unreachable from `main.tsx`" comment. Re-counted directly: `find
apps/desktop/archive -type f` → 204, matching the domain doc exactly. Zero
imports from `src/` confirmed. This is the template other dead trees in
this ledger should be moved to, not deleted outright, when a directory is
confirmed abandoned but a maintainer wants a paper trail. (DEAD-CODE-022)

### 3.2 The second, larger dead body: 183 files under `src/features/`

`knip` (already configured for this workspace, entry point `src/main.tsx`)
flags 183 files under `apps/desktop/src/features/` across ~30 directories
as unused — distinct from and additional to `archive/`, and still compiled
into the live tree. Cross-checked against `App.tsx`'s real
`lazy(() => import(...))` list (16 mounted paths): none of the ~30
directories below appear in it. (DEAD-CODE-002)

| Directory                                                          | Files | What it is                                           | Verdict                                                                     |
| ------------------------------------------------------------------ | ----: | ---------------------------------------------------- | --------------------------------------------------------------------------- |
| `roi-dashboard/`                                                   |    11 | ROI/cost-savings dashboard, charts, milestone toasts | **WIRE** (product-value candidate, not benchmark-driven — see caveat below) |
| `notifications/`                                                   |     2 | `NotificationCenter.tsx`                             | **WIRE**, with a correction — see caveat below                              |
| `canvas/`                                                          |     7 | Canvas workspace, code editor panel                  | **DELETE** (archive) pending triage                                         |
| `file-upload/`                                                     |     7 | Drop zone, preview modal, download button            | **DELETE** (archive) pending triage                                         |
| `editing/`                                                         |     5 | Diff viewer, conflict resolver, change summary       | **DELETE** (archive) pending triage                                         |
| `memory/` (UI)                                                     |     5 | Memory browser modal, viewer, importance indicator   | **DELETE** (archive) pending triage                                         |
| `reminders/`                                                       |     4 | Reminder card/dialog/list                            | **DELETE** (archive) pending triage                                         |
| `analytics/`                                                       |     4 | Cost dashboard, usage dashboard                      | **DELETE** (archive) pending triage                                         |
| `messaging/` (UI)                                                  |     4 | Message composer                                     | **DELETE** (archive) pending triage                                         |
| `teams/`                                                           |     4 | See §6 below — already covered by DEAD-CODE-001      | **DELETE** (counted once, in §6, not here)                                  |
| `workflows/`                                                       |     3 | `AutomationBuilder.tsx`, workflow panel/builder      | **DELETE** (archive) pending triage                                         |
| `background-tasks/` (UI)                                           |     3 | Background task indicator/panel                      | **DELETE** (archive) pending triage                                         |
| `outcomes/`                                                        |     3 | Goal outcomes, outcomes dashboard                    | **DELETE** (archive) pending triage                                         |
| ~18 further directories, unnamed individually in retained evidence |  ~121 | Not itemized beyond the aggregate knip count         | **NEEDS VALIDATION**                                                        |

**Correction on the "maps to a real parity gap" framing.** `DEAD-CODE-002`
argues the notification-center and cost/usage-dashboard directories "map
directly onto real parity gaps other domains already flag as missing." That
holds for `web-frontend.md`'s own table (`In-app notification center |
NOT BUILT`), but `domain-shell-nav-ia.md` (§ "hypothesized... gap"),
reviewing the identical question independently, explicitly **declined** to
file "no in-app notification center" as a competitor-parity gap: re-reading
every `shots-*` teardown found neither ChatGPT nor Claude ships an in-app
notification bell/feed either — both vendors' own "Notifications" settings
are external-delivery preference toggles, same as this repo's. Treat the
`notifications/` WIRE recommendation as a genuine, defensible product-value
call (a coherent in-app feed would be a real differentiator), **not** as
benchmark-mandated catch-up — the two claims should not be conflated when
prioritizing.

**Minimum recommended action for the ~166 untriaged files** (all rows
above marked "archive pending triage," i.e. everything except
`roi-dashboard`, `notifications`, and `teams`): move into
`apps/desktop/archive/`, matching the treatment already proven correct for
the 204 files in §3.1, rather than leaving them live-but-unreachable in
`src/`.

### 3.3 Superseded parallel MCP management UI — same directory as the live one

**Verdict: DELETE.** `MCPWorkspace.tsx` (213 lines) is the live surface,
lazy-imported by exact path from `features/settings/tabs/Connectors/index.tsx:23`,
importing `MCPServerCard`, `MCPToolBrowser`, `MCPCredentialManager`,
`MCPConfigEditor`, `MCPBundleBrowser`. In the same `features/mcp/`
directory, a second, disjoint set — `MCPServerManager.tsx` (598 lines),
`MCPServerBrowser.tsx` (318), `MCPToolExplorer.tsx` (435),
`MCPLogsViewer.tsx` (132), `MCPConnectionStatus.tsx` (508) = ~1,991 lines —
sits exported from a barrel (`index.tsx`) with zero external importers.
Re-confirmed directly: `apps/desktop/src/features/mcp/` contains all 12
`.tsx` source files plus 4 test files; the 5 named above (+ the barrel) are
the dead set, 6 files total. (DEAD-CODE-003)

Adjacent finding from `done-claim-verification.md` (`GAP-083`), useful
context for whoever actions the delete: the settings tab that hosts the
live `MCPWorkspace` is named **Connectors**; a separate, unrelated tab named
**Connections** (which mounts only `MobileCompanionPanel`, zero MCP
content) is a near-homograph that misled the original ledger claim. Not a
dead-code item on its own — nothing there is unreachable — but worth fixing
alongside the deletion since it's the same directory a reader would land in
while doing this cleanup.

### 3.4 Typed `api/*.ts` wrapper layer, bypassed

**Verdict: DELETE** (simplest correct action; the alternative — routing
existing call sites through the typed layer instead — is a larger refactor
with no functional gain, only type-safety benefit). `knip` flags ~20 files
under `apps/desktop/src/api/` (`apiManagement`, `automation`,
`automationEnhanced`, `backgroundTasks`, `cache`, `chat`, `design`, `email`,
`embeddings`, `fileOps`, `index`, `lsp`, `metrics`, `migration`, `ocr`,
`onboarding`, `orchestrator`, `privacy`, `productivity`, `projectMemory`,
`screenWatcher`, `taskPersistence`, `teamsApi`, `terminal`, `tutorials`,
`undo`, `workflow`) as unused. Spot-verified: `desktop-tauri.md` cites
`api/undo.ts:174,184` as proof `coding_checkpoint_*` is wired, but the
actual caller (`codingCheckpointStore.ts:21`) imports `invoke` directly
from `lib/tauri-mock`, never from `api/undo.ts` — the command is live, the
typed wrapper module is not. (DEAD-CODE-004)

---

## 4. Desktop (Electron)

| Item                                                                                                          | Files                                                        | Verdict                     | Why                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global-shortcut customization (`quickAskShortcut`, `screenshotShortcut` persistence + accelerator validation) | `electron/settingsStore.ts`, `electron/garnishCore.ts:17-23` | **WIRE**                    | Full persistence + validation exists; `saveSettings()` is never called anywhere — no IPC channel, UI, or tray item triggers it. Shortcuts are permanently fixed at `DEFAULT_SHORTCUTS`. Wire a settings-panel control through `saveSettings()`.                                                                                                                                                                                                 |
| `refreshTrayMenu()`                                                                                           | `electron/tray.ts:99-101`                                    | **WIRE**                    | Exists specifically to rebuild the tray menu after a shortcut change; only `createTray` runs, once, at startup. Fixing the row above makes this callable for free.                                                                                                                                                                                                                                                                              |
| Electron IPC bridge (9 `invoke` channels: window control, dialog, notify, relaunch, check-update, etc.)       | `electron/main.ts:477-483,634-637`, `preload.ts:26-83`       | **DOCUMENT-AS-INTENTIONAL** | The bridge is wired correctly, but the preload script that exposes `window.agiHost` is attached only when `AGI_CLOUD_RENDERER=bundled` is explicitly set. In the default shipped configuration (unset), there is **no preload script at all** — the entire bridge is unreachable unless an operator opts in. This matches the documented founder-locked "thin Chromium wrapper pointed at the hosted web app" architecture; it is not a defect. |

(DEAD-CODE-015)

---

## 5. Web — frontend

### 5.1 `apps/web/shared/` legacy tree

**Verdict: DELETE.** Re-counted directly: 198 files on disk under
`apps/web/shared/`. `knip` flags ~130 of them (plus files under
`apps/web/features/`) as unused; spot-verified zero importers for
`shared/ui/sidebar.tsx`, `shared/ui/chat-bubble.tsx`, `shared/lib/api.ts`,
`shared/types/index.ts`, `shared/stores/index.ts`. Only 6 files anywhere in
the live app import from `@/shared/`, and those 6 are either part of the
already-dead v3/`UnifiedChatPage` cascade (§5.3) or pull one narrow utility
from an otherwise-live file. `shared/types/store-types.ts` /
`shared/types/index.ts` define `AIEmployee`, `MarketplaceEmployee`,
`AIEmployeePerformance` — vocabulary from an earlier "AI employee
marketplace" product framing this repo has since moved away from, itself
independent evidence the tree predates the current unified-chat-workspace
architecture. Last commit touching `shared/types/index.ts`: "refactor(web):
close unmounted surface sweep" (2026-07-29) — a prior cleanup pass already
worked this area and didn't finish it. (DEAD-CODE-007)

### 5.2 Duplicate "share a conversation" backend

**Verdict: DELETE**, unless a maintainer can confirm `/shared/<id>` links
were ever issued in production — in that case, **DOCUMENT-AS-INTENTIONAL**
with a one-line comment (the audit could not confirm this either way from
code alone). The live Share button calls `use-share-conversation.ts:98` →
`POST /api/share` → `shared_sessions` table → `/share/[token]`. A second,
fully-implemented path (`POST/GET /api/shared` → `shared_conversations`
table → `/shared/[id]`) has zero UI callers; the live path's own test
explicitly asserts the negative ("posts to `/api/share` (not the legacy
`/api/shared` route)"). Files: `apps/web/app/api/shared/route.ts`,
`apps/web/app/shared/[id]/page.tsx`, plus the now-orphaned
`shared_conversations` table. (DEAD-CODE-008)

### 5.3 Conversation-export feature and the wider v3-shell/`UnifiedChatPage` cascade

**Split verdict — WIRE the export feature, DELETE the rest.**
`EnhancedExportDialog.tsx` — a complete multi-format (Markdown/PDF/DOCX)
export dialog — is built, barrel-exported, and unreachable (its own barrel
has zero importers); the live chat header ships only a Print action.
`knip` widens the confirmed blast radius to ~30 files: the same
`features/chat/v3`/`UnifiedChatPage` cascade `web-frontend.md` already
flagged as "parked convergence work," including `Main/ChatHeader.tsx`,
`Main/ChatTopBar.tsx`, the entire `Sidebar/`, `Tools/`, and `workflows/`
subdirectories, `use-export-conversation.ts`, `use-unified-adapter.ts`,
`useHelpTour.ts`, `conversation-export.ts`, `document-export.ts`.

| Slice                                                                                                                     | Files | Verdict                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Export feature (`EnhancedExportDialog.tsx`, `use-export-conversation.ts`, `conversation-export.ts`, `document-export.ts`) |     4 | **WIRE** — extract out of the dead cascade and mount directly in the live `WebChatPage`'s header (the way `MessageBubble.tsx` already lives outside the v3 tree). A materially complete feature (real parity item against ChatGPT web's export action, per `research/chatgpt-web-desktop.md`) currently reaches no user. |
| Remainder of the v3/`UnifiedChatPage` cascade                                                                             |   ~26 | **DELETE** — unless the product intends to eventually ship the v3 shell as the real chat surface, in which case the whole cascade (export dialog included) becomes reachable for free and this row flips to DOCUMENT-AS-INTENTIONAL/roadmap.                                                                             |

(DEAD-CODE-009)

### 5.4 Orphaned legacy `/api/usage/*` alias routes

**Verdict: DELETE.** `apps/web/app/api/usage/analytics/route.ts`,
`.../usage/history/route.ts`, `.../usage/providers/route.ts` — all three
self-document as "Legacy alias" and delegate to `getManagedUsageSummary`.
Repo-wide grep (web, desktop, mobile, packages) for each literal path finds
zero non-route-file, non-test callers. The sibling `billing/analytics`
route uses the identical delegation pattern but **is** live — called from
`apps/desktop/src/stores/billingUsage.ts` — confirming these three are the
dead outliers, not evidence the pattern itself is bad. (DEAD-CODE-010)

### 5.5 `/qa-artifacts` and `/dev/inline-toolcall-demo` — correction to the original lead

**Verdict: DOCUMENT-AS-INTENTIONAL** for the guard mechanism; **DELETE**
(a one-line cosmetic edit) for the residual hygiene issue. The brief's
framing — that these ship as reachable, unauthenticated production
harnesses — does not hold under direct verification:

- Both routes are guarded by a Server Component layout calling `notFound()`
  whenever `process.env.NODE_ENV === 'production'` — and `next build`
  always sets `NODE_ENV=production`, so this holds on every deployment
  tier including preview, not just the production domain.
- Both paths are additionally listed in `DISALLOW_APP`
  (`apps/web/lib/seo/site.ts:68-82`).
- `apps/web/app/qa-artifacts/` is listed in `.gitignore:252` and confirmed
  via `git ls-files` to be **completely untracked** — it cannot reach a
  git-based deploy at all.
- `apps/web/app/dev/inline-toolcall-demo/page.tsx` **is** git-tracked and
  does embed the literal string `~/Desktop/reference/ui/desktop/
claude-artifacts/...`, but that string only ever renders when
  `NODE_ENV !== 'production'` — never in a real deployment. The
  200-status observations in `web-route-sweep-findings.md` came from a
  local `next dev` server (`NODE_ENV=development`), where the guard is
  intentionally inactive — not evidence of a production leak.

This is a genuinely well-engineered, three-layer kill-switch (env guard +
gitignore + robots disallow) and should not be torn out. The only real
residual item: `inline-toolcall-demo/page.tsx` permanently embeds one
person's local directory path in tracked source, which serves no functional
purpose in dev-only code and should be replaced with a generic placeholder.
(DEAD-CODE-011)

### 5.6 13 retired-410 route families — good design, not a defect

**Verdict: DOCUMENT-AS-INTENTIONAL.** All routes under `apps/web/app/api/agents/**`
(`collaboration`, `communication`, `communication/[id]`, `execute`,
`log-message`, `session`, `tool-executions`, `tools`, `tools/[id]`), plus
`completion`, `mission`, `usage/deduct`, and
`v1/providers/[providerId]/stream`, return a typed `410 ENDPOINT_RETIRED`
via one shared handler (`retired-managed-execution.ts`), each carrying an
identical comment naming the retirement reason (STB-20: the live agents
surface moved to the Express api-gateway's own router). Repo-wide grep
confirms zero non-test callers for any of them. `web-backend.md` states
"13 routes total use this retirement pattern" as the authoritative count
(its own prose elsewhere says "8 routes" under `/api/agents/**` while
listing 9 route names — a minor internal inconsistency in the source
document, noted here rather than silently repeated). This is a model for
API sunsetting: typed error code, pointer to the replacement, one shared
handler, zero ambiguity for an old client. Only the DB tables the retired
subsystem left behind are dead-code (§6.1). (referenced in `domain-dead-code.md` §3)

---

## 6. Web — backend / database

### 6.1 Legacy DB tables

| Table(s)                                                                                                                                                                                           | Only reference                                                                                                       | Verdict                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent_tools`, `agent_tool_executions`, `agent_approval_requests`, `chat_messages`, `chat_folders`, `message_bookmarks`, `message_reactions`, `user_shortcuts`, `messaging_connections` (9 tables) | GDPR/DPDP erasure sweep only (`account-erasure.ts:60,61,64,65,75,84,89-91`)                                          | **DOCUMENT-AS-INTENTIONAL** — a defensible compliance-retention reason to keep them; the gap is discoverability, not correctness. Consider a schema-level comment recording why, so a future reader doesn't have to re-derive it from a full-repo grep.                                                                                                                               |
| `referrals`                                                                                                                                                                                        | Zero code references anywhere                                                                                        | **DELETE**                                                                                                                                                                                                                                                                                                                                                                            |
| `cloud_waitlist`                                                                                                                                                                                   | Zero code references; `waitlistService.ts:11` explicitly calls it "the older... table, not `cloud_managed_waitlist`" | **DELETE**                                                                                                                                                                                                                                                                                                                                                                            |
| `teams`, `team_members`                                                                                                                                                                            | 0 non-SQL references (`team_members`); 3 references, all migration bookkeeping (`teams`)                             | **DOCUMENT-AS-INTENTIONAL, tracked** — drop migration `0058_drop_legacy_teams.sql` is already written but its own header marks it "FOUNDER-GATED: NOT applied by this change... an explicitly-gated, separate, founder-run step." The live schema may still carry both tables today; flag for a tracked follow-up so the migration isn't lost, but do not apply it outside that gate. |
| `shared_conversations`                                                                                                                                                                             | Backs the dead duplicate share path (§5.2)                                                                           | **DELETE** (once §5.2 is actioned)                                                                                                                                                                                                                                                                                                                                                    |

(DEAD-CODE-006, plus the `shared_conversations` cross-reference from DEAD-CODE-008)

### 6.2 Unscheduled cron — a real bug, not just orphaned code

**Verdict: WIRE.** `apps/web/app/api/cron/expire-organization-invitations/route.ts`
is a complete, defensive handler (`verifyCronRequest` auth, idempotent
`status='pending' AND expires_at<=now()` update). The repo root
`vercel.json` wires exactly 9 crons; this route — the 10th cron directory
under `apps/web/app/api/cron/` — is not among them. The route's own doc
comment states the consequence directly: "A pending invitation HOLDS a
licensed seat... If nothing ever flips a lapsed invitation to expired, that
seat is never returned and a team silently locks itself out of the seats it
paid for." No other trigger exists anywhere in the repo. Smallest possible
fix: add one entry to `vercel.json`'s cron array — the handler itself needs
no changes. (DEAD-CODE-005, the domain's only P1 with an active
correctness/billing consequence, not just inert dead weight)

---

## 7. Mobile

| Item                                                                                                                                                                                                                         | Files                                                                                                                                                        | Verdict                     | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Edge-case UX library — `BatteryLowModal`, `ThermalThrottleModal`, `StorageFullModal`, `ModelLoadingFirstRunModal`, `FileTooLargeModal`, `ImageTooLargeModal`, `FileUnreadableModal`, `MessageErrorScreen`, `CloudTeaseModal` | 9 components (all copy-locked, all render-tested)                                                                                                            | **Split: WIRE 2, DELETE 7** | `StorageFullModal` (no current handling found for the real failure mode) and `ModelLoadingFirstRunModal` (directly relevant to the local-model download UX) are the two highest-value wires — **WIRE**. The other 7 lack any near-term trigger: real file-size errors are already handled by inline composer text (`attachmentValidation.ts:107-108`, superseding `FileTooLargeModal`/`ImageTooLargeModal`), and no battery/thermal sensor listener exists anywhere in the codebase for the other two to ever fire — **DELETE**. `OfflineBanner.tsx`, the 10th component in the same feature, is the one that IS mounted (from `app/_layout.tsx`) and is not part of this finding. |
| `src/features/sidebar/**` (pre-drawer nav)                                                                                                                                                                                   | 8 files (`Sidebar.tsx`, `ConversationList.tsx`, `ConversationItem.tsx`, `SearchBar.tsx`, `SidebarHeader.tsx`, `TagFilter.tsx`, `AutoTagBadge.tsx`, + barrel) | **DELETE**                  | Fully superseded by `src/features/drawer/components/DrawerContent.tsx`, the live navigation surface. Zero imports outside the directory. Already flagged in `known-flaws.md` as a cleanup item.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `app/(app)/widget-setup.tsx`                                                                                                                                                                                                 | 2 files (`app/(app)/widget-setup.tsx`, `src/features/widget-setup/index.tsx`)                                                                                | **WIRE**                    | Screen is a correctly-honest Siri-Shortcuts how-to (no false widget-availability claims — a good prior fix), route registered but hidden (`options={HIDDEN}`, `_layout.tsx:119`). No entry point anywhere. Add a single Settings row; the content is legitimate and cheap to surface.                                                                                                                                                                                                                                                                                                                                                                                              |

(DEAD-CODE-016, DEAD-CODE-017, DEAD-CODE-018)

Mobile's Skills screen (built, complete, fully unreachable) is covered in
§9 alongside the rest of the `done-claim-verification.md` findings, since
it comes from that verification pass rather than the dead-code domain scan
directly — but it belongs to this surface and this ledger equally.

---

## 8. Chrome extension

**Verdict: WIRE (one item); otherwise report strength.**
`shouldExecuteScheduledTask()` (`apps/extension/src/background/policy.ts:727-732`)
returns `true` unconditionally when `task.createdByOrigin` is falsy, with
the comment "legacy task pre-stamp; permit" — the **only** fail-open branch
in an otherwise fail-closed provenance-gating codebase; every other gate in
this surface is fail-closed per the inventory's own review. Recommended
fix: a one-time migration stamping `createdByOrigin` on legacy tasks, then
flip the fallback to fail-closed. (DEAD-CODE-021, P3 — real but narrow)

**Strength worth stating plainly (this domain's own reconciliation, not
just prior art):** `knip` is not configured for this workspace and its raw
output (e.g. flagging `apps/extension/src/background.ts` — a manifest-loaded
background script — as "unused") is not trustworthy here; this pass
correctly excluded it rather than filing false positives. Independently,
`prior-art-reconciliation.md` and this domain's own reconciliation confirm
112 test files / 1,549 passing tests, zero `TODO`/`FIXME`, and
`check:no-cloud-ipc` passing — the strongest reliability signal of any
surface in this audit. **DOCUMENT-AS-INTENTIONAL** — do not let raw `knip`
noise for this surface drive cleanup decisions.

---

## 9. VS Code extension

**Verdict: DOCUMENT-AS-INTENTIONAL**, with a WIRE or DELETE fork available
once the underlying capability decision is made. `SidebarProvider.rewindLast()`
(`features/sidebar-webview/sidebarProvider.ts:183-185`) and
`ChatStateManager.rewindLast()` (`ChatStateManager.ts:1451-1456`) have zero
callers anywhere — grepped the whole webview protocol
(`protocol/webviewMessages.ts`, `webviewContent.ts`) for any `rewind`
message type or UI trigger and found none; no command invokes either
method. This is not a new finding: it matches the existing tracker row
`GAP-284` ("'Rewind' action exists but is permanently disabled/stubbed"),
independently reconfirmed here. If reachable, it would correctly surface an
honest error ("Rewind is unavailable until the local runtime exposes turn
rollback") rather than pretend to work — **inert-but-honest dead code, not
a deceptive stub**, which is why this ledger treats it as intentional
pending-on-a-backend-capability rather than a straightforward DELETE. Once
turn-rollback exists in the local runtime, this flips to WIRE; if that
capability is never built, DELETE the two dead methods to reduce surface
area. (`extension-vscode.md` §1.1, not filed as a new `DEAD-CODE-*` ID)

No other material dead/disconnected findings for this surface: no
contributed-but-unimplemented commands, no registered-but-uncontributed
commands (both enforced by test), no duplicate registrations, no orphaned
configuration settings (`SETTINGS_PANEL_SETTING_KEYS` kept in lock-step
with the Zod schema).

---

## 10. Shared packages, cross-surface, and CLI

| Item                                                                                                                                                   | Verdict                                     | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@agiworkforce/browser-tool` stale dependency in `apps/extension/package.json`                                                                         | **DELETE**                                  | The package's own README states "Consumers: None today"; its only importer was deleted with its bridge in `bfce749b3` (2026-08-09). `knip`'s "Unused dependencies" output independently confirms this exact entry. Zero-risk, one manifest line.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `@agiworkforce/licensing` (TS package) + `crates/agiworkforce-licensing` (Rust crate)                                                                  | **DOCUMENT-AS-INTENTIONAL**                 | Both self-document as "NOT wired into any app runtime, UI, or enforcement path" — honest, tracked non-wiring, not a discovered bug. Residual risk worth tracking: the two independent implementations of the same signed-container verification logic have no fixture-replay parity test between them (unlike the `sync` package's Rust/TS parity harness), so if/when enterprise licensing is wired, they could silently diverge. Recommend adding that test **before** either is wired into a real enforcement path, not as urgent standalone work.                                                                                                                                                                                                                                          |
| EU AI Act provenance-marker serialization bug (`apps/web/lib/compliance/ai-act.ts:26-38`, `packages/contracts/compliance/src/article50-marker.ts:138`) | **WIRE** (fix, then collapse the duplicate) | The web-side file hand-restates the shared package's marker shape (because the package isn't a declared web dependency) and its own comment documents a real bug it mirrors: `serialiseClaim` does `JSON.stringify(claim, Object.keys(claim).sort())` — a flat top-level key array misapplied as a global allowlist at every nesting depth. Nested `assertions[].label`/`.action` keys never survive, so mobile's real emitted sidecar serializes `assertions` as `[{}]`, and web's `hasAiGeneratedProvenance()` would reject mobile's own compliant output. This is a compliance-relevant correctness bug, not just an architecture smell. Fix: sort keys recursively at every nesting depth; then the web-side hand-restated duplicate can eventually collapse back onto the shared package. |
| `apps/cli/src/sandbox.rs:1` — whole-file `#![allow(dead_code, unused_imports)]`                                                                        | **DOCUMENT-AS-INTENTIONAL** (minor hygiene) | Broader than the individually-scoped `#[allow(dead_code)]` markers used elsewhere in the Rust workspace; the module's core types (`SandboxManager`, `SandboxType`) are demonstrably live. Narrowing the allow to the specific unused items would be good hygiene but is not urgent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

(DEAD-CODE-019, DEAD-CODE-020; `runtime-infra.md` for the CLI note, independently corroborating the licensing-crate finding)

---

## 11. Built-but-unreachable: `done-claim-verification.md` regressions

The brief is explicit that a built-but-unreachable feature is dead code by
any useful definition. Of the 9 exceptions in `done-claim-verification.md`
(3 REGRESSED, 4 PARTIALLY_DONE, 2 NOT_DONE), 7 fit that definition and are
carried into this ledger below. The remaining 2 (`GAP-014`, mobile
restore-purchases — the cited hook/test files do not exist anywhere in the
repo, a fabricated-evidence problem, not a dead-code problem; `GAP-083`,
the Connections/Connectors mislabeling — already folded into §3.3 above,
since the code there is reachable, just under a confusingly-named sibling
tab) are excluded here because no code exists to delete or wire in either
case.

| ID                   | Surface                                                | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Verdict                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GAP-001`            | Mobile                                                 | Skills screen (`SkillsScreen.tsx`, 655 lines: search, source badges, Cloud-mode gate, loading/error/empty states; route registered at `app/(app)/skills/index.tsx`) is fully built and complete. Commit `1e858a7f1` (ancestor of HEAD) removed the Skills row from the drawer's `PRIMARY_ITEMS`, and the current test now asserts its **absence**. `/(app)/skills` appears in exactly two places repo-wide: an unused `RoutePath` type-union member and the route wrapper itself.                                | **WIRE** — restore the drawer entry. A 655-line, fully-tested screen with no entry point is worse than either shipping it or deleting it; restoring navigation is the cheaper of the two real options and there is no evidence the removal was a deliberate product decision (unlike QuickChips below).                                                                         |
| `GAP-051`, `GAP-205` | Desktop/web/mobile shared (`packages/ui/unified-chat`) | Both rows describe a shared `QuickChips` component with capability filtering. Commit `2a37d81da` (2026-08-07, ancestor of HEAD) deleted quick-start suggestion chips **from every surface** on an explicit founder decision dated 2026-08-06. Neither `QuickChips.tsx` nor a `quickChipAvailability` prop exists anywhere in the repo outside audit files; the only trace is a dead, unused mock declaration in `DesktopShellV3.test.tsx`.                                                                       | **DOCUMENT-AS-INTENTIONAL** for the removal itself (deliberate founder decision, not a regression to reverse). The actionable item is a **ledger correction**, not a code change: retire both rows in `ui-gaps.csv` to `Superseded` — leaving them as `Done` implies a feature exists that a reader will look for and not find.                                                 |
| `GAP-086`            | Desktop                                                | Send-shortcut preference (`Enter` vs. `Cmd/Ctrl+Enter`) is wired end-to-end — `settingsStore.ts` persists `chatPreferences.sendShortcut` with migration/hydration, `DesktopShellV3.tsx` reads it, `ChatInterface`/`ChatInput.tsx` correctly branch on it — except **no UI anywhere lets a user change it**. `setSendShortcut` has exactly 3 call sites, all inside the store that defines it (type declaration, implementation, its own telemetry string). Zero external callers.                                | **WIRE** — add the missing settings control. This is precisely CLAUDE.md's named failure mode: "a validated parameter no caller can send." The enforcement chain is real; only the control is missing.                                                                                                                                                                          |
| `GAP-064`            | Desktop                                                | Production wiring for the Chat/AGI Work switch is real (tier-gating via `canUseDesktopCloudAgiWork`/`getAgiTaskModelEligibility`, not hardcoded) — but the test file cited as proof, `DesktopShellV3.test.tsx`, fails **all 29 tests** at render time: `TypeError: state.getSelectedModel is not a function`. `git show 1e858a7f1` shows the mock of `useChatModelStore` was left as `{ models: [] }` when that commit added the `getSelectedModel()` call, and the mismatch has persisted unfixed through HEAD. | **WIRE** (fix the test double, not the production code). The real store implements `getSelectedModel`; only the stale mock is broken. This silently voids the evidence for every other row that cites this test file until fixed — treat test-suite health as an audit input in its own right, per the source document's own closing point.                                     |
| `GAP-101`            | Desktop                                                | `McpToolConfirmationPrompt.tsx` (tool-approval dialog) has no keyboard handling of any kind — no `useEffect`, no `onKeyDown`, no reference to `Enter`/`Return`/`Escape`. Escape-to-deny works only incidentally via Radix Dialog's default `onOpenChange(false)`. Return-to-approve does not exist, though the Deny button advertises an `Esc` hint the component doesn't actually implement itself.                                                                                                             | **WIRE** — add the matching Enter-to-approve handler (or remove the misleading `Esc` hint if full keyboard support isn't being committed to). An approval dialog that advertises one shortcut and silently lacks its counterpart is worse than advertising neither.                                                                                                             |
| `GAP-210`            | Cross-surface (desktop ↔ mobile)                       | Desktop's `QRPairingCard.tsx:113-117` instructs the user to navigate to "AGI Workforce → Desktop Companion." Mobile has no such destination — the drawer entry is labelled "Remote" (route `/(app)/companion`) and the settings entry point is "Desktop control." A user following the printed instructions literally cannot find the screen.                                                                                                                                                                    | **WIRE** — align the copy across both surfaces (either rename mobile's entry to match, or update desktop's printed instructions to mobile's actual labels). This class of defect — visible only in the relationship between two surfaces — is invisible to either surface's own per-surface audit by construction; flagging it here is exactly why cross-surface checks matter. |

---

## 12. What NOT to touch — confirmed-sound patterns (corrections to the record)

Several items the original audit leads framed as candidate dead code are
**not** dead code once the actual guard/routing logic is read. Recording
these prevents re-litigating settled, correct decisions in a future pass —
the same failure mode this ledger documents happening to `known-flaws.md`
itself in §13 below.

| Pattern                                                                                                        | Why it's sound                                                                                                                                                                                                                                                                                                                                                                                                                | Verdict                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3 sign-in routes (`/login`, `/sign-in`, `/auth/login`) + 3 sign-up routes (`/signup`, `/sign-up`, `/register`) | `/login` and `/signup` are the only real Clerk-backed implementations; the rest are one-line `redirect()` aliases with documented reasons (`/sign-in`'s comment explains the desktop app's cloud-auth handoff and Clerk's own `/sign-in` convention specifically target this URL). This is a legitimate, working alias pattern serving real external callers — **correcting** the brief's "duplicate sign-in routes" framing. | **DOCUMENT-AS-INTENTIONAL** (not filed as a gap at all; the separate question of whether 3 URLs answering "sign in" is good IA belongs to a navigation domain, not this one) |
| 13 retired-410 route families                                                                                  | Typed error, pointer to the replacement, one shared handler — see §5.6.                                                                                                                                                                                                                                                                                                                                                       | **DOCUMENT-AS-INTENTIONAL**                                                                                                                                                  |
| `/qa-artifacts`, `/dev/*` kill-switches                                                                        | Three independent layers (env guard, gitignore, robots disallow) — see §5.5.                                                                                                                                                                                                                                                                                                                                                  | **DOCUMENT-AS-INTENTIONAL**                                                                                                                                                  |
| `apps/desktop/archive/` isolation                                                                              | Correctly excluded from build/test, zero live imports — see §3.1.                                                                                                                                                                                                                                                                                                                                                             | **DOCUMENT-AS-INTENTIONAL**                                                                                                                                                  |
| `wiring-allowlist.json` self-governance                                                                        | Fails CI on regrowth, every entry load-bearing — see §2.3.                                                                                                                                                                                                                                                                                                                                                                    | **DOCUMENT-AS-INTENTIONAL**                                                                                                                                                  |
| Tauri IPC command registry                                                                                     | Near-zero registration drift, zero calls to nonexistent commands — see §2.1.                                                                                                                                                                                                                                                                                                                                                  | **DOCUMENT-AS-INTENTIONAL**                                                                                                                                                  |
| Chrome extension surface, evaluated via `knip`                                                                 | `knip` is not configured for this workspace; its raw "unused" hits for a manifest-loaded background script are false positives, not evidence of dead code.                                                                                                                                                                                                                                                                    | **DOCUMENT-AS-INTENTIONAL** (methodological note, not a code finding)                                                                                                        |
| Mobile's feature-flag gating discipline                                                                        | Every honestly-gated flag (`agents`, `computerUse`, `crossDeviceSync`, etc.) renders a real `<FeatureUnavailable/>` rather than a blank screen or fake success; the permissions registry documents _removing_ a half-wired `location` permission rather than leaving it half-built.                                                                                                                                           | **DOCUMENT-AS-INTENTIONAL** — the positive counter-example to everything else in this ledger                                                                                 |

---

## 13. One finding that is itself about the audit trail

`docs/agent-context/known-flaws.md:533-535` (dated 2026-08-05) states 4
desktop `teams/` components "are consumed by the quarantined
`experimental/TeamDashboard.tsx` — kept," i.e., not orphans. `git log
--diff-filter=D --summary` shows `apps/desktop/src/features/experimental/TeamDashboard.tsx`
was deleted in commit `4354d3d8b` on 2026-08-07 — **two days after the
ledger entry was written** — and that commit is an ancestor of HEAD. At
HEAD, the file does not exist, and repo-wide grep for all 4 component names
outside their own definitions returns zero hits. `TeamAccountSettings.tsx`,
`stores/teamStore.ts`, and `api/teamsApi.ts` (3 more files, outside the
`features/teams/` directory counted in §3.2) are equally orphaned.

**Verdict: DELETE** the 8 code files (4 `features/teams/*` + `TeamAccountSettings.tsx`

- `teamStore.ts` + `teamsApi.ts`, of which the first 4 overlap with §3.2's
  183-file count and the remaining 3 do not) together with the stale
  `known-flaws.md` entry, ideally in the same pass that eventually applies
  `0058_drop_legacy_teams.sql` (§6.1) — the backend concept and its desktop
  UI are dead for the same reason, on the same timeline.

This matters beyond the 8 files: CLAUDE.md mandates reading
`known-flaws.md` before touching a surface specifically so agents don't
re-litigate settled decisions. Here the ledger's "settled decision" was
already wrong two days after it was written, and nothing caught the drift
before this audit. (DEAD-CODE-001)

---

## 14. Final quantified tally

Counts are deduplicated where overlaps were identified in the text above
(e.g., `teams/` files counted once, not in both §3.2 and §13; the
`document_edit_excel` command counted once, not in both §2.2 and §2.3).
Tauri-command totals in §2.2 and §2.3 are kept separate per the overlap
warning there and are not added into the single grand total below.

| Bucket                                              |                                                            DELETE |                                                                                              WIRE |                        DOCUMENT-AS-INTENTIONAL | NEEDS VALIDATION |
| --------------------------------------------------- | ----------------------------------------------------------------: | ------------------------------------------------------------------------------------------------: | ---------------------------------------------: | ---------------: |
| Tauri commands, 154-command sweep (§2.2)            |                                                                22 |                                                                                                29 |                                              7 |               96 |
| Tauri commands, wiring-allowlist (§2.3)             |                                                                 3 |                                                                                                28 |                                             38 |                0 |
| Desktop frontend files (§3, §13; excludes archive/) | ~172 (166 untriaged + 3 teams-only + 3 api/\*.ts overcount adj.†) | 21 (roi-dashboard 11 + notifications 2 + MCP-adjacent fix 0 + Electron shortcuts 2‡ + export-n/a) |                                              0 |                0 |
| Desktop feature files already isolated (`archive/`) |                                                                 0 |                                                                                                 0 |                                            204 |                0 |
| Web frontend files                                  |  ~161 (shared/ 130 + v3 cascade 26 + share-dup 2 + usage-alias 3) |                                                                                  4 (export slice) |                   2 (qa-artifacts guard files) |                0 |
| Mobile files                                        |                                     15 (sidebar 8 + edge-cases 7) |                                                                 4 (edge-cases 2 + widget-setup 2) |                                              0 |                0 |
| Mobile screens (nav-only fix, no new files)         |                                                                 0 |                                                                                   1 (Skills, §11) |                                              0 |                0 |
| DB tables                                           |               3 (referrals, cloud_waitlist, shared_conversations) |                                           1 (cron scheduling, not a table but the nearest bucket) |        11 (9 GDPR-only + teams + team_members) |                0 |
| API routes                                          |                                                 3 (usage aliases) |                                                                                                 0 | 13 (retired-410) + 6 (sign-in/sign-up aliases) |                0 |
| Chrome extension                                    |                                                                 0 |                                                                              1 (fail-open branch) |                                              0 |                0 |
| VS Code extension                                   |                                                                 0 |                                                                            0 (pending capability) |                         2 (`rewindLast` files) |                0 |
| Shared packages                                     |                                         1 (browser-tool dep line) |                                                                                                 0 |                        2 (licensing TS + Rust) |                0 |
| Cross-surface                                       |                                                                 0 |                                      5 (provenance-bug fix 2 files + GAP-086 + GAP-101 + GAP-210) |                                              0 |                0 |
| CLI                                                 |                                                                 0 |                                                                                                 0 |                               1 (`sandbox.rs`) |                0 |

† The `api/*.ts` wrapper layer (~20 files, DELETE) and `MCPServerManager`
family (6 files, DELETE) are folded into the "Desktop frontend files"
DELETE total; exact figure: 166 (untriaged DEAD-CODE-002 remainder) + 3
(teams' non-`features/teams/` files: `TeamAccountSettings.tsx`,
`teamStore.ts`, `teamsApi.ts`) + 20 (`api/*.ts`) + 6 (MCP superseded UI, 5
components + barrel) = **195**. The table cell above understates this for
brevity; treat 195 as the precise Desktop-frontend-files DELETE count.

‡ Electron's 2 shortcut-related files (`settingsStore.ts`,
`garnishCore.ts`) need a **new** UI control added, not a new file
necessarily — counted here as a WIRE action, not a file-creation count.

**Reading the totals.** The dominant single number in this ledger is the
~166-file untriaged remainder of `DEAD-CODE-002` (desktop feature
directories built but never mounted) — larger than every other bucket
combined, and the one place a single per-directory triage pass would move
the most code out of an ambiguous state. The dominant _command_-level
number is the 96 Tauri commands in the "smaller dead pockets" and
unenumerated-remainder rows of §2.2, which this pass explicitly declined to
force a verdict onto for lack of individual evidence — that triage is the
largest concrete follow-up this ledger recommends over guessing.
