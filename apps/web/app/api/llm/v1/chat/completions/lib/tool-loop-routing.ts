import { isExecutionTool } from '@/lib/e2b/execution-tools';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';
import { isUrlFetchTool } from '@/lib/url-fetch/url-fetch-tool';
import { isWebSearchTool } from '@/lib/web-search/web-search-tool';
import { SKILL_TOOL_NAME } from '@agiworkforce/skills';
import { isManagedOfficeFileTool } from '@/lib/services/managed-office-file-service';
import { isMapSearchTool } from '@/lib/services/map-search-tool-service';
import {
  DEFAULT_TOOL_APPROVAL_POLICY,
  type ToolApprovalPolicy,
} from '@shared/types/toolApprovalPolicy';
import { policyAutoApprovesTool } from './tool-metadata';

export type ToolLoopApprovalMode = 'auto' | 'manual';

export interface ToolLoopInputClassification {
  hasMcpTools: boolean;
  hasExecutionTools: boolean;
  hasUrlFetchTools: boolean;
  hasWebSearchTools: boolean;
  hasSkillTools: boolean;
  hasOfficeFileTools: boolean;
  hasMapSearchTools: boolean;
  shouldRun: boolean;
  approvalMode: ToolLoopApprovalMode;
}

export function functionToolName(tool: unknown): string {
  if (!tool || typeof tool !== 'object') return '';
  const candidate = tool as { function?: { name?: unknown } };
  return typeof candidate.function?.name === 'string' ? candidate.function.name : '';
}

/**
 * Which offered tools this account's policy will not run unattended.
 *
 * `approvalMode` used to be `hasMcpTools ? 'manual' : 'auto'`, on the reasoning
 * that first-party tools sat inside "existing read-only or isolated safety
 * boundaries". They do not. `web_search` and `url_fetch` are both declared
 * `createsEgressPath`, and the Tool Approvals setting names web search by name
 * as something that "still asks first". In 'auto' mode `resolveToolCallGate`
 * returns `allow` without ever consulting the account policy, so the setting
 * governed connector and MCP calls only: a user who chose "Ask before every
 * action" watched web search run unprompted, twice out of two attempts in
 * browser QA. The control read as binding and was advisory.
 *
 * The mode now follows the policy applied to the tools actually offered. MCP
 * and connector tools still force manual on their own: they are undeclared in
 * `PLATFORM_TOOL_METADATA`, so nothing auto-approves them under either policy.
 */
function anyToolNeedsApproval(
  names: readonly string[],
  policy: ToolApprovalPolicy,
): boolean {
  return names.some((name) => !policyAutoApprovesTool(policy, name));
}

export function classifyToolLoopInputs(
  mcpTools: WebMcpToolDef[],
  requestTools: unknown[] | undefined,
  toolApprovalPolicy: ToolApprovalPolicy = DEFAULT_TOOL_APPROVAL_POLICY,
): ToolLoopInputClassification {
  const names = (requestTools ?? []).map(functionToolName).filter(Boolean);
  const hasMcpTools = mcpTools.length > 0;
  const hasExecutionTools = names.some(isExecutionTool);
  const hasUrlFetchTools = names.some(isUrlFetchTool);
  const hasWebSearchTools = names.some(isWebSearchTool);
  const hasSkillTools = names.includes(SKILL_TOOL_NAME);
  const hasOfficeFileTools = names.some(isManagedOfficeFileTool);
  const hasMapSearchTools = names.some(isMapSearchTool);

  return {
    hasMcpTools,
    hasExecutionTools,
    hasUrlFetchTools,
    hasWebSearchTools,
    hasSkillTools,
    hasOfficeFileTools,
    hasMapSearchTools,
    shouldRun:
      hasMcpTools ||
      hasExecutionTools ||
      hasUrlFetchTools ||
      hasWebSearchTools ||
      hasSkillTools ||
      hasOfficeFileTools ||
      hasMapSearchTools,
    approvalMode:
      hasMcpTools ||
      anyToolNeedsApproval(
        [...names, ...mcpTools.map((tool) => tool.qualifiedName)],
        toolApprovalPolicy,
      )
        ? 'manual'
        : 'auto',
  };
}
