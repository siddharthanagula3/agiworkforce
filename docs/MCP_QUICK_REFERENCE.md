# MCP Quick Reference Guide

Quick reference for Model Context Protocol integration in AGI Workforce.

## Tool ID Format

```
mcp:::<server_name>:::<tool_name>
```

Example: `mcp:::github:::create_issue`

## Common Commands (TypeScript)

### Initialization

```typescript
import { invoke } from '@tauri-apps/api/tauri';

// Initialize MCP system
await invoke('mcp_initialize');
```

### Server Management

```typescript
// List all servers
const servers = await invoke('mcp_list_servers');

// Connect to server
await invoke('mcp_connect_server', { name: 'github' });

// Disconnect from server
await invoke('mcp_disconnect_server', { name: 'github' });

// Enable server
await invoke('mcp_enable_server', { name: 'slack' });

// Disable server
await invoke('mcp_disable_server', { name: 'slack' });
```

### Tool Operations

```typescript
// List all tools
const tools = await invoke('mcp_list_tools');

// Search for tools
const results = await invoke('mcp_search_tools', { query: 'create' });

// Execute tool
const result = await invoke('mcp_call_tool', {
  toolId: 'mcp:::github:::create_issue',
  arguments: {
    repo: 'owner/repo',
    title: 'Bug report',
    body: 'Description',
  },
});

// Get tool schemas (OpenAI format)
const schemas = await invoke('mcp_get_tool_schemas');
```

### Credentials

```typescript
// Set credential
await invoke('mcp_set_credential', {
  serverName: 'github',
  key: 'GITHUB_PERSONAL_ACCESS_TOKEN',
  value: 'ghp_xxxxxxxxxxxx',
});

// Delete credential
await invoke('mcp_delete_credential', {
  serverName: 'github',
  key: 'GITHUB_PERSONAL_ACCESS_TOKEN',
});
```

### Configuration

```typescript
// Get current config
const config = await invoke('mcp_get_config');

// Update config
await invoke('mcp_update_config', { newConfig });
```

### Health & Monitoring

```typescript
// Get health of all servers
const health = await invoke('mcp_get_health');

// Check specific server health
const serverHealth = await invoke('mcp_check_server_health', {
  serverName: 'github',
});

// Get server logs
const logs = await invoke('mcp_get_server_logs', {
  serverName: 'github',
  lines: 50,
});

// Get statistics
const stats = await invoke('mcp_get_stats');
```

### Registry

```typescript
// Get available MCP packages
const packages = await invoke('mcp_get_registry');
```

## Events (TypeScript)

```typescript
import { listen } from '@tauri-apps/api/event';

// System initialized
await listen('mcp:system_initialized', (event) => {
  console.log('Server count:', event.payload.serverCount);
  console.log('Tool count:', event.payload.toolCount);
});

// Server connection changed
await listen('mcp:server_connection_changed', (event) => {
  console.log('Server:', event.payload.serverName);
  console.log('Connected:', event.payload.connected);
  console.log('Error:', event.payload.error);
});

// Tool execution started
await listen('mcp:tool_execution_started', (event) => {
  console.log('Tool:', event.payload.toolId);
  console.log('Server:', event.payload.serverName);
});

// Tool execution completed
await listen('mcp:tool_execution_completed', (event) => {
  console.log('Tool:', event.payload.toolId);
  console.log('Success:', event.payload.success);
  console.log('Duration:', event.payload.durationMs, 'ms');
});

// Tools updated
await listen('mcp:tools_updated', (event) => {
  console.log('Server:', event.payload.serverName);
  console.log('Tool count:', event.payload.toolCount);
});

// Health check
await listen('mcp:health', (event) => {
  console.log('Health status:', event.payload);
});
```

## Configuration (JSON)

