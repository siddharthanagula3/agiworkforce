# W10 — Desktop application

[← all waves](../WAVES.md) · [register index](../README.md)

**Why now.** Desktop is the surface with the deepest structural debt and must be a single dedicated pass: roughly 35% of the app (20 feature directories, ~94k LOC) is unreachable from the shell, automation triggers can never fire because TriggerRegistry::start() has no caller, approval requests are emitted but not renderable, notification center is unmounted, voice output never runs, and settings expose controls wired to dormant subsystems. These are one problem wearing many hats — features built to the IPC boundary and never mounted — so the reachability inventory in DESK-05 is the planning artifact for most of the rest, and splitting them across waves would mean re-deriving that inventory repeatedly. It runs after W3 (signed builds exist, so Cloud Mode and the update journey can be confirmed), after W8 (the shared runtime and registry it should call now exist) and after W4/W6 (egress, isolation, telemetry and deletion already corrected in the Rust layer).

**Size.** 100 items (6 critical, 19 high, 50 medium, 25 low); 83 open.

**Done when.** A reachability inventory lists every desktop feature directory as wired, deleted, or explicitly deferred with an owner and date; the ~94k unreachable LOC count drops to the inventoried decision set and a guard prevents new orphans. A scheduled trigger fires end to end from a restarted app (registry started from a real caller, triggers persisted); an approval request renders, can be decided, and the turn resumes; a second app instance is refused by an OS-level single-instance guard. Cloud Mode is reachable on a signed build with live Clerk credentials and the callback and update journeys are observed on that build. Notification center is mounted with all four groups able to fire and DND honoured; push-to-talk and wake word have subscribers; the conversational voice loop runs with barge-in. Retry regenerates, new chat clears the draft, sidebar lists all projects by recency, Customize resolves or is removed, project memory is project-scoped with one MemoryCategory model, and no setting toggles a dormant subsystem. Artifacts stream tokens, publish for real or say so, and report true versions. Document/PDF/spreadsheet viewers, git and PR features, and the plugin manager either have entry points and honest state or are deleted; PR creation no longer fakes success. Declined items (DESK-51..54) are recorded as dated wontfix decisions. Icon-only controls have aria-labels.

