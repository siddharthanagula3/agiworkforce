import * as vscode from 'vscode';
import {
  appendTerminalOutput,
  emptyTerminalCapture,
  formatTerminalCapture,
  parseSuggestedCommands,
  runSuggestedCommand,
  stripTerminalControlSequences,
  validateSuggestedCommand,
  type CodeTerminalCapture,
  type CodeTerminalSession,
} from '@agiworkforce/ide-runtime';
import { showCloudUtilityErrorActions } from '../core/cloudUtilityErrorActions';
import { chatCompletion, type LlmChatMessage } from '../utils/api';
import { buildExplainTerminalPrompt, runEditorUtility } from '../features/editor-utilities';
import {
  getActiveWorkspaceFolderSync,
  getWorkspaceDisplayName,
  shellQuoteForCurrentPlatform,
} from '../platform/workspaceFolders';
import { Config } from '../platform/config';

const TERMINAL_NAME = 'AGI Workforce';

/**
 * A bare `agi` on PATH should read as `agi login openai` in the terminal, not
 * as `'agi' login openai`. Quoting is for paths that need it.
 */
const CLI_PATH_NEEDS_NO_QUOTES = /^[A-Za-z0-9._\-/\\:]+$/u;

function quoteCliPathIfNeeded(cliPath: string): string {
  return CLI_PATH_NEEDS_NO_QUOTES.test(cliPath) ? cliPath : shellQuoteForCurrentPlatform(cliPath);
}

export { validateSuggestedCommand };

interface CapturedExecution {
  readonly execution: vscode.TerminalShellExecution;
  readonly capture: CodeTerminalCapture;
}

export class TerminalProvider implements vscode.Disposable, CodeTerminalSession {
  readonly ide = 'vscode' as const;
  private _terminal: vscode.Terminal | undefined;
  private readonly _secrets: vscode.SecretStorage;
  private readonly _disposables: vscode.Disposable[] = [];
  /**
   * Latest drained execution per terminal. Extension memory only, dropped when the
   * terminal closes, never sent anywhere until "Explain Terminal Output" is run.
   */
  private readonly _lastExecutions = new Map<vscode.Terminal, CapturedExecution>();

  constructor(secrets: vscode.SecretStorage) {
    this._secrets = secrets;

    this._disposables.push(
      vscode.window.onDidCloseTerminal((closed) => {
        if (closed === this._terminal) {
          this._terminal = undefined;
        }
        this._lastExecutions.delete(closed);
      }),
      vscode.window.onDidStartTerminalShellExecution((event) => {
        const captured: CapturedExecution = {
          execution: event.execution,
          capture: emptyTerminalCapture(),
        };
        this._lastExecutions.set(event.terminal, captured);
        void this._drainExecution(captured);
      }),
      vscode.window.onDidEndTerminalShellExecution((event) => {
        const captured = this._lastExecutions.get(event.terminal);
        if (captured?.execution !== event.execution) return;
        captured.capture.ended = true;
        captured.capture.exitCode = event.exitCode ?? null;
      }),
    );
  }

  getOrCreateTerminal(): vscode.Terminal {
    if (this._terminal !== undefined) {
      const stillAlive = vscode.window.terminals.find((t) => t === this._terminal);
      if (stillAlive !== undefined) {
        this._terminal.show(/* preserveFocus */ true);
        return this._terminal;
      }
      this._terminal = undefined;
    }

    const existing = vscode.window.terminals.find((t) => t.name === TERMINAL_NAME);
    if (existing !== undefined) {
      this._terminal = existing;
      this._terminal.show(true);
      return this._terminal;
    }

    const workspaceUri = getActiveWorkspaceFolderSync()?.uri;
    this._terminal = vscode.window.createTerminal(
      workspaceUri !== undefined
        ? { name: TERMINAL_NAME, cwd: workspaceUri }
        : { name: TERMINAL_NAME },
    );
    this._terminal.show(true);
    return this._terminal;
  }

  runCommand(command: string): void {
    if (!vscode.workspace.isTrusted) {
      vscode.window.showWarningMessage(
        'AGI Workforce: command execution is disabled in untrusted workspaces. Trust the workspace to run terminal commands.',
      );
      return;
    }
    const terminal = this.getOrCreateTerminal();
    terminal.show(/* preserveFocus */ false);
    terminal.sendText(command);
  }

  workspaceRoot(): string | null {
    return getActiveWorkspaceFolderSync()?.uri.fsPath ?? null;
  }

