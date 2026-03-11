//! Streaming helpers — SSE stream consumption, tool call execution, timeout resolution.

use std::sync::Arc;
use tauri::Emitter;
use tracing::{debug, error, info, warn};

use super::pending::{has_pending_messages, peek_pending_messages};
use super::state::{
    is_tool_cancelled, should_stop_for_conversation, take_tool_cancelled,
    DEFAULT_TOOL_TIMEOUT_SECS, FAST_METADATA_FOLLOWUP_INVOKE_TIMEOUT_SECS,
    FAST_METADATA_FOLLOWUP_TOTAL_TIMEOUT_SECS, FAST_METADATA_TOOL_LOOP_MAX_ITERATIONS,
    FAST_METADATA_TOOL_LOOP_MAX_SECS, FAST_TOOL_TIMEOUT_SECS, FOLLOWUP_INVOKE_TIMEOUT_SECS,
    FOLLOWUP_TOTAL_TIMEOUT_SECS, LONG_RUNNING_TOOL_TIMEOUT_SECS,
    MEDIA_FOLLOWUP_INVOKE_TIMEOUT_SECS, STREAMING_TOOL_LOOP_MAX_ITERATIONS,
    STREAMING_TOOL_LOOP_MAX_SECS,
};
use super::tool_events::{emit_tool_event, get_tool_display_info, ToolEvent};
use super::tools;

/// Result of consuming an SSE stream via [`consume_llm_stream`].
///
/// Contains all accumulated data from the stream: tool call deltas merged by index,
/// the approximate token count, optional provider usage/credits metadata, the finish
/// reason string, and whether the user triggered a generation stop.
pub(crate) struct ConsumeStreamResult {
    /// Merged tool calls extracted from streaming deltas, sorted by index.
    /// Empty if the model produced only text content.
    pub tool_calls: Vec<crate::core::llm::sse_parser::StreamingToolCall>,
    /// Approximate output token count (incremented once per non-keepalive chunk).
    pub token_count: u32,
    /// Provider-reported token usage, typically present only in the final chunk.
    pub usage: Option<crate::core::llm::sse_parser::TokenUsage>,
    /// Billing credits information, if returned by the provider.
    pub credits: Option<crate::core::llm::CreditsInfo>,
    /// The finish reason from the last chunk (e.g. "stop", "tool_calls", "length").
    pub finish_reason: Option<String>,
    /// `true` when the user stopped generation mid-stream.
    pub was_stopped: bool,
}

