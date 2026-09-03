import * as vscode from 'vscode';
import { isContainedIn } from '@agiworkforce/utils/path-containment';
import { showCloudUtilityErrorActions } from '../core/cloudUtilityErrorActions';
import { chatCompletion, type LlmChatMessage } from '../utils/api';
import {
  getActiveWorkspaceFolderSync,
  getWorkspaceDisplayName,
} from '../platform/workspaceFolders';

const TERMINAL_NAME = 'AGI Workforce';

const MAX_CAPTURE_CHARS = 8000;

// ─── Command safety (VSCODE-04) ───────────────────────────────────────────────

type OperandKind = 'none' | 'token' | 'path';

interface ArgumentRule {
  readonly flags?: readonly string[];
  readonly valueFlags?: readonly string[];
  readonly operands?: OperandKind;
}

interface CommandPolicy extends ArgumentRule {
  readonly subcommands?: Readonly<Record<string, ArgumentRule>>;
  readonly modules?: Readonly<Record<string, CommandPolicy>>;
}

const INSTALL_FROM_MANIFEST: ArgumentRule = {
  flags: [
    'frozen-lockfile',
    'no-frozen-lockfile',
    'ignore-scripts',
    'offline',
    'prefer-offline',
    'no-audit',
    'no-fund',
    'production',
    'omit',
    'include',
    'legacy-peer-deps',
  ],
  valueFlags: ['omit', 'include'],
  operands: 'none',
};

const NODE_PACKAGE_MANAGER: CommandPolicy = {
  flags: ['s', 'silent', 'quiet', 'r', 'recursive', 'w', 'workspace', 'filter', 'if-present'],
  valueFlags: ['w', 'workspace', 'filter'],
  operands: 'none',
  subcommands: {
    install: INSTALL_FROM_MANIFEST,
    i: INSTALL_FROM_MANIFEST,
    ci: INSTALL_FROM_MANIFEST,
    run: { operands: 'path' },
    test: { operands: 'path' },
    start: {},
    ls: {},
    list: {},
    outdated: {},
    audit: {},
    why: { operands: 'path' },
  },
};

const PYTEST: ArgumentRule = {
  flags: [
    'q',
    'quiet',
    'v',
    'verbose',
    'x',
    'exitfirst',
    's',
    'k',
    'm',
    'n',
    'lf',
    'last-failed',
    'ff',
    'failed-first',
    'co',
    'collect-only',
    'no-header',
    'no-summary',
    'tb',
    'maxfail',
    'durations',
    'color',
    'rootdir',
  ],
  valueFlags: ['k', 'm', 'n', 'tb', 'maxfail', 'durations', 'color', 'rootdir'],
  operands: 'path',
};

const PIP: CommandPolicy = {
  flags: ['q', 'quiet', 'no-cache-dir', 'no-color', 'disable-pip-version-check'],
  operands: 'none',
  subcommands: {
    install: {
      flags: ['r', 'requirement', 'e', 'editable', 'no-deps', 'upgrade', 'U', 'dry-run', 'user'],
      valueFlags: ['r', 'requirement', 'e', 'editable'],
      operands: 'none',
    },
    list: { flags: ['outdated', 'format'], valueFlags: ['format'] },
    show: { operands: 'path' },
    freeze: {},
    check: {},
  },
};

const PYTHON: CommandPolicy = {
  flags: ['version', 'V', 'u', 'B', 'I'],
  operands: 'path',
  modules: {
    pip: PIP,
    pytest: PYTEST,
    unittest: {
      flags: ['v', 'verbose', 'q', 'quiet', 'b', 'buffer', 'f', 'failfast', 'k'],
      valueFlags: ['k'],
      operands: 'path',
    },
    venv: {
      flags: ['clear', 'upgrade', 'without-pip', 'system-site-packages'],
      operands: 'path',
    },
  },
};

