# MCP Integration Examples

This document provides practical examples for common MCP integration scenarios.

## Table of Contents

1. [Basic Examples](#basic-examples)
2. [File Operations](#file-operations)
3. [GitHub Integration](#github-integration)
4. [Database Operations](#database-operations)
5. [API Integration](#api-integration)
6. [Custom Server Examples](#custom-server-examples)
7. [Error Handling Patterns](#error-handling-patterns)
8. [Advanced Use Cases](#advanced-use-cases)

---

## Basic Examples

### Example 1: List and Execute a Simple Tool

```typescript
import { invoke } from '@tauri-apps/api/tauri';

async function listAndExecuteTool() {
  // 1. List all available tools
  const tools = await invoke('mcp_list_tools');
  console.log('Available tools:', tools.length);

  // 2. Find a specific tool
  const readFileTool = tools.find((t) => t.name === 'read_file' && t.server === 'filesystem');

  if (readFileTool) {
    // 3. Execute the tool
    const result = await invoke('mcp_call_tool', {
      toolId: readFileTool.id, // "mcp:::filesystem:::read_file"
      arguments: {
        path: '/path/to/file.txt',
      },
    });

    console.log('File content:', result);
  }
}
```

### Example 2: Search for Tools by Capability

```typescript
async function searchTools() {
  // Search for tools related to "create"
  const createTools = await invoke('mcp_search_tools', {
    query: 'create',
  });

  createTools.forEach((tool) => {
    console.log(`${tool.server}/${tool.name}: ${tool.description}`);
  });

  // Execute first matching tool
  if (createTools.length > 0) {
    const tool = createTools[0];
    console.log('Parameters:', tool.parameters);
  }
}
```

### Example 3: Monitor Server Health

```typescript
import { listen } from '@tauri-apps/api/event';

async function monitorHealth() {
  // Get current health status
  const health = await invoke('mcp_get_health');
  health.forEach((server) => {
    console.log(
      `${server.serverName}: ${server.status} ` +
        `(${server.responseTimeMs}ms, errors: ${server.errorCount})`,
    );
  });

  // Listen for health updates
  await listen('mcp:health', (event) => {
    const serverHealth = event.payload;
    if (serverHealth.status !== 'healthy') {
      console.warn(`Warning: ${serverHealth.serverName} is ${serverHealth.status}`);
    }
  });
}
```

---

## File Operations

### Example 4: Read Multiple Files

```typescript
async function readMultipleFiles(filePaths: string[]) {
  const results = [];

  for (const path of filePaths) {
    try {
      const content = await invoke('mcp_call_tool', {
        toolId: 'mcp:::filesystem:::read_file',
        arguments: { path },
      });
      results.push({ path, content, success: true });
    } catch (error) {
      results.push({ path, error: error.toString(), success: false });
    }
  }

  return results;
}

// Usage
const files = await readMultipleFiles([
  '/project/README.md',
  '/project/package.json',
  '/project/src/main.ts',
]);

files.forEach((file) => {
  if (file.success) {
    console.log(`✓ ${file.path}: ${file.content.length} bytes`);
  } else {
    console.error(`✗ ${file.path}: ${file.error}`);
  }
});
```

### Example 5: Write File with Backup

```typescript
async function safeWriteFile(path: string, content: string) {
  const backupPath = `${path}.backup`;

  try {
    // 1. Read existing file
    const existing = await invoke('mcp_call_tool', {
      toolId: 'mcp:::filesystem:::read_file',
      arguments: { path },
    });

    // 2. Create backup
    await invoke('mcp_call_tool', {
      toolId: 'mcp:::filesystem:::write_file',
      arguments: {
        path: backupPath,
        content: existing.content[0].text,
      },
    });

    console.log('Backup created:', backupPath);
  } catch (error) {
    console.log('No existing file to backup');
  }

  // 3. Write new content
  const result = await invoke('mcp_call_tool', {
    toolId: 'mcp:::filesystem:::write_file',
    arguments: { path, content },
  });

  console.log('File written:', path);
  return result;
}
```

### Example 6: Directory Traversal

```typescript
async function listDirectoryRecursive(dirPath: string, maxDepth: number = 3) {
  const files = [];

  async function traverse(path: string, depth: number) {
    if (depth > maxDepth) return;

    const entries = await invoke('mcp_call_tool', {
      toolId: 'mcp:::filesystem:::list_directory',
      arguments: { path },
    });

    for (const entry of entries.content) {
      const fullPath = `${path}/${entry.name}`;
      files.push({ path: fullPath, type: entry.type, depth });

      if (entry.type === 'directory') {
        await traverse(fullPath, depth + 1);
      }
    }
  }

  await traverse(dirPath, 0);
  return files;
}

// Usage
const files = await listDirectoryRecursive('/project/src');
console.log(`Found ${files.length} files/directories`);
```

---

## GitHub Integration

### Example 7: Create Issue with Error Handling

```typescript
async function createGitHubIssue(repo: string, title: string, body: string, labels: string[] = []) {
  try {
    const result = await invoke('mcp_call_tool', {
      toolId: 'mcp:::github:::create_issue',
      arguments: {
        repo,
        title,
        body,
        labels,
      },
    });

    const issueNumber = result.content[0].text.match(/#(\d+)/)?.[1];
    return {
      success: true,
      issueNumber,
      url: `https://github.com/${repo}/issues/${issueNumber}`,
    };
  } catch (error) {
    if (error.includes('401')) {
      throw new Error('GitHub authentication failed. Please check your token.');
    } else if (error.includes('404')) {
      throw new Error(`Repository ${repo} not found or not accessible.`);
    }
    throw error;
  }
}

// Usage
const issue = await createGitHubIssue(
  'owner/repo',
  'Bug: Application crashes on startup',
  '## Description\nDetailed bug report...\n\n## Steps to Reproduce\n1. ...',
  ['bug', 'high-priority'],
);

console.log('Issue created:', issue.url);
```

### Example 8: List and Filter Pull Requests

```typescript
async function getOpenPRs(repo: string, author?: string) {
  const result = await invoke('mcp_call_tool', {
    toolId: 'mcp:::github:::list_prs',
    arguments: {
      repo,
      state: 'open',
    },
  });

  const prs = JSON.parse(result.content[0].text);

  if (author) {
    return prs.filter((pr) => pr.user.login === author);
  }

  return prs;
}

// Usage
const myPRs = await getOpenPRs('owner/repo', 'username');
console.log(`You have ${myPRs.length} open PRs`);

myPRs.forEach((pr) => {
  console.log(`#${pr.number}: ${pr.title}`);
  console.log(`  Created: ${pr.created_at}`);
  console.log(`  Reviews: ${pr.requested_reviewers.length}`);
});
```

### Example 9: Read and Analyze Repository File

```typescript
async function analyzeFile(repo: string, path: string, ref: string = 'main') {
  const result = await invoke('mcp_call_tool', {
    toolId: 'mcp:::github:::read_file',
    arguments: { repo, path, ref },
  });

  const content = result.content[0].text;

  return {
    path,
    ref,
    size: content.length,
    lines: content.split('\n').length,
    isEmpty: content.trim().length === 0,
    extension: path.split('.').pop(),
    content,
  };
}

// Usage
const analysis = await analyzeFile('owner/repo', 'src/main.ts', 'develop');

console.log(`File: ${analysis.path}`);
console.log(`Size: ${analysis.size} bytes, ${analysis.lines} lines`);
```

---

## Database Operations

### Example 10: PostgreSQL Query with Error Recovery

```typescript
async function queryDatabase(query: string, retries: number = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await invoke('mcp_call_tool', {
        toolId: 'mcp:::postgres:::query',
        arguments: { query },
      });

      return JSON.parse(result.content[0].text);
    } catch (error) {
      if (attempt === retries) {
        throw new Error(`Query failed after ${retries} attempts: ${error}`);
      }

      console.warn(`Attempt ${attempt} failed, retrying...`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

// Usage
const users = await queryDatabase(`
  SELECT id, username, email, created_at
  FROM users
  WHERE active = true
  ORDER BY created_at DESC
  LIMIT 10
`);

console.log(`Found ${users.length} active users`);
```

### Example 11: Database Schema Inspection

```typescript
async function inspectDatabase() {
  // List all tables
  const tables = await invoke('mcp_call_tool', {
    toolId: 'mcp:::postgres:::list_tables',
    arguments: {},
  });

  const tableList = JSON.parse(tables.content[0].text);

  // Get schema for each table
  const schemas = [];
  for (const table of tableList) {
    const schema = await invoke('mcp_call_tool', {
      toolId: 'mcp:::postgres:::query',
      arguments: {
        query: `
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_name = '${table.name}'
          ORDER BY ordinal_position
        `,
      },
    });

    schemas.push({
      table: table.name,
      columns: JSON.parse(schema.content[0].text),
    });
  }

  return schemas;
}

// Usage
const dbSchema = await inspectDatabase();
dbSchema.forEach((table) => {
  console.log(`\nTable: ${table.table}`);
  table.columns.forEach((col) => {
    console.log(
      `  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : ''}`,
    );
  });
});
```

---

## API Integration

### Example 12: Stripe Payment Processing

```typescript
async function createPayment(
  amount: number,
  currency: string,
  customerId: string,
  description: string,
) {
  // Ensure Stripe server is connected
  const servers = await invoke('mcp_list_servers');
  const stripe = servers.find((s) => s.name === 'stripe');

  if (!stripe?.connected) {
    await invoke('mcp_enable_server', { name: 'stripe' });
    // Wait for connection
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Create charge
  const result = await invoke('mcp_call_tool', {
    toolId: 'mcp:::stripe:::create_charge',
    arguments: {
      amount,
      currency,
      customer: customerId,
      description,
    },
  });

  return JSON.parse(result.content[0].text);
}

// Usage
const payment = await createPayment(
  9999, // $99.99
  'usd',
  'cus_xxxxxxxxxxxxx',
  'Subscription payment',
);

console.log('Payment ID:', payment.id);
console.log('Status:', payment.status);
```

### Example 13: Slack Notification

```typescript
async function sendSlackNotification(
  channel: string,
  message: string,
  options?: {
    username?: string;
    icon_emoji?: string;
    attachments?: any[];
  },
) {
  const result = await invoke('mcp_call_tool', {
    toolId: 'mcp:::slack:::post_message',
    arguments: {
      channel,
      text: message,
      ...options,
    },
  });

  return result;
}

// Usage - Simple message
await sendSlackNotification('#general', 'Deployment completed successfully!');

// Usage - Rich message
await sendSlackNotification('#alerts', 'System Alert', {
  username: 'Monitoring Bot',
  icon_emoji: ':warning:',
  attachments: [
    {
      color: 'danger',
      title: 'High CPU Usage Detected',
      text: 'Server load: 95%',
      fields: [
        { title: 'Server', value: 'prod-01', short: true },
        { title: 'Region', value: 'us-east-1', short: true },
      ],
    },
  ],
});
```

---

## Custom Server Examples

### Example 14: Simple Python MCP Server

```python
#!/usr/bin/env python3
# custom_server.py

import json
import sys
from typing import Any, Dict

class MCPServer:
    def __init__(self):
        self.tools = [
            {
                "name": "analyze_sentiment",
                "description": "Analyze sentiment of text",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "text": {
                            "type": "string",
                            "description": "Text to analyze"
                        }
                    },
                    "required": ["text"]
                }
            }
        ]

    def send_response(self, result: Any, request_id: Any):
        response = {
            "jsonrpc": "2.0",
            "result": result,
            "id": request_id
        }
        print(json.dumps(response), flush=True)

    def send_error(self, message: str, code: int, request_id: Any):
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
        result = {
            "protocolVersion": "2024-11-05",
            "serverInfo": {
                "name": "Custom Python Server",
                "version": "1.0.0"
            },
            "capabilities": {
                "tools": {}
            }
        }
        self.send_response(result, request_id)

    def handle_tools_list(self, request_id: Any):
        result = {"tools": self.tools}
        self.send_response(result, request_id)

    def handle_tools_call(self, params: Dict, request_id: Any):
        tool_name = params.get("name")
        arguments = params.get("arguments", {})

        if tool_name == "analyze_sentiment":
            text = arguments.get("text", "")
            # Simple sentiment analysis (mock)
            sentiment = "positive" if "good" in text.lower() else "negative"
            score = 0.8 if sentiment == "positive" else 0.2

            result = {
                "content": [{
                    "type": "text",
                    "text": json.dumps({
                        "sentiment": sentiment,
                        "score": score,
                        "text_length": len(text)
                    })
                }]
            }
            self.send_response(result, request_id)
        else:
            self.send_error(f"Unknown tool: {tool_name}", -32601, request_id)

    def run(self):
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
                    self.send_error(f"Unknown method: {method}", -32601, request_id)

            except Exception as e:
                sys.stderr.write(f"Error: {str(e)}\n")
                sys.stderr.flush()

if __name__ == "__main__":
    server = MCPServer()
    server.run()
```

**Configuration**:

```json
{
  "mcpServers": {
    "sentiment": {
      "command": "python3",
      "args": ["/path/to/custom_server.py"],
      "env": {},
      "enabled": true
    }
  }
}
```

### Example 15: Node.js MCP Server with TypeScript SDK

```typescript
// server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const WeatherSchema = z.object({
  city: z.string().describe('City name'),
  units: z.enum(['celsius', 'fahrenheit']).optional(),
});

const server = new Server(
  {
    name: 'weather-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'get_weather',
      description: 'Get current weather for a city',
      inputSchema: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City name' },
          units: {
            type: 'string',
            enum: ['celsius', 'fahrenheit'],
            description: 'Temperature units',
          },
        },
        required: ['city'],
      },
    },
  ],
}));