/// Consume an SSE stream, emitting `chat:stream-chunk` events to the frontend
/// and accumulating content + tool calls.
///
/// This is the single source of truth for reading a streaming LLM response.
/// Both the initial streaming path and agentic-loop follow-up iterations
/// call this helper to avoid duplicating the chunk-processing logic.
///
/// # Arguments
/// * `stream` - The SSE stream from the LLM router.
/// * `app_handle` - Tauri app handle for emitting events.
/// * `conversation_id` - The conversation this stream belongs to.
/// * `message_id` - Frontend message ID for event correlation.
/// * `full_content` - Mutable reference to the accumulated response text.
///   New chunks are appended here. The caller owns the buffer.
/// * `idle_timeout_secs` - Maximum seconds to wait for the next chunk before
///   considering the connection dead.
pub(crate) async fn consume_llm_stream(
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
    use futures_util::StreamExt;
    use std::collections::HashMap;

    let mut token_count = 0u32;
    let mut was_stopped = false;
    let mut final_usage = None;
    let mut final_credits = None;
    let mut final_finish_reason: Option<String> = None;

    // Accumulate tool calls from streaming chunks.
    // Tool calls arrive in multiple chunks and must be merged by index.
    let mut accumulated_tool_calls: HashMap<
        usize,
        crate::core::llm::sse_parser::StreamingToolCall,
    > = HashMap::new();

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
                // The idle timeout fired -- no bytes (including keepalives) arrived
                // for the configured duration. The provider connection is likely dead.
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

        // Check for pending user messages during streaming
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
                // Keepalive chunks carry no content -- skip content processing.
                if chunk.keepalive {
                    continue;
                }

                full_content.push_str(&chunk.content);
                token_count += 1;

                // Track finish reason (important for detecting tool_calls)
                if let Some(ref finish) = chunk.finish_reason {
                    final_finish_reason = Some(finish.clone());
                }

                // Accumulate tool calls from this chunk
                if let Some(ref tool_calls) = chunk.tool_calls {
                    for tc in tool_calls {
                        let entry = accumulated_tool_calls.entry(tc.index).or_insert_with(|| {
                            crate::core::llm::sse_parser::StreamingToolCall {
                                index: tc.index,
                                id: String::new(),
                                name: String::new(),
                                arguments: String::new(),
                            }
                        });

                        // Merge: ID and name only appear in first chunk
                        if !tc.id.is_empty() {
                            entry.id = tc.id.clone();
                        }
                        if !tc.name.is_empty() {
                            entry.name = tc.name.clone();
                        }
                        // Arguments are streamed across multiple chunks
                        entry.arguments.push_str(&tc.arguments);
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
            Err(e) => {
                info!("[Chat] Stream error: {e}");
                let _ = app_handle.emit(
                    "chat:stream-error",
                    serde_json::json!({
                        "conversation_id": conversation_id,
                        "message_id": message_id,
                        "error": e.to_string()
                    }),
                );
                return Err(e.to_string());
            }
        }
    }

    // Convert accumulated tool calls to a sorted Vec with normalized IDs/names
    let mut tool_calls_vec: Vec<_> = accumulated_tool_calls.into_iter().collect();
    tool_calls_vec.sort_by_key(|(idx, _)| *idx);
    let tool_calls: Vec<_> = tool_calls_vec
        .into_iter()
        .map(|(idx, mut tc)| {
            if tc.id.trim().is_empty() {
                tc.id = format!("stream_tool_call_{}", idx);
            }
            if tc.name.trim().is_empty() {
                tc.name = "unknown_tool".to_string();
            }
            tc
        })
        .collect();

    Ok(ConsumeStreamResult {
        tool_calls,
        token_count,
        usage: final_usage,
        credits: final_credits,
        finish_reason: final_finish_reason,
        was_stopped,
    })
}

