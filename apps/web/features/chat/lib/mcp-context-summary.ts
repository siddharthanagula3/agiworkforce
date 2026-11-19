import type { McpContextSelection } from '@/features/connectors/lib/mcp-context-selection';
import type { MessageMetadata } from '@shared/stores/web-chat-store';

export type McpContextSummary = NonNullable<MessageMetadata['mcpContext']>;

export const MCP_REPLAY_ARGUMENTS_MAX_CHARS = 4_000;

export type McpContextReplay =
  { ok: true; mcpContext?: McpContextSelection } | { ok: false; message: string };

export function summarizeMcpContext(
  selection: McpContextSelection | undefined,
): McpContextSummary | undefined {
  const prompt = selection?.prompt;
  const resources = selection?.resources ?? [];
  if (!prompt && resources.length === 0) return undefined;
  const promptArguments = prompt?.arguments;
  const hasArguments = promptArguments !== undefined && Object.keys(promptArguments).length > 0;
  const argumentsFit =
    hasArguments && JSON.stringify(promptArguments).length <= MCP_REPLAY_ARGUMENTS_MAX_CHARS;
  return {
    ...(prompt
      ? {
          prompt: {
            connectorId: prompt.connectorId,
            name: prompt.name,
            ...(argumentsFit ? { arguments: promptArguments } : {}),
            ...(hasArguments && !argumentsFit ? { argumentsOmitted: true } : {}),
          },
        }
      : {}),
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

export function replayMcpContext(summary: McpContextSummary | undefined): McpContextReplay {
  if (!summary) return { ok: true };
  if (summary.prompt?.argumentsOmitted) {
    return {
      ok: false,
      message: `The "${summary.prompt.name}" prompt used arguments too long to keep with this message. Select it again from Connectors and send a new message.`,
    };
  }
  const { prompt, resources } = summary;
  return {
    ok: true,
    mcpContext: {
      ...(prompt
        ? {
            prompt: {
              connectorId: prompt.connectorId,
              name: prompt.name,
              ...(prompt.arguments ? { arguments: prompt.arguments } : {}),
            },
          }
        : {}),
      ...(resources && resources.length > 0 ? { resources } : {}),
    },
  };
}