server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'get_weather') {
    const { city, units = 'celsius' } = WeatherSchema.parse(args);

    // Mock weather data
    const temp = units === 'celsius' ? 22 : 72;
    const weather = {
      city,
      temperature: temp,
      units,
      condition: 'Sunny',
      humidity: 65,
      wind_speed: 10,
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(weather, null, 2),
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Weather MCP server running');
}

main().catch(console.error);
```

**Configuration**:

```json
{
  "mcpServers": {
    "weather": {
      "command": "node",
      "args": ["--loader", "tsx", "/path/to/server.ts"],
      "env": {},
      "enabled": true
    }
  }
}
```

---

## Error Handling Patterns

### Example 16: Comprehensive Error Handling

```typescript
interface ToolExecutionOptions {
  retries?: number;
  timeout?: number;
  fallback?: () => Promise<any>;
  onError?: (error: Error, attempt: number) => void;
}

async function executeTool(
  toolId: string,
  arguments: Record<string, any>,
  options: ToolExecutionOptions = {},
) {
  const { retries = 0, timeout = 30000, fallback, onError } = options;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeout),
      );

      const executionPromise = invoke('mcp_call_tool', {
        toolId,
        arguments,
      });

      const result = await Promise.race([executionPromise, timeoutPromise]);
      return { success: true, data: result };
    } catch (error) {
      const isLastAttempt = attempt === retries;

      if (onError) {
        onError(error, attempt + 1);
      }

      if (isLastAttempt) {
        if (fallback) {
          try {
            const fallbackResult = await fallback();
            return { success: true, data: fallbackResult, usedFallback: true };
          } catch (fallbackError) {
            return {
              success: false,
              error: error.toString(),
              fallbackError: fallbackError.toString(),
            };
          }
        }

        return { success: false, error: error.toString() };
      }

      // Exponential backoff
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
}

