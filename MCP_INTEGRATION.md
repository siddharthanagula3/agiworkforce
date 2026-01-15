# MCP (Model Context Protocol) Integration Guide

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Getting Started](#getting-started)
4. [MCP Tools](#mcp-tools)
5. [Credential Management](#credential-management)
6. [Server Configuration](#server-configuration)
7. [Transport Types](#transport-types)
8. [MCP Registry](#mcp-registry)
9. [Common Operations](#common-operations)
10. [Troubleshooting](#troubleshooting)
11. [Adding New MCP Servers](#adding-new-mcp-servers)
12. [Advanced Topics](#advanced-topics)
13. [API Reference](#api-reference)

---

## Overview

The Model Context Protocol (MCP) enables AGI Workforce to connect AI systems with external tools and data sources through a standardized interface. MCP servers expose tools, resources, and prompts that can be invoked by the AGI system.

### Key Features

- **Dual Transport Support**: STDIO (local processes) and HTTP/SSE (remote servers)
- **Secure Credential Management**: AES-256-GCM encryption with machine-derived keys
- **OAuth Integration**: Automatic token refresh for GitHub, Google Drive, Slack
- **Health Monitoring**: Real-time server health checks and auto-recovery
- **Tool Registry**: Dynamic tool discovery and execution
- **Protocol Compliance**: Full JSON-RPC 2.0 and MCP specification support

### MCP Tool ID Format

MCP tools use a triple-colon delimiter format for safety and collision prevention:

```
mcp:::<server_name>:::<tool_name>
```

**Example**: `mcp:::github:::create_issue`

**Note**: The system automatically sanitizes server and tool names that contain `:::` by replacing with `_`.

---

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      AGI Workforce                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌────────────┐    ┌─────────────┐    ┌────────────────┐  │
│  │    AGI     │───▶│  MCP Tool   │───▶│  MCP Session  │  │
│  │  Planner   │    │  Registry   │    │               │  │
│  └────────────┘    └─────────────┘    └────────┬───────┘  │
│                                                 │          │
│                          ┌──────────────────────┴──────┐   │
│                          │                             │   │
│                   ┌──────▼──────┐            ┌────────▼────┐
│                   │   STDIO     │            │  HTTP/SSE   │
│                   │  Transport  │            │  Transport  │
│                   └──────┬──────┘            └────────┬────┘
└──────────────────────────┼───────────────────────────┼─────┘
                           │                           │
                  ┌────────▼────────┐         ┌────────▼────────┐
                  │  Local Process  │         │  Remote Server  │
                  │  MCP Server     │         │   MCP Server    │
                  │  (npx, python)  │         │ (http://...)    │
                  └─────────────────┘         └─────────────────┘
```

### Core Components

#### 1. **McpClient** (`core/mcp/client.rs`)

Central client for managing MCP server connections and tool invocations.

#### 2. **McpSession** (`core/mcp/session.rs`)

Represents an active connection to an MCP server with initialization and protocol handling.

#### 3. **McpToolRegistry** (`core/mcp/registry.rs`)

Manages tool discovery, schema conversion, and execution routing.

#### 4. **Transport Layer** (`core/mcp/transport.rs`)

Supports STDIO (local) and HTTP/SSE (remote) communication protocols.

#### 5. **Credential Manager** (`core/mcp/config.rs`)

Handles secure storage and injection of API keys and OAuth tokens.

---

## Getting Started

### Basic Initialization

MCP is automatically initialized when the application starts. To manually initialize:

```typescript
// Frontend (React/TypeScript)
import { invoke } from '@tauri-apps/api/tauri';

const result = await invoke<string>('mcp_initialize');
console.log(result); // "MCP initialized. Connected to 3 server(s) with 24 tool(s)"
```

### List Available Servers

```typescript
interface McpServerInfo {
  name: string;
  enabled: boolean;
  connected: boolean;
  toolCount: number;
  command: string;
}

const servers = await invoke<McpServerInfo[]>('mcp_list_servers');
console.log(servers);
```

### List Available Tools

```typescript
interface McpToolInfo {
  id: string; // "mcp:::github:::create_issue"
  name: string; // "create_issue"
  description: string; // "Create a GitHub issue"
  server: string; // "github"
  parameters: string[]; // ["title", "body", "repo"]
}

const tools = await invoke<McpToolInfo[]>('mcp_list_tools');
```

---

## MCP Tools

### Tool Discovery

Tools are automatically discovered when MCP servers connect. Each tool has:

- **ID**: Unique identifier in format `mcp:::<server>:::<tool>`
- **Name**: Human-readable tool name
- **Description**: What the tool does
- **Parameters**: JSON schema defining required/optional inputs
- **Capabilities**: File operations, network, etc.

### Executing Tools

```typescript
const result = await invoke('mcp_call_tool', {
  toolId: 'mcp:::github:::create_issue',
  arguments: {
    repo: 'owner/repo',
    title: 'Bug: Application crashes',
    body: 'Detailed description of the issue',
    labels: ['bug', 'high-priority'],
  },
});

console.log(result);
// {
//   content: [
//     { type: "text", text: "Issue created: #123" }
//   ]
// }
```

### Tool Execution with Timeout

```rust
// Rust backend
let result = tool_executor
    .execute_tool_with_timeout(
        "mcp:::filesystem:::read_file",
        arguments,
        Duration::from_secs(30)
    )
    .await?;
```

### Parallel Tool Execution

```rust
let executions = vec![
    ("mcp:::github:::list_issues".to_string(), args1),
    ("mcp:::github:::list_prs".to_string(), args2),
];

let results = tool_executor.execute_tools_parallel(executions).await;
```

### Tool Statistics

```typescript
// Get execution stats for a specific tool
const stats = await invoke('mcp_get_tool_stats', {
  toolId: 'mcp:::github:::create_issue',
});

// {
//   toolId: "mcp:::github:::create_issue",
//   totalExecutions: 145,
//   successfulExecutions: 142,
//   failedExecutions: 3,
//   avgDurationMs: 850.4,
//   lastExecution: 1705012345
// }
```

---

## Credential Management

### Security Architecture

Credentials are encrypted using AES-256-GCM with machine-derived keys:

1. **Machine Key**: Derived from hardware-specific identifiers
2. **Encryption**: Each credential encrypted with unique nonce
3. **Storage**: Stored in SQLite database (`settings_v2` table)
4. **Injection**: Automatically injected into environment variables at runtime

### Setting Credentials

```typescript
// Store a credential (encrypts and saves to database)
await invoke('mcp_set_credential', {
  serverName: 'github',
  key: 'GITHUB_PERSONAL_ACCESS_TOKEN',
  value: 'ghp_xxxxxxxxxxxx',
});
```

### OAuth Integration

The system supports automatic OAuth token management:

```json
{
  "github": {
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "<from_oauth:github>"
    }
  }
}
```

**Supported OAuth Providers**:

- `github` - GitHub Personal Access Token
- `google` - Google OAuth (Drive, etc.)
- `slack` - Slack Bot Token

**Automatic Features**:

- Token expiry detection (60-second buffer)
- Automatic refresh using refresh tokens
- Fallback to legacy credentials if OAuth unavailable

### Deleting Credentials

```typescript
await invoke('mcp_delete_credential', {
  serverName: 'github',
  key: 'GITHUB_PERSONAL_ACCESS_TOKEN',
});
```

### Credential Placeholders

Two types of placeholders are supported in configuration:

1. **OAuth**: `<from_oauth:provider>` - Auto-refreshing OAuth tokens
2. **Legacy**: `<from_credential_manager>` - Manual credentials

---

## Server Configuration

### Configuration File Location

**Path**: `~/.config/agiworkforce/mcp-servers-config.json` (macOS/Linux)
**Path**: `%APPDATA%\agiworkforce\mcp-servers-config.json` (Windows)

### Configuration Schema

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
      "env": {
        "API_KEY": "<from_credential_manager>"
      },
      "enabled": true,
      "transport": null
    }
  }
}
```

### STDIO Server Configuration

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

### HTTP/SSE Server Configuration

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

### Default Servers

The system includes preconfigured servers:

| Server         | Package                                   | Enabled by Default | Purpose                   |
| -------------- | ----------------------------------------- | ------------------ | ------------------------- |
| `filesystem`   | `@modelcontextprotocol/server-filesystem` | ✅ Yes             | Local file operations     |
| `git`          | `@modelcontextprotocol/server-git`        | ✅ Yes             | Git repository operations |
| `github`       | `@modelcontextprotocol/server-github`     | ✅ Yes             | GitHub API integration    |
| `google-drive` | `@modelcontextprotocol/server-gdrive`     | ❌ No              | Google Drive access       |
| `slack`        | `@modelcontextprotocol/server-slack`      | ❌ No              | Slack messaging           |
| `terminal`     | `@modelcontextprotocol/server-shell`      | ✅ Yes             | Shell command execution   |
| `stripe`       | `@modelcontextprotocol/server-stripe`     | ❌ No              | Stripe API operations     |

### Enabling/Disabling Servers

```typescript
// Enable a server
await invoke('mcp_enable_server', { name: 'slack' });

// Disable a server
await invoke('mcp_disable_server', { name: 'slack' });
```

### Updating Configuration

```typescript
const newConfig = {
  mcpServers: {
    'custom-server': {
      command: 'python',
      args: ['/path/to/server.py'],
      env: {},
      enabled: true,
    },
  },
};

await invoke('mcp_update_config', { newConfig });
```

---

## Transport Types

### STDIO Transport

**Use Case**: Local MCP servers running as child processes

**Features**:

- Process lifecycle management
- Automatic cleanup on disconnect
- Bidirectional stdin/stdout communication
- Stderr capture for logging
- Request timeout handling (30 seconds default)
- Automatic stale request cleanup (5 minutes)

**Example**:

```rust
let transport = StdioTransport::new(
    "filesystem".to_string(),
    "npx",
    &["-y", "@modelcontextprotocol/server-filesystem"].iter()
        .map(|s| s.to_string()).collect::<Vec<_>>(),
    &HashMap::new()
).await?;
```

**Process Management**:

- Spawned with piped stdin/stdout/stderr
- Graceful shutdown with process kill
- Automatic cleanup on `Drop`

### HTTP/SSE Transport

**Use Case**: Remote MCP servers accessed over HTTP

**Features**:

- RESTful JSON-RPC over HTTP POST
- Server-Sent Events (SSE) for server push
- Automatic reconnection (up to 5 attempts)
- Custom headers and authentication
- Configurable timeouts
- SSL certificate verification control

**Example**:

```rust
let config = HttpSseConfig {
    url: "https://mcp.example.com".to_string(),
    bearer_token: Some("token".to_string()),
    timeout_secs: 30,
    verify_ssl: true,
    ..Default::default()
};

let transport = HttpSseTransport::new("remote".to_string(), config).await?;
```

**HTTP Endpoints**:

- `POST /message` - Send JSON-RPC requests
- `GET /sse` - Receive server-sent events

**SSE Features**:

- Automatic reconnection with exponential backoff
- Event parsing (type, data, id)
- Notification support

---

## MCP Registry

### Available MCP Packages

The registry provides curated MCP servers:

```typescript
const packages = await invoke('mcp_get_registry');

// Returns:
// [
//   {
//     id: "mcp-filesystem",
//     name: "Filesystem",
//     version: "0.2.0",
//     description: "Secure access to local filesystem",
//     author: "Model Context Protocol",
//     category: "automation",
//     npmPackage: "@modelcontextprotocol/server-filesystem",
//     github: "https://github.com/modelcontextprotocol/servers",
//     tools: ["read_file", "write_file", "list_directory"],
//     rating: 4.9,
//     downloads: 45000,
//     installed: true
//   }
// ]
```

### Categories

- **automation** - File operations, shell commands
- **development** - Git, GitHub, code tools
- **data** - Databases, Google Drive, memory stores
- **productivity** - Slack, time utilities, calendars

### Official MCP Servers

| Package                                   | Description               | Tools                                 |
| ----------------------------------------- | ------------------------- | ------------------------------------- |
| `@modelcontextprotocol/server-filesystem` | File system operations    | read_file, write_file, list_directory |
| `@modelcontextprotocol/server-git`        | Git repository management | commit, push, pull, status            |
| `@modelcontextprotocol/server-github`     | GitHub integration        | create_issue, list_prs, read_file     |
| `@modelcontextprotocol/server-gdrive`     | Google Drive access       | drive_list, drive_read, drive_upload  |
| `@modelcontextprotocol/server-slack`      | Slack messaging           | post_message, list_channels           |
| `@modelcontextprotocol/server-postgres`   | PostgreSQL queries        | query, list_tables                    |
| `@modelcontextprotocol/server-memory`     | Knowledge graph storage   | store, retrieve                       |
| `@modelcontextprotocol/server-time`       | Time utilities            | get_current_time, convert_timezone    |
| `@modelcontextprotocol/server-stripe`     | Stripe API                | create_charge, list_customers         |

---

## Common Operations

### 1. Connect to a Server

```typescript
await invoke('mcp_connect_server', { name: 'github' });
```

### 2. Disconnect from a Server

```typescript
await invoke('mcp_disconnect_server', { name: 'github' });
```

### 3. Search for Tools

```typescript
const results = await invoke('mcp_search_tools', { query: 'create' });
// Returns tools with "create" in name or description
```

### 4. Get Server Health

```typescript
const health = await invoke('mcp_get_health');

// [
//   {
//     serverName: "github",
//     status: "healthy",
//     lastCheck: 1705012345,
//     responseTimeMs: 145,
//     isConnected: true,
//     errorCount: 0
//   }
// ]
```

### 5. Check Individual Server Health

```typescript
const health = await invoke('mcp_check_server_health', {
  serverName: 'github',
});
```

### 6. Get Server Logs

```typescript
const logs = await invoke('mcp_get_server_logs', {
  serverName: 'github',
  lines: 50, // Optional, defaults to 100
});

// [
//   "[10:34:12] [stderr] Server started",
//   "[10:34:13] Tool called: create_issue",
//   "[10:34:14] [sse notification] tools/list"
// ]
```

### 7. Get Tool Schemas for LLM

```typescript
const schemas = await invoke('mcp_get_tool_schemas');

// Returns OpenAI function calling format:
// [
//   {
//     type: "function",
//     function: {
//       name: "mcp:::github:::create_issue",
//       description: "Create a GitHub issue",
//       parameters: { /* JSON schema */ }
//     }
//   }
// ]
```

### 8. Get Server Statistics

```typescript
const stats = await invoke('mcp_get_stats');

// {
//   "github": 12,  // 12 tools available
//   "filesystem": 8,
//   "slack": 5
// }
```

---

## Troubleshooting

### Common Issues

#### 1. Server Won't Connect

**Symptoms**: Connection errors, timeout messages

**Solutions**:

```bash
# Check if npx is installed
npx --version

# Test server manually
npx -y @modelcontextprotocol/server-filesystem .

# Check server logs
const logs = await invoke('mcp_get_server_logs', {
  serverName: 'filesystem',
  lines: 100
});
```

**Common Causes**:

- Missing Node.js/npm
- Network issues (for remote servers)
- Invalid credentials
- Server process crash

#### 2. Credential Issues

**Symptoms**: Authentication errors, 401/403 responses

**Solutions**:

```typescript
// Re-set the credential
await invoke('mcp_set_credential', {
  serverName: 'github',
  key: 'GITHUB_PERSONAL_ACCESS_TOKEN',
  value: 'ghp_new_token',
});

// Restart the server
await invoke('mcp_disable_server', { name: 'github' });
await invoke('mcp_enable_server', { name: 'github' });
```

#### 3. Tool Execution Timeout

**Symptoms**: "Request timeout after 30 seconds"

**Solutions**:

- Increase timeout in transport config
- Check server logs for bottlenecks
- Verify network connectivity for remote servers

```json
{
  "transport": {
    "type": "http",
    "timeout_secs": 60 // Increase timeout
  }
}
```

#### 4. OAuth Token Expired

**Symptoms**: "OAuth token not available", 401 errors

**Solutions**:

- System automatically refreshes tokens (60s buffer)
- If refresh fails, re-authenticate via OAuth flow
- Check refresh token validity

**Manual Token Refresh**:

```typescript
// Delete old token
await invoke('mcp_delete_credential', {
  serverName: 'github',
  key: 'GITHUB_PERSONAL_ACCESS_TOKEN',
});

// Re-authenticate via OAuth (implementation-specific)
```

#### 5. Server Process Crash

**Symptoms**: "Transport connection lost", "Process killed"

**Solutions**:

```typescript
// Check server health
const health = await invoke('mcp_check_server_health', {
  serverName: 'filesystem',
});

// View crash logs
const logs = await invoke('mcp_get_server_logs', {
  serverName: 'filesystem',
  lines: 200,
});

// Restart server
await invoke('mcp_enable_server', { name: 'filesystem' });
```

### Debug Mode

Enable detailed logging:

```bash
# Set environment variable
RUST_LOG=mcp=debug,mcp_transport=trace

# Or in code
tracing::info!("MCP debug info");
```

### Health Monitoring

Health checks run automatically every 30 seconds:

```typescript
// Listen for health events
import { listen } from '@tauri-apps/api/event';

await listen('mcp:health', (event) => {
  console.log('Server health update:', event.payload);
});
```

### Error Codes

| Error            | Code                             | Cause                   |
| ---------------- | -------------------------------- | ----------------------- |
| Connection Error | `McpError::ConnectionError`      | Network/process failure |
| Server Not Found | `McpError::ServerNotFound`       | Server not in config    |
| Tool Not Found   | `McpError::ToolNotFound`         | Invalid tool ID         |
| Execution Error  | `McpError::ToolExecutionError`   | Tool returned error     |
| Timeout          | `McpError::ToolExecutionTimeout` | Exceeded timeout        |
| Invalid Config   | `McpError::InvalidConfig`        | Malformed config file   |

---

## Adding New MCP Servers

### Step 1: Create or Find an MCP Server

**Option A**: Use existing NPM package

```bash
# Browse official servers
https://github.com/modelcontextprotocol/servers

# Test locally
npx -y @modelcontextprotocol/server-postgres
```

**Option B**: Create custom server

```javascript
// server.js - Simple MCP server
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

const server = new Server(
  {
    name: 'my-custom-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Define tools
server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'my_tool',
      description: 'Does something useful',
      inputSchema: {
        type: 'object',
        properties: {
          input: { type: 'string' },
        },
      },
    },
  ],
}));

server.setRequestHandler('tools/call', async (request) => {
  // Implement tool logic
  return {
    content: [
      {
        type: 'text',
        text: 'Result',
      },
    ],
  };
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Step 2: Add to Configuration

#### Manual Configuration

Edit `~/.config/agiworkforce/mcp-servers-config.json`:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["/path/to/server.js"],
      "env": {
        "API_KEY": "<from_credential_manager>"
      },
      "enabled": true
    }
  }
}
```

#### Programmatic Configuration

```typescript
const config = await invoke('mcp_get_config');

config.mcpServers['my-server'] = {
  command: 'python',
  args: ['/path/to/server.py'],
  env: {},
  enabled: true,
};

await invoke('mcp_update_config', { newConfig: config });
```

### Step 3: Set Credentials (if needed)

```typescript
await invoke('mcp_set_credential', {
  serverName: 'my-server',
  key: 'API_KEY',
  value: 'secret-key-here',
});
```

### Step 4: Enable and Connect

```typescript
await invoke('mcp_enable_server', { name: 'my-server' });
```

### Step 5: Verify Connection

```typescript
const servers = await invoke('mcp_list_servers');
const myServer = servers.find((s) => s.name === 'my-server');

console.log(myServer.connected); // true
console.log(myServer.toolCount); // Number of tools
```

### Example: PostgreSQL Server

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"],
      "env": {
        "POSTGRES_PASSWORD": "<from_credential_manager>"
      },
      "enabled": true
    }
  }
}
```

### Example: Custom Python Server

```json
{
  "mcpServers": {
    "ml-model": {
      "command": "python",
      "args": ["-m", "ml_mcp_server", "--model-path", "/models/bert"],
      "env": {
        "CUDA_VISIBLE_DEVICES": "0"
      },
      "enabled": true
    }
  }
}
```

### Example: Remote HTTP Server

```json
{
  "mcpServers": {
    "company-api": {
      "command": "",
      "args": [],
      "env": {},
      "enabled": true,
      "transport": {
        "type": "http",
        "url": "https://mcp.company.com",
        "bearer_token": "<from_credential_manager>",
        "headers": {
          "X-API-Version": "v2"
        },
        "timeout_secs": 45,
        "verify_ssl": true
      }
    }
  }
}
```

---

## Advanced Topics

### Custom Transport Implementation

Implement the `McpTransport` trait for custom communication:

```rust
use async_trait::async_trait;
use crate::core::mcp::{McpResult, transport::McpTransport};

pub struct CustomTransport {
    // Your transport state
}

#[async_trait]
impl McpTransport for CustomTransport {
    async fn send_request(
        &self,
        method: String,
        params: Option<serde_json::Value>,
    ) -> McpResult<JsonRpcResponse> {
        // Implement request sending
    }

    fn send_notification(&self, method: String, params: Option<serde_json::Value>) {
        // Implement notification sending
    }

    fn is_alive(&self) -> bool {
        // Check connection status
    }

    async fn shutdown(&self) -> McpResult<()> {
        // Clean up resources
    }
}
```

### Protocol Extensions

MCP supports custom protocol extensions via notifications:

```rust
// Send custom notification
session.transport.send_notification(
    "custom/myExtension".to_string(),
    Some(serde_json::json!({
        "data": "value"
    }))
);
```

### Resource Management

Access MCP resources (not just tools):

```rust
// List resources
let resources = session.list_resources().await?;

// Read a resource
let content = session.read_resource("file:///path/to/resource").await?;
```

### Batch Operations

Execute multiple tools efficiently:

```rust
let batch = vec![
    ("mcp:::github:::list_issues", args1),
    ("mcp:::github:::list_prs", args2),
    ("mcp:::github:::get_repo", args3),
];

let results = executor.execute_tools_parallel(batch).await;
```

### Event System

Listen for MCP events:

```typescript
import { listen } from '@tauri-apps/api/event';

// System initialized
await listen('mcp:system_initialized', (event) => {
  console.log('MCP ready:', event.payload);
});

// Server connection changed
await listen('mcp:server_connection_changed', (event) => {
  const { serverName, connected, error } = event.payload;
  console.log(`${serverName}: ${connected ? 'connected' : 'disconnected'}`);
});

// Tool execution started
await listen('mcp:tool_execution_started', (event) => {
  const { toolId, serverName } = event.payload;
  console.log(`Executing ${toolId} on ${serverName}`);
});

// Tool execution completed
await listen('mcp:tool_execution_completed', (event) => {
  const { toolId, success, durationMs } = event.payload;
  console.log(`${toolId}: ${success ? 'OK' : 'FAILED'} (${durationMs}ms)`);
});

// Tools updated
await listen('mcp:tools_updated', (event) => {
  const { serverName, toolCount } = event.payload;
  console.log(`${serverName} now has ${toolCount} tools`);
});

// Health check
await listen('mcp:health', (event) => {
  console.log('Health status:', event.payload);
});
```

### Performance Optimization

#### Connection Pooling

MCP sessions are automatically pooled and reused:

```rust
// Sessions are managed by McpClient
let client = Arc::new(McpClient::new());

// Multiple calls reuse the same session
client.call_tool("github", "list_issues", args1).await?;
client.call_tool("github", "create_issue", args2).await?;
```

#### Tool Caching

Tools are cached after first discovery:

```rust
// First call fetches from server
let tools = client.list_server_tools("github")?;

// Subsequent calls use cache
let tools = client.list_server_tools("github")?; // Instant

// Refresh cache if needed
let tools = client.refresh_server_tools("github").await?;
```

#### Request Deduplication

Pending requests are automatically managed:

```rust
// Concurrent calls to same tool are handled efficiently
tokio::spawn(async {
    client.call_tool("github", "list_issues", args.clone()).await
});
tokio::spawn(async {
    client.call_tool("github", "list_issues", args.clone()).await
});
// Only sends one request to server
```

### Security Best Practices

1. **Credential Rotation**

   ```typescript
   // Rotate credentials periodically
   await invoke('mcp_set_credential', {
     serverName: 'api',
     key: 'API_KEY',
     value: generateNewKey(),
   });
   ```

2. **Least Privilege**
   - Only enable servers you need
   - Use read-only tokens when possible
   - Restrict file system access paths

3. **Network Security**
   - Use HTTPS for remote servers
   - Enable SSL verification
   - Use bearer tokens over API keys

4. **Audit Logging**
   ```rust
   // All tool executions are logged
   tracing::info!("Tool executed: {} by user {}", tool_id, user_id);
   ```

---

## API Reference

### Rust API

#### McpClient

```rust
pub struct McpClient {
    // Thread-safe MCP client
}

impl McpClient {
    pub fn new() -> Self;

    pub async fn connect_server(
        &self,
        name: String,
        config: McpServerConfig
    ) -> McpResult<()>;

    pub async fn disconnect_server(&self, name: &str) -> McpResult<()>;

    pub fn list_servers(&self) -> Vec<String>;

    pub fn list_all_tools(&self) -> Vec<(String, McpTool)>;

    pub fn list_server_tools(&self, server_name: &str) -> McpResult<Vec<McpTool>>;

    pub async fn call_tool(
        &self,
        server_name: &str,
        tool_name: &str,
        arguments: Value
    ) -> McpResult<Value>;

    pub fn search_tools(&self, query: &str) -> Vec<(String, McpTool)>;

    pub fn health_check(&self) -> HashMap<String, bool>;
}
```

#### McpToolRegistry

```rust
pub struct McpToolRegistry {
    // Tool discovery and execution
}

impl McpToolRegistry {
    pub fn new(client: Arc<McpClient>) -> Self;

    pub fn get_all_tool_schemas(&self) -> Vec<Tool>;

    pub async fn execute_tool(
        &self,
        tool_id: &str,
        arguments: HashMap<String, Value>
    ) -> McpResult<Value>;

    pub fn search_tools(&self, query: &str) -> Vec<Tool>;

    pub fn get_tool(&self, tool_id: &str) -> McpResult<Tool>;

    pub fn get_all_openai_functions(&self) -> Vec<Value>;
}
```

#### McpSession

```rust
pub struct McpSession {
    // Active MCP server session
}

impl McpSession {
    pub async fn connect(
        name: String,
        config: McpServerConfig
    ) -> McpResult<Self>;

    pub async fn initialize(&self) -> McpResult<InitializeResult>;

    pub async fn list_tools(&self) -> McpResult<Vec<McpToolDefinition>>;

    pub async fn call_tool(
        &self,
        tool_name: &str,
        arguments: HashMap<String, Value>
    ) -> McpResult<ToolCallResult>;

    pub async fn list_resources(&self) -> McpResult<Vec<ResourceDefinition>>;

    pub async fn read_resource(&self, uri: &str) -> McpResult<ResourceReadResult>;

    pub fn is_alive(&self) -> bool;

    pub async fn shutdown(&self) -> McpResult<()>;
}
```

### TypeScript API

```typescript
// Initialize MCP system
function mcp_initialize(): Promise<string>;

// Server management
function mcp_list_servers(): Promise<McpServerInfo[]>;
function mcp_connect_server(name: string): Promise<string>;
function mcp_disconnect_server(name: string): Promise<string>;
function mcp_enable_server(name: string): Promise<string>;
function mcp_disable_server(name: string): Promise<string>;

// Tool operations
function mcp_list_tools(): Promise<McpToolInfo[]>;
function mcp_search_tools(query: string): Promise<McpToolInfo[]>;
function mcp_call_tool(toolId: string, arguments: Record<string, any>): Promise<any>;
function mcp_get_tool_schemas(): Promise<any[]>;

// Credential management
function mcp_set_credential(serverName: string, key: string, value: string): Promise<string>;
function mcp_delete_credential(serverName: string, key: string): Promise<string>;

// Configuration
function mcp_get_config(): Promise<any>;
function mcp_update_config(newConfig: any): Promise<string>;

// Health and monitoring
function mcp_get_health(): Promise<ServerHealth[]>;
function mcp_check_server_health(serverName: string): Promise<ServerHealth>;
function mcp_get_server_logs(serverName: string, lines?: number): Promise<string[]>;
function mcp_get_stats(): Promise<Record<string, number>>;

// Registry
function mcp_get_registry(): Promise<RegistryPackage[]>;
```

---

## Configuration Reference

### Environment Variables

| Variable          | Description        | Example                         |
| ----------------- | ------------------ | ------------------------------- |
| `RUST_LOG`        | Logging level      | `mcp=debug,mcp_transport=trace` |
| `MCP_CONFIG_PATH` | Custom config path | `/custom/path/config.json`      |

### Config File Schema

```typescript
interface McpServersConfig {
  mcpServers: {
    [serverName: string]: {
      command: string;
      args: string[];
      env: { [key: string]: string };
      enabled: boolean;
      transport?: {
        type: 'stdio' | 'http';
        url?: string;
        api_key?: string;
        bearer_token?: string;
        headers?: { [key: string]: string };
        timeout_secs?: number;
        verify_ssl?: boolean;
      };
    };
  };
}
```

### Database Schema

Credentials are stored in the `settings_v2` table:

```sql
CREATE TABLE settings_v2 (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  category TEXT,
  encrypted INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

-- MCP credentials
-- key format: mcp_credential_{server_name}_{key_name}
-- Example: mcp_credential_github_GITHUB_PERSONAL_ACCESS_TOKEN

-- OAuth tokens
-- key format: mcp_oauth_{provider}_{type}
-- Example: mcp_oauth_github_access_token
-- Example: mcp_oauth_github_refresh_token
-- Example: mcp_oauth_github_expires_at
```

---

## Resources

### Official Documentation

- [MCP Specification](https://modelcontextprotocol.io/specification)
- [MCP SDK TypeScript](https://github.com/modelcontextprotocol/typescript-sdk)
- [Official MCP Servers](https://github.com/modelcontextprotocol/servers)

### Community Resources

- [MCP Discord](https://discord.gg/modelcontextprotocol)
- [Example Servers](https://github.com/modelcontextprotocol/servers/tree/main/src)

### Internal Files

- `/apps/desktop/src-tauri/src/core/mcp/` - MCP implementation
- `/apps/desktop/src-tauri/src/sys/commands/mcp.rs` - Tauri commands
- `/apps/desktop/src-tauri/mcp/default_servers.json` - Default config

---

## Changelog

### Version 2024-11-05

- Switched to triple-colon tool ID delimiter (`mcp:::server:::tool`)
- Added HTTP/SSE transport support
- Implemented OAuth token auto-refresh
- Added comprehensive health monitoring
- Improved error handling and logging

---

## Support

For issues and questions:

1. Check [Troubleshooting](#troubleshooting) section
2. Review server logs via `mcp_get_server_logs`
3. Enable debug logging with `RUST_LOG=mcp=debug`
4. Create issue on GitHub with logs and reproduction steps
