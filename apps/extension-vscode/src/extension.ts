/**
 * extension.ts — AGI Workforce VS Code Extension entry point
 *
 * Activated on startup (activationEvents: ["onStartupFinished"]).
 * Registers:
 *   1. The @agi chat participant (VS Code Chat panel integration)
 *   2. The sidebar webview panel (activity bar)
 *   3. Editor commands: chat, explain, fix, refactor, generateTests,
 *                       setApiKey, clearApiKey, selectModel
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { registerChatParticipant } from './providers/chatParticipant';
import { SidebarProvider } from './providers/sidebarProvider';
import { AgiCodeActionProvider, CODE_ACTION_KINDS } from './providers/codeActionProvider';
import { AgiHoverProvider } from './providers/hoverProvider';
import { AgiInlineCompletionProvider } from './providers/inlineCompletionProvider';
import { ConversationStore } from './storage/conversationStore';
import {
  ConversationTreeProvider,
  ConversationTreeItem,
} from './providers/conversationTreeProvider';
import {
  getApiKey,
  setApiKey,
  clearApiKey,
  setSupabaseJwt,
  clearSupabaseJwt,
  chatCompletion,
  type LlmChatMessage,
} from './utils/api';
import { applyLlmEdit } from './utils/applyEdit';
import { AgentModePanel } from './providers/agentModeProvider';
import { WorkspaceIndexer } from './services/workspaceIndexer';
import { AgiCodeLensProvider } from './providers/codeLensProvider';
import { AgiDiagnosticsProvider } from './providers/diagnosticsProvider';
import * as telemetry from './services/telemetry';
import { activateTokenCounter } from './services/tokenCounter';
import { activateDesktopBridge, getDesktopBridge } from './services/desktopBridge';
import { activateTerminal } from './providers/terminalProvider';
import { activateErrorExplainer } from './providers/errorExplainerProvider';
import { ModelMetricsPanel, initModelMetrics } from './services/modelMetrics';
import {
  normalizeConfiguredModelId,
  buildGroupedQuickPickItems,
  type GroupedQuickPickItem,
} from './services/modelConstants';
import { Config } from './utils/config';
import { ContextPanelProvider, setContextPanelInstance } from './providers/contextPanelProvider';
import { DiffDecorationProvider } from './providers/diffDecorationProvider';
import { showOriginalContext, getPatchOutputChannel } from './services/patchEngine';
import { initCheckpointManager, getCheckpointManager } from './services/checkpointManager';

// ─── Activation ───────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  // ── 0. Telemetry ──────────────────────────────────────────────────────────
  try {
    context.subscriptions.push(telemetry.activate(context));
  } catch (err) {
    console.warn('[AGI Workforce] Telemetry activation failed:', err);
  }

  // ── 0a. Model Metrics ──────────────────────────────────────────────────────
  try {
    initModelMetrics(context);
  } catch (err) {
    console.warn('[AGI Workforce] Model metrics init failed:', err);
  }

  // ── 0b. Desktop Bridge ──────────────────────────────────────────────────────
  try {
    context.subscriptions.push(activateDesktopBridge(context));
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    vscode.window.showWarningMessage(
      `AGI Workforce: Desktop bridge failed to initialize — ${errMsg}. ` +
        'Some features may be unavailable.',
    );
  }

  // ── 0c. Checkpoint manager ──────────────────────────────────────────────────
  try {
    initCheckpointManager(context);
  } catch (err) {
    console.warn('[AGI Workforce] Checkpoint manager init failed:', err);
  }

  // ── 0d. MCP enabled → ensure bridge connects on startup ────────────────────
  {
    const mcpEnabled =
      vscode.workspace.getConfiguration('agiWorkforce').get<boolean>('mcp.enabled') ?? false;
    if (mcpEnabled) {
      const bridge = getDesktopBridge();
      if (bridge !== undefined && bridge.status === 'disconnected') {
        void bridge.connect();
      }
    }
  }

  // ── 3. Conversation history tree view (must be created before sidebar/chat) ─
  const conversationStore = new ConversationStore(context);
  const conversationTreeProvider = new ConversationTreeProvider(conversationStore);

  // ── 1. Chat participant (@agi in VS Code Chat) ──────────────────────────────
  const chatParticipant = registerChatParticipant(
    context,
    conversationStore,
    conversationTreeProvider,
  );
  context.subscriptions.push(chatParticipant);

  // ── 2. Sidebar webview ──────────────────────────────────────────────────────
  const sidebarProvider = new SidebarProvider(
    context.extensionUri,
    context.secrets,
    conversationStore,
    conversationTreeProvider,
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewId, sidebarProvider, {
      // Keep the webview alive in the background so conversation state persists
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('agi-workforce.conversations', conversationTreeProvider),
    conversationTreeProvider,
  );

  // ── 3b. Context panel tree view ────────────────────────────────────────────
  const contextPanelProvider = new ContextPanelProvider();
  setContextPanelInstance(contextPanelProvider);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('agi-workforce.contextPanel', contextPanelProvider),
    contextPanelProvider,
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('agi-workforce.addToContext', (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (target === undefined) {
        vscode.window.showWarningMessage('AGI Workforce: No file to add to context.');
        return;
      }
      contextPanelProvider.addFile(target);
    }),

    vscode.commands.registerCommand('agi-workforce.removeFromContext', (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (target === undefined) {
        vscode.window.showWarningMessage('AGI Workforce: No file to remove from context.');
        return;
      }
      contextPanelProvider.removeFile(target);
    }),

    vscode.commands.registerCommand('agi-workforce.clearContext', () => {
      contextPanelProvider.clearAll();
    }),

    vscode.commands.registerCommand('agi-workforce.refreshContext', () => {
      contextPanelProvider.refreshAutoContext();
    }),
  );

  // ── 3c. Workspace indexer file watcher (incremental updates) ─────────────
  {
    const indexer = new WorkspaceIndexer(context);
    const watcherDisposables = indexer.registerFileWatcher();
    context.subscriptions.push(...watcherDisposables);
  }

  // ── 3d. Diff decoration provider (accept/reject inline diffs) ────────────
  const diffDecorationProvider = new DiffDecorationProvider();
  context.subscriptions.push(diffDecorationProvider);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider('*', diffDecorationProvider.codeLensProvider),
  );

  context.subscriptions.push(
    // Accept/reject single diff (by session ID from CodeLens)
    vscode.commands.registerCommand('agi-workforce.acceptDiff', async (sessionId: string) => {
      await diffDecorationProvider.acceptDiff(sessionId);
    }),
    vscode.commands.registerCommand('agi-workforce.rejectDiff', (sessionId: string) => {
      diffDecorationProvider.rejectDiff(sessionId);
    }),

    // Accept/reject all diffs in a single file
    vscode.commands.registerCommand('agi-workforce.acceptAllDiffs', async (uri: vscode.Uri) => {
      await diffDecorationProvider.acceptAll(uri);
    }),
    vscode.commands.registerCommand('agi-workforce.rejectAllDiffs', (uri: vscode.Uri) => {
      diffDecorationProvider.rejectAll(uri);
    }),

    // Keyboard shortcut handlers: accept/reject nearest diff to cursor
    vscode.commands.registerCommand('agi-workforce.acceptCurrentDiff', async () => {
      await diffDecorationProvider.acceptCurrentDiff();
    }),
    vscode.commands.registerCommand('agi-workforce.rejectCurrentDiff', () => {
      diffDecorationProvider.rejectCurrentDiff();
    }),

    // Accept/reject all diffs across all open files
    vscode.commands.registerCommand('agi-workforce.acceptAllDiffsGlobal', async () => {
      await diffDecorationProvider.acceptAllGlobal();
    }),
    vscode.commands.registerCommand('agi-workforce.rejectAllDiffsGlobal', () => {
      diffDecorationProvider.rejectAllGlobal();
    }),

    // Batch-level accept/reject (for multi-file patch batches)
    vscode.commands.registerCommand('agi-workforce.acceptBatch', async (batchId: string) => {
      await diffDecorationProvider.acceptBatch(batchId);
    }),
    vscode.commands.registerCommand('agi-workforce.rejectBatch', (batchId: string) => {
      diffDecorationProvider.rejectBatch(batchId);
    }),

    // Show original context (patch expected vs actual comparison)
    vscode.commands.registerCommand(
      'agi-workforce.showOriginalContext',
      async (sessionId: string) => {
        const session = diffDecorationProvider.getSession(sessionId);
        if (session === undefined) {
          vscode.window.showWarningMessage('AGI Workforce: Diff session not found.');
          return;
        }
        const filePath = session.filePath ?? vscode.workspace.asRelativePath(session.uri);
        await showOriginalContext(session.originalText, session.newText, filePath);
      },
    ),

    // Show patch output channel
    vscode.commands.registerCommand('agi-workforce.showPatchLogs', () => {
      getPatchOutputChannel().show(true);
    }),
  );

  // ── 4. Code intelligence providers ──────────────────────────────────────────
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider('*', new AgiCodeActionProvider(), {
      providedCodeActionKinds: [...CODE_ACTION_KINDS],
    }),
    vscode.languages.registerHoverProvider('*', new AgiHoverProvider()),
  );

  // ── 4b. CodeLens provider (Ask AI / Tests / Docs above functions) ────────
  const codeLensProvider = new AgiCodeLensProvider();
  let codeLensRegistration: vscode.Disposable | undefined;

  const syncCodeLensProvider = (): void => {
    const enabled =
      vscode.workspace.getConfiguration('agiWorkforce').get<boolean>('codeLensEnabled') ?? true;

    if (!enabled) {
      codeLensRegistration?.dispose();
      codeLensRegistration = undefined;
      return;
    }

    if (codeLensRegistration !== undefined) {
      return;
    }

    codeLensRegistration = vscode.languages.registerCodeLensProvider('*', codeLensProvider);
    context.subscriptions.push(codeLensRegistration);
  };

  try {
    syncCodeLensProvider();
  } catch (err) {
    console.warn('[AGI Workforce] CodeLens provider init failed:', err);
  }

  // ── 4c. Diagnostics provider (AI code review) ────────────────────────────
  const diagnosticsProvider = new AgiDiagnosticsProvider();
  context.subscriptions.push(diagnosticsProvider);

  // ── 4d. Token counter ────────────────────────────────────────────────────
  try {
    activateTokenCounter(context);
  } catch (err) {
    console.warn('[AGI Workforce] Token counter init failed:', err);
  }

  // ── 4e. Terminal integration ──────────────────────────────────────────────
  try {
    activateTerminal(context, context.secrets);
  } catch (err) {
    console.warn('[AGI Workforce] Terminal integration init failed:', err);
  }

  // ── 4f. Error explainer + "Ask about code" ───────────────────────────────
  try {
    activateErrorExplainer(context);
  } catch (err) {
    console.warn('[AGI Workforce] Error explainer init failed:', err);
  }

  let inlineCompletionRegistration: vscode.Disposable | undefined;

  const syncInlineCompletionProvider = (): void => {
    const inlineEnabled =
      vscode.workspace.getConfiguration('agiWorkforce').get<boolean>('inlineCompletions.enabled') ??
      false;

    if (!inlineEnabled) {
      inlineCompletionRegistration?.dispose();
      inlineCompletionRegistration = undefined;
      return;
    }

    if (inlineCompletionRegistration !== undefined) {
      return;
    }

    inlineCompletionRegistration = vscode.languages.registerInlineCompletionItemProvider(
      { pattern: '**' },
      new AgiInlineCompletionProvider(context.secrets),
    );
    context.subscriptions.push(inlineCompletionRegistration);
  };

  try {
    syncInlineCompletionProvider();
  } catch (err) {
    console.warn('[AGI Workforce] Inline completion provider init failed:', err);
  }

  // ── 5. Commands ─────────────────────────────────────────────────────────────
  context.subscriptions.push(
    // ── agi-workforce.chat ────────────────────────────────────────────────────
    vscode.commands.registerCommand('agi-workforce.chat', async () => {
      // Open the Chat panel — try generic chat first, then Copilot, then our sidebar
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

    // ── agi-workforce.agentMode ──────────────────────────────────────────────
    vscode.commands.registerCommand('agi-workforce.agentMode', () => {
      const planMode =
        vscode.workspace.getConfiguration('agiWorkforce').get<boolean>('agent.planMode') ?? false;
      AgentModePanel.createOrShow(context.extensionUri, context.secrets, context, planMode);
    }),

    // ── agi-workforce.explain ─────────────────────────────────────────────────
    vscode.commands.registerCommand('agi-workforce.explain', async () => {
      await runInlineCommand(context, 'explain');
    }),

    // ── agi-workforce.fix ─────────────────────────────────────────────────────
    vscode.commands.registerCommand('agi-workforce.fix', async () => {
      await runInlineCommand(context, 'fix');
    }),

    // ── agi-workforce.refactor ────────────────────────────────────────────────
    vscode.commands.registerCommand('agi-workforce.refactor', async () => {
      await runInlineCommand(context, 'refactor');
    }),

    // ── agi-workforce.generateTests ───────────────────────────────────────────
    vscode.commands.registerCommand('agi-workforce.generateTests', async () => {
      await runInlineCommand(context, 'tests');
    }),

    // ── agi-workforce.docs ─────────────────────────────────────────────────
    vscode.commands.registerCommand('agi-workforce.docs', async () => {
      await runInlineCommand(context, 'docs');
    }),

    // ── agi-workforce.codeReview ───────────────────────────────────────────
    vscode.commands.registerCommand('agi-workforce.codeReview', async () => {
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

    // ── agi-workforce.setApiKey ───────────────────────────────────────────────
    vscode.commands.registerCommand('agi-workforce.setApiKey', async () => {
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

      if (apiKey === undefined || apiKey.trim() === '') {
        return;
      }

      await setApiKey(context.secrets, apiKey.trim());

      vscode.window
        .showInformationMessage('AGI Workforce API key saved.', 'Open Chat')
        .then((choice) => {
          if (choice === 'Open Chat') {
            vscode.commands.executeCommand('agi-workforce.chat');
          }
        });
    }),

    // ── agi-workforce.clearApiKey ─────────────────────────────────────────────
    vscode.commands.registerCommand('agi-workforce.clearApiKey', async () => {
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

    // ── agi-workforce.setSupabaseJwt ──────────────────────────────────────────
    vscode.commands.registerCommand('agi-workforce.setSupabaseJwt', async () => {
      const jwt = await vscode.window.showInputBox({
        prompt:
          'Paste your AGI Workforce Supabase JWT (sign in at agiworkforce.com → Settings → API → "Copy session token")',
        placeHolder: 'eyJhbGciOiJIUzI1NiIsInR5cCI6...',
        password: true,
        ignoreFocusOut: true,
        validateInput: (value) => {
          if (!value || value.trim().length === 0) return 'JWT cannot be empty';
          if (!value.startsWith('eyJ')) return 'Looks malformed — Supabase JWTs start with "eyJ"';
          return undefined;
        },
      });
      if (jwt && jwt.trim().length > 0) {
        await setSupabaseJwt(context.secrets, jwt.trim());
        vscode.window.showInformationMessage(
          'Supabase JWT stored. Toggle "agiWorkforce.useProviderStream" to route chat through the new pipeline.',
        );
      }
    }),

    // ── agi-workforce.clearSupabaseJwt ────────────────────────────────────────
    vscode.commands.registerCommand('agi-workforce.clearSupabaseJwt', async () => {
      const choice = await vscode.window.showWarningMessage(
        'Clear the stored Supabase JWT?',
        { modal: true },
        'Clear',
      );
      if (choice === 'Clear') {
        await clearSupabaseJwt(context.secrets);
        vscode.window.showInformationMessage('Supabase JWT cleared.');
      }
    }),

    // ── agi-workforce.selectModel ─────────────────────────────────────────────
    vscode.commands.registerCommand('agi-workforce.selectModel', async () => {
      const config = vscode.workspace.getConfiguration('agiWorkforce');
      const currentModel = normalizeConfiguredModelId(config.get<string>('model'));

      // Build grouped items; mark the currently active model as picked
      const allItems: GroupedQuickPickItem[] = buildGroupedQuickPickItems().map((item) => ({
        ...item,
        picked: item.modelId !== undefined && item.modelId === currentModel,
      }));

      const picked = await vscode.window.showQuickPick(allItems, {
        title: 'AGI Workforce — Select Model (10+ providers)',
        placeHolder: `Current: ${currentModel}`,
        matchOnDescription: true,
        matchOnDetail: true,
      });

      if (picked === undefined || picked.modelId === undefined) return;

      await config.update('model', picked.modelId, vscode.ConfigurationTarget.Global);

      telemetry.logEvent(telemetry.TelemetryEvents.MODEL_SELECTED, { model: picked.modelId });

      vscode.window.showInformationMessage(`AGI Workforce model set to: ${picked.modelId}`);
    }),

    // ── agi-workforce.openConversation ────────────────────────────────────────
    vscode.commands.registerCommand(
      'agi-workforce.openConversation',
      async (idOrItem: string | ConversationTreeItem) => {
        const id = typeof idOrItem === 'string' ? idOrItem : idOrItem.conversation.id;
        const conversation = conversationStore.get(id);
        if (conversation === undefined) {
          vscode.window.showWarningMessage('AGI Workforce: Conversation not found.');
          return;
        }

        // Render conversation as Markdown in a new read-only editor tab
        const lines: string[] = [
          `# ${conversation.title}`,
          '',
          `*Model: ${conversation.model} · ${conversation.messages.length} messages*`,
          '',
        ];
        for (const msg of conversation.messages) {
          if (msg.role === 'system') continue;
          const heading = msg.role === 'user' ? '**You**' : '**AGI Workforce**';
          lines.push(`${heading}`, '', msg.content, '');
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
      },
    ),

    // ── agi-workforce.deleteConversation ──────────────────────────────────────
    vscode.commands.registerCommand(
      'agi-workforce.deleteConversation',
      async (item: ConversationTreeItem) => {
        const choice = await vscode.window.showWarningMessage(
          `Delete conversation "${item.conversation.title}"?`,
          { modal: true },
          'Delete',
        );
        if (choice === 'Delete') {
          conversationStore.delete(item.conversation.id);
          conversationTreeProvider.refresh();
        }
      },
    ),

    // ── agi-workforce.refreshConversations ────────────────────────────────────
    vscode.commands.registerCommand('agi-workforce.refreshConversations', () => {
      conversationTreeProvider.refresh();
    }),

    // ── agi-workforce.sendToDesktop ─────────────────────────────────────────
    vscode.commands.registerCommand('agi-workforce.sendToDesktop', async () => {
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

    // ── agi-workforce.syncContextToDesktop ───────────────────────────────────
    vscode.commands.registerCommand('agi-workforce.syncContextToDesktop', async () => {
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

    // ── agi-workforce.triggerAgentAction ─────────────────────────────────────
    vscode.commands.registerCommand('agi-workforce.triggerAgentAction', async () => {
      const bridge = getDesktopBridge();
      if (bridge === undefined || bridge.status !== 'connected') {
        vscode.window.showWarningMessage(
          'AGI Workforce: Desktop bridge is not connected. Enable it in settings.',
        );
        return;
      }

      const AGENT_ACTIONS: vscode.QuickPickItem[] = [
        {
          label: 'open-chat',
          description: 'Open the AGI Workforce chat panel on the desktop',
        },
        {
          label: 'run-task',
          description: 'Trigger an autonomous task run on the desktop agent',
        },
        {
          label: 'open-tool',
          description: 'Open a specific tool in the desktop app',
        },
      ];

      const picked = await vscode.window.showQuickPick(AGENT_ACTIONS, {
        title: 'AGI Workforce — Trigger Agent Action',
        placeHolder: 'Select an action to trigger on the desktop app',
        matchOnDescription: true,
      });

      if (picked === undefined) return;

      // Collect optional parameters for actions that need them
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

    // ── agi-workforce.sendFeedback ──────────────────────────────────────────
    vscode.commands.registerCommand('agi-workforce.sendFeedback', async () => {
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

      // Try to send via desktop bridge if connected
      const bridge = getDesktopBridge();
      if (bridge !== undefined && bridge.status === 'connected') {
        const result = await bridge.sendToDesktop('feedback', {
          type: feedbackType,
          message: feedbackText.trim(),
          extensionVersion:
            vscode.extensions.getExtension('agiworkforce.agi-workforce')?.packageJSON?.version ??
            '0.1.0',
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

      // Fallback: open GitHub issues
      const encoded = encodeURIComponent(
        `**Type**: ${feedbackType}\n**VS Code**: ${vscode.version}\n**Extension**: 0.1.0\n**Platform**: ${process.platform}\n\n${feedbackText.trim()}`,
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

    // ── agi-workforce.createCheckpoint ──────────────────────────────────────
    vscode.commands.registerCommand('agi-workforce.createCheckpoint', async () => {
      const mgr = getCheckpointManager();
      if (mgr === undefined) {
        vscode.window.showWarningMessage('AGI Workforce: Checkpoint manager not available.');
        return;
      }

      const label = await vscode.window.showInputBox({
        title: 'AGI Workforce — Create Checkpoint',
        prompt: 'Enter a label for this checkpoint',
        placeHolder: 'e.g. Before refactoring auth module',
        ignoreFocusOut: true,
        validateInput: (v) => (v.trim() === '' ? 'Label cannot be empty.' : undefined),
      });

      if (label === undefined) return;

      const id = await mgr.createCheckpoint(label.trim());
      if (id !== undefined) {
        vscode.window.showInformationMessage(
          `AGI Workforce: Checkpoint "${label.trim()}" created.`,
        );
      } else {
        vscode.window.showWarningMessage(
          'AGI Workforce: Could not create checkpoint. Git may not be available.',
        );
      }
    }),

    // ── agi-workforce.restoreCheckpoint ──────────────────────────────────────
    vscode.commands.registerCommand('agi-workforce.restoreCheckpoint', async () => {
      const mgr = getCheckpointManager();
      if (mgr === undefined) {
        vscode.window.showWarningMessage('AGI Workforce: Checkpoint manager not available.');
        return;
      }

      const checkpoints = mgr.listCheckpoints();
      if (checkpoints.length === 0) {
        vscode.window.showInformationMessage('AGI Workforce: No checkpoints available.');
        return;
      }

      const items = checkpoints.map((c) => ({
        label: c.label,
        description: new Date(c.createdAt).toLocaleString(),
        detail: c.stashRef === '' ? 'Clean working tree' : `Ref: ${c.stashRef}`,
        id: c.id,
      }));

      const picked = await vscode.window.showQuickPick(items, {
        title: 'AGI Workforce — Restore Checkpoint',
        placeHolder: 'Select a checkpoint to restore',
        matchOnDescription: true,
      });

      if (picked === undefined) return;

      const confirmed = await vscode.window.showWarningMessage(
        `Restore to checkpoint "${picked.label}"? This will discard current uncommitted changes.`,
        { modal: true },
        'Restore',
      );

      if (confirmed === 'Restore') {
        await mgr.restoreCheckpoint(picked.id);
      }
    }),

    // ── agi-workforce.listCheckpoints ────────────────────────────────────────
    vscode.commands.registerCommand('agi-workforce.listCheckpoints', async () => {
      const mgr = getCheckpointManager();
      if (mgr === undefined) {
        vscode.window.showWarningMessage('AGI Workforce: Checkpoint manager not available.');
        return;
      }

      const checkpoints = mgr.listCheckpoints();
      if (checkpoints.length === 0) {
        vscode.window.showInformationMessage('AGI Workforce: No checkpoints available.');
        return;
      }

      const items = checkpoints.map((c) => ({
        label: c.label,
        description: new Date(c.createdAt).toLocaleString(),
        detail: c.stashRef === '' ? 'Clean working tree' : `Ref: ${c.stashRef}`,
        id: c.id,
      }));

      const picked = await vscode.window.showQuickPick(items, {
        title: `AGI Workforce — ${checkpoints.length} Checkpoint(s)`,
        placeHolder: 'Select a checkpoint to restore, or press Escape to dismiss',
        matchOnDescription: true,
      });

      if (picked === undefined) return;

      const confirmed = await vscode.window.showWarningMessage(
        `Restore to checkpoint "${picked.label}"? This will discard current uncommitted changes.`,
        { modal: true },
        'Restore',
      );

      if (confirmed === 'Restore') {
        await mgr.restoreCheckpoint(picked.id);
      }
    }),

    // ── agi.git.status ───────────────────────────────────────────────────────
    vscode.commands.registerCommand('agi.git.status', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        vscode.window.showErrorMessage('No workspace open');
        return;
      }
      const terminal = vscode.window.createTerminal('AGI Git');
      terminal.show();
      terminal.sendText('git status');
    }),

    // ── agi.git.diff ─────────────────────────────────────────────────────────
    vscode.commands.registerCommand('agi.git.diff', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        vscode.window.showErrorMessage('No workspace open');
        return;
      }
      const terminal = vscode.window.createTerminal('AGI Git');
      terminal.show();
      terminal.sendText('git diff');
    }),

    // ── agi.git.commit ───────────────────────────────────────────────────────
    vscode.commands.registerCommand('agi.git.commit', async () => {
      const msg = await vscode.window.showInputBox({
        prompt: 'Commit message',
        placeHolder: 'feat: ...',
      });
      if (!msg) return;
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) return;
      const terminal = vscode.window.createTerminal('AGI Git');
      terminal.show();
      // Use `git add -u` (tracks modified/deleted only) instead of `git add -A`
      // to avoid accidentally staging untracked sensitive or large binary files.
      // SECURITY: Use single quotes and escape embedded single quotes to prevent
      // shell injection via backticks, $(), and other special characters.
      const sanitized = msg.replace(/'/g, "'\\''");
      terminal.sendText(`git add -u && git commit -m '${sanitized}'`);
    }),

    // ── agi.test.run ─────────────────────────────────────────────────────────
    vscode.commands.registerCommand('agi.test.run', async () => {
      // EXTV-3 (audit 2026-05-03): refuse in untrusted workspaces.
      // The detected test command is read from workspace files
      // (package.json scripts, etc.) which an untrusted repo controls.
      if (!vscode.workspace.isTrusted) {
        vscode.window.showWarningMessage(
          'AGI Workforce: test execution is disabled in untrusted workspaces. Trust the workspace to run tests.',
        );
        return;
      }
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        vscode.window.showErrorMessage('No workspace open');
        return;
      }

      // Auto-detect test runner
      let testCmd = 'npm test';
      if (fs.existsSync(path.join(workspaceRoot, 'package.json'))) {
        const pkg = JSON.parse(
          fs.readFileSync(path.join(workspaceRoot, 'package.json'), 'utf8'),
        ) as { scripts?: Record<string, string> };
        if (pkg.scripts?.['test']) testCmd = 'npm test';
        if (fs.existsSync(path.join(workspaceRoot, 'pnpm-lock.yaml'))) testCmd = 'pnpm test';
        if (fs.existsSync(path.join(workspaceRoot, 'yarn.lock'))) testCmd = 'yarn test';
      }
      if (fs.existsSync(path.join(workspaceRoot, 'Cargo.toml'))) testCmd = 'cargo test';
      if (
        fs.existsSync(path.join(workspaceRoot, 'pytest.ini')) ||
        fs.existsSync(path.join(workspaceRoot, 'pyproject.toml'))
      )
        testCmd = 'pytest';

      const terminal = vscode.window.createTerminal('AGI Tests');
      terminal.show();
      terminal.sendText(testCmd);
    }),

    // ── agi-workforce.newConversation ─────────────────────────────────────────
    vscode.commands.registerCommand('agi-workforce.newConversation', () => {
      sidebarProvider.resetConversation();
      sidebarProvider.reveal();
    }),

    // ── agi-workforce.modelDashboard ──────────────────────────────────────────
    vscode.commands.registerCommand('agi-workforce.modelDashboard', () => {
      ModelMetricsPanel.createOrShow(context.extensionUri, context);
    }),

    // ── agi-workforce.rewindLast ──────────────────────────────────────────────
    vscode.commands.registerCommand('agi-workforce.rewindLast', () => {
      vscode.window.showInformationMessage(
        'AGI Workforce: Rewind — coming soon in a future release.',
      );
    }),

    // ── agi-workforce.openActionSheet ─────────────────────────────────────────
    vscode.commands.registerCommand('agi-workforce.openActionSheet', async () => {
      const currentModel = normalizeConfiguredModelId(Config.model());
      const currentMode = Config.agentMode();
      const currentEffort = Config.agentEffort();

      // Capitalise helper
      function cap(s: string): string {
        return s.charAt(0).toUpperCase() + s.slice(1);
      }

      const items: vscode.QuickPickItem[] = [
        { label: 'Context', kind: vscode.QuickPickItemKind.Separator },
        {
          label: '$(file-add) Attach file',
          description: 'Add a workspace file to conversation context',
          detail: 'attach-file',
        },
        { label: '$(history) Rewind', description: 'Undo the last AI turn', detail: 'rewind' },
        {
          label: '$(trash) Clear conversation',
          description: 'Start a fresh conversation',
          detail: 'clear',
        },
        { label: 'Model', kind: vscode.QuickPickItemKind.Separator },
        {
          label: '$(symbol-color) Switch model…',
          description: `Current: ${currentModel}`,
          detail: 'switch-model',
        },
        {
          label: `$(brain) Effort: ${cap(currentEffort)}`,
          description: 'Set reasoning effort (Low / Medium / High / Max)',
          detail: 'effort',
        },
        {
          label: `$(robot) Mode: ${cap(currentMode)}`,
          description: 'Set agent operating mode',
          detail: 'mode',
        },
        {
          label: '$(account) Account & usage',
          description: 'View model dashboard and token usage',
          detail: 'account',
        },
      ];

      const pick = await vscode.window.showQuickPick(items, {
        title: 'AGI Workforce — Actions',
        placeHolder: 'Search actions…',
        matchOnDetail: true,
        matchOnDescription: true,
      });

      if (pick === undefined) return;

      switch (pick.detail) {
        case 'attach-file': {
          const uris = await vscode.window.showOpenDialog({
            canSelectMany: true,
            openLabel: 'Add to Context',
            title: 'AGI Workforce — Attach File to Context',
          });
          if (uris !== undefined && uris.length > 0) {
            for (const uri of uris) {
              await vscode.commands.executeCommand('agi-workforce.addToContext', uri);
            }
          }
          break;
        }
        case 'rewind':
          await vscode.commands.executeCommand('agi-workforce.rewindLast');
          break;
        case 'clear': {
          // Reset sidebar conversation
          sidebarProvider.resetConversation();
          sidebarProvider.reveal();
          break;
        }
        case 'switch-model':
          await vscode.commands.executeCommand('agi-workforce.selectModel');
          break;
        case 'effort': {
          const effortItems: vscode.QuickPickItem[] = [
            {
              label: '$(circle-outline) Low',
              description: 'Minimal reasoning — fastest, lowest cost',
              detail: 'low',
            },
            {
              label: '$(circle-filled) Medium',
              description: 'Balanced reasoning — default',
              detail: 'medium',
            },
            {
              label: '$(pulse) High',
              description: 'Extended reasoning — slower, higher quality',
              detail: 'high',
            },
            { label: '$(sparkle) Max', description: 'Maximum reasoning budget', detail: 'max' },
          ];
          const effortPick = await vscode.window.showQuickPick(effortItems, {
            title: 'AGI Workforce — Set Effort',
            placeHolder: `Current: ${cap(currentEffort)}`,
          });
          if (effortPick?.detail !== undefined) {
            await vscode.workspace
              .getConfiguration('agiWorkforce')
              .update('agent.effort', effortPick.detail, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(
              `AGI Workforce effort set to: ${cap(effortPick.detail)}`,
            );
          }
          break;
        }
        case 'mode': {
          const modeItems: vscode.QuickPickItem[] = [
            {
              label: '$(comment-discussion) Ask before edits',
              description: 'Confirm every edit before it runs',
              detail: 'ask',
            },
            {
              label: '$(robot) Edit automatically',
              description: 'Edits run without confirmation',
              detail: 'auto',
            },
            {
              label: '$(checklist) Plan mode',
              description: 'Generate a plan; no edits until approved',
              detail: 'plan',
            },
            {
              label: '$(warning) Bypass permissions',
              description: 'Skip all approval prompts (dangerous)',
              detail: 'bypass',
            },
          ];
          const modePick = await vscode.window.showQuickPick(modeItems, {
            title: 'AGI Workforce — Set Agent Mode',
            placeHolder: `Current: ${cap(currentMode)}`,
          });
          if (modePick?.detail !== undefined) {
            await vscode.workspace
              .getConfiguration('agiWorkforce')
              .update('agent.mode', modePick.detail, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(
              `AGI Workforce agent mode set to: ${cap(modePick.detail)}`,
            );
          }
          break;
        }
        case 'account':
          await vscode.commands.executeCommand('agi-workforce.modelDashboard');
          break;
      }
    }),
  );

  // ── Status bar item ──────────────────────────────────────────────────────
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'agi-workforce.selectModel';
  statusBar.tooltip = 'AGI Workforce — click to change model';
  context.subscriptions.push(statusBar);

  function updateStatusBar(): void {
    const config = vscode.workspace.getConfiguration('agiWorkforce');
    const model = normalizeConfiguredModelId(config.get<string>('model'));
    const chips: string[] = [];

    const mode = Config.agentMode();
    if (mode !== 'auto') {
      chips.push(mode);
    }
    if (config.get<boolean>('mcp.enabled') ?? false) {
      chips.push('mcp');
    }
    if (config.get<boolean>('desktopBridge.enabled') ?? false) {
      const port = config.get<number>('desktopBridge.port') ?? 8787;
      chips.push(`bridge:${port}`);
    }

    statusBar.text =
      chips.length > 0 ? `$(hubot) AGI: ${model} · ${chips.join(' · ')}` : `$(hubot) AGI: ${model}`;
    statusBar.show();
  }

  updateStatusBar();
  void validateAdvancedFeatureFlags(context);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration('agiWorkforce.model') ||
        e.affectsConfiguration('agiWorkforce.agent.planMode') ||
        e.affectsConfiguration('agiWorkforce.agent.mode') ||
        e.affectsConfiguration('agiWorkforce.agent.effort') ||
        e.affectsConfiguration('agiWorkforce.mcp.enabled') ||
        e.affectsConfiguration('agiWorkforce.desktopBridge.enabled') ||
        e.affectsConfiguration('agiWorkforce.desktopBridge.port')
      ) {
        updateStatusBar();
      }

      if (e.affectsConfiguration('agiWorkforce.inlineCompletions.enabled')) {
        syncInlineCompletionProvider();
      }

      if (e.affectsConfiguration('agiWorkforce.codeLensEnabled')) {
        syncCodeLensProvider();
      }

      if (
        e.affectsConfiguration('agiWorkforce.inlineCompletions.enabled') ||
        e.affectsConfiguration('agiWorkforce.mcp.enabled') ||
        e.affectsConfiguration('agiWorkforce.desktopBridge.enabled') ||
        e.affectsConfiguration('agiWorkforce.desktopBridge.port')
      ) {
        void validateAdvancedFeatureFlags(context);
      }

      // ── planMode / agent.mode → agentModeProvider ───────────────────────
      if (
        e.affectsConfiguration('agiWorkforce.agent.planMode') ||
        e.affectsConfiguration('agiWorkforce.agent.mode')
      ) {
        AgentModePanel.currentPanel?.setPlanMode(Config.agentMode() === 'plan');
      }

      // ── mcp.enabled → desktop bridge ────────────────────────────────────
      if (e.affectsConfiguration('agiWorkforce.mcp.enabled')) {
        const mcpEnabled =
          vscode.workspace.getConfiguration('agiWorkforce').get<boolean>('mcp.enabled') ?? false;
        const bridge = getDesktopBridge();
        if (bridge !== undefined) {
          if (mcpEnabled && bridge.status === 'disconnected') {
            void bridge.connect();
          } else if (!mcpEnabled && bridge.status === 'connected') {
            bridge.disconnect();
          }
        }
      }
    }),
  );

  // ── 5. First-run prompt (no API key) ────────────────────────────────────────
  void checkFirstRun(context);
}

// ─── Deactivation ─────────────────────────────────────────────────────────────

export function deactivate(): void {
  // Nothing to clean up — VS Code handles subscriptions disposal
}

// ─── Inline command runner ────────────────────────────────────────────────────

/**
 * Runs a quick inline AI command against the current editor selection,
 * showing the result in a new untitled document.
 */
