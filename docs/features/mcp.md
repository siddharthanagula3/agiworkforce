# MCP Integration

Model Context Protocol (MCP) provides an extensible tool ecosystem for AI capabilities.

## Overview

MCP enables the AI to use external tools and services. Users never see "MCP" - they simply describe what they want:

- "Search my email for receipts"
- "Create a GitHub issue"
- "Query my database"

The system automatically uses the appropriate MCP tools behind the scenes.

## Pre-configured Servers

| Server         | Capabilities                       |
| -------------- | ---------------------------------- |
| **Supabase**   | Database queries, table management |
| **GitHub**     | Issues, PRs, repositories          |
| **Filesystem** | Local file operations              |
| **Context7**   | Documentation lookup               |
| **Vercel**     | Deployment management              |

## How It Works

### Automatic Tool Discovery

```
User: "Create a GitHub issue for this bug"
     |
     v
Intent detected: GitHub operation
     |
     v
MCP GitHub server started (if not running)
     |
     v
Tool discovered: github_create_issue
     |
     v
Tool executed with parameters
     |
     v
Result returned to user
```

### Tool ID Format

```
mcp__{server_name}__{tool_name}

Example: mcp__github__create_issue
```

## Adding Custom Servers

### Via Settings UI

1. Go to Settings → MCP Servers
2. Click "Add Server"
3. Enter server command and arguments
4. Configure credentials if required

### Programmatically

```typescript
await invoke('mcp_register_server', {
  name: 'my-server',
  command: 'npx',
  args: ['-y', '@my/mcp-server'],
  env: {
    API_KEY: 'secret',
  },
});
```

## Credential Management

Credentials are stored securely in the OS keyring:

```typescript
// Store credential
await invoke('mcp_set_credential', {
  serverName: 'github',
  key: 'token',
  value: 'ghp_...',
});

// Retrieve credential
const token = await invoke('mcp_get_credential', {
  serverName: 'github',
  key: 'token',
});
```

### Supported Keyring Backends

| OS      | Backend            |
| ------- | ------------------ |
| macOS   | Keychain           |
| Windows | Credential Manager |
| Linux   | Secret Service     |

## Protocol Details

### Transport Types

| Type     | Use Case                     |
| -------- | ---------------------------- |
| STDIO    | Local servers (npm packages) |
| HTTP/SSE | Remote servers               |

### Message Format

MCP uses JSON-RPC 2.0:

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "create_issue",
    "arguments": {
      "repo": "owner/repo",
      "title": "Bug report"
    }
  },
  "id": 1
}
```

## Example: GitHub Integration

### Create Issue

```typescript
await invoke('mcp_call_tool', {
  toolId: 'mcp__github__create_issue',
  arguments: {
    repo: 'owner/repo',
    title: 'New feature request',
    body: 'Description of the feature',
    labels: ['enhancement'],
  },
});
```

### List Pull Requests

```typescript
await invoke('mcp_call_tool', {
  toolId: 'mcp__github__list_prs',
  arguments: {
    repo: 'owner/repo',
    state: 'open',
  },
});
```

## Example: Database Integration

### Query Data

```typescript
await invoke('mcp_call_tool', {
  toolId: 'mcp__supabase__query',
  arguments: {
    table: 'users',
    select: '*',
    filters: { status: 'active' },
  },
});
```

## Error Handling

MCP errors are translated to user-friendly messages:

| MCP Error          | User Message                             |
| ------------------ | ---------------------------------------- |
| `SERVER_NOT_FOUND` | "I couldn't connect to that service"     |
| `AUTH_REQUIRED`    | "I need permission to access that"       |
| `TOOL_FAILED`      | "Something went wrong. Let me try again" |

## Developing Custom Servers

See the [MCP SDK documentation](https://github.com/anthropics/model-context-protocol) for creating custom servers.

### Basic Server Structure

```typescript
import { Server } from '@modelcontextprotocol/sdk';

const server = new Server({
  name: 'my-server',
  version: '1.0.0',
});

server.tool('my_tool', {
  description: 'Does something useful',
  inputSchema: {
    type: 'object',
    properties: {
      param: { type: 'string' },
    },
  },
  handler: async ({ param }) => {
    return { result: `Processed: ${param}` };
  },
});

server.start();
```

## Related Documentation

- [Agent Mode](agent-mode.md) - Uses MCP tools
- [Architecture](../../ARCHITECTURE.md#mcp-integration) - Technical details
