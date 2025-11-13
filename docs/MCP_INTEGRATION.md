# Model Context Protocol (MCP) Integration

## Overview

The AGI Workforce desktop application includes comprehensive Model Context Protocol (MCP) integration, allowing you to extend your AI agent's capabilities by connecting to third-party MCP servers. This document describes the architecture, features, and usage of the MCP system.

## What is MCP?

Model Context Protocol (MCP) is Anthropic's protocol for connecting AI models to external tools and data sources. It provides a standardized way for AI agents to:

- Access external APIs and services
- Read and manipulate data from various sources
- Execute specialized tools and automations
- Integrate with existing workflows

## Architecture

### Frontend Components

Located in `/apps/desktop/src/components/MCP/`:

1. **MCPServerManager.tsx** - Main management interface
   - View installed MCP servers
   - Start/stop/restart servers
   - Configure server settings (API keys, endpoints)
   - View server logs
   - Uninstall servers

2. **MCPServerBrowser.tsx** - Server discovery and installation
   - Browse the MCP server registry
   - Search by name, category, or tools
   - View server details and ratings
   - One-click installation
   - Categories: Automation, Data Access, Search, Productivity, Development

3. **MCPToolExplorer.tsx** - Tool browsing and testing
   - List all available tools from connected servers
   - Search and filter tools
   - View tool schemas (inputs/outputs)
   - Test tools with sample inputs
   - Mark tools as favorites
   - View usage statistics

4. **MCPConnectionStatus.tsx** - Real-time monitoring
   - Connection status for each server
   - Latency and performance metrics
   - Error messages and troubleshooting
   - Auto-reconnect capabilities
   - Uptime tracking

### Backend Modules

Located in `/apps/desktop/src-tauri/src/mcp/`:

1. **client.rs** - MCP protocol client implementation
   - Connect/disconnect from MCP servers
   - List available tools from servers
   - Execute tools with JSON-RPC
   - Manage server connections

2. **config.rs** - Configuration management
   - Load/save MCP server configurations
   - Credential injection from Windows Credential Manager
   - Default server configurations

3. **manager.rs** - Server lifecycle management
   - Start/stop/restart servers
   - Track server status (stopped, starting, running, stopping, error)
   - Auto-restart failed servers
   - Uptime and restart count tracking

4. **tool_executor.rs** - Tool execution with analytics
   - Execute tools with timeout support
   - Track execution history
   - Calculate statistics (success rate, avg duration)
   - Parallel tool execution
   - Performance metrics

5. **registry.rs** - Tool registry integration
   - Convert MCP tools to AGI tool schemas
   - Bridge MCP tools with AGI system
   - OpenAI function format conversion

6. **health.rs** - Health monitoring
   - Periodic health checks for all servers
   - Track server uptime and requests
   - Detect and report errors
   - Connection latency tracking

7. **events.rs** - Event emission
   - Server connection events
   - Tool execution events
   - System initialization events

### State Management

**Store**: `/apps/desktop/src/stores/mcpStore.ts`

Manages:
- List of installed servers
- Available tools from all servers
- Server configurations
- Connection status
- Statistics and metrics
- Search state

### API Client

**Client**: `/apps/desktop/src/api/mcp.ts`

TypeScript bindings for all MCP Tauri commands:
- `mcpInitialize()` - Initialize MCP system
- `mcpListServers()` - List all configured servers
- `mcpConnectServer(name)` - Connect to a server
- `mcpDisconnectServer(name)` - Disconnect from a server
- `mcpListTools()` - List all available tools
- `mcpSearchTools(query)` - Search for tools
- `mcpCallTool(toolId, args)` - Execute a tool
- `mcpGetConfig()` - Get current configuration
- `mcpUpdateConfig(config)` - Update configuration
- `mcpGetStats()` - Get server statistics
- `mcpStoreCredential(serverName, key, value)` - Store credentials securely
- `mcpGetToolSchemas()` - Get tool schemas for LLM function calling
- `mcpGetHealth()` - Get health status for all servers

## MCP Server Registry

