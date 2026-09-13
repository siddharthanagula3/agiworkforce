export const SHELL_COMMANDS = [
  'shell_run',
  'shell_cancel',
  'shell_policy_read',
  'shell_policy_write',
] as const;

export type ShellCommand = (typeof SHELL_COMMANDS)[number];

/**
 * Programs a workspace grant can never cover.
 *
 * Approving a folder says what the agent may touch, not who it may become.
 * Everything here either escalates privilege or hands the session to another
 * account, so no allow-list entry and no prompt can reach them.
 */
export const ALWAYS_REFUSED_PROGRAMS: readonly string[] = ['sudo', 'su', 'doas', 'pkexec', 'runas'];

/**
 * Characters that decide what runs rather than what it runs on.
 *
 * The runtime spawns argv directly with no shell, so these would arrive as
 * literal text and quietly do nothing like the shell they look like. Refusing
 * them keeps the policy honest: the program the user approved is the only
 * program that starts.
 */
export const SHELL_CONTROL_CHARACTERS: readonly string[] = [
  ';',
  '|',
  '&',
  '<',
  '>',
  '$',
  '`',
  '(',
  ')',
  '\n',
  '\r',
];

export const SHELL_TIMEOUT_DEFAULT_MS = 120_000;
export const SHELL_TIMEOUT_MAX_MS = 600_000;
export const MAX_SHELL_OUTPUT_BYTES = 1_000_000;
export const MAX_SHELL_COMMAND_LENGTH = 4_000;

export interface ShellPolicy {
  /** Program names that run inside an approved folder without a second prompt. */
  allow: string[];
  /** Program names the runtime refuses without prompting. */
  deny: string[];
}

export const EMPTY_SHELL_POLICY: ShellPolicy = { allow: [], deny: [] };

export type ShellPolicyDecision = 'allow' | 'ask' | 'deny';

export interface ShellPolicyVerdict {
  decision: ShellPolicyDecision;
  program: string;
  reason:
    | 'always-refused'
    | 'denied-by-policy'
    | 'allowed-by-policy'
    | 'not-listed'
    | 'unparseable';
  message?: string;
}

export interface ShellRunRequest {
  rootId: string;
  command: string;
  /** Folder to run in, relative to the workspace root. Empty means the root. */
  path?: string;
  timeoutMs?: number;
}

export interface ShellRunResult {
  runId: string;
  command: string;
  program: string;
  /** POSIX-separated working directory relative to the workspace root. */
  cwd: string;
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  timedOut: boolean;
  durationMs: number;
}

export class ShellCommandRefused extends Error {
  readonly reason: ShellPolicyVerdict['reason'] | 'control-characters' | 'too-long';
  constructor(reason: ShellCommandRefused['reason'], message: string) {
    super(message);
    this.name = 'ShellCommandRefused';
    this.reason = reason;
  }
}

function normalizeProgram(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const lastSlash = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  const base = lastSlash === -1 ? trimmed : trimmed.slice(lastSlash + 1);
  return base.endsWith('.exe') ? base.slice(0, -4) : base;
}

export function normalizeShellPolicy(policy: ShellPolicy): ShellPolicy {
  const unique = (values: string[]) => [
    ...new Set(values.map(normalizeProgram).filter((value) => value !== '')),
  ];
  return { allow: unique(policy.allow), deny: unique(policy.deny) };
}

/**
 * The first character that would change what runs, ignoring quoted text.
 *
 * Quoting is what separates `git commit -m "fix; ship"` from `git status; rm`.
 * The first is one program receiving an argument that happens to contain a
 * semicolon, and refusing it would make the terminal useless for the commands
 * people actually run. Only an unquoted control character is a refusal.
 */
export function findControlCharacter(command: string): string | null {
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index] as string;

    if (quote) {
      if (character === quote) quote = null;
      else if (quote === '"' && character === '\\') index += 1;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '\\') {
      index += 1;
      continue;
    }
    if (SHELL_CONTROL_CHARACTERS.includes(character)) return character;
  }
  return null;
}

/**
 * Splits a command line into argv the way a shell would, minus everything a
 * shell does beyond splitting.
 *
 * Quotes group, a backslash escapes the next character outside quotes, and
 * nothing expands. An unterminated quote is a parse failure rather than a
 * guess, because guessing would run a different command than the one the user
 * read in the approval prompt.
 */
export function parseCommandLine(command: string): string[] | null {
  const argv: string[] = [];
  let current = '';
  let started = false;
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index] as string;

    if (quote) {
      if (character === quote) {
        quote = null;
      } else if (quote === '"' && character === '\\' && index + 1 < command.length) {
        index += 1;
        current += command[index];
      } else {
        current += character;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      started = true;
      continue;
    }
    if (character === '\\' && index + 1 < command.length) {
      index += 1;
      current += command[index];
      started = true;
      continue;
    }
    if (character === ' ' || character === '\t') {
      if (started) {
        argv.push(current);
        current = '';
        started = false;
      }
      continue;
    }
    current += character;
    started = true;
  }

  if (quote) return null;
  if (started) argv.push(current);
  return argv.length === 0 ? null : argv;
}

export function evaluateShellPolicy(policy: ShellPolicy, command: string): ShellPolicyVerdict {
  const argv = parseCommandLine(command);
  const raw = argv?.[0];
  if (!raw) {
    return {
      decision: 'deny',
      program: '',
      reason: 'unparseable',
      message: 'That command could not be read as a program and its arguments.',
    };
  }

  const program = normalizeProgram(raw);
  if (ALWAYS_REFUSED_PROGRAMS.includes(program)) {
    return {
      decision: 'deny',
      program,
      reason: 'always-refused',
      message: `${program} changes which account the command runs as, which approving a folder never covers.`,
    };
  }

  const normalized = normalizeShellPolicy(policy);
  if (normalized.deny.includes(program)) {
    return {
      decision: 'deny',
      program,
      reason: 'denied-by-policy',
      message: `${program} is on your blocked list for local commands.`,
    };
  }
  if (normalized.allow.includes(program)) {
    return { decision: 'allow', program, reason: 'allowed-by-policy' };
  }
  return { decision: 'ask', program, reason: 'not-listed' };
}
