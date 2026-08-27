import {
  buildMcpToolCatalog,
  connectMcpServer,
  type ConnectMcpServerParams,
  type McpCallToolResult,
  type McpServerConfig,
  type McpServerHandle,
  type McpToolCatalog,
} from '@agiworkforce/mcp';

export type { McpCallToolResult, McpServerConfig, McpServerHandle, McpToolCatalog };

// Desktop MCP servers are local processes and loopback endpoints the user configured, so the
// managed-cloud public-address rule must not apply here. DNS is still pinned: the socket only
// reaches an address resolved in the same lookup that was vetted.
const desktopLocalEgressPolicy: NonNullable<ConnectMcpServerParams['egressPolicy']> = {
  allowPrivateNetwork: true,
};

export async function connectDesktopMcpServer(
  serverName: string,
  config: McpServerConfig,
): Promise<McpServerHandle> {
  return connectMcpServer({ serverName, config, egressPolicy: desktopLocalEgressPolicy });
}

export async function buildDesktopMcpCatalog(
  servers: Record<string, McpServerConfig>,
): Promise<{ catalog: McpToolCatalog; handles: McpServerHandle[] }> {
  return buildMcpToolCatalog(servers, desktopLocalEgressPolicy);
}

export async function probeMcpServer(
  serverName: string,
  config: McpServerConfig,
): Promise<McpToolCatalog> {
  const handle = await connectMcpServer({
    serverName,
    config,
    egressPolicy: desktopLocalEgressPolicy,
  });
  try {
    const { tools, resources, resourceTemplates, prompts, apps } = handle.catalog;
    return {
      version: 1,
      generatedAt: Date.now(),
      servers: { [serverName]: handle.catalog },
      tools,
      resources,
      resourceTemplates,
      prompts,
      apps,
    };
  } finally {
    await handle.close();
  }
}
