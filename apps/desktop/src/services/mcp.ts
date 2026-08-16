
import {
  buildMcpToolCatalog,
  connectMcpServer,
  type McpCallToolResult,
  type McpServerConfig,
  type McpServerHandle,
  type McpToolCatalog,
} from '@agiworkforce/mcp';

export type { McpCallToolResult, McpServerConfig, McpServerHandle, McpToolCatalog };

export async function connectDesktopMcpServer(
  serverName: string,
  config: McpServerConfig,
): Promise<McpServerHandle> {
  return connectMcpServer({ serverName, config });
}

export async function buildDesktopMcpCatalog(
  servers: Record<string, McpServerConfig>,
): Promise<{ catalog: McpToolCatalog; handles: McpServerHandle[] }> {
  return buildMcpToolCatalog(servers);
}

export async function probeMcpServer(
  serverName: string,
  config: McpServerConfig,
): Promise<McpToolCatalog> {
  const handle = await connectMcpServer({ serverName, config });
  try {
    return {
      version: 1,
      generatedAt: Date.now(),
      servers: { [serverName]: handle.catalog },
      tools: handle.catalog.tools,
    };
  } finally {
    await handle.close();
  }
}
