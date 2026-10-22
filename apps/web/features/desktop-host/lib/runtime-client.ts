'use client';

import {
  BROWSER_SIGN_IN_START,
  BROWSER_SIGN_IN_CANCEL,
  BROWSER_SIGN_IN_STATE,
  type PendingBrowserSignIn,
  DEVELOPER_COMMAND_NEEDS_UPDATE,
  DEVICE_REGISTRY_PROFILE_COMMAND,
  DISPATCH_TASK_REPORT,
  DISPATCH_TASK_RUNNER_READY,
  DesktopRuntimeError,
  assertLocalTurnCarriesNoAttachments,
  developerApprovalAllows,
  getHostBridge,
  type ApplicationOpenResult,
  type BackgroundActivity,
  type BackgroundShellOutput,
  type BackgroundWorkKind,
  type BrowserActivityEntry,
  type BrowserPairingState,
  type ClipboardSnapshot,
  type ComputerUseStatus,
  type DesktopCapability,
  type DesktopPermissionsReview,
  type DeviceRegistryProfile,
  type DispatchTaskReport,
  type PermissionDecision,
  type PermissionScope,
  type SystemPermissionKind,
  type RemoteControlStartRequest,
  type RemoteControlState,
  type FileEntry,
  type FileBinaryContent,
  type FileSearchMatch,
  type FileTextContent,
  type FileTextWrite,
  type LocalChatMessage,
  type LocalChatResult,
  type LocalModel,
  type LocalModelSettings,
  type LocalModelSnapshot,
  type DeveloperApprovalAnswer,
  type DeveloperClientCapability,
  type DeveloperMcpApprovalReview,
  type DeveloperMcpServerAwaitingApproval,
  type DeveloperRuntimeModels,
  type DeveloperRuntimeStatus,
  type LocalDeveloperSession,
  type DeveloperSessionEvent,
  type DeveloperSessionList,
  type DeveloperSessionStartRequest,
  type DeveloperSessionTranscript,
  type DeveloperThreadDeleteRequest,
  type DeveloperThreadForkRequest,
  type DeveloperThreadCompactRequest,
  type DeveloperTurnRequest,
  type DeveloperTurnSteer,
  type DeveloperUserInputAnswer,
  type LocalBranchPush,
  type LocalBranches,
  type ShellPolicy,
  type ShellRunResult,
  type StartedDeveloperSession,
  type WorkingTreeChanges,
  type WorkspaceRoot,
  type WorkspaceRootKind,
} from '@agiworkforce/local-runtime-contract';
import type { BrowserPageSummary, BrowserTabSummary } from '@agiworkforce/types';
import type {
  MemoryAddResponse,
  PluginSummary,
  SkillSummary,
  ThreadCompactResponse,
  ThreadDeleteResponse,
} from '@agiworkforce/types/protocol';

const NO_HOST_MESSAGE = 'Local access is only available in AGI Desktop.';

export class DesktopHostUnavailable extends Error {
  constructor() {
    super(NO_HOST_MESSAGE);
    this.name = 'DesktopHostUnavailable';
  }
}

/**
 * Unwraps the runtime's result envelope. A refusal becomes a
 * `DesktopRuntimeError` carrying the capability the caller would need, so a
 * permission denial reads differently from a missing file at the call site.
 */
async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const host = getHostBridge();
  if (!host) throw new DesktopHostUnavailable();

  const response = await host.invokeRuntime<T>(command, args);
  if (response.ok) return response.value;
  if (response.error.code === 'unknown-command' && command.startsWith('developer_')) {
    throw new DesktopRuntimeError({ ...response.error, message: DEVELOPER_COMMAND_NEEDS_UPDATE });
  }
  throw new DesktopRuntimeError(response.error);
}

export function listWorkspaceRoots(): Promise<WorkspaceRoot[]> {
  return invoke<WorkspaceRoot[]>('workspace_list_roots');
}

export function pickWorkspaceRoot(kind: WorkspaceRootKind = 'folder'): Promise<WorkspaceRoot> {
  return kind === 'folder'
    ? invoke<WorkspaceRoot>('workspace_pick_root')
    : invoke<WorkspaceRoot>('workspace_pick_root', { kind });
}