/// Execute a batch of tool calls, emitting events for each tool execution and result.
///
/// Server-side tools (prefixed with `__server__`) are skipped with a result event emitted.
/// Returns `(tool_results, tool_failure_summaries)`.
pub(crate) async fn execute_tool_calls_batch(
    tool_calls: &[crate::core::llm::sse_parser::StreamingToolCall],
    app_handle: &tauri::AppHandle,
    conversation_id: i64,
    frontend_message_id: &str,
    project_folder: Option<String>,
    conversation_mode: Option<String>,
    iteration: usize,
) -> (Vec<tools::ChatToolResult>, Vec<String>) {
    let mut tool_results = Vec::new();
    let mut tool_failure_summaries = Vec::new();

    for tc in tool_calls {
        // Skip server-side tool calls (prefixed with __server__
        // or server tool names from Anthropic).  These are
        // executed on Anthropic's servers, not locally.
        if tc.name.starts_with("__server__") {
            info!(
                "[Chat] Skipping server-side tool: {} (id: {})",
                tc.name, tc.id
            );
            let _ = app_handle.emit(
                "chat:tool-result",
                serde_json::json!({
                    "conversation_id": conversation_id,
                    "message_id": frontend_message_id,
                    "tool_call_id": tc.id,
                    "tool_name": tc.name,
                    "success": true,
                    "result": "Tool executed server-side by provider; no local output.",
                    "result_data": {
                        "success": true,
                        "server_side": true,
                        "status": "completed"
                    }
                }),
            );
            continue;
        }

        info!("[Chat] Executing tool: {} (id: {})", tc.name, tc.id);

        // Emit tool executing event
        let _ = app_handle.emit(
            "chat:tool-executing",
            serde_json::json!({
                "conversation_id": conversation_id,
                "message_id": frontend_message_id,
                "tool_call_id": tc.id,
                "tool_name": tc.name,
                "arguments": tc.arguments
            }),
        );

        // Emit structured ToolEvent::Started for frontend tool timeline
        let display_info = get_tool_display_info(&tc.name, &tc.arguments);
        let tool_exec_id = format!("{}_{}", tc.id, uuid::Uuid::new_v4().as_simple());
        let tool_started_at = std::time::Instant::now();

        emit_tool_event(
            app_handle,
            &ToolEvent::Started {
                id: tool_exec_id.clone(),
                conversation_id,
                message_id: frontend_message_id.to_string(),
                tool_name: tc.name.clone(),
                display_name: display_info.display_name.clone(),
                display_args: display_info.display_args.clone(),
                iteration,
                parallel_group: None,
            },
        );

        // Execute the tool
        tracing::info!(
            "[Chat] Starting tool execution: {} with id={}",
            tc.name,
            tc.id
        );
        let result = execute_chat_tool_with_timeout(
            &tc.name,
            &tc.arguments,
            app_handle,
            conversation_id,
            project_folder.clone(),
            conversation_mode.clone(),
            Some(tc.id.as_str()),
            None, // registry threaded from send_message.rs in a follow-up refactor
        )
        .await;

        let tool_duration_ms = tool_started_at.elapsed().as_millis() as u64;

        let (success, result_content) = match result {
            Ok(content) => {
                info!("[Chat] Tool {} succeeded", tc.name);
                (true, content)
            }
            Err(e) => {
                error!("[Chat] Tool {} failed: {}", tc.name, e);
                (false, format!("Error: {}", e))
            }
        };

        // Emit structured ToolEvent::Completed for frontend tool timeline
        emit_tool_event(
            app_handle,
            &ToolEvent::Completed {
                id: tool_exec_id,
                conversation_id,
                message_id: frontend_message_id.to_string(),
                success,
                duration_ms: tool_duration_ms,
                result_preview: Some(result_content.chars().take(200).collect()),
                error: if success {
                    None
                } else {
                    Some(result_content.clone())
                },
            },
        );

        if !success {
            let mut summary = result_content.replace('\n', " ");
            summary = summary.chars().take(200).collect();
            tool_failure_summaries.push(format!("{}: {}", tc.name, summary));
        }

        let result_data = serde_json::from_str::<serde_json::Value>(&result_content).ok();

        // Emit tool result event (full result for richer UI display)
        tracing::info!(
            "[Chat] Emitting tool result event for {} success={}",
            tc.name,
            success
        );
        let _ = app_handle.emit(
            "chat:tool-result",
            serde_json::json!({
                "conversation_id": conversation_id,
                "message_id": frontend_message_id,
                "tool_call_id": tc.id,
                "tool_name": tc.name,
                "success": success,
                "result": result_content.chars().take(50000).collect::<String>(),
                "result_data": result_data
            }),
        );

        tool_results.push(tools::ChatToolResult::new(
            tc.id.clone(),
            tc.name.clone(),
            success,
            result_content,
        ));

        // Emit a progress event for media generation tools so the UI shows
        // "Processing generated image..." instead of appearing frozen.
        if success && is_media_generation_tool(&tc.name) {
            let _ = app_handle.emit(
                "chat:tool-progress",
                serde_json::json!({
                    "conversation_id": conversation_id,
                    "tool_name": tc.name,
                    "status": "processing_result",
                    "message": "Processing generated image..."
                }),
            );
        }
    }

    (tool_results, tool_failure_summaries)
}

