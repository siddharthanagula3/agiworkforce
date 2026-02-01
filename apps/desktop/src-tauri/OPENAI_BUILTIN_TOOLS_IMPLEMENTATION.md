# OpenAI Built-in Tools Implementation

## Overview

This document describes the implementation of OpenAI server-side built-in tools support in the provider adapter. Built-in tools are executed server-side by OpenAI's API, eliminating the need for client-side tool execution.

## Supported Tools

The implementation supports the following OpenAI built-in tools:

### 1. **web_search**
Real-time internet search capability.

**Configuration:**
- `max_results` (optional): Maximum number of search results
- `search_depth` (optional): Search depth ("basic" or "advanced")

**Example:**
```rust
ToolDefinition::new_flat(
    "web_search".to_string(),
    "Search the web for information".to_string(),
    serde_json::json!({
        "max_results": 5,
        "search_depth": "advanced"
    })
)
```

### 2. **code_interpreter**
Execute Python code server-side.

**Configuration:**
- `timeout_seconds` (optional): Execution timeout
- `packages` (optional): Python packages to pre-install

**Example:**
```rust
ToolDefinition::new_flat(
    "code_interpreter".to_string(),
    "Execute Python code".to_string(),
    serde_json::json!({
        "timeout_seconds": 30,
        "packages": ["numpy", "pandas"]
    })
)
```

### 3. **file_search**
Search through uploaded files using vector search.

**Configuration:**
- `max_num_results` (optional): Maximum number of results
- `vector_store_ids` (optional): Specific vector stores to search

**Example:**
```rust
ToolDefinition::new_flat(
    "file_search".to_string(),
    "Search through files".to_string(),
    serde_json::json!({
        "max_num_results": 10,
        "vector_store_ids": ["vs_123abc"]
    })
)
```

### 4. **mcp**
Model Context Protocol integration for external services.

**Configuration:**
- `server_url` (optional): MCP server endpoint
- `credentials` (optional): Authentication credentials

### 5. **image_generation**
Generate images using DALL-E.

**Configuration:**
- `model` (optional): "dall-e-2" or "dall-e-3"
- `quality` (optional): "standard" or "hd"
- `size` (optional): Image dimensions ("1024x1024", "1792x1024", etc.)

### 6. **computer_use**
Desktop automation and interaction.

**Configuration:**
- `display_width_px` (required): Display width in pixels (default: 1920)
- `display_height_px` (required): Display height in pixels (default: 1080)
- `display_number` (optional): Display identifier

### 7. **shell**
Execute shell commands server-side.

**Configuration:**
- `allowed_commands` (optional): Whitelist of allowed commands

### 8. **apply_patch**
Apply code patches automatically.

**Configuration:**
- `validate_before_apply` (optional): Validate patch before applying

## Architecture

### Type Definitions

```rust
/// Built-in tool types
pub enum OpenAIServerTool {
    WebSearch,
    CodeInterpreter,
    FileSearch,
    Mcp,
    ImageGeneration,
    ComputerUse,
    Shell,
    ApplyPatch,
}

/// Tool-specific parameters
pub enum OpenAIToolParams {
    WebSearch { max_results: Option<u32>, search_depth: Option<String> },
    CodeInterpreter { timeout_seconds: Option<u32>, packages: Option<Vec<String>> },
    // ... other variants
}

/// Tool execution result
pub struct OpenAIToolResult {
    pub id: String,
    pub name: String,
    pub output: serde_json::Value,
    pub is_error: Option<bool>,
}

/// Tool execution error
pub struct OpenAIToolError {
    pub error_type: String,
    pub message: String,
    pub details: Option<serde_json::Value>,
}
```

### Request Flow

1. **Tool Definition**: Define tool using standard `ToolDefinition`
2. **Detection**: `adapt_tools_to_nested_format()` detects built-in tools by name
3. **Configuration**: `create_builtin_tool_definition()` extracts and formats parameters
4. **Transmission**: Tool definition sent to OpenAI API with proper schema

### Response Flow

1. **Reception**: Response received from OpenAI API
2. **Parsing**: `parse_tool_call()` (Chat Completions) or `adapt_from_responses_api()` (Responses API) parse results
3. **Error Handling**: Tool errors are captured and marked with `is_error: true`
4. **Unification**: Results converted to unified `ToolCall` format

## Usage Example

### Chat Completions API