const GIT: CommandPolicy = {
  flags: [
    'no-pager',
    'version',
    'all',
    'a',
    's',
    'short',
    'b',
    'branch',
    'u',
    'q',
    'quiet',
    'v',
    'verbose',
    'n',
    'l',
    'p',
    'patch',
    'no-patch',
    'stat',
    'numstat',
    'name-only',
    'name-status',
    'oneline',
    'graph',
    'decorate',
    'abbrev-commit',
    'abbrev-ref',
    'pretty',
    'format',
    'date',
    'author',
    'grep',
    'max-count',
    'since',
    'until',
    'first-parent',
    'no-merges',
    'merged',
    'no-merged',
    'staged',
    'cached',
    'porcelain',
    'untracked-files',
    'word-diff',
    'ignore-all-space',
    'follow',
    'reverse',
    'amend',
    'message',
    'm',
    'signoff',
    'set-upstream',
    'set-upstream-to',
    'track',
    'ff-only',
    'rebase',
    'no-rebase',
    'prune',
    'tags',
    'dry-run',
    'list',
    'show-current',
    'verify',
    'r',
    'remotes',
    'delete',
    'd',
    'color',
    'no-color',
  ],
  valueFlags: [
    'pretty',
    'format',
    'date',
    'author',
    'grep',
    'max-count',
    'since',
    'until',
    'message',
    'm',
    'untracked-files',
    'set-upstream-to',
    'color',
    'n',
    'l',
  ],
  operands: 'token',
  subcommands: {
    add: { operands: 'path' },
    blame: { operands: 'path' },
    branch: {},
    checkout: { operands: 'path' },
    commit: { operands: 'path' },
    describe: {},
    diff: { operands: 'path' },
    fetch: {},
    grep: { operands: 'path' },
    log: { operands: 'path' },
    'ls-files': { operands: 'path' },
    pull: {},
    push: {},
    remote: {},
    restore: { operands: 'path' },
    'rev-parse': {},
    shortlog: {},
    show: { operands: 'path' },
    stash: {},
    status: { operands: 'path' },
    switch: {},
    tag: {},
  },
};

const CARGO: CommandPolicy = {
  flags: [
    'q',
    'quiet',
    'v',
    'verbose',
    'offline',
    'locked',
    'frozen',
    'all-features',
    'no-default-features',
    'features',
    'F',
    'release',
    'workspace',
    'all',
    'all-targets',
    'package',
    'p',
    'lib',
    'bin',
    'bins',
    'tests',
    'test',
    'example',
    'target',
    'profile',
    'jobs',
    'j',
    'message-format',
    'color',
    'version',
    'V',
    'no-deps',
    'check',
    'nocapture',
  ],
  valueFlags: [
    'features',
    'F',
    'package',
    'p',
    'bin',
    'example',
    'target',
    'profile',
    'jobs',
    'j',
    'message-format',
    'color',
    'test',
  ],
  operands: 'none',
  subcommands: {
    b: {},
    build: {},
    c: {},
    check: {},
    clean: {},
    clippy: {},
    doc: {},
    fmt: { flags: ['check', 'all'] },
    metadata: { flags: ['format-version'], valueFlags: ['format-version'] },
    run: {},
    t: { operands: 'path' },
    test: { operands: 'path' },
    tree: {},
    bench: { operands: 'path' },
  },
};

const GO: CommandPolicy = {
  flags: ['v', 'x', 'race', 'cover', 'count', 'run', 'timeout', 'tags', 'json', 'short'],
  valueFlags: ['count', 'run', 'timeout', 'tags'],
  operands: 'none',
  subcommands: {
    build: { operands: 'path' },
    env: { operands: 'token' },
    fmt: { operands: 'path' },
    list: { operands: 'path' },
    mod: { operands: 'token' },
    test: { operands: 'path' },
    version: {},
    vet: { operands: 'path' },
    work: { operands: 'token' },
  },
};

