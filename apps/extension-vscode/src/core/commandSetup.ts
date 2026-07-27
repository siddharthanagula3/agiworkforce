import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
// AUDIT-FIX: vscode-reorg
import { SidebarProvider } from '../features/sidebar-webview/sidebarProvider';
import { AgiDiagnosticsProvider } from '../providers/diagnosticsProvider';
import { DiffDecorationProvider } from '../providers/diffDecorationProvider';
import {
  ConversationTreeProvider,
  ConversationTreeItem,
  ContextPanelProvider,
  validateWorkspaceContextFile,
} from '../features/trees';
import { MemoryTreeProvider, MemoryFactItem } from '../memory/memoryTreeProvider';
import {
  loadFacts,
  addFact,
  updateFact,
  deleteFact,
  clearFacts,
  containsFact,
} from '../memory/memoryStore';
import { ChatEditorPanel } from '../providers/chatEditorPanel';
import { type LocalRuntimePool } from '../integrations/localRuntimePool';
import { ModelMetricsPanel } from '../features/model-picker/modelMetrics';
import { getDesktopBridge } from '../features/desktop-bridge';
import { showOriginalContext, getPatchOutputChannel } from '../integrations/patchEngine';
import { runInlineCommand } from './runInlineCommand';
import {
  clearAccountTierCache,
  refreshAccountTierCache,
  resolveTier,
} from '../integrations/tierResolver';
import { guardProviderSwitch } from '../integrations/providerSwitchGuard';
import { getActiveWorkspaceFolder } from '../platform/workspaceFolders';
import { getApiKey, getAccountToken, setApiKey, clearApiKey, fetchTierInfo } from '../utils/api';
import { signInToAgiCloud, signOutOfAgiCloud } from '../features/account-auth/deviceAuth';
import { getExtensionVersion } from '../platform/version';
import { Config } from '../platform/config';
import { isEntitledSubscriptionStatus } from '@agiworkforce/types';
import {
  normalizeConfiguredModelId,
  buildGroupedQuickPickItems,
  type GroupedQuickPickItem,
} from '../features/model-picker/modelConstants';
import * as telemetry from './telemetry';
import { recordFailure } from './subsystemHealth';

const execFileAsync = promisify(execFile);

/**
 * Output channel for git/test commands invoked via execFile.
 * PR-3B (F-12, F-19): replaces `terminal.sendText` for hardcoded commands
 * so shell metacharacters in dynamic args (e.g. commit messages) cannot
 * cross into the shell. Output lands in a dedicated channel rather than
 * the integrated terminal.
 */
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
    vscode.window.showErrorMessage(`AGI Workforce: ${title} failed — ${msg}`);
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

export interface CommandDeps {
  sidebarProvider: SidebarProvider;
  conversationTreeProvider: ConversationTreeProvider;
  localRuntimes: LocalRuntimePool;
  contextPanelProvider: ContextPanelProvider;
  memoryTreeProvider: MemoryTreeProvider;
  diffDecorationProvider: DiffDecorationProvider;
  diagnosticsProvider: AgiDiagnosticsProvider;
}