The server registry (`/apps/desktop/src-tauri/mcp-registry.json`) contains metadata for popular MCP servers:

### Official Servers (by Anthropic)

1. **Filesystem Access** (`@modelcontextprotocol/server-filesystem`)
   - Read/write files
   - List directories
   - Safe file operations

2. **GitHub Integration** (`@modelcontextprotocol/server-github`)
   - Create issues and PRs
   - Search code
   - Manage repositories

3. **Playwright Browser Automation** (`@modelcontextprotocol/server-playwright`)
   - Navigate web pages
   - Click, type, screenshot
   - Execute JavaScript

4. **Google Drive** (`@modelcontextprotocol/server-gdrive`)
   - Access Drive files
   - Create/update documents
   - Search files

5. **Brave Search** (`@modelcontextprotocol/server-brave-search`)
   - Web search
   - Local search
   - Up-to-date information

6. **PostgreSQL** (`@modelcontextprotocol/server-postgres`)
   - Query databases
   - Execute SQL
   - Schema access

7. **Slack** (`@modelcontextprotocol/server-slack`)
   - Post messages
   - Read conversations
   - Manage channels

8. **Notion** (`@modelcontextprotocol/server-notion`)
   - Access pages and databases
   - Create/update notes
   - Search workspace

### Community Servers

- Google Maps
- Jira Integration
- And more...

## Configuration

### Server Configuration Format

MCP servers are configured in `mcp-servers-config.json`:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<from_credential_manager>"
      },
      "enabled": true
    }
  }
}
```

### Credential Storage

API keys and tokens are stored securely in Windows Credential Manager (via `keyring` crate), not in the configuration file. Use the `mcp_store_credential` command to save credentials:

```typescript
await McpClient.storeCredential('github', 'GITHUB_PERSONAL_ACCESS_TOKEN', 'ghp_...');
```

Credentials are automatically injected into server environments when connecting.

## Usage

### 1. Initialize MCP System

On app startup, the MCP system initializes automatically:

```typescript
import { useMcpStore } from '@/stores/mcpStore';

const { initialize } = useMcpStore();
await initialize();
```

This:
- Loads configuration from disk
- Injects credentials from Windows Credential Manager
- Connects to all enabled servers
- Starts health monitoring

### 2. Browse and Install Servers

```typescript
import { MCPServerBrowser } from '@/components/MCP';

function App() {
  return <MCPServerBrowser />;
}
```

Users can:
- Search the registry
- View server details
- Install with one click
- Configure API keys

### 3. Manage Servers

```typescript
import { MCPServerManager } from '@/components/MCP';

function App() {
  return <MCPServerManager />;
}
```

Users can:
- View installed servers
- Start/stop servers
- Configure settings
- View logs
- Uninstall servers

### 4. Explore Tools

```typescript
import { MCPToolExplorer } from '@/components/MCP';

function App() {
  return <MCPToolExplorer />;
}
```

Users can:
- Browse all available tools
- Search by name/description
- Test tools with sample inputs
- Mark favorites
- View usage statistics

### 5. Monitor Connections

```typescript
import { MCPConnectionStatus } from '@/components/MCP';

