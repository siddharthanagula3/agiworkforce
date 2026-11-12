import { describe, expect, it } from 'vitest';
import {
  approvalAllowsSessionScope,
  approvalToolIdentity,
  approvalToolLabel,
} from '../features/permissions/approvalScope';

describe('approval tool identity', () => {
  it('ignores the argument, so two shell commands share one session approval', () => {
    const first = approvalToolIdentity('Exec { command: "ls -la" }');
    const second = approvalToolIdentity('Exec { command: "node -e \\"import(\'./add.mjs\')\\"" }');

    expect(first).toBe('Exec');
    expect(second).toBe('Exec');
  });

  it('keeps file writes, file edits and patches apart', () => {
    expect(approvalToolIdentity('FileWrite { path: "/w/a.ts" }')).toBe('FileWrite');
    expect(approvalToolIdentity('FileEdit { path: "/w/a.ts" }')).toBe('FileEdit');
    expect(approvalToolIdentity('Patch { files: ["/w/a.ts"] }')).toBe('Patch');
    expect(approvalToolIdentity('FileWrite { path: "/w/b.ts" }')).toBe('FileWrite');
  });

  it('scopes an MCP approval to one tool on one server, not to every MCP tool', () => {
    const linear = approvalToolIdentity('McpTool { server_name: "linear", tool_name: "create" }');
    const sameTool = approvalToolIdentity('McpTool { server_name: "linear", tool_name: "create" }');
    const otherTool = approvalToolIdentity(
      'McpTool { server_name: "linear", tool_name: "delete" }',
    );
    const otherServer = approvalToolIdentity(
      'McpTool { server_name: "jira", tool_name: "create" }',
    );

    expect(linear).toBe(sameTool);
    expect(otherTool).not.toBe(linear);
    expect(otherServer).not.toBe(linear);
  });

  it('falls back to the whole kind rather than approving everything at once', () => {
    expect(approvalToolIdentity('')).toBe('');
    expect(approvalToolIdentity('Something-Unparsed')).toBe('Something');
  });
});

describe('approval tool label', () => {
  it('names the tool the way the card and the notice say it', () => {
    expect(approvalToolLabel('Exec { command: "ls" }')).toBe('shell commands');
    expect(approvalToolLabel('FileWrite { path: "/w/a.ts" }')).toBe('file writes');
    expect(approvalToolLabel('McpTool { server_name: "linear", tool_name: "create" }')).toBe(
      'create on linear',
    );
    expect(
      approvalToolLabel('WorkspacePolicy { tool_name: "run_command", primary_argument: "x" }'),
    ).toBe('run_command');
    expect(approvalToolLabel('Mystery { }')).toBe('this tool');
  });

  it('keeps a session answer bound to the push, git change, destination or action it covered', () => {
    const push = approvalToolIdentity('GitPush { remote: "origin", branch: "a", force: false }');
    expect(push).toBe(
      approvalToolIdentity('GitPush { remote: "origin", branch: "a", force: false }'),
    );
    expect(push).not.toBe(
      approvalToolIdentity('GitPush { remote: "origin", branch: "main", force: true }'),
    );
    expect(push).not.toBe(
      approvalToolIdentity('GitPush { remote: "origin", branch: "a", force: true }'),
    );
    expect(approvalToolIdentity('Git { tool_name: "git_reset", target: "HEAD~1" }')).not.toBe(
      approvalToolIdentity('Git { tool_name: "git_branch_delete", target: "main" }'),
    );
    expect(
      approvalToolIdentity('Network { tool_name: "web_fetch", destination: "a.example" }'),
    ).not.toBe(
      approvalToolIdentity('Network { tool_name: "web_fetch", destination: "b.example" }'),
    );
    expect(approvalToolIdentity('ComputerUse { action: "click", target: "Save" }')).not.toBe(
      approvalToolIdentity('ComputerUse { action: "type", target: "Terminal" }'),
    );
  });

  it('never offers a session answer for a force push', () => {
    expect(approvalAllowsSessionScope('GitPush { remote: "o", branch: "m", force: true }')).toBe(
      false,
    );
    expect(approvalAllowsSessionScope('GitPush { remote: "o", branch: "m" }')).toBe(false);
    expect(approvalAllowsSessionScope('GitPush { remote: "o", branch: "m", force: false }')).toBe(
      true,
    );
    expect(approvalAllowsSessionScope('Exec { command: "ls" }')).toBe(true);
  });
});
