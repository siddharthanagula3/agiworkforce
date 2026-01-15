# MCP Server Development Guide

Complete guide for creating custom MCP servers for AGI Workforce.

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Server Implementation](#server-implementation)
4. [Tool Design](#tool-design)
5. [Testing](#testing)
6. [Integration](#integration)
7. [Publishing](#publishing)
8. [Best Practices](#best-practices)

---

## Overview

### What is an MCP Server?

An MCP (Model Context Protocol) server exposes tools, resources, and prompts that AI systems can use. It acts as a bridge between the AI and external systems, APIs, or data sources.

### Server Components

- **Tools**: Functions the AI can call with parameters
- **Resources**: Data sources the AI can read (optional)
- **Prompts**: Template prompts for common operations (optional)
- **Transport**: Communication mechanism (STDIO or HTTP)

### Supported Transports

1. **STDIO** (Standard Input/Output)
   - For local processes
   - Spawned as child process
   - JSON-RPC over stdin/stdout

2. **HTTP/SSE** (Server-Sent Events)
   - For remote servers
   - HTTP POST for requests
   - SSE for server push

---

## Getting Started

### Prerequisites

**For Node.js/TypeScript Servers**:

```bash
node --version  # v18+ or v20+
npm --version
```

**For Python Servers**:

```bash
python --version  # 3.8+
pip --version
```

### Choose Your Stack

#### Option 1: TypeScript SDK (Recommended)

```bash
# Create new project
mkdir my-mcp-server
cd my-mcp-server
npm init -y

# Install MCP SDK
npm install @modelcontextprotocol/sdk
npm install -D typescript @types/node tsx

# Create tsconfig.json
npx tsc --init
```

#### Option 2: Python Implementation

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install dependencies
pip install asyncio json-rpc
```

#### Option 3: Rust Implementation

```bash
cargo new my-mcp-server
cd my-mcp-server

# Add dependencies to Cargo.toml
# [dependencies]
# tokio = { version = "1", features = ["full"] }
# serde = { version = "1", features = ["derive"] }
# serde_json = "1"
```

---

## Server Implementation

### TypeScript/Node.js Server

#### Basic Structure

```typescript
// server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// Define server
const server = new Server(
  {
    name: 'my-custom-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {}, // Optional
      prompts: {}, // Optional
    },
  },
);

// Initialize handler
server.setRequestHandler('initialize', async (request) => {
  return {
    protocolVersion: '2024-11-05',
    capabilities: server.capabilities,
    serverInfo: {
      name: 'my-custom-server',
      version: '1.0.0',
    },
  };
});

// Tools list handler
server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'my_tool',
      description: 'Does something useful',
      inputSchema: {
        type: 'object',
        properties: {
          input: {
            type: 'string',
            description: 'Input text',
          },
        },
        required: ['input'],
      },
    },
  ],
}));

// Tool call handler
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'my_tool') {
    const result = await myToolImplementation(args.input);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result),
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Server running on stdio');
}

main().catch(console.error);
```

#### With Zod Validation

```typescript
import { z } from 'zod';

// Define schemas
const MyToolSchema = z.object({
  input: z.string().min(1).describe('Input text'),
  options: z
    .object({
      format: z.enum(['json', 'text']).optional(),
      verbose: z.boolean().optional(),
    })
    .optional(),
});

type MyToolInput = z.infer<typeof MyToolSchema>;

// Use in handler
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'my_tool') {
    // Validate input
    const input = MyToolSchema.parse(args);

    // Process
    const result = await processInput(input);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result),
        },
      ],
    };
  }
});
```

### Python Server

#### Basic Structure

```python
#!/usr/bin/env python3
# server.py

import json
import sys
from typing import Any, Dict, Optional

