import { describe, expect, it } from 'vitest';

import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';
import {
  DEFAULT_TOOL_SCHEMA_BUDGET,
  TOOL_DIRECTORY_TOOL_NAME,
  expandDeferredToolSchemas,
  selectToolSchemas,
  toolDirectoryToolDef,
  toolSchemaBytes,
} from '../tool-schema-loader';

function tool(serverId: string, toolName: string, description: string): WebMcpToolDef {
  return {
    qualifiedName: `mcp__${serverId}__${toolName}`,
    serverId,
    toolName,
    description,
    serverLabel: serverId,
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'A reasonably wordy parameter description.' },
        options: { type: 'object', properties: { deep: { type: 'boolean' } } },
      },
    },
  };
}

function connectedTools(count: number): WebMcpToolDef[] {
  return Array.from({ length: count }, (_, index) =>
    tool(`server${index}`, `operation_${index}`, `Performs operation ${index} on a record.`),
  );
}

describe('selectToolSchemas payload bound', () => {
  it('keeps the schema payload under the budget as the connected count grows', () => {
    const sizes = [10, 100, 400].map((count) => {
      const selected = selectToolSchemas({ tools: connectedTools(count), turnText: 'hello' });
      return selected.bytes;
    });

    for (const bytes of sizes) {
      expect(bytes).toBeLessThanOrEqual(DEFAULT_TOOL_SCHEMA_BUDGET.maxSchemaBytes);
    }
    expect(sizes[2]).toBeLessThanOrEqual(sizes[1]!);
  });

  it('never offers more tools than the budget allows', () => {
    const selected = selectToolSchemas({ tools: connectedTools(400), turnText: 'hello' });
    expect(selected.tools.length).toBeLessThanOrEqual(DEFAULT_TOOL_SCHEMA_BUDGET.maxTools);
    expect(selected.tools.length + selected.deferred.length).toBe(400);
  });

  it('reports the bytes it actually admitted', () => {
    const selected = selectToolSchemas({ tools: connectedTools(50), turnText: 'hello' });
    const measured = selected.tools.reduce((total, entry) => total + toolSchemaBytes(entry), 0);
    expect(selected.bytes).toBe(measured);
  });
});

describe('selectToolSchemas relevance', () => {
  const tools = [
    tool('linear', 'create_issue', 'Creates an issue in a Linear team.'),
    tool('github', 'create_pull_request', 'Opens a pull request on a repository.'),
    tool('gmail', 'send_message', 'Sends an email message.'),
  ];

  it('ranks the tool the turn is about first', () => {
    const selected = selectToolSchemas({
      tools,
      turnText: 'open a pull request on the repository',
      budget: { maxTools: 1 },
    });
    expect(selected.tools.map((entry) => entry.toolName)).toEqual(['create_pull_request']);
    expect(selected.deferred.map((entry) => entry.qualifiedName)).toContain(
      'mcp__gmail__send_message',
    );
  });

  it('falls back to every tool when the turn matches none of them', () => {
    const selected = selectToolSchemas({ tools, turnText: 'zzzz qqqq' });
    expect(selected.tools).toHaveLength(3);
    expect(selected.deferred).toHaveLength(0);
  });

  it('keeps a pinned tool even when it scores nothing and the budget is spent', () => {
    const selected = selectToolSchemas({
      tools,
      turnText: 'open a pull request',
      pinnedQualifiedNames: ['mcp__gmail__send_message'],
      budget: { maxTools: 1, maxSchemaBytes: 1 },
    });
    expect(selected.tools.map((entry) => entry.qualifiedName)).toEqual([
      'mcp__gmail__send_message',
    ]);
  });
});

describe('progressive retrieval', () => {
  it('offers a directory tool naming everything it deferred', () => {
    const selected = selectToolSchemas({
      tools: connectedTools(40),
      turnText: 'hello',
      budget: { maxTools: 2 },
    });
    const directory = toolDirectoryToolDef(selected.deferred);

    expect(directory).not.toBeNull();
    expect(directory?.qualifiedName).toBe(TOOL_DIRECTORY_TOOL_NAME);
    const names = (
      (directory?.inputSchema['properties'] as Record<string, Record<string, unknown>>)['names']?.[
        'items'
      ] as { enum: string[] }
    ).enum;
    expect(names).toHaveLength(selected.deferred.length);
    expect(directory?.description).toContain(selected.deferred[0]!.qualifiedName);
  });

  it('offers no directory tool when nothing was deferred', () => {
    const selected = selectToolSchemas({ tools: connectedTools(2), turnText: 'hello' });
    expect(toolDirectoryToolDef(selected.deferred)).toBeNull();
  });

  it('returns the real schemas for the tools the model asked for', () => {
    const tools = connectedTools(40);
    const expanded = expandDeferredToolSchemas(tools, [
      'mcp__server30__operation_30',
      'mcp__nope__missing',
    ]);
    expect(expanded).toHaveLength(1);
    expect(expanded[0]?.inputSchema).toEqual(tools[30]?.inputSchema);
  });
});
