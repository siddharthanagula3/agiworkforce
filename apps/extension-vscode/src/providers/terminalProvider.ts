/**
 * terminalProvider.ts — Terminal integration for AGI Workforce VS Code extension
 *
 * Provides:
 *   - A dedicated "AGI Workforce" terminal instance (created or reused)
 *   - runCommand(): send arbitrary commands to the AGI terminal
 *   - captureAndExplain(): capture recent terminal output via shellIntegration
 *     and send it to the LLM for explanation
 *   - suggestCommand(): ask the LLM to suggest a terminal command based on
 *     workspace context, present via QuickPick, and run on confirmation
 */

import * as vscode from 'vscode';
import { chatCompletion, type ChatMessage } from '../utils/api';

// ─── Constants ───────────────────────────────────────────────────────────────

const TERMINAL_NAME = 'AGI Workforce';

/**
 * Maximum number of characters to capture from terminal output before
 * truncating. Prevents excessively large LLM requests.
 */
const MAX_CAPTURE_CHARS = 8000;

// ─── TerminalProvider ────────────────────────────────────────────────────────

export class TerminalProvider implements vscode.Disposable {
  private _terminal: vscode.Terminal | undefined;
  private readonly _secrets: vscode.SecretStorage;
  private readonly _disposables: vscode.Disposable[] = [];

  constructor(secrets: vscode.SecretStorage) {
    this._secrets = secrets;

    // Listen for terminal close events so we clear our reference if the user
    // manually closes the AGI terminal.
    this._disposables.push(
      vscode.window.onDidCloseTerminal((closed) => {
        if (closed === this._terminal) {
          this._terminal = undefined;
        }
      }),
    );
  }

  // ─── Terminal lifecycle ──────────────────────────────────────────────────

  /**
   * Returns the existing AGI Workforce terminal or creates a new one.
   * The terminal is shown automatically.
   */
  getOrCreateTerminal(): vscode.Terminal {
    // Try to reuse an existing terminal with our name
    if (this._terminal !== undefined) {
      // VS Code can dispose terminals externally — check by scanning active terminals
      const stillAlive = vscode.window.terminals.find((t) => t === this._terminal);
      if (stillAlive !== undefined) {
        this._terminal.show(/* preserveFocus */ true);
        return this._terminal;
      }
      this._terminal = undefined;
    }

    // Check if someone else created a terminal with our name
    const existing = vscode.window.terminals.find((t) => t.name === TERMINAL_NAME);
    if (existing !== undefined) {
      this._terminal = existing;
      this._terminal.show(true);
      return this._terminal;
    }

    // Create a new terminal
    const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
    this._terminal = vscode.window.createTerminal(
      workspaceUri !== undefined
        ? { name: TERMINAL_NAME, cwd: workspaceUri }
        : { name: TERMINAL_NAME },
    );
    this._terminal.show(true);
    return this._terminal;
  }

  // ─── runCommand ──────────────────────────────────────────────────────────

  /**
   * Send a command string to the AGI Workforce terminal.
   * Creates the terminal if it does not exist.
   */
  runCommand(command: string): void {
    const terminal = this.getOrCreateTerminal();
    terminal.show(/* preserveFocus */ false);
    terminal.sendText(command);
  }

  // ─── captureAndExplain ───────────────────────────────────────────────────

