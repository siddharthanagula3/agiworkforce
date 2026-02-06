# MCP Server Development Guide

This guide covers how to develop, register, and troubleshoot custom MCP servers for AGI Workforce.

## Developing Custom Servers

To create a custom server, use the [MCP SDK](https://github.com/anthropics/model-context-protocol).

### Basic Typescript Server

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server(
  { name: 'weather-server', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'get_weather',
      description: 'Get weather for city',
      inputSchema: {
        type: 'object',
        properties: { city: { type: 'string' } },
      },
    },
  ],
}));

server.setRequestHandler('tools/call', async (request) => {
  if (request.params.name === 'get_weather') {
    return { content: [{ type: 'text', text: 'Sunny, 25C' }] };
  }
  throw new Error('Unknown tool');
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Python Server Example

```python
import json, sys

# ... Standard JSON-RPC 2.0 implementation reading from stdin ...
# See https://github.com/anthropics/model-context-protocol for Python SDK
```

## Registering Custom Servers

Register your server in `apps/desktop/src-tauri/mcp_config.json` or via code:

```typescript
await invoke('mcp_register_server', {
  name: 'my-server',
  command: 'node',
  args: ['/path/to/server.js'],
  env: { API_KEY: '...' },
});
```

## Troubleshooting

### Common Errors

| Error Code | Meaning | Solution |
| retention | ------- | -------- |
| `SERVER_NOT_FOUND` | Server logic not registered | Check `mcp_config.json` or registration call |
| `TOOL_NOT_FOUND` | Server running but tool missing | Verify `tools/list` handler in server code |
| `TIMEOUT` | Server took too long | Check if server is hung awaiting input |
| `JSON_RPC_ERROR` | Malformed communication | Ensure server uses stdio transport correctly |

### Debugging

1.  **Check Logs**: MCP server stderr is often captured in application logs.
2.  **Test Independence**: Run your server script in a terminal manually to ensure it accepts JSON-RPC over stdin/stdout.