class MCPServer:
    def __init__(self, name: str, version: str):
        self.name = name
        self.version = version
        self.tools = []

    def add_tool(self, name: str, description: str, input_schema: Dict):
        """Register a tool"""
        self.tools.append({
            "name": name,
            "description": description,
            "inputSchema": input_schema
        })

    def send_response(self, result: Any, request_id: Any):
        """Send JSON-RPC response"""
        response = {
            "jsonrpc": "2.0",
            "result": result,
            "id": request_id
        }
        print(json.dumps(response), flush=True)

    def send_error(self, message: str, code: int, request_id: Any):
        """Send JSON-RPC error"""
        error = {
            "jsonrpc": "2.0",
            "error": {
                "code": code,
                "message": message
            },
            "id": request_id
        }
        print(json.dumps(error), flush=True)

    def handle_initialize(self, params: Dict, request_id: Any):
        """Handle initialization request"""
        result = {
            "protocolVersion": "2024-11-05",
            "serverInfo": {
                "name": self.name,
                "version": self.version
            },
            "capabilities": {
                "tools": {}
            }
        }
        self.send_response(result, request_id)

    def handle_tools_list(self, request_id: Any):
        """Handle tools/list request"""
        result = {"tools": self.tools}
        self.send_response(result, request_id)

    def handle_tools_call(self, params: Dict, request_id: Any):
        """Handle tools/call request"""
        tool_name = params.get("name")
        arguments = params.get("arguments", {})

        try:
            # Dispatch to tool handler
            result = self.call_tool(tool_name, arguments)
            self.send_response(result, request_id)
        except Exception as e:
            self.send_error(str(e), -32603, request_id)

    def call_tool(self, name: str, arguments: Dict) -> Dict:
        """Override this method to implement tools"""
        raise NotImplementedError(f"Tool not implemented: {name}")

    def run(self):
        """Main server loop"""
        for line in sys.stdin:
            try:
                request = json.loads(line)
                method = request.get("method")
                params = request.get("params")
                request_id = request.get("id")

                if method == "initialize":
                    self.handle_initialize(params, request_id)
                elif method == "tools/list":
                    self.handle_tools_list(request_id)
                elif method == "tools/call":
                    self.handle_tools_call(params, request_id)
                else:
                    self.send_error(
                        f"Unknown method: {method}",
                        -32601,
                        request_id
                    )

            except json.JSONDecodeError as e:
                sys.stderr.write(f"JSON decode error: {e}\n")
                sys.stderr.flush()
            except Exception as e:
                sys.stderr.write(f"Error: {e}\n")
                sys.stderr.flush()

# Example implementation
class MyServer(MCPServer):
    def __init__(self):
        super().__init__("my-server", "1.0.0")

        # Register tools
        self.add_tool(
            "process_text",
            "Process text with custom logic",
            {
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "description": "Text to process"
                    },
                    "mode": {
                        "type": "string",
                        "enum": ["upper", "lower", "reverse"],
                        "description": "Processing mode"
                    }
                },
                "required": ["text"]
            }
        )

    def call_tool(self, name: str, arguments: Dict) -> Dict:
        if name == "process_text":
            text = arguments["text"]
            mode = arguments.get("mode", "upper")

            if mode == "upper":
                result = text.upper()
            elif mode == "lower":
                result = text.lower()
            elif mode == "reverse":
                result = text[::-1]
            else:
                raise ValueError(f"Unknown mode: {mode}")

            return {
                "content": [{
                    "type": "text",
                    "text": result
                }]
            }

        raise ValueError(f"Unknown tool: {name}")

if __name__ == "__main__":
    server = MyServer()
    server.run()
```

### HTTP/SSE Server (Advanced)

#### Express.js Implementation

```typescript
// http-server.ts
import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

const app = express();
app.use(express.json());

const mcpServer = new Server(
  {
    name: 'http-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: { tools: {} },
  },
);

// Setup MCP handlers
mcpServer.setRequestHandler('tools/list', async () => ({
  tools: [
    /* ... */
  ],
}));

mcpServer.setRequestHandler('tools/call', async (request) => {
  // Implementation
});

// HTTP endpoint for JSON-RPC
app.post('/message', async (req, res) => {
  try {
    const request = req.body;
    const response = await mcpServer.handleRequest(request);
    res.json(response);
  } catch (error) {
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: error.message,
      },
      id: req.body.id,
    });
  }
});

