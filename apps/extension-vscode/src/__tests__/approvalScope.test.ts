import { describe, expect, it } from 'vitest';
import { approvalToolIdentity, approvalToolLabel } from '../features/permissions/approvalScope';

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
});