  /**
   * Capture recent terminal output and send it to the LLM for explanation.
   *
   * Uses the VS Code Shell Integration API (`terminal.shellIntegration`) when
   * available. Shell integration provides structured access to command
   * executions and their output via `TerminalShellExecution.read()`.
   *
   * Falls back to asking the user to copy-paste the output when shell
   * integration is not available.
   */
  async captureAndExplain(cancellationToken: vscode.CancellationToken): Promise<string> {
    const terminal = this.getOrCreateTerminal();
    const output = await this._captureOutput(terminal);

    if (output === undefined || output.trim() === '') {
      vscode.window.showWarningMessage('AGI Workforce: No terminal output to explain.');
      return '';
    }

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'You are AGI Workforce, an expert at explaining terminal output. ' +
          'Given the terminal output below, provide a clear and concise explanation. ' +
          'If there are errors, explain what went wrong and suggest how to fix them. ' +
          'If the output looks normal, summarize what happened. ' +
          'Use Markdown formatting.',
      },
      {
        role: 'user',
        content: 'Explain the following terminal output:\n\n' + '```\n' + output + '\n```',
      },
    ];

    const explanation = await chatCompletion(this._secrets, messages, cancellationToken);
    return explanation;
  }

  // ─── suggestCommand ──────────────────────────────────────────────────────

  /**
   * Ask the LLM to suggest a terminal command based on the given context
   * string (e.g., current workspace, file, error). Shows the suggestion as
   * a QuickPick and runs it on confirmation.
   *
   * Returns the chosen command string, or undefined if the user cancelled.
   */
  async suggestCommand(
    context: string,
    cancellationToken: vscode.CancellationToken,
  ): Promise<string | undefined> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.name ?? 'unknown';
    const platform =
      process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux';

    const messages: ChatMessage[] = [
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

    // Parse response into individual command suggestions
    const suggestions = response
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#') && !line.startsWith('//'));

    if (suggestions.length === 0) {
      vscode.window.showWarningMessage('AGI Workforce: No command suggestions were generated.');
      return undefined;
    }

    // Show QuickPick with the suggestions
    const items: vscode.QuickPickItem[] = suggestions.map((cmd) => ({
      label: cmd,
      description: 'Press Enter to run this command',
    }));

    const picked = await vscode.window.showQuickPick(items, {
      title: 'AGI Workforce — Suggested Commands',
      placeHolder: 'Select a command to run in the terminal',
    });

    if (picked === undefined) {
      return undefined;
    }

    this.runCommand(picked.label);
    return picked.label;
  }

  // ─── Output capture (private) ────────────────────────────────────────────

  /**
   * Attempt to capture recent output from the terminal.
   *
   * Strategy:
   *   1. If `terminal.shellIntegration` is available, read the output of the
   *      most recent shell execution via `read()` async iterable.
   *   2. Otherwise, fall back to prompting the user to paste output.
   */
  private async _captureOutput(terminal: vscode.Terminal): Promise<string | undefined> {
    // Strategy 1: Shell Integration API (VS Code >= 1.93)
    const shellIntegration = (terminal as unknown as TerminalWithShellIntegration).shellIntegration;

    if (shellIntegration !== undefined) {
      try {
        const executions = shellIntegration.executions;
        if (executions !== undefined && executions.length > 0) {
          // Get the most recent execution
          const lastExecution = executions[executions.length - 1];
          if (lastExecution !== undefined) {
            return await this._readShellExecution(lastExecution);
          }
        }

        // If no executions are recorded yet, try running a no-op to trigger
        // shell integration capture, or fall through to manual paste.
      } catch {
        // Shell integration read failed — fall through to manual capture
      }
    }

    // Strategy 2: Manual paste fallback
    return this._askUserForOutput();
  }

  /**
   * Read output from a TerminalShellExecution using its async iterable `read()` method.
   */
  private async _readShellExecution(execution: TerminalShellExecution): Promise<string> {
    const chunks: string[] = [];
    let totalLength = 0;

    try {
      const stream = execution.read();
      for await (const data of stream) {
        // data can be string or TerminalShellExecutionOutputData
        const text = typeof data === 'string' ? data : String(data);
        totalLength += text.length;

        if (totalLength > MAX_CAPTURE_CHARS) {
          // Truncate to prevent excessive LLM input
          const remaining = MAX_CAPTURE_CHARS - (totalLength - text.length);
          if (remaining > 0) {
            chunks.push(text.substring(0, remaining));
          }
          chunks.push('\n... [output truncated]');
          break;
        }

        chunks.push(text);
      }
    } catch {
      // Stream may error if the execution is still in progress or already disposed
      if (chunks.length === 0) {
        return '';
      }
    }

    return chunks.join('');
  }

  /**
   * Prompt the user to paste terminal output manually.
   * Used when shell integration is not available.
   */
  private async _askUserForOutput(): Promise<string | undefined> {
    const pastedOutput = await vscode.window.showInputBox({
      title: 'AGI Workforce — Paste Terminal Output',
      prompt:
        'Shell integration is not available. Copy the terminal output ' +
        'you want explained and paste it here.',
      placeHolder: 'Paste terminal output here…',
      ignoreFocusOut: true,
    });

    if (pastedOutput === undefined || pastedOutput.trim() === '') {
      return undefined;
    }

    return pastedOutput;
  }

  // ─── Dispose ─────────────────────────────────────────────────────────────

  dispose(): void {
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables.length = 0;
    // Do not dispose the terminal itself — the user may still want it
  }
}

