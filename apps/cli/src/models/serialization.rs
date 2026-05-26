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
                    // Anthropic vision: {"type":"image","source":{"type":"base64","media_type":"image/png","data":"..."}}
                    ContentBlock::Image { mime, data_b64 } => serde_json::json!({
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": mime,
                            "data": data_b64
                        }
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
                        ContentBlock::Image { .. } => {
                            // Image blocks are not expected in assistant-role messages;
                            // skip to avoid emitting malformed API payloads.
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
                        ContentBlock::ToolResult { .. } => {
                            // Tool results are not emitted for assistant-role messages
                            // in the OpenAI format; they are handled in the user-role
                            // branch below as separate "tool" role messages.
                        }
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
                            // Flush accumulated text/image parts first
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
                        // OpenAI vision: {"type":"image_url","image_url":{"url":"data:image/png;base64,..."}}
                        ContentBlock::Image { mime, data_b64 } => {
                            // Flush any pending text before inserting the image part
                            if !text_parts.is_empty() {
                                msgs.push(serde_json::json!({
                                    "role": m.role,
                                    "content": text_parts.join(""),
                                }));
                                text_parts.clear();
                            }
                            msgs.push(serde_json::json!({
                                "role": m.role,
                                "content": [
                                    {
                                        "type": "image_url",
                                        "image_url": {
                                            "url": format!("data:{mime};base64,{data_b64}")
                                        }
                                    }
                                ]
                            }));
                        }
                        ContentBlock::ToolUse { .. } => {
                            // ToolUse blocks are not expected in user/tool-role messages;
                            // skip to avoid emitting malformed OpenAI API payloads.
                        }
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
                    // Gemini vision: {"inlineData":{"mimeType":"image/png","data":"..."}}
                    ContentBlock::Image { mime, data_b64 } => serde_json::json!({
                        "inlineData": {
                            "mimeType": mime,
                            "data": data_b64
                        }
                    }),
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

#[cfg(test)]
mod tests {
    use super::*;

    fn image_block() -> ContentBlock {
        ContentBlock::Image {
            mime: "image/png".to_string(),
            data_b64: "BASE64DATA".to_string(),
        }
    }

    #[test]
    fn anthropic_image_block_uses_base64_source() {
        let msg = Message::blocks(
            "user",
            vec![
                image_block(),
                ContentBlock::Text {
                    text: "describe this".to_string(),
                },
            ],
        );
        let v = convert_message_to_anthropic(&msg);
        let content = v["content"].as_array().unwrap();
        assert_eq!(content[0]["type"], "image");
        assert_eq!(content[0]["source"]["type"], "base64");
        assert_eq!(content[0]["source"]["media_type"], "image/png");
        assert_eq!(content[0]["source"]["data"], "BASE64DATA");
        assert_eq!(content[1]["type"], "text");
        assert_eq!(content[1]["text"], "describe this");
    }

    #[test]
    fn openai_image_block_produces_image_url_content() {
        let msg = Message::blocks("user", vec![image_block()]);
        let msgs = convert_message_to_openai(&msg);
        let content = msgs[0]["content"].as_array().unwrap();
        assert_eq!(content[0]["type"], "image_url");
        assert_eq!(
            content[0]["image_url"]["url"],
            "data:image/png;base64,BASE64DATA"
        );
    }

    #[test]
    fn gemini_image_block_uses_inline_data() {
        let msg = Message::blocks("user", vec![image_block()]);
        let v = convert_message_to_gemini(&msg);
        let parts = v["parts"].as_array().unwrap();
        assert_eq!(parts[0]["inlineData"]["mimeType"], "image/png");
        assert_eq!(parts[0]["inlineData"]["data"], "BASE64DATA");
    }
}
