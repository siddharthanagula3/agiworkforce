/**
 * The runtime names an approval by the Rust debug form of its request kind,
 * for example `Exec { command: "ls -la" }`. Keying a session approval on that
 * whole string approves one argument, so the next command with a different
 * argument asked again. A session approval is scoped to the tool instead,
 * except where the target is what the user consented to: a push, a git change,
 * a network destination and a computer-use action stay bound to it.
 */

const TOOL_LABELS: Readonly<Record<string, string>> = Object.freeze({
  Exec: 'shell commands',
  FileWrite: 'file writes',
  FileEdit: 'file edits',
  Patch: 'patches',
  LoopDetection: 'repeated actions',
  McpElicitation: 'prompts from this MCP server',
  AskUser: 'questions from the agent',
  Question: 'questions from the agent',
  Hook: 'hooks',
  Subagent: 'subagents',
  TrustDirectory: 'directory trust',
  WorkspacePolicy: 'this workspace policy tool',
});

function variantOf(kind: string): string {
  const trimmed = kind.trim();
  return /^([A-Za-z_][A-Za-z0-9_]*)/u.exec(trimmed)?.[1] ?? trimmed;
}

function field(kind: string, name: string): string {
  return new RegExp(`${name}:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'u').exec(kind)?.[1] ?? '';
}

function flag(kind: string, name: string): string {
  return new RegExp(`${name}:\\s*(true|false)\\b`, 'u').exec(kind)?.[1] ?? '';
}

const TARGET_FIELDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  McpTool: ['server_name', 'tool_name'],
  WorkspacePolicy: ['tool_name'],
  Git: ['tool_name', 'target'],
  Network: ['tool_name', 'destination'],
  ComputerUse: ['action', 'target'],
  GitPush: ['remote', 'branch'],
});

/**
 * The identity a session approval is remembered under. Two requests share it
 * when approving one should stop the other from asking again.
 */
export function approvalToolIdentity(kind: string): string {
  const variant = variantOf(kind);
  const fields = TARGET_FIELDS[variant];
  if (fields === undefined) return variant;
  const parts = fields.map((name) => JSON.stringify(field(kind, name)));
  if (variant === 'GitPush') parts.push(`force=${flag(kind, 'force') || 'unknown'}`);
  return `${variant}:${parts.join(':')}`;
}

/**
 * A force push rewrites history on a remote nobody here can restore, so an
 * earlier answer never stands in for a new one.
 */
export function approvalAllowsSessionScope(kind: string): boolean {
  return !(variantOf(kind) === 'GitPush' && flag(kind, 'force') !== 'false');
}

const FILE_CHANGE_VARIANTS: ReadonlySet<string> = new Set(['FileWrite', 'FileEdit']);

export function approvalFilePath(kind: string): string | undefined {
  if (!FILE_CHANGE_VARIANTS.has(variantOf(kind))) return undefined;
  const raw = field(kind, 'path');
  return raw === '' ? undefined : raw.replace(/\\(.)/gu, '$1');
}

/** What to call that tool in a sentence the user reads. */
export function approvalToolLabel(kind: string): string {
  const variant = variantOf(kind);
  if (variant === 'McpTool') {
    const tool = field(kind, 'tool_name');
    const server = field(kind, 'server_name');
    if (tool !== '' && server !== '') return `${tool} on ${server}`;
    if (tool !== '') return tool;
  }
  if (variant === 'WorkspacePolicy') {
    const tool = field(kind, 'tool_name');
    if (tool !== '') return tool;
  }
  if (variant === 'GitPush') {
    const remote = field(kind, 'remote');
    const branch = field(kind, 'branch');
    if (remote !== '' && branch !== '') return `pushes of ${branch} to ${remote}`;
  }
  if (variant === 'Git' || variant === 'Network' || variant === 'ComputerUse') {
    const [first, second] = TARGET_FIELDS[variant] ?? [];
    const what = field(kind, first ?? '');
    const where = field(kind, second ?? '');
    if (what !== '' && where !== '') return `${what} on ${where}`;
  }
  return TOOL_LABELS[variant] ?? 'this tool';
}
