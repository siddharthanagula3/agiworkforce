# Tauri Command Type Reference

> Complete reference for Tauri command type signatures used in AGI Workforce

## Overview

Tauri commands bridge the Rust backend with the TypeScript frontend. Types must be kept in sync between both languages to ensure type safety across the FFI boundary.

## Naming Conventions

| Rust                     | TypeScript               | Notes                                            |
| ------------------------ | ------------------------ | ------------------------------------------------ |
| `snake_case`             | `camelCase`              | Field names are automatically converted by serde |
| `pub struct ChatRequest` | `interface ChatRequest`  | Types should have matching names                 |
| `Option<T>`              | `T \| undefined` or `T?` | Rust Option maps to optional TypeScript fields   |
| `Vec<T>`                 | `T[]`                    | Rust Vec maps to TypeScript array                |
| `String`                 | `string`                 | Direct mapping                                   |
| `i32, i64, u32, u64`     | `number`                 | All numeric types map to number                  |
| `f32, f64`               | `number`                 | Floating point maps to number                    |
| `bool`                   | `boolean`                | Direct mapping                                   |

## Core Command Patterns

### 1. Authentication Commands

#### Rust

```rust
// apps/desktop/src-tauri/src/sys/commands/auth.rs

#[tauri::command]
pub async fn auth_sign_in(
    email: String,
    password: String,
) -> Result<AuthResponse, String> {
    // Implementation
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: i64,
}
```

#### TypeScript

```typescript
// apps/desktop/src/api/auth.ts

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

async function signIn(email: string, password: string): Promise<AuthResponse> {
  return await invoke<AuthResponse>('auth_sign_in', {
    email,
    password,
  });
}
```

### 2. Chat Commands

#### Rust

```rust
// apps/desktop/src-tauri/src/sys/commands/chat/mod.rs

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatSendMessageRequest {
    #[serde(default, alias = "conversationId")]
    pub conversation_id: Option<i64>,
    #[serde(alias = "userId")]
    pub user_id: String,
    pub content: String,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default, alias = "preferCloudCredits")]
    pub prefer_cloud_credits: bool,
}

#[tauri::command]
pub async fn chat_send_message(
    request: ChatSendMessageRequest,
    db: State<'_, AppDatabase>,
) -> Result<ChatSendMessageResponse, String> {
    // Implementation
}
```

#### TypeScript

```typescript
// apps/desktop/src/types/chat.ts

export interface ChatSendMessageRequest {
  conversationId?: number;
  userId: string;
  content: string;
  provider?: string;
  model?: string;
  preferCloudCredits?: boolean;
}

export interface ChatSendMessageResponse {
  conversation: Conversation;
  user_message: Message;
  assistant_message: Message;
  stats: ConversationStats;
  credits?: CreditsInfo;
}

// Usage
const response = await invoke<ChatSendMessageResponse>('chat_send_message', {
  userId: user.id,
  content: 'Hello!',
  conversationId: 123,
  preferCloudCredits: true,
});
```

### 3. LLM Router Commands

#### Rust

```rust
// apps/desktop/src-tauri/src/sys/commands/llm.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMSendMessageRequest {
    pub messages: Vec<ChatMessage>,
    pub model: Option<String>,
    pub provider: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    #[serde(default)]
    pub prefer_cloud_credits: bool,
}

#[tauri::command]
pub async fn llm_send_message(
    request: LLMSendMessageRequest,
    state: State<'_, LLMState>,
) -> Result<LLMResponse, String> {
    // Implementation
}

#[tauri::command]
pub async fn llm_configure_provider(
    provider: String,
    api_key: Option<String>,
    base_url: Option<String>,
    state: State<'_, LLMState>,
) -> Result<(), String> {
    // Implementation
}

#[tauri::command]
pub async fn llm_get_available_models(
    state: State<'_, LLMState>,
) -> Result<Vec<ModelInfo>, String> {
    // Implementation
}
```

#### TypeScript

```typescript
// apps/desktop/src/api/llm.ts

export interface LLMSendMessageRequest {
  messages: ChatMessage[];
  model?: string;
  provider?: string;
  temperature?: number;
  maxTokens?: number;
  preferCloudCredits?: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  available: boolean;
}

// Configure provider
await invoke('llm_configure_provider', {
  provider: 'ollama',
  apiKey: null,
  baseUrl: 'http://localhost:11434',
});

// Send message
const response = await invoke<LLMResponse>('llm_send_message', {
  request: {
    messages: [{ role: 'user', content: 'Hello' }],
    provider: 'ollama',
    model: 'llama2',
  },
});

// Get models
const models = await invoke<ModelInfo[]>('llm_get_available_models');
```

### 4. MCP Commands

#### Rust

