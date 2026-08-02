/**
 * terminalProvider.ts — Terminal integration for AGI Workforce VS Code extension
 *
 * Provides:
 *   - A dedicated "AGI Workforce" terminal instance (created or reused)
 *   - runCommand(): send arbitrary commands to the AGI terminal
 *   - captureAndExplain(): replay the last shell execution captured from the
 *     shell-integration events and send it to the LLM for explanation
 *   - suggestCommand(): ask the LLM to suggest a terminal command based on
 *     workspace context, present via QuickPick, and run on confirmation
 *
 * Shell integration note (SIX-15): this file used to declare its own
 * `TerminalShellIntegration { executions: readonly TerminalShellExecution[] }`
 * and branch on `shellIntegration.executions`. No such property exists on the
 * real API — `vscode.TerminalShellIntegration` carries only `cwd` and
 * `executeCommand`, and executions are delivered through
 * `window.onDidStartTerminalShellExecution` /
 * `onDidEndTerminalShellExecution`. The branch was therefore always undefined
 * and every capture fell through to "Shell integration is not available", which
 * was false whenever it was in fact active.
 */

import * as vscode from 'vscode';
import { chatCompletion, type LlmChatMessage } from '../utils/api';
import {
  getActiveWorkspaceFolderSync,
  getWorkspaceDisplayName,
} from '../platform/workspaceFolders';

// ─── Constants ───────────────────────────────────────────────────────────────

const TERMINAL_NAME = 'AGI Workforce';

/**
 * Maximum number of characters to capture from terminal output before
 * truncating. Prevents excessively large LLM requests.
 */
const MAX_CAPTURE_CHARS = 8000;

// ─── Command safety (VSCODE-04) ───────────────────────────────────────────────

/**
 * PR-3B (F-14): allowlist of permitted first-token commands. Switched from
 * a blocklist (incomplete by construction — missed `git reset --hard`,
 * `find -delete`, zero-width unicode bypasses, etc.) to a positive
 * allowlist of common build/test/VCS commands. LLM-suggested commands
 * whose first token is not in this set are refused outright.
 */
const ALLOWED_COMMAND_FIRST_TOKENS = new Set([
  'git',
  'npm',
  'pnpm',
  'yarn',
  'npx',
  'cargo',
  'rustup',
  'rustc',
  'pytest',
  'python',
  'python3',
  'pip',
  'pip3',
  'node',
  'deno',
  'bun',
  'tsc',
  'eslint',
  'prettier',
  'make',
  'gradle',
  'mvn',
  'go',
  'ruby',
  'bundle',
  'rake',
]);

/** Patterns that are destructive even within an allowed-tool invocation. */
const DESTRUCTIVE_INNER_PATTERNS = [
  /\b--force\b/i,
  /\b-f\b/i, // `git checkout -f`, `git push -f`
  /\breset\s+--hard\b/i,
  /\bclean\s+-[fdq]+/i,
  /\bpush\s+--force/i,
  /\bpush\s+-f\b/i,
  /\b-delete\b/, // find -delete
];

/**
 * Zero-width / invisible Unicode characters used to hide commands.
 * Stripped before allowlist matching so a zero-width-space-prefixed
 * `rm -rf /` cannot bypass the check.
 *
 * Built via `new RegExp(...)` with `\u` escapes so the source file does
 * not contain literal invisible chars (which `no-irregular-whitespace`
 * would flag — and which would also be invisible to code reviewers).
 *
 * Ranges covered:
 *   U+200B–U+200F  (zero-width space, ZWNJ, ZWJ, LTR/RTL marks)
 *   U+202A–U+202E  (LTR/RTL embedding / override)
 *   U+2060–U+206F  (word joiner, invisible separators)
 *   U+FEFF         (zero-width no-break space / BOM)
 */
const INVISIBLE_UNICODE_CHARS = new RegExp(
  '[\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u206F\\uFEFF]',
  'g',
);

