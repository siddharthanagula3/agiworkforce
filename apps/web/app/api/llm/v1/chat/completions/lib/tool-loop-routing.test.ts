import { describe, expect, it } from 'vitest';
import { classifyToolLoopInputs } from './tool-loop-routing';
import { webSearchToolDef } from '@/lib/web-search/web-search-tool';
import { urlFetchToolDef } from '@/lib/url-fetch/url-fetch-tool';
import { e2bExecutionToolDefs } from '@/lib/e2b/execution-tools';
import { createManagedOfficeFileToolDefinition } from '@/lib/services/managed-office-file-service';
import { createMapSearchToolDefinition } from '@/lib/services/map-search-tool-service';
import type { ToolApprovalPolicy } from '@shared/types/toolApprovalPolicy';

const ASK_EVERY_TIME: ToolApprovalPolicy = 'ask_every_time';
const AUTO_APPROVE_READ_ONLY: ToolApprovalPolicy = 'auto_approve_read_only';

/**
 * `approvalMode` is the account's Tool Approvals setting applied to the tools
 * this turn offers. It used to be `hasMcpTools ? 'manual' : 'auto'`, which made
 * the setting govern connectors and MCP only: under "Ask before every action" a
 * web search still ran unprompted, because 'auto' short-circuits the gate
 * before the policy is ever read. Each case below states what one of the two
 * options promises in its own copy.
 */
describe('classifyToolLoopInputs', () => {
  it('asks for the platform web-search tool under the fail-closed default', () => {
    expect(classifyToolLoopInputs([], [webSearchToolDef()], ASK_EVERY_TIME)).toEqual({
      hasMcpTools: false,
      hasExecutionTools: false,
      hasUrlFetchTools: false,
      hasWebSearchTools: true,
      hasSkillTools: false,
      hasOfficeFileTools: false,
      hasMapSearchTools: false,
      shouldRun: true,
      approvalMode: 'manual',
    });
  });

  it('still asks for web search when the account auto-approves read-only work', () => {
    // The option's own copy: "Anything that ... can move data outside AGI,
    // including web search and page fetches, still asks first." web_search and
    // url_fetch are both declared createsEgressPath.
    const result = classifyToolLoopInputs([], [webSearchToolDef()], AUTO_APPROVE_READ_ONLY);

    expect(result.hasWebSearchTools).toBe(true);
    expect(result.approvalMode).toBe('manual');
  });

  it('asks for sandbox execution and URL fetch under either policy', () => {
    const tools = [...e2bExecutionToolDefs(), urlFetchToolDef()];

    for (const policy of [ASK_EVERY_TIME, AUTO_APPROVE_READ_ONLY]) {
      const result = classifyToolLoopInputs([], tools, policy);
      expect(result.hasExecutionTools).toBe(true);
      expect(result.hasUrlFetchTools).toBe(true);
      expect(result.shouldRun).toBe(true);
      expect(result.approvalMode).toBe('manual');
    }
  });

  it('runs a local map-search card unattended once read-only work is auto-approved', () => {
    // search_maps is the shape the read-only option was written for: it reads,
    // it is reversible, and it opens no egress path.
    const result = classifyToolLoopInputs(
      [],
      [createMapSearchToolDefinition()],
      AUTO_APPROVE_READ_ONLY,
    );

    expect(result).toMatchObject({
      hasMapSearchTools: true,
      shouldRun: true,
      approvalMode: 'auto',
    });
  });

  it('asks for a map-search card when the account asks for everything', () => {
    expect(
      classifyToolLoopInputs([], [createMapSearchToolDefinition()], ASK_EVERY_TIME).approvalMode,
    ).toBe('manual');
  });

  it('asks before creating an Office file, which writes, under either policy', () => {
    for (const policy of [ASK_EVERY_TIME, AUTO_APPROVE_READ_ONLY]) {
      expect(
        classifyToolLoopInputs([], [createManagedOfficeFileToolDefinition()], policy),
      ).toMatchObject({ hasOfficeFileTools: true, shouldRun: true, approvalMode: 'manual' });
    }
  });

  it('defaults to the fail-closed policy when no caller supplies one', () => {
    expect(classifyToolLoopInputs([], [webSearchToolDef()]).approvalMode).toBe('manual');
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
      AUTO_APPROVE_READ_ONLY,
    );

    expect(result.shouldRun).toBe(true);
    expect(result.approvalMode).toBe('manual');
  });

  it('keeps an undeclared MCP tool manual even where the policy auto-approves ours', () => {
    // Nothing in PLATFORM_TOOL_METADATA describes a third-party tool, so it can
    // never satisfy the read-only option however harmless its name looks.
    const result = classifyToolLoopInputs(
      [
        {
          serverId: 'notion',
          toolName: 'search',
          qualifiedName: 'notion__search',
          description: 'Search pages',
          inputSchema: { type: 'object' },
        },
      ],
      [createMapSearchToolDefinition()],
      AUTO_APPROVE_READ_ONLY,
    );

    expect(result.approvalMode).toBe('manual');
  });

  it('stays on the single-turn path when no executable loop tool is present', () => {
    expect(classifyToolLoopInputs([], undefined, ASK_EVERY_TIME)).toMatchObject({
      shouldRun: false,
      approvalMode: 'auto',
    });
  });
});