```rust
// apps/desktop/src-tauri/src/sys/commands/mcp.rs

#[tauri::command]
pub async fn mcp_list_servers() -> Result<Vec<McpServerInfo>, String> {
    // Implementation
}

#[tauri::command]
pub async fn mcp_connect_server(server_name: String) -> Result<(), String> {
    // Implementation
}

#[tauri::command]
pub async fn mcp_execute_tool(
    tool_id: String,
    parameters: serde_json::Value,
) -> Result<McpToolResult, String> {
    // Implementation
}

#[tauri::command]
pub async fn mcp_set_credential(
    server_name: String,
    key: String,
    value: String,
) -> Result<(), String> {
    // Implementation
}

#[derive(Serialize)]
pub struct McpServerInfo {
    pub name: String,
    pub enabled: bool,
    pub connected: bool,
    pub tool_count: usize,
    pub command: Option<String>,
}
```

#### TypeScript

```typescript
// apps/desktop/src/types/mcp.ts

export interface McpServerInfo {
  name: string;
  enabled: boolean;
  connected: boolean;
  toolCount: number;
  command?: string;
}

export interface McpToolResult {
  success: boolean;
  data: unknown;
  error?: string;
}

// List servers
const servers = await invoke<McpServerInfo[]>('mcp_list_servers');

// Connect to server
await invoke('mcp_connect_server', { serverName: 'github' });

// Execute tool
const result = await invoke<McpToolResult>('mcp_execute_tool', {
  toolId: 'mcp__github__create_issue',
  parameters: {
    title: 'Bug report',
    body: 'Description',
  },
});

// Store credential
await invoke('mcp_set_credential', {
  serverName: 'github',
  key: 'token',
  value: 'ghp_xxxxx',
});
```

### 5. File Operations

#### Rust

```rust
// apps/desktop/src-tauri/src/sys/commands/file_ops.rs

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
pub async fn list_directory(path: String) -> Result<Vec<String>, String> {
    let entries = std::fs::read_dir(&path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut files = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        files.push(entry.file_name().to_string_lossy().to_string());
    }
    Ok(files)
}
```

#### TypeScript

```typescript
// apps/desktop/src/api/files.ts

async function readFile(path: string): Promise<string> {
  return await invoke<string>('read_file', { path });
}

async function writeFile(path: string, content: string): Promise<void> {
  await invoke('write_file', { path, content });
}

async function listDirectory(path: string): Promise<string[]> {
  return await invoke<string[]>('list_directory', { path });
}
```

### 6. Settings Commands

#### Rust

```rust
// apps/desktop/src-tauri/src/sys/commands/settings.rs

#[derive(Debug, Serialize, Deserialize)]
pub struct Settings {
    pub llm_config: LLMConfig,
    pub window_preferences: WindowPreferences,
    pub chat_preferences: ChatPreferences,
    pub allowed_directories: Vec<String>,
}

#[tauri::command]
pub async fn settings_load() -> Result<Settings, String> {
    // Implementation
}

#[tauri::command]
pub async fn settings_save(settings: Settings) -> Result<(), String> {
    // Implementation
}
```

#### TypeScript

```typescript
// apps/desktop/src/types/settings.ts

export interface Settings {
  llmConfig: LLMConfig;
  windowPreferences: WindowPreferences;
  chatPreferences: ChatPreferences;
  allowedDirectories: string[];
}

// Load settings
const settings = await invoke<Settings>('settings_load');

// Save settings
await invoke('settings_save', { settings });
```

## Type Validation Patterns

### Rust-Side Validation

```rust
// apps/desktop/src-tauri/src/sys/commands/chat/types.rs

pub const MAX_CONTENT_LENGTH: usize = 1024 * 1024; // 1MB
pub const MAX_TITLE_LENGTH: usize = 500;

pub trait Validate {
    fn validate(&self) -> Result<(), ValidationError>;
}

impl Validate for ChatSendMessageRequest {
    fn validate(&self) -> Result<(), ValidationError> {
        if self.content.len() > MAX_CONTENT_LENGTH {
            return Err(ValidationError {
                field: "content".to_string(),
                message: "Content exceeds maximum length".to_string(),
            });
        }
        if self.user_id.is_empty() {
            return Err(ValidationError {
                field: "user_id".to_string(),
                message: "User ID cannot be empty".to_string(),
            });
        }
        Ok(())
    }
}

#[tauri::command]
pub async fn chat_send_message(
    request: ChatSendMessageRequest,
) -> Result<ChatSendMessageResponse, String> {
    // Validate input
    request.validate().map_err(|e| e.to_string())?;

    // Process request
    // ...
}
```

### TypeScript-Side Validation

```typescript
// apps/desktop/src/utils/validation.ts

export const MAX_CONTENT_LENGTH = 1024 * 1024; // 1MB
export const MAX_TITLE_LENGTH = 500;

export function validateChatRequest(request: ChatSendMessageRequest): string | null {
  if (!request.content || request.content.length === 0) {
    return 'Content cannot be empty';
  }
  if (request.content.length > MAX_CONTENT_LENGTH) {
    return `Content exceeds maximum length of ${MAX_CONTENT_LENGTH} bytes`;
  }
  if (!request.userId || request.userId.length === 0) {
    return 'User ID is required';
  }
  return null;
}

// Usage
const error = validateChatRequest(request);
if (error) {
  throw new Error(error);
}

const response = await invoke<ChatSendMessageResponse>('chat_send_message', request);
```