```rust
use crate::core::llm::{LLMRequest, ToolDefinition, ChatMessage};

let request = LLMRequest {
    model: "gpt-4".to_string(),
    messages: vec![
        ChatMessage {
            role: "user".to_string(),
            content: "Search for the latest news about AI".to_string(),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        }
    ],
    tools: Some(vec![
        ToolDefinition::new_flat(
            "web_search".to_string(),
            "Search the web for information".to_string(),
            serde_json::json!({
                "max_results": 5,
                "search_depth": "advanced"
            })
        )
    ]),
    // ... other fields
};

let adapter = OpenAIAdapter;
let api_request = adapter.adapt_request(&request)?;
```

### Responses API

```rust
let request = LLMRequest {
    model: "gpt-5.2".to_string(),
    messages: vec![/* ... */],
    tools: Some(vec![
        ToolDefinition::new_flat(
            "code_interpreter".to_string(),
            "Execute Python code".to_string(),
            serde_json::json!({
                "timeout_seconds": 30,
                "packages": ["numpy"]
            })
        )
    ]),
    // ... other fields
};

let adapter = OpenAIAdapter;
let api_request = adapter.adapt_request(&request)?;
// Automatically uses Responses API format for gpt-5+ models
```

## Response Parsing

### Built-in Tool Result

When a built-in tool is executed, the response includes:

```json
{
  "choices": [{
    "message": {
      "tool_calls": [{
        "id": "call_abc123",
        "type": "web_search",
        "output": {
          "results": [
            {
              "url": "https://example.com",
              "title": "AI News",
              "snippet": "..."
            }
          ]
        }
      }]
    }
  }]
}
```

This is parsed into:

```rust
ToolCall {
    id: "call_abc123".to_string(),
    name: "web_search".to_string(),
    arguments: "{\"results\":[{\"url\":\"https://example.com\",\"title\":\"AI News\",\"snippet\":\"...\"}]}".to_string(),
}
```

### Error Handling

If a tool execution fails:

```json
{
  "id": "call_abc123",
  "type": "web_search",
  "error": {
    "type": "rate_limit_exceeded",
    "message": "Too many requests"
  }
}
```

Parsed as:

```rust
ToolCall {
    id: "call_abc123".to_string(),
    name: "web_search".to_string(),
    arguments: "{\"error\":{\"type\":\"rate_limit_exceeded\",\"message\":\"Too many requests\"},\"is_error\":true}".to_string(),
}
```

## Integration with Existing Code

The implementation maintains backward compatibility:

1. **Regular Functions**: Non-built-in tools are handled as before
2. **Unified Interface**: Built-in tools use the same `ToolCall` structure
3. **No Breaking Changes**: Existing code continues to work without modifications

## Testing

### Unit Tests

```rust
#[test]
fn test_openai_server_tool_detection() {
    assert_eq!(
        OpenAIServerTool::from_str("web_search"),
        Some(OpenAIServerTool::WebSearch)
    );
}

#[test]
fn test_builtin_tool_formatting() {
    let adapter = OpenAIAdapter;
    let tool = ToolDefinition::new_flat(
        "web_search".to_string(),
        "Search".to_string(),
        serde_json::json!({"max_results": 5})
    );

    let result = adapter.adapt_tools_to_nested_format(&vec![tool]).unwrap();
    assert_eq!(result[0]["type"].as_str().unwrap(), "web_search");
    assert_eq!(result[0]["max_results"].as_u64().unwrap(), 5);
}
```

## Performance Considerations

1. **Zero Allocations**: Tool detection uses string matching without allocations
2. **Pattern Matching**: Rust's match expressions provide optimal performance
3. **Lazy Evaluation**: Configuration parameters are only extracted if present
4. **No Cloning**: Parameters are moved or referenced, not cloned

## Future Enhancements

1. **Streaming Support**: Parse streaming tool execution results
2. **Tool Composition**: Allow combining multiple built-in tools
3. **Custom Tools**: Support for custom server-side tool definitions
4. **Validation**: Validate tool parameters before sending to API

## Related Files

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/provider_adapter.rs` - Main implementation
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/mod.rs` - LLM types and request/response structures
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/server_tools.rs` - Anthropic server tools (reference)

## References

- OpenAI API Documentation: Built-in Tools
- OpenAI Responses API Specification
- OpenAI Chat Completions API Specification