// SSE endpoint for server push
app.get('/sse', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Send notifications
  const interval = setInterval(() => {
    res.write(
      `data: ${JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/status',
        params: { status: 'healthy' },
      })}\n\n`,
    );
  }, 30000);

  req.on('close', () => {
    clearInterval(interval);
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`MCP HTTP server running on port ${PORT}`);
});
```

---

## Tool Design

### Tool Definition

```typescript
interface ToolDefinition {
  name: string; // Snake_case name
  description: string; // Clear, concise description
  inputSchema: JSONSchema; // JSON Schema for parameters
}
```

### Naming Conventions

- Use **snake_case** for tool names: `create_issue`, `read_file`
- Use **descriptive verbs**: `list_`, `create_`, `update_`, `delete_`, `get_`
- Keep names **concise** but **clear**

### Parameter Design

```typescript
// Good parameter schema
{
  type: 'object',
  properties: {
    // Required parameter with description
    path: {
      type: 'string',
      description: 'File path to read',
    },
    // Optional parameter with enum
    encoding: {
      type: 'string',
      enum: ['utf-8', 'ascii', 'base64'],
      description: 'File encoding',
      default: 'utf-8'
    },
    // Optional boolean parameter
    create_if_missing: {
      type: 'boolean',
      description: 'Create file if it does not exist',
      default: false
    }
  },
  required: ['path']
}
```

### Response Format

```typescript
// Success response
{
  content: [
    {
      type: 'text',
      text: 'Result data as JSON or plain text'
    }
  ],
  isError: false  // Optional, defaults to false
}

// Error response
{
  content: [
    {
      type: 'text',
      text: 'Error message: File not found'
    }
  ],
  isError: true
}

// Rich response with metadata
{
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        data: 'result',
        metadata: {
          timestamp: '2024-01-15T10:30:00Z',
          source: 'api-v2'
        }
      })
    }
  ]
}
```

### Tool Categories

#### 1. Data Access Tools

```typescript
// Read operations
{
  name: 'read_file',
  description: 'Read file contents',
  inputSchema: { /* ... */ }
}

// Query operations
{
  name: 'query_database',
  description: 'Execute SQL query',
  inputSchema: { /* ... */ }
}
```

#### 2. Data Modification Tools

```typescript
// Write operations
{
  name: 'write_file',
  description: 'Write content to file',
  inputSchema: { /* ... */ }
}

// Update operations
{
  name: 'update_record',
  description: 'Update database record',
  inputSchema: { /* ... */ }
}
```

#### 3. External API Tools

```typescript
// API calls
{
  name: 'create_github_issue',
  description: 'Create a new GitHub issue',
  inputSchema: { /* ... */ }
}
```

#### 4. Processing Tools

```typescript
// Data transformation
{
  name: 'analyze_sentiment',
  description: 'Analyze text sentiment',
  inputSchema: { /* ... */ }
}
```

---

## Testing

### Unit Tests

```typescript
// server.test.ts
import { describe, it, expect } from 'vitest';
import { MyServer } from './server';

describe('MyServer', () => {
  it('should list tools', async () => {
    const server = new MyServer();
    const result = await server.handle({
      jsonrpc: '2.0',
      method: 'tools/list',
      id: 1,
    });

    expect(result.result.tools).toHaveLength(1);
    expect(result.result.tools[0].name).toBe('my_tool');
  });

  it('should execute tool', async () => {
    const server = new MyServer();
    const result = await server.handle({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'my_tool',
        arguments: { input: 'test' },
      },
      id: 2,
    });

    expect(result.result.content[0].type).toBe('text');
  });

  it('should handle errors', async () => {
    const server = new MyServer();
    const result = await server.handle({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'unknown_tool',
        arguments: {},
      },
      id: 3,
    });

    expect(result.error).toBeDefined();
    expect(result.error.code).toBe(-32601);
  });
});
```

### Integration Tests

```bash
# Create test script
#!/bin/bash
# test-server.sh

# Start server
node server.js &
SERVER_PID=$!

# Wait for startup
sleep 2

# Test initialization
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05"},"id":1}' | \
  node server.js

# Test tools list
echo '{"jsonrpc":"2.0","method":"tools/list","id":2}' | \
  node server.js

# Test tool call
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"my_tool","arguments":{"input":"test"}},"id":3}' | \
  node server.js

# Cleanup
kill $SERVER_PID
```

### Manual Testing

```bash
# Test with AGI Workforce
# 1. Add to config
cat >> ~/.config/agiworkforce/mcp-servers-config.json << EOF
{
  "mcpServers": {
    "test-server": {
      "command": "node",
      "args": ["/path/to/server.js"],
      "env": {},
      "enabled": true
    }
  }
}
EOF

# 2. Restart AGI Workforce

# 3. Test via TypeScript
import { invoke } from '@tauri-apps/api/tauri';

const tools = await invoke('mcp_list_tools');
console.log(tools.filter(t => t.server === 'test-server'));

