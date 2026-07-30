# agiworkforce UI/UX gap tracker

<!-- ui-gaps-csv-sha256: 6c563c70544adcb03f370d90d8f72e22584b55ecb49bac3d7f8e5ab97a21b75f -->

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
- Unresolved: 0 P0, 117 P1, 161 P2, 43 P3.

| Surface          | Gaps |
| ---------------- | ---: |
| mobile           |  114 |
| desktop          |  142 |
| web              |   43 |
| extension        |    5 |
| extension-vscode |   37 |

| Status      | Gaps |
| ----------- | ---: |
| Open        |  321 |
| In Progress |    0 |
| Blocked     |    0 |
| Deferred    |    0 |
| Done        |   20 |
| Not Planned |    0 |

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

### GAP-013 — No change-email flow and no 'continue on the web' confirm dialog

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-screen
- **Reference:** ChatGPT · iOS · Account > Change email confirm dialog

**Gap**

The reference makes the Email row actionable: tapping it raises 'Change your email — To change <address>, continue to ChatGPT on the web.' with Cancel/Continue, so the capability is discoverable even though it is completed elsewhere. In agiworkforce the Email row opens a read-only account screen and there is no way, in-app or by hand-off, to change the account email.

**Evidence**

apps/mobile/src/features/settings/cloud-account/index.tsx (email rendered as text only; rows are Current session, Copy User ID, Log Out, Delete Account); grep 'change.\*email|updateEmail' across apps/mobile/src — no match

**Suggested fix**

Make the Email row tappable and show an Alert with the current address, Cancel and Continue, where Continue opens the web account settings via openExternalUrl; once the API exists, replace it with an in-app verify-new-address flow.

**Reference screenshot(s)**

- `chatgpt_reference/069-chatgpt-ios-settings-account-modal-change-email-confirm.png`

### GAP-014 — Restore purchases gives no success or 'nothing to restore' feedback

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-state
- **Reference:** ChatGPT · iOS · Billing > Restore purchases result

**Gap**

In the reference, Restore purchases always resolves into a modal that tells the user what happened (here: the subscription lives on another platform, OK-only). In agiworkforce the restore flow marks success silently — the row label reverts from 'Restoring…' and only an error path renders text — so a restore that finds zero purchases is indistinguishable from a successful one.

**Evidence**

apps/mobile/src/features/billing/useIapPurchaseFlow.ts:214-247 (markSuccess with no user-facing message); apps/mobile/src/features/settings/cloud-billing/index.tsx:84-93 (only status==='error' renders text)

**Suggested fix**

After restore, show an Alert for each outcome: purchases restored (naming the plan), no purchases found for this Apple ID, or failure with a retry; keep the inline error text as the persistent fallback.

**Reference screenshot(s)**

- `chatgpt_reference/071-chatgpt-ios-settings-billing-modal-restore-purchases-ok-only.png`

### GAP-015 — No 'purchased on another platform' guard — user can be double-charged via IAP

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-state
- **Reference:** ChatGPT · iOS · Billing > cross-platform subscription block

**Gap**

The reference detects that the active subscription was bought outside the App Store and blocks in-app changes with an explicit dialog naming where to manage it (OK / Learn more). agiworkforce stores no purchase platform: with FEATURES.iap on, Subscription/Manage/Upgrade always open the native paywall sheet, so a user who already pays through Stripe on web can start a second, parallel StoreKit subscription with no warning.

**Evidence**

apps/mobile/src/features/settings/cloud-billing/index.tsx:154-173 (handleUpgrade/handleManageBilling always expand the paywall sheet); apps/mobile/src/features/billing/store.ts (tier/status only, no billing source); grep "billingSource|subscriptionSource|'apple'|'stripe'" — no platform field

**Suggested fix**

Return the subscription's origin (stripe | apple | google) from the entitlement API, store it in the tier store, and when it is not the current store show a blocking dialog ('You purchased this subscription on another platform…') with OK plus a link to the correct management surface; disable Upgrade/Manage rows in that state.

**Reference screenshot(s)**

- `chatgpt_reference/070-chatgpt-ios-settings-billing-modal-subscription-external-platform.png`

### GAP-016 — No dedicated Chats list screen with search, filter, and New chat CTA

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-screen
- **Reference:** Claude · iOS · Chats list

**Gap**

Reference has a full 'Chats' tab: chronological list of all conversations, filter icon (top right), a persistent floating search bar pinned to the bottom, and a floating 'New chat' pill button. agiworkforce's chat.tsx tab is a composer/start screen, and full chat history is only reachable through the nav drawer's 'Recents' list, which is capped to 8 items and has no filter control.

**Evidence**

apps/mobile/app/(app)/(tabs)/chat.tsx (comment: 'Recents live in the drawer; this screen stays focused on starting work.'); apps/mobile/src/features/drawer/components/DrawerContent.tsx (DRAWER_RECENT_LIMIT = 8, no filter UI). Searched for 'Filter'/'SlidersHorizontal' in chat.tsx and DrawerContent.tsx — no match.

**Suggested fix**

Add a dedicated, full-height Chats list route (or convert the drawer Recents list into a full-screen view) with a filter control and an unbounded, searchable list of all conversations, plus a floating New Chat action, matching the reference IA.

**Reference screenshot(s)**

- `claude_reference/117-claude-ios-chats-list-greeting-and-two-older-chats.png`

### GAP-017 — iOS has no cross-device continuity onboarding sheet for cloud tasks

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-screen
- **Reference:** Claude · iOS · Cowork cross-device continuity onboarding

**Gap**

The reference is a full-screen sheet with a Beta pill, serif headline 'Keep Cowork going when you're on the go', three icon+text benefits (start and steer tasks from the phone; check in from phone, browser or desktop app; work continues in the background even when the app is closed), a primary 'Start a Cowork task' CTA and a secondary 'Not now'. agiworkforce mobile has no such screen: first-run is a three-step local-model-download flow, and the only educational overlay is a four-step LAN desktop-pairing walkthrough, so nothing ever explains that cloud work persists across surfaces.

**Evidence**

apps/mobile/app/(public)/onboarding.tsx:1-16 (Hero → device tier → model download); apps/mobile/src/features/companion/components/CompanionDemoWalkthrough.tsx:48-70 (Pair/Monitor/Approve/Remote Control, all LAN pairing); searched 'cross-device|continuity|even when you close' under apps/mobile — only sync-engine code comments

**Suggested fix**

Add a ContinuitySheet under app/(app)/ shown once on first cloud sign-in (and re-openable from Settings → Capabilities): Beta pill, display-serif headline, three benefit rows reusing the existing lucide icons (list-checks, clock, globe), primary 'Start a task' routing to the cloud composer and secondary 'Not now' persisted in MMKV. Tie the third benefit to the existing task_completed notification so the promise is verifiable.

**Reference screenshot(s)**

- `references-2/claude-ios-cowork-01-cross-device-continuity-onboarding.png`

### GAP-018 — Global search does not cover files, library or artifacts

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Global search overlay

**Gap**

The reference states its scope up front — 'Search chats, files, and projects' — so uploaded documents and images are findable from one place. agiworkforce's search queries conversations (title + message content) and projects only; Library and Artifacts, both of which have their own screens, are unreachable from search.

**Evidence**

apps/mobile/src/features/drawer/components/DrawerContent.tsx:295-371 (searchConversations + project title filter only); apps/mobile/app/(app)/library/index.tsx and app/(app)/artifacts/index.tsx exist but are not searched

**Suggested fix**

Extend the search query to fan out over conversations, projects, library files and artifacts, returning grouped sections with type badges, and update the placeholder to name the scope.

**Reference screenshot(s)**

- `chatgpt_reference/078-chatgpt-ios-search-overlay-empty-prompt-state.png`

### GAP-019 — Action-approval mode is buried in Settings, not reachable inline from the dispatch/code-session composer

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-ia
- **Reference:** Codex · iOS · Inline approval-mode picker reachable from the composer (Ask for approval / Approve for me / Full access)

**Gap**

Codex surfaces its 3-tier approval-mode picker as a bottom sheet directly from a hand-icon button in the message composer, so users can change approval behavior per-session without leaving the conversation. agiworkforce has an equivalent 3-option model (Ask every time / Low-risk actions / Approve all actions) but it only exists as a standalone screen under Settings > Action approvals; neither the Dispatch composer nor the Code Session composer expose an inline control to view or change it.

**Evidence**

apps/mobile/app/(app)/settings/auto-approve.tsx (full 3-option screen, global only); apps/mobile/app/(app)/dispatch/index.tsx DispatchInput (no approval-mode affordance in composer, lines 225-304); apps/mobile/src/features/code-sessions/index.tsx composer row (lines 400-433) has Code2 mode button and Plus/Send only, no approval icon

**Suggested fix**

Add a small shield/hand icon button to the Dispatch and Code Session composer bars that opens the existing 3-option approval sheet, defaulting to the current global setting but allowing a per-session override, mirroring Codex's inline hand-icon affordance.

**Reference screenshot(s)**

- `references-2/IMG_0627.PNG`

### GAP-020 — Library has no Documents axis — uploaded chat files are never re-findable

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-ia
- **Reference:** ChatGPT · iOS · Library

**Gap**

Reference Library segments All / Images / Documents and indexes every file the user ever attached to a chat, so it can be re-used without re-uploading. agiworkforce's Library filter type is `'all' | 'images' | 'artifacts'` and its sources are generated images plus artifacts only; a PDF or screenshot attached in a chat never appears anywhere afterwards.

**Evidence**

apps/mobile/src/features/library/index.tsx (LibraryFilter, collectGeneratedImages, mergeMobileArtifactsForGallery); grep 'Documents' across apps/mobile — no match; grep 'uploadedFile|fileLibrary' — only ChatInput/ragChunker hits

**Suggested fix**

Add a `documents` filter backed by a per-account attachment index (persist chat attachment metadata: id, name, mime, size, sourceConversationId, remote/local URI). Render file-type cards with FileTypeIcon, tap to preview/re-attach, and expose 'Attach from Library' in AddToChatSheet so a stored file can be reused without re-upload.

**Reference screenshot(s)**

- `chatgpt_reference/044-chatgpt-ios-library-upload-promo-upload-once-use-anytime.png`

### GAP-021 — Library has no search — grid is unusable past a few dozen items

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Library grid

**Gap**

Reference pins a floating 'Search library' pill above the tab bar so a populated grid stays navigable. agiworkforce renders an unbounded FlatList with no query input, so once a user has generated many images/artifacts the only way to find one is scrolling.

**Evidence**

grep 'Search library|searchQuery' in apps/mobile/src/features/library/ — no match; grep -i 'search library' across apps/mobile src+app — no match

**Suggested fix**

Add a floating search pill (same placement as the reference) filtering on prompt text, artifact title, file name and kind; debounce locally over the already-materialised `items` array so no API work is needed.

**Reference screenshot(s)**

- `chatgpt_reference/045-chatgpt-ios-library-grid-thumbnails-uploaded-screenshots-gallery.png`

### GAP-022 — Manual pairing needs full agiw:CODE:TOKEN payload but desktop only shows a 12-char code

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-interaction
- **Reference:** Codex · iOS · Pair manually dialog

**Gap**

The reference manual path accepts the short human-readable pairing code printed on the computer. In agiworkforce the mobile manual-entry field is placeholdered 'agiw:CODE:TOKEN', maxLength 96, and rejects anything else with 'Invalid pairing format. Scan the QR code or paste the full pairing payload.' — but the desktop card renders only the 12-character code (grouped 4-4-4). A user whose camera is unavailable therefore has no way to complete pairing.

**Evidence**

apps/mobile/src/features/companion/components/QRScanner.tsx lines 66-78 and 142-170; apps/desktop/src/features/mobile-companion/QRPairingCard.tsx lines 101-116

**Suggested fix**

Accept the bare 12-char code (space/dash tolerant) in isValidPairingCode and have the mobile client exchange it for the session token via the signaling service; keep the full payload accepted as a superset. Update the placeholder to the code format actually shown on desktop.

**Reference screenshot(s)**

- `chatgpt_reference/030-codex-ios-remote-setup-manual-pairing-code-modal-keyboard.png`

### GAP-023 — Parental controls is a solo age-gate status page, not real parent-teen account linking

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-screen
- **Reference:** ChatGPT · web · Parental controls

**Gap**

Reference shows a full family-safety system: parents and teens link accounts, and parents get tools to adjust features, set limits, and add safeguards ('Add family member' flow). agiworkforce's mobile Parental Controls screen only displays whether minor-safe mode is active on this device and links to the age-gate re-check — there is no second account, no invite/link flow, and no parent-side controls over a teen's account.

**Evidence**

apps/mobile/src/features/settings/parental-controls/index.tsx — only renders SettingsInfo(minor-mode status) + a 'Review Age Settings' row; searched 'family member', 'link account', 'parent' additionally with no family-linking matches

**Suggested fix**

Build an account-linking flow (invite by email/QR), a parent dashboard for limits (usage time, content restrictions, model access), and persist the relationship server-side; surface it from the same Settings > Parental Controls entry point on mobile and web.

**Reference screenshot(s)**

- `chatgpt_reference/143-chatgpt-web-settings-parental-controls-add-family-member-link-accounts.png`

### GAP-024 — apps/mobile has no plugins/skills marketplace screen

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-screen
- **Reference:** ChatGPT · iOS · Plugins marketplace

**Gap**

Reference gives mobile a full catalog: search field, horizontally scrolling 'Installed' icon row, 'Featured >' and category ('Productivity >') sections, each row offering '+' to add or '…' to manage. agiworkforce ships /marketplace, /plugins and /skills on web and Plugins/Skills settings tabs on desktop, but mobile has nothing — the settings entries were explicitly deleted because the screens were never built.

**Evidence**

apps/mobile/src/features/settings/index.tsx lines 489-492 ('MOB-6: Skills and Plugins settings entries removed — the screens were never built'); grep -i 'plugin' across apps/mobile src+app returns only that comment; find -ipath '_market_' in apps/mobile — no match; web has apps/web/app/plugins/page.tsx and apps/web/app/marketplace/page.tsx

**Suggested fix**

Build /(app)/plugins backed by the same catalog API the web /plugins page uses: search, Installed row, Featured and per-category sections, add/remove per row, plus a gear entry into the plugin permission settings so the surface is manageable, not just browsable.

**Reference screenshot(s)**

- `chatgpt_reference/050-chatgpt-ios-plugins-marketplace-list-installed-featured-productivity.png`

### GAP-025 — Code-session transcript has no structured git diffstat / files-changed summary card

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** Claude/Codex · iOS · Remote session structured diffstat card (files changed count, +/- lines, expandable file list) inside chat transcript

**Gap**

Claude Code Remote renders a collapsible '30 files changed +53 -52' card with a short list of changed file paths, per-file +/- counts, and a 'View 27 more files' expander directly inline in the agent's response. agiworkforce's code-session transcript (TranscriptBlock in code-sessions/index.tsx) only renders plain text lines and a special-cased 'Bash <cmd>' block — there is no diffstat/file-list rendering at all, and the Agent Detail screen's Run Artifacts list shows file names but not diff line counts or an expandable full-file list.

**Evidence**

apps/mobile/src/features/code-sessions/index.tsx:485-513 (TranscriptBlock only handles plain text and 'Bash ' prefixed lines); apps/mobile/app/(app)/companion/agent/[id].tsx:312-345 (Run Artifacts shows label/detail/timestamp only, no diff stats); grep for 'diffLines/DiffView/hunk' in apps/mobile/src returned no relevant UI components

**Suggested fix**

Add a DiffSummaryCard component to the code-session transcript renderer: header row with total files/+/- counts, top 3 file rows with per-file +/-, and a 'View N more files' expandable disclosure that pushes to a full file list/diff viewer route.

**Reference screenshot(s)**

- `references-2/IMG_0622.PNG`

### GAP-026 — Pairing intro never tells the user both devices must be the same account/mode

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-copy
- **Reference:** Codex · iOS · Remote setup intro

**Gap**

The reference spells out the precondition and prints the signed-in email inline: 'Sign into the Codex desktop app with your ChatGPT account (user@example.com)'. agiworkforce's steps are 'Open AGI Workforce on your desktop / Go to Settings and select "Mobile Companion" / Scan the QR code displayed on screen' — no account-match requirement, no email echo, and no mention of the Local vs Cloud mode boundary, which is the most likely reason a pairing attempt silently fails in this product.

**Evidence**

apps/mobile/src/features/companion/components/ConnectionStateViews.tsx lines 36-75; apps/mobile/src/features/companion/components/CompanionDemoWalkthrough.tsx DEMO_STEPS[0]

**Suggested fix**

Add an account/mode line to DisconnectedView that renders the Clerk primary email (or 'Local mode — sign in to pair') and a short 'both devices must be signed into the same AGI account' explainer above the step list.

**Reference screenshot(s)**

- `chatgpt_reference/027-codex-ios-remote-setup-intro-signin-instructions.png`

### GAP-027 — No remote project/folder browser for the paired desktop on mobile

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-screen
- **Reference:** Codex · iOS · Remote — projects on the paired computer

**Gap**

Once paired, the reference shows the desktop hostname with a live dot and lists the machine's project folders; each row drills into subfolders and has an inline compose action that starts a chat scoped to that folder, with a Search Chats field and Chat FAB pinned at the bottom. agiworkforce's companion screen only shows running agents, approvals and connection banners — there is no way to see or select what is on the paired machine, so the phone cannot initiate work against a specific project.

**Evidence**

apps/mobile/app/(app)/companion/index.tsx (renders QRScanner, PairingStatus, AgentDashboard, DesktopInfoCard, StatusBanners only); apps/mobile/src/features/companion/components/\* has no folder/workspace/repo references; apps/mobile/src/features/code-sessions/index.tsx is a cloud repo/branch session list, not the paired machine

**Suggested fix**

