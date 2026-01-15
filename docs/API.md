# AGI Workforce API Documentation

Complete API reference for AGI Workforce including Tauri commands, REST endpoints, and WebSocket protocol.

## Table of Contents

- [Tauri Commands](#tauri-commands)
- [REST API](#rest-api)
- [WebSocket Protocol](#websocket-protocol)
- [MCP Commands](#mcp-commands)
- [Error Codes](#error-codes)

## Tauri Commands

Tauri commands are invoked from the React frontend to interact with the Rust backend.

### Authentication Commands

#### `auth_login`

Authenticate a user with Supabase.

```typescript
invoke<{ user: User; session: Session }>('auth_login', {
  email: string;
  password: string;
})
```

**Parameters:**

- `email` (string): User's email address
- `password` (string): User's password

**Returns:**

- `user` (User): User object
- `session` (Session): Session with access token

**Errors:**

- Invalid credentials
- Network error

#### `auth_logout`

Log out the current user.

```typescript
invoke<void>('auth_logout');
```

**Returns:** void

### Chat Commands

#### `chat_send_message`

Send a message to an AI provider.

```typescript
invoke<{ response: string; tokens: number }>('chat_send_message', {
  conversationId: string;
  message: string;
  model: string;
  systemPrompt?: string;
  temperature?: number;
})
```

**Parameters:**

- `conversationId` (string): Unique conversation identifier
- `message` (string): User message text
- `model` (string): Model identifier (e.g., "gpt-4", "claude-3-5-sonnet-20241022")
- `systemPrompt` (optional string): System prompt override
- `temperature` (optional number): Sampling temperature (0-2)

**Returns:**

- `response` (string): AI response text
- `tokens` (number): Total tokens used

**Events Emitted:**

- `chat:token` - Streaming token chunks
- `chat:complete` - Message completion

#### `chat_get_conversation`

Retrieve a conversation with its messages.

```typescript
invoke<Conversation>('chat_get_conversation', {
  conversationId: string;
})
```

**Parameters:**

- `conversationId` (string): Conversation ID

**Returns:**

- Conversation object with messages array

### AGI Commands

#### `agi_start_goal`

Start an AGI goal execution.

```typescript
invoke<{ goalId: string }>('agi_start_goal', {
  description: string;
  context?: Record<string, any>;
})
```

**Parameters:**

- `description` (string): High-level goal description
- `context` (optional object): Additional context data

**Returns:**

- `goalId` (string): Unique goal identifier

**Events Emitted:**

- `agi:goal:started` - Goal execution started
- `agi:task:created` - New task created
- `agi:task:completed` - Task completed
- `agi:goal:completed` - Goal achieved
- `agi:goal:timeout` - Goal exceeded timeout
- `agi:goal:max_iterations` - Max iterations reached

#### `agi_cancel_goal`

Cancel a running AGI goal.

```typescript
invoke<void>('agi_cancel_goal', {
  goalId: string;
})
```

**Parameters:**

- `goalId` (string): Goal to cancel

**Returns:** void

#### `agi_get_goal_status`

Get the current status of a goal.

```typescript
invoke<GoalStatus>('agi_get_goal_status', {
  goalId: string;
})
```

**Parameters:**

- `goalId` (string): Goal ID

**Returns:**

- GoalStatus object with tasks, progress, and status

### MCP Commands

#### `mcp_list_servers`

List all registered MCP servers.

```typescript
invoke<MCPServer[]>('mcp_list_servers');
```

**Returns:**

- Array of MCPServer objects

#### `mcp_start_server`

Start an MCP server.

```typescript
invoke<void>('mcp_start_server', {
  serverId: string;
})
```

**Parameters:**

- `serverId` (string): Server to start

**Returns:** void

#### `mcp_stop_server`

Stop a running MCP server.

```typescript
invoke<void>('mcp_stop_server', {
  serverId: string;
})
```

**Parameters:**

- `serverId` (string): Server to stop

**Returns:** void

#### `mcp_list_tools`

List all available MCP tools from all servers.

```typescript
invoke<MCPTool[]>('mcp_list_tools');
```

**Returns:**

- Array of MCPTool objects with tool definitions

#### `mcp_set_credential`

Store a credential in the OS keyring.

```typescript
invoke<void>('mcp_set_credential', {
  serverName: string;
  key: string;
  value: string;
})
```

**Parameters:**

- `serverName` (string): MCP server name
- `key` (string): Credential key (e.g., "api_key")
- `value` (string): Credential value

**Returns:** void

**Storage:** Credentials stored with service name `agiworkforce-mcp-{serverName}`

#### `mcp_delete_credential`

Remove a credential from the OS keyring.

```typescript
invoke<void>('mcp_delete_credential', {
  serverName: string;
  key: string;
})
```

**Parameters:**

- `serverName` (string): MCP server name
- `key` (string): Credential key to remove

**Returns:** void

### Workflow Commands

#### `workflow_create`

Create a new workflow.

```typescript
invoke<{ workflowId: string }>('workflow_create', {
  name: string;
  definition: WorkflowDefinition;
})
```

**Parameters:**

- `name` (string): Workflow name
- `definition` (WorkflowDefinition): Workflow structure

**Returns:**

- `workflowId` (string): Created workflow ID

#### `workflow_execute`

Execute a workflow.

```typescript
invoke<WorkflowResult>('workflow_execute', {
  workflowId: string;
  inputs?: Record<string, any>;
})
```

**Parameters:**

- `workflowId` (string): Workflow to execute
- `inputs` (optional object): Input variables

**Returns:**

- WorkflowResult with outputs and status

**Events Emitted:**

- `workflow:started` - Execution started
- `workflow:step:completed` - Step completed
- `workflow:completed` - Workflow finished
- `workflow:error` - Execution error

### File Commands

#### `file_read`

Read a file from disk.

```typescript
invoke<string>('file_read', {
  path: string;
})
```

**Parameters:**

- `path` (string): Absolute file path

**Returns:**

- File contents as string

**Errors:**

- File not found
- Permission denied
- Invalid path

#### `file_write`

Write content to a file.

```typescript
invoke<void>('file_write', {
  path: string;
  content: string;
})
```

**Parameters:**

- `path` (string): Absolute file path
- `content` (string): Content to write

**Returns:** void

#### `file_list_directory`

List files in a directory.

```typescript
invoke<FileInfo[]>('file_list_directory', {
  path: string;
})
```

**Parameters:**

- `path` (string): Directory path

**Returns:**

- Array of FileInfo objects

### Settings Commands

#### `settings_get`

Get a settings value.

```typescript
invoke<any>('settings_get', {
  key: string;
})
```

**Parameters:**

- `key` (string): Settings key

**Returns:**

- Settings value (type depends on key)

#### `settings_set`

Set a settings value.

```typescript
invoke<void>('settings_set', {
  key: string;
  value: any;
})
```

**Parameters:**

- `key` (string): Settings key
- `value` (any): Value to store

**Returns:** void

#### `settings_load_from_disk`

Load settings from disk storage.

```typescript
invoke<Record<string, any>>('settings_load_from_disk');
```

**Returns:**

- Object with all settings

**Storage Location:** `~/.config/agiworkforce/settings.json`

### Computer Use Commands

#### `computer_move_mouse`

Move the mouse cursor.

```typescript
invoke<void>('computer_move_mouse', {
  x: number;
  y: number;
})
```

**Parameters:**

- `x` (number): X coordinate
- `y` (number): Y coordinate

**Returns:** void

#### `computer_click`

Simulate a mouse click.

```typescript
invoke<void>('computer_click', {
  button: 'left' | 'right' | 'middle';
})
```

**Parameters:**

- `button` (string): Mouse button to click

**Returns:** void

#### `computer_type_text`

Type text using keyboard simulation.

```typescript
invoke<void>('computer_type_text', {
  text: string;
})
```

**Parameters:**

- `text` (string): Text to type

**Returns:** void

#### `computer_screenshot`

Capture a screenshot.

```typescript
invoke<string>('computer_screenshot', {
  display?: number;
})
```

**Parameters:**

- `display` (optional number): Display index (default: primary)

**Returns:**

- Base64-encoded PNG image

## REST API

REST API endpoints provided by the Express API Gateway (port 3000).

### Authentication

All protected endpoints require a JWT token in the Authorization header:

```
Authorization: Bearer <token>
```

### Endpoints

#### POST `/api/auth/login`

Authenticate a user.

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  },
  "session": {
    "access_token": "jwt-token",
    "refresh_token": "refresh-token",
    "expires_at": 1234567890
  }
}
```

#### POST `/api/auth/refresh`

Refresh an access token.

**Request Body:**

```json
{
  "refresh_token": "refresh-token"
}
```

**Response:**

```json
{
  "access_token": "new-jwt-token",
  "expires_at": 1234567890
}
```

#### POST `/api/sync/state`

Sync device state.

**Request Body:**

```json
{
  "device_id": "device-uuid",
  "state": {
    "conversations": [...],
    "settings": {...}
  },
  "timestamp": 1234567890
}
```

**Response:**

```json
{
  "success": true,
  "conflicts": []
}
```

#### GET `/api/sync/state`

Get current synced state.

**Query Parameters:**

- `device_id` (string): Device identifier
- `since` (optional number): Timestamp for incremental sync

**Response:**

```json
{
  "state": {
    "conversations": [...],
    "settings": {...}
  },
  "timestamp": 1234567890
}
```

#### GET `/health`

Health check endpoint.

**Response:**

```json
{
  "status": "ok",
  "timestamp": 1234567890,
  "version": "1.0.0"
}
```

## WebSocket Protocol

WebSocket server for real-time synchronization (port 4000).

### Connection

```typescript
const ws = new WebSocket('ws://localhost:4000');

ws.onopen = () => {
  console.log('Connected');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  handleMessage(message);
};
```

### Message Format

All messages follow this structure:

```typescript
interface WSMessage {
  type: string;
  payload: any;
  timestamp: number;
  id?: string;
}
```

### Message Types

#### Device Pairing

**Client → Server: Request Pairing Code**

```json
{
  "type": "pair-request",
  "payload": {
    "device_type": "desktop"
  }
}
```

**Server → Client: Pairing Code**

```json
{
  "type": "pair-code",
  "payload": {
    "code": "123456",
    "expires_at": 1234567890
  }
}
```

**Client → Server: Complete Pairing**

```json
{
  "type": "pair-complete",
  "payload": {
    "code": "123456",
    "device_id": "device-uuid"
  }
}
```

**Server → Client: Pairing Success**

```json
{
  "type": "pair-success",
  "payload": {
    "paired_devices": ["device-1", "device-2"]
  }
}
```

#### State Synchronization

**Client → Server: Sync Update**

```json
{
  "type": "sync-update",
  "payload": {
    "entity": "conversation",
    "action": "create",
    "data": {...}
  }
}
```

**Server → Clients: Broadcast Update**

```json
{
  "type": "sync-broadcast",
  "payload": {
    "entity": "conversation",
    "action": "create",
    "data": {...},
    "source_device": "device-uuid"
  }
}
```

#### Presence

**Client → Server: Heartbeat**

```json
{
  "type": "heartbeat"
}
```

**Server → Client: Pong**

```json
{
  "type": "pong",
  "payload": {
    "timestamp": 1234567890
  }
}
```

## MCP Commands

Model Context Protocol tool invocation format.

### Tool ID Format

MCP tools use the format: `mcp__{server_name}__{tool_name}`

Example: `mcp__filesystem__read_file`

### Tool Invocation

```typescript
const result = await invokeMCPTool('mcp__filesystem__read_file', {
  path: '/path/to/file.txt',
});
```

### Common MCP Tools

#### Filesystem Server

- `mcp__filesystem__read_file` - Read file contents
- `mcp__filesystem__write_file` - Write to file
- `mcp__filesystem__list_directory` - List directory contents
- `mcp__filesystem__search_files` - Search for files

#### Git Server

- `mcp__git__status` - Get repository status
- `mcp__git__commit` - Create a commit
- `mcp__git__log` - View commit history
- `mcp__git__diff` - Show changes

#### Database Server

- `mcp__database__query` - Execute SQL query
- `mcp__database__schema` - Get database schema
- `mcp__database__tables` - List tables

## Error Codes

### Standard Error Format

```typescript
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
  };
}
```

### Error Codes

#### Authentication Errors (1xxx)

- `1001` - Invalid credentials
- `1002` - Token expired
- `1003` - Unauthorized access
- `1004` - Account suspended

#### Validation Errors (2xxx)

- `2001` - Invalid input
- `2002` - Missing required field
- `2003` - Invalid format
- `2004` - Value out of range

#### Resource Errors (3xxx)

- `3001` - Resource not found
- `3002` - Resource already exists
- `3003` - Resource locked
- `3004` - Resource limit exceeded

#### Server Errors (5xxx)

- `5001` - Internal server error
- `5002` - Database error
- `5003` - External service error
- `5004` - Timeout

#### Rate Limit Errors (4xxx)

- `4001` - Rate limit exceeded
- `4002` - Quota exceeded
- `4003` - Concurrent request limit

### Error Handling Example

```typescript
try {
  const result = await invoke('command_name', params);
} catch (error) {
  if (error.code === '1002') {
    // Handle token expiration
    await refreshToken();
    return retry();
  } else if (error.code === '4001') {
    // Handle rate limit
    await waitForRateLimit();
    return retry();
  } else {
    // Handle other errors
    console.error('Operation failed:', error.message);
  }
}
```

## Rate Limiting

### Rate Limit Headers

Responses include rate limit information:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1234567890
```

### Rate Limit Tiers

**Free Tier:**

- 100 requests per hour
- 10 concurrent requests

**Pro Tier:**

- 1,000 requests per hour
- 50 concurrent requests

**Max Tier:**

- 10,000 requests per hour
- 200 concurrent requests

**Enterprise:**

- Unlimited requests
- Custom concurrent limits

## Pagination

List endpoints support pagination:

**Request:**

```
GET /api/conversations?page=1&limit=20
```

**Response:**

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

## Versioning

API version is specified in the URL:

```
/api/v1/conversations
```

Current version: **v1**

## Support

For API support:

- GitHub Issues: Bug reports and feature requests
- Documentation: https://docs.agiworkforce.com
- Email: support@agiworkforce.com