export function openWorkspaceInEditor(rootId: string): Promise<ApplicationOpenResult> {
  return invoke<ApplicationOpenResult>('app_open_in_editor', { rootId });
}

export function readWorkspaceText(rootId: string, path: string): Promise<FileTextContent> {
  return invoke<FileTextContent>('file_read_text', { rootId, path });
}

export function writeWorkspaceText(
  rootId: string,
  path: string,
  text: string,
  expectedSha256?: string,
): Promise<FileTextWrite> {
  return invoke<FileTextWrite>('file_write_text', {
    rootId,
    path,
    text,
    ...(expectedSha256 === undefined ? {} : { expectedSha256 }),
  });
}

export function revokeWorkspaceRoot(rootId: string): Promise<boolean> {
  return invoke<boolean>('workspace_revoke_root', { rootId });
}

export function revealWorkspaceRoot(rootId: string): Promise<boolean> {
  return invoke<boolean>('workspace_reveal', { rootId });
}

/** Withdraw one answer, so the next use asks again. */
export function revokePermission(
  capability: DesktopCapability,
  scope: PermissionScope,
): Promise<DesktopPermissionsReview> {
  return revokeDesktopPermission({ capability, scope });
}

/**
 * A folder was approved outside this page, by a drop on the window, so any
 * list of approved folders it shows is out of date.
 */
export function onWorkspaceChanged(listener: () => void): () => void {
  const host = getHostBridge();
  if (!host) return () => undefined;
  return host.onRuntimeEvent((event) => {
    if (event.kind === 'workspace-changed') listener();
  });
}

export function listWorkspaceFiles(rootId: string, path: string): Promise<FileEntry[]> {
  return invoke<FileEntry[]>('file_list', { rootId, path });
}

export function readWorkspaceFileBytes(rootId: string, path: string): Promise<FileBinaryContent> {
  return invoke<FileBinaryContent>('file_read_bytes', { rootId, path });
}

export function findWorkspaceFilesByName(
  rootId: string,
  query: string,
  path: string,
): Promise<FileEntry[]> {
  return invoke<FileEntry[]>('file_glob', {
    rootId,
    pattern: `**${query}*`,
    path,
    ignoreCase: true,
  });
}

export function searchWorkspaceText(
  rootId: string,
  query: string,
  path: string,
): Promise<FileSearchMatch[]> {
  return invoke<FileSearchMatch[]>('file_grep', { rootId, query, path, ignoreCase: true });
}

function decodeBase64(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return buffer;
}

/**
 * Reads a granted-folder file into the same `File` the `<input type="file">`
 * path produces, so it meets the composer's existing size and type rules
 * rather than a second set written for desktop.
 */
export async function readWorkspaceFile(
  rootId: string,
  entry: Pick<FileEntry, 'name' | 'path'>,
  mimeType: string,
): Promise<File> {
  const content = await readWorkspaceFileBytes(rootId, entry.path);
  const bytes = decodeBase64(content.base64);
  return new File([bytes], entry.name, {
    type: mimeType,
    lastModified: content.modifiedAtMs,
  });
}

export function readLocalCommandPolicy(): Promise<ShellPolicy> {
  return invoke<ShellPolicy>('shell_policy_read');
}

export function writeLocalCommandPolicy(policy: ShellPolicy): Promise<ShellPolicy> {
  return invoke<ShellPolicy>('shell_policy_write', { policy });
}

/**
 * Layout the shell owns rather than one window's storage, so a second window
 * opens on what the first left and a relaunch does not start from the default.
 * `null` on either member means the shell has never been told.
 */
export interface ShellLayout {
  secondaryPanelWidth: number | null;
  sidebarCollapsed: boolean | null;
}

export function readShellLayout(): Promise<ShellLayout> {
  return invoke<ShellLayout>('window_layout_read');
}

export function writeShellLayout(patch: Partial<ShellLayout>): Promise<ShellLayout> {
  return invoke<ShellLayout>('window_layout_write', { ...patch });
}

export function cancelLocalCommand(runId: string): Promise<boolean> {
  return invoke<boolean>('shell_cancel', { runId });
}

export interface LocalCommandRun {
  runId: string;
  result: Promise<ShellRunResult>;
}