Add a remote-workspace list view under app/(app)/companion backed by a control-channel 'listProjects' request (allowed directories only, reusing the desktop AllowedDirectoriesSettings boundary), with per-row drill-in and a compose action that opens a chat pinned to that path.

**Reference screenshot(s)**

- `chatgpt_reference/038-codex-ios-remote-project-list-projects-sidebar-macbook.png`

### GAP-028 — Scheduled tasks has no suggested-task gallery to teach what to automate

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-state
- **Reference:** ChatGPT · iOS · Scheduled tasks

**Gap**

Reference fills the Scheduled screen with dashed suggestion cards (emoji + title + one-line description + '+' to add): Daily brief, Email monitor, Weekend long read, Sale monitor, Concert alerts. agiworkforce's only suggestions are four recurrence phrases inside the QuickSchedule modal ('Every day at 9am'), which describe timing but never a task, so the empty state gives the user no idea what a scheduled task is good for.

**Evidence**

apps/mobile/src/features/schedules/components/QuickSchedule.tsx line 184 SUGGESTIONS = recurrence strings only; apps/mobile/app/(app)/schedules/index.tsx EmptyState is a single generic CTA

**Suggested fix**

Add a SCHEDULE_TEMPLATES list (emoji, title, description, prompt, default recurrence) rendered as dashed cards above/instead of the empty state; '+' opens the create form pre-filled so the user only confirms time and model.

**Reference screenshot(s)**

- `chatgpt_reference/048-chatgpt-ios-scheduled-tasks-suggestions-daily-brief-email-monitor.png`

### GAP-029 — Scheduled tasks cannot carry attachments (Camera / Photos / Files)

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Scheduled tasks attachment picker

**Gap**

Reference's scheduled-task composer '+' opens Camera / Photos / Files / Plugins, so a recurring task can operate on a supplied document or image. agiworkforce's ScheduleForm collects only Schedule Name, Prompt, Model, Recurrence and Timezone; a task like 'every Monday, re-check this contract' is impossible to express.

**Evidence**

apps/mobile/src/features/schedules/components/ScheduleForm.tsx (fields at lines 188-275); grep -i 'attach|plugin|connector' across apps/mobile/src/features/schedules — no match; the picker exists only at apps/mobile/src/features/chat/components/AddToChatSheet.tsx (onCamera/onPhotos/onFile)

**Suggested fix**

Extend the schedule create payload with an attachments array, reuse AddToChatSheet's camera/photos/file handlers in the schedule composer, and show attached files as chips in ScheduleCard so the user can see what a task operates on.

**Reference screenshot(s)**

- `chatgpt_reference/049-chatgpt-ios-scheduled-tasks-attachment-picker-camera-photos-files-plugins.png`

### GAP-030 — Mobile Capabilities screen is nav-only; no inline capability toggles

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-ia
- **Reference:** Claude · iOS · Settings > Capabilities

**Gap**

Claude's iOS Capabilities screen lets users flip Artifacts, Code execution/file creation, Web search, and 'Switch models when a message is flagged' directly with inline switches and explainer copy. agiworkforce's Capabilities screen (apps/mobile/src/features/settings/capabilities/index.tsx) only shows read-only status badges (Local/Cloud/Available/Ask) that navigate to other screens — there is no in-place on/off control for these capabilities.

**Evidence**

apps/mobile/src/features/settings/capabilities/index.tsx (CapabilityRow renders a badge + chevron, not a Switch)

**Suggested fix**

Add inline Switch controls (mirroring components/ui/switch.tsx already used elsewhere) for capabilities that have a real corresponding backend flag, keeping navigation rows only for capabilities that require a sub-screen.

**Reference screenshot(s)**

- `claude_reference/127-claude-ios-settings-capabilities-artifacts-code-exec-web-search-toggles.png`

### GAP-031 — No 'Search and reference chats' or 'Generate memory from chat history' toggles

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** Claude · iOS · Settings > Capabilities (Search/Memory/Tool access)

**Gap**

Claude iOS exposes two distinct memory-related toggles: one lets Claude search past chats for relevant details, another controls whether memory is generated from chat history at all (with a linked 'Memory from past chats' preview). agiworkforce mobile has a Memory settings screen but no equivalent named toggles were found.

**Evidence**

searched 'search past chat'/'reference chat' and 'generate memory'/'memory from chat' across apps/mobile, apps/web, apps/desktop — no matches for either concept

**Suggested fix**

Add both toggles to apps/mobile/app/(app)/settings/memory.tsx (and desktop Memory tab) with the same semantics: one gates historical-chat search, the other gates memory generation from chat history.

**Reference screenshot(s)**

- `claude_reference/128-claude-ios-settings-capabilities-memory-and-tool-access-radio.png`

### GAP-032 — No model-training consent toggle despite policy copy promising explicit consent

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Settings > Data controls

**Gap**

Reference leads Data controls with 'Improve model for everyone' plus explainer and Learn more, giving the user a first-class switch. agiworkforce's Cloud Privacy screen asserts 'Your AGI Cloud conversations are never used to train AI models without explicit consent' but ships no control that grants or revokes that consent — the promise has no UI behind it, so a user who wants to opt in (or verify they are opted out) has nowhere to look.

**Evidence**

apps/mobile/src/features/settings/cloud-privacy/index.tsx PRIVACY_ITEMS (static informational cards, no switches); apps/mobile/src/features/settings/data-controls/index.tsx (export, storage link, manual sync only)

**Suggested fix**

Add a persisted, server-backed 'Improve models for everyone' SettingsSwitchRow at the top of Data Controls with the training explainer and a Learn more link, defaulting to off, and show its state on the Cloud Privacy card instead of prose alone.

**Reference screenshot(s)**

- `chatgpt_reference/055-chatgpt-ios-settings-data-controls-model-training-location-services.png`

### GAP-033 — No cloud account data export on mobile — only a device-local export

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Settings > Data controls (export/delete)

**Gap**

Reference pairs 'Export data' with 'Delete account' in one group, so a user can retrieve their data before deleting it. agiworkforce mobile can export only what is stored on the device (chats, memory, settings, installed models) and offers account deletion that wipes cloud chats, projects, memory and artifacts within 24 hours — with no way to export those cloud-side records first.

**Evidence**

apps/mobile/src/features/settings/data-controls/index.tsx ('Export Local Data', body 'Export runs on this device'); apps/mobile/src/features/settings/cloud-account/index.tsx handleDeleteAccount (DELETE /api/user/delete-account); web has features/settings/components/Settings/ExportData.tsx

**Suggested fix**

Add a cloud 'Export data' action that requests a server-side archive and delivers it by email/download link, place it immediately above Delete Account, and reference it in the deletion confirmation copy ('Export your data first?').

**Reference screenshot(s)**

- `chatgpt_reference/056-chatgpt-ios-settings-data-controls-export-delete-account.png`

### GAP-034 — No App language selector on mobile — the app has no localisation layer at all

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Settings > General

**Gap**

The reference's first General row is 'App language: English' with a drill-in list. agiworkforce mobile ships no language row and no i18n runtime: every string is a hardcoded English literal, unlike desktop which has src/i18n and a Language setting.

**Evidence**

apps/mobile/src/features/settings/general/index.tsx (no language row); grep 'app language|appLanguage|i18n' across apps/mobile/src|app — only expo-localization used for voice locale; compare apps/desktop/src/i18n and features/settings/GeneralSettings.tsx ('Language')

**Suggested fix**

Introduce an i18n provider on mobile (reuse the desktop locale catalogue), add an 'App language' SettingsRow in General with a searchable locale list plus a 'Match device' default, and persist it in the local/cloud settings stores.

**Reference screenshot(s)**

- `chatgpt_reference/066-chatgpt-ios-settings-general-app-language-toggles.png`

### GAP-035 — Notification categories are on/off only — no per-category channel choice or detail screen

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Settings > Notifications

**Gap**

The reference lists each category as a drill-in row whose value summarises the enabled channels ('Push', 'Email', 'Push and Email'), so a user can keep e.g. Usage on email but off push. agiworkforce offers a single boolean switch per category and has no email channel anywhere in the product.

**Evidence**

apps/mobile/src/features/settings/notifications/index.tsx:394-421 (Switch per category); apps/web/features/settings/sections/NotificationsSection.tsx (email/push groups were removed because no send path exists)

**Suggested fix**

Model each category as {push, email} and render SettingsRows whose value is the channel summary, pushing a per-category detail screen with two switches; ship the email sender before exposing the email channel, or label it 'Coming soon' rather than a no-op toggle.

**Reference screenshot(s)**

- `chatgpt_reference/065-chatgpt-ios-settings-notifications-codex-chats-projects-usage.png`

### GAP-036 — Notification categories cover agent ops only, not responses/projects/usage

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-ia
- **Reference:** ChatGPT · iOS · Settings > Notifications

**Gap**

The reference's categories are product-level: Codex, Group chats, Marketing, Personalized tips, Projects, Responses, Tasks, Usage. agiworkforce only offers Approvals, Task Updates, Errors & Stops and Status Updates, so there is no way to control a 'your reply is ready' ping, a project or schedule notification, or a plan-usage warning — and no consent surface for marketing/product email, which most jurisdictions require to be separately opt-in.

**Evidence**

apps/mobile/src/features/settings/notifications/index.tsx:57-88 (getCategories: approvals, task_updates, errors, status)

**Suggested fix**

Extend NotificationCategory with responses, projects, schedules/tasks, usage-limits and marketing/tips, group them under 'Product' vs 'Agent activity' headings, and default marketing to off with explicit consent copy.

**Reference screenshot(s)**

- `chatgpt_reference/065-chatgpt-ios-settings-notifications-codex-chats-projects-usage.png`

### GAP-037 — Parental controls cannot link a family member or set any limits

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-screen
- **Reference:** ChatGPT · iOS · Settings > Parental controls

**Gap**

Reference explains that parents and teens link accounts, then offers a Family Members group with 'Add family member >' that starts the linking invite. agiworkforce's Parental Controls is a static status card ('Minor-safe mode is active' / 'Adult profile') plus a link back to the age gate — there is no family member list, no invite, and no parent-side control over features or limits, so the screen promises governance it cannot deliver.

**Evidence**

apps/mobile/src/features/settings/parental-controls/index.tsx (SettingsInfo + single 'Review Age Settings' row); grep -i 'family member|family plan|link account|guardian' across apps/mobile and apps/web — only age-gate prose at apps/mobile/app/(public)/age-gate.tsx line 136

**Suggested fix**

Add a Family Members group with an 'Add family member' invite flow (email/link invite, teen accepts, link recorded server-side) and a per-linked-account controls screen (content filter, quiet hours, feature limits); until linking ships, replace the section with explicit copy that only device-level age review is available so the screen does not imply parental governance.

**Reference screenshot(s)**

- `chatgpt_reference/063-chatgpt-ios-settings-parental-controls-add-family-member.png`

### GAP-038 — Permissions screen missing Calendar, Reminders, and Health access rows

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** Claude · iOS · Settings > Permissions

**Gap**

Claude iOS's unified Permissions screen lists Location, Calendar, Reminders, and Health with per-item OS-level status. agiworkforce's Permissions screen (apps/mobile/src/features/settings/permissions/registry.ts) only registers microphone, camera, location, photos, notifications, and contacts. Calendar access exists but lives in a separate Integrations screen (IA fragmentation); Reminders is not implemented at all; Health/fitness was explicitly removed per an in-code comment (STB-21).

**Evidence**

apps/mobile/src/features/integrations/store.ts:120-121 ('healthToStatus() and the Health/Google Fit entry were removed... backend route never existed'); apps/mobile/src/features/settings/permissions/types.ts (MobilePermissionKind has no calendar/reminders/health); apps/mobile/src/features/integrations/services/deviceIntegrations.ts (uses expo-calendar but not surfaced in Permissions)

**Suggested fix**

Add Calendar and Reminders as first-class entries in PERMISSION_REGISTRY/MobilePermissionKind so they render in the same consolidated Permissions list as Location/Camera/etc, and reconsider re-adding a Health permission row once a backend route exists (rather than leaving it silently removed).

**Reference screenshot(s)**

- `claude_reference/130-claude-ios-settings-permissions-location-calendar-reminders-health.png`

### GAP-039 — No per-connector/plugin detail screen with tool-level permissions on mobile

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-screen
- **Reference:** ChatGPT · iOS · Settings > Plugins

**Gap**

Reference lists every added plugin under 'Added', each row drilling into its own detail page where that plugin's access can be reviewed. agiworkforce mobile shows a flat connector directory where tapping a connected item immediately opens a 'Disconnect X?' Alert — there is no way to inspect what a connected service can do, revoke individual tools, or see when/why it was granted. Web already has this concept (ToolPermissionsPanel, /connectors/permissions).

**Evidence**

apps/mobile/src/features/settings/cloud-connectors/index.tsx handlePress (connected → Alert 'Disconnect'); no detail route under apps/mobile/app/(app)/connectors; apps/web/features/connectors/components/ToolPermissionsPanel.tsx and apps/web/app/connectors/permissions/page.tsx exist

**Suggested fix**

Add /(app)/connectors/[id] showing the connector's granted tools with per-tool toggles, connected-at, account label, and Disconnect as a destructive footer action; make the list row navigate there instead of firing a disconnect Alert.

**Reference screenshot(s)**

- `chatgpt_reference/051-chatgpt-ios-settings-plugins-permissions-list-added-allow-low-risk.png`

### GAP-040 — Mobile pairs only one desktop — no connections list, per-device toggle, Disconnect All

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** Codex · iOS · Settings > Remote control

**Gap**

Reference lists every paired machine under Connections with a per-connection enable toggle, live 'Connected' status, an 'Add connection' row and a 'Disconnect All' header action. agiworkforce's companion screen is built around a single live desktop session (one DesktopInfoCard with one Disconnect), so a user with a laptop and a workstation must re-pair every time they switch machines.

**Evidence**

apps/mobile/src/features/companion/components/DesktopInfoCard.tsx (single onDisconnect); apps/mobile/app/(app)/companion/index.tsx (single connection state machine); grep -i 'add connection|disconnect all|devices' across apps/mobile/src/features/companion — no match

**Suggested fix**

Persist paired desktops (id, name, platform, lastConnectedAt, enabled) and render them as a Connections group with per-row toggle + status dot, an 'Add connection' row launching the QR scanner, and a 'Disconnect All' header action.

**Reference screenshot(s)**

- `chatgpt_reference/058-codex-ios-settings-remote-control-desktop-connection-composer-faceid.png`

### GAP-041 — No user-controllable 'Reduce sensitive content' safety toggle

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Settings > Safety

**Gap**

Reference gives every user a Safety screen with an opt-in 'Reduce sensitive content' toggle plus explainer and Learn more. agiworkforce only has minor-safe mode, which is derived automatically from the age gate and cannot be enabled by an adult who wants stricter output (or by a parent setting up a shared device).

**Evidence**

apps/mobile/src/features/settings/parental-controls/index.tsx (read-only status from isMinorMode()); apps/mobile/app/(public)/age-gate.tsx line 17 comment 'No parental-consent flow in v1 — minor-safe mode is a content filter only'; grep -i 'sensitive content|content filter' across apps/mobile — no user-facing toggle

**Suggested fix**

Add /(app)/settings/safety with a persisted 'Reduce sensitive content' switch that ORs into the same filter path minor-safe mode uses, with copy stating what it changes; keep it forced-on and disabled while minor mode is active, explaining why.

**Reference screenshot(s)**

- `chatgpt_reference/061-chatgpt-ios-settings-safety-reduce-sensitive-content-toggle.png`

### GAP-042 — No account security screen on mobile: passkeys, MFA methods, active sessions, lockdown

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-screen
- **Reference:** ChatGPT · iOS · Settings > Security and login

**Gap**

Reference groups Log in (Security keys & passkeys, count 1), MFA (Authenticator app Off, Text messages On), Sessions (Active sessions 2, with copy about removing trusted devices and Log out all), Advanced security (Lockdown mode) and the device-level Face ID toggle, each with an explainer. agiworkforce mobile's Safety & Security has only App Lock and OS Permissions — nothing about the cloud account. A user whose account is compromised cannot enrol MFA or terminate other sessions from the phone.

**Evidence**

apps/mobile/src/features/settings/safety-security/index.tsx (App Lock + Permissions only); grep -i 'passkey|mfa|authenticator|active session|lockdown' across apps/mobile src+app — no match; web equivalent exists at apps/web/features/settings/sections/SecuritySection.tsx (2FA toggle, session timeout, change password, AuditLogPanel)

**Suggested fix**

Add /(app)/settings/security backed by the same Clerk endpoints the web panel uses: passkey list with add/remove, MFA methods with per-method status as SettingsRow `value`, an Active sessions list showing device/location/last-seen with revoke and 'Log out all', and each group's explainer copy.

**Reference screenshot(s)**

- `chatgpt_reference/059-chatgpt-ios-settings-security-login-keys-mfa-sessions-lockdown-codex.png`

### GAP-043 — No account storage quota view (used/total bar, Documents & Images breakdown)

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-screen
- **Reference:** ChatGPT · iOS · Settings > Storage

**Gap**

Reference Storage shows '161 MB of 100 GB used' with a quota progress bar and per-type rows (Documents 141 MB >, Images 19 MB >) that drill into managing those files. agiworkforce's Storage screen measures only on-device bytes — downloaded models and cache — so a cloud user cannot see how much of their plan's file storage they have consumed or delete the largest offenders.

**Evidence**

apps/mobile/app/(app)/settings/storage.tsx (Storage Usage card = downloaded models + cache; Downloaded Models list; wipe/export actions); grep -i 'quota|GB used|file storage' across apps/mobile/src — no match; apps/mobile/src/features/settings/cloud-usage/index.tsx reports usage but no storage bytes

**Suggested fix**

Add a cloud storage section fed by an account-usage endpoint: used/total with a progress bar, Documents and Images rows with byte totals, each pushing a file list sorted by size with swipe-to-delete; keep the existing device-storage card below it, clearly labelled 'On this device'.

