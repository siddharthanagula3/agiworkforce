import 'server-only';

/**
 * Cloud Code agent: tool contract and command approval boundary.
 *
 * The existing Cloud Code surface is a remote terminal: the user types a
 * command and `runCloudCodeCommand` executes it. This module is the first
 * layer of the agent turn that replaces that with a goal-directed loop, and it
 * owns the part that must be correct before any model is allowed to drive a
 * sandbox: WHICH actions an agent may take unattended.
 *
 * Design rules this file enforces:
 *
 *  - **Fail closed.** `classifyCommandRisk` returns `requires_approval` for
 *    anything it does not positively recognize as safe. A classifier that
 *    defaults to "safe" is worse than no classifier, because it launders
 *    unreviewed commands through an approval UI that always says yes.
 *  - **No parsing-based safety claims.** We do not tokenize a shell line and
 *    reason about "the command", `sh -c`, backticks, `$( )`, `&&`, `;` and
 *    pipes all defeat that. Anything containing shell metacharacters is
 *    escalated rather than inspected further. This is deliberately blunter
 *    than a real shell parser and that is the point.
 *  - **Denied means denied.** A small set of actions are never approvable from
 *    an agent turn, because approving them in a chat UI cannot be informed
 *    consent (credential exfiltration, host escape, history rewrites).
 *
 * The repo rule this implements: "Always require explicit approval for
 * destructive, external, privileged, or expensive agent actions."
 */

import {
  CLOUD_CODE_DEFAULT_TURN_MODE,
  type CloudCodeTurnMode,
  type ToolApprovalPolicy,
} from '@agiworkforce/types';
import {
  CREATE_FOLDER_TOOL,
  EDIT_FILE_TOOL,
  WRITE_FILE_TOOL,
  e2bExecutionToolDefs,
} from '@/lib/e2b/execution-tools';

export type CommandRisk =
  | 'safe'
  /** May run only after the user explicitly approves this exact command. */
  | 'requires_approval'
  /** Never runnable from an agent turn, with or without approval. */
  | 'denied';

export interface CommandClassification {
  risk: CommandRisk;
  reason: string;
}

