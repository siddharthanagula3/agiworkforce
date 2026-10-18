export interface SshEnvironmentInput {
  hostAlias: string;
  remotePath: string;
  name: string;
}
export interface SshEnvironment extends SshEnvironmentInput {
  id: string;
  authorized: boolean;
  capabilities: {
    sessions: true;
    approvals: true;
    reconnect: true;
    agentFileTools: true;
    transcriptDiffs: true;
    hostFileEditor: false;
    pty: false;
    worktreeManagement: false;
    passwordPrompts: false;
    jumpHosts: false;
  };
}
export const SSH_ENVIRONMENT_COMMANDS = [
  'developer_ssh_connect',
  'developer_ssh_list',
  'developer_ssh_disconnect',
] as const;
export function isSshEnvironmentId(value: string): boolean {
  return /^ssh:[a-f0-9]{64}$/.test(value);
}