/// Normalize tool call IDs to prevent blank or missing IDs from causing
/// artifact/status update collisions (AUDIT-STREAM-072 fix).
///
/// Takes raw `ToolCall` items from an LLM response and returns `StreamingToolCall`
/// items with guaranteed non-empty IDs and names.
pub(crate) fn normalize_tool_calls(
    tool_calls: &[crate::core::llm::ToolCall],
    id_prefix: &str,
) -> Vec<crate::core::llm::sse_parser::StreamingToolCall> {
    tool_calls
        .iter()
        .enumerate()
        .map(|(idx, tc)| {
            let mut normalized_id = tc.id.clone();
            if normalized_id.trim().is_empty() {
                normalized_id = format!("{}_{}", id_prefix, idx);
            }
            crate::core::llm::sse_parser::StreamingToolCall {
                index: idx,
                id: normalized_id,
                name: if tc.name.trim().is_empty() {
                    "unknown_tool".to_string()
                } else {
                    tc.name.clone()
                },
                arguments: tc.arguments.clone(),
            }
        })
        .collect()
}

pub(crate) fn emit_stream_failure(
    app_handle: &tauri::AppHandle,
    conversation_id: i64,
    message_id: &str,
    error: String,
    partial_content: Option<&str>,
) {
    let _ = app_handle.emit(
        "chat:stream-error",
        serde_json::json!({
            "conversation_id": conversation_id,
            "message_id": message_id,
            "error": error
        }),
    );
    let _ = app_handle.emit(
        "chat:stream-end",
        serde_json::json!({
            "conversation_id": conversation_id,
            "message_id": message_id,
            "content": partial_content.unwrap_or_default(),
            "error": true,
            "has_pending_messages": has_pending_messages()
        }),
    );
}

// ============================================================================
// Timeout resolution helpers
// ============================================================================

pub(crate) fn resolve_tool_execution_timeout_secs(tool_name: &str) -> u64 {
    let normalized = tool_name.to_lowercase();
    if normalized == "file_read"
        || normalized == "file_list"
        || normalized.contains("list_directory")
        || normalized.contains("filesystem__list_directory")
        || normalized.contains("list_allowed_directories")
        || normalized.contains("filesystem__list_allowed_directories")
        || normalized.contains("read_text_file")
        || normalized.contains("filesystem__read_text_file")
    {
        return FAST_TOOL_TIMEOUT_SECS;
    }

    if normalized == "terminal_execute"
        || normalized.starts_with("document_create_")
        || normalized == "video_generate"
        || normalized == "media_generate_video"
        || normalized == "image_generate"
        || normalized == "media_generate_image"
    {
        return LONG_RUNNING_TOOL_TIMEOUT_SECS;
    }

    DEFAULT_TOOL_TIMEOUT_SECS
}

pub(crate) fn is_fast_metadata_tool(tool_name: &str) -> bool {
    resolve_tool_execution_timeout_secs(tool_name) == FAST_TOOL_TIMEOUT_SECS
}

/// Check if a tool is a media generation tool (image/video generation).
/// These tools require extended followup timeouts because the generated
/// output is large and the followup model needs extra time to process it.
pub(crate) fn is_media_generation_tool(tool_name: &str) -> bool {
    let normalized = tool_name.to_lowercase();
    normalized == "image_generate"
        || normalized == "media_generate_image"
        || normalized == "video_generate"
        || normalized == "media_generate_video"
}

pub(crate) fn is_fast_metadata_batch(tool_results: &[tools::ChatToolResult]) -> bool {
    !tool_results.is_empty()
        && tool_results
            .iter()
            .all(|result| is_fast_metadata_tool(&result.tool_name))
}

pub(crate) fn did_fast_metadata_batch_fail(tool_results: &[tools::ChatToolResult]) -> bool {
    is_fast_metadata_batch(tool_results) && tool_results.iter().all(|result| !result.success)
}

