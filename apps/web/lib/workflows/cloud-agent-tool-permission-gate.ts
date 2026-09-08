import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { loadConnectorToolPermissions } from '@/app/api/llm/v1/chat/completions/lib/connector-tool-permissions';
import type { ToolLoopToolResult } from '@/app/api/llm/v1/chat/completions/lib/tool-loop';
import { logger } from '@/lib/logger';

export interface CloudAgentToolPermissionGate {
  refusalFor(qualifiedName: string): Promise<ToolLoopToolResult | null>;
}

function blockedMidRunMessage(qualifiedName: string): string {
  return (
    `Tool "${qualifiedName}" was blocked in this account's connector permissions while this ` +
    'run was in progress, so it was not executed. Do not retry it; continue without it or tell ' +
    'the user it is blocked.'
  );
}

function unreadableDecisionMessage(qualifiedName: string): string {
  return (
    `Tool "${qualifiedName}" was not executed because this account's connector permissions ` +
    'could not be read, and a permission that cannot be confirmed is not an allowance. Do not ' +
    'retry it; continue without it or tell the user it is unavailable.'
  );
}

function refusal(content: string): ToolLoopToolResult {
  return { content, isError: true, unavailable: true };
}

/**
 * A durable run outlives the permission snapshot it started with. Blocking a
 * connector tool must take effect on the next dispatch rather than at the end
 * of the run, so the decision is read again for every connector tool call and
 * a refusal is returned in place of the execution.
 */
export function createCloudAgentToolPermissionGate(
  db: DatabaseAdapter,
  params: { userId: string; connectorToolNames: ReadonlySet<string> },
): CloudAgentToolPermissionGate {
  return {
    async refusalFor(qualifiedName: string): Promise<ToolLoopToolResult | null> {
      if (!params.connectorToolNames.has(qualifiedName)) return null;
      let denied: boolean;
      try {
        const permissions = await loadConnectorToolPermissions(db, params.userId);
        denied = permissions.isDenied(qualifiedName);
      } catch (error) {
        logger.warn(
          { error, userId: params.userId, tool: qualifiedName },
          '[cloud-agent] connector tool permissions unreadable mid-run; refusing the dispatch',
        );
        return refusal(unreadableDecisionMessage(qualifiedName));
      }
      if (!denied) return null;
      logger.warn(
        { userId: params.userId, tool: qualifiedName },
        '[cloud-agent] tool blocked since the run started; refusing the dispatch',
      );
      return refusal(blockedMidRunMessage(qualifiedName));
    },
  };
}

export function connectorToolNames(
  tools: ReadonlyArray<{ qualifiedName: string; origin?: 'operator' | 'connector' }>,
): ReadonlySet<string> {
  return new Set(
    tools.filter((tool) => tool.origin === 'connector').map((tool) => tool.qualifiedName),
  );
}