export interface LocalCommandOutput {
  stream: 'stdout' | 'stderr';
  text: string;
}

/**
 * Starts a command and hands back its id before it finishes.
 *
 * The id is chosen here rather than returned with the result, because output
 * arrives while the command runs and a Stop button needs something to name.
 */
export function startLocalCommand(
  input: { rootId: string; command: string; path?: string; timeoutMs?: number },
  onOutput: (output: LocalCommandOutput) => void,
): LocalCommandRun {
  const host = getHostBridge();
  if (!host) throw new DesktopHostUnavailable();

  const runId = crypto.randomUUID();
  const unsubscribe = host.onRuntimeEvent((event) => {
    if (event.kind === 'shell-output' && event.runId === runId) {
      onOutput({ stream: event.stream, text: event.chunk });
    }
  });

  const result = (async () => {
    try {
      return await invoke<ShellRunResult>('shell_run', {
        runId,
        rootId: input.rootId,
        command: input.command,
        ...(input.path ? { path: input.path } : {}),
        ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
      });
    } finally {
      unsubscribe();
    }
  })();

  return { runId, result };
}

export function startBackgroundLocalCommand(input: {
  rootId: string;
  command: string;
  path?: string;
}): Promise<BackgroundShellOutput> {
  return invoke<BackgroundShellOutput>('shell_start', {
    runId: crypto.randomUUID(),
    rootId: input.rootId,
    command: input.command,
    ...(input.path ? { path: input.path } : {}),
  });
}

export function openLocalPreview(url: string): Promise<{ url: string }> {
  return invoke<{ url: string }>('app_open_preview', { url });
}

export function openWorkspacePath(rootId: string, path: string): Promise<ApplicationOpenResult> {
  return invoke<ApplicationOpenResult>('app_open_path', { rootId, path });
}

export function revealWorkspacePath(rootId: string, path: string): Promise<ApplicationOpenResult> {
  return invoke<ApplicationOpenResult>('app_reveal_path', { rootId, path });
}

export function readHostClipboard(): Promise<ClipboardSnapshot> {
  return invoke<ClipboardSnapshot>('clipboard_read');
}

/**
 * The clipboard as composer attachments.
 *
 * Text becomes a `.txt` file rather than composer text: the composer already
 * turns a long paste into an attachment, and a clipboard holding a whole file
 * should not silently replace what the user has typed.
 */
export function clipboardAttachments(snapshot: ClipboardSnapshot, nowMs: number): File[] {
  const files: File[] = [];
  if (snapshot.image) {
    files.push(
      new File([decodeBase64(snapshot.image.base64)], `clipboard-${nowMs}.png`, {
        type: 'image/png',
        lastModified: nowMs,
      }),
    );
  }
  if (snapshot.text) {
    files.push(
      new File([snapshot.text], `clipboard-${nowMs}.txt`, {
        type: 'text/plain',
        lastModified: nowMs,
      }),
    );
  }
  return files;
}

export function readDeviceRegistryProfile(): Promise<DeviceRegistryProfile> {
  return invoke<DeviceRegistryProfile>(DEVICE_REGISTRY_PROFILE_COMMAND);
}

export function readComputerUse(): Promise<ComputerUseStatus> {
  return invoke<ComputerUseStatus>('computer_use_status');
}

export function setComputerUseEnabled(enabled: boolean): Promise<ComputerUseStatus> {
  return invoke<ComputerUseStatus>('computer_use_set_enabled', { enabled });
}

export function stopComputerUse(): Promise<ComputerUseStatus> {
  return invoke<ComputerUseStatus>('computer_stop');
}

export function takeOverComputerUse(): Promise<ComputerUseStatus> {
  return invoke<ComputerUseStatus>('computer_take_over');
}

export function handBackComputerUse(): Promise<ComputerUseStatus> {
  return invoke<ComputerUseStatus>('computer_hand_back');
}

export function finishComputerUse(): Promise<ComputerUseStatus> {
  return invoke<ComputerUseStatus>('computer_use_finish');
}