async function runInlineCommand(
  context: vscode.ExtensionContext,
  command: 'explain' | 'fix' | 'refactor' | 'tests' | 'docs',
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (editor === undefined) {
    vscode.window.showWarningMessage('AGI Workforce: No active editor. Open a file first.');
    return;
  }

  const selection = editor.selection;
  const selectedText = editor.document.getText(selection.isEmpty ? undefined : selection);

  if (selectedText.trim() === '') {
    vscode.window.showWarningMessage('AGI Workforce: Select some code first.');
    return;
  }

  const lang = editor.document.languageId;
  const config = vscode.workspace.getConfiguration('agiWorkforce');
  const planModeEnabled = config.get<boolean>('agent.planMode') ?? false;
  // EXTV-1 (audit 2026-05-03): autoApplyFixes is a workspace-level
  // setting. An untrusted workspace (cloned repo) could enable it via
  // .vscode/settings.json and have LLM-generated code auto-applied
  // with no diff preview. Force `false` whenever the workspace is not
  // explicitly trusted by the user — preserves the diff-preview path.
  const rawAutoApplyFixes = config.get<boolean>('autoApplyFixes') ?? false;
  const autoApplyFixes = vscode.workspace.isTrusted ? rawAutoApplyFixes : false;
  if (rawAutoApplyFixes && !vscode.workspace.isTrusted) {
    vscode.window.showInformationMessage(
      'AGI Workforce: autoApplyFixes is disabled in this untrusted workspace. Trust the workspace to enable.',
    );
  }

  if (planModeEnabled && command !== 'explain') {
    const choice = await vscode.window.showInformationMessage(
      `AGI Workforce plan mode is enabled. Proceed with ${commandLabel(command)}?`,
      'Proceed',
      'Cancel',
    );
    if (choice !== 'Proceed') {
      return;
    }
  }

  const prompts: Record<string, string> = {
    explain: `Explain the following ${lang} code clearly and concisely:\n\n\`\`\`${lang}\n${selectedText}\n\`\`\``,
    fix: `Find and fix any bugs or issues in the following ${lang} code. Provide the corrected code and explain each fix:\n\n\`\`\`${lang}\n${selectedText}\n\`\`\``,
    refactor: `Refactor the following ${lang} code to improve readability, maintainability, and performance. Explain each change:\n\n\`\`\`${lang}\n${selectedText}\n\`\`\``,
    tests: `Generate comprehensive unit tests for the following ${lang} code. Cover edge cases, error paths, and happy paths:\n\n\`\`\`${lang}\n${selectedText}\n\`\`\``,
    docs: `Generate clear, accurate documentation comments (JSDoc/TSDoc/docstrings as appropriate) for the following ${lang} code:\n\n\`\`\`${lang}\n${selectedText}\n\`\`\``,
  };

  const messages: LlmChatMessage[] = [
    {
      role: 'system',
      content:
        'You are AGI Workforce, a model-agnostic AI coding assistant. ' +
        'Be concise and produce production-ready Markdown output.',
    },
    { role: 'user', content: prompts[command] ?? selectedText },
  ];

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `AGI Workforce: ${commandLabel(command)}…`,
      cancellable: true,
    },
    async (progress, progressToken) => {
      const cancelSource = new vscode.CancellationTokenSource();
      progressToken.onCancellationRequested(() => cancelSource.cancel());

      try {
        progress.report({ increment: 0 });
        telemetry.logEvent(telemetry.TelemetryEvents.INLINE_COMMAND_EXECUTED, {
          command,
          language: lang,
        });
        const result = await chatCompletion(context.secrets, messages, cancelSource.token);
        cancelSource.dispose();

        progress.report({ increment: 100 });

        await applyLlmEdit(
          editor,
          selection.isEmpty ? new vscode.Selection(0, 0, 0, 0) : selection,
          result,
          commandLabel(command),
          { autoApply: autoApplyFixes && command === 'fix' },
        );
      } catch (err) {
        cancelSource.dispose();

        if (err instanceof Error && err.message.includes('CANCELLED')) {
          return;
        }

        const message = err instanceof Error ? err.message : String(err);
        telemetry.logError(err instanceof Error ? err : message, { command });

        vscode.window
          .showErrorMessage(`AGI Workforce error: ${message}`, 'Set API Key')
          .then((choice) => {
            if (choice === 'Set API Key') {
              vscode.commands.executeCommand('agi-workforce.setApiKey');
            }
          });
      }
    },
  );
}