**Reference screenshot(s)**

- `chatgpt_reference/054-chatgpt-ios-settings-storage-documents-images-usage.png`

### GAP-044 — No trusted contact / crisis-support surface on any surface

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-screen
- **Reference:** ChatGPT · iOS · Settings > Trusted contact

**Gap**

Reference ships a Trusted contact screen: why a trusted contact helps, an explicit statement that a serious safety concern may automatically notify that contact, the 18+ requirement, Learn more, and a 'Get started' CTA into enrolment. agiworkforce has no equivalent — no trusted contact, no crisis resources, no self-harm escalation copy — anywhere in mobile, web or desktop.

**Evidence**

grep -i 'trusted contact|crisis|emergency contact|helpline|self-harm' across apps/mobile/src, apps/mobile/app, apps/web/app, apps/web/features and apps/desktop/src — zero matches

**Suggested fix**

Add /(app)/settings/trusted-contact with the consent-first explainer, a Get started enrolment flow (contact identity, 18+ attestation, contact's own opt-in), and a visible crisis-resources fallback; gate any automatic notification behind explicit, revocable consent and record the consent event.

**Reference screenshot(s)**

- `chatgpt_reference/062-chatgpt-ios-settings-trusted-contact-crisis-support-get-started.png`

### GAP-045 — Voice settings has no 'Background conversations' toggle or its consent copy

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Settings > Voice

**Gap**

The reference exposes a 'Background conversations' switch with explainer copy ('Keep the conversation going in other apps or while your screen is off') and a Learn more link. agiworkforce's Voice screen has Voice Input, Auto-listen, provider, presets and speed/pitch, but nothing governs whether a voice session may continue in the background — and no copy tells the user what happens to the mic when they leave the app.

**Evidence**

apps/mobile/src/features/settings/voice/index.tsx (no background option); grep for 'background conversation|backgroundAudio|background mode' across apps/mobile — no match

**Suggested fix**

Add a 'Background conversations' SettingsSwitchRow to the Voice screen backed by a persisted preference plus the iOS audio background mode, with a SettingsInfo/footnote explaining mic behaviour when the app is backgrounded and a Learn more link to the voice privacy doc.

**Reference screenshot(s)**

- `chatgpt_reference/064-chatgpt-ios-settings-voice-spruce-model-intelligence-language.png`

### GAP-046 — Shared links and Integrations settings screens are built but unreachable from any nav

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-ia
- **Reference:** Claude · iOS · Settings root — Account group

**Gap**

The reference lists 'Shared links' as an Account-group row. agiworkforce ships apps/mobile/app/(app)/settings/shared-links.tsx (275 lines, a real screen listing published read-only conversations) and settings/integrations.tsx (493 lines), but neither is linked from the settings index, the drawer, or any other screen — shared-links has zero inbound references and integrations only appears as a hidden Drawer.Screen registration.

**Evidence**

apps/mobile/app/(app)/settings/shared-links.tsx; apps/mobile/src/features/settings/index.tsx (sections array has no shared-links or integrations row); apps/mobile/app/(app)/\_layout.tsx:102 registers settings/integrations as HIDDEN; grep 'settings/shared-links' and 'settings/integrations' across apps/mobile returns no navigation call sites

**Suggested fix**

Add a 'Shared links' row to the Account section and an 'Integrations' row to the Cloud section of apps/mobile/src/features/settings/index.tsx, or delete the screens per the repo's 'implement or remove dead-ends' rule.

**Reference screenshot(s)**

- `chatgpt_reference/025-other-ios-settings-legal-links-claude-app-version-popover.png`

### GAP-047 — No Plugins/marketplace destination anywhere on mobile

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-ia
- **Reference:** ChatGPT · iOS · Sidebar drawer

**Gap**

The reference's sidebar lists Plugins as a top-level destination alongside Library/Projects/Scheduled. agiworkforce mobile has no plugins surface at all: the drawer's primary items stop at Schedules, and the Plugins settings row was deliberately deleted as a dead end — while web (/plugins, /marketplace) and desktop (settings/tabs/Plugins, features/marketplace) both ship one.

**Evidence**

apps/mobile/src/features/drawer/components/DrawerContent.tsx:57-88 (PRIMARY_ITEMS: projects, artifacts, library, tasks, schedules); apps/mobile/src/features/settings/index.tsx:491-494 (Skills and Plugins entries removed)

**Suggested fix**

Build a mobile Plugins screen over the existing plugin catalogue API (installed + featured lists, per-plugin detail with permissions) and add it to PRIMARY_ITEMS with the same cloud gating as Tasks/Schedules.

**Reference screenshot(s)**

- `chatgpt_reference/077-chatgpt-ios-sidebar-nav-recents-chat-history-fab.png`

### GAP-048 — Connectors never generate suggested tasks — work mode opens with a blank canvas

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** mobile · missing-control
- **Reference:** ChatGPT · iOS · Work mode empty state

**Gap**

The reference's work surface opens with connector-derived task suggestions, each tagged with its source icon (GitHub), so a connected repo immediately produces actionable starting points. agiworkforce connects GitHub (server-owned App installation) and 80+ services but no surface anywhere turns connector state into suggestions; the work/agiwork empty state shows nothing.

**Evidence**

apps/mobile/src/features/settings/cloud-connectors/index.tsx:257-258, 790-796 (GitHub install flow exists); grep 'suggested task|suggestedTasks|taskSuggestion' across apps/mobile/src|app — no match

**Suggested fix**

Add a suggestions endpoint that derives 3-5 candidate tasks from the user's connected sources (open PRs/issues assigned to them, recent branches) and render them as source-badged rows on the work-mode empty state, each seeding the composer with a scoped prompt.

**Reference screenshot(s)**

- `chatgpt_reference/076-chatgpt-ios-work-mode-task-list-github-suggested-tasks.png`

### GAP-049 — No post-pairing success state with follow-on setup toggles

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-state
- **Reference:** Codex · macOS desktop · 'You're connected' post-pairing modal

**Gap**

After a device pairs, the reference shows a success modal (checkmark hero, 'You're connected', 'You can change these later in Settings') with three immediately actionable toggles — Keep this Mac awake, Use your Mac apps while locked (+ Learn more), Set up Chrome extension — and a Done button. agiworkforce's desktop pairing card exposes only status text and a Disconnect button, so the moment of highest intent teaches nothing and configures nothing.

**Evidence**

apps/desktop/src/features/mobile-companion/MobileCompanionPanel.tsx (connected branch renders a status strip + Disconnect only); apps/desktop/src/features/mobile-companion/QRPairingCard.tsx

**Suggested fix**

On transition to peerConnected, present a one-time success dialog with the follow-on toggles that actually apply to agiworkforce (prevent sleep during remote sessions, allow remote approvals while locked, install the Chrome extension) plus a Done action, persisted so it shows once per device.

**Reference screenshot(s)**

- `chatgpt_reference/052-codex-macos-settings-connections-search-remote-control-connected-modal.png`

### GAP-050 — Fully built terminal workspace is unreachable — no bottom dock in the shell

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-screen
- **Reference:** Codex · macOS desktop · Bottom terminal dock

**Gap**

The reference docks a real shell under the chat: tab per session named after the workspace, close per tab, '+' to open another, panel close on the right, and a prompt already cd'd into the project. agiworkforce implements exactly this (xterm with fit/search/webgl addons, multi-session store, shell selection, AI assist) in features/terminal, but DesktopShellV3 never mounts it and there is no bottom-panel region at all, so users cannot open a terminal.

**Evidence**

apps/desktop/src/features/terminal/TerminalWorkspace.tsx:32 (tabs, createSession/closeSession) and features/terminal/Terminal.tsx (xterm); grep 'TerminalWorkspace' across apps/desktop/src returns only its own definition

**Suggested fix**

Add a resizable bottom dock to DesktopShellV3 hosting TerminalWorkspace, opened from the tool launcher and a shortcut, with the session cwd defaulting to the scoped folder and the dock state persisted per workspace.

**Reference screenshot(s)**

- `chatgpt_reference/081-codex-macos-terminal-panel-shell-prompt.png`

### GAP-051 — Desktop empty chat has no quick-action cards to start a task

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Chat empty state

**Gap**

The reference offers four capability cards (Explore and understand code / Build a new feature, app, or tool / Review code and suggest changes / Fix issues and failures) that both teach the agent's competencies and seed the first prompt. agiworkforce's desktop empty state renders only a rotating time-of-day greeting and subline, so a new user gets no entry point.

**Evidence**

apps/desktop/src/features/v3/EmptyChat.tsx (renders BrandedGreeting only); apps/desktop/src/features/chat/BrandedGreeting.tsx

**Suggested fix**

Add a four-card grid under the greeting in EmptyChat that prefills the composer with a scoped prompt per card, tailored to the active mode (code-oriented cards in Local with a folder selected, general cards otherwise).

**Reference screenshot(s)**

- `chatgpt_reference/079-codex-macos-chat-empty-state-agiworkforce-quick-actions.png`

### GAP-052 — Missing transcript text-size/width controls and local-session safety toggles for AGI Code

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · macOS desktop · Claude Code settings > Appearance + Local sessions

**Gap**

Reference exposes interface font choice, transcript text size (Small/Medium/Large), transcript width (Narrow/Medium/Wide), and three local-session toggles: allow bypass permissions mode (with security-risk warning + link), enable remote control by default, and dynamic (parallel-agent) workflows. None of these exist in agiworkforce's AgiCode tab.

**Evidence**

apps/desktop/src/features/settings/tabs/AgiCode/index.tsx only imports InstructionFilesSettings; grep for 'bypass permissions mode', 'remote control by default', 'dynamic workflows' returned no matches under apps/desktop

**Suggested fix**

Build an AgiCode Appearance section (font/transcript size/width) and a Local sessions section (bypass-permissions toggle with warning copy + best-practices link, remote-control-by-default toggle, dynamic-workflows toggle).

**Reference screenshot(s)**

- `claude_reference/149-claude-desktop-settings-claude-code-appearance-transcript.png`

### GAP-053 — No per-device authorization-token management for AGI Code sessions

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-screen
- **Reference:** Claude · macOS desktop · Claude Code settings > Authorization tokens

**Gap**

Reference lists every device/app authorized to sign in to Claude Code with its scopes (file_upload, inference, mcp_servers, profile, sessions) and a way to revoke a token to sign that device out, plus a 'delete sessions stored by Anthropic' action and sharing-settings management. agiworkforce exposes none of this for its coding agent.

**Evidence**

searched 'authorization token', 'revoke token', 'Delete sessions stored' across apps/ — no relevant UI matches (only unrelated web billing/auth code)

**Suggested fix**

Add an Authorization tokens list (device, scopes, connected-time, revoke action) plus a 'delete cloud-stored sessions' and sharing-settings control to AgiCode settings, backed by a per-device token API.

**Reference screenshot(s)**

- `claude_reference/152-claude-desktop-settings-claude-code-auth-tokens.png`

### GAP-054 — No code-diff theme picker (light/dark) or code font setting for AGI Code

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-screen
- **Reference:** Claude · macOS desktop · Claude Code settings > General + Code appearance

**Gap**

Reference lets users pick separate light/dark syntax themes for the coding agent's diff view with a live before/after code preview, plus a custom monospace code font field. agiworkforce's AgiCode settings tab only renders InstructionFilesSettings — there is no theme or font control at all.

**Evidence**

apps/desktop/src/features/settings/tabs/AgiCode/index.tsx (only LazyInstructionFilesSettings); grepped 'code theme', 'Claude Light', 'JetBrains Mono' equivalents — no match in apps/desktop/src/features/settings

**Suggested fix**

Add a CodeAppearanceSettings panel to the AgiCode tab with light/dark diff-theme selects and a code-font input, rendering a live diff preview like the reference.

**Reference screenshot(s)**

- `claude_reference/148-claude-desktop-settings-claude-code-general-code-theme.png`

### GAP-055 — No git worktree-location setting or in-app browser-tools controls for AGI Code

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · macOS desktop · Claude Code settings > worktree location + Browser tools

**Gap**

Reference lets users choose where git worktrees for isolated coding sessions are stored, and configure whether the agent can start dev servers / browse in an in-app browser, whether shared links open in that browser panel, cookie/session persistence mode (Don't keep/Shared/Separate), and a manage-allowed-sites list. agiworkforce has none of this for its coding agent.

**Evidence**

grep -i 'worktree' under apps/desktop/src/features/settings — no match (only unrelated hits in extension-vscode); grep -i 'browser tools|browser panel' finds only apps/desktop MCP tooling files, unrelated to AgiCode

**Suggested fix**

Add a Worktree-location select and a Browser section (enable browser tools, open-links-in-panel toggle, session-persistence mode select, allowed-sites manager) to the AgiCode settings tab.

**Reference screenshot(s)**

- `claude_reference/150-claude-desktop-settings-claude-code-worktree-browser-tools.png`

### GAP-056 — Agent access policy is invisible at send time — 'Full access' is only in Settings

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Composer access-mode indicator

**Gap**

The reference prints the active permission mode in the composer in warning orange ('⚠ Full access') next to the attach button, so a dangerous mode is impossible to forget. agiworkforce's equivalent setting (Read-only / Workspace write / Danger full access) exists only in Settings > Agent Execution and is never rendered or switchable in the chat surface.

**Evidence**

apps/desktop/src/features/settings/AgentExecutionSettings.tsx:304-319 ('Access policy' Select, the sole reference to danger-full-access in the app); grep 'accessPolicy|Full access' across apps/desktop/src returns only that file

**Suggested fix**

Surface the terminal-sandbox access policy as a composer chip with severity colouring and a click-through menu to change it, and show a confirm dialog when switching into danger-full-access from the chat surface.

**Reference screenshot(s)**

- `chatgpt_reference/079-codex-macos-chat-empty-state-agiworkforce-quick-actions.png`

### GAP-057 — Composer shows no workspace / environment / git-branch context chips

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-ia
- **Reference:** Codex · macOS desktop · Composer context bar

**Gap**

The reference pins a context bar to the composer showing the active workspace folder, the execution environment ('Local'), and the current git branch, so the user always knows what the agent will touch before sending. agiworkforce has all three facts (projectStore current folder, privacyMode local/managed, git status branch) but surfaces none of them at the composer; the StatusBar shows only provider/model/tokens/online.

**Evidence**

apps/desktop/src/hooks/useFolderSelection.ts (current folder + mode-aware scoping); apps/desktop/src/features/git/GitStatusPanel.tsx:421-422 (status.branch, panel unmounted); apps/desktop/src/features/layout/StatusBar.tsx:20-41 (no folder/branch props)

**Suggested fix**

Render a chip row above the composer with folder name (click to re-scope via useFolderSelection), environment badge (Local/Cloud, click to switch), and branch from the git status poller when the folder is a repo.

**Reference screenshot(s)**

- `chatgpt_reference/079-codex-macos-chat-empty-state-agiworkforce-quick-actions.png`

### GAP-058 — No persistent 'Skip all approvals is on' risk banner when auto-approve is active

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-state
- **Reference:** Claude · macOS desktop · Cowork agent task view

**Gap**

Claude shows a standing amber banner above the composer whenever the session has approvals disabled: 'Skip all approvals is on. Claude never pauses, even for unsafe actions. This includes using your connectors and apps on your computer. You can turn off individual connectors in the + menu. See safe use tips.' with a dismiss (X). AGIW has an equivalent underlying setting (AgentsSettings 'Auto-approve safe actions', AgentExecutionSettings 'Auto-approve') but no in-transcript persistent warning surfaces when that mode is engaged, and no inline composer dropdown to change the approval mode without leaving the conversation.

**Evidence**

grep -ri 'Skip all approvals', 'never pauses', 'safe use tips' across apps/desktop/src and apps/web — no matches. features/settings/AgentsSettings.tsx and AgentExecutionSettings.tsx expose the toggle only inside Settings, not as a composer-adjacent control.

**Suggested fix**

Add a dismissible risk banner component shown above the composer whenever the active conversation/session has auto-approve or full-access enabled, plus a small approval-mode dropdown (mirroring Claude's 'Skip'/'Ask' chip) next to the model picker so users can change it without opening Settings.

**Reference screenshot(s)**

- `claude_reference/098-claude-desktop-cowork-agent-task-view-tool-call-timeline.png`

### GAP-059 — Composer has no per-conversation permission-mode selector (Skip / Manual)

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · macOS desktop · Cowork home (new task composer)

**Gap**

Both reference desktop screens expose the agent's approval posture inline in the composer: '⚠ Skip ˅' on the home composer and '✋ Manual ˅' on the task composer, letting the user set how much autonomy the run gets before sending and see it at a glance during the run. agiworkforce only exposes auto-approval deep in settings (desktop AgentExecutionSettings / mobile /settings/auto-approve), so the user cannot see or change approval mode from the place where they launch work.

**Evidence**

searched 'permissionMode|Ask every time|Skip permissions|approvalMode' in apps/web/features/chat/components/Composer — no match; auto-approve exists only at apps/desktop/src/features/settings/AgentExecutionSettings.tsx, apps/desktop/src/stores/chat/toolStore.ts and apps/mobile/app/(app)/settings/auto-approve.tsx

**Suggested fix**

Add a permission-mode dropdown chip to the composer control row (left of the model picker) with Manual / Auto-approve safe tools / Skip all approvals, backed by the existing toolStore auto-approve state, scoped per conversation with a warning icon and hover copy for the non-default modes.

**Reference screenshot(s)**

- `references-2/claude-desktop-cowork-record-skill-05-processing-zero-steps.png`

### GAP-060 — Recorder has no mic / narration toggle with live input level during capture

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · macOS desktop · Cowork skill recording — active capture HUD

**Gap**

The reference HUD carries a mic button plus a live audio-level meter so the user can narrate intent while demonstrating ('now I open the report and filter by region'), which is what makes a silent click stream interpretable as a skill. agiworkforce's recorder captures only mouse and keyboard events; there is no audio capture, no mute state, and no level feedback anywhere in the recording flow.

**Evidence**

apps/desktop/src/features/automation/ActionRecorder.tsx (RecordedAction = actionType/target/value only; no audio); searched 'narrat' and 'mic|microphone' under apps/desktop/src/features/automation — no match; mic exists only for chat voice input (features/voice/\*, hooks/useVoiceTranscription.ts)

**Suggested fix**

Add an optional narration track: mic toggle + 24-bar level meter in the HUD, persisted as a per-recording audio clip with timestamps, transcribed on stop and merged into the step list as spoken annotations attached to the nearest action. Default the toggle off and label the off state 'Narration off' for consent clarity.

**Reference screenshot(s)**

- `references-2/claude-desktop-cowork-record-skill-04-active-capture-zero-steps.png`

### GAP-061 — Task rail lacks Progress/Outputs/Context grouping and any Outputs section

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-ia
- **Reference:** Claude · macOS desktop · Cowork task rail — Progress / Outputs / Context

**Gap**

The reference rail is three always-visible accordions — Progress (plan/steps), Outputs (files the task produced), Context (tools and referenced files) — so a user can answer 'what did this task make?' without leaving the chat. agiworkforce's chat rail is ExecutionSidecar with Timeline/Screen/Browser/Terminal/Approvals tabs: it is execution-observability oriented, has no deliverables section, and the only file surface (FilesPanel) is a Monaco diff viewer mounted in a separate ExecutionDashboard.

**Evidence**

apps/desktop/src/features/execution-sidecar/ExecutionSidecarHeader.tsx:14-20 (TABS list); apps/desktop/src/features/execution/FilesPanel.tsx used only by apps/desktop/src/features/execution/ExecutionDashboard.tsx:306; searched 'Outputs' across apps/desktop/src/features — no rail section

**Suggested fix**

Restructure the sidecar into three collapsible sections above the existing tabs: Progress (agenticLoopStatus steps), Outputs (artifacts + files written during the run, each with open/reveal/save-as), Context (tools invoked + files referenced). Persist expand state per conversation and keep Timeline/Screen/Terminal as detail views inside Progress.

**Reference screenshot(s)**

- `references-2/claude-desktop-cowork-record-skill-06-task-progress-outputs-context.png`

### GAP-062 — A finished recording is never attached to the conversation as a message artifact

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-ia
- **Reference:** Claude · macOS desktop · Cowork task — recording attached to the conversation

**Gap**

In the reference the capture becomes a first-class conversation attachment — the thread titles itself 'Recorded demonstration (9.9s)', the user message carries a 'Recorded demonstration · 9.9s' card, and the assistant reasons over it. agiworkforce's recorder is a terminal side panel: the action list exists only in local component state and is either turned into a skill via skillCreateFromRecording or thrown away on close, so a recording can never be discussed, re-sent, revisited or shared.

**Evidence**

apps/desktop/src/features/automation/ActionRecorder.tsx:202-230 (saveSkill is the only sink; state is cleared afterwards) and :91-103 (recordedActions held in component state); apps/desktop/src/features/v3/DesktopShellV3.tsx:452-456 (panel closes back to chat with no payload)

**Suggested fix**

On Done, persist the recording as an attachment entity and offer two paths from the review screen: 'Send to chat' (inserts a recording attachment card into the composer and auto-titles the conversation '<name> (Ns)') and the existing 'Create skill'. Render the card in the message list with icon, label, duration and a disclosure chevron.

**Reference screenshot(s)**

- `references-2/claude-desktop-cowork-record-skill-06-task-progress-outputs-context.png`

### GAP-063 — No promo/onboarding surface for cross-device task pickup, and cloud persistence unverified

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-copy
- **Reference:** Claude · macOS desktop · Cross-device Cowork task continuity onboarding modal

**Gap**

Reference shows a first-run modal explaining that a task started on desktop keeps running in the cloud and can be picked up from phone or web even after the computer is off, with a live preview of the mobile 'daily brief task' card. agiworkforce has a BackgroundTasksPanel on desktop (apps/desktop/src/features/background-tasks/BackgroundTasksPanel.tsx) plus a shared cloud Tasks page (apps/web/features/tasks/components/TasksPage.tsx via @agiworkforce/unified-chat) and a mobile Dispatch screen (apps/mobile/app/(app)/dispatch/index.tsx), but nothing in the reviewed source states or demonstrates that a task continues executing independent of the desktop app being open, and there is no onboarding UI introducing this capability to users the first time it's relevant.

**Evidence**

Searched apps/desktop/src, apps/web/features/tasks, apps/mobile/app/(app)/dispatch for 'keeps running', 'even when your computer is off', 'cross-device' — no matching copy found; grep -n -i 'runs even when|keeps running|computer is off' returned nothing.

**Suggested fix**

Confirm/build true cloud-side task persistence (not desktop-tethered), and add a one-time promo card (in the desktop app and/or mobile Tasks/Dispatch screen) explaining that tasks keep running server-side and can be resumed from another device, mirroring the reference's 'Pick up your Cowork tasks from anywhere' framing.

**Reference screenshot(s)**

- `references-2/claude-desktop-cowork-record-skill-01-cross-device-onboarding.png`

### GAP-064 — No 'Cowork' agentic mode toggle on the home composer

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-screen
- **Reference:** Claude · macOS desktop · Home launcher composer — Chat/Cowork mode toggle

**Gap**

Claude's home launcher composer has a Chat/Cowork segmented toggle: Chat is a normal conversation, Cowork spins up an autonomous background agent task (with its own 'Active' task list below). agiworkforce's home/empty-chat composer has no equivalent mode toggle — 'Cowork' appears nowhere in the desktop codebase except as a comparison in code comments.

**Evidence**

apps/desktop/src/features/v3/EmptyChat.tsx, apps/desktop/src/features/chat/BrandedGreeting.tsx (no mode toggle); apps/desktop/src/features/settings/ComputerUseSettings.tsx:472,657 (only mentions 'Claude Cowork' in comparison comments); searched 'cowork' across apps/desktop/src — no implemented feature

**Suggested fix**

If agiworkforce has an equivalent autonomous/background-agent execution mode (e.g., under features/agent or features/background-tasks), surface it as a Chat/Cowork-style composer toggle on the home screen with its own 'Active tasks' list, matching this IA.

**Reference screenshot(s)**

- `claude_reference/137-claude-desktop-home-launcher-cowork-mode-recents-list.png`

### GAP-065 — No browsable plugin catalog — installing requires typing 'plugin-name@marketplace'

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-screen
- **Reference:** Codex · macOS desktop · Plugins marketplace

**Gap**

The reference makes Plugins a top-level sidebar destination with Plugins|Skills tabs, a search field, an Installed icon strip, an Imported-plugins list and a two-column Featured grid where each card has an Install button. agiworkforce buries plugins in a settings tab whose only install path is a free-text `plugin-name@marketplace` input plus an Install button — the user must already know the exact identifier. The marketplace code that does exist (marketplaceStore.fetchFeatured, DiscoverTab, WorkflowCard) is for workflows, not plugins.

**Evidence**

apps/desktop/src/features/settings/SkillsPluginsSettings.tsx:648-682 (text input placeholder 'plugin-name@marketplace' + 'Install plugin'); apps/desktop/src/features/settings/tabs/Plugins/index.tsx (settings tab only, no nav entry); apps/desktop/src/features/v3/Sidebar.tsx navItemsForMode has no plugins entry; apps/web/app/plugins/page.tsx is a marketing catalogue preview ('hosted marketplace installation is not open yet')

**Suggested fix**

Promote Plugins to a sidebar destination reusing the marketplace store's featured/trending fetch shape, render Installed / Imported / Featured sections with per-card Install and overflow menus, and keep the identifier text field as an advanced 'Install from identifier' escape hatch.

**Reference screenshot(s)**

- `chatgpt_reference/087-codex-macos-plugins-marketplace-installed-featured.png`

### GAP-066 — No 'Finish setup' state for installed plugins/connectors whose auth is incomplete

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-state
- **Reference:** Codex · macOS desktop · Plugins marketplace — Imported plugins

**Gap**

The reference shows Gmail installed but not usable, with a prominent 'Finish setup' button on the row, while fully configured entries (Vercel) show only an overflow menu. agiworkforce has no half-configured state for plugins or connectors — an entry is either present or absent, so a plugin that installed but never completed OAuth looks identical to a working one and fails silently at call time.

**Evidence**

grepped 'Finish setup|finish_setup|needs setup|Complete setup|setup required' across apps — only unrelated CloudStoragePanel.tsx:542 prose and a VS Code 'Local runtime needs setup' string; apps/desktop/src/features/settings/SkillsPluginsSettings.tsx InstalledPluginRecord carries no setup/auth status field

**Suggested fix**

Add a `setupState: 'ready' | 'needs_auth' | 'error'` field to the installed-plugin and connector records, render a 'Finish setup' primary action on rows that are not ready, and block tool invocation with a pointer to that action rather than a runtime failure.

**Reference screenshot(s)**

- `chatgpt_reference/087-codex-macos-plugins-marketplace-installed-featured.png`

### GAP-067 — No pull-requests surface on desktop despite git and PR APIs already existing

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-screen
- **Reference:** Codex · macOS desktop · Pull requests list

**Gap**

The reference ships a full PR workspace: All/Reviewing/Authored segmented tabs, 'Search pull requests' with a filter button, and a master-detail layout. agiworkforce's desktop has git plumbing (api/git.ts incl. gitCreatePr and PR description generation) and GitPanel/GitStatusPanel components, but no PR screen and no mount site for the git panels at all, so review work cannot start in the app.

**Evidence**

apps/desktop/src/api/git.ts:639-660 (gitCreatePr); apps/desktop/src/features/git/GitPanel.tsx and GitStatusPanel.tsx are imported by nothing outside features/git; grep 'pull request' across apps/desktop/src returns only connector descriptions

**Suggested fix**

Add a Pull requests panel backed by the GitHub connector: tabs for All/Reviewing/Authored, search + filter, list rows with repo/branch/status, and a detail pane that reuses EnhancedDiffViewer for review.

**Reference screenshot(s)**

- `chatgpt_reference/084-codex-macos-pull-requests-list-empty-error-state.png`

### GAP-068 — No 'Processing' state between Done and the recording result

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-state
- **Reference:** Claude · macOS desktop · Recorder HUD — Processing state

**Gap**

After Done the reference HUD swaps the recording dot for a spinner and reads 'Processing · 0 steps', keeping the step count visible while the capture is compiled. agiworkforce goes straight from stopRecording() to either the save dialog or a terse error, with no intermediate progress affordance, so a slow compile looks like a hang and a zero-step capture appears as an abrupt failure.

**Evidence**

apps/desktop/src/features/automation/ActionRecorder.tsx:168-185 (stopRecording sets state then either setError or setShowSaveDialog; no isProcessing flag anywhere in the file)

**Suggested fix**

Add an isProcessing state set before automationRecordStop() resolves; render a spinner + 'Processing · N steps' in both the HUD and the panel header, disable Discard/Done while it runs, and surface a cancel affordance if processing exceeds ~5s.

**Reference screenshot(s)**

- `references-2/claude-desktop-cowork-record-skill-05-processing-zero-steps.png`

### GAP-069 — No in-thread recording playback timeline with app-switch events and elapsed timestamps

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-screen
- **Reference:** Claude · macOS desktop · Recording playback — expanded event timeline

**Gap**

Expanding the reference card reveals an inline playback timeline: alternating 'Screenshot · 0.2s' frames and semantic events ('→ Switched to Google Chrome', '→ Switched to Claude') with right-aligned elapsed times, scrollable within the message and collapsible from the header. agiworkforce's equivalent list lives only in the recorder panel, is limited to click/type/hotkey rows with raw x,y coordinates, records no application-focus events, and disappears once the skill is saved.

**Evidence**

apps/desktop/src/features/automation/ActionRecorder.tsx:406-464 (step list markup: actionType, value, 'Position x, y'); :49-80 (normalizeRecordedAction has no app/window field); searched 'Switched to'/'app switch'/'focus change' across apps/desktop — no match

**Suggested fix**

Extend RecordedAction with an app_focus event type (app name, bundle id) plus a screenshot ref, and build a RecordingPlaybackCard rendered inside the message list: collapsed header ('<name> · 9.9s' + chevron), expanded body interleaving frames and events with elapsed timestamps, a scroll-to-latest pill, and click-to-zoom on frames.

**Reference screenshot(s)**

- `references-2/claude-desktop-cowork-record-skill-07-recording-playback-events-a.png`

### GAP-070 — Recorded steps carry no screenshot frames, so captures cannot be visually verified

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · macOS desktop · Recording playback — screenshot frames per event

**Gap**

Every reference event is anchored to a labelled screenshot ('Screenshot · 6.7s'), which is what lets both the user and the model tell a good capture from a useless one and lets the model infer intent from on-screen content. agiworkforce's recorder captures no imagery at all — a step is an action type, an optional typed value and a coordinate pair — so a mis-aimed or empty recording is indistinguishable from a good one until replay fails.

**Evidence**

apps/desktop/src/features/automation/ActionRecorder.tsx (no 'screenshot'/'image' reference anywhere in the file; step rows render only actionLabel, value and 'Position x, y' at :429-446); screen-capture primitives exist but are unused by the recorder: apps/desktop/src/features/screen-capture/ScreenCaptureButton.tsx, CapturePreview.tsx

**Suggested fix**

Capture a downscaled, redaction-filtered frame on every recorded action (and on app-focus change), store it alongside the action, and render it as a thumbnail with a 'Screenshot · Ns' caption in both the review list and the playback card. Gate frame capture behind an explicit 'Include screenshots' toggle on the consent screen and state in the consent copy that frames stay local.

**Reference screenshot(s)**

- `references-2/claude-desktop-cowork-record-skill-08-recording-playback-events-b.png`

### GAP-071 — No right-side tool panel (Review/Terminal/Browser/Files); panels unmounted

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-screen
- **Reference:** Codex · macOS desktop · Right tool panel launcher

**Gap**

The reference dedicates the right pane to a tool launcher listing Review, Terminal, Browser and Files with their shortcuts, each opening a working panel beside the chat. agiworkforce's right pane only ever hosts the artifact viewer; the Terminal, Browser and file-tree/diff implementations in the tree are imported by nothing, so none of these tools can be opened by a user.

**Evidence**

apps/desktop/src/features/v3/DesktopShellV3.tsx:503-518 (ArtifactPanel is the only right-side panel); grep for TerminalWorkspace / BrowserVisualization / VisualEditor / CodeWorkspace across apps/desktop/src finds no mount site

**Suggested fix**

Add a right-panel launcher list in DesktopShellV3 (Review diff, Terminal, Browser, Files) that mounts the existing TerminalWorkspace, BrowserVisualization and FileTreeWithChanges/EnhancedDiffViewer components, with a per-panel close and remembered last-used panel.

**Reference screenshot(s)**

- `chatgpt_reference/080-codex-macos-right-panel-shortcuts-review-terminal-browser-files.png`

### GAP-072 — Scheduled tasks has no starter templates — users face a blank cron builder

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Scheduled tasks — Suggestions

**Gap**

The reference seeds the Scheduled screen with a 'Suggestions' section of three one-tap templates, each with an icon, name, human cadence and outcome sentence: Daily brief (Weekdays at 8:00 AM), Weekly review (Fridays at 4:00 PM), Follow-up monitor (Weekdays at 9:00 AM). agiworkforce sends the user straight into CreateTaskModal with nothing pre-filled, which is the main reason scheduling features go unused. No surface (desktop, web /chat/schedules, mobile /schedules) ships templates.

**Evidence**

apps/desktop/src/features/v3/AgiWorkScheduled.tsx:78-160 (header + list + EmptyState, no suggestions block); grepped 'template|preset|suggestion|Daily brief' across features/scheduler/CreateTaskModal.tsx, apps/web/features/schedules/ and apps/mobile/app/(app)/schedules/ — no match

**Suggested fix**

Add a Suggestions section above the task list (and inside the empty state) with 3-5 templates that prefill CreateTaskModal's prompt + cron, sourced from a shared constant so desktop, web and mobile show the same starter set. Hide a template once an equivalent task exists.

**Reference screenshot(s)**

- `chatgpt_reference/086-codex-macos-scheduled-tasks-daily-weekly-followup-suggestions.png`

### GAP-073 — Account settings missing Organization ID, in-app Delete account, and Log out of all devices

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · macOS desktop · Settings > Account

**Gap**

Claude's Account settings show the org's Organization ID (copyable UUID), a 'Delete account' button (blocked with guidance until subscription is canceled), and a 'Log out of all devices' action. agiworkforce's AccountSettings.tsx only has Manage account / Manage subscription / single-device Sign out rows.

**Evidence**

apps/desktop/src/features/settings/AccountSettings.tsx (full file reviewed, rows array has profile/plan/period/linked-device/sign-out only — no org ID, no delete-account, no logout-all)

**Suggested fix**

Add an Organization ID row (read from the auth/account store, if orgs are modeled), a Delete-account row that guards on active subscription status the same way Claude does, and a 'Log out of all devices' action that revokes all sessions server-side.

**Reference screenshot(s)**

- `claude_reference/140-claude-desktop-settings-account-org-id-trusted-devices.png`

### GAP-074 — No cross-surface Active Sessions table (device, location, created/updated, current badge)

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · macOS desktop · Settings > Account — Active sessions table

**Gap**

Claude shows a full active-sessions audit table spanning iOS/Desktop/Chrome with Location, Created, and Updated timestamps and a 'Current' badge for the active session. agiworkforce's Connected Devices list (TeamAccountSettings.tsx) shows device icon/name and a disconnect button only — no location, no created/updated timestamps, no current-session indicator.

**Evidence**

apps/desktop/src/features/settings/TeamAccountSettings.tsx lines 230-260 (Connected Devices renders icon + name + disconnect only)

**Suggested fix**

Extend the device/session model to capture location (coarse, from IP) and created/updated timestamps, and render them as table columns plus a 'Current' badge on the session matching the active device ID.

**Reference screenshot(s)**

- `claude_reference/141-claude-desktop-settings-account-active-sessions-device-list.png`

### GAP-075 — UI font size is not a setting and ⌘+/− zoom is not persisted across restarts

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings > Appearance — Preferences

**Gap**

The reference has 'UI font size · Adjust the base size used for the ChatGPT UI' as a numeric stepper (14 px). agiworkforce's only text-scaling control is a menu-driven zoom that multiplies documentElement.style.fontSize by 1.1 at runtime and never writes to settingsStore, so a low-vision user's adjustment is silently discarded on every app restart. Web has a 'Chat Font Size' setting; desktop's FontSelector controls font family only.

**Evidence**

apps/desktop/src/App.tsx:1053-1060 (zoom_in/zoom_out/actual_size mutate document.documentElement.style.fontSize directly, no store write); apps/desktop/src/features/settings/FontSelector.tsx:7 ('--chat-font-family' only); apps/web/features/settings/components/AppearanceSettings.tsx has 'Chat Font Size'

**Suggested fix**

Add a `uiFontSizePx` preference (default 14) to settingsStore, apply it to the root element on hydrate, drive the zoom menu actions through it so they persist, and render it as a stepper in the Appearance tab next to Chat Font.

**Reference screenshot(s)**

- `chatgpt_reference/095-codex-macos-settings-appearance-dark-theme-preferences.png`

### GAP-076 — No in-app Reduce motion override — only the OS media query is honoured

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings > Appearance — Preferences

**Gap**

The reference offers 'Reduce motion · Reduce animations or match your system' as a three-way System | On | Off segmented control, so a user can suppress animation inside the app without changing an OS-wide setting. agiworkforce reads prefers-reduced-motion via useReducedMotion but provides no override, so users who want motion reduced only in this app (or who are on a platform where the OS flag is awkward to reach) cannot get it.

**Evidence**

apps/desktop/src/features/chat/SearchModal.tsx:17,89 and features/chat/CommandPalette.tsx:19 (useReducedMotion from unified-chat); apps/desktop/src/features/auth/AuthPage.tsx:49 (raw matchMedia); grepped 'reduce.motion|reducedMotion' across settings — no setting exists; ThemeSettings Accessibility section contains only Dyslexic Friendly Font

**Suggested fix**

Add `reduceMotion: 'system' | 'on' | 'off'` to settingsStore, have unified-chat's useReducedMotion consult the override before the media query, and render the segmented control in ThemeSettings' existing Accessibility section beside Dyslexic Friendly Font.

**Reference screenshot(s)**

- `chatgpt_reference/095-codex-macos-settings-appearance-dark-theme-preferences.png`

### GAP-077 — Desktop Memory tab lacks memory toggles, cross-provider import, and tool-access/connector-search controls

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · macOS desktop · Settings > Capabilities — Memory + General

**Gap**

Claude's Capabilities screen bundles memory-related toggles (Search and reference chats, Generate memory from chat history), an 'Import memory from other AI providers' flow, and General controls (Tool access mode dropdown, Connector search toggle, Switch-models-when-flagged toggle) all in one place. agiworkforce's desktop MemoryTab (Memory.tsx) only renders a raw fact-editor (add/edit/remove/clear) with none of these surrounding settings, and has no memory-import flow even though mobile already has one.

**Evidence**

apps/desktop/src/features/settings/tabs/Memory.tsx (full file — MemoryEditor only); apps/mobile/app/(app)/settings/memory-import.tsx exists but has no desktop counterpart; searched 'Tool access mode', 'Connector search', 'Switch models when' in Capabilities/index.tsx and Memory.tsx — no matches

**Suggested fix**

Port the mobile memory-import flow to desktop, add the Search-and-reference / Generate-from-history toggles above the MemoryEditor, and add Tool access mode + Connector search + flagged-switch controls to the desktop Capabilities tab (features/settings/tabs/Capabilities/index.tsx).

**Reference screenshot(s)**

- `claude_reference/146-claude-desktop-settings-capabilities-memory-tools.png`

### GAP-078 — AGI in Chrome settings tab lacks an enable toggle and site-permission policy control

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · macOS desktop · Settings > Claude in Chrome

**Gap**

Reference's Claude in Chrome settings page has an 'Enable Claude in Chrome' master toggle and a Site permissions section with a 'Default for all sites' policy dropdown, described as applying to both the extension and the in-app Browser in Claude Code Desktop. agiworkforce's AgiInChromeTab renders only a BridgeStatusCard (connection diagnostics) with no enable toggle or site-permission policy; the only site-allowlist UI lives in the Chrome extension's own options page, unreachable from desktop settings.

**Evidence**

apps/desktop/src/features/settings/tabs/AgiInChrome/index.tsx (LazyBridgeStatusCard only); apps/extension/src/options.ts has SITE_ALLOWLIST_KEY / approved-sites UI but it is not linked from or mirrored in desktop settings

**Suggested fix**

Add an 'Enable AGI in Chrome' toggle and a 'Default policy for all sites' selector to the AgiInChrome desktop tab, and surface/manage the extension's site allowlist from that same screen (or deep-link to it).

**Reference screenshot(s)**

- `claude_reference/154-claude-desktop-settings-claude-in-chrome-permissions.png`

### GAP-079 — No diagnose/reinstall self-repair path for the local tool runtime

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings > Configuration — Workspace Dependencies

**Gap**

The reference gives the user three recovery affordances for the local execution bundle: a 'Codex dependencies' toggle, 'Diagnose issues in Codex Workspace → Diagnose' (checks the current bundle and records diagnostic logs) and 'Reset and install Workspace → Reinstall' (destructive, downloads a fresh bundle and reloads tools), with the current bundle version printed underneath. agiworkforce exposes 'Runtime backend' and 'Runtime executable' text fields but no health check, no repair action and no version readout — when the sandbox runtime is broken the only signal is failing tool calls.

**Evidence**

apps/desktop/src/features/settings/AgentExecutionSettings.tsx:322-330 (Runtime executable Input, placeholder 'srt'); grepped 'Diagnose|Reinstall|repair|health check|doctor' across apps/desktop/src \*.tsx — only MonacoEditor LSP diagnostics, FeedbackDialog log attachment and StartupRecovery (app-launch failure, not tool runtime)

**Suggested fix**

Add a Workspace Dependencies group to the Agents/Configuration tab with a Diagnose button that probes the runtime binary + sandbox and writes a diagnostic log, a destructive Reinstall action, and a printed runtime version. Reuse the startup-recovery export-diagnostics command for the log path.

**Reference screenshot(s)**

- `chatgpt_reference/097-codex-macos-settings-configuration-approval-sandbox-model-features.png`

### GAP-080 — No trusted-device list: no master allow toggle, per-device revoke, or last-connected

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings > Connections

**Gap**

Reference shows 'Devices that can control this Mac' with a refresh action, an Add button, a master 'Allow connections' toggle, and one row per device ('iOS 26.5.2 iPhone', 'Last connected 1m', 'Revoke access'). agiworkforce's desktop connection state is a single live session (status/peerConnected) with a Disconnect button — no persistent device registry, so a user cannot see which phones have ever been paired or revoke one that is not currently connected.

**Evidence**

apps/desktop/src/features/mobile-companion/MobileCompanionPanel.tsx (single isPaired branch, stopSession only); grep -i 'revoke access|paired device|trusted device|last connected' across apps/desktop/src — no match

**Suggested fix**

Persist paired devices (id, platform, name, lastConnectedAt, enabled) in connectionStore, render them as rows with per-device enable toggle and Revoke access, add a global Allow connections switch that refuses new pairings when off, and a refresh + Add (QR) action in the section header.

**Reference screenshot(s)**

- `chatgpt_reference/053-codex-macos-settings-connections-control-this-mac-devices.png`

### GAP-081 — No 'Allow connections' master switch to disable remote control of the desktop

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings > Connections > Control this Mac

**Gap**

The reference gates all inbound remote control behind a single 'Allow connections' toggle inside the Devices card, so a user can revoke remote access instantly without unpairing. agiworkforce has no such switch anywhere in the desktop app — searching for 'allow connections', 'remote access' and 'remote control' across apps/desktop/src returns nothing; the only stop control is the per-session stopSession() inside the unmounted companion panel.

**Evidence**

grep -i 'allow connections|remote access|remote control' apps/desktop/src — no matches; apps/desktop/src/stores/connectionStore.ts exposes stopSession but no persisted enable flag; apps/desktop/src/features/settings/tabs/\* has no connections tab

**Suggested fix**

Persist a remoteControlEnabled flag in settingsStore, honour it in connectionStore before accepting signaling offers, and surface it as the first row of the new Connections tab with a short explainer of what remote devices can do.

**Reference screenshot(s)**

- `chatgpt_reference/032-codex-macos-settings-connections-control-this-mac-allow-toggle.png`

### GAP-082 — No run-on-startup, voice-shortcut, menu-bar-visibility, or keep-awake toggles in Desktop General settings

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · macOS desktop · Settings > Desktop app > General

**Gap**

Reference's Desktop app > General page has: Run on startup (auto-launch on login), a Voice shortcut (separate from the message quick-access shortcut), a Menu bar visibility toggle, and a Keep computer awake toggle (so scheduled tasks can run while idle). agiworkforce's General tab has a Global Hotkey control (partial match for quick-access shortcut) but none of the other four.

**Evidence**

grep -i 'run on startup|launch.{0,10}login' apps/desktop/src — no match; grep -i 'menu bar icon|tray icon' — no match; grep -i 'keep.\*awake|idle.sleep' — no match; grep -i 'voice shortcut' — no match

**Suggested fix**

Add Run-on-startup, Voice-shortcut, Menu-bar-visibility, and Keep-computer-awake toggles to apps/desktop/src/features/settings/tabs/General/index.tsx, backed by the Tauri autostart/tray/power APIs.

**Reference screenshot(s)**

- `claude_reference/155-claude-desktop-settings-desktop-general-shortcuts.png`

### GAP-083 — No local MCP server list/detail view (status, command, arguments, View Logs, Edit Config)

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-screen
- **Reference:** Claude · web · Settings > Developer > Local MCP servers list + detail panel

**Gap**

Reference's Developer settings shows a master list of local MCP servers (Filesystem, Excel, Apple Notes, Apify, etc.) with a detail panel per server showing running/stopped status, the launch command, full arguments, an 'Edit Config' button, and a 'View Logs' button. agiworkforce's Developer tab only renders DotfileSettings (config.toml editor) and AgentExecutionSettings — no per-server MCP list/detail UI exists in desktop or web.

**Evidence**

apps/desktop/src/features/settings/tabs/Developer/index.tsx (DotfileSettings + AgentExecutionSettings only); apps/desktop/src/features/settings/MCPServerSettings.tsx is a single local-server start/stop control, not a multi-server list with Command/Arguments/View Logs; grep -i 'Local MCP server|Edit Config|view logs' under apps/web found no implementation, only marketing copy

**Suggested fix**

Build a Local MCP servers panel for the Developer tab: a left list of configured servers and a right detail pane showing status, command, arguments, Edit Config, and View Logs, matching the reference's master-detail layout.

**Reference screenshot(s)**

- `claude_reference/158-claude-web-settings-developer-mcp-filesystem-server-detail.png`

### GAP-084 — No 'Prevent sleep while running' toggle — long agent tasks die when the Mac sleeps

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** ChatGPT · macOS desktop · Settings > General

**Gap**

The reference has 'Prevent sleep while running · Keep your computer awake while ChatGPT is running a task'. agiworkforce runs multi-minute agent tasks, scheduled tasks and background tasks on desktop but never asserts a power-management hold and offers no setting for it, so a scheduled or long-running task silently dies when the machine sleeps.

**Evidence**

grepped 'prevent sleep|preventSleep|keep awake|caffeinate' across apps/desktop/src — no match; apps/desktop/src/features/settings/GeneralSettings.tsx Window Preferences covers only global hotkey, theme and language

**Suggested fix**

Add a `preventSleepWhileRunning` preference to settingsStore, and in the Tauri layer acquire a power-save-blocker (IOPMAssertion on macOS / equivalent on Windows+Linux) while any agent, scheduled or background task is active. Render it as a switch in General with the reference's explanatory sub-line.

**Reference screenshot(s)**

- `chatgpt_reference/091-chatgpt-macos-settings-general-permissions-full-access-defaults.png`

### GAP-085 — No 'Show in menu bar' toggle — closing the window fully exits the app

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** ChatGPT · macOS desktop · Settings > General

**Gap**

The reference has 'Show in menu bar · Keep ChatGPT in the macOS menu bar when the main window is closed'. agiworkforce desktop ships a global hotkey ('Open AGI Workforce from anywhere') and a system-wide quick-query overlay, both of which presuppose a resident process, but there is no tray/menu-bar persistence setting, so the always-available promise breaks the moment the user closes the window.

**Evidence**

grepped 'menu bar|menuBar|tray' across apps/desktop/src/features/settings and stores/settingsStore.ts — no match; apps/desktop/src/features/settings/GeneralSettings.tsx:65-97 (Global Hotkey group, no tray option); apps/desktop/src/features/quick-query/index.tsx:1-12

**Suggested fix**

Add a `showInMenuBar` preference plus a Tauri tray icon with New chat / Quick query / Show window / Quit items, and change the window close handler to hide-to-tray when the preference is on.

**Reference screenshot(s)**

- `chatgpt_reference/091-chatgpt-macos-settings-general-permissions-full-access-defaults.png`

### GAP-086 — No 'Send shortcut' preference — Enter vs newline behaviour is not user-configurable

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings > General — Composer

**Gap**

The reference has a Composer group with 'Send shortcut → Enter ⌄' and the copy 'Choose when Enter sends a prompt or inserts a new line'. agiworkforce has no such preference on any surface; Enter behaviour is fixed by the shared composer. This is one of the most commonly requested settings in chat products and affects every message a user writes.

**Evidence**

grepped 'Send shortcut|sendShortcut|sendOnEnter|Enter to send' across apps/desktop/src and apps/web/features — no match; apps/desktop/src/features/settings/GeneralSettings.tsx has no Composer group

**Suggested fix**

Add a `composer.sendShortcut: 'enter' | 'mod+enter'` preference to settingsStore, read it in the shared unified-chat composer key handler, and render it as a Select in a new Composer group in desktop General (mirrored into web /settings/general and mobile /settings/general).

**Reference screenshot(s)**

- `chatgpt_reference/092-codex-macos-settings-general-composer-notifications-popout.png`

### GAP-087 — No follow-up behaviour control (Queue vs Steer) for typing while an agent run is in flight

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-interaction
- **Reference:** Codex · macOS desktop · Settings > General — Composer

**Gap**

The reference lets the user choose what happens when they submit while a run is active — 'Queue' (hold the message until the run finishes) or 'Steer' (inject it into the running turn) — plus a documented one-message override (⌘↵ does the opposite). agiworkforce has no equivalent setting or per-message override, so mid-run input behaviour is implicit and unchangeable. For an agentic product with long-running tasks this is a core interaction, not a nicety.

**Evidence**

grepped 'follow-up behavior|followUpBehavior|steer|queue' across apps/desktop/src and apps/web/features — only unrelated task-queue/toast-queue hits (backgroundTaskStore.ts, useToast.ts, TauriRuntime.ts)

**Suggested fix**

Add a `composer.followUpBehavior: 'queue' | 'steer'` setting rendered as a segmented control in the Composer group, implement both paths in the run controller, and wire ⌘↵ as the per-message inverse. Show the active mode as a hint in the composer while a run is streaming.

**Reference screenshot(s)**

- `chatgpt_reference/092-codex-macos-settings-general-composer-notifications-popout.png`

### GAP-088 — Notification settings lack completion scope, permission alerts and input-needed alerts

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings > General — Notifications

**Gap**

The reference offers 'Turn completion notifications → Only when unfocused ⌄' (scope choice for when the app tells you it finished), 'Enable permission notifications' (alert when a notification permission is required) and 'Enable question notifications' (alert when input is needed to continue). agiworkforce desktop's Notifications panel renders only two switches: Desktop Notifications and Sound Effects. For long-running agent work the input-needed alert is the one that actually keeps a run from stalling silently.

**Evidence**

apps/desktop/src/features/settings/NotificationsSettings.tsx:5 docstring 'Handles: Desktop Notifications, Sound Effects toggles', :44-59 (only those two Labels); LOCAL_NOTIFICATION_SETTINGS in SettingsPanel.tsx:69-84 lists enabled_types including task_complete/agent_activity but no UI exposes per-type control

**Suggested fix**

Expose the existing `enabled_types` array as per-type switches, add a `completionNotificationScope: 'always' | 'unfocused' | 'never'` Select, and add an explicit 'input needed to continue' notification type wired to the approval/question path so a blocked run always surfaces an OS notification.

**Reference screenshot(s)**

- `chatgpt_reference/092-codex-macos-settings-general-composer-notifications-popout.png`

### GAP-089 — Shortcuts cannot be unbound — no Unassigned state and no delete affordance

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-state
- **Reference:** Codex · macOS desktop · Settings > Keyboard shortcuts

**Gap**

Every reference row carries a trash icon per binding and shows 'Unassigned' with a pencil when no binding exists (Open in new window, Switch chat…, most git/app actions). agiworkforce's ShortcutRow offers only Edit (capture a replacement) and, when customized, Reset-to-default — there is no path to remove a binding. A user who wants ⌘L free for something else, or who needs to clear a combo that collides with an OS or IME shortcut, is stuck.

**Evidence**

apps/desktop/src/features/settings/KeybindingsSettings.tsx:110-170 (ShortcutRow renders kbd + Edit + conditional reset only); resolveShortcut always falls back to the built-in default, so an empty custom value cannot represent 'unbound'

**Suggested fix**

Allow the empty string as a sentinel for unbound in customKeybindings, render it as an 'Unassigned' pill, add a trash button per row that writes the sentinel, and make the runtime shortcut matcher skip unbound entries. Sync the sentinel to the Rust shortcut store.

**Reference screenshot(s)**

- `chatgpt_reference/101-codex-macos-settings-keyboard-shortcuts-chat-navigation-basics.png`

### GAP-090 — Shortcuts Tips copy promises conflict precedence the code actively refuses

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-copy
- **Reference:** Codex · macOS desktop · Settings > Keyboard shortcuts

**Gap**

The Tips block tells the user 'Conflicting shortcuts are marked with a warning icon. The most recently bound shortcut takes precedence.' But handleEditCapture rejects any conflicting combo outright — it fires toast.warning('Combo already used by …'), closes the editor and never writes the binding. The documented precedence behaviour is unreachable; the warning icon and conflicts map only ever fire for collisions among built-in defaults. This is misleading guidance attached to a control that behaves differently.

**Evidence**

apps/desktop/src/features/settings/KeybindingsSettings.tsx:213-228 (conflict → toast.warning + setEditingId(null) + early return, no setCustomKeybinding) vs the Tips paragraph rendered near the end of the same file

**Suggested fix**

Pick one behaviour and make copy and code agree. Preferred: allow the rebind, show the warning icon on both rows, and implement last-bound-wins in the matcher (then the Tips text is true). Otherwise rewrite the tip to 'A combo already in use cannot be assigned — clear the other shortcut first.'

**Reference screenshot(s)**

- `chatgpt_reference/101-codex-macos-settings-keyboard-shortcuts-chat-navigation-basics.png`

### GAP-091 — No keyboard chat switching: no next/previous chat, recently-viewed cycling or ⌘1-⌘9 jump

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-interaction
- **Reference:** Codex · macOS desktop · Settings > Keyboard shortcuts — chat switching

**Gap**

The reference binds Next chat (⇧⌘], ⌥⌘Right), Previous chat (⇧⌘[, ⌥⌘Left), Next/Previous recently viewed chat (^Tab / ^⇧Tab) and a 'Switch chat…' quick switcher, and renders ⌘1-⌘6 badges next to pinned/project conversations in the sidebar for direct jumps. agiworkforce's 21 default shortcuts include none of these, and the sidebar renders no per-conversation shortcut badge — the only keyboard route to another conversation is opening search (⌘K).

**Evidence**

apps/desktop/src/constants/shortcuts.ts (21 entries: new-chat, clear, copy-last, voice-input, settings, search, navigate-_, model-_, agent-_, tool-timeline, window-_); grepped 'Digit[1-9]|cmd\+[1-9]' across apps/desktop/src — no match; apps/desktop/src/features/v3/Sidebar.tsx:479 is the only ⌘ badge (⌘K on the search row)

**Suggested fix**

Add next-chat / previous-chat / next-recent / previous-recent shortcut definitions plus mod+1..9 direct-jump bindings driven by the sidebar's visible pinned+recent ordering, and render the assigned combo as a right-aligned badge on ConversationRow the way the ⌘K search row already does.

**Reference screenshot(s)**

- `chatgpt_reference/102-codex-macos-settings-keyboard-shortcuts-tab-chat-switching.png`

### GAP-092 — No AI-model-training consent toggle ('Help improve our AI models') or location-metadata toggle

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · macOS desktop · Settings > Privacy

**Gap**

Claude's Privacy settings include a 'Help improve our AI models' toggle (opt-in to using chats/coding sessions for model training) and a 'Location metadata' toggle (coarse city/region use). Neither concept exists anywhere in agiworkforce's Privacy tab or elsewhere in the desktop app.

**Evidence**

apps/desktop/src/features/settings/tabs/Privacy/index.tsx (full section list: DataPrivacySection, AnalyticsPrivacySection, GovernancePrivacySection, Cloud data, Master Password — no training-consent or location-metadata toggle); searched 'train'/'improve model'/'model training' across apps/desktop/src — no matches

**Suggested fix**

Add both toggles to the Privacy tab with matching explainer copy and backend flags, since these are standard-expectation privacy controls for an AI product and their absence is a compliance/trust gap, not just a feature gap.

**Reference screenshot(s)**

- `claude_reference/142-claude-desktop-settings-privacy-data-controls-export-sharing.png`

### GAP-093 — No dictation dictionary — names and jargon mis-transcribe every time

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings > Voice — Dictation dictionary

**Gap**

The reference has a 'Dictation dictionary' card ('Words or phrases dictation should recognize') with an '+ Add entry' button and editable entry rows with per-row delete. agiworkforce has a deep voice stack (Whisper STT models, transcription providers, post-processing, wake word) but no custom-vocabulary list, so proper nouns, product names and technical terms are mis-transcribed on every dictation with no user remedy.

**Evidence**

grepped 'dictionary|vocabulary|custom words|customWords' across apps — only unrelated hits (roiStore.ts trends dictionary comment); apps/desktop/src/features/settings/VoiceSettings.tsx has Transcription Provider / Whisper STT Models / Post-Processing but no vocabulary list

**Suggested fix**

Add a `dictationDictionary: string[]` setting with an add/edit/delete list UI, and feed the entries into the STT request as an initial-prompt/biasing hint (Whisper `initial_prompt`, provider phrase-list equivalents) and into the post-processing correction pass.

**Reference screenshot(s)**

- `chatgpt_reference/096-codex-macos-settings-voice-dictation-hotkeys-dictionary.png`

### GAP-094 — No Browser settings for the in-app browser (control, destinations, clear data, downloads)

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-screen
- **Reference:** Codex · macOS desktop · Settings › Browser

**Gap**

Reference gives the built-in browser its own settings screen: a master 'let the assistant control the browser' toggle, web/local URL open destinations, 'Clear all browsing data', annotation-screenshot policy, password/contact autofill managers and a downloads location. agiworkforce ships browser viewing/automation surfaces but exposes none of these controls, so a user cannot disable browser control or clear what the agent browsed.

**Evidence**

apps/desktop/src/features/browser/{BrowserViewer,BrowserActionLog,BrowserDebugTabs}.tsx and features/execution/BrowserPanel.tsx exist; apps/desktop/src/features/settings/tabs/AgiInChrome/index.tsx only renders BridgeStatusCard; searched 'browsing data', 'default browser' and 'downloads folder' in apps/desktop/src — no match

**Suggested fix**

Add a Browser settings tab with: enable/disable browser control, link-open destination (in-app vs system default), 'Clear browsing data' with a scope dropdown, downloads location + 'ask where to save', and a link across to the extension's autofill profile.

**Reference screenshot(s)**

- `chatgpt_reference/113-codex-macos-settings-browser-general-autofill-downloads.png`

### GAP-095 — No approval policy or per-site permission overrides for agent-opened websites on desktop

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings › Browser (permissions & developer mode)

**Gap**

Reference has an 'Approval' dropdown controlling whether the assistant asks before opening websites, plus a 'Site permissions' list with +Add and a 'No site-specific permissions yet' empty state. On desktop agiworkforce only has a sandbox 'Allowed network domains' field for terminal commands; browser navigation by the agent has no approval policy or per-origin overrides. The Chrome extension does have an allowlist, so the two surfaces disagree.

**Evidence**

apps/desktop/src/features/settings/AgentExecutionSettings.tsx:336-356 (terminal sandbox domains only), apps/extension/src/options.ts:16,452,486 (agi_site_allowlist under 'Permissions'), searched 'site permission'/'per-site' in apps/desktop/src — no match

**Suggested fix**

Add a Permissions block to the new Browser settings tab: an approval policy select (Always ask / Ask for new sites / Always allow) and a per-origin override list with Add/Remove and an empty state, sharing storage with the extension allowlist through the native bridge.

**Reference screenshot(s)**

- `chatgpt_reference/114-codex-macos-settings-browser-permissions-developer-mode-cdp.png`

### GAP-096 — Connections mounts live pairing, but multi-device management remains incomplete

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-ia
- **Reference:** Codex · macOS desktop · Settings › Connections › Control this Mac

**Gap**

The reference combines inbound control, outbound devices, SSH, paired-device history, last-connected timestamps, and access revocation. agiworkforce now mounts its real inbound mobile-control pairing and approval workflow in Settings > Connections. The remaining gap is narrower: existing connected-device management is still separate, and no supported outbound-device or SSH runtime exists.

**Evidence**

apps/desktop/src/features/settings/tabs/Connections/index.tsx mounts MobileCompanionPanel for the supported control-this-Mac flow. packages/ui/ui/src/settings-nav.ts makes Connections searchable and reachable. TeamAccountSettings.tsx still owns a separate Connected Devices list, while current code has no production outbound-device or SSH session contract.

**Suggested fix**

Move the real connected-device history and revoke controls into Connections, backed by the same device/session source of truth. Add Control other devices and SSH tabs only alongside implemented connection runtimes, not as placeholder settings surfaces.

**Reference screenshot(s)**

- `chatgpt_reference/117-codex-macos-settings-connections-control-this-mac-iphone.png`

### GAP-097 — No master 'Allow connections' kill switch for remote control of this machine

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings › Connections › Control this Mac

**Gap**

Reference puts an 'Allow connections' switch above the paired-device list so remote control can be shut off instantly without unpairing. agiworkforce can only disconnect devices one at a time and has no global remote-access switch — a trust-boundary control the product's local/remote split needs.

**Evidence**

apps/desktop/src/features/settings/TeamAccountSettings.tsx:277-296 (per-device Disconnect only), apps/desktop/src/stores/connectionStore.ts:473 (pairing-code request path); searched 'allow connections'/'remote access' in apps/desktop/src/features/settings — no master toggle

**Suggested fix**

Add an 'Allow connections' switch in the new Connections tab that gates the pairing listener and rejects inbound companion sessions while off, with a status line showing how many devices are currently paired.

**Reference screenshot(s)**

- `chatgpt_reference/117-codex-macos-settings-connections-control-this-mac-iphone.png`

### GAP-098 — No Git settings: branch prefix, merge method, force-push, draft PRs, instructions

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-screen
- **Reference:** Codex · macOS desktop · Settings › Git

**Gap**

Reference gives agent-driven git its own settings screen — branch prefix for agent-created branches, merge vs squash, 'always force push (--force-with-lease)', draft-PR default, inline vs detached review delivery, plus free-text commit-message and PR-description instructions saved into the generation prompts. agiworkforce has a git panel that commits/pushes but no policy or prompt-guidance settings, so agent git behaviour cannot be constrained per team convention.

**Evidence**

apps/desktop/src/features/git/{GitPanel,GitCommitDialog,GitDiffViewer,GitStatusPanel}.tsx and apps/desktop/src/api/git.ts exist (push/pull/commit); searched 'branch prefix', 'force-with-lease', 'draft pull request', 'squash', 'commit instructions' across apps/ — no match

**Suggested fix**

Add a Git settings tab persisting branchPrefix, mergeMethod, forcePushWithLease, draftPullRequests, reviewDelivery plus commitInstructions/prInstructions textareas with explicit Save, and read those values in the commit/PR generation prompts and push path.

**Reference screenshot(s)**

- `chatgpt_reference/118-codex-macos-settings-git-branch-prefix-pr-instructions.png`

### GAP-099 — No lifecycle hooks feature or settings screen at all

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-screen
- **Reference:** Codex · macOS desktop · Settings › Hooks (empty state)

**Gap**

Reference ships a Hooks screen ('Manage lifecycle hooks from config and enabled plugins') with a refresh action and a 'No hooks found / Configured hooks will appear here' empty state, letting users run their own commands around agent tool calls. agiworkforce has no hook concept: a hooksStore once existed and was deleted as dead code, so plugins cannot register lifecycle behaviour and users cannot inspect what runs around tool calls.

**Evidence**

apps/desktop/src/stores/logoutCleanup.ts:36,168 (hooksStore listed among stores 'deleted as dead code'); searched 'lifecycle hook', 'PreToolUse', 'PostToolUse' across apps/desktop/src and apps/web/features — no match

**Suggested fix**

Introduce a hooks config (per-user and per-project) with pre/post tool-use, session-start and session-end events, resolve hooks from config plus enabled plugins, and add a Hooks settings tab listing source, event, command and enabled state with refresh and the empty state.

**Reference screenshot(s)**

- `chatgpt_reference/116-codex-macos-settings-hooks-empty-state-no-hooks.png`

### GAP-100 — Shortcuts cannot be unassigned — no 'Unassigned' state or clear action

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-state
- **Reference:** Codex · macOS desktop · Settings › Keyboard shortcuts

**Gap**

Reference renders 'Unassigned' for unbound actions and a trash icon that clears an assigned combo, so users can free a system-conflicting key. agiworkforce always renders the resolved default combo in a <kbd> and offers only Edit plus 'reset to default'; there is no way to leave an action unbound.

**Evidence**

apps/desktop/src/features/settings/KeybindingsSettings.tsx:132-168 (kbd always shows formatComboDisplay of resolved default; only Edit + RotateCcw reset), apps/desktop/src/constants/shortcuts.ts (every ShortcutDefinition has a mandatory key+modifiers)

**Suggested fix**

Allow customKeybindings[id] === '' to mean unbound: render 'Unassigned' in ShortcutRow, add a trash button next to Edit that writes the empty binding, and make useShortcutActions skip empty combos.

**Reference screenshot(s)**

- `chatgpt_reference/105-codex-macos-settings-keyboard-shortcuts-undo-redo-approve-close-tab.png`

### GAP-101 — No keyboard shortcuts to approve/decline a pending agent approval request

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-interaction
- **Reference:** Codex · macOS desktop · Settings › Keyboard shortcuts

**Gap**

Reference binds Return to 'Approve request' and Escape to 'Decline request' so an agent run can be unblocked without reaching for the mouse. agiworkforce ships a blocking ApprovalModal but no shortcut action exists for approving or declining.

**Evidence**

apps/desktop/src/features/governance/ApprovalModal.tsx:58,184 (Approve Request button); apps/desktop/src/constants/shortcuts.ts DEFAULT_SHORTCUTS has no approval entries — searched 'approve request' and 'decline' across apps/desktop/src, no shortcut match

**Suggested fix**

Add 'approval.approve' (Return) and 'approval.decline' (Escape) ShortcutDefinitions in a new 'approvals' category, dispatch them from useShortcutActions only while governanceStore has a pending request, and show the combo inline in ApprovalModal's buttons.

**Reference screenshot(s)**

- `chatgpt_reference/105-codex-macos-settings-keyboard-shortcuts-undo-redo-approve-close-tab.png`

### GAP-102 — Installed plugins cannot be disabled — only updated or removed

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings › Plugins

**Gap**

Every reference plugin row carries an on/off switch, so a plugin can be silenced without losing its install/config. agiworkforce's PluginRow exposes only Update and Remove, so the only way to stop a misbehaving plugin is to uninstall it.

**Evidence**

apps/desktop/src/features/settings/SkillsPluginsSettings.tsx:171-260 (PluginRow renders scope badge, version, Update, Remove — no Switch), searched 'enabled'/'Switch' inside SkillsPluginsSettings.tsx — the file imports no toggle for plugins

**Suggested fix**

Add an `enabled` flag per resolved plugin persisted in settingsStore, render a Switch on the right of each PluginRow, and have the plugin/skill resolver skip disabled plugins when building the tool and slash-command catalog.

**Reference screenshot(s)**

- `chatgpt_reference/112-codex-macos-settings-plugins-plugin-list-toggles-on.png`

### GAP-103 — Billing has no credits balance card with Buy credits and auto-reload

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Settings › Usage & billing

**Gap**

Reference shows current credit balance, a 'Buy credits' button and a 'Set up auto-reload' link with the explainer 'Buy credits or turn on auto-reload to continue if you hit a limit'. agiworkforce's desktop Billing tab shows only plan/subscription/renewal plus a Stripe portal button; credits are read-only in a different section and there is no purchase or auto-reload path.

**Evidence**

apps/desktop/src/features/settings/BillingSettings.tsx:70-104 (Plan/Subscription/Renews + Manage billing only), apps/desktop/src/features/settings/AccountSettings.tsx:203,246 (read-only CreditsSection), searched 'auto-reload'/'buy credits' across apps/ — only apps/desktop/src/App.tsx:1748 onBuyTopUp which just opens the billing tab

**Suggested fix**

Add a Credits card to BillingSettings showing balance from the billing store with 'Buy credits' (Stripe checkout for a top-up price) and an auto-reload configuration (threshold + amount), and point App.tsx's onBuyTopUp at it instead of the generic tab.

**Reference screenshot(s)**

- `chatgpt_reference/109-codex-macos-settings-billing-plan-credits-usage-limits.png`

### GAP-104 — Chats are not nested under their project in the sidebar

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-ia
- **Reference:** Codex · macOS desktop · Sidebar projects with nested chats

**Gap**

The reference nests each project's chats directly beneath the project row, with a 'Show more' overflow and a per-project 'No chats' empty state, so project context is visible while navigating. agiworkforce renders projects as flat rows and puts every conversation in a separate time-grouped Recents list, so a project's conversations can only be found by opening the project panel.

**Evidence**

apps/desktop/src/features/v3/Sidebar.tsx:583-595 (ProjectRow list) and 598-640 (separate Recents groups); features/v3/ProjectRow.tsx (row-level menu, no children)

**Suggested fix**

Make ProjectRow expandable, rendering that project's conversations (capped with a 'Show more') and an explicit 'No chats' row when empty, and filter those conversations out of the ungrouped Recents list.

**Reference screenshot(s)**

- `chatgpt_reference/083-codex-macos-sidebar-nav-projects-recent-chats.png`

### GAP-105 — No MFA precondition gate before enabling remote device control

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-state
- **Reference:** Codex · macOS desktop · Turn on Multi-Factor Authentication gate modal

**Gap**

The reference blocks enabling remote control until the account has MFA, with an illustrated modal, plain-language reason and a 'Continue on chatgpt.com' deep link to the account security page. agiworkforce has no equivalent: the desktop app contains no MFA/2FA logic at all, and the web 2FA control is self-described as unimplemented ('Two-factor via an authenticator app is coming to web'). Remote control of a developer machine is exactly the capability that warrants a step-up requirement under the repo's trust-boundary rules.

**Evidence**

grep -i 'multi-factor|mfa|two-factor|2fa|totp' apps/desktop/src returns only DesktopCloudSettingsModal.tsx:1072 (a description string); apps/web/features/settings/components/Settings/TwoFactor.tsx:73-82

**Suggested fix**

Add an MfaRequiredDialog to the Connections tab that renders when the account lacks a verified second factor, with a 'Continue on agiworkforce.com' button deep-linking to /settings/security, and land a real TOTP enrollment flow behind that link.

**Reference screenshot(s)**

- `chatgpt_reference/033-codex-macos-settings-connections-mfa-required-modal.png`

### GAP-106 — Unusable capture fails with a terse alert, no diagnosis, no re-record path

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-state
- **Reference:** Claude · macOS desktop · Unusable-capture failure response

**Gap**

The reference explains exactly what it saw ('mostly black for about 7 seconds, a brief switch to Chrome, then back'), states why that is not enough to build a skill, offers two concrete hypotheses (recording started before anything visible happened; the action happened in a window that was not captured), and asks the user to describe the intent or re-record with the relevant window in view. agiworkforce shows a single destructive Alert — 'No actions were captured. Grant Input Monitoring, then record at least one click or keystroke.' — with no restart button, so the user's only route back is to find the Start recording button again.

**Evidence**

apps/desktop/src/features/automation/ActionRecorder.tsx:175-180 (zero-action error string) and :356-363 (generic 'Recording needs attention' Alert with no actions)

**Suggested fix**

Replace the zero-step alert with a structured failure state: a headline ('That recording has nothing to learn from'), a per-cause bullet list chosen from the actual signals (no input events / all frames blank / no app focus change / permission not granted), and two buttons — 'Record again' (restarts capture immediately) and 'Describe it instead' (opens the composer prefilled with 'I was trying to demonstrate…').

**Reference screenshot(s)**

- `references-2/claude-desktop-cowork-record-skill-09-black-capture-failure-response.png`

### GAP-107 — Agent access scope is invisible at point of use — no permission chip in the composer

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** ChatGPT · macOS desktop · Work mode empty state — composer permission chip

**Gap**

The reference puts an amber '⚠ Full access' chip directly in the composer footer, so the user always knows what the agent is allowed to do before pressing send, and can change it from there. In agiworkforce the equivalent scope (Read-only / Workspace write / Danger full access) lives only inside Settings > Agent Execution — nothing in the chat surface reflects it. Given the repo's Local/BYOK/Managed trust-boundary rules, an unlabelled elevated-permission state in the composer is a real trust defect.

**Evidence**

grepped 'Full access|approvalMode|sandboxMode' across apps/desktop/src — matches only in stores/settingsStore.ts, DotfileSettings.tsx, AgentsSettings.tsx, AgentExecutionSettings.tsx; no chat/composer file references the sandbox policy

**Suggested fix**

Render the resolved terminal-sandbox/approval policy as a composer footer chip (neutral for read-only, amber for full access) that opens the Agent Execution settings on click, alongside the existing provider/mode label so scope and provider are read together.

**Reference screenshot(s)**

- `chatgpt_reference/088-chatgpt-macos-work-mode-empty-state-quick-actions.png`

### GAP-108 — No settings screen for a hosted/cloud browsing agent's permissions and cookie data

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-screen
- **Reference:** ChatGPT · web · Cloud browser

**Gap**

Reference has a whole 'Cloud browser' settings page: a Default permissions mode ('Always ask'), per-site permission overrides ('Add site'), and a Browser data section to clear cookies saved by the cloud browser. agiworkforce has an analogous allow/deny/ask-list for native desktop app automation (Computer Use) but nothing for a hosted browsing agent's site-level web permissions or its cookie store, on any surface.

**Evidence**

apps/desktop/src/features/settings/ComputerUseSettings.tsx (app-level, not site/URL-level); searched 'cloud browser', 'site permission' across apps/web, apps/desktop, apps/mobile — zero matches

**Suggested fix**

If/when a hosted browsing agent ships, add a Settings > Cloud Browser page with a default-permission dropdown, a per-site override list with Add Site, and a 'Clear cookies' action scoped to that browser's storage.

**Reference screenshot(s)**

- `chatgpt_reference/137-chatgpt-web-settings-cloud-browser-default-permissions-site-cookies.png`

### GAP-109 — No persistent per-task Outputs/Progress/Context side panel for Cowork tasks

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-control
- **Reference:** Claude · web · Cowork task view right-side Outputs/Progress/Context panel

**Gap**

Claude's Cowork task view keeps a collapsible right-side panel showing task Progress, a running count and list of generated Output files (each with a 'Download and open' split button), and a Context section listing referenced files. agiworkforce's cowork mode ('AGI Work') has inline tool-call timelines and artifact cards in the message stream, but no equivalent persistent summary panel that aggregates all files a task has produced with per-file download actions.

**Evidence**

Searched apps/web/features/chat/v3 (WebShellV3.tsx, WebSidebar.tsx) and apps/web/features/chat for 'Outputs', 'Progress' panel, 'Download and open', 'Context' file list components — no matching UI found; only ToolTimeline.tsx and inline ArtifactBlock/ArtifactPreview components exist in the message stream.

**Suggested fix**

Add a collapsible right-side panel to the cowork/AGI-Work task view that lists task Progress (expandable step log), an Outputs section aggregating every file/artifact produced during the task with a per-row 'Download and open' action, and a Context section showing input files/folders referenced by the task.

**Reference screenshot(s)**

- `claude_reference/183-claude-web-cowork-task-outputs-benchmark-spec-files.png`

### GAP-110 — No bulk chat management: Archive all / Delete all / Shared-links manager / Archived-chats manager

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-control
- **Reference:** ChatGPT · web · Data controls — bulk chat management

**Gap**

Reference exposes four dedicated data-control rows: 'Shared links' (Manage), 'Archived chats' (Manage), 'Archive all chats', and 'Delete all chats' — scoped to conversations, distinct from full-account deletion. agiworkforce's Data Controls (PrivacySection) only offers Export data and full account deletion (GDPR); there is no way to bulk-archive, bulk-delete, or centrally manage shared links / archived chats.

**Evidence**

apps/web/features/settings/sections/PrivacySection.tsx (no 'Archive'/'Delete all'/'Shared links'/'Archived chats' strings); searched 'archive all', 'delete all chats', 'shared links', 'archived chats' across apps/web — zero matches outside marketing copy

**Suggested fix**

Add bulk-action rows to the Data Controls section: Archive all chats, Delete all chats (with confirmation), a Shared Links manager (list/revoke), and an Archived Chats manager (list/unarchive).

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

### GAP-112 — Chats and Tasks are separate surfaces instead of one unified 'Chats and tasks' home list

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-ia
- **Reference:** Claude · web · Home > Chats and tasks unified list

**Gap**

Reference's primary Home nav item is 'Chats and tasks', a single searchable/filterable list mixing chat threads and scheduled/background task cards (with a distinct task icon, unread-status dot, and relative timestamps), plus a Select bulk-action mode, Filter-by-All dropdown, and New button. agiworkforce's web sidebar has no combined nav entry; Tasks live at a separate /tasks route/feature from the chat list, with no evidence of a merged, filterable, bulk-selectable view.

**Evidence**

apps/web/features/chat/v3/WebSidebar.tsx nav items (Projects, Artifacts, Customize — no 'Chats and tasks' merged entry); apps/web/app/tasks/page.tsx is a standalone TasksPage separate from chat history; grep for 'Chats and tasks' / 'Search chats and tasks' across apps/web — no match

**Suggested fix**

Introduce a unified 'Chats and tasks' home view combining chat history and task/agent-run cards in one filterable, searchable list with Select (bulk actions), Filter-by, and New, matching the reference IA.

**Reference screenshot(s)**

- `claude_reference/165-claude-web-home-chats-and-tasks-recents-list-with-tasks.png`

### GAP-113 — No unified Skills/Connectors/Plugins 'Directory' browse modal with search, filter, and sort

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-screen
- **Reference:** Claude · web · Plugin directory browse (unified Directory modal)

**Gap**

Reference has one 'Directory' modal reachable from any of Skills/Connectors/Plugins, with a persistent left nav between the three catalogs, a search box, Anthropic/Partners source tabs, Filter by and Sort by dropdowns, and a card grid with download-count metadata. agiworkforce has no such modal — its closest analog is a static marketing page (/plugins) with 4 hardcoded items and no search/filter/sort/download counts, and no shared entry point across skills/connectors/plugins.

**Evidence**

grep for '"Directory"' / 'Search plugins...' / 'Search skills...' / 'Search connectors...' across apps/web and apps/desktop finds no unified directory component, only separate per-surface search bars (SkillSearchBar.tsx, ConnectorGallery.tsx)

**Suggested fix**

Build a shared Directory modal component with left-nav tabs for Skills/Connectors/Plugins, a search box, source filter chips (e.g. Anthropic/Partners), Filter by/Sort by menus, and a reusable card grid showing name, author, description, and install-count.

**Reference screenshot(s)**

- `claude_reference/162-claude-web-plugin-directory-browse-anthropic-category-cards-grid.png`

### GAP-114 — No content-safety 'Reduce sensitive content' preference anywhere

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-control
- **Reference:** ChatGPT · web · Safety

**Gap**

ChatGPT has a dedicated Safety settings page with a single high-impact toggle: 'Reduce sensitive content' to add extra safeguards around sensitive topics. agiworkforce's only similarly-named screen (mobile 'Safety & Security') is actually about device App Lock (biometric) and OS permissions — an unrelated concept — and there is no content-moderation-strictness preference on any surface.

**Evidence**

apps/mobile/src/features/settings/safety-security/index.tsx (App Lock + Permissions only); searched 'reduce sensitive', 'sensitive content' across apps/web with zero matches

**Suggested fix**

Add a Settings > Safety page (web + mobile) with a 'Reduce sensitive content' toggle wired to the moderation/system-prompt layer, separate from the existing device App Lock screen.

**Reference screenshot(s)**

- `chatgpt_reference/139-chatgpt-web-settings-safety-reduce-sensitive-content-toggle.png`

### GAP-115 — No passkey/security-key (WebAuthn) registration, and 2FA is explicitly unimplemented on web

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-control
- **Reference:** ChatGPT · web · Security and login

**Gap**

Reference shows 'Security keys & passkeys' management (count + last-added date) and working authenticator-app / SMS MFA toggles. agiworkforce's TwoFactorPanel shows an authenticator-app label but the code comment states 'Two-factor via an authenticator app is coming to web. Manage 2FA from your identity provider for now' — i.e. it is not actually enrollable in-app — and there is no SMS MFA option and no passkey/security-key UI at all.

**Evidence**

apps/web/features/settings/components/Settings/TwoFactor.tsx line ~82 ('coming to web... manage from your identity provider for now'); searched 'passkey', 'security key' across apps/web — zero matches

**Suggested fix**

Implement WebAuthn passkey registration/list/remove in Settings > Security, and either finish in-app authenticator-app enrollment or clearly gray out the control until it ships (avoid a toggle that implies functionality that doesn't exist).

**Reference screenshot(s)**

- `chatgpt_reference/140-chatgpt-web-settings-security-login-password-passkeys-mfa-sessions.png`

### GAP-116 — Settings has no 'Claude Code'-equivalent section for coding-session preferences

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-screen
- **Reference:** Claude · web · Settings > Claude Code appearance & behavior preferences

**Gap**

Reference settings include a dedicated 'Claude Code' section with toggles for automatic session-state classification and model-switching-on-safety-flag, plus a 'Code appearance' block letting users pick separate light/dark diff themes with live preview and set a custom monospace code font, and a high-contrast dark theme toggle. agiworkforce's Settings has no comparable section; this is consistent with the broader absence of an in-product Code/coding-session surface.

**Evidence**

grep -in 'code appearance|classify session|global instructions|high-contrast|code font|diff theme' across the audit source strings snapshot and apps/web — no hits for the Claude-Code-specific terms; apps/web/app/settings/capabilities/page.tsx and the settings nav list (general, account, byok, capabilities, connections, memory, notifications, privacy, profile, reflect, security, skills, sync, team, time-focus, usage, voice) contain no 'Claude Code' entry.

**Suggested fix**

Once a Code tab / coding-session feature exists, add a matching Settings section with diff/code-appearance theme pickers (light+dark), a custom code font field, a high-contrast toggle, and behavior toggles for auto session classification and model-switch-on-flag.

**Reference screenshot(s)**

- `claude_reference/177-claude-web-settings-panel-claude-code-appearance-prefs.png`

### GAP-117 — Plugin installs are permanently disabled, not just empty — no real install flow exists

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-state
- **Reference:** Claude · web · Settings > Plugins empty state

**Gap**

The reference's Plugins empty state is one state of a working install pipeline (Browse plugins leads to a real marketplace with working Add buttons, per image 162). agiworkforce hardcodes `plugins: []` in WebSettingsModal.tsx with no fetch/load path, and the /plugins marketing page explicitly says 'hosted marketplace installation is not open yet' — so there is no way for this empty state to ever transition to a populated one.

**Evidence**

apps/web/features/settings/components/WebSettingsModal.tsx line ~485 'plugins: []' hardcoded, 'pluginsLoading: false'; apps/web/app/plugins/page.tsx explicit copy 'hosted marketplace installation is not open yet'

**Suggested fix**

Wire a real plugin-install backend (mirroring the skills /api/skills pattern) so installed plugins persist and the empty state can transition to a populated list after Browse > Add.

**Reference screenshot(s)**

- `claude_reference/161-claude-web-settings-plugins-empty-state-browse-cta.png`

### GAP-118 — Archived conversations are unreachable — no archived chats screen to restore or delete

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-screen
- **Reference:** Codex · macOS desktop · Settings › Archived chats (empty state)

**Gap**

Reference has an Archived chats settings destination with an explicit 'No archived chats' empty state. In agiworkforce a user can archive a conversation, after which the sidebar filters it out and the only way back is ticking 'Include archived conversations' inside the global search dialog — archiving effectively deletes the chat from the UI, with no restore or bulk-delete.

**Evidence**

apps/web/features/chat/pages/WebChatPage.tsx:2269 (archive toggle), apps/web/features/chat/v3/WebSidebar.tsx:43 (filters archived out), apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:465 ('Include archived conversations'); apps/web/app/settings has no archived route

**Suggested fix**

Add /settings/archived (and a matching modal section) listing archived conversations with Restore, Delete and 'Delete all archived', an empty state, and mirror it on desktop where only projects can currently be archived/unarchived.

**Reference screenshot(s)**

- `chatgpt_reference/121-codex-macos-settings-archived-chats-empty.png`

### GAP-119 — Notifications reduced to one browser toggle — no event categories or Push/Email channels

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-control
- **Reference:** ChatGPT · web · Settings › Notifications

**Gap**

Reference lists seven event categories (Codex tasks, Group chats, Marketing, Personalized tips, Projects, Responses, Tasks) each with a channel selector showing Push, Email or both. agiworkforce web deliberately stripped every category except a single browser 'Reply ready' switch because no email or push dispatcher exists, so nothing can notify a user about a finished task, an agent run or a shared-project invite.

**Evidence**

apps/web/features/settings/sections/NotificationsSection.tsx:22-62 (comment: email/push groups removed, 'no email sender, no push dispatcher'; NotifKey = 'browserReplyReady' only)

**Suggested fix**

Build the send paths first (email via the existing transactional provider, web push via service worker), then restore category rows — Tasks, Schedules, Shared projects, Responses, Usage, Marketing — each with a Push/Email multi-select persisted in the notifications namespace.

**Reference screenshot(s)**

- `chatgpt_reference/123-chatgpt-web-settings-notifications-codex-groupchats-marketing-top.png`

### GAP-120 — No trusted-contact crisis-safety feature anywhere in the product

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-screen
- **Reference:** ChatGPT · web · Trusted contact

**Gap**

ChatGPT lets a user designate a trusted contact (18+) who can be automatically notified if the user discusses suicide in a way that indicates a serious safety concern, with explicit consent/explainer copy. agiworkforce has no equivalent settings screen, contact model, or crisis-detection-to-notification pipeline on any surface.

**Evidence**

searched 'trusted contact', 'crisis', 'self-harm', 'suicide' across apps/web, apps/desktop, apps/mobile — zero matches

**Suggested fix**

Add a Settings > Trusted Contact screen (web/mobile) allowing users to add a contact with explainer copy on when/why they'd be notified; wire it to any existing self-harm-risk detection in the moderation pipeline as an opt-in escalation path.

**Reference screenshot(s)**

- `chatgpt_reference/144-chatgpt-web-settings-trusted-contact-add-contact-safety.png`

### GAP-121 — Web Voice settings page is a fully disabled 'Coming soon' stub

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** web · missing-state
- **Reference:** ChatGPT · web · Voice

**Gap**

Reference shows a working live-voice-mode configuration screen: animated persona avatar, name + description, prev/next carousel with page dots, and Model / Intelligence / Language dropdowns. agiworkforce's web Voice settings page renders every row as 'Not available yet' behind a 'Coming soon' banner, with opacity reduced and pointer-events disabled — there is no functioning voice-mode configuration UI on web at all (desktop has a persona picker, which is a partial analog).

**Evidence**

apps/web/app/settings/voice/page.tsx — hasVoice = false hardcoded, all rows render 'Not available yet', section opacity 0.5 / pointerEvents 'none'

**Suggested fix**

Either ship the underlying managed voice feature and enable the page, or replace the fully-inert stub with an honest 'not yet available, here's what's coming' state that doesn't visually imitate a real settings panel — and long-term add persona preview + Model/Intelligence/Language controls matching the reference.

**Reference screenshot(s)**

- `chatgpt_reference/131-chatgpt-web-settings-voice-spruce-voice-model-picker.png`

### GAP-122 — Extension composer '+' menu missing file upload, Goal, Plan mode, and Plugins

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** extension · missing-control
- **Reference:** ChatGPT · Chrome extension · Composer '+' attach menu

**Gap**

ChatGPT's side-panel '+' menu has: 'Files and folders' upload, a 'Goal' item ('Set a goal to keep pursuing'), a 'Plan mode' toggle ('Turn plan mode on'), and a Plugins section (Documents, PDF, Spreadsheets, Presentations, Template Creator, Sites) each with a one-line capability description. AGIW's attachWrapper/attachMenu in side_panel.ts only has two items: 'Take a screenshot' and 'Add an image' — no general file/folder attachment, no persistent-goal concept, no plan mode, no plugin/tool catalog surfaced from the composer.

**Evidence**

apps/extension/src/side_panel.ts lines ~7421-7490 (attachMenu with screenshotItem, fileItem only); grep for 'Files and folders', 'Goal', 'Plan mode', 'Plugins' in side_panel.ts returned no matches.

**Suggested fix**

Extend the attach menu with a generic file/folder picker (not just images), add a 'Goal' entry that opens a small input to set/persist a background objective in the conversation, add a 'Plan mode' toggle wired to an existing planning/agent-loop flag if one exists, and surface the plugin/tool catalog (already present for web, cf. features/plugins/data/plugins) as a scrollable list inside this menu.

**Reference screenshot(s)**

- `chatgpt_reference/152-chatgpt-web-extension-attach-menu-files-goal-plugins.png`

### GAP-123 — No granular per-category browser permissions or CDP risk toggle for the extension

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** extension · missing-control
- **Reference:** Codex · macOS desktop · Settings > Computer use > Google Chrome

**Gap**

Codex exposes four independent permission categories for the Chrome computer-use integration (Approval, History, Downloads, Uploads), each with an 'Always allow'/'Always ask' dropdown, plus a 'Site permissions' override list (Add button, per-site rows) and a 'Developer mode: Enable full CDP access' toggle explicitly labeled 'Elevated risk' with explanatory copy about inspecting/controlling sensitive browser internals. AGIW's extension already implements a real CDP-based agent loop (features/computer-use/cdpDriver.ts, agentLoop.ts) but exposes only a flat per-origin allowlist (single allow/deny, no category breakdown) in options.ts, and no UI ever discloses that CDP access is happening or lets the user gate it.

**Evidence**

grep for 'Always allow', 'Always ask', 'Site permissions', 'CDP', 'DevTools Protocol' in apps/extension/src/options.ts and side_panel.ts — only a flat SITE_ALLOWLIST_KEY allow/deny list found (options.ts ~lines 16-624); cdpDriver.ts confirms CDP is used with no matching settings surface.

**Suggested fix**

Add a settings section that (a) splits the single allow flag into category-scoped controls (page navigation approval, history, downloads, uploads) each defaulting to 'Always ask', (b) lists per-site overrides with add/remove, and (c) adds an explicit 'Enable full CDP access' toggle with an elevated-risk warning banner, defaulting off, gating cdpDriver.ts's most invasive calls.

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

### GAP-128 — No background/cloud task list in the VS Code extension

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** extension-vscode · missing-screen
- **Reference:** Codex · VS Code extension · Cloud task handoff list

**Gap**

Reference shows a task card listing delegated runs with title, repo/owner, date, running spinner vs completed checkmark, and a per-task diffstat (+2 -20), plus the concept of sending work to run in the background. agiworkforce's extension can only fire a single fire-and-forget desktop-agent task from a QuickPick input box and never renders run state, history or results; the task list exists only on web.

**Evidence**

apps/extension-vscode/src/core/commandSetup.ts:604-626 ('run-task' input box) is the only task affordance; searched 'task|cloud|handoff|delegate|background' across apps/extension-vscode/src — no list/status UI. Web counterpart: apps/web/features/tasks/components/TasksPage.tsx, apps/web/app/tasks/page.tsx.

**Suggested fix**

Add a 'Tasks' collapsible section to the sidebar webview (and a matching TreeView) listing runs from the same source as apps/web/features/tasks with status icon, workspace/branch, relative time and +/- diffstat; add a 'Run in background' action on the composer that creates a task from the current prompt and streams its status back.

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

### GAP-131 — VS Code Configuration lacks runtime-backed approval and sandbox policy controls

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** extension-vscode · missing-control
- **Reference:** Codex · VS Code extension · Settings — Configuration (approval policy and sandbox)

**Gap**

The branded Configuration section now exposes user-scoped extension and bridge settings, and General exposes the consent-aware agent-mode control. It still has no allowed-directory editor, command allow/deny policy, or sandbox scope backed by the local runtime, so the durable enforcement rules remain undiscoverable and uneditable from VS Code.

**Evidence**

apps/extension-vscode/src/features/settings/settingsWebviewContent.ts renders Configuration and the agent-mode control, while platform/config.ts covers extension-owned settings only. Searched apps/extension-vscode/src for runtime-backed sandbox, allowed-directory, and command-policy configuration; no extension integration exists. Desktop counterparts remain AllowedDirectoriesSettings.tsx and AgentExecutionSettings.tsx.

**Suggested fix**

Extend the branded Configuration section only after the local app-server exposes a typed read/write policy contract: show allowed workspace directories, command allow/deny rules, and sandbox scope with copy naming the enforcing boundary. Do not mirror values that the runtime will ignore.

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

### GAP-133 — Hooks has an honest empty state but cannot enumerate or manage runtime hooks

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** extension-vscode · missing-screen
- **Reference:** Codex · VS Code extension · Settings — Hooks (empty state)

**Gap**

The branded VS Code Settings editor now includes a Hooks section and accurately states that hooks are local-runtime configuration rather than extension-owned cloud state. It cannot yet read configured hooks, show event/command/source/trust, refresh them, or disable an individual hook, so users still cannot audit code that may run on their machine.

**Evidence**

apps/extension-vscode/src/features/settings/settingsWebviewContent.ts renders the Hooks section, no-extension-hooks empty state, and documentation handoff. No protocol, localRuntimeClient capability, or command currently returns hook inventory to the extension.

**Suggested fix**

Add a typed app-server hook-inventory capability, then render event, command, source (config vs plugin), trust status, refresh, and per-hook disable in the existing Hooks section. Preserve the current empty state when the runtime reports no hooks.

**Reference screenshot(s)**

- `chatgpt_reference/020-codex-vscode-ext-settings-hooks-empty-state-no-hooks-found.png`

### GAP-134 — MCP Settings lacks a runtime server list, per-server toggle, config, and Add server

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** extension-vscode · missing-screen
- **Reference:** Codex · VS Code extension · Settings — MCP servers

**Gap**

The branded MCP servers section now makes the trust boundary explicit and retains the extension-owned cloud-utility master toggle. The local CLI remains runtime-owned, but the extension still cannot list its servers, show connected/failed state, disable one server, open its config, or add a server.

**Evidence**

apps/extension-vscode/src/features/settings/settingsWebviewContent.ts renders the MCP section, mcp.enabled master control, local-runtime ownership copy, and connector/docs handoffs. platform/config.ts exposes only mcp.enabled; localRuntimeClient and the settings protocol expose no per-server inventory or mutation contract.

**Suggested fix**

Add a typed local-runtime MCP status/config capability, then populate the existing section with connected/failed rows, per-server enable controls, configure actions, and an Add server flow. Keep the current global boolean scoped to cloud editor utilities.

**Reference screenshot(s)**

- `chatgpt_reference/018-codex-vscode-ext-settings-mcp-servers-server-toggle-list.png`

### GAP-135 — No provenance separation between user-configured and plugin-contributed MCP servers

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** extension-vscode · missing-ia
- **Reference:** Codex · VS Code extension · Settings — MCP servers, 'From plugins' section

**Gap**

Reference groups servers into user-configured 'Servers' (toggleable, configurable) and read-only 'From plugins' entries, so it is obvious which tools a plugin installed on the user's behalf. agiworkforce advertises that plugin-declared resources are 'tracked with their trust status' but no surface renders provenance: the extension has no server list at all, and the desktop plugin view lists installed plugins without showing which MCP servers or hooks they contribute.

**Evidence**

Claim: apps/web/app/features/plugins/page.tsx:63-65 ('Hooks declared by plugins are tracked with their trust status') and :34 (plugins bundle MCP server wiring). Implementation: searched apps/extension-vscode/src and apps/desktop/src/features/settings for a plugin-to-MCP mapping or trust-status field — none found; apps/desktop/src/features/settings/SkillsPluginsSettings.tsx lists plugins/commands/skills/agents only.

**Suggested fix**

Model provenance in the resolved-plugin data (source: user-config | plugin:<id>) and render two groups in the MCP list — user servers with toggles, plugin-contributed servers read-only with the owning plugin name and its trust status — then reuse the same grouping for plugin-declared hooks.

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

### GAP-137 — VS Code Plugins section cannot list or control installed plugins and skills

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** extension-vscode · missing-screen
- **Reference:** Codex · VS Code extension · Settings — Plugins list

**Gap**

The branded Settings editor now has a Plugins destination, an honest no-registry state, and explicit Web/docs handoffs. It still lacks a runtime-backed installed plugin or skill list, counts, provenance, enablement controls, and composer integration, so developers cannot inspect which local capabilities are active from the IDE.

**Evidence**

apps/extension-vscode/src/features/settings/settingsWebviewContent.ts renders the Plugins section and capability-honest empty state. No extension protocol or localRuntimeClient capability returns installed plugins, commands, skills, or agents; the desktop resolver and web catalogue remain separate implementations.

**Suggested fix**

Expose a typed installed-capability inventory from the local runtime, then populate the existing Plugins section with counts, provenance, availability, per-item controls where enforcement exists, and a catalogue handoff. Keep the no-registry state when that capability is absent.

**Reference screenshot(s)**

- `chatgpt_reference/021-codex-vscode-ext-settings-plugins-documents-pdf-sites-chrome-list.png`

### GAP-138 — No per-surface 'unavailable here' state for surface-bound capabilities

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** extension-vscode · missing-state
- **Reference:** Codex · VS Code extension · Settings — Plugins, 'Unavailable in this context'

**Gap**

Reference keeps surface-incompatible plugins visible but dims the name and appends 'Unavailable in this context' (Browser, Computer Use inside the IDE), so the capability is discoverable without pretending it works. agiworkforce ships genuinely surface-bound capabilities (computer use, browser control, Chrome extension features, desktop bridge) but has no such state anywhere — which is exactly the 'fake availability badge' failure its own rules forbid.

**Evidence**

Searched apps/extension-vscode/src, apps/desktop/src and apps/web/features for 'Unavailable in this context|not available on this surface|notSupportedHere' — zero matches. Surface-bound features exist at apps/desktop/src/features/computer-use, apps/desktop/src/features/settings/tabs/AgiInChrome/index.tsx and apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts.

**Suggested fix**

Add a per-capability availability descriptor keyed by surface (web / desktop / mobile / extension / extension-vscode) and render unsupported entries dimmed with an inline 'Unavailable in this context' label and a tooltip naming the surface where it does run, instead of hiding them or showing an enabled control that silently fails.

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

### GAP-195 — Empty-state headline never names the active workspace

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-copy
- **Reference:** Codex · macOS desktop · Chat empty state headline

**Gap**

The reference asks 'What should we build in <repo>?' with the repo name underlined and clickable, tying the blank canvas to a concrete scope. agiworkforce shows a generic 'Good morning, <name>' with a workforce subline; nothing in the empty state tells the user which folder or project the next message will operate on.

**Evidence**

apps/desktop/src/features/chat/BrandedGreeting.tsx:20-51 (greeting templates); apps/desktop/src/features/v3/EmptyChat.tsx

**Suggested fix**

When a folder/project is scoped, replace the subline with 'What should we build in <folder>?' where the folder name opens the folder picker; fall back to the greeting subline when no scope is set.

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

### GAP-205 — No quick-start category chips (Code / Write / Learn / Life stuff / surprise-me) on empty home screen

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Claude · macOS desktop · Home launcher — quick-action category chips

**Gap**

Claude's empty Chat-mode home screen shows a row of category chips below the composer (Code, Write, Learn, Life stuff, Claude's choice) that seed a starter prompt for that category. agiworkforce's BrandedGreeting/EmptyChat screens have no such chips.

**Evidence**

apps/desktop/src/features/chat/BrandedGreeting.tsx (full file reviewed — greeting only, no chip row); apps/desktop/src/features/v3/EmptyChat.tsx (renders only BrandedGreeting)

**Suggested fix**

Add a row of suggestion category chips below the composer in EmptyChat.tsx that populate the input with a category-appropriate starter prompt on click.

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

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-copy
- **Reference:** Codex · macOS desktop · Remote pairing modal — Computer tab

**Gap**

The reference states the exact destination: 'Click Add in the Settings > Connections > Control other devices tab on your other computer and enter this code'. agiworkforce's card only says 'Open AGI Workforce on your phone, tap Menu -> Pair with Desktop, and scan the code' — the printed 12-char code has no stated purpose, and the phone's actual entry point is the drawer companion widget, not a 'Menu -> Pair with Desktop' item.

**Evidence**

apps/desktop/src/features/mobile-companion/QRPairingCard.tsx lines 70-83 and 101-116; apps/mobile navigation entry points are apps/mobile/src/shared/components/DesktopCompanionWidget.tsx:375 and ConnectionStatus.tsx:64

**Suggested fix**

Rewrite the card copy to name the real mobile path and add a line under the code explaining it can be typed on the phone's 'Enter code manually' screen; keep the copy in sync with the mobile route label.

**Reference screenshot(s)**

- `chatgpt_reference/035-codex-macos-settings-connections-remote-pairing-computer-tab-pairing-code.png`

### GAP-211 — Pairing card has no Phone/Computer tabs, no enlarge-QR, and no copy-code button

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-control
- **Reference:** Codex · macOS desktop · Remote pairing modal — Phone tab

**Gap**

The reference pairing modal has a Phone | Computer segmented control, a QR with expand-to-fullscreen and refresh icon buttons, and (on the Computer tab) a copy button for the typed code. agiworkforce's QRPairingCard renders a fixed 192px QR plus a text code with only a 'Refresh code' button — no enlarge (hard to scan on a hidpi display at that size), no copy, and no alternative pairing target.

**Evidence**

apps/desktop/src/features/mobile-companion/QRPairingCard.tsx lines 85-144

**Suggested fix**

Add a segmented Phone/Computer control, an expand-QR affordance that opens the data URL at full dialog width, and a copy-to-clipboard icon button next to the pairing code.

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

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-interaction
- **Reference:** Codex · macOS desktop · Settings search

**Gap**

Typing 'remo' in the reference returns section rows each annotated with the specific matching setting ('Connections → Remote control', 'Appearance → Reduce motion', 'Worktrees → Recommended for most users…'), so the user can jump straight to a control. agiworkforce filters the nav list by section label/key/keyword and shows nothing about which control matched, so searching a setting whose section name differs from its own name fails or lands the user on a long tab to scan manually.

**Evidence**

apps/desktop/src/features/settings/SettingsPanel.tsx lines 213-230 (filteredNavGroups matches item.label / item.key / item.keywords) and lines 747-780 (renders section buttons only)

**Suggested fix**

Build a flat searchable index of individual settings (id, label, description, tab, anchor), render matched setting rows under each section in the sidebar, and on click switch tab + scroll/highlight the anchored control.

**Reference screenshot(s)**

- `chatgpt_reference/052-codex-macos-settings-connections-search-remote-control-connected-modal.png`

### GAP-234 — Desktop settings search matches only section names, not individual settings

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-interaction
- **Reference:** Codex · macOS desktop · Settings search results

**Gap**

Typing 'remo' in the reference returns matched settings grouped under their section (Connections > Remote control, Appearance > Reduce motion, Keyboard shortcuts > Redo…, General > The legacy WSL agent environment…), including matches on setting descriptions. agiworkforce filters only the nav item label/key/keywords, so a query that matches a control's own label or help text yields 'No settings found'.

**Evidence**

apps/desktop/src/features/settings/SettingsPanel.tsx lines 213-228 (filter on item.label / item.key / item.keywords) and 730-745 (search input)

**Suggested fix**

Build a static index of setting rows (id, section, label, description) exported from @agiworkforce/ui, render matched rows beneath their section in the search results, and scroll/highlight the row on selection.

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

### GAP-255 — Desktop empty chat has no starter action list, unlike web's greeting chips

- **Status:** Open
- **Owner:** Unassigned
- **Surface/type:** desktop · missing-copy
- **Reference:** ChatGPT · macOS desktop · Work mode empty state — quick actions

**Gap**

The reference offers three capability-shaped starters under the composer — 'Create a file or build a site', 'Research and plan next steps', 'Automate routine and recurring work' — each an entry point to a different product mode. agiworkforce's desktop EmptyChat renders BrandedGreeting alone (headline + subline), while web's WebEmptyChat wires GreetingBanner suggestion chips into the draft. The same product shows a first-run affordance on web and a blank screen on desktop.

**Evidence**

apps/desktop/src/features/v3/EmptyChat.tsx (renders only <BrandedGreeting/>); apps/desktop/src/features/chat/BrandedGreeting.tsx (greeting templates, no chips); apps/web/features/chat/v3/WebEmptyChat.tsx + features/chat/components/GreetingBanner/GreetingBanner.tsx:20-26 (SuggestionChip CHIPS that prefill the composer)

**Suggested fix**

Lift GreetingBanner's chip list into a shared constant and render it in desktop EmptyChat wired to the draft store, tailoring the entries to the desktop's capabilities (artifacts, deep research, scheduled tasks) so each chip routes to a real surface.

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