export function onComputerUseChanged(listener: (status: ComputerUseStatus) => void): () => void {
  const host = getHostBridge();
  if (!host) return () => undefined;
  return host.onRuntimeEvent((event) => {
    if (event.kind === 'computer-use-changed') listener(event.status);
  });
}

export function openSystemPermissionSettings(permission: SystemPermissionKind): Promise<boolean> {
  return invoke<boolean>('system_permission_open', { permission });
}

export function readDesktopPermissions(): Promise<DesktopPermissionsReview> {
  return invoke<DesktopPermissionsReview>('permission_review');
}

export function revokeDesktopPermission(
  decision: Pick<PermissionDecision, 'capability' | 'scope'>,
): Promise<DesktopPermissionsReview> {
  return invoke<DesktopPermissionsReview>('permission_revoke', {
    capability: decision.capability,
    scope: decision.scope,
  });
}

export function readBrowserActivity(): Promise<BrowserActivityEntry[]> {
  return invoke<BrowserActivityEntry[]>('browser_activity');
}

export function openDownloadsFolder(): Promise<boolean> {
  return invoke<boolean>('browser_downloads_open');
}

export function readBackgroundActivity(): Promise<BackgroundActivity> {
  return invoke<BackgroundActivity>('background_activity');
}

export function stopBackgroundWork(
  kind: BackgroundWorkKind,
  id?: string,
): Promise<BackgroundActivity> {
  return invoke<BackgroundActivity>('background_stop', { kind, ...(id ? { id } : {}) });
}

export function readRemoteControl(): Promise<RemoteControlState> {
  return invoke<RemoteControlState>('remote_control_state');
}

export function startRemoteControl(
  request: RemoteControlStartRequest,
): Promise<RemoteControlState> {
  return invoke<RemoteControlState>('remote_control_start', { ...request });
}

export function stopRemoteControl(): Promise<RemoteControlState> {
  return invoke<RemoteControlState>('remote_control_stop');
}

export function readBrowserPairing(): Promise<BrowserPairingState> {
  return invoke<BrowserPairingState>('browser_pairing_state');
}

export function installBrowserHost(): Promise<string[]> {
  return invoke<string[]>('browser_pairing_install_host');
}

export function unpairBrowser(): Promise<BrowserPairingState> {
  return invoke<BrowserPairingState>('browser_pairing_unpair');
}

export function listPairedTabs(): Promise<BrowserTabSummary[]> {
  return invoke<BrowserTabSummary[]>('browser_list_tabs');
}

export function readPairedPage(tabId?: number): Promise<BrowserPageSummary> {
  return invoke<BrowserPageSummary>(
    'browser_read_page',
    tabId === undefined ? undefined : { tabId },
  );
}

export function clickInPairedBrowser(selector: string): Promise<{ clicked: boolean }> {
  return invoke<{ clicked: boolean }>('browser_click', { selector });
}

export function typeInPairedBrowser(
  selector: string,
  text: string,
  clear = false,
): Promise<{ typed: boolean }> {
  return invoke<{ typed: boolean }>('browser_type', { selector, text, clear });
}

export function navigatePairedBrowser(url: string): Promise<{ url: string }> {
  return invoke<{ url: string }>('browser_navigate', { url });
}

export function capturePairedBrowser(): Promise<{ dataUrl: string }> {
  return invoke<{ dataUrl: string }>('browser_screenshot');
}

export function readPairedBrowserConsole(options: {
  pattern?: string;
  level?: string;
  limit?: number;
}): Promise<{ origin: string; console: unknown[] }> {
  return invoke<{ origin: string; console: unknown[] }>('browser_console', options);
}

export function readPairedBrowserNetwork(options: {
  pattern?: string;
  resourceType?: string;
  failedOnly?: boolean;
  limit?: number;
}): Promise<{ origin: string; network: unknown[] }> {
  return invoke<{ origin: string; network: unknown[] }>('browser_network', options);
}

export function downloadThroughPairedBrowser(
  url: string,
): Promise<{ download: { filename?: string; url?: string } | null }> {
  return invoke<{ download: { filename?: string; url?: string } | null }>('browser_download', {
    url,
  });
}

/**
 * A browser screenshot as the composer's own attachment type, so it meets the
 * same size and kind rules a dragged-in image does.
 */
