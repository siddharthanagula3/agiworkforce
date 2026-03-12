use crate::sys::commands::chat::state::{
    is_tool_cancelled, should_stop_for_conversation, take_tool_cancelled,
};
use crate::sys::commands::chat::tool_events::{emit_tool_event, get_tool_display_info, ToolEvent};
use crate::sys::commands::chat::tool_timeouts::{
    is_media_generation_tool, resolve_tool_execution_timeout_secs,
};
use crate::sys::commands::chat::tools::{self, ChatToolResult};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tracing::{error, info};

pub(super) async fn execute_tool_calls_batch(
    tool_calls: &[crate::core::llm::sse_parser::StreamingToolCall],
    app_handle: &AppHandle,
    conversation_id: i64,
    frontend_message_id: &str,
    project_folder: Option<String>,
    conversation_mode: Option<String>,
    iteration: usize,
    registry: Option<Arc<crate::core::agi::tools::ToolRegistry>>,
) -> (Vec<ChatToolResult>, Vec<String>) {
    let mut tool_results = Vec::new();
    let mut tool_failure_summaries = Vec::new();

    for tool_call in tool_calls {
        if tool_call.name.starts_with("__server__") {
            info!(
                "[Chat] Skipping server-side tool: {} (id: {})",
                tool_call.name, tool_call.id
            );
            let _ = app_handle.emit(
                "chat:tool-result",
                serde_json::json!({
                    "conversation_id": conversation_id,
                    "message_id": frontend_message_id,
                    "tool_call_id": tool_call.id,
                    "tool_name": tool_call.name,
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

        info!(
            "[Chat] Executing tool: {} (id: {})",
            tool_call.name, tool_call.id
        );

        let _ = app_handle.emit(
            "chat:tool-executing",
            serde_json::json!({
                "conversation_id": conversation_id,
                "message_id": frontend_message_id,
                "tool_call_id": tool_call.id,
                "tool_name": tool_call.name,
                "arguments": tool_call.arguments
            }),
        );

        let display_info = get_tool_display_info(&tool_call.name, &tool_call.arguments);
        let tool_exec_id = format!("{}_{}", tool_call.id, uuid::Uuid::new_v4().as_simple());
        let tool_started_at = std::time::Instant::now();

        emit_tool_event(
            app_handle,
            &ToolEvent::Started {
                id: tool_exec_id.clone(),
                conversation_id,
                message_id: frontend_message_id.to_string(),
                tool_name: tool_call.name.clone(),
                display_name: display_info.display_name.clone(),
                display_args: display_info.display_args.clone(),
                iteration,
                parallel_group: None,
            },
        );

        tracing::info!(
            "[Chat] Starting tool execution: {} with id={}",
            tool_call.name,
            tool_call.id
        );
        let result = execute_chat_tool_with_timeout(
            &tool_call.name,
            &tool_call.arguments,
            app_handle,
            conversation_id,
            project_folder.clone(),
            conversation_mode.clone(),
            Some(tool_call.id.as_str()),
            registry.clone(),
        )
        .await;

        let tool_duration_ms = tool_started_at.elapsed().as_millis() as u64;

        let (success, result_content) = match result {
            Ok(content) => {
                info!("[Chat] Tool {} succeeded", tool_call.name);
                (true, content)
            }
            Err(error) => {
                error!("[Chat] Tool {} failed: {}", tool_call.name, error);
                (false, format!("Error: {}", error))
            }
        };

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
            tool_failure_summaries.push(format!("{}: {}", tool_call.name, summary));
        }

        let result_data = serde_json::from_str::<serde_json::Value>(&result_content).ok();

        let _ = app_handle.emit(
            "chat:tool-result",
            serde_json::json!({
                "conversation_id": conversation_id,
                "message_id": frontend_message_id,
                "tool_call_id": tool_call.id,
                "tool_name": tool_call.name,
                "success": success,
                "result": result_content.chars().take(50000).collect::<String>(),
                "result_data": result_data
            }),
        );

        tool_results.push(ChatToolResult::new(
            tool_call.id.clone(),
            tool_call.name.clone(),
            success,
            result_content,
        ));

        if success && is_media_generation_tool(&tool_call.name) {
            let _ = app_handle.emit(
                "chat:tool-progress",
                serde_json::json!({
                    "conversation_id": conversation_id,
                    "tool_name": tool_call.name,
                    "status": "processing_result",
                    "message": "Processing generated image..."
                }),
            );
        }
    }

    (tool_results, tool_failure_summaries)
}

pub(super) async fn execute_chat_tool_with_timeout(
    tool_name: &str,
    arguments_json: &str,
    app_handle: &AppHandle,
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

    let tool_name_owned = tool_name.to_string();
    let arguments_json_owned = arguments_json.to_string();
    let project_folder_owned = project_folder.clone();
    let conversation_mode_owned = conversation_mode.clone();
    let tool_call_id_owned = normalized_tool_call_id.map(|value| value.to_string());
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
                if let Some(tool_id) = normalized_tool_call_id {
                    if is_tool_cancelled(tool_id) {
                        let _ = take_tool_cancelled(tool_id);
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
                if should_stop_for_conversation(conversation_id) {
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