## Error Handling

### Rust Error Responses

```rust
// Return standardized error codes
#[tauri::command]
pub async fn some_command() -> Result<Response, String> {
    // Authentication error
    if !is_authenticated() {
        return Err("[ERR_AUTH_REQUIRED] Please sign in".to_string());
    }

    // Billing/quota error
    if !has_credits() {
        return Err("[ERR_BILLING_QUOTA] Insufficient credits".to_string());
    }

    // Rate limit error
    if is_rate_limited() {
        return Err("[ERR_RATE_LIMIT] Rate limit exceeded".to_string());
    }

    // Network error
    if connection_failed() {
        return Err("[ERR_NETWORK_TIMEOUT] Request timed out".to_string());
    }

    Ok(response)
}
```

### TypeScript Error Handling

```typescript
// Parse error codes
async function handleCommand<T>(command: string, args: unknown): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    const message = String(error);

    if (message.includes('[ERR_AUTH_REQUIRED]')) {
      // Redirect to login
      window.location.href = '/login';
      throw new Error('Authentication required');
    }

    if (message.includes('[ERR_BILLING_QUOTA]')) {
      // Show upgrade modal
      showUpgradeModal();
      throw new Error('Insufficient credits');
    }

    if (message.includes('[ERR_RATE_LIMIT]')) {
      // Show rate limit message
      showRateLimitMessage();
      throw new Error('Rate limit exceeded');
    }

    // Generic error
    throw new Error(message);
  }
}
```

## Event Emission

### Rust Event Emission

```rust
use tauri::Manager;

#[tauri::command]
pub async fn start_long_operation(
    app: tauri::AppHandle,
) -> Result<(), String> {
    // Emit progress events
    app.emit_all("operation:progress", ProgressPayload {
        percent: 25,
        message: "Processing...".to_string(),
    }).ok();

    // Do work...

    // Emit completion event
    app.emit_all("operation:complete", CompletePayload {
        success: true,
        data: result,
    }).ok();

    Ok(())
}
```

### TypeScript Event Listening

```typescript
import { listen } from '@tauri-apps/api/event';

interface ProgressPayload {
  percent: number;
  message: string;
}

interface CompletePayload {
  success: boolean;
  data: unknown;
}

// Listen to progress
const unlistenProgress = await listen<ProgressPayload>('operation:progress', (event) => {
  console.log(`Progress: ${event.payload.percent}%`);
  console.log(`Message: ${event.payload.message}`);
});

// Listen to completion
const unlistenComplete = await listen<CompletePayload>('operation:complete', (event) => {
  if (event.payload.success) {
    console.log('Operation completed:', event.payload.data);
  }
});

// Cleanup
unlistenProgress();
unlistenComplete();
```

## Best Practices

### 1. Always Use Type Aliases for Rust Types

```rust
// Define once, use everywhere
pub type UserId = String;
pub type ConversationId = i64;

#[derive(Serialize)]
pub struct Message {
    pub id: i64,
    pub user_id: UserId,
    pub conversation_id: ConversationId,
}
```

### 2. Document Field Constraints

```rust
/// Chat message request
#[derive(Deserialize)]
pub struct ChatRequest {
    /// User identifier (max 256 characters)
    pub user_id: String,

    /// Message content (max 1MB)
    pub content: String,

    /// Optional conversation ID for context
    pub conversation_id: Option<i64>,
}
```

```typescript
/**
 * Chat message request
 */
export interface ChatRequest {
  /** User identifier (max 256 characters) */
  userId: string;

  /** Message content (max 1,048,576 bytes) */
  content: string;

  /** Optional conversation ID for context */
  conversationId?: number;
}
```

### 3. Keep Rust and TypeScript Types in Sync

Use a script to generate TypeScript types from Rust types, or manually review both when making changes.

### 4. Use Serde Aliases for Compatibility

```rust
#[derive(Serialize, Deserialize)]
pub struct Request {
    #[serde(alias = "userId")] // Accept camelCase from TS
    pub user_id: String,

    #[serde(rename = "preferCloudCredits")] // Always use camelCase
    pub prefer_cloud_credits: bool,
}
```

### 5. Version Your API

```rust
#[tauri::command]
pub async fn api_v2_some_command() -> Result<Response, String> {
    // Implementation
}
```

```typescript
// Client code
const response = await invoke<Response>('api_v2_some_command');
```

## Testing Type Compatibility

```typescript
// Type test file
import type { ChatRequest } from '../types/chat';

// Compile-time type tests
const validRequest: ChatRequest = {
  userId: '123',
  content: 'Hello',
  conversationId: 456,
};

// This should cause a type error:
// const invalid: ChatRequest = {
//   userId: 123, // ❌ number is not assignable to string
//   content: 'Hello'
// };
```

---

**Last Updated**: 2026-01-15
**See Also**: [TYPE_SYSTEM.md](./TYPE_SYSTEM.md), [TYPE_QUICK_REFERENCE.md](./TYPE_QUICK_REFERENCE.md)