### STDIO Server (Local Process)

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
      "env": {},
      "enabled": true
    }
  }
}
```

### HTTP/SSE Server (Remote)

```json
{
  "mcpServers": {
    "remote-api": {
      "command": "",
      "args": [],
      "env": {},
      "enabled": true,
      "transport": {
        "type": "http",
        "url": "https://mcp.example.com",
        "bearer_token": "<from_credential_manager>",
        "headers": {
          "X-Custom-Header": "value"
        },
        "timeout_secs": 30,
        "verify_ssl": true
      }
    }
  }
}
```

### With OAuth

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<from_oauth:github>"
      },
      "enabled": true
    }
  }
}
```

### With Manual Credentials

```json
{
  "mcpServers": {
    "stripe": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-stripe"],
      "env": {
        "STRIPE_SECRET_KEY": "<from_credential_manager>"
      },
      "enabled": false
    }
  }
}
```

## Rust API

### McpClient

```rust
use std::sync::Arc;
use crate::core::mcp::{McpClient, McpServerConfig};

// Create client
let client = Arc::new(McpClient::new());

// Connect to server
client.connect_server("github".to_string(), config).await?;

// List tools
let tools = client.list_all_tools();

// Call tool
let result = client.call_tool("github", "create_issue", args).await?;

// Disconnect
client.disconnect_server("github").await?;
```

### McpToolRegistry

```rust
use crate::core::mcp::McpToolRegistry;

let registry = Arc::new(McpToolRegistry::new(client.clone()));

// Get all tool schemas
let schemas = registry.get_all_tool_schemas();

// Execute tool
let result = registry.execute_tool("mcp:::github:::create_issue", args).await?;

// Search tools
let results = registry.search_tools("create");
```

### McpSession

```rust
use crate::core::mcp::{McpSession, McpServerConfig};

// Connect
let session = McpSession::connect("github".to_string(), config).await?;

// Initialize
let init_result = session.initialize().await?;

// List tools
let tools = session.list_tools().await?;

// Call tool
let result = session.call_tool("create_issue", args).await?;

// Shutdown
session.shutdown().await?;
```

### McpToolExecutor

```rust
use crate::core::mcp::McpToolExecutor;
use std::time::Duration;

let executor = McpToolExecutor::new(client.clone());

// Execute with timeout
let result = executor
    .execute_tool_with_timeout(
        "mcp:::github:::create_issue",
        args,
        Duration::from_secs(30)
    )
    .await?;

// Parallel execution
let results = executor.execute_tools_parallel(vec![
    ("mcp:::github:::list_issues".to_string(), args1),
    ("mcp:::github:::list_prs".to_string(), args2),
]).await;

// Get statistics
let stats = executor.get_tool_stats("mcp:::github:::create_issue");
```

## Error Types

```rust
pub enum McpError {
    ConnectionError(String),      // Network/process failure
    ServerNotFound(String),        // Server not in config
    ToolNotFound(String),          // Invalid tool ID
    ToolExecutionError(String),    // Tool returned error
    ToolExecutionTimeout(String),  // Exceeded timeout
    InitializationTimeout(String), // Init timed out
    InvalidConfig(String),         // Malformed config
    JsonError(serde_json::Error),  // JSON parsing error
    IoError(std::io::Error),       // I/O error
    RmcpError(String),             // Remote MCP error
}
```

## Default Servers

| Server         | Package                                   | Enabled | Purpose         |
| -------------- | ----------------------------------------- | ------- | --------------- |
| `filesystem`   | `@modelcontextprotocol/server-filesystem` | ✅      | File operations |
| `git`          | `@modelcontextprotocol/server-git`        | ✅      | Git operations  |
| `github`       | `@modelcontextprotocol/server-github`     | ✅      | GitHub API      |
| `google-drive` | `@modelcontextprotocol/server-gdrive`     | ❌      | Google Drive    |
| `slack`        | `@modelcontextprotocol/server-slack`      | ❌      | Slack messaging |
| `terminal`     | `@modelcontextprotocol/server-shell`      | ✅      | Shell commands  |
| `stripe`       | `@modelcontextprotocol/server-stripe`     | ❌      | Stripe API      |

## Common Tool IDs

