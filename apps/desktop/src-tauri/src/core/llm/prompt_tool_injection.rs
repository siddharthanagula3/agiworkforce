// apps/desktop/src-tauri/src/core/llm/prompt_tool_injection.rs
//
// Prompt-based tool injection for LLM models that lack native function calling
// support.  When a model does not support the structured `tools` API field
// (e.g. many small Ollama models), we inject human-readable tool descriptions
// into the system prompt and then parse the model's plain-text response for
// tool call attempts emitted as fenced JSON blocks.
//
// ## Design
//
// **Injection** (`inject_tools_into_system_prompt`):
//   Appends a structured section to the system prompt that lists every tool
//   with its name, description, and JSON-schema parameters.  The section
//   includes a clear example of the expected JSON response format.
//
// **Parsing** (`parse_tool_calls_from_text`):
//   Scans the model's response text for fenced `<tool_call>` blocks (or
//   fallback ```json blocks) containing JSON objects with `name` and
//   `arguments` fields.  Each valid block is converted into a `ToolCall`.

use crate::core::llm::{ToolCall, ToolDefinition};
use uuid::Uuid;

/// Generate the tool-description section to inject into a system prompt.
///
/// Returns the text block that should be *appended* to the existing system
/// prompt (or used as the system prompt if none exists).
///
/// The format is designed to be unambiguous for small language models:
/// - Each tool is listed with its name, description, and JSON-schema
///   parameters.
/// - A clear example shows the exact response format expected.
/// - The model is told to wrap tool calls in `<tool_call>` XML tags so the
///   parser can reliably locate them even when surrounded by conversational
///   text.
pub fn build_tool_injection_prompt(tools: &[ToolDefinition]) -> String {
    let mut section = String::with_capacity(2048);

    section.push_str("\n\n---\n");
    section.push_str("# Available Tools\n\n");
    section.push_str(
        "You have access to the following tools. To use a tool, respond with a `<tool_call>` block \
         containing valid JSON. You may call multiple tools by including multiple `<tool_call>` blocks.\n\n",
    );
    section.push_str("## Tool Definitions\n\n");

    for tool in tools {
        section.push_str(&format!("### {}\n", tool.name));
        section.push_str(&format!("**Description:** {}\n", tool.description));

        // Format parameters compactly
        let params_str =
            serde_json::to_string_pretty(&tool.parameters).unwrap_or_else(|_| "{}".to_string());
        section.push_str(&format!(
            "**Parameters (JSON Schema):**\n```json\n{}\n```\n\n",
            params_str
        ));
    }

    section.push_str("## How to Call a Tool\n\n");
    section.push_str("When you want to call a tool, output a block in this exact format:\n\n");
    section.push_str("<tool_call>\n");
    section.push_str("{\"name\": \"tool_name\", \"arguments\": {\"param1\": \"value1\"}}\n");
    section.push_str("</tool_call>\n\n");
    section.push_str(
        "You may include normal text before or after tool calls. \
         If you do not need to call any tool, just respond normally without any `<tool_call>` blocks.\n",
    );
    section.push_str("---\n");

    section
}

/// Inject tool descriptions into the system prompt of a set of messages.
///
/// This function finds the first `system` message and appends the tool
/// injection section to its content.  If no system message exists, a new
/// system message is prepended to the beginning of the list.
///
/// Returns the modified messages vector (the original is not mutated).
pub fn inject_tools_into_system_prompt(
    messages: &[crate::core::llm::ChatMessage],
    tools: &[ToolDefinition],
) -> Vec<crate::core::llm::ChatMessage> {
    if tools.is_empty() {
        return messages.to_vec();
    }

    let injection = build_tool_injection_prompt(tools);
    let mut result: Vec<crate::core::llm::ChatMessage> = messages.to_vec();

    // Look for an existing system message to augment.
    if let Some(sys_msg) = result.iter_mut().find(|m| m.role == "system") {
        sys_msg.content.push_str(&injection);
    } else {
        // Prepend a new system message with the tool injection.
        result.insert(
            0,
            crate::core::llm::ChatMessage {
                role: "system".to_string(),
                content: injection,
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            },
        );
    }

    result
}

/// Parse tool call attempts from the model's plain-text response.
///
/// Looks for `<tool_call>...</tool_call>` blocks containing JSON with `name`
/// and `arguments` fields.  As a fallback, also scans for ```json fenced
/// blocks that look like tool calls.
///
/// Returns a vector of parsed `ToolCall`s.  If nothing is found the vector
/// is empty.
pub fn parse_tool_calls_from_text(text: &str) -> Vec<ToolCall> {
    let mut calls = Vec::new();

    // Strategy 1: <tool_call> XML tags
    parse_xml_tagged_calls(text, &mut calls);

    // Strategy 2: ```json or ``` fenced blocks (only if strategy 1 found nothing)
    if calls.is_empty() {
        parse_fenced_json_calls(text, &mut calls);
    }

    // Strategy 3: bare JSON objects with "name" and "arguments" keys
    if calls.is_empty() {
        parse_bare_json_calls(text, &mut calls);
    }

    calls
}

