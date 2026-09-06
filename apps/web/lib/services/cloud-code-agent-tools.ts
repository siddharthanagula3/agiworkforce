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
  'env',
  'printenv',
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

const APPROVAL_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\brm\b|\bmv\b|\btruncate\b|\bshred\b/,
    reason: 'Deletes or moves files in the workspace.',
  },
  {
    pattern: /\bfind\b.*\s-(?:delete|exec|execdir|ok|okdir|fprint0?|fprintf|fls)\b/,
    reason: 'find with an action flag deletes files or executes commands.',
  },
  {
    pattern: /\b(npm|pnpm|yarn|pip|pip3|cargo|go|gem|apt|apt-get|brew)\b/,
    reason:
      'Installs or builds dependencies. This fetches and executes third-party code and can ' +
      'take a long time.',
  },
  {
    pattern: /\bgit\s+(commit|checkout|switch|merge|rebase|revert|restore|branch|tag)\b/,
    reason: 'Changes version-control state in the workspace.',
  },
  {
    pattern: /\bchmod\b|\bchown\b|\bln\b/,
    reason: 'Changes file permissions or ownership.',
  },
];

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
  if (READ_ONLY_COMMANDS.has(firstToken)) {
    return { risk: 'safe', reason: 'Read-only, workspace-scoped command.' };
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

export function cloudCodeAgentToolDefs(): Array<{
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  return [
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
          'Run a shell command in the session workspace. Destructive, privileged, ' +
          'network, or dependency-installing commands are paused for explicit user ' +
          'approval before they execute; read-only commands run immediately.',
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
