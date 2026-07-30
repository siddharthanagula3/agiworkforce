#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  parseCsv,
  renderUiGapsMarkdown,
  serializeCsv,
  sortUiGaps,
  SOURCE_UI_GAP_COLUMNS,
  UI_GAP_COLUMNS,
} from './ui-gaps-lib.mjs';

const root = process.cwd();
const csvPath = path.join(root, 'audit/ui-gaps.csv');
const markdownPath = path.join(root, 'audit/ui-gaps.md');

function fail(message) {
  console.error(`UI gap import failed: ${message}`);
  process.exit(1);
}

function normalizeMachineLocalPaths(value) {
  return value
    .replaceAll('/tmp/agiw_strings.md', 'the audit source strings snapshot')
    .replaceAll('/tmp/agiw_inventory.md', 'the audit source inventory snapshot')
    .replaceAll('/tmp/agiw/', '');
}

function reconcileCurrentPremises(record) {
  const currentOverrides = {
    'GAP-001': {
      status: 'Done',
      owner: 'Mobile',
      title: 'Mobile exposes a supported Managed Cloud Skills catalog',
      detail:
        'The reference gives Skills a first-class screen with navigation, search, source context, and a useful empty state. agiworkforce Mobile now exposes the authenticated deployment catalog as an explicitly read-only Managed Cloud surface. It never presents host installation controls that Mobile cannot support and never calls the Cloud catalog from Local Mode.',
      evidence:
        'apps/mobile/src/features/skills/service.ts validates the authenticated /api/skills metadata contract. SkillsScreen.tsx enforces Clerk sign-in and Cloud mode before fetching, renders search, source badges, loading/error/refresh states, and a teaching empty state. app/(app)/skills/index.tsx and the authenticated drawer layout register the route; DrawerContent.tsx exposes the Cloud-tagged destination. skills-service.test.ts, skills-page.test.tsx, drawer-content.test.tsx, and drawer-route-contract.test.ts cover the contract, Local no-egress gate, navigation, search, empty/error states, and route ownership.',
      suggestedFix:
        'Completed for the supported read-only Managed Cloud catalog. Keep Mobile installation and mutation controls absent until a separate owner-scoped backend lifecycle exists; retain the explicit Local/Cloud boundary and runtime response validation when the catalog contract evolves.',
    },
    'GAP-002': {
      status: 'Done',
      owner: 'Desktop',
      title: 'Desktop requires task-scoped consent before local tools access new folders',
      detail:
        'The Desktop tool executor now stops every recognized local path-bearing tool before it can cross the Allowed Directories boundary. A native-authoritative consent request lists the exact canonical targets, grant roots, and read, modify, or execute capabilities. Access is limited to the active chat task by default; only the unchecked Remember option persists the roots in Settings.',
      evidence:
        'apps/desktop/src-tauri/src/core/llm/tool_executor/mod.rs performs path extraction, canonical resolution, protected-path rejection, explicit consent, and post-approval enforcement revalidation before dispatch. tool_confirmation.rs keeps the native request authoritative, manages task-only and persisted grants, and synchronizes ToolGuard plus the live filesystem MCP server; App.tsx revokes task grants on new-chat and conversation changes. FolderAccessConsentDialog.tsx is mounted by McpToolConfirmationPrompt.tsx with Cancel autofocus, exact targets and roots, capability disclosure, and an unchecked persistent-grant option. GAP-002-folder-access-consent.test.tsx, agentWorkflowEvents.test.ts, and the named gap_002, folder_request, session_folder_grants, and empty_allowed_paths_update Rust tests cover the contract and enforcement seams.',
      suggestedFix:
        'Completed. Keep every new local path-bearing tool on this native authorization boundary, never trust renderer-supplied paths or tool names, revoke task-only grants when the active chat changes, and persist roots only after the explicit Remember option succeeds natively.',
    },
    'GAP-003': {
      status: 'Done',
      owner: 'Desktop',
      title: 'Desktop keeps workflow capture controls visible in a detached recorder HUD',
      detail:
        'Desktop now opens a fixed, transparent, always-on-top recorder window as soon as native workflow capture starts. The compact HUD remains visible over other applications with authoritative elapsed time and step count, local narration state and input level, Discard, Done, and a temporary global stop shortcut. The main recorder panel remains the review and skill-creation surface, including recovery when the panel remounts after capture.',
      evidence:
        'apps/desktop/src/services/recorderHudWindow.ts creates and positions the recorder-hud WebviewWindow with decorations disabled, transparency, always-on-top, fixed bounds, taskbar exclusion, and CommandOrControl+Shift+. registration. RecorderHud.tsx consumes native status/action/lifecycle events and exposes live count, timer, a default-off local Whisper narration control with a 24-bar meter, true Discard, and Done. recorder.rs owns status, discard, completed-recording recovery, and timestamped narration actions; ActionRecorder.tsx synchronizes those native lifecycle events into the main review flow. recorder-hud.json grants only event listening and self-close permissions. RecorderHud.test.tsx, useRecorderNarration.test.ts, recorderHudWindow.test.ts, ActionRecorder.test.tsx, and recorder.rs tests cover the UI, audio, window, shortcut, recovery, and native lifecycle contracts.',
      suggestedFix:
        'Completed. Keep native recorder state authoritative, fail capture closed if the HUD or temporary stop shortcut cannot open, and retain the minimal recorder-hud capability. The narrower persisted narration-track and nearest-step attachment lifecycle remains tracked separately in GAP-060.',
    },
    'GAP-004': {
      status: 'Done',
      owner: 'Desktop',
      title: 'Desktop Connections exposes the supported mobile-control pairing workflow',
      detail:
        "The reference dedicates a Connections settings page to remote-control management. agiworkforce now has a canonical, searchable Connections destination in the mounted Desktop Settings panel. It exposes the product's supported contract—pairing the mobile app to monitor this Mac and respond to agent approvals—without presenting unimplemented outbound-device or SSH controls.",
      evidence:
        'packages/ui/ui/src/settings-nav.ts registers Connections in the shared Desktop settings navigation. apps/desktop/src/features/settings/tabs/Connections/index.tsx mounts the production MobileCompanionPanel, whose QRPairingCard and RemoteApprovalCard use the authenticated signaling/WebRTC connectionStore and live tool approval state. SettingsPanel.tsx renders the tab; the duplicate features/experimental/MobileCompanionPanel.tsx is removed. GAP-004-connections-settings.test.tsx and SettingsPanel.render.test.tsx verify the nav, mounted panel, and single implementation owner.',
      suggestedFix:
        'Completed for the supported control-this-Mac workflow. Add outbound device control or SSH tabs only after those runtimes have real lifecycle, persistence, and revocation contracts; keep the remaining multi-device management work tracked in GAP-096.',
    },
    'GAP-005': {
      status: 'Done',
      owner: 'Desktop',
      evidence:
        'Duplicate GAP-005 is closed by the same canonical Connections nav entry, mounted ConnectionsTab, production MobileCompanionPanel, and removal of the experimental duplicate recorded in GAP-004.',
      suggestedFix:
        'Duplicate disposition complete; retain GAP-004 as the canonical P0 record and GAP-096 for the narrower remaining multi-device scope.',
    },
    'GAP-006': {
      status: 'Done',
      owner: 'Desktop',
      title: 'Cowork Dispatch has an authenticated task lifecycle and authoritative settings',
      detail:
        'Desktop now has a searchable Cowork settings destination whose persisted, default-off Dispatch switch is the execution authority for new tasks from a paired phone. Mobile can compose and cancel a new Desktop task; the signed, versioned contract returns accepted, queued, running, review, completed, failed, cancelled, or rejected state. The same authenticated channel answers agent refreshes with current Desktop task snapshots. Unsupported storage-location, trusted-folder, cloud-run, and global-instruction controls remain absent because no matching runtime consumer exists.',
      evidence:
        'packages/contracts/types/src/cross-device.ts defines dispatch.task.create, dispatch.task.cancel, and dispatch.task.status. apps/desktop/src/services/coworkDispatch.ts validates bounded payloads, gates creation through coworkDispatchStore, submits to the production agentTaskStore, mirrors lifecycle and agent snapshots, and permits cancellation after Dispatch is disabled. App.tsx owns the runtime listener. packages/ui/ui/src/settings-nav.ts and both Local and Cloud Desktop settings render tabs/Cowork with the persisted authority switch and live pairing state. apps/mobile/services/companion.ts, dispatchTaskStore.ts, DispatchTaskComposer.tsx, and the enabled companion flags provide the paired Mobile create/cancel/status UI. coworkDispatch.test.ts, CoworkTab.test.tsx, dispatch-defense.test.ts, and wave1-control-relay.test.ts cover validation, default-deny, execution, status, cancellation, navigation, and Mobile transport.',
      suggestedFix:
        'Completed for paired-device local Desktop execution. Keep Dispatch default-off and HMAC-authenticated, preserve bounded versioned payload validation and cancellation while disabled, and add storage, trusted folders, cloud execution, or global instructions only when those settings have authoritative runtime consumers.',
    },
    'GAP-007': {
      status: 'Done',
      owner: 'Desktop',
      title: 'Archived chats are recoverable from the mounted Desktop sidebar',
      detail:
        'The reference exposes Archived chats as a recoverable destination. The mounted Desktop V3 sidebar now provides an Archived chats view with a visible count, time-grouped archived records, a return-to-active control, and an empty state. Archived chats can be opened, restored, or permanently deleted through the existing persistent chat-store actions.',
      evidence:
        'apps/desktop/src/features/v3/Sidebar.tsx switches the live conversation list between active and archived records and passes restoreConversation into each archived row. ConversationRow.tsx replaces active-only actions with Restore and a two-step Delete permanently action for archived records. GAP-007-archived-chats.test.tsx verifies active/archived filtering, opening, restore dispatch, and confirmed permanent delete.',
      suggestedFix:
        'Completed. Keep archive, restore, and permanent deletion on the existing chat-store persistence boundary, and preserve the named GAP-007 interaction test when the sidebar information architecture changes.',
    },
    'GAP-008': {
      status: 'Done',
      owner: 'Desktop',
      title: 'Full-access sandbox selection requires confirmation and complete risk disclosure',
      detail:
        'The reference explains each permission tier and requires a deliberate confirmation before full access. agiworkforce now preserves the existing tier descriptions and gates every supported transition to unsandboxed terminal execution: turning the sandbox off, choosing the Disabled runtime backend, or selecting Danger full access. None of those settings persist until the user explicitly confirms.',
      evidence:
        "apps/desktop/src/features/settings/AgentExecutionSettings.tsx intercepts all three unsandboxed transitions and presents a cancelable danger dialog before mutating settings. The dialog names loss of workspace and network-domain restrictions, access outside the workspace through the app's OS account, prompt-injection, data-loss, and sensitive-data exposure risks. It also states accurately that disabling the process sandbox does not bypass separate agent approvals or expand OS permissions. AgentExecutionSettings.test.tsx verifies delayed persistence, cancellation, and the equivalent Disabled-backend path.",
      suggestedFix:
        'Completed. Keep every future path to unsandboxed terminal execution behind this shared confirmation boundary, and update the disclosure whenever the actual sandbox or approval contract changes.',
    },
    'GAP-009': {
      status: 'Done',
      owner: 'Desktop',
      title: 'Desktop memory controls enforce one Local and Managed Cloud privacy policy',
      detail:
        'The mounted Desktop Memory tab now exposes the reference control set: an authoritative master switch, a separately gated tool-assisted-generation opt-in, and confirmed destructive reset. The same policy drives Local native memory and Managed Cloud account memory; turning it off blocks automatic retrieval and generation while leaving manual review, edit, and deletion available.',
      evidence:
        'apps/desktop/src/features/settings/tabs/Memory.tsx mounts the master, tool-assisted scope, reset, native SQLite adapter, and Managed Cloud adapter. settingsStore.ts persists one fail-closed policy and managedCloudSettingsSync.ts synchronizes the account-safe capability namespace. Native chat streaming/non-streaming, memory tools, direct project-memory loading, project auto-save, and scheduled summarization enforce the policy; the Web managed-memory request path enforces the same account setting. The two orphan localStorage-only memory panels are removed. GAP-009-memory-controls.test.tsx, settingsStore.test.ts, managedCloudSettingsSync.test.ts, request-processor.memory.test.ts, and the named Rust memory-policy tests cover the mounted controls and enforcement seams.',
      suggestedFix:
        'Completed. Keep automatic retrieval and every generation entry point behind the fail-closed master policy, require explicit opt-in for tool-assisted generation, preserve manual deletion while disabled, and extend the named GAP-009 tests whenever a new memory pipeline is added.',
    },
    'GAP-010': {
      status: 'Done',
      owner: 'Web',
      title: 'Web exposes authenticated, durable managed Code sessions',
      detail:
        'The production Web chat sidebar and secondary app shell now expose Chat and Code as first-class destinations. The authenticated Code surface creates tenant-owned, persistent managed environments, optionally clones a public GitHub repository, attaches to a bounded terminal journal, runs commands, and closes sessions explicitly. It remains capability-honest when the E2B cut-over, plan entitlement, or database migration is unavailable and never claims access to local files or credentials.',
      evidence:
        'apps/web/app/chat/code/page.tsx and features/code/CloudCodePage.tsx provide responsive loading, unavailable, empty, create, attach, running, error, terminal-history, and confirmed-close states. WebChatPage.tsx, WebAppShell.tsx, and the v3 WebSidebar expose the real /chat/code destination. /api/code/sessions and cloud-code-session-service.ts enforce Clerk/RLS ownership, CSRF, user-keyed rate limits, active-plan sandbox ceilings, idempotent creation, atomic command state transitions, bounded output, and strict public GitHub URLs. Migration 0075 forces RLS over the session and terminal journal. The E2B lifecycle isolates Code mappings from conversations, defaults egress off, allowlists GitHub/npm/PyPI for Trusted hosts, requires server-validated acknowledgement for Full network, pauses after each request, meters compute, and supports reclaim. Focused UI/API/service/runtime/migration tests and the full Web suite cover these seams; production build plus authenticated desktop- and mobile-viewport browser passes verify the mounted route and live Chat-to-Code navigation.',
      suggestedFix:
        'Completed for bounded managed terminal sessions. Apply migration 0075 and provision AGI_E2B_EXECUTION=1 plus E2B_API_KEY before enabling creation in a deployment. Keep private-repository credentials, arbitrary secret injection, collaborative PTY streaming, and long-lived service previews out until each has an explicit credential, approval, egress, billing, and revocation contract.',
    },
    'GAP-011': {
      status: 'Done',
      owner: 'VS Code',
      detail:
        'The reference gates full-access escalation behind a modal that names filesystem, terminal, network/tool, sensitive-data, and prompt-injection risks and requires an explicit confirmation. agiworkforce now applies the same boundary to every supported VS Code mode mutation path, including command pickers, Shift+Tab cycling, sidebar messages, raw Settings edits, and activation-time reconciliation.',
      evidence:
        'apps/extension-vscode/src/features/permissions/agentModeConsent.ts is the sole agent.mode write boundary. It persists versioned consent only while bypass remains active, fails unconfirmed bypass closed to Auto, reverts raw settings edits before prompting, and provides explicit Cancel/Confirm actions with scope and risk copy. Config.agentMode and ChatStateManager enforce the consent state at read/dispatch time. agentModeConsent.test.ts covers cancellation, confirmation, raw-setting reconciliation, and consent revocation.',
      suggestedFix:
        'Completed. Keep all future agent-mode mutation paths on setAgentModeWithConsent, retain the raw-setting reconciliation listener, and increment the consent version whenever the granted scope or risk contract changes.',
    },
    'GAP-096': {
      title: 'Connections mounts live pairing, but multi-device management remains incomplete',
      detail:
        'The reference combines inbound control, outbound devices, SSH, paired-device history, last-connected timestamps, and access revocation. agiworkforce now mounts its real inbound mobile-control pairing and approval workflow in Settings > Connections. The remaining gap is narrower: existing connected-device management is still separate, and no supported outbound-device or SSH runtime exists.',
      evidence:
        'apps/desktop/src/features/settings/tabs/Connections/index.tsx mounts MobileCompanionPanel for the supported control-this-Mac flow. packages/ui/ui/src/settings-nav.ts makes Connections searchable and reachable. TeamAccountSettings.tsx still owns a separate Connected Devices list, while current code has no production outbound-device or SSH session contract.',
      suggestedFix:
        'Move the real connected-device history and revoke controls into Connections, backed by the same device/session source of truth. Add Control other devices and SSH tabs only alongside implemented connection runtimes, not as placeholder settings surfaces.',
    },
  };

  return currentOverrides[record.id] ? { ...record, ...currentOverrides[record.id] } : record;
}