const result = await invoke('mcp_call_tool', {
  toolId: 'mcp:::test-server:::my_tool',
  arguments: { input: 'test' }
});
console.log(result);
```

---

## Integration

### Configuration for AGI Workforce

#### STDIO Server

```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["--loader", "tsx", "/path/to/server.ts"],
      "env": {
        "API_KEY": "<from_credential_manager>"
      },
      "enabled": true
    }
  }
}
```

#### Python Server

```json
{
  "mcpServers": {
    "my-python-server": {
      "command": "python3",
      "args": ["/path/to/server.py"],
      "env": {
        "PYTHONUNBUFFERED": "1"
      },
      "enabled": true
    }
  }
}
```

#### HTTP Server

```json
{
  "mcpServers": {
    "my-http-server": {
      "command": "",
      "args": [],
      "env": {},
      "enabled": true,
      "transport": {
        "type": "http",
        "url": "http://localhost:8080",
        "bearer_token": "<from_credential_manager>",
        "timeout_secs": 30,
        "verify_ssl": true
      }
    }
  }
}
```

### Credential Management

If your server needs credentials:

```typescript
// Set credential via AGI Workforce
await invoke('mcp_set_credential', {
  serverName: 'my-server',
  key: 'API_KEY',
  value: 'secret-key-here'
});

// Config uses placeholder
{
  "env": {
    "API_KEY": "<from_credential_manager>"
  }
}

// Server receives decrypted value
// process.env.API_KEY === 'secret-key-here'
```

### OAuth Integration

For OAuth-based authentication:

```json
{
  "env": {
    "ACCESS_TOKEN": "<from_oauth:provider>"
  }
}
```

OAuth tokens are automatically refreshed when expired.

---

## Publishing

### NPM Package (Recommended)

```json
// package.json
{
  "name": "@your-org/mcp-server-myservice",
  "version": "1.0.0",
  "description": "MCP server for MyService",
  "main": "dist/index.js",
  "bin": {
    "mcp-server-myservice": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "keywords": ["mcp", "model-context-protocol", "myservice"],
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  }
}
```

```bash
# Publish to npm
npm publish --access public

# Users can then use
npx @your-org/mcp-server-myservice
```

### Docker Container

```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --production

COPY dist/ ./dist/
EXPOSE 8080

CMD ["node", "dist/index.js"]
```

```bash
# Build and run
docker build -t my-mcp-server .
docker run -p 8080:8080 my-mcp-server
```

### Standalone Binary

```bash
# Using pkg for Node.js
npm install -g pkg
pkg . --targets node18-linux-x64,node18-macos-x64,node18-win-x64

# Or using Rust
cargo build --release
```

---

## Best Practices

### 1. Error Handling

```typescript
// Good: Specific error messages
server.setRequestHandler('tools/call', async (request) => {
  try {
    const result = await processRequest(request);
    return { content: [{ type: 'text', text: result }] };
  } catch (error) {
    if (error instanceof ValidationError) {
      return {
        content: [
          {
            type: 'text',
            text: `Invalid input: ${error.message}`,
          },
        ],
        isError: true,
      };
    }

    if (error instanceof APIError) {
      return {
        content: [
          {
            type: 'text',
            text: `API error: ${error.statusCode} - ${error.message}`,
          },
        ],
        isError: true,
      };
    }

    throw error; // Let framework handle unexpected errors
  }
});
```

### 2. Input Validation

```typescript
// Use Zod for validation
const InputSchema = z.object({
  path: z.string().min(1).max(1000),
  content: z.string().max(10_000_000), // 10MB limit
  encoding: z.enum(['utf-8', 'ascii']).default('utf-8'),
});

server.setRequestHandler('tools/call', async (request) => {
  const input = InputSchema.parse(request.params.arguments);
  // Now input is type-safe and validated
});
```

### 3. Logging

```typescript
// Log to stderr (stdout is for protocol)
console.error(`[${new Date().toISOString()}] Tool called: ${name}`);
console.error(`Arguments: ${JSON.stringify(args)}`);

// Or use a logging library
import pino from 'pino';
const logger = pino({ level: 'info' });

logger.info({ tool: name, args }, 'Tool execution started');
```

### 4. Resource Management

```typescript
// Clean up resources on shutdown
process.on('SIGTERM', async () => {
  console.error('Shutting down...');
  await cleanup();
  process.exit(0);
});

