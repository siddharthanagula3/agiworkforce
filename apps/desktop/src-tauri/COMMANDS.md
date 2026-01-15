# Tauri Commands Reference

> Complete reference for all Tauri commands exposed to the frontend

## Table of Contents

- [Overview](#overview)
- [AGI Commands](#agi-commands)
- [Chat Commands](#chat-commands)
- [File Operations](#file-operations)
- [LLM Commands](#llm-commands)
- [Browser Automation](#browser-automation)
- [Terminal Commands](#terminal-commands)
- [MCP Commands](#mcp-commands)
- [Security Commands](#security-commands)
- [Complete Command Index](#complete-command-index)

## Overview

All commands follow Tauri's command pattern and return `Result<T, String>` for consistent error handling.

### Invoking Commands

**TypeScript/JavaScript**:
```typescript
import { invoke } from '@tauri-apps/api/core';

// Simple command
const result = await invoke<string>('command_name');

// Command with parameters
const data = await invoke<MyType>('command_name', {
  param1: 'value',
  param2: 123,
});

// Error handling
try {
  const result = await invoke('risky_command');
} catch (error) {
  console.error('Command failed:', error);
}
```

### Event Listening

Many commands emit events for real-time updates:

```typescript
import { listen } from '@tauri-apps/api/event';

const unlisten = await listen('event-name', (event) => {
  console.log('Event payload:', event.payload);
});

// Cleanup
unlisten();
```

## AGI Commands

### `agi_init`

Initialize the AGI system.

**Parameters**:
```typescript
{
  config: {
    max_concurrent_tools: number;
    knowledge_memory_mb: number;
    enable_learning: boolean;
    enable_self_improvement: boolean;
    resource_limits: {
      cpu_percent: number;
      memory_mb: number;
      network_mbps: number;
      storage_mb: number;
    };
    max_planning_depth: number;
    enable_multimodal: boolean;
  }
}
```

**Returns**: `void`

**Example**:
```typescript
await invoke('agi_init', {
  config: {
    max_concurrent_tools: 10,
    knowledge_memory_mb: 1024,
    enable_learning: true,
    enable_self_improvement: true,
    resource_limits: {
      cpu_percent: 80.0,
      memory_mb: 2048,
      network_mbps: 100.0,
      storage_mb: 10240,
    },
    max_planning_depth: 20,
    enable_multimodal: true,
  },
});
```

### `agi_submit_goal`

Submit a goal for AGI processing.

**Parameters**:
```typescript
{
  goal: string;
  priority?: 'Low' | 'Medium' | 'High' | 'Critical';
  constraints?: Array<{
    name: string;
    value: any;
  }>;
  success_criteria?: string[];
}
```

**Returns**:
```typescript
{
  goal_id: string;
  status: 'Pending' | 'Planning' | 'Executing' | 'Completed' | 'Failed';
}
```

**Events**:
- `agi:goal:started` - Goal execution started
- `agi:goal:progress` - Progress update
- `agi:goal:completed` - Goal completed
- `agi:goal:failed` - Goal failed

**Example**:
```typescript
const result = await invoke<{ goal_id: string }>('agi_submit_goal', {
  goal: 'Analyze the codebase and create a refactoring plan',
  priority: 'High',
  constraints: [
    { name: 'time_limit', value: { seconds: 300 } },
  ],
  success_criteria: [
    'Complete codebase analysis',
    'Identify code smells',
    'Prioritize refactoring tasks',
  ],
});

console.log('Goal ID:', result.goal_id);

// Listen for progress
await listen('agi:goal:progress', (event) => {
  console.log('Progress:', event.payload);
});
```

### `agi_submit_goal_parallel`

Submit multiple goals for parallel execution.

**Parameters**:
```typescript
{
  goals: Array<{
    description: string;
    priority?: 'Low' | 'Medium' | 'High' | 'Critical';
  }>;
  coordination_pattern?: 'Independent' | 'Sequential' | 'Pipeline';
}
```

**Returns**:
```typescript
{
  goal_ids: string[];
}
```

**Example**:
```typescript
const result = await invoke('agi_submit_goal_parallel', {
  goals: [
    { description: 'Analyze backend architecture', priority: 'High' },
    { description: 'Review frontend components', priority: 'High' },
    { description: 'Generate documentation', priority: 'Medium' },
  ],
  coordination_pattern: 'Independent',
});
```

### `agi_get_goal_status`

Get the status of a goal.

**Parameters**:
```typescript
{
  goal_id: string;
}
```

**Returns**:
```typescript
{
  goal_id: string;
  status: 'Pending' | 'Planning' | 'Executing' | 'Completed' | 'Failed';
  progress: number; // 0-100
  current_step?: string;
  result?: any;
  error?: string;
}
```

### `agi_cancel_goal`

Cancel a running goal.

**Parameters**:
```typescript
{
  goal_id: string;
}
```

**Returns**: `void`

### `agi_get_reflection_insights`

Get reflection insights from the AGI system.

**Parameters**:
```typescript
{
  goal_id: string;
}
```

**Returns**:
```typescript
{
  insights: Array<{
    type: 'Success' | 'Failure' | 'Improvement';
    description: string;
    confidence: number;
  }>;
}
```

### `agi_get_failure_patterns`

Get common failure patterns identified by the AGI.

**Returns**:
```typescript
{
  patterns: Array<{
    category: string;
    frequency: number;
    examples: string[];
    suggested_fixes: string[];
  }>;
}
```

### `agi_get_recommendations`

Get AI recommendations for improving workflows.

**Returns**:
```typescript
{
  recommendations: Array<{
    title: string;
    description: string;
    priority: number;
    estimated_impact: string;
  }>;
}
```

## Chat Commands

### `chat_send_message`

Send a message in a conversation.

**Parameters**:
```typescript
{
  conversation_id: string;
  content: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  attachments?: Array<{
    type: 'image' | 'file';
    path: string;
  }>;
}
```

**Returns**:
```typescript
{
  message_id: string;
}
```

**Events**:
- `chat:message:chunk` - Streaming response chunk
- `chat:message:complete` - Message completed
- `chat:message:error` - Error occurred

**Example**:
```typescript
const result = await invoke('chat_send_message', {
  conversation_id: 'conv-123',
  content: 'Explain this code',
  attachments: [
    { type: 'file', path: '/path/to/code.js' },
  ],
});

await listen('chat:message:chunk', (event) => {
  const { content } = event.payload;
  // Append to UI
});
```

### `chat_create_conversation`

Create a new conversation.

**Parameters**:
```typescript
{
  title?: string;
  model?: string;
  system_prompt?: string;
}
```

**Returns**:
```typescript
{
  conversation_id: string;
  created_at: number;
}
```

### `chat_get_conversations`

Get all conversations.

**Parameters**:
```typescript
{
  limit?: number;
  offset?: number;
}
```

**Returns**:
```typescript
{
  conversations: Array<{
    id: string;
    title: string;
    created_at: number;
    updated_at: number;
    message_count: number;
  }>;
  total: number;
}
```

### `chat_get_messages`

Get messages in a conversation.

**Parameters**:
```typescript
{
  conversation_id: string;
  limit?: number;
  offset?: number;
}
```

**Returns**:
```typescript
{
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    created_at: number;
    tokens?: number;
  }>;
}
```

### `chat_stop_generation`

Stop current message generation.

**Parameters**:
```typescript
{
  conversation_id: string;
}
```

**Returns**: `void`

### `chat_get_cost_overview`

Get cost overview for all conversations.

**Returns**:
```typescript
{
  total_cost: number;
  total_tokens: number;
  by_model: Record<string, {
    cost: number;
    tokens: number;
    messages: number;
  }>;
}
```

## File Operations

### `file_read`

Read a file's contents.

**Parameters**:
```typescript
{
  path: string;
}
```

**Returns**:
```typescript
{
  content: string;
  encoding: 'utf8' | 'base64';
}
```

**Security**: Requires policy check and may require approval.

**Example**:
```typescript
const { content } = await invoke<{ content: string }>('file_read', {
  path: '/path/to/file.txt',
});
```

### `file_write`

Write content to a file.

**Parameters**:
```typescript
{
  path: string;
  content: string;
  create_directories?: boolean;
}
```

**Returns**: `void`

**Security**: Requires approval for files outside workspace.

### `file_delete`

Delete a file.

**Parameters**:
```typescript
{
  path: string;
}
```

**Returns**: `void`

**Security**: High-risk operation, requires approval.

### `file_rename`

Rename/move a file.

**Parameters**:
```typescript
{
  old_path: string;
  new_path: string;
}
```

**Returns**: `void`

### `file_copy`

Copy a file.

**Parameters**:
```typescript
{
  source: string;
  destination: string;
}
```

**Returns**: `void`

### `file_exists`

Check if a file exists.

**Parameters**:
```typescript
{
  path: string;
}
```

**Returns**:
```typescript
{
  exists: boolean;
}
```

### `file_metadata`

Get file metadata.

**Parameters**:
```typescript
{
  path: string;
}
```

**Returns**:
```typescript
{
  size: number;
  created: number;
  modified: number;
  is_directory: boolean;
  is_file: boolean;
  permissions: string;
}
```

### `dir_list`

List directory contents.

**Parameters**:
```typescript
{
  path: string;
  recursive?: boolean;
}
```

**Returns**:
```typescript
{
  entries: Array<{
    name: string;
    path: string;
    is_directory: boolean;
    size?: number;
  }>;
}
```

### `dir_create`

Create a directory.

**Parameters**:
```typescript
{
  path: string;
  recursive?: boolean;
}
```

**Returns**: `void`

### `dir_delete`

Delete a directory.

**Parameters**:
```typescript
{
  path: string;
  recursive?: boolean;
}
```

**Returns**: `void`

**Security**: Critical operation, always requires approval.

## LLM Commands

### `llm_send_message`

Send a message to an LLM provider.

**Parameters**:
```typescript
{
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  model?: string;
  provider?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}
```

**Returns**:
```typescript
{
  content: string;
  model: string;
  provider: string;
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
  cost: number;
}
```

**Events** (if `stream: true`):
- `llm:stream:chunk` - Content chunk
- `llm:stream:complete` - Stream completed

**Example**:
```typescript
// Non-streaming
const response = await invoke('llm_send_message', {
  messages: [
    { role: 'user', content: 'Hello!' },
  ],
  model: 'gpt-4',
  temperature: 0.7,
});

// Streaming
let fullContent = '';
await listen('llm:stream:chunk', (event) => {
  const { content } = event.payload;
  fullContent += content;
});

await invoke('llm_send_message', {
  messages: [{ role: 'user', content: 'Tell me a story' }],
  stream: true,
});
```

### `llm_configure_provider`

Configure an LLM provider.

**Parameters**:
```typescript
{
  provider: 'openai' | 'anthropic' | 'google' | 'ollama';
  config: {
    api_key?: string;
    base_url?: string;
    organization?: string;
    default_model?: string;
  };
}
```

**Returns**: `void`

### `llm_get_available_models`

Get available models for a provider.

**Parameters**:
```typescript
{
  provider: string;
}
```

**Returns**:
```typescript
{
  models: Array<{
    id: string;
    name: string;
    context_window: number;
    cost_per_1k_input: number;
    cost_per_1k_output: number;
    capabilities: string[];
  }>;
}
```

### `llm_get_usage_stats`

Get LLM usage statistics.

**Parameters**:
```typescript
{
  start_date?: number;
  end_date?: number;
  provider?: string;
}
```

**Returns**:
```typescript
{
  total_requests: number;
  total_tokens: number;
  total_cost: number;
  by_provider: Record<string, {
    requests: number;
    tokens: number;
    cost: number;
  }>;
  by_model: Record<string, {
    requests: number;
    tokens: number;
    cost: number;
  }>;
}
```

## Browser Automation

### `browser_init`

Initialize browser automation.

**Returns**: `void`

### `browser_launch`

Launch a browser instance.

**Parameters**:
```typescript
{
  headless?: boolean;
  viewport?: {
    width: number;
    height: number;
  };
}
```

**Returns**:
```typescript
{
  browser_id: string;
}
```

### `browser_open_tab`

Open a new tab.

**Parameters**:
```typescript
{
  url?: string;
}
```

**Returns**:
```typescript
{
  tab_id: string;
}
```

### `browser_navigate`

Navigate to a URL.

**Parameters**:
```typescript
{
  tab_id: string;
  url: string;
  wait_until?: 'load' | 'domcontentloaded' | 'networkidle';
}
```

**Returns**: `void`

### `browser_click`

Click an element.

**Parameters**:
```typescript
{
  tab_id: string;
  selector: string;
}
```

**Returns**: `void`

**Example**:
```typescript
await invoke('browser_click', {
  tab_id: 'tab-123',
  selector: 'button.submit',
});
```

### `browser_type`

Type text into an element.

**Parameters**:
```typescript
{
  tab_id: string;
  selector: string;
  text: string;
  delay?: number; // milliseconds between keystrokes
}
```

**Returns**: `void`

### `browser_get_text`

Get text content of an element.

**Parameters**:
```typescript
{
  tab_id: string;
  selector: string;
}
```

**Returns**:
```typescript
{
  text: string;
}
```

### `browser_screenshot`

Take a screenshot.

**Parameters**:
```typescript
{
  tab_id: string;
  full_page?: boolean;
  selector?: string;
}
```

**Returns**:
```typescript
{
  data: string; // base64 encoded
  width: number;
  height: number;
}
```

### `browser_evaluate`

Execute JavaScript in the page.

**Parameters**:
```typescript
{
  tab_id: string;
  script: string;
}
```

**Returns**:
```typescript
{
  result: any;
}
```

**Example**:
```typescript
const result = await invoke('browser_evaluate', {
  tab_id: 'tab-123',
  script: 'document.title',
});
console.log('Page title:', result.result);
```

### Semantic Browser Commands

Find elements by semantic meaning instead of selectors.

#### `find_element_semantic`

Find element by description.

**Parameters**:
```typescript
{
  tab_id: string;
  description: string; // e.g., "Submit button", "Email input field"
}
```

**Returns**:
```typescript
{
  selector: string;
  text?: string;
  role?: string;
}
```

#### `click_semantic`

Click element by description.

**Parameters**:
```typescript
{
  tab_id: string;
  description: string;
}
```

**Returns**: `void`

**Example**:
```typescript
// Instead of brittle selectors:
// await invoke('browser_click', { selector: '#submit-btn-2024' });

// Use semantic description:
await invoke('click_semantic', {
  tab_id: 'tab-123',
  description: 'Submit button',
});
```

## Terminal Commands

### `terminal_create_session`

Create a new terminal session.

**Parameters**:
```typescript
{
  shell?: string;
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}
```

**Returns**:
```typescript
{
  session_id: string;
}
```

**Events**:
- `terminal:output` - Terminal output
- `terminal:exit` - Session exited

**Example**:
```typescript
const { session_id } = await invoke('terminal_create_session', {
  cwd: '/path/to/project',
  cols: 80,
  rows: 24,
});

await listen('terminal:output', (event) => {
  const { session_id, data } = event.payload;
  // Render output
});
```

### `terminal_send_input`

Send input to terminal.

**Parameters**:
```typescript
{
  session_id: string;
  data: string;
}
```

**Returns**: `void`

### `terminal_resize`

Resize terminal.

**Parameters**:
```typescript
{
  session_id: string;
  cols: number;
  rows: number;
}
```

**Returns**: `void`

### `terminal_kill`

Kill terminal session.

**Parameters**:
```typescript
{
  session_id: string;
}
```

**Returns**: `void`

### `terminal_ai_suggest_command`

Get AI command suggestion.

**Parameters**:
```typescript
{
  description: string;
  cwd?: string;
}
```

**Returns**:
```typescript
{
  command: string;
  explanation: string;
  safety_warning?: string;
}
```

**Example**:
```typescript
const suggestion = await invoke('terminal_ai_suggest_command', {
  description: 'Find all TypeScript files modified in the last week',
  cwd: '/path/to/project',
});

console.log('Suggested command:', suggestion.command);
// "find . -name '*.ts' -mtime -7"
```

### `terminal_ai_explain_error`

Get AI explanation of terminal error.

**Parameters**:
```typescript
{
  session_id: string;
  error_output: string;
}
```

**Returns**:
```typescript
{
  explanation: string;
  suggested_fixes: string[];
}
```

### `terminal_smart_commit`

Generate smart commit message.

**Parameters**:
```typescript
{
  session_id: string;
}
```

**Returns**:
```typescript
{
  message: string;
  files_changed: string[];
}
```

## MCP Commands

Model Context Protocol integration.

### `mcp_initialize`

Initialize MCP system.

**Returns**: `void`

### `mcp_list_servers`

List all MCP servers.

**Returns**:
```typescript
{
  servers: Array<{
    id: string;
    name: string;
    status: 'connected' | 'disconnected' | 'error';
    tool_count: number;
  }>;
}
```

### `mcp_connect_server`

Connect to an MCP server.

**Parameters**:
```typescript
{
  server_id: string;
}
```

**Returns**: `void`

### `mcp_list_tools`

List tools from MCP servers.

**Parameters**:
```typescript
{
  server_id?: string;
}
```

**Returns**:
```typescript
{
  tools: Array<{
    id: string; // Format: "mcp__{server}__{tool}"
    server_id: string;
    name: string;
    description: string;
    parameters: Record<string, any>;
  }>;
}
```

### `mcp_call_tool`

Call an MCP tool.

**Parameters**:
```typescript
{
  tool_id: string;
  parameters: Record<string, any>;
}
```

**Returns**:
```typescript
{
  result: any;
  error?: string;
}
```

**Example**:
```typescript
// List GitHub repositories via MCP
const result = await invoke('mcp_call_tool', {
  tool_id: 'mcp__github__list_repos',
  parameters: {
    username: 'octocat',
  },
});

console.log('Repositories:', result.result);
```

### `mcp_set_credential`

Store credentials for MCP server.

**Parameters**:
```typescript
{
  server_name: string;
  key: string;
  value: string;
}
```

**Returns**: `void`

**Security**: Credentials are encrypted using machine-derived keys.

### `mcp_delete_credential`

Delete stored credentials.

**Parameters**:
```typescript
{
  server_name: string;
  key: string;
}
```

**Returns**: `void`

## Security Commands

### `approve_operation`

Approve a pending operation.

**Parameters**:
```typescript
{
  request_id: string;
  reason?: string;
}
```

**Returns**: `void`

### `reject_operation`

Reject a pending operation.

**Parameters**:
```typescript
{
  request_id: string;
  reason: string;
}
```

**Returns**: `void`

### `get_audit_events`

Get audit log events.

**Parameters**:
```typescript
{
  start_time?: number;
  end_time?: number;
  event_type?: string;
  user_id?: string;
  limit?: number;
  offset?: number;
}
```

**Returns**:
```typescript
{
  events: Array<{
    id: string;
    timestamp: number;
    user_id: string;
    event_type: string;
    resource: string;
    action: string;
    status: 'success' | 'failure';
    details: any;
  }>;
  total: number;
}
```

### `verify_audit_integrity`

Verify audit log integrity.

**Returns**:
```typescript
{
  total_events: number;
  verified_events: number;
  tampered_events: string[];
  is_valid: boolean;
}
```

## Complete Command Index

### AGI & Agents
- `agi_init` - Initialize AGI system
- `agi_submit_goal` - Submit goal for processing
- `agi_submit_goal_parallel` - Submit multiple goals
- `agi_get_goal_status` - Get goal status
- `agi_cancel_goal` - Cancel goal
- `agi_get_reflection_insights` - Get reflection insights
- `agi_get_failure_patterns` - Get failure patterns
- `agi_get_recommendations` - Get AI recommendations
- `agent_init` - Initialize agent
- `agent_submit_task` - Submit task to agent
- `agent_get_task_status` - Get task status
- `start_agent_task` - Start autonomous task

### Chat & Messaging
- `chat_create_conversation` - Create conversation
- `chat_get_conversations` - List conversations
- `chat_get_conversation` - Get single conversation
- `chat_update_conversation` - Update conversation
- `chat_delete_conversation` - Delete conversation
- `chat_create_message` - Create message
- `chat_get_messages` - Get messages
- `chat_send_message` - Send message (streaming)
- `chat_stop_generation` - Stop generation
- `chat_get_cost_overview` - Get cost overview
- `chat_set_monthly_budget` - Set budget

### File Operations
- `file_read` - Read file
- `file_write` - Write file
- `file_delete` - Delete file
- `file_rename` - Rename file
- `file_copy` - Copy file
- `file_move` - Move file
- `file_exists` - Check existence
- `file_metadata` - Get metadata
- `dir_list` - List directory
- `dir_create` - Create directory
- `dir_delete` - Delete directory
- `fs_search_files` - Search files
- `fs_get_workspace_files` - Get workspace files

### LLM & Providers
- `llm_send_message` - Send LLM message
- `llm_configure_provider` - Configure provider
- `llm_set_default_provider` - Set default
- `llm_get_available_models` - List models
- `llm_get_usage_stats` - Get usage stats
- `router_suggestions` - Get routing suggestions

### Browser Automation
- `browser_init` - Initialize browser
- `browser_launch` - Launch browser
- `browser_open_tab` - Open tab
- `browser_navigate` - Navigate
- `browser_click` - Click element
- `browser_type` - Type text
- `browser_get_text` - Get text
- `browser_screenshot` - Screenshot
- `browser_evaluate` - Execute JavaScript
- `find_element_semantic` - Find by description
- `click_semantic` - Click by description

### Terminal
- `terminal_create_session` - Create session
- `terminal_send_input` - Send input
- `terminal_resize` - Resize
- `terminal_kill` - Kill session
- `terminal_ai_suggest_command` - AI suggestion
- `terminal_ai_explain_error` - Explain error
- `terminal_smart_commit` - Smart commit

### MCP (Model Context Protocol)
- `mcp_initialize` - Initialize MCP
- `mcp_list_servers` - List servers
- `mcp_connect_server` - Connect server
- `mcp_disconnect_server` - Disconnect server
- `mcp_list_tools` - List tools
- `mcp_call_tool` - Call tool
- `mcp_set_credential` - Store credential
- `mcp_delete_credential` - Delete credential
- `mcp_get_health` - Health status

### Security & Audit
- `approve_operation` - Approve request
- `reject_operation` - Reject request
- `get_audit_events` - Get audit log
- `verify_audit_integrity` - Verify integrity
- `auth_login` - Login
- `auth_store_session` - Store session
- `auth_retrieve_session` - Retrieve session

### Automation
- `automation_record_start` - Start recording
- `automation_record_stop` - Stop recording
- `automation_save_script` - Save script
- `automation_execute_script` - Execute script
- `automation_click` - Perform click
- `automation_type` - Type text
- `automation_screenshot` - Take screenshot
- `automation_ocr` - Perform OCR

### Git Operations
- `git_init` - Initialize repo
- `git_status` - Get status
- `git_add` - Stage files
- `git_commit` - Create commit
- `git_push` - Push changes
- `git_pull` - Pull changes
- `git_clone` - Clone repo
- `git_checkout` - Checkout branch
- `git_create_branch` - Create branch

### Documents
- `document_read` - Read document
- `document_create_pdf` - Create PDF
- `document_create_word` - Create Word
- `document_create_excel` - Create Excel

### Settings
- `settings_v2_get` - Get setting
- `settings_v2_set` - Set setting
- `settings_v2_delete` - Delete setting
- `settings_v2_get_batch` - Get multiple
- `settings_v2_get_category` - Get category

And 100+ more commands for workflows, teams, analytics, calendar, email, cloud storage, and more.

## Best Practices

### Error Handling

Always wrap commands in try-catch:
```typescript
try {
  const result = await invoke('command_name', params);
  // Handle success
} catch (error) {
  console.error('Command failed:', error);
  // Show user-friendly error
}
```

### Event Cleanup

Always unlisten from events:
```typescript
const unlisten = await listen('event-name', handler);

// Later...
unlisten();
```

### Type Safety

Use TypeScript types for better IDE support:
```typescript
interface CommandResult {
  success: boolean;
  data: any;
}

const result = await invoke<CommandResult>('command_name');
```

### Streaming Responses

For long-running operations, use streaming:
```typescript
let fullResponse = '';

const unlisten = await listen('stream:chunk', (event) => {
  fullResponse += event.payload.content;
  updateUI(fullResponse);
});

await invoke('streaming_command', params);

// Cleanup
unlisten();
```

## Security Considerations

1. **File Operations**: Always validate paths, may require approval
2. **Shell Commands**: High risk, always require approval
3. **Network Requests**: Subject to rate limiting
4. **Database Operations**: Parameterized queries prevent injection
5. **Browser Automation**: Sandboxed execution
6. **MCP Tools**: Credentials encrypted at rest

## Further Reading

- [Tauri Command Documentation](https://tauri.app/v2/reference/javascript/api/)
- [Rust Backend Architecture](./RUST_ARCHITECTURE.md)
- [Security Documentation](./SECURITY.md)
