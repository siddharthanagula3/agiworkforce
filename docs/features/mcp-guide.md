# Model Context Protocol (MCP) Guide

Model Context Protocol (MCP) provides an extensible tool ecosystem that enables external tools and services to be used by the AI.

## Overview

MCP enables the AI to use external tools and services. Users never see "MCP" - they simply describe what they want:

- "Search my email for receipts"
- "Create a GitHub issue"
- "Query my database"
- "Deploy to Vercel"

The system automatically detects user intent and routes requests to the appropriate MCP/Tool server.

## Pre-configured Servers

The following servers are available out-of-the-box:

| Server         | Capabilities                       | Tool ID Prefix      |
| -------------- | ---------------------------------- | ------------------- |
| **Supabase**   | Database queries, table management | `mcp__supabase__`   |
| **GitHub**     | Issues, PRs, repositories          | `mcp__github__`     |
| **Filesystem** | Local file operations              | `mcp__filesystem__` |
| **Context7**   | Documentation lookup               | `mcp__context7__`   |
| **Vercel**     | Deployment management              | `mcp__vercel__`     |

## Credential Management

Credentials are stored securely in your operating system's native keyring (macOS Keychain, Windows Credential Manager, or Linux Secret Service).

### Managing Credentials

You can manage credentials via the **Settings -> MCP Servers** UI, or programmatically:

```typescript
// Store credential
await invoke('mcp_set_credential', {
  serverName: 'github',
  key: 'token',
  value: 'ghp_...',
});
```

## Integration Examples

### 1. File Operations

**Read Multiple Files**

```typescript
const files = await readMultipleFiles(['/project/README.md', '/project/package.json']);
```

**Directory Traversal**

```typescript
const files = await listDirectoryRecursive('/project/src');
```

### 2. GitHub Integration

**Create Issue**

```typescript
await invoke('mcp_call_tool', {
  toolId: 'mcp__github__create_issue',
  arguments: {
    repo: 'owner/repo',
    title: 'Bug report',
    body: 'Description...',
    labels: ['bug'],
  },
});
```

**List Pull Requests**

```typescript
await invoke('mcp_call_tool', {
  toolId: 'mcp__github__list_prs',
  arguments: { repo: 'owner/repo', state: 'open' },
});
```

### 3. Database Operations (Supabase/Postgres)

**Query Data**

```typescript
await invoke('mcp_call_tool', {
  toolId: 'mcp__postgres:::query',
  arguments: {
    query: 'SELECT id, email FROM users WHERE active = true LIMIT 5',
  },
});
```

**Inspect Schema**

```typescript
const tables = await invoke('mcp_call_tool', {
  toolId: 'mcp__postgres:::list_tables',
  arguments: {},
});
```