const COMMAND_POLICIES: Readonly<Record<string, CommandPolicy>> = {
  bun: {
    flags: ['version', 'v'],
    operands: 'none',
    subcommands: {
      install: INSTALL_FROM_MANIFEST,
      i: INSTALL_FROM_MANIFEST,
      outdated: {},
      run: { operands: 'path' },
      test: { operands: 'path' },
    },
  },
  bundle: {
    flags: ['version', 'quiet'],
    operands: 'none',
    subcommands: {
      check: {},
      install: {
        flags: ['deployment', 'without', 'with', 'path', 'jobs', 'quiet'],
        valueFlags: ['without', 'with', 'path', 'jobs'],
        operands: 'none',
      },
      list: {},
      lock: {},
      outdated: {},
      update: { operands: 'none' },
    },
  },
  cargo: CARGO,
  deno: {
    flags: ['version', 'V', 'q', 'quiet'],
    operands: 'none',
    subcommands: {
      check: { operands: 'path' },
      fmt: { flags: ['check'], operands: 'path' },
      info: { operands: 'path' },
      lint: { operands: 'path' },
      task: { operands: 'path' },
      test: { flags: ['watch', 'coverage', 'filter'], valueFlags: ['coverage', 'filter'] },
    },
  },
  eslint: {
    flags: ['fix', 'fix-dry-run', 'ext', 'max-warnings', 'cache', 'cache-location', 'quiet'],
    valueFlags: ['ext', 'max-warnings', 'cache-location'],
    operands: 'path',
  },
  git: GIT,
  go: GO,
  gradle: {
    flags: ['q', 'quiet', 'offline', 'stacktrace', 'no-daemon', 'parallel', 'info', 'continue'],
    operands: 'path',
  },
  make: {
    flags: ['j', 'n', 'dry-run', 'k', 'keep-going', 'B', 'always-make', 's', 'silent'],
    valueFlags: ['j'],
    operands: 'path',
  },
  mvn: {
    flags: ['o', 'offline', 'q', 'quiet', 'B', 'batch-mode', 'U', 'V', 'version', 'D'],
    valueFlags: ['D'],
    operands: 'path',
  },
  node: { flags: ['version', 'v', 'test', 'watch'], operands: 'path' },
  npm: NODE_PACKAGE_MANAGER,
  pip: PIP,
  pip3: PIP,
  pnpm: NODE_PACKAGE_MANAGER,
  prettier: {
    flags: ['write', 'w', 'check', 'list-different', 'l', 'ignore-path', 'log-level', 'no-color'],
    valueFlags: ['ignore-path', 'log-level'],
    operands: 'path',
  },
  pytest: PYTEST,
  python: PYTHON,
  python3: PYTHON,
  rake: {
    flags: ['T', 'tasks', 'P', 'trace', 'dry-run', 'n', 'quiet', 'q'],
    operands: 'path',
  },
  ruby: { flags: ['version', 'v', 'w'], operands: 'path' },
  rustc: {
    flags: ['version', 'V', 'print', 'explain'],
    valueFlags: ['print', 'explain'],
    operands: 'none',
  },
  rustup: {
    flags: ['version', 'V', 'quiet'],
    operands: 'none',
    subcommands: {
      component: { operands: 'token' },
      show: { operands: 'token' },
      toolchain: { operands: 'token' },
      update: { operands: 'token' },
      which: { operands: 'token' },
    },
  },
  tsc: {
    flags: [
      'noEmit',
      'watch',
      'w',
      'build',
      'b',
      'project',
      'p',
      'pretty',
      'incremental',
      'strict',
      'showConfig',
      'listFiles',
      'version',
      'v',
    ],
    valueFlags: ['project', 'p'],
    operands: 'path',
  },
  yarn: {
    flags: ['silent', 's'],
    operands: 'none',
    subcommands: {
      install: INSTALL_FROM_MANIFEST,
      list: {},
      outdated: {},
      run: { operands: 'path' },
      test: { operands: 'path' },
      why: { operands: 'path' },
    },
  },
};

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

const MAX_SUGGESTED_COMMAND_CHARS = 512;

const SAFE_COMMAND_TEXT = /^[A-Za-z0-9 _.,:/=+~-]+$/;

const TOKEN_ARGUMENT = /^[A-Za-z0-9_.][A-Za-z0-9_.,+-]*$/;
const PATH_ARGUMENT = /^[A-Za-z0-9_.][A-Za-z0-9_.,:/-]*$/;
const WINDOWS_DRIVE = /^[A-Za-z]:\//;
const PARENT_DIRECTORY = /(?:^|\/)\.\.(?:\/|$)/;
const REMOTE_LOCATION = /:\/\/|^[^:/]*\.[^:/]*:/;

function isTokenArgument(arg: string): boolean {
  return TOKEN_ARGUMENT.test(arg) && !PARENT_DIRECTORY.test(arg);
}

function isPathArgument(arg: string): boolean {
  return (
    PATH_ARGUMENT.test(arg) &&
    !WINDOWS_DRIVE.test(arg) &&
    !PARENT_DIRECTORY.test(arg) &&
    !REMOTE_LOCATION.test(arg)
  );
}

function lookup<T>(table: Readonly<Record<string, T>> | undefined, key: string): T | undefined {
  return table !== undefined && Object.hasOwn(table, key) ? table[key] : undefined;
}

function parseOption(token: string): { name: string; value: string | undefined } {
  if (token.startsWith('--')) {
    const body = token.slice(2);
    const separator = body.indexOf('=');
    return separator === -1
      ? { name: body, value: undefined }
      : { name: body.slice(0, separator), value: body.slice(separator + 1) };
  }
  const body = token.slice(1);
  return body.length > 1
    ? { name: body.slice(0, 1), value: body.slice(1) }
    : { name: body, value: undefined };
}

