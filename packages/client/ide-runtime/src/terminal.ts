import { isContainedIn } from '@agiworkforce/utils/path-containment';
import type { CodeTerminalSession } from './session';

export const TERMINAL_CAPTURE_MAX_CHARS = 8000;

/**
 * `commandLine` is empty when the host cannot name the command with confidence,
 * and `exitCode` is null until the command ends, not 0.
 */
export interface CodeTerminalCapture {
  commandLine: string;
  output: string;
  truncated: boolean;
  exitCode: number | null;
  ended: boolean;
}

export function emptyTerminalCapture(): CodeTerminalCapture {
  return { commandLine: '', output: '', truncated: false, exitCode: null, ended: false };
}

/**
 * Returns false once {@link TERMINAL_CAPTURE_MAX_CHARS} is reached, so the caller
 * stops reading rather than buffering a command that never ends.
 */
export function appendTerminalOutput(capture: CodeTerminalCapture, chunk: string): boolean {
  const remaining = TERMINAL_CAPTURE_MAX_CHARS - capture.output.length;
  if (remaining <= 0) {
    capture.truncated = true;
    return false;
  }
  if (chunk.length > remaining) {
    capture.output += chunk.slice(0, remaining);
    capture.truncated = true;
    return false;
  }
  capture.output += chunk;
  return true;
}

export function formatTerminalCapture(capture: CodeTerminalCapture): string {
  const parts: string[] = [];
  const command = capture.commandLine.trim();
  if (command !== '') parts.push(`$ ${command}`);

  const output = capture.output.trim();
  if (output !== '') parts.push(output);
  if (capture.truncated) parts.push('... [output truncated]');
  if (!capture.ended) parts.push('[command is still running]');
  else if (capture.exitCode !== null) parts.push(`[exit code ${capture.exitCode}]`);

  return output === '' && capture.exitCode === null ? '' : parts.join('\n');
}

const CSI_DISPLAY_SEQUENCE = '\\u001B\\[[0-9;]*[mGKHF]';

const ANSI_ESCAPE = new RegExp(CSI_DISPLAY_SEQUENCE, 'g');

const TERMINAL_CONTROL_SEQUENCES = new RegExp(
  [
    '\\u001B\\][^\\u0007\\u001B]*(?:\\u0007|\\u001B\\\\)',
    '\\u001B\\[[0-9;?]*[ -/]*[@-~]',
    '\\u001B[@-Z\\\\-_]',
    '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]',
  ].join('|'),
  'g',
);

export function stripAnsiEscapes(text: string): string {
  return text.replace(ANSI_ESCAPE, '');
}

export function stripTerminalControlSequences(text: string): string {
  return text.replace(TERMINAL_CONTROL_SEQUENCES, '').replace(/\r\n?/g, '\n');
}

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
  /\b-f\b/i,
  /\breset\s+--hard\b/i,
  /\bclean\s+-[fdq]+/i,
  /\bpush\s+--force/i,
  /\bpush\s+-f\b/i,
  /\b-delete\b/,
];

const INVISIBLE_UNICODE_CHARS = new RegExp(
  '[\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u206F\\uFEFF]',
  'g',
);

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
  return table !== undefined && Object.prototype.hasOwnProperty.call(table, key)
    ? table[key]
    : undefined;
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

/**
 * The gate every model-authored command passes before any host may run it.
 * Returns the reason it is refused, or undefined when it may run.
 */
export function validateSuggestedCommand(cmd: string): string | undefined {
  const clean = stripAnsiEscapes(cmd).replace(INVISIBLE_UNICODE_CHARS, '').trim();

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

/**
 * Suggested arguments are workspace-relative, so a terminal the reader has cd'd
 * out of would resolve them somewhere else entirely.
 */
export function describeTerminalOutsideWorkspace(
  workspaceRoot: string | null,
  terminalCwd: string | null,
): string | undefined {
  if (workspaceRoot === null || terminalCwd === null || isContainedIn(workspaceRoot, terminalCwd)) {
    return undefined;
  }
  return `the AGI Workforce terminal is in ${terminalCwd}, outside the workspace. cd back into the workspace before running an AI-suggested command.`;
}

/**
 * The only path model-authored text may take to a host's shell. The gate runs at
 * the sink, so no cached or refactored suggestion reaches it unvalidated.
 */
export function runSuggestedCommand(
  session: CodeTerminalSession,
  command: string,
): string | undefined {
  const refusal =
    validateSuggestedCommand(command) ??
    describeTerminalOutsideWorkspace(session.workspaceRoot(), session.terminalCwd());
  if (refusal !== undefined) return refusal;
  session.runCommand(command);
  return undefined;
}

/** Splits a model's reply into the command lines a picker may offer. */
export function parseSuggestedCommands(response: string): string[] {
  return response
    .split('\n')
    .map((line) => stripAnsiEscapes(line).trim())
    .filter((line) => line !== '' && !line.startsWith('#') && !line.startsWith('//'));
}