// ---------------------------------------------------------------------------
// Internal parsing helpers
// ---------------------------------------------------------------------------

/// Extract tool calls from `<tool_call>...</tool_call>` blocks.
fn parse_xml_tagged_calls(text: &str, calls: &mut Vec<ToolCall>) {
    let open_tag = "<tool_call>";
    let close_tag = "</tool_call>";

    let mut search_from = 0;
    while let Some(start) = text[search_from..].find(open_tag) {
        let json_start = search_from + start + open_tag.len();
        if let Some(end) = text[json_start..].find(close_tag) {
            let json_str = text[json_start..json_start + end].trim();
            if let Some(tc) = try_parse_tool_call_json(json_str) {
                calls.push(tc);
            }
            search_from = json_start + end + close_tag.len();
        } else {
            break;
        }
    }
}

/// Extract tool calls from fenced code blocks (```json ... ``` or ``` ... ```).
fn parse_fenced_json_calls(text: &str, calls: &mut Vec<ToolCall>) {
    // Match ```json or just ```
    let fence_patterns = ["```json", "```"];

    for pattern in fence_patterns {
        let mut search_from = 0;
        while let Some(start) = text[search_from..].find(pattern) {
            let content_start = search_from + start + pattern.len();
            // Skip to the next line if needed
            let content_start = text[content_start..]
                .find('\n')
                .map(|n| content_start + n + 1)
                .unwrap_or(content_start);

            if let Some(end) = text[content_start..].find("```") {
                let json_str = text[content_start..content_start + end].trim();
                if let Some(tc) = try_parse_tool_call_json(json_str) {
                    calls.push(tc);
                }
                search_from = content_start + end + 3;
            } else {
                break;
            }
        }

        // If we found calls with this pattern, don't try less specific patterns
        if !calls.is_empty() {
            break;
        }
    }
}

/// Look for bare JSON objects that have "name" and "arguments" fields.
fn parse_bare_json_calls(text: &str, calls: &mut Vec<ToolCall>) {
    // Find JSON objects by looking for balanced braces
    let mut depth = 0i32;
    let mut obj_start: Option<usize> = None;

    for (i, ch) in text.char_indices() {
        match ch {
            '{' => {
                if depth == 0 {
                    obj_start = Some(i);
                }
                depth += 1;
            }
            '}' => {
                depth -= 1;
                if depth == 0 {
                    if let Some(start) = obj_start.take() {
                        let candidate = &text[start..=i];
                        if let Some(tc) = try_parse_tool_call_json(candidate) {
                            calls.push(tc);
                        }
                    }
                }
                // Prevent underflow
                if depth < 0 {
                    depth = 0;
                }
            }
            _ => {}
        }
    }
}

/// Try to parse a JSON string as a tool call.
///
/// Accepts objects of the form:
///   `{"name": "...", "arguments": {...}}` or
///   `{"name": "...", "parameters": {...}}` (common model variation)
///
/// Returns `None` if parsing fails or required fields are missing.
fn try_parse_tool_call_json(json_str: &str) -> Option<ToolCall> {
    let value: serde_json::Value = serde_json::from_str(json_str).ok()?;
    let obj = value.as_object()?;

    let name = obj.get("name")?.as_str()?.to_string();

    // Accept either "arguments" or "parameters" as the key
    let arguments = obj
        .get("arguments")
        .or_else(|| obj.get("parameters"))
        .map(|v| {
            if v.is_string() {
                v.as_str().unwrap_or("{}").to_string()
            } else {
                serde_json::to_string(v).unwrap_or_else(|_| "{}".to_string())
            }
        })
        .unwrap_or_else(|| "{}".to_string());

    // Generate a unique ID for the tool call
    let id = format!(
        "prompt_tc_{}",
        Uuid::new_v4()
            .to_string()
            .split('-')
            .next()
            .unwrap_or("0000")
    );

    Some(ToolCall {
        id,
        name,
        arguments,
    })
}

