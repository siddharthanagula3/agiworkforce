use std::collections::HashMap;

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
                // OpenAI-compatible endpoints reject an assistant message that has
                // neither `content` nor `tool_calls` (hard 400). When the blocks
                // yielded no text and no tool calls, emit an empty-string content
                // so the message stays valid on replayed/edge-case histories.
                if msg.get("content").is_none() && msg.get("tool_calls").is_none() {
                    msg["content"] = serde_json::json!("");
                }
                vec![msg]
            } else {
                // For user/tool messages — tool results become separate "tool" role messages.
                // Text and Image blocks accumulate together into a single content-parts array
                // so that mixed text+image input is sent as ONE user message with a content
                // array (the format required by gpt-4o and other vision-capable models).
                let mut msgs = Vec::new();
                // `content_parts` accumulates text/image parts for the current user message.
                // It holds JSON Value objects: text parts as {"type":"text","text":"..."} and
                // image parts as {"type":"image_url","image_url":{"url":"..."}}.
                let mut content_parts: Vec<Value> = Vec::new();

                /// Flush the accumulated content_parts as a single user message.
                /// If there is exactly one text-only part, downgrade to a plain string for
                /// API compatibility with models that expect `"content": "..."`.
                fn flush_content_parts(parts: &mut Vec<Value>, role: &str, msgs: &mut Vec<Value>) {
                    if parts.is_empty() {
                        return;
                    }
                    let content: Value = if parts.len() == 1 {
                        // Check if it is a plain text-only part
                        if parts[0].get("type").and_then(|t| t.as_str()) == Some("text") {
                            if let Some(txt) = parts[0].get("text").and_then(|t| t.as_str()) {
                                // Downgrade to plain string for backwards compat
                                serde_json::json!(txt)
                            } else {
                                serde_json::json!(parts.clone())
                            }
                        } else {
                            serde_json::json!(parts.clone())
                        }
                    } else {
                        serde_json::json!(parts.clone())
                    };
                    msgs.push(serde_json::json!({ "role": role, "content": content }));
                    parts.clear();
                }

                for block in blocks {
                    match block {
                        ContentBlock::ToolResult {
                            tool_use_id,
                            content,
                            ..
                        } => {
                            // Flush accumulated text/image parts first as a single user message
                            flush_content_parts(&mut content_parts, &m.role, &mut msgs);
                            msgs.push(serde_json::json!({
                                "role": "tool",
                                "tool_call_id": tool_use_id,
                                "content": content,
                            }));
                        }
                        ContentBlock::Text { text } => {
                            content_parts.push(serde_json::json!({
                                "type": "text",
                                "text": text,
                            }));
                        }
                        // OpenAI vision: {"type":"image_url","image_url":{"url":"data:image/png;base64,..."}}
                        ContentBlock::Image { mime, data_b64 } => {
                            content_parts.push(serde_json::json!({
                                "type": "image_url",
                                "image_url": {
                                    "url": format!("data:{mime};base64,{data_b64}")
                                }
                            }));
                        }
                        ContentBlock::ToolUse { .. } => {
                            // ToolUse blocks are not expected in user/tool-role messages;
                            // skip to avoid emitting malformed OpenAI API payloads.
                        }
                    }
                }

                // Flush remaining parts as a single message
                flush_content_parts(&mut content_parts, &m.role, &mut msgs);

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

/// Build a `tool_use_id -> function name` map from all ToolUse blocks. Gemini's
/// `functionResponse.name` must equal the originating `functionCall.name`, but a
/// ToolResult only carries `tool_use_id`, so the name is resolved via this map.
pub(crate) fn build_gemini_tool_name_map(messages: &[Message]) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for m in messages {
        if let MessageContent::Blocks(blocks) = &m.content {
            for b in blocks {
                if let ContentBlock::ToolUse { id, name, .. } = b {
                    map.insert(id.clone(), name.clone());
                }
            }
        }
    }
    map
}

