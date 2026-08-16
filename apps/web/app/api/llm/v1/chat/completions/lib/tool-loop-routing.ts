import { isExecutionTool } from '@/lib/e2b/execution-tools';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';
import { isUrlFetchTool } from '@/lib/url-fetch/url-fetch-tool';
import { isWebSearchTool } from '@/lib/web-search/web-search-tool';
import { SKILL_TOOL_NAME } from '@agiworkforce/skills';
import { isManagedOfficeFileTool } from '@/lib/services/managed-office-file-service';
import { isMapSearchTool } from '@/lib/services/map-search-tool-service';

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

export function classifyToolLoopInputs(
  mcpTools: WebMcpToolDef[],
  requestTools: unknown[] | undefined,
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
    // their existing read-only or isolated safety boundaries.
    approvalMode: hasMcpTools ? 'manual' : 'auto',
  };
}