export function setupCommands(context: vscode.ExtensionContext, deps: CommandDeps): void {
  const {
    sidebarProvider,
    conversationTreeProvider,
    localRuntimes,
    contextPanelProvider,
    memoryTreeProvider,
    diffDecorationProvider,
    diagnosticsProvider,
  } = deps;

  // Per-command registration guard. All commands below are elements of big
  // array literals pushed to `context.subscriptions` — array literals evaluate
  // left-to-right, so ONE synchronous `registerCommand` throw (e.g. a duplicate
  // command id) would silently abort every later registration in the same
  // literal. Registering through this helper isolates each failure: the error
  // is recorded in subsystem health (status-bar warning + detail quick-pick),
  // logged, and surfaced once via an error toast after setup — never swallowed
  // silently, and never able to take down the remaining commands.
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

  context.subscriptions.push(
    // ── context panel commands ──────────────────────────────────────────────────
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

    register('agi-workforce.removeFromContext', (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
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

    register('agi-workforce.mentionFileInChat', async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (target === undefined) {
        vscode.window.showWarningMessage('AGI Workforce: No file selected to mention in chat.');
        return;
      }
      const relPath = vscode.workspace.asRelativePath(target);
      const query = `@agi #file:${relPath} `;
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

    // ── diff commands ───────────────────────────────────────────────────────────
    register('agi-workforce.acceptDiff', async (sessionId: string) => {
      await diffDecorationProvider.acceptDiff(sessionId);
    }),
    register('agi-workforce.rejectDiff', (sessionId: string) => {
      diffDecorationProvider.rejectDiff(sessionId);
    }),
    register('agi-workforce.acceptAllDiffs', async (uri: vscode.Uri) => {
      await diffDecorationProvider.acceptAll(uri);
    }),
    register('agi-workforce.rejectAllDiffs', (uri: vscode.Uri) => {
      diffDecorationProvider.rejectAll(uri);
    }),
    register('agi-workforce.acceptCurrentDiff', async () => {
      await diffDecorationProvider.acceptCurrentDiff();
    }),
    register('agi-workforce.rejectCurrentDiff', () => {
      diffDecorationProvider.rejectCurrentDiff();
    }),
    register('agi-workforce.acceptAllDiffsGlobal', async () => {
      await diffDecorationProvider.acceptAllGlobal();
    }),
    register('agi-workforce.rejectAllDiffsGlobal', () => {
      diffDecorationProvider.rejectAllGlobal();
    }),
    register('agi-workforce.acceptBatch', async (batchId: string) => {
      await diffDecorationProvider.acceptBatch(batchId);
    }),
    register('agi-workforce.rejectBatch', (batchId: string) => {
      diffDecorationProvider.rejectBatch(batchId);
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

    // ── inline command shortcuts ────────────────────────────────────────────────
    register('agi-workforce.chat', async () => {
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
      ChatEditorPanel.createOrShow(
        context.extensionUri,
        context.secrets,
        context,
        localRuntimes,
        conversationTreeProvider,
        diffDecorationProvider,
      );
    }),

    register('agi-workforce.agentMode', () => {
      ChatEditorPanel.createOrShow(
        context.extensionUri,
        context.secrets,
        context,
        localRuntimes,
        conversationTreeProvider,
        diffDecorationProvider,
      );
    }),

    register('agi-workforce.explain', async (targetRange?: vscode.Range) => {
      await runInlineCommand(context, 'explain', targetRange);
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

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'AGI Workforce: Running Code Review…',
          cancellable: true,
        },
        async (_progress, progressToken) => {
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
          } catch (err) {
            cancelSource.dispose();
            if (err instanceof Error && err.message.includes('CANCELLED')) return;
            const message = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`AGI Workforce: Code review failed — ${message}`);
          }
        },
      );
    }),

    // ── API key / auth commands ─────────────────────────────────────────────────
    register('agi-workforce.signIn', async () => {
      // Cloud-only surface: secretless device sign-in. Opens the browser connect
      // page, then polls for the approved token through the shared device-auth
      // service used by the CLI.
      const ok = await signInToAgiCloud(context.secrets);
      if (ok) {
        await refreshAccountTierCache(context);
        sidebarProvider.pushAccountStatus();
        await vscode.commands.executeCommand('agi-workforce.chat');
      }
    }),

    register('agi-workforce.signOut', async () => {
      await signOutOfAgiCloud(context.secrets);
      await clearAccountTierCache(context);
      sidebarProvider.pushAccountStatus();
    }),

    register('agi-workforce.setApiKey', async () => {
      const existing = await getApiKey(context.secrets);
      const placeholder = existing !== undefined ? '(already set — enter new key to replace)' : '';

      const apiKey = await vscode.window.showInputBox({
        title: 'AGI Workforce — Set API Key',
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

    // ── model selection ─────────────────────────────────────────────────────────
    register('agi-workforce.selectModel', async () => {
      const currentModel = normalizeConfiguredModelId(Config.model());

      // VSCODE-PICKER-TIER-01: gate the roster on the resolved tier so a
      // signed-out / Local-mode user does not see managed-cloud models
      // presented as selectable.
      const pickerTier = await resolveTier(context);
      const allItems: GroupedQuickPickItem[] = buildGroupedQuickPickItems(pickerTier).map(
        (item: GroupedQuickPickItem) => ({
          ...item,
          picked: item.modelId !== undefined && item.modelId === currentModel,
        }),
      );

      const picked = await vscode.window.showQuickPick(allItems, {
        title: 'AGI Workforce — Select Model',
        placeHolder: `Current: ${currentModel}`,
        matchOnDescription: true,
        matchOnDetail: true,
      });

      if (picked === undefined || picked.modelId === undefined) return;

      const tier = await resolveTier(context);
      if (picked.disabled === true) {
        const choice = await vscode.window.showInformationMessage(
          'This model is not available for your current plan or provider setup.',
          'View plans',
          'Cancel',
        );
        if (choice === 'View plans') {
          await vscode.env.openExternal(vscode.Uri.parse('https://agiworkforce.com/pricing'));
        }
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
          await vscode.env.openExternal(vscode.Uri.parse('https://agiworkforce.com/pricing'));
        }
        return;
      }

      await vscode.workspace
        .getConfiguration('agiWorkforce')
        .update('model', picked.modelId, vscode.ConfigurationTarget.Global);

      telemetry.logEvent(telemetry.TelemetryEvents.MODEL_SELECTED, { model: picked.modelId });
      vscode.window.showInformationMessage(`AGI Workforce model set to: ${picked.modelId}`);
    }),

    // ── conversation commands ───────────────────────────────────────────────────
    register('agi-workforce.openConversation', async (idOrItem: string | ConversationTreeItem) => {
      const id = typeof idOrItem === 'string' ? idOrItem : idOrItem.thread.id;
      const session = await conversationTreeProvider.readThread(id);
      if (session === undefined) {
        vscode.window.showWarningMessage('AGI Workforce: Developer session not found.');
        return;
      }

      const lines: string[] = [
        `# ${session.thread.title}`,
        '',
        `*Model: ${session.thread.model ?? 'configured model'} · ${session.messages.length} messages*`,
        '',
      ];
      for (const msg of session.messages) {
        if (msg.role === 'system') continue;
        const heading = msg.role === 'user' ? '**You**' : '**AGI Workforce**';
        lines.push(`${heading}`, '', msg.text, '');
      }

      try {
        const doc = await vscode.workspace.openTextDocument({
          content: lines.join('\n'),
          language: 'markdown',
        });
        await vscode.window.showTextDocument(doc, { preview: true });
      } catch {
        vscode.window.showErrorMessage('AGI Workforce: Failed to open conversation.');
      }
    }),

    register('agi-workforce.deleteConversation', async (item: ConversationTreeItem) => {
      const choice = await vscode.window.showWarningMessage(
        `Archive developer session "${item.thread.title}"?`,
        { modal: true },
        'Archive',
      );
      if (choice === 'Archive') {
        const archived = await conversationTreeProvider.archiveThread(item.thread.id);
        if (!archived) {
          vscode.window.showWarningMessage('AGI Workforce: Developer session not found.');
        }
      }
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
        title: 'AGI Workforce — Sessions History',
        placeHolder: 'Search sessions…',
        matchOnDescription: true,
        matchOnDetail: true,
      });

      if (pick?.conversationId !== undefined) {
        await vscode.commands.executeCommand('agi-workforce.openConversation', pick.conversationId);
      }
    }),

    // ── desktop bridge commands ─────────────────────────────────────────────────
    register('agi-workforce.sendToDesktop', async () => {
      const bridge = getDesktopBridge();
      if (bridge === undefined || bridge.status !== 'connected') {
        vscode.window.showWarningMessage(
          'AGI Workforce: Desktop bridge is not connected. Enable it in settings.',
        );
        return;
      }

      const editor = vscode.window.activeTextEditor;
      if (editor === undefined) {
        vscode.window.showWarningMessage('AGI Workforce: No active editor.');
        return;
      }

      const selection = editor.selection;
      const code = editor.document.getText(selection.isEmpty ? undefined : selection);
      if (code.trim() === '') {
        vscode.window.showWarningMessage('AGI Workforce: No code to send.');
        return;
      }

      const result = await bridge.sendCodeSnippet(
        code,
        editor.document.languageId,
        editor.document.uri.fsPath,
      );

      if (result.ok) {
        vscode.window.showInformationMessage('AGI Workforce: Code sent to desktop agent.');
      } else {
        vscode.window.showErrorMessage(`AGI Workforce: ${result.error ?? 'Failed to send code.'}`);
      }
    }),

    register('agi-workforce.syncContextToDesktop', async () => {
      const bridge = getDesktopBridge();
      if (bridge === undefined || bridge.status !== 'connected') {
        vscode.window.showWarningMessage(
          'AGI Workforce: Desktop bridge is not connected. Enable it in settings.',
        );
        return;
      }

      const result = await bridge.shareContext();
      if (result.ok) {
        vscode.window.showInformationMessage('AGI Workforce: Workspace context synced to desktop.');
      } else {
        vscode.window.showErrorMessage(
          `AGI Workforce: ${result.error ?? 'Failed to sync context.'}`,
        );
      }
    }),

    register('agi-workforce.triggerAgentAction', async () => {
      const bridge = getDesktopBridge();
      if (bridge === undefined || bridge.status !== 'connected') {
        vscode.window.showWarningMessage(
          'AGI Workforce: Desktop bridge is not connected. Enable it in settings.',
        );
        return;
      }

      const AGENT_ACTIONS: vscode.QuickPickItem[] = [
        { label: 'open-chat', description: 'Open the AGI Workforce chat panel on the desktop' },
        { label: 'run-task', description: 'Trigger an autonomous task run on the desktop agent' },
        { label: 'open-tool', description: 'Open a specific tool in the desktop app' },
      ];

      const picked = await vscode.window.showQuickPick(AGENT_ACTIONS, {
        title: 'AGI Workforce — Trigger Agent Action',
        placeHolder: 'Select an action to trigger on the desktop app',
        matchOnDescription: true,
      });

      if (picked === undefined) return;

      let params: Record<string, unknown> = {};
      if (picked.label === 'run-task') {
        const taskDescription = await vscode.window.showInputBox({
          title: 'AGI Workforce — Task Description',
          prompt: 'Describe the task for the desktop agent to run',
          placeHolder: 'e.g. Summarize the open project and suggest improvements',
          ignoreFocusOut: true,
          validateInput: (v) => (v.trim() === '' ? 'Task description cannot be empty.' : undefined),
        });
        if (taskDescription === undefined) return;
        params = { description: taskDescription.trim() };
      }

      const result = await bridge.triggerAgentAction(picked.label, params);
      if (result.ok) {
        vscode.window.showInformationMessage(
          `AGI Workforce: Agent action "${picked.label}" sent to desktop.`,
        );
      } else {
        vscode.window.showErrorMessage(
          `AGI Workforce: ${result.error ?? `Failed to trigger action "${picked.label}".`}`,
        );
      }
    }),

    // ── feedback ────────────────────────────────────────────────────────────────
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
        title: 'AGI Workforce — Send Feedback',
        placeHolder: 'What kind of feedback?',
      });

      if (picked === undefined) return;

      const feedbackText = await vscode.window.showInputBox({
        title: 'AGI Workforce — Send Feedback',
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

      const bridge = getDesktopBridge();
      if (bridge !== undefined && bridge.status === 'connected') {
        const result = await bridge.sendToDesktop('feedback', {
          type: feedbackType,
          message: feedbackText.trim(),
          extensionVersion: getExtensionVersion(),
          vscodeVersion: vscode.version,
          platform: process.platform,
        });
        if (result.ok) {
          vscode.window.showInformationMessage('AGI Workforce: Thank you for your feedback!');
          telemetry.logEvent(telemetry.TelemetryEvents.EXTENSION_ACTIVATED, {
            action: 'feedback_sent',
            feedbackType,
          });
          return;
        }
      }

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

    // ── git commands ────────────────────────────────────────────────────────────
    // PR-3B (F-12, F-19): replace `terminal.sendText` with `execFile('git', [...])`
    // so the user's shell config (aliases, profile, RC-file sourcing) cannot
    // affect the literal command we intend to run, and so shell metacharacters
    // in dynamic args (commit messages) are passed as a single argv entry —
    // never interpreted by a shell.
    register('agi.git.status', async () => {
      // EXTV-GIT-READ: `git status`/`git diff` execute repo-controlled code in
      // an untrusted workspace (`core.fsmonitor`, `.gitattributes` textconv /
      // `diff.external`). Gate them exactly like commit/test.run.
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
      if (!folder) return;

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

      // EXTV-GIT-COMMIT: refuse in untrusted workspaces
      if (!vscode.workspace.isTrusted) {
        vscode.window.showWarningMessage(
          'AGI: git commit fallback is disabled in untrusted workspaces.',
        );
        return;
      }
      // PR-3B (F-12): execFile passes commit message as a single argv entry.
      // No shell interpretation. shellQuoteForCurrentPlatform is no longer
      // load-bearing here — kept only as backup utility in workspaceFolders.
      await runGitToOutputChannel(['add', '-u'], folder.uri.fsPath, 'git add');
      await runGitToOutputChannel(['commit', '-m', msg], folder.uri.fsPath, 'git commit');
      vscode.window.showInformationMessage(`AGI Workforce: committed "${msg.slice(0, 60)}"`);
    }),

    register('agi.test.run', async () => {
      // EXTV-3: refuse in untrusted workspaces
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
      // Default `npm test`, refined to the detected package manager by lockfile.
      // (audit 216 L855: the previous `if (pkg.scripts?.['test']) testCmd =
      // 'npm test'` was a no-op — it re-assigned the value already held — and the
      // package.json parse existed only to feed it, so both are removed.)
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

    // ── misc commands ───────────────────────────────────────────────────────────
    register('agi-workforce.newConversation', () => {
      sidebarProvider.resetConversation();
      sidebarProvider.reveal();
    }),

    register('agi-workforce.modelDashboard', () => {
      ModelMetricsPanel.createOrShow(context.extensionUri, context);
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
        | 'switch-model'
        | 'effort'
        | 'mode'
        | 'account';
      type ActionSheetItem = vscode.QuickPickItem & { action?: ActionSheetAction };
      const items: ActionSheetItem[] = [
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
        { label: 'Model', kind: vscode.QuickPickItemKind.Separator },
        {
          label: '$(symbol-color) Switch model…',
          description: `Current: ${currentModel}`,
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
          description: 'View model dashboard and token usage',
          action: 'account',
        },
      ];

      const pick = await vscode.window.showQuickPick(items, {
        title: 'AGI Workforce — Actions',
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
            title: 'AGI Workforce — Attach Workspace Files to Context',
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
              description: 'Minimal reasoning — fastest, lowest cost',
              value: 'low',
            },
            {
              label: '$(circle-filled) Medium',
              description: 'Balanced reasoning — default',
              value: 'medium',
            },
            {
              label: '$(pulse) High',
              description: 'Extended reasoning — slower, higher quality',
              value: 'high',
            },
            {
              label: '$(sparkle) Max',
              description: 'Maximum reasoning budget',
              value: 'max',
            },
          ];
          const effortPick = await vscode.window.showQuickPick(effortItems, {
            title: 'AGI Workforce — Set Effort',
            placeHolder: `Current: ${cap(currentEffort)}`,
          });
          const selectedEffort = effortPick?.value;
          if (selectedEffort !== undefined) {
            await vscode.workspace
              .getConfiguration('agiWorkforce')
              .update('agent.effort', selectedEffort, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(
              `AGI Workforce effort set to: ${cap(selectedEffort)}`,
            );
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
            title: 'AGI Workforce — Set Agent Mode',
            placeHolder: `Current: ${cap(currentMode)}`,
          });
          const selectedMode = modePick?.value;
          if (selectedMode !== undefined) {
            await vscode.workspace
              .getConfiguration('agiWorkforce')
              .update('agent.mode', selectedMode, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(
              `AGI Workforce agent mode set to: ${cap(selectedMode)}`,
            );
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
      const tierInfo = await fetchTierInfo(context.secrets);
      const tier =
        tierInfo?.tier ?? context.globalState.get<string>('tierStatus.cachedTier') ?? 'unknown';

      const items: vscode.QuickPickItem[] = [];

      items.push({
        label: `$(account) Current tier: ${tier}`,
        description: 'Your AGI Workforce subscription tier',
        kind: vscode.QuickPickItemKind.Default,
      });

      if (tierInfo?.usagePercentage !== undefined) {
        const pct = Math.round(tierInfo.usagePercentage);
        items.push({
          label: `$(pulse) Cloud usage: ${pct}% used`,
          description: 'Plan usage this period',
        });
      }

      items.push(
        { label: '', kind: vscode.QuickPickItemKind.Separator },
        {
          label: '$(link-external) View pricing & upgrade',
          description: 'agiworkforce.com/pricing',
          detail: 'open-pricing',
        },
        {
          label: '$(graph) Model dashboard',
          description: 'View request history and token breakdown',
          detail: 'open-dashboard',
        },
      );

      const pick = await vscode.window.showQuickPick(items, {
        title: `AGI Workforce — Tier Status (${tier})`,
        placeHolder: 'Your subscription & usage',
        matchOnDescription: true,
      });

      if (pick === undefined) return;

      if (pick.detail === 'open-pricing') {
        void vscode.env.openExternal(
          vscode.Uri.parse(
            `https://agiworkforce.com/pricing?from=tier-status&tier=${encodeURIComponent(tier)}`,
          ),
        );
      } else if (pick.detail === 'open-dashboard') {
        await vscode.commands.executeCommand('agi-workforce.modelDashboard');
      }
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
        title: 'AGI Workforce — Modes',
        placeHolder: `Current: ${capMode(currentMode)}  ·  Shift+Tab to switch`,
        matchOnDescription: true,
      });
      if (modePick?.detail !== undefined) {
        await vscode.workspace
          .getConfiguration('agiWorkforce')
          .update('agent.mode', modePick.detail, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(
          `AGI Workforce agent mode set to: ${capMode(modePick.detail)}`,
        );
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
          description: 'Minimal reasoning — fastest, lowest cost',
          detail: 'low',
          picked: currentEffort === 'low',
        },
        {
          label: '$(circle-filled) Medium',
          description: 'Balanced reasoning — default',
          detail: 'medium',
          picked: currentEffort === 'medium',
        },
        {
          label: '$(pulse) High',
          description: 'Extended reasoning — slower, higher quality',
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
        title: 'AGI Workforce — Effort',
        placeHolder: `Current: ${capEffort(currentEffort)}`,
        matchOnDescription: true,
      });
      if (effortPick?.detail !== undefined) {
        await vscode.workspace
          .getConfiguration('agiWorkforce')
          .update('agent.effort', effortPick.detail, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(
          `AGI Workforce effort set to: ${capEffort(effortPick.detail)}`,
        );
      }
    }),

    // Round-2 audit P0 #8 (2026-05-21) — cross-conversation memory facts the
    // assistant should remember. Workspace-scoped (per the goal contract:
    // VS Code is NOT a synced chat surface), persisted in globalState ONLY.
    // The companion sidebar tree (agi-workforce.memory view) provides list/edit/delete.
    register('agi-workforce.memory', async () => {
      const action = await vscode.window.showQuickPick(
        [
          { label: '$(add) Add a memory fact', detail: 'add' },
          { label: '$(list-unordered) List & remove facts', detail: 'list' },
          { label: '$(trash) Forget everything', detail: 'clear' },
        ],
        { title: 'AGI Workforce — Memory', placeHolder: 'Choose an action' },
      );
      if (!action) return;

      if (action.detail === 'add') {
        await vscode.commands.executeCommand('agi-workforce.memory.create');
        return;
      }

      if (action.detail === 'list') {
        const facts = loadFacts(context.globalState);
        if (facts.length === 0) {
          vscode.window.showInformationMessage('No memory facts yet. Add one to get started.');
          return;
        }
        const pick = await vscode.window.showQuickPick(
          facts.map((f) => ({
            label: f.text,
            description: `Added ${new Date(f.createdAt).toLocaleDateString()}`,
            detail: f.id,
          })),
          {
            title: 'AGI Workforce — Memory facts',
            placeHolder: 'Select a fact to remove (Esc to keep all)',
          },
        );
        if (!pick || pick.detail === undefined) return;
        await deleteFact(context.globalState, pick.detail);
        vscode.window.showInformationMessage('Fact removed.');
        return;
      }

      if (action.detail === 'clear') {
        const facts = loadFacts(context.globalState);
        if (facts.length === 0) {
          vscode.window.showInformationMessage('No memory facts to forget.');
          return;
        }
        const confirm = await vscode.window.showWarningMessage(
          `Delete all ${facts.length} memory ${facts.length === 1 ? 'fact' : 'facts'}? This cannot be undone.`,
          { modal: true },
          'Forget everything',
        );
        if (confirm === 'Forget everything') {
          await clearFacts(context.globalState);
          vscode.window.showInformationMessage('All memory facts deleted.');
        }
      }
    }),

    // ── memory tree commands ────────────────────────────────────────────────────

    register('agi-workforce.memory.refresh', () => {
      memoryTreeProvider.refresh();
    }),

    register('agi-workforce.memory.create', async () => {
      const text = await vscode.window.showInputBox({
        title: 'AGI Workforce — Add Memory Fact',
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
      const existing = loadFacts(context.globalState);
      if (containsFact(existing, trimmed)) {
        vscode.window.showInformationMessage('That fact is already in your memory.');
        return;
      }
      await addFact(context.globalState, trimmed);
      vscode.window.showInformationMessage('Memory fact saved.');
    }),

    register('agi-workforce.memory.edit', async (item: MemoryFactItem) => {
      const newText = await vscode.window.showInputBox({
        title: 'AGI Workforce — Edit Memory Fact',
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
      const updated = await updateFact(context.globalState, item.fact.id, newText.trim());
      if (updated) {
        vscode.window.showInformationMessage('Memory fact updated.');
      } else {
        vscode.window.showWarningMessage('AGI Workforce: Memory fact not found.');
      }
    }),

    register('agi-workforce.memory.delete', async (item: MemoryFactItem) => {
      const confirm = await vscode.window.showWarningMessage(
        `Delete this memory fact?\n\n"${item.fact.text.slice(0, 80)}${item.fact.text.length > 80 ? '…' : ''}"`,
        { modal: true },
        'Delete',
      );
      if (confirm === 'Delete') {
        await deleteFact(context.globalState, item.fact.id);
        vscode.window.showInformationMessage('Memory fact deleted.');
      }
    }),
  );

  context.subscriptions.push(
    // AGI Cloud is public alpha and open by default (founder decision,
    // 2026-06-27) — there is no invite/waitlist gate to unlock anymore. This
    // command is kept only so older call sites/keybindings referencing it
    // still do something useful: it routes straight to the real device-auth
    // sign-in flow instead of the retired invite-code/waitlist modal, which
    // always failed with "account_auth_not_wired" regardless of what the
    // user entered.
    register('agi-workforce.openInviteCodeModal', async () => {
      await vscode.commands.executeCommand('agi-workforce.signIn');
    }),
  );

  // ── W6-07: Shift+Tab mode cycle ──────────────────────────────────────────────
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
      await vscode.workspace
        .getConfiguration('agiWorkforce')
        .update('agent.mode', next, vscode.ConfigurationTarget.Global);
      vscode.window.setStatusBarMessage(
        `$(robot) AGI mode: ${next.charAt(0).toUpperCase() + next.slice(1)}`,
        2000,
      );
    }),
  );

  // ── W6-02: Account & usage panel ─────────────────────────────────────────────
  context.subscriptions.push(
    register('agi-workforce.showAccountUsage', async () => {
      const { getTokenCounter } = await import('../data/tokenCounter');
      const { fetchTierInfo } = await import('../utils/api');

      const counter = getTokenCounter();
      const accountToken = await getAccountToken(context.secrets);
      const tierInfo = await fetchTierInfo(context.secrets);
      const tier =
        tierInfo?.tier ?? context.globalState.get<string>('tierStatus.cachedTier') ?? 'local';
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
        | 'teams';
      type AccountItem = vscode.QuickPickItem & { action?: AccountAction };
      const items: AccountItem[] = [
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
          label: `$(credit-card) Est. cost`,
          description: `$${counter.estimatedCostUsd.toFixed(4)}`,
        },
      ];

      if (tierInfo?.usagePercentage !== undefined) {
        const pct = Math.round(tierInfo.usagePercentage);
        items.push(
          { label: 'Cloud quota', kind: vscode.QuickPickItemKind.Separator },
          {
            label: `$(pulse) Cloud usage: ${pct}% used`,
            description: `Plan: ${tier}`,
          },
        );
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
          description: 'Browser-approved device session',
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
        if (subscriptionNeedsAttention) {
          items.push({
            label: '$(credit-card) Manage billing',
            description: 'Restore paid Cloud access on Web',
            action: 'manage-billing',
          });
        }
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
        title: `AGI Workforce — Account & Usage (${tier})`,
        placeHolder: 'Session stats',
        matchOnDescription: true,
      });

      if (pick?.action === 'sign-in') {
        await vscode.commands.executeCommand('agi-workforce.signIn');
      } else if (pick?.action === 'sign-out') {
        await vscode.commands.executeCommand('agi-workforce.signOut');
      } else if (pick?.action === 'settings') {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'agiWorkforce');
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
      } else if (pick?.action === 'reset-counter') {
        counter.reset();
        vscode.window.showInformationMessage('AGI Workforce: Token counter reset.');
      }
    }),
  );

  // ── W6 P2: Mention file from project ─────────────────────────────────────────
  context.subscriptions.push(
    register('agi-workforce.mentionFileFromProject', async () => {
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        canSelectFiles: true,
        canSelectFolders: false,
        openLabel: 'Mention in Chat',
        title: 'AGI Workforce — Mention File from Project',
      });
      if (uris === undefined || uris.length === 0 || uris[0] === undefined) return;
      const result = await validateWorkspaceContextFile(uris[0]);
      if (!result.ok) {
        vscode.window.showWarningMessage(`AGI Workforce: ${result.message}`);
        return;
      }
      const relPath = vscode.workspace.asRelativePath(result.uri);
      const query = `@agi #file:${relPath} `;
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

  // Surface registration failures loudly — a command that silently loses its
  // handler shows up to the user as a dead menu entry / dead keybinding.
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