pub(crate) fn build_fast_metadata_failure_message(tool_failure_summaries: &[String]) -> String {
    if tool_failure_summaries.is_empty() {
        return "I couldn't access local files right now. Please select or allow a project folder and retry.".to_string();
    }

    format!(
        "I couldn't access local files right now because file access tools failed: {}. \
Please select or allow a project folder and retry.",
        tool_failure_summaries.join("; ")
    )
}

pub(crate) fn resolve_followup_invoke_timeout_secs(
    only_fast_metadata_tools: bool,
    has_media_tools: bool,
) -> u64 {
    if only_fast_metadata_tools {
        FAST_METADATA_FOLLOWUP_INVOKE_TIMEOUT_SECS
    } else if has_media_tools {
        MEDIA_FOLLOWUP_INVOKE_TIMEOUT_SECS
    } else {
        FOLLOWUP_INVOKE_TIMEOUT_SECS
    }
}

pub(crate) fn resolve_followup_total_timeout_secs(only_fast_metadata_tools: bool) -> u64 {
    if only_fast_metadata_tools {
        FAST_METADATA_FOLLOWUP_TOTAL_TIMEOUT_SECS
    } else {
        FOLLOWUP_TOTAL_TIMEOUT_SECS
    }
}

pub(crate) fn resolve_streaming_tool_loop_max_secs(only_fast_metadata_tools: bool) -> u64 {
    if only_fast_metadata_tools {
        FAST_METADATA_TOOL_LOOP_MAX_SECS
    } else {
        STREAMING_TOOL_LOOP_MAX_SECS
    }
}

pub(crate) fn resolve_streaming_tool_loop_max_iterations(only_fast_metadata_tools: bool) -> usize {
    if only_fast_metadata_tools {
        FAST_METADATA_TOOL_LOOP_MAX_ITERATIONS
    } else {
        STREAMING_TOOL_LOOP_MAX_ITERATIONS
    }
}