/// Convert an internal Message to Gemini API JSON format. `tool_names` maps
/// `tool_use_id -> function name` so tool results carry the correct name.
pub(crate) fn convert_message_to_gemini(m: &Message, tool_names: &HashMap<String, String>) -> Value {
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
                    ContentBlock::ToolResult {
                        tool_use_id,
                        content,
                        ..
                    } => {
                        // Gemini matches functionResponse to functionCall by name;
                        // resolve the real name from the tool_use_id map (fallback
                        // "tool" only if the originating call is missing).
                        let name = tool_names
                            .get(tool_use_id)
                            .map(String::as_str)
                            .unwrap_or("tool");
                        serde_json::json!({
                            "functionResponse": {
                                "name": name,
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
        // Image-only: single message, content is an array with one image_url part
        assert_eq!(
            msgs.len(),
            1,
            "image-only should produce exactly one message"
        );
        let content = msgs[0]["content"].as_array().unwrap();
        assert_eq!(content[0]["type"], "image_url");
        assert_eq!(
            content[0]["image_url"]["url"],
            "data:image/png;base64,BASE64DATA"
        );
    }

    #[test]
    fn openai_mixed_text_image_produces_one_message_with_parts_array() {
        // A user message with both text and image blocks must produce EXACTLY ONE
        // API message with a content array of two parts — not two consecutive user messages.
        let msg = Message::blocks(
            "user",
            vec![
                ContentBlock::Text {
                    text: "describe this".to_string(),
                },
                image_block(),
            ],
        );
        let msgs = convert_message_to_openai(&msg);
        assert_eq!(
            msgs.len(),
            1,
            "mixed text+image should produce exactly one user message, got {}",
            msgs.len()
        );
        let content = msgs[0]["content"].as_array().unwrap();
        assert_eq!(content.len(), 2, "content array should have 2 parts");
        assert_eq!(content[0]["type"], "text");
        assert_eq!(content[0]["text"], "describe this");
        assert_eq!(content[1]["type"], "image_url");
        assert_eq!(
            content[1]["image_url"]["url"],
            "data:image/png;base64,BASE64DATA"
        );
    }

    #[test]
    fn openai_text_only_user_message_produces_plain_string_content() {
        // Pure text should still downgrade to a plain string content (not an array)
        // for backwards compatibility with models that do not support content arrays.
        let msg = Message::blocks(
            "user",
            vec![ContentBlock::Text {
                text: "hello".to_string(),
            }],
        );
        let msgs = convert_message_to_openai(&msg);
        assert_eq!(msgs.len(), 1);
        assert_eq!(
            msgs[0]["content"], "hello",
            "single text should be plain string"
        );
    }

    #[test]
    fn openai_empty_assistant_blocks_emit_empty_content() {
        // An assistant message whose blocks yield neither text nor tool calls
        // must still carry a `content` field — OpenAI-compatible endpoints reject
        // an assistant message with neither `content` nor `tool_calls` (400).
        let msg = Message::blocks("assistant", vec![]);
        let msgs = convert_message_to_openai(&msg);
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0]["role"], "assistant");
        assert_eq!(
            msgs[0]["content"], "",
            "empty assistant blocks must serialize with content=\"\""
        );
        assert!(
            msgs[0].get("tool_calls").is_none(),
            "no tool_calls expected when blocks are empty"
        );
    }

    #[test]
    fn gemini_image_block_uses_inline_data() {
        let msg = Message::blocks("user", vec![image_block()]);
        let v = convert_message_to_gemini(&msg, &HashMap::new());
        let parts = v["parts"].as_array().unwrap();
        assert_eq!(parts[0]["inlineData"]["mimeType"], "image/png");
        assert_eq!(parts[0]["inlineData"]["data"], "BASE64DATA");
    }

    #[test]
    fn gemini_tool_result_resolves_real_function_name() {
        // functionResponse.name must equal the originating functionCall.name,
        // not the previous hardcoded "tool".
        let mut names = HashMap::new();
        names.insert("call_1".to_string(), "read_file".to_string());
        let msg = Message::blocks(
            "user",
            vec![ContentBlock::ToolResult {
                tool_use_id: "call_1".to_string(),
                content: "ok".to_string(),
                is_error: false,
            }],
        );
        let v = convert_message_to_gemini(&msg, &names);
        let parts = v["parts"].as_array().unwrap();
        assert_eq!(parts[0]["functionResponse"]["name"], "read_file");
    }

    #[test]
    fn gemini_tool_name_map_collects_tool_use_ids() {
        let msg = Message::blocks(
            "assistant",
            vec![ContentBlock::ToolUse {
                id: "call_9".to_string(),
                name: "grep_files".to_string(),
                input: serde_json::json!({}),
            }],
        );
        let map = build_gemini_tool_name_map(std::slice::from_ref(&msg));
        assert_eq!(map.get("call_9").map(String::as_str), Some("grep_files"));
    }
}