function commandLabel(command: string): string {
  const labels: Record<string, string> = {
    explain: 'Explain Code',
    fix: 'Fix Issues',
    refactor: 'Refactor',
    tests: 'Generate Tests',
    docs: 'Generate Docs',
  };
  return labels[command] ?? command;
}

// ─── First-run helper ─────────────────────────────────────────────────────────

async function checkFirstRun(context: vscode.ExtensionContext): Promise<void> {
  const hasShownWelcome = context.globalState.get<boolean>('agiWorkforce.shownWelcome');
  if (hasShownWelcome === true) return;

  const hasKey = (await getApiKey(context.secrets)) !== undefined;
  if (hasKey) {
    await context.globalState.update('agiWorkforce.shownWelcome', true);
    return;
  }

  const choice = await vscode.window.showInformationMessage(
    'Welcome to AGI Workforce! Set up your API key to use GPT-5.4, Claude, Gemini, and more in VS Code.',
    'Set API Key',
    'Later',
  );

  await context.globalState.update('agiWorkforce.shownWelcome', true);

  if (choice === 'Set API Key') {
    await vscode.commands.executeCommand('agi-workforce.setApiKey');
  }
}

async function validateAdvancedFeatureFlags(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration('agiWorkforce');
  const inlineEnabled = config.get<boolean>('inlineCompletions.enabled') ?? false;
  const mcpEnabled = config.get<boolean>('mcp.enabled') ?? false;
  const desktopBridgeEnabled = config.get<boolean>('desktopBridge.enabled') ?? false;
  const desktopBridgePort = config.get<number>('desktopBridge.port') ?? 8787;

  if (inlineEnabled) {
    const hasApiKey = (await getApiKey(context.secrets)) !== undefined;
    if (!hasApiKey) {
      void vscode.window
        .showInformationMessage(
          'AGI Workforce inline completions are enabled, but no API key is configured.',
          'Set API Key',
        )
        .then((choice) => {
          if (choice === 'Set API Key') {
            void vscode.commands.executeCommand('agi-workforce.setApiKey');
          }
        });
    }
  }

  if (mcpEnabled && !desktopBridgeEnabled) {
    void vscode.window.showWarningMessage(
      'AGI Workforce MCP is enabled, but desktop bridge is disabled. Enable desktop bridge to use local MCP tools.',
    );
  }

  if (desktopBridgeEnabled) {
    // Show a live status bar item instead of a one-shot warning so it clears
    // automatically when the bridge reconnects.
    updateBridgeReachabilityStatus(context, desktopBridgePort);
  } else {
    // Bridge disabled — clear any existing reachability item
    clearBridgeReachabilityStatus();
  }
}

