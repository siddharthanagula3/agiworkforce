import { describe, expect, it } from 'vitest';
import { classifyToolLoopInputs } from './tool-loop-routing';
import { webSearchToolDef } from '@/lib/web-search/web-search-tool';
import { urlFetchToolDef } from '@/lib/url-fetch/url-fetch-tool';
import { e2bExecutionToolDefs } from '@/lib/e2b/execution-tools';
import { createManagedOfficeFileToolDefinition } from '@/lib/services/managed-office-file-service';
import { createMapSearchToolDefinition } from '@/lib/services/map-search-tool-service';

describe('classifyToolLoopInputs', () => {
  it('enters the loop for the platform web-search tool by itself', () => {
    expect(classifyToolLoopInputs([], [webSearchToolDef()])).toEqual({
      hasMcpTools: false,
      hasExecutionTools: false,
      hasUrlFetchTools: false,
      hasWebSearchTools: true,
      hasSkillTools: false,
      hasOfficeFileTools: false,
      hasMapSearchTools: false,
      shouldRun: true,
      approvalMode: 'auto',
    });
  });

  it('enters the loop for sandbox execution and URL fetch tools', () => {
    const tools = [...e2bExecutionToolDefs(), urlFetchToolDef()];
    const result = classifyToolLoopInputs([], tools);

    expect(result.hasExecutionTools).toBe(true);
    expect(result.hasUrlFetchTools).toBe(true);
    expect(result.shouldRun).toBe(true);
    expect(result.approvalMode).toBe('auto');
  });

  it('enters the loop in auto mode for the read-only server Skill tool', () => {
    const result = classifyToolLoopInputs(
      [],
      [{ type: 'function', function: { name: 'skill', parameters: {} } }],
    );

    expect(result).toMatchObject({
      hasSkillTools: true,
      shouldRun: true,
      approvalMode: 'auto',
    });
  });

  it('enters the loop in auto mode for managed Office file creation', () => {
    const result = classifyToolLoopInputs([], [createManagedOfficeFileToolDefinition()]);

    expect(result).toMatchObject({
      hasOfficeFileTools: true,
      shouldRun: true,
      approvalMode: 'auto',
    });
  });

  it('enters the loop in auto mode for a local map-search card', () => {
    const result = classifyToolLoopInputs([], [createMapSearchToolDefinition()]);

    expect(result).toMatchObject({
      hasMapSearchTools: true,
      shouldRun: true,
      approvalMode: 'auto',
    });
  });

  it('keeps MCP calls manual even when safe platform tools are also present', () => {
    const result = classifyToolLoopInputs(
      [
        {
          serverId: 'github',
          toolName: 'create_issue',
          qualifiedName: 'github__create_issue',
          description: 'Create an issue',
          inputSchema: { type: 'object' },
        },
      ],
      [webSearchToolDef()],
    );

    expect(result.shouldRun).toBe(true);
    expect(result.approvalMode).toBe('manual');
  });

  it('stays on the single-turn path when no executable loop tool is present', () => {
    expect(classifyToolLoopInputs([], undefined)).toMatchObject({
      shouldRun: false,
      approvalMode: 'auto',
    });
  });
});