| ID                    | Sev      | Item                                                                                                                                                                                             | Effort |
| --------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| [DESK-02](#desk-02)   | CRITICAL | Desktop Cloud Mode is gated behind a 'coming soon' toast contrary to the founder spec; DCL-4 unverifiable                                                                                        | L      |
| [DESK-04](#desk-04)   | CRITICAL | Desktop automation triggers can never fire: TriggerRegistry::start() has no non-test caller, and triggers are memory-only                                                                        | L      |
| [DESK-05](#desk-05)   | CRITICAL | 20 desktop feature directories (~94,513 LOC, 537 modules, 35% of the app) are unreachable from the shell                                                                                         | XL     |
| [DESK-105](#desk-105) | CRITICAL | Desktop background agents are fully built in Rust but unreachable: 11 Tauri commands and 7 of 9 events have zero production callers and there is no push-to-background UI                        | L      |
| [DESK-66](#desk-66)   | CRITICAL | Desktop background-agent subsystem (BackgroundAgentManager, 11 Tauri commands, 9 events) is fully built but unreachable from any UI                                                              | L      |
| [DESK-70](#desk-70)   | CRITICAL | Desktop image and video generation is unreachable from the live chat composer, and the Rust media commands never absolutize the returned relative URLs                                           | L      |
| [DESK-06](#desk-06)   | HIGH     | Desktop approval requests are emitted but not renderable or resumable; two competing approval UIs, one dead                                                                                      | L      |
| [DESK-07](#desk-07)   | HIGH     | Desktop built-in browser cannot launch on stock macOS or Linux; computer-use hard-blocked on all Linux                                                                                           | M      |
| [DESK-09](#desk-09)   | HIGH     | No OS-level single-instance guard: two desktop processes can corrupt the same encrypted DB                                                                                                       | S      |
| [DESK-10](#desk-10)   | HIGH     | Desktop has zero settings-sync wiring in any app mode                                                                                                                                            | L      |
| [DESK-106](#desk-106) | HIGH     | Desktop 'teams' feature slice is fully orphaned, and the known-flaws.md entry claiming otherwise is stale and actively misleading                                                                | S      |
| [DESK-11](#desk-11)   | HIGH     | Desktop in-app Notification Center is unmounted; group toggles and DND schedule are inert; only 2 of 4 groups can fire                                                                           | L      |
| [DESK-12](#desk-12)   | HIGH     | Global Push-to-Talk (Fn key) has no event subscriber; wake-word detection discards its event channel                                                                                             | M      |
| [DESK-13](#desk-13)   | HIGH     | Desktop voice output is unmounted: the conversational loop never runs, so barge-in and persona settings affect nothing                                                                           | L      |
| [DESK-33](#desk-33)   | HIGH     | Desktop artifacts: token streaming unwired, cloud publish a permanent 'coming soon', published version always 1                                                                                  | L      |
| [DESK-40](#desk-40)   | HIGH     | Desktop attachment docx/xlsx/pptx parsing unimplemented, and the knowledge-base picker offers PDFs it can never read                                                                             | L      |
| [DESK-68](#desk-68)   | HIGH     | Desktop 'teams' feature slice is fully orphaned and the known-flaws.md entry that claims otherwise is stale                                                                                      | S      |
| [DESK-69](#desk-69)   | HIGH     | Desktop Settings 'Connections' and 'Connectors' are a naming collision, and 'Connectors' stacks five unrelated subsystems in one scroll                                                          | M      |
| [DESK-71](#desk-71)   | HIGH     | Desktop message action row is missing feedback, edit, share, read-aloud, branch and report — most already exist as dead code                                                                     | M      |
| [DESK-72](#desk-72)   | HIGH     | Desktop shows no stdout/stderr console output for code-execution turns that only print text                                                                                                      | M      |
| [DESK-73](#desk-73)   | HIGH     | Desktop Tauri composer has no reasoning-effort / extended-thinking control despite the runtime carrying the parameters end to end                                                                | M      |
| [DESK-96](#desk-96)   | HIGH     | Desktop AGI Work views lack an onboarding checklist, customize hub and standalone task composer, and AGI Work subpanels plus AGI Code mounting/gating are unverified                             | L      |
| [DESK-97](#desk-97)   | HIGH     | Desktop system-wide dictation capability remains unbuilt after the deceptive-availability UI was fixed                                                                                           | XL     |
| [DESK-99](#desk-99)   | HIGH     | No remote developer-session control protocol exists end to end: desktop companion UI unmounted, CLI/VS Code host relay missing, mobile ships a static shell, and device grants are not revocable | XL     |
| [TEST-15](#test-15)   | HIGH     | apps/desktop DesktopShellV3.test.tsx is 29/29 failing on a stale store mock, making every ledger row that cites it unverifiable                                                                  | S      |
| [CONN-18](#conn-18)   | MEDIUM   | Desktop Cloud skill 'download' produces a raw file save, not a working install                                                                                                                   | M      |
| [CONN-30](#conn-30)   | MEDIUM   | Desktop SkillMarketplace vs the shared DirectoryBrowse skills tab is an unverified third skill-browsing UI                                                                                       | S      |
| [DESK-100](#desk-100) | MEDIUM   | Computer-to-computer pairing tab is not built — no authorized computer peer, target selection, persistent device identity or revocation lifecycle exists                                         | L      |
| [DESK-101](#desk-101) | MEDIUM   | Editing an existing Word document cannot preserve source content (docx_rs is write-only), so the editor is deliberately unregistered                                                             | L      |
| [DESK-103](#desk-103) | MEDIUM   | Desktop header falsely claims 'AGI Desktop · Released · v1.2.0'                                                                                                                                  | S      |
| [DESK-104](#desk-104) | MEDIUM   | Desktop bypasses the shared design-token package with 252 hardcoded hex colour literals and no guard                                                                                             | M      |
| [DESK-108](#desk-108) | MEDIUM   | Two independent CloudSyncClient structs exist in desktop Rust; the dead one targets a route that does not exist                                                                                  | S      |
| [DESK-112](#desk-112) | MEDIUM   | Desktop settingsStore ships ~14 persisted setters with zero call sites: model routing, window/session, and agent checkpointing                                                                   | M      |
| [DESK-119](#desk-119) | MEDIUM   | wiring-allowlist.json's ~65 self-tracked registeredWithoutReachableCaller commands still need individual WIRE/DELETE triage                                                                      | L      |
| [DESK-120](#desk-120) | MEDIUM   | Desktop Local-mode scheduled-jobs list is rendered by two independent hand-coded renderers reading the same store                                                                                | S      |
| [DESK-123](#desk-123) | MEDIUM   | Project gallery duplicated: desktop independently rebuilt AgiWorkProjects instead of consuming the shared ProjectGallery                                                                         | L      |
| [DESK-124](#desk-124) | MEDIUM   | Two ArtifactPanel implementations and two same-named artifactStore modules that do not share state                                                                                               | M      |
| [DESK-18](#desk-18)   | MEDIUM   | Desktop timeout constants remain duplicated across layers; nested deadlines can outlive their parents                                                                                            | M      |
| [DESK-19](#desk-19)   | MEDIUM   | Desktop keyboard shortcuts: three disconnected default sets and no reconciliation between renderer and native stores                                                                             | L      |
| [DESK-34](#desk-34)   | MEDIUM   | Desktop message Retry is a silent no-op and there is no one-click Regenerate, unlike web                                                                                                         | M      |
| [DESK-35](#desk-35)   | MEDIUM   | Desktop settings expose controls wired to dormant subsystems: checkpointing, auto-resume, prompt completion, zoom, Continue Generation, High Contrast                                            | L      |
| [DESK-37](#desk-37)   | MEDIUM   | Desktop AI-assisted git features and PR creation are backend-complete with zero callers, and PR creation fakes success                                                                           | M      |
| [DESK-39](#desk-39)   | MEDIUM   | Desktop DocumentWorkspace, PDFViewer, FilePreviewModal and spreadsheet viewing are built to the IPC boundary with no UI entry point                                                              | L      |
| [DESK-41](#desk-41)   | MEDIUM   | Desktop Project Settings 'Memory' tab creates account-wide memories under a project heading with no scoping                                                                                      | M      |
| [DESK-42](#desk-42)   | MEDIUM   | Desktop project archive and memory-category surfaces remain partly unwired; MemoryCategory is modeled three incompatible ways                                                                    | M      |
| [DESK-43](#desk-43)   | MEDIUM   | Desktop composer draft text is not cleared by 'New chat'                                                                                                                                         | S      |
| [DESK-45](#desk-45)   | MEDIUM   | Desktop Customize nav destination is translated in every locale but no such destination exists                                                                                                   | M      |
| [DESK-50](#desk-50)   | MEDIUM   | Desktop skill recorder: no macOS Screen Recording preflight, no per-step screenshots, no durable recording asset                                                                                 | L      |
| [DESK-55](#desk-55)   | MEDIUM   | Desktop plugin/extension manager has no enable-disable toggle, no configure/browse/drag-install, and no authoritative installed state                                                            | L      |
| [DESK-56](#desk-56)   | MEDIUM   | Desktop billing surface has no invoice history, payment method, cancellation state, or credit top-up path                                                                                        | M      |
| [DESK-58](#desk-58)   | MEDIUM   | Desktop browser/agent settings have no per-site policy, cookie reset or single browser-runtime owner                                                                                             | L      |
| [DESK-60](#desk-60)   | MEDIUM   | Desktop cloud-mode package reuse audit is incomplete and its prior negative findings were proven false                                                                                           | M      |
| [DESK-63](#desk-63)   | MEDIUM   | Desktop settings IA converged on the locked spec but visual E2E is pending; OutcomeTracker is not called by normal task execution                                                                | M      |
| [DESK-67](#desk-67)   | MEDIUM   | Desktop hooks\_\* subsystem (12 Tauri commands, Claude-Code-style hooks) is fully implemented with zero frontend callers                                                                         | L      |
| [DESK-75](#desk-75)   | MEDIUM   | Electron IPC bridge and deep-link SSO are dead in the shipped default (remote-renderer) configuration, so agiworkforce-cloud:// links are silently dropped                                       | S      |
| [DESK-76](#desk-76)   | MEDIUM   | Local/Cloud mode toggle silently reverts instead of disabling itself when Local mode is unavailable in the Electron renderer                                                                     | S      |
| [DESK-77](#desk-77)   | MEDIUM   | Desktop Cloud skill 'download' produces a raw file save, not a working install — nothing writes it into the local skill directory                                                                | M      |
| [DESK-80](#desk-80)   | MEDIUM   | Desktop model-routing setters (default provider, temperature, max tokens, task routing, favorites) have zero call sites                                                                          | M      |
| [DESK-81](#desk-81)   | MEDIUM   | Desktop window/session setters (startup position, dock behavior, send shortcut, chat storage mode, feature flags) have zero call sites                                                           | M      |
| [DESK-82](#desk-82)   | MEDIUM   | Desktop Cowork settings expose one control against a five-control benchmark, and neither Cowork nor scheduled-task creation has an approval-mode picker                                          | M      |
| [DESK-83](#desk-83)   | MEDIUM   | Superseded parallel MCP management UI (~2,000 lines) sits alongside the live MCPWorkspace in the same directory                                                                                  | S      |
| [DESK-84](#desk-84)   | MEDIUM   | Typed apps/desktop/src/api/\*.ts wrapper layer is largely bypassed by direct invoke() calls with string-literal command names                                                                    | L      |
| [DESK-85](#desk-85)   | MEDIUM   | ~1,777 lines of Discord/Signal/Telegram/WhatsApp messaging clients and a complete Gmail OAuth2 flow have zero frontend callers                                                                   | L      |
| [DESK-86](#desk-86)   | MEDIUM   | Two duplicated dead desktop backend subsystems: settings*v2*_ (parallel settings store) and checkpoint\__ (duplicating coding*checkpoint*\*)                                                     | M      |
| [DESK-87](#desk-87)   | MEDIUM   | Electron global-shortcut customization and tray-menu refresh are fully built with zero callers, so shortcuts are permanently fixed at defaults                                                   | M      |
| [DESK-89](#desk-89)   | MEDIUM   | Desktop McpToolConfirmationPrompt has no keyboard handling despite advertising an 'Esc' hint                                                                                                     | S      |
| [DESK-93](#desk-93)   | MEDIUM   | Desktop rebuilt the project gallery from scratch (AgiWorkProjects.tsx) instead of consuming the shared ProjectGallery, with no documented rationale                                              | L      |
| [DESK-94](#desk-94)   | MEDIUM   | Two artifactStore implementations and two ArtifactPanels coexist for desktop with an undocumented, runtime-unverified split                                                                      | M      |
| [DESK-95](#desk-95)   | MEDIUM   | Desktop SkillMarketplace.tsx vs the shared DirectoryBrowse skills tab — duplication flagged but never diffed                                                                                     | S      |
| [DESK-98](#desk-98)   | MEDIUM   | Desktop /git slash panel is archived and not actionable, pending an unmade product decision                                                                                                      | M      |
| [SEC-94](#sec-94)     | MEDIUM   | Desktop computer-use confirmation pause has no resume channel; real human-in-the-loop resume is unimplemented                                                                                    | M      |
| [TEST-12](#test-12)   | MEDIUM   | apps/desktop DesktopShellV3.test.tsx is 29/29 failing on a stale store mock, invalidating GAP-064's completion evidence                                                                          | S      |
| [UI-64](#ui-64)       | MEDIUM   | Desktop Cowork settings expose one control against a five-control benchmark                                                                                                                      |        |
| [UI-70](#ui-70)       | MEDIUM   | Project gallery is duplicated: web uses the shared ProjectGallery, desktop independently rebuilt AgiWorkProjects over an unrelated store with no documented rationale                            |        |
| [UI-76](#ui-76)       | MEDIUM   | Desktop McpToolConfirmationPrompt advertises an 'Esc' hint it does not implement and has no Enter-to-approve                                                                                     | S      |
| [DESK-102](#desk-102) | LOW      | Shared slash-command reconciliation (Ticket 1D) left unfinished after the desktop execute-plan handler was cut                                                                                   | M      |
| [DESK-110](#desk-110) | LOW      | Orphaned legacy memory-browser component family on desktop — five dead files exported but never mounted                                                                                          | S      |
| [DESK-111](#desk-111) | LOW      | Dead local-llm Cargo feature (llama-cpp-2) in Desktop with zero call sites                                                                                                                       | S      |
| [DESK-121](#desk-121) | LOW      | Desktop legacy 'job-based' scheduler UI (SchedulerPanel, JobCreationDialog) is dead code with a self-declared legacy label                                                                       | S      |
| [DESK-122](#desk-122) | LOW      | Desktop ArtifactsGallery.tsx (580 lines) has zero live importers and still compiles into the shipped bundle                                                                                      | S      |
| [DESK-125](#desk-125) | LOW      | Shared slash-command reconciliation (Ticket 1D) was deferred during the execute-plan cut and never closed                                                                                        | M      |
| [DESK-126](#desk-126) | LOW      | checkpoint_store.rs and checkpoint_manager.rs were left orphaned after the AGI checkpoint command cut                                                                                            | S      |
| [DESK-36](#desk-36)   | LOW      | Desktop background-task event listener writes continuously into a store whose only reader is unmounted                                                                                           | S      |
| [DESK-38](#desk-38)   | LOW      | Desktop agent/automation templates ship 9 commands, a service and a store with zero consumers and fabricated metrics                                                                             | M      |
| [DESK-44](#desk-44)   | LOW      | Desktop sidebar shows only the first 6 projects with no recency sort, so a 7th project can be invisible                                                                                          | S      |
| [DESK-46](#desk-46)   | LOW      | Desktop maintenance mode is a QA checklist item with no implementation anywhere in the monorepo                                                                                                  | M      |
| [DESK-47](#desk-47)   | LOW      | Desktop accessibility: icon-only buttons lack aria-labels, and no automated a11y coverage exists for the surface                                                                                 | M      |
| [DESK-48](#desk-48)   | LOW      | Desktop reasoning-trace code blocks are unstyled because the shared renderer's CSS classes live only in the web stylesheet                                                                       | S      |
| [DESK-49](#desk-49)   | LOW      | Desktop uses standard OS window decorations; an orphaned TitleBar.tsx exists but is never mounted                                                                                                | M      |
| [DESK-51](#desk-51)   | LOW      | Desktop mobile-companion pairing is single-session and ephemeral by design; every multi-device and roster capability is declined                                                                 | XL     |
| [DESK-52](#desk-52)   | LOW      | Desktop AGI Code settings, worktrees, PR inbox and diff theming are declined because no runtime owns them                                                                                        | XL     |
| [DESK-53](#desk-53)   | LOW      | Desktop native lifecycle toggles (startup, keep-awake, menu-bar, prevent-sleep) are declined because no native owner exists                                                                      | M      |
| [DESK-54](#desk-54)   | LOW      | Desktop lifecycle hooks, tool-runtime self-repair, MFA gate, session inventory and account deletion are declined without backing APIs                                                            | L      |
| [DESK-57](#desk-57)   | LOW      | Desktop usage dashboard, profile and settings surface parity gaps                                                                                                                                | M      |
| [DESK-59](#desk-59)   | LOW      | Desktop misc surface gaps: screen-capture settings, quick-query hotkey, list-panel triple states, licenses view, trace recording                                                                 | M      |
| [DESK-61](#desk-61)   | LOW      | Desktop InlineArtifactEditor duplicates the existing Monaco/Canvas editor integration                                                                                                            | M      |
| [DESK-78](#desk-78)   | LOW      | Orphaned legacy memory-browser component family on desktop — 5 dead files exported from a barrel but mounted nowhere                                                                             | S      |
| [DESK-91](#desk-91)   | LOW      | Desktop legacy 'job-based' scheduler UI (SchedulerPanel, JobCreationDialog) is dead code self-labelled as backwards compatibility                                                                | S      |
| [DESK-92](#desk-92)   | LOW      | Desktop ArtifactsGallery.tsx (580 lines) and ArtifactCategoryFilter are dead but still compile into the shipped bundle                                                                           | S      |
| [SEC-82](#sec-82)     | LOW      | voice_inject_text Tauri command stays registered and invokable with its documented safety precondition unmet, protected only by 'nothing currently calls it'                                     | S      |

---

### DESK-02 — Desktop Cloud Mode is gated behind a 'coming soon' toast contrary to the founder spec; DCL-4 unverifiable

`CRITICAL` · desktop · effort L

**What.** Founder spec states Desktop Cloud Mode uses the exact same backend as Web, but appModeStore.setMode('cloud') refuses on every Tauri build with a 'coming soon' toast (cloud.rs:59). DCL-1/2/3 landed; DCL-4 is blocked. Consequently the shared unified-chat client + guardedFetch persistence seam has never been proven to persist a managed-cloud chat from a signed build, and cross-surface continuity is unproven.

Also recorded by a later audit (Desktop Cloud chat path still incomplete (parity-implementation-matrix.md, Mounted Frontend Reconciliation)): Second-document confirmation of the register's Cloud Mode gate: the Chat/history row reads 'Present across Local/BYOK/Cloud, Cloud path still incomplete', consistent with DESK-02 (Cloud Mode behind a 'coming soon' toast contrary to the founder spec) and DESK-30 (desktop/cloud-chat surface returns zero selectable models for every tier).

**Done when.** Ship a signed build with live Clerk credentials, remove the mode refusal, and prove one managed-cloud chat persisting end to end plus cross-surface continuity.

**Where.** `apps/desktop/src/stores/appModeStore.ts`, `apps/desktop/src-tauri/src/sys/commands/chat/cloud.rs:59`, `apps/desktop/src/lib/cloudChatPersistence.ts`

**Blocked by.** signed desktop build + live Clerk credentials (founder/release action)

**From.** docs/agent-context/known-flaws.md (DESKTOP-CLOUD-MODE-SPEC-VS-REALITY-01, DESK-CLOUD-DCL2-LIVE-VERIFY-01); audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** DESK-CLOUD-DCL2-LIVE-VERIFY-01: desktop managed-cloud persistence seam only headlessly verified

### DESK-04 — Desktop automation triggers can never fire: TriggerRegistry::start() has no non-test caller, and triggers are memory-only

`CRITICAL` · desktop · effort L

**What.** Verified: registry.start().await.unwrap() appears exactly once in apps/desktop/src-tauri/src/core/agent/triggers.rs, at line 1425, inside the #[cfg(test)] module beginning at line 1261. start() is what spawns cron_poll_loop and binds the webhook server, so a user who creates a Cron or Webhook trigger sees a green bolt and 'Active' and it never fires once. Compounding: TriggerRegistryState is constructed from TriggerRegistry::new() with all-empty HashMaps, no cron_handle, no webhook_handle, no app_handle and no persistence layer, so every trigger is lost on restart. The File Watcher path does fire but logs success:true when app_handle is None and no agent actually ran.

**Done when.** Call TriggerRegistry::start() from the real app setup with a live app_handle, persist triggers to the desktop DB, and make spawn_agent_from_trigger return Err when it cannot spawn so the execution log stops recording false successes.

**Where.** `apps/desktop/src-tauri/src/core/agent/triggers.rs:415-440,583-586,628-643,1261,1425`, `apps/desktop/src-tauri/src/lib.rs:1150-1152`

**From.** docs/agent-context/phase4-capability-audit.md (PP-21)

**Folded in.** Desktop File Watcher trigger fires but logs a false success when the spawned agent never runs; Desktop automation triggers are stored in an in-memory HashMap with no persistence

### DESK-05 — 20 desktop feature directories (~94,513 LOC, 537 modules, 35% of the app) are unreachable from the shell

`CRITICAL` · desktop · effort XL

**What.** Not a wiring bug — a per-directory route-or-delete product decision across mcp, git, dynamic-canvas, roi-dashboard, teams, reminders, analytics, notifications, messaging, agent-collaboration and ten more. A separate basename-reference scan found 22 (floor estimate, possibly ~29) non-test .tsx files with no external reference, including all four survivors of features/experimental/ which are excluded from tsconfig and therefore not even typechecked. An orphan ratchet exists but does not run in CI. An earlier agent explicitly declined to half-apply the fix. Absorbs CAP-032 (unified chat/code/work shell), CAP-038 (docked inspector pane) and CAP-042 (navigation tree), which are individually-named orphans in the same inventory.

Also recorded by a later audit (~180 files across ~30 desktop feature directories are built but never mounted by App.tsx/DesktopShellV3 (DEAD-CODE-002)): knip reports 748 unused files repo-wide, 183 of them under apps/desktop/src/features/. Names the specific directories: a full ROI dashboard, in-app notification center, reminders, workflow builder, memory browser UI and message composer — none in App.tsx's lazy-import mount list. Explicitly distinct from and additional to apps/desktop/archive/ (204 files, correctly tsconfig/Vitest-excluded). Several map directly to parity gaps flagged elsewhere as NOT BUILT (notably the in-app notification center, cf. DESK-11). Recommends per-directory triage with ROI dashboard and notification center as the strongest mount candidates.

Also recorded by a later audit (~180 files across ~30 desktop feature directories built but never mounted (DEAD-CODE-002)): knip reports 748 unused files repo-wide, 183 under apps/desktop/src/features/. Named directories: roi-dashboard, notifications (in-app notification center), reminders, workflow builder, memory browser UI, message composer. Explicitly distinct from and additional to apps/desktop/archive/ (204 files, correctly tsconfig/Vitest-excluded). Several map directly to parity gaps flagged elsewhere as NOT BUILT — ROI dashboard and notification center are the strongest mount candidates.

**Done when.** Classify every orphan directory WIRE / REMOVE / test-only / generated-entry-point, delete or route each, then arm the orphan ratchet in CI so a new orphan fails the build.

**Where.** `apps/desktop/src/App.tsx`, `apps/desktop/src/features/experimental/`

**From.** ExecutionPlan.md (item #66); docs/agent-context/known-flaws.md (2026-08-04 desktop V3 orphan inventory, DESKTOP-CHAT-LEGACY-ORPHANED-01); audit/capability-gaps.csv (CAP-032, CAP-038, CAP-042); audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** Desktop V3 orphan inventory: 22+ unreachable feature components, no mount-or-delete decision; DESKTOP-CHAT-LEGACY-ORPHANED-01: wider legacy chat subtree cleanup still open; CAP-032: Unified chat code and work shell; CAP-038: Docked inspector pane; CAP-042: Mounted navigation tree

### DESK-105 — Desktop background agents are fully built in Rust but unreachable: 11 Tauri commands and 7 of 9 events have zero production callers and there is no push-to-background UI

`CRITICAL` · desktop · effort L

**What.** AGENTIC-WORK-001 (corroborated by DEAD-CODE-012). A complete Rust BackgroundAgentManager supports up to 8 parallel agents with 9 native events and 11 registered Tauri commands (background_agent_cancel/cleanup/get/list/list_active/pause/push/resume/should_push/stats/take_over). The only creation path is an LLM tool call; there is no 'push to background' UI. All 11 commands appear only in an invoke-allowlist string (registeredCommands.ts:174-184) and a dev mock (tauri-mock.ts:1319-1369) — zero production invoke() call sites. Only 2 of 9 events are ever listened to (completed/failed, for a notification). AgentTaskMonitor.tsx:14-23 wires an unrelated generic job queue instead, and a code comment points to a backgroundAgentStore.ts that does not exist. Distinct from DESK-36, which is the separate generic background-task store whose reader is unmounted.

**Done when.** Build useBackgroundAgentStore wiring all 11 commands plus the 7 unconsumed events, and mount a Background Agents panel (list, live progress, Pause/Resume/Cancel/Take Over) before shipping any UI trigger for creating one.

**Where.** `apps/desktop/src-tauri/src/core/agent/background_agent.rs:1-48`, `apps/desktop/src-tauri/src/sys/commands/background_agents.rs:1-358`, `apps/desktop/src/utils/registeredCommands.ts:174-184`, `apps/desktop/src/stores/chat/agentWorkflowEvents.ts:1069-1082`, `apps/desktop/src/features/agi/AgentTaskMonitor.tsx:14-23`

**From.** audit/parity-2026-08-15/gaps/domain-agentic-work.json AGENTIC-WORK-001; audit/parity-2026-08-15/gaps/domain-dead-code.json DEAD-CODE-012

**Folded in.** AGENTIC-WORK-001; DEAD-CODE-012 (background*agent*\* half)

### DESK-66 — Desktop background-agent subsystem (BackgroundAgentManager, 11 Tauri commands, 9 events) is fully built but unreachable from any UI

`CRITICAL` · desktop · effort L

**What.** AGENTIC-WORK-001 (+ DEAD-CODE-012 background*agent*\* half): a complete Rust BackgroundAgentManager supports up to 8 parallel agents with 9 native events and 11 registered Tauri commands (background_agent_cancel/cleanup/get/list/list_active/pause/push/resume/should_push/stats/take_over). The only creation path is an LLM tool call; there is no 'push to background' UI. All 11 commands appear only in an invoke-allowlist string and a dev mock — zero production invoke() call sites. Only 2 of 9 events are listened to (completed/failed, for a notification). AgentTaskMonitor.tsx wires an unrelated generic job queue. A code comment points to a backgroundAgentStore.ts that does not exist in the repo. Distinct from DESK-36 (background-task event listener writing into a store with an unmounted reader) and broader than DESK-05's directory-level unreachability.

**Done when.** Build useBackgroundAgentStore wiring all 11 commands plus the 7 unconsumed events, and mount a Background Agents panel (list, live progress, Pause/Resume/Cancel/Take Over) before shipping any UI trigger for creating one.

**Where.** `apps/desktop/src-tauri/src/core/agent/background_agent.rs:1-48`, `apps/desktop/src-tauri/src/sys/commands/background_agents.rs:1-358`, `apps/desktop/src/utils/registeredCommands.ts:174-184`, `apps/desktop/src/lib/tauri-mock.ts:1319-1369`, `apps/desktop/src/stores/chat/agentWorkflowEvents.ts:1069-1082`, `apps/desktop/src/features/agi/AgentTaskMonitor.tsx:14-23`

**From.** audit/parity-2026-08-15 AGENTIC-WORK-001; audit/parity-2026-08-15 gaps/domain-dead-code DEAD-CODE-012

**Folded in.** AGENTIC-WORK-001; DEAD-CODE-012 (background*agent*\* half)

### DESK-70 — Desktop image and video generation is unreachable from the live chat composer, and the Rust media commands never absolutize the returned relative URLs

`CRITICAL` · desktop · effort L

**What.** VOICE-MEDIA-001 (+ COMPOSER-004): CloudRuntime.generateCloudImage correctly absolutizes result URLs, but the shared composer packages/ui/unified-chat actually renders has no image/video button, mode toggle or handler at all (zero component-level matches for imageMode/videoMode/aspectRatio/onGenerateImage/onGenerateVideo). '/image' exists only as slash-command display metadata with no registered handler. ImageGenCard/VideoGenCard are imported by zero production files. A parallel Rust tool path (media_executor.rs) really can trigger billed generation via an LLM tool call, but nothing displays the result, and media.rs's commands never join base_url onto the returned relative video_url/image url before returning to JS — the same defect class as VOICE-MEDIA-002 on mobile. Named the founder's explicit top release-risk item in HANDOFF.md. Distinct from DESK-16 (hardcoded/nonexistent image model IDs).

**Done when.** Add an image/video generation entry point to the shared composer gated on runtime.supportsImageGeneration (model on mobile's mediaMode.ts), call the already-correct CloudRuntime.generateCloudImage, mount ImageGenCard/VideoGenCard in the message renderer, and fix media.rs's missing base_url join for both image and video before enabling video.

**Where.** `apps/desktop/src/runtime/CloudRuntime.ts:304-310`, `apps/desktop/src/api/cloudApi.ts:548-602`, `apps/desktop/src-tauri/src/sys/commands/media.rs:242-330,338-489`, `apps/desktop/src-tauri/src/core/agi/executors/media_executor.rs:108-137`, `packages/ui/unified-chat/src/components/ChatInputToolbar.tsx`, `packages/ui/unified-chat/src/lib/slashCommands.ts:75-81`

**From.** audit/parity-2026-08-15 VOICE-MEDIA-001; audit/parity-2026-08-15 COMPOSER-004; HANDOFF.md release-risk list

**Folded in.** VOICE-MEDIA-001; COMPOSER-004

### DESK-06 — Desktop approval requests are emitted but not renderable or resumable; two competing approval UIs, one dead

`HIGH` · desktop · effort L · **unclear**

**What.** Manual tool execution emits approval events but the matching sidecar/prompt is unmounted or keyed to a different event type; computer-use pauses without a complete resume path and may poll indefinitely. Nothing calls useExecutionSidecarStore.open() so mounting ExecutionSidecar would render null forever, and ExecutionSidecarApprovals duplicates the live McpToolConfirmationPrompt; a second dead sidecar model exists in stores/ui.ts. SOURCES DISAGREE: gap-audit-2026-08-08.md lists 'Execution-sidecar approvals' as already fixed (the approval view is imported and rendered in the mounted sidecar), which the known-flaws entry contradicts.

**Done when.** Pick one approval domain model and renderer, delete the other two, add a bounded reconnect/backoff on the resume path, and cover approve/deny/expire/duplicate-decision/resume with E2E tests.

**Where.** `apps/desktop/src/stores/ui.ts`

**From.** AuditRemediationLedger.md (CRIT-004); docs/agent-context/known-flaws.md (2026-08-05 Desktop ExecutionSidecar); docs/current/gap-audit-2026-08-08.md (Section 8, claims fixed); docs/agent-context/phase4-capability-audit.md (PP-15)

**Folded in.** Desktop ExecutionSidecar: dead subsystem with duplicate approval UI, no product decision made; Execution-sidecar approvals — previously a gap, now fixed

### DESK-07 — Desktop built-in browser cannot launch on stock macOS or Linux; computer-use hard-blocked on all Linux

`HIGH` · desktop · effort M

**What.** The launcher expects a 'chromium' executable and does not locate normal Chrome/Chromium app bundles, with no platform-specific discovery, override path, or fallback-without-hang. Separately, Linux has near-zero platform integration: zero GSettings/dconf/portal/KIO/Wayland support, and the only real X11 integration is an xdotool shell-out used solely by the computer-use safety gate, so computer-use is hard-blocked on every Linux install.

**Done when.** Platform-specific browser discovery (app bundles on macOS, PATH+flatpak on Linux) with an explicit override setting and a bounded failure that surfaces an error instead of hanging; decide and state Linux computer-use support.

**Where.** `apps/desktop/src-tauri/src/automation/computer_use/window_manager.rs`

**From.** AuditRemediationLedger.md (CRIT-009); docs/agent-context/known-flaws.md (DESKTOP-LINUX-PLATFORM-GAP-01); docs/agent-context/phase4-capability-audit.md (PP-15)

**Folded in.** DESKTOP-LINUX-PLATFORM-GAP-01: near-zero Linux/GNOME/KDE/Wayland platform integration

### DESK-09 — No OS-level single-instance guard: two desktop processes can corrupt the same encrypted DB

`HIGH` · desktop · effort S

**What.** Verified: no tauri-plugin-single-instance entry exists in apps/desktop/src-tauri/Cargo.toml. Two concurrent processes were observed writing to the same encrypted SQLCipher DB with only busy_timeout=5000 reducing — not eliminating — write races.

**Done when.** Register tauri-plugin-single-instance and focus the existing window on a second launch.

**Where.** `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/src/lib.rs`

**From.** docs/agent-context/known-flaws.md (DESKTOP-SINGLE-INSTANCE-MISSING-01)

### DESK-10 — Desktop has zero settings-sync wiring in any app mode

`HIGH` · desktop · effort L

**What.** Verified: grep for CLOUD_SAFE_SETTINGS and user_settings across apps/desktop/src returns zero matches. Desktop participates in neither push nor pull for any of the eight allowlisted sync namespaces that Mobile and Web already share, so every setting a user changes on desktop is device-local regardless of mode.

**Done when.** Adopt the shared settings-sync client for the eight allowlisted namespaces in Cloud mode, with an explicit local-only policy stated for Local/BYOK.

**Where.** `apps/desktop/src`

**From.** docs/agent-context/known-flaws.md (DESKTOP-SETTINGS-SYNC-GAP-01)

### DESK-106 — Desktop 'teams' feature slice is fully orphaned, and the known-flaws.md entry claiming otherwise is stale and actively misleading

`HIGH` · desktop · effort S

**What.** DEAD-CODE-001. known-flaws.md:533-535 (dated 2026-08-05) claims 4 team components are 'NOT orphans… kept' because experimental/TeamDashboard.tsx consumes them — but that file was deleted 2 days later (commit 4354d3d8b, an ancestor of HEAD) and does not exist anywhere in the repo. Repo-wide grep for every component name outside its own file returns zero hits; teamStore.ts/teamsApi.ts have no importers outside this dead set. A maintainer following CLAUDE.md's mandated read order is actively misled into preserving dead code.

**Done when.** Delete the 8 team files and the stale known-flaws.md entry in the same PR that applies 0058_drop_legacy_teams.sql — or, if a real surface is wanted, wire TeamAccountSettings into SettingsPanel and update the ledger.

**Where.** `apps/desktop/src/features/teams/TeamActivityLog.tsx`, `apps/desktop/src/stores/teamStore.ts`, `apps/desktop/src/api/teamsApi.ts`, `docs/agent-context/known-flaws.md:533-535`

**From.** audit/parity-2026-08-15/gaps/domain-dead-code.json DEAD-CODE-001

### DESK-11 — Desktop in-app Notification Center is unmounted; group toggles and DND schedule are inert; only 2 of 4 groups can fire

`HIGH` · desktop · effort L

**What.** Verified: the only files referencing NotificationCenter are apps/desktop/src/features/notifications/index.ts and NotificationCenter.tsx itself — zero external importers, ~2,025 unreachable lines across NotificationCenter.tsx (635), useNotifications.ts (455, zero consumers), notificationStore.ts (712, only importer is the unmounted panel) and TitleBar.tsx (223). enabled_types is consulted only in notification_create, which is called only from unmounted stores; the one live emitter (sendBackgroundAgentNotification / triggers.rs) calls tauri_plugin_notification directly and never reads enabled_types. system/mcp_server/warning/error groups and the whole Reminders feature have no producer or consumer. sound_enabled and badge_enabled are write-only, and dnd_start_time/dnd_end_time are stored but only the boolean flag is read.

Also recorded by a later audit (Desktop notification switches change nothing (PP-23, PP-32)): Two separate phase4-capability-audit ids (PP-23 and PP-32) independently confirm inert desktop notification switches; the source groups them under one symptom without disambiguating which id maps to which switch, so both must be checked when fixing the inert group toggles.

Also recorded by a later audit (Desktop notification switches change nothing (PP-23)): phase4-capability-audit.md PP-23 independently confirms, from live product testing rather than source reading, that desktop notification switches are dead controls — corroborating DESK-11's 'group toggles and DND schedule are inert'.

Also recorded by a later audit (Desktop notification switches change nothing (PP-32)): phase4-capability-audit.md PP-32 is a second live-testing confirmation of a dead desktop notification switch; HANDOFF.md §4 groups PP-23 and PP-32 under the same symptom without disambiguating which specific switch each refers to, so both ids should be carried on DESK-11.

Also recorded by a later audit (PP-23 / PP-32: desktop notification switches change nothing (HANDOFF.md §4)): Two separately-filed IDs (the source does not disambiguate which maps to which switch) confirming the register's 'group toggles and DND schedule are inert' clause from an independent capability audit. Both are classed as dead controls.

**Done when.** Mount the Notification Center or delete the subsystem; route the one live emitter through notification_create so the master switch, group toggles, DND window, sound and badge settings actually govern delivery.

**Where.** `apps/desktop/src/features/notifications/index.ts`, `apps/desktop/src-tauri/src/sys/commands/notification_center.rs:121,123,459-460`, `apps/desktop/src-tauri/src/core/agent/triggers.rs:647-666`

**From.** docs/agent-context/known-flaws.md (DESKTOP-NOTIFICATIONS-SETTINGS-IGNORED-AND-CENTER-UNREACHABLE-01); docs/agent-context/phase4-capability-audit.md (PP-23, PP-32); audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** Desktop notification group toggles (enabled_types) are inert; Desktop: only 2 of 4 notification groups can ever fire; Reminders has no producer/consumer; Desktop notification 'Sound Effects' and 'App icon badge' settings are write-only; Desktop DND schedule is write-only — only the boolean flag is consulted; Desktop notifications: ~2,025 lines of unmounted notification-center code

### DESK-12 — Global Push-to-Talk (Fn key) has no event subscriber; wake-word detection discards its event channel

`HIGH` · desktop · effort M

**What.** Settings UI claims system-wide Fn-key dictation; voice*global.rs emits ptt-start/ptt-stop but nothing subscribes, so recording never starts, and the blocking rdev::listen thread does not terminate on stop. Verified separately: apps/desktop/src-tauri/src/sys/commands/voice.rs:896 reads wake.start().await.map(|*| ()) — the mpsc::Receiver<WakeWordEvent> is discarded immediately, no emit("wake…") exists anywhere in the Rust tree, and no frontend listener exists, so the 'Wake Word Detection' toggle shows a green 'Listening' state and the wake phrase does nothing.

Also recorded by a later audit (Desktop Wake Word Detection turns on and does nothing — event channel discarded (VOICE-MEDIA-007)): Exact line: apps/desktop/src-tauri/src/sys/commands/voice.rs:896 discards the detector's mpsc::Receiver<WakeWordEvent> via .map(|\_| ()), and no emit() or frontend listener exists anywhere. Adds the user-visible severity detail: clicking Enable genuinely starts the native detector and the button turns green ('Listening'), so the control actively lies. Critically, unlike the sibling System-wide Dictation control, this one is live and reachable in every shipped build. Fix: wire the discarded receiver to an emit() plus a frontend listener, or gate the control behind a capability probe until wiring lands.

**Done when.** Subscribe useVoiceHotkey to ptt-start/ptt-stop and make the rdev thread joinable; hold the wake-word receiver and forward events to the frontend, or remove both toggles.

**Where.** `apps/desktop/src/hooks/useVoiceHotkey.ts`, `apps/desktop/src-tauri/src/sys/commands/voice_global.rs`, `apps/desktop/src-tauri/src/sys/commands/voice.rs:863,896`

**From.** docs/agent-context/known-flaws.md (DESKTOP-SYSTEM-DICTATION-UNWIRED-01); docs/agent-context/phase4-capability-audit.md (PP-20); audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** Desktop 'Wake Word Detection' toggle is a permanent silent no-op

### DESK-13 — Desktop voice output is unmounted: the conversational loop never runs, so barge-in and persona settings affect nothing

`HIGH` · desktop · effort L · **unclear**

**What.** VoiceMode.tsx is a genuinely complete listen-transcribe-LLM-speak loop backed by useVoiceModeStore but had zero live <VoiceMode> render calls; verification found it referenced only from VoiceSettings.tsx and its test, so it may now be reachable from settings but not as a chat surface. The conversational loop in stores/settings/voice.ts (open/startListening/stopListeningAndProcess/voiceTtsSpeakWithBargeIn) has zero mounted callers, so the 'Barge-in Detection' toggle governs a loop that never runs, and getVoicePersonaParams is read only by its own preview button — desktop never speaks an assistant reply. Needs a build-flag and trust-boundary decision.

Also recorded by a later audit (Desktop's fully-built voice-conversation UI is never mounted, and would fail immediately if it were (VOICE-MEDIA-005)): Resolves DESK-13's 'unclear' status with concrete findings: VoiceMode.tsx has zero live render calls anywhere in the app; even if mounted it hardcodes transcription to local_whisper, an optional Cargo feature (Cargo.toml:301,318) excluded from every shipped build's default feature set and never enabled by any release workflow, so every shipped build would error 'Local Whisper support not compiled.' useTTS() (useTTS.ts:59) has zero callers outside its own definition, so the assistant never speaks a reply through any path on Desktop — despite SystemTts working today with no setup. Independently re-confirmed as known-flaws.md DESKTOP-VOICE-CONVERSATIONS-UNWIRED-01. Proposes an immediately shippable increment: wire the working SystemTts 'Read aloud' into MessageBubble/ChatInterface (no trust-boundary crossing), and treat mounting VoiceMode behind a real transcription backend as a separate, larger escalation.

**Done when.** Decide whether desktop ships spoken replies; if yes, mount the conversational loop behind a trust-boundary-aware flag so barge-in and persona settings govern real output; if no, remove the three settings.

**Where.** `apps/desktop/src/features/voice/VoiceMode.tsx`, `apps/desktop/src/stores/settings/voice.ts:219,272,347,456`, `apps/desktop/src/features/settings/voicePersonaParams.ts:38-40`

**From.** docs/agent-context/known-flaws.md (DESKTOP-VOICE-CONVERSATIONS-UNWIRED-01); docs/agent-context/phase4-capability-audit.md (PP-20); audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** Desktop 'Barge-in Detection' toggle only affects an unmounted TTS conversational loop; Desktop 'Voice Persona' selection applies only to its own preview button

### DESK-33 — Desktop artifacts: token streaming unwired, cloud publish a permanent 'coming soon', published version always 1

`HIGH` · desktop · effort L · **in-progress**

**What.** The entire Artifacts/Canvas feature was found completely unreachable (no Tauri event listener, no LLM trigger); persistence and reopen were fixed 2026-07-15 but token streaming remains open. Desktop publish is gated with an explicit comment that the adapter only handles the local path and cloud publish is gated, so there is no Sites/publish surface; published version always reports 1 with no real version navigation, restore, comments, remix or provenance. Copy has not been downgraded to roadmap status.

Also recorded by a later audit (Desktop cannot publish an artifact to a public shareable link (ARTIFACTS-002)): Names the mechanism behind the 'permanent coming soon': desktop's handlePublish always calls makeDesktopPublishCallback, which hardcodes privacyMode:'local' and a Tauri file:// writer; the module's own doc comment states desktop injects no CloudPublisher. Web is the only surface with a working CloudPublisher POSTing to /api/artifacts/publish. Refs: apps/desktop/src/features/artifacts/publishAdapter.ts:1-112, ArtifactPanel.tsx:352-395.

Also recorded by a later audit (Desktop cannot publish an artifact to a public shareable link (ARTIFACTS-002)): Mechanism for DESK-33's 'cloud publish is a permanent coming soon': Desktop's handlePublish always calls makeDesktopPublishCallback, which hardcodes privacyMode:'local' and a Tauri file:// writer (publishAdapter.ts:1-112, ArtifactPanel.tsx:352-395); the module's own doc comment states Desktop injects no CloudPublisher. Web is the only surface with a working CloudPublisher that POSTs /api/artifacts/publish and returns a real shareUrl (publishArtifactClient.ts:92-133). Fix: give Desktop a CloudPublisher adapter calling the same managed-cloud endpoint, branching handlePublish on cloud vs local result kind.

**Done when.** Wire artifact token streaming to the Tauri event listener, and either ship cloud publish with real versioning or downgrade the publish and versioning copy to roadmap everywhere it appears.

**Where.** `apps/desktop/src/runtime/TauriRuntime.ts`, `apps/desktop/src-tauri/src/core/artifacts/store.rs`, `apps/desktop/src/features/artifacts/publishAdapter.ts:14-17`

**From.** docs/agent-context/known-flaws.md (DESKTOP-ARTIFACTS-ENTIRELY-UNWIRED-01); AuditRemediationLedger.md (PP-11, DOC-018, DOC-020); ExecutionPlan.md (Sites surface missing); audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** PP-11: Desktop publish is a permanent 'coming soon'; published version always reports 1; DOC-018: Desktop artifact cloud publish not downgraded to roadmap status; DOC-020: Artifact versioning (always reports version 1) not downgraded consistently; No Sites surface — artifacts cannot be published as live, shareable websites

### DESK-40 — Desktop attachment docx/xlsx/pptx parsing unimplemented, and the knowledge-base picker offers PDFs it can never read

`HIGH` · desktop · effort L

**What.** The severed attachment send-wire was fixed, but docx/xlsx/pptx parsing remains open. Independently: the local knowledge-base picker advertises .pdf while processKbFile calls invoke('file_read'), whose Rust implementation is fs::read_to_string — a PDF is not valid UTF-8, so every PDF offered by that picker is a guaranteed 'Failed to read file' dead end.

**Done when.** Add Office and PDF extraction on the Rust side (or a byte-returning read command) and stop advertising formats the reader cannot decode.

**Where.** `apps/desktop/src/features/chat/ProjectSettingsDialog.tsx:352,381`, `apps/desktop/src-tauri/src/sys/commands/file_ops.rs:476`

**From.** docs/agent-context/known-flaws.md (DESKTOP-ATTACHMENT-SEND-WIRE-SEVERED-01); docs/agent-context/phase4-capability-audit.md (PP-09)

**Folded in.** Desktop local knowledge-base picker advertises .pdf but fs::read_to_string always fails on PDF bytes

### DESK-68 — Desktop 'teams' feature slice is fully orphaned and the known-flaws.md entry that claims otherwise is stale

`HIGH` · desktop · effort S

**What.** DEAD-CODE-001: known-flaws.md:533-535 (dated 2026-08-05) claims 4 team components are 'NOT orphans... kept' because experimental/TeamDashboard.tsx consumes them — but that file was deleted 2 days later (commit 4354d3d8b, an ancestor of HEAD). Repo-wide grep for every component name outside its own file returns zero hits; teamStore.ts/teamsApi.ts have no importers outside this dead set. A maintainer following CLAUDE.md's mandated read order is actively misled into preserving dead code. Narrower and more specific than DESK-05 because of the false-ledger element.

**Done when.** Delete the 8 team files and the stale known-flaws.md entry in the same PR that applies 0058_drop_legacy_teams.sql — or, if a real surface is wanted, wire TeamAccountSettings into SettingsPanel and correct the ledger.

**Where.** `apps/desktop/src/features/teams/TeamActivityLog.tsx`, `apps/desktop/src/stores/teamStore.ts`, `apps/desktop/src/api/teamsApi.ts`, `docs/agent-context/known-flaws.md:533-535`

**From.** audit/parity-2026-08-15 gaps/domain-dead-code DEAD-CODE-001

### DESK-69 — Desktop Settings 'Connections' and 'Connectors' are a naming collision, and 'Connectors' stacks five unrelated subsystems in one scroll

`HIGH` · desktop · effort M

**What.** EXTENSIBILITY-002 / SHELL-NAV-IA-002 / prior GAP-083 (verified NOT_DONE): 'Connections' renders only mobile phone-pairing/remote-control, nothing MCP-related, while 'Connectors' — three list positions away — stacks ConnectorGallery, ConnectorHealthDashboard, MCPServerSettings (servers AGI exposes), MCPWorkspace (servers this app connects TO) and CloudStoragePanel (a separate OAuth2 system) behind lazy Suspense in one vertical scroll. In-code comments confirm three of the five were previously unreachable from any nav before being mounted here. settings-22-gap adds that Computer Use capability settings and local-machine pairing are also separate, differently-named destinations.

**Done when.** Rename 'Connections' to something unambiguous (e.g. 'Mobile pairing' / 'Remote control') and split 'Connectors' into a segmented sub-view (Gallery / Health / MCP servers / Cloud storage); update QRPairingCard copy to match the new label.

**Where.** `apps/desktop/src/features/settings/tabs/Connections/index.tsx:1-38`, `apps/desktop/src/features/settings/tabs/Connectors/index.tsx:1-79`, `packages/ui/ui/src/settings-nav.ts:149-161`

**From.** audit/parity-2026-08-15 EXTENSIBILITY-002; audit/parity-2026-08-15 SHELL-NAV-IA-002; audit/ui-gaps GAP-083; audit/competitive-gap-2026-08-15 settings-22-gap; audit/parity-2026-08-15/gaps/domain-extensibility.json EXTENSIBILITY-002; audit/parity-2026-08-15/gaps/domain-shell-nav-ia.json SHELL-NAV-IA-002; audit/parity-2026-08-15 — SHELL-NAV-IA-002 / EXTENSIBILITY-002 (GAP-083)

**Folded in.** EXTENSIBILITY-002; SHELL-NAV-IA-002; GAP-083; Desktop Settings 'Connections' vs 'Connectors' is a naming collision, and 'Connectors' stacks five unrelated subsystems in one scroll; Desktop Settings 'Connections' and 'Connectors' are a naming collision, and 'Connectors' stacks five unrelated subsystems in one scroll

### DESK-71 — Desktop message action row is missing feedback, edit, share, read-aloud, branch and report — most already exist as dead code

`HIGH` · desktop · effort M

**What.** RENDERING-004: ActionBar's thumbs-up/down block only renders when onFeedback is passed; MessageList.tsx (its only caller) never passes it, so feedback can never render in production. A fully implemented editMessage() exists in chatStore.ts with zero callers outside its own definition. Share, Read Aloud, Branch/Fork and Report have no prop, callback or component anywhere in the shared ActionBar/MessageBubble. Overlaps but is not the same defect as DESK-34 (Retry is a silent no-op, no Regenerate) or UI-19 (branching not uniform).

**Done when.** Wire onFeedback from DesktopShellV3 through to ActionBar's existing feedback-persistence backend; add an Edit affordance calling the already-implemented chatStore.editMessage; port web's onReadAloud/onBranch/report patterns into the shared package.

**Where.** `packages/ui/unified-chat/src/components/ActionBar.tsx:54-57,88-90`, `packages/ui/unified-chat/src/components/MessageList.tsx:210-216`, `apps/desktop/src/stores/chat/chatStore.ts:271,1360`

**From.** audit/parity-2026-08-15 RENDERING-004; audit/parity-2026-08-15 — RENDERING-004

**Folded in.** Desktop message action row is missing feedback, edit, share, read-aloud, branch and report — most exist as dead code

### DESK-72 — Desktop shows no stdout/stderr console output for code-execution turns that only print text

`HIGH` · desktop · effort M

**What.** RENDERING-006: web renders code-execution stdout/stderr, inline plot images and exit code via CodeExecutionBlock.tsx. Desktop's shared MessageGeneratedFiles.tsx tracks running/pending state for generated FILES only and contains no stdout/stderr rendering; CodeExecutionBlock is never imported into the desktop message renderer at all, so a run that prints text and produces no file appears to do nothing.

**Done when.** Port CodeExecutionBlock.tsx into packages/ui/unified-chat and wire it into the desktop MessageBubble, keyed off the same isExecuting/result shape.

**Where.** `packages/ui/unified-chat/src/components/MessageGeneratedFiles.tsx:126-138`, `apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:1-131`

**From.** audit/parity-2026-08-15 RENDERING-006; audit/parity-2026-08-15 — RENDERING-006

**Folded in.** Desktop shows no stdout/stderr output for code-execution turns that only print text

### DESK-73 — Desktop Tauri composer has no reasoning-effort / extended-thinking control despite the runtime carrying the parameters end to end

`HIGH` · desktop · effort M

**What.** MODELS-001: TauriRuntime.ts forwards options?.effort and options?.thinkingEnabled on every send (with a comment 'Forward the composer controls that were previously dropped here') and chat.ts carries a typed reasoningEffort field end to end — but nothing in any .tsx file ever sets a non-undefined value. The model badge routes to Settings > Models & Keys instead of an inline picker, and that tab has zero mentions of effort/reasoning/thinking. Every Desktop message therefore uses each model's server-side default effort. Distinct from BILL-53/AI-25 (server-side entitlement clamping) and from DESK-35's list of dormant controls.

**Done when.** Add an effort control to the Tauri composer (reuse ComposerFooter.tsx's effortChipsFor/EFFORT_LABEL logic), wire it into the existing effort/thinkingEnabled fields, and replace the settings-dialog-only routing with an inline picker.

**Where.** `apps/desktop/src/App.tsx:1986-1988`, `apps/desktop/src/runtime/TauriRuntime.ts:583-592,675,1116`, `apps/desktop/src/types/chat.ts:150-151`, `apps/desktop/src/features/settings/tabs/ModelsKeys/index.tsx`

**From.** audit/parity-2026-08-15 MODELS-001; audit/parity-2026-08-15/gaps/domain-models.json MODELS-001

**Folded in.** Desktop Tauri composer has no reasoning-effort/extended-thinking control despite the runtime carrying the parameters end to end

### DESK-96 — Desktop AGI Work views lack an onboarding checklist, customize hub and standalone task composer, and AGI Work subpanels plus AGI Code mounting/gating are unverified

`HIGH` · desktop · effort L

**What.** source-of-truth.md P0 Gap List item 1 (GAP-1): Desktop AGI Work subpanels need demo-path verification and AGI Code must be mounted into the V3 shell or clearly gated before demo. parity-implementation-matrix.md's Desktop AGI Work row adds that AgiWorkProjects, AgiWorkArtifacts and AgiWorkScheduled are rendered from DesktopShellV3.tsx but the onboarding checklist, customize hub and a standalone task composer remain absent.

**Done when.** Verify each AGI Work subpanel against a real demo path, then either mount AGI Code into the V3 shell or gate it honestly; build or explicitly decline the onboarding checklist, customize hub and standalone task composer rather than leaving them undecided.

**Where.** `apps/desktop/src/features/v3/DesktopShellV3.tsx`

**From.** docs/current/source-of-truth.md P0 GAP-1; docs/current/parity-implementation-matrix.md Desktop Surface — AGI Work views

### DESK-97 — Desktop system-wide dictation capability remains unbuilt after the deceptive-availability UI was fixed

`HIGH` · desktop · effort XL · **in-progress**

**What.** frontend-experience-contract.md §14 P0 item 1: the availability-claim half was completed 2026-07-17 — the settings control is now gated on a systemDictationAvailable probe and shows 'Not available in this build' when false — but building the feature itself is still open, tracked as known-flaw DESKTOP-SYSTEM-DICTATION-UNWIRED-01. VOICE-MEDIA-012 independently confirms system_dictation_available() is hardcoded false. Distinct from DESK-12 (push-to-talk / wake word have no event subscriber).

**Done when.** Build the system-wide dictation capability behind the existing probe, or record the decision not to and remove the control entirely rather than leaving a permanently-false availability gate.

**From.** docs/current/frontend-experience-contract.md §14 P0 item 1; known-flaws DESKTOP-SYSTEM-DICTATION-UNWIRED-01; audit/parity-2026-08-15 VOICE-MEDIA-012

### DESK-99 — No remote developer-session control protocol exists end to end: desktop companion UI unmounted, CLI/VS Code host relay missing, mobile ships a static shell, and device grants are not revocable

`HIGH` · desktop · effort XL

**What.** frontend-experience-contract.md §13 'Remote control' row: Web=Absent, Desktop='Host/companion UI not mounted', Mobile='Static/feature-off', CLI and VS Code='Host transport missing', Chrome='Native bridge is not Code remote control'; §14 P0 items 2-3 track defining one remote protocol from a CLI/Desktop host to a Mobile/Web projection and replacing Mobile's static Code shell. MS-3 (founder decision: 'Build the contract, not a placeholder screen') and MS-18 (promote session keys to revocable device grants) are the mobile-side halves, and CAP-049 (Desktop dispatch/scheduled-routines product) is explicitly blocked on the same contract. Broader than MOB-12 (dispatch is fire-and-forget) which concerns the existing pairing transport, not the missing developer-session protocol.

**Done when.** Define one remote developer-session control protocol (host = CLI/Desktop, projection = Mobile/Web) including revocable persistent device grants, then replace Mobile's static Code shell and mount the Desktop companion host UI against it.

**From.** docs/current/frontend-experience-contract.md §13 Remote control row, §14 P0 items 2-3; docs/current/parity-implementation-matrix.md MS-3; docs/current/parity-implementation-matrix.md MS-18; docs/current/parity-implementation-matrix.md CAP-049

**Folded in.** MS-3; MS-18; frontend-contract P0 items 2-3

### TEST-15 — apps/desktop DesktopShellV3.test.tsx is 29/29 failing on a stale store mock, making every ledger row that cites it unverifiable

`HIGH` · testing · effort S

**What.** red-test-suites.md §2. TypeError: state.getSelectedModel is not a function — a stale mock of useChatModelStore omits getSelectedModel, which commit 1e858a7f1 added, and the mismatch has persisted unfixed through HEAD. The 29 tests cover desktop-shell tier gating, folder scoping and tool confirmation, and the suite is cited as completion evidence by GAP-064 in audit/ui-gaps.csv, which was downgraded to PARTIALLY_DONE specifically because of this failure. The real production store implements the method correctly; only the mock is broken. Discovered incidentally alongside TEST-12, which is why a per-package 'is CI actually green' sweep is warranted.

**Done when.** Add getSelectedModel to the useChatModelStore mock and re-run the suite; treat any ledger row citing this suite as unverifiable until it goes green. Run a dedicated per-package CI-green sweep since two red suites were found by accident.

**Where.** `apps/desktop/src/features/v3/__tests__/DesktopShellV3.test.tsx:154`, `apps/desktop/src/features/v3/DesktopShellV3.tsx:259`

**From.** audit/parity-2026-08-15/gaps/red-test-suites.md §2; audit/ui-gaps.csv GAP-064

### CONN-18 — Desktop Cloud skill 'download' produces a raw file save, not a working install

`MEDIUM` · integrations · effort M

**What.** EXTENSIBILITY-005. DesktopCloudSettingsModal.tsx:907-950's Skills section builds a downloadHref per Cloud skill, rendered as a plain <a href download>. No code path anywhere in apps/desktop takes a downloaded skill file and writes it into ~/.agiworkforce/skills/ (the directory SkillManager actually scans) or calls skill_reload(). The user gets a file in Downloads with no way to make it usable in chat.

**Done when.** Add a native command (skill_import_from_download) that accepts the downloaded bytes/path, validates the SKILL.md shape, writes it into the Managed skills directory and calls skill_reload(), wired behind the existing downloadHref button.

**Where.** `apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:907-950`, `packages/ui/ui/src/settings-modal/types.ts:72`, `packages/ui/ui/src/settings-modal/SettingsModal.tsx:422-438`

**From.** audit/parity-2026-08-15/gaps/domain-extensibility.json EXTENSIBILITY-005

### CONN-30 — Desktop SkillMarketplace vs the shared DirectoryBrowse skills tab is an unverified third skill-browsing UI

`MEDIUM` · integrations · effort S · **unclear**

**What.** duplication/extension-surfaces.md §5. apps/desktop/src/features/skill-marketplace/SkillMarketplace.tsx is a Desktop-only, independently-built skill-browsing UI separate from the shared SkillsPanel/DirectoryBrowse Desktop also uses via DesktopCloudSettingsModal.tsx. Plausibly deliberate (Local vs Managed Cloud trust boundary — SkillMarketplace reads local filesystem skills via Tauri commands while DirectoryBrowse reads the hosted list) but no line-by-line comparison against DirectoryBrowse's skills tab was performed.

**Done when.** Diff SkillMarketplace.tsx's card/search/filter code against DirectoryBrowse's skills tab to settle whether this is a deliberate trust-boundary split or drift; document it like DesktopLibrary.tsx does if deliberate.

**Where.** `apps/desktop/src/features/skill-marketplace/SkillMarketplace.tsx`, `apps/desktop/src/features/settings/tabs/Skills/index.tsx`

**From.** audit/competitive-gap-2026-08-15/duplication/extension-surfaces.md §5

### DESK-100 — Computer-to-computer pairing tab is not built — no authorized computer peer, target selection, persistent device identity or revocation lifecycle exists

`MEDIUM` · desktop · effort L

**What.** wire-or-cut.md 2026-07-30 Desktop Companion Pairing Target Boundary: phone QR and manual-code pairing were wired, but no independently authorized computer peer, target selection, routing, persistent device identity or revocation lifecycle exists, so a Computer tab would advertise a nonexistent transport and it remains deliberately absent. Distinct from DESK-51 (mobile-companion pairing single-session by design, wontfix).

**Done when.** Do not ship a Computer tab until the transport exists; sequence behind the remote developer-session control protocol (DESK-99), which would supply the device identity and revocation lifecycle.

**Blocked by.** DESK-99 (no remote developer-session control protocol / device identity lifecycle)

**From.** docs/adr/wire-or-cut.md 2026-07-30 Desktop Companion Pairing Target Boundary

### DESK-101 — Editing an existing Word document cannot preserve source content (docx_rs is write-only), so the editor is deliberately unregistered

`MEDIUM` · desktop · effort L

**What.** wire-or-cut.md 2026-08-06 Wave 2/3 final items: WordEditor::edit_document CANNOT parse an existing .docx and its own tracing::warn! states source content 'is not preserved' — it builds a new document from the edits alone. Exposing it as 'edit your document' would silently destroy the user's file, so it is deliberately not registered as a Tauri command. The sibling ExcelEditor was wired (document_edit_excel, RiskLevel::High approval). Distinct from DESK-40 (attachment docx/xlsx/pptx parsing unimplemented on the read path).

**Done when.** Delete the module or replace docx_rs with a library that can read an existing .docx before revisiting; do not register the command in its current form.

**From.** docs/adr/wire-or-cut.md 2026-08-06 Wave 2/3 final items

### DESK-103 — Desktop header falsely claims 'AGI Desktop · Released · v1.2.0'

`MEDIUM` · desktop · effort S

**What.** HANDOFF.md §4, phase4-capability-audit PP-28: the desktop header asserts a released state and a specific version number that does not reflect actual shipped status. Distinct from DESK-03/INFRA-15, which concern the marketing site marking Desktop as Released while the download endpoint 404s — PP-28 is an in-product false availability claim.

**Done when.** Derive the header's release/version string from the real build metadata, or remove the claim, consistent with the honest manual-installer behaviour required by the desktop-shell-release risk-map entry.

**From.** docs/agent-context/HANDOFF.md §4 PP-28; docs/agent-context/phase4-capability-audit.md PP-28

### DESK-104 — Desktop bypasses the shared design-token package with 252 hardcoded hex colour literals and no guard

`MEDIUM` · desktop · effort M

**What.** CROSS-SURFACE-012: @agiworkforce/design-tokens is a real 437-line token file genuinely consumed by desktop (55 files), web (114 files) and the Chrome extension, yet a repo-wide grep found 252 hardcoded #rrggbb literals in apps/desktop/src (and 95 in apps/web/features+shared), matching an independently-run count of 294/119. Unlike the Chrome extension, neither desktop nor web has a hex-literal guard wired into CI. Broader and more concrete than UI-20 (z-index/shared-scale token adherence unverified).

**Done when.** Add an eslint rule flagging hex-literal colour strings scoped to apps/desktop/src (and apps/web/features+shared), allowlisted at today's count and shrink-only from there.

**Where.** `packages/ui/design-tokens/src/index.ts`, `apps/desktop/src`

**From.** audit/parity-2026-08-15 CROSS-SURFACE-012

### DESK-108 — Two independent CloudSyncClient structs exist in desktop Rust; the dead one targets a route that does not exist

`MEDIUM` · desktop · effort S

**What.** BACKEND-RUNTIME-003. integrations::sync::CloudSyncClient (cloud.rs:22) defaults api_endpoint to https://api.agiworkforce.com/api/sync, which does not exist in apps/web/app/api. Its owner SyncManager is never called from any #[tauri::command] or app-init path. The live path is a different CloudSyncClient in data/cloud_sync.rs:2087 hitting the real /api/chat/sync route. Independently corroborated by known-flaws entry BYOK-RUST-EGRESS-01.

**Done when.** Delete apps/desktop/src-tauri/src/integrations/sync/{cloud.rs,manager.rs} and the dead SyncManager/CloudSyncConfig types, or rename and point at a route that exists if a second sync transport is genuinely planned.

**Where.** `apps/desktop/src-tauri/src/integrations/sync/cloud.rs:22`, `apps/desktop/src-tauri/src/integrations/sync/manager.rs`, `apps/desktop/src-tauri/src/data/cloud_sync.rs:2087`

**From.** audit/parity-2026-08-15/gaps/domain-backend-runtime.json BACKEND-RUNTIME-003; audit/parity-2026-08-15 BACKEND-RUNTIME-003

**Folded in.** Two independent CloudSyncClient structs exist in desktop Rust; one is dead code pointing at a route that does not exist

### DESK-112 — Desktop settingsStore ships ~14 persisted setters with zero call sites: model routing, window/session, and agent checkpointing

`MEDIUM` · desktop · effort M

**What.** SETTINGS-002/003/004. setDefaultProvider, setTemperature, setMaxTokens, setTaskRouting, setFavoriteModels (settingsStore.ts:921,942,952,975,991) have no external callers. setSendShortcut is read only at hydration/persist and never called; setStartupPosition, setDockOnStartup, setAutoSaveMemories, setChatStorageMode, setFeature have zero external callers (repo-wide grep excluding the defining file and tests). setEnableCheckpointing, setCheckpointInterval, setAutoResumeOnRestart (lines 698,708,719) model agent checkpointing/auto-resume fully with no UI reading or calling them. Distinct from DESK-35, which covers controls that exist but drive dormant subsystems — these have no control at all.

**Done when.** Per family: wire into real settings UI (checkpointing/auto-resume belong in the Agents tab that already handles timeout and auto-approve; send-shortcut is the audit's own seed example), or delete the dead setters.

**Where.** `apps/desktop/src/stores/settingsStore.ts:653,698,708,719,921,942,952,975,991,1192,1202,1252,1301,1378`

**From.** audit/parity-2026-08-15/gaps/domain-settings.json SETTINGS-002, SETTINGS-003, SETTINGS-004

**Folded in.** SETTINGS-002; SETTINGS-003; SETTINGS-004

### DESK-119 — wiring-allowlist.json's ~65 self-tracked registeredWithoutReachableCaller commands still need individual WIRE/DELETE triage

`MEDIUM` · desktop · effort L

**What.** DEAD-CODE-023. The gate mechanism itself is sound (fails CI on regrowth, every entry load-bearing) and was re-verified as such. But the ~58-69 registeredWithoutReachableCaller entries — the undo*\*/form_undo*_ subsystem, task\__/scheduler*get*_ subsystem, a generic api\__ HTTP/OAuth client, project-memory, architectural-decision, coordination/approval, and a Lovable migration importer — each still need an individual decision. The ledger itself names undo*\*/form_undo*_ and task\__/scheduler*get*\* (30 commands, generically useful with no UI at all) as the strongest WIRE candidates and the Lovable migration importer as the strongest DELETE candidate.

**Done when.** WIRE the undo/redo (15 commands) and task/scheduler (13 commands) subsystems first as the highest-value, lowest-risk picks; DELETE the Lovable migration importer (3 commands); document the rest.

**Where.** `apps/desktop/wiring-allowlist.json`

**From.** audit/parity-2026-08-15/gaps/domain-dead-code.json DEAD-CODE-023; audit/parity-2026-08-15 gaps/domain-dead-code DEAD-CODE-023

**Folded in.** wiring-allowlist.json's ~58-69 self-tracked registeredWithoutReachableCaller Tauri commands still need individual WIRE/DELETE triage

### DESK-120 — Desktop Local-mode scheduled-jobs list is rendered by two independent hand-coded renderers reading the same store

`MEDIUM` · desktop · effort S

**What.** duplication/tasks-schedules.md Finding 1. AgiWorkScheduled.tsx:59-63 and ScheduledTasksPanel.tsx:44-47 both call useSchedulerStore((s) => s.tasks) but render independent row markup (custom iOS-toggle rows vs ScheduledTaskCard). Both call the same CreateTaskModal to create a task, confirming only the list-render path forked, not the write path; ScheduledTasksPanel is the more complete component (it supports edit).

**Done when.** Route the top-level 'Scheduled' nav item to render ScheduledTasksPanel/ScheduledTaskCard directly and delete the second renderer.

**Where.** `apps/desktop/src/features/v3/AgiWorkScheduled.tsx:59-63`, `apps/desktop/src/features/scheduler/ScheduledTasksPanel.tsx:44-47,179`

**From.** audit/competitive-gap-2026-08-15/duplication/tasks-schedules.md Finding 1; audit/competitive-gap-2026-08-15 duplication/tasks-schedules.md Finding 1

**Folded in.** Desktop Local-mode scheduled-jobs list is rendered by two independent hand-coded renderers off the same store

### DESK-123 — Project gallery duplicated: desktop independently rebuilt AgiWorkProjects instead of consuming the shared ProjectGallery

`MEDIUM` · desktop · effort L

**What.** duplication/components.md §5. ProjectGallery.tsx (452 lines) is imported only by web's /chat/projects route; AgiWorkProjects.tsx (462 lines) reads a completely separate store (projectStore.ts) with no relation to whatever backs ProjectGallery, and is mounted twice in DesktopShellV3.tsx. Unlike DesktopLibrary.tsx, no doc comment on AgiWorkProjects.tsx explains why it is not the shared component with a desktop transport.

**Done when.** Document the divergence the way DesktopLibrary.tsx does if the constraint (privacyMode gating, local storage) is real, or migrate desktop onto the shared ProjectGallery with a desktop transport.

**Where.** `packages/ui/unified-chat/src/components/ProjectGallery.tsx`, `apps/desktop/src/features/v3/AgiWorkProjects.tsx`

**From.** audit/competitive-gap-2026-08-15/duplication/components.md §5

### DESK-124 — Two ArtifactPanel implementations and two same-named artifactStore modules that do not share state

`MEDIUM` · desktop · effort M · **unclear**

**What.** duplication/components.md §7. apps/desktop/src/stores/artifactStore.ts and packages/ui/unified-chat/src/stores/artifactStore.ts are separate Zustand stores sharing one name and no state. Desktop's panel imports Tauri-only @tauri-apps/plugin-shell and is gated privacyMode==='local' (suggestive of an intentional local-vs-managed-cloud split per a 'DES-C05' comment), but unlike DesktopLibrary.tsx neither file documents the split, and it was not runtime-verified whether both panels can mount simultaneously for the same artifact on a real desktop build. If the trust-boundary reading is wrong this is a redundant collapse, not a deliberate split.

**Done when.** Runtime-verify on a real desktop build whether opening a managed-cloud artifact ever shows both panels or conflicting state; document the split like DesktopLibrary.tsx if confirmed intentional, otherwise collapse it.

**Where.** `apps/desktop/src/features/artifacts/ArtifactPanel.tsx`, `packages/ui/unified-chat/src/components/ArtifactPanel.tsx`, `apps/desktop/src/stores/artifactStore.ts`, `packages/ui/unified-chat/src/stores/artifactStore.ts`

**From.** audit/competitive-gap-2026-08-15/duplication/components.md §7

### DESK-18 — Desktop timeout constants remain duplicated across layers; nested deadlines can outlive their parents

`MEDIUM` · desktop · effort M · **in-progress**

**What.** Verified partial: apps/desktop/src/constants/timeouts.ts now has 7 importers (it previously had zero), but six 30-second literals remain in apps/desktop/src/api/\*.ts, and connect / first-byte / idle-stream / total / tool-step / shutdown timeouts are still collapsed into one ambiguous number. Six independent 120-second deadlines exist across desktop and web with nothing preventing an inner timeout from outliving its parent, and 10-second timeouts are duplicated while shared exports go unused. No magic-number guard exists for timeout/retry/upload/pagination/debounce/concurrency literals.

**Done when.** Name each deadline class separately in the shared constants module, point the remaining api/\*.ts literals at it, add an assertion that a child deadline cannot exceed its parent, and add the magic-number guard.

**Where.** `apps/desktop/src/constants/timeouts.ts`, `apps/desktop/src/api/`

**From.** AuditRemediationLedger.md (HARD-007, HARD-008, HARD-010, HARD-021); ExecutionPlan.md (item #57)

**Folded in.** HARD-008: 120-second API/IPC timeouts duplicated across 6 independent deadlines; HARD-010: 10-second timeouts duplicated and shadow unused exports; HARD-021: No magic-number guard for timeout/retry/upload/pagination/debounce literals; Desktop timeout constants file exists with zero importers

### DESK-19 — Desktop keyboard shortcuts: three disconnected default sets and no reconciliation between renderer and native stores

`MEDIUM` · desktop · effort L · **unclear**

**What.** constants/shortcuts.ts (25 ids), shortcuts.rs (7 different ids, whose failures were swallowed into a success toast) and App.tsx were three independent sets, and nothing read DEFAULT_SHORTCUTS[].action. Two genuine key-combo collisions were fixed and regression-tested, and ExecutionPlan #53 records a fix (a9e0aca19), but the known-flaws row keeps the disconnection between KeybindingsSettings.tsx / shortcutStore.ts and actual runtime dispatch open pending a decision. Downstream consequences still recorded: no unbind action, one binding per action, no Unassigned state, no ⌘1–⌘9 chat-switch or panel-toggle bindings, undo/redo absent despite a live undo API, no composer-scoped shortcuts, and global hotkeys scattered across General and Voice instead of the shortcuts list.

**Done when.** One shortcut command registry that generates the settings UI, command palette, help text and native registration, with collision, migration and reset tests.

**Where.** `apps/desktop/src/constants/shortcuts.ts`, `apps/desktop/src/features/settings/KeybindingsSettings.tsx`, `apps/desktop/src-tauri/src/sys/commands/shortcuts.rs:45-117,541-543`, `apps/desktop/src/api/undo.ts:93-158`

**From.** AuditRemediationLedger.md (HARD-015); docs/agent-context/known-flaws.md (DESKTOP-SHORTCUTS-DEFAULTS-DUPLICATE-AND-DISCONNECTED-01); ExecutionPlan.md (item #53); audit/ui-gaps.md (GAP-089, GAP-091, GAP-100, GAP-212, GAP-225-227, GAP-242-244, GAP-247, GAP-252, GAP-326, GAP-330)

**Folded in.** HARD-015: Keyboard-shortcut defaults exist in three independent arrays; Three disconnected desktop keyboard-shortcut default sets; Unbinding shortcuts declined until shortcut ownership is reconciled; Only one key binding per action; no mouse-button bindings; Undo/redo missing from shortcut catalog despite a live undo API; No ⌘1–⌘9 chat-switch accelerators; Terminal/artifact/review panels have no toggle shortcuts; No composer-scoped shortcuts for project picker, send or dictation; Global hotkeys scattered across General and Voice

### DESK-34 — Desktop message Retry is a silent no-op and there is no one-click Regenerate, unlike web

`MEDIUM` · desktop · effort M

**What.** The live message-rendering path (unified-chat ActionBar) renders Retry and calls onRetry, but MessageList never passes an onRetry prop, so every click silently no-ops. Separately the shared unified-chat useChat hook has no regenerate capability at all, so true web parity requires a new shared runtime.regenerate method. Needs a Tauri/WDIO run with a live model to verify.

**Done when.** Thread onRetry through MessageList and add runtime.regenerate to the shared useChat hook, covered by a WDIO test against a live model.

**Where.** `packages/ui/unified-chat/src/components/ActionBar.tsx`, `packages/ui/unified-chat/src/components/MessageList.tsx`, `packages/ui/unified-chat/src/hooks/useChat.ts`

**From.** docs/agent-context/known-flaws.md (DESKTOP-CHAT-CONVO-ACTIONS-ORPHANED-01, DESKTOP-REGENERATE-NO-COMPLETION-01)

**Folded in.** DESKTOP-REGENERATE-NO-COMPLETION-01: desktop has no one-click Regenerate/Retry

### DESK-35 — Desktop settings expose controls wired to dormant subsystems: checkpointing, auto-resume, prompt completion, zoom, Continue Generation, High Contrast

`MEDIUM` · desktop · effort L

**What.** Enable Checkpointing, Checkpoint Interval and Auto-resume persist but have zero live consumers — both ContinuousExecutor and the standalone CheckpointManager are never instantiated in the live app. useApiPromptCompletion.ts has zero callers and the live shared composer never reads promptCompletionEnabled. Settings displays Zoom in/out/reset keybindings that do nothing. Continue Generation has zero implementation and High Contrast accessibility mode does not exist anywhere. Related: three separate checkpoint stacks exist and only coding*checkpoint*\* is wired; lib.rs:1315 is a bare '// AGI Checkpoint Management' comment with nothing under it. A prior sweep found 18 persisted desktop settings with no reader, including user-visible toggles that changed nothing.

Also recorded by a later audit (Agent checkpointing / auto-resume-on-restart fully modeled in the desktop store, zero UI (SETTINGS-004)): Inverts the framing usefully: DESK-35 records controls wired to dormant subsystems, while SETTINGS-004 finds setEnableCheckpointing, setCheckpointInterval and setAutoResumeOnRestart at settingsStore.ts:698,708,719 with full store modeling and NO UI reading or calling them. Fix: add the controls to the Agents settings tab, which already handles adjacent agent-task settings (timeout, auto-approve).

Also recorded by a later audit (Agent checkpointing / auto-resume-on-restart fully modeled in the store, zero UI (SETTINGS-004)): Names the exact dead setters and lines: setEnableCheckpointing, setCheckpointInterval and setAutoResumeOnRestart at apps/desktop/src/stores/settingsStore.ts:698,708,719 have full store modeling but no UI reads or calls them. Sharpens DESK-35's framing — for checkpointing/auto-resume specifically the direction is 'store exists, no control', not 'control exists, subsystem dormant'. Proposes the Agents settings tab as the host, since it already handles adjacent agent-task settings (timeout, auto-approve).

**Done when.** Per control, either build the dormant subsystem live or remove the control; consolidate the three checkpoint stacks onto the one that is wired.

**Where.** `apps/desktop/src-tauri/src/core/agent/continuous_executor.rs`, `apps/desktop/src-tauri/src/core/agi/checkpoint.rs`, `apps/desktop/src/hooks/useApiPromptCompletion.ts`, `apps/desktop/src-tauri/src/lib.rs:1305-1320`, `apps/desktop/src/features/settings/FontSelector.tsx`

**From.** docs/agent-context/known-flaws.md (2026-07-21 DESKTOP-SETTINGS-PERSISTED-BUT-UNREAD, DESKTOP-MISC-CRITICAL-GAPS-01); AuditRemediationLedger.md (PP-14); docs/agent-context/phase4-capability-audit.md (PP-14); ExecutionPlan.md (item #52); audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** Desktop Prompt Completion toggle is dead; DESKTOP-MISC-CRITICAL-GAPS-01: dead keybinding-zoom UI, missing Continue Generation, missing High Contrast; Desktop checkpoints: three separate stacks, only one wired to UI; 18 persisted desktop settings have no reader

### DESK-37 — Desktop AI-assisted git features and PR creation are backend-complete with zero callers, and PR creation fakes success

`MEDIUM` · desktop · effort M

**What.** Smart Commit, Merge Assist, PR creation and Repo Summary are backend-complete but have zero live UI callers and are not registered as agent tools, so there is no path to them at all. Worse, gitCreatePr has no UI caller and, if invoked, git_executor.rs:1178-1195 swallows a missing or unauthenticated gh CLI and returns SUCCESS with pr_number:0 and an empty URL. Separately GitPanel.tsx remains orphaned with no live mount point (the agent tool-calling git path works via InlineGitResult).

Also recorded by a later audit (PR auto-monitoring capability does not exist on any reachable UI surface (settings-07-gap)): Concrete symbol and line: apps/desktop/src/api/git.ts:661-683 exports checkPRReadiness; grepping apps/desktop for calls to it (excluding the defining file and tests) returns zero hits — no component, panel or store calls it. Notes that any question about a monitoring default is premature until the function is wired to a real UI action.

Also recorded by a later audit (PR auto-creation is dead exported code, not a configurable toggle (settings-08-gap)): Concrete symbols and lines: apps/desktop/src/api/git.ts:621-635,657 export createPR and generatePRDescription; a grep of the whole apps/desktop tree (excluding the defining file and tests) for both identifiers returns zero call sites anywhere. Recommends wiring them to a real UI trigger with an ask-first-by-default toggle once live — the same root fix as settings-07-gap.

Also recorded by a later audit (Desktop PR auto-monitoring (checkPRReadiness) and PR auto-creation (createPR/generatePRDescription) are dead exported code with zero call sites (settings-07-gap, settings-08-gap)): Exact symbols and locations for the register's 'backend-complete with zero callers': apps/desktop/src/api/git.ts exports checkPRReadiness (lines 661-683), createPR (621-635) and generatePRDescription (657); grepping the whole apps/desktop tree excluding the defining file and tests returns zero call sites for all three. Sequencing note from the audit: the 'should PR monitoring/creation default to ask-first?' settings questions are meaningless until these functions are wired to a real UI trigger, so wire first, then add the toggle.

**Done when.** Return Err instead of a zero-numbered success when gh is unavailable, then either register these as agent tools and mount GitPanel, or delete the unreachable surface.

**Where.** `apps/desktop/src-tauri/src/features/terminal/ai_assistant.rs`, `apps/desktop/src/api/git.ts:640`, `apps/desktop/src-tauri/src/.../git_executor.rs:1178-1195`, `apps/desktop/src/features/git/GitPanel.tsx`

**From.** docs/agent-context/known-flaws.md (DESKTOP-GIT-AI-FEATURES-UNWIRED-01, DESKTOP-GIT-PANEL-UNREACHABLE-01); docs/agent-context/phase4-capability-audit.md (PP-14); audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** DESKTOP-GIT-PANEL-UNREACHABLE-01: orphaned GitPanel.tsx component; Desktop PR creation swallows a missing gh CLI and returns a fake success

### DESK-39 — Desktop DocumentWorkspace, PDFViewer, FilePreviewModal and spreadsheet viewing are built to the IPC boundary with no UI entry point

`MEDIUM` · desktop · effort L

**What.** document_read / document_extract_text / document_search are registered and called by the store, but grep for features/document importers across apps/desktop/src returns zero — unmounted attack surface with no product benefit. FilePreviewModal is only re-exported from features/file-upload/index.tsx and never mounted; PDFViewer likewise. CAP-029 tracks the unreachable spreadsheet workspace (no real workbook parser, no multi-sheet view) and CAP-043 tracks PDF editing existing only as a library with no reachable command or UI.

**Done when.** Mount one document/spreadsheet/PDF viewer with a real parser, or delete the workspace, viewers and their Tauri commands and downgrade the PDF-editing claim.

**Where.** `apps/desktop/src/features/document/DocumentWorkspace.tsx:55-58`, `apps/desktop/src-tauri/src/lib.rs:1790-1793`, `apps/desktop/src/features/file-upload/PDFViewer.tsx`, `apps/desktop/src/features/file-upload/FilePreviewModal.tsx:145`

**From.** docs/agent-context/phase4-capability-audit.md (PP-12b); audit/capability-gaps.csv (CAP-029, CAP-043); AuditRemediationLedger.md (PP-12)

**Folded in.** CAP-029: Mounted spreadsheet viewer; CAP-043: Reachable PDF editing; Desktop PDFViewer/FilePreviewModal built but never mounted

### DESK-41 — Desktop Project Settings 'Memory' tab creates account-wide memories under a project heading with no scoping

`MEDIUM` · desktop · effort M

**What.** MemoryManagerProps has no projectId or scope prop, so a 'project' memory created from the Project Settings dialog silently becomes account-wide and is visible in every other project and in unscoped chat — the exact decorative-memory defect the Web dialog already removed.

Also recorded by a later audit (Desktop's Project Settings Memory tab reads/writes the wrong (global, device-wide) memory store (MEMORY-001 / memory-13-gap)): Pinpoints the mechanism: ProjectSettingsDialog.tsx:1268-1291 mounts MemoryManager, which reads/writes the single flat global useMemoryStore (MemoryManager.tsx:32,105-131,117) with copy claiming project scoping. A fully separate, genuinely project-scoped pipeline already exists and is what the chat runtime injects at send time — ChatMemoryHandler / ProjectMemoryManager keyed by project folder (apps/desktop/src-tauri/src/sys/commands/chat/memory_handler.rs:80-136) — and its TS side, projectMemoryStore.ts, has zero UI callers. Consequence: a user's 'Create memory' from this tab silently leaks into every other project and every non-project chat. Fix: pass the active project's folder into MemoryManager, swap its data source to projectMemoryStore.getProjectMemories(projectFolder), and route Create memory through saveProjectContext. Prior art CAP-027; competitive audit adds that both ChatGPT and Claude pass a live cross-chat isolation test this fails.

Also recorded by a later audit (Desktop Project Settings Memory tab reads/writes the wrong (global) memory store (MEMORY-001, prior art CAP-027)): Sharper mechanism and refs: ProjectSettingsDialog.tsx:1268-1291 mounts MemoryManager, which reads/writes the flat global useMemoryStore (MemoryManager.tsx:105-131) while its copy claims the memories are project-scoped. A fully separate, genuinely project-scoped pipeline (ChatMemoryHandler / ProjectMemoryManager, memory_handler.rs:80-136, keyed by project folder) is what the chat runtime actually injects at send time, and its TS side projectMemoryStore.ts has zero UI callers. Consequence: 'Create memory' from this tab silently leaks into every other project and every non-project chat. Fix: pass the active project folder into MemoryManager, swap its data source to getProjectMemories(projectFolder), route creation through saveProjectContext. Re-confirmed independently as memory-13-gap in the competitive audit.

**Done when.** Add a scope/projectId prop to MemoryManager and enforce project scoping on read and write, or remove the tab from Project Settings.

**Where.** `apps/desktop/src/features/chat/ProjectSettingsDialog.tsx:1284-1286`, `apps/desktop/src/features/memory/MemoryManager.tsx:94-103`

**From.** docs/agent-context/phase4-capability-audit.md (PP-05); audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

### DESK-42 — Desktop project archive and memory-category surfaces remain partly unwired; MemoryCategory is modeled three incompatible ways

`MEDIUM` · desktop · effort M · **in-progress**

**What.** The sidebar Archive menu item was added but other pieces of the archive/memory-category feature set remain unwired. Compounding: types/memory.ts declares 7 category literals, agent-core/memory.ts declares 6 (the runtime one), and desktop memoryStore.ts declares 4 — needs a product decision on the canonical set before reconciling onto @agiworkforce/types. Desktop can archive projects but not conversations and has no archived-conversations view.

**Done when.** Pick the canonical MemoryCategory set, reconcile all three declarations onto @agiworkforce/types, and finish the archive surface including conversations.

**Where.** `packages/contracts/types/src/memory.ts`, `apps/desktop/src/stores/memoryStore.ts`, `apps/desktop/src/features/v3/ProjectRow.tsx`

**From.** docs/agent-context/known-flaws.md (DESKTOP-PROJECT-ARCHIVE-AND-MEMORY-CATEGORIES-UNWIRED-01, DEDUP-MEMORY-CATEGORY-3WAY-01); audit/ui-gaps.md (GAP-237)

**Folded in.** DEDUP-MEMORY-CATEGORY-3WAY-01: MemoryCategory modeled 3 incompatible ways across surfaces; GAP-237: Desktop can archive projects but not conversations, and has no archived view

### DESK-43 — Desktop composer draft text is not cleared by 'New chat'

`MEDIUM` · desktop · effort S

**What.** Confirmed with screenshot evidence in live QA: clicking New Chat creates a fresh conversation and swaps the view, but the textarea's unsent draft text is not cleared, so the previous draft carries into the new conversation.

**Done when.** Clear the ChatInput draft when the active conversation id changes.

**Where.** `packages/ui/unified-chat/src/components/ChatInput.tsx`

**From.** docs/agent-context/known-flaws.md (DESKTOP-NEWCHAT-DRAFT-NOT-CLEARED-01)

### DESK-45 — Desktop Customize nav destination is translated in every locale but no such destination exists

`MEDIUM` · desktop · effort M

**What.** sidebar.nav.customize is translated in all locales but navItemsForMode() exposes no Customize destination; the reachability test remains test.fixme. Related sidebar gaps: no Pull requests, Sites or Plugins destinations.

Also recorded by a later audit (Customize hub — Partial central hub for skills/connectors/plugins/templates/permissions (parity-implementation-matrix)): Confirms the nav destination is translated in every locale with no such destination existing, and adds the intended scope of the hub (skills, connectors, plugins, templates, permissions) so the fix is either build it or delete the locale strings.

**Done when.** Build the Customize destination and un-fixme the reachability test, or remove the translated key and the fixme.

**Where.** `apps/desktop/src/features/v3/Sidebar.tsx`, `apps/desktop/e2e/v3-reachability.spec.ts`

**From.** docs/agent-context/known-flaws.md (DESKTOP-CUSTOMIZE-NAV-GAP-01); audit/ui-gaps.md (GAP-251); audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** GAP-251: Sidebar lacks Pull requests, Sites and Plugins destinations

### DESK-50 — Desktop skill recorder: no macOS Screen Recording preflight, no per-step screenshots, no durable recording asset

`MEDIUM` · desktop · effort L

**What.** ActionRecorder's missingPermissions covers accessibility and input_monitoring only — it never checks macOS Screen Recording permission, which is the documented cause of black frames. The native recording result and RecordedAction model carry action metadata but no image bytes, frame identifiers or redaction status, so per-step screenshots are impossible. ActionRecorder holds capture events locally with skillCreateFromRecording as the only sink, so there is no durable recording entity to attach to a conversation or replay in-thread, and no microphone device picker exists for narration.

**Done when.** Add a Screen Recording permission preflight, and decide whether recordings become a durable persisted entity with consented frame capture — if not, remove the in-thread playback and attachment expectations from the roadmap.

**Where.** `apps/desktop/src/features/automation/ActionRecorder.tsx:105-111,152-154`

**From.** docs/agent-context/phase4-capability-audit.md; audit/ui-gaps.md (GAP-062, GAP-068, GAP-069, GAP-070, GAP-209, GAP-254, GAP-322)

**Folded in.** GAP-254: Recorder preflight never checks macOS Screen Recording permission; GAP-062: Conversation recording attachments declined without a persisted recording entity; GAP-069: In-thread recording playback declined without a durable timeline asset; GAP-070: Per-step recorder screenshots declined without consented frame capture; GAP-209: Skill recorder has no microphone device picker; GAP-322: Record-skill consent shown as full panel takeover instead of compact dialog

### DESK-55 — Desktop plugin/extension manager has no enable-disable toggle, no configure/browse/drag-install, and no authoritative installed state

`MEDIUM` · desktop · effort L

**What.** SkillsPluginsSettings exposes locally resolved plugin metadata with update and remove only — no enable/disable switch (plugin package actions are disabled), no account-bound installed/setup status, and the hosted marketplace disables install. ExtensionsSettings has no drag-install, .mcpb/.dxt handling, browse or advanced-settings affordance, and there is no unified Plugins/Apps/MCPs/Skills tab strip with counts or plugin search. Depends on a real install/publish lifecycle (CONN-11).

**Done when.** Land the account-bound install lifecycle first, then expose enable/disable, configure and install affordances against it.

**Where.** `apps/desktop/src/features/settings/SkillsPluginsSettings.tsx:241-256,654`, `apps/desktop/src/features/settings/ExtensionsSettings.tsx`

**From.** AuditRemediationLedger.md (PP-17); audit/ui-gaps.md (GAP-065, GAP-066, GAP-102, GAP-222, GAP-235, GAP-248, GAP-328)

**Folded in.** GAP-065: Interactive plugin catalog installation declined; GAP-066: Plugin and connector 'Finish setup' state declined; GAP-102: Plugin disable switches declined; GAP-222: Desktop extension manager lacks Configure/Browse/Advanced/drag-install; GAP-235: Desktop plugin list has no enable/disable toggle; GAP-248: No unified Plugins/Apps/MCPs/Skills tab strip or plugin search

### DESK-56 — Desktop billing surface has no invoice history, payment method, cancellation state, or credit top-up path

`MEDIUM` · desktop · effort M

**What.** BillingSettings.tsx renders definition-list rows plus one 'Manage billing' button — no invoice table, no card display, no cancel-plan control and no 'cancels on <date>' branch (only 'Renews / ends'). CreditsSection is read-only, and the 'Buy a top-up' CapModal is permanently unreachable because useBudgetStore.setBudget has zero production callers so budget.enabled stays false; even if reached, its onBuyTopUp opens a billing pane documented as deliberately offering no top-up. Overlaps the billing slice; primary home is the desktop surface.

**Done when.** Either wire the desktop billing pane to real invoice/payment/cancellation data and a working top-up initiation path, or remove the dead CapModal branch and state the portal-only boundary.

**Where.** `apps/desktop/src/features/settings/BillingSettings.tsx:79-88`, `packages/ui/unified-chat/src/stores/budgetStore.ts:96-101`, `apps/desktop/src/App.tsx:1975`

**From.** docs/agent-context/phase4-capability-audit.md (PP-25); audit/ui-gaps.md (GAP-103, GAP-215, GAP-249)

**Folded in.** GAP-103: Credits purchase and auto-reload declined without billing product contracts; GAP-215: No in-app invoice history, payment-method display or cancel-plan control; GAP-249: No cancel-plan section or 'cancels on <date>' state; Desktop 'Buy a top-up' CapModal is permanently unreachable

### DESK-58 — Desktop browser/agent settings have no per-site policy, cookie reset or single browser-runtime owner

`MEDIUM` · desktop · effort L

**What.** BrowserViewer, BrowserPanel, execution browser events and the Chrome extension use different stores and trust boundaries, so a broad Desktop Browser settings page is declined. apps/extension owns agi_site_allowlist and browser permissions while AgentExecutionSettings' allowed-network-domains only constrain terminal execution, leaving desktop agent browsing with no per-site permission policy or cookie reset. There is also no preference to hide the computer-use activity overlay, no risk-tiered default permission preset for plugin/connector actions, and no per-integration rows (Chrome bridge, Office add-in) in Computer use.

**Done when.** Nominate one browser-runtime owner on desktop, then attach per-origin policy and cookie lifecycle to it and surface a single settings page.

**Where.** `apps/desktop/src/features/settings/AgentExecutionSettings.tsx:336-346`, `apps/extension/src/policy.ts`

**From.** audit/ui-gaps.md (GAP-094, GAP-095, GAP-207, GAP-216, GAP-238, GAP-239)

**Folded in.** GAP-094: Broad Desktop Browser settings page declined without one browser runtime owner; GAP-095: Desktop per-site browser policy declined until origin enforcement is shared; GAP-207: No risk-tiered default permission preset; GAP-216: Desktop agent browsing has no per-site permission policy or cookie reset; GAP-238: No preference to hide the computer-use activity overlay; GAP-239: Per-integration rows missing from Computer use

### DESK-60 — Desktop cloud-mode package reuse audit is incomplete and its prior negative findings were proven false

`MEDIUM` · desktop · effort M

**What.** An investigation found more shared-package reuse than initially assumed and explicitly flagged that prior negative findings in this area were false and need re-verification before being trusted. Two other audit findings in the same family (web memory injection, project-knowledge grounding) were likewise confirmed false positives caused by grepping the wrong identifier casing — the same failure mode.

**Done when.** Re-verify the desktop cloud-mode package-reuse claims from the live production path and retract or restate each prior negative finding.

**Where.** `apps/desktop/src/features/memory`, `apps/desktop/src/stores/memoryStore.ts`

**From.** docs/agent-context/known-flaws.md (DESKTOP-CLOUD-SHARED-PACKAGE-GAPS-01)

### DESK-63 — Desktop settings IA converged on the locked spec but visual E2E is pending; OutcomeTracker is not called by normal task execution

`MEDIUM` · desktop · effort M · **in-progress**

**What.** Settings sections are present and wired against the locked settings-IA spec; the visual E2E verification pass that would close it was still pending. Separately and explicitly recorded as an ownership gate: normal Desktop task execution still does not call OutcomeTracker and the outcomes UI is unmounted.

Also recorded by a later audit (Desktop settings does not match the locked settings IA (source-of-truth P0 GAP-2)): Direct contradiction worth recording: source-of-truth.md's P0 Gap List item 2 asserts desktop settings does NOT match the locked IA (General, Account, Privacy, Billing, Usage, Capabilities, Connectors, AGI Code, AGI in Chrome, Extensions, Developer) and 'currently has a different set', while DESK-63 records the IA as converged with only visual E2E pending. One of the two is stale — resolve before closing DESK-63. The 11-section locked IA is enumerated here for the comparison.

**Done when.** Run the settings visual E2E pass and record it; separately decide whether OutcomeTracker is wired into normal task execution or removed with its UI.

**Where.** `apps/desktop/src/features/settings`

**From.** docs/agent-context/known-flaws.md (DESK-SETTINGS-IA-01); ExecutionPlan.md (late release-integration verification, final line); audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** Normal Desktop task execution still does not call OutcomeTracker; outcomes UI unmounted

### DESK-67 — Desktop hooks\_\* subsystem (12 Tauri commands, Claude-Code-style hooks) is fully implemented with zero frontend callers

`MEDIUM` · desktop · effort L

**What.** DEAD-CODE-012: hooks*add/create_example/export/get_config_path/get_event_types/get_stats/import/initialize/list/reload/remove/toggle/update back a real hooks implementation under apps/desktop/src-tauri/src/core/hooks/ with zero UI references anywhere in the renderer. The audit calls this a larger product-scoping decision than the sibling background_agent*\* wiring.

**Done when.** Make a product decision: either build a Hooks settings surface consuming the 12 commands, or delete the subsystem. Do not leave it registered and unreachable.

**Where.** `apps/desktop/src-tauri/src/core/hooks/`

**From.** audit/parity-2026-08-15 gaps/domain-dead-code DEAD-CODE-012; audit/parity-2026-08-15/gaps/domain-dead-code.json DEAD-CODE-012

**Folded in.** hooks\_\* (12 commands) Claude-Code-style hooks subsystem is fully implemented with zero frontend callers

### DESK-75 — Electron IPC bridge and deep-link SSO are dead in the shipped default (remote-renderer) configuration, so agiworkforce-cloud:// links are silently dropped

`MEDIUM` · desktop · effort S

**What.** CROSS-SURFACE-003: main.ts's own header comment confirms the default renderer is the hosted web app loaded top-level; the 9-channel IPC bridge is only attached via preload.ts when AGI_CLOUD_RENDERER=bundled. deliverDeepLink() is still called unconditionally from open-url/second-instance handlers and pushes over an IPC channel nothing can receive in remote mode. CHANGELOG.md also lists the Clerk SSO redirect allowlisting as an un-actioned ops TODO. Distinct from DESK-64 (no packaged signed app has run the callback/update journey).

**Done when.** Land the CHANGELOG-tracked ops TODO (allowlist agiworkforce-cloud://sso-callback with Clerk), and add a startup log line when deliverDeepLink() fires with no registered receiver.

**Where.** `apps/desktop/electron/main.ts:14,336-346,477-483`, `apps/desktop/electron/preload.ts:26-83`, `apps/desktop/electron/quickAsk.ts:39-45`

**From.** audit/parity-2026-08-15 CROSS-SURFACE-003; audit/parity-2026-08-15/gaps/domain-cross-surface.json CROSS-SURFACE-003

**Folded in.** Electron IPC bridge and deep-link SSO are dead in the shipped default (remote-renderer) configuration, so agiworkforce-cloud:// links are silently dropped

### DESK-76 — Local/Cloud mode toggle silently reverts instead of disabling itself when Local mode is unavailable in the Electron renderer

`MEDIUM` · desktop · effort S

**What.** CROSS-SURFACE-004: LocalCloudToggle.tsx renders unconditionally; inside the Electron-bundled renderer appModeStore.ts force-coerces mode back to 'cloud' whenever supportsLocalAppMode is false, but the toggle has no visible affordance change — a user tapping Local sees the control silently revert with no toast or explanation. Distinct from DESK-02 (Cloud Mode gated behind a 'coming soon' toast in the Tauri shell).

**Done when.** Hide the Local segment entirely in the Electron-bundled build (supportsLocalAppMode already exists as the gating signal), or render it disabled with an explanatory tooltip, plus a toast if a coerced setMode attempt occurs.

**Where.** `apps/desktop/src/features/shell/LocalCloudToggle.tsx`, `apps/desktop/src/stores/appModeStore.ts:52,65,72`

**From.** audit/parity-2026-08-15 CROSS-SURFACE-004

### DESK-77 — Desktop Cloud skill 'download' produces a raw file save, not a working install — nothing writes it into the local skill directory

`MEDIUM` · desktop · effort M

**What.** EXTENSIBILITY-005: DesktopCloudSettingsModal.tsx builds a downloadHref for each Cloud skill, rendered as a plain <a href download>. No code path anywhere in apps/desktop takes a downloaded skill file and writes it into ~/.agiworkforce/skills/ (the directory SkillManager actually scans) or calls skill_reload(). The user gets a file in Downloads with no way to make it usable in chat. CPS-05 records the mirror gap: this outbound save is the only skill-file path in the product and there is no import-back-in step.

**Done when.** Add a native command (skill_import_from_download) that accepts the downloaded bytes/path, validates the SKILL.md shape via the existing skill-vetting scanner, writes it into the Managed skills directory, and calls skill_reload(), wired behind the existing downloadHref button.

**Where.** `apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:907-950`, `packages/ui/ui/src/settings-modal/types.ts:72`, `packages/ui/ui/src/settings-modal/SettingsModal.tsx:422-438`

**From.** audit/parity-2026-08-15 EXTENSIBILITY-005; audit/competitive-gap-2026-08-15 CPS-05

### DESK-80 — Desktop model-routing setters (default provider, temperature, max tokens, task routing, favorites) have zero call sites

`MEDIUM` · desktop · effort M

**What.** SETTINGS-002: setDefaultProvider, setTemperature, setMaxTokens, setTaskRouting and setFavoriteModels are all defined in settingsStore.ts with no external callers anywhere in the desktop app. This is the inverse of DESK-35 (controls that render but drive dormant subsystems): here the store surface exists with no UI at all.

**Done when.** Either wire these into a per-conversation model-routing settings UI, or delete them if not planned.

**Where.** `apps/desktop/src/stores/settingsStore.ts:921,942,952,975,991`

**From.** audit/parity-2026-08-15 SETTINGS-002; audit/parity-2026-08-15 — SETTINGS-002

**Folded in.** Desktop settings store's model-routing setters (temperature, max tokens, task routing, favourites, default provider) have zero call sites

### DESK-81 — Desktop window/session setters (startup position, dock behavior, send shortcut, chat storage mode, feature flags) have zero call sites

`MEDIUM` · desktop · effort M

**What.** SETTINGS-003 (and SETTINGS-010's seed example): setSendShortcut is read only at hydration/persist and never called; setStartupPosition, setDockOnStartup, setAutoSaveMemories, setChatStorageMode and setFeature all have zero external callers, confirmed by repo-wide grep excluding the defining file and tests. The send-shortcut preference is the named seed case of the wider 'shipped panel with no nav entry / no writer' pattern.

**Done when.** Add the corresponding settings UI controls (starting with the send-shortcut preference, which the shared ChatInput already accepts as a host-controlled prop) or delete the dead setters.

**Where.** `apps/desktop/src/stores/settingsStore.ts:653,698,708,719,1192,1202,1252,1301,1378`

**From.** audit/parity-2026-08-15 SETTINGS-003; audit/parity-2026-08-15 SETTINGS-010; audit/parity-2026-08-15 — SETTINGS-003

**Folded in.** Desktop settings store's window/session setters (startup position, dock behaviour, send shortcut, chat storage mode) have zero call sites

### DESK-82 — Desktop Cowork settings expose one control against a five-control benchmark, and neither Cowork nor scheduled-task creation has an approval-mode picker

`MEDIUM` · desktop · effort M

**What.** SETTINGS-011: CoworkTab exposes only a Dispatch toggle where the benchmark has five (Dispatch, Cowork files path, Trusted Cowork folders, Run new tasks in the cloud, Global instructions). settings-03-gap adds that the shared 4-tier Ask/Auto/Plan/Bypass AgentControl chip is imported only by AgentControl.tsx and ChatInput.tsx — CoworkTab is a single boolean and desktop CreateTaskModal.tsx has zero occurrences of approval/autonom/mode (settings-28-gap), which is itself gated behind scheduled runs having no tool access to approve.

**Done when.** Add the four missing Cowork controls, and reuse the existing AgentControl mode chip (with its bypass confirm-gate) in CoworkTab rather than building a new picker. Sequence the scheduled-task approval picker after scheduled execution gains real tool access.

**Where.** `apps/desktop/src/features/settings/tabs/Cowork/CoworkTab.tsx`, `apps/desktop/src/features/settings/tabs/Cowork/index.tsx:10-11`, `packages/ui/unified-chat/src/components/AgentControl.tsx:64`, `apps/desktop/src/features/scheduler/CreateTaskModal.tsx:190,209,227,236-243`

**Blocked by.** scheduled-task approval picker blocked on scheduled runs gaining tool access (AGENTIC-WORK-007)

**From.** audit/parity-2026-08-15 SETTINGS-011; audit/competitive-gap-2026-08-15 settings-03-gap; audit/competitive-gap-2026-08-15 settings-28-gap

### DESK-83 — Superseded parallel MCP management UI (~2,000 lines) sits alongside the live MCPWorkspace in the same directory

`MEDIUM` · desktop · effort S

**What.** DEAD-CODE-003: MCPServerManager.tsx, MCPServerBrowser.tsx, MCPToolExplorer.tsx, MCPLogsViewer.tsx and MCPConnectionStatus.tsx (~1,991 lines) form a second, disjoint MCP management UI in the same directory as the live MCPWorkspace.tsx, exported from a barrel nothing outside the directory imports.

**Done when.** DELETE the 5 superseded components and the now-empty index.tsx barrel; keep MCPWorkspace.tsx and its live dependency set.

**Where.** `apps/desktop/src/features/mcp/MCPServerManager.tsx`, `apps/desktop/src/features/mcp/MCPServerBrowser.tsx`, `apps/desktop/src/features/mcp/MCPToolExplorer.tsx`, `apps/desktop/src/features/mcp/MCPLogsViewer.tsx`, `apps/desktop/src/features/mcp/MCPConnectionStatus.tsx`

**From.** audit/parity-2026-08-15 gaps/domain-dead-code DEAD-CODE-003; audit/parity-2026-08-15/gaps/domain-dead-code.json DEAD-CODE-003

**Folded in.** Superseded parallel MCP management UI (~2,000 lines) sits alongside the live MCPWorkspace in the same directory

### DESK-84 — Typed apps/desktop/src/api/\*.ts wrapper layer is largely bypassed by direct invoke() calls with string-literal command names

`MEDIUM` · desktop · effort L

**What.** DEAD-CODE-004: ~20 typed wrapper modules (chat.ts, terminal.ts, workflow.ts, automation.ts, undo.ts, etc.) are flagged unused by knip because store call sites import invoke directly from lib/tauri-mock and call commands by string literal instead — an architectural fork where the typed layer is unreachable by static analysis even though the underlying commands are live. This is also why reachability checks can be fooled (see the marketplace precedent recorded in wire-or-cut).

**Done when.** Pick one pattern per command family: route store call sites through the typed wrappers (type safety plus a single choke point), or delete the wrapper modules that duplicate what a store already does with raw invoke().

**Where.** `apps/desktop/src/api/undo.ts:174,184`, `apps/desktop/src/api/`

**From.** audit/parity-2026-08-15 gaps/domain-dead-code DEAD-CODE-004; audit/parity-2026-08-15/gaps/domain-dead-code.json DEAD-CODE-004

**Folded in.** Typed apps/desktop/src/api/\*.ts wrapper layer is largely bypassed by direct invoke() calls with string-literal command names

### DESK-85 — ~1,777 lines of Discord/Signal/Telegram/WhatsApp messaging clients and a complete Gmail OAuth2 flow have zero frontend callers

`MEDIUM` · desktop · effort L

**What.** DEAD-CODE-013: messaging_connect_discord/signal/telegram, messaging_disconnect/get_status/send are real, no-stub implementations with no UI reaching any of them. gmail_oauth_start/complete/refresh/list_accounts/disconnect/get_account is a complete Google OAuth2 flow with zero frontend callers; the UI's actual 'connect email' path calls the generic credential-based email_connect command instead.

**Done when.** Gmail OAuth is the smaller, higher-value slice: wire a 'Connect Gmail' button using the existing gmail_oauth_start/complete flow. The four messaging-platform connectors are a larger product decision — wire or delete, do not leave registered and unreachable.

**Where.** `apps/desktop/src-tauri/src/features/messaging/discord.rs`, `apps/desktop/src-tauri/src/features/messaging/signal.rs`, `apps/desktop/src-tauri/src/features/messaging/telegram.rs`, `apps/desktop/src-tauri/src/features/messaging/whatsapp.rs`

**From.** audit/parity-2026-08-15 gaps/domain-dead-code DEAD-CODE-013; audit/parity-2026-08-15/gaps/domain-dead-code.json DEAD-CODE-013

**Folded in.** ~1,777 lines of Discord/Signal/Telegram/WhatsApp messaging clients and a complete Gmail OAuth2 flow have zero frontend callers

### DESK-86 — Two duplicated dead desktop backend subsystems: settings*v2*_ (parallel settings store) and checkpoint\__ (duplicating coding*checkpoint*\*)

`MEDIUM` · desktop · effort M

**What.** DEAD-CODE-014: settings*v2_get/set/delete/get_batch/get_category/list_all/load_app_settings/save_app_settings/clear_cache back a fully-migrated settings_v2 SQLite table, but the frontend exclusively uses the older settings_load/settings_save commands. checkpoint_create/restore/list/delete (conversation-level) has zero frontend callers while coding_checkpoint*\* (file-snapshot checkpoints) is what the UI actually uses. Consistent with wire-or-cut's earlier cut of 14 AGI checkpoint commands, which left checkpoint_store.rs/checkpoint_manager.rs behind as orphans.

**Done when.** settings*v2: either migrate settingsStore.ts onto it and delete the old path, or delete settings_v2 entirely. checkpoint*_: delete outright — coding*checkpoint*_ already covers the live use case; sweep checkpoint_store.rs/checkpoint_manager.rs in the same pass.

**Where.** `apps/desktop/src/stores/settingsStore.ts:1433-1833`, `apps/desktop/src/stores/codingCheckpointStore.ts:92,129`, `apps/desktop/src-tauri/src/core/agi/checkpoint_store.rs`, `apps/desktop/src-tauri/src/core/agi/checkpoint_manager.rs`

**From.** audit/parity-2026-08-15 gaps/domain-dead-code DEAD-CODE-014; docs/adr/wire-or-cut.md 2026-08-06 Wave 2 Orphan Sweep; audit/parity-2026-08-15/gaps/domain-dead-code.json DEAD-CODE-014

**Folded in.** Two duplicated desktop backend subsystems: settings*v2*_ (unused parallel settings store) and checkpoint\__ (duplicating coding*checkpoint*\*)

### DESK-87 — Electron global-shortcut customization and tray-menu refresh are fully built with zero callers, so shortcuts are permanently fixed at defaults

`MEDIUM` · desktop · effort M

**What.** DEAD-CODE-015: electron/settingsStore.ts persists quickAskShortcut/screenshotShortcut with full accelerator validation, but saveSettings() is never called anywhere — no IPC channel, UI or tray item triggers it, so shortcuts stay at DEFAULT_SHORTCUTS forever. refreshTrayMenu() exists specifically to rebuild the tray after a shortcut change but is never called (only createTray runs, once, at startup). Distinct from DESK-53 (native lifecycle toggles declined for lack of a native owner) — here the owner exists and is unreachable.

**Done when.** Wire a settings-panel control through saveSettings() + refreshTrayMenu(), or delete the dead persistence/validation layer.

**Where.** `apps/desktop/electron/settingsStore.ts`, `apps/desktop/electron/garnishCore.ts:17-23`, `apps/desktop/electron/tray.ts:99-101`

**From.** audit/parity-2026-08-15 gaps/domain-dead-code DEAD-CODE-015; audit/parity-2026-08-15/gaps/domain-dead-code.json DEAD-CODE-015

**Folded in.** Electron global-shortcut customization and tray-menu refresh are fully built with zero callers, so shortcuts are permanently fixed at defaults

### DESK-89 — Desktop McpToolConfirmationPrompt has no keyboard handling despite advertising an 'Esc' hint

`MEDIUM` · desktop · effort S

**What.** GAP-101 (DeadAndDisconnectedCode.md §11): McpToolConfirmationPrompt.tsx (the tool-approval dialog) has no useEffect, onKeyDown, or reference to Enter/Return/Escape. Escape-to-deny only works incidentally via Radix Dialog's default onOpenChange(false); Return-to-approve does not exist at all, though the Deny button advertises an 'Esc' hint the component does not itself implement.

**Done when.** Add a matching Enter-to-approve keyboard handler (and an explicit Escape handler), or remove the misleading Esc hint if full keyboard support is not being committed to.

**Where.** `apps/desktop/src/features/mcp/McpToolConfirmationPrompt.tsx`

**From.** audit/ui-gaps GAP-101; audit/parity-2026-08-15 DeadAndDisconnectedCode.md §11

### DESK-93 — Desktop rebuilt the project gallery from scratch (AgiWorkProjects.tsx) instead of consuming the shared ProjectGallery, with no documented rationale

`MEDIUM` · desktop · effort L

**What.** duplication/components.md §5: ProjectGallery.tsx (452 lines) is imported only by web's /chat/projects route; AgiWorkProjects.tsx (462 lines) reads a completely separate store (projectStore.ts) with no relation to whatever backs ProjectGallery, and is mounted twice in DesktopShellV3.tsx. Unlike DesktopLibrary.tsx — which documents in-file why it supplies only a platform transport over the shared component — no comment on AgiWorkProjects.tsx explains why it isn't the shared component with a desktop transport.

**Done when.** Document the divergence in-file the way DesktopLibrary.tsx does if the constraint (privacyMode gating, local storage) is real, or migrate desktop onto the shared ProjectGallery behind a desktop transport.

**Where.** `packages/ui/unified-chat/src/components/ProjectGallery.tsx`, `apps/desktop/src/features/v3/AgiWorkProjects.tsx`

**From.** audit/competitive-gap-2026-08-15 duplication/components.md §5

### DESK-94 — Two artifactStore implementations and two ArtifactPanels coexist for desktop with an undocumented, runtime-unverified split

`MEDIUM` · desktop · effort M · **unclear**

**What.** duplication/components.md §7: two separate Zustand stores both named artifactStore (apps/desktop/src/stores/artifactStore.ts and packages/ui/unified-chat/src/stores/artifactStore.ts) do not share state. Desktop's panel imports Tauri-only @tauri-apps/plugin-shell and is gated privacyMode==='local' (suggestive of an intentional Local vs Managed-Cloud split per a 'DES-C05' comment), but unlike DesktopLibrary.tsx neither file documents the split, and it was never runtime-verified whether both panels can mount simultaneously for the same artifact on a real desktop build. Two related defects sit in the same package: ArtifactsSidebar.tsx is exported and fully tested with zero non-test importers anywhere, and ArtifactPanel.tsx contains its own comment admitting its HTML rendering and ArtifactRenderer.HtmlArtifact's HTML rendering are two code paths kept in sync only by that comment.

**Done when.** Runtime-verify on a real desktop build whether opening a managed-cloud artifact ever shows both panels or conflicting state; document the split like DesktopLibrary.tsx if intentional, otherwise collapse. Separately delete ArtifactsSidebar.tsx and consolidate the two HTML-artifact render paths.

**Where.** `apps/desktop/src/features/artifacts/ArtifactPanel.tsx`, `packages/ui/unified-chat/src/components/ArtifactPanel.tsx`, `apps/desktop/src/stores/artifactStore.ts`, `packages/ui/unified-chat/src/stores/artifactStore.ts`, `packages/ui/unified-chat/src/components/ArtifactsSidebar.tsx`

**From.** audit/competitive-gap-2026-08-15 duplication/components.md §7

### DESK-95 — Desktop SkillMarketplace.tsx vs the shared DirectoryBrowse skills tab — duplication flagged but never diffed

`MEDIUM` · desktop · effort S · **unclear**

**What.** duplication/extension-surfaces.md §5: apps/desktop/src/features/skill-marketplace/SkillMarketplace.tsx is a third, Desktop-only, independently-built skill-browsing UI, separate from the shared SkillsPanel/DirectoryBrowse that Desktop also uses via DesktopCloudSettingsModal.tsx. Plausibly deliberate (Local filesystem skills via Tauri commands vs the hosted skill list — a real trust boundary), but no line-by-line comparison against DirectoryBrowse's skills tab was performed, so drift versus intent is unresolved.

**Done when.** Diff SkillMarketplace.tsx's card/search/filter code against DirectoryBrowse's skills tab to settle whether this is deliberate or drift; document the boundary in-file either way.

**Where.** `apps/desktop/src/features/skill-marketplace/SkillMarketplace.tsx`, `apps/desktop/src/features/settings/tabs/Skills/index.tsx`, `apps/desktop/src/features/settings/tabs/Capabilities/index.tsx`

**From.** audit/competitive-gap-2026-08-15 duplication/extension-surfaces.md §5

### DESK-98 — Desktop /git slash panel is archived and not actionable, pending an unmade product decision

`MEDIUM` · desktop · effort M

**What.** parity-implementation-matrix.md 2026-08-05 Class-1 Closure Status, Desktop batch-1: '/git slash panel NOT actionable — surface archived, product decision pending.' Related to but distinct from DESK-37 (git/PR backend complete with zero callers, PR creation fakes success): here the user-facing entry point itself is archived with no decision recorded.

**Done when.** Make and record the product decision: restore the /git panel against the existing git backend, or remove the slash command so it stops advertising an archived surface.

**From.** docs/current/parity-implementation-matrix.md 2026-08-05 Class-1 Closure Status

### SEC-94 — Desktop computer-use confirmation pause has no resume channel; real human-in-the-loop resume is unimplemented

`MEDIUM` · security · effort M

**What.** wire-or-cut.md 2026-08-06 Wave 2/3 final items: the OPA loop's pause polled is_paused() with no timeout and no resume channel; the branch is currently unreachable but a 300s bound was added defensively. Real human-in-the-loop resume needs a shared signal threaded into the loop and remains deferred. Related to DESK-06 (approval requests emitted but not renderable or resumable) but specific to the computer-use OPA loop rather than the tool-approval UI.

**Done when.** Thread a shared resume signal into the computer-use loop so a confirmed pause can be genuinely resumed, rather than relying on an unreachable branch with a defensive timeout.

**Where.** `apps/desktop/src-tauri/src/core/agi/`

**From.** docs/adr/wire-or-cut.md 2026-08-06 Wave 2/3 final items; docs/adr/wire-or-cut.md#2026-08-06 Wave 2/3 final items

**Folded in.** Computer-use confirmation pause has no resume channel; real human-in-the-loop resume is unimplemented

### TEST-12 — apps/desktop DesktopShellV3.test.tsx is 29/29 failing on a stale store mock, invalidating GAP-064's completion evidence

`MEDIUM` · testing · effort S

**What.** red-test-suites.md §2 (cited by GAP-064, verified PARTIALLY_DONE): 'TypeError: state.getSelectedModel is not a function' — a stale mock of useChatModelStore omits getSelectedModel, added by commit 1e858a7f1, and the mismatch has persisted unfixed through HEAD, so every test in the file dies at render. The suite covers desktop-shell tier gating, folder scoping and tool confirmation, and is cited as completion evidence by GAP-064 in ui-gaps.csv — which was downgraded to PARTIALLY_DONE specifically because this suite cannot run. Any other ledger row citing this test file is currently unverifiable. Discovered incidentally alongside the VS Code red suite (EXT-20), which suggests a per-package 'is CI actually green' sweep is warranted.

**Done when.** Add getSelectedModel to the useChatModelStore mock (the real production store already implements it correctly) and re-run the suite to confirm green; then run a dedicated per-package CI-green sweep, since two red suites were found by accident.

**Where.** `apps/desktop/src/features/v3/__tests__/DesktopShellV3.test.tsx:154`, `apps/desktop/src/features/v3/DesktopShellV3.tsx:259`

**From.** audit/parity-2026-08-15 gaps/red-test-suites.md §2; audit/ui-gaps GAP-064

### UI-64 — Desktop Cowork settings expose one control against a five-control benchmark

`MEDIUM` · ui · effort ?

**What.** SETTINGS-011: CoworkTab exposes only a Dispatch toggle, against a benchmark of five (Dispatch, Cowork files path, Trusted Cowork folders, Run new tasks in the cloud, Global instructions).

**Done when.** Add the missing four Cowork controls where a real backing runtime exists; do not ship controls for subsystems with no owner.

**Where.** `apps/desktop/src/features/settings/tabs/Cowork/CoworkTab.tsx`

**From.** audit/parity-2026-08-15 — SETTINGS-011

### UI-70 — Project gallery is duplicated: web uses the shared ProjectGallery, desktop independently rebuilt AgiWorkProjects over an unrelated store with no documented rationale

`MEDIUM` · ui · effort ?

**What.** duplication/components.md §5: ProjectGallery.tsx (452 lines) is imported only by web's /chat/projects route; AgiWorkProjects.tsx (462 lines) reads a completely separate projectStore.ts with no relation to whatever backs ProjectGallery and is mounted twice in DesktopShellV3. Unlike DesktopLibrary.tsx, no doc comment explains why it is not the shared component with a desktop transport.

**Done when.** Document the divergence the way DesktopLibrary.tsx does if the constraint (privacyMode gating, local storage) is real, or migrate desktop onto the shared ProjectGallery with a desktop transport.

**Where.** `packages/ui/unified-chat/src/components/ProjectGallery.tsx`, `apps/desktop/src/features/v3/AgiWorkProjects.tsx`

**From.** audit/competitive-gap-2026-08-15/duplication/components.md §5; all-axes.json#components[4]

### UI-76 — Desktop McpToolConfirmationPrompt advertises an 'Esc' hint it does not implement and has no Enter-to-approve

`MEDIUM` · ui · effort S

**What.** GAP-101 (DeadAndDisconnectedCode.md §11): McpToolConfirmationPrompt.tsx has no useEffect, onKeyDown, or reference to Enter/Return/Escape. Escape-to-deny works only incidentally via Radix Dialog's default onOpenChange(false); Return-to-approve does not exist at all, though the Deny button advertises an 'Esc' hint the component does not itself implement — on a security-relevant tool-approval dialog.

**Done when.** Add a matching Enter-to-approve keyboard handler, or remove the misleading Esc hint if full keyboard support is not being committed to.

**Where.** `apps/desktop/src/features/mcp/McpToolConfirmationPrompt.tsx`

**From.** audit/parity-2026-08-15 DeadAndDisconnectedCode.md §11 — GAP-101

### DESK-102 — Shared slash-command reconciliation (Ticket 1D) left unfinished after the desktop execute-plan handler was cut

`LOW` · desktop · effort M

**What.** wire-or-cut.md 2026-07-29 Desktop IPC Baseline: the /execute-plan slash handler was cut as dead code with the note that 'shared slash-command reconciliation is tracked separately in Ticket 1D'; nothing in the ledger records Ticket 1D as closed.

**Done when.** Locate or re-open Ticket 1D and reconcile the slash-command registries across the desktop renderer, shared unified-chat and CLI so the three lists cannot drift again.

**From.** docs/adr/wire-or-cut.md 2026-07-29 Desktop IPC Baseline — Ticket 1D

### DESK-110 — Orphaned legacy memory-browser component family on desktop — five dead files exported but never mounted

`LOW` · desktop · effort S

**What.** MEMORY-009. MemoryViewer.tsx, MemoryBrowserModal.tsx, MemoryImportanceIndicator.tsx, MemoryBadge.tsx and SaveToMemoryButton.tsx are exported from the feature barrel but mounted nowhere. The team's own comment in Memory.tsx:180-187 documents that MemoryBrowserModal's sole caller 'was never mounted — so a user could not get their memories out of the device at all', and worked around it with a direct Export button instead of fixing the orphan.

**Done when.** Delete the five orphaned components and their barrel exports, or mount MemoryViewer/MemoryBrowserModal from an actual entry point with a regression test asserting it renders.

**Where.** `apps/desktop/src/features/memory/index.ts`, `apps/desktop/src/features/memory/MemoryViewer.tsx`, `apps/desktop/src/features/memory/MemoryBrowserModal.tsx`, `apps/desktop/src/features/settings/tabs/Memory.tsx:180-187`

**From.** audit/parity-2026-08-15/gaps/domain-memory.json MEMORY-009

### DESK-111 — Dead local-llm Cargo feature (llama-cpp-2) in Desktop with zero call sites

`LOW` · desktop · effort S

**What.** MODELS-007. llama-cpp-2 is an optional Cargo dependency behind a local-llm feature with zero call sites in apps/desktop/src-tauri/src (grep confirmed) and absent from the shipped default feature set. The shipped local-model story is honestly an HTTP client to an external llama.cpp server instead (direct_api_provider.rs:410-413).

**Done when.** Remove the local-llm feature flag and dependency if embedded inference is not planned; otherwise finish the integration and add it to the default feature set.

**Where.** `apps/desktop/src-tauri/Cargo.toml:240,301,309`, `apps/desktop/src-tauri/src/core/llm/providers/direct_api_provider.rs:410-413`

**From.** audit/parity-2026-08-15/gaps/domain-models.json MODELS-007; audit/parity-2026-08-15 MODELS-007

**Folded in.** Dead local-llm Cargo feature in Desktop (llama-cpp-2) with zero call sites

### DESK-121 — Desktop legacy 'job-based' scheduler UI (SchedulerPanel, JobCreationDialog) is dead code with a self-declared legacy label

`LOW` · desktop · effort S

**What.** duplication/tasks-schedules.md Finding 2. scheduler/index.ts self-labels this half of the directory 'Legacy job-based system (kept for backwards compatibility)'; there are zero live importers of SchedulerPanel/JobCreationDialog or the barrel anywhere in the app. Whether the corresponding Rust-side scheduler\_\*\_job Tauri IPC commands are also dead was not verified.

**Done when.** Delete SchedulerPanel.tsx, JobCreationDialog.tsx and useScheduler once confirmed no #[tauri::command] exists solely for their benefit.

**Where.** `apps/desktop/src/features/scheduler/SchedulerPanel.tsx`, `apps/desktop/src/features/scheduler/JobCreationDialog.tsx`, `apps/desktop/src/features/scheduler/index.ts`

**From.** audit/competitive-gap-2026-08-15/duplication/tasks-schedules.md Finding 2

### DESK-122 — Desktop ArtifactsGallery.tsx (580 lines) has zero live importers and still compiles into the shipped bundle

`LOW` · desktop · effort S

**What.** duplication/components.md §3. Grep for <ArtifactsGallery> JSX and for the exporting barrel path both return zero results outside its own file/tests; it is superseded by AgiWorkArtifacts.tsx (mounted at DesktopShellV3.tsx:854). Unlike apps/desktop/archive/, it is not in the vite.config.ts exclusion list, so it still compiles into the app bundle despite rendering nowhere. Its sole consumer, ArtifactCategoryFilter.tsx, is dead for the same reason.

**Done when.** Delete both files, or move them into archive/ (already build-excluded) if kept for reference.

**Where.** `apps/desktop/src/features/artifacts/ArtifactsGallery.tsx`, `apps/desktop/src/features/artifacts/ArtifactCategoryFilter.tsx`

**From.** audit/competitive-gap-2026-08-15/duplication/components.md §3

### DESK-125 — Shared slash-command reconciliation (Ticket 1D) was deferred during the execute-plan cut and never closed

`LOW` · desktop · effort M

**What.** docs/adr/wire-or-cut.md, 2026-07-29 Desktop IPC Baseline: the Desktop slash execute-plan handler was cut as dead code with the note that 'shared slash-command reconciliation is tracked separately in Ticket 1D'. Nothing in that ledger records Ticket 1D being closed, and the ledger is being retired.

**Done when.** Locate or re-open Ticket 1D and reconcile the slash-command registries across the shared package, Desktop and CLI, or record explicitly that it was subsumed.

**Where.** `packages/ui/unified-chat/src/lib/slashCommands.ts`

**From.** docs/adr/wire-or-cut.md#2026-07-29 Desktop IPC Baseline

### DESK-126 — checkpoint_store.rs and checkpoint_manager.rs were left orphaned after the AGI checkpoint command cut

`LOW` · desktop · effort S

**What.** docs/adr/wire-or-cut.md, 2026-08-06 Wave 2 Orphan Sweep: fourteen AGI checkpoint commands and their TS clients were cut, and the ledger records that core/agi/checkpoint*store.rs and checkpoint_manager.rs 'now have no consumer beyond a doc comment and a re-export; left in place rather than widening the cut.' Distinct from DESK-78's checkpoint*\* command duplication.

**Done when.** Delete both modules and the re-export, or state which future subsystem is expected to consume them.

**Where.** `apps/desktop/src-tauri/src/core/agi/checkpoint_store.rs`, `apps/desktop/src-tauri/src/core/agi/checkpoint_manager.rs`

**From.** docs/adr/wire-or-cut.md#2026-08-06 Wave 2 Orphan Sweep

### DESK-36 — Desktop background-task event listener writes continuously into a store whose only reader is unmounted

`LOW` · desktop · effort S

**What.** initializeBackgroundTaskEventListeners() runs on every Tauri session start and continuously writes task events into agentStore, while the only reader (BackgroundTasksPanel / BackgroundTaskIndicator) is unmounted. Needs a mount-or-delete decision.

Also recorded by a later audit (Desktop BackgroundTasksPanel/BackgroundTaskIndicator — a fourth, fully unreachable 'task' UI): Grep for BackgroundTasksPanel|BackgroundTaskIndicator outside their own directory returns nothing — no nav entry, no panel-switch case, no toolbar mount anywhere. Whether the backing useBackgroundTasks/agentStore store still has a live producer was not verified, which is the decision point: if no producer, delete the whole vertical; if there is one, record it as a half-wired feature in PLAN.md/known-flaws.md rather than leaving it as silent dead UI. Positions this as the fourth distinct desktop 'task' UI alongside AgiWorkScheduled, ScheduledTasksPanel and the legacy SchedulerPanel.

Also recorded by a later audit (Desktop BackgroundTasksPanel and BackgroundTaskIndicator are a fourth, fully unreachable 'task' UI (duplication tasks-schedules[2])): Widens the register entry from 'the store's only reader is unmounted' to 'both consuming components are unreachable': grep for BackgroundTasksPanel|BackgroundTaskIndicator outside their own directory returns nothing — no nav entry, no panel-switch case, no toolbar mount anywhere. Whether the backing useBackgroundTasks/agentStore store still has a live producer was not verified. Decision guidance: if no producer remains, delete the whole vertical; if one does, record it as a half-wired feature in PLAN.md/known-flaws.md per repo policy rather than leaving it as silent dead UI. Explicitly distinct from DESK-66 (the Rust BackgroundAgentManager), which is a different subsystem.

**Done when.** Mount BackgroundTasksPanel or delete the listener and the store slice it feeds.

**Where.** `apps/desktop/src/App.tsx:687-689`, `apps/desktop/src/features/background-tasks/`

**From.** docs/agent-context/known-flaws.md (2026-08-04 orphan inventory, 2026-08-15 addendum); audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

### DESK-38 — Desktop agent/automation templates ship 9 commands, a service and a store with zero consumers and fabricated metrics

`LOW` · desktop · effort M

**What.** Nine registered Tauri template commands, a service and templateStore.ts exist with zero consumers anywhere in apps/desktop/src. The templates also carry fabricated performance metrics, which is separately tracked as a fabricated-metrics documentation defect.

**Done when.** Mount a templates surface or delete the commands, service and store; remove the fabricated metrics either way.

**Where.** `apps/desktop/src-tauri/src/lib.rs:2095-2102`, `apps/desktop/src/stores/templateStore.ts`

**From.** docs/agent-context/phase4-capability-audit.md (PP-14); AuditRemediationLedger.md (PP-14, DOC-005)

**Folded in.** DOC-005: Fabricated metrics remain in template automations and demos

### DESK-44 — Desktop sidebar shows only the first 6 projects with no recency sort, so a 7th project can be invisible

`LOW` · desktop · effort S

**What.** visibleProjects takes the first 6 entries of the array with no recency sort, so a 7th non-archived project would not appear until an older one is archived. Static finding, not empirically reproduced.

**Done when.** Sort projects by recency before slicing, and add an overflow affordance to reach the rest.

**Where.** `apps/desktop/src/features/v3/Sidebar.tsx`

**From.** docs/agent-context/known-flaws.md (DESKTOP-SIDEBAR-PROJECTS-CAP-NO-RECENCY-SORT-01)

### DESK-46 — Desktop maintenance mode is a QA checklist item with no implementation anywhere in the monorepo

`LOW` · desktop · effort M

**What.** The QA checklist item 'Maintenance mode' has no implementation anywhere in the monorepo. Not-implemented gap, not a regression.

**Done when.** Implement maintenance mode or remove it from the QA checklist.

**From.** docs/agent-context/known-flaws.md (DESKTOP-MAINTENANCE-MODE-NOT-IMPLEMENTED-01)

### DESK-47 — Desktop accessibility: icon-only buttons lack aria-labels, and no automated a11y coverage exists for the surface

`LOW` · desktop · effort M · **in-progress**

**What.** ArtifactToolbar's three icon-only buttons were fixed with aria-labels, but the broader pattern across apps/desktop/src/features was flagged and never exhaustively counted or fixed. The axe/Playwright suite covers 5 web routes only and is gated on web_changed in CI, so desktop, mobile and CLI have no automated accessibility coverage at all, and only two reduced-motion assertions exist repo-wide. There is also no contrast slider on themes and no diff-marker style setting for colour-blind users.

**Done when.** Sweep apps/desktop/src/features for icon-only buttons without accessible names, add a desktop axe/E2E accessibility lane, and add contrast and diff-marker style controls.

**Where.** `apps/desktop/src/features/artifacts/ArtifactToolbar.tsx`, `apps/web/scripts/a11y-audit.mjs:22-28`

**From.** docs/agent-context/known-flaws.md (DESKTOP-ICON-BUTTON-ARIA-LABEL-GAP-01); docs/agent-context/phase4-capability-audit.md (PP-32); audit/ui-gaps.md (GAP-214, GAP-323)

**Folded in.** Accessibility automated coverage exists only for 5 web routes; none for desktop; GAP-214: No contrast slider on themes; GAP-323: No diff-marker style setting (Color vs +/-) for colour-blind users

### DESK-48 — Desktop reasoning-trace code blocks are unstyled because the shared renderer's CSS classes live only in the web stylesheet

`LOW` · desktop · effort S

**What.** The shared MarkdownContent emits .code-block-container / .code-block-header-bar / .code-block-body classes, but those classes are defined only in apps/web/app/globals.css; desktop's globals.css defines a different, unused legacy class set — so desktop code blocks get no overflow-x-auto and no header or copy chrome.

**Done when.** Move the code-block styles into the shared UI package so both hosts inherit them, and delete the unused legacy desktop classes.

**Where.** `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:45-67`, `apps/web/app/globals.css:1013-1035`

**From.** docs/agent-context/phase4-capability-audit.md (PP-32)

### DESK-49 — Desktop uses standard OS window decorations; an orphaned TitleBar.tsx exists but is never mounted

`LOW` · desktop · effort M

**What.** tauri.conf.json sets decorations:true so desktop shows the standard OS title strip instead of a content-integrated header; features/layout/TitleBar.tsx exists but is orphaned. Deferred as a higher-risk window-chrome change. Related: no back/forward history navigation in the title bar.

**Done when.** Decide on custom window chrome; either mount TitleBar with decorations:false or delete the orphan.

**Where.** `apps/desktop/src/features/layout/TitleBar.tsx`, `apps/desktop/src-tauri/tauri.conf.json`

**From.** docs/agent-context/known-flaws.md (UIDESK-NATIVE-WINDOW-DECORATIONS); audit/ui-gaps.md (GAP-335)

**Folded in.** GAP-335: No back/forward history navigation in the desktop title bar

### DESK-51 — Desktop mobile-companion pairing is single-session and ephemeral by design; every multi-device and roster capability is declined

`LOW` · desktop · effort XL · **wontfix**

**What.** Desktop and Mobile connection stores keep singleton signaling/peer/data-channel/session-key state and clear session authority on disconnect, so there is no paired-device roster, no reusable multi-Desktop pairing, no post-pairing setup toggles, no remote-control master switch, no trusted multi-device history, and no computer-off cross-device pickup. Recorded as explicit decisions so they are not re-raised as defects. Any future durable remote-control product (CAP-049 desktop dispatch and scheduled routines, founder-approved 2026-08-05) must first supply paired-device identity, revocable grants, E2E-encrypted signaling, host consent, command policy, an audit trail and offline/reconnect handling.

**Done when.** No action unless the durable remote-worker/host-relay product is committed; if so, treat this cluster as its requirements list.

**Where.** `apps/desktop/src/stores/connectionStore.ts`, `apps/desktop/src/features/mobile-companion/MobileCompanionPanel.tsx`

**From.** audit/ui-gaps.md (GAP-026, GAP-027, GAP-040, GAP-049, GAP-063, GAP-080, GAP-081, GAP-096, GAP-097, GAP-211, GAP-219); audit/capability-gaps.csv (CAP-049); docs/current/gap-audit-2026-08-08.md (P2-004)

**Folded in.** GAP-049: Post-pairing setup toggles declined; GAP-040: Reusable multi-Desktop pairing declined; GAP-063: Computer-off cross-device pickup declined; GAP-080: Trusted multi-device history declined; GAP-081: Remote-control master switch declined; GAP-096/097: Connections limited to inbound ephemeral pairing; GAP-219: No paired-device list, empty state or refresh; CAP-049: Desktop dispatch and scheduled routines product; P2-004: Remote developer/control workflows are incomplete

### DESK-52 — Desktop AGI Code settings, worktrees, PR inbox and diff theming are declined because no runtime owns them

`LOW` · desktop · effort XL · **wontfix**

**What.** AgiCode/index.tsx mounts only InstructionFilesSettings. There is no AGI Code worktree allocator or worktree-location consumer, no in-app coding browser session or cookie jar, no coding-device token list/revoke API, no diff renderer reading an AGI Code theme or font setting, no PR inbox (features/git owns local status/diff/commit/push/pull only), and no session-state classification or flagged-message model switching. A 'worktrees' capability flag is nonetheless advertised by the VS Code local-runtime client, which is itself a false-availability signal.

Also recorded by a later audit (Desktop Code mode / AGI Code — dashboard, PRs, routines, terminal/actions remain absent (parity matrix)): Contradicts DESK-52's 'wontfix / declined because no runtime owns them': the parity matrix records CodeWorkspace (file tree, Monaco tabs, diff viewer) as mounted and Local-only, with dashboard, PRs, routines and terminal/actions still absent — and CAP-049 (the Desktop dispatch/scheduled-routines product the /agi-work marketing page advertises) is recorded as founder-approved to build, blocked on the host-relay/remote-control contract (see DESK-99). The wontfix status should be re-examined against CAP-049.

**Done when.** No action unless an AGI Code session runtime is committed; if so, build session ownership first and only then expose these settings — and correct the advertised worktrees capability flag meanwhile.

**Where.** `apps/desktop/src/features/settings/tabs/AgiCode/index.tsx`, `apps/extension-vscode/src/integrations/localRuntimeClient.ts:54`

**From.** audit/ui-gaps.md (GAP-052, GAP-053, GAP-054, GAP-055, GAP-067, GAP-098, GAP-196, GAP-197, GAP-250); audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** GAP-052: AGI Code transcript and session toggles declined; GAP-053: Per-device coding authorization-token management declined; GAP-054: Separate AGI Code diff themes and font declined; GAP-055: AGI Code worktree and browser-tool settings declined; GAP-067: Desktop pull-request inbox declined; GAP-098: Agent Git policy settings declined; GAP-196/197: No classify-session-states, iOS Simulator or PR-automation settings; GAP-250: No worktree management despite a declared capability

### DESK-53 — Desktop native lifecycle toggles (startup, keep-awake, menu-bar, prevent-sleep) are declined because no native owner exists

`LOW` · desktop · effort M · **wontfix**

**What.** GeneralSettings and the native command inventory contain no verified run-on-startup, keep-awake, power-assertion or menu-bar-visibility transaction, and no acknowledged close-window lifecycle preference. Recorded as declined so these are not re-raised as missing settings.

**Done when.** Implement the native power/tray/startup commands before exposing any of these toggles.

**Where.** `apps/desktop/src/features/settings/tabs/General/index.tsx`

**From.** audit/ui-gaps.md (GAP-082, GAP-084, GAP-085, GAP-220, GAP-221, GAP-240)

**Folded in.** GAP-082: Startup, global voice, menu-bar and keep-awake toggles declined; GAP-084: Prevent-sleep declined until native power assertions exist; GAP-085: Menu-bar persistence declined; GAP-220/221/240: 'keep this computer awake' settings absent

### DESK-54 — Desktop lifecycle hooks, tool-runtime self-repair, MFA gate, session inventory and account deletion are declined without backing APIs

`LOW` · desktop · effort L · **wontfix**

**What.** The former hooks store is recorded as deleted dead code and no PreToolUse/PostToolUse hook resolver runtime exists. There is no generic tool-runtime health-check or reinstall command surface, no verified MFA status or step-up token in the desktop auth/account contracts, no authenticated session inventory or revoke-by-session action, and no organization-ID surface or account-deletion/logout-all mutation reachable from desktop.

**Done when.** No action unless the corresponding account/runtime APIs are built; treat this as the prerequisite list if they are.

**Where.** `apps/desktop/src/features/settings`

**From.** audit/ui-gaps.md (GAP-073, GAP-074, GAP-079, GAP-099, GAP-105)

**Folded in.** GAP-099: Lifecycle hooks declined until a sandboxed hook runtime exists; GAP-079: Local tool-runtime self-repair declined; GAP-105: MFA gate declined until the account service publishes verified MFA state; GAP-074: Cross-surface Active Sessions declined; GAP-073: Organization ID, in-app account deletion and logout-all declined

### DESK-57 — Desktop usage dashboard, profile and settings surface parity gaps

`LOW` · desktop · effort M

**What.** UsageDashboard has only Current session / Model limits / Cost tracking — no streaks, active days, peak hour, favourite model or activity heatmap, and no 'Usage limit resets' section with an empty state (only an inline 'Resets in …'). There is no desktop Profile page at all. Settings search now indexes real controls (settingsSearchIndex.ts) but on-disk asset paths are still shown as inert text with no Open-folder action, the language selector has no Auto-detect option, and personalization settings carry no warning that some models ignore them. Theme preview is trapped in a dialog with no translucency or per-theme font, and there are no 'Shared chats'/'Shared artifacts' rows in Privacy settings.

**Done when.** Add the missing usage aggregates and reset section, decide whether desktop gets a Profile page, and add Open-folder actions, Auto-detect language, a model-capability warning and shared-content management rows.

**Where.** `apps/desktop/src/features/settings/UsageDashboard.tsx`, `apps/desktop/src/features/settings/DotfileSettings.tsx`, `apps/desktop/src/features/settings/CustomAgentsList.tsx:276-287`

**From.** audit/ui-gaps.md (GAP-198, GAP-218, GAP-228, GAP-229, GAP-230, GAP-231, GAP-324, GAP-325, GAP-332)

**Folded in.** GAP-198: Usage dashboard has no streaks/active-days/heatmap; GAP-218: No scope selector or open-file link for the agent config; GAP-229: On-disk asset paths shown as inert text with no Open folder action; GAP-231: Desktop has no Profile page; GAP-325: Language selector has no Auto-detect option; GAP-228: No warning that personality settings are ignored by some models; GAP-230: No 'Shared chats'/'Shared artifacts' rows in Privacy settings; GAP-324: Theme preview trapped in dialog; no translucency or per-theme font; GAP-332: No 'Usage limit resets' section

### DESK-59 — Desktop misc surface gaps: screen-capture settings, quick-query hotkey, list-panel triple states, licenses view, trace recording

`LOW` · desktop · effort M

**What.** ScreenCaptureButton exposes 'Screen capture' and 'Capture Window' with no settings for hotkey, destination, sound or an offscreen-text notice. The quick-query overlay hotkey is hardcoded in features/quick-query/index.tsx and absent from settings. AgiWorkProjects/Artifacts/Scheduled render a single loading-or-empty state with no partial-failure state and no in-list search field. There is no open-source-licenses / third-party-notices view anywhere in the desktop app, and no start/stop trace-recording action for a diagnostic bundle. Scheduler starter templates are declined until Local and Cloud share a typed template contract. The sidebar footer has no help entry point and the sidebar toggle tooltip omits its shortcut. There is also no per-project Environments screen.

**Done when.** Add the missing settings and views incrementally; adopt a shared partial-failure/empty/unselected pattern for list panels and add in-list search.

**Where.** `apps/desktop/src/features/screen-capture/ScreenCaptureButton.tsx:199-220`, `apps/desktop/src/features/quick-query/index.tsx:4-6`, `apps/desktop/src/features/v3/AgiWorkScheduled.tsx:78-90`

**From.** audit/ui-gaps.md (GAP-072, GAP-202, GAP-203, GAP-208, GAP-213, GAP-223, GAP-224, GAP-236, GAP-241, GAP-331, GAP-333, GAP-334)

**Folded in.** GAP-236: No screen-capture settings; GAP-224: Quick-query overlay hotkey hardcoded and absent from settings; GAP-208: Adopt the partial-failure + empty + unselected triple-state pattern; GAP-213: List destinations lack an in-list search field; GAP-223: No open-source licenses view; GAP-331: No start/stop trace recording action; GAP-072: Scheduler starter templates declined until Local and Cloud share a typed contract; GAP-333/334: Sidebar footer has no help entry point; toggle tooltip omits its shortcut; GAP-202/203: No Context empty state; no compact Progress/Outputs rail; GAP-241: No per-project Environments screen

### DESK-61 — Desktop InlineArtifactEditor duplicates the existing Monaco/Canvas editor integration

`LOW` · desktop · effort M

**What.** Monaco is already a full LSP-backed editor used by the separate Canvas system; the Artifacts feature ships its own inline editor. Recorded as deliberate and tracked for possible future consolidation, not urgent.

**Done when.** Consolidate onto one editor when Artifacts and Canvas next converge; no action before then.

**Where.** `apps/desktop/src/features/artifacts/InlineArtifactEditor.tsx`, `apps/desktop/src/features/editor/MonacoEditor.tsx`

**From.** docs/agent-context/known-flaws.md (DESKTOP-ARTIFACT-EDITOR-VS-MONACO-01)

### DESK-78 — Orphaned legacy memory-browser component family on desktop — 5 dead files exported from a barrel but mounted nowhere

`LOW` · desktop · effort S

**What.** MEMORY-009: MemoryViewer.tsx, MemoryBrowserModal.tsx, MemoryImportanceIndicator.tsx, MemoryBadge.tsx and SaveToMemoryButton.tsx are exported from the feature barrel but mounted nowhere. The team's own comment in Memory.tsx documents that MemoryBrowserModal's sole caller 'was never mounted — so a user could not get their memories out of the device at all' and worked around it with a direct Export button instead of fixing the orphaned modal.

**Done when.** Delete the five orphaned components and their barrel exports, or mount MemoryViewer/MemoryBrowserModal from a real entry point with a regression test asserting it renders.

**Where.** `apps/desktop/src/features/memory/index.ts`, `apps/desktop/src/features/memory/MemoryViewer.tsx`, `apps/desktop/src/features/memory/MemoryBrowserModal.tsx`, `apps/desktop/src/features/settings/tabs/Memory.tsx:180-187`

**From.** audit/parity-2026-08-15 MEMORY-009

### DESK-91 — Desktop legacy 'job-based' scheduler UI (SchedulerPanel, JobCreationDialog) is dead code self-labelled as backwards compatibility

`LOW` · desktop · effort S

**What.** duplication/tasks-schedules.md Finding 2: scheduler/index.ts self-labels this half of the directory 'Legacy job-based system (kept for backwards compatibility)'; there are zero live importers of SchedulerPanel/JobCreationDialog or the barrel anywhere in the app. Whether the corresponding Rust-side scheduler\_\*\_job Tauri IPC commands are also dead was not verified in that pass.

**Done when.** Delete SchedulerPanel.tsx, JobCreationDialog.tsx and useScheduler once confirmed no #[tauri::command] exists solely for their benefit.

**Where.** `apps/desktop/src/features/scheduler/SchedulerPanel.tsx`, `apps/desktop/src/features/scheduler/JobCreationDialog.tsx`

**From.** audit/competitive-gap-2026-08-15 duplication/tasks-schedules.md Finding 2

### DESK-92 — Desktop ArtifactsGallery.tsx (580 lines) and ArtifactCategoryFilter are dead but still compile into the shipped bundle

`LOW` · desktop · effort S

**What.** duplication/components.md §3: grep for <ArtifactsGallery> JSX and for the exporting barrel path both return zero results outside the file itself; superseded by AgiWorkArtifacts.tsx (mounted at DesktopShellV3.tsx:854). Unlike apps/desktop/archive/ it is NOT in the vite.config.ts-excluded directory, so it still ships in the app bundle while rendering nowhere. Its sole consumer ArtifactCategoryFilter.tsx is dead for the same reason.

**Done when.** Delete both files, or move them into archive/ (already build-excluded) if kept for reference.

**Where.** `apps/desktop/src/features/artifacts/ArtifactsGallery.tsx`, `apps/desktop/src/features/artifacts/ArtifactCategoryFilter.tsx`

**From.** audit/competitive-gap-2026-08-15 duplication/components.md §3; audit/competitive-gap-2026-08-15/duplication/components.md §3; all-axes.json#components[2]

**Folded in.** Desktop ArtifactsGallery.tsx (580 lines) and ArtifactCategoryFilter are dead but still compiled into the app bundle

### SEC-82 — voice_inject_text Tauri command stays registered and invokable with its documented safety precondition unmet, protected only by 'nothing currently calls it'

`LOW` · security · effort S

**What.** VOICE-MEDIA-012 (audit/parity-2026-08-15). The command's own doc comment states it must not be wired into an automatic dictation flow until target-pinning, secure-field refusal and clipboard-transaction work lands — that work has not landed. It is currently unreachable (zero callers; the one theoretical path is refused because system_dictation_available() is hardcoded false), but any future code can call it without redoing the safety work. Note: an earlier headline audit deliverable (CurrentProductInventory.md:251) asserted this was live and 'injects into password fields'; that claim was refuted in the same round and is stale.

**Done when.** Gate voice_inject_text itself behind system_dictation_available() so it errors immediately when false, rather than relying on the absence of callers as the only protection.

**Where.** `apps/desktop/src/stores/settings/voice.ts:744-751`, `apps/desktop/src/api/voice.ts:436-441`

**From.** audit/parity-2026-08-15/gaps/domain-voice-media (VOICE-MEDIA-012)