function mergeKnownDuplicate(records) {
  const primary = records.find((record) => record.id === 'GAP-004');
  const duplicate = records.find((record) => record.id === 'GAP-005');
  if (!primary || !duplicate) fail('expected duplicate pair GAP-004/GAP-005 was not found');
  if (primary.status !== duplicate.status) fail('GAP-004/GAP-005 have conflicting statuses');

  primary.evidence = `${primary.evidence}\n\nIndependent duplicate evidence (GAP-005): ${duplicate.evidence}`;
  primary.suggestedFix = `${primary.suggestedFix}\n\nIndependent duplicate recommendation (GAP-005): ${duplicate.suggestedFix}`;
  primary.image = [...new Set([primary.image, duplicate.image])].join(';');
  primary.mergedFrom = 'GAP-005';
  if (primary.owner === 'Unassigned' && duplicate.owner !== 'Unassigned') {
    primary.owner = duplicate.owner;
  }

  return records.filter((record) => record.id !== duplicate.id);
}

function writeArtifacts(records) {
  const sorted = sortUiGaps(records);
  const csv = serializeCsv(sorted);
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  fs.writeFileSync(csvPath, csv);
  fs.writeFileSync(markdownPath, renderUiGapsMarkdown(sorted, csv));
  console.log(`Wrote ${sorted.length} records to audit/ui-gaps.csv and audit/ui-gaps.md.`);
}

