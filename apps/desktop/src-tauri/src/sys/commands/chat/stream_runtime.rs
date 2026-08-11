use crate::core::llm::token_counter::TokenCounter;
use crate::sys::commands::chat::pending::{has_pending_messages, peek_pending_messages};
use crate::sys::commands::chat::state::should_stop_for_conversation;
use futures_util::StreamExt;
use std::collections::HashMap;
use tauri::Emitter;
use tracing::{info, warn};

/// Tool whose streaming arguments drive the progressive artifact preview.
/// Mirrors the dispatch arm in `core/llm/tool_executor/mod.rs`.
const ARTIFACT_TOOL_NAME: &str = "create_artifact";

/// Result of consuming an SSE stream.
pub(super) struct ConsumeStreamResult {
    pub tool_calls: Vec<crate::core::llm::sse_parser::StreamingToolCall>,
    pub token_count: u32,
    /// Local completion-token estimate using the same counter as router
    /// metering. Used only when the provider omits final usage.
    pub estimated_output_tokens: u32,
    pub usage: Option<crate::core::llm::sse_parser::TokenUsage>,
    pub credits: Option<crate::core::llm::CreditsInfo>,
    pub model: Option<String>,
    pub finish_reason: Option<String>,
    pub was_stopped: bool,
}

/// Consume an SSE stream, emitting `chat:stream-chunk` events to the frontend
/// and accumulating content + tool calls.
pub(super) async fn consume_llm_stream(
    mut stream: std::pin::Pin<
        Box<
            dyn futures_util::Stream<
                    Item = Result<
                        crate::core::llm::sse_parser::StreamChunk,
                        Box<dyn std::error::Error + Send + Sync>,
                    >,
                > + Send,
        >,
    >,
    app_handle: &tauri::AppHandle,
    conversation_id: i64,
    message_id: &str,
    full_content: &mut String,
    idle_timeout_secs: u64,
) -> Result<ConsumeStreamResult, String> {
    let mut token_count = 0u32;
    let mut estimated_output_tokens = 0u32;
    let mut full_reasoning = String::new();
    let mut thinking_started = false;
    let mut was_stopped = false;
    let mut final_usage = None;
    let mut final_credits = None;
    let mut final_finish_reason: Option<String> = None;
    let mut final_model: Option<String> = None;

    let mut accumulated_tool_calls: HashMap<
        usize,
        crate::core::llm::sse_parser::StreamingToolCall,
    > = HashMap::new();

    // Per-tool-call sequence numbers for `chat:artifact-progress`. The frontend
    // accumulates the deltas itself, so it needs an ordering guard: a gap means
    // the progressive view is desynced and must be abandoned (the authoritative
    // `chat:artifact` event still arrives when the tool executes).
    let mut artifact_progress_seq: HashMap<usize, u64> = HashMap::new();

    let mut pending_notified = false;

    loop {
        let next_chunk = match tokio::time::timeout(
            std::time::Duration::from_secs(idle_timeout_secs),
            stream.next(),
        )
        .await
        {
            Ok(value) => value,
            Err(_) => {
                warn!(
                    "[Chat] Stream idle timeout after {}s with no data from provider (conversation={})",
                    idle_timeout_secs, conversation_id,
                );
                let user_message = if full_content.trim().is_empty() {
                    "The model took too long to respond. Please try again.".to_string()
                } else {
                    "Response was interrupted because the connection went idle. The partial response is shown above.".to_string()
                };
                let _ = app_handle.emit(
                    "chat:stream-error",
                    serde_json::json!({
                        "conversation_id": conversation_id,
                        "message_id": message_id,
                        "error": user_message
                    }),
                );
                return Err(user_message);
            }
        };

        let Some(chunk_result) = next_chunk else {
            break;
        };

        if should_stop_for_conversation(conversation_id) {
            info!("[Chat] Generation stopped by user");
            was_stopped = true;
            break;
        }

        if has_pending_messages() && !pending_notified {
            let pending = peek_pending_messages();
            info!(
                "[Chat] {} pending message(s) detected during streaming",
                pending.len()
            );
            let _ = app_handle.emit(
                "chat:pending-context-available",
                serde_json::json!({
                    "pending_messages": pending,
                    "current_phase": "streaming",
                    "count": pending.len()
                }),
            );
            pending_notified = true;
        }

        match chunk_result {
            Ok(chunk) => {
                if chunk.keepalive {
                    continue;
                }

                if let Some(reasoning_delta) =
                    chunk.reasoning.as_deref().filter(|delta| !delta.is_empty())
                {
                    if !thinking_started {
                        crate::sys::commands::thinking::emit_thinking_start(
                            app_handle,
                            Some(message_id.to_string()),
                        );
                        thinking_started = true;
                    }
                    full_reasoning.push_str(reasoning_delta);
                    crate::sys::commands::thinking::emit_thinking_delta(
                        app_handle,
                        reasoning_delta.to_string(),
                        Some(message_id.to_string()),
                    );
                }

                full_content.push_str(&chunk.content);
                if !chunk.content.is_empty() {
                    // Approximate output token count: count chunks as a rough
                    // lower bound.  The authoritative count comes from the
                    // provider's usage object (final_usage) when available.
                    token_count += 1;
                }
                let estimated_chunk_tokens = TokenCounter::estimate_text_tokens(&chunk.content)
                    .saturating_add(
                        chunk
                            .reasoning
                            .as_deref()
                            .map(TokenCounter::estimate_text_tokens)
                            .unwrap_or(0),
                    );
                estimated_output_tokens = estimated_output_tokens
                    .saturating_add(u32::try_from(estimated_chunk_tokens).unwrap_or(u32::MAX));

                if let Some(model) = chunk.model.as_ref() {
                    final_model = Some(model.clone());
                }

                if let Some(finish) = &chunk.finish_reason {
                    final_finish_reason = Some(finish.clone());
                }

                if let Some(tool_calls) = &chunk.tool_calls {
                    for tool_call in tool_calls {
                        let entry = accumulated_tool_calls
                            .entry(tool_call.index)
                            .or_insert_with(|| crate::core::llm::sse_parser::StreamingToolCall {
                                index: tool_call.index,
                                id: String::new(),
                                name: String::new(),
                                arguments: String::new(),
                            });

                        if !tool_call.id.is_empty() {
                            entry.id = tool_call.id.clone();
                        }
                        if !tool_call.name.is_empty() {
                            entry.name = tool_call.name.clone();
                        }
                        entry.arguments.push_str(&tool_call.arguments);

                        // Progressive artifact preview (display only). The
                        // arguments delta is forwarded as-is; the frontend
                        // tolerantly extracts title/type/content from the
                        // partial JSON. Persistence and versioning still happen
                        // exactly once, later, in
                        // `tool_executor::execute_create_artifact_tool`.
                        if entry.name == ARTIFACT_TOOL_NAME && !tool_call.arguments.is_empty() {
                            let index = entry.index;
                            let seq = artifact_progress_seq.entry(index).or_insert(0);
                            let _ = app_handle.emit(
                                "chat:artifact-progress",
                                serde_json::json!({
                                    "conversation_id": conversation_id,
                                    "message_id": message_id,
                                    "tool_call_index": index,
                                    "seq": *seq,
                                    "delta": tool_call.arguments,
                                }),
                            );
                            *seq += 1;
                        }
                    }
                }

                if let Some(usage) = chunk.usage {
                    final_usage = Some(usage);
                }
                if let Some(credits) = chunk.credits {
                    final_credits = Some(credits);
                }

                let _ = app_handle.emit(
                    "chat:stream-chunk",
                    serde_json::json!({
                        "conversation_id": conversation_id,
                        "message_id": message_id,
                        "delta": chunk.content,
                        "content": full_content.clone(),
                        "has_pending_messages": has_pending_messages()
                    }),
                );
            }
            Err(error) => {
                info!("[Chat] Stream error: {error}");
                let _ = app_handle.emit(
                    "chat:stream-error",
                    serde_json::json!({
                        "conversation_id": conversation_id,
                        "message_id": message_id,
                        "error": error.to_string()
                    }),
                );
                return Err(error.to_string());
            }
        }
    }

    let mut tool_calls_vec: Vec<_> = accumulated_tool_calls.into_iter().collect();
    tool_calls_vec.sort_by_key(|(index, _)| *index);
    let tool_calls: Vec<_> = tool_calls_vec
        .into_iter()
        .map(|(index, mut tool_call)| {
            if tool_call.id.trim().is_empty() {
                tool_call.id = format!("stream_tool_call_{}", index);
            }
            if tool_call.name.trim().is_empty() {
                tool_call.name = "unknown_tool".to_string();
            }
            tool_call
        })
        .collect();

    if thinking_started {
        crate::sys::commands::thinking::emit_thinking_complete(
            app_handle,
            full_reasoning,
            None,
            Some(message_id.to_string()),
        );
    }

    Ok(ConsumeStreamResult {
        tool_calls,
        token_count,
        estimated_output_tokens,
        usage: final_usage,
        credits: final_credits,
        model: final_model,
        finish_reason: final_finish_reason,
        was_stopped,
    })
}
