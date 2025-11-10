# AGI Workforce - Complete API Reference

**Version:** 1.0.0
**Last Updated:** November 10, 2025

---

## Table of Contents

1. [Tauri Commands](#tauri-commands)
2. [Event System](#event-system)
3. [Data Types](#data-types)
4. [Tool Definitions](#tool-definitions)
5. [Error Codes](#error-codes)

---

## 1. Tauri Commands

All Tauri commands can be invoked from the frontend using:

```typescript
import { invoke } from '@tauri-apps/api/tauri';

const result = await invoke<ReturnType>('command_name', { param: value });
```

### 1.1 Chat Commands

#### `chat_send_message`

Send a chat message and get a response.

**Parameters:**
```typescript
{
  message: string;           // The message content
  conversation_id?: number;  // Optional conversation ID
  model?: string;            // Optional model selection
  temperature?: number;      // Optional temperature (0.0-2.0)
}
```

**Returns:**
```typescript
{
  message_id: number;
  content: string;
  tokens: number;
  cost: number;
  model: string;
  provider: string;
}
```

**Example:**
```typescript
const response = await invoke('chat_send_message', {
  message: 'Hello, AGI!',
  conversation_id: 1,
});
console.log(response.content);
```

---

#### `chat_send_message_streaming`

Send a chat message with streaming response.

**Parameters:**
```typescript
{
  message: string;
  conversation_id?: number;
  model?: string;
}
```

**Returns:** `void` (emits events)

**Events Emitted:**
- `chat:message_chunk` - Content chunks as they arrive
- `chat:message_complete` - Final message with metadata

**Example:**
```typescript
// Listen for events first
await listen('chat:message_chunk', (event) => {
  console.log('Chunk:', event.payload.content);
});

// Send message
await invoke('chat_send_message_streaming', {
  message: 'Tell me a story',
  conversation_id: 1,
});
```

---

#### `chat_get_conversations`

Get list of all conversations.

**Parameters:** None

**Returns:**
```typescript
Array<{
  id: number;
  title: string;
  created_at: number;
  updated_at: number;
  message_count: number;
}>
```

---

#### `chat_get_messages`

Get messages from a conversation.

**Parameters:**
```typescript
{
  conversation_id: number;
  limit?: number;    // Default: 50
  offset?: number;   // Default: 0
}
```

**Returns:**
```typescript
Array<{
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: number;
  tokens?: number;
  cost?: number;
}>
```

---

#### `chat_delete_conversation`

Delete a conversation and all its messages.

**Parameters:**
```typescript
{
  conversation_id: number;
}
```

**Returns:** `void`

---

### 1.2 AGI Commands

#### `agi_submit_goal`

Submit a goal for autonomous execution.

**Parameters:**
```typescript
{
  goal: string;                    // Goal description
  priority?: 'low' | 'normal' | 'high';  // Default: 'normal'
  deadline?: number;               // Unix timestamp (optional)
}
```

**Returns:**
```typescript
{
  goal_id: string;  // UUID
  estimated_steps: number;
  estimated_time_seconds: number;
  estimated_cost_usd: number;
}
```

**Events Emitted:**
- `agi:goal_submitted`
- `agi:goal_progress`
- `agi:goal_completed` or `agi:goal_error`

**Example:**
```typescript
// Listen for progress
await listen('agi:goal_progress', (event) => {
  const { step, total_steps, current_action } = event.payload;
  console.log(`Step ${step}/${total_steps}: ${current_action}`);
});

// Submit goal
const result = await invoke('agi_submit_goal', {
  goal: 'Create a React component for user profiles',
  priority: 'high',
});
console.log(`Goal ID: ${result.goal_id}`);
```

---

#### `agi_get_goal_status`

Get current status of a goal.

**Parameters:**
```typescript
{
  goal_id: string;
}
```

**Returns:**
```typescript
{
  goal_id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  current_step: number;
  total_steps: number;
  started_at?: number;
  completed_at?: number;
  result?: string;
  error?: string;
}
```

---

#### `agi_cancel_goal`

Cancel a running goal.

**Parameters:**
```typescript
{
  goal_id: string;
}
```

**Returns:** `void`

---

#### `agi_list_goals`

List all goals.

**Parameters:**
```typescript
{
  status?: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  limit?: number;    // Default: 100
  offset?: number;   // Default: 0
}
```

**Returns:**
```typescript
Array<{
  goal_id: string;
  description: string;
  status: string;
  created_at: number;
  completed_at?: number;
}>
```

---

### 1.3 Automation Commands

#### `automation_screenshot`

Capture a screenshot.

**Parameters:**
```typescript
{
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  save_path?: string;  // Optional custom save path
}
```

**Returns:**
```typescript
{
  path: string;        // Path to saved screenshot
  width: number;
  height: number;
  format: 'png' | 'jpeg';
}
```

**Example:**
```typescript
// Full screen screenshot
const screenshot = await invoke('automation_screenshot', {});

// Region screenshot
const region = await invoke('automation_screenshot', {
  region: { x: 100, y: 100, width: 800, height: 600 }
});
```

---

#### `automation_click`

Click at specific coordinates.

**Parameters:**
```typescript
{
  x: number;
  y: number;
  button?: 'left' | 'right' | 'middle';  // Default: 'left'
  double_click?: boolean;                 // Default: false
}
```

**Returns:** `void`

---

#### `automation_type`

Type text with optional delay.

**Parameters:**
```typescript
{
  text: string;
  delay_ms?: number;  // Delay between keystrokes (default: 10)
}
```

**Returns:** `void`

---

#### `automation_press_key`

Press a key or key combination.

**Parameters:**
```typescript
{
  keys: string;  // e.g., "Ctrl+C", "Enter", "F5"
}
```

**Returns:** `void`

**Supported Keys:**
- Modifiers: `Ctrl`, `Alt`, `Shift`, `Win`/`Super`/`Meta`
- Special: `Enter`, `Escape`, `Tab`, `Space`, `Backspace`, `Delete`
- Arrows: `Up`, `Down`, `Left`, `Right`
- Function: `F1`-`F12`
- Navigation: `Home`, `End`, `PageUp`, `PageDown`, `Insert`
- Characters: All alphanumeric + punctuation

**Example:**
```typescript
// Copy
await invoke('automation_press_key', { keys: 'Ctrl+C' });

// Alt+Tab
await invoke('automation_press_key', { keys: 'Alt+Tab' });

// F5
await invoke('automation_press_key', { keys: 'F5' });
```

---

#### `automation_find_text`

Find text on screen using OCR.

**Parameters:**
```typescript
{
  text: string;
  fuzzy?: boolean;  // Allow fuzzy matching (default: false)
  threshold?: number;  // Confidence threshold 0.0-1.0 (default: 0.8)
}
```

**Returns:**
```typescript
Array<{
  x: number;
  y: number;
  confidence: number;
}>
```

---

#### `automation_wait_for_element`

Wait for an element to appear.

**Parameters:**
```typescript
{
  text: string;        // Text to search for
  timeout_ms: number;  // Maximum wait time
}
```

**Returns:** `void` (throws error if timeout)

---

### 1.4 Browser Commands

#### `browser_navigate`

Navigate browser to URL.

**Parameters:**
```typescript
{
  url: string;
  wait_for_load?: boolean;  // Wait for page load (default: true)
}
```

**Returns:** `void`

---

#### `browser_click_element`

Click element in browser.

**Parameters:**
```typescript
{
  selector: string;      // CSS selector
  frame_id?: string;     // Optional frame ID
  wait_for_element?: boolean;  // Wait for element (default: true)
}
```

**Returns:** `void`

---

#### `browser_extract_text`

Extract text from browser page.

**Parameters:**
```typescript
{
  selector?: string;  // Optional CSS selector (default: body)
}
```

**Returns:**
```typescript
{
  text: string;
  html: string;
}
```

---

### 1.5 File Commands

#### `file_read`

Read file contents.

**Parameters:**
```typescript
{
  path: string;
  encoding?: 'utf8' | 'binary';  // Default: 'utf8'
}
```

**Returns:**
```typescript
{
  content: string;
  size: number;
  modified_at: number;
}
```

---

#### `file_write`

Write file contents.

**Parameters:**
```typescript
{
  path: string;
  content: string;
  create_dirs?: boolean;  // Create parent directories (default: true)
}
```

**Returns:** `void`

---

#### `file_list_directory`

List directory contents.

**Parameters:**
```typescript
{
  path: string;
  recursive?: boolean;  // Recursive listing (default: false)
  pattern?: string;     // Glob pattern (e.g., "*.txt")
}
```

**Returns:**
```typescript
Array<{
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modified_at: number;
}>
```

---

### 1.6 Database Commands

#### `db_query`

Execute SQL query.

**Parameters:**
```typescript
{
  connection_id: string;
  query: string;
  params?: Array<string | number | boolean | null>;
}
```

**Returns:**
```typescript
{
  rows: Array<Record<string, any>>;
  row_count: number;
  columns: string[];
}
```

---

#### `db_execute`

Execute SQL command (INSERT, UPDATE, DELETE).

**Parameters:**
```typescript
{
  connection_id: string;
  query: string;
  params?: Array<string | number | boolean | null>;
}
```

**Returns:**
```typescript
{
  rows_affected: number;
}
```

---

### 1.7 Settings Commands

#### `settings_get`

Get setting value.

**Parameters:**
```typescript
{
  key: string;
}
```

**Returns:**
```typescript
{
  value: any;
}
```

---

#### `settings_set`

Set setting value.

**Parameters:**
```typescript
{
  key: string;
  value: any;
}
```

**Returns:** `void`

---

#### `settings_get_all`

Get all settings.

**Parameters:** None

**Returns:**
```typescript
Record<string, any>
```

---

## 2. Event System

### 2.1 Chat Events

#### `chat:message_chunk`

Emitted during streaming chat responses.

**Payload:**
```typescript
{
  conversation_id: number;
  message_id: number;
  content: string;  // Incremental content
  done: boolean;
}
```

---

#### `chat:message_complete`

Emitted when chat message is complete.

**Payload:**
```typescript
{
  conversation_id: number;
  message_id: number;
  tokens: number;
  cost: number;
  model: string;
  provider: string;
}
```

---

### 2.2 AGI Events

#### `agi:goal_submitted`

Emitted when goal is submitted.

**Payload:**
```typescript
{
  goal_id: string;
  description: string;
  estimated_steps: number;
}
```

---

#### `agi:goal_progress`

Emitted during goal execution.

**Payload:**
```typescript
{
  goal_id: string;
  step: number;
  total_steps: number;
  current_action: string;
  percent_complete: number;
}
```

---

#### `agi:goal_completed`

Emitted when goal completes successfully.

**Payload:**
```typescript
{
  goal_id: string;
  result: string;
  execution_time_seconds: number;
  total_cost_usd: number;
}
```

---

#### `agi:goal_error`

Emitted when goal fails.

**Payload:**
```typescript
{
  goal_id: string;
  error: string;
  step_failed: number;
}
```

---

### 2.3 Resource Events

#### `resource:usage_high`

Emitted when resource usage exceeds threshold.

**Payload:**
```typescript
{
  resource: 'cpu' | 'memory' | 'network' | 'storage';
  usage_percent: number;
  threshold_percent: number;
}
```

---

## 3. Data Types

### 3.1 Tool Definition

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: 'string' | 'number' | 'boolean' | 'array' | 'object';
      description: string;
      enum?: string[];
      items?: any;
    }>;
    required: string[];
  };
}
```

### 3.2 Execution Result

```typescript
interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  execution_time_ms: number;
}
```

### 3.3 Resource Usage

```typescript
interface ResourceUsage {
  cpu_percent: number;
  memory_mb: number;
  network_mbps: number;
  storage_mb: number;
}
```

### 3.4 Provider Info

```typescript
interface ProviderInfo {
  name: 'openai' | 'anthropic' | 'google' | 'ollama';
  models: string[];
  capabilities: {
    streaming: boolean;
    function_calling: boolean;
    vision: boolean;
  };
  pricing: {
    input_per_1k_tokens: number;
    output_per_1k_tokens: number;
  };
}
```

---

## 4. Tool Definitions

### 4.1 File Operations

#### `file_read`

```json
{
  "name": "file_read",
  "description": "Read contents of a file from the filesystem",
  "parameters": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "Path to the file to read"
      }
    },
    "required": ["path"]
  }
}
```

#### `file_write`

```json
{
  "name": "file_write",
  "description": "Write contents to a file",
  "parameters": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "Path to the file to write"
      },
      "content": {
        "type": "string",
        "description": "Content to write to the file"
      }
    },
    "required": ["path", "content"]
  }
}
```

### 4.2 UI Automation

#### `ui_screenshot`

```json
{
  "name": "ui_screenshot",
  "description": "Capture a screenshot of the screen",
  "parameters": {
    "type": "object",
    "properties": {
      "region": {
        "type": "object",
        "description": "Optional region to capture",
        "properties": {
          "x": { "type": "number" },
          "y": { "type": "number" },
          "width": { "type": "number" },
          "height": { "type": "number" }
        }
      }
    }
  }
}
```

#### `ui_click`

```json
{
  "name": "ui_click",
  "description": "Click at specific coordinates or element",
  "parameters": {
    "type": "object",
    "properties": {
      "x": {
        "type": "number",
        "description": "X coordinate"
      },
      "y": {
        "type": "number",
        "description": "Y coordinate"
      },
      "button": {
        "type": "string",
        "enum": ["left", "right", "middle"],
        "description": "Mouse button to click"
      }
    },
    "required": ["x", "y"]
  }
}
```

---

## 5. Error Codes

### 5.1 Common Errors

| Code | Name | Description |
|------|------|-------------|
| 1000 | InvalidArgument | Invalid or missing argument |
| 1001 | UnknownTool | Tool not found |
| 1002 | ExecutionFailed | Tool execution failed |
| 1003 | Timeout | Operation timed out |
| 1004 | ResourceUnavailable | Resource not available |
| 2000 | DatabaseError | Database operation failed |
| 2001 | FileNotFound | File not found |
| 2002 | PermissionDenied | Permission denied |
| 3000 | NetworkError | Network operation failed |
| 3001 | ProviderError | LLM provider error |
| 3002 | RateLimitExceeded | Rate limit exceeded |

### 5.2 Error Response Format

```typescript
interface ErrorResponse {
  code: number;
  name: string;
  message: string;
  details?: string;
  timestamp: number;
}
```

---

## 6. Rate Limits

### 6.1 LLM Providers

| Provider | Requests/min | Tokens/min |
|----------|--------------|------------|
| OpenAI | 60 | 90,000 |
| Anthropic | 50 | 100,000 |
| Google | 60 | 120,000 |
| Ollama | Unlimited | Unlimited |

### 6.2 Internal Limits

| Operation | Limit |
|-----------|-------|
| Chat messages | 100/min |
| AGI goals | 10/min |
| Tool executions | 1000/min |
| File operations | 500/min |

---

## 7. Best Practices

### 7.1 Error Handling

```typescript
try {
  const result = await invoke('command_name', { params });
  // Handle success
} catch (error) {
  if (error.code === 1003) {
    // Handle timeout
  } else if (error.code === 3002) {
    // Handle rate limit
  } else {
    // Handle general error
  }
}
```

### 7.2 Event Listeners

```typescript
// Clean up listeners when component unmounts
useEffect(() => {
  const unlisten = listen('event_name', handler);
  return () => {
    unlisten.then(fn => fn());
  };
}, []);
```

### 7.3 Resource Management

```typescript
// Always check resource availability before heavy operations
const resources = await invoke('get_resource_usage');
if (resources.cpu_percent < 80) {
  // Proceed with operation
}
```

---

**End of API Reference**

For implementation examples, see `DEVELOPMENT_GUIDE.md`.
