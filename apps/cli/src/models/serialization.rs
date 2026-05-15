use serde_json::Value;

use super::{ContentBlock, Message, MessageContent};

/// Convert an internal Message to Anthropic API JSON format.
pub(crate) fn convert_message_to_anthropic(m: &Message) -> Value {
    match &m.content {
        MessageContent::Text(t) => serde_json::json!({
            "role": m.role,
            "content": t,
        }),
        MessageContent::Blocks(blocks) => {
            let content: Vec<Value> = blocks
                .iter()
                .map(|b| match b {
                    ContentBlock::Text { text } => serde_json::json!({
                        "type": "text", "text": text
                    }),
                    ContentBlock::ToolUse { id, name, input } => serde_json::json!({
                        "type": "tool_use", "id": id, "name": name, "input": input
                    }),
                    ContentBlock::ToolResult {
                        tool_use_id,
                        content,
                        is_error,
                    } => serde_json::json!({
                        "type": "tool_result", "tool_use_id": tool_use_id,
                        "content": content, "is_error": is_error
                    }),
                })
                .collect();
            serde_json::json!({ "role": m.role, "content": content })
        }
    }
}

/// Convert an internal Message to OpenAI-compatible API JSON format.
/// Returns a Vec because tool result messages expand into multiple API messages.
pub(crate) fn convert_message_to_openai(m: &Message) -> Vec<Value> {
    match &m.content {
        MessageContent::Text(t) => vec![serde_json::json!({
            "role": m.role,
            "content": t,
        })],
        MessageContent::Blocks(blocks) => {
            // Check if this is an assistant message with tool_use blocks
            if m.role == "assistant" {
                let mut text_parts = Vec::new();
                let mut tc_array = Vec::new();

                for block in blocks {
                    match block {
                        ContentBlock::Text { text } => {
                            text_parts.push(text.clone());
                        }
                        ContentBlock::ToolUse { id, name, input } => {
                            tc_array.push(serde_json::json!({
                                "id": id,
                                "type": "function",
                                "function": {
                                    "name": name,
                                    "arguments": input.to_string(),
                                }
                            }));
                        }
                        _ => {}
                    }
                }

                let combined_text = text_parts.join("");
                let mut msg = serde_json::json!({ "role": "assistant" });
                if !combined_text.is_empty() {
                    msg["content"] = serde_json::json!(combined_text);
                }
                if !tc_array.is_empty() {
                    msg["tool_calls"] = serde_json::json!(tc_array);
                }
                vec![msg]
            } else {
                // For user/tool messages — tool results become separate "tool" role messages
                let mut msgs = Vec::new();
                let mut text_parts = Vec::new();

                for block in blocks {
                    match block {
                        ContentBlock::ToolResult {
                            tool_use_id,
                            content,
                            ..
                        } => {
                            // Flush accumulated text first
                            if !text_parts.is_empty() {
                                msgs.push(serde_json::json!({
                                    "role": m.role,
                                    "content": text_parts.join(""),
                                }));
                                text_parts.clear();
                            }
                            msgs.push(serde_json::json!({
                                "role": "tool",
                                "tool_call_id": tool_use_id,
                                "content": content,
                            }));
                        }
                        ContentBlock::Text { text } => {
                            text_parts.push(text.clone());
                        }
                        _ => {}
                    }
                }

                // Flush remaining text
                if !text_parts.is_empty() {
                    msgs.push(serde_json::json!({
                        "role": m.role,
                        "content": text_parts.join(""),
                    }));
                }

                if msgs.is_empty() {
                    // Fallback: empty content
                    msgs.push(serde_json::json!({
                        "role": m.role,
                        "content": "",
                    }));
                }

                msgs
            }
        }
    }
}

/// Convert an internal Message to Gemini API JSON format.
pub(crate) fn convert_message_to_gemini(m: &Message) -> Value {
    let role = if m.role == "assistant" {
        "model"
    } else {
        "user"
    };
    match &m.content {
        MessageContent::Text(t) => serde_json::json!({
            "role": role,
            "parts": [{ "text": t }],
        }),
        MessageContent::Blocks(blocks) => {
            let parts: Vec<Value> = blocks
                .iter()
                .map(|b| match b {
                    ContentBlock::Text { text } => serde_json::json!({ "text": text }),
                    ContentBlock::ToolUse { name, input, .. } => {
                        serde_json::json!({
                            "functionCall": { "name": name, "args": input }
                        })
                    }
                    ContentBlock::ToolResult { content, .. } => {
                        // Gemini uses functionResponse — we need the function name,
                        // but ToolResult only has tool_use_id. Use a generic name.
                        serde_json::json!({
                            "functionResponse": {
                                "name": "tool",
                                "response": { "result": content }
                            }
                        })
                    }
                })
                .collect();
            serde_json::json!({ "role": role, "parts": parts })
        }
    }
}
