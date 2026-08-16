
import * as vscode from 'vscode';
import { showCloudUtilityErrorActions } from '../core/cloudUtilityErrorActions';
import { chatCompletion, type LlmChatMessage } from '../utils/api';
import {
  getActiveWorkspaceFolderSync,
  getWorkspaceDisplayName,
} from '../platform/workspaceFolders';

const TERMINAL_NAME = 'AGI Workforce';

const MAX_CAPTURE_CHARS = 8000;

// ─── Command safety (VSCODE-04) ───────────────────────────────────────────────

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

const DESTRUCTIVE_INNER_PATTERNS = [
  /\b--force\b/i,
  /\b-f\b/i, // `git checkout -f`, `git push -f`
  /\breset\s+--hard\b/i,
  /\bclean\s+-[fdq]+/i,
  /\bpush\s+--force/i,
  /\bpush\s+-f\b/i,
  /\b-delete\b/, // find -delete
];

const INVISIBLE_UNICODE_CHARS = new RegExp(
  '[\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u206F\\uFEFF]',
  'g',
);

// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE = /\x1b\[[0-9;]*[mGKHF]/g;

export function validateSuggestedCommand(cmd: string): string | undefined {
  if (cmd.trim().length === 0) {
    return 'Command is empty.';
  }

  const clean = cmd.replace(ANSI_ESCAPE, '').replace(INVISIBLE_UNICODE_CHARS, '').trim();

  const SHELL_META = /[$`;|&<>]|&&|\|\|/;
  if (SHELL_META.test(clean)) {
    return 'Command rejected: contains shell metacharacters ($, `, ;, &, |, <, >).';
  }

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

  async captureAndExplain(cancellationToken: vscode.CancellationToken): Promise<string> {
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

    const suggestions = response
      .split('\n')
      .map((line) => line.replace(ANSI_ESCAPE, '').trim())
      .filter((line) => line !== '' && !line.startsWith('#') && !line.startsWith('//'));

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

    if (!picked._valid) {
      vscode.window.showErrorMessage(
        `AGI Workforce: Refused to run command — ${picked.description ?? 'safety check failed'}`,
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

    this.runCommand(cmd);
    return cmd;
  }

  private async _captureOutput(terminal: vscode.Terminal): Promise<string | undefined> {
    const captured = this._lastExecutions.get(terminal);
    if (captured !== undefined) {
      const transcript = formatCapturedExecution(captured);
      if (transcript.trim() !== '') return transcript;
    }

    return this._askUserForOutput(terminal);
  }

  private async _drainExecution(captured: CapturedExecution): Promise<void> {
    try {
      for await (const data of captured.execution.read()) {
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

  dispose(): void {
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables.length = 0;
    this._lastExecutions.clear();
    // Do not dispose the terminal itself — the user may still want it
  }
}

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

  return output === '' && captured.exitCode === undefined ? '' : parts.join('\n');
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

            await showCloudUtilityErrorActions(err, {
              title: 'AGI Workforce: Failed to explain terminal output',
              retry: () => vscode.commands.executeCommand('agi-workforce.explainTerminal'),
            });
          }
        },
      );
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

            await showCloudUtilityErrorActions(err, {
              title: 'AGI Workforce: Failed to suggest command',
              retry: () => vscode.commands.executeCommand('agi-workforce.suggestCommand'),
            });
          }
        },
      );
    }),
  );
}