pub(crate) async fn execute_chat_tool_with_timeout(
    tool_name: &str,
    arguments_json: &str,
    app_handle: &tauri::AppHandle,
    conversation_id: i64,
    project_folder: Option<String>,
    conversation_mode: Option<String>,
    tool_call_id: Option<&str>,
    registry: Option<Arc<crate::core::agi::tools::ToolRegistry>>,
) -> Result<String, String> {
    let timeout_secs = resolve_tool_execution_timeout_secs(tool_name);
    let timeout_duration = std::time::Duration::from_secs(timeout_secs);
    let started_at = std::time::Instant::now();
    let normalized_tool_call_id = tool_call_id
        .map(str::trim)
        .filter(|value| !value.is_empty());

    if let Some(tool_id) = normalized_tool_call_id {
        if take_tool_cancelled(tool_id) {
            crate::ui::events::tool_stream::emit_tool_cancelled(
                app_handle,
                tool_id,
                Some("Cancelled before execution"),
                0,
            );
            return Err(format!("Tool '{}' cancelled by user", tool_name));
        }
    }

    tracing::info!(
        "[Chat] Tool invoke start id={} tool={} timeout={}s",
        normalized_tool_call_id.unwrap_or("n/a"),
        tool_name,
        timeout_secs
    );

    // AUDIT-CANCEL-060 fix: Spawn tool execution as a task so it can be aborted on cancellation.
    // This ensures that when a user cancels a tool, the underlying process is terminated,
    // rather than relying on cooperative cancellation which may not work for long-running tools.
    let tool_name_owned = tool_name.to_string();
    let arguments_json_owned = arguments_json.to_string();
    let project_folder_owned = project_folder.clone();
    let conversation_mode_owned = conversation_mode.clone();
    let tool_call_id_owned = normalized_tool_call_id.map(|s| s.to_string());
    let app_handle_clone = app_handle.clone();

    let exec_task = tokio::task::spawn(async move {
        tools::execute_chat_tool(
            &tool_name_owned,
            &arguments_json_owned,
            Some(&app_handle_clone),
            project_folder_owned,
            conversation_mode_owned,
            tool_call_id_owned.as_deref(),
            registry,
        )
        .await
    });
    let exec_abort_handle = exec_task.abort_handle();

    // Wrap in a pinned future to work with select!
    let mut execute_future = std::pin::Pin::from(Box::new(exec_task)
        as Box<
            dyn std::future::Future<
                    Output = Result<Result<String, anyhow::Error>, tokio::task::JoinError>,
                > + Send,
        >);

    let timeout_future = tokio::time::sleep(timeout_duration);
    tokio::pin!(timeout_future);

    let mut cancel_interval = tokio::time::interval(std::time::Duration::from_millis(100));
    cancel_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    loop {
        tokio::select! {
            result = &mut execute_future => {
                if let Some(tool_id) = normalized_tool_call_id {
                    let _ = take_tool_cancelled(tool_id);
                }
                let elapsed_ms = started_at.elapsed().as_millis() as u64;

                // AUDIT-STREAM-021 fix: Check if generation was stopped BEFORE processing result.
                // This prevents continuing to process tool output after user requested stop.
                if should_stop_for_conversation(conversation_id) {
                    if let Some(tool_id) = normalized_tool_call_id {
                        crate::ui::events::tool_stream::emit_tool_cancelled(
                            app_handle,
                            tool_id,
                            Some("Generation stopped by user"),
                            elapsed_ms,
                        );
                    }
                    tracing::info!(
                        "[Chat] Tool execution stopped before result processing id={} tool={} elapsed_ms={}",
                        normalized_tool_call_id.unwrap_or("n/a"),
                        tool_name,
                        elapsed_ms
                    );
                    return Err(format!("Tool '{}' stopped by user", tool_name));
                }

                match result {
                    Ok(Ok(content)) => {
                        tracing::info!(
                            "[Chat] Tool invoke completed id={} tool={} elapsed_ms={}",
                            normalized_tool_call_id.unwrap_or("n/a"),
                            tool_name,
                            elapsed_ms
                        );
                        return Ok(content);
                    }
                    Ok(Err(tool_error)) => {
                        // Tool returned an error (not cancelled)
                        tracing::warn!(
                            "[Chat] Tool invoke failed id={} tool={} elapsed_ms={} error={}",
                            normalized_tool_call_id.unwrap_or("n/a"),
                            tool_name,
                            elapsed_ms,
                            tool_error
                        );
                        return Err(tool_error.to_string());
                    }
                    Err(join_err) if join_err.is_cancelled() => {
                        // AUDIT-CANCEL-060 fix: Handle task cancellation explicitly
                        // This happens when we abort the task on user cancellation
                        let elapsed_ms = started_at.elapsed().as_millis() as u64;
                        tracing::info!(
                            "[Chat] Tool invoke cancelled (task aborted) id={} tool={} elapsed_ms={}",
                            normalized_tool_call_id.unwrap_or("n/a"),
                            tool_name,
                            elapsed_ms
                        );
                        return Err(format!("Tool '{}' cancelled by user", tool_name));
                    }
                    Err(join_err) => {
                        // Other join error
                        tracing::warn!(
                            "[Chat] Tool invoke failed (join error) id={} tool={} elapsed_ms={} error={}",
                            normalized_tool_call_id.unwrap_or("n/a"),
                            tool_name,
                            elapsed_ms,
                            join_err
                        );
                        return Err(format!("Tool execution failed: {}", join_err));
                    }
                }
            }
            _ = &mut timeout_future => {
                // AUDIT-CANCEL-060 fix: Abort the task on timeout to stop the running tool
                exec_abort_handle.abort();
                let elapsed_ms = started_at.elapsed().as_millis() as u64;
                let message = format!("Tool '{}' timed out after {}s", tool_name, timeout_secs);
                if let Some(tool_id) = normalized_tool_call_id {
                    crate::ui::events::tool_stream::emit_tool_error(
                        app_handle,
                        tool_id,
                        &message,
                        elapsed_ms,
                        true,
                    );
                    let _ = take_tool_cancelled(tool_id);
                }
                tracing::warn!(
                    "[Chat] Tool invoke timeout id={} tool={} timeout={}s",
                    normalized_tool_call_id.unwrap_or("n/a"),
                    tool_name,
                    timeout_secs
                );
                return Err(message);
            }
            _ = cancel_interval.tick(), if normalized_tool_call_id.is_some() => {
                // AUDIT-STREAM-021 fix: Check both per-tool cancellation AND global stop flag
                // AUDIT-CANCEL-060 fix: Use non-consuming check for polling, consume on actual handling, abort task
                if let Some(tool_id) = normalized_tool_call_id {
                    // First check per-tool cancellation (non-consuming check for frequent polling)
                    if is_tool_cancelled(tool_id) {
                        // Consume the cancellation flag now that we've detected it
                        let _ = take_tool_cancelled(tool_id);
                        // AUDIT-CANCEL-060 fix: Abort the spawned task to stop the running tool
                        exec_abort_handle.abort();
                        let elapsed_ms = started_at.elapsed().as_millis() as u64;
                        crate::ui::events::tool_stream::emit_tool_cancelled(
                            app_handle,
                            tool_id,
                            Some("Cancelled by user"),
                            elapsed_ms,
                        );
                        tracing::info!(
                            "[Chat] Tool invoke cancelled id={} tool={} elapsed_ms={}",
                            tool_id,
                            tool_name,
                            elapsed_ms
                        );
                        return Err(format!("Tool '{}' cancelled by user", tool_name));
                    }
                }
                // Also check global stop generation flag
                if should_stop_for_conversation(conversation_id) {
                    // AUDIT-CANCEL-060 fix: Abort the spawned task to stop the running tool
                    exec_abort_handle.abort();
                    let elapsed_ms = started_at.elapsed().as_millis() as u64;
                    if let Some(tool_id) = normalized_tool_call_id {
                        crate::ui::events::tool_stream::emit_tool_cancelled(
                            app_handle,
                            tool_id,
                            Some("Generation stopped by user"),
                            elapsed_ms,
                        );
                    }
                    tracing::info!(
                        "[Chat] Tool invoke stopped by global flag id={} tool={} elapsed_ms={}",
                        normalized_tool_call_id.unwrap_or("n/a"),
                        tool_name,
                        elapsed_ms
                    );
                    return Err(format!("Tool '{}' stopped by user", tool_name));
                }
            }
        }
    }
}