export function screenshotAttachment(dataUrl: string, nowMs: number): File {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return new File([decodeBase64(base64)], `browser-${nowMs}.png`, {
    type: 'image/png',
    lastModified: nowMs,
  });
}

export function readLocalModelSnapshot(): Promise<LocalModelSnapshot> {
  return invoke<LocalModelSnapshot>('local_model_servers');
}

export function listLocalModels(): Promise<LocalModel[]> {
  return invoke<LocalModel[]>('local_model_list');
}

export function readLocalModelSettings(): Promise<LocalModelSettings> {
  return invoke<LocalModelSettings>('local_model_settings_read');
}

export function writeLocalModelSettings(
  settings: Partial<LocalModelSettings>,
): Promise<LocalModelSettings> {
  return invoke<LocalModelSettings>('local_model_settings_write', { settings });
}

export function cancelLocalChat(runId: string): Promise<boolean> {
  return invoke<boolean>('local_chat_cancel', { runId });
}

export interface LocalChatDelta {
  channel: 'text' | 'thinking';
  delta: string;
}

export interface LocalChatRun {
  runId: string;
  result: Promise<LocalChatResult>;
}

/**
 * Runs one turn on a model installed on this machine.
 *
 * The run id is chosen here rather than returned with the result because the
 * answer arrives delta by delta while the turn is still open, and Stop needs
 * something to name before there is anything to stop.
 */
export function startLocalChat(
  input: { modelId: string; messages: LocalChatMessage[]; timeoutMs?: number },
  onDelta: (delta: LocalChatDelta) => void,
): LocalChatRun {
  assertLocalTurnCarriesNoAttachments(input.messages);
  const host = getHostBridge();
  if (!host) throw new DesktopHostUnavailable();

  const runId = crypto.randomUUID();
  const unsubscribe = host.onRuntimeEvent((event) => {
    if (event.kind === 'local-chat-delta' && event.runId === runId) {
      onDelta({ channel: event.channel, delta: event.delta });
    }
  });

  const result = (async () => {
    try {
      return await invoke<LocalChatResult>('local_chat_start', {
        runId,
        modelId: input.modelId,
        messages: input.messages,
        ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
      });
    } finally {
      unsubscribe();
    }
  })();

  return { runId, result };
}

export function readDeveloperRuntimeStatus(): Promise<DeveloperRuntimeStatus> {
  return invoke<DeveloperRuntimeStatus>('developer_runtime_status');
}

export function reportDesktopAccount(signedIn: boolean, email: string | null): Promise<boolean> {
  return invoke<boolean>('developer_account_report', {
    signedIn,
    ...(email === null ? {} : { email }),
  });
}

export function listDeveloperModels(
  rootId: string,
  options: { refresh?: boolean } = {},
): Promise<DeveloperRuntimeModels> {
  return invoke<DeveloperRuntimeModels>('developer_model_list', {
    rootId,
    ...(options.refresh === true ? { refresh: true } : {}),
  });
}

export function listDeveloperSessions(): Promise<DeveloperSessionList> {
  return invoke<DeveloperSessionList>('developer_session_list');
}

/**
 * Ask the user, in the shell's own dialog, to let the agent run in a folder.
 * A folder without that answer lists no sessions, because the CLI that reads
 * them is not started there.
 */
export function allowDeveloperSessions(rootId: string): Promise<boolean> {
  return invoke<boolean>('developer_sessions_allow', { rootId });
}

/**
 * Ask the shell to put one project MCP server's launch to the user. The page
 * names the server and nothing else: what it would run is read, shown and
 * answered in the shell's own dialog, which a page cannot draw or click.
 */
export function reviewDeveloperMcpServer(
  rootId: string,
  server: DeveloperMcpServerAwaitingApproval,
): Promise<DeveloperMcpApprovalReview> {
  return invoke<DeveloperMcpApprovalReview>('developer_mcp_approval_review', {
    rootId,
    name: server.name,
    scope: server.scope,
  });
}

/** This page shows the agent's questions, so the shell leaves them for it to answer. */
const PAGE_CLIENT_CAPABILITIES: DeveloperClientCapability[] = ['user_input'];

