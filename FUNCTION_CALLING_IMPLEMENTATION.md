# Function Calling (Tool Use) Implementation Summary

## Overview

This document describes the comprehensive implementation of function calling (tool use) across all LLM providers, enabling LLMs to invoke AGI tools during reasoning.

## Implementation Status

- ✅ Extended LLMRequest and LLMResponse types
- ✅ OpenAI function calling support (COMPLETE)
- ⚠️ Anthropic tool use support (NEEDS COMPLETION)
- ⚠️ Google function calling support (NEEDS COMPLETION)
- ✅ Tool executor bridge created (STUB IMPLEMENTATION)
- ⚠️ Chat commands update (COMPILATION ERRORS TO FIX)

---

## 1. Core Type Extensions

### File: `apps/desktop/src-tauri/src/router/mod.rs`

**Lines 13-23**: Extended `LLMRequest`

```rust
pub struct LLMRequest {
    pub messages: Vec<ChatMessage>,
    pub model: String,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<ToolDefinition>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_choice: Option<ToolChoice>,
}
```

**Lines 25-33**: Extended `ChatMessage`

```rust
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}
```

**Lines 35-53**: Extended `LLMResponse`

```rust
pub struct LLMResponse {
    pub content: String,
    // ... existing fields ...
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finish_reason: Option<String>,
}
```

**Lines 55-83**: New types

```rust
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value, // JSON Schema
}

pub enum ToolChoice {
    Auto,
    Required,
    None,
    Specific(String),
}

pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: String, // JSON string
}
```

---

## 2. OpenAI Function Calling

### File: `apps/desktop/src-tauri/src/router/providers/openai.rs`

**COMPLETE IMPLEMENTATION** - Lines 1-363

Key features:

- **Lines 9-20**: Extended `OpenAIMessage` to support tool calls
- **Lines 22-64**: New types for `OpenAIToolCall`, `OpenAITool`, `OpenAIToolChoiceValue`
- **Lines 136-161**: Conversion methods `convert_tools()`, `convert_tool_choice()`, `convert_tool_calls()`
- **Lines 178-295**: Updated `send_message()` with full tool support
  - Converts tools to OpenAI format
  - Handles tool call responses
  - Parses function arguments
  - Returns tool calls in response

**Usage Example:**

```rust
let request = LLMRequest {
    messages: vec![ChatMessage {
        role: "user".to_string(),
        content: "Read the file config.json".to_string(),
        tool_calls: None,
        tool_call_id: None,
    }],
    model: "gpt-4o".to_string(),
    tools: Some(vec![ToolDefinition {
        name: "file_read".to_string(),
        description: "Read content from a file".to_string(),
        parameters: json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the file"
                }
            },
            "required": ["path"]
        }),
    }]),
    tool_choice: Some(ToolChoice::Auto),
    // ... other fields
};
```

---

## 3. Anthropic Tool Use

### File: `apps/desktop/src-tauri/src/router/providers/anthropic.rs`

**STATUS**: Needs implementation (current file only has basic text support)

**Required changes:**