/// Ensure ManagedCloud provider is registered in the router for authenticated users.
///
/// If the user has a valid access token but ManagedCloud is not yet set up, this
/// function initializes and registers it. Does nothing if already present or the
/// user is not authenticated.
pub(crate) async fn ensure_managed_cloud_provider(
    router: &Arc<tokio::sync::RwLock<crate::core::llm::llm_router::LLMRouter>>,
) {
    use crate::core::llm::providers::managed_cloud_provider::ManagedCloudProvider;
    use crate::core::llm::Provider;
    use crate::sys::account::get_access_token;

    let has_managed_cloud = {
        let r = router.read().await;
        r.has_provider(Provider::ManagedCloud)
    };

    if !has_managed_cloud {
        match get_access_token() {
            Ok(_) => {
                // User is authenticated, register ManagedCloud provider
                match ManagedCloudProvider::new() {
                    Ok(provider) => {
                        let mut r = router.write().await;
                        r.set_managed_cloud(Box::new(provider));
                        info!("[Chat] Initialized ManagedCloud provider for authenticated user");
                    }
                    Err(e) => {
                        warn!("[Chat] Failed to create ManagedCloud provider: {}", e);
                    }
                }
            }
            Err(_) => {
                // User not authenticated, ManagedCloud won't be available
                debug!("[Chat] User not authenticated, ManagedCloud provider not available");
            }
        }
    }
}