// Usage
const result = await executeTool(
  'mcp:::github:::create_issue',
  { repo: 'owner/repo', title: 'Bug', body: 'Description' },
  {
    retries: 3,
    timeout: 5000,
    fallback: async () => {
      // Fallback: create issue locally for later sync
      return saveIssueLocally({ title: 'Bug', body: 'Description' });
    },
    onError: (error, attempt) => {
      console.warn(`Attempt ${attempt} failed: ${error.message}`);
    },
  },
);

if (result.success) {
  console.log('Issue created:', result.data);
  if (result.usedFallback) {
    console.log('Used fallback mechanism');
  }
} else {
  console.error('Failed to create issue:', result.error);
}
```

### Example 17: Circuit Breaker Pattern

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private threshold: number = 5,
    private timeout: number = 60000,
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.timeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();

      if (this.state === 'half-open') {
        this.reset();
      }

      return result;
    } catch (error) {
      this.failures++;
      this.lastFailure = Date.now();

      if (this.failures >= this.threshold) {
        this.state = 'open';
        console.error(`Circuit breaker OPEN after ${this.failures} failures`);
      }

      throw error;
    }
  }

  reset() {
    this.failures = 0;
    this.state = 'closed';
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailure: this.lastFailure,
    };
  }
}

// Usage
const githubBreaker = new CircuitBreaker(3, 30000);

async function safeGitHubCall(toolId: string, args: any) {
  return githubBreaker.execute(() => invoke('mcp_call_tool', { toolId, arguments: args }));
}

try {
  const result = await safeGitHubCall('mcp:::github:::create_issue', {
    repo: 'owner/repo',
    title: 'Test',
  });
  console.log('Success:', result);
} catch (error) {
  console.error('Failed:', error.message);
  console.log('Breaker state:', githubBreaker.getState());
}
```