1. **Add content block types** (similar to OpenAI):

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
enum AnthropicContentBlock {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        tool_use_id: String,
        content: String,
    },
}
```

2. **Update `AnthropicMessage`** to use content blocks:

```rust
struct AnthropicMessage {
    role: String,
    content: AnthropicMessageContent, // String or Blocks
}
```

3. **Add tool definitions**:

```rust
struct AnthropicTool {
    name: String,
    description: String,
    input_schema: serde_json::Value,
}
```

4. **Update request to include tools**:

```rust
struct AnthropicRequest {
    // ... existing fields ...
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<AnthropicTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_choice: Option<AnthropicToolChoice>,
}
```

5. **Key differences from OpenAI:**
   - Anthropic uses **content blocks** instead of separate fields
   - Tool results must be sent as **user messages** with `tool_result` blocks
   - Tool choice uses `"type": "auto"` or `"type": "any"` (not "required")

**Reference implementation:** See STUB in this document's appendix

---

## 4. Google Function Calling

### File: `apps/desktop/src-tauri/src/router/providers/google.rs`

**STATUS**: Needs implementation

**Required changes:**

1. **Add function declaration types**:

```rust
#[derive(Debug, Clone, Serialize)]
struct GoogleFunctionDeclaration {
    name: String,
    description: String,
    parameters: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
struct GoogleTool {
    function_declarations: Vec<GoogleFunctionDeclaration>,
}
```

2. **Update request**:

```rust
struct GoogleRequest {
    // ... existing fields ...
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<GoogleTool>>,
}
```

3. **Handle function call responses**:

```rust
#[derive(Debug, Clone, Deserialize)]
struct GoogleFunctionCall {
    name: String,
    args: serde_json::Value,
}
```

4. **Key differences:**
   - Uses `function_declarations` wrapped in `tools` array
   - Function calls returned in `functionCall` field
   - Arguments are JSON object (not string like OpenAI)

---

## 5. Tool Executor Bridge

### File: `apps/desktop/src-tauri/src/router/tool_executor.rs` ✅

**CREATED** - Lines 1-297

**Key functionality:**

- **Lines 11-16**: `ToolExecutor` struct with `ToolRegistry` reference
- **Lines 18-30**: `get_tool_definitions()` - Converts AGI tools to LLM format
- **Lines 32-51**: `convert_tool_to_definition()` - Builds JSON schemas
- **Lines 53-66**: `get_json_schema_type()` - Maps parameter types
- **Lines 68-81**: `execute_tool_call()` - Main execution entry point
- **Lines 83-265**: `execute_tool_impl()` - Stub dispatcher (needs MCP integration)
- **Lines 267-274**: `format_tool_result()` - Formats results for LLM

**Current status:** Stub implementation returns "not yet implemented" errors. Needs connection to actual MCP modules.

**Usage:**

```rust
let executor = ToolExecutor::new(tool_registry);

// Get tool definitions for LLM
let tools = executor.get_tool_definitions(Some(vec![
    "file_read".to_string(),
    "ui_click".to_string(),
]));

// Execute a tool call from LLM
let result = executor.execute_tool_call(&tool_call).await?;
let formatted = executor.format_tool_result(&tool_call, &result);
```

---

## 6. Chat Commands Integration

### File: `apps/desktop/src-tauri/src/commands/chat.rs`

**STATUS**: Has compilation errors - needs fixes

**Required fixes:**

1. **Line 260**: Add missing fields to `ChatMessage` construction:

```rust
.map(|message| RouterChatMessage {
    role: message.role.as_str().to_string(),
    content: message.content.clone(),
    tool_calls: None,         // ADD THIS
    tool_call_id: None,        // ADD THIS
})
```

2. **Line 266**: Add missing fields to `LLMRequest` construction:

```rust
let llm_request = LLMRequest {
    messages: router_messages,
    model: request.model.clone().unwrap_or_else(|| "gpt-4o-mini".to_string()),
    temperature: None,
    max_tokens: None,
    stream: false,
    tools: None,              // ADD THIS
    tool_choice: None,        // ADD THIS
};
```

3. **Line 312**: Add missing fields to cached `LLMResponse`:

```rust
let response = LLMResponse {
    content: entry.response.clone(),
    tokens,
    prompt_tokens: tokens,
    completion_tokens: None,
    cost: entry.cost,
    model: entry.model.clone(),
    cached: true,
    tool_calls: None,         // ADD THIS
    finish_reason: None,      // ADD THIS
};
```

**Additional changes needed for tool execution loop:**

4. **Add tool execution logic** (new code after line 373):

```rust
// Check if LLM wants to call tools
if let Some(tool_calls) = &outcome.response.tool_calls {
    // Create tool executor
    let executor = ToolExecutor::new(/* tool_registry */);

    // Execute each tool call
    for tool_call in tool_calls {
        let result = executor.execute_tool_call(tool_call).await
            .map_err(|e| e.to_string())?;

        let formatted_result = executor.format_tool_result(tool_call, &result);

        // Add tool result to conversation
        let tool_message = ChatMessage {
            role: "tool".to_string(),
            content: formatted_result,
            tool_calls: None,
            tool_call_id: Some(tool_call.id.clone()),
        };

        // Continue conversation with tool result
        // (requires recursive call or loop)
    }
}
```

---

## 7. Additional Files Needing Updates

### File: `apps/desktop/src-tauri/src/commands/llm.rs`

**Line 65**: Fix `LLMRequest` initialization:

```rust
let request = LLMRequest {
    // ... existing fields ...
    tools: None,
    tool_choice: None,
};
```

### File: `apps/desktop/src-tauri/src/agent/planner.rs`

**Lines 101-102**: Fix `LLMRequest` and `ChatMessage` initialization

### File: `apps/desktop/src-tauri/src/agi/planner.rs`

**Lines 154-155**: Fix `LLMRequest` and `ChatMessage` initialization

---

## 8. Testing Strategy

### Unit Tests

1. **Tool definition conversion** (`tool_executor.rs`):

```rust
#[test]
fn test_convert_tool_to_definition() {
    let tool = Tool {
        id: "test_tool".to_string(),
        name: "Test Tool".to_string(),
        parameters: vec![
            ToolParameter {
                name: "param1".to_string(),
                parameter_type: ParameterType::String,
                required: true,
                description: "Test parameter".to_string(),
                default: None,
            },
        ],
        // ... other fields
    };

    let executor = ToolExecutor::new(registry);
    let definition = executor.convert_tool_to_definition(&tool);

    assert_eq!(definition.name, "test_tool");
    // ... assertions
}
```

2. **OpenAI function calling** (`providers/openai.rs`):

```rust
#[tokio::test]
async fn test_openai_function_calling() {
    let provider = OpenAIProvider::new("test-key".to_string());

    let request = LLMRequest {
        messages: vec![/* ... */],
        tools: Some(vec![/* ... */]),
        tool_choice: Some(ToolChoice::Auto),
        // ... other fields
    };

    let response = provider.send_message(&request).await.unwrap();

    // Assert tool calls are present
    assert!(response.tool_calls.is_some());
}
```

### Integration Tests

1. **Multi-turn tool execution**:

```rust
#[tokio::test]
async fn test_multi_turn_tool_execution() {
    // 1. User asks to read file
    // 2. LLM calls file_read tool
    // 3. Tool executor runs and returns content
    // 4. LLM receives result and responds to user
}
```

2. **Tool execution with approval**:

```rust
#[tokio::test]
async fn test_tool_execution_with_user_approval() {
    // Test user approval workflow for sensitive operations
}
```

---

## 9. Deployment Checklist

- [ ] Fix all compilation errors in `chat.rs`, `llm.rs`, `planner.rs`
- [ ] Complete Anthropic tool use implementation
- [ ] Complete Google function calling implementation
- [ ] Implement actual MCP connections in `tool_executor.rs`
- [ ] Add tool execution loop to `chat_send_message`
- [ ] Implement user approval UI for tool calls
- [ ] Add structured logging for tool invocations
- [ ] Write unit tests for all providers
- [ ] Write integration tests for multi-turn execution
- [ ] Update TypeScript types in `packages/types/`
- [ ] Add UI components to display tool calls
- [ ] Document tool use in user-facing docs

---

## 10. Example End-to-End Flow

```rust
// 1. User sends message
let user_msg = ChatMessage {
    role: "user".to_string(),
    content: "Read config.json and tell me the API key".to_string(),
    tool_calls: None,
    tool_call_id: None,
};

// 2. Create request with tools
let tools = tool_executor.get_tool_definitions(Some(vec!["file_read".to_string()]));

let request = LLMRequest {
    messages: vec![user_msg],
    model: "gpt-4o".to_string(),
    tools: Some(tools),
    tool_choice: Some(ToolChoice::Auto),
    // ... other fields
};

// 3. LLM responds with tool call
let response = router.send_message(&request).await?;

if let Some(tool_calls) = &response.tool_calls {
    for tool_call in tool_calls {
        // 4. Execute tool
        let result = tool_executor.execute_tool_call(tool_call).await?;

        // 5. Send result back to LLM
        let tool_result_msg = ChatMessage {
            role: "tool".to_string(),
            content: tool_executor.format_tool_result(tool_call, &result),
            tool_calls: None,
            tool_call_id: Some(tool_call.id.clone()),
        };

        // 6. LLM processes result and responds
        let final_request = LLMRequest {
            messages: vec![user_msg, assistant_msg_with_tool_call, tool_result_msg],
            // ... same config as before
        };

        let final_response = router.send_message(&final_request).await?;

        // 7. Return final answer to user
        return Ok(final_response.content);
    }
}
```

---

## 11. File References Summary

| File                            | Lines               | Status        | Description             |
| ------------------------------- | ------------------- | ------------- | ----------------------- |
| `router/mod.rs`                 | 13-83               | ✅ Complete   | Core type definitions   |
| `router/providers/openai.rs`    | 1-363               | ✅ Complete   | OpenAI function calling |
| `router/providers/anthropic.rs` | All                 | ⚠️ Needs work | Anthropic tool use      |
| `router/providers/google.rs`    | All                 | ⚠️ Needs work | Google function calling |
| `router/tool_executor.rs`       | 1-297               | ✅ Stub       | Tool execution bridge   |
| `commands/chat.rs`              | 260, 266, 312, 373+ | ⚠️ Errors     | Chat integration        |
| `commands/llm.rs`               | 65                  | ⚠️ Error      | LLM command             |
| `agent/planner.rs`              | 101-102             | ⚠️ Error      | Agent planner           |
| `agi/planner.rs`                | 154-155             | ⚠️ Error      | AGI planner             |

---

## 12. Next Steps

1. **IMMEDIATE**: Fix compilation errors
   - Update all `ChatMessage` and `LLMRequest` constructors
   - Add missing `tool_calls` and `finish_reason` fields

2. **SHORT-TERM**: Complete provider implementations
   - Finish Anthropic tool use
   - Implement Google function calling
   - Test each provider independently

3. **MEDIUM-TERM**: Connect to MCPs
   - Wire up `tool_executor` to actual filesystem, automation, etc.
   - Implement security checks and user approval
   - Add proper error handling and logging

4. **LONG-TERM**: Production readiness
   - Multi-turn execution loop
   - Streaming with tool calls
   - Cost tracking for tool usage
   - UI components for tool call visibility

---

## Appendix: Anthropic Implementation Stub

See the full implementation at lines 1-340 in the attempted write to `anthropic.rs`. Key points:

- Uses content blocks instead of separate fields
- Tool results sent as user messages with `tool_result` blocks
- `stop_reason: "tool_use"` mapped to `finish_reason: "tool_calls"`
- `tool_choice` uses `"type": "auto"` or `"type": "any"`

Complete implementation requires updating the existing file with these changes.