const SHELL_METACHARACTERS = /[;&|`$(){}<>\n\r]|\|\||&&/;

const READ_ONLY_COMMANDS = new Set([
  'ls',
  'pwd',
  'cat',
  'head',
  'tail',
  'wc',
  'stat',
  'file',
  'find',
  'grep',
  'rg',
  'tree',
  'du',
  'df',
  'basename',
  'dirname',
  'realpath',
  'diff',
  'which',
  'whoami',
  'date',
]);

/**
 * A command runner takes the rest of the line as the program to run, so the
 * first token says nothing about what executes. `env` is the reason this list
 * exists: it was classified read-only, and `env sh -c "cat /etc/environment"`
 * carries no shell metacharacter and matches no denied pattern, so it ran with
 * no approval at all. `printenv` is not a runner but dumps the credentials the
 * sandbox was given, which is not read-only in any sense that matters here.
 */
const COMMAND_RUNNERS = new Set([
  'env',
  'nice',
  'nohup',
  'timeout',
  'xargs',
  'time',
  'stdbuf',
  'setsid',
  'chroot',
  'busybox',
  'sudo',
  'doas',
  'nsenter',
  'unshare',
]);

/**
 * A two-token probe of a toolchain binary: `node --version`, `git --version`.
 * It reads no file, writes nothing and reaches no network, and asking the reader
 * to approve one is the kind of prompt that trains people to click Approve
 * without reading. The check runs AFTER the approval patterns on purpose, so
 * `npm --version` still stops at the dependency-manager rule.
 */
const VERSION_PROBE_BINARIES = new Set([
  'node',
  'python',
  'python3',
  'git',
  'go',
  'cargo',
  'rustc',
  'java',
  'ruby',
  'php',
  'deno',
  'bun',
  'tsc',
  'gcc',
  'make',
]);

const VERSION_PROBE_FLAGS = new Set(['--version', '-v', '-V', '--help']);

const READ_ONLY_GIT_SUBCOMMANDS = new Set([
  'status',
  'diff',
  'log',
  'show',
  'blame',
  'ls-files',
  'rev-parse',
  'describe',
  'shortlog',
  'grep',
]);

const GIT_WRITING_FLAG = /^(?:--output\b|--ext-diff$|-o$)/;

const VERSION_PROBE_TOKEN_COUNT = 2;

const DENIED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\bsudo\b|\bsu\b/,
    reason: 'Privilege escalation is never available to an agent turn.',
  },
  {
    pattern: /\bcurl\b|\bwget\b|\bnc\b|\bncat\b|\btelnet\b/,
    reason:
      'Network egress from an agent turn could exfiltrate workspace contents or fetch ' +
      'unreviewed code. Use a declared tool instead of an ad-hoc network command.',
  },
  {
    pattern: /\bgit\s+push\b/,
    reason: 'Pushing to a remote is an external, hard-to-reverse action; do it yourself.',
  },
  {
    pattern: /\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f)/,
    reason: 'Destroys uncommitted work irrecoverably.',
  },
  {
    pattern: /\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)?\/(?:\s|$)/,
    reason: 'Recursive delete targeting the filesystem root.',
  },
  {
    pattern: /\b(mkfs|dd|shutdown|reboot|halt|kill|pkill|killall)\b/,
    reason: 'Host-level or process-level control is outside the sandbox contract.',
  },
  {
    pattern: /\.ssh\b|\bid_rsa\b|\bcredentials\b|\.aws\b|\.npmrc\b|\.env\b/,
    reason: 'Reads or writes credential material.',
  },
];

const APPROVAL_PATTERNS: Array<{ pattern: RegExp; reason: string; destructive: boolean }> = [
  {
    pattern: /\brm\b|\bmv\b|\btruncate\b|\bshred\b/,
    reason: 'Deletes or moves files in the workspace.',
    destructive: true,
  },
  {
    pattern: /\bfind\b.*\s-(?:delete|exec|execdir|ok|okdir|fprint0?|fprintf|fls)\b/,
    reason: 'find with an action flag deletes files or executes commands.',
    destructive: true,
  },
  {
    pattern: /\b(npm|pnpm|yarn|pip|pip3|cargo|go|gem|apt|apt-get|brew)\b/,
    reason:
      'Installs or builds dependencies. This fetches and executes third-party code and can ' +
      'take a long time.',
    destructive: false,
  },
  {
    pattern: /\bgit\s+(commit|checkout|switch|merge|rebase|revert|restore|branch|tag)\b/,
    reason: 'Changes version-control state in the workspace.',
    destructive: true,
  },
  {
    pattern: /\bchmod\b|\bchown\b|\bln\b/,
    reason: 'Changes file permissions or ownership.',
    destructive: false,
  },
];

function isDestructiveCommand(command: string): boolean {
  return APPROVAL_PATTERNS.some(({ pattern, destructive }) => destructive && pattern.test(command));
}

export function classifyCommandRisk(rawCommand: string): CommandClassification {
  const command = rawCommand.trim();

  if (!command) {
    return { risk: 'denied', reason: 'Empty command.' };
  }
  if (command.includes('\0')) {
    return { risk: 'denied', reason: 'Command contains a null byte.' };
  }

  for (const { pattern, reason } of DENIED_PATTERNS) {
    if (pattern.test(command)) return { risk: 'denied', reason };
  }

  for (const { pattern, reason } of APPROVAL_PATTERNS) {
    if (pattern.test(command)) return { risk: 'requires_approval', reason };
  }

  if (SHELL_METACHARACTERS.test(command)) {
    return {
      risk: 'requires_approval',
      reason:
        'Command uses shell operators (pipes, redirection, chaining or substitution), so its ' +
        'full effect cannot be verified automatically.',
    };
  }

  const tokens = command.split(/\s+/);
  const firstToken = tokens[0] ?? '';
  if (COMMAND_RUNNERS.has(firstToken) || firstToken === 'printenv') {
    return {
      risk: 'requires_approval',
      reason: `"${firstToken}" runs another program or exposes the sandbox environment, so it needs your approval.`,
    };
  }
  if (READ_ONLY_COMMANDS.has(firstToken)) {
    return { risk: 'safe', reason: 'Read-only, workspace-scoped command.' };
  }
  if (
    firstToken === 'git' &&
    READ_ONLY_GIT_SUBCOMMANDS.has(tokens[1] ?? '') &&
    !tokens.slice(2).some((token) => GIT_WRITING_FLAG.test(token))
  ) {
    return { risk: 'safe', reason: 'Reads the repository history or working tree.' };
  }
  if (
    tokens.length === VERSION_PROBE_TOKEN_COUNT &&
    VERSION_PROBE_BINARIES.has(firstToken) &&
    VERSION_PROBE_FLAGS.has(tokens[1] ?? '')
  ) {
    return { risk: 'safe', reason: 'Version or help probe of an installed tool.' };
  }

  return {
    risk: 'requires_approval',
    reason: `"${firstToken}" is not a recognized read-only command, so it needs your approval.`,
  };
}

const EXECUTE_CODE_INTERPRETERS: Readonly<Record<string, string>> = Object.freeze({
  python: 'python3 -',
  python3: 'python3 -',
  node: 'node -',
  javascript: 'node -',
  bash: 'bash -s',
  sh: 'sh -s',
  shell: 'sh -s',
});
const MAX_EXECUTE_CODE_CHARS = 20_000;

// execute_code is expressed as the shell command it amounts to, so it crosses the same
// classification and approval boundary as run_command instead of bypassing it.
export function executeCodeAsShellCommand(
  input: Record<string, unknown>,
): { command: string } | { refused: string } {
  const language =
    typeof input['language'] === 'string' ? input['language'].trim().toLowerCase() : '';
  const code = typeof input['code'] === 'string' ? input['code'] : '';
  const interpreter = EXECUTE_CODE_INTERPRETERS[language];
  if (!interpreter) {
    return {
      refused: `execute_code does not support "${language || '<missing>'}" in Code sessions; use run_command instead.`,
    };
  }
  if (!code.trim()) return { refused: 'execute_code requires non-empty "code".' };
  if (code.length > MAX_EXECUTE_CODE_CHARS) {
    return {
      refused: `execute_code accepts at most ${MAX_EXECUTE_CODE_CHARS} characters of code.`,
    };
  }
  const lines = code.split('\n').map((line) => line.trim());
  let delimiter = 'AGI_CODE_EOF';
  for (let suffix = 1; lines.includes(delimiter); suffix += 1) delimiter = `AGI_CODE_EOF_${suffix}`;
  return { command: `${interpreter} <<'${delimiter}'\n${code}\n${delimiter}` };
}

export const CLOUD_CODE_READ_FILE_TOOL = 'read_file';
export const CLOUD_CODE_LIST_FILES_TOOL = 'list_files';
export const CLOUD_CODE_RUN_COMMAND_TOOL = 'run_command';

const READ_TOOLS: ReadonlySet<string> = new Set([
  CLOUD_CODE_READ_FILE_TOOL,
  CLOUD_CODE_LIST_FILES_TOOL,
]);
const EDIT_TOOLS: ReadonlySet<string> = new Set([
  WRITE_FILE_TOOL,
  EDIT_FILE_TOOL,
  CREATE_FOLDER_TOOL,
]);
const EVERY_ACTION_REASON =
  'Ask before every action is on, so this waits for you even though it only reads.';
const EDIT_REASON = 'Changes files in the workspace.';
const PLAN_EDIT_REASON =
  'Plan mode proposes changes without making them. Switch to an editing mode to apply the plan.';
const MAX_APPROVAL_SUMMARY_LENGTH = 100_000;
const APPROVAL_SUMMARY_TAIL_RESERVE = 64;
const OVERSIZED_COMMAND_REASON =
  'This command is too long to show for approval. Split it into smaller commands.';

export type CloudCodeToolGate =
  { action: 'run' } | { action: 'refuse'; reason: string } | { action: 'ask'; reason: string };

export function gateCloudCodeTool(
  policy: ToolApprovalPolicy,
  toolName: string,
  command: string | null,
  mode: CloudCodeTurnMode = CLOUD_CODE_DEFAULT_TURN_MODE,
): CloudCodeToolGate {
  if (command !== null) {
    const verdict = classifyCommandRisk(command);
    if (verdict.risk === 'denied') return { action: 'refuse', reason: verdict.reason };
    const ask = (reason: string): CloudCodeToolGate =>
      command.length > MAX_APPROVAL_SUMMARY_LENGTH
        ? { action: 'refuse', reason: OVERSIZED_COMMAND_REASON }
        : { action: 'ask', reason };
    if (mode === 'plan') return verdict.risk === 'safe' ? { action: 'run' } : ask(verdict.reason);
    if (policy === 'ask_every_time') {
      return ask(verdict.risk === 'safe' ? EVERY_ACTION_REASON : verdict.reason);
    }
    if (verdict.risk === 'safe') return { action: 'run' };
    if (policy === 'autonomous' && !isDestructiveCommand(command)) return { action: 'run' };
    return ask(verdict.reason);
  }
  if (READ_TOOLS.has(toolName)) {
    return policy === 'ask_every_time' && mode !== 'plan'
      ? { action: 'ask', reason: EVERY_ACTION_REASON }
      : { action: 'run' };
  }
  if (EDIT_TOOLS.has(toolName)) {
    if (mode === 'plan') return { action: 'refuse', reason: PLAN_EDIT_REASON };
    return policy === 'autonomous' ? { action: 'run' } : { action: 'ask', reason: EDIT_REASON };
  }
  return { action: 'refuse', reason: `Tool "${toolName}" is not available in Code sessions.` };
}

const APPROVAL_MODE_LINES: Record<ToolApprovalPolicy, string> = {
  ask_every_time:
    'Approval mode for this turn: ask before every action. Every command, file read and file ' +
    'edit waits for the user approval.',
  auto_approve_read_only:
    'Approval mode for this turn: reads and read-only commands run immediately; file edits and ' +
    'commands that change the workspace wait for the user approval.',
  autonomous:
    'Approval mode for this turn: file edits and most commands run immediately; commands that ' +
    'delete or move files or change version-control state wait for the user approval.',
};

const PLAN_MODE_LINE =
  'Plan mode for this turn: research the repository and propose changes without making them. ' +
  'Reads and read-only commands run immediately, any other command waits for the user ' +
  'approval, and there are no file editing tools. End with the plan: each file to change and ' +
  'what to change in it.';

export function cloudCodeApprovalModeLine(policy: ToolApprovalPolicy): string {
  return APPROVAL_MODE_LINES[policy];
}

export function cloudCodeTurnModeLine(mode: CloudCodeTurnMode, policy: ToolApprovalPolicy): string {
  return mode === 'plan' ? PLAN_MODE_LINE : cloudCodeApprovalModeLine(policy);
}

function prefixedLines(text: unknown, prefix: string): string[] {
  return typeof text === 'string' ? text.split('\n').map((line) => `${prefix}${line}`) : [];
}

export function cloudCodeActionLabel(toolName: string, args: Record<string, unknown>): string {
  if (toolName === CLOUD_CODE_RUN_COMMAND_TOOL) return String(args['command'] ?? '');
  const path = typeof args['path'] === 'string' ? args['path'] : '';
  return `${toolName} ${path || '.'}`;
}

export function cloudCodeApprovalSummary(toolName: string, args: Record<string, unknown>): string {
  const label = cloudCodeActionLabel(toolName, args);
  const summary =
    toolName === WRITE_FILE_TOOL
      ? [label, ...prefixedLines(args['content'], '+ ')].join('\n')
      : toolName === EDIT_FILE_TOOL
        ? [
            label,
            ...prefixedLines(args['old_text'], '- '),
            ...prefixedLines(args['new_text'], '+ '),
          ].join('\n')
        : label;
  if (toolName === CLOUD_CODE_RUN_COMMAND_TOOL || summary.length <= MAX_APPROVAL_SUMMARY_LENGTH) {
    return summary;
  }
  const shownLength = MAX_APPROVAL_SUMMARY_LENGTH - APPROVAL_SUMMARY_TAIL_RESERVE;
  const hiddenLines = summary.slice(shownLength).split('\n').length;
  return `${summary.slice(0, shownLength)}\n[${hiddenLines} more ${hiddenLines === 1 ? 'line' : 'lines'} not shown]`;
}

export function cloudCodeAgentToolDefs(
  mode: CloudCodeTurnMode = CLOUD_CODE_DEFAULT_TURN_MODE,
): Array<{
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  const editTools =
    mode === 'plan'
      ? []
      : e2bExecutionToolDefs().filter(
          (tool) => tool.function.name === WRITE_FILE_TOOL || tool.function.name === EDIT_FILE_TOOL,
        );
  return [
    ...editTools,
    {
      type: 'function',
      function: {
        name: CLOUD_CODE_READ_FILE_TOOL,
        description:
          'Read a UTF-8 text file from the session workspace. Use this before editing so ' +
          'edits are based on current contents rather than assumptions.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Workspace-relative file path.' },
          },
          required: ['path'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: CLOUD_CODE_LIST_FILES_TOOL,
        description: 'List files and folders under a workspace-relative path.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Workspace-relative folder path. Defaults to the workspace root.',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: CLOUD_CODE_RUN_COMMAND_TOOL,
        description:
          'Run a shell command in the session workspace. Depending on the approval mode, ' +
          'a command that changes the workspace may pause for the user approval before it ' +
          'runs; read-only commands run immediately and some commands are always refused.',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'The shell command to run.' },
          },
          required: ['command'],
        },
      },
    },
  ];
}