// ─── Bridge reachability status bar item ─────────────────────────────────────

let _bridgeStatusItem: vscode.StatusBarItem | undefined;
let _bridgeReachabilityDisposable: vscode.Disposable | undefined;

function clearBridgeReachabilityStatus(): void {
  _bridgeStatusItem?.dispose();
  _bridgeStatusItem = undefined;
  _bridgeReachabilityDisposable?.dispose();
  _bridgeReachabilityDisposable = undefined;
}

function updateBridgeReachabilityStatus(context: vscode.ExtensionContext, port: number): void {
  // Re-create item if port changed or first time
  if (_bridgeStatusItem === undefined) {
    _bridgeStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
    _bridgeStatusItem.command = 'agi-workforce.syncContextToDesktop';
    context.subscriptions.push(_bridgeStatusItem);
  }

  const bridge = getDesktopBridge();

  const refresh = (): void => {
    if (_bridgeStatusItem === undefined) return;
    const currentBridge = getDesktopBridge();
    if (currentBridge === undefined) {
      _bridgeStatusItem.text = '$(warning) AGI Bridge: offline';
      _bridgeStatusItem.tooltip = `Desktop bridge not reachable on localhost:${port}. Start the AGI Workforce desktop app.`;
      _bridgeStatusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      _bridgeStatusItem.show();
    } else if (currentBridge.status === 'connected') {
      _bridgeStatusItem.text = '$(plug) AGI Bridge: connected';
      _bridgeStatusItem.tooltip = `Desktop bridge connected on localhost:${port}`;
      _bridgeStatusItem.backgroundColor = undefined;
      _bridgeStatusItem.show();
    } else if (currentBridge.status === 'connecting') {
      _bridgeStatusItem.text = '$(sync~spin) AGI Bridge: connecting…';
      _bridgeStatusItem.tooltip = `Connecting to desktop bridge on localhost:${port}`;
      _bridgeStatusItem.backgroundColor = undefined;
      _bridgeStatusItem.show();
    } else {
      _bridgeStatusItem.text = '$(warning) AGI Bridge: offline';
      _bridgeStatusItem.tooltip = `Desktop bridge not reachable on localhost:${port}. Start the AGI Workforce desktop app.`;
      _bridgeStatusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      _bridgeStatusItem.show();
    }
  };

  // Subscribe to status changes so the item auto-clears on reconnect
  _bridgeReachabilityDisposable?.dispose();
  if (bridge !== undefined) {
    _bridgeReachabilityDisposable = bridge.onStatusChange(() => refresh());
    context.subscriptions.push(_bridgeReachabilityDisposable);
  }

  refresh();
}
