import type { McpContextSelection } from '@/features/connectors/lib/mcp-context-selection';
import type { MessageMetadata } from '@shared/stores/web-chat-store';

export type McpContextSummary = NonNullable<MessageMetadata['mcpContext']>;

export function summarizeMcpContext(
  selection: McpContextSelection | undefined,
): McpContextSummary | undefined {
  const prompt = selection?.prompt;
  const resources = selection?.resources ?? [];
  if (!prompt && resources.length === 0) return undefined;
  return {
    ...(prompt ? { prompt: { connectorId: prompt.connectorId, name: prompt.name } } : {}),
    ...(resources.length > 0
      ? {
          resources: resources.map(({ connectorId, uri, name }) => ({
            connectorId,
            uri,
            ...(name ? { name } : {}),
          })),
        }
      : {}),
  };
}
