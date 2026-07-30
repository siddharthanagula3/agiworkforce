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
      title: 'Mobile has no supported Skills screen or workflow',
      detail:
        "The reference gives Skills a first-class screen: sidebar entry, surface selector, search, and an empty state that explains the next step. agiworkforce mobile currently has no Skills route, navigation entry, supported mobile Skills client, list, search, or empty state. The source audit's claim that a shipped mobile skills service/store was waiting to be mounted is stale: those disconnected artifacts were removed because they had no supported runtime contract.",
      evidence:
        'No Skills route exists under apps/mobile/app or apps/mobile/src/features. Current searches for useSkillsStore, listSkills, and a mobile skills service return no supported implementation; Web and Desktop Skills surfaces do not establish a Mobile API or product contract.',
      suggestedFix:
        'Treat Mobile Skills as a new cross-surface capability, not an orphan-mount task: approve the product/API contract first, then add a supported client, route, drawer entry, searchable installed/catalogue views, and a useful empty state. Do not restore the removed disconnected service/store.',
    },
    'GAP-002': {
      detail:
        'Claude shows a task-scoped modal listing the exact resolved paths an agent is about to read, modify, or execute within, with Cancel/Allow and an optional persistent grant. agiworkforce has a static allowed-directory settings surface and a CloudFolderAttachSheet that explicitly gates managed-cloud file attachment egress, but neither is a just-in-time gate for a local agent tool call that introduces a new path.',
      evidence:
        'apps/desktop/src/features/settings/AllowedDirectoriesSettings.tsx manages persistent folders. apps/desktop/src/features/context-handoff/CloudFolderAttachSheet.tsx gates files leaving the device in Managed Cloud. No FolderAccessConsent-style surface is wired into the local filesystem/tool-call path before a previously unapproved resolved directory is accessed.',
      suggestedFix:
        "Add a task-scoped FolderAccessConsentDialog at the local filesystem/tool-call authorization boundary. List resolved paths and requested capabilities, default to Cancel, and only persist a grant when the user explicitly selects a 'remember these folders' option that updates AllowedDirectoriesSettings.",
    },
    'GAP-003': {
      detail:
        "The reference floats a small always-on-top pill over every application while capture runs: recording state, live step count, microphone control, Discard, and Done. agiworkforce still renders ActionRecorder only as the DesktopShellV3 'record-skill' panel. Generic always-on-top and overlay infrastructure exists, but no recorder-specific secondary window mounts controls or subscribes to the recorder event stream.",
      evidence:
        "apps/desktop/src/features/automation/ActionRecorder.tsx owns the live controls and automation:action_recorded listener; apps/desktop/src/features/v3/DesktopShellV3.tsx mounts it only for activePanel === 'record-skill'. apps/desktop/src-tauri/src/ui/overlay/window.rs proves an overlay window primitive exists, but searches find no RecorderHud or recorder overlay integration.",
      suggestedFix:
        'Create a recorder-specific secondary Tauri window using the existing overlay/window primitives. Mount a RecorderHud subscribed to the same event stream, expose step count/mic/Discard/Done, keep the main panel as review, and add a global stop shortcut.',
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
      title: 'Cowork Dispatch lacks an execution lifecycle and authoritative settings surface',
      detail:
        "The reference exposes a full Cowork settings section whose controls govern real dispatch, storage, trusted-folder, cloud-run, and instruction lifecycles. agiworkforce has an HMAC transport helper in services/dispatch.ts and connectionStore verifies mobile control envelopes, but the source audit's claim that Dispatch is wired into the runtime/chat layer is stale: verified controls are emitted as mobile-companion:control events with no consumer, and the current mobile companion sends commands for existing agents rather than a new-task dispatch request. No Cowork settings surface can truthfully control this yet.",
      evidence:
        'apps/desktop/src/services/dispatch.ts derives, verifies, signs, rotates, and resets HMAC session keys only. apps/desktop/src/stores/connectionStore.ts dispatches a mobile-companion:control CustomEvent after verification. Current code search finds no listener for that event. apps/mobile/services/companion.ts sends sync_request, approval_response, heartbeat, cancel, and agent-command dispatch_request messages; it does not expose a new Cowork task dispatch flow.',
      suggestedFix:
        'Define and implement the cross-surface Dispatch execution contract first: validated new-task payload, Desktop consumer, response/status protocol, enable/disable lifecycle, persistence, and cancellation. Then add a Cowork settings destination whose Dispatch control gates that consumer. Add storage location, trusted folders, cloud-run defaults, and global instructions only with their runtime consumers; do not mount inert settings.',
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
      detail:
        'The reference exposes a master memory switch, memory-generation scope, and reset. The mounted Desktop Settings tab renders only the shared MemoryEditor for fact management. A separate legacy features/memory/MemoryPanel contains localStorage-backed enable/pause/auto-inject controls but has no consumer and does not establish a shared generation/retrieval policy, so mounting it would create another settings façade rather than close the privacy-control gap.',
      evidence:
        'apps/desktop/src/features/settings/tabs/Memory.tsx mounts MemoryEditor only. apps/desktop/src/features/memory/MemoryPanel.tsx contains isEnabled/isPaused controls, but current imports find no consumer outside its own file. No single Desktop capability store gates both memory generation and retrieval across Local and Managed Cloud.',
      suggestedFix:
        'Define one mode-aware memory policy contract that gates generation and retrieval, wire it into the actual memory pipelines, then expose master enable, tool-assisted-generation scope, and destructive reset controls in the mounted Memory settings tab. Remove the orphan localStorage-only panel instead of mounting non-authoritative toggles.',
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