/**
 * ANSI escape code pattern — strip before displaying or executing.
 * Constructed via RegExp() to avoid the no-control-regex lint rule on \x1b.
 */
// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE = /\x1b\[[0-9;]*[mGKHF]/g;

/**
 * Validate that an LLM-suggested command is safe to present/run.
 * Returns an error string if the command is rejected, or undefined if it's ok.
 */
export function validateSuggestedCommand(cmd: string): string | undefined {
  if (cmd.trim().length === 0) {
    return 'Command is empty.';
  }

  // Strip ANSI + invisible unicode before checking.
  const clean = cmd.replace(ANSI_ESCAPE, '').replace(INVISIBLE_UNICODE_CHARS, '').trim();

  // Refuse shell metacharacters that allow chaining or substitution.
  // Even within an allowed first token, $(...) or ; can run anything.
  const SHELL_META = /[$`;|&<>]|&&|\|\|/;
  if (SHELL_META.test(clean)) {
    return 'Command rejected: contains shell metacharacters ($, `, ;, &, |, <, >).';
  }

  // PR-3B (F-14): allowlist-first by first token.
  const firstToken = clean.split(/\s+/)[0]?.toLowerCase() ?? '';
  if (!ALLOWED_COMMAND_FIRST_TOKENS.has(firstToken)) {
    return `Command rejected: "${firstToken}" is not in the AI-suggestion allowlist. Allowed: ${[...ALLOWED_COMMAND_FIRST_TOKENS].sort().join(', ')}.`;
  }

  for (const pattern of DESTRUCTIVE_INNER_PATTERNS) {
    if (pattern.test(clean)) {
      return `Command rejected: matches destructive pattern (${pattern}).`;
    }
  }

  return undefined;
}

// ─── TerminalProvider ────────────────────────────────────────────────────────

/**
 * The most recent shell execution seen in a terminal, with whatever output has
 * been streamed so far.
 *
 * `TerminalShellExecution.read()` only yields data written *after* the first
 * call, so the stream has to be drained from the
 * `onDidStartTerminalShellExecution` handler. Reading it later — which is what
 * "look up the last execution when the user asks" would mean — returns nothing.
 */
interface CapturedExecution {
  readonly execution: vscode.TerminalShellExecution;
  output: string;
  truncated: boolean;
  exitCode: number | undefined;
  ended: boolean;
}

export class TerminalProvider implements vscode.Disposable {
  private _terminal: vscode.Terminal | undefined;
  private readonly _secrets: vscode.SecretStorage;
  private readonly _disposables: vscode.Disposable[] = [];
  /**
   * Latest drained execution per terminal.
   *
   * Kept in extension memory only, capped at {@link MAX_CAPTURE_CHARS} per
   * terminal, dropped when the terminal closes, and never sent anywhere until
   * the user explicitly runs "Explain Terminal Output".
   */
  private readonly _lastExecutions = new Map<vscode.Terminal, CapturedExecution>();