function checkAgainstPolicy(
  tool: string,
  policy: CommandPolicy,
  args: readonly string[],
): string | undefined {
  let rule: ArgumentRule = policy;
  let subcommandExpected = policy.subcommands !== undefined;

  const allowsFlag = (flag: string): boolean =>
    (policy.flags?.includes(flag) ?? false) || (rule.flags?.includes(flag) ?? false);
  const takesValue = (flag: string): boolean =>
    (policy.valueFlags?.includes(flag) ?? false) || (rule.valueFlags?.includes(flag) ?? false);

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index] ?? '';

    if (!token.startsWith('-')) {
      if (subcommandExpected) {
        const subcommand = lookup(policy.subcommands, token);
        if (subcommand === undefined) {
          return `Command rejected: "${token}" is not a ${tool} subcommand an AI suggestion may run.`;
        }
        rule = subcommand;
        subcommandExpected = false;
        continue;
      }
      const operands = rule.operands ?? policy.operands ?? 'none';
      const accepted =
        operands === 'path'
          ? isPathArgument(token)
          : operands === 'token'
            ? isTokenArgument(token)
            : false;
      if (!accepted) {
        return `Command rejected: ${tool} may not be given "${token}" by an AI suggestion; arguments must name workspace-relative content.`;
      }
      continue;
    }

    const { name, value: inlineValue } = parseOption(token);
    let value = inlineValue;

    if (policy.modules !== undefined && name === 'm') {
      const moduleName = value ?? args[index + 1];
      const modulePolicy =
        moduleName === undefined ? undefined : lookup(policy.modules, moduleName);
      if (moduleName === undefined || modulePolicy === undefined) {
        return `Command rejected: an AI suggestion may only run these ${tool} modules: ${Object.keys(policy.modules).sort().join(', ')}.`;
      }
      return checkAgainstPolicy(
        moduleName,
        modulePolicy,
        args.slice(value === undefined ? index + 2 : index + 1),
      );
    }

    if (!allowsFlag(name)) {
      return `Command rejected: "${token}" is not an option an AI suggestion may pass to ${tool}.`;
    }

    if (takesValue(name)) {
      if (value === undefined) {
        index += 1;
        value = args[index];
      }
      if (value === undefined || !isPathArgument(value)) {
        return `Command rejected: "${token}" needs a value that names workspace-relative content.`;
      }
      continue;
    }

    if (value !== undefined) {
      return `Command rejected: "${token}" does not take a value.`;
    }
  }

  return undefined;
}

export function validateSuggestedCommand(cmd: string): string | undefined {
  const clean = cmd.replace(ANSI_ESCAPE, '').replace(INVISIBLE_UNICODE_CHARS, '').trim();

  if (clean.length === 0) {
    return 'Command is empty.';
  }

  if (clean.length > MAX_SUGGESTED_COMMAND_CHARS) {
    return `Command rejected: longer than ${MAX_SUGGESTED_COMMAND_CHARS} characters, so what the QuickPick shows is not what would run.`;
  }

  if (!SAFE_COMMAND_TEXT.test(clean)) {
    return 'Command rejected: only letters, digits and space _ . , : / = + - ~ are allowed; shell metacharacters, quotes, globs and redirection let the shell run something other than the command that was reviewed.';
  }

  const tokens = clean.split(/\s+/);
  const firstToken = tokens[0]?.toLowerCase() ?? '';
  const policy = lookup(COMMAND_POLICIES, firstToken);
  if (policy === undefined) {
    return `Command rejected: "${firstToken}" is not in the AI-suggestion allowlist. Allowed: ${Object.keys(COMMAND_POLICIES).sort().join(', ')}.`;
  }

  for (const pattern of DESTRUCTIVE_INNER_PATTERNS) {
    if (pattern.test(clean)) {
      return `Command rejected: matches destructive pattern (${pattern}).`;
    }
  }

  return checkAgainstPolicy(firstToken, policy, tokens.slice(1));
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

  /**
   * The only path model-authored text may take to {@link runCommand}: it
   * re-runs the gate at the sink so a picker item, a cached suggestion, or a
   * later refactor cannot reach the shell with a command nothing validated.
   */
  runSuggestedCommand(command: string): boolean {
    const rejection = validateSuggestedCommand(command) ?? this._terminalLeftTheWorkspace();
    if (rejection !== undefined) {
      vscode.window.showErrorMessage(`AGI Workforce: Refused to run command, ${rejection}`);
      return false;
    }
    this.runCommand(command);
    return true;
  }

  /**
   * Suggested arguments are workspace-relative, so they only stay inside the
   * workspace while the terminal does. A terminal the user has cd'd out of
   * would resolve them somewhere else entirely.
   */
  private _terminalLeftTheWorkspace(): string | undefined {
    const root = getActiveWorkspaceFolderSync()?.uri.fsPath;
    const existing =
      this._terminal ?? vscode.window.terminals.find((t) => t.name === TERMINAL_NAME);
    const cwd = existing?.shellIntegration?.cwd?.fsPath;
    if (root === undefined || cwd === undefined || isContainedIn(root, cwd)) {
      return undefined;
    }
    return `the AGI Workforce terminal is in ${cwd}, outside the workspace. cd back into the workspace before running an AI-suggested command.`;
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