  terminalCwd(): string | null {
    const existing =
      this._terminal ?? vscode.window.terminals.find((t) => t.name === TERMINAL_NAME);
    return existing?.shellIntegration?.cwd?.fsPath ?? null;
  }

  async captureTerminal(): Promise<CodeTerminalCapture | null> {
    const terminal = vscode.window.activeTerminal ?? this.getOrCreateTerminal();
    const captured = this._lastExecutions.get(terminal);
    return captured === undefined ? null : withCommandLine(captured);
  }

  /**
   * The only path model-authored text may take to {@link runCommand}. The shared
   * gate re-runs at the sink so nothing reaches the shell unvalidated.
   */
  runSuggestedCommand(command: string): boolean {
    const rejection = runSuggestedCommand(this, command);
    if (rejection !== undefined) {
      vscode.window.showErrorMessage(`AGI Workforce: Refused to run command, ${rejection}`);
      return false;
    }
    return true;
  }

  async captureOutput(): Promise<string> {
    const terminal = vscode.window.activeTerminal ?? this.getOrCreateTerminal();
    return (await this._captureOutput(terminal)) ?? '';
  }

  async suggestCommand(
    context: string,
    cancellationToken: vscode.CancellationToken,
  ): Promise<string | undefined> {
    const workspaceFolder = getWorkspaceDisplayName();
    const platform =
      process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux';

    const messages: LlmChatMessage[] = [
      {
        role: 'system',
        content:
          'You are AGI Workforce, a terminal command expert. ' +
          'Given the user context, suggest 1 to 5 terminal commands that would be helpful. ' +
          'Output EXACTLY one command per line, with no explanations, no numbering, no markdown, ' +
          'no backticks, and no blank lines. Just the raw shell commands.\n\n' +
          `Platform: ${platform}\n` +
          `Workspace: ${workspaceFolder}\n` +
          'Only suggest safe, non-destructive commands. Never suggest commands that delete ' +
          'data, force-push, or modify system files.',
      },
      {
        role: 'user',
        content: context,
      },
    ];

    const response = await chatCompletion(this._secrets, messages, cancellationToken);

    const suggestions = parseSuggestedCommands(response);

    if (suggestions.length === 0) {
      vscode.window.showWarningMessage('AGI Workforce: No command suggestions were generated.');
      return undefined;
    }

    type SuggestionItem = vscode.QuickPickItem & { _cmd: string; _valid: boolean };
    const items: SuggestionItem[] = suggestions.map((cmd) => {
      const err = validateSuggestedCommand(cmd);
      if (err !== undefined) {
        return {
          label: `$(error) ${cmd}`,
          description: `BLOCKED, ${err}`,
          detail: 'This command will NOT be run.',
          _cmd: cmd,
          _valid: false,
        };
      }
      return {
        label: cmd,
        description: 'Suggested by AI, review carefully before running',
        _cmd: cmd,
        _valid: true,
      };
    });

    const picked = await vscode.window.showQuickPick(items, {
      title: 'AGI Workforce, Suggested Commands (AI-generated, verify before running)',
      placeHolder: 'Select a command to run in the terminal',
    });

    if (picked === undefined) {
      return undefined;
    }

    if (!picked._valid) {
      vscode.window.showErrorMessage(
        `AGI Workforce: Refused to run command, ${picked.description ?? 'safety check failed'}`,
      );
      return undefined;
    }

    const cmd = picked._cmd;

    const confirmed = await vscode.window.showWarningMessage(
      `Run the following command in your terminal?\n\n${cmd}\n\nThis command was suggested by AI. Review it carefully before proceeding.`,
      { modal: true },
      'Run Command',
    );

    if (confirmed !== 'Run Command') {
      return undefined;
    }

    return this.runSuggestedCommand(cmd) ? cmd : undefined;
  }

  private async _captureOutput(terminal: vscode.Terminal): Promise<string | undefined> {
    const captured = this._lastExecutions.get(terminal);
    if (captured !== undefined) {
      const transcript = formatTerminalCapture(withCommandLine(captured));
      if (transcript.trim() !== '') return transcript;
    }

    return this._askUserForOutput(terminal);
  }

  private async _drainExecution(captured: CapturedExecution): Promise<void> {
    try {
      for await (const data of captured.execution.read()) {
        const text = stripTerminalControlSequences(typeof data === 'string' ? data : String(data));
        if (!appendTerminalOutput(captured.capture, text)) return;
      }
    } catch {
      // The stream can error if the execution is disposed mid-read. Whatever
      // was already captured stays usable; nothing is invented in its place.
    }
  }