/// Strip `<tool_call>...</tool_call>` blocks (and fenced JSON tool-call
/// blocks) from the response text so the content returned to the user is
/// clean conversational text without raw JSON tool syntax.
pub fn strip_tool_call_blocks(text: &str) -> String {
    let mut result = text.to_string();

    // Remove <tool_call>...</tool_call> blocks
    while let Some(start) = result.find("<tool_call>") {
        if let Some(end) = result[start..].find("</tool_call>") {
            let end_abs = start + end + "</tool_call>".len();
            result.replace_range(start..end_abs, "");
        } else {
            break;
        }
    }

    // Trim excess whitespace left behind
    result.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_tools() -> Vec<ToolDefinition> {
        vec![
            ToolDefinition {
                name: "get_weather".to_string(),
                description: "Get current weather for a location".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "location": {"type": "string", "description": "City name"},
                        "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}
                    },
                    "required": ["location"]
                }),
                strict: None,
            },
            ToolDefinition {
                name: "search_web".to_string(),
                description: "Search the web for information".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Search query"}
                    },
                    "required": ["query"]
                }),
                strict: None,
            },
        ]
    }

    #[test]
    fn test_build_tool_injection_prompt() {
        let tools = sample_tools();
        let prompt = build_tool_injection_prompt(&tools);

        assert!(prompt.contains("get_weather"));
        assert!(prompt.contains("search_web"));
        assert!(prompt.contains("<tool_call>"));
        assert!(prompt.contains("</tool_call>"));
        assert!(prompt.contains("Get current weather"));
    }

    #[test]
    fn test_parse_xml_tagged_tool_call() {
        let text = r#"I'll check the weather for you.

<tool_call>
{"name": "get_weather", "arguments": {"location": "San Francisco", "unit": "celsius"}}
</tool_call>

Let me know if you need anything else."#;

        let calls = parse_tool_calls_from_text(text);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "get_weather");
        assert!(calls[0].arguments.contains("San Francisco"));
        assert!(calls[0].id.starts_with("prompt_tc_"));
    }

    #[test]
    fn test_parse_multiple_tool_calls() {
        let text = r#"Let me look that up.

<tool_call>
{"name": "get_weather", "arguments": {"location": "NYC"}}
</tool_call>

<tool_call>
{"name": "search_web", "arguments": {"query": "NYC restaurants"}}
</tool_call>"#;

        let calls = parse_tool_calls_from_text(text);
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0].name, "get_weather");
        assert_eq!(calls[1].name, "search_web");
    }

    #[test]
    fn test_parse_fenced_json_fallback() {
        let text = r#"Sure, let me search for that.

```json
{"name": "search_web", "arguments": {"query": "rust programming"}}
```
"#;

        let calls = parse_tool_calls_from_text(text);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "search_web");
    }

    #[test]
    fn test_parse_parameters_alias() {
        let text = r#"<tool_call>
{"name": "get_weather", "parameters": {"location": "London"}}
</tool_call>"#;

        let calls = parse_tool_calls_from_text(text);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "get_weather");
        assert!(calls[0].arguments.contains("London"));
    }

    #[test]
    fn test_no_tool_calls_in_text() {
        let text = "The weather in San Francisco is sunny and 72F.";
        let calls = parse_tool_calls_from_text(text);
        assert!(calls.is_empty());
    }

    #[test]
    fn test_strip_tool_call_blocks() {
        let text = r#"I'll check that for you.

<tool_call>
{"name": "get_weather", "arguments": {"location": "NYC"}}
</tool_call>

Here's what I found."#;

        let cleaned = strip_tool_call_blocks(text);
        assert!(!cleaned.contains("<tool_call>"));
        assert!(!cleaned.contains("get_weather"));
        assert!(cleaned.contains("check that for you"));
        assert!(cleaned.contains("what I found"));
    }

    #[test]
    fn test_inject_into_existing_system_message() {
        let messages = vec![crate::core::llm::ChatMessage {
            role: "system".to_string(),
            content: "You are a helpful assistant.".to_string(),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        }];

        let tools = sample_tools();
        let result = inject_tools_into_system_prompt(&messages, &tools);

        assert_eq!(result.len(), 1);
        assert!(result[0].content.contains("You are a helpful assistant."));
        assert!(result[0].content.contains("get_weather"));
    }

    #[test]
    fn test_inject_creates_system_message_when_missing() {
        let messages = vec![crate::core::llm::ChatMessage {
            role: "user".to_string(),
            content: "What is the weather?".to_string(),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        }];

        let tools = sample_tools();
        let result = inject_tools_into_system_prompt(&messages, &tools);

        assert_eq!(result.len(), 2);
        assert_eq!(result[0].role, "system");
        assert!(result[0].content.contains("get_weather"));
        assert_eq!(result[1].role, "user");
    }

    #[test]
    fn test_bare_json_object_parsing() {
        let text = r#"I will call the weather tool now:
{"name": "get_weather", "arguments": {"location": "Paris"}}
That should give us the info."#;

        let calls = parse_tool_calls_from_text(text);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "get_weather");
        assert!(calls[0].arguments.contains("Paris"));
    }
}
