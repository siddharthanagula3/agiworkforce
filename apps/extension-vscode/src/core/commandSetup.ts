import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { SidebarProvider } from '../features/sidebar-webview/sidebarProvider';
import { registerChatRetryCommand } from '../features/chat/retry';
import {
  cliProbeMessage,
  describeRemoteEnvironment,
  nodeCliResolutionHost,
  probeCli,
  resolveCliPath,
  runCliVersion,
} from '../platform/remoteEnvironment';
import { AgiDiagnosticsProvider } from '../providers/diagnosticsProvider';
import { DiffDecorationProvider, type DiffSession } from '../providers/diffDecorationProvider';
import {
  ConversationTreeProvider,
  ConversationTreeItem,
  ContextItem,
  ContextPanelProvider,
  validateWorkspaceContextFile,
} from '../features/trees';
import { MemoryTreeProvider, MemoryFactItem } from '../memory/memoryTreeProvider';
import {
  APPROVE_CLOUD_TASK_COMMAND,
  CloudTasksTreeProvider,
  REJECT_CLOUD_TASK_COMMAND,
  decideCloudRunApprovalInteractively,
  readCloudRunCommandArgument,
  resolveCloudAgentRunClient,
  showCloudRunDetail,
  type CloudRunApprovalDecision,
} from '../features/cloud-tasks';
import type {
  ManagedCloudArtifactIndexEntry,
  ManagedCloudScheduleTask,
  ManagedCloudSchedulesClient,
} from '@agiworkforce/cloud-contracts';
import {
  OPEN_SCHEDULE_COMMAND,
  PAUSE_SCHEDULE_COMMAND,
  REFRESH_SCHEDULES_COMMAND,
  RESUME_SCHEDULE_COMMAND,
  RUN_SCHEDULE_NOW_COMMAND,
  SHOW_SCHEDULE_RUNS_COMMAND,
  SchedulesTreeProvider,
  readScheduleCommandArgument,
  resolveSchedulesClient,
  runScheduleNowInteractively,
  schedulesWebUrl,
  setScheduleEnabledInteractively,
  showScheduleRuns,
} from '../features/schedules';
import {
  CREATE_PROJECT_COMMAND,
  DELETE_PROJECT_COMMAND,
  CLEAR_ACTIVE_PROJECT_COMMAND,
  OPEN_PROJECT_COMMAND,
  ProjectsTreeProvider,
  REFRESH_PROJECTS_COMMAND,
  USE_PROJECT_IN_CHAT_COMMAND,
  clearActiveCloudProject,
  createProjectInteractively,
  deleteProjectInteractively,
  getActiveCloudProject,
  projectsWebUrl,
  readProjectCommandArgument,
  resolveProjectsWorkspace,
  showProjectDetail,
  applyProjectToChat,
  type ProjectsWorkspace,
} from '../features/projects';
import {
  ArtifactContentProvider,
  ArtifactsTreeProvider,
  OPEN_ARTIFACT_COMMAND,
  OPEN_ARTIFACT_ON_WEB_COMMAND,
  REFRESH_ARTIFACTS_COMMAND,
  SAVE_ARTIFACT_COMMAND,
  artifactsWebUrl,
  describeArtifactFailure,
  openArtifactReadOnly,
  openPublishedArtifact,
  readArtifactCommandArgument,
  resolveArtifactsWorkspace,
  saveArtifactToWorkspace,
  type ArtifactsWorkspace,
} from '../features/artifacts';
import {
  ConnectorsTreeProvider,
  MANAGE_CONNECTORS_COMMAND,
  REFRESH_CONNECTORS_COMMAND,
  connectorsWebUrl,
} from '../features/connectors';
import { getAccountMemoryStore } from '../memory/accountMemoryStore';
import { ChatEditorPanel } from '../providers/chatEditorPanel';
import { type LocalRuntimePool } from '../integrations/localRuntimePool';
import {
  CliCapabilityAdapter,
  openArtifactsSurface,
  openCapabilitySurface,
  openCloudTasksSurface,
  openConnectorsSurface,
  openContextSurface,
  openMemorySurface,
  openProjectsSurface,
  openSchedulesSurface,
  openWorkSurface,
} from '../features/surfaces';
import { signIn as signInPreferringCli } from '../features/surfaces/accountAccess';
import { ModelMetricsPanel } from '../features/model-picker/modelMetrics';
import { showOriginalContext, getPatchOutputChannel } from '../integrations/patchEngine';
import { runInlineCommand } from './runInlineCommand';
import { buildExplainSelectionPrompt, runEditorUtility } from '../features/editor-utilities';
import { openPathReference, OPEN_PATH_REFERENCE_COMMAND } from '../features/path-links';
import { showCloudUtilityErrorActions } from './cloudUtilityErrorActions';
import {
  clearAccountTierCache,
  refreshAccountTierCache,
  resolveTier,
} from '../integrations/tierResolver';
import { guardProviderSwitch } from '../integrations/providerSwitchGuard';
import {
  getActiveWorkspaceFolder,
  getActiveWorkspaceFolderSync,
} from '../platform/workspaceFolders';
import {
  getApiKey,
  getAccountToken,
  setApiKey,
  clearApiKey,
  fetchTierInfo,
  fetchAccountIdentity,
  getCloudWebOrigin,
} from '../utils/api';
import { signOutOfAgiCloud } from '../features/account-auth/deviceAuth';
import {
  buildAccountIdentityItems,
  buildTrustReviewItems,
} from '../features/account-auth/accountPresentation';
import { ONBOARDING_SEEN_KEY } from '../features/onboarding/onboardingState';
import { getExtensionVersion } from '../platform/version';
import { Config } from '../platform/config';
import { isEntitledSubscriptionStatus } from '@agiworkforce/types';
import {
  normalizeConfiguredModelId,
  buildGroupedQuickPickItems,
  modelDisplayLabel,
  modelLockHeading,
  modelLockReason,
  type ModelLock,
} from '../features/model-picker/modelConstants';
import * as telemetry from './telemetry';
import { recordFailure } from './subsystemHealth';
import {
  setAgentEffortWithConsent,
  setAgentModeWithConsent,
} from '../features/permissions/agentModeConsent';
import { SettingsPanel } from '../features/settings';
import {
  buildReachabilityQuickPickItems,
  type HostModel,
  type HostModelUnreachable,
  type ReachableQuickPickItem,
} from '../features/model-picker/reachability';
import { openAgentConfig } from '../features/config/agentConfig';
import { exportVsCodeDiagnostics } from '../features/diagnostics';

const execFileAsync = promisify(execFile);

const UPGRADE_URL = 'https://agiworkforce.com/pricing';

function requireWorkspaceMemoryScope(): boolean {
  if ((vscode.workspace.workspaceFolders?.length ?? 0) > 0) return true;
  void vscode.window.showWarningMessage(
    'AGI Workforce: Open a workspace folder before managing workspace memory.',
  );
  return false;
}

const MEMORY_TURN_ON_ACTION = 'Turn memory on';

async function requireMemoryEnabledForCapture(context: vscode.ExtensionContext): Promise<boolean> {
  if (Config.memoryEnabled()) return true;
  const choice = await vscode.window.showWarningMessage(
    'Memory is off, so saved facts are not sent with any turn.',
    { modal: true },
    MEMORY_TURN_ON_ACTION,
  );
  if (choice !== MEMORY_TURN_ON_ACTION) return false;
  return Config.update(context, { key: 'memory.enabled', value: true });
}

function contextCommandTarget(
  target: vscode.Uri | ContextItem | undefined,
): vscode.Uri | undefined {
  if (target instanceof ContextItem) return vscode.Uri.file(target.filePath);
  return target;
}

function buildChatReferenceQuery(target: vscode.Uri): string {
  const editor = vscode.window.activeTextEditor;
  if (
    editor !== undefined &&
    editor.document.uri.toString() === target.toString() &&
    !editor.selection.isEmpty
  ) {
    return '@agi #selection ';
  }
  return `@agi #file:${vscode.workspace.asRelativePath(target)} `;
}

function buildSidebarReferenceDraft(target: vscode.Uri): {
  text: string;
  reference: {
    path: string;
    range?: {
      startLine: number;
      startCharacter: number;
      endLine: number;
      endCharacter: number;
    };
  };
} {
  const relativePath = vscode.workspace.asRelativePath(target);
  const editor = vscode.window.activeTextEditor;
  const selection =
    editor !== undefined &&
    editor.document.uri.toString() === target.toString() &&
    !editor.selection.isEmpty
      ? editor.selection
      : undefined;
  if (selection === undefined) {
    return { text: `@${relativePath} `, reference: { path: relativePath } };
  }

  const range = {
    startLine: selection.start.line,
    startCharacter: selection.start.character,
    endLine: selection.end.line,
    endCharacter: selection.end.character,
  };
  const endLine =
    range.endCharacter === 0 && range.endLine > range.startLine ? range.endLine : range.endLine + 1;
  return {
    text: `@${relativePath}#L${range.startLine + 1}-L${endLine} `,
    reference: { path: relativePath, range },
  };
}

function warnNoDiffUnderCursor(verb: 'accept' | 'dismiss'): void {
  vscode.window.showWarningMessage(
    `AGI Workforce: no suggestion to ${verb} in the active editor. Open the file that has the pending change, or use Accept/Reject All.`,
  );
}

const DIFF_ACCEPT_ACTION = 'Write changes';
const DIFF_REJECT_ACTION = 'Discard changes';
const DIFF_RESTORE_ACTION = 'Restore discarded';
const DIFF_REVIEW_ACTION = 'Review first';

function diffSessionLabel(session: DiffSession): string {
  return session.filePath ?? vscode.workspace.asRelativePath(session.uri);
}

function describeDiffScope(sessions: readonly DiffSession[]): string {
  const changes = `${sessions.length} pending change${sessions.length === 1 ? '' : 's'}`;
  const files = [...new Set(sessions.map(diffSessionLabel))];
  const first = files[0];
  if (files.length === 1 && first !== undefined) return `${changes} in ${first}`;
  return `${changes} across ${files.length} files`;
}