async function cleanup() {
  // Close database connections
  // Stop background tasks
  // Flush logs
}
```

### 5. Performance

```typescript
// Cache expensive operations
const cache = new Map();

async function expensiveOperation(key: string) {
  if (cache.has(key)) {
    return cache.get(key);
  }

  const result = await doExpensiveWork(key);
  cache.set(key, result);

  // Expire cache after 5 minutes
  setTimeout(() => cache.delete(key), 5 * 60 * 1000);

  return result;
}
```

### 6. Testing

```typescript
// Make server testable
export class MyServer {
  constructor(private apiClient: APIClient = new RealAPIClient()) {}

  // Methods...
}

// Test with mock
const mockClient = new MockAPIClient();
const server = new MyServer(mockClient);
```

### 7. Documentation

```typescript
// Document each tool clearly
{
  name: 'create_issue',
  description: `
    Create a new GitHub issue in the specified repository.

    Required permissions:
    - repo:write access to the target repository

    Example usage:
    {
      "repo": "owner/repo-name",
      "title": "Bug: Application crashes",
      "body": "Detailed description...",
      "labels": ["bug", "high-priority"]
    }

    Returns:
    {
      "number": 123,
      "url": "https://github.com/owner/repo/issues/123"
    }
  `,
  inputSchema: { /* ... */ }
}
```

### 8. Security

```typescript
// Sanitize file paths
import path from 'path';

function sanitizePath(userPath: string, basePath: string): string {
  const resolved = path.resolve(basePath, userPath);

  // Prevent directory traversal
  if (!resolved.startsWith(basePath)) {
    throw new Error('Invalid path: directory traversal detected');
  }

  return resolved;
}

// Rate limiting
const rateLimiter = new Map();

function checkRateLimit(key: string, limit: number, window: number): boolean {
  const now = Date.now();
  const record = rateLimiter.get(key) || { count: 0, resetAt: now + window };

  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + window;
  }

  record.count++;
  rateLimiter.set(key, record);

  return record.count <= limit;
}
```

### 9. Versioning

```typescript
// Support multiple API versions
const SUPPORTED_VERSIONS = ['2024-11-05', '2024-01-01'];

server.setRequestHandler('initialize', async (request) => {
  const clientVersion = request.params.protocolVersion;

  if (!SUPPORTED_VERSIONS.includes(clientVersion)) {
    throw new Error(
      `Unsupported protocol version: ${clientVersion}. ` +
        `Supported: ${SUPPORTED_VERSIONS.join(', ')}`,
    );
  }

  // Continue with initialization
});
```

### 10. Monitoring

```typescript
// Track metrics
const metrics = {
  toolCalls: new Map(),
  errors: new Map(),
  avgDuration: new Map(),
};

function recordMetric(tool: string, duration: number, error?: Error) {
  metrics.toolCalls.set(tool, (metrics.toolCalls.get(tool) || 0) + 1);

  if (error) {
    metrics.errors.set(tool, (metrics.errors.get(tool) || 0) + 1);
  }

  const current = metrics.avgDuration.get(tool) || { total: 0, count: 0 };
  current.total += duration;
  current.count++;
  metrics.avgDuration.set(tool, current);
}

// Export metrics endpoint (for HTTP servers)
app.get('/metrics', (req, res) => {
  res.json({
    calls: Object.fromEntries(metrics.toolCalls),
    errors: Object.fromEntries(metrics.errors),
    avgDuration: Object.fromEntries(
      Array.from(metrics.avgDuration).map(([k, v]) => [k, v.total / v.count]),
    ),
  });
});
```

---

## Example: Complete Server

See [MCP_EXAMPLES.md](MCP_EXAMPLES.md) for complete, working server implementations in TypeScript, Python, and other languages.

---

## Resources

- [MCP Specification](https://modelcontextprotocol.io/specification)
- [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Official Servers](https://github.com/modelcontextprotocol/servers)
- [AGI Workforce MCP Integration](../MCP_INTEGRATION.md)

---

For more information and examples, see:

- [MCP_INTEGRATION.md](../MCP_INTEGRATION.md) - Integration guide
- [MCP_EXAMPLES.md](MCP_EXAMPLES.md) - Code examples
- [MCP_TROUBLESHOOTING.md](MCP_TROUBLESHOOTING.md) - Debugging help
- [MCP_QUICK_REFERENCE.md](MCP_QUICK_REFERENCE.md) - Quick reference