export function readDeveloperSession(
  rootId: string,
  threadId: string,
): Promise<DeveloperSessionTranscript> {
  return invoke<DeveloperSessionTranscript>('developer_session_read', {
    rootId,
    threadId,
    clientCapabilities: PAGE_CLIENT_CAPABILITIES,
  });
}

/** Start a session in the folder itself or, with a placement, in a new worktree of it. */
export function startDeveloperSession(
  rootId: string,
  model?: string,
  placement: Pick<DeveloperSessionStartRequest, 'environment' | 'worktreeStart'> = {},
): Promise<StartedDeveloperSession> {
  return invoke<StartedDeveloperSession>('developer_session_start', {
    rootId,
    ...(model ? { model } : {}),
    ...(placement.environment ? { environment: placement.environment } : {}),
    ...(placement.worktreeStart ? { worktreeStart: placement.worktreeStart } : {}),
  });
}

/**
 * Delete a session. A shell or CLI that predates the fuller answer returns
 * only `acknowledged`, so every list is read as possibly absent.
 */
export async function deleteDeveloperThread(
  request: DeveloperThreadDeleteRequest,
): Promise<ThreadDeleteResponse> {
  const response = await invoke<Partial<ThreadDeleteResponse>>('developer_thread_delete', {
    rootId: request.rootId,
    threadId: request.threadId,
    ...(request.discardWorktreeArchives ? { discardWorktreeArchives: true } : {}),
  });
  return {
    acknowledged: response.acknowledged === true,
    keptWorktreeArchives: response.keptWorktreeArchives ?? [],
    removedWorktreeArchives: response.removedWorktreeArchives ?? [],
    releasedWorktrees: response.releasedWorktrees ?? [],
  };
}

/**
 * Summarize what the model reads of a session, from one turn on or the older
 * part of all of it. The session still shows every message; the summarized
 * turns can no longer be rewound to.
 */
export function compactDeveloperThread(
  request: DeveloperThreadCompactRequest,
): Promise<ThreadCompactResponse> {
  return invoke<ThreadCompactResponse>('developer_thread_compact', {
    rootId: request.rootId,
    threadId: request.threadId,
    ...(request.fromTurnId ? { fromTurnId: request.fromTurnId } : {}),
  });
}

const SUMMARY_INTERRUPT_TURN_ID = 'summary';

/**
 * Stop the summary running for a session. A summary has no turn of its own,
 * so the interrupt names a placeholder, which the CLI ignores for a session
 * it is summarizing. The session is left exactly as it was.
 */
export function cancelDeveloperThreadSummary(rootId: string, threadId: string): Promise<boolean> {
  return invoke<boolean>('developer_turn_interrupt', {
    rootId,
    threadId,
    turnId: SUMMARY_INTERRUPT_TURN_ID,
  });
}

/** A new session carrying the conversation through one turn; the source is left as it is. */
export function forkDeveloperThread(
  request: DeveloperThreadForkRequest,
): Promise<LocalDeveloperSession> {
  return invoke<LocalDeveloperSession>('developer_thread_fork', {
    rootId: request.rootId,
    threadId: request.threadId,
    throughTurnId: request.throughTurnId,
  });
}

/**
 * Put a session away: it leaves every list, and its conversation and
 * checkpoints stay on this computer.
 */
export function archiveDeveloperThread(rootId: string, threadId: string): Promise<boolean> {
  return invoke<boolean>('developer_thread_archive', { rootId, threadId });
}

/** Take a session from the program writing it, so turns sent from here run. */
export function takeOverDeveloperThread(
  rootId: string,
  threadId: string,
): Promise<LocalDeveloperSession> {
  return invoke<LocalDeveloperSession>('developer_thread_takeover', { rootId, threadId });
}

export function startDeveloperTurn(request: DeveloperTurnRequest): Promise<{ turnId: string }> {
  return invoke<{ turnId: string }>('developer_turn_start', {
    ...request,
    clientCapabilities: PAGE_CLIENT_CAPABILITIES,
  });
}

export function steerDeveloperTurn(request: DeveloperTurnSteer): Promise<{ turnId: string }> {
  return invoke<{ turnId: string }>('developer_turn_steer', { ...request });
}

