/**
 * The runtime names an approval by the Rust debug form of its request kind,
 * for example `Exec { command: "ls -la" }`. Keying a session approval on that
 * whole string approves one argument, so the next command with a different
 * argument asked again. A session approval is scoped to the tool instead.
 */

const TOOL_LABELS: Readonly<Record<string, string>> = Object.freeze({
  Exec: 'shell commands',
  FileWrite: 'file writes',
  FileEdit: 'file edits',
  Patch: 'patches',
  LoopDetection: 'repeated actions',
  McpElicitation: 'prompts from this MCP server',
  AskUser: 'questions from the agent',
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

/**
 * The identity a session approval is remembered under. Two requests share it
 * when approving one should stop the other from asking again.
 */
export function approvalToolIdentity(kind: string): string {
  const variant = variantOf(kind);
  if (variant === 'McpTool') {
    return `McpTool:${field(kind, 'server_name')}:${field(kind, 'tool_name')}`;
  }
  if (variant === 'WorkspacePolicy') {
    return `WorkspacePolicy:${field(kind, 'tool_name')}`;
  }
  return variant;
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
  return TOOL_LABELS[variant] ?? 'this tool';
}