if (process.argv[2] === '--render') {
  if (!fs.existsSync(csvPath)) fail('audit/ui-gaps.csv does not exist');
  const parsed = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  if (JSON.stringify(parsed.columns) !== JSON.stringify(UI_GAP_COLUMNS)) {
    fail('audit/ui-gaps.csv does not use the canonical schema');
  }
  writeArtifacts(parsed.records);
  process.exit(0);
}

const sourcePath = process.argv[2];
if (!sourcePath) {
  fail('pass the source CSV path, or use --render to regenerate Markdown');
}
if (!fs.existsSync(sourcePath)) fail(`source CSV does not exist: ${sourcePath}`);

const parsed = parseCsv(fs.readFileSync(sourcePath, 'utf8'));
if (JSON.stringify(parsed.columns) !== JSON.stringify(SOURCE_UI_GAP_COLUMNS)) {
  fail(`unexpected source columns: ${parsed.columns.join(', ')}`);
}

const normalized = parsed.records.map((sourceRecord) => {
  const record = Object.fromEntries(
    UI_GAP_COLUMNS.map((column) => [
      column,
      normalizeMachineLocalPaths(sourceRecord[column] ?? ''),
    ]),
  );
  record.owner = record.owner.trim() || 'Unassigned';
  return reconcileCurrentPremises(record);
});

writeArtifacts(mergeKnownDuplicate(normalized));