---

## Advanced Use Cases

### Example 18: Parallel Tool Execution with Progress

```typescript
interface ParallelTask {
  toolId: string;
  arguments: Record<string, any>;
  name: string;
}

async function executeParallelWithProgress(
  tasks: ParallelTask[],
  onProgress?: (completed: number, total: number, task: ParallelTask) => void,
) {
  let completed = 0;
  const total = tasks.length;

  const promises = tasks.map((task) =>
    invoke('mcp_call_tool', {
      toolId: task.toolId,
      arguments: task.arguments,
    })
      .then((result) => {
        completed++;
        if (onProgress) {
          onProgress(completed, total, task);
        }
        return { task, result, success: true };
      })
      .catch((error) => {
        completed++;
        if (onProgress) {
          onProgress(completed, total, task);
        }
        return { task, error: error.toString(), success: false };
      }),
  );

  return Promise.all(promises);
}

// Usage
const tasks = [
  {
    name: 'Read package.json',
    toolId: 'mcp:::filesystem:::read_file',
    arguments: { path: '/project/package.json' },
  },
  {
    name: 'Read tsconfig.json',
    toolId: 'mcp:::filesystem:::read_file',
    arguments: { path: '/project/tsconfig.json' },
  },
  {
    name: 'List GitHub issues',
    toolId: 'mcp:::github:::list_issues',
    arguments: { repo: 'owner/repo' },
  },
];

const results = await executeParallelWithProgress(tasks, (completed, total, task) => {
  console.log(`[${completed}/${total}] ${task.name}`);
});

results.forEach(({ task, result, success, error }) => {
  if (success) {
    console.log(`✓ ${task.name}: OK`);
  } else {
    console.error(`✗ ${task.name}: ${error}`);
  }
});
```