  constructor(secrets: vscode.SecretStorage) {
    this._secrets = secrets;

    this._disposables.push(
      // Listen for terminal close events so we clear our reference if the user
      // manually closes the AGI terminal.
      vscode.window.onDidCloseTerminal((closed) => {
        if (closed === this._terminal) {
          this._terminal = undefined;
        }
        this._lastExecutions.delete(closed);
      }),
      vscode.window.onDidStartTerminalShellExecution((event) => {
        const captured: CapturedExecution = {
          execution: event.execution,
          output: '',
          truncated: false,
          exitCode: undefined,
          ended: false,
        };
        this._lastExecutions.set(event.terminal, captured);
        void this._drainExecution(captured);
      }),
      vscode.window.onDidEndTerminalShellExecution((event) => {
        const captured = this._lastExecutions.get(event.terminal);
        if (captured?.execution !== event.execution) return;
        captured.ended = true;
        captured.exitCode = event.exitCode;
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
    const workspaceUri = getActiveWorkspaceFolderSync()?.uri;
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
   *
   * EXTV-3 (audit 2026-05-03): refuse silently in untrusted workspaces.
   * The integrated terminal inherits the workspace shell config — an
   * untrusted workspace's `terminal.integrated.shellArgs` or
   * `package.json` script can contain shell metacharacters that
   * execute when sendText runs. Force the user to trust the
   * workspace first.
   */
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

  // ─── captureAndExplain ───────────────────────────────────────────────────

  /**
   * Explain the most recent shell execution in the active terminal.
   *
   * The output comes from the shell-integration executions this provider
   * drained live (see the constructor). Falls back to asking the user to paste
   * the output only when this terminal genuinely has nothing captured — and the
   * prompt then states which of the two reasons applies.
   */
  async captureAndExplain(cancellationToken: vscode.CancellationToken): Promise<string> {
    // Explain the terminal the user is actually looking at. Falling straight to
    // the AGI terminal would explain a shell the user never ran anything in.
    const terminal = vscode.window.activeTerminal ?? this.getOrCreateTerminal();
    const output = await this._captureOutput(terminal);

    if (output === undefined || output.trim() === '') {
      vscode.window.showWarningMessage('AGI Workforce: No terminal output to explain.');
      return '';
    }

    const messages: LlmChatMessage[] = [
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

    // Parse response into individual command suggestions.
    // Take only the first (non-comment, non-empty) line of each LLM output line
    // to prevent multi-line compound commands from sneaking through.
    const suggestions = response
      .split('\n')
      .map((line) => line.replace(ANSI_ESCAPE, '').trim()) // strip ANSI escapes
      .filter((line) => line !== '' && !line.startsWith('#') && !line.startsWith('//'));

    if (suggestions.length === 0) {
      vscode.window.showWarningMessage('AGI Workforce: No command suggestions were generated.');
      return undefined;
    }

    // Validate each suggestion — keep valid ones, annotate rejected ones.
    type SuggestionItem = vscode.QuickPickItem & { _cmd: string; _valid: boolean };
    const items: SuggestionItem[] = suggestions.map((cmd) => {
      const err = validateSuggestedCommand(cmd);
      if (err !== undefined) {
        return {
          label: `$(error) ${cmd}`,
          description: `BLOCKED — ${err}`,
          detail: 'This command will NOT be run.',
          _cmd: cmd,
          _valid: false,
        };
      }
      return {
        label: cmd,
        description: 'Suggested by AI — review carefully before running',
        _cmd: cmd,
        _valid: true,
      };
    });

    const picked = await vscode.window.showQuickPick(items, {
      title: 'AGI Workforce — Suggested Commands (AI-generated, verify before running)',
      placeHolder: 'Select a command to run in the terminal',
    });

    if (picked === undefined) {
      return undefined;
    }

    // Reject commands that failed validation.
    if (!picked._valid) {
      vscode.window.showErrorMessage(
        `AGI Workforce: Refused to run command — ${picked.description ?? 'safety check failed'}`,
      );
      return undefined;
    }

    const cmd = picked._cmd;

    // VSCODE-04: require explicit confirmation showing the exact command text.
    const confirmed = await vscode.window.showWarningMessage(
      `Run the following command in your terminal?\n\n${cmd}\n\nThis command was suggested by AI. Review it carefully before proceeding.`,
      { modal: true },
      'Run Command',
    );

    if (confirmed !== 'Run Command') {
      return undefined;
    }

    this.runCommand(cmd);
    return cmd;
  }

  // ─── Output capture (private) ────────────────────────────────────────────

  /**
   * Capture recent output from the terminal.
   *
   * Strategy:
   *   1. Replay the execution this provider drained from
   *      `onDidStartTerminalShellExecution` for this terminal.
   *   2. Otherwise, prompt the user to paste output — and say truthfully *why*
   *      we are asking, which depends on whether shell integration is active.
   */
  private async _captureOutput(terminal: vscode.Terminal): Promise<string | undefined> {
    const captured = this._lastExecutions.get(terminal);
    if (captured !== undefined) {
      const transcript = formatCapturedExecution(captured);
      if (transcript.trim() !== '') return transcript;
    }

    return this._askUserForOutput(terminal);
  }

  /**
   * Drain a live execution's output stream into its capture record.
   *
   * Runs for the whole life of the command, so a capture requested while the
   * command is still running sees the partial output rather than nothing.
   */
  private async _drainExecution(captured: CapturedExecution): Promise<void> {
    try {
      for await (const data of captured.execution.read()) {
        // The stream carries raw terminal data, escape sequences included.
        const text = stripTerminalControlSequences(typeof data === 'string' ? data : String(data));
        const remaining = MAX_CAPTURE_CHARS - captured.output.length;
        if (remaining <= 0) {
          captured.truncated = true;
          return;
        }
        if (text.length > remaining) {
          captured.output += text.slice(0, remaining);
          captured.truncated = true;
          return;
        }
        captured.output += text;
      }
    } catch {
      // The stream can error if the execution is disposed mid-read. Whatever
      // was already captured stays usable; nothing is invented in its place.
    }
  }

  /**
   * Prompt the user to paste terminal output manually.
   *
   * Reached when this terminal has no captured execution. The prompt names the
   * real reason: shell integration inactive, or active but with no command run
   * since the extension started listening.
   */
  private async _askUserForOutput(terminal: vscode.Terminal): Promise<string | undefined> {
    const reason =
      terminal.shellIntegration === undefined
        ? 'Shell integration is not active in this terminal.'
        : 'No command output has been captured in this terminal yet.';

    const pastedOutput = await vscode.window.showInputBox({
      title: 'AGI Workforce — Paste Terminal Output',
      prompt: `${reason} Copy the terminal output you want explained and paste it here.`,
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
    this._lastExecutions.clear();
    // Do not dispose the terminal itself — the user may still want it
  }
}

// ─── Capture formatting ──────────────────────────────────────────────────────

/**
 * Terminal control sequences the raw execution stream carries: CSI (colours,
 * cursor moves), OSC (window title, hyperlinks, shell-integration markers) and
 * the single-character escapes around them. Stripped before the text is shown
 * or sent so the explanation is about the output, not about the escape codes.
 */
const TERMINAL_CONTROL_SEQUENCES = new RegExp(
  [
    '\\u001B\\][^\\u0007\\u001B]*(?:\\u0007|\\u001B\\\\)', // OSC ... BEL | ST
    '\\u001B\\[[0-9;?]*[ -/]*[@-~]', // CSI
    '\\u001B[@-Z\\\\-_]', // Fe escapes
    '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]', // stray control chars
  ].join('|'),
  'g',
);

function stripTerminalControlSequences(text: string): string {
  return text.replace(TERMINAL_CONTROL_SEQUENCES, '').replace(/\r\n?/g, '\n');
}

/**
 * Render a captured execution for the model.
 *
 * The command line is included only at High confidence — at Low/Medium VS Code
 * reconstructs it from the terminal buffer and it may be wrong, and a wrong
 * command line would be a fabricated premise for the explanation.
 */
function formatCapturedExecution(captured: CapturedExecution): string {
  const { commandLine } = captured.execution;
  const parts: string[] = [];

  if (
    commandLine.value.trim() !== '' &&
    commandLine.confidence === vscode.TerminalShellExecutionCommandLineConfidence.High
  ) {
    parts.push(`$ ${commandLine.value.trim()}`);
  }

  const output = captured.output.trim();
  if (output !== '') parts.push(output);
  if (captured.truncated) parts.push('... [output truncated]');
  if (!captured.ended) parts.push('[command is still running]');
  else if (captured.exitCode !== undefined) parts.push(`[exit code ${captured.exitCode}]`);

  // A run that produced no output at all is still worth explaining when we know
  // its exit code, but never claim there was output when there was none.
  return output === '' && captured.exitCode === undefined ? '' : parts.join('\n');
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

      // Workspace folder (active editor's folder, not silently the first root)
      const workspaceFolder = getActiveWorkspaceFolderSync();
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
