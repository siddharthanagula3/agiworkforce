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
import * as net from 'net';
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
import { getApiKey, setApiKey, clearApiKey, chatCompletion, type ChatMessage } from './utils/api';
import { applyLlmEdit } from './utils/applyEdit';
import { AgentModePanel } from './providers/agentModeProvider';
import * as telemetry from './services/telemetry';
import { activateDesktopBridge, getDesktopBridge } from './services/desktopBridge';

// ─── Activation ───────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  // ── 0. Telemetry ──────────────────────────────────────────────────────────
  try {
    context.subscriptions.push(telemetry.activate(context));
  } catch {
    // Telemetry failure must not block extension activation
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

  // ── 1. Chat participant (@agi in VS Code Chat) ──────────────────────────────
  const chatParticipant = registerChatParticipant(context);
  context.subscriptions.push(chatParticipant);

  // ── 2. Sidebar webview ──────────────────────────────────────────────────────
  const sidebarProvider = new SidebarProvider(context.extensionUri, context.secrets);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewId, sidebarProvider, {
      // Keep the webview alive in the background so conversation state persists
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  // ── 3. Conversation history tree view ───────────────────────────────────────
  const conversationStore = new ConversationStore(context);
  const conversationTreeProvider = new ConversationTreeProvider(conversationStore);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('agi-workforce.conversations', conversationTreeProvider),
    conversationTreeProvider,
  );

  // ── 4. Code intelligence providers ──────────────────────────────────────────
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider('*', new AgiCodeActionProvider(), {
      providedCodeActionKinds: [...CODE_ACTION_KINDS],
    }),
    vscode.languages.registerHoverProvider('*', new AgiHoverProvider()),
  );

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

  syncInlineCompletionProvider();

  // ── 5. Commands ─────────────────────────────────────────────────────────────
  context.subscriptions.push(
    // ── agi-workforce.chat ────────────────────────────────────────────────────
    vscode.commands.registerCommand('agi-workforce.chat', async () => {
      // Open the Chat panel pre-populated with @agi
      await vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
    }),

    // ── agi-workforce.agentMode ──────────────────────────────────────────────
    vscode.commands.registerCommand('agi-workforce.agentMode', () => {
      AgentModePanel.createOrShow(context.extensionUri, context.secrets, context);
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

    // ── agi-workforce.selectModel ─────────────────────────────────────────────
    vscode.commands.registerCommand('agi-workforce.selectModel', async () => {
      const models: vscode.QuickPickItem[] = [
        {
          label: 'auto-balanced',
          description: 'Smart routing — best model per task',
          detail: 'Recommended: AGI Workforce picks the optimal model automatically',
        },
        {
          label: 'auto-economy',
          description: 'Smart routing — fastest & cheapest',
          detail: 'Best for quick questions and simple tasks',
        },
        {
          label: 'auto-premium',
          description: 'Smart routing — highest quality',
          detail: 'Best for complex reasoning and long contexts',
        },
        {
          label: 'claude-opus-4.6',
          description: 'Anthropic — flagship reasoning',
          detail: 'Max tier · best for complex architecture, long contexts',
        },
        {
          label: 'claude-sonnet-4.6',
          description: 'Anthropic — best all-rounder',
          detail: 'Pro tier · excellent for most coding tasks',
        },
        {
          label: 'claude-haiku-4.5',
          description: 'Anthropic — ultra-fast',
          detail: 'Economy · ideal for quick completions',
        },
        {
          label: 'gpt-5-pro',
          description: 'OpenAI — flagship',
          detail: "Max tier · OpenAI's most capable model",
        },
        {
          label: 'gpt-5.2',
          description: 'OpenAI — mid-tier general',
          detail: 'Pro tier · great for general coding',
        },
        {
          label: 'gpt-5-nano',
          description: 'OpenAI — ultra-fast & cheap',
          detail: 'Economy · best OpenAI speed/cost ratio',
        },
        {
          label: 'gemini-3-pro-preview',
          description: 'Google — strong all-rounder',
          detail: 'Pro tier · multimodal, long context',
        },
        {
          label: 'gemini-3-flash-preview',
          description: 'Google — fast',
          detail: 'Economy · very fast Google model',
        },
        {
          label: 'deepseek-r1',
          description: 'DeepSeek — reasoning',
          detail: 'Max tier · strong at algorithmic problems',
        },
        {
          label: 'deepseek-chat',
          description: 'DeepSeek — balanced',
          detail: 'Pro tier · cost-effective',
        },
        {
          label: 'sonar-pro',
          description: 'Perplexity — search + reasoning',
          detail: 'Pro tier · web search integrated',
        },
        { label: 'grok-4', description: 'xAI — flagship', detail: "Max tier · xAI's best model" },
      ];

      const config = vscode.workspace.getConfiguration('agiWorkforce');
      const currentModel = config.get<string>('model') ?? 'auto';

      // Mark the current selection
      const items = models.map((m) => ({
        ...m,
        picked: m.label === currentModel,
      }));

      const picked = await vscode.window.showQuickPick(items, {
        title: 'AGI Workforce — Select Model',
        placeHolder: `Current: ${currentModel}`,
        matchOnDescription: true,
        matchOnDetail: true,
      });

      if (picked === undefined) return;

      await config.update('model', picked.label, vscode.ConfigurationTarget.Global);

      telemetry.logEvent(telemetry.TelemetryEvents.MODEL_SELECTED, { model: picked.label });

      vscode.window.showInformationMessage(`AGI Workforce model set to: ${picked.label}`);
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

        const doc = await vscode.workspace.openTextDocument({
          content: lines.join('\n'),
          language: 'markdown',
        });
        await vscode.window.showTextDocument(doc, { preview: true });
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
  );

  // ── Status bar item ──────────────────────────────────────────────────────
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'agi-workforce.selectModel';
  statusBar.tooltip = 'AGI Workforce — click to change model';
  context.subscriptions.push(statusBar);

  function updateStatusBar(): void {
    const config = vscode.workspace.getConfiguration('agiWorkforce');
    const model = config.get<string>('model') ?? 'auto';
    const chips: string[] = [];

    if (config.get<boolean>('agent.planMode') ?? false) {
      chips.push('plan');
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
        e.affectsConfiguration('agiWorkforce.mcp.enabled') ||
        e.affectsConfiguration('agiWorkforce.desktopBridge.enabled') ||
        e.affectsConfiguration('agiWorkforce.desktopBridge.port')
      ) {
        updateStatusBar();
      }

      if (e.affectsConfiguration('agiWorkforce.inlineCompletions.enabled')) {
        syncInlineCompletionProvider();
      }

      if (
        e.affectsConfiguration('agiWorkforce.inlineCompletions.enabled') ||
        e.affectsConfiguration('agiWorkforce.mcp.enabled') ||
        e.affectsConfiguration('agiWorkforce.desktopBridge.enabled') ||
        e.affectsConfiguration('agiWorkforce.desktopBridge.port')
      ) {
        void validateAdvancedFeatureFlags(context);
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
  command: 'explain' | 'fix' | 'refactor' | 'tests',
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
  const autoApplyFixes = config.get<boolean>('autoApplyFixes') ?? false;

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
  };

  const messages: ChatMessage[] = [
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
    'Welcome to AGI Workforce! Set up your API key to use GPT-4o, Claude, Gemini, and more in VS Code.',
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
    const reachable = await isLocalPortReachable(desktopBridgePort, 800);
    if (!reachable) {
      void vscode.window.showWarningMessage(
        `AGI Workforce desktop bridge is enabled but not reachable on localhost:${desktopBridgePort}.`,
      );
    }
  }
}

function isLocalPortReachable(port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const finish = (value: boolean): void => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, '127.0.0.1');
  });
}