### Filesystem

- `mcp:::filesystem:::read_file`
- `mcp:::filesystem:::write_file`
- `mcp:::filesystem:::list_directory`
- `mcp:::filesystem:::create_directory`
- `mcp:::filesystem:::delete_file`

### GitHub

- `mcp:::github:::create_issue`
- `mcp:::github:::list_issues`
- `mcp:::github:::list_prs`
- `mcp:::github:::read_file`
- `mcp:::github:::create_pr`

### Git

- `mcp:::git:::commit`
- `mcp:::git:::push`
- `mcp:::git:::pull`
- `mcp:::git:::status`
- `mcp:::git:::diff`

### Slack

- `mcp:::slack:::post_message`
- `mcp:::slack:::list_channels`
- `mcp:::slack:::get_channel_history`

## Environment Variables

```bash
# Enable debug logging
export RUST_LOG=mcp=debug,mcp_transport=trace

# Custom config path
export MCP_CONFIG_PATH=/custom/path/config.json
```

## File Locations

### Config File

- **macOS/Linux**: `~/.config/agiworkforce/mcp-servers-config.json`
- **Windows**: `%APPDATA%\agiworkforce\mcp-servers-config.json`

### Database

- **macOS/Linux**: `~/.config/agiworkforce/agiworkforce.db`
- **Windows**: `%APPDATA%\agiworkforce\agiworkforce.db`

### Logs

- Check via `mcp_get_server_logs` command
- Stdout/stderr from MCP servers

## Quick Diagnostics

```typescript
// Check system status
async function quickCheck() {
  const servers = await invoke('mcp_list_servers');
  const connected = servers.filter((s) => s.connected).length;
  const tools = (await invoke('mcp_list_tools')).length;

  console.log(`Servers: ${connected}/${servers.length}`);
  console.log(`Tools: ${tools}`);

  const health = await invoke('mcp_get_health');
  const unhealthy = health.filter((h) => h.status !== 'healthy');

  if (unhealthy.length > 0) {
    console.warn(
      'Unhealthy servers:',
      unhealthy.map((h) => h.serverName),
    );
  }
}
```

## Common Patterns

### Error Handling

```typescript
try {
  const result = await invoke('mcp_call_tool', { toolId, arguments });
} catch (error) {
  if (error.includes('401')) {
    // Handle authentication error
  } else if (error.includes('timeout')) {
    // Handle timeout
  } else {
    // Handle other errors
  }
}
```

### Retry Logic

```typescript
async function retry(fn, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === attempts - 1) throw error;
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
}
```

### Parallel Execution

```typescript
const results = await Promise.all([
  invoke('mcp_call_tool', { toolId: 'mcp:::github:::list_issues', arguments: {} }),
  invoke('mcp_call_tool', { toolId: 'mcp:::github:::list_prs', arguments: {} }),
]);
```

## Best Practices

1. **Always handle errors** - Network calls can fail
2. **Use timeouts** - Prevent hanging operations
3. **Monitor health** - React to connection issues
4. **Validate arguments** - Check required parameters
5. **Log execution** - Debug issues efficiently
6. **Cache when possible** - Reduce redundant calls
7. **Batch operations** - Use parallel execution
8. **Clean up resources** - Disconnect when done
9. **Secure credentials** - Never log sensitive data
10. **Test error paths** - Handle edge cases

## Useful Links

- [Full Documentation](../MCP_INTEGRATION.md)
- [Examples](MCP_EXAMPLES.md)
- [Troubleshooting](MCP_TROUBLESHOOTING.md)
- [MCP Specification](https://modelcontextprotocol.io/specification)
- [Official Servers](https://github.com/modelcontextprotocol/servers)

## Version Info

- **MCP Protocol Version**: 2024-11-05
- **Tool ID Format**: Triple-colon delimiter (`:::`)
- **Transport Types**: STDIO, HTTP/SSE
- **Credential Encryption**: AES-256-GCM
- **OAuth Support**: GitHub, Google, Slack