// ─── Shell Integration type definitions ──────────────────────────────────────
//
// These types mirror the VS Code Shell Integration API surface. They are
// declared locally to avoid hard dependency on a specific @types/vscode
// version that may not include them yet.

interface TerminalShellExecution {
  read(): AsyncIterable<string>;
}

interface TerminalShellIntegration {
  readonly executions: readonly TerminalShellExecution[];
  executeCommand?(command: string): TerminalShellExecution;
}

interface TerminalWithShellIntegration {
  readonly shellIntegration?: TerminalShellIntegration;
}

// ─── Activation ──────────────────────────────────────────────────────────────

/**
 * Register terminal-related commands with VS Code.
 *
 * Commands:
 *   - `agi-workforce.runCommand`      — prompt for a command and run it
 *   - `agi-workforce.explainTerminal` — capture & explain terminal output
 *   - `agi-workforce.suggestCommand`  — LLM-suggested command via QuickPick
 */
export function activateTerminal(
  context: vscode.ExtensionContext,
  secrets: vscode.SecretStorage,
): void {
  const provider = new TerminalProvider(secrets);
  context.subscriptions.push(provider);

  // ── agi-workforce.runCommand ───────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('agi-workforce.runCommand', async () => {
      const command = await vscode.window.showInputBox({
        title: 'AGI Workforce — Run Command',
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
        vscode.window.showErrorMessage(`AGI Workforce: Failed to run command — ${message}`);
      }
    }),
  );

  // ── agi-workforce.explainTerminal ──────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('agi-workforce.explainTerminal', async () => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'AGI Workforce: Explaining terminal output…',
          cancellable: true,
        },
        async (_progress, progressToken) => {
          const cancelSource = new vscode.CancellationTokenSource();
          progressToken.onCancellationRequested(() => cancelSource.cancel());

          try {
            const explanation = await provider.captureAndExplain(cancelSource.token);
            cancelSource.dispose();

            if (explanation === '') {
              return;
            }

            // Show the explanation in a new untitled Markdown document
            const doc = await vscode.workspace.openTextDocument({
              content: `# Terminal Output Explanation\n\n${explanation}`,
              language: 'markdown',
            });
            await vscode.window.showTextDocument(doc, { preview: true });
          } catch (err) {
            cancelSource.dispose();

            if (err instanceof Error && err.message.includes('CANCELLED')) {
              return;
            }

            const message = err instanceof Error ? err.message : String(err);
            vscode.window
              .showErrorMessage(
                `AGI Workforce: Failed to explain terminal output — ${message}`,
                'Set API Key',
              )
              .then((choice) => {
                if (choice === 'Set API Key') {
                  vscode.commands.executeCommand('agi-workforce.setApiKey');
                }
              });
          }
        },
      );
    }),
  );

  // ── agi-workforce.suggestCommand ───────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('agi-workforce.suggestCommand', async () => {
      // Build context from the current workspace state
      const contextParts: string[] = [];

      // Active file info
      const editor = vscode.window.activeTextEditor;
      if (editor !== undefined) {
        const fileName = vscode.workspace.asRelativePath(editor.document.uri);
        contextParts.push(`Current file: ${fileName} (${editor.document.languageId})`);
      }

      // Workspace folder
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (workspaceFolder !== undefined) {
        contextParts.push(`Workspace: ${workspaceFolder.name}`);
      }

      // Let the user add their own context / intent
      const userContext = await vscode.window.showInputBox({
        title: 'AGI Workforce — Suggest Command',
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

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'AGI Workforce: Generating command suggestions…',
          cancellable: true,
        },
        async (_progress, progressToken) => {
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
          } catch (err) {
            cancelSource.dispose();

            if (err instanceof Error && err.message.includes('CANCELLED')) {
              return;
            }

            const message = err instanceof Error ? err.message : String(err);
            vscode.window
              .showErrorMessage(
                `AGI Workforce: Failed to suggest command — ${message}`,
                'Set API Key',
              )
              .then((choice) => {
                if (choice === 'Set API Key') {
                  vscode.commands.executeCommand('agi-workforce.setApiKey');
                }
              });
          }
        },
      );
    }),
  );
}