export function answerDeveloperUserInput(answer: DeveloperUserInputAnswer): Promise<boolean> {
  return invoke<boolean>('developer_user_input_answer', { ...answer });
}

export function addDeveloperMemory(
  rootId: string,
  text: string,
  scope: 'project' | 'user',
): Promise<MemoryAddResponse> {
  return invoke<MemoryAddResponse>('developer_memory_add', { rootId, text, scope });
}

export function listLocalBranches(rootId: string): Promise<LocalBranches | null> {
  return invoke<LocalBranches | null>('developer_branches_list', { rootId });
}

export function pushLocalBranch(rootId: string): Promise<LocalBranchPush> {
  return invoke<LocalBranchPush>('developer_branch_push', { rootId });
}

export function switchLocalBranch(rootId: string, branch: string): Promise<string> {
  return invoke<string>('developer_branch_switch', { rootId, branch });
}

export function listDeveloperSkills(rootId: string): Promise<SkillSummary[]> {
  return invoke<SkillSummary[]>('developer_skills_list', { rootId });
}

export function setDeveloperSkillEnabled(
  rootId: string,
  name: string,
  enabled: boolean,
): Promise<boolean> {
  return invoke<boolean>('developer_skill_set_enabled', { rootId, name, enabled });
}

export function setDeveloperSkillConsent(rootId: string, granted: boolean): Promise<boolean> {
  return invoke<boolean>('developer_skill_consent', { rootId, granted });
}

export function listDeveloperPlugins(rootId: string): Promise<PluginSummary[]> {
  return invoke<PluginSummary[]>('developer_plugins_list', { rootId });
}

export function setDeveloperPluginEnabled(
  rootId: string,
  id: string,
  enabled: boolean,
): Promise<boolean> {
  return invoke<boolean>('developer_plugin_set_enabled', { rootId, id, enabled });
}

export function readDeveloperSessionChanges(rootId: string): Promise<WorkingTreeChanges | null> {
  return invoke<WorkingTreeChanges | null>('developer_session_changes', { rootId });
}

export function discardDeveloperSessionChanges(rootId: string, paths: string[]): Promise<string[]> {
  return invoke<string[]>('developer_session_discard', { rootId, paths });
}

export function interruptDeveloperTurn(
  rootId: string,
  threadId: string,
  turnId: string,
): Promise<boolean> {
  return invoke<boolean>('developer_turn_interrupt', { rootId, threadId, turnId });
}

/**
 * `approved` is what shells installed before the five decisions read; the
 * current dispatcher ignores it and reads `decision`.
 */
export function answerDeveloperApproval(answer: DeveloperApprovalAnswer): Promise<boolean> {
  return invoke<boolean>('developer_approval_answer', {
    ...answer,
    approved: developerApprovalAllows(answer.decision),
  });
}

/**
 * Developer-session progress for one folder. The turn outlives the request that
 * started it, so the answer arrives here rather than in that promise.
 */
export function onDeveloperSessionEvent(
  listener: (rootId: string, event: DeveloperSessionEvent) => void,
): () => void {
  const host = getHostBridge();
  if (!host) return () => undefined;
  return host.onRuntimeEvent((event) => {
    if (event.kind === 'developer-session') listener(event.rootId, event.event);
  });
}

export function setDispatchTaskRunnerReady(ready: boolean): Promise<{ ready: boolean }> {
  return invoke<{ ready: boolean }>(DISPATCH_TASK_RUNNER_READY, { ready });
}

export function reportDispatchTask(report: DispatchTaskReport): Promise<{ accepted: boolean }> {
  return invoke<{ accepted: boolean }>(DISPATCH_TASK_REPORT, { ...report });
}

export function startBrowserSignIn(): Promise<{ started: true; expiresAtMs: number }> {
  return invoke<{ started: true; expiresAtMs: number }>(BROWSER_SIGN_IN_START);
}

export function cancelBrowserSignIn(): Promise<{ cancelled: true }> {
  return invoke<{ cancelled: true }>(BROWSER_SIGN_IN_CANCEL);
}

export function readBrowserSignInState(): Promise<PendingBrowserSignIn> {
  return invoke<PendingBrowserSignIn>(BROWSER_SIGN_IN_STATE);
}