function App() {
  return <MCPConnectionStatus />;
}
```

Shows:
- Real-time connection status
- Latency metrics
- Error messages
- Uptime tracking
- Request counts

### 6. Execute Tools Programmatically

```typescript
const result = await McpClient.callTool('mcp_github_create_issue', {
  owner: 'username',
  repo: 'repository',
  title: 'Bug report',
  body: 'Description of the issue'
});
```

## AGI Integration

MCP tools are automatically integrated into the AGI system. When the AGI initializes, it:

1. Loads all tools from the tool registry
2. Calls `load_mcp_tools()` to add MCP tools
3. Makes MCP tools available for goal planning and execution

Example:

```rust
// In AGI initialization
let tool_registry = Arc::new(ToolRegistry::new()?);
tool_registry.register_all_tools(automation, router)?;
tool_registry.load_mcp_tools(mcp_registry).await?;
```

MCP tools are prefixed with `mcp_<server>_<tool>` to avoid conflicts with built-in tools.

## Tool Execution Flow

1. **User Request**: User asks AGI to perform a task
2. **Planning**: AGI planner identifies required tools (including MCP tools)
3. **Execution**: AGI executor calls tools in order
4. **MCP Tool Call**:
   - Parse tool ID to extract server and tool name
   - Call `McpClient.call_tool(server, tool, args)`
   - Track execution in `McpToolExecutor`
5. **Result**: Return result to AGI for next step

## Performance Metrics

The MCP system tracks:

- **Per-tool metrics**:
  - Total executions
  - Success/failure count
  - Average duration
  - Last execution timestamp

- **Per-server metrics**:
  - Connection status
  - Uptime
  - Total requests
  - Latency
  - Error rate

Access metrics via:
```typescript
const stats = await McpClient.getStats();
const health = await McpClient.getHealth();
```

## Error Handling

### Auto-Restart

Servers that crash are automatically restarted up to 3 times:

```rust
manager.auto_restart_failed_servers().await?;
```

### Connection Testing

Test connections before using:

```typescript
const healthy = await invoke('mcp_check_server_health', { serverName: 'github' });
```

### Error Types

- `ServerNotFound` - Server doesn't exist in configuration
- `ToolNotFound` - Tool doesn't exist on server
- `ConnectionFailed` - Failed to connect to server
- `ExecutionFailed` - Tool execution failed
- `ConfigurationError` - Invalid configuration

## Security

1. **Credential Storage**: API keys stored in Windows Credential Manager (DPAPI encryption)
2. **Sandboxing**: MCP servers run in separate processes
3. **Permission Prompts**: Users approve actions before execution (future enhancement)
4. **Audit Logging**: All tool executions are logged

## Development

### Adding a New Server to Registry

Edit `mcp-registry.json`:

```json
{
  "id": "my-server",
  "name": "My Custom Server",
  "version": "1.0.0",
  "category": "automation",
  "npm_package": "@myorg/mcp-server",
  "description": "Description of the server",
  "author": "Your Name",
  "tools": [
    {
      "name": "my_tool",
      "description": "What the tool does"
    }
  ],
  "configuration": {
    "required": ["API_KEY"],
    "optional": ["ENDPOINT"]
  }
}
```

### Testing MCP Integration

1. **Unit Tests**: Test individual modules
   ```bash
   cd apps/desktop/src-tauri
   cargo test mcp
   ```

2. **Integration Tests**: Test end-to-end flow
   ```bash
   pnpm --filter @agiworkforce/desktop test
   ```

3. **Manual Testing**: Use MCPToolExplorer to test tools

## Troubleshooting

### Server Won't Connect

1. Check server is installed: `npx @modelcontextprotocol/server-<name> --help`
2. Verify credentials are stored
3. Check logs in MCPServerManager
4. Test connection manually: `mcp_check_server_health`

### Tool Execution Fails

1. Verify server is running
2. Check tool parameters match schema
3. View execution history for errors
4. Test tool in MCPToolExplorer first

### Slow Performance

1. Check server latency in MCPConnectionStatus
2. Review most used tools for optimization
3. Consider parallel execution for independent tools
4. Check server resource usage

## Future Enhancements

1. **Custom Server Creation**: UI for creating custom MCP servers
2. **Server Templates**: Pre-configured templates for common use cases
3. **Tool Marketplace**: Community-contributed tools and servers
4. **Advanced Analytics**: Detailed performance dashboards
5. **Server Clustering**: Load balancing across multiple instances
6. **Caching**: Cache tool results for faster execution
7. **Rate Limiting**: Prevent API quota exhaustion
8. **Batch Operations**: Execute multiple tools efficiently

## Resources

- [MCP Specification](https://github.com/modelcontextprotocol/specification)
- [Official MCP Servers](https://github.com/modelcontextprotocol/servers)
- [Anthropic MCP Documentation](https://docs.anthropic.com/mcp)
- [AGI Workforce Documentation](../README.md)

## Support

For issues or questions:
- Open an issue on GitHub
- Check the troubleshooting section above
- Review MCP server documentation
- Check server health status in the app