### Example 19: Tool Composition Pipeline

```typescript
interface PipelineStep {
  toolId: string;
  transform?: (input: any) => Record<string, any>;
}

async function executePipeline(initialInput: any, steps: PipelineStep[]) {
  let currentData = initialInput;
  const results = [];

  for (const step of steps) {
    const args = step.transform ? step.transform(currentData) : currentData;

    const result = await invoke('mcp_call_tool', {
      toolId: step.toolId,
      arguments: args,
    });

    results.push({ step: step.toolId, result });
    currentData = result;
  }

  return { final: currentData, steps: results };
}

// Usage: Read file -> Analyze -> Create issue
const pipeline = await executePipeline({ path: '/project/error.log' }, [
  {
    toolId: 'mcp:::filesystem:::read_file',
    transform: (input) => ({ path: input.path }),
  },
  {
    toolId: 'mcp:::sentiment:::analyze_sentiment',
    transform: (input) => ({ text: input.content[0].text }),
  },
  {
    toolId: 'mcp:::github:::create_issue',
    transform: (input) => ({
      repo: 'owner/repo',
      title: 'Error detected in logs',
      body: `Sentiment: ${JSON.parse(input.content[0].text).sentiment}`,
      labels: ['automated', 'log-analysis'],
    }),
  },
]);

console.log('Pipeline completed:', pipeline.final);
```

### Example 20: Dynamic Tool Discovery and Execution

```typescript
async function executeByDescription(description: string, args: Record<string, any>) {
  // Search for tools matching description
  const tools = await invoke('mcp_search_tools', { query: description });

  if (tools.length === 0) {
    throw new Error(`No tools found matching: ${description}`);
  }

  // Score tools by relevance
  const scored = tools.map((tool) => ({
    tool,
    score: calculateRelevance(tool, description),
  }));

  // Sort by score
  scored.sort((a, b) => b.score - a.score);

  // Try tools in order until one succeeds
  for (const { tool } of scored) {
    try {
      console.log(`Trying: ${tool.name} (${tool.server})`);

      const result = await invoke('mcp_call_tool', {
        toolId: tool.id,
        arguments: args,
      });

      return {
        success: true,
        tool: tool.name,
        server: tool.server,
        result,
      };
    } catch (error) {
      console.warn(`Failed with ${tool.name}: ${error.message}`);
      continue;
    }
  }

  throw new Error('All matching tools failed');
}

function calculateRelevance(tool: any, query: string): number {
  const queryLower = query.toLowerCase();
  let score = 0;

  if (tool.name.toLowerCase().includes(queryLower)) score += 10;
  if (tool.description.toLowerCase().includes(queryLower)) score += 5;

  // Bonus for exact matches
  if (tool.name.toLowerCase() === queryLower) score += 20;

  return score;
}

// Usage
const result = await executeByDescription('create issue', {
  repo: 'owner/repo',
  title: 'Bug report',
  body: 'Description',
});

console.log(`Executed ${result.tool} on ${result.server}`);
```

---

## Best Practices Summary

1. **Always handle errors gracefully** - Use try/catch and provide fallbacks
2. **Implement retries for network operations** - With exponential backoff
3. **Monitor server health** - React to connection issues
4. **Use circuit breakers** - Prevent cascade failures
5. **Validate arguments** - Before calling tools
6. **Log execution metrics** - For debugging and optimization
7. **Implement timeouts** - Prevent hanging operations
8. **Cache tool listings** - Reduce unnecessary calls
9. **Batch operations when possible** - Use parallel execution
10. **Provide user feedback** - Show progress and errors clearly

---

For more information, see [MCP_INTEGRATION.md](../MCP_INTEGRATION.md).
