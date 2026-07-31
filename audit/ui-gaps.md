# agiworkforce UI/UX gap tracker

<!-- ui-gaps-csv-sha256: 545aadc3581ee768a7f05e8d845787be80bf3b761ba54433539add46fcf0fe36 -->

> Canonical comparison tracker normalized from the ChatGPT, Codex, and Claude UI/UX audit.
> `audit/ui-gaps.csv` is the source of truth; this document is generated with
> `pnpm generate:ui-gaps`. The imported audit is a pre-remediation baseline, so
> evidence must be revalidated against current code before a status is changed.

GAP-005 was an independent duplicate report of GAP-004 and is preserved on that
record through `mergedFrom`, combined evidence, and both reference screenshots.

## Tracker rules

- `Open`, `In Progress`, `Blocked`, and `Deferred` are unresolved.
- `Done` requires current-code verification; `Not Planned` requires an explicit product decision.
- P0/P1 unresolved counts may only decrease relative to the target branch.
- `Unassigned` is explicit debt; replace it with a real owner when work is scheduled.
- Do not add unsupported settings toggles, regulated health features, or private provider-cost data for visual parity.

## Current snapshot

- 341 normalized gaps: 11 P0, 126 P1, 161 P2, 43 P3.
- Unresolved: 0 P0, 0 P1, 154 P2, 43 P3.

| Surface          | Gaps |
| ---------------- | ---: |
| mobile           |  114 |
| desktop          |  142 |
| web              |   43 |
| extension        |    5 |
| extension-vscode |   37 |

| Status      | Gaps |
| ----------- | ---: |
| Open        |  197 |
| In Progress |    0 |
| Blocked     |    0 |
| Deferred    |    0 |
| Done        |   71 |
| Not Planned |   73 |

## P0

### GAP-001 — Mobile exposes a supported Managed Cloud Skills catalog

- **Status:** Done
- **Owner:** Mobile
- **Surface/type:** mobile · missing-screen
- **Reference:** ChatGPT · iOS · Skills list (empty state)

**Gap**

The reference gives Skills a first-class screen with navigation, search, source context, and a useful empty state. agiworkforce Mobile now exposes the authenticated deployment catalog as an explicitly read-only Managed Cloud surface. It never presents host installation controls that Mobile cannot support and never calls the Cloud catalog from Local Mode.

**Evidence**

apps/mobile/src/features/skills/service.ts validates the authenticated /api/skills metadata contract. SkillsScreen.tsx enforces Clerk sign-in and Cloud mode before fetching, renders search, source badges, loading/error/refresh states, and a teaching empty state. app/(app)/skills/index.tsx and the authenticated drawer layout register the route; DrawerContent.tsx exposes the Cloud-tagged destination. skills-service.test.ts, skills-page.test.tsx, drawer-content.test.tsx, and drawer-route-contract.test.ts cover the contract, Local no-egress gate, navigation, search, empty/error states, and route ownership.

**Suggested fix**

Completed for the supported read-only Managed Cloud catalog. Keep Mobile installation and mutation controls absent until a separate owner-scoped backend lifecycle exists; retain the explicit Local/Cloud boundary and runtime response validation when the catalog contract evolves.

**Reference screenshot(s)**

- `chatgpt_reference/072-chatgpt-ios-skills-empty-state-search-bar-no-skills.png`

### GAP-002 — Desktop requires task-scoped consent before local tools access new folders

- **Status:** Done
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · macOS desktop · Cowork folder access consent modal

**Gap**

The Desktop tool executor now stops every recognized local path-bearing tool before it can cross the Allowed Directories boundary. A native-authoritative consent request lists the exact canonical targets, grant roots, and read, modify, or execute capabilities. Access is limited to the active chat task by default; only the unchecked Remember option persists the roots in Settings.

**Evidence**

apps/desktop/src-tauri/src/core/llm/tool_executor/mod.rs performs path extraction, canonical resolution, protected-path rejection, explicit consent, and post-approval enforcement revalidation before dispatch. tool_confirmation.rs keeps the native request authoritative, manages task-only and persisted grants, and synchronizes ToolGuard plus the live filesystem MCP server; App.tsx revokes task grants on new-chat and conversation changes. FolderAccessConsentDialog.tsx is mounted by McpToolConfirmationPrompt.tsx with Cancel autofocus, exact targets and roots, capability disclosure, and an unchecked persistent-grant option. GAP-002-folder-access-consent.test.tsx, agentWorkflowEvents.test.ts, and the named gap_002, folder_request, session_folder_grants, and empty_allowed_paths_update Rust tests cover the contract and enforcement seams.

**Suggested fix**

Completed. Keep every new local path-bearing tool on this native authorization boundary, never trust renderer-supplied paths or tool names, revoke task-only grants when the active chat changes, and persist roots only after the explicit Remember option succeeds natively.

**Reference screenshot(s)**

- `claude_reference/102-claude-desktop-cowork-agent-task-view-folder-access-modal.png`

### GAP-003 — Desktop keeps workflow capture controls visible in a detached recorder HUD

- **Status:** Done
- **Owner:** Desktop
- **Surface/type:** desktop · missing-screen
- **Reference:** Claude · macOS desktop · Cowork skill recording — active capture HUD

**Gap**

Desktop now opens a fixed, transparent, always-on-top recorder window as soon as native workflow capture starts. The compact HUD remains visible over other applications with authoritative elapsed time and step count, local narration state and input level, Discard, Done, and a temporary global stop shortcut. The main recorder panel remains the review and skill-creation surface, including recovery when the panel remounts after capture.

**Evidence**

apps/desktop/src/services/recorderHudWindow.ts creates and positions the recorder-hud WebviewWindow with decorations disabled, transparency, always-on-top, fixed bounds, taskbar exclusion, and CommandOrControl+Shift+. registration. RecorderHud.tsx consumes native status/action/lifecycle events and exposes live count, timer, a default-off local Whisper narration control with a 24-bar meter, true Discard, and Done. recorder.rs owns status, discard, completed-recording recovery, and timestamped narration actions; ActionRecorder.tsx synchronizes those native lifecycle events into the main review flow. recorder-hud.json grants only event listening and self-close permissions. RecorderHud.test.tsx, useRecorderNarration.test.ts, recorderHudWindow.test.ts, ActionRecorder.test.tsx, and recorder.rs tests cover the UI, audio, window, shortcut, recovery, and native lifecycle contracts.

**Suggested fix**

Completed. Keep native recorder state authoritative, fail capture closed if the HUD or temporary stop shortcut cannot open, and retain the minimal recorder-hud capability. The narrower persisted narration-track and nearest-step attachment lifecycle remains tracked separately in GAP-060.

**Reference screenshot(s)**

- `references-2/claude-desktop-cowork-record-skill-04-active-capture-zero-steps.png`

### GAP-004 — Desktop Connections exposes the supported mobile-control pairing workflow

- **Status:** Done
- **Owner:** Desktop
- **Surface/type:** desktop · missing-screen
- **Reference:** Codex · macOS desktop · Settings > Connections
- **Merged from:** GAP-005

**Gap**

The reference dedicates a Connections settings page to remote-control management. agiworkforce now has a canonical, searchable Connections destination in the mounted Desktop Settings panel. It exposes the product's supported contract—pairing the mobile app to monitor this Mac and respond to agent approvals—without presenting unimplemented outbound-device or SSH controls.

**Evidence**

packages/ui/ui/src/settings-nav.ts registers Connections in the shared Desktop settings navigation. apps/desktop/src/features/settings/tabs/Connections/index.tsx mounts the production MobileCompanionPanel, whose QRPairingCard and RemoteApprovalCard use the authenticated signaling/WebRTC connectionStore and live tool approval state. SettingsPanel.tsx renders the tab; the duplicate features/experimental/MobileCompanionPanel.tsx is removed. GAP-004-connections-settings.test.tsx and SettingsPanel.render.test.tsx verify the nav, mounted panel, and single implementation owner.

Independent duplicate evidence (GAP-005): Duplicate GAP-005 is closed by the same canonical Connections nav entry, mounted ConnectionsTab, production MobileCompanionPanel, and removal of the experimental duplicate recorded in GAP-004.

**Suggested fix**

Completed for the supported control-this-Mac workflow. Add outbound device control or SSH tabs only after those runtimes have real lifecycle, persistence, and revocation contracts; keep the remaining multi-device management work tracked in GAP-096.

Independent duplicate recommendation (GAP-005): Duplicate disposition complete; retain GAP-004 as the canonical P0 record and GAP-096 for the narrower remaining multi-device scope.

**Reference screenshot(s)**

- `chatgpt_reference/053-codex-macos-settings-connections-control-this-mac-devices.png`
- `chatgpt_reference/032-codex-macos-settings-connections-control-this-mac-allow-toggle.png`

### GAP-006 — Cowork Dispatch has an authenticated task lifecycle and authoritative settings

- **Status:** Done
- **Owner:** Desktop
- **Surface/type:** desktop · missing-screen
- **Reference:** Claude · macOS desktop · Settings > Cowork (Dispatch, Cowork files, trusted folders, run-in-cloud, global instructions)

**Gap**

Desktop now has a searchable Cowork settings destination whose persisted, default-off Dispatch switch is the execution authority for new tasks from a paired phone. Mobile can compose and cancel a new Desktop task; the signed, versioned contract returns accepted, queued, running, review, completed, failed, cancelled, or rejected state. The same authenticated channel answers agent refreshes with current Desktop task snapshots. Unsupported storage-location, trusted-folder, cloud-run, and global-instruction controls remain absent because no matching runtime consumer exists.

**Evidence**

packages/contracts/types/src/cross-device.ts defines dispatch.task.create, dispatch.task.cancel, and dispatch.task.status. apps/desktop/src/services/coworkDispatch.ts validates bounded payloads, gates creation through coworkDispatchStore, submits to the production agentTaskStore, mirrors lifecycle and agent snapshots, and permits cancellation after Dispatch is disabled. App.tsx owns the runtime listener. packages/ui/ui/src/settings-nav.ts and both Local and Cloud Desktop settings render tabs/Cowork with the persisted authority switch and live pairing state. apps/mobile/services/companion.ts, dispatchTaskStore.ts, DispatchTaskComposer.tsx, and the enabled companion flags provide the paired Mobile create/cancel/status UI. coworkDispatch.test.ts, CoworkTab.test.tsx, dispatch-defense.test.ts, and wave1-control-relay.test.ts cover validation, default-deny, execution, status, cancellation, navigation, and Mobile transport.

**Suggested fix**

Completed for paired-device local Desktop execution. Keep Dispatch default-off and HMAC-authenticated, preserve bounded versioned payload validation and cancellation while disabled, and add storage, trusted folders, cloud execution, or global instructions only when those settings have authoritative runtime consumers.

**Reference screenshot(s)**

- `claude_reference/153-claude-desktop-settings-cowork-dispatch-files.png`

### GAP-007 — Archived chats are recoverable from the mounted Desktop sidebar

- **Status:** Done
- **Owner:** Desktop
- **Surface/type:** desktop · missing-screen
- **Reference:** ChatGPT · macOS desktop · Settings > General — Archived chats nav

**Gap**

The reference exposes Archived chats as a recoverable destination. The mounted Desktop V3 sidebar now provides an Archived chats view with a visible count, time-grouped archived records, a return-to-active control, and an empty state. Archived chats can be opened, restored, or permanently deleted through the existing persistent chat-store actions.

**Evidence**

apps/desktop/src/features/v3/Sidebar.tsx switches the live conversation list between active and archived records and passes restoreConversation into each archived row. ConversationRow.tsx replaces active-only actions with Restore and a two-step Delete permanently action for archived records. GAP-007-archived-chats.test.tsx verifies active/archived filtering, opening, restore dispatch, and confirmed permanent delete.

**Suggested fix**

Completed. Keep archive, restore, and permanent deletion on the existing chat-store persistence boundary, and preserve the named GAP-007 interaction test when the sidebar information architecture changes.

**Reference screenshot(s)**

- `chatgpt_reference/091-chatgpt-macos-settings-general-permissions-full-access-defaults.png`

### GAP-008 — Full-access sandbox selection requires confirmation and complete risk disclosure

- **Status:** Done
- **Owner:** Desktop
- **Surface/type:** desktop · missing-copy
- **Reference:** ChatGPT · macOS desktop · Settings > General — Permissions

**Gap**

The reference explains each permission tier and requires a deliberate confirmation before full access. agiworkforce now preserves the existing tier descriptions and gates every supported transition to unsandboxed terminal execution: turning the sandbox off, choosing the Disabled runtime backend, or selecting Danger full access. None of those settings persist until the user explicitly confirms.

**Evidence**

apps/desktop/src/features/settings/AgentExecutionSettings.tsx intercepts all three unsandboxed transitions and presents a cancelable danger dialog before mutating settings. The dialog names loss of workspace and network-domain restrictions, access outside the workspace through the app's OS account, prompt-injection, data-loss, and sensitive-data exposure risks. It also states accurately that disabling the process sandbox does not bypass separate agent approvals or expand OS permissions. AgentExecutionSettings.test.tsx verifies delayed persistence, cancellation, and the equivalent Disabled-backend path.

**Suggested fix**

Completed. Keep every future path to unsandboxed terminal execution behind this shared confirmation boundary, and update the disclosure whenever the actual sandbox or approval contract changes.

**Reference screenshot(s)**

- `chatgpt_reference/091-chatgpt-macos-settings-general-permissions-full-access-defaults.png`

### GAP-009 — Desktop memory controls enforce one Local and Managed Cloud privacy policy

- **Status:** Done
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings > Personalization — Memory

**Gap**

The mounted Desktop Memory tab now exposes the reference control set: an authoritative master switch, a separately gated tool-assisted-generation opt-in, and confirmed destructive reset. The same policy drives Local native memory and Managed Cloud account memory; turning it off blocks automatic retrieval and generation while leaving manual review, edit, and deletion available.

**Evidence**

apps/desktop/src/features/settings/tabs/Memory.tsx mounts the master, tool-assisted scope, reset, native SQLite adapter, and Managed Cloud adapter. settingsStore.ts persists one fail-closed policy and managedCloudSettingsSync.ts synchronizes the account-safe capability namespace. Native chat streaming/non-streaming, memory tools, direct project-memory loading, project auto-save, and scheduled summarization enforce the policy; the Web managed-memory request path enforces the same account setting. The two orphan localStorage-only memory panels are removed. GAP-009-memory-controls.test.tsx, settingsStore.test.ts, managedCloudSettingsSync.test.ts, request-processor.memory.test.ts, and the named Rust memory-policy tests cover the mounted controls and enforcement seams.

**Suggested fix**

Completed. Keep automatic retrieval and every generation entry point behind the fail-closed master policy, require explicit opt-in for tool-assisted generation, preserve manual deletion while disabled, and extend the named GAP-009 tests whenever a new memory pipeline is added.

**Reference screenshot(s)**

- `chatgpt_reference/098-codex-macos-settings-personalization-personality-instructions-memory.png`

### GAP-010 — Web exposes authenticated, durable managed Code sessions

- **Status:** Done
- **Owner:** Web
- **Surface/type:** web · missing-screen
- **Reference:** Claude · web · Code onboarding wizard: create cloud environment

**Gap**

The production Web chat sidebar and secondary app shell now expose Chat and Code as first-class destinations. The authenticated Code surface creates tenant-owned, persistent managed environments, optionally clones a public GitHub repository, attaches to a bounded terminal journal, runs commands, and closes sessions explicitly. It remains capability-honest when the E2B cut-over, plan entitlement, or database migration is unavailable and never claims access to local files or credentials.

**Evidence**

apps/web/app/chat/code/page.tsx and features/code/CloudCodePage.tsx provide responsive loading, unavailable, empty, create, attach, running, error, terminal-history, and confirmed-close states. WebChatPage.tsx, WebAppShell.tsx, and the v3 WebSidebar expose the real /chat/code destination. /api/code/sessions and cloud-code-session-service.ts enforce Clerk/RLS ownership, CSRF, user-keyed rate limits, active-plan sandbox ceilings, idempotent creation, atomic command state transitions, bounded output, and strict public GitHub URLs. Migration 0075 forces RLS over the session and terminal journal. The E2B lifecycle isolates Code mappings from conversations, defaults egress off, allowlists GitHub/npm/PyPI for Trusted hosts, requires server-validated acknowledgement for Full network, pauses after each request, meters compute, and supports reclaim. Focused UI/API/service/runtime/migration tests and the full Web suite cover these seams; production build plus authenticated desktop- and mobile-viewport browser passes verify the mounted route and live Chat-to-Code navigation.

**Suggested fix**

Completed for bounded managed terminal sessions. Apply migration 0075 and provision AGI_E2B_EXECUTION=1 plus E2B_API_KEY before enabling creation in a deployment. Keep private-repository credentials, arbitrary secret injection, collaborative PTY streaming, and long-lived service previews out until each has an explicit credential, approval, egress, billing, and revocation contract.

**Reference screenshot(s)**

- `claude_reference/173-claude-web-code-onboarding-wizard-create-cloud-environment.png`

### GAP-011 — 'Bypass permissions' mode is enabled with no consent modal or risk copy

- **Status:** Done
- **Owner:** VS Code
- **Surface/type:** extension-vscode · missing-state
- **Reference:** Codex · VS Code extension · 'Turn on Full Access?' consent modal

**Gap**

The reference gates full-access escalation behind a modal that names filesystem, terminal, network/tool, sensitive-data, and prompt-injection risks and requires an explicit confirmation. agiworkforce now applies the same boundary to every supported VS Code mode mutation path, including command pickers, Shift+Tab cycling, sidebar messages, raw Settings edits, and activation-time reconciliation.

**Evidence**

apps/extension-vscode/src/features/permissions/agentModeConsent.ts is the sole agent.mode write boundary. It persists versioned consent only while bypass remains active, fails unconfirmed bypass closed to Auto, reverts raw settings edits before prompting, and provides explicit Cancel/Confirm actions with scope and risk copy. Config.agentMode and ChatStateManager enforce the consent state at read/dispatch time. agentModeConsent.test.ts covers cancellation, confirmation, raw-setting reconciliation, and consent revocation.

**Suggested fix**

Completed. Keep all future agent-mode mutation paths on setAgentModeWithConsent, retain the raw-setting reconciliation listener, and increment the consent version whenever the granted scope or risk contract changes.

**Reference screenshot(s)**

- `chatgpt_reference/009-codex-vscode-ext-permission-confirm-modal-turn-on-full-access-warning.png`

### GAP-012 — VS Code exposes a branded, complete settings editor

- **Status:** Done
- **Owner:** VS Code
- **Surface/type:** extension-vscode · missing-screen
- **Reference:** Codex · VS Code extension · Settings editor tab — General

**Gap**

The extension now opens a branded AGI Settings editor with the reference information architecture: General, Configuration, Personalization, Usage & billing, MCP servers, Hooks, Plugins, and Account. Every active mutable agiWorkforce option has a described, typed control; deprecated planMode and read-only currentTier are not presented as writable settings. The surface distinguishes local developer sessions from cloud-backed utilities, shows account and tier context, reports workspace overrides, and keeps raw VS Code settings as an explicit escape hatch.

**Evidence**

apps/extension-vscode/src/features/settings/SettingsPanel.ts owns the singleton WebviewPanel, validated host actions, account state, configuration refresh, and fixed external destinations. settingsWebviewContent.ts provides the responsive theme-token UI, complete section navigation, loading/status/error feedback, and labeled controls. settingsProtocol.ts rejects malformed keys, values, commands, URLs, and numeric ranges. platform/config.ts exposes the full active setting manifest and one typed user-scope write boundary; agent.mode still routes through setAgentModeWithConsent. commandSetup.ts, ChatStateManager.ts, desktopBridge.ts, package commands, and the sidebar title action route normal settings entry points to the branded panel. GAP-012-settings-panel.test.ts, GAP-012-settings-webview.webview.test.ts, settingsProtocol.test.ts, configDefaults.test.ts, and commandParity.test.ts cover singleton hosting, CSP, interaction, protocol validation, option completeness, registration, raw-settings escape, and bypass cancellation. Desktop and compact browser QA passed with no overflow, console errors, duplicate IDs, unnamed buttons, or unlabeled inputs.

**Suggested fix**

Completed. Keep SETTINGS_PANEL_SETTING_KEYS in parity with every non-deprecated mutable package contribution, keep webview messages runtime-validated, and route future privileged settings through their enforcement or consent boundary. Hooks and a VS Code plugin registry remain capability-honest empty states until their local runtimes exist; per-server MCP management remains tracked in the P1 extensibility epic.

**Reference screenshot(s)**

- `chatgpt_reference/014-codex-vscode-ext-settings-general-language-speed-composer.png`

## P1

### GAP-013 — Mobile exposes an actionable and account-safe change-email handoff

- **Status:** Done
- **Owner:** Mobile
- **Surface/type:** mobile · missing-screen
- **Reference:** ChatGPT · iOS · Account > Change email confirm dialog

**Gap**

The Mobile Cloud Account screen now presents Email as a first-class settings row. Tapping it names the current address in a cancelable confirmation and Continue opens the authenticated Web account settings. The captured Cloud account epoch is revalidated before opening the handoff, so a stale confirmation cannot act after an account switch.

**Evidence**

apps/mobile/src/features/settings/cloud-account/index.tsx mounts the Email SettingsRow and Change your email Alert with Cancel and Continue, then revalidates captureVisibleAccount before calling openExternalUrl for /settings/account. cloud-account-owner-switch.test.tsx verifies the current-address copy and Web handoff.

**Suggested fix**

Completed. Keep the captured-account revalidation on the handoff and replace the Web destination only when Mobile owns a complete verify-new-address lifecycle.

**Reference screenshot(s)**

- `chatgpt_reference/069-chatgpt-ios-settings-account-modal-change-email-confirm.png`

### GAP-014 — Restore purchases reports every terminal outcome and offers retry

- **Status:** Done
- **Owner:** Mobile
- **Surface/type:** mobile · missing-state
- **Reference:** ChatGPT · iOS · Billing > Restore purchases result

**Gap**

Restore purchases now returns a typed terminal outcome instead of silently reverting the row label. Mobile shows a named restored-plan alert, an Apple ID or Google Play no-purchases alert, or a failure alert with a real retry action while retaining the existing inline error as persistent fallback.

**Evidence**

apps/mobile/src/features/billing/useIapPurchaseFlow.ts returns restored, none, failed, or account-changed outcomes after store reconciliation and server verification. apps/mobile/src/features/settings/cloud-billing/index.tsx renders platform-aware Alerts and retries the restore operation. use-iap-purchase-flow.test.tsx and cloud-billing-page.test.tsx cover restored tiers, zero purchases, failure, and retry.

**Suggested fix**

Completed. Keep server verification authoritative before reporting restoration success and preserve explicit no-result and retry states when the native IAP library changes.

**Reference screenshot(s)**

- `chatgpt_reference/071-chatgpt-ios-settings-billing-modal-restore-purchases-ok-only.png`

### GAP-015 — Mobile prevents cross-platform duplicate subscription purchases

- **Status:** Done
- **Owner:** Mobile
- **Surface/type:** mobile · missing-state
- **Reference:** ChatGPT · iOS · Billing > cross-platform subscription block

**Gap**

The entitlement response now names the server-authoritative subscription owner as none, Stripe, Apple, Google, or manual. Mobile persists that owner and fails closed before native purchase or plan-change entry points whenever an entitled subscription does not belong to the current device store. The blocking dialog names the management surface, explains the double-charge risk, and links to Web, App Store, or Google Play management when available.

**Evidence**

packages/contracts/cloud-contracts/src/me.ts and apps/web/app/api/me/route.ts define and emit plan.subscription_source from persisted billing identifiers. apps/mobile/src/features/billing/store.ts persists the owner; subscriptionSource.ts centralizes current-store comparison, labels, and management links. useIapPurchaseFlow.ts blocks purchase requests as a second enforcement seam, while cloud-billing/index.tsx blocks Upgrade, Adjust plan, and Manage subscription with explicit guidance. safeOpenURL.ts permits the Apple and Google subscription destinations as exact hosts without broadening either domain family. Shared contract, Web route, tier-store, pure guard, safe-URL, purchase-flow, and billing-screen tests cover every source and the duplicate-purchase boundary.

**Suggested fix**

Completed. Keep the source server-authoritative, fail unknown entitled ownership closed, and route every future Mobile purchase entry point through the shared subscription guard in addition to the existing server-side verification conflict check.

**Reference screenshot(s)**

- `chatgpt_reference/070-chatgpt-ios-settings-billing-modal-subscription-external-platform.png`

### GAP-016 — Mobile exposes a dedicated, filterable full Chats history

- **Status:** Done
- **Owner:** Mobile
- **Surface/type:** mobile · missing-screen
- **Reference:** Claude · iOS · Chats list

**Gap**

Mobile now separates the composer-first new-chat surface from a dedicated Chats destination. The full-height screen shows every history-visible conversation in the active Local or Managed Cloud mode, groups it by pinned and recency, provides All, Pinned, and Unread filters, and keeps a floating New chat action visible. The drawer retains a deliberately compact Recents preview and links to the unbounded destination.

**Evidence**

apps/mobile/app/(app)/chats/index.tsx registers the route; ChatsListScreen.tsx owns the mode-scoped unbounded SectionList, recency grouping, filter dialog, search field, empty states, and floating New chat action. DrawerContent.tsx exposes Chats and routes its search affordance to the full screen; the composer copy points users to Chats for history. chats-list-screen.test.tsx verifies ten uncapped rows, filters, search, and creation; drawer-content.test.tsx and drawer-route-contract.test.ts verify discoverability and route ownership.

**Suggested fix**

Completed. Keep the drawer preview compact while preserving the unbounded Chats route, and apply every future history filter after the Local/Managed Cloud execution-mode boundary.

**Reference screenshot(s)**

- `claude_reference/117-claude-ios-chats-list-greeting-and-two-older-chats.png`

### GAP-017 — Mobile explains cross-device continuity when an account first enters Managed Cloud

- **Status:** Done
- **Owner:** Mobile
- **Surface/type:** mobile · missing-screen
- **Reference:** Claude · iOS · Cowork cross-device continuity onboarding

**Gap**

A full-screen continuity sheet now appears once per signed-in Cloud owner when that owner first enters Managed Cloud on the device. It carries the Beta state, a clear cross-device headline, three concrete benefits, a Start a task handoff into the Cloud composer, and a persisted Not now decision. Settings → Capabilities keeps the explanation replayable. The background-work promise explicitly names the existing completion notification route rather than implying that Local Mode runs after the app closes.

**Evidence**

src/features/continuity owns the account-scoped encrypted-MMKV acknowledgement, first-Cloud gate, accessible full-screen explanation, and Managed Cloud composer handoff. app/(app)/continuity/index.tsx registers the route, the authenticated drawer mounts the gate, and settings/capabilities/index.tsx exposes the replay row. continuity-onboarding.test.tsx covers owner isolation, Local and acknowledged suppression, benefits, start/not-now behavior, sign-in fallback, and the task_completed notification contract; capabilities-settings.test.tsx covers replay routing, while cloud-tasks-screen.test.tsx and notification-auth-gate.test.ts cover the real run and notification seams.

**Suggested fix**

Completed. Keep acknowledgement owner-scoped, keep automatic presentation gated on the Managed Cloud trust boundary, and keep any future background-work promise backed by a real server run state and authenticated notification deep link.

**Reference screenshot(s)**

- `references-2/claude-ios-cowork-01-cross-device-continuity-onboarding.png`

### GAP-018 — Mobile global search covers chats, projects, files, Library images, and artifacts

- **Status:** Done
- **Owner:** Mobile
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Global search overlay

**Gap**

The Chats search field names its complete scope and fans out over chat titles and message content, projects, transcript file attachments, generated Library images, and artifact metadata/content. Results render in labeled groups with source badges and route to the exact chat, project, image preview, or artifact preview. The projection uses only stores already authorized for the active Local or Managed Cloud mode; Local queries do not add network egress.

**Evidence**

src/features/search/mobileGlobalSearch.ts owns the pure grouped projection and attachment metadata collector. ChatsListScreen.tsx selects mode-scoped conversations, messages, projects, images, and artifact provenance, rejects stale content-search results from a previous query, and routes typed results. Library and Artifacts route wrappers accept exact result ids; their feature screens revalidate the authorized store projection before opening. mobile-global-search.test.ts, chats-list-screen.test.tsx, library-search-deep-link.test.tsx, search-result-route-handoff.test.tsx, artifacts-code-sessions.test.tsx, and existing chat-view-search tests cover grouping, attachment discovery, mode boundaries, and exact handoffs.

**Suggested fix**

Completed. Keep Local search on device, keep Cloud message search behind the existing authenticated Cloud boundary, and add new searchable domains only through typed authorized projections with exact destinations.

**Reference screenshot(s)**

- `chatgpt_reference/078-chatgpt-ios-search-overlay-empty-prompt-state.png`

### GAP-019 — Inline Mobile approval-policy picker is declined because Mobile is not the policy authority

- **Status:** Not Planned
- **Owner:** Mobile
- **Surface/type:** mobile · missing-ia
- **Reference:** Codex · iOS · Inline approval-mode picker reachable from the composer (Ask for approval / Approve for me / Full access)

**Gap**

The reference controls a session runtime owned by the same Mobile product, but agiworkforce's current surfaces do not share that authority model. The unshipped Mobile Code Sessions shell cited by the audit was removed. Paired Dispatch creates work on Desktop, where the persisted native approval, filesystem, sandbox, and tool-confirmation policies remain authoritative; a Mobile override is absent from the signed dispatch contract. The mounted composer already states that Desktop privacy and approval rules still apply. Adding an inline three-tier picker would therefore be a cosmetic control that could falsely imply Mobile can weaken Desktop safeguards.

**Evidence**

apps/mobile/lib/v1FeatureFlags.ts keeps the legacy Mobile Agents surface disabled while Dispatch uses its separate authenticated contract. apps/mobile/src/features/cloud-bridge/README.md records removal of the unshipped Code Sessions shell. DispatchTaskComposer.tsx tells the user that Desktop privacy and approval rules still apply, and services/companion.ts plus packages/contracts/types/src/cross-device.ts carry no approval-policy override. Desktop coworkDispatch.ts submits the task under Desktop-owned runtime settings and native approval enforcement. The Action approvals route itself falls back to a read-only Ask state while FEATURES.agents is false, covered by auto-approve-settings.test.tsx.

**Suggested fix**

Not planned for the current trust contract. Keep the inline Desktop-authority disclosure and per-action approval responses on Mobile. Reconsider a scoped picker only after the signed cross-device protocol, Desktop executor, persistence, revocation, and adversarial tests all support a task-bound override without weakening the native policy floor.

**Reference screenshot(s)**

- `references-2/IMG_0627.PNG`

### GAP-020 — Mobile Library exposes mode-scoped Documents and attachment reuse

- **Status:** Done
- **Owner:** Mobile
- **Surface/type:** mobile · missing-ia
- **Reference:** ChatGPT · iOS · Library

**Gap**

Mobile Library now segments All / Images / Documents / Artifacts. Documents are projected from attachment metadata already persisted with the authorized Local transcript or current-account Managed Cloud transcript, including file name, MIME type, size, source conversation, URI, and owner-scoped asset id when present. The projection copies no file bytes and creates no cross-account index. Document cards open their exact source chat, and Add to Chat exposes Attach from Library. Reusing a Managed Cloud document forwards its existing asset id without downloading or uploading the bytes again; the completion route revalidates asset ownership server-side.

**Evidence**

apps/mobile/src/features/library/index.tsx implements the Documents filter, metadata cards, mode-scoped transcript projection, and source-chat routing. mobileGlobalSearch.ts provides the shared attachment projection and owner-scoped asset deduplication. AddToChatSheet.tsx exposes Attach from Library; both chat routes wire it into the composer. chatExecutionStore.ts preserves attachment size and asset id and uploads only newly selected device files. library-search-deep-link.test.tsx, add-to-chat.test.tsx, mobile-global-search.test.ts, and chatStore.test.ts cover discovery, mode isolation, re-attachment, deduplication, exact deep links, and no-reupload Cloud reuse.

**Suggested fix**

Completed. Keep attachment discovery derived from the physically separated transcript stores, retain server-side ownership validation for every reused Cloud asset id, and add direct document preview only when a bounded MIME-safe viewer is available.

**Reference screenshot(s)**

- `chatgpt_reference/044-chatgpt-ios-library-upload-promo-upload-once-use-anytime.png`

### GAP-021 — Mobile Library has local search across images documents and artifacts

- **Status:** Done
- **Owner:** Mobile
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Library grid

**Gap**

Library now pins a Search library pill above the grid. It filters the already-authorized in-memory projection across generated-image prompt/source, document name/MIME/source conversation, and artifact title/content/kind/language/source. Results and the query-aware empty state update locally with no API request.

**Evidence**

apps/mobile/src/features/library/index.tsx owns the Search library TextInput, clear action, local filtering, and query-aware empty state over the mode-scoped items projection. library-search-deep-link.test.tsx verifies document filtering, no-match feedback, restored matches, and exact source-chat navigation. The same predicate covers image prompt/source and artifact title/content/kind/language/source.

**Suggested fix**

Completed. Keep Library search local over the authorized projection; introduce indexing or deferred filtering only after measured list sizes justify it, without broadening Local/Cloud data access.

**Reference screenshot(s)**

- `chatgpt_reference/045-chatgpt-ios-library-grid-thumbnails-uploaded-screenshots-gallery.png`

### GAP-022 — Manual companion pairing accepts the exact code shown by Desktop

- **Status:** Done
- **Owner:** Mobile
- **Surface/type:** mobile · missing-interaction
- **Reference:** Codex · iOS · Pair manually dialog

**Gap**

Mobile manual entry now teaches and displays the exact grouped 12-character format rendered beneath the Desktop QR code. Spaces and hyphens are normalized, legacy short inputs fail before connection, and current QR payloads remain accepted as the direct-token path. A manual code is exchanged over TLS at the rate-limited signaling service for the short-lived Mobile role token, after which the existing token-authenticated WebSocket registration and HMAC session setup continue unchanged. Invalid, expired, malformed-response, and already-connected cases surface explicit errors.

**Evidence**

apps/mobile/src/features/companion/components/QRScanner.tsx uses the ABCD EFGH IJKL placeholder and Settings → Connections guidance. services/manualPairing.ts normalizes display separators, validates the current 12-character contract, derives the HTTPS signaling origin, performs the token claim without Clerk credentials or user content, and validates the bounded response. connectionStore.ts claims only when a QR token is absent and passes the returned role token into SignalingClient. services/signaling-server/src/index.ts exposes the strict 10/min/IP Mobile-only claim route with uniform invalid/expired responses and a duplicate-role guard. qr-scanner-manual.test.tsx, manual-pairing.test.ts, manual-pairing-connect.test.ts, dispatch-defense.test.ts, and signaling-server pairings.test.ts cover UI, normalization, exchange, WebSocket handoff, failures, and server contract.

**Suggested fix**

Completed. Keep manual codes five-minute high-entropy bearer secrets, never log codes with role tokens, preserve the strict claim rate limit and Mobile-only role schema, and keep QR as the preferred no-exchange path.

**Reference screenshot(s)**

- `chatgpt_reference/030-codex-ios-remote-setup-manual-pairing-code-modal-keyboard.png`

### GAP-023 — Family account linking is not planned for the current device-only age-settings scope

- **Status:** Not Planned
- **Owner:** Mobile
- **Surface/type:** mobile · missing-screen
- **Reference:** ChatGPT · web · Parental controls

**Gap**

The reference is an account-linked family-governance product. agiworkforce v1 makes a narrower product decision: its age gate stores a device-local minor-safe state and applies content filtering, but it does not create a parent/teen relationship, send invitations, grant another account access, or enforce remote usage, quiet-hour, model, or feature limits. Mobile now states that boundary directly instead of presenting its device age review as family governance.

**Evidence**

The age-gate screen's module contract explicitly says there is no parental-consent flow in v1 and that minor-safe mode is a content filter only. parental-controls/index.tsx now labels the scope Device age settings only, enumerates the unavailable remote controls, and says review changes only this device; the minor status copy names the real pre-inference Local/Cloud filtering boundary. age-gate.tsx no longer implies that a linked parent account exists. parental-controls.test.tsx verifies the adult and minor disclosures plus the bounded on-device review route.

**Suggested fix**

Not planned for the current v1 device-local trust model. Keep the explicit boundary copy and do not add an invite, family-member row, or remote-control setting until an account relationship service, mutual consent and revocation, authorization policy, audit trail, and cross-account isolation tests exist on both mobile and web.

**Reference screenshot(s)**

- `chatgpt_reference/143-chatgpt-web-settings-parental-controls-add-family-member-link-accounts.png`

### GAP-024 — Interactive Mobile plugin installation is declined until an account-bound marketplace lifecycle exists

- **Status:** Not Planned
- **Owner:** Mobile
- **Surface/type:** mobile · missing-screen
- **Reference:** ChatGPT · iOS · Plugins marketplace

**Gap**

The reference has an installable mobile plugin marketplace, but agiworkforce does not currently have an installable marketplace on any account surface. Web /plugins explicitly calls itself a catalogue-shape preview and says hosted marketplace installation is not open; its persisted plugin store hard-disables install, uninstall, installed-list, and installed-state behavior. Mobile already exposes the supported authenticated Managed Cloud Skills catalog as read-only and deliberately excludes filesystem-backed mutation. Adding Installed, +, remove, or permission controls would fabricate state and imply an authorization lifecycle that the server does not own.

**Evidence**

apps/web/app/plugins/page.tsx states that the page is a catalogue preview, that nothing installs yet, and that installation remains under development. apps/web/features/plugins/stores/plugin-store.ts sets PLUGIN_INSTALLS_ENABLED = false and makes every install-related action a no-op. apps/mobile/src/features/skills/service.ts documents the supported read-only /api/skills contract and excludes host/admin filesystem mutation; SkillsScreen.tsx provides the real Cloud catalog, search, source labels, refresh, and Local/Cloud boundary. No account-bound plugin install, uninstall, entitlement, version, or permission API exists for Mobile to call.

**Suggested fix**

Not planned for the current marketplace contract. Keep the supported Managed Cloud Skills catalog discoverable and do not add cosmetic plugin install state. Reconsider a Mobile plugin marketplace only after Web has a real account-bound catalog and install/uninstall API, entitlement and version lifecycle, connector/tool permission enforcement, revocation, audit history, and cross-client contract tests.

**Reference screenshot(s)**

- `chatgpt_reference/050-chatgpt-ios-plugins-marketplace-list-installed-featured-productivity.png`

### GAP-025 — Mobile code-session diffstat card is declined because the cited session surface was removed

- **Status:** Not Planned
- **Owner:** Mobile
- **Surface/type:** mobile · missing-control
- **Reference:** Claude/Codex · iOS · Remote session structured diffstat card (files changed count, +/- lines, expandable file list) inside chat transcript

**Gap**

The audit premise is stale: the cited apps/mobile/src/features/code-sessions transcript no longer exists and there is no mounted Mobile code-session route. Mobile code execution runs as a bounded capability inside ordinary chat and returns generated files/artifacts, not a repository worktree or authoritative git patch. Paired Desktop Dispatch exposes task status, generic run artifacts, and tool calls through a signed contract that carries no per-file additions/deletions. Rendering a diffstat from either path would fabricate data and imply a review boundary Mobile does not own.

**Evidence**

apps/mobile/src/features/cloud-bridge/README.md records removal of the unshipped Code Sessions shell. The only remaining code-sessions filename is an artifact-gallery test; no production route or feature module exists. FEATURES.codeExecution documents the bounded chat capability, while chatExecutionStore streams generated files rather than git state. The mounted companion Agent Detail renders agentStore RunArtifact label/detail/timestamp values; packages/contracts/types/src/cross-device.ts DispatchTaskStatusEvent carries status/message/result/error but no changed-file or diff fields. Desktop retains the native git diff APIs and review UI where the repository and approval authority live.

**Suggested fix**

Not planned on the current Mobile execution contracts. Keep generated files as honest chat artifacts and Desktop repository review on Desktop. Reconsider an inline diff summary only after a mounted Mobile review route receives authenticated task-bound file paths, additions/deletions, full diff retrieval, truncation metadata, and Desktop-authoritative approval semantics.

**Reference screenshot(s)**

- `references-2/IMG_0622.PNG`

### GAP-026 — Pairing intro states the real Desktop mode and short-lived-code requirements

- **Status:** Done
- **Owner:** Mobile
- **Surface/type:** mobile · missing-copy
- **Reference:** Codex · iOS · Remote setup intro

**Gap**

The reference requires both apps to share one account, but that is not agiworkforce's trust contract. Desktop must be signed in and in Managed Cloud to create a pairing session; the short-lived QR or manual code then authorizes the Mobile role without comparing the phone's Clerk identity. The intro now states that boundary, uses the mounted Settings > Connections destination, and explains that both apps need internet but not the same Wi-Fi.

**Evidence**

ConnectionStateViews.tsx presents a Desktop setup required card above the CTA, names Managed Cloud, explains code-based rather than account-identity authorization, updates the three steps to Settings > Connections, and removes the inaccurate same-network troubleshooting claim. CompanionDemoWalkthrough.tsx repeats the same requirements. companion-pairing-requirements.test.tsx renders both surfaces and asserts the Managed Cloud, account-identity, current navigation, and cross-network copy.

**Suggested fix**

Completed as a deliberate capability-honest divergence. Do not add a same-account promise unless the signaling handshake gains a server-enforced owner binding; keep the short-lived code and authenticated Desktop initiation as the real authorization boundary.

**Reference screenshot(s)**

- `chatgpt_reference/027-codex-ios-remote-setup-intro-signin-instructions.png`

### GAP-027 — Mobile states that paired Desktop folders remain Desktop-controlled

- **Status:** Not Planned
- **Owner:** Mobile
- **Surface/type:** mobile · missing-screen
- **Reference:** Codex · iOS · Remote — projects on the paired computer

**Gap**

The reference exposes projects and folders from a paired computer. AGI Workforce deliberately does not present a remote browser because the authenticated companion contract supports prompt dispatch, cancellation, status, approvals, and agent updates but has no workspace-list request or path-scoped task field. The connected screen now states that pairing does not grant Mobile permission to browse files or projects and directs people to choose allowed folders and start path-scoped work on Desktop.

**Evidence**

packages/contracts/types/src/cross-device.ts defines dispatch.task.create with prompt/title only; apps/desktop/src/services/coworkDispatch.ts parses that bounded contract and submits the prompt without a path; apps/desktop/src/features/settings/AllowedDirectoriesSettings.tsx and apps/desktop/src-tauri/src/sys/security/tool_guard.rs keep directory grants Desktop-authoritative; RemoteWorkspaceBoundaryNotice.tsx is mounted in DesktopInfoCard.tsx; remote-workspace-boundary-notice.test.tsx pins the disclosure.

**Suggested fix**

Not planned until the signed companion protocol has a Desktop-authorized request that returns only allowed roots as opaque handles, rejects traversal, validates the selected handle again at task dispatch, supports revocation, and has replay, size-limit, and cross-device authorization tests. Do not expose raw filesystem paths or imply that pairing itself grants path authority.

**Reference screenshot(s)**

- `chatgpt_reference/038-codex-ios-remote-project-list-projects-sidebar-macbook.png`

### GAP-028 — Mobile scheduled tasks teach first-run automation with bounded templates

- **Status:** Done
- **Owner:** Mobile
- **Surface/type:** mobile · missing-state
- **Reference:** ChatGPT · iOS · Scheduled tasks

**Gap**

The empty Scheduled tasks state now teaches concrete uses through four accessible dashed template cards: Daily focus, Monday kickoff, Weekly reflection, and Monthly review. Each suggestion is deliberately self-contained and avoids promising email, commerce, calendar, or other connector access that the scheduled-task runtime does not guarantee. Free-plan users continue to see the authoritative Basic upgrade boundary instead of unusable templates.

**Evidence**

apps/mobile/src/features/schedules/templates.ts owns the bounded IDs, display copy, prompts, supported cadence defaults, and getScheduleTemplate allowlist lookup. schedules/index.tsx renders the template gallery only when task creation is available and routes only the selected ID. schedules/create.tsx resolves that ID locally into ScheduleForm initialData, ignores unknown or array-valued route data, and gives an existing saved schedule precedence while editing. schedule-screen.test.tsx, schedule-create-screen.test.tsx, schedule-templates.test.ts, and schedule-form.test.tsx cover visibility, plan gating, ID-only handoff, allowlist resolution, invalid input, edit precedence, supported cadences, and form initialization.

**Suggested fix**

Completed. Keep route payloads limited to stable allowlisted IDs, keep every suggested prompt honest about available context, and add connector-dependent templates only when the scheduler has an explicit connector authorization and execution contract.

**Reference screenshot(s)**

- `chatgpt_reference/048-chatgpt-ios-scheduled-tasks-suggestions-daily-brief-email-monitor.png`

### GAP-029 — Scheduled tasks explicitly disclose prompt-only context

- **Status:** Not Planned
- **Owner:** Mobile
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Scheduled tasks attachment picker

**Gap**

The reference lets a recurring task carry Camera, Photos, Files, or plugin context. AGI Workforce scheduled execution currently persists and sends saved prompt text only. The create/edit form now labels that boundary beside the prompt and states that chat attachments are not saved or reused, preventing users from assuming ephemeral chat files become durable schedule inputs.

**Evidence**

ScheduleForm.tsx renders the accessible Prompt-only context disclosure and submits no attachment field; schedule-form.test.tsx pins the copy and payload boundary. apps/mobile/src/features/schedules/store.ts and service.ts define prompt/timing/model inputs only. packages/contracts/cloud-contracts/src/schedules.ts validates an exact mutation without attachments. apps/web/lib/services/schedule-service.ts persists no asset reference, and scheduled-agent-executor.ts sends only task.prompt as the user message.

**Suggested fix**

Not planned until Managed Cloud schedules own tenant-scoped durable asset IDs, upload completion and malware/type validation, retention and deletion semantics, permission revalidation on every run, missing/revoked asset behavior, quota accounting, safe result provenance, and contract tests across Mobile, API, persistence, and execution. Do not reuse the chat picker while its local selections have no durable schedule lifecycle.

**Reference screenshot(s)**

- `chatgpt_reference/049-chatgpt-ios-scheduled-tasks-attachment-picker-camera-photos-files-plugins.png`

### GAP-030 — Mobile Capabilities exposes authoritative inline Cloud preferences

- **Status:** Done
- **Owner:** Mobile
- **Surface/type:** mobile · missing-ia
- **Reference:** Claude · iOS · Settings > Capabilities

**Gap**

Capabilities now exposes inline switches only for the three persisted preferences already consumed by the Cloud send path: Image generation, AGI Code, and Deep research. Signed-out switches are disabled with a sign-in hint. Per-send model metadata, plan entitlements, and deployment handshakes remain authoritative, so enabling a preference never advertises an unavailable tool. Web search remains an Automatic status because it intentionally has no user toggle, while Artifacts, Memory, Voice, permissions, continuity, approvals, and Desktop control remain honest status/navigation rows.

**Evidence**

apps/mobile/src/features/settings/capabilities/index.tsx binds Switch rows directly to useChatStore.features.imageGen/codeExecution/research and setFeature, disables them before Cloud unlock, and explains the send-time capability clamp. chatExecutionStore.ts and ChatInput.tsx consume those same feature values while rechecking model, entitlement, and deployment support. capabilities-settings.test.tsx verifies the three accessible switches, signed-out disabled state, automatic Web search status, persisted mutations, and existing navigation; add-to-chat.test.tsx covers the second control surface over the same store.

**Suggested fix**

Completed. Add future inline switches only when a persisted value is consumed by the production runtime; keep automatic or always-available capabilities as status rows instead of cosmetic toggles.

**Reference screenshot(s)**

- `claude_reference/127-claude-ios-settings-capabilities-artifacts-code-exec-web-search-toggles.png`

### GAP-031 — Mobile memory controls gate past-chat context and automatic learning

- **Status:** Done
- **Owner:** Mobile
- **Surface/type:** mobile · missing-control
- **Reference:** Claude · iOS · Settings > Capabilities (Search/Memory/Tool access)

**Gap**

Mobile Memory now exposes the two named controls from the reference. Search and reference chats gates both relevant saved-memory retrieval and a bounded search over physically separate Local or Cloud chat history. Generate memory from chat history independently gates automatic learning and is unavailable while the master reference control is off. Temporary chats bypass both context retrieval and learning; manual memory review and editing remain available.

**Evidence**

apps/mobile/app/(app)/settings/memory.tsx mounts MemoryControlsCard over the existing memory manager. Local and Cloud settings stores persist separate policies; Cloud maps only memory and generateFromHistory into the account-synced capabilities namespace while recursive merging preserves Web-only keys. chatExecutionStore.ts enforces the reference switch before saved-memory and past-chat retrieval, excludes the active conversation, and injects bounded excerpts as untrusted data; consolidation.ts enforces both switches for Local learning. The Web managed-memory policy now enforces generateFromHistory for server-owned Cloud learning. memory-controls-card.test.tsx, past-chat-context.test.ts, consolidation-mode-routing.test.ts, cloud-settings-sync.test.ts, settings-store.test.tsx, request-processor.memory.test.ts, and managed-memory-context-service.test.ts cover the visible controls, mode boundary, current-chat exclusion, bounding, sync, and runtime gates.

**Suggested fix**

Completed for Mobile and the shared Managed Cloud generation policy. Keep Local and Cloud histories physically separated, keep temporary chats out of retrieval and learning, serialize historical excerpts as bounded untrusted data, and add every future memory-writing path to both policy gates. Desktop-specific memory UI remains independently tracked by GAP-077.

**Reference screenshot(s)**

- `claude_reference/128-claude-ios-settings-capabilities-memory-and-tool-access-radio.png`

### GAP-032 — Model-training opt-in is declined because customer-content training is always off

- **Status:** Not Planned
- **Owner:** Mobile
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Settings > Data controls

**Gap**

The reference offers customer conversations to a model-improvement program, but that is not an agiworkforce capability or policy. AGI does not train AGI-owned models on customer prompts, responses, or files, and no training-data collection or server consumer exists. Mobile now exposes Model training is always off as a first-class policy state in Data Controls and Cloud Privacy, replacing the ambiguous claim that training might occur after a missing consent flow. A persisted switch would be a dead privacy control and would falsely imply that turning it on changes data handling.

**Evidence**

docs/00-foundation/platform-constitution.md defines AGI as not a foundation-model company. apps/web/app/privacy/page.tsx and app/mobile/legal/page.tsx state that AGI-owned models are not trained on customer conversation content. The Web PrivacySection source deliberately excludes improveModelTraining because no training-data pipeline exists and calls a saved-but-unconsumed preference a dead control. Mobile data-controls/index.tsx now shows the non-optional policy before export/sync controls; cloud-privacy/index.tsx reports AGI model training: Always off and removes the unsupported without-consent claim. model-training-policy.test.tsx verifies both screens expose the policy and no training switch.

**Suggested fix**

Not planned while the product policy and architecture prohibit customer-content training. Keep the always-off state visible and do not add consent persistence without a separately approved training purpose, data contract, minimization and deletion rules, server enforcement, legal text, revocation path, and end-to-end proof that the preference gates every collection consumer.

**Reference screenshot(s)**

- `chatgpt_reference/055-chatgpt-ios-settings-data-controls-model-training-location-services.png`

### GAP-033 — Mobile exports complete account Cloud data before deletion

- **Status:** Done
- **Owner:** Mobile
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Settings > Data controls (export/delete)

**Gap**

Mobile Account now places an authenticated Export Cloud Data action immediately above Delete Account. It retrieves a reviewed server-side portability document containing Cloud chats, projects and knowledge-file manifests, memories, artifacts and version history, plus existing account and billing records. The native share sheet lets the user save or send the JSON; the temporary device copy is deleted when sharing finishes. Local Mode data remains a separate on-device export, and the deletion confirmation points to the Cloud export first.

**Evidence**

apps/web/app/api/user/export/route.ts now exports explicit tenant-scoped conversation, message, project, project-file, memory, artifact, and artifact-version DTOs while excluding internal token costs, storage URIs, sync cursors, and provider ledgers. Child queries scope ownership through their parent. apps/mobile/services/cloudDataExport.ts binds the request and every file/share step to the visible account epoch, remains behind the Local/Cloud egress guard, validates the response, shares JSON natively, and removes the temporary file. settings/cloud-account/index.tsx renders Export Cloud Data directly before Danger Zone, explains its contents and Local export boundary, requires an explicit Cloud-mode switch, and references export in deletion confirmation. gdpr.test.ts, cloud-data-export.test.ts, and cloud-account-owner-switch.test.tsx verify content inclusion, tenant scoping, cleanup, Local-mode gating, account-switch abort, placement flow, and deletion copy.

**Suggested fix**

Completed. Keep every added Cloud content collection on an explicit user-facing DTO and tenant-owned query, preserve the account-epoch and egress guards on Mobile, and retain separate labels for Cloud account data versus on-device Local Mode data.

**Reference screenshot(s)**

- `chatgpt_reference/056-chatgpt-ios-settings-data-controls-export-delete-account.png`

### GAP-034 — Mobile General exposes a persisted searchable App language selector

- **Status:** Done
- **Owner:** Mobile
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Settings > General

**Gap**

Mobile now boots the shared i18next runtime before the navigator appears and exposes the active app language as the first row in General. The drill-in offers Match device plus all 12 shared locales, searchable by English name, native name, or code. Selection changes translated Mobile keys immediately and persists as a device-local encrypted preference; unsupported or unreadable stored values fail back to the device language. Voice recognition language remains explicitly separate. The shared corpus retains its existing honest English fallback wherever a Mobile-specific string has not yet adopted a translation key.

**Evidence**

apps/mobile/src/i18n/index.ts owns device-language detection, preference validation, encrypted-MMKV read/write, the shared @agiworkforce/i18n corpus, and safe restoration. app/\_layout.tsx awaits restoration after MMKV initialization so the first navigable frame uses the chosen language. settings/general/index.tsx renders the translated General, Language, and Storage labels plus active native language; settings/app-language/index.tsx renders the searchable Match device and 12-locale radio list. The authenticated drawer registers the hidden route and navigation types include it. app-language-settings.test.tsx verifies General navigation, default selection, explicit choice, and native-name search; mobile-i18n.test.ts verifies corpus translation, persistence, device fallback, and invalid-value handling.

**Suggested fix**

Completed for the shared language runtime and selector. Continue migrating Mobile-specific literals to shared translation keys as their screens change, preserve English fallback for missing keys, keep voice language separate, and add a locale only through the shared corpus so Web, Desktop, and Mobile do not drift.

**Reference screenshot(s)**

- `chatgpt_reference/066-chatgpt-ios-settings-general-app-language-toggles.png`

### GAP-035 — Notification categories drill into the real Push channel while Email is explicitly unavailable

- **Status:** Done
- **Owner:** Mobile
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Settings > Notifications

**Gap**

Notification Preferences now presents each category as a drill-in row with a Push or Off summary instead of hiding channel semantics behind a bare switch. The dynamic category screen controls the existing persisted Push preference consumed by foreground, background, and companion notification gates. Email is visible as Unavailable with an explanation that no account sender exists, and no fake email boolean is stored. Invalid or array-valued route categories fail to a teaching not-found state instead of mutating an arbitrary store key.

**Evidence**

apps/mobile/src/features/settings/notifications/index.tsx renders category summaries and routes to /(app)/settings/notifications/[category]. NotificationCategoryDetailScreen.tsx owns the live Push switch, the non-interactive Email unavailable state, and explicit no-hidden-preference copy. categories.ts is the bounded shared category allowlist used by both screens. The dynamic Expo route is registered in the authenticated drawer. notification-category-settings.test.tsx verifies summaries, exact navigation, live store mutation, absence of an email preference, and invalid-category rejection; notificationPrefs.test.ts and notification-auth-gate.test.ts continue to verify the stored preference gates notification delivery.

**Suggested fix**

Completed for channels the product can actually deliver. Keep Email non-interactive until an account-bound sender, consent and unsubscribe policy, bounce handling, and category-specific delivery consumers exist; then extend the shared channel model and migration without changing the current Push enforcement contract.

**Reference screenshot(s)**

- `chatgpt_reference/065-chatgpt-ios-settings-notifications-codex-chats-projects-usage.png`

### GAP-036 — Unsupported project usage and marketing notification categories are declined until delivery producers exist

- **Status:** Not Planned
- **Owner:** Mobile
- **Surface/type:** mobile · missing-ia
- **Reference:** ChatGPT · iOS · Settings > Notifications

**Gap**

The reference exposes categories backed by its own project, usage-warning, tips, and marketing delivery systems. agiworkforce has no project notification event, usage-threshold dispatcher, product-tip scheduler, marketing sender, or consent/unsubscribe consumer in the repository. Adding toggles would store preferences no runtime reads. Mobile instead names its existing persisted task_updates lane Work Updates and states its actual scope: task results, schedule runs, and chat replies. That backwards-compatible lane gates the supported task_completed, agent_paused, schedule_triggered, and chat_message event vocabulary without inventing new state.

**Evidence**

apps/mobile/services/notifications.ts defines the supported event vocabulary but no projects, usage limits, tips, or marketing event. apps/mobile/stores/notificationPrefsStore.ts maps task_completed, agent_paused, schedule_triggered, and chat_message to the backwards-compatible task_updates preference consumed by notificationAllowed and companion dispatch. categories.ts presents that lane as Work Updates with explicit task, schedule, and reply scope. Repository push infrastructure registers and unregisters device tokens, while companionNotifications.ts is the only local producer; searches of apps/web and services/api-gateway find no Expo push dispatcher for projects, usage, tips, or marketing. Web NotificationsSection.tsx independently removes dead email/mobile groups for the same no-consumer reason. notificationPrefs.test.ts pins every supported work event to the persisted lane and notification-category-settings.test.ts verifies the visible summary.

**Suggested fix**

Not planned for categories with no delivery producer. Keep the honest grouped Work Updates control. Add separate Responses, Projects, Schedules, Usage, Tips, or Marketing categories only alongside typed events, a real sender/trigger, deep-link handling, default and migration policy, delivery tests, and—for marketing—explicit opt-in, unsubscribe, and account-level consent enforcement.

**Reference screenshot(s)**

- `chatgpt_reference/065-chatgpt-ios-settings-notifications-codex-chats-projects-usage.png`

### GAP-037 — Parental Controls explicitly limits itself to device age review

- **Status:** Done
- **Owner:** Mobile
- **Surface/type:** mobile · missing-screen
- **Reference:** ChatGPT · iOS · Settings > Parental controls

**Gap**

Mobile no longer leaves the device-only scope implicit. It shows whether minor-safe filtering is required on this device, states that parent and teen accounts are not linked, names the remote usage, quiet-hour, model, and content controls that are unavailable, and labels the only action Review Device Age Settings. The age-gate notice likewise points to an on-device review rather than suggesting a guardian account has access.

**Evidence**

parental-controls/index.tsx contains separate status and Device age settings only information cards plus the renamed Review Device Age Settings action. app/(public)/age-gate.tsx says that age settings can be reviewed on this device. parental-controls.test.tsx locks the no-linking/no-remote-governance disclosure for adult and minor states and verifies the route payload. The age-gate unit suite continues to verify its validation and stored minor-safe behavior.

**Suggested fix**

Completed for the current scope by using the audit's prescribed honest interim state. Preserve the device-only disclosure. A Family Members group remains out of scope until the account-linking, mutual-consent, revocation, authorization, audit, and isolation contracts described in GAP-023 are approved and implemented.

**Reference screenshot(s)**

- `chatgpt_reference/063-chatgpt-ios-settings-parental-controls-add-family-member.png`

### GAP-038 — Permissions consolidates real Calendar and iOS Reminders access while leaving Health absent

- **Status:** Done
- **Owner:** Mobile
- **Surface/type:** mobile · missing-control
- **Reference:** Claude · iOS · Settings > Permissions

**Gap**

The unified Permissions screen now includes Calendar on iOS and Android plus the distinct Reminders permission on iOS, each with current OS status and the existing user-initiated detail/request flow. Reminders is hidden on Android because Expo Calendar documents no direct Android reminder analogue, and its copy states that this release does not read reminders automatically. Health remains deliberately absent: the retired Health row had no native data service or backend consumer, so displaying or requesting it would authorize an unsupported capability.

**Evidence**

permissions/types.ts and permissionsStore.ts include encrypted local state for calendar and reminders. permissions/registry.ts binds Calendar.getCalendarPermissionsAsync/requestCalendarPermissionsAsync and, on iOS only, getRemindersPermissionsAsync/requestRemindersPermissionsAsync; PERMISSION_KINDS keeps the platform-specific list honest. app.config.js delegates calendar/reminder native usage descriptions and Android permissions to the Expo Calendar SDK 55 config plugin. permissions-calendar-reminders.test.ts verifies distinct adapters and normalized status, while PermissionsScreen.snapshot.test.tsx locks both rows into the mounted iOS list. The existing integrations service continues to own actual calendar context. Expo Calendar's installed SDK source and current documentation identify Reminders APIs as iOS-only.

**Suggested fix**

Completed for native capabilities the product can truthfully expose. Keep Reminders iOS-only and user-initiated, do not imply reminder data is read automatically, and add Health only alongside a reviewed native adapter, declared data use, production consumer, revocation path, and tests.

**Reference screenshot(s)**

- `claude_reference/130-claude-ios-settings-permissions-location-calendar-reminders-health.png`

### GAP-039 — Connected services open an account-scoped detail screen with enforceable tool policies

- **Status:** Done
- **Owner:** Mobile
- **Surface/type:** mobile · missing-screen
- **Reference:** ChatGPT · iOS · Settings > Plugins

**Gap**

Every connected Mobile row now drills into a real detail route instead of immediately asking to disconnect. The screen shows the AGI Cloud account, connection method, connected timestamp, and saved Allow, Ask, or Block decisions for that connector's exact runtime tool keys. It intentionally does not copy Web's unmounted static panel or invent a complete tool list: operator and custom connector tools are discovered at runtime, so only decisions created from tools the account has actually encountered are reviewable. Reset removes the saved verdict and restores the default approval flow; Disconnect remains a separately confirmed destructive footer action and clears server policies through the existing disconnect contract.

**Evidence**

apps/mobile/app/(app)/connectors/[id].tsx owns the typed dynamic route and the authenticated drawer registers it. ConnectorDetailScreen.tsx enforces sign-in, Cloud mode, account-epoch isolation, real connection metadata, runtime-key permission editing/reset, an explicit default-flow empty state, and confirmed disconnect. services/connectors.ts validates /api/connectors/permissions responses and preserves exact connectorId/toolName keys for PUT and DELETE. cloud-connectors/index.tsx navigates connected rows to detail. connector-detail.test.tsx, custom-connector.test.ts, cloud-connectors-page-enabled.test.tsx, and drawer-route-contract.test.ts cover metadata, filtering, policy mutation/reset, stale-account suppression, destructive confirmation, directory navigation, response validation, and route ownership. The unmounted Web ToolPermissionsPanel itself documents why non-GitHub static labels are not enforceable keys.

**Suggested fix**

Completed with runtime-derived policy honesty. Keep complete tool discovery out of static client config; if the server later returns an authenticated per-connection tool manifest, merge it with saved decisions so untouched tools can be reviewed without creating silent no-op keys. Preserve account-epoch checks and confirmed destructive disconnect behavior.

**Reference screenshot(s)**

- `chatgpt_reference/051-chatgpt-ios-settings-plugins-permissions-list-added-allow-low-risk.png`

### GAP-040 — Reusable multi-Desktop pairing is declined while companion authority is single-session and ephemeral

- **Status:** Not Planned
- **Owner:** Mobile
- **Surface/type:** mobile · missing-control
- **Reference:** Codex · iOS · Settings > Remote control

**Gap**

The reference stores multiple reusable remote-control authorizations. agiworkforce's companion protocol deliberately authorizes one Desktop and one Mobile role inside a short-lived pairing session. Pairing code and role token are not persisted; HMAC state, nonce cache, signaling client, WebRTC peer/data channel, heartbeat, pending controls, agent list, and dispatch tasks are single-session process state. Connecting another code first disconnects and clears the current authority. Persisting a cosmetic device list would not make those machines reconnectable, while persisting bearer authority would weaken the existing trust model. The connected UI now states One active Desktop per pairing session and explains that session keys are not saved as reusable device access.

**Evidence**

apps/mobile/stores/connectionStore.ts owns singleton signalingClient, peerConnection/dataChannel, and HMAC session state; connect disconnects an active peer before pairing another, disconnect clears keys/queues/agents/tasks, and partialize explicitly refuses to persist pairingCode, pairToken, status, or metadata authority. services/signaling-server enforces one Desktop and one Mobile role per pairing. SingleDesktopSessionNotice.tsx is mounted by DesktopInfoCard.tsx and exposes the ephemeral single-session boundary. single-desktop-session-notice.test.tsx, companion-components.test.tsx, and dispatch-defense.test.ts verify the visible contract and signed session behavior.

**Suggested fix**

Not planned on the current ephemeral protocol. Add multi-Desktop management only after a versioned device-authorization service supports independently revocable device identities, hardware-backed or encrypted refresh credentials, per-device HMAC/WebRTC contexts, multiplexed heartbeat and control queues, explicit active-target selection, remote revocation and Disconnect All, expiry/rotation, and adversarial cross-device routing tests.

**Reference screenshot(s)**

- `chatgpt_reference/058-codex-ios-settings-remote-control-desktop-connection-composer-faceid.png`

### GAP-041 — Mobile Safety exposes a persisted Reduce sensitive content control

- **Status:** Done
- **Owner:** Mobile
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Settings > Safety

**Gap**

Safety & Security now gives adult profiles an explicit Reduce sensitive content preference with plain-language scope: it filters clearly explicit and harmful requests before either Local or Cloud inference. The setting is device-global and encrypted-MMKV persisted. Minor-safe mode remains authoritative: the effective value is forced on, the switch is disabled, and the screen explains that age settings require it. Adult opt-in refusals use separate copy and never claim the user is underage.

**Evidence**

settingsStore.ts owns the persisted device-global reduceSensitiveContent field and setter. safety-security/index.tsx renders the explainer and accessible switch, ORs the preference with isMinorMode(), and disables it for minors. chatExecutionStore.ts evaluates that same OR before the send queue, attachments, transcript mutation, or any local/cloud model call; contentFilter.ts supplies distinct minor and adult refusal copy. localDataSnapshot.ts and dsarExport.ts include the preference in user data export and local reset clears it. safety-security.test.tsx covers adult opt-in and forced minor state; content-filter.test.ts covers policy-specific copy; chatStore.test.ts proves a blocked adult-opt-in prompt returns false without transcript or model activity; settings-store.test.tsx and dsar-export-local-stores.test.ts cover persistence semantics and export.

**Suggested fix**

Completed. Keep this client-side preflight as the shared minimum for both execution paths, retain distinct adult and minor explanations, and only broaden the block policy through reviewed rules with false-positive and bypass tests.

**Reference screenshot(s)**

- `chatgpt_reference/061-chatgpt-ios-settings-safety-reduce-sensitive-content-toggle.png`

### GAP-042 — Mobile Account Security exposes authoritative authenticator and current-session state

- **Status:** Done
- **Owner:** Mobile
- **Surface/type:** mobile · missing-screen
- **Reference:** ChatGPT · iOS · Settings > Security and login

**Gap**

Mobile now has a first-class Account Security route reachable from Settings and the signed-in Cloud profile. It reads the account-owned authenticator status and backup-code count from AGI Cloud, shows the real current Mobile session, links App Lock to device protection, and provides bounded Web security/account handoffs. Unsupported passkeys, SMS MFA, other-device inventory/revocation, and Lockdown mode are explicitly labeled unavailable rather than rendered as cosmetic controls.

**Evidence**

account-security/service.ts validates GET /api/settings/2fa before exposing enabled, enabled_at, or backup-code state. account-security/index.tsx binds the fetch to the current Clerk account epoch and Cloud egress mode, renders factor/session/device groups, and states the missing contract boundaries. app/(app)/settings/account-security.tsx and the authenticated drawer register the route; settings/index.tsx and profile/index.tsx expose it. account-security-service.test.ts, account-security-screen.test.tsx, settings-page.test.tsx, profile-mode-boundary.test.tsx, and drawer-route-contract.test.ts cover validation, auth and Local/Cloud gates, navigation, supported state, unavailable state, and Web handoffs.

**Suggested fix**

Completed for the account security state the product can verify today. Keep passkeys, SMS MFA, other-device lists, cross-device revoke/log-out-all, and Lockdown mode absent until account-owned APIs expose factor identifiers, verified enrollment/removal ceremonies, trusted session metadata, revocation semantics, recovery, rate limits, and cross-client tests. Never infer those controls from the current Clerk session.

**Reference screenshot(s)**

- `chatgpt_reference/059-chatgpt-ios-settings-security-login-keys-mfa-sessions-lockdown-codex.png`

### GAP-043 — Account storage quota totals are declined until the Cloud publishes an enforceable byte policy

- **Status:** Not Planned
- **Owner:** Mobile
- **Surface/type:** mobile · missing-screen
- **Reference:** ChatGPT · iOS · Settings > Storage

**Gap**

The reference visualizes a real 100 GB account quota, but agiworkforce has no storage entitlement, used/limit aggregate, or category-total endpoint on any surface. Individual media and project-file rows carry byte metadata, yet summing those tables would omit chat attachments, generated files, soft-deleted retention, and storage objects without a canonical catalog; inventing a plan limit would be worse. Mobile Storage now makes the boundary explicit: AGI Cloud Storage is Not metered, and the existing downloaded-model and cache totals are titled On This Device so they cannot be mistaken for account usage.

**Evidence**

StorageScopeNotice.tsx states that the account publishes no file-storage byte quota and that following totals are device-only. apps/mobile/app/(app)/settings/storage.tsx mounts the notice above the renamed On This Device card while retaining real model/cache measurement and deletion. apps/mobile/src/features/settings/cloud-usage/index.tsx reports compute/billing utilization rather than file bytes. Repository routes expose per-file byteCount/byte_count values, but searches find no account storage limit, canonical aggregate, quota enforcement, or storage-usage endpoint. storage-scope-notice.test.tsx prevents device totals from being relabeled as Cloud quota; storageUsage.test.ts continues to verify real recursive device-byte measurement.

**Suggested fix**

Not planned until the backend owns a storage entitlement and canonical inventory. Add the used/total bar and Documents, Images, and Files management only with an authenticated owner-scoped aggregate endpoint, explicit treatment of retention/soft deletes and orphaned objects, an enforced plan limit, category definitions, deletion APIs, and cross-tenant plus byte-accounting tests.

**Reference screenshot(s)**

- `chatgpt_reference/054-chatgpt-ios-settings-storage-documents-images-usage.png`

### GAP-044 — Trusted-contact enrolment and automatic escalation are declined without a verified consent and safety service

- **Status:** Not Planned
- **Owner:** Mobile
- **Surface/type:** mobile · missing-screen
- **Reference:** ChatGPT · iOS · Settings > Trusted contact

**Gap**

The reference describes a safety intervention product that may monitor for serious concern and notify an enrolled person. agiworkforce has no contact-verification service, mutual opt-in, age attestation, revocation, safety-classification policy, escalation review, notification dispatcher, jurisdiction-aware resource directory, or audit trail. A Get started flow or automatic-alert promise would therefore collect sensitive contact data without an authorized consumer and could create dangerous expectations. Mobile Safety & Security now states the actual boundary: no trusted contact is configured, AGI does not monitor chats to notify another person, and no one receives conversation content or safety alerts.

**Evidence**

apps/mobile/src/features/settings/safety-security/index.tsx exposes Trusted contact · Not configured and the explicit non-monitoring/non-notification boundary beside the real content and device safeguards. Repository searches across Mobile, Web, Desktop, gateway routes, schemas, migrations, and notification senders find no trusted-contact entity, contact-consent lifecycle, crisis classifier, or escalation dispatcher. safety-security.test.tsx verifies the boundary is visible and retains coverage of strict content filtering and authenticated device lock.

**Suggested fix**

Not planned until a dedicated, reviewed safety service exists. Do not add enrolment or automatic-contact copy without mutual verified consent, 18+ policy, revocation and deletion, minimization and encryption, classifier limitations and human-review policy, jurisdiction-aware resources, abuse prevention, delivery/audit guarantees, legal and clinical safety review, and end-to-end tests proving conversation content is never disclosed outside the approved scope.

**Reference screenshot(s)**

- `chatgpt_reference/062-chatgpt-ios-settings-trusted-contact-crisis-support-get-started.png`

### GAP-045 — Background voice is declined; Mobile now enforces and explains foreground-only capture

- **Status:** Not Planned
- **Owner:** Mobile
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Settings > Voice

**Gap**

The reference offers an ongoing voice-call runtime in other apps and under screen lock. agiworkforce Mobile currently uses foreground on-device utterance recognition and system speech, not a durable background voice call. The iOS target declares background fetch only, the Android app has no reviewed microphone foreground service, and the voice surface releases recognition and speech on backgrounding. Voice Settings now states that listening and speech stop when AGI leaves the foreground or the device locks and that the microphone does not remain active in other apps.

**Evidence**

useVoiceConversation.ts subscribes to AppState and, for inactive/background states, disarms auto-listen and push-to-talk, marks any capture consumed, aborts the native recognizer, stops speech, resets the UI, and never resumes on foreground without another user gesture. settings/voice/index.tsx exposes Foreground conversations only with the mic behavior. Info.plist contains UIBackgroundModes fetch but not audio. Current expo-speech-recognition documentation for installed 3.1.3 covers continuous recognition after silence plus iOS audio-session categories, but does not provide an application-background lifecycle or Android microphone foreground-service contract. voice-conversation-ptt.test.tsx verifies background abort/no auto-resume/listener cleanup; voice-settings.test.tsx verifies the disclosure and absence of a cosmetic switch.

**Suggested fix**

Not planned for the current foreground recognizer. Keep the privacy-safe stop behavior and visible copy. Reconsider only with a reviewed background-call architecture: iOS audio entitlement and lock-screen behavior, Android microphone foreground service and persistent disclosure, interruption/routing handling, explicit consent and revocation, battery limits, native-device tests, and store-policy review.

**Reference screenshot(s)**

- `chatgpt_reference/064-chatgpt-ios-settings-voice-spruce-model-intelligence-language.png`

### GAP-046 — Shared Links and Device Integrations are reachable from Settings

- **Status:** Done
- **Owner:** Mobile
- **Surface/type:** mobile · missing-ia
- **Reference:** Claude · iOS · Settings root — Account group

**Gap**

The two production screens now have first-class inbound navigation. Shared Links appears in Account with the same Clerk sign-in gate as other account-backed Cloud data. Device Integrations appears in Device because its Calendar and Contacts permissions are local OS capabilities, not a Managed Cloud connector surface. The Shared Links back action now returns through the actual navigation stack instead of always jumping to Data Controls.

**Evidence**

apps/mobile/src/features/settings/index.tsx routes the Account > Shared Links row through openCloudRoute('/(app)/settings/shared-links') and the feature-gated Device > Device Integrations row directly to '/(app)/settings/integrations'. apps/mobile/app/(app)/settings/shared-links.tsx uses stack back with a Settings-root fallback. settings-page.test.tsx verifies rendered rows, signed-out gating, and both real destinations; shared-links-honesty.test.tsx, integration-feature-honesty.test.ts, and the Settings snapshot cover the existing screens and resulting IA.

**Suggested fix**

Completed. Keep Shared Links account-authenticated and keep device Calendar/Contacts permissions in the Device group; do not relabel local OS permissions as Cloud integrations.

**Reference screenshot(s)**

- `chatgpt_reference/025-other-ios-settings-legal-links-claude-app-version-popover.png`

### GAP-047 — A Mobile Plugins drawer destination is declined while the marketplace remains preview-only

- **Status:** Not Planned
- **Owner:** Mobile
- **Surface/type:** mobile · missing-ia
- **Reference:** ChatGPT · iOS · Sidebar drawer

**Gap**

The reference links to a working plugin product, whereas agiworkforce's Web /plugins route is a public preview with installation deliberately disabled and no account-bound runtime behind it. A top-level Mobile drawer item would therefore lead to either duplicated marketing content or dead install controls. Mobile instead exposes Skills—the real authenticated Cloud catalog the product can currently enumerate—as a first-class Cloud-tagged drawer destination.

**Evidence**

apps/web/app/plugins/page.tsx identifies its catalog as a preview and says nothing installs yet. apps/web/features/plugins/stores/plugin-store.ts hard-disables installation and always reports no installed plugins. apps/mobile/src/features/drawer/components/DrawerContent.tsx exposes the supported Cloud Skills destination; apps/mobile/src/features/skills/SkillsScreen.tsx and service.ts back it with authenticated /api/skills data while preserving the Local no-egress boundary. There is no mounted account plugin-management API or permission lifecycle to justify another primary destination.

**Suggested fix**

Not planned until Plugins is an operable account product rather than a marketing preview. Keep Skills in the Mobile drawer as the honest catalog surface. Add a Plugins destination only when it can navigate to server-owned install state, details, permissions, uninstall/revocation, and error recovery instead of duplicating static Web marketing data.

**Reference screenshot(s)**

- `chatgpt_reference/077-chatgpt-ios-sidebar-nav-recents-chat-history-fab.png`

### GAP-048 — Background connector scanning for suggested tasks is declined under the request-scoped source policy

- **Status:** Not Planned
- **Owner:** Mobile
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Work mode empty state

**Gap**

The reference proactively scans connected accounts to derive task suggestions. agiworkforce's connector contract is narrower: a connected service makes runtime tools available after an explicit user request, but connection alone does not authorize background repository, issue, branch, message, or document inspection. There is no suggestion endpoint, scan consent, source cursor, minimization policy, or revocation/cache lifecycle. Mobile Work mode now states that connected sources remain request-scoped, that AGI does not scan repositories or accounts in the background, and links directly to connector management instead of silently showing a blank canvas or fabricated suggestions.

**Evidence**

WorkModeSourceNotice.tsx presents the request-scoped boundary and Manage connected services action when the Cloud composer is in agiwork mode; app/(app)/(tabs)/chat.tsx mounts it only for that state. apps/web/app/api/connectors/route.ts treats connection rows as tool enablement gates, and the chat tool loop invokes tools within a user-initiated turn. Repository searches find no authenticated connector-suggestion endpoint, scheduled scanner, scan cursor, suggestion cache, or consent record. work-mode-source-notice.test.tsx verifies the privacy copy and action; chat-tab-mode-toggle.test.tsx and add-to-chat.test.tsx retain coverage of Cloud mode and the real Work mode switch.

**Suggested fix**

Not planned under the current request-scoped connector authorization. Reconsider source-derived suggestions only with explicit opt-in per connector/source, a least-privilege typed query contract, bounded scan frequency and data retention, deletion/revocation, source citations, stale-result handling, tenant isolation, abuse/rate limits, and tests proving that connecting a service alone never triggers content access.

**Reference screenshot(s)**

- `chatgpt_reference/076-chatgpt-ios-work-mode-task-list-github-suggested-tasks.png`

### GAP-049 — Post-pairing setup toggles are declined for the current ephemeral companion session

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-state
- **Reference:** Codex · macOS desktop · 'You're connected' post-pairing modal

**Gap**

The reference configures durable device access, but agiworkforce pairing authorizes one short-lived Desktop and Mobile session. There is no device-scoped keep-awake, locked-app access, or extension-install state to persist, and presenting those toggles after pairing would imply durable authority the protocol does not grant.

**Evidence**

MobileCompanionPanel.tsx and QRPairingCard.tsx expose the supported connect, status, approval, and disconnect lifecycle. The companion stores and signed cross-device contracts keep pairing authority session-scoped and provide no per-device setup-preference fields or native locked-session entitlement.

**Suggested fix**

Not planned for the current companion contract. Add a post-pairing setup flow only after durable, independently revocable device identities and native-backed sleep, lock-screen, and extension-install capabilities exist.

**Reference screenshot(s)**

- `chatgpt_reference/052-codex-macos-settings-connections-search-remote-control-connected-modal.png`

### GAP-050 — Desktop exposes the real multi-session terminal in a persistent bottom dock

- **Status:** Done
- **Owner:** Desktop
- **Surface/type:** desktop · missing-screen
- **Reference:** Codex · macOS desktop · Bottom terminal dock

**Gap**

Desktop Local mode now mounts the existing xterm-backed TerminalWorkspace in a bottom dock instead of leaving the implementation orphaned. The dock can be opened and closed from the shell and its open state survives a restart.

**Evidence**

apps/desktop/src/features/v3/DesktopShellV3.tsx lazy-loads TerminalWorkspace in a Local-only bottom dock, persists desktop-terminal-dock-open, and exposes labelled open/close controls. DesktopShellV3.test.tsx verifies that the real workspace mount appears, persists, and closes.

**Suggested fix**

Completed for the supported Local terminal runtime. Keep the dock Local-only and continue using TerminalWorkspace as the single owner of sessions, tabs, shell selection, and terminal lifecycle.

**Reference screenshot(s)**

- `chatgpt_reference/081-codex-macos-terminal-panel-shell-prompt.png`

### GAP-051 — Desktop empty chat exposes capability-aware quick actions

- **Status:** Done
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Chat empty state

**Gap**

The audit inspected EmptyChat in isolation, but the mounted Desktop shell delegates the composer empty state to shared unified-chat, where QuickChips render below the greeting and seed the first prompt. Cloud chip availability is further constrained by the hydrated account tier.

**Evidence**

apps/desktop/src/features/v3/DesktopShellV3.tsx passes quickChipAvailability and an empty-state slot to ChatInterface. packages/ui/unified-chat/src/components/ChatInterface.tsx and QuickChips.tsx own the mounted quick actions and prompt seeding. DesktopShellV3.test.tsx verifies the quick-chip mount and Cloud tier projection.

**Suggested fix**

Closed as a stale component-level finding. Keep quick actions in the shared composer owner and gate every chip by the runtime and account capability that can actually execute it.

**Reference screenshot(s)**

- `chatgpt_reference/079-codex-macos-chat-empty-state-agiworkforce-quick-actions.png`

### GAP-052 — Reference-specific AGI Code transcript and session toggles are declined without runtime consumers

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · macOS desktop · Claude Code settings > Appearance + Local sessions

**Gap**

Desktop now has app-wide persisted UI scale and reduced motion, but it has no separate transcript renderer policy or coding-session executor that consumes transcript width, bypass-permissions, remote-control-default, or parallel-workflow flags. Adding those controls to the thin AGI Code settings tab would create saved preferences with no enforcement owner.

**Evidence**

apps/desktop/src/features/settings/tabs/AgiCode/index.tsx owns instruction-file settings only. ThemeSettings.tsx and App.tsx now own real app-wide scale. Repository searches find no coding-session consumer for transcript width, bypass permission, remote-control default, or dynamic workflow settings.

**Suggested fix**

Not planned until a mounted coding-session runtime defines typed, native-enforced semantics for these settings. Keep general accessibility in Appearance and do not duplicate security toggles that cannot constrain execution.

**Reference screenshot(s)**

- `claude_reference/149-claude-desktop-settings-claude-code-appearance-transcript.png`

### GAP-053 — Per-device coding authorization-token management is declined without an account token API

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-screen
- **Reference:** Claude · macOS desktop · Claude Code settings > Authorization tokens

**Gap**

The reference manages server-issued device tokens and cloud coding sessions. agiworkforce Desktop has no owner-scoped token inventory, scope vocabulary, revocation endpoint, or cloud-session deletion contract for a coding product, so a list or revoke button would fabricate security state.

**Evidence**

Repository searches across Desktop settings, auth services, and Cloud contracts find no coding-device token list/revoke operation, token-scope model, cloud-session deletion endpoint, or sharing-policy owner. Existing sign-in credentials are not exposed as a manageable coding-token catalog.

**Suggested fix**

Not planned until the account service publishes authenticated token inventory, scope, revoke, session deletion, sharing, audit, and current-device semantics with cross-account tests.

**Reference screenshot(s)**

- `claude_reference/152-claude-desktop-settings-claude-code-auth-tokens.png`

### GAP-054 — Separate AGI Code diff themes and font are declined without a consuming diff renderer

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-screen
- **Reference:** Claude · macOS desktop · Claude Code settings > General + Code appearance

**Gap**

A separate light/dark coding theme and code-font preference would currently be dead state: the AGI Code settings surface does not own an independent diff transcript, and existing diff viewers use the application theme and editor configuration.

**Evidence**

AgiCode/index.tsx mounts only InstructionFilesSettings. Existing Desktop git and file diff components do not read any AGI Code theme or font preference, and no settings schema or runtime contract defines one.

**Suggested fix**

Not planned until a distinct coding transcript/diff renderer owns these preferences end to end. If introduced, connect the setting, live preview, renderer, persistence migration, and contrast tests in one change.

**Reference screenshot(s)**

- `claude_reference/148-claude-desktop-settings-claude-code-general-code-theme.png`

### GAP-055 — AGI Code worktree and browser-tool settings are declined without session ownership

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · macOS desktop · Claude Code settings > worktree location + Browser tools

**Gap**

The requested controls assume an isolated-worktree coding runtime and a dedicated browser session with cookie, allow-site, and persistence ownership. Desktop has neither contract under AGI Code; reusing unrelated git, MCP, or Chrome-extension state would conflate trust boundaries.

**Evidence**

Repository searches find no AGI Code worktree allocator, worktree-location consumer, in-app coding browser session, cookie jar, allowed-site evaluator, or link-routing preference. Existing browser, extension, and git modules are independently owned.

**Suggested fix**

Not planned until a coding-session service defines worktree lifecycle and a browser owner defines isolated storage, permissions, retention, clear-data, and allowed-origin enforcement.

**Reference screenshot(s)**

- `claude_reference/150-claude-desktop-settings-claude-code-worktree-browser-tools.png`

### GAP-056 — Composer shows the native terminal access policy at send time

- **Status:** Done
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Composer access-mode indicator

**Gap**

The Desktop composer now shows the resolved terminal sandbox policy as a severity-coloured chip. Sandbox off and danger-full-access are explicit danger states; read-only and workspace-write reflect their native-backed policies, and the chip opens Agent Execution settings.

**Evidence**

apps/desktop/src/features/v3/ComposerContextControls.tsx reads executionPreferences.terminalSandbox and renders the point-of-use policy. DesktopShellV3.tsx mounts it through the shared composer's hostControls seam. ComposerContextControls.test.tsx verifies the enforced workspace-write state, sandbox-off warning, and settings navigation.

**Suggested fix**

Completed. Keep the chip derived from the native-synchronised settings store and never infer access from presentation state. Any future inline mutation must preserve native confirmation and rollback behavior.

**Reference screenshot(s)**

- `chatgpt_reference/079-codex-macos-chat-empty-state-agiworkforce-quick-actions.png`

### GAP-057 — Composer shows workspace, environment, and verified git-branch context

- **Status:** Done
- **Owner:** Desktop
- **Surface/type:** desktop · missing-ia
- **Reference:** Codex · macOS desktop · Composer context bar

**Gap**

Desktop now places the active Local, Cloud, or BYOK environment, selected folder, and live repository branch beside the send controls. Folder selection remains mode-aware, and branch display is omitted when native git status cannot verify it.

**Evidence**

ComposerContextControls.tsx reads the selected folder and privacy mode supplied by DesktopShellV3, calls the existing gitStatus API only for a Tauri Local/BYOK folder, and fails closed by hiding unavailable branch data. ComposerContextControls.test.tsx covers folder, environment, live branch, and Cloud no-branch behavior.

**Suggested fix**

Completed. Keep these labels sourced from the same folder-scoping, privacy-mode, and native git contracts used for execution so the composer never overstates its scope.

**Reference screenshot(s)**

- `chatgpt_reference/079-codex-macos-chat-empty-state-agiworkforce-quick-actions.png`

### GAP-058 — Automatic tool approval remains visibly warned at the composer

- **Status:** Done
- **Owner:** Desktop
- **Surface/type:** desktop · missing-state
- **Reference:** Claude · macOS desktop · Cowork agent task view

**Gap**

When the native-synchronised global auto-approve setting is active, the composer now carries a persistent red Approvals: Auto warning at the point of execution. The warning opens Agent Execution settings; it is not dismissible, so elevated posture cannot become silently hidden.

**Evidence**

ComposerContextControls.tsx derives the warning from chatPreferences.autoApproveTools and links to agent-execution settings. settingsStore.ts synchronises setAutoApproveTools with the native set_auto_approve_all command and rolls UI state back on failure. ComposerContextControls.test.tsx verifies visibility and navigation.

**Suggested fix**

Completed for the supported global approval contract. Keep the warning persistent while auto-approve is active; add a conversation-scoped selector only if the native executor gains an authoritative per-conversation policy.

**Reference screenshot(s)**

- `claude_reference/098-claude-desktop-cowork-agent-task-view-tool-call-timeline.png`

### GAP-059 — Per-conversation approval mode is declined while native approval policy is global

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · macOS desktop · Cowork home (new task composer)

**Gap**

Desktop now makes global automatic approval visibly dangerous at the composer, but the native executor and persisted settings expose a global policy rather than a conversation-bound override. A Manual or Skip selector in one chat would falsely imply isolation the backend does not enforce.

**Evidence**

settingsStore.ts synchronises autoApproveTools through set_auto_approve_all and rolls back on failure; the command has no conversation identifier. ComposerContextControls.tsx shows the real global state. The chat and cross-device contracts carry no per-conversation approval-policy field.

**Suggested fix**

Not planned under the current native contract. Add a selector only after the executor accepts, persists, enforces, revokes, and audits a conversation-scoped policy with a non-bypassable safety floor.

**Reference screenshot(s)**

- `references-2/claude-desktop-cowork-record-skill-05-processing-zero-steps.png`

### GAP-060 — Recorder provides consent-first narration with a live level meter

- **Status:** Done
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · macOS desktop · Cowork skill recording — active capture HUD

**Gap**

The skill recorder now offers narration as an explicit default-off control during capture, renders a 24-bar live input meter, and records timestamped spoken annotations through the local Whisper path so narration can be associated with the demonstrated actions.

**Evidence**

apps/desktop/src/features/automation/ActionRecorder.tsx owns the Narration off/on control, level meter, local transcription lifecycle, and timestamped narration actions. ActionRecorder.test.tsx covers the recorder states and the recovery flow without silently enabling microphone capture.

**Suggested fix**

Completed for local, opt-in narration. Keep microphone capture off by default, visibly disclose its state, release it on stop/cancel, and keep narrated content inside the same local recording boundary.

**Reference screenshot(s)**

- `references-2/claude-desktop-cowork-record-skill-04-active-capture-zero-steps.png`

### GAP-061 — A unified Progress, Outputs, and Context rail is declined without a durable run journal

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-ia
- **Reference:** Claude · macOS desktop · Cowork task rail — Progress / Outputs / Context

**Gap**

ExecutionSidecar can show live execution observations, but Desktop has no authoritative per-run aggregate for produced files, referenced context, and provenance. Merging transient tool events and unrelated artifact stores into an Outputs section would be incomplete and could mislabel files as task products.

**Evidence**

ExecutionSidecar owns Timeline, Screen, Browser, Terminal, and Approvals observations. FilesPanel belongs to ExecutionDashboard, while artifact and chat stores have separate lifecycles. No typed run journal links output paths, context references, provenance, retention, and conversation identity.

**Suggested fix**

Not planned until the executor emits a durable task-bound run journal with typed progress, output, and context records, safe path handling, provenance, reopen behavior, and cleanup semantics.

**Reference screenshot(s)**

- `references-2/claude-desktop-cowork-record-skill-06-task-progress-outputs-context.png`

### GAP-062 — Conversation recording attachments are declined without a persisted recording entity

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-ia
- **Reference:** Claude · macOS desktop · Cowork task — recording attached to the conversation

**Gap**

The current recorder deliberately creates a local skill from captured actions; recordings are component-local and have no message attachment schema, storage lifecycle, retention rule, or replay contract. A conversation card would promise durable content that cannot be reopened.

**Evidence**

ActionRecorder.tsx sends reviewed actions to skillCreateFromRecording and clears its local capture state. Desktop and shared message attachment contracts define supported file/media shapes but no timestamped action-recording entity or storage owner.

**Suggested fix**

Not planned until a versioned recording entity defines storage, message attachment metadata, consent, retention/deletion, replay, export, and local-versus-cloud boundaries.

**Reference screenshot(s)**

- `references-2/claude-desktop-cowork-record-skill-06-task-progress-outputs-context.png`

### GAP-063 — Computer-off cross-device pickup claims are declined without a durable remote worker

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-copy
- **Reference:** Claude · macOS desktop · Cross-device Cowork task continuity onboarding modal

**Gap**

The reference promise requires server-owned task persistence and execution after the Desktop disconnects. Current companion control is an ephemeral peer session and Local work depends on the machine, so onboarding that promises pickup while the computer is off would be false.

**Evidence**

The companion protocol and connection stores require an active Desktop peer for local dispatch and clear session authority on disconnect. Managed Cloud tasks are a separate authenticated runtime and are not an automatic continuation of a Local companion task.

**Suggested fix**

Not planned until a durable task handoff contract can prove ownership transfer, encrypted state persistence, resumability, status delivery, cancellation, and explicit Local-to-Cloud consent.

**Reference screenshot(s)**

- `references-2/claude-desktop-cowork-record-skill-01-cross-device-onboarding.png`

### GAP-064 — Desktop composer exposes the shared Chat and AGI Work scope switch

- **Status:** Done
- **Owner:** Desktop
- **Surface/type:** desktop · missing-screen
- **Reference:** Claude · macOS desktop · Home launcher composer — Chat/Cowork mode toggle

**Gap**

The mounted Desktop composer already uses the shared Chat/AGI Work control and project or folder picker. Availability is projected from Local/Cloud mode and the hydrated account tier rather than duplicated in Desktop-only empty-state code.

**Evidence**

DesktopShellV3.tsx passes canUseAgiWork, projectPicker, folder selection, and currentFolderLabel into the unified ChatInterface. ChatInput.tsx owns the Chat/AGI Work switch and WorkScopePicker. DesktopShellV3.test.tsx verifies Local folder scoping, Cloud scan-root semantics, project membership, and tier gating.

**Suggested fix**

Closed as stale. Retain the shared composer as the single interaction owner and keep Desktop responsible only for capability and scope inputs.

**Reference screenshot(s)**

- `claude_reference/137-claude-desktop-home-launcher-cowork-mode-recents-list.png`

### GAP-065 — Interactive plugin catalog installation is declined while marketplace state is preview-only

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-screen
- **Reference:** Codex · macOS desktop · Plugins marketplace

**Gap**

The repository does not have an account-bound plugin install lifecycle. A browsable Desktop installer would create optimistic installed state without authoritative catalog, entitlement, permission, version, or uninstall ownership.

**Evidence**

Web's plugin route identifies itself as a catalog preview and its plugin store disables installation. Desktop SkillsPluginsSettings resolves local configuration but has no hosted marketplace install API or authenticated installed inventory.

**Suggested fix**

Not planned until a server-owned catalog and install/uninstall API, permissions, entitlement, versioning, revocation, audit, and error recovery are implemented and shared across clients.

**Reference screenshot(s)**

- `chatgpt_reference/087-codex-macos-plugins-marketplace-installed-featured.png`

### GAP-066 — Plugin and connector Finish setup state is declined without an authoritative setup lifecycle

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-state
- **Reference:** Codex · macOS desktop · Plugins marketplace — Imported plugins

**Gap**

A Finish setup badge requires the product to know that installation succeeded but authorization or configuration remains incomplete. No shared plugin install record or connector setup-state machine publishes that distinction to Desktop.

**Evidence**

Desktop connector surfaces expose their own concrete connection flows, while SkillsPluginsSettings has no account-bound installed/setup status. Repository contracts contain no generic setup_required state, resumable setup URL, or completion callback shared by plugins and connectors.

**Suggested fix**

Not planned until each integration publishes authoritative installed, setup-required, ready, failed, and revoked states plus a resumable owner-scoped setup action.

**Reference screenshot(s)**

- `chatgpt_reference/087-codex-macos-plugins-marketplace-installed-featured.png`

### GAP-067 — A Desktop pull-request inbox is declined without remote review ownership

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-screen
- **Reference:** Codex · macOS desktop · Pull requests list

**Gap**

Local git commands and helper APIs do not constitute an authenticated pull-request product. Desktop lacks a provider-neutral PR list/detail contract, remote account selection, pagination, review permissions, and mutation audit trail.

**Evidence**

apps/desktop/src/features/git and api/git.ts own local repository status, diff, commit, push, and pull operations. Repository searches find no mounted owner-scoped PR inbox service or Desktop remote-provider authorization and review contract.

**Suggested fix**

Not planned until a remote provider layer owns repository identity, authenticated PR list/detail/review mutations, pagination, errors, rate limits, and audit behavior.

**Reference screenshot(s)**

- `chatgpt_reference/084-codex-macos-pull-requests-list-empty-error-state.png`

### GAP-068 — A fabricated recording Processing state is declined for synchronous local capture

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-state
- **Reference:** Claude · macOS desktop · Recorder HUD — Processing state

**Gap**

The current recorder stops and immediately presents the captured action review; it does not submit an asynchronous media-processing job. Adding a timed Processing screen would be ornamental latency and would not reflect real work.

**Evidence**

ActionRecorder.tsx receives the native stop result, finalizes optional local narration, and transitions directly to review or the structured empty-capture recovery. No processing job identifier, progress event, retry contract, or background worker exists.

**Suggested fix**

Not planned while processing is synchronous. Add a real state only if a future media pipeline publishes durable queued, processing, failed, retryable, and complete statuses.

**Reference screenshot(s)**

- `references-2/claude-desktop-cowork-record-skill-05-processing-zero-steps.png`

### GAP-069 — In-thread recording playback is declined without a durable timeline asset

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-screen
- **Reference:** Claude · macOS desktop · Recording playback — expanded event timeline

**Gap**

Timestamped actions and narration support skill creation, but the product does not retain a recording asset after review. A playback card with elapsed time and app-switch events would be nonfunctional without persisted timeline and media ownership.

**Evidence**

ActionRecorder.tsx holds capture events locally and its supported sink is skillCreateFromRecording. Message schemas and artifact stores do not define a replayable recording timeline, duration, app-switch event, or retrieval URL.

**Suggested fix**

Not planned until the recording-attachment contract described in GAP-062 exists with seekable timing, event validation, storage, retention, and reopen tests.

**Reference screenshot(s)**

- `references-2/claude-desktop-cowork-record-skill-07-recording-playback-events-a.png`

### GAP-070 — Per-step recorder screenshots are declined without consented frame capture and storage

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · macOS desktop · Recording playback — screenshot frames per event

**Gap**

The recorder currently captures input actions and optional narration, not screen frames. Adding screenshot thumbnails requires a new screen-recording consent boundary, redaction policy, storage lifecycle, and secure association with steps.

**Evidence**

The native recording result and ActionRecorder RecordedAction model contain action metadata but no image bytes, frame identifiers, redaction status, or storage reference. Current screen capture features use separate consent and execution paths.

**Suggested fix**

Not planned until native capture explicitly authorizes frames and defines redaction, sensitive-window handling, encryption, retention/deletion, size limits, thumbnail generation, and local/cloud egress policy.

**Reference screenshot(s)**

- `references-2/claude-desktop-cowork-record-skill-08-recording-playback-events-b.png`

### GAP-071 — A single Review, Terminal, Browser, and Files right rail is declined; terminal uses its real dock

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-screen
- **Reference:** Codex · macOS desktop · Right tool panel launcher

**Gap**

The terminal reachability defect is fixed with a bottom dock, but the remaining panels have different owners and lifecycles. Combining local review, browser automation, file diff, and terminal into a cosmetic rail would duplicate existing surfaces and blur approval boundaries.

**Evidence**

DesktopShellV3.tsx now mounts TerminalWorkspace in the conventional bottom dock. ExecutionSidecar, ExecutionDashboard, BrowserPanel, FilesPanel, and git review components remain contextual to their respective execution or review owners; no shared panel-state or run-artifact contract unifies them.

**Suggested fix**

Not planned as a monolithic rail. Keep terminal in the bottom dock and mount each other panel only from an authoritative execution or review context; revisit shared navigation after a run journal exists.

**Reference screenshot(s)**

- `chatgpt_reference/080-codex-macos-right-panel-shortcuts-review-terminal-browser-files.png`

### GAP-072 — Scheduler starter templates are declined until Local and Cloud share a typed template contract

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Scheduled tasks — Suggestions

**Gap**

Desktop exposes separate Local and Managed Cloud scheduling implementations with different persistence and execution boundaries. Hard-coded visual templates would drift or prefill unsupported fields without a shared product-owned template schema.

**Evidence**

AgiWorkScheduled and the Cloud schedules surface use separate stores/services and submit different runtime contracts. Repository searches find no versioned scheduler-template catalog, applicability metadata, migration policy, or server-owned template identifiers.

**Suggested fix**

Not planned until a template contract declares supported target runtime, prompt, schedule fields, required capabilities, version, localization, and safe preview for both schedulers.

**Reference screenshot(s)**

- `chatgpt_reference/086-codex-macos-scheduled-tasks-daily-weekly-followup-suggestions.png`

### GAP-073 — Organization ID, in-app account deletion, and logout-all are declined without account APIs

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · macOS desktop · Settings > Account

**Gap**

These are server-authoritative account operations, not renderer settings. Desktop has no organization-membership fact, deletion challenge/status contract, or session-revocation endpoint that could back the requested controls safely.

**Evidence**

Account settings consume the supported profile and billing facts. Searches across Desktop API clients and Cloud contracts find no organization ID field, delete-account operation, logout-all endpoint, reauthentication challenge, or deletion recovery state.

**Suggested fix**

Not planned until the account service owns organization identity, destructive deletion with reauthentication and status, and all-session revocation with current-session behavior and audit tests.

**Reference screenshot(s)**

- `claude_reference/140-claude-desktop-settings-account-org-id-trusted-devices.png`

### GAP-074 — Cross-surface Active Sessions is declined without a session inventory service

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · macOS desktop · Settings > Account — Active sessions table

**Gap**

A trustworthy device/session table requires server-issued session identifiers, device metadata, timestamps, current-session marking, and individual revocation. None is published to Desktop, so deriving rows from local tokens or companion peers would be incomplete and security-sensitive.

**Evidence**

Desktop auth state contains the current credentials but no authenticated session inventory or revoke-by-session action. Companion connections are ephemeral peer sessions and are not interchangeable with account login sessions.

**Suggested fix**

Not planned until an owner-scoped session API provides normalized device/location metadata, privacy rules, current marker, last activity, revoke/revoke-all, expiry, and cross-account isolation tests.

**Reference screenshot(s)**

- `claude_reference/141-claude-desktop-settings-account-active-sessions-device-list.png`

### GAP-075 — Desktop UI scale is user-selectable and persisted

- **Status:** Done
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings > Appearance — Preferences

**Gap**

Desktop Appearance now provides Small, Default, and Large interface sizes. The selected 90, 100, or 110 percent scale is persisted in the settings store and applied at the document root on launch.

**Evidence**

ThemeSettings.tsx renders the Interface size control. settingsStore.ts persists windowPreferences.uiScale with a versioned migration, and App.tsx applies the root font size. ThemeSettings.accessibility.test.tsx verifies the control and persistence behavior.

**Suggested fix**

Completed. Keep scale values bounded and migrated, and apply them once at the app root so feature surfaces inherit a consistent size.

**Reference screenshot(s)**

- `chatgpt_reference/095-codex-macos-settings-appearance-dark-theme-preferences.png`

### GAP-076 — Desktop provides a persisted Reduce motion override

- **Status:** Done
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings > Appearance — Preferences

**Gap**

Appearance now includes an in-app Reduce motion switch independent of the operating-system preference. Its persisted root class suppresses nonessential animation, transition, and smooth scrolling throughout the Desktop UI.

**Evidence**

ThemeSettings.tsx exposes the switch; settingsStore.ts persists windowPreferences.reduceMotion with a migration; App.tsx applies reduce-motion at the root; styles/globals.css defines the override. ThemeSettings.accessibility.test.tsx covers the setting.

**Suggested fix**

Completed. Continue respecting the OS media query while treating this switch as an additional user override, and exempt only motion that is essential to understanding state.

**Reference screenshot(s)**

- `chatgpt_reference/095-codex-macos-settings-appearance-dark-theme-preferences.png`

### GAP-077 — Desktop exposes the supported memory policy controls without fabricated imports

- **Status:** Done
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · macOS desktop · Settings > Capabilities — Memory + General

**Gap**

The current Memory surface includes native-backed enablement, automatic saving, and tool-assisted memory controls. Cross-provider import, connector search, and other reference-specific behaviors have no ingestion or authorization contract and are intentionally not presented as working controls.

**Evidence**

apps/desktop/src/features/settings/MemorySettings.tsx and the memory preference actions in settingsStore.ts expose and synchronise the supported memory policy. Repository searches find no provider-import adapter, connector-memory search contract, provenance format, or rollback lifecycle that could safely back the additional reference controls.

**Suggested fix**

Closed for the supported scope. Keep real memory policy controls available; add provider import or connector search only with typed ingestion, provenance, deduplication, deletion, authorization, and rollback contracts.

**Reference screenshot(s)**

- `claude_reference/146-claude-desktop-settings-capabilities-memory-tools.png`

### GAP-078 — Desktop Chrome enablement and site-policy controls are declined because the extension owns enforcement

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · macOS desktop · Settings > Claude in Chrome

**Gap**

The Desktop AGI in Chrome tab reports the native bridge connection, while extension enablement and origin allowlisting are enforced in the browser extension. Duplicating switches in Desktop without a signed bridge command would create two disagreeing policy stores.

**Evidence**

apps/desktop/src/features/settings/tabs/AgiInChrome/index.tsx mounts BridgeStatusCard. apps/extension owns agi_site_allowlist and browser permission behavior. Current native bridge contracts expose status and context handoff but no authoritative Desktop mutation for extension enabled state or site policy.

**Suggested fix**

Not planned until a versioned authenticated bridge supports read, update, acknowledgement, conflict resolution, and revocation for the extension-owned policy.

**Reference screenshot(s)**

- `claude_reference/154-claude-desktop-settings-claude-in-chrome-permissions.png`

### GAP-079 — Local tool-runtime self-repair is declined without typed health and reinstall commands

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings > Configuration — Workspace Dependencies

**Gap**

A Diagnose or Reinstall button would perform privileged mutation. The native layer does not expose a bounded health report, verified package source, repair plan, progress, rollback, or restart result for the local tool runtime.

**Evidence**

Existing settings and runtime surfaces can report concrete MCP or provider failures, but repository searches find no generic tool-runtime diagnose/reinstall command or signed artifact verification path that Desktop can invoke safely.

**Suggested fix**

Not planned until native owns structured diagnostics and a platform-specific repair transaction with verified artifacts, explicit consent, progress, rollback, logs, and post-repair validation.

**Reference screenshot(s)**

- `chatgpt_reference/097-codex-macos-settings-configuration-approval-sandbox-model-features.png`

### GAP-080 — Trusted multi-device history is declined for single-session ephemeral pairing

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings > Connections

**Gap**

The companion protocol deliberately authorizes one active Desktop and Mobile role per short-lived session and does not persist reusable device credentials. A trusted-device list, revoke row, or last-connected timestamp would imply reusable access that does not exist.

**Evidence**

Desktop and Mobile connection stores keep singleton signaling, peer, data-channel, heartbeat, and session-key state and clear authority on disconnect. The signed cross-device contract has no durable device identity, token rotation, device inventory, or revoke-by-device operation.

**Suggested fix**

Not planned until a device authorization service provides independently revocable identities, encrypted refresh authority, history, expiry, rotation, active-target selection, and adversarial routing tests.

**Reference screenshot(s)**

- `chatgpt_reference/053-codex-macos-settings-connections-control-this-mac-devices.png`

### GAP-081 — A remote-control master switch is declined while no durable listener exists

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings > Connections > Control this Mac

**Gap**

Current inbound companion control begins through an explicit ephemeral pairing session and ends on disconnect; there is no background reusable-access listener to leave enabled. A saved Allow connections switch would not gate any durable authority.

**Evidence**

MobileCompanionPanel starts the supported pairing flow and exposes Disconnect. Connection state and session keys are process/session scoped, and native settings expose no global companion listener enable flag or rejection policy.

**Suggested fix**

Not planned for ephemeral pairing. Add a kill switch only with a durable inbound connection service, default-off policy, native enforcement, paired-device count, immediate teardown, and restart tests.

**Reference screenshot(s)**

- `chatgpt_reference/032-codex-macos-settings-connections-control-this-mac-allow-toggle.png`

### GAP-082 — Startup, global voice, menu-bar, and keep-awake toggles are declined without native lifecycle owners

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · macOS desktop · Settings > Desktop app > General

**Gap**

These settings require platform-native autostart registration, global shortcut ownership, tray/window lifecycle, and power assertions. The current Tauri command surface does not expose the complete set, so renderer toggles would persist promises the operating system never applied.

**Evidence**

GeneralSettings and the native command inventory have no verified run-on-startup, keep-awake, or menu-bar-visibility transaction with rollback. Voice settings own in-app capture rather than an OS-global voice shortcut lifecycle.

**Suggested fix**

Not planned until native implements each capability with support detection, permission/error state, rollback, startup restoration, and macOS lifecycle tests. Land controls one capability at a time with its native owner.

**Reference screenshot(s)**

- `claude_reference/155-claude-desktop-settings-desktop-general-shortcuts.png`

### GAP-083 — Desktop Connections exposes the live local MCP workspace and server configuration

- **Status:** Done
- **Owner:** Desktop
- **Surface/type:** desktop · missing-screen
- **Reference:** Claude · web · Settings > Developer > Local MCP servers list + detail panel

**Gap**

The audit premise is stale: Desktop settings mounts the production MCPWorkspace, which lists configured servers and exposes status, command/configuration, logs, editing, enablement, restart, and removal behaviors supported by the native MCP manager.

**Evidence**

apps/desktop/src/features/settings/tabs/Connections/index.tsx mounts MCPWorkspace. apps/desktop/src/features/mcp/MCPWorkspace.tsx and its server/configuration components own the list, detail, status, logs, edit, restart, enable, and remove flows against the existing native API.

**Suggested fix**

Closed as stale. Keep MCP server lifecycle inside MCPWorkspace and avoid duplicating server state in a second settings implementation.

**Reference screenshot(s)**

- `claude_reference/158-claude-web-settings-developer-mcp-filesystem-server-detail.png`

### GAP-084 — Prevent-sleep is declined until native power assertions are implemented

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** ChatGPT · macOS desktop · Settings > General

**Gap**

A renderer preference cannot keep a Mac awake. No native task-bound power assertion, crash cleanup, reference counting, or visible active state exists, so a toggle would create false reliability for long tasks.

**Evidence**

Repository searches find no Tauri power-management command consumed by Agent execution and no lifecycle that acquires and releases an assertion around active runs.

**Suggested fix**

Not planned until native owns task-bound acquire/release, crash and quit cleanup, multiple-run reference counting, battery disclosure, unsupported-platform behavior, and integration tests.

**Reference screenshot(s)**

- `chatgpt_reference/091-chatgpt-macos-settings-general-permissions-full-access-defaults.png`

### GAP-085 — Menu-bar persistence is declined until tray and close semantics are native-backed

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** ChatGPT · macOS desktop · Settings > General

**Gap**

Showing in the menu bar changes macOS application lifecycle and whether closing a window quits or hides. Desktop has no supported tray preference contract with reliable restore and quit behavior, so a switch would be inert or misleading.

**Evidence**

Settings and the current renderer bridge expose no menu-bar visibility mutation or acknowledged close-window lifecycle preference. Existing window controls do not establish a persistent background tray owner.

**Suggested fix**

Not planned until native implements tray creation/removal, close-versus-quit semantics, launch restoration, explicit Quit, update behavior, and platform tests.

**Reference screenshot(s)**

- `chatgpt_reference/091-chatgpt-macos-settings-general-permissions-full-access-defaults.png`

### GAP-086 — Desktop send behavior is configurable and persisted

- **Status:** Done
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings > General — Composer

**Gap**

General settings now lets users choose Enter to send with Shift+Enter for a newline, or Command/Ctrl+Enter to send with Enter for a newline. The shared composer consumes the persisted preference and labels the send affordance accordingly.

**Evidence**

GeneralSettings.tsx renders the Send shortcut selector. chatPrefs.ts and settingsStore.ts persist sendShortcut with a versioned migration. DesktopShellV3.tsx passes composerSendShortcut to ChatInterface; ChatInput.tsx enforces it and SendButton.tsx exposes the matching label. ChatInput.workScope.test.tsx covers both key modes.

**Suggested fix**

Completed. Keep keyboard behavior and accessible send labels driven from the same preference so displayed and executed shortcuts cannot diverge.

**Reference screenshot(s)**

- `chatgpt_reference/092-codex-macos-settings-general-composer-notifications-popout.png`

### GAP-087 — Queue versus Steer follow-ups are declined without executor semantics

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-interaction
- **Reference:** Codex · macOS desktop · Settings > General — Composer

**Gap**

The current run contract does not define a queued follow-up or an in-flight steering event. A composer preference could not guarantee ordering, cancellation, replay, or what context the active agent observes.

**Evidence**

Desktop chat and native workflow events have send, status, tool, approval, and cancellation behavior but no typed queue-item or steer-current-run operation and no persisted ordering contract.

**Suggested fix**

Not planned until the executor defines both operations, acknowledgement, ordering, race handling, cancellation, recovery after restart, and mode-specific UI state.

**Reference screenshot(s)**

- `chatgpt_reference/092-codex-macos-settings-general-composer-notifications-popout.png`

### GAP-088 — Desktop notification settings expose native completion, attention, permission, and reminder scopes

- **Status:** Done
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings > General — Notifications

**Gap**

Notification settings now map the actual native enabled_types contract into understandable controls for task completion, failures or input needed, permission and system alerts, and reminders, alongside master notifications and badge behavior.

**Evidence**

NotificationsSettings.tsx reads and writes the native notification config fields enabled, badge_enabled, and enabled_types, treating an empty enabled_types array as the backend's all-types default. NotificationsSettings.test.tsx verifies category projection and persistence.

**Suggested fix**

Completed for the native event vocabulary. Add future categories only when a producer and native delivery type exist, then extend the same mapping and tests.

**Reference screenshot(s)**

- `chatgpt_reference/092-codex-macos-settings-general-composer-notifications-popout.png`

### GAP-089 — Unbinding shortcuts is declined until shortcut ownership is reconciled

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-state
- **Reference:** Codex · macOS desktop · Settings > Keyboard shortcuts

**Gap**

The visible settings catalog and the Rust/global shortcut store do not currently share a complete action ID and dispatch contract. Allowing an empty binding in only the renderer would report an action as unbound while another owner could still handle its default.

**Evidence**

KeybindingsSettings reads the Desktop shortcut definitions, while native shortcut persistence and runtime dispatch cover a different subset and generic useShortcutActions does not own every listed action. The current capture flow safely rejects conflicts but has no authoritative disabled state.

**Suggested fix**

Not planned as a cosmetic clear action. First unify action IDs, owner, defaults, persistence, global versus window scope, and dispatch; then add an explicit disabled value with migration and end-to-end no-dispatch tests.

**Reference screenshot(s)**

- `chatgpt_reference/101-codex-macos-settings-keyboard-shortcuts-chat-navigation-basics.png`

### GAP-090 — Keyboard-shortcut conflict guidance matches enforced behavior

- **Status:** Done
- **Owner:** Desktop
- **Surface/type:** desktop · missing-copy
- **Reference:** Codex · macOS desktop · Settings > Keyboard shortcuts

**Gap**

The shortcut tips no longer claim that a most-recent assignment wins. They accurately state that an already-used shortcut cannot be assigned until its conflict is changed.

**Evidence**

apps/desktop/src/features/settings/KeybindingsSettings.tsx now describes the rejecting conflict behavior implemented by its capture flow instead of promising precedence the code does not support.

**Suggested fix**

Completed. Keep instructional copy pinned to the actual conflict resolver if shortcut ownership is redesigned.

**Reference screenshot(s)**

- `chatgpt_reference/101-codex-macos-settings-keyboard-shortcuts-chat-navigation-basics.png`

### GAP-091 — Direct chat-switch shortcuts are declined without a canonical runtime dispatcher

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-interaction
- **Reference:** Codex · macOS desktop · Settings > Keyboard shortcuts — chat switching

**Gap**

Next, previous, recent-history, and numbered jumps require one authoritative visible-conversation ordering and shortcut dispatcher. Current sidebar grouping, projects, pinning, search, and generic shortcut settings do not share that contract.

**Evidence**

DEFAULT_SHORTCUTS has no chat-switch actions, ConversationRow exposes no assigned key, and the current shortcut action layer does not own Sidebar's grouped ordering or project membership. Search remains the supported keyboard navigation route.

**Suggested fix**

Not planned until shortcut ownership is unified and Sidebar publishes a deterministic accessible conversation order with focus, archived/project filtering, conflict, and remapping semantics.

**Reference screenshot(s)**

- `chatgpt_reference/102-codex-macos-settings-keyboard-shortcuts-tab-chat-switching.png`

### GAP-092 — Model-training and location toggles are declined because neither data use exists

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · macOS desktop · Settings > Privacy

**Gap**

agiworkforce does not train an AGI-owned model on customer conversations, and Desktop has no coarse-location collection or consumer. Persisted toggles would imply optional processing pathways that do not exist and could make the always-off policy less clear.

**Evidence**

docs/00-foundation/platform-constitution.md states that AGI is not a foundation-model company. Product privacy pages state that customer conversation content is not used to train AGI-owned models. Repository searches find no training-data pipeline, improve-model preference consumer, coarse-location collection, or location-metadata flag.

**Suggested fix**

Not planned while both purposes are absent. Keep privacy text explicit that model training is always off and location is not collected for personalization; add consent only alongside a separately approved purpose and end-to-end enforcement.

**Reference screenshot(s)**

- `claude_reference/142-claude-desktop-settings-privacy-data-controls-export-sharing.png`

### GAP-093 — A dictation dictionary is declined until transcription providers support a shared bias contract

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings > Voice — Dictation dictionary

**Gap**

Desktop supports multiple transcription paths with different vocabulary-bias mechanisms. Saving words without feeding every active provider and the correction pass would create a control that appears effective but is silently ignored.

**Evidence**

VoiceSettings configures provider, local Whisper models, and post-processing, but current request adapters expose no normalized phrase-list or initial-prompt field and no capability metadata for providers that cannot bias recognition.

**Suggested fix**

Not planned until a typed vocabulary contract defines normalization, limits, per-provider adapters, unsupported-provider disclosure, local storage privacy, deletion, and transcription tests.

**Reference screenshot(s)**

- `chatgpt_reference/096-codex-macos-settings-voice-dictation-hotkeys-dictionary.png`

### GAP-094 — A broad Desktop Browser settings page is declined without one browser runtime owner

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-screen
- **Reference:** Codex · macOS desktop · Settings › Browser

**Gap**

Existing browser views, execution automation, system link opening, and the Chrome extension are separate capabilities. Desktop has no single cookie jar, autofill store, download manager, clear-data operation, or navigation-control policy to back the reference settings.

**Evidence**

BrowserViewer, BrowserPanel, execution browser events, and the extension use different stores and trust boundaries. Repository searches find no Desktop-owned browsing-data inventory, cookie clear command, downloads-location contract, or browser autofill manager.

**Suggested fix**

Not planned until a dedicated browser service owns session isolation, storage, control enablement, navigation destination, clear-data scopes, downloads, autofill, retention, and audit semantics.

**Reference screenshot(s)**

- `chatgpt_reference/113-codex-macos-settings-browser-general-autofill-downloads.png`

### GAP-095 — Desktop per-site browser policy is declined until origin enforcement is shared

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings › Browser (permissions & developer mode)

**Gap**

The extension owns its current site allowlist, while Desktop terminal network domains apply to a different sandbox. A second per-origin list or approval dropdown in Desktop would not constrain either owner consistently.

**Evidence**

apps/extension owns agi_site_allowlist and browser permissions. AgentExecutionSettings allowed network domains constrain terminal execution, not browser navigation. The native bridge has no normalized origin-policy read/update/evaluate contract.

**Suggested fix**

Not planned until a shared authority defines origin normalization, ask/allow/block decisions, redirects, private-network handling, extension synchronisation, revocation, and audit tests.

**Reference screenshot(s)**

- `chatgpt_reference/114-codex-macos-settings-browser-permissions-developer-mode-cdp.png`

### GAP-096 — Connections remains intentionally limited to supported inbound ephemeral pairing

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-ia
- **Reference:** Codex · macOS desktop · Settings › Connections › Control this Mac

**Gap**

Settings now mounts the real Control this Mac pairing flow. Outbound-device, SSH, and reusable device-history tabs are declined because no corresponding production runtime or durable device authorization exists.

**Evidence**

apps/desktop/src/features/settings/tabs/Connections/index.tsx mounts MobileCompanionPanel and MCPWorkspace. Current cross-device contracts support the ephemeral inbound companion session; repository searches find no outbound-device controller, SSH session owner, or reusable device inventory.

**Suggested fix**

Not planned beyond the supported inbound flow. Add tabs only alongside implemented, authenticated runtimes and move device history here if a durable device service is introduced.

**Reference screenshot(s)**

- `chatgpt_reference/117-codex-macos-settings-connections-control-this-mac-iphone.png`

### GAP-097 — Connections master allow is declined for the same ephemeral pairing boundary

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings › Connections › Control this Mac

**Gap**

There is no durable remote-access listener to disable globally: a user explicitly starts pairing and can disconnect the single active peer. Persisting an Allow connections switch would not gate reusable access.

**Evidence**

The Connections tab mounts MobileCompanionPanel's explicit pair/disconnect lifecycle. Connection stores clear singleton session authority on disconnect and expose no native master-listener setting.

**Suggested fix**

Not planned until durable inbound access exists. If introduced, the master switch must be native-enforced, default safe, terminate active sessions immediately, and remain independent of per-device revocation.

**Reference screenshot(s)**

- `chatgpt_reference/117-codex-macos-settings-connections-control-this-mac-iphone.png`

### GAP-098 — Agent Git policy settings are declined until push and PR consumers are authoritative

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-screen
- **Reference:** Codex · macOS desktop · Settings › Git

**Gap**

Branch prefix, merge strategy, force push, draft PR, and generated-text instructions must constrain actual git and remote-provider operations. Current Desktop git is local-operation focused and has no shared agent branch/PR policy consumer.

**Evidence**

GitPanel and api/git.ts expose local status, diff, commit, pull, and push primitives. Repository searches find no agent-created branch owner, provider-neutral PR creation policy, merge-method consumer, or commit/PR prompt pipeline reading these settings.

**Suggested fix**

Not planned until an agent git service owns branch creation, guarded force-with-lease, remote PR creation, merge policy, instruction injection, audit, and repository-level overrides.

**Reference screenshot(s)**

- `chatgpt_reference/118-codex-macos-settings-git-branch-prefix-pr-instructions.png`

### GAP-099 — Lifecycle hooks are declined until a sandboxed hook runtime exists

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-screen
- **Reference:** Codex · macOS desktop · Settings › Hooks (empty state)

**Gap**

The product has no lifecycle-hook execution contract. A Hooks settings screen would either be an empty placeholder or invite arbitrary command configuration without ownership, sandboxing, consent, timeout, secrets, and audit controls.

**Evidence**

The former hooks store is recorded as deleted dead code, and searches find no PreToolUse, PostToolUse, session hook resolver, plugin hook registry, or native hook executor.

**Suggested fix**

Not planned until a reviewed hook runtime defines events, precedence, project trust, command sandbox, environment/secrets policy, confirmation, timeout, failure behavior, logs, disable/recovery, and plugin provenance.

**Reference screenshot(s)**

- `chatgpt_reference/116-codex-macos-settings-hooks-empty-state-no-hooks.png`

### GAP-100 — Shortcut Unassigned state is declined until renderer and native shortcut stores converge

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-state
- **Reference:** Codex · macOS desktop · Settings › Keyboard shortcuts

**Gap**

This duplicate of GAP-089 depends on the same missing ownership contract. Rendering Unassigned or writing an empty renderer value cannot guarantee that native/global or default dispatch has stopped.

**Evidence**

KeybindingsSettings, DEFAULT_SHORTCUTS, native shortcut persistence, and runtime action dispatch cover different action subsets. No end-to-end disabled-binding representation is consumed by every owner.

**Suggested fix**

Not planned independently. Resolve GAP-089's shortcut ownership and then implement one explicit disabled state, clear action, migration, conflict release, and no-dispatch verification across renderer and native handlers.

**Reference screenshot(s)**

- `chatgpt_reference/105-codex-macos-settings-keyboard-shortcuts-undo-redo-approve-close-tab.png`

### GAP-101 — Live native tool approvals support Return to approve and Escape to deny

- **Status:** Done
- **Owner:** Desktop
- **Surface/type:** desktop · missing-interaction
- **Reference:** Codex · macOS desktop · Settings › Keyboard shortcuts

**Gap**

The blocking native MCP approval prompt can now be resolved by keyboard while it is active. Return approves and Escape denies, repeated events and text-entry targets are ignored, and the button labels show the available keys.

**Evidence**

apps/desktop/src/features/chat/McpToolConfirmationPrompt.tsx installs a modal-scoped key handler and sends the decision through the existing native response path. DesktopShellV3.test.tsx verifies approve and deny against real pending native tool-confirmation state.

**Suggested fix**

Completed for the authoritative live MCP approval surface. Reuse the same modal-scoped pattern for any future native approval owner rather than dispatching through the currently disconnected generic shortcut catalog.

**Reference screenshot(s)**

- `chatgpt_reference/105-codex-macos-settings-keyboard-shortcuts-undo-redo-approve-close-tab.png`

### GAP-102 — Plugin disable switches are declined without authoritative installed-plugin state

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings › Plugins

**Gap**

The current plugin surface cannot reliably enumerate account-installed plugins or enforce an enabled flag in tool and command resolution. A switch on local rows would not disable hosted integration behavior and could create a false security boundary.

**Evidence**

SkillsPluginsSettings exposes locally resolved plugin metadata and update/remove affordances, while the hosted marketplace store disables install lifecycle. No shared installed-plugin entity or resolver contract consumes a per-account enabled flag.

**Suggested fix**

Not planned until the plugin lifecycle owns installed identity, scope, enabled state, tool and command resolution, connector revocation, synchronisation, audit, and rollback.

**Reference screenshot(s)**

- `chatgpt_reference/112-codex-macos-settings-plugins-plugin-list-toggles-on.png`

### GAP-103 — Credits purchase and auto-reload are declined without billing product contracts

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings › Usage & billing

**Gap**

Desktop can show subscription facts and open the authoritative Stripe billing portal, but there is no top-up price catalog, credit checkout session, balance ledger mutation, threshold rule, payment mandate, or auto-reload API.

**Evidence**

BillingSettings.tsx presents plan/subscription data and Manage billing. CreditsSection is read-only, and App.tsx routes top-up intent to Billing. Repository searches find no typed buy-credit or auto-reload contract that could safely execute these controls.

**Suggested fix**

Not planned until Billing owns price and entitlement definitions, checkout, webhook reconciliation, credit ledger, auto-reload consent and limits, failure notifications, cancellation, refunds, and tenant-isolation tests.

**Reference screenshot(s)**

- `chatgpt_reference/109-codex-macos-settings-billing-plan-credits-usage-limits.png`

### GAP-104 — Desktop deliberately keeps project membership in Projects and navigation in flat Recents

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-ia
- **Reference:** Codex · macOS desktop · Sidebar projects with nested chats

**Gap**

Desktop's information architecture uses the Projects workspace to inspect project membership and a single time-grouped Recents list for conversation navigation. Nesting the same chats under projects would duplicate rows, hide cross-project chronology, and require ambiguous placement for moved or unscoped conversations.

**Evidence**

Sidebar.tsx renders top-level ProjectRow entries and one chronological Recents owner; AgiWorkProjects owns project conversation membership and opening. DesktopShellV3.test.tsx verifies project selection updates both conversation and project membership.

**Suggested fix**

Not planned for the current IA. Keep project membership in the Projects workspace and Recents as the canonical conversation navigator; revisit only with usability evidence and one-row ownership rules for pinned, moved, archived, and unscoped chats.

**Reference screenshot(s)**

- `chatgpt_reference/083-codex-macos-sidebar-nav-projects-recent-chats.png`

### GAP-105 — An MFA gate is declined until the account service publishes verified MFA state

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-state
- **Reference:** Codex · macOS desktop · Turn on Multi-Factor Authentication gate modal

**Gap**

Blocking remote pairing on a renderer assumption would be insecure and could lock users out. Desktop has no authenticated MFA-enrolled fact, step-up challenge, recovery lifecycle, or server-enforced remote-control policy to evaluate.

**Evidence**

Desktop auth/account contracts do not expose verified MFA status or a step-up token. The existing Web TwoFactor surface states that authenticator enrollment is not implemented, and companion pairing has no signed MFA claim.

**Suggested fix**

Not planned until the account service implements enrollment, recovery, verified status, step-up, and server-side policy enforcement, and the signed companion authorization binds that proof before session creation.

**Reference screenshot(s)**

- `chatgpt_reference/033-codex-macos-settings-connections-mfa-required-modal.png`

### GAP-106 — Empty recorder captures provide diagnosis and immediate recovery

- **Status:** Done
- **Owner:** Desktop
- **Surface/type:** desktop · missing-state
- **Reference:** Claude · macOS desktop · Unusable-capture failure response

**Gap**

A zero-action recording now produces a structured result rather than a terse destructive alert. It explains the signals available, offers Record again, and can return to chat with a concrete description prompt already seeded.

**Evidence**

ActionRecorder.tsx owns the emptyCapture state, signal-based bullets, Record again action, and Describe it instead composer handoff. ActionRecorder.test.tsx verifies both recovery paths.

**Suggested fix**

Completed for the signals the current recorder can truthfully observe. Extend diagnosis only alongside new captured signals such as frame validity or focus transitions.

**Reference screenshot(s)**

- `references-2/claude-desktop-cowork-record-skill-09-black-capture-failure-response.png`

### GAP-107 — Composer exposes the native-backed access scope at point of use

- **Status:** Done
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** ChatGPT · macOS desktop · Work mode empty state — composer permission chip

**Gap**

The same composer policy chip that closes GAP-056 makes read-only, workspace-write, full-access, and sandbox-off posture visible next to provider/environment context before every send.

**Evidence**

ComposerContextControls.tsx derives its label and severity from executionPreferences.terminalSandbox and opens Agent Execution settings. DesktopShellV3.tsx mounts it through ChatInterface composerHostControls; focused component and shell tests cover the seam.

**Suggested fix**

Completed. Preserve a single native-backed access-policy projection so duplicated composer implementations cannot drift from the executor.

**Reference screenshot(s)**

- `chatgpt_reference/088-chatgpt-macos-work-mode-empty-state-quick-actions.png`

### GAP-108 — Hosted cloud-browser settings are declined without a browser runtime

- **Status:** Not Planned
- **Owner:** Web
- **Surface/type:** web · missing-screen
- **Reference:** ChatGPT · web · Cloud browser

**Gap**

The reference manages permissions and cookies for a hosted browsing runtime. AGI Workforce Web has no hosted browser session, browser-owned cookie jar, origin-permission evaluator, or clear-data operation. Desktop Computer Use approves native applications and is a different trust boundary. Adding a Web settings page would therefore persist controls that no runtime reads and imply that AGI stores browser cookies when it does not.

**Evidence**

Repository searches find no hosted browser session or cookie-store service on Web. apps/desktop/src/features/settings/ComputerUseSettings.tsx manages native application automation rather than sites or origins. The Web settings route inventory has no browser owner, and the API surface has no site-policy or browser-data endpoint.

**Suggested fix**

Not planned until a tenant-owned hosted browser service defines isolated cookie storage, origin normalization, ask/allow/block enforcement, per-site overrides, retention, clear-data semantics, audit records, SSRF and redirect handling, and cross-tenant tests. Do not reuse Desktop Computer Use policies for a different runtime.

**Reference screenshot(s)**

- `chatgpt_reference/137-chatgpt-web-settings-cloud-browser-default-permissions-site-cookies.png`

### GAP-109 — Web Tasks provides persistent per-task Outputs/Progress/Context details

- **Status:** Done
- **Owner:** Web
- **Surface/type:** web · missing-control
- **Reference:** Claude · web · Cowork task view right-side Outputs/Progress/Context panel

**Gap**

The shared Web Tasks surface now keeps a persistent responsive detail panel beside the selected AGI Work task. It projects only safe durable journal events into Progress, aggregates generated artifacts into Outputs with per-file actions, and shows durable context-compaction summaries plus an explicit source-chat path. The current durable run contract does not persist a trustworthy input filename or folder manifest, so the Context section states that boundary instead of fabricating referenced paths.

**Evidence**

packages/ui/unified-chat/src/components/tasks/TasksPage.tsx selects a task without implicit chat navigation, paginates up to 4,000 durable journal events, supports refresh and cancellation state, and renders TaskDetailPanel.tsx. TaskDetailPanel.tsx uses the shared applyAgentActivityEvent projector, exposes Progress/Outputs/Context sections, permits Download and open only for same-origin /api/files assets, and links to the source conversation for exact attachments. TasksPage.details.test.tsx covers durable progress, artifacts, context, safe file links, explicit source-chat navigation, and multi-page journals; the full unified-chat suite passes 59 files and 739 tests.

**Suggested fix**

Completed. Keep the durable journal and shared activity projector authoritative, never expose private reasoning, never open arbitrary artifact URIs, and add input filenames or folder paths only after an owner-scoped durable manifest exists rather than deriving them from untrusted tool arguments.

**Reference screenshot(s)**

- `claude_reference/183-claude-web-cowork-task-outputs-benchmark-spec-files.png`

### GAP-110 — Web Data Controls provides owner-scoped bulk chat and link management

- **Status:** Done
- **Owner:** Web
- **Surface/type:** web · missing-control
- **Reference:** ChatGPT · web · Data controls — bulk chat management

**Gap**

Privacy now has four conversation-specific controls separate from account deletion: Shared links and Archived chats open real managers, Archive all chats moves every live conversation out of the sidebar, and Delete all chats permanently soft-deletes active plus archived conversations after confirmation. Delete all is disabled while this client has an active reply so a visible turn cannot be silently removed.

**Evidence**

PrivacySection.tsx renders the four rows and consumes applyBulkConversationAction. POST /api/chat/conversations/bulk validates archive_all, delete_all, or delete_archived, scopes its single atomic UPDATE to the authenticated user, rate-limits and CSRF-protects the mutation, and releases returned conversation sandboxes after deletes. SharedLinksSection uses the existing owner-scoped GET /api/share index and DELETE /api/share/[token] revoke path. ArchivedChatsSection uses the archived-only conversation index and existing per-chat update/delete contracts. Route, service, and UI tests cover owner predicates, action predicates, confirmations, store reconciliation, and manager transitions.

**Suggested fix**

Completed. Keep new conversation-wide mutations atomic and owner-scoped, keep deletion separate from full-account deletion, and preserve sender/runtime cleanup when future per-conversation resources are added.

**Reference screenshot(s)**

- `chatgpt_reference/136-chatgpt-web-settings-data-controls-archive-delete-export-chats.png`

### GAP-111 — Device-auth consent shows the signed-in account and authoritative requesting client

- **Status:** Done
- **Owner:** Web
- **Surface/type:** web · missing-copy
- **Reference:** Codex · iOS · Device-authorization consent

**Gap**

The approval page now identifies the signed-in account, supports switching accounts, and blocks approval until a protected server lookup verifies the pending code. It names the server-owned client surface, lists the account and Managed Cloud scopes, and links Terms and Privacy without trusting the URL surface hint.

**Evidence**

apps/web/app/api/auth/device/code/route.ts adds a signed-in, rate-limited, no-store lookup that resolves client identity from the server catalog and returns explicit scopes. apps/web/app/auth/device/page.tsx runtime-validates that response, renders the account/client/scope consent UI, and keeps approval disabled until verification. route.test.ts and page.test.tsx cover lookup security, expiry, account switching, scope copy, legal links, and approval gating.

**Suggested fix**

Completed. Preserve the signed-in lookup, fixed client catalog, runtime response validation, and approval gate if device scopes or client surfaces evolve.

**Reference screenshot(s)**

- `chatgpt_reference/037-codex-ios-oauth-consent-webview-confirm-account-codex-remote.png`

### GAP-112 — Chats and Tasks remain separate because their lifecycle and actions differ

- **Status:** Not Planned
- **Owner:** Web
- **Surface/type:** web · missing-ia
- **Reference:** Claude · web · Home > Chats and tasks unified list

**Gap**

The reference mixes conversations and background tasks in one list. AGI Workforce keeps chat history and durable task runs separate because they have different identifiers, state machines, retention, mutation actions, and navigation targets. A cosmetic merged list would make archive/delete/select semantics ambiguous and cannot provide atomic bulk behavior across the two owners.

**Evidence**

apps/web/features/chat/v3/WebSidebar.tsx consumes conversation records and conversation mutations. apps/web/features/tasks/components/TasksPage.tsx consumes task/run status and task-specific navigation. The APIs, stores, filters, and destructive actions are separately owned; no shared cursor, unread contract, or cross-entity bulk mutation exists.

**Suggested fix**

Not planned on the current contracts. Reconsider a unified activity index only after the backend publishes a stable discriminated feed with cursor ordering, unread semantics, owner-scoped search, per-kind actions, cross-kind bulk-operation rules, and deep-link tests. Keep the two honest destinations until then.

**Reference screenshot(s)**

- `claude_reference/165-claude-web-home-chats-and-tasks-recents-list-with-tasks.png`

### GAP-113 — A unified Directory is declined while catalogs have different authority and lifecycle

- **Status:** Not Planned
- **Owner:** Web
- **Surface/type:** web · missing-screen
- **Reference:** Claude · web · Plugin directory browse (unified Directory modal)

**Gap**

Skills, connectors, and plugins are not three views over one installable catalog in AGI Workforce. Managed skills are read-only deployment metadata, connectors have account-owned OAuth/custom connection state, and plugins are a public catalogue-shape preview with installation disabled. Combining them in an install-shaped modal would erase those trust boundaries and fabricate author, download, entitlement, or installed-state metadata.

**Evidence**

apps/web/features/plugins/stores/plugin-store.ts hard-disables installation and returns no installed plugins. apps/web/app/plugins/page.tsx repeatedly labels the catalog a preview. Skills and connectors use separate authenticated services and purpose-built search/list surfaces with incompatible response shapes and mutations.

**Suggested fix**

Not planned until a server-owned directory contract provides typed entries, source provenance, entitlement, versioning, install/uninstall state, connector authorization, permission review, metrics definitions, pagination, and account isolation across all three kinds. Preserve the separate honest surfaces meanwhile.

**Reference screenshot(s)**

- `claude_reference/162-claude-web-plugin-directory-browse-anthropic-category-cards-grid.png`

### GAP-114 — Web and Mobile enforce Reduce sensitive content before model dispatch

- **Status:** Done
- **Owner:** Web
- **Surface/type:** web · missing-control
- **Reference:** ChatGPT · web · Safety

**Gap**

Web now has a dedicated account-synced Settings > Safety control for Reduce sensitive content, while Mobile retains the same already-enforced control in Safety & Security. Both surfaces use one deterministic strict-content policy and block only clearly explicit or harmful how-to prompts; educational, medical, journalistic, and support-seeking discussion remains available. The setting is accurately described as prompt admission, not conversation monitoring, trusted-contact notification, or an emergency-service substitute.

**Evidence**

packages/contracts/types/src/content-safety.ts owns the shared policy and tests. apps/mobile/lib/contentFilter.ts delegates to it while preserving Mobile refusal copy, and chatExecutionStore.ts enforces it before Local or Managed Cloud dispatch. apps/web/features/settings/sections/SafetySection.tsx persists the account safety namespace; managed-content-safety-service.ts validates the owner-scoped user_settings document; request-processor.ts enforces the preference before attachment hydration or provider work and fails closed if it cannot be verified. SafetySection.test.tsx, managed-content-safety-service.test.ts, request-processor.content-safety.test.ts, Mobile content-filter/safety/chat tests, and the full Mobile suite cover persistence, blocked and allowed prompts, refusal behavior, and the no-provider-on-failure boundary.

**Suggested fix**

Completed. Keep the shared deterministic policy as the single pattern owner, enforce Web from the owner-scoped server preference before provider dispatch, enforce Mobile before both Local and Cloud dispatch, fail closed when an enabled account policy cannot be verified, and keep the non-monitoring boundary explicit.

**Reference screenshot(s)**

- `chatgpt_reference/139-chatgpt-web-settings-safety-reduce-sensitive-content-toggle.png`

### GAP-115 — Passkey and multi-device controls are explicitly unavailable pending account contracts

- **Status:** Not Planned
- **Owner:** Web
- **Surface/type:** web · missing-control
- **Reference:** ChatGPT · web · Security and login

**Gap**

Web Security already keeps the authenticator switch disabled because enrollment is not mounted. It now also states that passkeys, security keys, SMS MFA, trusted-device lists, and cross-device session revocation are outside the current account contract, and that authenticator enrollment remains read-only until verification and recovery are complete. No editable control is rendered for unsupported state.

**Evidence**

SecuritySection.tsx renders the Current account boundary disclosure on the mounted /settings/security surface. TwoFactor.tsx keeps the authenticator switch disabled and explains its read-only status. The repository has TOTP status/setup APIs but no mounted enrollment ceremony, WebAuthn credential API/schema, SMS factor lifecycle, trusted session inventory, or cross-device revoke endpoint. SettingsCapabilityBoundaries.test.tsx pins the visible boundary.

**Suggested fix**

Not planned until account-owned APIs support credential identifiers, WebAuthn challenge/origin validation, verified factor enrollment and removal, recovery, rate limits, trusted device/session metadata, independent revocation, audit events, and adversarial auth tests. Keep unsupported controls visibly absent or read-only.

**Reference screenshot(s)**

- `chatgpt_reference/140-chatgpt-web-settings-security-login-password-passkeys-mfa-sessions.png`

### GAP-116 — Coding-session preferences are declined without a mounted Web code-session product

- **Status:** Not Planned
- **Owner:** Web
- **Surface/type:** web · missing-screen
- **Reference:** Claude · web · Settings > Claude Code appearance & behavior preferences

**Gap**

The reference configures a dedicated coding-session runtime. AGI Workforce Web has bounded code capability inside chat but no mounted repository worktree, diff-review session, code-specific safety classifier, or authoritative light/dark diff-theme consumer. A settings section would save values that no Web code surface reads.

**Evidence**

The mounted Web settings inventory contains capabilities but no code-session owner. Web chat code execution returns bounded generated artifacts rather than repository state. Repository searches find no mounted Web diff-theme, code-font, high-contrast code, session classifier, or safety-model-switch preference consumer.

**Suggested fix**

Not planned until a Web coding-session product owns repository/worktree state, review rendering, theme/font consumption, session classification, and safety-model routing. Add preferences only with runtime consumers, synchronized defaults, accessibility tests, and account persistence.

**Reference screenshot(s)**

- `claude_reference/177-claude-web-settings-panel-claude-code-appearance-prefs.png`

### GAP-117 — Plugin installation remains explicitly closed until an account-owned marketplace exists

- **Status:** Not Planned
- **Owner:** Web
- **Surface/type:** web · missing-state
- **Reference:** Claude · web · Settings > Plugins empty state

**Gap**

The Web plugin surface is deliberately a catalogue preview, not an empty state for a working installer. It says installation is not open and that nothing installs; the persisted client store hard-disables install, uninstall, installed-list, and installed-state behavior. Enabling cosmetic Add controls would create local state without server entitlement, permission enforcement, or runtime deployment.

**Evidence**

apps/web/app/plugins/page.tsx labels the surface Catalogue preview and says hosted marketplace installation is not open and nothing installs. apps/web/features/plugins/stores/plugin-store.ts sets PLUGIN_INSTALLS_ENABLED false and makes install-related actions inert. No account-owned plugin installation API or runtime activation contract exists.

**Suggested fix**

Not planned for the current marketplace. Keep the preview explicit and installation controls absent until the server owns catalog identity, entitlement, versions, install/uninstall, connector/tool permissions, activation, rollback, audit history, and cross-client state.

**Reference screenshot(s)**

- `claude_reference/161-claude-web-settings-plugins-empty-state-browse-cta.png`

### GAP-118 — Archived Web conversations have a reachable restore and delete manager

- **Status:** Done
- **Owner:** Web
- **Surface/type:** web · missing-screen
- **Reference:** Codex · macOS desktop · Settings › Archived chats (empty state)

**Gap**

/settings/archived is a registered settings deep link backed by the Archived Chats modal section. It loads only the authenticated account's archived conversations in bounded pages, shows the explicit No archived chats empty state, restores individual chats to the sidebar, permanently deletes individual chats after confirmation, and can delete all archived chats atomically. Active replies block destructive archived deletion in the current client.

**Evidence**

ArchivedChatsSection.tsx owns loading, error, retry, pagination, restore, delete, delete-all, empty, and active-reply states. PrivacySection.tsx links to the manager. GET /api/chat/conversations accepts the validated archived=only filter while preserving the inclusive default used by the sidebar, and POST /api/chat/conversations/bulk implements delete_archived with user_id plus archived predicates. /settings/archived routes through SettingsModalRedirect and WebSettingsModal maps the hidden archived section. Focused route, service, and UI tests cover the list filter, empty state, restore, delete-all, store synchronization, and current-route cleanup.

**Suggested fix**

Completed for Web. Keep the archived-only query paginated and owner-scoped, and preserve explicit irreversible confirmations plus active-run guards for future bulk operations.

**Reference screenshot(s)**

- `chatgpt_reference/121-codex-macos-settings-archived-chats-empty.png`

### GAP-119 — Web Notifications exposes only the channel with a real sender

- **Status:** Not Planned
- **Owner:** Web
- **Surface/type:** web · missing-control
- **Reference:** ChatGPT · web · Settings › Notifications

**Gap**

Web has one enforced notification: a browser popup when a long-running reply finishes in a background tab. The mounted Notifications screen now explicitly says Browser replies only and lists email, task, schedule, project, usage, tips, and marketing channels as unavailable. It does not persist switches for nonexistent senders.

**Evidence**

NotificationsSection.tsx defines only browserReplyReady, persists it in the notifications namespace, and WebChatPage.tsx consumes it at response completion. The new Notification channel availability card explains why other categories are absent. SettingsCapabilityBoundaries.test.tsx verifies the visible boundary and account-sync status. Repository searches find no Web email dispatcher, service-worker push subscription lifecycle, or task/schedule/project channel consumer.

**Suggested fix**

Not planned until each channel has an authenticated sender, delivery target lifecycle, consent and unsubscribe semantics, event producer, retry/deduplication behavior, account-scoped preference consumer, and end-to-end delivery tests. Never add a preference before its sender reads it.

**Reference screenshot(s)**

- `chatgpt_reference/123-chatgpt-web-settings-notifications-codex-groupchats-marketing-top.png`

### GAP-120 — Trusted-contact escalation is declined without a verified consent and safety service

- **Status:** Not Planned
- **Owner:** Web
- **Surface/type:** web · missing-screen
- **Reference:** ChatGPT · web · Trusted contact

**Gap**

AGI Workforce has no contact-verification service, mutual opt-in, safety classifier and review policy, jurisdiction-aware escalation, notification dispatcher, or audit trail. Web Security now states Trusted contact · Not configured and explicitly says AGI does not monitor conversations to notify another person and sends no conversation content or automatic safety alerts. This avoids creating dangerous expectations with a cosmetic enrollment form.

**Evidence**

SecuritySection.tsx renders the trusted-contact boundary on the mounted settings surface, and SettingsCapabilityBoundaries.test.tsx pins it. Repository searches find no trusted-contact entity, consent lifecycle, crisis classifier, escalation review service, notification delivery owner, or revocation/audit flow.

**Suggested fix**

Not planned until a dedicated reviewed safety service provides mutual verified consent, adult policy, minimization and encryption, revocation/deletion, classifier limitations and human review, jurisdiction-aware resources, abuse prevention, delivery/audit guarantees, and legal plus clinical-safety review. Do not promise automatic escalation before then.

**Reference screenshot(s)**

- `chatgpt_reference/144-chatgpt-web-settings-trusted-contact-add-contact-safety.png`

### GAP-121 — Web Voice separates working dictation from unavailable managed voice

- **Status:** Done
- **Owner:** Web
- **Surface/type:** web · missing-state
- **Reference:** ChatGPT · web · Voice

**Gap**

The old page rendered fake Monthly allowance, Transcription model, and AI cleanup rows at reduced opacity even though no runtime consumed them. The replacement presents two direct states: composer dictation works today as reviewed push-to-talk text, while managed live voice is unavailable. It names the unsupported personas, models, intelligence, languages, metered minutes, and provider controls without imitating enabled settings.

**Evidence**

apps/web/app/settings/voice/page.tsx contains no hasVoice flag, disabled pointer-events panel, or Not available yet rows. It explains the working composer microphone, the live-conversation boundary, and the separate Desktop/CLI BYOK scope. page.test.tsx verifies both states, the absence of inert control copy, and the BYOK destination.

**Suggested fix**

Completed for the current voice runtime. Add persona, Model, Intelligence, Language, and allowance controls only after a managed live-voice service consumes them, with microphone consent, interruption handling, metering, entitlement, persistence, accessibility, and end-to-end browser tests.

**Reference screenshot(s)**

- `chatgpt_reference/131-chatgpt-web-settings-voice-spruce-voice-model-picker.png`

### GAP-122 — Chrome keeps the attach menu image-only until file and agent-mode contracts exist

- **Status:** Not Planned
- **Owner:** Extension
- **Surface/type:** extension · missing-control
- **Reference:** ChatGPT · Chrome extension · Composer '+' attach menu

**Gap**

Chrome exposes only the two attachment actions its Managed Chat contract can execute: a current-tab screenshot and user-selected images. The transport runtime-validates base64 PNG, JPEG, WebP, or GIF data URLs and has no generic-file asset upload, folder authorization, durable goal, plan-mode flag, or extension plugin registry. Adding the reference entries would either discard selected bytes, persist an objective no runner pursues, or imply Web catalogue capabilities run inside the browser extension.

**Evidence**

apps/extension/src/side_panel.ts builds Take a screenshot and Add an image and applies the eight-image attachment cap. managedChatHandler.ts and freeTrialClient.ts validate and serialize image-only attachments. chat-state.ts supplies image-specific fallback prompt copy. Repository searches find no Chrome generic-asset, folder-grant, background-goal, plan-mode, or plugin-runtime contract; the extension README keeps Chrome conversations browser-local and browser actions explicitly scoped.

**Suggested fix**

Not planned on the current Chrome contract. Add generic files only with typed upload, MIME/size, ownership, retention/deletion, preview, and provider-admission support; add goals or plan mode only with a persisted runner and visible lifecycle; add plugins only after an extension-owned capability registry and permission review exist. Keep the menu limited to executable actions meanwhile.

**Reference screenshot(s)**

- `chatgpt_reference/152-chatgpt-web-extension-attach-menu-files-goal-plugins.png`

### GAP-123 — Chrome uses approved sites and per-action approval instead of inert category or full-CDP controls

- **Status:** Not Planned
- **Owner:** Extension
- **Surface/type:** extension · missing-control
- **Reference:** Codex · macOS desktop · Settings > Computer use > Google Chrome

**Gap**

Chrome computer use has a different enforcement model from the reference: the user must approve an exact origin, Ask before acting defaults on, every pending action receives a nonce-bound allow or deny decision with a fail-closed timeout, and the debugger attaches for one bounded action before detaching. History, download, and upload tools are not present, and no unrestricted developer-mode CDP surface exists, so category dropdowns or a full-CDP toggle would save policy that no runtime consumes. Options now explicitly discloses the CDP boundary instead of hiding it.

**Evidence**

options.ts lists owner-managed approved origins and explains Chrome DevTools Protocol, explicit run initiation, default approval, per-action attach/detach, and the absence of unrestricted CDP developer mode. computerUsePanel.ts persists Ask before acting with a default-on UI. background.ts revalidates origin at run time, treats an unset approval preference as ask, validates approval responses from extension pages, and denies on timeout. cdpDriver.ts allowlists navigation and wraps each bounded call in attach/finally-detach. computer-use-default-ask.test.ts and computer-use-options-boundary.test.ts pin these boundaries.

**Suggested fix**

Not planned as reference-shaped category or developer-mode controls while those capabilities do not exist. If Chrome gains history, download, upload, or broader CDP tools, first define typed action categories, category-specific default-ask enforcement, per-origin overrides, migration, audit disclosure, optional permission policy, and adversarial bypass tests; do not add storage-only switches.

**Reference screenshot(s)**

- `chatgpt_reference/155-codex-macos-settings-computer-use-chrome-permissions-cdp.png`

### GAP-124 — Max reasoning plus Bypass Permissions requires compound-risk consent

- **Status:** Done
- **Owner:** VS Code
- **Surface/type:** extension-vscode · missing-state
- **Reference:** Codex · VS Code extension · 'Use Ultra with Full access?' compound-risk modal

**Gap**

The extension now treats Bypass Permissions plus Max reasoning as a distinct elevated state. Entering the pair from either direction opens a cancelable modal that names command, network-tool, granted-file, plan-limit, mistake, and prompt-injection impact. Cancel preserves the prior mode and effort; confirmation is remembered only while the exact elevated pair remains active, so leaving and re-entering requires fresh acknowledgement.

**Evidence**

apps/extension-vscode/src/features/permissions/agentModeConsent.ts owns both the base bypass consent and the Max-plus-Bypass compound-risk boundary. setAgentModeWithConsent and setAgentEffortWithConsent validate the resulting pair before either configuration write; raw settings edits fail closed to Auto or High and use the same modal before restoration. platform/config.ts, commandSetup.ts, ChatStateManager.ts, SettingsPanel.ts, and extension.ts route branded Settings, both QuickPick surfaces, sidebar messages, activation, and configuration-change reconciliation through that boundary. agentModeConsent.test.ts covers cancellation, scope/risk copy, active-pair acknowledgement, raw-edit reconciliation, and fresh consent after leaving the pair; GAP-012-settings-panel.test.ts verifies the branded editor cannot bypass it.

**Suggested fix**

Completed. Keep agent.mode and agent.effort writes centralized in the two consent-aware setters, version the acknowledgement when risk copy or scope changes, and preserve the raw-settings fail-closed reconciliation.

**Reference screenshot(s)**

- `chatgpt_reference/012-codex-vscode-ext-permission-confirm-modal-ultra-full-access-warning.png`

### GAP-125 — Account menu and trust-boundary tooltips identify the signed-in plan owner

- **Status:** Done
- **Owner:** VS Code
- **Surface/type:** extension-vscode · missing-ia
- **Reference:** Codex · VS Code extension · Account dropdown

**Gap**

The extension now resolves the browser-approved device account through the canonical /api/me contract. Account & Usage leads with informational name/email and personal-or-organization/plan rows before usage and actions; the header account tooltip carries the same identity. Managed Cloud names the active plan owner, while BYOK identifies the AGI sign-in with an explicit note that it does not pay provider billing.

**Evidence**

apps/extension-vscode/src/utils/api.ts validates /api/me?surface=vscode with @agiworkforce/cloud-contracts/me and projects the identity using only the device-account token. accountPresentation.ts builds the first two non-action rows; commandSetup.ts places them before session usage. ChatStateManager.ts sends identity to webviewContent.ts, which updates accessible account and Local/BYOK/Managed Cloud tooltips. api.test.ts, accountPresentation.test.ts, runtimePill.webview.test.ts, and webviewContent.webview.test.ts cover validation and presentation.

**Suggested fix**

Completed. Keep device-token identity separate from API-key/BYOK ownership, retain runtime validation, and never label the signed-in AGI account as the provider billing owner in BYOK mode.

**Reference screenshot(s)**

- `chatgpt_reference/013-codex-vscode-ext-account-menu-profile-dropdown-settings-logout.png`

### GAP-126 — Browse the web is a first-class one-turn context source

- **Status:** Done
- **Owner:** VS Code
- **Surface/type:** extension-vscode · missing-control
- **Reference:** Claude · VS Code extension · Attach (+) menu

**Gap**

The plus menu now exposes Browse the web beside Workspace files. Selecting it shows a removable composer context chip and attaches a validated one-turn browse flag without rewriting the visible user message. The host turns that flag into an explicit web_search tool requirement, routes Auto through the research task type, requires source URLs, and treats web content as untrusted. The UI and runtime directive both state the honest failure boundary: CLI search must be configured and Local privacy mode refuses network access instead of pretending a search ran.

**Evidence**

webviewContent.ts owns the keyboard-native checked menu item, removable context chip, one-turn reset, and original-message presentation. webviewMessages.ts validates browseWeb as boolean only. ChatStateManager.ts translates the flag at the trusted host boundary into the real CLI web_search request and research routing; existing localRuntimeClient tool-event handling renders web-search/web-fetch progress and results. browseWeb.webview.test.ts, browseWeb.test.ts, chatStateManager.test.ts, popoverKeyboard.webview.test.ts, and webviewContent.webview.test.ts cover interaction, reset, protocol rejection, runtime input/routing, keyboard behavior, and limitation copy.

**Suggested fix**

Completed. Keep browsing one-turn and explicit, preserve the visible original prompt, require configured CLI search, and never bypass the CLI's Local/BYOK/Managed privacy enforcement or fabricate results when network access is unavailable.

**Reference screenshot(s)**

- `claude_reference/134-claude-code-vscode-ext-extension-attach-menu-upload-context-browse-web.png`

### GAP-127 — Autonomy, fallibility, and active account/data boundaries are disclosed before first use

- **Status:** Done
- **Owner:** VS Code
- **Surface/type:** extension-vscode · missing-copy
- **Reference:** Codex · VS Code extension · Autonomy / mistakes / account disclosure

**Gap**

The final first-run step now explains that users choose Ask, Auto, Plan, or Bypass; that AGI can make mistakes and generated code and commands require review; and that the header names the live Local, BYOK, or Managed Cloud boundary. It resolves live boundary/account copy and links permission docs plus retention/training settings. Account & Usage repeats the same disclosure and states that the signed-in Cloud plan is not used for the Local developer session.

**Evidence**

apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts renders the three disclosures, live boundary/plan-owner status, and explicit documentation/settings actions. accountPresentation.ts builds condensed autonomy, review, Local-boundary, and privacy rows for Account & Usage; commandSetup.ts wires the Web handoffs. onboarding.webview.test.ts, accountPresentation.test.ts, chatStateManager.test.ts, and runtimePill.webview.test.ts exercise the disclosures, links, and boundary copy.

**Suggested fix**

Completed. Keep Local, BYOK, and Managed Cloud ownership distinct; retain explicit review copy and runtime-resolved boundary/account labels when new execution modes are added.

**Reference screenshot(s)**

- `chatgpt_reference/007-codex-vscode-ext-onboarding-intro-autonomy-mistakes-chatgpt-account-step4.png`

### GAP-128 — VS Code keeps developer sessions local and hands hosted background tasks to Web

- **Status:** Not Planned
- **Owner:** Extension
- **Surface/type:** extension-vscode · missing-screen
- **Reference:** Codex · VS Code extension · Cloud task handoff list

**Gap**

VS Code developer sessions are workspace-scoped local app-server threads, while hosted background runs are account-owned Web task records. The extension has no typed Cloud-run client, redacted repository handoff, durable workspace or branch snapshot, diffstat contract, or authorization for moving IDE context into Managed Cloud. A task list or Run in background action would silently cross the locked developer-session trust boundary or display Web records without enough repository provenance.

**Evidence**

The extension README states that IDE sessions stay local, workspace, and task scoped and do not sync consumer chat history. media/walkthrough/02-tasks.md and the mounted sidebar onboarding state say Foreground here, background on Web, explain that local prompts are never relabeled as cloud runs, and provide Open Web Tasks. package.json contributes the same walkthrough command, while commandSetup.ts opens https://agiworkforce.com/tasks?from=vscode-extension explicitly. localRuntimeClient.ts exposes local threads and turns only; it has no Managed Cloud run contract.

**Suggested fix**

Not planned until an explicit handoff contract provides a redacted payload preview, secret scan, repository/worktree identity, branch and commit provenance, owner-scoped Cloud run creation/list/follow/cancel, diffstat derivation, retention, consent, and proof that local IDE history is not silently uploaded. Preserve the explicit Web Tasks handoff meanwhile.

**Reference screenshot(s)**

- `chatgpt_reference/005-codex-vscode-ext-onboarding-intro-cloud-handoff-tasks-step2.png`

### GAP-129 — VS Code opens the branded AGI Settings editor instead of raw settings

- **Status:** Done
- **Owner:** VS Code
- **Surface/type:** extension-vscode · missing-screen
- **Reference:** Codex · VS Code extension · Codex Settings editor tab — Plugins

**Gap**

The extension now opens a branded in-editor Settings tab with the reference section rail: General, Configuration, Personalization, Usage & billing, MCP servers, Hooks, Plugins, and Account. Normal entry points no longer fall back to the raw key/value page; raw VS Code settings remain available only through an explicit escape-hatch button. Plugin, hook, and per-server MCP runtime depth remains separately tracked by GAP-133 through GAP-138.

**Evidence**

apps/extension-vscode/src/features/settings/SettingsPanel.ts owns the singleton editor and settingsWebviewContent.ts renders the complete information architecture. commandSetup.ts registers agi-workforce.openSettings and contributes a sidebar title action; ChatStateManager.ts, desktopBridge.ts, and the account menu route to it. GAP-012-settings-panel.test.ts, GAP-012-settings-webview.webview.test.ts, commandParity.test.ts, and the real Extension Host smoke suite verify hosting, navigation, entry-point registration, and the explicit raw-settings escape hatch.

**Suggested fix**

Completed. Keep normal settings entry points on agi-workforce.openSettings and track missing runtime-backed hook, plugin, and MCP management in their dedicated rows rather than reopening this duplicate screen-level finding.

**Reference screenshot(s)**

- `chatgpt_reference/024-codex-vscode-ext-settings-plugins-open-external-site-confirm-modal.png`

### GAP-130 — VS Code sidebar provides a persisted four-step first-run onboarding flow

- **Status:** Done
- **Owner:** VS Code
- **Surface/type:** extension-vscode · missing-screen
- **Reference:** Codex · VS Code extension · First-run onboarding carousel (step 1 of 4)

**Gap**

First use now opens a four-step, keyboard-readable sidebar flow covering repository-scoped capabilities, the explicit foreground-editor versus hosted-Web task boundary, TODO-to-native-diff review, and autonomy/trust. Back is disabled on step one; Next, Skip, final completion, and replay are wired. Completion persists globally, while a contributed VS Code Getting Started walkthrough provides the extension-gallery entry point.

**Evidence**

apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts owns the four rendered steps and navigation. onboardingState.ts owns agiWorkforce.onboardingSeen; ChatStateManager.ts persists completion and can replay; sidebarProvider.ts gates first render; commandSetup.ts registers Show Getting Started and the explicit Web Tasks handoff. package.json contributes the four-step walkthrough with real Markdown media. onboarding.webview.test.ts and onboarding.test.ts cover navigation, copy, persistence policy, replay, runtime validation, and contribution/media integrity.

**Suggested fix**

Completed. Preserve the honest unavailable-here copy for hosted background tasks until GAP-128 supplies a real IDE task list; do not imply that a foreground local prompt is a background Cloud run.

**Reference screenshot(s)**

- `chatgpt_reference/004-codex-vscode-ext-onboarding-intro-ask-codex-anything-step1.png`

### GAP-131 — VS Code declines sandbox controls that the local runtime cannot read or enforce

- **Status:** Not Planned
- **Owner:** Extension
- **Surface/type:** extension-vscode · missing-control
- **Reference:** Codex · VS Code extension · Settings — Configuration (approval policy and sandbox)

**Gap**

The branded Configuration section manages extension-owned runtime paths and opens the CLI-owned host configuration file, but the app-server protocol does not expose a typed approval policy, allowed-directory list, command allow or deny policy, or sandbox scope for read/write mutation. Mirroring Desktop controls into VS Code would create a second policy source and imply enforcement the active workspace runtime cannot confirm.

**Evidence**

settingsWebviewContent.ts names the local runtime as the tool-execution owner, exposes the resolved ~/.agiworkforce/config.toml path, and provides Open config.toml plus Restart local runtime. settingsProtocol.ts and platform/config.ts contain extension-owned settings only. localRuntimeClient.ts validates initialize capabilities, threads, turns, approvals, tools, MCP status, worktrees, and models but no sandbox-policy read or mutation methods.

**Suggested fix**

Not planned until the CLI app-server publishes a versioned read/write policy contract with effective source, allowed roots, sandbox mode, command rules, restart semantics, validation, workspace-trust enforcement, and conflict handling. Keep the authoritative config-file handoff instead of adding ignored VS Code switches.

**Reference screenshot(s)**

- `chatgpt_reference/015-codex-vscode-ext-settings-configuration-config-toml-reasoning-efforts.png`

### GAP-132 — Agent configuration is discoverable and safely opened from VS Code

- **Status:** Done
- **Owner:** VS Code
- **Surface/type:** extension-vscode · missing-control
- **Reference:** Codex · VS Code extension · Settings — Configuration (config.toml card)

**Gap**

Configuration now shows the actual extension-host path for ~/.agiworkforce/config.toml, explains that the CLI reads it at process start, and provides Open config.toml, Restart local runtime, and Configuration docs actions. Opening creates only a missing host directory/file with private defaults and append semantics, so existing configuration is never truncated. Remote windows resolve the remote extension-host home. Restart disposes every pooled app-server and makes the next developer turn start from current configuration.

**Evidence**

features/config/agentConfig.ts owns path resolution, private creation, and editor opening. commandSetup.ts registers openAgentConfig and restartLocalRuntime, wires the LocalRuntimePool restart plus conversation refresh, and offers restart immediately after opening. settingsWebviewContent.ts renders the path, lifecycle copy, and three actions; settingsProtocol.ts allowlists them. agentConfig.test.ts, agentConfigCommands.test.ts, GAP-012-settings-panel.test.ts, commandParity.test.ts, and the real Extension Host suite cover path/file semantics, restart behavior, routing, declaration parity, and runtime registration.

**Suggested fix**

Completed. Keep the path relative to the active extension host, preserve non-truncating/private creation, and restart the runtime pool rather than claiming a saved TOML file hot-reloads an active process.

**Reference screenshot(s)**

- `chatgpt_reference/015-codex-vscode-ext-settings-configuration-config-toml-reasoning-efforts.png`

### GAP-133 — VS Code keeps Hooks capability-honest until the runtime exposes inventory and mutation

- **Status:** Not Planned
- **Owner:** Extension
- **Surface/type:** extension-vscode · missing-screen
- **Reference:** Codex · VS Code extension · Settings — Hooks (empty state)

**Gap**

The installed extension contributes no hook settings, and the local app-server emits no hook inventory, event, command, source, trust, refresh, or enablement contract. Rendering example hooks or local storage toggles would be especially unsafe because hooks execute code outside the Webview and the active runtime would not honor the state.

**Evidence**

settingsWebviewContent.ts mounts Hooks, labels automation hooks as local-runtime configuration, states No extension hooks to configure, and sends users to the CLI documentation. settingsProtocol.ts has no hook messages or settings. localRuntimeClient.ts has no hook capability, inventory response, or mutation method. The existing state is therefore an accurate capability boundary, not an unimplemented extension-owned list.

**Suggested fix**

Not planned until a versioned app-server capability returns hook identity, event, exact command or executable provenance, config versus plugin source, trust and enabled state, refresh, and authoritative enable/disable mutation with workspace-trust, path, concurrency, and rollback tests. Keep the honest empty state when absent.

**Reference screenshot(s)**

- `chatgpt_reference/020-codex-vscode-ext-settings-hooks-empty-state-no-hooks-found.png`

### GAP-134 — VS Code declines per-server MCP controls without a runtime inventory contract

- **Status:** Not Planned
- **Owner:** Extension
- **Surface/type:** extension-vscode · missing-screen
- **Reference:** Codex · VS Code extension · Settings — MCP servers

**Gap**

The mounted MCP setting controls only extension cloud-editor utilities. Local MCP discovery and execution belong to the workspace app-server, which currently emits coarse loading, ready, or unavailable notifications but no server identities, commands, arguments, transport, provenance, health, logs, effective enablement, or mutation methods. Per-server rows would therefore be fabricated or non-authoritative.

**Evidence**

settingsWebviewContent.ts explicitly says the mcp.enabled toggle does not configure MCP in the local app-server and labels Local MCP as runtime-owned, with Cloud connector and documentation handoffs. platform/config.ts exposes only the cloud-utility boolean. localRuntimeClient.ts validates only mcp/loading, mcp/ready, and mcp/unavailable status notifications and no server list or config methods.

**Suggested fix**

Not planned until the app-server publishes a typed per-server inventory and mutation contract covering canonical identity, source, command/arguments or remote endpoint, redacted secrets, status/error, enable/disable, config editing, add/remove, reload, logs, workspace scope, and concurrency. Keep the existing boundary and do not reinterpret the cloud-utility master toggle.

**Reference screenshot(s)**

- `chatgpt_reference/018-codex-vscode-ext-settings-mcp-servers-server-toggle-list.png`

### GAP-135 — MCP provenance groups are declined until user and plugin servers have authoritative identities

- **Status:** Not Planned
- **Owner:** Extension
- **Surface/type:** extension-vscode · missing-ia
- **Reference:** Codex · VS Code extension · Settings — MCP servers, 'From plugins' section

**Gap**

Provenance grouping requires a resolved runtime inventory that can distinguish a user-configured server from a plugin-contributed server and name the owning plugin plus trust state. Neither the app-server protocol nor the Desktop plugin resolver publishes that mapping to VS Code. Inventing source labels from display names or separate catalogues would misattribute executable code and could make a plugin-owned server appear user-controlled.

**Evidence**

localRuntimeClient.ts exposes coarse MCP lifecycle status only. settingsWebviewContent.ts renders no server rows and truthfully separates local runtime MCP from Managed Cloud connectors. Repository searches find no typed plugin-to-MCP or plugin-to-hook mapping consumable by the extension; the existing settings protocol cannot carry one.

**Suggested fix**

Not planned until the runtime assigns stable server IDs and returns source kind, owning plugin ID/name/version, trust decision, config origin, effective enablement, and mutation authority. Then render user servers with authoritative controls and plugin-contributed servers as read-only or plugin-governed rows; reuse the same provenance model for hooks.

**Reference screenshot(s)**

- `chatgpt_reference/019-codex-vscode-ext-settings-mcp-servers-from-plugins-scrolled.png`

### GAP-136 — VS Code supports auditable host and workspace custom instructions

- **Status:** Done
- **Owner:** VS Code
- **Surface/type:** extension-vscode · missing-control
- **Reference:** Codex · VS Code extension · Settings — Personalization, Custom instructions

**Gap**

Personalization now provides separate 8,000-character host-default and workspace-override editors with explicit storage/scope copy, Save actions, documentation, live counts, and an exact effective-turn-prelude preview. A non-empty workspace value replaces the host default. The effective custom block is the first input on every sidebar, editor-tab, and @agi local developer turn. The Context tree repeats that exact block and lists the bounded project instruction files the local runtime discovers. Project files are deliberately not injected a second time by the extension because the app-server owns repository-instruction prompt assembly.

**Evidence**

features/instructions/customInstructions.ts owns bounded storage, precedence, delimiter safety, preview state, and UserInput construction. ChatStateManager.ts and chatParticipant.ts prepend the effective block across all developer-chat entry points. projectInstructions.ts exposes structured bounded sources; contextPanelProvider.ts renders the active custom prelude and project sources; SettingsPanel.ts, settingsProtocol.ts, and settingsWebviewContent.ts implement validated editing and refresh. customInstructions.test.ts, chatStateManager.test.ts, chatParticipant.test.ts, contextFileSelection.test.ts, GAP-012-settings-panel.test.ts, and GAP-012-settings-webview.webview.test.ts cover persistence, precedence, injection order, project-source visibility, protocol limits, and browser behavior.

**Suggested fix**

Completed. Keep custom instructions private to VS Code Memento storage, preserve workspace-over-host precedence, show the exact effective prelude, and let the local app-server remain the single owner of repository instruction-file assembly.

**Reference screenshot(s)**

- `chatgpt_reference/016-codex-vscode-ext-settings-personalization-personality-memory-instructions.png`

### GAP-137 — VS Code keeps Plugins as an availability boundary until a local registry exists

- **Status:** Not Planned
- **Owner:** Extension
- **Surface/type:** extension-vscode · missing-screen
- **Reference:** Codex · VS Code extension · Settings — Plugins list

**Gap**

VS Code has no installed plugin or skill registry and the local app-server does not return commands, skills, agents, plugin versions, provenance, trust, or effective enablement. The Web catalogue and Desktop resolver are separate products with different authority; copying either into the IDE would imply that listed capabilities execute in the current workspace when they may not.

**Evidence**

settingsWebviewContent.ts mounts a Plugins destination, renders shared cross-surface capability availability, states No VS Code plugin registry is installed, explains that local tools come from CLI and MCP configuration, and provides explicit Cloud directory and documentation handoffs. settingsProtocol.ts and localRuntimeClient.ts contain no installed-capability inventory or control contract.

**Suggested fix**

Not planned until a local runtime registry publishes stable capability and plugin IDs, versions, source/provenance, trust, workspace availability, commands/skills/agents, effective enablement, permission review, authoritative controls, and lifecycle errors. Preserve the visible no-registry state instead of presenting Web or Desktop metadata as IDE installation state.

**Reference screenshot(s)**

- `chatgpt_reference/021-codex-vscode-ext-settings-plugins-documents-pdf-sites-chrome-list.png`

### GAP-138 — VS Code keeps surface-bound capabilities visible with honest availability

- **Status:** Done
- **Owner:** VS Code
- **Surface/type:** extension-vscode · missing-state
- **Reference:** Codex · VS Code extension · Settings — Plugins, 'Unavailable in this context'

**Gap**

Reference keeps surface-incompatible plugins visible but dims the name and appends 'Unavailable in this context' (Browser, Computer Use inside the IDE), so the capability is discoverable without pretending it works. AGI Workforce now applies the same pattern to Managed Cloud plugins, Browser control, and Computer use in VS Code.

**Evidence**

packages/contracts/types/src/capabilities.ts owns an exhaustive availability descriptor across Web, Desktop, Mobile, CLI, VS Code, and Chrome plus shared presentation copy. settingsWebviewContent.ts renders all three capabilities as dimmed, non-interactive rows with the inline 'Unavailable in this context' state and a visible/title description naming the shipped surfaces. capabilities.test.ts and GAP-012-settings-webview.webview.test.ts pin the matrix, labels, DOM state, and accessibility metadata.

**Suggested fix**

Completed. Add future surface-bound capabilities to the shared descriptor and render the shared presentation instead of hiding them or exposing controls that cannot run.

**Reference screenshot(s)**

- `chatgpt_reference/021-codex-vscode-ext-settings-plugins-documents-pdf-sites-chrome-list.png`

## P2

### GAP-139 — Account header avatar and display name are not editable

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Account header

**Gap**

The reference puts a pencil badge on the avatar in the account header so a user can change their picture, with the display name directly beneath. agiworkforce renders the same header (avatar + name + email) but purely as decoration — there is no edit affordance for the avatar or the name on mobile.

**Evidence**

apps/mobile/src/features/settings/cloud-account/index.tsx:180-214 (Image accessibilityLabel='Profile picture', no Pressable); grep 'setProfileImage|change photo|edit avatar' across apps/mobile/src — no match

**Suggested fix**

Wrap the avatar in a Pressable with a pencil badge that opens the existing photo picker and uploads via Clerk's setProfileImage, and make the name row editable with an inline text prompt.

**Reference screenshot(s)**

- `chatgpt_reference/069-chatgpt-ios-settings-account-modal-change-email-confirm.png`

### GAP-140 — No medical conditions / health profile feature (conditions, medications, family history)

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-screen
- **Reference:** ChatGPT · iOS · Add new condition — searchable medical-condition catalog with add buttons

**Gap**

ChatGPT lets users build a structured health profile: search and add medical conditions from a standardized catalog (ICD-style terms like 'Hypertensive disorder', 'Type 2 diabetes mellitus'), add medications via search, and add family history, either manually or by importing from medical records via a connected provider. agiworkforce has none of this — no conditions/medications/family-history data model, screen, or route.

**Evidence**

grepped apps/mobile source for 'condition', 'medication', 'family history', 'medical record' — no feature files found (only unrelated 'MessageBubble' handling and generic connector code)

**Suggested fix**

Not recommended unless agiworkforce is entering the health-assistant vertical; if it is, build a conditions/medications/family-history module under a new src/features/health/ directory with searchable pick-lists and an 'Import from records' path via the existing connectors OAuth mechanism.

**Reference screenshot(s)**

- `references-2/chatgpt-ios-health-09-add-condition-list-a.png`

### GAP-141 — Empty chat offers no capability quick actions above the composer

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Chat empty state

**Gap**

The reference keeps three compact, verb-led capability rows (Create an image / Write or edit / Look something up) pinned directly above the composer, so they remain visible and tappable with the keyboard open and teach what the product can do. agiworkforce's empty chat is brand mark + greeting only; ConversationStarters.tsx (a 2-column card grid of long prompts) exists but is rendered by nothing, and the chat screen comments record a founder decision to ship 'NO suggestion cards'.

**Evidence**

apps/mobile/app/(app)/(tabs)/chat.tsx:617-621 (comment 'Still NO suggestion cards'); apps/mobile/src/features/chat/components/ConversationStarters.tsx is imported nowhere (only referenced in a comment at chat/[id].tsx:111)

**Suggested fix**

Ship the lightweight variant rather than cards: three icon+verb rows (image, write/edit, look up) directly above the composer that prefill the composer instead of sending, hidden as soon as the thread has messages — and delete or wire up ConversationStarters so no dead component remains.

**Reference screenshot(s)**

- `chatgpt_reference/075-chatgpt-ios-chat-empty-state-quick-actions-keyboard-open.png`

### GAP-142 — Reasoning effort is a slider, not a tappable tier list with the current value checked

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-interaction
- **Reference:** ChatGPT · iOS · Chat model + intelligence popover

**Gap**

The reference selects intelligence from a discrete list (Pro / Extra High / High / Medium / Instant) where the active tier carries a checkmark and each option is a full-width tap target. agiworkforce renders effort as a continuous Slider over the model's supported stops, which on a phone is a precision drag, has no per-option tap target, and does not show the ladder at a glance.

**Evidence**

apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:597-626 (Slider with testID 'model-picker-effort-selector')

**Suggested fix**

Replace the slider with a radio list of the model's supportedEfforts (label + one-line description + checkmark on the active one), keeping the same capability-driven option source; retain slider semantics only for accessibility adjustable actions.

**Reference screenshot(s)**

- `chatgpt_reference/073-chatgpt-ios-chat-model-picker-intelligence-tier-popover.png`

### GAP-143 — Code screen lacks a 'Devices' section showing recently connected devices

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-ia
- **Reference:** Claude · iOS · Code sessions — Devices section

**Gap**

Reference's Code tab shows a 'Devices' label and a card listing recently connected devices (or 'No recently connected devices') above the sessions list, letting the user see which desktop/mobile devices have been used for remote code sessions. agiworkforce's Code screen goes straight from the header into the session list/empty state with no device-awareness section.

**Evidence**

apps/mobile/src/features/code-sessions/index.tsx — screen renders header then ScrollView with CodeSessionSection/CodeSessionsEmptyState only; searched for 'Devices' and 'recently connected' — no match anywhere in that directory.

**Suggested fix**

Add a 'Devices' section above the session list, sourced from the same connection/device store used by Dispatch/Companion, with a 'No recently connected devices' empty card.

**Reference screenshot(s)**

- `claude_reference/114-claude-ios-code-sessions-empty-no-devices-no-sessions-found.png`

### GAP-144 — No Dispatch intro/marketing screen offering QR pairing vs. email-link pairing

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-screen
- **Reference:** Claude · iOS · Dispatch intro screen

**Gap**

Reference shows a first-run explainer ('Reach your desktop from your pocket') with two pairing paths — 'Email desktop app link' and 'Pair with your desktop' — plus a security disclaimer with a 'Learn how to use this safely' link. agiworkforce's Dispatch/Companion flow goes directly to a QR-scan prompt with a single pairing method and no safety disclaimer or email-link alternative.

**Evidence**

apps/mobile/app/(app)/dispatch/index.tsx (PairingPrompt only offers 'Scan QR Code'); apps/mobile/app/(app)/companion/index.tsx (DisconnectedView only offers 'Scan QR Code'). Searched for 'Email' and 'safely'/'safety' pairing copy in both files — no match.

**Suggested fix**

Add an intro screen before first pairing that explains the value prop, offers both QR-pairing and an 'email desktop link' fallback, and includes a security disclaimer with a help link, mirroring the reference's two-button + safety-copy pattern.

**Reference screenshot(s)**

- `claude_reference/110-claude-ios-dispatch-intro-reach-desktop-from-pocket.png`

### GAP-145 — No Apple Health / HealthKit integration anywhere in agiworkforce mobile

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-screen
- **Reference:** ChatGPT · iOS · Enable Apple Health onboarding + full HealthKit permission flow (multi-page category toggles)

**Gap**

ChatGPT iOS has a dedicated onboarding flow to enable Apple Health, request granular HealthKit read/write permissions across dozens of categories (Active Energy, AFib History, Blood Glucose, Heart Rate, Sleep, Workouts, etc.), and an explicit privacy explanation shown in the system sheet. agiworkforce mobile has no equivalent capability, screen, entitlement, or data model. Notably, code comments show a prior 'Health Data' integrations card was deliberately removed (STB-21) because the backend health-context service never existed.

**Evidence**

searched 'health', 'HealthKit', 'Apple Health', 'AFib', 'blood glucose' across apps/mobile — only matches are removal comments in apps/mobile/src/features/integrations/store.ts:120-121, apps/mobile/src/features/integrations/components/DeviceIntegrationStatus.tsx:53-54, and apps/mobile/app/(app)/settings/integrations.tsx:457-458 ('the Health Data card was removed with the health-context service... a route that has [never existed]')

**Suggested fix**

If health personalization is in scope for agiworkforce, add a HealthKit entitlement + onboarding screen mirroring this flow: intro screen with heart icon and toggle preview, trigger native HealthKit permission sheet, and store a per-category consent state server-side. If out of scope, no action needed, but this is a full capability gap versus ChatGPT.

**Reference screenshot(s)**

- `references-2/chatgpt-ios-health-01-enable-apple-health.png`

### GAP-146 — Agent activity trace has no dedicated pull-up detail sheet, only inline expand

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-interaction
- **Reference:** ChatGPT · iOS · Expanded 'Thinking' agent-activity bottom sheet

**Gap**

The reference lets users drag up a dedicated 'Thinking' bottom sheet that shows rich, multi-sentence reasoning narration per step (e.g. 'I'm acknowledging the user's updates and thinking about how to incorporate the new info into my response...') plus grouped 'Searching the web' domain chips, independent of the main chat scroll position. agiworkforce's AgentActivityTimeline only expands/collapses inline within the message bubble, pushing surrounding messages up/down, and its per-step detail is a raw input/output JSON dump (via asDisplayText) rather than narrated reasoning text.

**Evidence**

apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx lines 260-290 (inline expand, JSON.stringify fallback for input/output) and lines 441-529 (no modal/sheet, just a View that grows within the message list).

**Suggested fix**

Add an optional 'View full activity' affordance on long/complex agent runs that opens a draggable bottom sheet (reusing the existing sheet pattern from VoiceOnboardingSheet/VoicePickerSheet) with the same tool/progress rows but persistent independent of chat scroll, and consider generating a short narrated sentence per tool call step instead of raw JSON.

**Reference screenshot(s)**

- `references-2/chatgpt-ios-work-01-expanded-agent-activity.png`

### GAP-147 — No post-sign-in prompt offering to enable App Lock / Face ID

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-screen
- **Reference:** ChatGPT · iOS · Face ID enrollment prompt

**Gap**

The reference offers biometric login immediately after authentication with a Face ID glyph, a one-line benefit, Continue and Skip, so opt-in happens at the moment of highest intent. agiworkforce implements the same capability but only exposes it as an 'App Lock' switch buried in Settings > Safety & Security, so most users will never enable it.

**Evidence**

apps/mobile/src/features/settings/safety-security/index.tsx lines 17-78 (App Lock toggle); apps/mobile/src/features/auth/hooks/useBiometricGate.ts; no enrollment prompt exists in apps/mobile/app/(auth)/login.tsx

**Suggested fix**

After a successful Clerk sign-in, if hasHardwareAsync && isEnrolledAsync && !biometricFlag.enabled, present a one-time sheet with Continue (calls setBiometricEnabled(true) behind an authenticateAsync confirm) and Skip, persisting a 'prompted' flag so it never repeats.

**Reference screenshot(s)**

- `chatgpt_reference/031-chatgpt-ios-auth-biometric-prompt-faceid-faster-login-continue-skip.png`

### GAP-148 — No in-app feature-announcement sheet to introduce new capabilities

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-screen
- **Reference:** ChatGPT · iOS · Feature announcement bottom sheet

**Gap**

The reference dismissibly announces a major new capability with hero art, title, one-line benefit and a 'Get started' CTA that drops the user directly into setup. agiworkforce has onboarding (first run) and a companion walkthrough (post-pairing) but nothing that surfaces a newly shipped capability to existing users — so features like the desktop companion, schedules or artifacts rely on the user browsing the drawer.

**Evidence**

grep -i 'whats.?new|announcement|release.?notes|promo|introducing' across apps/mobile/src and apps/mobile/app matches only unrelated comments in settings/index.tsx and settings/performance.tsx; apps/mobile/app/(public)/onboarding.tsx is first-run only

**Suggested fix**

Add src/features/announcements with a bottom-sheet component driven by a small manifest (id, minVersion, title, body, ctaRoute) and an MMKV-persisted seen-set, shown once per announcement on the chat tab.

**Reference screenshot(s)**

- `chatgpt_reference/026-chatgpt-ios-promo-bottom-sheet-introducing-codex-mobile.png`

### GAP-149 — No reusable full-screen 'new feature announcement' pattern for capability rollouts

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-screen
- **Reference:** Claude · iOS · Feature announcement — Memory

**Gap**

Claude uses a consistent announcement-card pattern (blurred chat-preview backdrop, 'New' pill badge, serif headline, short explainer with an 'About X' link, and a primary/secondary CTA pair like 'Use memory'/'Don't use memory') to introduce major new capabilities post-onboarding. AGIW's mobile app has no equivalent component; its onboarding.tsx is a one-time 3-screen local-model setup flow, not reusable for future feature announcements.

**Evidence**

grep for 'has memory', 'Use memory', 'feature announcement', "What's new", 'AnnouncementModal' across apps/mobile — no matches. apps/mobile/app/(public)/onboarding.tsx is scoped to first-run model download only.

**Suggested fix**

Build a reusable FeatureAnnouncementScreen (or bottom-sheet) component — badge, headline, body, optional CTA pair — that can be triggered post-login the first time a user encounters a newly shipped capability (memory, Cowork, etc.), tracked via a per-feature 'seen' flag in local storage.

**Reference screenshot(s)**

- `claude_reference/103-claude-ios-onboarding-memory-announcement-quarter-review-example.png`

### GAP-150 — No dedicated search overlay and no pre-typing guidance state

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-state
- **Reference:** ChatGPT · iOS · Global search overlay

**Gap**

The reference dedicates a full screen to search with the field bottom-anchored above the keyboard (thumb reachable), an X to dismiss, a Search return key, and a centred icon + 'Search chats, files, and projects' state before the user types. agiworkforce only has a top-anchored field inside the drawer with an empty result label ('No matches'), and nothing explains what is searchable before typing.

**Evidence**

apps/mobile/src/features/drawer/components/DrawerContent.tsx:195-232 (SearchBox at the top of the drawer) and 553-556 ('No matches' / 'No recent chats')

**Suggested fix**

Add a full-screen search route opened from the drawer's search affordance with a bottom-anchored input, returnKeyType='search', and a pre-query state showing the searchable scope plus recent searches.

**Reference screenshot(s)**

- `chatgpt_reference/078-chatgpt-ios-search-overlay-empty-prompt-state.png`

### GAP-151 — Library header has no overflow menu (select, sort, delete)

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Library

**Gap**

Reference Library header carries a trailing '…' button for bulk/manage actions next to the drawer button. agiworkforce's Library header renders only the drawer button and the title, so there is no way to sort, multi-select, or delete library items.

**Evidence**

apps/mobile/src/features/library/index.tsx header block (only `library-open-drawer` Pressable + Text)

**Suggested fix**

Add a trailing header button opening an action sheet with Sort (newest/oldest/type), Select (multi-select mode with Delete/Share), and Clear generated images; reuse the ConversationExportSheet bottom-sheet pattern.

**Reference screenshot(s)**

- `chatgpt_reference/044-chatgpt-ios-library-upload-promo-upload-once-use-anytime.png`

### GAP-152 — No dismissible feature-education sheet pattern for new capabilities

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-copy
- **Reference:** ChatGPT · iOS · Library upload promo sheet

**Gap**

Reference uses a one-time bottom sheet (illustration, headline 'Upload once, use anytime', one-sentence benefit, primary 'Learn more', X to dismiss) to teach a newly shipped capability in place. agiworkforce mobile has bottom sheets for paywall and add-to-chat but no reusable feature-announcement/education sheet, so new capabilities ship silently.

**Evidence**

grep 'whatsNew|WhatsNew|Learn more|announcement|PromoSheet' across apps/mobile/src — no match; only apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx exists

**Suggested fix**

Add a `FeaturePromoSheet` component (icon row, title, body, primary CTA, dismiss X) keyed by a persisted `seenPromoIds` set in settingsStore, so any surface can announce a capability once and never again.

**Reference screenshot(s)**

- `chatgpt_reference/044-chatgpt-ios-library-upload-promo-upload-once-use-anytime.png`

### GAP-153 — Voice mode hides the chat transcript instead of overlaying it

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-ia
- **Reference:** ChatGPT · iOS · Live voice conversation overlaying full chat transcript

**Gap**

In ChatGPT, voice mode is a translucent dark overlay on top of the existing chat screen — the full streamed response text, previous messages, and message action icons (copy/thumbs/share) remain visible/scrollable behind the mic controls. agiworkforce's VoiceConversationScreen is an opaque full-screen gradient takeover (colors.voiceConversationBgEnd background) that shows only a phase label and a 3-line max transcriptPreview, discarding the surrounding conversation context.

**Evidence**

apps/mobile/src/features/voice/components/VoiceConversationScreen.tsx lines 260-355 (opaque background, transcriptPreview numberOfLines=3).

**Suggested fix**

Consider rendering VoiceConversationScreen as a semi-transparent overlay above the live MessageList (with reduced opacity/dim), showing the full streaming response text rather than a truncated 3-line preview, so users can read along while speaking.

**Reference screenshot(s)**

- `references-2/chatgpt-ios-voice-03-live-conversation.png`

### GAP-154 — Dispatch and code-session composers have no model or reasoning-effort selector

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** Codex · iOS · Model/effort quick-picker (paged pill selector) and Advanced sheet (Model, Intelligence, Speed) reachable from the remote task composer

**Gap**

Codex's remote composer shows the active model+effort ('5.6 Sol High') as a tappable chip, opening first a quick paged picker then an Advanced sheet with Model, Intelligence, and Speed dropdowns. agiworkforce has a comparable Model+Effort picker (ModelPickerSheet) but it is wired only into the main chat tab; the Dispatch screen and Code Session screen composers have no model/effort affordance at all, so users cannot choose which model runs a dispatched task or coding session from mobile.

**Evidence**

apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx (full model+effort UI, imported only in apps/mobile/app/(app)/(tabs)/chat.tsx:22); apps/mobile/app/(app)/dispatch/index.tsx and apps/mobile/src/features/code-sessions/index.tsx do not import model-picker

**Suggested fix**

Surface a model/effort chip in the Dispatch header and the Code Session composer that opens the existing ModelPickerSheet, scoped to that dispatch thread or code session.

**Reference screenshot(s)**

- `references-2/IMG_0628.PNG`

### GAP-155 — Drawer has no nav entry for Code or Dispatch, though both screens exist

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-ia
- **Reference:** Claude · iOS · Nav drawer primary destinations

**Gap**

Reference drawer lists Chats, Projects, Artifacts, Code, Dispatch, and Cowork as primary top-level destinations. agiworkforce's DrawerContent.PRIMARY_ITEMS only includes Projects, Artifacts, Library, Tasks, and Schedules — Code (apps/mobile/app/(app)/code/index.tsx) and Dispatch (apps/mobile/app/(app)/dispatch/index.tsx) are fully built screens with no drawer entry point, making them undiscoverable without a deep link.

**Evidence**

apps/mobile/src/features/drawer/components/DrawerContent.tsx PRIMARY_ITEMS array (lines 57-90) — no 'code' or 'dispatch' key. grep for "'/(app)/code" and "'/(app)/dispatch" across apps/mobile/src and app shows only internal redirects/back-navigation, not a drawer entry.

**Suggested fix**

Add 'Code' and 'Dispatch' rows to PRIMARY_ITEMS in DrawerContent.tsx, routed to their existing screens, so both surfaces are reachable from primary navigation.

**Reference screenshot(s)**

- `claude_reference/118-claude-ios-nav-drawer-chats-recents-new-chat-button.png`

### GAP-156 — New Project has no icon/emoji picker for project identity

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · New project modal

**Gap**

Reference puts an emoji/avatar affordance inside the Project Name field so each project gets a distinct glyph in the list and sidebar. agiworkforce renders every project with the same FolderOpen lucide icon, making a list of 10 projects visually undifferentiated.

**Evidence**

apps/mobile/app/(app)/(tabs)/projects.tsx (create modal fields: name, description, instructions); apps/mobile/src/features/projects/components/ProjectCard.tsx (hardcoded FolderOpen)

**Suggested fix**

Add an optional `emoji` field to the project model, a leading emoji button in the Name row opening a small picker, and render it in ProjectCard and the drawer project list; fall back to FolderOpen when unset.

**Reference screenshot(s)**

- `chatgpt_reference/047-chatgpt-ios-projects-create-modal-name-input-category-pills.png`

### GAP-157 — No starter category pills to seed a project's instructions

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · New project modal

**Gap**

Reference offers a horizontally scrolling pill row (Homework, Writing, Health, Travel…) that pre-fills a project template, so the empty Custom Instructions field is never a blank page. agiworkforce presents three empty text fields with only placeholder hints.

**Evidence**

apps/mobile/app/(app)/(tabs)/projects.tsx create modal; grep -i 'template|category' in apps/mobile/src/features/projects and apps/web/features/projects/components — only an unrelated CSS gridTemplateColumns hit

**Suggested fix**

Ship a small PROJECT_TEMPLATES constant (label, icon, seed instructions) rendered as a pill row under the Name field; tapping one fills description + instructions, which the user can then edit.

**Reference screenshot(s)**

- `chatgpt_reference/047-chatgpt-ios-projects-create-modal-name-input-category-pills.png`

### GAP-158 — Notifications settings has no 'Product updates' (marketing) opt-in toggle

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** Claude · iOS · Notifications settings categories

**Gap**

Reference includes a 'Product updates' toggle ('Get notified about new features, tips, and occasional promotions') alongside task/chat notification toggles. agiworkforce's notification categories (Approvals, Task Updates, Errors & Stops, Status Updates) are all agent/companion-operational and include no marketing/product-news opt-in control.

**Evidence**

apps/mobile/src/features/settings/notifications/index.tsx getCategories() (lines 57-88) lists only approvals/task_updates/errors/status. Searched for 'Product updates' and 'promotions' in the file — no match.

**Suggested fix**

Add a 'Product updates' notification category (with its own preference key) so users can separately opt in/out of marketing and feature-announcement push notifications.

**Reference screenshot(s)**

- `claude_reference/124-claude-ios-settings-notifications-six-toggles-all-off.png`

### GAP-159 — Pairing failure screen shows one generic error line, not a troubleshooting checklist

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-copy
- **Reference:** Claude · iOS · Pairing failed troubleshooting checklist

**Gap**

Reference's pairing-failed state gives a structured, numbered 3-item checklist to self-diagnose ('Dispatch is set up in Claude Desktop', 'You're signed in as <email>', 'Claude Desktop is open and latest version'). agiworkforce's ErrorView only renders the raw connection error string or a generic fallback with a single 'Try Again' button, giving the user no actionable diagnostic steps.

**Evidence**

apps/mobile/src/features/companion/components/ConnectionStateViews.tsx — ErrorView renders `{error ?? 'Unable to connect to the desktop.'}` with no itemized checklist.

**Suggested fix**

Extend ErrorView to render a numbered checklist component (reusing the StepRow pattern already defined in the same file for DisconnectedView) covering desktop-app setup, signed-in account match, and app version, ending in the Try Again button.

**Reference screenshot(s)**

- `claude_reference/113-claude-ios-dispatch-pairing-failed-troubleshooting-checklist-try-again.png`

### GAP-160 — No user-facing toggle to opt in/out of using chats to train AI models

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** Claude · iOS · Privacy — Help improve our AI models toggle

**Gap**

Reference gives users an explicit switch ('Help improve our AI models — Allow the use of your chats and coding sessions to train and improve Anthropic AI models') with a Learn More link, defaulting off. agiworkforce's Cloud Privacy screen instead shows a static, non-interactive card stating conversations are 'never used for training', with no consent control surfaced to the user at all.

**Evidence**

apps/mobile/src/features/settings/cloud-privacy/index.tsx — PRIVACY_ITEMS is static text (no-training/telemetry/retention), no Switch component present; searched for 'Switch' and 'train' in the file — only descriptive text, no toggle.

**Suggested fix**

If model-training consent is or becomes a real backend capability, surface it as an explicit toggle with explanatory copy and a Learn More link on this screen instead of only asserting a static policy.

**Reference screenshot(s)**

- `claude_reference/125-claude-ios-settings-privacy-data-privacy-train-models-toggle.png`

### GAP-161 — Projects tab has no search field

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Projects list

**Gap**

Reference shows a persistent 'Search projects' pill at the bottom of the Projects list. agiworkforce renders every project in an unfiltered FlatList with only a count badge, so project lookup degrades linearly.

**Evidence**

apps/mobile/app/(app)/(tabs)/projects.tsx (FlatList over `projects`, no query state)

**Suggested fix**

Add a bottom-anchored search pill filtering name + description client-side, matching the Library search treatment so both list surfaces share one pattern.

**Reference screenshot(s)**

- `chatgpt_reference/046-chatgpt-ios-projects-list-empty-state-single-project.png`

### GAP-162 — No ownership filters (All / Created by you / Shared with you) on projects

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-ia
- **Reference:** ChatGPT · iOS · Projects list

**Gap**

Reference segments projects by ownership, which is the entry point for shared/collaborative projects. agiworkforce mobile has no notion of a project being shared with the user — cloud projects are filtered only by `deletedAt`/`isArchived`, and no sharing field or filter exists.

**Evidence**

apps/mobile/app/(app)/(tabs)/projects.tsx lines filtering cloudProjectsRaw; grep 'Shared with you|sharedWithMe|shared_with' across apps/mobile and apps/web/features/projects — no match

**Suggested fix**

If project sharing is on the roadmap, add an `ownership` field to the cloud project model and a three-chip filter row above the list; if not, at minimum add All/Active chips so the row is not an empty affordance.

**Reference screenshot(s)**

- `chatgpt_reference/046-chatgpt-ios-projects-list-empty-state-single-project.png`

### GAP-163 — Mobile companion/pairing feature cannot browse the paired desktop's project folders

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Remote device: browsable project folder list

**Gap**

ChatGPT iOS's Remote/Codex pairing screen, once connected to a desktop, shows a 'Projects' list of the folders available on that machine (agiworkforce, siddhartha, hermes-agent, claw-code, opencode, codex-cli, gemini-cli, src, etc.), each tappable to start a session scoped to that folder. agiworkforce mobile's companion feature (PairingStatus, DesktopInfoCard, AgentDashboard) shows connection status and device metadata but has no analogous folder/project browsing list.

**Evidence**

grep 'folder|project|Projects' in apps/mobile/src/features/companion/components/DesktopInfoCard.tsx and AgentDashboard.tsx returned no matches; only PairingStatus.tsx, StatusBanners.tsx, ConnectionStateViews.tsx, QRScanner.tsx exist for the companion flow.

**Suggested fix**

Extend the companion/pairing screen with a 'Projects' section listing folders exposed by the paired desktop agent, each row opening a new chat/session scoped to that folder, mirroring the reference's remote-projects list.

**Reference screenshot(s)**

- `references-2/IMG_0620.PNG`

### GAP-164 — Conversation/task list has no organize control (by project / chronological / chats first)

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** Codex · iOS · Remote overflow menu — Organize

**Gap**

The reference overflow menu offers three mutually exclusive list arrangements with a checkmark on the active one. agiworkforce's conversation list is hard-coded to sort by updatedAt descending with no grouping option, so users with many projects cannot switch between a project-grouped and a time-ordered view.

**Evidence**

apps/mobile/src/features/sidebar/components/ConversationList.tsx:37 ('Sort by updatedAt descending'); grep -i 'sort by|group by|chronological|organize' across apps/mobile/src returns only model-picker grouping

**Suggested fix**

Add a persisted listArrangement preference ('project' | 'chronological' | 'chats-first') to the settings store and an overflow menu in the drawer/list header that switches grouping, with a checkmark on the active option.

**Reference screenshot(s)**

- `chatgpt_reference/039-codex-ios-remote-project-list-overflow-menu-organize-manage.png`

### GAP-165 — No 'email me a download link' path when the desktop app is not installed

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** Codex · iOS · Remote setup intro

**Gap**

The reference offers a secondary CTA that emails the desktop download link, handling the common case where the user is on the phone and the computer app is not installed yet. agiworkforce's pairing screens assume the desktop app already exists; there is no send-link action anywhere in apps/mobile even though a web download page exists.

**Evidence**

grep -i 'email me a download|download link' across apps/mobile — no matches; apps/web/app/download/page.tsx exists as the target

**Suggested fix**

Add a secondary button on the pairing intro that posts to an email-download-link endpoint for the signed-in address (or opens a share sheet with https://agiworkforce.com/download when signed out).

**Reference screenshot(s)**

- `chatgpt_reference/027-codex-ios-remote-setup-intro-signin-instructions.png`

### GAP-166 — Pairing setup is a single static screen, not a back-navigable stepped wizard

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-ia
- **Reference:** Codex · iOS · Remote setup step 2 — Get pairing code

**Gap**

The reference splits setup into intro -> get pairing code -> scan/enter, each with a back chevron and one instruction per screen, so a user who loses their place can step back. agiworkforce presents one dense DisconnectedView and then swaps straight to the camera; from the scanner the only exits are close and manual entry, with no way back to the instructions.

**Evidence**

apps/mobile/app/(app)/companion/index.tsx (renders DisconnectedView or QRScanner based on state); apps/mobile/src/features/companion/components/ConnectionStateViews.tsx:36-75; QRScanner.tsx:259-267 (top bar has close + flash only)

**Suggested fix**

Introduce a 3-step pairing stack under app/(app)/companion/setup with back navigation, moving the 'where to find the code on desktop' guidance to its own step ending in an 'I have a pairing code' CTA.

**Reference screenshot(s)**

- `chatgpt_reference/028-codex-ios-remote-setup-get-pairing-code-step.png`

### GAP-167 — No filter/sort control on the scheduled tasks list

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Scheduled tasks

**Gap**

Reference places a filter/sort control in the top-right of the Scheduled header. agiworkforce's header offers only Back and Create, so a user with many tasks cannot separate active from paused, or sort by next run.

**Evidence**

apps/mobile/app/(app)/schedules/index.tsx Header(onBackPress, onCreatePress) only

**Suggested fix**

Add a header filter button opening a sheet with Active/Paused/All and sort by Next run / Recently created; the store already exposes isActive per schedule.

**Reference screenshot(s)**

- `chatgpt_reference/048-chatgpt-ios-scheduled-tasks-suggestions-daily-brief-email-monitor.png`

### GAP-168 — Scheduled tasks cannot be bound to plugins/connectors

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Scheduled tasks attachment picker

**Gap**

Reference lists 'Plugins' alongside the attachment sources, letting a recurring task declare which tools it may use (e.g. an Email monitor bound to a mail connector). agiworkforce schedules have no tool/connector selection at all, so an unattended run cannot be scoped to a specific connected service.

**Evidence**

grep -i 'connector|plugin|tool' across apps/mobile/src/features/schedules — no match; connectors live only in apps/mobile/src/features/settings/cloud-connectors/index.tsx

**Suggested fix**

Add a connectors/tools multi-select to ScheduleForm sourced from the connector directory, persist selected tool ids with the schedule, and display the bound tools on ScheduleCard so unattended scope is visible before the first run.

**Reference screenshot(s)**

- `chatgpt_reference/049-chatgpt-ios-scheduled-tasks-attachment-picker-camera-photos-files-plugins.png`

### GAP-169 — Schedule creation has no persistent composer with voice dictation

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-interaction
- **Reference:** ChatGPT · iOS · Scheduled tasks composer

**Gap**

Reference keeps a chat-style composer pinned to the bottom of the Scheduled screen ('+ | Schedule a task | mic | send'), so a task can be dictated or typed without leaving the list. agiworkforce hides natural-language creation behind a QuickSchedule chip that opens a Modal, and offers no mic/dictation entry point for scheduling.

**Evidence**

apps/mobile/src/features/schedules/components/QuickSchedule.tsx (Modal-based flow, TextInput only); apps/mobile/app/(app)/schedules/index.tsx renders it as an inline chip above the list

**Suggested fix**

Promote QuickSchedule to a pinned bottom composer reusing the chat ChatInput shell (attach button, text field, mic wired to the existing voice feature, send), keeping the modal only for the detailed form.

**Reference screenshot(s)**

- `chatgpt_reference/048-chatgpt-ios-scheduled-tasks-suggestions-daily-brief-email-monitor.png`

### GAP-170 — Approval-mode switch is only reachable via a deep Settings screen, no inline modal

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-interaction
- **Reference:** Claude · iOS · Select mode bottom sheet

**Gap**

Claude lets the user switch between 'Ask before acting' and 'Act without asking' via a lightweight bottom-sheet modal opened directly from the task/chat view. AGIW's equivalent (and more granular — 3 tiers) control lives at Settings > Action approvals (apps/mobile/app/(app)/settings/auto-approve.tsx), three navigation levels away from the task view, with no quick-switch affordance in the chat/task screen itself.

**Evidence**

grep for 'Select mode', 'auto-approve', 'ask before acting' in apps/mobile/app/(app)/agents — no matches; the only implementation is the standalone settings/auto-approve.tsx screen.

**Suggested fix**

Add a mode-indicator chip in the task/chat header or composer that opens a bottom-sheet modal (reusing the 3-tier OPTIONS from auto-approve.tsx) so users can change approval mode without leaving the task.

**Reference screenshot(s)**

- `claude_reference/106-claude-ios-cowork-select-mode-modal-ask-before-acting-selected.png`

### GAP-171 — Code session menu lacks Pin, and has no dedicated Changes/Files entries

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** Claude/Codex · iOS · Session context menu: Pin, Rename, Archive, Changes, Files

**Gap**

The reference session menu offers Pin (keep a session at top of the list), Rename, Archive, plus direct navigation to 'Changes' (diff view) and 'Files' (file browser) for that session. agiworkforce's CodeSessionMoreMenu offers Copy branch, Share, Rename, and Archive — no Pin action, and no way to jump to a changes/diff view or a file browser for the session; Rename is also a dead end on mobile ('Mobile can preview this session. Rename it from AGI Desktop.').

**Evidence**

apps/mobile/src/features/code-sessions/components/CodeSessionMoreMenu.tsx:54-74 (menu rows: Copy branch, Share, Rename, Archive only); apps/mobile/src/features/code-sessions/index.tsx:266-272 (renameSession shows an Alert redirecting to desktop instead of renaming)

**Suggested fix**

Add a Pin toggle to CodeSessionMoreMenu (persisted per-session, sessions list sorts pinned first) and add Changes/Files menu rows that route to a diff viewer and file browser respectively, once those views exist; implement inline rename on mobile instead of redirecting to desktop.

**Reference screenshot(s)**

- `references-2/IMG_0625.PNG`

### GAP-172 — No 'switch models when a message is flagged' safety fallback setting

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** Claude · iOS · Settings > Capabilities

**Gap**

Claude lets users choose whether a flagged message auto-switches to a fallback model (continuing the chat) or pauses the conversation instead. agiworkforce has no equivalent setting on any surface.

**Evidence**

searched 'flagged', 'switch model' across apps/mobile, apps/web, apps/desktop — no safety-triggered model-switch preference found

**Suggested fix**

Add a toggle in Capabilities (mobile) and Capabilities settings tab (desktop/web) that controls whether safety-flagged messages auto-fallback to another model or pause the chat, with matching backend support.

**Reference screenshot(s)**

- `claude_reference/127-claude-ios-settings-capabilities-artifacts-code-exec-web-search-toggles.png`

### GAP-173 — No Auto / On-demand / Always-available tool-loading strategy setting

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** Claude · iOS · Settings > Capabilities (Tool access radio)

**Gap**

Claude lets users trade off message budget vs. tool accuracy by choosing how connector tools are loaded into context (Auto, On demand, Always available). No equivalent radio/picker exists in agiworkforce.

**Evidence**

searched 'on demand', 'always available', 'tool access' across apps/mobile, apps/web, apps/desktop — no tool-loading-strategy setting found

**Suggested fix**

Add a 3-option tool-loading strategy control near the connectors/capabilities settings, threaded through to the context-assembly logic that decides when connector tool schemas are injected.

**Reference screenshot(s)**

- `claude_reference/128-claude-ios-settings-capabilities-memory-and-tool-access-radio.png`

### GAP-174 — No cloud/agent browser settings on mobile (site approval default, cookie clearing)

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-screen
- **Reference:** ChatGPT · iOS · Settings > Cloud browser

**Gap**

Reference gives the agent's cloud browser its own settings screen: a Default permission ('Always ask') dropdown, per-site overrides via 'Add site', explainer copy, and a destructive 'Clear all cookies' under Browser data. agiworkforce mobile exposes no browsing-permission surface, so if/when a cloud agent opens websites the user has no default policy, no per-site control and no way to clear the browsing identity.

**Evidence**

grep -i 'cloud browser|add site|allowlist' across apps/mobile src+app — no matches beyond unrelated openBrowserAsync/WebBrowser usage; nearest concept is apps/desktop/src/features/settings/AgentExecutionSettings.tsx 'Allowed network domains'

**Suggested fix**

If cloud browsing ships on mobile, add /(app)/settings/cloud-browser with a Default policy picker (Always ask / Allow / Block), an Add site override list, and Clear all cookies; if it does not, ensure no chat affordance implies the agent can browse.

**Reference screenshot(s)**

- `chatgpt_reference/057-chatgpt-ios-settings-cloud-browser-default-permissions-clear-cookies.png`

### GAP-175 — No 'Connector discovery' auto-suggest toggle

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** Claude · iOS · Settings > Connectors

**Gap**

Claude iOS has a 'Connector discovery' toggle letting Claude proactively suggest relevant connectors from the user's directory. agiworkforce's connector screen (richer catalog UI overall) has no equivalent discovery/auto-suggest setting.

**Evidence**

apps/mobile/src/features/settings/cloud-connectors/index.tsx — no 'discovery' string or toggle present

**Suggested fix**

Add a 'Connector discovery' toggle at the top of the connectors screen that, when on, lets the assistant proactively surface relevant connectors mid-conversation.

**Reference screenshot(s)**

- `claude_reference/129-claude-ios-settings-connectors-connector-discovery-toggle.png`

### GAP-176 — No separate consent for voice/audio recordings

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Settings > Data controls

**Gap**

Reference splits audio out of the general training consent ('Include audio recordings — Share audio from voice chats to train our models'), defaulted off. agiworkforce has a voice feature and voice-language settings but no audio-specific data control, so voice data is governed by nothing the user can see.

**Evidence**

apps/mobile/src/features/settings/data-controls/index.tsx; grep -i 'audio recording|voice data|train' across apps/mobile/src/features/settings — only the cloud-privacy prose

**Suggested fix**

Add a second, independently persisted toggle 'Include audio recordings' nested under the training consent, disabled (and visually subordinate) while the parent consent is off.

**Reference screenshot(s)**

- `chatgpt_reference/055-chatgpt-ios-settings-data-controls-model-training-location-services.png`

### GAP-177 — No chat-history controls: archive, archive all, or delete all chats

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Settings > Data controls

**Gap**

Reference groups 'Chat history' with Archived chats >, Archive all chats, and Delete all chats. agiworkforce mobile has no archive concept at all — a conversation menu item for it was removed because nothing was wired — and the only bulk destructive action is the Storage screen's full device wipe, which also deletes memory, settings and models.

**Evidence**

apps/mobile/src/features/sidebar/components/ConversationItem.tsx lines 96-98 ('No "Archive" entry here: it rendered unconditionally with no wired action … conversations have no archived field'); grep -i 'delete all chats|deleteAllConversations' across apps/mobile/src — no match

**Suggested fix**

Add an `archivedAt` field to local and cloud conversations, an Archived chats screen, and a Chat history group in Data Controls with Archive all / Delete all chats (both confirmed, and scoped to the active Local vs Cloud mode so the trust boundary is explicit in the confirmation copy).

**Reference screenshot(s)**

- `chatgpt_reference/055-chatgpt-ios-settings-data-controls-model-training-location-services.png`

### GAP-178 — No user control over automatic web search ('Automatically use' group)

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Settings > General

**Gap**

The reference has an 'Automatically use' group whose 'Web search' switch, with the explainer 'Search the web for real-time info.', lets a user stop the model reaching the network on its own. In agiworkforce web search is always on for capable signed-in cloud sessions and the Capabilities screen only reports status.

**Evidence**

apps/mobile/src/features/chat/components/ChatInput.tsx:174 ('Web search has no user toggle -- it is on for every capable signed-in…'); apps/mobile/src/features/settings/capabilities/index.tsx:118-126 (read-only 'Web search' row)

**Suggested fix**

Add an 'Automatically use → Web search' switch in General (or make the Capabilities row interactive) that is genuinely honoured by the request builder, with copy stating that turning it off may produce stale answers.

**Reference screenshot(s)**

- `chatgpt_reference/066-chatgpt-ios-settings-general-app-language-toggles.png`

### GAP-179 — No global default intelligence level; effort is per-conversation only

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-ia
- **Reference:** ChatGPT · iOS · Settings > General

**Gap**

The reference surfaces an 'Intelligence → Pro level' default in General so every new chat inherits a chosen tier. In agiworkforce, effort is only reachable inside the model picker sheet and is stored per conversation (or under a '**default**' project key with no UI), so users must re-set it repeatedly.

**Evidence**

apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:206-215 (setEffort per conversation / setProjectDefault('**default**')); apps/mobile/src/features/settings/general/index.tsx (no effort row)

**Suggested fix**

Add an 'Intelligence' row in General bound to the existing agentControlStore '**default**' project default, listing the efforts the default model supports, so new conversations start at the user's chosen tier.

**Reference screenshot(s)**

- `chatgpt_reference/066-chatgpt-ios-settings-general-app-language-toggles.png`

### GAP-180 — Approval policy is not surfaced where plugins/connectors are managed

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-ia
- **Reference:** ChatGPT · iOS · Settings > Plugins

**Gap**

Reference puts 'Permissions — Allow low-risk >' as the first row of the Plugins screen with the explainer 'Choose when ChatGPT should ask for permission when using plugins', so the policy is visible exactly where tools are enabled. agiworkforce has the equivalent policy (Ask every time / Low-risk actions / Approve all actions) but only on a separate Action approvals screen, so a user connecting a tool never sees the governing rule.

**Evidence**

apps/mobile/app/(app)/settings/auto-approve.tsx OPTIONS (ask/smart/full); apps/mobile/src/features/settings/cloud-connectors/index.tsx has no approval-policy row

**Suggested fix**

Add a first-row summary at the top of the connectors screen showing the current approval mode as a `value` on SettingsRow that deep-links to /(app)/settings/auto-approve, with the one-line explainer beneath the group.

**Reference screenshot(s)**

- `chatgpt_reference/051-chatgpt-ios-settings-plugins-permissions-list-added-allow-low-risk.png`

### GAP-181 — Remote control/companion is not in the Settings information architecture

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-ia
- **Reference:** Codex · iOS · Settings > Remote control

**Gap**

Reference places Remote control inside Settings, grouping Profile, Connections, Composer, Behavior and Safety on one page. agiworkforce reaches the companion only through a DesktopCompanionWidget in the navigation drawer; the Settings index has no companion, remote or desktop entry, so a user looking to manage or revoke a desktop pairing in Settings finds nothing.

**Evidence**

grep -n 'companion|Companion|Desktop' in apps/mobile/src/features/settings/index.tsx — no match; apps/mobile/src/features/drawer/components/DrawerContent.tsx line 451 renders DesktopCompanionWidget

**Suggested fix**

Add a 'Desktop & remote control' row to the Settings index that opens /(app)/companion, keeping the drawer widget as a shortcut, and show connection status as the row's `value`.

**Reference screenshot(s)**

- `chatgpt_reference/058-codex-ios-settings-remote-control-desktop-connection-composer-faceid.png`

### GAP-182 — No 'Start app with Voice' launch preference

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Settings > Voice

**Gap**

The reference lets users make voice the default launch surface ('Start ChatGPT with Voice'). agiworkforce always opens the chat tab; voice mode must be entered manually from the composer circle or /voice each time.

**Evidence**

apps/mobile/src/features/settings/voice/index.tsx; apps/mobile/app/(app)/(tabs)/chat.tsx (voice overlay opened only via handleOpenVoiceMode); grep 'start with voice|launch.\*voice' — no match

**Suggested fix**

Add a persisted 'Start AGI with Voice' switch in Voice settings; when on, the (app) layout routes first launch to the voice conversation overlay with a visible exit to chat.

**Reference screenshot(s)**

- `chatgpt_reference/064-chatgpt-ios-settings-voice-spruce-model-intelligence-language.png`

### GAP-183 — Voice settings lacks a Language row; speech language is only editable mid-session

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-ia
- **Reference:** ChatGPT · iOS · Settings > Voice

**Gap**

The reference puts 'Language: Auto' directly in Voice settings. In agiworkforce the Voice settings screen reads speechLanguage but never lets the user change it — the only setter lives in the in-session VoiceSelector component, so a user in Settings cannot change recognition/speech language.

**Evidence**

apps/mobile/src/features/settings/voice-language/index.tsx:177-179 (reads speechLanguage, no setter); apps/mobile/src/features/voice/components/VoiceSelector.tsx:49-84 (only setSpeechLanguage call site)

**Suggested fix**

Add a 'Language' SettingsRow (value = current language or 'Auto') to Settings > Voice that pushes the existing language list from VoiceSelector, writing through local/cloud settings stores as VoiceSelector does.

**Reference screenshot(s)**

- `chatgpt_reference/064-chatgpt-ios-settings-voice-spruce-model-intelligence-language.png`

### GAP-184 — No voice model / voice intelligence tier selection in Voice settings

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Settings > Voice

**Gap**

The reference exposes 'Model: Live' and 'Intelligence: Instant' so users pick the realtime voice pipeline and its reasoning tier before starting. agiworkforce's Voice settings only chooses a TTS provider (System, with Cloud disabled) and never surfaces which model answers in a voice session or at what effort.

**Evidence**

apps/mobile/src/features/settings/voice/index.tsx (ProviderOption system/cloud only); grep 'realtime|voice model' across apps/mobile/src — only cloud sync realtime, no voice model picker

**Suggested fix**

Add Model and Intelligence rows to Voice settings that read the voice-capable entries from models.json and the model's supportedEfforts (same source ModelPickerSheet uses), or, until a realtime voice route exists, show a single read-only row naming the model that answers voice turns.

**Reference screenshot(s)**

- `chatgpt_reference/064-chatgpt-ios-settings-voice-spruce-model-intelligence-language.png`

### GAP-185 — No phone-number identity row in account settings

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Settings root Account block

**Gap**

The reference's Account group shows Email, Phone number (with the verified number as the row value), Subscription and Restore purchases. agiworkforce shows Email and Subscription only; a phone number is never displayed, added or verified anywhere in the app, which also blocks SMS-based recovery/2FA affordances.

**Evidence**

apps/mobile/src/features/settings/index.tsx:300-330 (Account rows: email, subscription, restore); apps/mobile/src/features/settings/cloud-account/index.tsx (no phone); grep 'phone number|phoneNumber' across apps/mobile/src — only messaging setup and contacts import

**Suggested fix**

Surface Clerk's phone-number identity as a row in the Account group with add/verify/remove flows (or an explicit 'manage on the web' hand-off), and reuse it for MFA enrolment.

**Reference screenshot(s)**

- `chatgpt_reference/068-chatgpt-ios-settings-appearance-mode-system-light-dark-picker.png`

### GAP-186 — Settings root Billing row shows a generic 'Cloud'/'Sign in' tag, not the actual plan

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** Claude · iOS · Settings root — Billing row plan value

**Gap**

Reference's Settings root shows the user's real subscription tier inline next to Billing ('Max plan'). agiworkforce's row uses `cloudAccessTag`, computed only from Clerk sign-in/loading state ('Checking' / 'Cloud' / 'Sign in'), never the resolved plan name (e.g. Free/Pro/Max), so users can't see their tier at a glance from the settings root.

**Evidence**

apps/mobile/src/features/settings/index.tsx lines 301 (`cloudAccessTag = ... isClerkSignedIn ? 'Cloud' : 'Sign in'`) and 466-471 (billing row `tag: cloudAccessTag`).

**Suggested fix**

Pass the resolved plan/tier label (already available via useTierStore, used elsewhere for model gating) as the Billing row's trailing value instead of the generic cloud-access tag.

**Reference screenshot(s)**

- `claude_reference/119-claude-ios-settings-root-account-app-sections-top.png`

### GAP-187 — 'Shared links' settings screen exists but has no entry point from Settings

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-ia
- **Reference:** Claude · iOS · Settings root → Shared links entry point

**Gap**

The reference exposes 'Shared links' as a top-level row in Settings → Account. agiworkforce has a fully built screen at apps/mobile/app/(app)/settings/shared-links.tsx with the same empty-state copy, but no code anywhere navigates to it — it isn't listed in the settings sections array, so users can never reach it in the shipped app.

**Evidence**

grep for "settings/shared-links'" across apps/mobile/src and apps/mobile/app returns zero navigation call sites; apps/mobile/src/features/settings/index.tsx has no 'Shared links' row (searched for 'Shared links' and 'shared-links' — no match).

**Suggested fix**

Add a 'Shared links' row to the Account section of the settings list (apps/mobile/src/features/settings/index.tsx) that navigates to '/(app)/settings/shared-links'.

**Reference screenshot(s)**

- `claude_reference/126-claude-ios-settings-shared-links-empty-state-no-shared-links.png`

### GAP-188 — No phone-number identity row and no avatar edit affordance on mobile

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Settings — Account group

**Gap**

The reference Account group shows Email (tappable), Phone number, Subscription and Restore purchases, and the profile header carries a pencil badge for changing the avatar. agiworkforce shows email and subscription but has no phone row, and the Clerk avatar is rendered read-only on the cloud-account screen with no picker, even though expo-image-picker is already a dependency used for chat attachments.

**Evidence**

apps/mobile/src/features/settings/index.tsx lines 306-347 (Account rows); apps/mobile/src/features/settings/cloud-account/index.tsx:38,184-186 (avatarUrl rendered as Image, no edit); apps/mobile/src/features/media/photo-picker.ts (picker exists but is chat-only)

**Suggested fix**

Add a Phone number row bound to Clerk's phone identity (with add/verify) and wire an edit-avatar affordance on ProfileHeader that reuses pickImageAssets and Clerk's setProfileImage.

**Reference screenshot(s)**

- `chatgpt_reference/041-chatgpt-ios-settings-account-profile-identity-email-phone-theme.png`

### GAP-189 — App settings missing Remote control, Trusted contact, Cloud browser; Storage buried

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-ia
- **Reference:** ChatGPT · iOS · Settings — App settings list

**Gap**

The reference App settings group is General, Notifications, Voice, Parental controls, Trusted contact, Safety, Security and login, Remote control, Cloud browser, Storage, Data controls. agiworkforce's Device group covers General, Notifications, Voice, Parental Controls and a merged Safety & Security. Remote control has no settings entry at all (the paired-desktop screen is only reachable from the drawer widget), Trusted contact and Cloud browser do not exist in any surface, and the real Storage screen is only reachable two levels deep.

**Evidence**

apps/mobile/src/features/settings/index.tsx lines 348-397; apps/mobile/app/(app)/settings/storage.tsx linked only from settings/data-controls/index.tsx:117 and settings/general/index.tsx:67; grep -i 'trusted contact|crisis|cloud browser' across apps/mobile, apps/web/app and apps/desktop/src — no matches

**Suggested fix**

Promote Storage to the Device group, add a 'Remote control' row routing to /(app)/companion, and split Safety & Security into Safety and Security-and-login to match the mental model; track Trusted contact and Cloud browser as separate feature gaps.

**Reference screenshot(s)**

- `chatgpt_reference/042-chatgpt-ios-settings-account-app-list-general-notifications-security.png`

### GAP-190 — Mobile has no Plugins/Skills surface, so the drawer and settings both omit it

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-screen
- **Reference:** ChatGPT · iOS · Sidebar drawer

**Gap**

The reference exposes Plugins as a top-level sidebar destination and again under 'Customize ChatGPT' in settings. agiworkforce has plugin/skill management on web (/plugins, /settings/skills) and desktop (settings tabs Plugins and Skills) but nothing on mobile — the settings file even records that the entries were removed because the screens were never built, leaving a capability gap rather than just a nav gap.

**Evidence**

apps/mobile/src/features/settings/index.tsx lines 489-492 (MOB-6 comment removing Skills/Plugins entries); grep -i 'plugin' across apps/mobile matches only that comment; apps/mobile/src/features/skills contains store.ts/service.ts but no screens

**Suggested fix**

Build app/(app)/plugins backed by the existing skills store/service (installed list, marketplace tab, per-plugin enable and permission summary), then restore the drawer PRIMARY_ITEMS entry and the settings 'Customize' row.

**Reference screenshot(s)**

- `chatgpt_reference/040-chatgpt-ios-sidebar-nav-menu-recents-projects-peek.png`

### GAP-191 — Recents are capped at 8 with no path to full chat history

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Sidebar recents

**Gap**

The reference's sidebar scrolls the entire chat history under 'Recents'. agiworkforce caps the drawer list at DRAWER_RECENT_LIMIT = 8 and offers no 'See all' link or history screen, so older conversations are only reachable if the user remembers a search term.

**Evidence**

apps/mobile/src/features/drawer/components/DrawerContent.tsx:92 (DRAWER_RECENT_LIMIT = 8) and the recents block at 500-557 (no overflow affordance)

**Suggested fix**

Either paginate the drawer list on scroll or add a 'See all chats' row beneath Recents that opens a full history screen with date grouping, reusing the existing conversation list item and long-press menu.

**Reference screenshot(s)**

- `chatgpt_reference/077-chatgpt-ios-sidebar-nav-recents-chat-history-fab.png`

### GAP-192 — Voice conversation screen has no text-input fallback to type instead of speaking

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Voice mode reasoning status + text-input fallback

**Gap**

ChatGPT's voice overlay keeps a real composer (text field + mic + X) pinned at the bottom, letting the user type a message mid-conversation without leaving voice mode. agiworkforce's VoiceConversationScreen forces Keyboard.dismiss() on entry and renders no TextInput at all — the only way to communicate is the orb (tap-to-talk or push-to-talk).

**Evidence**

apps/mobile/src/features/voice/components/VoiceConversationScreen.tsx lines 202-204 (Keyboard.dismiss() on visible) and the full render tree (lines 260-404) contains no TextInput/composer.

**Suggested fix**

Add a slim always-visible text composer at the bottom of VoiceConversationScreen (matching the reference's pill-shaped input with mic and X) so users can switch to typing without exiting voice mode.

**Reference screenshot(s)**

- `references-2/chatgpt-ios-voice-05-reasoning-status.png`

### GAP-193 — No persistent Hands-free vs Push-to-talk voice mode preference

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** Claude · iOS · Voice settings

**Gap**

Claude iOS has a 'Mode' section with a persisted radio choice between Hands free ('Best for quiet environments') and Push to talk ('Hold to speak, release to send'). agiworkforce has push-to-talk vs hands-free behavior only as a live toggle inside an active voice conversation (VoiceConversationScreen.tsx), not as a saved Settings preference alongside Speed/Pitch/Voice.

**Evidence**

apps/mobile/src/features/voice/components/VoiceConversationScreen.tsx:395 (in-call toggle only); apps/mobile/src/features/settings/voice/index.tsx has Auto-listen toggle but no explicit hands-free/push-to-talk radio

**Suggested fix**

Add a persisted 'Mode' setting (Hands free / Push to talk) to the Voice settings screen that seeds the default state of the in-call toggle.

**Reference screenshot(s)**

- `claude_reference/131-claude-ios-voice-settings-buttery-hands-free-mode.png`

### GAP-194 — Work mode is hidden inside the '+' sheet instead of a header surface switcher

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-ia
- **Reference:** ChatGPT · iOS · Work mode header switcher

**Gap**

The reference switches surfaces from the title bar ('Chat ⌄' / 'Work ⌄'), making the current mode always visible and one tap away. In agiworkforce the equivalent workMode ('chat' vs 'agiwork') is a switch buried in the AddToChatSheet, and the chat header carries only the Local|Cloud execution toggle, so users cannot see which mode they are in.

**Evidence**

apps/mobile/src/features/chat/components/AddToChatSheet.tsx:196-201, 344-345 (setWorkMode toggle); apps/mobile/app/(app)/(tabs)/chat.tsx:588-601 (header holds only Menu + ModeToggle Local|Cloud)

**Suggested fix**

Promote workMode to a header dropdown showing the active surface name (Chat / Work) with the Local|Cloud toggle kept as a secondary chip, and mirror the selection in the composer placeholder ('Work with AGI').

**Reference screenshot(s)**

- `chatgpt_reference/076-chatgpt-ios-work-mode-task-list-github-suggested-tasks.png`

### GAP-195 — Empty chat names the active workspace and reopens its picker

- **Status:** Done
- **Owner:** Desktop
- **Surface/type:** desktop · missing-copy
- **Reference:** Codex · macOS desktop · Chat empty state headline

**Gap**

When a local folder is scoped, Desktop asks 'What should we build in <folder>?' and renders the folder name as an accessible button that reopens the authoritative folder picker. With no folder scope, the existing personalized greeting remains instead of inventing context.

**Evidence**

DesktopShellV3 passes the mode-aware currentFolderLabel and handleSelectFolder seam into EmptyChat. BrandedGreeting renders the scoped question and Change workspace action only for a real label. GAP-195-205-255-empty-chat.test.tsx verifies the exact accessible heading and picker callback. Rendered shell evidence is retained at apps/desktop/docs/qa/screenshots/GAP-195-205-255-empty-chat.png.

**Suggested fix**

Completed. Keep the headline sourced from the same folder-selection contract used by execution and attachments; hide it when no scope is known rather than inferring a repository.

**Reference screenshot(s)**

- `chatgpt_reference/079-codex-macos-chat-empty-state-agiworkforce-quick-actions.png`

### GAP-196 — No 'classify session states' or 'switch models on flagged message' toggles for AGI Code

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · macOS desktop · Claude Code settings > General

**Gap**

Reference has toggles to auto-classify sessions (blocked/ready-for-review/done) and to auto-switch models when a safety flag pauses a session. Neither exists for agiworkforce's coding agent.

**Evidence**

grep -i 'classify session' across apps/ — no match; AgiCodeTab only wires InstructionFilesSettings

**Suggested fix**

Add session-state auto-classification and model-switch-on-flag toggles to the AgiCode General section, with copy explaining usage/plan impact.

**Reference screenshot(s)**

- `claude_reference/148-claude-desktop-settings-claude-code-general-code-theme.png`

### GAP-197 — No iOS Simulator integration or pull-request automation settings for AGI Code

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · macOS desktop · Claude Code settings > Mobile simulators + Pull requests

**Gap**

Reference offers an iOS Simulator toggle (agent drives the simulator, takes screenshots) and a Pull requests section: branch prefix field, create-PR-automatically toggle, autofix-PR-on-CI-failure toggle, and auto-archive-session-after-PR-merge toggle. agiworkforce's coding agent settings have none of these.

**Evidence**

grep -i 'ios simulator' across apps/ found only an unrelated mobile ChatInput.tsx match; grep -i 'pull request' across apps/desktop found only git/mcp API code, no settings UI

**Suggested fix**

Add Mobile simulators and Pull requests sections to AgiCode settings with the four PR-automation toggles and a branch-prefix text field.

**Reference screenshot(s)**

- `claude_reference/151-claude-desktop-settings-claude-code-ios-simulator-pull-requests.png`

### GAP-198 — Usage dashboard has no streaks, active-days, peak-hour, favorite-model stats, or activity heatmap

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · macOS desktop · Code usage dashboard

**Gap**

Claude's Code usage dashboard shows Sessions, Messages, Total tokens, Active days, Current streak, Longest streak, Peak hour, Favorite model, a calendar-style activity heatmap, and a fun comparison stat ('You've used ~7982x more tokens than The Great Gatsby'). agiworkforce's UsageDashboard.tsx only shows token-budget, per-model cost, and monthly cost-tracking sections — none of the engagement/gamification stats or the heatmap exist.

**Evidence**

apps/desktop/src/features/settings/UsageDashboard.tsx (full file reviewed — Current session / Model limits / Cost tracking sections only); searched 'streak', 'heatmap', 'peak hour', 'favorite model' across apps/desktop/src — no matches

**Suggested fix**

Add an 'Overview' sub-tab to UsageDashboard.tsx with session/message counts, streak tracking (requires persisting daily-active-usage history), a peak-hour/favorite-model computation, and a small heatmap grid component (reusable for both desktop and web).

**Reference screenshot(s)**

- `claude_reference/136-claude-desktop-code-usage-dashboard-sessions-tokens-streaks-heatmap.png`

### GAP-199 — 'Record a skill' composer action disabled/hidden outside local privacy mode

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · macOS desktop · Composer add menu — Record a skill entry

**Gap**

In the reference, 'Record a skill' is a standard entry in the composer's '+' menu regardless of sync/cloud mode. In agiworkforce, apps/desktop/src/features/v3/DesktopShellV3.tsx only passes onRecordSkill to ChatInterface when privacyMode === 'local' (`onRecordSkill={ privacyMode === 'local' ? () => setActivePanel('record-skill') : undefined }`), so users on Managed/Cloud privacy mode have no way to record a skill from the composer.

**Evidence**

apps/desktop/src/features/v3/DesktopShellV3.tsx lines ~438-440 and ~452 (activePanel === 'record-skill' && privacyMode === 'local').

**Suggested fix**

Either support skill recording in Managed/Cloud privacy mode too (with appropriate data-handling disclosure), or, if it must stay local-only, show the menu entry in all modes but with a disabled state plus a tooltip explaining why (e.g. 'Switch to Local privacy mode to record skills') rather than omitting it silently.

**Reference screenshot(s)**

- `references-2/claude-desktop-cowork-record-skill-02-composer-add-menu.png`

### GAP-200 — Desktop home has no 'Pinned or active' task list with a 'Clear active' action

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-ia
- **Reference:** Claude · macOS desktop · Cowork home (new task)

**Gap**

Below the reference composer sits a 'Pinned or active' group with a 'Clear active' text action and rows showing a task-state icon, blue activity dot, title and relative timestamp — a launcher for in-flight work without opening the sidebar. agiworkforce's desktop empty state renders only the branded greeting; pinning exists but only as a sidebar conversation group with no home surfacing and no bulk clear.

**Evidence**

apps/desktop/src/features/v3/EmptyChat.tsx (renders BrandedGreeting only); apps/desktop/src/features/v3/Sidebar.tsx:68-92 (pinned group lives in the sidebar); searched 'Pinned or active'/'Clear active' across apps — only an unrelated mobile 'Clear active project' label

**Suggested fix**

Extend EmptyChat with a 'Pinned or active' section fed by pinned conversations plus any conversation with a running agent loop: row = status icon, activity dot, title, relative time; add a right-aligned 'Clear active' link that stops/archives finished active runs, and hide the whole block when the list is empty.

**Reference screenshot(s)**

- `references-2/claude-desktop-cowork-record-skill-05-processing-zero-steps.png`

### GAP-201 — No ambient screen-edge indicator while desktop capture is active

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-state
- **Reference:** Claude · macOS desktop · Cowork skill recording — active capture HUD

**Gap**

The reference paints a soft amber glow around the entire display border for the whole capture session, so the user can never forget that clicks and keystrokes are being recorded regardless of which app is focused. agiworkforce signals recording only with a 2px pulsing red dot inside its own window header, which is invisible the moment the user switches apps to demonstrate.

**Evidence**

apps/desktop/src/features/automation/ActionRecorder.tsx:302-304 (in-header pulsing dot); apps/desktop/src/features/overlay/ (ActionOverlay, ScreenshotOverlay, VisualizationLayer are in-window agent visualisations, not a screen-edge capture indicator)

**Suggested fix**

Add a full-screen, click-through, transparent Tauri overlay window per display that renders only an inset box-shadow glow in the brand accent while automationRecordStart is active; tear it down on stop/discard. Respect prefers-reduced-motion by rendering it static rather than pulsing.

**Reference screenshot(s)**

- `references-2/claude-desktop-cowork-record-skill-04-active-capture-zero-steps.png`

### GAP-202 — No Context empty state explaining tracked tools and referenced files

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-copy
- **Reference:** Claude · macOS desktop · Cowork task rail — Context empty state

**Gap**

The reference Context section, when empty, shows a stacked-cards illustration, the explainer 'Track tools and referenced files used in this task.', and two header actions (add file, attach this device) so the user knows what the section will fill with and can seed it. agiworkforce has no equivalent section, so there is neither the explainer nor the inline add-context affordances; adding context is only possible through the composer attach menu.

**Evidence**

searched 'Track tools'/'referenced files' across apps — no match; nearest is apps/desktop/src/features/context-handoff/SelectedContextReview.tsx and CloudFolderAttachSheet.tsx, neither of which is mounted in the chat rail

**Suggested fix**

Ship the Context section with an empty state carrying that explainer line plus two icon buttons in the section header — 'Add files to context' (reuses CloudFolderAttachSheet/file picker) and 'Attach this device' (local folder grant) — and fill it at runtime with tool names and file paths emitted by the agent loop.

**Reference screenshot(s)**

- `references-2/claude-desktop-cowork-record-skill-06-task-progress-outputs-context.png`

### GAP-203 — No compact right-rail Progress checklist / Outputs gallery distinct from the full artifacts editor

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-ia
- **Reference:** Claude · macOS desktop · Cowork task view right rail

**Gap**

Claude's right rail has three collapsible sections — Progress (numbered step list with check/in-progress/pending circle states and a 'See task progress for longer tasks' hint), Outputs (thumbnail-style gallery captioned 'View and open files created during this task'), and Context (folder/connector chips). AGIW's closest analog, ArtifactsPanel.tsx, is a full tabbed code/artifact editor without a lightweight numbered-step progress checklist or an outputs-only summary view.

**Evidence**

apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx (tab-based artifact editor, EmptyState 'No artifacts yet'); grep for 'Outputs'/'Progress' across apps/web/features and apps/desktop/src found no matching step-checklist or outputs-gallery component.

**Suggested fix**

Add a compact right-rail 'Progress' component rendering a numbered list of plan steps with check/spinner/empty-circle status icons (sourced from the agent's plan/todo state if one exists), and a lightweight 'Outputs' section listing/thumbnailing files created during the current task, separate from the full ArtifactsPanel editor.

**Reference screenshot(s)**

- `claude_reference/101-claude-desktop-cowork-agent-task-view-progress-outputs-expanded.png`

### GAP-204 — Home composer lacks in-line usage-limit banner, project/folder picker, and permission-mode ('Skip') selector

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · macOS desktop · Home launcher composer — usage banner, project picker, permission-mode picker

**Gap**

Claude's home composer shows a 'You've used 75% of your weekly limit' banner directly above the input, plus 'Project or folder' and 'Skip' (approval mode) pickers below it. agiworkforce's empty-chat composer has none of these controls at the home-screen level.

**Evidence**

apps/desktop/src/features/v3/EmptyChat.tsx, apps/desktop/src/features/chat/BrandedGreeting.tsx — composer-adjacent controls not present in these files; no home-level usage banner found

**Suggested fix**

Surface the existing budget/usage store (used in UsageDashboard.tsx) as a compact banner above the home composer when usage crosses a threshold, and add project/folder + approval-mode pickers consistent with the agent execution settings already defined in AgentExecutionSettings.tsx.

**Reference screenshot(s)**

- `claude_reference/137-claude-desktop-home-launcher-cowork-mode-recents-list.png`

### GAP-205 — Capability-aware quick-start chips seed the empty composer

- **Status:** Done
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · macOS desktop · Home launcher — quick-action category chips

**Gap**

The mounted shared composer renders Code, Write, Research, and only the media/computer categories supported by the active runtime. Selecting a chip activates its mode and seeds an editable category-appropriate prompt; unsupported Video, Image, or Computer actions are not advertised.

**Evidence**

ChatInterface owns QuickChips independently from the host empty-state slot and derives availability from the active runtime plus the Desktop entitlement override. Its handleChipClick writes the matching prompt to the conversation-scoped draft. GAP-195-205-255-empty-chat.test.tsx exercises Code through the mounted ChatInterface; QuickChips.capabilities.test.tsx covers capability filtering. apps/desktop/docs/qa/screenshots/GAP-195-205-255-empty-chat.png records the mounted chip row at desktop size.

**Suggested fix**

Completed. Keep these chips runtime-capability-aware and editable; add categories only when their mode reaches an execution path rather than copying a reference label that would be prompt-only.

**Reference screenshot(s)**

- `claude_reference/138-claude-desktop-home-launcher-chat-mode-quick-actions.png`

### GAP-206 — Desktop empty chat has no starter actions, unlike web greeting chips

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-ia
- **Reference:** ChatGPT · macOS desktop · Model picker — Intelligence levels

**Gap**

The reference dropdown leads with an 'Intelligence' group — Instant 5.5 / Medium / High / Extra High / Pro — and demotes the model family to a single submenu row ('GPT-5.6 Sol >'). That matches how people choose ('how hard should it think?') rather than how vendors ship. agiworkforce inverts it: a recommended/more model roster is primary and effort lives in a nested flyout, and the effort marks use provider vocabulary (none/minimal/low/medium/high/xhigh/max) rather than human labels.

**Evidence**

apps/web/features/chat/components/Composer/ComposerFooter.tsx:614-620 (partitionModels into recommended/more, model list primary), :92-100 (EFFORT_CHIP_LABEL raw vocabulary), :686-698 (effort slider inside the flyout)

**Suggested fix**

Keep the catalog-driven correctness (supportedEfforts, clamping, always_on handling) but restructure the trigger menu so the effort ladder is the top-level list under an 'Intelligence' heading with human labels (rename xhigh → 'Extra High'), and move model-family switching to a submenu row showing the current model.

**Reference screenshot(s)**

- `chatgpt_reference/090-chatgpt-macos-model-picker-dropdown-intelligence-levels.png`

### GAP-207 — No risk-tiered default permission preset ('Allow low-risk actions') for plugin/connector actions

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** ChatGPT · web · Plugins — Permissions preset

**Gap**

Reference has a single global 'Permissions' setting — 'Choose when ChatGPT should ask for permission when using plugins' — with presets like 'Allow low-risk actions'. agiworkforce has a related but distinct control (AgentExecutionSettings' approval-timeout policy: auto-deny/auto-approve/pause on timeout), which governs what happens when an approval prompt is not answered in time, not a standing risk-tiered default for whether to prompt at all.

**Evidence**

apps/desktop/src/features/settings/AgentExecutionSettings.tsx lines ~197-225 (Timeout policy: auto-deny/auto-approve/pause — a different control than a standing risk-tier default)

**Suggested fix**

Add a 'Default permissions' preset selector (e.g. Always ask / Allow low-risk actions / Allow all) to the Connectors/Plugins settings tab, distinct from the existing approval-timeout-fallback policy.

**Reference screenshot(s)**

- `chatgpt_reference/128-chatgpt-web-settings-plugins-permissions-and-apps-top.png`

### GAP-208 — Adopt the partial-failure + empty + unselected triple-state pattern for list panels

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-state
- **Reference:** Codex · macOS desktop · Pull requests list states

**Gap**

The reference distinguishes three states at once: a non-blocking partial-error banner with a Retry action ('Some pull requests couldn’t be loaded'), a list empty state ('No pull requests found'), and a detail-pane placeholder ('Select pull request to view'). agiworkforce's comparable list panels do not model partial failure — when a source fails the panel either shows nothing or a whole-panel error, losing the rows that did load.

**Evidence**

apps/desktop/src/features/v3/AgiWorkProjects.tsx / AgiWorkArtifacts.tsx / AgiWorkScheduled.tsx (single loading/empty rendering, no partial-failure banner); no PR panel exists to compare against

**Suggested fix**

Introduce a shared ListPanelStates wrapper providing partial-error banner with retry, empty state, and detail-pane placeholder, and adopt it in the existing Projects/Artifacts/Scheduled panels as well as any new PR panel.

**Reference screenshot(s)**

- `chatgpt_reference/084-codex-macos-pull-requests-list-empty-error-state.png`

### GAP-209 — Skill recorder captures no voice narration and has no microphone device picker

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · macOS desktop · Record a skill consent dialog

**Gap**

The reference consent dialog states 'Your screen, clicks, typing, and voice are recorded, then sent to Claude and turned into a repeatable skill' and includes a microphone icon with a chevron for choosing the input device. agiworkforce's ActionRecorder consent copy says only 'AGI captures mouse clicks and typing across your desktop' — voice narration is never mentioned or implemented, and there is no audio-input device selector anywhere in the component.

**Evidence**

apps/desktop/src/features/automation/ActionRecorder.tsx lines ~264-291 (consent copy) and grep -n -i 'microphone|audio|voice|mic' on the file returned no matches.

**Suggested fix**

Add optional voice narration capture during recording (so users can explain what they're doing as they demonstrate it, improving the resulting skill's quality) with a mic on/off toggle and input-device picker in the consent dialog, matching the reference.

**Reference screenshot(s)**

- `references-2/claude-desktop-cowork-record-skill-03-privacy-consent.png`

### GAP-210 — Pairing instructions omit where to enter the code on the receiving device

- **Status:** Done
- **Owner:** Desktop
- **Surface/type:** desktop · missing-copy
- **Reference:** Codex · macOS desktop · Remote pairing modal — Computer tab

**Gap**

The Desktop pairing card now names the real Mobile destination and action: AGI Workforce > Desktop Companion > Scan QR Code. It also explains that the receiving phone can choose Enter code manually and type the displayed 12-character code, matching the mounted Mobile scanner labels rather than inventing a Menu item.

**Evidence**

apps/desktop/src/features/mobile-companion/QRPairingCard.tsx owns the corrected three-step instructions and manual-code help. apps/mobile/app/(app)/companion/index.tsx names the destination Desktop Companion; ConnectionStateViews.tsx and QRScanner.tsx own Scan QR Code and Enter code manually. QRPairingCard.test.tsx pins the cross-surface copy. Browser evidence: apps/desktop/docs/qa/screenshots/GAP-210-211-mobile-pairing-full.png.

**Suggested fix**

Completed. Keep Desktop instructions synchronized with the mounted Mobile route and scanner labels whenever the companion navigation changes.

**Reference screenshot(s)**

- `chatgpt_reference/035-codex-macos-settings-connections-remote-pairing-computer-tab-pairing-code.png`

### GAP-211 — Pairing card has no Phone/Computer tabs, no enlarge-QR, and no copy-code button

- **Status:** Not Planned
- **Owner:** Desktop
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Remote pairing modal — Phone tab

**Gap**

The supported phone-pairing card now generates a high-resolution QR, exposes compact refresh and enlarge actions, opens the QR in a focused full-width dialog, and copies the raw pairing code with success/failure feedback. A Phone/Computer selector is intentionally absent: the authoritative store and signaling contract support one short-lived mobile companion session, not computer-to-computer pairing.

**Evidence**

QRPairingCard.tsx implements refresh, enlarged QR, and raw-code copy with accessible labels; connectionStore.ts provides a deterministic non-connectable UI-development fixture without changing production authentication. QRPairingCard.test.tsx covers refresh, enlarge, copy, and the absence of a fake Computer tab. Browser evidence: apps/desktop/docs/qa/screenshots/GAP-210-211-mobile-pairing-full.png and apps/desktop/docs/qa/screenshots/GAP-211-mobile-pairing-enlarged-qr.png.

**Suggested fix**

Supported phone affordances are complete. Reconsider a Computer tab only after the signaling, identity, authorization, routing, revocation, and UI contracts support computer-to-computer pairing as a real target.

**Reference screenshot(s)**

- `chatgpt_reference/034-codex-macos-settings-connections-remote-pairing-phone-tab-qr-code.png`

### GAP-212 — No keyboard shortcuts for the tool panels, and shortcuts are not shown on the launcher

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-interaction
- **Reference:** Codex · macOS desktop · Right tool panel launcher

**Gap**

The reference prints each tool's accelerator on its launcher row (Review ^⇧G, Browser ⌘T, Files ⌘P), so the shortcuts are learnable in place. agiworkforce's shortcut registry has new chat, search, navigation, model and window entries but nothing for terminal, browser, files or review.

**Evidence**

apps/desktop/src/constants/shortcuts.ts (ids: new-chat, clear, copy-last, voice-input, settings, search, navigate-_, model-select, toggle-sidebar, minimize, fullscreen, zoom-_; no panel tools)

**Suggested fix**

Register terminal/browser/files/review toggle shortcuts in constants/shortcuts.ts under a 'panels' category so they appear in KeybindingsSettings and the shortcuts overlay, and render the bound combo on each launcher row.

**Reference screenshot(s)**

- `chatgpt_reference/080-codex-macos-right-panel-shortcuts-review-terminal-browser-files.png`

### GAP-213 — List destinations lack the in-list search field the reference gives every one of them

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Scheduled tasks / Sites / Plugins list headers

**Gap**

Sites, Scheduled tasks and Plugins each open with a full-width search field ('Search sites', 'Search scheduled tasks', 'Search plugins') plus a one-line purpose subtitle under the title. agiworkforce's equivalent destinations render a title and action button but no search: AgiWorkScheduled has neither search nor subtitle, and AgiWorkArtifacts has a subtitle and refresh but no search. Once a user accumulates more than a screenful of tasks or artifacts there is no way to find one without scrolling.

**Evidence**

apps/desktop/src/features/v3/AgiWorkScheduled.tsx:78-90 (h1 + 'Schedule new' button only); apps/desktop/src/features/v3/AgiWorkArtifacts.tsx:60-79 (title, subtitle, refresh button; listPersistedArtifacts is called with a 50-item cap and no query)

**Suggested fix**

Add a shared ListHeader component (title, subtitle, search input, primary action, refresh) and use it in AgiWorkScheduled, AgiWorkArtifacts and the future Plugins destination; pass the query through to listPersistedArtifacts, which already accepts a filter argument.

**Reference screenshot(s)**

- `chatgpt_reference/086-codex-macos-scheduled-tasks-daily-weekly-followup-suggestions.png`

### GAP-214 — No contrast slider on themes — no way to strengthen legibility without a custom theme

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings > Appearance — theme tokens

**Gap**

Both reference theme cards end with a Contrast slider (light 45, dark 60) that adjusts token contrast within the chosen theme. agiworkforce's Accessibility section offers only Dyslexic Friendly Font; a user who finds a theme too low-contrast must clone it in ThemeEditorDialog and hand-edit HSL values for every token.

**Evidence**

apps/desktop/src/features/settings/ThemeSettings.tsx:660-692 (Accessibility section = Dyslexic Friendly Font only); grepped 'contrast' in ThemeSettings.tsx and ThemeEditorDialog.tsx — no match; ThemeEditorDialog exposes raw per-token HSL pickers only

**Suggested fix**

Add a `contrast` scalar per theme mode that post-processes resolved theme tokens (scale the L channel distance between foreground and background) and render it as a slider in the Appearance tab, applied on top of whichever built-in or custom theme is active.

**Reference screenshot(s)**

- `chatgpt_reference/094-codex-macos-settings-appearance-theme-picker-light-colors.png`

### GAP-215 — No in-app invoice history, payment-method display, or cancel-plan control

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-screen
- **Reference:** Claude · macOS desktop · Settings > Billing

**Gap**

Claude's Billing settings render an in-app invoice table (Date/Total/Status/View), a masked payment card with an Update button, and a red Cancel-plan button — all without leaving the app. agiworkforce's BillingSettings.tsx shows only Plan/Subscription/Renews text rows plus a single 'Manage billing' button that opens the external Stripe customer portal for everything else.

**Evidence**

apps/desktop/src/features/settings/BillingSettings.tsx (full file reviewed — dl rows + one 'Manage billing' button; no invoice table, no card display, no cancel button)

**Suggested fix**

If product strategy allows, pull invoice history and payment-method summary from Stripe's API into an in-app table/card (read-only is fine, deep-linking 'Update'/'Cancel' to the portal), reducing context-switching versus the current full-handoff approach.

**Reference screenshot(s)**

- `claude_reference/144-claude-desktop-settings-billing-max-plan.png`

### GAP-216 — Desktop agent browsing has no per-site permission policy or cookie reset

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** ChatGPT · iOS · Settings > Cloud browser

**Gap**

Reference models browsing permission as a default ('Always ask') plus per-site overrides, and offers cookie clearing. agiworkforce desktop has a browser/computer-use feature stack but its only network gate is a comma-separated 'Allowed network domains' text field for the terminal sandbox — free-text, unvalidated, with no per-site ask/allow semantics and no way to clear the agent browser's cookies.

**Evidence**

apps/desktop/src/features/settings/AgentExecutionSettings.tsx lines 336-346; apps/desktop/src/features/browser/\* (BrowserViewer, BrowserActionLog) has no permission UI; grep -i 'always ask|per-site|cookies' across those dirs — no match

**Suggested fix**

Replace the comma-separated field with a policy row (Always ask / Allow listed / Block all) plus an editable site list with per-site allow/block, and add a 'Clear browser data' destructive action in the browser settings section.

**Reference screenshot(s)**

- `chatgpt_reference/057-chatgpt-ios-settings-cloud-browser-default-permissions-clear-cookies.png`

### GAP-217 — No reasoning-effort availability allow-list to trim the model picker

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings > Configuration — Model features

**Gap**

The reference lets the user choose which effort levels appear in model controls ('Available reasoning efforts → 5 selected', with the caveat 'Availability varies by model') and whether the top tier shows in the picker slider. agiworkforce derives effort chips purely from catalog supportedEfforts with no user-level filter, so users who never use minimal/xhigh/max still scroll past them on every model switch.

**Evidence**

apps/web/features/chat/components/Composer/ComposerFooter.tsx:109-111 (effortChipsFor returns r.supportedEfforts unfiltered), :92-100 (EFFORT_CHIP_LABEL: none/minimal/low/medium/high/xhigh/max); grepped 'availableEfforts|allowedEfforts|enabledEfforts' across apps — no match

**Suggested fix**

Add a user preference holding an allowed-effort set, intersect it with each model's supportedEfforts when building effortChips (never letting the intersection go empty — fall back to the model default), and render it as a multi-select in settings.

**Reference screenshot(s)**

- `chatgpt_reference/097-codex-macos-settings-configuration-approval-sandbox-model-features.png`

### GAP-218 — No scope selector or open-file link for the underlying agent config

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings > Configuration — config.toml

**Gap**

The reference frames these settings as a view over a real config file: a 'User config ⌄' scope selector and an 'Open config.toml ↗' link so power users can see and edit the source of truth. agiworkforce reads and displays comparable dotfiles (DotfileSettings: CLI Configuration, MCP Servers, Instructions, Memories; InstructionFilesSettings: File/Source/Status/Found) but offers no scope switch on the execution settings and no way to open the backing file.

**Evidence**

apps/desktop/src/features/settings/DotfileSettings.tsx (read-only inventory: CLI Configuration, Configuration, Ecosystem, Instructions, MCP Servers, Memories, Skills); apps/desktop/src/features/settings/InstructionFilesSettings.tsx (File/Source/Status/Found/Not found columns, no open action); grepped 'Open config' across apps/desktop — no match

**Suggested fix**

Add a user/project scope selector to Agent Execution settings mirroring CustomInstructionsSettings' Global/Project split, and add an 'Open file' action per row in DotfileSettings and InstructionFilesSettings using the same reveal helper proposed for asset paths.

**Reference screenshot(s)**

- `chatgpt_reference/097-codex-macos-settings-configuration-approval-sandbox-model-features.png`

### GAP-219 — No paired-device list, empty state, or refresh for devices allowed to control this machine

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-state
- **Reference:** Codex · macOS desktop · Settings > Connections

**Gap**

The reference shows a device card with a manual refresh icon and a proper empty state (phone-to-laptop glyph, 'Add device to control this Mac remotely', Add button). agiworkforce has no device inventory at all: connectionStore models a single ephemeral session, so a user cannot see which phones are trusted or revoke one.

**Evidence**

apps/desktop/src/stores/connectionStore.ts (single MobileCompanionState session, no device roster); apps/desktop/src/features/mobile-companion/\* contains no device list component

**Suggested fix**

Persist paired devices (name, platform, last-seen, pairing time) and render them in the Connections tab with per-row Revoke, an empty state with an Add button that opens the pairing modal, and a refresh control.

**Reference screenshot(s)**

- `chatgpt_reference/032-codex-macos-settings-connections-control-this-mac-allow-toggle.png`

### GAP-220 — No 'keep this machine awake' option for remote sessions

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings > Connections

**Gap**

Reference offers 'Keep this Mac awake — Prevent sleep when computer is plugged in and remote access is enabled', which is what makes remote control reliable in practice. agiworkforce has no sleep-inhibition setting anywhere on desktop, so a phone-initiated session silently dies when the laptop sleeps.

**Evidence**

grep -i 'keep.\*awake|prevent sleep|while locked' across apps/desktop/src — no match

**Suggested fix**

Add a power-management toggle in the Connections tab wired to a Tauri sleep-inhibit command, active only while a remote session is live and the machine is on AC, with copy stating both conditions.

**Reference screenshot(s)**

- `chatgpt_reference/053-codex-macos-settings-connections-control-this-mac-devices.png`

### GAP-221 — No 'keep this computer awake while remote access is enabled' setting

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings > Connections > Other settings

**Gap**

The reference pairs remote control with a 'Keep this Mac awake — Prevent sleep when computer is plugged in and remote access is enabled' toggle, because a sleeping host silently breaks every remote session. agiworkforce has no sleep-prevention concept: searching for keep-awake, prevent sleep, caffeinate and wake lock across apps/desktop/src returns nothing.

**Evidence**

grep -i 'keep.?awake|prevent sleep|caffeinate|wake ?lock' apps/desktop/src — no matches

**Suggested fix**

Add a keepAwakeWhileRemote preference that invokes a Tauri power-management command while a companion session is live, and place it under an 'Other settings' block on the Connections tab with the same explanatory subtitle.

**Reference screenshot(s)**

- `chatgpt_reference/032-codex-macos-settings-connections-control-this-mac-allow-toggle.png`

### GAP-222 — Desktop extension manager lacks Configure/Browse/Advanced-settings/drag-install affordances

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · web · Settings > Extensions (desktop-installed list, synced to web)

**Gap**

Reference's Extensions list shows each installed extension with a 'Configure' button plus an overflow (...) menu, a top-level 'Browse extensions' CTA linking to the marketplace, an 'Advanced settings' link, and a 'Drag .MCPB or .DXT files here to install' dropzone. agiworkforce's ExtensionsSettings.tsx only has Install/Enable-Disable/Uninstall/Refresh buttons — no Configure action, no Browse-extensions link, no Advanced settings, no drag-and-drop install.

**Evidence**

apps/desktop/src/features/settings/ExtensionsSettings.tsx — grep for 'drag', '.mcpb', '.dxt', 'browse extension', 'advanced settings', 'Configure' all return no matches

**Suggested fix**

Add a per-extension Configure action (opens extension-specific settings), a Browse-extensions CTA to a marketplace, an Advanced-settings link, and drag-and-drop .MCPB/.DXT file installation to ExtensionsSettings.tsx.

**Reference screenshot(s)**

- `claude_reference/157-claude-web-settings-extensions-desktop-installed-list.png`

### GAP-223 — No open-source licenses / third-party notices view in the desktop app

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-screen
- **Reference:** Codex · macOS desktop · Settings > General — Open source licenses

**Gap**

The reference has 'Open source licenses · Third-party notices for bundled dependencies → View'. agiworkforce ships a distributed Tauri binary bundling npm and Rust dependencies but has no in-app third-party notices view, which is an attribution obligation for most permissive licenses and a checklist item for app-store and enterprise review.

**Evidence**

grepped 'Open source licenses|third-party notices|licenses' across apps/desktop/src — no match; web has /legal, /terms, /privacy routes but the desktop settings rail has no legal/about destination

**Suggested fix**

Generate a NOTICE/licenses bundle at build time (license-checker + cargo-about) and render it behind a 'Open source licenses → View' row in desktop settings, alongside app version and build id.

**Reference screenshot(s)**

- `chatgpt_reference/092-codex-macos-settings-general-composer-notifications-popout.png`

### GAP-224 — Quick-query overlay hotkey is hardcoded and absent from settings

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings > General — Popout Window

**Gap**

The reference exposes 'Popout Window hotkey' as an editable global shortcut with an explicit off state ('Leave unset to keep it off'), plus 'Default to projectless chat'. agiworkforce's quick-query overlay — its popout equivalent — documents a hardcoded Cmd+Shift+Space / Ctrl+Shift+Space binding that appears nowhere in settings, so it cannot be changed or disabled even though it registers a system-wide hotkey. The separate 'Global Hotkey' setting in General controls a different action (raising the main window).

**Evidence**

apps/desktop/src/features/quick-query/index.tsx:4-6 ('appears when the user presses the global hotkey (Cmd+Shift+Space on macOS, Ctrl+Shift+Space on Windows/Linux)'); apps/desktop/src/features/settings/GeneralSettings.tsx:65-97 (Global Hotkey group applies to opening the app, not quick query)

**Suggested fix**

Add a quickQueryHotkey preference next to the existing global hotkey field, with the same accelerator validation and an explicit unset/off state, and register/unregister the Tauri global shortcut from that preference instead of a constant.

**Reference screenshot(s)**

- `chatgpt_reference/092-codex-macos-settings-general-composer-notifications-popout.png`

### GAP-225 — Asset paths shown as inert text with no Open folder action

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-interaction
- **Reference:** Codex · macOS desktop · Settings > Keyboard shortcuts — app actions

**Gap**

The reference makes essentially every app action a bindable target: Commit or push, Create PR, Open folder (⌘O), Force reload skills, Go to skills, Import from other AI apps, MCP (configure servers), Personality, Feedback, Log out, Manage scheduled tasks, Keyboard shortcuts itself. agiworkforce's shortcut catalogue is 21 entries across chat/navigation/model/agent/tools/window and covers none of these, even though every one of the corresponding surfaces exists (GitCommitDialog, useFolderSelection.selectFolder, MCPServerSettings, FeedbackDialog, scheduler, memory-import).

**Evidence**

apps/desktop/src/constants/shortcuts.ts:28-235 (21 definitions), :240-247 (six categories, no git/app-action category); apps/desktop/src/features/git/GitCommitDialog.tsx and features/settings/MCPServerSettings.tsx exist but are unreachable by keyboard

**Suggested fix**

Extend ShortcutDefinition with 'git' and 'application' categories and register command-palette actions as bindable shortcut targets, so any action already in CommandPalette automatically appears in the keybindings list with a default of unassigned.

**Reference screenshot(s)**

- `chatgpt_reference/104-codex-macos-settings-keyboard-shortcuts-git-commands-app-actions.png`

### GAP-226 — No user-assignable shortcut slots for custom commands or workflows

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-interaction
- **Reference:** Codex · macOS desktop · Settings > Keyboard shortcuts — environment action slots

**Gap**

The reference reserves nine generic 'Environment action 1-9' rows ('Run the environment action in this shortcut slot') so power users can bind their own project actions to keys without the app predefining them. agiworkforce has custom commands (CustomCommandsSettings) and a workflow builder but no way to bind either to a key — the shortcut catalogue is a fixed compile-time list.

**Evidence**

apps/desktop/src/constants/shortcuts.ts DEFAULT_SHORTCUTS is a static array with no slot entries; apps/web/features/settings/components/CustomCommandsSettings.tsx and apps/desktop/src/features/workflows/WorkflowBuilder.tsx have no keybinding field

**Suggested fix**

Add N (5-9) reserved slot definitions whose action target is a user-chosen custom command / workflow / skill, with a picker in the shortcut row, and persist the slot→action mapping alongside customKeybindings.

**Reference screenshot(s)**

- `chatgpt_reference/103-codex-macos-settings-keyboard-shortcuts-panels-environment-actions.png`

### GAP-227 — Terminal, artifact and review panels have no toggle shortcuts

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-interaction
- **Reference:** Codex · macOS desktop · Settings > Keyboard shortcuts — panels

**Gap**

The reference binds Open terminal (^`), Toggle bottom panel (⌘J), Toggle browser panel (⇧⌘B), Toggle Review panel (⌥⌘B) and Toggle sidebar (⌘B). agiworkforce binds only toggle-sidebar; the terminal, artifact panel and browser panel — all of which exist as features — can be reached only by mouse.

**Evidence**

apps/desktop/src/constants/shortcuts.ts window category contains toggle-sidebar, minimize, fullscreen, zoom-in/out/reset only; apps/desktop/src/features/terminal/Terminal.tsx, features/artifacts/ArtifactPanel.tsx and features/browser/ exist with no shortcut definitions

**Suggested fix**

Add toggle-terminal, toggle-artifact-panel and toggle-browser-panel shortcut definitions in the window category wired to the existing panel stores, with defaults that avoid the current conflict set.

**Reference screenshot(s)**

- `chatgpt_reference/103-codex-macos-settings-keyboard-shortcuts-panels-environment-actions.png`

### GAP-228 — No warning that personality/response-style settings are ignored by some models

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-copy
- **Reference:** Codex · macOS desktop · Settings > Personalization — capability warning

**Gap**

The reference leads Personalization with an amber banner: 'Personality settings are not supported by every model. Codex's tone can be customized in Custom instructions.' — telling the user up front when the control will do nothing and where to go instead. agiworkforce's PersonalizationSettings (Response Style, Emoji Usage, About You) is applied via personalizationToPrompt with no capability caveat, so on models that ignore or override system-level tone the control looks broken. The repo's own rules forbid dead or misleading controls.

**Evidence**

apps/desktop/src/features/settings/PersonalizationSettings.tsx (About You / Custom Instructions / Emoji Usage / Response Style, no capability banner); apps/desktop/src/features/chat/personalizationToPrompt.ts; grepped 'not supported by every model' across apps — no match

**Suggested fix**

Derive support from the model catalog's capability metadata and render a banner (or per-control disabled state with tooltip) when the currently selected model does not honour system-level tone, pointing the user to Custom Instructions as the reliable path.

**Reference screenshot(s)**

- `chatgpt_reference/098-codex-macos-settings-personalization-personality-instructions-memory.png`

### GAP-229 — On-disk asset paths are shown as inert text with no Open folder action

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings > Pets — Custom pets folder

**Gap**

The reference pairs the custom-assets path (/Users/…/.codex/pets) with an 'Open folder ↗' link that reveals it in Finder. agiworkforce shows several user-extensible paths as plain <code> spans — CustomAgentsList prints ~/.claude/agents/ and .claude/agents/ and explicitly instructs 'AGI reads these Markdown files with YAML frontmatter and can edit them manually' — but ships no reveal/open action anywhere in the desktop app, so the user must copy the path by hand into Finder or a terminal.

**Evidence**

apps/desktop/src/features/settings/CustomAgentsList.tsx:276-287 (Agent storage paths as <code>, manual-edit instruction); grepped 'Open folder|Reveal|revealItemInDir|shell.open' across apps/desktop/src — only window.open/noopener hits, no filesystem reveal

**Suggested fix**

Add a small PathRow component (mono path + copy button + 'Open folder' using Tauri's opener/revealItemInDir plugin) and use it everywhere a path is displayed — CustomAgentsList, DotfileSettings, InstructionFilesSettings, Privacy data-storage location and the artifacts local publish result.

**Reference screenshot(s)**

- `chatgpt_reference/100-codex-macos-settings-pets-avatar-picker-size-slider.png`

### GAP-230 — No 'Shared chats' / 'Shared artifacts' management rows in Privacy settings

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · macOS desktop · Settings > Privacy — Your data section

**Gap**

Claude's Privacy tab has 'Your data' rows for Export data, Shared chats (Manage), and Shared artifacts (Manage) so users can audit/revoke public share links from one place. agiworkforce's Privacy tab has no equivalent shared-links management entry point (mobile has a separate shared-links.tsx screen, but desktop Privacy doesn't link to any equivalent).

**Evidence**

apps/desktop/src/features/settings/tabs/Privacy/index.tsx — no 'Shared chats'/'Shared artifacts' rows found; apps/mobile/app/(app)/settings/shared-links.tsx exists on mobile only

**Suggested fix**

Add 'Shared chats' and 'Shared artifacts' rows to the desktop Privacy tab linking to a shared-links management view, matching the pattern already built for mobile at settings/shared-links.tsx.

**Reference screenshot(s)**

- `claude_reference/142-claude-desktop-settings-privacy-data-controls-export-sharing.png`

### GAP-231 — Desktop has no Profile page — identity, usage stats and activity heatmap are absent

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-screen
- **Reference:** Codex · macOS desktop · Settings > Profile

**Gap**

The reference Profile page combines identity (avatar, name, @handle, plan badge), a five-metric strip (lifetime tokens, peak tokens, longest chat, current streak, longest streak), a token-activity heatmap with Daily | Weekly | Cumulative granularity, an Activity insights list and a Most-used-plugins leaderboard, plus Share / Private / Edit header actions. agiworkforce desktop settings has an Account tab (plan, credits, local-mode state) and a UsageDashboard (cost, limits, session) but no profile identity page and no streak or heatmap concept anywhere; web's Reflect is the only partial analogue.

**Evidence**

apps/desktop/src/features/settings/tabs/ (Account, Usage, Billing — no Profile); apps/web/features/settings/sections/ReflectSection.tsx:214-243 (conversations, active days, most active day, peak start time, per-day activity strip); grepped 'streak|heatmap|Lifetime tokens|Longest chat' across apps — no product matches

**Suggested fix**

Add a Profile tab to desktop settings reusing the Reflect recap endpoint: identity header (avatar, name, plan badge), stat strip extended with current/longest streak and lifetime tokens from the usage store, and the existing per-day activity strip promoted to a full-year heatmap with a granularity toggle.

**Reference screenshot(s)**

- `chatgpt_reference/093-codex-macos-settings-profile-stats-activity-plugins.png`

### GAP-232 — No user-assignable shortcut slots for custom commands or workflows

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings > Voice — Dictation hotkeys

**Gap**

The reference separates 'Hold-to-dictate hotkey' (hold anywhere on desktop to dictate at the cursor) from 'Toggle dictation hotkey' (press once to start, again to stop), adds a 'Keep dictation bar visible' reminder toggle, and provides a 'Recent dictations' card so transcribed text can be recovered when it lands somewhere unexpected. agiworkforce exposes a single hotkey from a fixed Select whose help text is hold-only, and keeps no dictation history — a long dictation that misroutes is simply lost.

**Evidence**

apps/desktop/src/features/settings/VoiceSettings.tsx:252-267 (single 'Dictation Hotkey' Select, 'Hold this key to record — release to transcribe'); grepped 'recent dictation|recentDictation|transcript history' across apps — no match

**Suggested fix**

Split the setting into holdToDictateHotkey and toggleDictationHotkey (both unassignable), implement toggle mode in the dictation controller, and persist the last N transcripts in a Recent dictations list with copy/re-insert actions.

**Reference screenshot(s)**

- `chatgpt_reference/096-codex-macos-settings-voice-dictation-hotkeys-dictionary.png`

### GAP-233 — Settings search matches section names only, never the setting that matched

- **Status:** Done
- **Owner:** Desktop
- **Surface/type:** desktop · missing-interaction
- **Reference:** Codex · macOS desktop · Settings search

**Gap**

Desktop Settings now searches the mounted controls themselves rather than only section labels. Results are grouped under their owning section with the exact control label and help text; selecting a result opens its authoritative tab, announces the destination, and scrolls, focuses, and temporarily highlights an anchored control when present.

**Evidence**

apps/desktop/src/features/settings/settingsSearchIndex.ts defines the real-control index plus direct and fuzzy matching; SettingsPanel.tsx groups visible results and owns tab navigation, destination status, retry-safe anchor lookup, scroll, focus, and highlight behavior. Connections/index.tsx and ThemeSettings.tsx anchor Remote control and Reduce motion. SettingsPanel.render.test.tsx covers the 'remo' result set and destination focus. Rendered evidence: apps/desktop/docs/qa/screenshots/GAP-233-234-settings-search.png.

**Suggested fix**

Completed for the mounted Desktop settings owner. Keep index entries tied to real settings, add anchors as individual tabs evolve, and never add search-only feature promises.

**Reference screenshot(s)**

- `chatgpt_reference/052-codex-macos-settings-connections-search-remote-control-connected-modal.png`

### GAP-234 — Desktop settings search matches only section names, not individual settings

- **Status:** Done
- **Owner:** Desktop
- **Surface/type:** desktop · missing-interaction
- **Reference:** Codex · macOS desktop · Settings search results

**Gap**

A query now matches individual setting labels, descriptions, and curated keywords, including partial fuzzy label matches such as 'remo' → Remote control and Reduce motion. The sidebar retains section context while exposing the matched destination, and the selected result remains visible while its real settings content opens.

**Evidence**

apps/desktop/src/features/settings/settingsSearchIndex.ts provides normalized direct matching and bounded fuzzy label matching. SettingsPanel.tsx restricts results to currently visible tabs, renders matched rows under each section, and navigates to the selected control. SettingsPanel.render.test.tsx verifies cross-section results and the focused Mobile companion pairing region; apps/desktop/docs/qa/screenshots/GAP-233-234-settings-search.png records the mounted interaction.

**Suggested fix**

Completed. Preserve description and keyword matching for discoverability, keep fuzzy matching label-only and query-bounded, and keep hidden or unsupported tabs out of results.

**Reference screenshot(s)**

- `chatgpt_reference/034-codex-macos-settings-connections-remote-pairing-phone-tab-qr-code.png`

### GAP-235 — Desktop plugin list has no enable/disable toggle, only update and remove

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · VS Code extension · Settings — Plugins, per-plugin enable toggle

**Gap**

Reference gives every plugin a persistent on/off toggle so a user can silence a capability without uninstalling it. agiworkforce's desktop Skills & Plugins view lists installed plugins with update/remove package actions (disabled entirely when the plugin CLI is missing), so the only way to stop a plugin is to delete it.

**Evidence**

apps/desktop/src/features/settings/SkillsPluginsSettings.tsx:241-256 (update/remove buttons), :654 ('Plugin package actions are disabled because the compatible CLI is not installed'), :663-668 (install/remove gating). No Switch/onCheckedChange enable control exists in the file.

**Suggested fix**

Add a per-plugin enabled flag persisted alongside the resolved plugin list, render it as a Switch in each row, and have the runtime skip disabled plugins' commands, skills, hooks and MCP wiring; keep remove for full uninstall.

**Reference screenshot(s)**

- `chatgpt_reference/021-codex-vscode-ext-settings-plugins-documents-pdf-sites-chrome-list.png`

### GAP-236 — No screen-capture settings (hotkey, destination, sound, offscreen-text notice)

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-screen
- **Reference:** Codex · macOS desktop · Settings › Appshots

**Gap**

Reference dedicates a screen to appshots: a double-⌘ capture hotkey, an 'Appshot destination' picker, a 'Play sound effect' toggle and copy stating captures include text scrolled offscreen. agiworkforce can capture windows/regions with OCR from the composer, but nothing is configurable and the offscreen-text/privacy implication is never stated.

**Evidence**

apps/desktop/src/features/screen-capture/ScreenCaptureButton.tsx:199-220 ('Screen capture', 'Capture Window'), apps/desktop/src/features/screen-capture/OCRViewer.tsx; searched 'appshot', 'screenshot hotkey' and 'capture window' in apps/desktop/src/features/settings — no settings surface exists

**Suggested fix**

Add a Capture section (General or its own tab) with a rebindable global capture hotkey, a destination selector (active chat / new chat / clipboard), a sound toggle, and copy explaining that captures include OCR'd offscreen text.

**Reference screenshot(s)**

- `chatgpt_reference/111-codex-macos-settings-appshots-hotkey-destination-preview.png`

### GAP-237 — Desktop can archive projects but not conversations, and has no archived view

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings › Archived chats

**Gap**

Reference treats archiving as a first-class chat action with a dedicated review surface. On desktop agiworkforce, archive/unarchive exists only for projects (with a show-archived filter), while conversations have no archive action and no archived list.

**Evidence**

apps/desktop/src/features/v3/ProjectRow.tsx:323-326 and AgiWorkProjects.tsx:68-78 (project archive + showArchived), apps/desktop/src/features/chat/SearchModal.tsx:161 (conversations are filtered by c.archived but nothing sets it)

**Suggested fix**

Add an Archive action to the conversation row/overflow menu that sets the existing archived flag, and an Archived chats settings section reusing the project show-archived pattern for restore and delete.

**Reference screenshot(s)**

- `chatgpt_reference/121-codex-macos-settings-archived-chats-empty.png`

### GAP-238 — No preference to hide the computer-use activity overlay during a task

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings › Computer use

**Gap**

Reference has a 'Picture in picture' group with 'Always hide picture in picture — prevent showing computer use activity in picture in picture', so a user presenting or recording can suppress the floating activity window. agiworkforce renders a ComputerUseOverlay during runs with no visibility preference.

**Evidence**

apps/desktop/src/features/execution-sidecar/ComputerUseOverlay.tsx and features/overlay/ActionOverlay.tsx exist; searched 'picture in picture', 'pip' and 'hide.\*overlay' across apps/desktop/src — no setting found; ComputerUseSettings.tsx only offers 'Hide Apps During Task' (line 450)

**Suggested fix**

Add an 'Always hide activity overlay' switch to ComputerUseSettings persisted in settingsStore and honoured by ComputerUseOverlay/ActionOverlay mounting.

**Reference screenshot(s)**

- `chatgpt_reference/115-codex-macos-settings-computer-use-control-apps-chrome-excel.png`

### GAP-239 — Per-integration rows (Chrome bridge, Office add-in) missing from Computer use

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-ia
- **Reference:** Codex · macOS desktop · Settings › Computer use

**Gap**

Reference lists each deeper-control integration as its own row inside Computer use — 'Google Chrome · Connected to browser extension for additional control' with Manage, and 'Microsoft Excel · add-in' — each with its own toggle. agiworkforce hides the equivalent Chrome bridge in a separate 'AGI in Chrome' tab and free-text app names in Allowed Apps, so users cannot see which apps have enhanced control or its connection state from the computer-use screen.

**Evidence**

apps/desktop/src/features/settings/tabs/AgiInChrome/index.tsx (BridgeStatusCard only), apps/desktop/src/features/settings/ComputerUseSettings.tsx:297-410 (Allowed/Denied apps are free-text strings)

**Suggested fix**

Render a 'Control' group at the top of ComputerUseSettings with an 'Any app' master row plus known-integration rows (Chrome extension bridge, VS Code bridge) showing live connection status, a Manage button that deep-links to the bridge panel, and per-integration toggles.

**Reference screenshot(s)**

- `chatgpt_reference/115-codex-macos-settings-computer-use-control-apps-chrome-excel.png`

### GAP-240 — No 'keep this computer awake while remote access is enabled' power setting

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings › Connections › Other settings

**Gap**

Reference offers 'Keep this Mac awake — prevent sleep when the computer is plugged in and remote access is enabled', which is what makes phone-driven remote sessions reliable. agiworkforce has no sleep-prevention preference, so a paired phone silently loses the host when the machine sleeps.

**Evidence**

searched 'keep.\*awake', 'prevent sleep' and 'power' across apps/desktop/src — no match; apps/desktop/src/features/settings/GeneralSettings.tsx only covers window preferences and system resources

**Suggested fix**

Add a 'Keep this computer awake' toggle in Connections that holds a Tauri power-save-blocker while a remote session is enabled and the device is on AC, with copy stating the AC condition.

**Reference screenshot(s)**

- `chatgpt_reference/117-codex-macos-settings-connections-control-this-mac-iphone.png`

### GAP-241 — No per-project Environments screen describing how to set a project up

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-screen
- **Reference:** Codex · macOS desktop · Settings › Environments

**Gap**

Reference lists each known project (name + owner) with an add affordance and the explainer 'Local environments tell the assistant how to set up worktrees for a project', so setup commands are declared once per repo. agiworkforce has projects but no environment/setup definition; the closest thing is a flat allowed-directories whitelist.

**Evidence**

apps/desktop/src/features/settings/AllowedDirectoriesSettings.tsx (path whitelist only), apps/desktop/src/features/settings/TeamAccountSettings.tsx:313 (project list is read-only); searched 'environment setup', 'setup script', 'devcontainer' across apps/desktop/src — no match

**Suggested fix**

Add an Environments tab listing projects from the project store with an 'Add project' picker, and per-project setup config (install/build/test commands, env vars, base branch) that agent runs execute before working in that repo.

**Reference screenshot(s)**

- `chatgpt_reference/119-codex-macos-settings-environments-project-list.png`

### GAP-242 — Undo/redo last app action missing from shortcut catalog despite a live undo API

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings › Keyboard shortcuts

**Gap**

Reference exposes 'Undo last action' (⌘Z) and 'Redo last action' (⇧⌘Z) that revert the most recent agent-applied app action. agiworkforce has a complete undo backend (undo_last, undo_change, undo_get_summary) and a per-tool 'Undo' button, but no global undo/redo shortcut or settings row.

**Evidence**

apps/desktop/src/api/undo.ts:93-158 (undo_get_summary/undo_last/undo_can_undo), apps/desktop/src/features/chat/ToolLabel.tsx:185 ('Undo'), apps/desktop/src/constants/shortcuts.ts (no undo/redo definitions)

**Suggested fix**

Add 'app.undoLast' (Cmd+Z) and 'app.redoLast' (Cmd+Shift+Z) shortcuts wired to undo.undoLast()/redo, gated on undo_can_undo, and surface them in the Keyboard Shortcuts list under a new 'Actions' category.

**Reference screenshot(s)**

- `chatgpt_reference/105-codex-macos-settings-keyboard-shortcuts-undo-redo-approve-close-tab.png`

### GAP-243 — No ⌘1–⌘9 'Go to chat N' slot shortcuts for switching conversations

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-interaction
- **Reference:** Codex · macOS desktop · Settings › Keyboard shortcuts (chat slots)

**Gap**

Reference dedicates ⌘1..⌘9 to the nine visible chat slots so users can jump between parallel runs without touching the sidebar. agiworkforce has no numeric slot bindings at all.

**Evidence**

apps/desktop/src/constants/shortcuts.ts (navigation category has no digit bindings) — searched 'go to chat', 'Digit', and "'1'" across apps/desktop/src/hooks, /constants and /features/chat with no match

**Suggested fix**

Add nine 'chat.gotoSlot{N}' shortcuts (Cmd+1..9) that resolve to the Nth visible conversation in the sidebar store, and show the slot number in the sidebar row on Cmd hold.

**Reference screenshot(s)**

- `chatgpt_reference/108-codex-macos-settings-keyboard-shortcuts-chat-slots-file-tree-trace.png`

### GAP-244 — No composer-scoped shortcuts for project picker, send message or start dictation

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings › Keyboard shortcuts (composer)

**Gap**

Reference binds composer actions: Open project picker (⌥⇧⌘O), Start dictation (^⇧D), Toggle voice mode (^⇧V) and Send message. agiworkforce's composer has a project picker and a voice input button but neither is reachable from the shortcut catalog, and there is no rebindable send action.

**Evidence**

apps/desktop/src/features/v3/DesktopShellV3.tsx:232,443 (composerProjectPicker), apps/desktop/src/constants/shortcuts.ts (only 'voice-input' Cmd+Shift+V exists; no project-picker/send/dictation entries)

**Suggested fix**

Add composer category shortcuts 'composer.projectPicker', 'composer.send', 'composer.startDictation' and 'composer.toggleVoiceMode', dispatched through the existing composer store handlers in DesktopShellV3.

**Reference screenshot(s)**

- `chatgpt_reference/106-codex-macos-settings-keyboard-shortcuts-composer-model-picker-copy-actions.png`

### GAP-245 — No copy-deeplink / copy-session-id / copy-chat-as-Markdown actions for a conversation

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings › Keyboard shortcuts (copy actions)

**Gap**

Reference offers five copy actions on the current chat (Markdown, conversation path, deeplink, session id, working directory) so a chat can be referenced from an issue or another tool. agiworkforce parses inbound deep links but never produces one, and offers no session-id or Markdown copy action or shortcut.

**Evidence**

apps/desktop/src/hooks/useDeepLink.ts:81-142 (parseDeepLink/handleDeepLink are inbound-only), searched 'copy as markdown', 'deeplink' and 'session id' across apps/desktop/src — no copy action found

**Suggested fix**

Add a conversation overflow-menu group + shortcut actions that copy (a) the chat rendered as Markdown, (b) an agi:// deeplink built from the same scheme useDeepLink parses, and (c) the session id, each with a toast confirmation.

**Reference screenshot(s)**

- `chatgpt_reference/106-codex-macos-settings-keyboard-shortcuts-composer-model-picker-copy-actions.png`

### GAP-246 — Dictation hotkey is hold-only and picked from a fixed list — no toggle-dictation mode

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings › Keyboard shortcuts (dictation hotkeys)

**Gap**

Reference exposes two separate system-wide hotkeys: 'Hold-to-dictate' and 'Toggle dictation hotkey' (press once to start, again to stop), both freely rebindable from the shortcuts screen. agiworkforce only offers a hold-to-record hotkey chosen from a preset Select, with copy that hard-codes the hold behaviour.

**Evidence**

apps/desktop/src/features/settings/VoiceSettings.tsx:252-267 (HOTKEY_OPTIONS Select + 'Hold this key to record — release to transcribe.'), apps/desktop/src/features/voice/VoiceMode.tsx:312 (spacebar push-to-talk only)

**Suggested fix**

Add a 'Dictation mode' segmented control (Hold / Toggle) plus a second rebindable toggle-dictation combo, register both through shortcutStore so they work desktop-wide, and mirror both rows in the Keyboard Shortcuts list.

**Reference screenshot(s)**

- `chatgpt_reference/107-codex-macos-settings-keyboard-shortcuts-browser-nav-dictation-window.png`

### GAP-247 — Only one key binding per action — reference supports several (⌘K and ⇧⌘P)

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings › Keyboard shortcuts (multiple bindings)

**Gap**

In the reference 'Open command menu' lists two bindings, each independently editable and deletable, so muscle memory from other editors keeps working. agiworkforce stores customKeybindings as Record<shortcutId, string>, structurally allowing exactly one combo per action.

**Evidence**

apps/desktop/src/features/settings/KeybindingsSettings.tsx:34-44,220-242 (single-string resolve and setCustomKeybinding), apps/desktop/src/constants/shortcuts.ts serializeCombo/parseCombo operate on one combo

**Suggested fix**

Change customKeybindings to Record<string, string[]>, render one chip row per binding with its own edit/delete, add an 'Add binding' affordance, and extend conflict detection over the flattened list (migrate existing single-string values on load).

**Reference screenshot(s)**

- `chatgpt_reference/107-codex-macos-settings-keyboard-shortcuts-browser-nav-dictation-window.png`

### GAP-248 — No unified Plugins/Apps/MCPs/Skills tab strip with counts and no plugin search

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-ia
- **Reference:** Codex · macOS desktop · Settings › Plugins

**Gap**

Reference groups all extensibility into one screen with a counted tab strip (Plugins 22 · Apps 7 · MCPs 5 · Skills 45) and a 'Search plugins' field. agiworkforce splits these across separate settings tabs (Plugins, Skills, Connectors/MCP) with collapsible sections and no search, so finding one item among dozens means expanding sections in several tabs.

**Evidence**

apps/desktop/src/features/settings/tabs/Plugins/index.tsx, tabs/Skills/index.tsx, tabs/Connectors/index.tsx (MCPServerSettings + MCPWorkspace), apps/desktop/src/features/settings/SkillsPluginsSettings.tsx:719-808 (SectionHeader counts, no search input)

**Suggested fix**

Give the Plugins tab a counted segmented control over Plugins / Apps / MCP servers / Skills backed by the existing stores, plus a single filter input that searches names and descriptions across all four lists.

**Reference screenshot(s)**

- `chatgpt_reference/112-codex-macos-settings-plugins-plugin-list-toggles-on.png`

### GAP-249 — No cancel-plan section or 'cancels on <date>' state in desktop Billing

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-copy
- **Reference:** Codex · macOS desktop · Settings › Usage & billing (cancel plan)

**Gap**

Reference has a 'Cancel plan' section stating where cancellation happens and linking there. agiworkforce's desktop Billing never mentions cancellation, and although cancel_at_period_end is modelled it is never rendered — a cancelled subscription still shows the ambiguous label 'Renews / ends'.

**Evidence**

apps/desktop/src/features/settings/BillingSettings.tsx:79-88 ('Renews / ends' with no cancellation branch), apps/desktop/src/types/billing.ts:34 and apps/desktop/src/stores/authOrchestrator.ts:347 (cancel_at_period_end is populated), apps/web/features/billing/hooks/use-billing-queries.ts:603 (useCancelSubscription exists on web)

**Suggested fix**

Branch the period label on cancel_at_period_end ('Cancels on <date>' vs 'Renews on <date>') and add a Cancel plan section that explains the subscription is managed in the billing portal and deep-links to it.

**Reference screenshot(s)**

- `chatgpt_reference/110-codex-macos-settings-billing-usage-limits-cancel-plan.png`

### GAP-250 — No worktree management (root, auto-delete, list) despite a declared capability

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-screen
- **Reference:** Codex · macOS desktop · Settings › Worktrees

**Gap**

Reference lets users set the worktree root, auto-delete old worktrees, cap how many are kept (with copy noting snapshots make pruning restorable) and see a live list with a 'No worktrees yet' empty state. agiworkforce has no worktree UI at all, even though the local runtime contract already advertises a worktrees capability, so parallel agent runs have no isolation story or disk-usage control.

**Evidence**

apps/extension-vscode/src/integrations/localRuntimeClient.ts:54 (worktrees: z.boolean() capability flag); searched 'worktree' across apps/desktop/src and apps/web — no UI match

**Suggested fix**

Add a Worktrees settings tab with worktree root input (blank = default), an auto-delete toggle and keep-count field, and a refreshable list of managed worktrees showing branch, path, size and a delete action plus the empty state.

**Reference screenshot(s)**

- `chatgpt_reference/120-codex-macos-settings-worktrees-root-and-autodelete.png`

### GAP-251 — Sidebar lacks Pull requests, Sites and Plugins destinations

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-ia
- **Reference:** Codex · macOS desktop · Sidebar nav

**Gap**

The reference's sidebar nav is New chat, Pull requests, Sites, Scheduled, Plugins. agiworkforce's v3 sidebar offers Library/Tasks/Scheduled/Customize (cloud) or Artifacts/Scheduled/Customize (local); there is no code-review, deployment or plugin destination even though a Plugins settings tab and a skill/plugin marketplace feature exist in the codebase.

**Evidence**

apps/desktop/src/features/v3/Sidebar.tsx:118-129 (nav item lists); apps/desktop/src/features/settings/tabs/Plugins/index.tsx and features/skill-marketplace exist but are not linked from the sidebar

**Suggested fix**

Add sidebar entries for Plugins (routing to the existing marketplace panel) and, once the surfaces exist, Pull requests and Sites; keep them mode-gated the way library/tasks already are.

**Reference screenshot(s)**

- `chatgpt_reference/082-codex-macos-sidebar-nav-toggle-tooltip-projects-chats.png`

### GAP-252 — No ⌘1–⌘9 accelerators to jump to pinned and project chats

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-interaction
- **Reference:** Codex · macOS desktop · Sidebar quick-switch accelerators

**Gap**

The reference assigns ⌘1…⌘6 to the pinned item and the visible project chats and prints the combo on each row, giving keyboard-only conversation switching. agiworkforce has a rich shortcut registry but nothing that jumps to the Nth conversation, and the sidebar rows show no accelerators.

**Evidence**

apps/desktop/src/constants/shortcuts.ts (no conversation-index shortcuts); apps/desktop/src/features/v3/ConversationRow.tsx / Sidebar.tsx render no combo hints

**Suggested fix**

Register jump-to-conversation-1..9 shortcuts that map onto the currently visible pinned + project chat order, render the combo on the right of each row, and reuse the existing conflict detection in shortcutStore.

**Reference screenshot(s)**

- `chatgpt_reference/083-codex-macos-sidebar-nav-projects-recent-chats.png`

### GAP-253 — No Sites surface — artifacts cannot be published as live, shareable websites

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-screen
- **Reference:** Codex · macOS desktop · Sites — empty state

**Gap**

The reference has a first-class Sites destination ('Turn your ideas into live websites') with search, a header Create button, and an empty state offering 'Create new site'. agiworkforce's artifact publish path writes to a local file:// URL only, and the adapter's own docstring records that cloud publish is deliberately gated. There is nothing that turns a generated HTML/React artifact into a hosted URL a user can send to someone.

**Evidence**

apps/desktop/src/features/artifacts/publishAdapter.ts:14-17 ('This adapter only handles the local path. Cloud publish is gated until the managed artifact publishing path is proven.'); grepped 'Sites|No sites yet|Create new site|live website' across apps — only unrelated 'call sites' comments and the extension's allowlist strings; Sidebar.navItemsForMode has no sites entry

**Suggested fix**

Once managed publishing is proven, add a Sites destination listing published artifacts with status, URL, last-deploy time and a Create flow; until then, keep it out of nav rather than shipping a stub. Track it as an explicit gap in docs/agent-context/known-flaws.md rather than an implied capability.

**Reference screenshot(s)**

- `chatgpt_reference/085-codex-macos-sites-empty-state-create-new-site.png`

### GAP-254 — Recorder preflight never checks macOS Screen Recording permission (the black-frame cause)

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-state
- **Reference:** Claude · macOS desktop · Unusable-capture failure response

**Gap**

Black frames like the reference's are the classic symptom of a missing Screen Recording grant. agiworkforce's recorder preflight checks only accessibility and inputMonitoring and starts capture regardless of screen-recording status; the app already knows about the permission and explains it elsewhere, but the recorder never surfaces it, so once screenshot capture is added the failure would be silent.

**Evidence**

apps/desktop/src/features/automation/ActionRecorder.tsx:105-111 and :152-154 (missingPermissions covers accessibility + input_monitoring only); the permission exists at apps/desktop/src/features/settings/AutomationPermissionsSettings.tsx:157-158 ('Screen Recording … Enable in System Settings → Privacy & Security → Screen Recording.')

**Suggested fix**

Add screen_recording to the AutomationPermissions preflight, block Start recording until it is granted (with an 'Allow Screen Recording' deep-link button matching the existing Accessibility/Input Monitoring buttons), and add a runtime guard that aborts with the specific 'screen recording is blocked' message if the first captured frame is uniformly blank.

**Reference screenshot(s)**

- `references-2/claude-desktop-cowork-record-skill-09-black-capture-failure-response.png`

### GAP-255 — Desktop empty chat exposes capability-shaped starter actions

- **Status:** Done
- **Owner:** Desktop
- **Surface/type:** desktop · missing-copy
- **Reference:** ChatGPT · macOS desktop · Work mode empty state — quick actions

**Gap**

The blank canvas now presents three concise paths: create a file or site, research and plan, or automate recurring work. The first two prefill the conversation-scoped composer for review; the automation action opens the real Local or Managed Cloud schedule owner through the shell's mode-aware navigation seam.

**Evidence**

EmptyChat writes starter prompts through unified-chat's setDraftContent and receives onOpenScheduled from DesktopShellV3, which routes work-scheduled to AgiWorkScheduled or DesktopCloudSchedules according to the current privacy mode. GAP-195-205-255-empty-chat.test.tsx covers both prompt paths and the schedule handoff. Rendered Browser QA is retained at apps/desktop/docs/qa/screenshots/GAP-195-205-255-empty-chat.png.

**Suggested fix**

Completed. Keep starters attached to executable Desktop owners, preserve the user's opportunity to edit prompt starters, and route non-chat actions instead of pretending a prompt changed product mode.

**Reference screenshot(s)**

- `chatgpt_reference/088-chatgpt-macos-work-mode-empty-state-quick-actions.png`

### GAP-256 — Payment methods and plan cancellation are Stripe-portal redirects, not inline controls

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-control
- **Reference:** ChatGPT · web · Billing — Payment methods + Cancel plan

**Gap**

Reference shows an inline payment-methods list (card brand icon, last4, Default badge, per-card overflow menu, Add new) and an inline 'Cancel plan' row with reassurance copy ('you'll keep full access until the end of your billing period') and a Cancel button. agiworkforce's BillingSection shows only a single default-card summary and routes every payment/cancel action through an external 'Manage billing' Stripe portal link.

**Evidence**

apps/web/features/settings/sections/BillingSection.tsx (Payment section renders one card + 'Manage billing'/'Update' button only; no Cancel plan section, no multi-card list)

**Suggested fix**

Either build inline payment-method list + cancel-plan UI using Stripe's Payment Methods API and Subscription cancel API, or — if staying with portal redirects — add a local 'Cancel plan' row with the same reassurance copy that deep-links into the portal's cancel flow, so cancellation isn't buried.

**Reference screenshot(s)**

- `chatgpt_reference/133-chatgpt-web-settings-billing-payment-methods-cancel-plan.png`

### GAP-257 — Connector catalog has no New/Community/Trending badges, popularity ranking, or verified indicator

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-copy
- **Reference:** Claude · web · Connector directory (New/Community/Trending badges, #N popular ranking, verified checkmark)

**Gap**

Reference connector cards show status badges (New, Community, Trending), a popularity rank ('#2 popular'), and a verified checkmark next to official connectors. agiworkforce's static connector catalog (connectors.ts) has no such fields.

**Evidence**

grep -i 'badge|New|Community|Trending|popular|verified' apps/web/features/connectors/data/connectors.ts — only one unrelated string match ('community' inside Discord description)

**Suggested fix**

Add badge/rank/verified fields to the Connector type and data, and render them on connector cards in both the settings list and any future directory view.

**Reference screenshot(s)**

- `claude_reference/163-claude-web-connector-directory-browse-popular-and-community-cards.png`

### GAP-258 — Sidebar nav items cannot be shown/hidden by the user

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-control
- **Reference:** Claude · web · Customize sidebar modal (toggle which nav items show)

**Gap**

Claude lets users open a 'Customize sidebar' modal from the 'More' menu with checkboxes to show/hide Artifacts, Routines, Dispatch, and Customize in the left rail. agiworkforce's WebSidebar.tsx has a fixed, non-configurable item list ('customize' nav item instead routes to a persona/instructions page, not a visibility-toggle modal).

**Evidence**

grep for 'Customize sidebar', 'Choose which items appear' in apps/web/features/chat/v3/WebSidebar.tsx — no match; the 'customize' id maps to route '/chat/customize' per WebShellV3.tsx line 34 area, which is a settings/instructions page, not a nav-visibility modal.

**Suggested fix**

Add a 'Customize sidebar' modal (checkbox list of optional nav items: Artifacts, Schedules, Dispatch, Customize) reachable from a sidebar overflow menu, persisting the user's choice to their profile preferences.

**Reference screenshot(s)**

- `claude_reference/176-claude-web-sidebar-customize-modal-artifacts-routines-dispatch.png`

### GAP-259 — 'Improve the model for everyone' and 'Location' toggles intentionally removed as dead controls

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-control
- **Reference:** ChatGPT · web · Data controls — Improve the model / Location

**Gap**

Reference has toggles for opting into model-training data sharing and for location-aware responses. agiworkforce's PrivacySection.tsx has an explicit code comment explaining both were removed because they persisted but had zero consumers (no training pipeline to gate, no location collection to gate) — a switch that saves but changes nothing was judged worse than no switch.

**Evidence**

apps/web/features/settings/sections/PrivacySection.tsx lines 16-24 ('locationMetadata' and 'improveModelTraining' are intentionally absent from TOGGLES... a switch that saves but changes nothing is a dead control')

**Suggested fix**

Build the underlying location-context and training-opt-in pipelines, then re-add the toggles per the existing code comment's guidance — do not re-add the UI before the backend exists.

**Reference screenshot(s)**

- `chatgpt_reference/135-chatgpt-web-settings-data-controls-location-work-network-reset.png`

### GAP-260 — New accounts get no pre-seeded 'How to use AGI' example project in Projects

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-copy
- **Reference:** Claude · web · Home > Projects (pre-seeded 'How to use Claude' example project)

**Gap**

Reference seeds every account's Projects list with an 'Example project' card ('How to use Claude') that doubles as an interactive onboarding guide the user can chat with. agiworkforce's Projects page has no onboarding/example project seeding logic — new accounts start with an empty Projects list.

**Evidence**

grep -i 'onboarding.*project|seed.*project|default project|starter project|example project' across apps/web — no seeding logic found (only an unrelated URL-based project-id seed in WebChatPage.tsx)

**Suggested fix**

On first account creation, seed a 'How to use AGI' example project (with a project-scoped system prompt/knowledge file) so new users have an interactive onboarding artifact in their Projects list.

**Reference screenshot(s)**

- `claude_reference/166-claude-web-home-projects-how-to-use-claude-example.png`

### GAP-261 — Web Personalization lacks style/tone + characteristics controls that mobile already has

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-control
- **Reference:** ChatGPT · web · Personalization — Base style/tone + Characteristics

**Gap**

Reference shows a 'Base style and tone' dropdown plus four 'Characteristics' dropdowns (Warm, Enthusiastic, Headers & Lists, Emoji). agiworkforce's mobile app already implements this (StylePresetSelector + 4 response-style sliders), but apps/web/features/settings/sections/GeneralSection.tsx only exposes a single free-text 'Instructions for AGI' box — the structured style controls were never ported to web.

**Evidence**

apps/mobile/src/features/settings/personalization/index.tsx (StylePresetSelector, PERSONALIZATION_SLIDERS with warmth/enthusiasm/headersLists/emoji) vs apps/web/features/settings/sections/GeneralSection.tsx (no style/tone or characteristics controls, only instructions textarea)

**Suggested fix**

Port the mobile StylePresetSelector and the four characteristic sliders (or equivalent dropdowns) into apps/web GeneralSection so web reaches parity with mobile.

**Reference screenshot(s)**

- `chatgpt_reference/125-chatgpt-web-settings-personalization-style-tone-characteristics.png`

### GAP-262 — No 'Fast answers' or 'Suggested prompts' toggles on any surface

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-control
- **Reference:** ChatGPT · web · Personalization — Fast answers / Suggested prompts

**Gap**

Reference has two behavior toggles below Characteristics: 'Fast answers' (allow general-knowledge fast responses that skip memory/personalization) and 'Suggested prompts' (generate suggestions based on searching connected plugins). Neither concept exists anywhere in agiworkforce.

**Evidence**

searched 'fastAnswers'/'Fast answers' and 'suggestedPrompts'/'Suggested prompts' across apps/web, apps/desktop, apps/mobile — zero matches

**Suggested fix**

Add two toggles to Personalization settings: one to allow low-latency non-personalized answers, one to enable connector-aware suggested-prompt generation, each with explanatory copy matching the reference.

**Reference screenshot(s)**

- `chatgpt_reference/125-chatgpt-web-settings-personalization-style-tone-characteristics.png`

### GAP-263 — No 'Record mode' / recording-transcript memory reference feature

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-feature
- **Reference:** ChatGPT · web · Personalization — Record mode

**Gap**

Reference has a 'Record mode' section with a 'Reference record history' toggle letting the assistant reference all previous recording transcripts and notes when responding — implying a meeting/voice-recording feature with persistent transcript memory. No equivalent recording-to-memory feature exists in agiworkforce.

**Evidence**

searched 'record mode', 'recording transcript', 'meeting record' across apps/web, apps/desktop, apps/mobile — zero matches

**Suggested fix**

If/when a recording feature ships, add a 'Record mode' subsection under Memory with a toggle to let the assistant reference historical recording transcripts/notes as memory context.

**Reference screenshot(s)**

- `chatgpt_reference/127-chatgpt-web-settings-personalization-memory-record-mode.png`

### GAP-264 — Scheduled tasks empty state has no suggested-template gallery to drive adoption

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-copy
- **Reference:** Claude · web · Scheduled tasks empty state with suggested templates

**Gap**

Claude's empty Scheduled Tasks page shows six ready-to-use template cards (Weekly review, Meeting prep, Inbox triage, Content ideas, Daily briefing, Monitor a topic) each with a description and default cadence, letting first-time users create a schedule in one click. agiworkforce's SchedulesPage.tsx shows only a generic dashed-border empty state with an icon, 'No schedules yet' heading, one sentence of copy, and a single 'Create Your First Schedule' button — no templates.

**Evidence**

apps/web/features/schedules/components/SchedulesPage.tsx lines ~430-440 (empty state block) contains no template list; grep for 'Weekly review', 'Meeting prep', 'Inbox triage', 'Monitor a topic', 'template' in that file returns nothing.

**Suggested fix**

Add a 2-column grid of 4-6 suggested schedule templates (with icon, title, one-line description, and default cadence) to the empty state, each opening the create-schedule form pre-filled.

**Reference screenshot(s)**

- `claude_reference/168-claude-web-home-scheduled-tasks-empty-state-suggested-templates.png`

### GAP-265 — No Advanced account security enrollment, Lockdown mode, or Developer mode toggles on web

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-control
- **Reference:** ChatGPT · web · Security and login — Advanced security / Lockdown mode / Developer mode

**Gap**

Reference has three distinct high-security controls: 'Advanced account security' enrollment (stricter sign-in requirements), a 'Lockdown mode' toggle to limit web/external-service-connecting features against prompt-injection, and a 'Developer mode' toggle (with an ELEVATED RISK badge) to allow unverified connectors, plus an 'Enforce CSP in developer mode' sub-toggle. None exist on agiworkforce web; prompt-injection detection exists only as backend tool-loop logic, not a user-facing control.

**Evidence**

searched 'lockdown mode', 'advanced account security', 'developer mode', 'elevated risk' across apps/web — zero UI matches (prompt-injection matches were backend-only, e.g. apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts)

**Suggested fix**

Add an Advanced Security subsection to Settings > Security with: an enrollment flow for stricter sign-in, a user-facing Lockdown Mode toggle that restricts connector/web-fetch tool availability, and a Developer Mode toggle gating unverified/custom MCP connector installation with a visible risk warning.

**Reference screenshot(s)**

- `chatgpt_reference/141-chatgpt-web-settings-security-login-advanced-security-lockdown-developer-mode.png`

### GAP-266 — No public @username/handle field anywhere in account settings

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-control
- **Reference:** ChatGPT · web · Settings > Account

**Gap**

ChatGPT's Account panel has an editable 'Username' row (@agiautomationllc) alongside Name and Email, used to identify the user publicly (e.g. on shared GPTs). AGIW's AccountSection.tsx exposes Name/Email editing via GeneralSection/Profile but has no username/handle concept at all in the data model or UI.

**Evidence**

apps/web/features/settings/sections/AccountSection.tsx (no username field); grep for 'username'/'Username' across apps/web matched only unrelated files (egress-policy.ts, object-storage.ts, etc.), none settings-related.

**Suggested fix**

Add a Username field to AccountSection (or GeneralSection/Profile) with availability-check validation, persisted alongside Name/Email, and surfaced wherever content is shared publicly (e.g. shared skill/agent authorship).

**Reference screenshot(s)**

- `chatgpt_reference/145-chatgpt-web-settings-account-name-username-email-delete.png`

### GAP-267 — No public creator/builder profile screen for shared Skills/Plugins

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-screen
- **Reference:** ChatGPT · web · Settings > Account > GPT builder profile

**Gap**

ChatGPT lets a user configure a public 'GPT builder profile' shown to users of their published GPTs: a name-visibility toggle, Links section (website domain, LinkedIn, GitHub each with Add), and a feedback-email opt-in. AGIW has a Skills/Plugins marketplace (features/skills, features/plugins, /settings/skills) but no equivalent author-facing public profile screen.

**Evidence**

grep for 'builder profile', 'GPT builder', 'publicProfile', 'public profile' across apps — no matches. features/settings/sections list (general/account/team/security/privacy/billing/usage/capabilities/memory/notifications/reflect/time-focus/connectors/skills/plugins) has no 'creator profile' entry.

**Suggested fix**

Add a 'Creator profile' section under Settings > Skills (or a new top-level section) with a public-name toggle, external links (website/LinkedIn/GitHub), and a feedback-contact opt-in, surfaced on published skill/plugin listing pages.

**Reference screenshot(s)**

- `chatgpt_reference/146-chatgpt-web-settings-gpt-builder-profile-links.png`

### GAP-268 — No web Settings page to manage the Chrome extension's enable state and site permissions

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-screen
- **Reference:** Claude · web · Settings > Claude in Chrome: enable + site permissions

**Gap**

Claude surfaces a 'Claude in Chrome' settings page inside the main web Settings modal with a master enable toggle and a 'Site permissions' section (default policy for all sites, applying to both the extension and desktop in-app browser). agiworkforce has a separate Chrome extension app (apps/extension) but no corresponding page inside apps/web Settings to centrally manage its enablement or default site-access policy.

**Evidence**

Searched apps/web for 'Enable Claude in Chrome', 'site permission', 'default policy' style copy — no matches; settings nav list has no 'Chrome'/extension entry (see apps/web/app/settings/\* directory listing).

**Suggested fix**

Add a Settings > Browser Extension page in apps/web that surfaces an enable/disable toggle and a default site-permission policy selector, synced with the extension's own local permission store.

**Reference screenshot(s)**

- `claude_reference/179-claude-web-settings-panel-claude-in-chrome-permissions.png`

### GAP-269 — Connectors settings lacks a 'Popular' quick-connect row and a Type (Desktop/Web) column

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · visual-polish
- **Reference:** Claude · web · Settings > Connectors (Popular cards + Type/Status table)

**Gap**

Reference tops the Connectors list with three large 'Popular' quick-connect cards (Gmail, Google Drive, Slack) above a table that includes a Type column (Desktop vs Web) alongside Status (checkmark / dash / Connect button). agiworkforce's ConnectorsPage.tsx uses a master-detail list with status filters (All/Connected/Ready/Coming soon) but no Popular hero row and no Type column.

**Evidence**

apps/web/features/connectors/pages/ConnectorsPage.tsx — grep for 'Popular' and 'Type' column rendering returns no matches

**Suggested fix**

Add a Popular quick-connect card row above the connector list and a Type column (Desktop/Web) to the connector table/list rows.

**Reference screenshot(s)**

- `claude_reference/160-claude-web-settings-connectors-desktop-connectors-status-list.png`

### GAP-270 — Web settings has no view of extensions installed on the paired desktop app

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-ia
- **Reference:** Claude · web · Settings > Extensions (installed-on-desktop list mirrored into web settings)

**Gap**

The reference screenshot is captured on claude.ai (web) yet shows the exact list of extensions installed on the user's desktop app, letting a web user check/manage desktop extension state without opening the desktop app. agiworkforce's web settings has no equivalent cross-surface extensions view.

**Evidence**

grep -i 'installed on your computer|desktop.\*extension' under apps/web — no relevant settings-page match (only marketing copy pages)

**Suggested fix**

Sync installed-extension state from desktop to the account backend and render a read-only 'Installed on your computer' list in the web Extensions settings section.

**Reference screenshot(s)**

- `claude_reference/157-claude-web-settings-extensions-desktop-installed-list.png`

### GAP-271 — Keyboard shortcuts are read-only — no per-shortcut toggle, remap, or Restore defaults

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-control
- **Reference:** ChatGPT · web · Settings > Keyboard

**Gap**

ChatGPT has a full 'Keyboard' item in the Settings nav where every shortcut can be individually enabled/disabled via a toggle switch, remapped by clicking the key combo and typing new keys, and reset via a 'Restore defaults' button. AGIW's KeyboardShortcutsDialog.tsx is a static, non-interactive reference list opened via Cmd+/, not reachable from the Settings modal nav (WebSettingsModal.tsx section list has no 'keyboard' entry).

**Evidence**

apps/web/features/chat/components/dialogs/KeyboardShortcutsDialog.tsx (renders Badge components for keys, no onClick/edit handlers); apps/web/features/settings/components/WebSettingsModal.tsx SECTION_TO_SEGMENT map has no 'keyboard' key.

**Suggested fix**

Add a Keyboard section to the settings modal nav that reuses the shortcut registry, rendering each shortcut with an enable/disable Switch and a 'click to remap' key-combo control, plus a Restore defaults button that resets to the registry's defaults.

**Reference screenshot(s)**

- `chatgpt_reference/147-chatgpt-web-settings-keyboard-shortcuts-composer.png`

### GAP-272 — Skills settings data model lacks 'last updated' and 'author' metadata, and no Browse/Add actions

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-control
- **Reference:** Claude · web · Settings > Skills (table: Skill / Last updated / Author)

**Gap**

Reference's Skills settings list shows a table with Skill name, Last updated date, and Author (e.g., Anthropic) columns, plus a top-right Browse button and an Add dropdown for creating/installing new skills. agiworkforce's /api/skills-backed state in WebSettingsModal.tsx maps each skill to only {id, name, description, source, tab} — no lastUpdated or author field — and wires no Browse or Add handler for the skills section.

**Evidence**

apps/web/features/settings/components/WebSettingsModal.tsx lines ~420-433 (skill mapping omits lastUpdated/author); grep for 'Browse' / 'Add Skill' near the skills wiring — no handler found

**Suggested fix**

Extend the /api/skills response and the SettingsSkill mapping to include lastUpdated and author, and wire Browse (opens skill directory) and Add (create/import skill) actions into the Skills settings toolbar.

**Reference screenshot(s)**

- `claude_reference/159-claude-web-settings-skills-morning-skill-creator-installed.png`

### GAP-273 — Web settings nav is missing Storage, Safety and Parental controls that mobile ships

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-ia
- **Reference:** ChatGPT · web · Settings modal navigation

**Gap**

Reference nav runs General, Notifications, Personalization, Plugins, Voice, Billing, Usage, Data controls, Cloud browser, Storage, Safety, Security and login, Parental controls, Trusted contact, Account. agiworkforce web has no storage, safety or parental-controls destination even though the mobile app implements all three, so the same account exposes different safety controls per surface.

**Evidence**

apps/web/app/settings/ contains account, billing, byok, capabilities, connections, general, memory, notifications, privacy, profile, reflect, security, skills, sync, team, time-focus, usage, voice; apps/mobile/app/(app)/settings/{storage,safety-security,parental-controls,data-controls}.tsx exist

**Suggested fix**

Add web settings sections for Storage (per-type usage + clear), Safety and Parental controls that read/write the same preference namespaces the mobile screens use, and add them to SETTINGS_NAV_GROUPS_WEB.

**Reference screenshot(s)**

- `chatgpt_reference/122-chatgpt-web-settings-general-appearance-intelligence-dictation.png`

### GAP-274 — Plugin catalogue is a 4-entry preview that installs nothing

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-screen
- **Reference:** Codex · VS Code extension · Settings — Plugins list, framework/template entries

**Gap**

Reference's list runs to 22 installable plugins spanning capabilities (Documents, PDF, Sites), connectors (GitHub, Google Drive, Vercel) and framework/template packs (Build iOS/macOS/MCP/Web Apps, Expo, Default templates, Codex Browser Recorder), each enabled in place. agiworkforce's marketplace is honest about its state but is four demo entries on a page that says installation is not open and 'Nothing here installs yet', so there is no path from browsing to using a plugin on any surface.

**Evidence**

apps/web/features/plugins/data/plugins.ts:1-8 ('Demo-ready plugin catalogue', 4 entries) and apps/web/app/plugins/page.tsx:34 / :64-65 ('This is a preview of the catalogue shape — hosted marketplace installation is not open', 'Nothing here installs yet').

**Suggested fix**

Prioritise an installable first-party set (documents/PDF/spreadsheets/presentations-class capabilities plus the connectors already implemented in apps/web/features/connectors) with real install and per-plugin enable, and keep the waitlist copy only for third-party submissions; expose the installed set to desktop and the VS Code extension through the same resolver.

**Reference screenshot(s)**

- `chatgpt_reference/023-codex-vscode-ext-settings-plugins-expo-default-templates-scrolled.png`

### GAP-275 — Web General lacks contrast and accent-color controls that mobile already ships

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-control
- **Reference:** ChatGPT · web · Settings › General

**Gap**

Reference General offers Appearance, Contrast and Accent color alongside Language. agiworkforce web offers only a theme switch and display language; a high-contrast component exists in the codebase but is mounted nowhere, and accent colour is mobile-only — so accessibility and personalisation regress when a user moves from phone to web.

**Evidence**

apps/web/features/settings/sections/GeneralSection.tsx:410-437 (Appearance + Display Language only), apps/web/shared/components/accessibility/AccessibilitySettings.tsx:63-67 (High contrast mode — grep shows no importer), apps/mobile/app/(app)/settings/accent-color.tsx

**Suggested fix**

Add Contrast (System / More contrast) and Accent color rows to GeneralSection, wiring contrast to the existing AccessibilitySettings state and accent to the same token the mobile accent-color screen writes.

**Reference screenshot(s)**

- `chatgpt_reference/122-chatgpt-web-settings-general-appearance-intelligence-dictation.png`

### GAP-276 — No account-level intelligence/effort defaults with usage-cost warning copy

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-control
- **Reference:** ChatGPT · web · Settings › General

**Gap**

Reference exposes 'Higher intelligence' (auto-escalate on complex questions) and 'Enable Ultra effort' with the warning that it runs multiple agents in parallel and consumes usage limits faster, plus 'Enable Dictation'. agiworkforce only lets a user pick reasoning effort per message in the composer flyout; there is no persisted default and no cost warning.

**Evidence**

apps/web/features/chat/components/Composer/**tests**/ComposerFooter.reasoning-flyout.test.tsx (per-message effort only), apps/web/features/settings/sections/GeneralSection.tsx (no effort/intelligence rows); searched 'higher intelligence', 'auto model', 'smart routing' in apps/web/features/settings — no match

**Suggested fix**

Add General rows for default reasoning effort / auto-escalation and an optional parallel-agent mode, each with a one-line explainer stating the usage-limit impact, persisted through the existing preferences namespace and read as the composer default.

**Reference screenshot(s)**

- `chatgpt_reference/122-chatgpt-web-settings-general-appearance-intelligence-dictation.png`

### GAP-277 — Notification preferences are grouped by channel instead of by event with a channel picker

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-ia
- **Reference:** ChatGPT · web · Settings › Notifications

**Gap**

Reference uses one row per event with a right-aligned channel dropdown, which scales as channels are added. agiworkforce groups by channel first ('Browser notifications' heading) with boolean switches, so the same event would need duplicate switches once email and push land.

**Evidence**

apps/web/features/settings/sections/NotificationsSection.tsx:41-62 (ChannelGroup heading/subheading with per-channel boolean items)

**Suggested fix**

Restructure the section as event-first rows with a multi-select channel control (None / Push / Email / Push+Email), storing Record<eventKey, channel[]> so adding a channel does not multiply rows.

**Reference screenshot(s)**

- `chatgpt_reference/123-chatgpt-web-settings-notifications-codex-groupchats-marketing-top.png`

### GAP-278 — No usage-limit-reset notification category and no inline 'Manage tasks' deep link

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-control
- **Reference:** ChatGPT · web · Settings › Notifications (bottom)

**Gap**

Reference ends with a Tasks row carrying an inline 'Manage tasks' link into the tasks surface, and a Usage row promising notification when limits reset. agiworkforce has tasks, schedules and usage limits but no notification category for either and no cross-link from settings into the managing surface.

**Evidence**

apps/web/features/settings/sections/NotificationsSection.tsx (single browserReplyReady item, no links), apps/web/app/tasks/page.tsx and apps/web/app/chat/schedules/page.tsx exist, apps/web/features/settings/sections/UsageSection.tsx exists

**Suggested fix**

Add 'Tasks & schedules' and 'Usage limits' notification rows, each with an inline link ('Manage tasks' → /tasks, 'View usage' → /settings/usage), and emit the usage notification from the same code path that computes limit resets.

**Reference screenshot(s)**

- `chatgpt_reference/124-chatgpt-web-settings-notifications-tasks-usage-bottom.png`

### GAP-279 — No account-level cloud storage quota screen (Files/Images breakdown)

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-screen
- **Reference:** ChatGPT · web · Storage — account quota by Files/Images

**Gap**

Reference shows total storage used vs. a plan quota (e.g. '161 MB of 100 GB used') with drill-in rows for Files (size + count) and Images (size + count) to help users free up space. agiworkforce has a mobile Storage Manager, but it manages on-device downloaded model weights and app cache — a different scope — with no equivalent for cloud-account file/image storage on web or desktop.

**Evidence**

apps/mobile/app/(app)/settings/storage.tsx (models + cache only); searched 'storage used', 'of 100 GB', 'quota' in apps/web/features/settings, apps/desktop/src/features/settings — zero matches

**Suggested fix**

Add a Settings > Storage page (web) showing total uploaded-attachment storage vs. plan quota, broken into Files and Images rows with counts/sizes and drill-in management.

**Reference screenshot(s)**

- `chatgpt_reference/138-chatgpt-web-settings-storage-files-images-storage-used.png`

### GAP-280 — No self-serve credit purchase / automatic recharge flow

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-control
- **Reference:** ChatGPT · web · Usage — Credits + Automatic recharge

**Gap**

Reference shows a Credits balance with a 'Buy credits' button and an 'Automatic recharge' toggle to top up usage beyond the plan allowance. agiworkforce's CreditAlertModal explicitly documents a 'locked product rule: no credit top-ups, ever' and only nudges users to upgrade tier, even though Stripe top-up webhook handling exists server-side (handleCreditTopUp).

**Evidence**

apps/web/shared/components/modals/CreditAlertModal.tsx line ~41 ('No top-up purchases (locked product rule: no credit top-ups)'); apps/web/app/api/stripe-webhook/lib/db.ts (handleCreditTopUp exists but has no reachable UI entry point)

**Suggested fix**

If the product decision changes, add a 'Buy credits' button + amount picker and an 'Automatic recharge' toggle to UsageSection.tsx, wired to the existing credit-topup Stripe webhook path. If the no-top-ups rule stands, this is working as intended — no action needed beyond documenting the decision.

**Reference screenshot(s)**

- `chatgpt_reference/134-chatgpt-web-settings-usage-usage-limits-credits-recharge.png`

### GAP-281 — No reasoning-effort/speed slider exposed in the extension composer

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** extension · missing-control
- **Reference:** ChatGPT · Chrome extension · Composer Advanced effort flyout

**Gap**

ChatGPT's composer has an 'Advanced' flyout (lightning-bolt icon) that reveals a 5-step effort slider, letting the user trade off speed vs. depth per message without leaving the panel. AGIW's extension composer has no equivalent control.

**Evidence**

grep for 'effort', 'reasoning', 'Advanced' in apps/extension/src/side_panel.ts — only unrelated code comments matched ('reasoning' in a translation-layer comment); no UI slider or flyout exists.

**Suggested fix**

Add an 'Advanced' popover to the composer bar (next to the autonomy chip) with a discrete effort/speed slider that maps to the underlying model's reasoning-effort or thinking-budget parameter.

**Reference screenshot(s)**

- `chatgpt_reference/153-chatgpt-web-extension-advanced-settings-effort-slider.png`

### GAP-282 — Full DevTools-Protocol browser control has no elevated-risk gate or disclosure

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** extension · missing-copy
- **Reference:** Codex · macOS desktop · Settings › Browser (developer mode / CDP)

**Gap**

Reference isolates full CDP access behind a 'Developer mode' section marked 'Elevated risk', default off, with copy explaining CDP lets the model inspect and control sensitive browser internals. agiworkforce's extension attaches the debugger and drives pages over CDP with no user-facing switch and no risk disclosure anywhere in its options page.

**Evidence**

apps/extension/src/features/computer-use/cdpDriver.ts and agentLoop.ts:17-23,49 (all actions go through CDP attach/detach); apps/extension/src/options.ts section titles are Permissions, Account, Autofill Profile, Computer Use — Cloud Auth, Keyboard Shortcuts — no CDP/developer-mode toggle

**Suggested fix**

Add a default-off 'Developer mode: full CDP access' toggle in the extension options (and mirror it in desktop Browser settings) with an elevated-risk badge and one-sentence explanation; keep the agent on the restricted action set until it is enabled.

**Reference screenshot(s)**

- `chatgpt_reference/114-codex-macos-settings-browser-permissions-developer-mode-cdp.png`

### GAP-283 — Conversation history is two clicks deep with no search, vs. one-click searchable dropdown

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** extension · missing-ia
- **Reference:** ChatGPT · Chrome extension · Side panel recent tasks dropdown

**Gap**

ChatGPT's side panel puts recent tasks directly under a 'New task' dropdown with an inline 'Search recent tasks' box, visible in one click. AGIW's equivalent (drawerHistoryList) is nested inside the overflow drawer: the user must open the drawer, then click a separate 'History' row to expand the list, and there is no search/filter input for the history entries.

**Evidence**

apps/extension/src/side_panel.ts lines ~4990-5075 (drawerHistoryBtn toggles drawerHistoryList inside the drawer; no search input element for history).

**Suggested fix**

Promote conversation history to a single-click dropdown anchored to the panel's task-title area (like the 'New task ⌄' pattern), and add a lightweight text filter input above the list for searching by title.

**Reference screenshot(s)**

- `chatgpt_reference/150-chatgpt-web-extension-task-history-recent-tasks.png`

### GAP-284 — 'Rewind' action exists but is permanently disabled/stubbed

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** extension-vscode · missing-state
- **Reference:** Claude · VS Code extension · Actions/command menu

**Gap**

Claude's command menu offers a working 'Rewind' action to roll back the conversation. agiworkforce's ChatStateManager has a rewindLast() method, but it unconditionally reports 'Rewind is unavailable until the local runtime exposes turn rollback' and the action itself isn't even listed in the actions QuickPick shown to users.

**Evidence**

apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:719-722 (rewindLast() always returns the 'unavailable' message); apps/extension-vscode/src/core/commandSetup.ts action sheet (lines 862-901) has no 'Rewind' entry

**Suggested fix**

Either wire rewindLast() to actual turn-rollback support in the local runtime, or remove/hide the dead code path and instead surface 'Clear conversation' as the closest working equivalent until rewind ships.

**Reference screenshot(s)**

- `claude_reference/133-claude-code-vscode-ext-extension-command-menu-context-model-effort-thinking.png`

### GAP-285 — 'Thinking' and 'Switch models when a message is flagged' not exposed in the actions menu

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** extension-vscode · missing-control
- **Reference:** Claude · VS Code extension · Actions/command menu — Thinking / flagged-switch toggles

**Gap**

Claude's command menu surfaces a 'Thinking' toggle and a 'Switch models when a message is flagged' toggle alongside model/effort. agiworkforce has an agentThinking config flag in config.ts but it is not exposed in the QuickPick actions menu, and there is no flagged-message model-switch setting anywhere in the extension.

**Evidence**

apps/extension-vscode/src/platform/config.ts:28,78-79 (agentThinking exists as a raw setting only); apps/extension-vscode/src/core/commandSetup.ts action items list (Context/Model separators) has no Thinking or flagged-switch entry

**Suggested fix**

Add 'Thinking: On/Off' and 'Switch models when flagged' items to the actions QuickPick in commandSetup.ts, wired to Config.agentThinking() and a new flagged-switch setting.

**Reference screenshot(s)**

- `claude_reference/133-claude-code-vscode-ext-extension-command-menu-context-model-effort-thinking.png`

### GAP-286 — Session history lives in a separate TreeView, not in the chat panel

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** extension-vscode · missing-ia
- **Reference:** Codex · VS Code extension · Chats list in panel header

**Gap**

Reference keeps a 'Chats' list at the top of the same panel — three most recent threads with relative timestamps and a 'View all (50)' overflow — so switching threads never leaves the panel. agiworkforce's history button posts openHistory, which runs a command that opens a separate view/QuickPick; the webview itself renders no thread list.

**Evidence**

apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1814-1818 (historyBtn -> postMessage openHistory) and ChatStateManager.ts:355 (executes agi-workforce.showSessionsHistory). Thread data already available via apps/extension-vscode/src/features/trees/conversationTreeProvider.ts (listThreads with title, updatedAt, status).

**Suggested fix**

Render the top 3 threads inline at the head of the webview using the existing ThreadSummary data (title, formatRelativeTime, running spinner) with a 'View all (N)' row that opens the full TreeView, so thread switching and the running-thread indicator stay in one surface.

**Reference screenshot(s)**

- `chatgpt_reference/008-codex-vscode-ext-model-upsell-modal-gpt-5-6-sol-announcement.png`

### GAP-287 — No dedicated session-browser sidebar (Local/Web tabs, search, New session)

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** extension-vscode · missing-ia
- **Reference:** Claude · VS Code extension · Claude Code panel — session list sidebar

**Gap**

Claude's VS Code extension has a persistent left sidebar listing sessions with Local/Web tabs, a search-sessions field, and a prominent 'New session' button, separate from the chat panel itself. agiworkforce exposes conversation history via a VS Code TreeView (ConversationTreeProvider) rather than a custom in-webview session browser with this IA.

**Evidence**

apps/extension-vscode/src/features/trees/conversationTreeProvider.ts (native TreeDataProvider, different paradigm); grep for 'New session'/'Search sessions'/'Local'+'Web' tabs in webviewContent.ts found none

**Suggested fix**

Either enrich the TreeView with search/filter and a visible 'New session' action at the top, or add a matching session list panel inside the webview itself for closer visual parity.

**Reference screenshot(s)**

- `claude_reference/132-claude-code-vscode-ext-extension-empty-state-antigravity-fable-5-banner.png`

### GAP-288 — Composer + menu exposes no plugins/skills, only three static items

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** extension-vscode · missing-control
- **Reference:** Codex · VS Code extension · Composer + menu with Plugins group

**Gap**

Reference splits the + menu into 'Add' (Files and folders, Goal, Plan mode) and 'Plugins' (Documents, PDF, Spreadsheets, Presentations, Template Creator, Sites, Build iOS Apps), each with an icon and a one-line description, so installed capabilities are invocable from the composer. agiworkforce's + menu is Workspace files / Plan mode / Tools and actions, and the extension has no plugin or skill concept at all.

**Evidence**

apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1288-1320 (plusMenu markup, three items). Searched apps/extension-vscode/src for 'plugin|skill' — only an icon mapping at webviewContent.ts:2457 ('skill' -> $(book)) and a runtime event category at integrations/localRuntimeClient.ts:147.

**Suggested fix**

Extend the plus menu with a 'Plugins' group populated from the same resolved-plugin source the desktop uses (apps/desktop/src/features/settings/SkillsPluginsSettings.tsx), each row inserting the plugin's invocation into the composer; show a single 'Browse plugins' row when none are installed rather than an empty group.

**Reference screenshot(s)**

- `chatgpt_reference/010-codex-vscode-ext-plugins-menu-add-files-goal-plan-mode-plugins-list.png`

### GAP-289 — No persistent 'Goal' the agent keeps pursuing across turns

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** extension-vscode · missing-control
- **Reference:** Codex · VS Code extension · Composer + menu — Goal

**Gap**

Reference offers 'Goal — Set a goal to keep pursuing' alongside Plan mode, giving a turn-independent objective that survives multiple messages. agiworkforce has plan mode and per-turn prompts but no persistent objective; the only 'goal' references in the extension are unrelated comments about the /goal sync contract.

**Evidence**

Searched apps/extension-vscode/src for '\bgoal\b' — matches are documentation comments only (platform/surface.ts:8, features/chat-participant/chatParticipant.ts:14, core/commandSetup.ts:1173). Plus menu markup at webviewContent.ts:1288-1320 has no such item.

**Suggested fix**

Add a 'Goal' item to the plus menu that stores a workspace-scoped objective (alongside the existing memory facts store in src/memory/memoryStore.ts), renders it as a removable chip above the composer, and prepends it to each turn's system context until cleared.

**Reference screenshot(s)**

- `chatgpt_reference/010-codex-vscode-ext-plugins-menu-add-files-goal-plan-mode-plugins-list.png`

### GAP-290 — No 'Use Terminal' setting to launch the extension in the integrated terminal

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** extension-vscode · missing-control
- **Reference:** Claude · VS Code extension · Native VS Code Settings — claudeCode.useTerminal

**Gap**

Claude Code exposes a native VS Code checkbox setting ('claudeCode.useTerminal': Launch Claude in the terminal instead of the native UI), discoverable via VS Code's own Settings search. agiworkforce's config.ts has no useTerminal-equivalent key, and no package.json contributes.configuration block was found in this checkout to expose any settings to VS Code's native Settings UI at all.

**Evidence**

apps/extension-vscode/src/platform/config.ts DEFAULTS object (no useTerminal key); no package.json found under apps/extension-vscode (searched with find -iname package.json)

**Suggested fix**

Add an 'agiWorkforce.useTerminal' boolean setting (contributed via package.json configuration schema so it's searchable in native VS Code Settings) that, when enabled, launches the CLI in the integrated terminal instead of the webview UI.

**Reference screenshot(s)**

- `claude_reference/135-claude-code-vscode-ext-extension-settings-use-terminal-setting-search.png`

### GAP-291 — No in-product new-model announcement / try-it card

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** extension-vscode · missing-state
- **Reference:** Codex · VS Code extension · New-model announcement modal

**Gap**

Reference surfaces a dismissible hero card announcing a new model with guidance on how to use it ('highly capable at lower reasoning efforts — start lower, turn it up') and two CTAs: 'Continue with current model' and 'Try <model> now', which switches the composer model. agiworkforce has no announcement surface in any client; the only release-notes UI is the desktop app-update dialog.

**Evidence**

Searched apps/extension-vscode/src and apps/desktop/src/features/updates for "whats new|what's new|announcement|release notes|new model" — only apps/desktop/src/features/updates/UpdateDialog.tsx:26 (app version release notes).

**Suggested fix**

Drive an announcement card from the model catalogue metadata (packages/contracts/types/src/models.json) rather than hardcoded copy: when a model id the user has never selected appears with an 'announcement' entry, render a dismissible card in the webview with the model's own description, a 'Keep <current model>' secondary and a 'Try <model>' primary that posts setModel; persist dismissal per model id in globalState.

**Reference screenshot(s)**

- `chatgpt_reference/008-codex-vscode-ext-model-upsell-modal-gpt-5-6-sol-announcement.png`

### GAP-292 — Effort picker leaves the webview and shows no selected-state checkmark

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** extension-vscode · missing-interaction
- **Reference:** Codex · VS Code extension · Reasoning effort menu with nested model and speed

**Gap**

Reference opens reasoning effort as an inline popover anchored to the composer, with a checkmark on the active level and nested rows for model and speed, so all three run controls are one menu. agiworkforce renders the model picker as an inline popover but sends effort (and mode) out to a native VS Code QuickPick, which relocates focus, shows the current value only as placeholder text, and splits three sibling controls across two interaction models.

**Evidence**

apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1964-1970 (modeChip/effortChip post openModePicker/openEffortPicker) vs the inline '#modelPopover' at webviewContent.ts:1301; handlers at ChatStateManager.ts:371-379; QuickPick items at core/commandSetup.ts:934-960.

**Suggested fix**

Reuse the existing model-popover component for mode and effort: render the four levels with descriptions and a codicon-check on the active one, keep the native QuickPick only as the command-palette path, and post setEffort/setMode (both handlers already exist at ChatStateManager.ts:384-406).

**Reference screenshot(s)**

- `chatgpt_reference/011-codex-vscode-ext-reasoning-effort-menu-light-medium-high-ultra-options.png`

### GAP-293 — No queue-vs-steer choice for messages sent while a turn is running

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** extension-vscode · missing-control
- **Reference:** Codex · VS Code extension · Settings — Composer, Follow-up behavior

**Gap**

Reference exposes 'Follow-up behavior: Queue | Steer' with copy explaining that Cmd+Enter does the opposite for a single message, so a user can decide whether typing mid-run interrupts the agent or lines up behind it. agiworkforce already implements a persisted send queue in the extension but surfaces no control or per-message override, so the behaviour is invisible and unchangeable.

**Evidence**

apps/extension-vscode/src/data/sendQueue.ts:1-45 (workspaceState-backed 'next'/'later' lanes via createMessageQueue) with no corresponding UI; searched webviewContent.ts for queue/steer controls — none. Interrupt path exists at ChatStateManager.ts (\_interruptActiveTurn).

**Suggested fix**

Add an agiWorkforce.composer.followUpBehavior setting ('queue' | 'steer') wired to the existing sendQueue lanes and the interrupt path, show the active mode as a small label in the composer while a turn is streaming, and honour Cmd/Ctrl+Enter as the one-message inversion.

**Reference screenshot(s)**

- `chatgpt_reference/014-codex-vscode-ext-settings-general-language-speed-composer.png`

### GAP-294 — Send shortcut is hardcoded to Enter with no preference

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** extension-vscode · missing-control
- **Reference:** Codex · VS Code extension · Settings — Composer, Send shortcut

**Gap**

Reference lets the user choose when Enter sends versus inserts a newline ('Send shortcut: Enter'). agiworkforce hardcodes Enter-to-send / Shift+Enter-for-newline in the webview keydown handler and prints that binding as static hint text, so users who type multi-line prompts cannot invert it.

**Evidence**

apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1796 (keydown: Enter && !shiftKey sends), :1312 (static hint '<kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> for newline'), :1320 (title 'Send (Enter)'). No 'sendShortcut'-style key exists in src/platform/config.ts DEFAULTS.

**Suggested fix**

Add an agiWorkforce.composer.sendShortcut setting ('enter' | 'modEnter') to config.ts DEFAULTS, branch the keydown handler on it, and regenerate the composer hint and send-button tooltip from the active value.

**Reference screenshot(s)**

- `chatgpt_reference/014-codex-vscode-ext-settings-general-language-speed-composer.png`

### GAP-295 — Context-window usage is computed but never shown in the composer, and cannot be toggled

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** extension-vscode · missing-control
- **Reference:** Codex · VS Code extension · Settings — Composer, Show context window usage

**Gap**

Reference offers a 'Show context window usage' toggle that puts remaining context in the composer. agiworkforce already computes a model-aware context budget and tracks per-session tokens, but the webview composer shows neither, and there is no setting; the only surfacing is a status-bar item and a token-breakdown QuickPick.

**Evidence**

apps/extension-vscode/src/data/contextBudget.ts:1-30 (model context window + mode budget) and src/data/tokenCounter.ts:180-232 (status bar + showTokenBreakdown QuickPick). Searched webviewContent.ts for context-window/percent indicators in the composer — none.

**Suggested fix**

Render remaining context as a small percentage chip in the composer bottom row from the existing contextBudget calculation, refreshed on model change, behind an agiWorkforce.composer.showContextUsage toggle defaulting to on for agent mode.

**Reference screenshot(s)**

- `chatgpt_reference/014-codex-vscode-ext-settings-general-language-speed-composer.png`

### GAP-296 — Memory has no enable/disable, tool-assisted toggle, or in-settings reset

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** extension-vscode · missing-control
- **Reference:** Codex · VS Code extension · Settings — Personalization, Memory

**Gap**

Reference exposes three memory controls: 'Enable memories' (generate new memories from chats), 'Allow memory generation from tool-assisted chats' (chats that used MCP tools or web search), and 'Reset memories' with a destructive Reset button. agiworkforce's extension stores memory facts and injects them into turns with only add/edit/delete affordances — a user cannot stop memory generation, cannot exclude tool-assisted sessions, and reaches delete-all through a QuickPick rather than a settings page.

**Evidence**

apps/extension-vscode/src/memory/memoryStore.ts:1-40 (globalState store, injected as turn context) and core/commandSetup.ts:1176-1230 (add / list / forget-all QuickPick). Searched apps/extension-vscode/src for 'memory.enabled|memoryEnabled|autoMemory' — zero matches.

**Suggested fix**

Add agiWorkforce.memory.enabled and agiWorkforce.memory.fromToolAssisted settings honoured by memoryStore before capture and injection, and surface all three (plus a destructive Reset with a count in the confirm) in the Personalization section of the settings panel.

**Reference screenshot(s)**

- `chatgpt_reference/016-codex-vscode-ext-settings-personalization-personality-memory-instructions.png`

### GAP-297 — Credits balance and top-up are absent from the IDE where credits are spent

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** extension-vscode · missing-ia
- **Reference:** Codex · VS Code extension · Settings — Usage & billing, Credits balance

**Gap**

Reference shows 'Credits balance / Your remaining credits' with the current balance and a 'Buy credits' button next to the plan card. agiworkforce has a real credit service and balance endpoint on web plus credit state in the desktop stores, but the VS Code extension shows only session token counts and an estimated cost — a developer burning credits in the IDE cannot see the balance or top up without leaving.

**Evidence**

apps/web/lib/services/credit-service.ts and apps/web/app/api/llm/v1/credits/balance/route.ts exist; apps/desktop/src/stores/billing/usageSlice.ts and features/settings/AccountSettings.tsx consume credits. Searched apps/extension-vscode/src for 'credit' — only '$(credit-card) Est. cost' labels at data/tokenCounter.ts:198 and core/commandSetup.ts:1379.

**Suggested fix**

Extend fetchTierInfo (src/utils/api.ts) to return the credit balance from the existing balance endpoint, add a 'Credits: $X' row to the account QuickPick and the Usage & billing settings section, and give it a 'Buy credits' action that opens the web billing flow with the surface tagged.

**Reference screenshot(s)**

- `chatgpt_reference/017-codex-vscode-ext-settings-billing-pro-plan-credits-usage-limits.png`

### GAP-298 — Usage is a single aggregate bar — no per-model limits, reset schedule or empty state

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** extension-vscode · missing-ia
- **Reference:** Codex · VS Code extension · Settings — Usage & billing, per-model limits and resets

**Gap**

Reference breaks usage into 'General usage limits' and per-model sections (each with a labelled bar, percent left and a 'Resets <date>' line) plus a 'Usage limit resets' list with a 'No resets available' empty state. agiworkforce's extension renders one percentage bar and a 'resets in Xd' string, so a user throttled on one model cannot tell which limit was hit or when it lifts.

**Evidence**

apps/extension-vscode/src/data/usageMeter.ts:55-120 (single usagePercentage + one resetsAt) and features/sidebar-webview/ChatStateManager.ts:161 ('resets in Xd'); account QuickPick shows one 'Cloud usage: N% used' row at core/commandSetup.ts:1384-1392.

**Suggested fix**

Extend the tier/usage payload to a per-model limit array and render one labelled bar per limit with an absolute reset date, plus an explicit empty state when no limits or resets are returned, in both the usage banner and the settings panel.

**Reference screenshot(s)**

- `chatgpt_reference/017-codex-vscode-ext-settings-billing-pro-plan-credits-usage-limits.png`

### GAP-299 — CodeLens skips comments, so TODO/FIXME cannot become a task

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** extension-vscode · missing-interaction
- **Reference:** Codex · VS Code extension · Turn TODOs into tasks

**Gap**

Reference converts a '// TODO: IMPLEMENT SCHEMA' comment into an agent task with one click from the editor. agiworkforce's CodeLens provider only attaches to function/class declaration lines and explicitly returns false for any line starting with //, #, _ or /_, so TODO comments carry no affordance at all.

**Evidence**

apps/extension-vscode/src/features/code-lens/codeLensProvider.ts:53-104 (declaration-only lens) and :112-120 (comment lines skipped). Searched apps/extension-vscode/src for 'TODO|FIXME' — zero matches.

**Suggested fix**

Add a second lens pass that matches TODO/FIXME/HACK/XXX comment markers and emits a '$(rocket) Make this a task' lens whose command seeds the composer (or a background task) with the comment text plus surrounding declaration range; gate it behind an agiWorkforce.codeLens.todoTasks setting since codeLensEnabled already defaults to false.

**Reference screenshot(s)**

- `chatgpt_reference/006-codex-vscode-ext-onboarding-intro-todo-comments-to-tasks-step3.png`

## P3

### GAP-300 — Effort levels use engineering labels with no explanation of the trade-off

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-copy
- **Reference:** ChatGPT · iOS · Chat model + intelligence popover

**Gap**

The reference names tiers in product language ('Instant', 'Pro') so the speed/quality trade-off is legible. agiworkforce shows 'None / Minimal / Low / Medium / High / xHigh / Max' with no description of what changes (latency, cost, quality) at each stop.

**Evidence**

apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:54-62 (REASONING_EFFORT_LABEL)

**Suggested fix**

Keep the wire values but map them to product labels with a one-line subtitle each (e.g. 'Instant — fastest replies, light reasoning'), defined once in the shared design-system effort module so web/desktop/mobile stay consistent.

**Reference screenshot(s)**

- `chatgpt_reference/073-chatgpt-ios-chat-model-picker-intelligence-tier-popover.png`

### GAP-301 — Connectors screen has no multi-step onboarding wizard pattern or +row add affordance

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-ia
- **Reference:** ChatGPT · iOS · Connect accounts — healthcare-provider directory with search, +add row affordance, and 4-step onboarding wizard (progress dots)

**Gap**

ChatGPT's connect-accounts step is part of a 4-step wizard (dots at top), uses a simple search bar plus a flat list of provider rows each with a leading logo and trailing circular '+' button, and a persistent black 'Continue' CTA. agiworkforce's cloud-connectors screen (apps/mobile/src/features/settings/cloud-connectors/index.tsx) has search + filter chips and is reachable only from Settings/Add-to-Chat, not as an onboarding step, and uses a different row/connect-button style.

**Evidence**

apps/mobile/src/features/settings/cloud-connectors/index.tsx:973-994 (search field), :157-333 (connector catalog incl. Notion, GitHub, Slack, Teams, Gmail, Drive, Dropbox) — no healthcare category, no progress-dot wizard pattern found anywhere in apps/mobile/app or src

**Suggested fix**

If a guided first-run onboarding wizard is desired for connectors generally, add a paged wizard component (progress dots, Continue CTA) that can host any connector category, reusing the existing CloudConnectorsScreen list/search logic per page.

**Reference screenshot(s)**

- `references-2/chatgpt-ios-health-07-connect-provider-accounts.png`

### GAP-302 — Onboarding hero uses a bare brand glyph rather than layered device art showing the payoff

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · visual-polish
- **Reference:** Claude · iOS · Cowork cross-device continuity onboarding

**Gap**

The reference hero is a full-bleed warm-gradient collage of the actual payoff — a phone push notification ('Your daily brief task — Packed schedule today…') layered over a browser window at claude.com/cowork — with a floating circular close chip over the artwork, so the value is legible before any copy is read. agiworkforce's mobile onboarding renders a hand-built SVG brand mark on a plain background, showing the brand rather than the outcome.

**Evidence**

apps/mobile/app/(public)/onboarding.tsx:52-67 (AgiMark spoke geometry drawn with react-native-svg) — no screenshot/device-mockup asset in the flow; web has device mockups only for marketing (apps/web/features/marketing/components/DeviceMockups.tsx)

**Suggested fix**

Add a hero image slot to the onboarding and continuity sheets: a gradient backdrop with a mock push-notification card and a mock browser chrome window (reusable from the marketing DeviceMockups treatment), plus a translucent circular close button pinned top-left over the art rather than a header X.

**Reference screenshot(s)**

- `references-2/claude-ios-cowork-01-cross-device-continuity-onboarding.png`

### GAP-303 — Mobile agent-run list lacks date grouping and a floating 'New task' action

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-ia
- **Reference:** Claude · iOS · Cowork task list

**Gap**

Claude's Cowork list groups tasks under date headers ('Today') and keeps a persistent floating '+ New task' pill in the bottom-right corner, plus history-clock and filter icons in the header. AGIW's agents/index.tsx list uses filter tabs (Active/Needs input/...) without date-section headers or a floating new-task button.

**Evidence**

apps/mobile/app/(app)/agents/index.tsx — FILTERS array renders as tabs (line ~45), no groupBy/section-header logic or floating-action-button pattern found (grep for 'Today', 'New task' in the file returned no matches).

**Suggested fix**

Add date-based section headers (Today/Yesterday/Earlier) to the agent-run FlatList via SectionList, and add a floating '+ New task' button pinned to the bottom-right, replacing or supplementing the top filter-tab row with a compact clock/filter icon pair.

**Reference screenshot(s)**

- `claude_reference/105-claude-ios-cowork-task-list-llm-reference-doc-task-card.png`

### GAP-304 — No Cowork-specific mobile announcement screen (start/steer/background-continue bullets)

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-screen
- **Reference:** Claude · iOS · Feature announcement — Cowork

**Gap**

Claude's Cowork announcement uses 3 iconed bullets (phone, laptop, lightning) to explain that tasks can be started/steered from the phone, checked on across devices, and continue in the background after closing the app, ending in a 'Get started' CTA. This is a specific instance of the missing announcement pattern (see companion finding on image 103) applied to the mobile task-list feature.

**Evidence**

Same search as 103 — no announcement/whats-new component found in apps/mobile.

**Suggested fix**

Once the reusable FeatureAnnouncementScreen exists (see 103 fix), add a Cowork-specific instance shown the first time a user opens apps/mobile/app/(app)/agents/index.tsx, explaining background/multi-device task continuity.

**Reference screenshot(s)**

- `claude_reference/104-claude-ios-onboarding-cowork-announcement-mobile-check-in.png`

### GAP-305 — No top-level 'Remote' entry point in mobile primary navigation

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-ia
- **Reference:** ChatGPT · iOS · Home sidebar with 'Remote' nav entry

**Gap**

ChatGPT iOS surfaces device/CLI pairing ('Remote') as a first-class item in the main hamburger sidebar next to Library, Projects, Scheduled, and Plugins. agiworkforce's companion/pairing feature exists in code but its entry point in the primary mobile navigation was not confirmed; it may be nested deeper than a top-level sidebar item.

**Evidence**

grep -in 'remote|pairing' the audit source inventory snapshot only surfaced 'features/native-bridge/pairing.ts' and the companion component folder, with no route inventory entry showing a top-level '(app)/remote' or sidebar item named 'Remote'.

**Suggested fix**

Add a 'Remote' item to the mobile app's primary sidebar/tab navigation that deep-links directly to the companion pairing/device list screen, matching its prominence in the reference.

**Reference screenshot(s)**

- `references-2/IMG_0618.PNG`

### GAP-306 — New Project modal never explains what a project is for

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-copy
- **Reference:** ChatGPT · iOS · New project modal

**Gap**

Reference leads with 'Projects give ChatGPT shared context across chats and files, all in one place.' directly under the title. agiworkforce's modal jumps straight to a Name field; the only explanatory copy sits far below, attached to Custom Instructions.

**Evidence**

apps/mobile/app/(app)/(tabs)/projects.tsx (modal header then Name field; explainer only under 'Custom Instructions')

**Suggested fix**

Add a one-line subtitle under the modal title describing shared context across chats and files, and move the primary action to a full-width bottom CTA for thumb reach.

**Reference screenshot(s)**

- `chatgpt_reference/047-chatgpt-ios-projects-create-modal-name-input-category-pills.png`

### GAP-307 — Manual pairing submit has no disabled state and no paste affordance

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-state
- **Reference:** Codex · iOS · Pair manually dialog

**Gap**

The reference disables 'Pair' until the field is non-empty, so the error path is unreachable for the empty case. agiworkforce's Connect button is always enabled and produces a validation error ('Please enter a pairing code.') on an empty submit, and there is no paste button despite the field expecting a long copied payload.

**Evidence**

apps/mobile/src/features/companion/components/QRScanner.tsx lines 66-71 (empty-string error) and 173-179 (Button with no disabled prop)

**Suggested fix**

Disable the Connect button while the trimmed input is empty and add a 'Paste' action that reads Clipboard.getStringAsync into the field.

**Reference screenshot(s)**

- `chatgpt_reference/030-codex-ios-remote-setup-manual-pairing-code-modal-keyboard.png`

### GAP-308 — Remaining usage is not surfaced in any nav or menu, only on a dedicated screen

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-ia
- **Reference:** Codex · iOS · Remote overflow menu — Usage remaining

**Gap**

The reference prints 'Usage remaining — Week 100%' at the bottom of the overflow menu so quota is visible without leaving the current task. agiworkforce only exposes usage via Settings > Cloud > Usage, and the drawer contains no usage indicator.

**Evidence**

apps/mobile/src/features/settings/index.tsx line 473-480 (cloud-usage row); apps/mobile/src/features/drawer/components/DrawerContent.tsx has no usage/percent references

**Suggested fix**

Render a compact 'Usage remaining' line in the drawer footer (or an overflow menu) sourced from the same store as settings/cloud-usage, hidden in Local mode.

**Reference screenshot(s)**

- `chatgpt_reference/039-codex-ios-remote-project-list-overflow-menu-organize-manage.png`

### GAP-309 — Accent and appearance pickers push a screen instead of opening an in-place popover

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-interaction
- **Reference:** ChatGPT · iOS · Settings > Accent color popover

**Gap**

The reference opens a native context-menu popover anchored to the settings row: the list stays in place, the current value carries a checkmark, and one tap both changes and dismisses. agiworkforce pushes a full screen for a six-item choice, costing a navigation round trip for a one-tap decision.

**Evidence**

apps/mobile/src/features/settings/index.tsx:352-366 (push('/(app)/settings/accent-color')); apps/mobile/src/features/settings/accent-color/index.tsx (full SettingsScreenShell)

**Suggested fix**

Render short enumerations (accent, appearance) as an anchored popover/action sheet from the settings row using the existing bottom-sheet primitive, keeping the pushed screens as the deep-link target for accessibility and direct navigation.

**Reference screenshot(s)**

- `chatgpt_reference/067-chatgpt-ios-settings-accent-color-swatch-picker-popover.png`

### GAP-310 — Location has no status row or benefit explanation in Data controls

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-copy
- **Reference:** ChatGPT · iOS · Settings > Data controls

**Gap**

Reference shows 'Location services — Off' with an 'Allow location access' action and copy explaining what location buys the user (local recommendations, news, weather). agiworkforce's permission registry lists Location with the bare line 'Not used by Local Mode.', which tells the user nothing about Cloud mode and offers no reason to grant it.

**Evidence**

apps/mobile/src/features/settings/permissions/registry.ts lines 156-157; apps/mobile/src/features/settings/data-controls/index.tsx has no location row

**Suggested fix**

Surface a Location row in Data Controls showing the live OS permission status with a shortcut into system settings, and replace the registry copy with a mode-aware explanation of what location enables and what is sent.

**Reference screenshot(s)**

- `chatgpt_reference/055-chatgpt-ios-settings-data-controls-model-training-location-services.png`

### GAP-311 — Export and account deletion live on two unrelated settings screens

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-ia
- **Reference:** ChatGPT · iOS · Settings > Data controls (export/delete)

**Gap**

Reference co-locates Export data and Delete account at the bottom of Data controls, which is where users look for both. agiworkforce splits them: local export sits in Data Controls, account deletion sits in Cloud Account, so neither screen tells the complete data-lifecycle story.

**Evidence**

apps/mobile/src/features/settings/data-controls/index.tsx vs apps/mobile/src/features/settings/cloud-account/index.tsx line 277 (Delete Account row)

**Suggested fix**

Mirror a 'Delete account' row into Data Controls (navigating to the existing cloud-account flow) so both export paths and the deletion path are reachable from one screen.

**Reference screenshot(s)**

- `chatgpt_reference/056-chatgpt-ios-settings-data-controls-export-delete-account.png`

### GAP-312 — No composer text-behaviour or suggestion toggles (auto-correct, autocomplete, trending)

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Settings > General

**Gap**

The reference groups 'Auto-correct spelling' with the app-level toggles and a 'Suggestions' group (Autocomplete, Trending searches). agiworkforce hardcodes autoCorrect on inputs case by case and has no suggestion system, so users cannot turn off composer auto-correct or prompt suggestions.

**Evidence**

apps/mobile/src/features/settings/general/index.tsx; grep 'autocorrect|spellCheck' — only per-field autoCorrect={false} literals (e.g. ScheduleForm.tsx:277, DrawerContent.tsx:227); grep 'trending|autocomplete' — no suggestion feature

**Suggested fix**

Add an 'Auto-correct spelling' switch wired to the ChatInput TextInput's autoCorrect prop, and gate any future prompt-suggestion surface behind a 'Suggestions' group so the toggle ships with the feature.

**Reference screenshot(s)**

- `chatgpt_reference/066-chatgpt-ios-settings-general-app-language-toggles.png`

### GAP-313 — No composer preferences: context-window usage display or follow-up behavior

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** Codex · iOS · Settings > Remote control (Composer/Behavior)

**Gap**

Reference exposes 'Show context window usage' (toggle) and 'Follow-up behavior — Queue' (picker), letting the user decide whether context pressure is visible and what happens when they send while a turn is running. agiworkforce shows a ContextWarningChip on its own terms and queues offline sends implicitly, with no user preference for either.

**Evidence**

apps/mobile/src/features/chat/components/ContextWarningChip.tsx (unconditional heuristic); apps/mobile/src/features/chat/components/ChatInput.tsx queueSize handling; grep -i 'context window usage|follow-up behavior' across apps/mobile — no match

**Suggested fix**

Add two settings backed by settingsStore: 'Show context window usage' (always/near-limit/never, driving ContextWarningChip) and 'Follow-up behavior' (Queue / Interrupt), read by the composer send path.

**Reference screenshot(s)**

- `chatgpt_reference/058-codex-ios-settings-remote-control-desktop-connection-composer-faceid.png`

### GAP-314 — Voice persona picking is a text list on a sub-screen, not a swipeable persona carousel

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · visual-polish
- **Reference:** ChatGPT · iOS · Settings > Voice

**Gap**

The reference makes the persona the hero: a large gradient orb, persona name, one-line character description ('Calm and affirming') and page dots for swiping between ~9 voices, all on the Voice screen itself. agiworkforce shows 'Voice: <name>' as a row that pushes voice-language, where presets are plain text rows.

**Evidence**

apps/mobile/src/features/settings/voice/index.tsx:269-279; apps/mobile/src/features/settings/voice-language/index.tsx:247-259; VOICE_PRESETS in apps/mobile/src/features/voice/voicePresets.ts already carries name + description

**Suggested fix**

Render VOICE_PRESETS as a horizontally paged carousel at the top of Settings > Voice (orb per preset, name, description, page dots) that previews the voice on selection, keeping the full list screen for system voices.

**Reference screenshot(s)**

- `chatgpt_reference/064-chatgpt-ios-settings-voice-spruce-model-intelligence-language.png`

### GAP-315 — Log Out is nested in the Cloud group instead of a standalone bottom destructive row

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · visual-polish
- **Reference:** ChatGPT · iOS · Settings footer — Log out

**Gap**

The reference isolates Log out in its own red-tinted card at the very bottom of settings, below Get help, which is the platform convention and prevents mis-taps while scanning cloud toggles. agiworkforce appends Log Out as the last row of the Cloud section, above Support, so it sits between unrelated cloud settings.

**Evidence**

apps/mobile/src/features/settings/index.tsx lines 493-505 (logout row inside the Cloud section) and 506-535 (Support section rendered after it)

**Suggested fix**

Move the logout row out of the Cloud section into its own single-row SectionCard rendered after Support, keeping the existing destructive confirm alert.

**Reference screenshot(s)**

- `chatgpt_reference/043-chatgpt-ios-settings-account-help-logout-help-center-about.png`

### GAP-316 — Theme picker uses plain list rows instead of visual Light/Dark/System preview swatches

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · visual-polish
- **Reference:** Claude · iOS · Settings root — Appearance theme picker

**Gap**

Reference renders three tappable mini-mockup preview cards (Light/Dark/System) so users can see the actual look of each theme before choosing. agiworkforce's appearance picker (apps/mobile/src/features/settings/appearance/index.tsx) renders icon + label + description text rows with no visual preview of the resulting UI.

**Evidence**

apps/mobile/src/features/settings/appearance/index.tsx lines 12-14 define THEME_OPTIONS with icon/label/description only; searched for 'swatch'/'preview'/'Image' — no match.

**Suggested fix**

Replace the plain rows with small preview thumbnails (mimicking a chat bubble on a light/dark/system background) matching the reference's card style, keeping the same selection logic.

**Reference screenshot(s)**

- `claude_reference/120-claude-ios-settings-root-appearance-theme-picker-logout.png`

### GAP-317 — Log Out is buried inside the 'Cloud' section instead of a standalone bottom action

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-ia
- **Reference:** Claude · iOS · Settings root — Log out placement

**Gap**

Reference places 'Log out' as a prominent, standalone red row at the very bottom of the Settings root, below Appearance. agiworkforce nests the Log Out row inside the 'Cloud' settings section (after Connectors), conditional on `clerkUser` — much less discoverable and inconsistent with the reference's persistent sign-out affordance.

**Evidence**

apps/mobile/src/features/settings/index.tsx lines 493-503 — 'logout' row is the last item of the 'Cloud' section array, not a separate top-level section.

**Suggested fix**

Move Log Out to its own section at the very end of the settings list (after Support), always visible when signed in, matching the reference's placement.

**Reference screenshot(s)**

- `claude_reference/120-claude-ios-settings-root-appearance-theme-picker-logout.png`

### GAP-318 — Connector OAuth uses openBrowserAsync, so there is no domain-consent dialog or callback

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-interaction
- **Reference:** ChatGPT · iOS · System web-auth consent dialog

**Gap**

The reference's web-based sign-in runs through ASWebAuthenticationSession, which shows the OS dialog naming the auth domain and returns control to the app on the callback URL. agiworkforce's GitHub connector opens the install URL with WebBrowser.openBrowserAsync and then blindly reloads the connector list on dismiss, so the user gets no domain-trust prompt and a cancelled or failed install is indistinguishable from a successful one.

**Evidence**

apps/mobile/src/features/settings/cloud-connectors/index.tsx lines 790-801; grep 'openAuthSessionAsync' across apps/mobile — no matches

**Suggested fix**

Switch connector OAuth launches to WebBrowser.openAuthSessionAsync with the app's redirect scheme, branch on the returned result type, and show an explicit failure state when the session is cancelled or returns an error.

**Reference screenshot(s)**

- `chatgpt_reference/036-os-ios-system-auth-consent-dialog-chatgpt-auth-openai-signin.png`

### GAP-319 — No Acceptable Use Policy link and no version-anchored legal popover

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-copy
- **Reference:** Claude · iOS · Version/legal popover

**Gap**

The reference exposes the exact build string plus Acceptable Use Policy, Consumer Terms, Privacy Policy, Licenses and Help & Support from a popover anchored to the version row, each with an external-link glyph. agiworkforce links Website, Privacy Policy, Terms of Service and Open Source Licenses from the About screen only, and has no acceptable-use document (the concept appears only as prose inside apps/web/app/terms/page.tsx).

**Evidence**

apps/mobile/app/(app)/about.tsx (Resources card: Website, Privacy Policy, Terms of Service, Open Source Licenses); grep -i 'acceptable.use' across apps matches only apps/web/app/terms/page.tsx and apps/web/app/mobile/legal/page.tsx

**Suggested fix**

Publish an /acceptable-use page on web, add the link to the About Resources card, and make the settings 'About vX' row long-pressable to open a popover with the build string and the same legal links.

**Reference screenshot(s)**

- `chatgpt_reference/025-other-ios-settings-legal-links-claude-app-version-popover.png`

### GAP-320 — No 'Thought for Ns' reasoning-status label during voice thinking phase

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-state
- **Reference:** ChatGPT · iOS · Voice mode reasoning status line

**Gap**

ChatGPT shows a dedicated 'Thought for 2s' / 'Thought for 4s' line above the streamed response when the model reasons before answering in voice mode. agiworkforce's PHASE_CONFIG for the 'thinking' phase only exposes a static 'Thinking...' label with sublabel 'Processing your message' — no elapsed reasoning duration is surfaced.

**Evidence**

apps/mobile/src/features/voice/components/VoiceConversationScreen.tsx lines 50-72 (PHASE_CONFIG).

**Suggested fix**

Track elapsed time in the 'thinking' phase and render 'Thought for Ns' once reasoning completes, consistent with the reasoning-status pattern likely already used in the text chat surface (ThinkingChip.tsx).

**Reference screenshot(s)**

- `references-2/chatgpt-ios-voice-05-reasoning-status.png`

### GAP-321 — No dismissible contextual tip strip above the composer with an 'Add to message' action

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-copy
- **Reference:** Claude · macOS desktop · Cowork task composer — tip banner

**Gap**

The reference shows a slim strip above the composer: a 'Tip' chip, the hint 'Ask for any file format: docs, spreadsheets, slides, PDFs, and more.', an 'Add to message' button that injects the suggestion into the draft, and an X to dismiss. agiworkforce surfaces tips only inside settings pages and dialogs, never as a one-tap-actionable hint at the point of composing.

**Evidence**

searched 'Add to message' across apps — no match; 'Tip' occurrences are static help copy in apps/desktop/src/features/settings/KeybindingsSettings.tsx:409, CustomInstructionsSettings.tsx:208, marketplace PublishWorkflowTab.tsx

**Suggested fix**

Add a ComposerTipStrip rendered above the composer, driven by a small rotating rule set (attachment present, folder selected, first Cowork run), with an 'Add to message' button that appends the suggested phrasing to the draft and an X that suppresses that tip id permanently in local settings.

**Reference screenshot(s)**

- `references-2/claude-desktop-cowork-record-skill-06-task-progress-outputs-context.png`

### GAP-322 — Record-skill consent shown as full panel takeover instead of compact floating dialog

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · visual-polish
- **Reference:** Claude · macOS desktop · Record a skill consent dialog presentation

**Gap**

Reference presents the consent step as a small centered modal card floating above the still-visible composer and conversation list. agiworkforce's ActionRecorder consent step (hasConsented === false) renders as a full-height <section> that replaces the entire chat pane (activePanel becomes 'record-skill'), losing the surrounding context.

**Evidence**

apps/desktop/src/features/automation/ActionRecorder.tsx lines ~232-291 (full-section layout); apps/desktop/src/features/v3/DesktopShellV3.tsx line ~452 swaps activePanel to a full-panel view rather than opening an overlay/dialog.

**Suggested fix**

Render the initial consent step as a centered Dialog overlay (reusing the existing Dialog component already imported in the file) instead of swapping the entire content panel, so the chat/composer remain visible behind it as in the reference.

**Reference screenshot(s)**

- `references-2/claude-desktop-cowork-record-skill-03-privacy-consent.png`

### GAP-323 — No diff-marker style setting (Color vs +/-) for colour-blind users

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings > Appearance — Preferences

**Gap**

The reference offers 'Diff markers · Show changes using colors or +/− markers' as a segmented Color | +/- control, so diffs remain readable without relying on red/green. agiworkforce renders diffs in DiffViewer and GitDiffViewer with colour only and no alternative encoding, which is a WCAG use-of-colour problem for the roughly 1-in-12 users with red-green colour vision deficiency.

**Evidence**

apps/desktop/src/features/code/DiffViewer.tsx and features/git/GitDiffViewer.tsx (colour-based rendering); grepped 'diff marker|diffMarker' across apps — no match; ThemeSettings Accessibility section has only Dyslexic Friendly Font

**Suggested fix**

Add a `diffMarkerStyle: 'color' | 'symbols'` preference in the Accessibility section and have both diff viewers prefix changed lines with + / − glyphs (and a non-colour background pattern) when set to symbols.

**Reference screenshot(s)**

- `chatgpt_reference/095-codex-macos-settings-appearance-dark-theme-preferences.png`

### GAP-324 — Theme preview trapped in dialog; no translucency or per-theme font

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · visual-polish
- **Reference:** Codex · macOS desktop · Settings > Appearance — theme card

**Gap**

The reference keeps a persistent live preview on the Appearance page (a rendered code sample with diff gutters shown simultaneously in light and dark) so the effect of every token change is visible without opening a dialog, and each theme card carries a 'Translucent sidebar' toggle and a 'UI font' field. agiworkforce has an equivalent MiniPreview but only inside ThemeEditorDialog, and neither translucency nor a per-theme font exists.

**Evidence**

apps/desktop/src/features/settings/ThemeEditorDialog.tsx:175-246 (MiniPreview, dialog-scoped); apps/desktop/src/features/settings/ThemeSettings.tsx (swatch grids, no page-level preview); grepped 'translucen' across apps/desktop — no match; FontSelector sets --chat-font-family globally, not per theme

**Suggested fix**

Promote MiniPreview to a sticky preview panel on the Appearance page reflecting the active theme, and add a translucent-sidebar toggle (Tauri vibrancy/backdrop-filter) plus an optional per-theme UI font override that falls back to the global FontSelector value.

**Reference screenshot(s)**

- `chatgpt_reference/094-codex-macos-settings-appearance-theme-picker-light-colors.png`

### GAP-325 — Language selector has no Auto-detect option

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** ChatGPT · macOS desktop · Settings > General

**Gap**

The reference Language row defaults to 'Auto detect' with the sub-line 'Language for the app UI', so a new install follows the OS locale without the user choosing. agiworkforce's language Select enumerates SUPPORTED_LANGUAGES by native name with no auto/system entry, forcing an explicit pick and diverging from the Theme control right above it, which does offer 'System'.

**Evidence**

apps/desktop/src/features/settings/GeneralSettings.tsx:116-132 (Select over SUPPORTED_LANGUAGES only) versus :100-114 (Theme Select includes a 'system' item); grepped 'auto.detect|autoDetect' in stores/settingsStore.ts — no match

**Suggested fix**

Add a 'System' entry to the language Select that resolves via navigator.language against SUPPORTED_LANGUAGES with an English fallback, make it the default for fresh installs, and show the resolved language as helper text.

**Reference screenshot(s)**

- `chatgpt_reference/091-chatgpt-macos-settings-general-permissions-full-access-defaults.png`

### GAP-326 — One binding per action, no alternate combos and no mouse-button bindings

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings > Keyboard shortcuts

**Gap**

The reference stacks multiple bindings per action (New chat = ⌘N and ⇧⌘O; Next tab = ^Tab, ⇧⌘] and ⌥⌘Right) and accepts mouse buttons as bindings (Back = ⌘[ and 'Mouse Back'). agiworkforce stores customKeybindings as Record<string, string> — exactly one combo per shortcut id — and captureCombo reads only KeyboardEvent, so muscle memory carried over from another tool cannot be added alongside the default.

**Evidence**

apps/desktop/src/features/settings/KeybindingsSettings.tsx:34-43 (resolveShortcut returns a single combo), :49-61 (captureCombo takes KeyboardEvent only); customKeybindings typed Record<string, string> in stores/settingsStore.ts

**Suggested fix**

Widen customKeybindings values to string[] (migrating existing single values), render one chip row per binding with its own edit/delete, add an 'Add binding' affordance, and extend the capture surface to accept mouse buttons 3/4 for Back/Forward-style actions.

**Reference screenshot(s)**

- `chatgpt_reference/101-codex-macos-settings-keyboard-shortcuts-chat-navigation-basics.png`

### GAP-327 — No visual assistant identity — persona selection exists for voice only

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-screen
- **Reference:** Codex · macOS desktop · Settings > Pets

**Gap**

The reference gives the assistant a selectable visual identity with a purpose ('Pets manage threads and surface what needs attention'), an avatar list with name + one-line character description + Select/Selected states, header Create and Wake actions, and a size slider. agiworkforce's closest analogue is VoicePersonaSelector, which uses the same row shape (name, description, sample) but only changes TTS voice — the assistant has no visual persona beyond the static AgiMark glyph in BrandedGreeting.

**Evidence**

apps/desktop/src/features/settings/VoicePersonaSelector.tsx:20-60 (professional/friendly/calm/energetic/storyteller/technical, each with description + samplePhrase, TTS only); apps/desktop/src/features/chat/BrandedGreeting.tsx (single AgiMark glyph); grepped 'avatar picker|companion|mascot' across apps/desktop features — no assistant-avatar surface

**Suggested fix**

If the product wants an assistant identity, extend VoicePersonaSelector into a single Persona destination that binds voice, avatar art and tone together (so choosing 'Calm' changes greeting glyph, voice and response style at once) rather than shipping an unrelated ornamental pet.

**Reference screenshot(s)**

- `chatgpt_reference/099-codex-macos-settings-pets-avatar-picker-list-top.png`

### GAP-328 — Plugin rows use generic monochrome icons and one affordance class

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · visual-polish
- **Reference:** Codex · VS Code extension · Settings — Plugins, mixed toggle/checkmark rows

**Gap**

Reference distinguishes two classes of entry in the same list — capability plugins with a real toggle versus installed catalogue/connector entries with a plain checkmark — and gives every row its own brand icon (GitHub, Google Drive, Vercel, Expo), which makes a 22-item list scannable. agiworkforce renders every plugin, command, skill and agent row with the same generic lucide glyph and the same affordance, so provenance and type are only readable from the section header.

**Evidence**

apps/desktop/src/features/settings/SkillsPluginsSettings.tsx:137-160 and :313-323 (single Icon prop per row), :717-808 (Puzzle / Command / Zap / BookOpen glyphs reused for all rows).

**Suggested fix**

Carry an icon reference (or connector logo, reusing apps/web/features/connectors/components/OfficialConnectorLogo.tsx) on each resolved plugin, and split the row affordance: toggle for capabilities the app controls, checkmark plus source label for installed catalogue entries.

**Reference screenshot(s)**

- `chatgpt_reference/022-codex-vscode-ext-settings-plugins-github-vercel-build-apps-checkmarks.png`

### GAP-329 — Shortcut rows lack a secondary description line explaining what the action does

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-copy
- **Reference:** Codex · macOS desktop · Settings › Keyboard shortcuts

**Gap**

Each reference row is a title plus a plain-language description ('Redo last action' / 'Redo the most recently undone app action'). agiworkforce renders only one string, so ambiguous entries like 'Images', 'Skills' or 'Cycle agent mode' give the user no explanation.

**Evidence**

apps/desktop/src/features/settings/KeybindingsSettings.tsx:117 (single {shortcut.description} span); apps/desktop/src/constants/shortcuts.ts descriptions such as 'Images', 'Skills'

**Suggested fix**

Add an optional `detail` field to ShortcutDefinition, fill it for every entry, and render it as a muted second line in ShortcutRow (also making search match on it).

**Reference screenshot(s)**

- `chatgpt_reference/105-codex-macos-settings-keyboard-shortcuts-undo-redo-approve-close-tab.png`

### GAP-330 — Global hotkeys are scattered across General and Voice instead of the shortcuts list

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-ia
- **Reference:** Codex · macOS desktop · Settings › Keyboard shortcuts

**Gap**

Reference puts every hotkey — including system-wide dictation and the popout-window hotkey — in one searchable Keyboard shortcuts list. agiworkforce splits them: the Quick Query global hotkey lives in General, the dictation hotkey in Voice, and neither appears in KeybindingsSettings, so search there returns nothing for 'dictation' or 'global'.

**Evidence**

apps/desktop/src/features/settings/tabs/General/index.tsx ('Global Hotkey', 'Key Combination'), apps/desktop/src/features/settings/VoiceSettings.tsx:252, apps/desktop/src/features/settings/KeybindingsSettings.tsx (renders only DEFAULT_SHORTCUTS)

**Suggested fix**

Surface the global hotkey and dictation hotkeys as rows in KeybindingsSettings under a 'System-wide' category (reading/writing the same settingsStore fields) while keeping deep links from General/Voice.

**Reference screenshot(s)**

- `chatgpt_reference/107-codex-macos-settings-keyboard-shortcuts-browser-nav-dictation-window.png`

### GAP-331 — No start/stop trace recording action for capturing a diagnostic bundle

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings › Keyboard shortcuts (trace recording)

**Gap**

Reference binds ⇧⌘S to 'Start Trace Recording' so a user can capture a reproducible trace when something misbehaves. agiworkforce has resource monitoring and analytics but no user-triggered trace capture or shortcut.

**Evidence**

searched 'trace recording', 'startTrace' and 'profiling' across apps/desktop/src — no match; nearest surfaces are apps/desktop/src/features/resource-monitor and features/analytics

**Suggested fix**

Add a Developer-tab 'Start trace recording' toggle plus a bindable shortcut that writes a timestamped trace (logs + IPC timings + resource samples) to a zip the user can attach to a support report.

**Reference screenshot(s)**

- `chatgpt_reference/108-codex-macos-settings-keyboard-shortcuts-chat-slots-file-tree-trace.png`

### GAP-332 — No 'Usage limit resets' section with a 'No resets available' empty state

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-state
- **Reference:** Codex · macOS desktop · Settings › Usage & billing

**Gap**

Reference ends the billing screen with an upcoming-resets list and an explicit empty state, so users know when a throttled limit will lift. agiworkforce shows 'Resets in <time>' inline on the budget bar but has no consolidated resets list or empty state.

**Evidence**

apps/desktop/src/features/settings/UsageDashboard.tsx:202 ('Resets in ...' inline on the plan budget only)

**Suggested fix**

Add a 'Usage limit resets' block under the usage bars listing each limit with its reset timestamp, rendering 'No resets available' when nothing is throttled.

**Reference screenshot(s)**

- `chatgpt_reference/109-codex-macos-settings-billing-plan-credits-usage-limits.png`

### GAP-333 — Sidebar footer has no help entry point

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-ia
- **Reference:** Codex · macOS desktop · Sidebar footer

**Gap**

The reference pairs the account row with a '?' help button in the sidebar footer. agiworkforce's footer has the account/profile row and a settings gear only; help, docs and support have no entry point in the shell chrome.

**Evidence**

apps/desktop/src/features/v3/Sidebar.tsx footer block (~lines 760-860): account row plus a settings button (title=t('common.settings')), no help control

**Suggested fix**

Add a '?' button beside settings opening a help menu (docs, keyboard shortcuts overlay, report an issue, about/version).

**Reference screenshot(s)**

- `chatgpt_reference/083-codex-macos-sidebar-nav-projects-recent-chats.png`

### GAP-334 — Sidebar toggle tooltip omits its keyboard shortcut

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-copy
- **Reference:** Codex · macOS desktop · Sidebar toggle tooltip

**Gap**

The reference's tooltip reads 'Toggle sidebar ⌘B', teaching the accelerator at the point of use. agiworkforce's toggle uses a bare title/aria-label ('Expand'/'Collapse') and the bound shortcut is ⌘⇧U, which is neither shown nor conventional.

**Evidence**

apps/desktop/src/features/v3/Sidebar.tsx:395-398 (title/aria-label only); apps/desktop/src/constants/shortcuts.ts:191-197 (toggle-sidebar = meta+shift+U)

**Suggested fix**

Use the Tooltip primitive with 'Toggle sidebar' plus the currently bound combo rendered from shortcutStore, and consider defaulting the binding to ⌘B.

**Reference screenshot(s)**

- `chatgpt_reference/082-codex-macos-sidebar-nav-toggle-tooltip-projects-chats.png`

### GAP-335 — No back/forward history navigation in the desktop title bar

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-interaction
- **Reference:** Codex · macOS desktop · Title bar navigation

**Gap**

The reference's title bar carries back and forward arrows next to the sidebar toggle and new-chat button, so users can retrace through views and conversations. agiworkforce's TitleBar has the sidebar toggle, command palette and window controls but no view history.

**Evidence**

apps/desktop/src/features/layout/TitleBar.tsx:83-207 (PanelLeft, command palette, pin/always-on-top, minimise/maximise/close only)

**Suggested fix**

Maintain a panel/conversation history stack in the shell and add back/forward buttons (with ⌘[ / ⌘]) to the title bar, disabled when the stack ends.

**Reference screenshot(s)**

- `chatgpt_reference/079-codex-macos-chat-empty-state-agiworkforce-quick-actions.png`

### GAP-336 — No virtual 'Pet' companion personalization feature

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-screen
- **Reference:** ChatGPT · web · Personalization — Pet companion

**Gap**

Reference shows a 'Pet' section at the top of Personalization letting the user 'Choose a companion that works alongside you' via a 'Select pet' picker. This is a novelty/engagement feature with no equivalent anywhere in agiworkforce (the existing 'companion' code is an unrelated desktop-mobile pairing feature, not a virtual character).

**Evidence**

apps/mobile/src/features/companion/\* is a desktop-mobile device-pairing feature, not a virtual pet; searched '\bpet\b', 'Select pet', 'virtual pet' across apps/web, apps/mobile, apps/desktop — zero relevant matches

**Suggested fix**

Low priority novelty feature — consider only if competitive engagement metrics justify it; not core to product parity.

**Reference screenshot(s)**

- `chatgpt_reference/126-chatgpt-web-settings-personalization-pet-about-you-fields.png`

### GAP-337 — No connected-CLI device management or device-code auth (CLI itself is 'coming soon')

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-feature
- **Reference:** ChatGPT · web · Security and login — Secure sign in with ChatGPT (CLI connection)

**Gap**

Reference shows a 'Secure sign in with ChatGPT' section listing connected apps like Codex CLI with a Disconnect action, plus an 'Enable device code authorization for Codex' toggle for headless/remote sign-in with phishing-risk warning copy. agiworkforce's CLI is marked 'coming soon' in-app, so there is no connected-device list or device-code flow yet.

**Evidence**

apps/web/app/cli/page.tsx ('AGI CLI · coming soon'); searched 'Disconnect', 'device code' in apps/web/features/settings — no security-page matches

**Suggested fix**

Once the AGI CLI ships, add a 'Secure sign in with AGI' section to Settings > Security listing connected CLI/device sessions with a Disconnect action, and a device-code authorization toggle with equivalent phishing-risk warning copy.

**Reference screenshot(s)**

- `chatgpt_reference/142-chatgpt-web-settings-security-login-codex-cli-connection-device-code-auth.png`

### GAP-338 — Active sessions / log-out-all-devices lives under Account, not Security and login

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-ia
- **Reference:** ChatGPT · web · Security and login — Sessions IA placement

**Gap**

Reference groups 'Active sessions' (device count, review/remove trusted devices, Log out all) under the Security and login page. agiworkforce implements an equivalent Active Sessions table with device/created/last-active columns and a 'Log out of all devices' action, but it is placed in AccountSection.tsx rather than SecuritySection.tsx, which is where a user familiar with the reference IA would look first.

**Evidence**

apps/web/features/settings/sections/AccountSection.tsx lines ~397-498 (Active sessions table + 'Log out of all devices' copy) vs apps/web/features/settings/sections/SecuritySection.tsx (no session content)

**Suggested fix**

Move (or cross-link) the Active Sessions table into the Security and login section so session/device management sits alongside password and 2FA, matching the reference IA.

**Reference screenshot(s)**

- `chatgpt_reference/140-chatgpt-web-settings-security-login-password-passkeys-mfa-sessions.png`

### GAP-339 — No keyboard-shortcuts entry point from the extension UI

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** extension-vscode · missing-control
- **Reference:** Codex · VS Code extension · Account dropdown — Keyboard shortcuts

**Gap**

Reference puts 'Keyboard shortcuts' directly in the account menu next to settings and log out. agiworkforce ships shortcut overlays on desktop and web but the VS Code extension offers no way to discover its own keybindings (including the accept/reject diff shortcuts it defines).

**Evidence**

Searched apps/extension-vscode/src for 'keyboard shortcut|keybinding' — only comments (providers/diffDecorationProvider.ts:7 documents Ctrl+Shift+A / Ctrl+Shift+R, core/commandSetup.ts:1303). Counterparts exist at apps/desktop/src/features/chat/KeyboardShortcutsOverlay.tsx and apps/web/features/chat/components/dialogs/KeyboardShortcutsDialog.tsx.

**Suggested fix**

Add a 'Keyboard shortcuts' row to the account QuickPick that runs workbench.action.openGlobalKeybindings pre-filtered to 'agi-workforce', and list the diff accept/reject and composer shortcuts in the composer hint tooltip.

**Reference screenshot(s)**

- `chatgpt_reference/013-codex-vscode-ext-account-menu-profile-dropdown-settings-logout.png`

### GAP-340 — No inline hint to switch to a terminal-based experience

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** extension-vscode · missing-copy
- **Reference:** Claude · VS Code extension · Claude Code panel — 'Prefer the Terminal experience?' banner

**Gap**

Claude's panel footer shows a dismissible 'Prefer the Terminal experience? Switch back in Settings.' hint, guiding power users to the CLI/terminal mode. No equivalent hint exists in agiworkforce's webview footer, though a related useTerminal-style setting is also entirely absent (see separate finding).

**Evidence**

searched webviewContent.ts for 'Prefer the Terminal'/'terminal experience'/'Switch back' — no matches

**Suggested fix**

Once a terminal/native UI toggle is added (see the useTerminal gap), surface a matching dismissible hint in the composer footer.

**Reference screenshot(s)**

- `claude_reference/132-claude-code-vscode-ext-extension-empty-state-antigravity-fable-5-banner.png`

### GAP-341 — No UI language control in the IDE surface

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** extension-vscode · missing-control
- **Reference:** Codex · VS Code extension · Settings — General, Language

**Gap**

Reference offers 'Language — Language for the app UI' with an Auto detect default. agiworkforce has a language selector on web and voice-language on mobile, but the VS Code extension has no language concept and hardcodes English strings in the webview.

**Evidence**

apps/web/features/settings/components/LanguageSelector.tsx and apps/web/features/settings/components/Settings/Profile.tsx (English/Espanol/Francais/Deutsch/Japanese/Chinese) exist; searched apps/extension-vscode/src for 'language|locale' — only languageId (document language) usages in code-lens/hover providers.

**Suggested fix**

Honour vscode.env.language for extension-authored strings (or an agiWorkforce.language override with 'auto'), and route the setting through the same locale list the web Profile settings already use so a user's language choice is consistent across surfaces.

**Reference screenshot(s)**

- `chatgpt_reference/014-codex-vscode-ext-settings-general-language-speed-composer.png`

### GAP-342 — No response personality/tone preset on any surface

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** extension-vscode · missing-control
- **Reference:** Codex · VS Code extension · Settings — Personalization, Personality

**Gap**

Reference offers a named tone preset ('Pragmatic') with an honest caveat banner that personality is not supported by every model and that tone can also be set in custom instructions. agiworkforce has no personality concept anywhere — tone can only be described in free-text custom instructions on desktop/web.

**Evidence**

Searched apps/extension-vscode/src, apps/desktop/src/features/settings, apps/web/features/settings for 'personality|tone' — only incidental prose (apps/desktop/.../CustomInstructionsSettings.tsx:146 example text, apps/web/.../GeneralSection.tsx:367 'tailor tone').

**Suggested fix**

Add a small set of tone presets that expand into a system-prompt fragment, gated by provider capability metadata so unsupported models show the same honest 'not supported by every model' banner instead of a dead control; expose it in desktop/web Personalization first, then mirror in the extension settings panel.

**Reference screenshot(s)**

- `chatgpt_reference/016-codex-vscode-ext-settings-personalization-personality-memory-instructions.png`