function listDiffScopeFiles(sessions: readonly DiffSession[]): string {
  const MAX_LISTED_FILES = 10;
  const counts = new Map<string, number>();
  for (const session of sessions) {
    const label = diffSessionLabel(session);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const listed = [...counts.entries()]
    .slice(0, MAX_LISTED_FILES)
    .map(([label, count]) => `• ${label} (${count})`);
  const hidden = counts.size - listed.length;
  if (hidden > 0) listed.push(`• …and ${hidden} more file${hidden === 1 ? '' : 's'}`);
  return listed.join('\n');
}

async function confirmDiffBulkAction(
  sessions: readonly DiffSession[],
  intent: 'accept' | 'reject',
): Promise<boolean> {
  if (sessions.length === 0) {
    vscode.window.showWarningMessage('AGI Workforce: there are no pending changes to review.');
    return false;
  }
  const accepting = intent === 'accept';
  const action = accepting ? DIFF_ACCEPT_ACTION : DIFF_REJECT_ACTION;
  const headline = accepting
    ? `Write ${describeDiffScope(sessions)} to disk?`
    : `Discard ${describeDiffScope(sessions)} without writing them?`;
  const consequence = accepting
    ? 'These edits are applied to your working tree. Nothing else reviews them first.'
    : 'The proposals are dropped. Run "AGI Workforce: Restore Discarded Changes" to bring them back in this session.';
  const choice = await vscode.window.showWarningMessage(
    `AGI Workforce: ${headline}`,
    { modal: true, detail: `${listDiffScopeFiles(sessions)}\n\n${consequence}` },
    action,
    DIFF_REVIEW_ACTION,
  );
  if (choice === DIFF_REVIEW_ACTION) {
    const first = sessions[0];
    if (first !== undefined) {
      await vscode.window.showTextDocument(first.uri, { selection: first.range });
    }
    return false;
  }
  return choice === action;
}

function resolveDiffBatchId(batchId: unknown): string | undefined {
  if (typeof batchId === 'string' && batchId !== '') return batchId;
  vscode.window.showWarningMessage(
    'AGI Workforce: batch accept and reject run from the CodeLens on a proposed batch. Use Accept/Reject All Changes to act on every pending change.',
  );
  return undefined;
}

function resolveDiffFileTarget(uri: unknown): vscode.Uri | undefined {
  if (uri instanceof vscode.Uri) return uri;
  const active = vscode.window.activeTextEditor?.document.uri;
  if (active === undefined) {
    vscode.window.showWarningMessage(
      'AGI Workforce: open the file whose pending changes you want to act on.',
    );
  }
  return active;
}

function announceRejected(
  diffDecorationProvider: DiffDecorationProvider,
  sessions: readonly DiffSession[],
): void {
  void vscode.window
    .showInformationMessage(
      `AGI Workforce: discarded ${describeDiffScope(sessions)}.`,
      DIFF_RESTORE_ACTION,
    )
    .then((choice) => {
      if (choice === DIFF_RESTORE_ACTION) {
        void vscode.commands.executeCommand('agi-workforce.restoreRejectedDiffs');
      }
    });
}

let _agiGitOutputChannel: vscode.OutputChannel | undefined;
function getAgiGitOutputChannel(): vscode.OutputChannel {
  if (_agiGitOutputChannel === undefined) {
    _agiGitOutputChannel = vscode.window.createOutputChannel('AGI Workforce: Git');
  }
  return _agiGitOutputChannel;
}

async function runGitToOutputChannel(args: string[], cwd: string, title: string): Promise<void> {
  const channel = getAgiGitOutputChannel();
  channel.appendLine(`\n$ git ${args.join(' ')}`);
  try {
    const result = await execFileAsync('git', args, { cwd, timeout: 30_000 });
    channel.append(result.stdout);
    if (result.stderr) channel.append(result.stderr);
    channel.show(true);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    channel.appendLine(`[error] ${msg}`);
    channel.show(true);
    vscode.window.showErrorMessage(`AGI Workforce: ${title} failed, ${msg}`);
  }
}

function sessionHistoryRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

async function readHostModels(
  localRuntimes: LocalRuntimePool,
  refresh: boolean,
): Promise<HostModel[] | undefined> {
  const folder = getActiveWorkspaceFolderSync();
  if (folder === undefined) return undefined;
  try {
    const runtime = localRuntimes.forWorkspace(folder.uri.fsPath);
    const response = await runtime.listLocalModels(refresh ? { refresh: true } : {});
    const hostModels = response.hostModels;
    return hostModels === undefined || hostModels.length === 0 ? undefined : [...hostModels];
  } catch {
    return undefined;
  }
}

async function runUnreachableOffer(unreachable: HostModelUnreachable): Promise<void> {
  if (unreachable.action === 'sign_in_account') {
    await vscode.commands.executeCommand('agi-workforce.signIn');
    await vscode.commands.executeCommand('agi-workforce.selectModel', { refresh: true });
    return;
  }
  if (unreachable.action === 'upgrade_plan') {
    await vscode.commands.executeCommand('agi-workforce.openUpgrade');
    return;
  }
  if (unreachable.action === 'sign_in_provider' && unreachable.provider !== undefined) {
    await vscode.commands.executeCommand('agi-workforce.signInProvider', unreachable.provider);
    await vscode.commands.executeCommand('agi-workforce.selectModel', { refresh: true });
    return;
  }
  if (unreachable.action === 'open_settings') {
    await vscode.commands.executeCommand('agi-workforce.openSettings');
    return;
  }
  vscode.window.showWarningMessage('AGI Workforce: that model is not set up on this machine yet.');
}

export interface CommandDeps {
  sidebarProvider: SidebarProvider;
  conversationTreeProvider: ConversationTreeProvider;
  cloudTasksTreeProvider: CloudTasksTreeProvider;
  schedulesTreeProvider: SchedulesTreeProvider;
  projectsTreeProvider: ProjectsTreeProvider;
  artifactsTreeProvider: ArtifactsTreeProvider;
  artifactContentProvider: ArtifactContentProvider;
  connectorsTreeProvider: ConnectorsTreeProvider;
  localRuntimes: LocalRuntimePool;
  contextPanelProvider: ContextPanelProvider;
  memoryTreeProvider: MemoryTreeProvider;
  diffDecorationProvider: DiffDecorationProvider;
  diagnosticsProvider: AgiDiagnosticsProvider;
  nativeChatAvailable: boolean;
}

export function setupCommands(context: vscode.ExtensionContext, deps: CommandDeps): void {
  const {
    sidebarProvider,
    conversationTreeProvider,
    cloudTasksTreeProvider,
    schedulesTreeProvider,
    projectsTreeProvider,
    artifactsTreeProvider,
    artifactContentProvider,
    connectorsTreeProvider,
    localRuntimes,
    contextPanelProvider,
    memoryTreeProvider,
    diffDecorationProvider,
    diagnosticsProvider,
    nativeChatAvailable,
  } = deps;

  const cliCapabilities = new CliCapabilityAdapter(localRuntimes);

  type CommandHandler = Parameters<typeof vscode.commands.registerCommand>[1];
  const failedCommandIds: string[] = [];
  const register = (id: string, handler: CommandHandler): vscode.Disposable => {
    try {
      return vscode.commands.registerCommand(id, handler);
    } catch (err) {
      failedCommandIds.push(id);
      recordFailure(`command:${id}`, err);
      return new vscode.Disposable(() => undefined);
    }
  };
  const decideOnCloudTask = async (
    item: unknown,
    decision: CloudRunApprovalDecision,
  ): Promise<void> => {
    const run = readCloudRunCommandArgument(item);
    if (run === undefined) return;
    const resolution = await resolveCloudAgentRunClient(context.secrets);
    if (resolution.status === 'signed-out') {
      await vscode.commands.executeCommand('agi-workforce.signIn');
      return;
    }
    await decideCloudRunApprovalInteractively(resolution.client, run, decision, {
      onChanged: () => cloudTasksTreeProvider.refresh(),
    });
  };
  const withScheduleFromItem = async (
    item: unknown,
    act: (client: ManagedCloudSchedulesClient, task: ManagedCloudScheduleTask) => Promise<void>,
  ): Promise<void> => {
    const task = readScheduleCommandArgument(item);
    if (task === undefined) return;
    const resolution = await resolveSchedulesClient(context.secrets);
    if (resolution.status === 'signed-out') {
      await vscode.commands.executeCommand('agi-workforce.signIn');
      return;
    }
    await act(resolution.client, task);
  };
  const scheduleActionHost = { onChanged: () => schedulesTreeProvider.refresh() };
  const projectDetailHost = {
    webOrigin: getCloudWebOrigin(),
    workspaceState: context.workspaceState,
    onChanged: () => {
      projectsTreeProvider.refresh();
      sidebarProvider.pushActiveProject();
    },
  };
  const withProjectsWorkspace = async (
    act: (workspace: ProjectsWorkspace) => Promise<void>,
  ): Promise<void> => {
    const resolution = await resolveProjectsWorkspace(context.secrets);
    if (resolution.status === 'signed-out') {
      await vscode.commands.executeCommand('agi-workforce.signIn');
      return;
    }
    await act(resolution.workspace);
  };
  const withArtifactsWorkspace = async (
    act: (workspace: ArtifactsWorkspace) => Promise<void>,
  ): Promise<void> => {
    const resolution = await resolveArtifactsWorkspace(context.secrets);
    if (resolution.status === 'signed-out') {
      await vscode.commands.executeCommand('agi-workforce.signIn');
      return;
    }
    await act(resolution.workspace);
  };
  const withArtifactFromId = async (
    artifactId: unknown,
    act: (workspace: ArtifactsWorkspace, artifact: ManagedCloudArtifactIndexEntry) => Promise<void>,
  ): Promise<void> => {
    if (typeof artifactId !== 'string' || artifactId === '') return;
    await withArtifactsWorkspace(async (workspace) => {
      let artifact: ManagedCloudArtifactIndexEntry | undefined;
      try {
        const artifacts = await workspace.index.listArtifacts();
        artifact = artifacts.find((entry) => entry.id === artifactId);
      } catch (error) {
        void vscode.window.showErrorMessage(
          `AGI Workforce: the artifact index could not be read, ${describeArtifactFailure(error)}`,
        );
        return;
      }
      if (artifact === undefined) {
        void vscode.window.showWarningMessage(
          'AGI Workforce: this artifact is no longer in your account index.',
        );
        return;
      }
      await act(workspace, artifact);
    });
  };
  /**
   * Both session commands take a tree item, and no tree view is registered, so
   * the command palette was their only entry point and reached them with no
   * argument. Archiving threw on the missing title; forking would have done the
   * same. Asked for here instead, which also makes the palette the working
   * surface it already appeared to be.
   */
  const pickDeveloperSession = async (placeHolder: string) => {
    const threads = await conversationTreeProvider.getThreads();
    if (threads.length === 0) {
      vscode.window.showInformationMessage('AGI Workforce: No developer sessions in this window.');
      return undefined;
    }
    const picked = await vscode.window.showQuickPick(
      threads.map((thread) => ({ label: thread.title, description: thread.id, thread })),
      { placeHolder, ignoreFocusOut: true },
    );
    return picked?.thread;
  };
  const revealFirstPartyChat = async (): Promise<void> => {
    try {
      await vscode.commands.executeCommand('agi-workforce.sidebar.focus');
    } finally {
      sidebarProvider.reveal();
    }
  };
  /**
   * A locked row leads to the thing that would unlock it, never to a turn that
   * fails: the picker already said what is missing, this does it.
   */
  const offerModelUnlock = async (modelLabel: string, lock: ModelLock): Promise<void> => {
    const action = modelLockHeading(lock);
    const choice = await vscode.window.showInformationMessage(
      modelLockReason(modelLabel, lock),
      action,
      'Cancel',
    );
    if (choice !== action) return;
    if (lock.kind === 'sign-in') {
      await vscode.commands.executeCommand('agi-workforce.signIn');
      return;
    }
    if (lock.kind === 'upgrade') {
      await vscode.env.openExternal(vscode.Uri.parse(UPGRADE_URL));
      return;
    }
    await vscode.commands.executeCommand('agi-workforce.openAgentConfig');
  };

  const prefillFirstPartyReference = async (target: vscode.Uri): Promise<void> => {
    const validated = await validateWorkspaceContextFile(target);
    if (!validated.ok) {
      vscode.window.showWarningMessage(`AGI Workforce: ${validated.message}`);
      return;
    }
    const draft = buildSidebarReferenceDraft(validated.uri);
    sidebarProvider.prefillComposer(draft.text, [draft.reference]);
    await revealFirstPartyChat();
  };

  context.subscriptions.push(
    register('agi-workforce.openSettings', (section?: unknown) => {
      SettingsPanel.createOrShow(context, section);
    }),
    register('agi-workforce.openAgentConfig', async () => {
      try {
        const configPath = await openAgentConfig();
        const action = await vscode.window.showInformationMessage(
          `AGI Workforce: Opened ${configPath}. Restart the local runtime after changing this file.`,
          'Restart local runtime',
        );
        if (action === 'Restart local runtime') {
          await vscode.commands.executeCommand('agi-workforce.restartLocalRuntime');
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'The agent configuration could not be opened.';
        vscode.window.showErrorMessage(`AGI Workforce: ${message}`);
      }
    }),
    register('agi-workforce.restartLocalRuntime', async () => {
      try {
        const result = await localRuntimes.restartAll();
        conversationTreeProvider.refresh();
        const message =
          result.restartedWorkspaces === 0
            ? 'AGI Workforce: Runtime configuration reloaded. Re-checking the workspace developer runtime.'
            : `AGI Workforce: Local runtime restarted in ${result.restartedWorkspaces} workspace${result.restartedWorkspaces === 1 ? '' : 's'}.`;
        vscode.window.showInformationMessage(message);
        return { ok: true as const, restartedWorkspaces: result.restartedWorkspaces };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`AGI Workforce: Local runtime restart failed, ${message}`);
        return { ok: false as const, error: message };
      } finally {
        sidebarProvider.refreshRuntimeStatus();
        ChatEditorPanel.refreshRuntimeStatus();
      }
    }),

    register('agi-workforce.checkCli', async () => {
      const environment = describeRemoteEnvironment(vscode.env.remoteName);
      const cliPath = resolveCliPath(Config.cliPath(), nodeCliResolutionHost());
      const result = await probeCli(cliPath, runCliVersion);
      const message = cliProbeMessage(result, environment);
      if (result.ok) vscode.window.showInformationMessage(message);
      else vscode.window.showErrorMessage(message);
      return { ...result, environment: environment.kind };
    }),

    register('agi-workforce.addToContext', async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (target === undefined) {
        vscode.window.showWarningMessage('AGI Workforce: No file to add to context.');
        return;
      }
      const result = await validateWorkspaceContextFile(target);
      if (!result.ok) {
        vscode.window.showWarningMessage(`AGI Workforce: ${result.message}`);
        return;
      }
      contextPanelProvider.addFile(result.uri);
    }),

    register('agi-workforce.removeFromContext', (item?: vscode.Uri | ContextItem) => {
      const target = contextCommandTarget(item) ?? vscode.window.activeTextEditor?.document.uri;
      if (target === undefined) {
        vscode.window.showWarningMessage('AGI Workforce: No file to remove from context.');
        return;
      }
      contextPanelProvider.removeFile(target);
    }),

    register('agi-workforce.clearContext', () => {
      contextPanelProvider.clearAll();
    }),

    register('agi-workforce.refreshContext', () => {
      contextPanelProvider.refreshAutoContext();
    }),

    register('agi-workforce.mentionFileInChat', async (item?: vscode.Uri | ContextItem) => {
      const target = contextCommandTarget(item) ?? vscode.window.activeTextEditor?.document.uri;
      if (target === undefined) {
        vscode.window.showWarningMessage('AGI Workforce: No file selected to mention in chat.');
        return;
      }
      if (!nativeChatAvailable) {
        await prefillFirstPartyReference(target);
        return;
      }
      const query = buildChatReferenceQuery(target);
      try {
        await vscode.commands.executeCommand('workbench.action.chat.open', { query });
      } catch {
        try {
          await vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
        } catch {
          sidebarProvider.reveal();
        }
      }
    }),

    register('agi-workforce.acceptDiff', async (sessionId?: string) => {
      if (typeof sessionId === 'string' && sessionId !== '') {
        await diffDecorationProvider.acceptDiff(sessionId);
        return;
      }
      if (!(await diffDecorationProvider.acceptCurrentDiff())) {
        warnNoDiffUnderCursor('accept');
      }
    }),
    register('agi-workforce.rejectDiff', (sessionId?: string) => {
      if (typeof sessionId === 'string' && sessionId !== '') {
        diffDecorationProvider.rejectDiff(sessionId);
        return;
      }
      diffDecorationProvider.rejectCurrentDiff();
    }),
    register('agi-workforce.acceptAllDiffs', async (uri?: unknown) => {
      const target = resolveDiffFileTarget(uri);
      if (target === undefined) return;
      const sessions = diffDecorationProvider.sessionsForUri(target);
      if (!(await confirmDiffBulkAction(sessions, 'accept'))) return;
      await diffDecorationProvider.acceptAll(target);
    }),
    register('agi-workforce.rejectAllDiffs', async (uri?: unknown) => {
      const target = resolveDiffFileTarget(uri);
      if (target === undefined) return;
      const sessions = diffDecorationProvider.sessionsForUri(target);
      if (!(await confirmDiffBulkAction(sessions, 'reject'))) return;
      diffDecorationProvider.rejectAll(target);
      announceRejected(diffDecorationProvider, sessions);
    }),
    register('agi-workforce.acceptCurrentDiff', async () => {
      if (!(await diffDecorationProvider.acceptCurrentDiff())) {
        warnNoDiffUnderCursor('accept');
      }
    }),
    register('agi-workforce.rejectCurrentDiff', () => {
      if (!diffDecorationProvider.rejectCurrentDiff()) {
        warnNoDiffUnderCursor('dismiss');
      }
    }),
    register('agi-workforce.acceptAllDiffsGlobal', async () => {
      const sessions = diffDecorationProvider.allSessions();
      if (!(await confirmDiffBulkAction(sessions, 'accept'))) return;
      await diffDecorationProvider.acceptAllGlobal();
    }),
    register('agi-workforce.rejectAllDiffsGlobal', async () => {
      const sessions = diffDecorationProvider.allSessions();
      if (!(await confirmDiffBulkAction(sessions, 'reject'))) return;
      diffDecorationProvider.rejectAllGlobal();
      announceRejected(diffDecorationProvider, sessions);
    }),
    register('agi-workforce.acceptBatch', async (batchId?: unknown) => {
      const id = resolveDiffBatchId(batchId);
      if (id === undefined) return;
      const sessions = diffDecorationProvider.sessionsForBatch(id);
      if (!(await confirmDiffBulkAction(sessions, 'accept'))) return;
      await diffDecorationProvider.acceptBatch(id);
    }),
    register('agi-workforce.rejectBatch', async (batchId?: unknown) => {
      const id = resolveDiffBatchId(batchId);
      if (id === undefined) return;
      const sessions = diffDecorationProvider.sessionsForBatch(id);
      if (!(await confirmDiffBulkAction(sessions, 'reject'))) return;
      diffDecorationProvider.rejectBatch(id);
      announceRejected(diffDecorationProvider, sessions);
    }),
    register('agi-workforce.restoreRejectedDiffs', () => {
      const restored = diffDecorationProvider.restoreRejected();
      if (restored.length === 0) {
        vscode.window.showWarningMessage(
          'AGI Workforce: there are no discarded changes left to restore in this session.',
        );
        return;
      }
      vscode.window.showInformationMessage(
        `AGI Workforce: restored ${describeDiffScope(restored)}.`,
      );
    }),
    register('agi-workforce.showOriginalContext', async (sessionId: string) => {
      const session = diffDecorationProvider.getSession(sessionId);
      if (session === undefined) {
        vscode.window.showWarningMessage('AGI Workforce: Diff session not found.');
        return;
      }
      const filePath = session.filePath ?? vscode.workspace.asRelativePath(session.uri);
      await showOriginalContext(session.originalText, session.newText, filePath);
    }),
    register('agi-workforce.showPatchLogs', () => {
      getPatchOutputChannel().show(true);
    }),

    register('agi-workforce.chat', async () => {
      if (!nativeChatAvailable) {
        await revealFirstPartyChat();
        return;
      }
      try {
        await vscode.commands.executeCommand('workbench.action.chat.open');
      } catch {
        try {
          await vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
        } catch {
          await vscode.commands.executeCommand('agi-workforce.sidebar.focus');
        }
      }
    }),

    register('agi-workforce.openChatInEditor', () => {
      ChatEditorPanel.createNew(
        context.extensionUri,
        context.secrets,
        context,
        localRuntimes,
        conversationTreeProvider,
        diffDecorationProvider,
      );
    }),

    register('agi-workforce.agentMode', async () => {
      await vscode.commands.executeCommand('agi-workforce.setAgentMode');
    }),

    register('agi-workforce.explain', async (targetRange?: vscode.Range) => {
      await runEditorUtility(buildExplainSelectionPrompt(targetRange));
    }),

    register('agi-workforce.fix', async (targetRange?: vscode.Range) => {
      await runInlineCommand(context, 'fix', targetRange);
    }),

    register('agi-workforce.refactor', async (targetRange?: vscode.Range) => {
      await runInlineCommand(context, 'refactor', targetRange);
    }),

    register('agi-workforce.generateTests', async (targetRange?: vscode.Range) => {
      await runInlineCommand(context, 'tests', targetRange);
    }),

    register('agi-workforce.docs', async (targetRange?: vscode.Range) => {
      await runInlineCommand(context, 'docs', targetRange);
    }),

    register('agi-workforce.codeReview', async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor === undefined) {
        vscode.window.showWarningMessage('AGI Workforce: No active editor.');
        return;
      }

      const failure = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'AGI Workforce: Running Code Review…',
          cancellable: true,
        },
        async (_progress, progressToken): Promise<unknown> => {
          const cancelSource = new vscode.CancellationTokenSource();
          progressToken.onCancellationRequested(() => cancelSource.cancel());

          try {
            const result = await diagnosticsProvider.reviewCode(
              editor,
              context.secrets,
              cancelSource.token,
            );
            cancelSource.dispose();

            if (result.diagnosticCount === 0) {
              vscode.window.showInformationMessage(
                'AGI Workforce: Code looks good! No issues found.',
              );
            } else {
              vscode.window.showInformationMessage(
                `AGI Workforce: Found ${result.diagnosticCount} issue(s). Check the Problems panel.`,
              );
            }
            return undefined;
          } catch (err) {
            cancelSource.dispose();
            return err;
          }
        },
      );

      if (failure === undefined) return;
      if (failure instanceof Error && failure.message.includes('CANCELLED')) return;
      await showCloudUtilityErrorActions(failure, {
        title: 'AGI Workforce: Code review failed',
        retry: () => vscode.commands.executeCommand('agi-workforce.codeReview'),
      });
    }),

    register('agi-workforce.signIn', async () => {
      const ok = await signInPreferringCli(context.secrets, cliCapabilities);
      if (ok) {
        await refreshAccountTierCache(context);
        sidebarProvider.refreshAccountPresentation();
        ChatEditorPanel.refreshAccountPresentation();
      }
    }),

    register('agi-workforce.openUpgrade', async () => {
      await vscode.env.openExternal(vscode.Uri.parse(UPGRADE_URL));
    }),

    register('agi-workforce.signOut', async () => {
      await signOutOfAgiCloud(context.secrets);
      await clearAccountTierCache(context);
      sidebarProvider.refreshAccountPresentation();
      ChatEditorPanel.refreshAccountPresentation();
    }),

    register('agi-workforce.setApiKey', async () => {
      const existing = await getApiKey(context.secrets);
      const placeholder = existing !== undefined ? '(already set, enter new key to replace)' : '';

      const apiKey = await vscode.window.showInputBox({
        title: 'AGI Workforce, Set API Key',
        prompt:
          'Enter your AGI Workforce API key. It will be stored in VS Code SecretStorage (encrypted).',
        placeHolder: placeholder !== '' ? placeholder : 'sk-agi-…',
        password: true,
        ignoreFocusOut: true,
        validateInput: (value) => {
          if (value.trim() === '') return 'API key cannot be empty.';
          return undefined;
        },
      });

      if (apiKey === undefined || apiKey.trim() === '') return;

      await setApiKey(context.secrets, apiKey.trim());

      vscode.window
        .showInformationMessage('AGI Workforce API key saved.', 'Open Chat')
        .then((choice) => {
          if (choice === 'Open Chat') {
            vscode.commands.executeCommand('agi-workforce.chat');
          }
        });
    }),

    register('agi-workforce.clearApiKey', async () => {
      const choice = await vscode.window.showWarningMessage(
        'Clear the stored AGI Workforce API key?',
        { modal: true },
        'Clear',
      );
      if (choice === 'Clear') {
        await clearApiKey(context.secrets);
        vscode.window.showInformationMessage('AGI Workforce API key cleared.');
      }
    }),

    register('agi-workforce.selectModel', async (options?: unknown) => {
      const currentModel = normalizeConfiguredModelId(Config.model());

      const pickerTier = await resolveTier(context);
      const route = sidebarProvider.activeRoute();
      const refresh =
        typeof options === 'object' &&
        options !== null &&
        (options as { refresh?: unknown }).refresh === true;
      const hostModels = await readHostModels(localRuntimes, refresh);
      const allItems: ReachableQuickPickItem[] = buildReachabilityQuickPickItems({
        items: buildGroupedQuickPickItems(pickerTier, route),
        ...(hostModels === undefined ? {} : { hostModels }),
        ...(route?.trustMode === undefined ? {} : { privacyMode: route.trustMode }),
      }).map((item) => ({
        ...item,
        picked: item.modelId !== undefined && item.modelId === currentModel,
      }));

      const picked = await vscode.window.showQuickPick(allItems, {
        title: 'AGI Workforce, Select Model',
        placeHolder: `Current: ${modelDisplayLabel(currentModel)}`,
        matchOnDescription: true,
        matchOnDetail: true,
      });

      if (picked === undefined || picked.modelId === undefined) return;

      if (picked.unreachable !== undefined) {
        await runUnreachableOffer(picked.unreachable);
        return;
      }
      if (picked.refusedBoundary !== undefined) {
        vscode.window.showWarningMessage(
          'AGI Workforce: this chat keeps its work inside one trust boundary, so it cannot switch to that model. Start a new chat to change where the work goes.',
        );
        return;
      }

      const tier = await resolveTier(context);
      if (picked.lock !== undefined) {
        await offerModelUnlock(modelDisplayLabel(picked.modelId), picked.lock);
        return;
      }
      const guardResult = guardProviderSwitch(currentModel, picked.modelId, tier);
      if (guardResult === 'upgrade-required') {
        const choice = await vscode.window.showInformationMessage(
          'This model switch requires an eligible AGI plan.',
          'Upgrade',
          'Cancel',
        );
        if (choice === 'Upgrade') {
          await vscode.env.openExternal(vscode.Uri.parse(UPGRADE_URL));
        }
        return;
      }

      await vscode.workspace
        .getConfiguration('agiWorkforce')
        .update('model', picked.modelId, vscode.ConfigurationTarget.Global);

      telemetry.logEvent(telemetry.TelemetryEvents.MODEL_SELECTED, { model: picked.modelId });
      vscode.window.showInformationMessage(`AGI Workforce model set to: ${picked.modelId}`);
    }),

    register('agi-workforce.openConversation', async (idOrItem: string | ConversationTreeItem) => {
      const id = typeof idOrItem === 'string' ? idOrItem : idOrItem.thread.id;
      await revealFirstPartyChat();
      await sidebarProvider.resumeConversation(id);
    }),

    register('agi-workforce.deleteConversation', async (item?: ConversationTreeItem) => {
      const thread = item?.thread ?? (await pickDeveloperSession('Archive which session?'));
      if (thread === undefined) return;
      const choice = await vscode.window.showWarningMessage(
        `Archive developer session "${thread.title}"?`,
        { modal: true },
        'Archive',
      );
      if (choice === 'Archive') {
        const archived = await conversationTreeProvider.archiveThread(thread.id);
        if (!archived) {
          vscode.window.showWarningMessage('AGI Workforce: Developer session not found.');
        }
      }
    }),

    register('agi-workforce.permanentlyDeleteConversation', async (item?: ConversationTreeItem) => {
      const thread =
        item?.thread ?? (await pickDeveloperSession('Permanently delete which session?'));
      if (thread === undefined) return;
      const choice = await vscode.window.showWarningMessage(
        `Permanently delete developer session "${thread.title}"?`,
        {
          modal: true,
          detail:
            'Its transcript and the approvals and file changes recorded with it are removed from this machine for every AGI surface. This cannot be undone. Archive the session instead to keep it.',
        },
        'Delete Permanently',
      );
      if (choice !== 'Delete Permanently') return;
      try {
        const deleted = await conversationTreeProvider.deleteThread(thread.id);
        if (!deleted) {
          vscode.window.showWarningMessage('AGI Workforce: Developer session not found.');
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `AGI Workforce: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }),

    register('agi-workforce.forkConversation', async (item?: ConversationTreeItem) => {
      const thread = item?.thread ?? (await pickDeveloperSession('Fork which session?'));
      if (thread === undefined) return;
      const title = await vscode.window.showInputBox({
        prompt: 'Name for the forked session',
        value: `${thread.title} (fork)`,
        ignoreFocusOut: true,
      });
      if (title === undefined) return;
      const forkedId = await conversationTreeProvider.forkThread(
        thread.id,
        title.trim() === '' ? undefined : title.trim(),
      );
      if (forkedId === null) {
        vscode.window.showWarningMessage('AGI Workforce: Developer session not found.');
        return;
      }
      await revealFirstPartyChat();
      await sidebarProvider.resumeConversation(forkedId);
    }),

    register('agi-workforce.refreshConversations', () => {
      conversationTreeProvider.refresh();
    }),

    register('agi-workforce.showSessionsHistory', async () => {
      const conversations = await conversationTreeProvider.getThreads();

      if (conversations.length === 0) {
        const choice = await vscode.window.showInformationMessage(
          'AGI Workforce: No conversation history yet. Start a new chat!',
          'New Chat',
        );
        if (choice === 'New Chat') {
          await vscode.commands.executeCommand('agi-workforce.newConversation');
        }
        return;
      }

      const items: (vscode.QuickPickItem & { conversationId?: string })[] = conversations.map(
        (conv) => {
          const relativeTime = sessionHistoryRelativeTime(Date.parse(conv.updatedAt));
          return {
            label: `$(comment) ${conv.title}`,
            description: relativeTime,
            detail: `${conv.status} · ${conv.model ?? 'configured model'} · ${conv.cwd ?? 'workspace'}`,
            conversationId: conv.id,
          };
        },
      );

      const pick = await vscode.window.showQuickPick(items, {
        title: 'AGI Workforce, Sessions History',
        placeHolder: 'Search sessions…',
        matchOnDescription: true,
        matchOnDetail: true,
      });

      if (pick?.conversationId !== undefined) {
        await vscode.commands.executeCommand('agi-workforce.openConversation', pick.conversationId);
      }
    }),

    register('agi-workforce.exportDiagnostics', async () => {
      const token = await getAccountToken(context.secrets);
      if (!token) {
        vscode.window.showWarningMessage(
          'AGI Workforce: sign in first. Diagnostics are redacted on the server, so nothing is exported while you are signed out.',
        );
        return;
      }

      try {
        const result = await exportVsCodeDiagnostics({
          token,
          baseUrl: getCloudWebOrigin(),
          environment: {
            extensionVersion: getExtensionVersion(),
            hostName: vscode.env.appName,
            hostVersion: vscode.version,
            language: vscode.env.language,
            osPlatform: process.platform,
          },
        });
        const target = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(result.filename),
          filters: { JSON: ['json'] },
        });
        if (!target) return;
        await vscode.workspace.fs.writeFile(
          target,
          Buffer.from(JSON.stringify(result.diagnostics, null, 2), 'utf8'),
        );
        vscode.window.showInformationMessage(`AGI Workforce: ${result.summary}`);
      } catch (cause) {
        vscode.window.showErrorMessage(
          `AGI Workforce: ${cause instanceof Error ? cause.message : 'Diagnostics export failed.'}`,
        );
      }
    }),

    register('agi-workforce.sendFeedback', async () => {
      const FEEDBACK_TYPES: vscode.QuickPickItem[] = [
        {
          label: '$(bug) Report a Bug',
          description: 'Something is broken or not working as expected',
        },
        {
          label: '$(lightbulb) Feature Request',
          description: 'Suggest a new feature or improvement',
        },
        { label: '$(comment) General Feedback', description: 'Share thoughts about the extension' },
      ];

      const picked = await vscode.window.showQuickPick(FEEDBACK_TYPES, {
        title: 'AGI Workforce, Send Feedback',
        placeHolder: 'What kind of feedback?',
      });

      if (picked === undefined) return;

      const feedbackText = await vscode.window.showInputBox({
        title: 'AGI Workforce, Send Feedback',
        prompt: `${picked.label.replace(/\$\([^)]+\)\s*/, '')}: Describe your feedback`,
        placeHolder: 'Your feedback here…',
        ignoreFocusOut: true,
        validateInput: (v) => (v.trim() === '' ? 'Feedback cannot be empty.' : undefined),
      });

      if (feedbackText === undefined) return;

      const feedbackType = picked.label.includes('Bug')
        ? 'bug'
        : picked.label.includes('Feature')
          ? 'feature'
          : 'general';

      const encoded = encodeURIComponent(
        `**Type**: ${feedbackType}\n**VS Code**: ${vscode.version}\n**Extension**: ${getExtensionVersion()}\n**Platform**: ${process.platform}\n\n${feedbackText.trim()}`,
      );
      void vscode.env.openExternal(
        vscode.Uri.parse(
          `https://github.com/agiworkforce/agiworkforce/issues/new?title=${encodeURIComponent(`[VS Code Extension] ${feedbackType}: ${feedbackText.trim().slice(0, 60)}`)}&body=${encoded}`,
        ),
      );
      vscode.window.showInformationMessage(
        'AGI Workforce: Opening GitHub to submit your feedback. Thank you!',
      );
    }),

    register('agi.git.status', async () => {
      if (!vscode.workspace.isTrusted) {
        vscode.window.showWarningMessage(
          'AGI Workforce: git is disabled in untrusted workspaces. Trust the workspace to run git.',
        );
        return;
      }
      const folder = await getActiveWorkspaceFolder();
      if (!folder) {
        vscode.window.showErrorMessage('No workspace open');
        return;
      }
      await runGitToOutputChannel(['status'], folder.uri.fsPath, 'git status');
    }),

    register('agi.git.diff', async () => {
      if (!vscode.workspace.isTrusted) {
        vscode.window.showWarningMessage(
          'AGI Workforce: git is disabled in untrusted workspaces. Trust the workspace to run git.',
        );
        return;
      }
      const folder = await getActiveWorkspaceFolder();
      if (!folder) {
        vscode.window.showErrorMessage('No workspace open');
        return;
      }
      await runGitToOutputChannel(['diff'], folder.uri.fsPath, 'git diff');
    }),

    register('agi.git.commit', async () => {
      const msg = await vscode.window.showInputBox({
        prompt: 'Commit message',
        placeHolder: 'feat: ...',
      });
      if (!msg) return;
      const folder = await getActiveWorkspaceFolder();
      if (!folder) {
        vscode.window.showErrorMessage(
          'AGI Workforce: open a workspace folder before committing, there is no repository to commit to.',
        );
        return;
      }

      try {
        const gitExt = vscode.extensions.getExtension('vscode.git');
        if (gitExt !== undefined) {
          if (!gitExt.isActive) await gitExt.activate();
          const api = (
            gitExt.exports as {
              getAPI: (v: number) => {
                repositories: Array<{
                  rootUri: vscode.Uri;
                  add: (paths: string[]) => Promise<void>;
                  commit: (msg: string, opts?: { all?: boolean }) => Promise<void>;
                }>;
              };
            }
          ).getAPI(1);
          const repo = api.repositories.find((r) => r.rootUri.fsPath === folder.uri.fsPath);
          if (repo !== undefined) {
            await repo.commit(msg, { all: true });
            vscode.window.showInformationMessage(`AGI Workforce: committed "${msg.slice(0, 60)}"`);
            return;
          }
        }
      } catch (err) {
        console.warn('[AGI Workforce] git ext commit failed, falling back to execFile:', err);
      }

      if (!vscode.workspace.isTrusted) {
        vscode.window.showWarningMessage(
          'AGI: git commit fallback is disabled in untrusted workspaces.',
        );
        return;
      }
      await runGitToOutputChannel(['add', '-u'], folder.uri.fsPath, 'git add');
      await runGitToOutputChannel(['commit', '-m', msg], folder.uri.fsPath, 'git commit');
      vscode.window.showInformationMessage(`AGI Workforce: committed "${msg.slice(0, 60)}"`);
    }),

    register('agi.test.run', async () => {
      if (!vscode.workspace.isTrusted) {
        vscode.window.showWarningMessage(
          'AGI Workforce: test execution is disabled in untrusted workspaces. Trust the workspace to run tests.',
        );
        return;
      }
      const folder = await getActiveWorkspaceFolder();
      if (!folder) {
        vscode.window.showErrorMessage('No workspace open');
        return;
      }
      const workspaceRoot = folder.uri.fsPath;

      let testCmd = 'npm test';
      if (fs.existsSync(path.join(workspaceRoot, 'package.json'))) {
        if (fs.existsSync(path.join(workspaceRoot, 'pnpm-lock.yaml'))) testCmd = 'pnpm test';
        if (fs.existsSync(path.join(workspaceRoot, 'yarn.lock'))) testCmd = 'yarn test';
      }
      if (fs.existsSync(path.join(workspaceRoot, 'Cargo.toml'))) testCmd = 'cargo test';
      if (
        fs.existsSync(path.join(workspaceRoot, 'pytest.ini')) ||
        fs.existsSync(path.join(workspaceRoot, 'pyproject.toml'))
      )
        testCmd = 'pytest';

      const terminal = vscode.window.createTerminal({ name: 'AGI Tests', cwd: folder.uri });
      terminal.show();
      terminal.sendText(testCmd);
    }),

    register('agi-workforce.newConversation', () => {
      sidebarProvider.resetConversation();
      sidebarProvider.reveal();
    }),

    register('agi-workforce.modelDashboard', () => {
      ModelMetricsPanel.createOrShow(context.extensionUri, context);
    }),

    register(OPEN_PATH_REFERENCE_COMMAND, async (target?: unknown) => {
      await openPathReference(target);
    }),

    register('agi-workforce.openActionSheet', async () => {
      const currentModel = normalizeConfiguredModelId(Config.model());
      const currentMode = Config.agentMode();
      const currentEffort = Config.agentEffort();

      function cap(s: string): string {
        return s.charAt(0).toUpperCase() + s.slice(1);
      }

      type ActionSheetAction =
        | 'attach-file'
        | 'mention-file-project'
        | 'clear'
        | 'history'
        | 'switch-model'
        | 'effort'
        | 'mode'
        | 'account';
      type ActionSheetItem = vscode.QuickPickItem & { action?: ActionSheetAction };
      const allItems: ActionSheetItem[] = [
        { label: 'Context', kind: vscode.QuickPickItemKind.Separator },
        {
          label: '$(file-add) Attach file',
          description: 'Add a workspace file to conversation context',
          action: 'attach-file',
        },
        {
          label: '$(mention) Mention file from project',
          description: 'Open file picker and insert mention into @agi chat',
          action: 'mention-file-project',
        },
        {
          label: '$(trash) Clear conversation',
          description: 'Start a fresh conversation',
          action: 'clear',
        },
        {
          label: '$(history) Developer session history',
          description: 'Resume a workspace-scoped developer session',
          action: 'history',
        },
        { label: 'Model', kind: vscode.QuickPickItemKind.Separator },
        {
          label: '$(symbol-color) Switch model…',
          description: `Current: ${modelDisplayLabel(currentModel)}`,
          action: 'switch-model',
        },
        {
          label: `$(brain) Effort: ${cap(currentEffort)}`,
          description: 'Set reasoning effort (Low / Medium / High / Max)',
          action: 'effort',
        },
        {
          label: `$(robot) Mode: ${cap(currentMode)}`,
          description: 'Set agent operating mode',
          action: 'mode',
        },
        {
          label: '$(account) Account & usage',
          description: 'Account, subscription, usage, billing, and privacy controls',
          action: 'account',
        },
      ];

      const pick = await vscode.window.showQuickPick(allItems, {
        title: 'AGI Workforce, Actions',
        placeHolder: 'Search actions…',
        matchOnDescription: true,
      });

      if (pick === undefined) return;

      switch (pick.action) {
        case 'attach-file': {
          const uris = await vscode.window.showOpenDialog({
            canSelectMany: true,
            canSelectFiles: true,
            canSelectFolders: false,
            openLabel: 'Add to Context',
            title: 'AGI Workforce, Attach Workspace Files to Context',
          });
          if (uris !== undefined && uris.length > 0) {
            for (const uri of uris) {
              await vscode.commands.executeCommand('agi-workforce.addToContext', uri);
            }
          }
          break;
        }
        case 'clear':
          sidebarProvider.resetConversation();
          sidebarProvider.reveal();
          break;
        case 'history':
          await vscode.commands.executeCommand('agi-workforce.showSessionsHistory');
          break;
        case 'switch-model':
          await vscode.commands.executeCommand('agi-workforce.selectModel');
          break;
        case 'effort': {
          type EffortItem = vscode.QuickPickItem & {
            value: 'low' | 'medium' | 'high' | 'max';
          };
          const effortItems: EffortItem[] = [
            {
              label: '$(circle-outline) Low',
              description: 'Minimal reasoning, fastest, lowest cost',
              value: 'low',
            },
            {
              label: '$(circle-filled) Medium',
              description: 'Balanced reasoning, default',
              value: 'medium',
            },
            {
              label: '$(pulse) High',
              description: 'Extended reasoning, slower, higher quality',
              value: 'high',
            },
            {
              label: '$(sparkle) Max',
              description: 'Maximum reasoning budget',
              value: 'max',
            },
          ];
          const effortPick = await vscode.window.showQuickPick(effortItems, {
            title: 'AGI Workforce, Set Effort',
            placeHolder: `Current: ${cap(currentEffort)}`,
          });
          const selectedEffort = effortPick?.value;
          if (selectedEffort !== undefined) {
            if (await setAgentEffortWithConsent(context, selectedEffort)) {
              vscode.window.showInformationMessage(
                `AGI Workforce effort set to: ${cap(selectedEffort)}`,
              );
            }
          }
          break;
        }
        case 'mode': {
          type AgentModeItem = vscode.QuickPickItem & {
            value: 'ask' | 'auto' | 'plan' | 'bypass';
          };
          const modeItems: AgentModeItem[] = [
            {
              label: '$(comment-discussion) Ask before edits',
              description: 'Confirm every edit before it runs',
              value: 'ask',
            },
            {
              label: '$(robot) Auto safe operations',
              description: 'Safe reads run automatically; writes and commands require approval',
              value: 'auto',
            },
            {
              label: '$(checklist) Plan mode',
              description: 'Generate a plan; no edits until approved',
              value: 'plan',
            },
            {
              label: '$(warning) Bypass permissions',
              description: 'Skip all approval prompts (dangerous)',
              value: 'bypass',
            },
          ];
          const modePick = await vscode.window.showQuickPick(modeItems, {
            title: 'AGI Workforce, Set Agent Mode',
            placeHolder: `Current: ${cap(currentMode)}`,
          });
          const selectedMode = modePick?.value;
          if (selectedMode !== undefined) {
            if (await setAgentModeWithConsent(context, selectedMode)) {
              vscode.window.showInformationMessage(
                `AGI Workforce agent mode set to: ${cap(selectedMode)}`,
              );
            }
          }
          break;
        }
        case 'account':
          await vscode.commands.executeCommand('agi-workforce.showAccountUsage');
          break;
        case 'mention-file-project':
          await vscode.commands.executeCommand('agi-workforce.mentionFileFromProject');
          break;
      }
    }),

    register('agi-workforce.showTierStatus', async () => {
      await vscode.commands.executeCommand('agi-workforce.showAccountUsage');
    }),

    register('agi-workforce.setAgentMode', async () => {
      const currentMode = Config.agentMode();
      function capMode(s: string): string {
        return s.charAt(0).toUpperCase() + s.slice(1);
      }
      const modeItems: vscode.QuickPickItem[] = [
        {
          label: '$(comment-discussion) Ask before edits',
          description: 'AGI will ask for approval before making each edit',
          detail: 'ask',
          picked: currentMode === 'ask',
        },
        {
          label: '$(symbol-misc) Auto safe operations',
          description: 'Safe reads run automatically; writes and commands require approval',
          detail: 'auto',
          picked: currentMode === 'auto',
        },
        {
          label: '$(checklist) Plan mode',
          description: 'AGI will explore the code and present a plan before editing',
          detail: 'plan',
          picked: currentMode === 'plan',
        },
        {
          label: '$(warning) Bypass permissions',
          description:
            'AGI will not ask for approval before running potentially dangerous commands',
          detail: 'bypass',
          picked: currentMode === 'bypass',
        },
      ];
      const modePick = await vscode.window.showQuickPick(modeItems, {
        title: 'AGI Workforce, Modes',
        placeHolder: `Current: ${capMode(currentMode)} · choose the authority for future actions`,
        matchOnDescription: true,
      });
      if (modePick?.detail !== undefined) {
        const selectedMode = modePick.detail as 'ask' | 'auto' | 'plan' | 'bypass';
        if (await setAgentModeWithConsent(context, selectedMode)) {
          vscode.window.showInformationMessage(
            `AGI Workforce agent mode set to: ${capMode(selectedMode)}`,
          );
        }
      }
    }),

    register('agi-workforce.setAgentEffort', async () => {
      const currentEffort = Config.agentEffort();
      function capEffort(s: string): string {
        return s.charAt(0).toUpperCase() + s.slice(1);
      }
      const effortItems: vscode.QuickPickItem[] = [
        {
          label: '$(circle-outline) Low',
          description: 'Minimal reasoning, fastest, lowest cost',
          detail: 'low',
          picked: currentEffort === 'low',
        },
        {
          label: '$(circle-filled) Medium',
          description: 'Balanced reasoning, default',
          detail: 'medium',
          picked: currentEffort === 'medium',
        },
        {
          label: '$(pulse) High',
          description: 'Extended reasoning, slower, higher quality',
          detail: 'high',
          picked: currentEffort === 'high',
        },
        {
          label: '$(sparkle) Max',
          description: 'Maximum reasoning budget',
          detail: 'max',
          picked: currentEffort === 'max',
        },
      ];
      const effortPick = await vscode.window.showQuickPick(effortItems, {
        title: 'AGI Workforce, Effort',
        placeHolder: `Current: ${capEffort(currentEffort)}`,
        matchOnDescription: true,
      });
      if (effortPick?.detail !== undefined) {
        const selectedEffort = effortPick.detail as 'low' | 'medium' | 'high' | 'max';
        if (await setAgentEffortWithConsent(context, selectedEffort)) {
          vscode.window.showInformationMessage(
            `AGI Workforce effort set to: ${capEffort(selectedEffort)}`,
          );
        }
      }
    }),

    register('agi-workforce.memory', async () => {
      if (!requireWorkspaceMemoryScope()) return;
      const enabled = Config.memoryEnabled();
      const action = await vscode.window.showQuickPick(
        [
          {
            label: enabled ? '$(circle-slash) Turn memory off' : '$(check) Turn memory on',
            detail: 'toggle',
          },
          { label: '$(add) Add a memory fact', detail: 'add' },
          { label: '$(list-unordered) List & remove facts', detail: 'list' },
          { label: '$(trash) Forget everything', detail: 'clear' },
        ],
        {
          title: `AGI Workforce, Memory (${enabled ? 'on' : 'off'})`,
          placeHolder: enabled
            ? 'Choose an action'
            : 'Saved facts are kept but not sent with your turns',
        },
      );
      if (!action) return;

      if (action.detail === 'toggle') {
        await vscode.commands.executeCommand('agi-workforce.memory.toggle');
        return;
      }

      if (action.detail === 'add') {
        await vscode.commands.executeCommand('agi-workforce.memory.create');
        return;
      }

      if (action.detail === 'list') {
        await memoryTreeProvider.refresh();
        await openMemorySurface(memoryTreeProvider);
        return;
      }

      if (action.detail === 'clear') {
        const store = getAccountMemoryStore();
        if (store === undefined) {
          vscode.window.showWarningMessage('AGI Workforce: memory is not ready yet.');
          return;
        }
        if (await store.signedOut()) {
          vscode.window.showInformationMessage(
            'Sign in to AGI Cloud to change the memory your account shares across clients.',
          );
          return;
        }
        const facts = store.cachedFacts();
        if (facts.length === 0) {
          vscode.window.showInformationMessage('No memory facts to forget.');
          return;
        }
        const confirm = await vscode.window.showWarningMessage(
          `Delete all ${facts.length} memory ${facts.length === 1 ? 'fact' : 'facts'} from your AGI Cloud account? They disappear from the web app, the CLI and mobile too, and this cannot be undone.`,
          { modal: true },
          'Forget everything',
        );
        if (confirm === 'Forget everything') {
          const cleared = await store.clear();
          vscode.window.showInformationMessage(
            cleared.applied
              ? 'All memory facts deleted from your account.'
              : `Some facts were kept. ${cleared.refusals.join(' ')}`,
          );
        }
      }
    }),

    register('agi-workforce.memory.toggle', async () => {
      const next = !Config.memoryEnabled();
      await Config.update(context, { key: 'memory.enabled', value: next });
      void memoryTreeProvider.refresh();
      vscode.window.showInformationMessage(
        next
          ? 'Memory on, saved facts are included with your turns.'
          : 'Memory off, saved facts stay stored but are not sent.',
      );
    }),

    register('agi-workforce.memory.refresh', async () => {
      await memoryTreeProvider.refresh();
    }),

    register('agi-workforce.memory.create', async () => {
      if (!requireWorkspaceMemoryScope()) return;
      if (!(await requireMemoryEnabledForCapture(context))) return;
      const text = await vscode.window.showInputBox({
        title: 'AGI Workforce, Add Memory Fact',
        prompt:
          'A short fact included with future developer turns. Stored locally; sent only to the model/provider you choose for that turn.',
        placeHolder: 'Example: I prefer Python over JavaScript for data work.',
        ignoreFocusOut: true,
        validateInput: (value) => {
          const trimmed = value.trim();
          if (!trimmed) return 'Fact cannot be empty.';
          if (trimmed.length > 280) return 'Keep facts under 280 characters.';
          return undefined;
        },
      });
      if (!text) return;
      const trimmed = text.trim();
      const store = getAccountMemoryStore();
      if (store === undefined) {
        vscode.window.showWarningMessage('AGI Workforce: memory is not ready yet.');
        return;
      }
      if (await store.signedOut()) {
        vscode.window.showInformationMessage(
          'Sign in to AGI Cloud to add memory your account shares across clients.',
        );
        return;
      }
      if (store.contains(trimmed)) {
        vscode.window.showInformationMessage('That fact is already in your memory.');
        return;
      }
      const saved = await store.add(trimmed);
      vscode.window.showInformationMessage(
        saved.applied
          ? 'Saved to your account, on every client.'
          : `Not saved. ${saved.refusals.join(' ')}`,
      );
    }),

    register('agi-workforce.memory.edit', async (item: MemoryFactItem) => {
      if (!requireWorkspaceMemoryScope()) return;
      const newText = await vscode.window.showInputBox({
        title: 'AGI Workforce, Edit Memory Fact',
        value: item.fact.text,
        prompt:
          'Update this locally stored fact. It is included only with turns sent to your selected model/provider.',
        ignoreFocusOut: true,
        validateInput: (value) => {
          const trimmed = value.trim();
          if (!trimmed) return 'Fact cannot be empty.';
          if (trimmed.length > 280) return 'Keep facts under 280 characters.';
          return undefined;
        },
      });
      if (!newText || newText.trim() === item.fact.text) return;
      const store = getAccountMemoryStore();
      if (store === undefined) {
        vscode.window.showWarningMessage('AGI Workforce: memory is not ready yet.');
        return;
      }
      const updated = await store.update(item.fact.id, newText.trim());
      if (updated.applied) {
        vscode.window.showInformationMessage('Updated in your account, on every client.');
      } else {
        vscode.window.showWarningMessage(
          `AGI Workforce: not updated. ${updated.refusals.join(' ')}`,
        );
      }
    }),

    register('agi-workforce.memory.delete', async (item: MemoryFactItem) => {
      if (!requireWorkspaceMemoryScope()) return;
      const confirm = await vscode.window.showWarningMessage(
        `Delete this memory from your AGI Cloud account? It disappears from the web app, the CLI and mobile too, and cannot be recovered.\n\n"${item.fact.text.slice(0, 80)}${item.fact.text.length > 80 ? '…' : ''}"`,
        { modal: true },
        'Delete',
      );
      if (confirm === 'Delete') {
        const store = getAccountMemoryStore();
        if (store === undefined) {
          vscode.window.showWarningMessage('AGI Workforce: memory is not ready yet.');
          return;
        }
        const removed = await store.remove(item.fact.id);
        vscode.window.showInformationMessage(
          removed.applied
            ? 'Deleted from your account, on every client.'
            : `Not deleted. ${removed.refusals.join(' ')}`,
        );
      }
    }),
  );

  context.subscriptions.push(
    register('agi-workforce.openInviteCodeModal', async () => {
      await vscode.commands.executeCommand('agi-workforce.signIn');
    }),
  );

  context.subscriptions.push(
    register('agi-workforce.cycleAgentMode', async () => {
      const modes: ReadonlyArray<'ask' | 'auto' | 'plan' | 'bypass'> = [
        'ask',
        'auto',
        'plan',
        'bypass',
      ];
      const current = Config.agentMode();
      const idx = modes.indexOf(current);
      const next: 'ask' | 'auto' | 'plan' | 'bypass' = modes[(idx + 1) % modes.length] ?? 'auto';
      if (await setAgentModeWithConsent(context, next)) {
        vscode.window.setStatusBarMessage(
          `$(robot) AGI mode: ${next.charAt(0).toUpperCase() + next.slice(1)}`,
          2000,
        );
      }
    }),
  );

  context.subscriptions.push(
    register('agi-workforce.showAccountUsage', async () => {
      const { getTokenCounter } = await import('../data/tokenCounter');

      const counter = getTokenCounter();
      const [capturedAccountToken, capturedTierInfo, capturedAccountIdentity] = await Promise.all([
        getAccountToken(context.secrets),
        fetchTierInfo(context.secrets),
        fetchAccountIdentity(context.secrets),
      ]);
      const accountToken = await getAccountToken(context.secrets);
      const authInvalidated = capturedAccountToken !== undefined && accountToken === undefined;
      if (authInvalidated || accountToken === undefined) {
        await clearAccountTierCache(context);
      } else {
        await refreshAccountTierCache(context, async () => capturedTierInfo);
      }
      const tierInfo = authInvalidated ? null : capturedTierInfo;
      const accountIdentity = authInvalidated ? null : capturedAccountIdentity;
      const tier =
        tierInfo?.tier ?? context.globalState.get<string>('tierStatus.cachedTier') ?? 'unknown';
      const subscriptionNeedsAttention = Boolean(
        tierInfo?.accountPlanTier && !isEntitledSubscriptionStatus(tierInfo.subscriptionStatus),
      );

      type AccountAction =
        | 'sign-in'
        | 'sign-out'
        | 'settings'
        | 'reset-counter'
        | 'manage-usage'
        | 'manage-billing'
        | 'connectors'
        | 'teams'
        | 'permission-docs'
        | 'privacy-settings';
      type AccountItem = vscode.QuickPickItem & { action?: AccountAction };
      const items: AccountItem[] = buildAccountIdentityItems(
        accountToken !== undefined,
        accountIdentity ?? undefined,
      );
      items.push(...buildTrustReviewItems(Config.agentMode(), accountIdentity ?? undefined));
      items.push(
        { label: 'Session usage', kind: vscode.QuickPickItemKind.Separator },
        {
          label: `$(request-changes) Requests this session`,
          description: `${counter.requestCount}`,
        },
        {
          label: `$(arrow-up) Input tokens`,
          description: formatK(counter.promptTokens),
        },
        {
          label: `$(arrow-down) Output tokens`,
          description: formatK(counter.completionTokens),
        },
        {
          label: `$(graph) Total tokens`,
          description: formatK(counter.totalTokens),
        },
        {
          label: `$(calculator) Rough session estimate`,
          description: `$${counter.estimatedCostUsd.toFixed(4)} · not an invoice, provider bill, or AGI quota`,
        },
      );

      if (tierInfo?.usagePercentage !== undefined) {
        const pct = Math.round(tierInfo.usagePercentage);
        items.push(
          { label: 'Cloud quota', kind: vscode.QuickPickItemKind.Separator },
          {
            label: `$(pulse) Cloud usage: ${pct}% used`,
            description: `Plan: ${tier}`,
          },
        );
      } else {
        const { resolveUsageMeter, formatUsageMeterFallbackLabel } =
          await import('../data/usageMeter');
        const meter = await resolveUsageMeter(context.secrets, 0);
        if (meter.source !== 'managed-plan') {
          items.push(
            { label: 'Cloud quota', kind: vscode.QuickPickItemKind.Separator },
            {
              label: `$(pulse) ${formatUsageMeterFallbackLabel(meter.source)}`,
              description:
                meter.source === 'user-api-key'
                  ? 'Your provider bills these requests; no AGI plan limit applies'
                  : 'Requests never leave this machine; no AGI plan limit applies',
            },
          );
        }
      }

      if (tierInfo?.accountPlanTier && subscriptionNeedsAttention) {
        items.push({
          label: `$(warning) ${tierInfo.accountPlanTier} subscription: ${(tierInfo.subscriptionStatus ?? 'inactive').replace('_', ' ')}`,
          description: 'Paid Cloud capabilities are paused until billing is resolved',
        });
      }

      items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
      if (accountToken) {
        items.push({
          label: '$(verified-filled) AGI Cloud connected',
          description: accountIdentity
            ? `${accountIdentity.displayName} · ${accountIdentity.planName} plan`
            : 'Browser-approved device session',
        });
        items.push({
          label: '$(sign-out) Sign out of AGI Cloud',
          description: 'Remove this editor session',
          action: 'sign-out',
        });
        items.push({
          label: '$(graph) Manage Cloud usage on Web',
          description: 'Plan usage, reset windows, and billing details',
          action: 'manage-usage',
        });
        items.push({
          label: '$(credit-card) Manage billing & subscription',
          description: subscriptionNeedsAttention
            ? 'Restore paid Cloud access on Web'
            : accountIdentity?.cancelAtPeriodEnd === true
              ? 'Review the scheduled cancellation on Web'
              : 'Invoices, payment method, and subscription controls',
          action: 'manage-billing',
        });
        items.push({
          label: '$(plug) Manage Cloud connectors on Web',
          description: "Cloud connectors do not replace this workspace's local MCP configuration",
          action: 'connectors',
        });
      } else {
        items.push({
          label: '$(cloud) Sign in to AGI Cloud',
          description: 'Approve this editor in your browser',
          action: 'sign-in',
        });
      }
      items.push({
        label:
          tier === 'team' || tier === 'enterprise'
            ? '$(organization) Manage Team workspace on Web'
            : '$(organization) Explore Team & Enterprise',
        description:
          tier === 'team' || tier === 'enterprise'
            ? 'Members, roles, and organization settings'
            : 'Business plans and deployment options',
        action: 'teams',
      });
      items.push({
        label: '$(settings-gear) AGI settings',
        description: 'Models, providers, runtime, tools, and permissions',
        action: 'settings',
      });
      items.push({
        label: '$(trash) Reset session counter',
        action: 'reset-counter',
      });

      const pick = await vscode.window.showQuickPick(items, {
        title: `AGI Workforce, Account & Usage (${tier})`,
        placeHolder: 'Session stats',
        matchOnDescription: true,
      });

      if (pick?.action === 'sign-in') {
        await vscode.commands.executeCommand('agi-workforce.signIn');
      } else if (pick?.action === 'sign-out') {
        await vscode.commands.executeCommand('agi-workforce.signOut');
      } else if (pick?.action === 'settings') {
        await vscode.commands.executeCommand('agi-workforce.openSettings', 'general');
      } else if (pick?.action === 'manage-usage') {
        await vscode.env.openExternal(
          vscode.Uri.parse('https://agiworkforce.com/settings/usage?from=vscode-extension'),
        );
      } else if (pick?.action === 'manage-billing') {
        await vscode.env.openExternal(
          vscode.Uri.parse('https://agiworkforce.com/settings/billing?from=vscode-extension'),
        );
      } else if (pick?.action === 'connectors') {
        await vscode.env.openExternal(
          vscode.Uri.parse('https://agiworkforce.com/connectors?from=vscode-extension'),
        );
      } else if (pick?.action === 'teams') {
        const teamsPath =
          tier === 'team' || tier === 'enterprise'
            ? 'https://agiworkforce.com/settings/team?from=vscode-extension'
            : 'https://agiworkforce.com/teams?from=vscode-extension';
        await vscode.env.openExternal(vscode.Uri.parse(teamsPath));
      } else if (pick?.action === 'permission-docs') {
        await vscode.env.openExternal(
          vscode.Uri.parse('https://agiworkforce.com/docs?topic=permissions&from=vscode-extension'),
        );
      } else if (pick?.action === 'privacy-settings') {
        await vscode.env.openExternal(
          vscode.Uri.parse('https://agiworkforce.com/settings/privacy?from=vscode-extension'),
        );
      } else if (pick?.action === 'reset-counter') {
        counter.reset();
        vscode.window.showInformationMessage('AGI Workforce: Token counter reset.');
      }
    }),
  );

  context.subscriptions.push(
    register('agi-workforce.showOnboarding', async () => {
      await context.globalState.update(ONBOARDING_SEEN_KEY, false);
      await vscode.commands.executeCommand('workbench.view.extension.agi-workforce-sidebar');
      sidebarProvider.reveal();
      sidebarProvider.showOnboarding();
    }),
    register('agi-workforce.showCloudTasks', () => openCloudTasksSurface(cloudTasksTreeProvider)),
    register('agi-workforce.showWork', () =>
      openWorkSurface(cloudTasksTreeProvider, schedulesTreeProvider),
    ),
    register('agi-workforce.refreshCloudTasks', () => {
      cloudTasksTreeProvider.refresh();
    }),
    register('agi-workforce.openCloudTasksOnWeb', async () => {
      await vscode.env.openExternal(
        vscode.Uri.parse(`${getCloudWebOrigin()}/tasks?from=vscode-extension`),
      );
    }),
    register(APPROVE_CLOUD_TASK_COMMAND, (item: unknown) => decideOnCloudTask(item, 'approved')),
    register(REJECT_CLOUD_TASK_COMMAND, (item: unknown) => decideOnCloudTask(item, 'rejected')),
    register('agi-workforce.showSchedules', () => openSchedulesSurface(schedulesTreeProvider)),
    register(REFRESH_SCHEDULES_COMMAND, () => {
      schedulesTreeProvider.refresh();
    }),
    register('agi-workforce.openSchedulesOnWeb', async () => {
      await vscode.env.openExternal(vscode.Uri.parse(schedulesWebUrl(getCloudWebOrigin())));
    }),
    register(OPEN_SCHEDULE_COMMAND, async () => {
      await vscode.env.openExternal(vscode.Uri.parse(schedulesWebUrl(getCloudWebOrigin())));
    }),
    register(PAUSE_SCHEDULE_COMMAND, (item: unknown) =>
      withScheduleFromItem(item, (client, task) =>
        setScheduleEnabledInteractively(client, task, false, scheduleActionHost),
      ),
    ),
    register(RESUME_SCHEDULE_COMMAND, (item: unknown) =>
      withScheduleFromItem(item, (client, task) =>
        setScheduleEnabledInteractively(client, task, true, scheduleActionHost),
      ),
    ),
    register(RUN_SCHEDULE_NOW_COMMAND, (item: unknown) =>
      withScheduleFromItem(item, (client, task) =>
        runScheduleNowInteractively(client, task, scheduleActionHost),
      ),
    ),
    register(SHOW_SCHEDULE_RUNS_COMMAND, (item: unknown) =>
      withScheduleFromItem(item, (client, task) =>
        showScheduleRuns(client, task, scheduleActionHost),
      ),
    ),
    register('agi-workforce.showProjects', () => openProjectsSurface(projectsTreeProvider)),
    register(REFRESH_PROJECTS_COMMAND, () => {
      projectsTreeProvider.refresh();
    }),
    register('agi-workforce.openProjectsOnWeb', async () => {
      await vscode.env.openExternal(vscode.Uri.parse(projectsWebUrl(getCloudWebOrigin())));
    }),
    register(OPEN_PROJECT_COMMAND, async (projectId: unknown) => {
      if (typeof projectId !== 'string' || projectId === '') return;
      await withProjectsWorkspace((workspace) =>
        showProjectDetail(workspace, projectId, projectDetailHost),
      );
    }),
    register(CREATE_PROJECT_COMMAND, async () => {
      await withProjectsWorkspace(async (workspace) => {
        await createProjectInteractively(workspace, projectDetailHost);
      });
    }),
    register(DELETE_PROJECT_COMMAND, async (item: unknown) => {
      const project = readProjectCommandArgument(item);
      if (project === undefined) return;
      await withProjectsWorkspace((workspace) =>
        deleteProjectInteractively(workspace, project, projectDetailHost),
      );
    }),
    register(USE_PROJECT_IN_CHAT_COMMAND, async (item: unknown) => {
      const project = readProjectCommandArgument(item);
      if (project === undefined) return;
      await applyProjectToChat(project, projectDetailHost);
    }),
    register(CLEAR_ACTIVE_PROJECT_COMMAND, async () => {
      const active = getActiveCloudProject(context.workspaceState);
      if (active === undefined) {
        vscode.window.showInformationMessage(
          'AGI Workforce: no project is applied to turns in this workspace.',
        );
        return;
      }
      await clearActiveCloudProject(context.workspaceState);
      vscode.window.showInformationMessage(
        `AGI Workforce: turns in this workspace no longer use "${active.name}".`,
      );
      projectsTreeProvider.refresh();
      sidebarProvider.pushActiveProject();
    }),
    register('agi-workforce.showArtifacts', () => openArtifactsSurface(artifactsTreeProvider)),
    register(REFRESH_ARTIFACTS_COMMAND, () => {
      artifactsTreeProvider.refresh();
    }),
    register('agi-workforce.openArtifactsOnWeb', async () => {
      await vscode.env.openExternal(vscode.Uri.parse(artifactsWebUrl(getCloudWebOrigin())));
    }),
    register(OPEN_ARTIFACT_COMMAND, (artifactId: unknown) =>
      withArtifactFromId(artifactId, (workspace, artifact) =>
        openArtifactReadOnly(workspace, artifact, { contentProvider: artifactContentProvider }),
      ),
    ),
    register(SAVE_ARTIFACT_COMMAND, async (item: unknown) => {
      const artifact = readArtifactCommandArgument(item);
      if (artifact === undefined) return;
      await withArtifactsWorkspace((workspace) => saveArtifactToWorkspace(workspace, artifact));
    }),
    register(OPEN_ARTIFACT_ON_WEB_COMMAND, async (item: unknown) => {
      const published = (item as { published?: unknown } | null)?.published;
      if (published === null || typeof published !== 'object') return;
      await openPublishedArtifact(published as Parameters<typeof openPublishedArtifact>[0]);
    }),
    register('agi-workforce.showConnectors', () => openConnectorsSurface(connectorsTreeProvider)),
    register('agi-workforce.showContextFiles', () => openContextSurface(contextPanelProvider)),
    register('agi-workforce.showSkills', () => openCapabilitySurface(cliCapabilities, 'skills')),
    register('agi-workforce.showPlugins', () => openCapabilitySurface(cliCapabilities, 'plugins')),
    register('agi-workforce.showMcpServers', () =>
      openCapabilitySurface(cliCapabilities, 'mcpServers'),
    ),
    register('agi-workforce.showHooks', () => openCapabilitySurface(cliCapabilities, 'hooks')),
    register('agi-workforce.showInstructions', () =>
      openCapabilitySurface(cliCapabilities, 'instructions'),
    ),
    register('agi-workforce.runCliCommand', async (commandName: unknown) => {
      const name = typeof commandName === 'string' ? commandName.trim() : '';
      if (name === '') return;
      const result = await cliCapabilities.call('runCommand', name);
      if (result.status === 'ok') return;
      vscode.window.showWarningMessage(`AGI Workforce: ${result.reason}`);
    }),
    register(REFRESH_CONNECTORS_COMMAND, () => {
      connectorsTreeProvider.refresh();
    }),
    register(MANAGE_CONNECTORS_COMMAND, async () => {
      await vscode.env.openExternal(vscode.Uri.parse(connectorsWebUrl(getCloudWebOrigin())));
    }),
    register('agi-workforce.openCloudTask', async (runId: unknown) => {
      if (typeof runId !== 'string' || runId === '') return;
      const resolution = await resolveCloudAgentRunClient(context.secrets);
      if (resolution.status === 'signed-out') {
        await vscode.commands.executeCommand('agi-workforce.signIn');
        return;
      }
      await showCloudRunDetail(resolution.client, runId, {
        webOrigin: getCloudWebOrigin(),
        onChanged: () => cloudTasksTreeProvider.refresh(),
        listArtifacts: async () => {
          const artifacts = await resolveArtifactsWorkspace(context.secrets);
          return artifacts.status === 'signed-out' ? [] : artifacts.workspace.index.listArtifacts();
        },
        openArtifact: (artifactId) =>
          withArtifactFromId(artifactId, (workspace, artifact) =>
            openArtifactReadOnly(workspace, artifact, { contentProvider: artifactContentProvider }),
          ),
      });
    }),
  );

  context.subscriptions.push(
    register('agi-workforce.mentionFileFromProject', async () => {
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        canSelectFiles: true,
        canSelectFolders: false,
        openLabel: 'Mention in Chat',
        title: 'AGI Workforce, Mention File from Project',
      });
      if (uris === undefined || uris.length === 0 || uris[0] === undefined) return;
      const result = await validateWorkspaceContextFile(uris[0]);
      if (!result.ok) {
        vscode.window.showWarningMessage(`AGI Workforce: ${result.message}`);
        return;
      }
      if (!nativeChatAvailable) {
        await prefillFirstPartyReference(result.uri);
        return;
      }
      const query = buildChatReferenceQuery(result.uri);
      try {
        await vscode.commands.executeCommand('workbench.action.chat.open', { query });
      } catch {
        try {
          await vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
        } catch {
          sidebarProvider.reveal();
        }
      }
    }),
  );

  registerChatRetryCommand(context, {
    transcript: () => sidebarProvider.chatTranscript(),
    isStreaming: () => sidebarProvider.chatTurnInFlight(),
    resend: (text, references) => sidebarProvider.resendInChat(text, references),
  });

  if (failedCommandIds.length > 0) {
    console.error(
      `[AGI Workforce] ${failedCommandIds.length} command registration(s) failed: ${failedCommandIds.join(', ')}`,
    );
    vscode.window.showErrorMessage(
      `AGI Workforce: ${failedCommandIds.length} command(s) failed to register (${failedCommandIds.join(', ')}). ` +
        'Check the AGI subsystem-health status bar item for details.',
    );
  }
}

function formatK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
