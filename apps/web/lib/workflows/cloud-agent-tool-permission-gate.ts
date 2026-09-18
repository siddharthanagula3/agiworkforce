import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { loadConnectorToolPermissions } from '@/app/api/llm/v1/chat/completions/lib/connector-tool-permissions';
import { toolExecutionChannel } from '@/app/api/llm/v1/chat/completions/lib/tool-metadata';
import type { ToolLoopToolResult } from '@/app/api/llm/v1/chat/completions/lib/tool-loop';
import { isChannelPreferredOver } from '@/lib/connectors/catalog';
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

function preferredChannelMessage(qualifiedName: string, preferred: string): string {
  return (
    `Tool "${qualifiedName}" drives the machine directly, and this account already offers ` +
    `${preferred} for the same work. Use that instead; if it cannot do the job, say so rather ` +
    'than falling back to pointer and keyboard control.'
  );
}

function bypassMessage(qualifiedName: string, blocked: string): string {
  return (
    `Tool "${qualifiedName}" was not executed because "${blocked}" is blocked in this account's ` +
    'connector permissions, and driving the browser or the screen must not be used to do what a ' +
    'blocked connector would have done. Tell the user it is blocked.'
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
  const offered = [...params.connectorToolNames];

  function preferredAlternativeTo(qualifiedName: string): string | null {
    const channel = toolExecutionChannel(qualifiedName);
    if (channel === 'connector') return null;
    return (
      offered.find(
        (candidate) =>
          candidate !== qualifiedName &&
          isChannelPreferredOver(toolExecutionChannel(candidate), channel),
      ) ?? null
    );
  }

  return {
    async refusalFor(qualifiedName: string): Promise<ToolLoopToolResult | null> {
      const channel = toolExecutionChannel(qualifiedName);
      const isConnectorTool = params.connectorToolNames.has(qualifiedName);
      if (!isConnectorTool && channel === 'connector') return null;

      if (channel !== 'connector') {
        const preferred = preferredAlternativeTo(qualifiedName);
        if (preferred) {
          logger.warn(
            { userId: params.userId, tool: qualifiedName, preferred },
            '[cloud-agent] refusing a lower-preference execution channel while a better one is offered',
          );
          return refusal(preferredChannelMessage(qualifiedName, preferred));
        }
      }

      let permissions: Awaited<ReturnType<typeof loadConnectorToolPermissions>>;
      try {
        permissions = await loadConnectorToolPermissions(db, params.userId);
      } catch (error) {
        logger.warn(
          { error, userId: params.userId, tool: qualifiedName },
          '[cloud-agent] connector tool permissions unreadable mid-run; refusing the dispatch',
        );
        return refusal(unreadableDecisionMessage(qualifiedName));
      }

      if (isConnectorTool && permissions.isDenied(qualifiedName)) {
        logger.warn(
          { userId: params.userId, tool: qualifiedName },
          '[cloud-agent] tool blocked since the run started; refusing the dispatch',
        );
        return refusal(blockedMidRunMessage(qualifiedName));
      }
      if (channel === 'connector') return null;

      // A browser or screen step must not become the way around a connector the
      // account blocked. A blocked connector is never offered to the run, so the
      // stored verdicts are what the fallback has to be checked against.
      const blockedEntry = permissions.entries.find((entry) => entry.level === 'deny');
      const blocked = blockedEntry ? `${blockedEntry.connectorId}/${blockedEntry.toolName}` : null;
      if (!blocked) return null;
      logger.warn(
        { userId: params.userId, tool: qualifiedName, blocked },
        '[cloud-agent] refusing an automation fallback around a blocked connector',
      );
      return refusal(bypassMessage(qualifiedName, blocked));
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