  private async _askUserForOutput(terminal: vscode.Terminal): Promise<string | undefined> {
    const reason =
      terminal.shellIntegration === undefined
        ? 'Shell integration is not active in this terminal.'
        : 'No command output has been captured in this terminal yet.';

    const pastedOutput = await vscode.window.showInputBox({
      title: 'AGI Workforce, Paste Terminal Output',
      prompt: `${reason} Copy the terminal output you want explained and paste it here.`,
      placeHolder: 'Paste terminal output here…',
      ignoreFocusOut: true,
    });

    if (pastedOutput === undefined || pastedOutput.trim() === '') {
      return undefined;
    }

    return pastedOutput;
  }

  dispose(): void {
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables.length = 0;
    this._lastExecutions.clear();
  }
}

/**
 * The host's own reading of what ran. A command line the shell integration is
 * not confident about is dropped rather than shown as fact.
 */
function withCommandLine(captured: CapturedExecution): CodeTerminalCapture {
  const { commandLine } = captured.execution;
  const trusted =
    commandLine.confidence === vscode.TerminalShellExecutionCommandLineConfidence.High
      ? commandLine.value
      : '';
  return { ...captured.capture, commandLine: trusted };
}

export function activateTerminal(
  context: vscode.ExtensionContext,
  secrets: vscode.SecretStorage,
): void {
  const provider = new TerminalProvider(secrets);
  context.subscriptions.push(provider);

  context.subscriptions.push(
    vscode.commands.registerCommand('agi-workforce.runCommand', async () => {
      const command = await vscode.window.showInputBox({
        title: 'AGI Workforce, Run Command',
        prompt: 'Enter a command to run in the AGI Workforce terminal',
        placeHolder: 'e.g. npm install, git status, cargo build',
        ignoreFocusOut: true,
        validateInput: (value) => {
          if (value.trim() === '') return 'Command cannot be empty.';
          return undefined;
        },
      });

      if (command === undefined || command.trim() === '') {
        return;
      }

      try {
        provider.runCommand(command.trim());
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`AGI Workforce: Failed to run command, ${message}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('agi-workforce.signInProvider', (raw?: unknown) => {
      // The CLI owns provider credentials and the app-server has no login RPC.
      // The id is validated here because it reaches a shell.
      const providerId = typeof raw === 'string' ? raw.trim() : '';
      if (!/^[A-Za-z0-9_-]{1,64}$/u.test(providerId)) {
        vscode.window.showWarningMessage(
          'AGI Workforce: no provider was named, so there is nothing to sign in to.',
        );
        return;
      }
      provider.runCommand(`${quoteCliPathIfNeeded(Config.cliPath())} login ${providerId}`);
    }),
    vscode.commands.registerCommand('agi-workforce.explainTerminal', async () => {
      await runEditorUtility(buildExplainTerminalPrompt(await provider.captureOutput()));
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('agi-workforce.suggestCommand', async () => {
      const contextParts: string[] = [];

      const editor = vscode.window.activeTextEditor;
      if (editor !== undefined) {
        const fileName = vscode.workspace.asRelativePath(editor.document.uri);
        contextParts.push(`Current file: ${fileName} (${editor.document.languageId})`);
      }

      const workspaceFolder = getActiveWorkspaceFolderSync();
      if (workspaceFolder !== undefined) {
        contextParts.push(`Workspace: ${workspaceFolder.name}`);
      }

      const userContext = await vscode.window.showInputBox({
        title: 'AGI Workforce, Suggest Command',
        prompt:
          'What are you trying to do? (e.g., "run tests", "find large files", "check git history")',
        placeHolder: 'Describe what you need…',
        ignoreFocusOut: true,
        validateInput: (value) => {
          if (value.trim() === '') return 'Please describe what you need.';
          return undefined;
        },
      });

      if (userContext === undefined || userContext.trim() === '') {
        return;
      }

      contextParts.push(`User request: ${userContext.trim()}`);

      const failure = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'AGI Workforce: Generating command suggestions…',
          cancellable: true,
        },
        async (_progress, progressToken): Promise<unknown> => {
          const cancelSource = new vscode.CancellationTokenSource();
          progressToken.onCancellationRequested(() => cancelSource.cancel());

          try {
            const result = await provider.suggestCommand(
              contextParts.join('\n'),
              cancelSource.token,
            );
            cancelSource.dispose();

            if (result !== undefined) {
              vscode.window.showInformationMessage(`AGI Workforce: Running "${result}"`);
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
        title: 'AGI Workforce: Failed to suggest command',
        retry: () => vscode.commands.executeCommand('agi-workforce.suggestCommand'),
      });
    }),
  );
}
