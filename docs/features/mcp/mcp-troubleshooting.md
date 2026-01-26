# MCP Troubleshooting Guide

This guide provides solutions for common MCP-related issues and debugging strategies.

## Table of Contents

1. [Quick Diagnostics](#quick-diagnostics)
2. [Connection Issues](#connection-issues)
3. [Authentication Problems](#authentication-problems)
4. [Tool Execution Failures](#tool-execution-failures)
5. [Performance Issues](#performance-issues)
6. [Configuration Problems](#configuration-problems)
7. [Platform-Specific Issues](#platform-specific-issues)
8. [Advanced Debugging](#advanced-debugging)

---

## Quick Diagnostics

### Run Health Check

```typescript
import { invoke } from '@tauri-apps/api/tauri';

async function diagnose() {
  console.log('=== MCP System Diagnostics ===\n');

  // 1. Check server status
  const servers = await invoke('mcp_list_servers');
  console.log(`Servers configured: ${servers.length}`);

  const connected = servers.filter((s) => s.connected);
  const disconnected = servers.filter((s) => !s.connected);

  console.log(`Connected: ${connected.length}`);
  console.log(`Disconnected: ${disconnected.length}\n`);

  // 2. List disconnected servers
  if (disconnected.length > 0) {
    console.log('Disconnected servers:');
    disconnected.forEach((s) => {
      console.log(`  - ${s.name} (enabled: ${s.enabled})`);
    });
    console.log();
  }

  // 3. Check health
  const health = await invoke('mcp_get_health');
  const unhealthy = health.filter((h) => h.status !== 'healthy');

  if (unhealthy.length > 0) {
    console.log('Unhealthy servers:');
    unhealthy.forEach((h) => {
      console.log(`  - ${h.serverName}: ${h.status}`);
      console.log(`    Error count: ${h.errorCount}`);
    });
    console.log();
  }

  // 4. Check tool availability
  const tools = await invoke('mcp_list_tools');
  console.log(`Total tools available: ${tools.length}\n`);

  // 5. Check for recent errors in logs
  for (const server of servers) {
    if (server.connected) {
      const logs = await invoke('mcp_get_server_logs', {
        serverName: server.name,
        lines: 10,
      });

      const errors = logs.filter(
        (log) => log.toLowerCase().includes('error') || log.toLowerCase().includes('failed'),
      );

      if (errors.length > 0) {
        console.log(`Recent errors in ${server.name}:`);
        errors.forEach((e) => console.log(`  ${e}`));
        console.log();
      }
    }
  }

  console.log('=== Diagnostics Complete ===');
}

// Run diagnostics
diagnose().catch(console.error);
```

### Check Configuration

```typescript
async function checkConfig() {
  const config = await invoke('mcp_get_config');

  console.log('Configuration validation:');

  for (const [name, server] of Object.entries(config.mcpServers)) {
    const issues = [];

    // Check required fields
    if (!server.command && !server.transport) {
      issues.push('Missing command and transport');
    }

    // Check credentials
    for (const [key, value] of Object.entries(server.env || {})) {
      if (value.includes('<from_') && !value.includes('>')) {
        issues.push(`Malformed credential placeholder: ${key}`);
      }
    }

    if (issues.length > 0) {
      console.log(`\n${name}:`);
      issues.forEach((i) => console.log(`  ⚠️  ${i}`));
    } else {
      console.log(`\n${name}: ✓ OK`);
    }
  }
}

checkConfig().catch(console.error);
```

---

## Connection Issues

### Issue: Server Won't Connect

**Symptoms**:

- "Failed to connect to MCP server"
- "Connection timeout"
- Server shows as disconnected

**Diagnosis**:

```typescript
async function diagnoseConnection(serverName: string) {
  console.log(`Diagnosing ${serverName}...\n`);

  // 1. Check if server is enabled
  const servers = await invoke('mcp_list_servers');
  const server = servers.find((s) => s.name === serverName);

  if (!server) {
    console.error('❌ Server not found in configuration');
    return;
  }

  console.log(`Enabled: ${server.enabled}`);
  console.log(`Connected: ${server.connected}`);
  console.log(`Command: ${server.command}\n`);

  // 2. Check logs
  console.log('Recent logs:');
  const logs = await invoke('mcp_get_server_logs', {
    serverName,
    lines: 20,
  });
  logs.forEach((log) => console.log(log));
}
```

**Solutions**:

#### 1. Check Node.js/NPM Installation

```bash
# Verify Node.js is installed
node --version  # Should be v18+ or v20+

# Verify npm is installed
npm --version

# Test npx command
npx --version

# Try running server manually
npx -y @modelcontextprotocol/server-filesystem .
```

#### 2. Check Server Package

```bash
# Test if package can be downloaded
npx -y @modelcontextprotocol/server-github --help

# Check npm registry
npm view @modelcontextprotocol/server-github version
```

#### 3. Verify File Permissions

```bash
# macOS/Linux - Check config file
ls -la ~/.config/agiworkforce/mcp-servers-config.json

# Make sure it's readable
chmod 644 ~/.config/agiworkforce/mcp-servers-config.json
```

#### 4. Restart Server

```typescript
// Disable and re-enable server
await invoke('mcp_disable_server', { name: 'filesystem' });
await new Promise((resolve) => setTimeout(resolve, 1000));
await invoke('mcp_enable_server', { name: 'filesystem' });
```

#### 5. Check Network (for HTTP transport)

```bash
# Test connectivity to remote server
curl -I https://mcp.example.com/

# Check DNS resolution
nslookup mcp.example.com

# Test with curl
curl -X POST https://mcp.example.com/message \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","id":1}'
```

### Issue: Server Disconnects Randomly

**Symptoms**:

- Server connects but disconnects after some time
- Intermittent "Connection lost" errors

**Solutions**:

#### 1. Check Process Stability

```typescript
// Monitor server health
import { listen } from '@tauri-apps/api/event';

await listen('mcp:server_connection_changed', (event) => {
  const { serverName, connected, error } = event.payload;

  if (!connected) {
    console.error(`${serverName} disconnected: ${error}`);

    // Auto-reconnect
    setTimeout(async () => {
      try {
        await invoke('mcp_enable_server', { name: serverName });
        console.log(`Reconnected to ${serverName}`);
      } catch (err) {
        console.error(`Reconnection failed: ${err}`);
      }
    }, 5000);
  }
});
```

#### 2. Increase Timeouts

```json
{
  "mcpServers": {
    "remote-api": {
      "transport": {
        "type": "http",
        "timeout_secs": 60 // Increase from default 30
      }
    }
  }
}
```

#### 3. Check Server Logs for Crashes

```typescript
const logs = await invoke('mcp_get_server_logs', {
  serverName: 'filesystem',
  lines: 100,
});

// Look for:
// - Uncaught exceptions
// - Memory errors
// - Process termination signals
logs.forEach((log) => {
  if (log.includes('error') || log.includes('crash')) {
    console.error(log);
  }
});
```

---

## Authentication Problems

### Issue: OAuth Token Expired

**Symptoms**:

- "401 Unauthorized" errors
- "OAuth token not available"
- API calls failing with authentication errors

**Diagnosis**:

```typescript
async function checkOAuthToken(serverName: string, provider: string) {
  // Check if OAuth token exists
  const config = await invoke('mcp_get_config');
  const server = config.mcpServers[serverName];

  const hasOAuth = Object.values(server.env).some((v) => v.includes(`<from_oauth:${provider}>`));

  console.log(`OAuth configured for ${provider}: ${hasOAuth}`);

  // Try to connect
  try {
    await invoke('mcp_enable_server', { name: serverName });
    console.log('✓ Connection successful');
  } catch (error) {
    console.error('✗ Connection failed:', error);
  }
}
```

**Solutions**:

#### 1. Re-authenticate

```typescript
// Delete existing OAuth token
await invoke('mcp_delete_credential', {
  serverName: 'github',
  key: 'GITHUB_PERSONAL_ACCESS_TOKEN',
});

// Re-authenticate via OAuth flow
// (Implementation depends on your OAuth setup)
const newToken = await authenticateWithGitHub();

// Store new token
await invoke('mcp_set_credential', {
  serverName: 'github',
  key: 'GITHUB_PERSONAL_ACCESS_TOKEN',
  value: newToken,
});

// Restart server
await invoke('mcp_disable_server', { name: 'github' });
await invoke('mcp_enable_server', { name: 'github' });
```

#### 2. Check Token Expiry

The system automatically refreshes tokens 60 seconds before expiry, but you can manually check:

```sql
-- Query SQLite database
SELECT key, value, updated_at
FROM settings_v2
WHERE key LIKE 'mcp_oauth_%'
ORDER BY updated_at DESC;
```

#### 3. Fallback to Manual Credentials

If OAuth fails, use manual credentials:

```json
{
  "mcpServers": {
    "github": {
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<from_credential_manager>"
      }
    }
  }
}
```

```typescript
// Set manual credential
await invoke('mcp_set_credential', {
  serverName: 'github',
  key: 'GITHUB_PERSONAL_ACCESS_TOKEN',
  value: 'ghp_your_token_here',
});
```

### Issue: Credential Not Found

**Symptoms**:

- "Credential not found for server / key"
- Server starts but API calls fail

**Solutions**:

#### 1. Verify Credential Storage

```bash
# Check database for credentials
sqlite3 ~/.config/agiworkforce/agiworkforce.db \
  "SELECT key, category FROM settings_v2 WHERE category = 'mcp_credentials'"
```

#### 2. Re-set Credential

```typescript
// Clear and reset
await invoke('mcp_delete_credential', {
  serverName: 'stripe',
  key: 'STRIPE_SECRET_KEY',
});

await invoke('mcp_set_credential', {
  serverName: 'stripe',
  key: 'STRIPE_SECRET_KEY',
  value: 'sk_test_...',
});
```

#### 3. Check Credential Format

```typescript
// Correct format in config
{
  "env": {
    "API_KEY": "<from_credential_manager>",  // ✓ Correct
    "TOKEN": "from_credential_manager",       // ✗ Wrong (missing <>)
    "SECRET": "<from_oauth:provider>"         // ✓ Correct for OAuth
  }
}
```

---

## Tool Execution Failures

### Issue: Tool Not Found

**Symptoms**:

- "Tool not found on server"
- "Invalid MCP tool ID format"

**Diagnosis**:

```typescript
async function findTool(toolName: string) {
  // Search for tool
  const tools = await invoke('mcp_search_tools', { query: toolName });

  if (tools.length === 0) {
    console.log(`No tools found matching: ${toolName}`);

    // List all available tools
    const allTools = await invoke('mcp_list_tools');
    console.log('\nAvailable tools:');
    allTools.forEach((t) => {
      console.log(`  ${t.id} - ${t.description}`);
    });
  } else {
    console.log('Matching tools:');
    tools.forEach((t) => {
      console.log(`  ${t.id} (${t.server})`);
      console.log(`    Params: ${t.parameters.join(', ')}`);
    });
  }
}
```

**Solutions**:

#### 1. Verify Tool ID Format

```typescript
// Correct format: mcp:::server:::tool
const correctId = 'mcp:::github:::create_issue'; // ✓
const wrongId = 'github::create_issue'; // ✗
const wrongId2 = 'mcp__github__create_issue'; // ✗ (old format)
```

#### 2. Refresh Tool Cache

```typescript
// Disconnect and reconnect to refresh tools
await invoke('mcp_disconnect_server', { name: 'github' });
await invoke('mcp_connect_server', { name: 'github' });

// Check tools again
const tools = await invoke('mcp_list_tools');
```

#### 3. Check Server Connection

```typescript
const servers = await invoke('mcp_list_servers');
const github = servers.find((s) => s.name === 'github');

if (!github?.connected) {
  console.error('GitHub server not connected');
  await invoke('mcp_enable_server', { name: 'github' });
}
```

### Issue: Tool Execution Timeout

**Symptoms**:

- "Request timeout after 30 seconds"
- Long-running operations fail

**Solutions**:

#### 1. Use Timeout Parameter (Rust)

```rust
// In Rust code
let result = executor
    .execute_tool_with_timeout(
        "mcp:::github:::list_issues",
        arguments,
        Duration::from_secs(60)  // Increase timeout
    )
    .await?;
```

#### 2. Configure Transport Timeout

```json
{
  "mcpServers": {
    "slow-api": {
      "transport": {
        "type": "http",
        "timeout_secs": 120 // 2 minutes
      }
    }
  }
}
```

#### 3. Break into Smaller Operations

```typescript
// Instead of one large operation
// const result = await invoke('mcp_call_tool', {
//   toolId: 'mcp:::postgres:::query',
//   arguments: { query: 'SELECT * FROM large_table' }
// });

// Break into pages
async function queryInPages(query: string, pageSize: number = 100) {
  const results = [];
  let offset = 0;

  while (true) {
    const page = await invoke('mcp_call_tool', {
      toolId: 'mcp:::postgres:::query',
      arguments: {
        query: `${query} LIMIT ${pageSize} OFFSET ${offset}`,
      },
    });

    if (page.length === 0) break;

    results.push(...page);
    offset += pageSize;
  }

  return results;
}
```

### Issue: Tool Returns Error

**Symptoms**:

- Tool executes but returns error result
- "isError: true" in result

**Diagnosis**:

```typescript
async function debugToolExecution(toolId: string, args: any) {
  console.log(`Executing ${toolId}...`);
  console.log('Arguments:', JSON.stringify(args, null, 2));

  try {
    const result = await invoke('mcp_call_tool', {
      toolId,
      arguments: args,
    });

    console.log('Result:', JSON.stringify(result, null, 2));

    // Check for error flag
    if (result.isError) {
      console.error('Tool returned error');
      result.content.forEach((c) => {
        if (c.type === 'text') {
          console.error('Error message:', c.text);
        }
      });
    }

    return result;
  } catch (error) {
    console.error('Execution failed:', error);
    throw error;
  }
}
```

**Solutions**:

#### 1. Validate Arguments

```typescript
// Get tool schema
const tools = await invoke('mcp_list_tools');
const tool = tools.find((t) => t.id === toolId);

console.log('Required parameters:', tool.parameters);

// Ensure all required params are provided
const required = tool.parameters.filter((p) => p.required);
const provided = Object.keys(args);

const missing = required.filter((r) => !provided.includes(r));
if (missing.length > 0) {
  console.error('Missing required parameters:', missing);
}
```

#### 2. Check Server Logs

```typescript
const logs = await invoke('mcp_get_server_logs', {
  serverName: 'github',
  lines: 50,
});

// Filter for errors related to tool call
const relevantLogs = logs.filter(
  (log) => log.includes('create_issue') || log.includes('error') || log.includes('failed'),
);

relevantLogs.forEach((log) => console.log(log));
```

---

## Performance Issues

### Issue: Slow Tool Execution

**Symptoms**:

- Tools take longer than expected
- High response times

**Diagnosis**:

```typescript
async function benchmarkTool(toolId: string, args: any, runs: number = 5) {
  const times = [];

  for (let i = 0; i < runs; i++) {
    const start = performance.now();

    try {
      await invoke('mcp_call_tool', { toolId, arguments: args });
      const duration = performance.now() - start;
      times.push(duration);
    } catch (error) {
      console.error(`Run ${i + 1} failed:`, error);
    }
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);

  console.log(`${toolId} performance:`);
  console.log(`  Average: ${avg.toFixed(2)}ms`);
  console.log(`  Min: ${min.toFixed(2)}ms`);
  console.log(`  Max: ${max.toFixed(2)}ms`);

  return { avg, min, max };
}
```

**Solutions**:

#### 1. Enable Tool Caching

```typescript
// Cache tool results for repeated calls
const cache = new Map();

async function cachedToolCall(toolId: string, args: any, ttl: number = 60000) {
  const key = `${toolId}:${JSON.stringify(args)}`;

  if (cache.has(key)) {
    const cached = cache.get(key);
    if (Date.now() - cached.timestamp < ttl) {
      console.log('Cache hit');
      return cached.result;
    }
  }

  const result = await invoke('mcp_call_tool', { toolId, arguments: args });

  cache.set(key, { result, timestamp: Date.now() });
  return result;
}
```

#### 2. Use Parallel Execution

```typescript
// Instead of sequential
// for (const file of files) {
//   await invoke('mcp_call_tool', { ... });
// }

// Use parallel
const promises = files.map((file) =>
  invoke('mcp_call_tool', {
    toolId: 'mcp:::filesystem:::read_file',
    arguments: { path: file },
  }),
);

const results = await Promise.all(promises);
```

#### 3. Monitor Health

```typescript
// Get health statistics
const health = await invoke('mcp_get_health');

health.forEach((h) => {
  if (h.responseTimeMs > 1000) {
    console.warn(`Slow server: ${h.serverName} (${h.responseTimeMs}ms)`);
  }
});
```

### Issue: High Memory Usage

**Symptoms**:

- Application becomes sluggish
- High memory consumption

**Solutions**:

#### 1. Limit Tool History

```rust
// In Rust - configure executor
let mut executor = McpToolExecutor::new(client);
executor.max_history_size = 100;  // Default is 1000
```

#### 2. Clear Execution History

```typescript
// Not directly exposed via Tauri commands
// But servers restart clears history
await invoke('mcp_disable_server', { name: 'filesystem' });
await invoke('mcp_enable_server', { name: 'filesystem' });
```

#### 3. Process Large Data in Chunks

```typescript
// Instead of loading entire file
async function processLargeFile(path: string) {
  // Read file info first
  const stat = await invoke('mcp_call_tool', {
    toolId: 'mcp:::filesystem:::stat',
    arguments: { path },
  });

  if (stat.size > 10 * 1024 * 1024) {
    // > 10MB
    console.warn('Large file detected, processing in chunks');
    // Implement chunk processing
  }
}
```

---

## Configuration Problems

### Issue: Config File Not Found

**Symptoms**:

- "Failed to load MCP config"
- Falls back to default config

**Solutions**:

#### 1. Check File Location

```bash
# macOS/Linux
ls -la ~/.config/agiworkforce/mcp-servers-config.json

# Windows
dir %APPDATA%\agiworkforce\mcp-servers-config.json
```

#### 2. Create Missing Config

```typescript
async function resetToDefaults() {
  // Get default config
  const defaultConfig = {
    mcpServers: {
      filesystem: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
        env: {},
        enabled: true,
      },
    },
  };

  // Save it
  await invoke('mcp_update_config', { newConfig: defaultConfig });
  console.log('Config reset to defaults');
}
```

### Issue: Malformed JSON

**Symptoms**:

- "Failed to parse config"
- JSON syntax errors

**Solutions**:

#### 1. Validate JSON

```bash
# Use jq to validate
cat ~/.config/agiworkforce/mcp-servers-config.json | jq .

# Or use Python
python -m json.tool ~/.config/agiworkforce/mcp-servers-config.json
```

#### 2. Common JSON Errors

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "server-github"], // ✓ Correct
      // "args": ["-y", "server-github"]  // ✗ Missing comma
      "enabled": true // ✓ Boolean
      // "enabled": "true",               // ✗ String instead of boolean
    } // ✗ Trailing comma
  }
}
```

#### 3. Backup and Reset

```bash
# Backup current config
cp ~/.config/agiworkforce/mcp-servers-config.json \
   ~/.config/agiworkforce/mcp-servers-config.json.backup

# Reset to defaults
rm ~/.config/agiworkforce/mcp-servers-config.json

# Restart app to regenerate defaults
```

---

## Platform-Specific Issues

### macOS

#### Issue: npx Permission Denied

```bash
# Fix Node.js permissions
sudo chown -R $(whoami) $(npm config get prefix)/{lib/node_modules,bin,share}

# Or reinstall Node.js via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20
```

#### Issue: Keychain Access Denied

```bash
# Grant Keychain access to AGI Workforce
# System Preferences > Security & Privacy > Privacy > Full Disk Access
# Add AGI Workforce application
```

### Windows

#### Issue: PowerShell Execution Policy

```powershell
# Check current policy
Get-ExecutionPolicy

# Allow scripts
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

#### Issue: npx Not Found

```bash
# Add npm to PATH
# System > Advanced system settings > Environment Variables
# Add: C:\Program Files\nodejs\

# Or use full path in config
{
  "command": "C:\\Program Files\\nodejs\\npx.cmd"
}
```

### Linux

#### Issue: Missing Dependencies

```bash
# Debian/Ubuntu
sudo apt-get install nodejs npm

# Fedora/RHEL
sudo dnf install nodejs npm

# Arch
sudo pacman -S nodejs npm
```

---

## Advanced Debugging

### Enable Detailed Logging

#### Environment Variables

```bash
# macOS/Linux
export RUST_LOG=mcp=debug,mcp_transport=trace
./agi-workforce

# Windows
set RUST_LOG=mcp=debug,mcp_transport=trace
agi-workforce.exe
```

#### Log to File

```bash
# Redirect logs to file
RUST_LOG=debug ./agi-workforce 2>&1 | tee mcp-debug.log
```

### Inspect Database

```bash
# Open database
sqlite3 ~/.config/agiworkforce/agiworkforce.db

# List MCP credentials
SELECT key, category, encrypted, updated_at
FROM settings_v2
WHERE category = 'mcp_credentials';

# Check OAuth tokens
SELECT key, updated_at
FROM settings_v2
WHERE key LIKE 'mcp_oauth_%';
```

### Network Debugging (HTTP Transport)

```bash
# Monitor HTTP traffic
# macOS
sudo tcpdump -i any -A 'host mcp.example.com'

# Use mitmproxy
mitmproxy --mode reverse:https://mcp.example.com

# Configure app to use proxy
{
  "transport": {
    "url": "http://localhost:8080",  # mitmproxy
    "verify_ssl": false
  }
}
```

### Process Debugging (STDIO Transport)

```bash
# Find MCP server processes
ps aux | grep mcp

# Monitor process
# macOS
sudo fs_usage -w -f pathname | grep npx

# Linux
strace -f -e trace=file npx -y @modelcontextprotocol/server-filesystem
```

### Memory Profiling

```rust
// Add to Rust code
use tracing::info;

info!("MCP session count: {}", client.list_servers().len());
info!("Tool cache size: {}", registry.get_all_tool_schemas().len());
```

### Performance Profiling

```typescript
// Profile tool execution
class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();

  async measure(name: string, fn: () => Promise<any>) {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      const duration = performance.now() - start;

      if (!this.metrics.has(name)) {
        this.metrics.set(name, []);
      }
      this.metrics.get(name)!.push(duration);
    }
  }

  report() {
    console.log('\n=== Performance Report ===\n');

    for (const [name, times] of this.metrics.entries()) {
      const avg = times.reduce((a, b) => a + b) / times.length;
      const min = Math.min(...times);
      const max = Math.max(...times);

      console.log(`${name}:`);
      console.log(`  Calls: ${times.length}`);
      console.log(`  Avg: ${avg.toFixed(2)}ms`);
      console.log(`  Min: ${min.toFixed(2)}ms`);
      console.log(`  Max: ${max.toFixed(2)}ms\n`);
    }
  }
}

// Usage
const monitor = new PerformanceMonitor();

await monitor.measure('github:create_issue', () =>
  invoke('mcp_call_tool', { ... })
);

monitor.report();
```

---

## Getting Help

### Collect Debug Information

```typescript
async function collectDebugInfo() {
  const info = {
    timestamp: new Date().toISOString(),
    servers: await invoke('mcp_list_servers'),
    health: await invoke('mcp_get_health'),
    stats: await invoke('mcp_get_stats'),
    tools: (await invoke('mcp_list_tools')).length,
  };

  // Get logs for each server
  for (const server of info.servers) {
    if (server.connected) {
      const logs = await invoke('mcp_get_server_logs', {
        serverName: server.name,
        lines: 20,
      });
      info[`logs_${server.name}`] = logs;
    }
  }

  // Save to file
  const json = JSON.stringify(info, null, 2);
  console.log(json);

  return info;
}

// Run and save
const debugInfo = await collectDebugInfo();
// Share debugInfo when reporting issues
```

### Report Issue Template

When reporting MCP issues, include:

1. **Environment**:
   - OS version
   - Node.js version
   - AGI Workforce version

2. **Configuration**:
   - Server config (with credentials redacted)
   - Transport type

3. **Logs**:
   - Server logs
   - Error messages
   - Stack traces

4. **Steps to Reproduce**:
   - Exact sequence of actions
   - Expected vs actual behavior

5. **Debug Info**:
   - Output from `collectDebugInfo()`
   - Health check results

---

For more information, see [MCP_INTEGRATION.md](../MCP_INTEGRATION.md) and [MCP_EXAMPLES.md](MCP_EXAMPLES.md).
