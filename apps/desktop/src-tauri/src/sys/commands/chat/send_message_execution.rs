use super::*;
use crate::core::llm::cost_calculator::CostCalculator;
use crate::core::llm::sse_parser::TokenUsage;
use crate::core::llm::{ChatMessage, LLMRequest};
use crate::sys::commands::chat::send_message_setup::PreparedSendMessage;

#[derive(Clone)]
pub(super) struct SendMessageRuntime {
    pub app_handle: tauri::AppHandle,
    pub db: AppDatabase,
    pub router: std::sync::Arc<tokio::sync::RwLock<crate::core::llm::LLMRouter>>,
    pub research_config: crate::core::research::ResearchConfig,
    pub correlation_id: String,
}

pub(super) async fn handle_streaming_message(
    runtime: SendMessageRuntime,
    prepared: PreparedSendMessage,
) -> Result<ChatSendMessageResponse, String> {
    reset_stop_flag();

    let response =
        empty_streaming_response(prepared.conversation.clone(), prepared.user_message.clone());
    let frontend_message_id = prepared
        .request
        .frontend_message_id
        .clone()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "Streaming chat requires a frontend message id".to_string())?;

    let _ = runtime.app_handle.emit(
        "chat:stream-start",
        serde_json::json!({
            "conversation_id": prepared.conversation.id,
            "message_id": frontend_message_id,
            "created_at": Utc::now().to_rfc3339()
        }),
    );

    if prepared.flags.is_deep_research {
        spawn_streaming_deep_research(runtime, prepared, frontend_message_id);
        return Ok(response);
    }

    info!(
        target: "chat",
        correlation_id = %runtime.correlation_id,
        agent_mode = prepared.flags.agent_mode,
        is_deep_research = prepared.flags.is_deep_research,
        "Starting chat message processing"
    );

    if prepared.flags.agent_mode {
        spawn_streaming_agent(runtime, prepared, frontend_message_id);
        return Ok(response);
    }

    spawn_streaming_chat(runtime, prepared, frontend_message_id);
    Ok(response)
}

pub(super) async fn handle_nonstreaming_message(
    runtime: SendMessageRuntime,
    prepared: PreparedSendMessage,
) -> Result<ChatSendMessageResponse, String> {
    if prepared.flags.is_deep_research {
        return run_nonstreaming_deep_research(runtime, prepared).await;
    }

    if prepared.flags.agent_mode {
        return run_nonstreaming_agent(runtime, prepared).await;
    }

    ensure_managed_cloud_provider(&runtime.router).await;
    run_nonstreaming_chat(runtime, prepared).await
}

fn empty_streaming_response(
    conversation: Conversation,
    user_message: Message,
) -> ChatSendMessageResponse {
    ChatSendMessageResponse {
        conversation,
        user_message,
        assistant_message: Message::default(),
        stats: ConversationStats {
            message_count: 0,
            total_tokens: 0,
            total_input_tokens: 0,
            total_output_tokens: 0,
            total_cost: 0.0,
        },
        last_message: None,
        credits: None,
    }
}

fn spawn_streaming_deep_research(
    runtime: SendMessageRuntime,
    prepared: PreparedSendMessage,
    frontend_message_id: String,
) {
    use crate::core::research::{ResearchMode, ResearchOrchestrator};

    let PreparedSendMessage {
        request,
        conversation,
        provider_enum,
        model,
        flags,
        cloud_sync_enabled,
        ..
    } = prepared;

    let research_task_id = request.research_task_id.clone().unwrap_or_else(|| {
        format!(
            "research-{}-{}",
            Utc::now().timestamp_millis(),
            uuid::Uuid::new_v4()
                .to_string()
                .split('-')
                .next()
                .unwrap_or("x")
        )
    });
    let query = request.content.clone();

    tauri::async_runtime::spawn(async move {
        info!(
            target: "chat",
            correlation_id = %runtime.correlation_id,
            "Deep research chat message processing started"
        );

        let _ = runtime.app_handle.emit(
            "chat:stream-chunk",
            serde_json::json!({
                "conversation_id": conversation.id,
                "message_id": frontend_message_id,
                "delta": "Starting deep research...\n",
                "content": "Starting deep research...\n",
                "has_pending_messages": has_pending_messages()
            }),
        );

        let orchestrator =
            match ResearchOrchestrator::new(runtime.router.clone(), runtime.research_config) {
                Ok(orchestrator) => orchestrator
                    .with_app_handle(runtime.app_handle.clone())
                    .with_task_id(Some(research_task_id.clone())),
                Err(error) => {
                    let error_msg = format!("Failed to initialize research orchestrator: {error}");
                    let _ = runtime.app_handle.emit(
                        "research:error",
                        serde_json::json!({
                            "task_id": research_task_id,
                            "query": query,
                            "error": error_msg,
                        }),
                    );
                    let _ = runtime.app_handle.emit(
                        "chat:stream-error",
                        serde_json::json!({
                            "conversation_id": conversation.id,
                            "message_id": frontend_message_id,
                            "error": "Failed to start deep research"
                        }),
                    );
                    let _ = runtime.app_handle.emit(
                        "chat:stream-end",
                        serde_json::json!({
                            "conversation_id": conversation.id,
                            "message_id": frontend_message_id,
                            "content": "Failed to start deep research.",
                            "error": true,
                            "has_pending_messages": has_pending_messages()
                        }),
                    );
                    return;
                }
            };

        match orchestrator.research(&query, ResearchMode::Deep).await {
            Ok(result) => {
                let _ = runtime.app_handle.emit(
                    "chat:stream-chunk",
                    serde_json::json!({
                        "conversation_id": conversation.id,
                        "message_id": frontend_message_id,
                        "delta": result.report.clone(),
                        "content": result.report.clone(),
                        "has_pending_messages": has_pending_messages()
                    }),
                );

                let assistant_message = match save_or_skip_assistant_message(
                    &runtime.db,
                    conversation.id,
                    &request.user_id,
                    &result.report,
                    None,
                    None,
                    provider_enum.map(|provider| provider.as_string()),
                    &model,
                    flags.incognito,
                    cloud_sync_enabled,
                ) {
                    Ok(message) => message,
                    Err(error) => {
                        emit_stream_failure(
                            &runtime.app_handle,
                            conversation.id,
                            &frontend_message_id,
                            format!("Failed to save deep research message: {error}"),
                            Some(&result.report),
                        );
                        return;
                    }
                };

                let _ = runtime.app_handle.emit(
                    "chat:stream-end",
                    serde_json::json!({
                        "conversation_id": conversation.id,
                        "message_id": frontend_message_id,
                        "backend_message_id": assistant_message.id,
                        "pending_messages_count": pending_messages_count(),
                        "has_pending_messages": has_pending_messages()
                    }),
                );
            }
            Err(error) => {
                let error_msg = error.to_string();
                let _ = runtime.app_handle.emit(
                    "research:error",
                    serde_json::json!({
                        "task_id": research_task_id,
                        "query": query,
                        "error": error_msg.clone(),
                    }),
                );
                let _ = runtime.app_handle.emit(
                    "chat:stream-error",
                    serde_json::json!({
                        "conversation_id": conversation.id,
                        "message_id": frontend_message_id,
                        "error": error_msg
                    }),
                );
                let _ = runtime.app_handle.emit(
                    "chat:stream-end",
                    serde_json::json!({
                        "conversation_id": conversation.id,
                        "message_id": frontend_message_id,
                        "content": "Deep research failed.",
                        "error": true,
                        "has_pending_messages": has_pending_messages()
                    }),
                );
            }
        }
    });
}

fn spawn_streaming_agent(
    runtime: SendMessageRuntime,
    prepared: PreparedSendMessage,
    frontend_message_id: String,
) {
    use crate::automation::AutomationService;
    use crate::core::agi::{AGIConfig, AgentOrchestrator};

    let PreparedSendMessage {
        request,
        conversation,
        llm_request,
        preferences,
        provider_enum,
        model,
        agent_instruction,
        flags,
        cloud_sync_enabled,
        ..
    } = prepared;

    tauri::async_runtime::spawn(async move {
        let start_time = std::time::Instant::now();
        let _ = runtime.app_handle.emit(
            "agent:thinking",
            serde_json::json!({
                "thinking": true,
                "message": "Executing agent plan..."
            }),
        );

        let orchestrator_arc = {
            let guard = crate::sys::commands::agi::ORCHESTRATOR.lock();
            guard.clone()
        };

        let orchestrator_arc = match orchestrator_arc {
            Some(orchestrator) => orchestrator,
            None => {
                let automation = match AutomationService::new() {
                    Ok(service) => Arc::new(service),
                    Err(error) => {
                        let error_msg = format!("Automation service unavailable: {}", error);
                        let _ = runtime.app_handle.emit(
                            "agent:finished",
                            serde_json::json!({
                                "success": false,
                                "error": error_msg,
                                "duration_ms": start_time.elapsed().as_millis() as u64
                            }),
                        );
                        let _ = runtime.app_handle.emit(
                            "automation:permission_required",
                            serde_json::json!({
                                "reason": "agent_mode",
                                "message": "Grant Accessibility, Screen Recording, and Input Monitoring permissions to use Agent mode."
                            }),
                        );
                        let _ = runtime.app_handle.emit(
                            "chat:stream-error",
                            serde_json::json!({
                                "conversation_id": conversation.id,
                                "message_id": frontend_message_id,
                                "error": "Agent mode requires automation permissions"
                            }),
                        );
                        let _ = runtime.app_handle.emit(
                            "chat:stream-end",
                            serde_json::json!({
                                "conversation_id": conversation.id,
                                "message_id": frontend_message_id,
                                "content": "Agent mode is unavailable (missing automation permissions).",
                                "error": true,
                                "has_pending_messages": has_pending_messages()
                            }),
                        );
                        return;
                    }
                };

                let orchestrator = match AgentOrchestrator::new(
                    4,
                    AGIConfig::default(),
                    runtime.router.clone(),
                    automation,
                    Some(runtime.app_handle.clone()),
                ) {
                    Ok(orchestrator) => orchestrator,
                    Err(error) => {
                        let error_msg = format!("Failed to initialize orchestrator: {}", error);
                        let _ = runtime.app_handle.emit(
                            "agent:finished",
                            serde_json::json!({
                                "success": false,
                                "error": error_msg,
                                "duration_ms": start_time.elapsed().as_millis() as u64
                            }),
                        );
                        let _ = runtime.app_handle.emit(
                            "chat:stream-error",
                            serde_json::json!({
                                "conversation_id": conversation.id,
                                "message_id": frontend_message_id,
                                "error": "Failed to start agent mode"
                            }),
                        );
                        let _ = runtime.app_handle.emit(
                            "chat:stream-end",
                            serde_json::json!({
                                "conversation_id": conversation.id,
                                "message_id": frontend_message_id,
                                "content": "Failed to start agent mode.",
                                "error": true,
                                "has_pending_messages": has_pending_messages()
                            }),
                        );
                        return;
                    }
                };

                let orchestrator_arc = Arc::new(tokio::sync::Mutex::new(orchestrator));
                *crate::sys::commands::agi::ORCHESTRATOR.lock() = Some(orchestrator_arc.clone());
                orchestrator_arc
            }
        };

        let result = {
            let orchestrator = orchestrator_arc.lock().await;
            orchestrator
                .process_instruction(&agent_instruction, request.attachments.clone())
                .await
        };

        let _ = runtime.app_handle.emit(
            "agent:thinking",
            serde_json::json!({
                "thinking": false,
            }),
        );

        match result {
            Ok(orchestrator_result) => {
                let success = orchestrator_result.success;
                let summary = orchestrator_result.summary;
                let mut final_content = summary.clone();
                let mut final_tokens: Option<u32> = None;
                let mut final_cost: Option<f64> = None;
                let mut final_reasoning_content: Option<String> = None;
                let mut final_reasoning_tokens: Option<u32> = None;

                if success {
                    let mut messages = llm_request.messages.clone();
                    let sanitized_summary = sanitize_multiline_for_prompt(&summary, 4096);
                    messages.push(crate::core::llm::ChatMessage {
                        role: "system".to_string(),
                        content: format!(
                            "Agent execution summary:\n{}\n\nProvide a clear final response to the user using this summary.",
                            sanitized_summary
                        ),
                        tool_calls: None,
                        tool_call_id: None,
                        multimodal_content: None,
                    });

                    let final_request = crate::core::llm::LLMRequest {
                        messages,
                        model: model.clone(),
                        temperature: Some(DEFAULT_TEMPERATURE),
                        max_tokens: Some(DEFAULT_MAX_TOKENS),
                        stream: false,
                        tools: None,
                        tool_choice: None,
                        thinking_mode: None,
                        ..Default::default()
                    };

                    let router = runtime.router.read().await;
                    let candidates = router.candidates(&final_request, &preferences);
                    if let Some(candidate) = candidates.first() {
                        match router.invoke_candidate(candidate, &final_request).await {
                            Ok(outcome) => {
                                final_content = outcome.response.content.clone();
                                final_tokens = outcome.response.tokens;
                                final_cost = outcome.response.cost;
                                final_reasoning_content =
                                    outcome.response.reasoning_content.clone();
                                final_reasoning_tokens = outcome
                                    .response
                                    .reasoning_tokens
                                    .or(outcome.response.thinking_tokens);
                            }
                            Err(error) => {
                                tracing::warn!(
                                    target: "chat",
                                    correlation_id = %runtime.correlation_id,
                                    error = %error,
                                    "Agent response synthesis failed"
                                );
                            }
                        }
                    }
                }

                if let Some(reasoning_content) = final_reasoning_content
                    .as_ref()
                    .filter(|content| !content.is_empty())
                {
                    crate::sys::commands::thinking::emit_thinking_complete(
                        &runtime.app_handle,
                        reasoning_content.clone(),
                        final_reasoning_tokens,
                        Some(frontend_message_id.clone()),
                    );
                }

                let _ = runtime.app_handle.emit(
                    "chat:stream-chunk",
                    serde_json::json!({
                        "conversation_id": conversation.id,
                        "message_id": frontend_message_id,
                        "delta": final_content.clone(),
                        "content": final_content.clone(),
                        "has_pending_messages": has_pending_messages()
                    }),
                );

                let assistant_message = match save_or_skip_assistant_message(
                    &runtime.db,
                    conversation.id,
                    &request.user_id,
                    &final_content,
                    final_tokens.map(|tokens| tokens as i32),
                    final_cost,
                    provider_enum.map(|provider| provider.as_string()),
                    &model,
                    flags.incognito,
                    cloud_sync_enabled,
                ) {
                    Ok(message) => message,
                    Err(error) => {
                        emit_stream_failure(
                            &runtime.app_handle,
                            conversation.id,
                            &frontend_message_id,
                            format!("Failed to save agent response message: {error}"),
                            Some(&final_content),
                        );
                        return;
                    }
                };

                let _ = runtime.app_handle.emit(
                    "chat:stream-end",
                    serde_json::json!({
                        "conversation_id": conversation.id,
                        "message_id": frontend_message_id,
                        "backend_message_id": assistant_message.id,
                        "pending_messages_count": pending_messages_count(),
                        "has_pending_messages": has_pending_messages()
                    }),
                );

                let _ = runtime.app_handle.emit(
                    "agent:finished",
                    serde_json::json!({
                        "success": success,
                        "result": final_content,
                        "duration_ms": start_time.elapsed().as_millis() as u64
                    }),
                );
            }
            Err(error) => {
                let error_msg = error.to_string();
                let _ = runtime.app_handle.emit(
                    "agent:finished",
                    serde_json::json!({
                        "success": false,
                        "error": error_msg,
                        "duration_ms": start_time.elapsed().as_millis() as u64
                    }),
                );
                let _ = runtime.app_handle.emit(
                    "chat:stream-error",
                    serde_json::json!({
                        "conversation_id": conversation.id,
                        "message_id": frontend_message_id,
                        "error": "Agent execution failed"
                    }),
                );
                let _ = runtime.app_handle.emit(
                    "chat:stream-end",
                    serde_json::json!({
                        "conversation_id": conversation.id,
                        "message_id": frontend_message_id,
                        "content": "Agent execution failed.",
                        "error": true,
                        "has_pending_messages": has_pending_messages()
                    }),
                );
            }
        }
    });
}

fn spawn_streaming_chat(
    runtime: SendMessageRuntime,
    prepared: PreparedSendMessage,
    frontend_message_id: String,
) {
    let PreparedSendMessage {
        request,
        conversation,
        llm_request,
        preferences,
        provider_enum,
        model,
        tool_registry,
        flags,
        cloud_sync_enabled,
        ..
    } = prepared;

    tauri::async_runtime::spawn(async move {
        let router = runtime.router.read().await;

        match router
            .send_message_streaming(&llm_request, &preferences)
            .await
        {
            Ok(stream) => {
                let mut full_content = String::new();
                let stream_result = consume_llm_stream(
                    stream,
                    &runtime.app_handle,
                    conversation.id,
                    &frontend_message_id,
                    &mut full_content,
                    STREAM_CHUNK_IDLE_TIMEOUT_SECS,
                )
                .await;

                let stream_data = match stream_result {
                    Ok(data) => data,
                    Err(_) => {
                        let _ = runtime.app_handle.emit(
                            "chat:stream-end",
                            serde_json::json!({
                                "conversation_id": conversation.id,
                                "message_id": frontend_message_id,
                                "content": full_content.clone(),
                                "error": true,
                                "has_pending_messages": has_pending_messages()
                            }),
                        );
                        return;
                    }
                };

                let mut token_count = stream_data.token_count;
                let mut final_usage = stream_data.usage;
                let mut final_credits = stream_data.credits;
                let final_finish_reason = stream_data.finish_reason.clone();
                let was_stopped = stream_data.was_stopped;
                let tool_calls = stream_data.tool_calls;
                let has_tool_calls = !tool_calls.is_empty();
                let mut tool_failure_summaries: Vec<String> = Vec::new();

                if has_tool_calls && !was_stopped {
                    if final_finish_reason.as_deref() != Some("tool_calls") {
                        info!(
                            "[Chat] Streamed tool calls detected without finish_reason=tool_calls (finish_reason={:?})",
                            final_finish_reason
                        );
                    }
                    info!(
                        "[Chat] Streaming completed with {} tool call(s) - executing tools",
                        tool_calls.len()
                    );

                    let _ = runtime.app_handle.emit(
                        "chat:tool-calls",
                        serde_json::json!({
                            "conversation_id": conversation.id,
                            "message_id": frontend_message_id,
                            "tool_calls": tool_calls,
                            "streaming": true
                        }),
                    );

                    let (tool_results, batch_failures) = execute_tool_calls_batch(
                        &tool_calls,
                        &runtime.app_handle,
                        conversation.id,
                        &frontend_message_id,
                        request.project_folder.clone(),
                        request.conversation_mode.clone(),
                        0,
                        tool_registry.clone(),
                    )
                    .await;
                    tool_failure_summaries.extend(batch_failures);

                    if did_fast_metadata_batch_fail(&tool_results) {
                        let fallback = build_fast_metadata_failure_message(&tool_failure_summaries);
                        full_content.push_str(&fallback);
                        let _ = runtime.app_handle.emit(
                            "chat:stream-chunk",
                            serde_json::json!({
                                "conversation_id": conversation.id,
                                "message_id": frontend_message_id,
                                "delta": fallback,
                                "content": full_content.clone(),
                                "has_pending_messages": has_pending_messages()
                            }),
                        );
                    } else {
                        let mut streaming_tool_iteration = 0;
                        let mut current_tool_calls = tool_calls;
                        let mut current_tool_results = tool_results;
                        let mut only_fast_metadata_tools =
                            is_fast_metadata_batch(&current_tool_results);
                        let mut has_media_tools = current_tool_results
                            .iter()
                            .any(|result| is_media_generation_tool(&result.tool_name));
                        let mut max_streaming_tool_iterations =
                            resolve_streaming_tool_loop_max_iterations(only_fast_metadata_tools);
                        let streaming_tool_loop_started = std::time::Instant::now();

                        let _ = runtime.app_handle.emit(
                            "agentic:loop-started",
                            serde_json::json!({
                                "conversation_id": conversation.id,
                                "message_id": frontend_message_id,
                                "max_iterations": max_streaming_tool_iterations,
                            }),
                        );

                        loop {
                            streaming_tool_iteration += 1;
                            let loop_max_secs =
                                resolve_streaming_tool_loop_max_secs(only_fast_metadata_tools);
                            if streaming_tool_loop_started.elapsed().as_secs() >= loop_max_secs {
                                warn!(
                                    "[Chat] Streaming tool loop exceeded {}s, stopping",
                                    loop_max_secs
                                );
                                full_content.push_str(
                                    "\n\n*Stopped tool loop after timeout while waiting for follow-up responses.*",
                                );
                                let _ = runtime.app_handle.emit(
                                    "chat:stream-chunk",
                                    serde_json::json!({
                                        "conversation_id": conversation.id,
                                        "message_id": frontend_message_id,
                                        "delta": "\n\n*Stopped tool loop after timeout while waiting for follow-up responses.*",
                                        "content": full_content.clone(),
                                        "has_pending_messages": has_pending_messages()
                                    }),
                                );
                                let _ = runtime.app_handle.emit(
                                    "chat:agent-progress",
                                    serde_json::json!({
                                        "conversation_id": conversation.id,
                                        "iteration": streaming_tool_iteration,
                                        "max_iterations": max_streaming_tool_iterations,
                                        "status": "timeout_reached"
                                    }),
                                );
                                let _ = runtime.app_handle.emit(
                                    "agentic:loop-ended",
                                    serde_json::json!({
                                        "conversation_id": conversation.id,
                                        "message_id": frontend_message_id,
                                        "iterations_used": streaming_tool_iteration,
                                        "reason": "timeout",
                                    }),
                                );
                                break;
                            }
                            if streaming_tool_iteration > max_streaming_tool_iterations {
                                warn!(
                                    "[Chat] Streaming tool iteration limit reached ({}), stopping",
                                    max_streaming_tool_iterations
                                );
                                let _ = runtime.app_handle.emit(
                                    "chat:agent-progress",
                                    serde_json::json!({
                                        "conversation_id": conversation.id,
                                        "iteration": streaming_tool_iteration - 1,
                                        "max_iterations": max_streaming_tool_iterations,
                                        "status": "limit_reached"
                                    }),
                                );
                                let _ = runtime.app_handle.emit(
                                    "agentic:loop-ended",
                                    serde_json::json!({
                                        "conversation_id": conversation.id,
                                        "message_id": frontend_message_id,
                                        "iterations_used": streaming_tool_iteration - 1,
                                        "reason": "limit_reached",
                                    }),
                                );
                                break;
                            }

                            let _ = runtime.app_handle.emit(
                                "agentic:loop-status",
                                serde_json::json!({
                                    "conversation_id": conversation.id,
                                    "message_id": frontend_message_id,
                                    "iteration": streaming_tool_iteration,
                                    "max_iterations": max_streaming_tool_iterations,
                                    "status": "executing",
                                    "has_pending_messages": has_pending_messages_for_conversation(conversation.id),
                                }),
                            );
                            let _ = runtime.app_handle.emit(
                                "chat:agent-progress",
                                serde_json::json!({
                                    "conversation_id": conversation.id,
                                    "iteration": streaming_tool_iteration,
                                    "max_iterations": max_streaming_tool_iterations,
                                    "status": "executing_tools"
                                }),
                            );

                            let mut followup_messages = llm_request.messages.clone();
                            followup_messages.push(crate::core::llm::ChatMessage {
                                role: "assistant".to_string(),
                                content: full_content.clone(),
                                tool_calls: Some(
                                    current_tool_calls
                                        .iter()
                                        .map(|tool_call| crate::core::llm::ToolCall {
                                            id: tool_call.id.clone(),
                                            name: tool_call.name.clone(),
                                            arguments: tool_call.arguments.clone(),
                                        })
                                        .collect(),
                                ),
                                tool_call_id: None,
                                multimodal_content: None,
                            });

                            for result in &current_tool_results {
                                followup_messages.push(crate::core::llm::ChatMessage {
                                    role: "tool".to_string(),
                                    content: result.to_message_content(),
                                    tool_calls: None,
                                    tool_call_id: Some(result.tool_call_id.clone()),
                                    multimodal_content: None,
                                });
                            }

                            if let Some(pending) =
                                pop_pending_message_for_conversation(conversation.id)
                            {
                                info!(
                                    "[Chat] Injecting pending user message into agentic loop: {}...",
                                    pending.content.chars().take(50).collect::<String>()
                                );
                                followup_messages.push(crate::core::llm::ChatMessage {
                                    role: "user".to_string(),
                                    content: pending.content.clone(),
                                    tool_calls: None,
                                    tool_call_id: None,
                                    multimodal_content: None,
                                });
                                let _ = runtime.app_handle.emit(
                                    "agentic:message-consumed",
                                    serde_json::json!({
                                        "conversation_id": conversation.id,
                                        "message_id": frontend_message_id,
                                        "pending_message": pending,
                                    }),
                                );
                            }

                            const TOOL_LOOP_COMPACT_THRESHOLD: usize = 20;
                            const TOOL_LOOP_KEEP_RECENT: usize = 10;
                            if followup_messages.len() > TOOL_LOOP_COMPACT_THRESHOLD {
                                let total = followup_messages.len();
                                let keep_start = 1.min(total);
                                let mut keep_end_start =
                                    total.saturating_sub(TOOL_LOOP_KEEP_RECENT);
                                while keep_end_start > keep_start
                                    && followup_messages[keep_end_start].role != "assistant"
                                {
                                    keep_end_start -= 1;
                                }
                                let compacted_count = keep_end_start.saturating_sub(keep_start);
                                if compacted_count > 0 {
                                    let mut summary_parts: Vec<String> = Vec::new();
                                    for message in &followup_messages[keep_start..keep_end_start] {
                                        let preview: String =
                                            message.content.chars().take(200).collect();
                                        summary_parts
                                            .push(format!("[{}]: {}", message.role, preview));
                                    }
                                    let summary_message = crate::core::llm::ChatMessage {
                                        role: "user".to_string(),
                                        content: format!(
                                            "[Context Summary — compacted {} earlier tool-loop messages]\n{}",
                                            compacted_count,
                                            summary_parts.join("\n")
                                        ),
                                        tool_calls: None,
                                        tool_call_id: None,
                                        multimodal_content: None,
                                    };
                                    let mut compacted =
                                        Vec::with_capacity(2 + TOOL_LOOP_KEEP_RECENT);
                                    if keep_start > 0 {
                                        compacted.push(followup_messages[0].clone());
                                    }
                                    compacted.push(summary_message);
                                    compacted
                                        .extend_from_slice(&followup_messages[keep_end_start..]);
                                    tracing::debug!(
                                        "[Chat] Compacted tool loop messages: {} -> {}",
                                        total,
                                        compacted.len()
                                    );
                                    followup_messages = compacted;
                                }
                            }

                            let followup_request = crate::core::llm::LLMRequest {
                                messages: followup_messages,
                                model: model.clone(),
                                temperature: Some(DEFAULT_TEMPERATURE),
                                max_tokens: Some(DEFAULT_MAX_TOKENS),
                                stream: true,
                                tools: llm_request.tools.clone(),
                                tool_choice: llm_request.tool_choice.clone(),
                                thinking_mode: llm_request.thinking_mode,
                                thinking: llm_request.thinking.clone(),
                                ..Default::default()
                            };

                            let followup_total_timeout_secs =
                                resolve_followup_total_timeout_secs(only_fast_metadata_tools);
                            let followup_invoke_timeout_secs = resolve_followup_invoke_timeout_secs(
                                only_fast_metadata_tools,
                                has_media_tools,
                            );

                            let followup_stream_result = tokio::time::timeout(
                                std::time::Duration::from_secs(followup_total_timeout_secs),
                                router.send_message_streaming(&followup_request, &preferences),
                            )
                            .await;

                            let followup_stream = match followup_stream_result {
                                Ok(Ok(stream)) => Some(stream),
                                Ok(Err(error)) => {
                                    warn!("[Chat] Follow-up streaming request failed: {}", error);
                                    None
                                }
                                Err(_) => {
                                    warn!(
                                        "[Chat] Follow-up streaming request timed out after {}s",
                                        followup_total_timeout_secs
                                    );
                                    None
                                }
                            };

                            match followup_stream {
                                Some(stream) => {
                                    full_content.push_str("\n\n");
                                    let _ = runtime.app_handle.emit(
                                        "chat:stream-chunk",
                                        serde_json::json!({
                                            "conversation_id": conversation.id,
                                            "message_id": frontend_message_id,
                                            "delta": "\n\n",
                                            "content": full_content.clone(),
                                            "has_pending_messages": has_pending_messages()
                                        }),
                                    );

                                    match consume_llm_stream(
                                        stream,
                                        &runtime.app_handle,
                                        conversation.id,
                                        &frontend_message_id,
                                        &mut full_content,
                                        followup_invoke_timeout_secs,
                                    )
                                    .await
                                    {
                                        Ok(followup_data) => {
                                            token_count += followup_data.token_count;

                                            if let Some(credits) = followup_data.credits {
                                                final_credits = Some(credits);
                                            }
                                            if let Some(usage) = followup_data.usage {
                                                final_usage = Some(usage);
                                            }

                                            if followup_data.finish_reason.as_deref()
                                                == Some("pause_turn")
                                            {
                                                info!(
                                                    "[Chat] Received pause_turn, continuing conversation"
                                                );
                                                current_tool_calls = Vec::new();
                                                current_tool_results = Vec::new();
                                                continue;
                                            }

                                            let new_tool_calls = followup_data.tool_calls;
                                            if !new_tool_calls.is_empty() {
                                                info!(
                                                    "[Chat] Follow-up streaming response has {} more tool call(s) (iteration {})",
                                                    new_tool_calls.len(),
                                                    streaming_tool_iteration
                                                );

                                                let _ = runtime.app_handle.emit(
                                                    "chat:tool-calls",
                                                    serde_json::json!({
                                                        "conversation_id": conversation.id,
                                                        "message_id": frontend_message_id,
                                                        "tool_calls": new_tool_calls,
                                                        "streaming": true,
                                                        "iteration": streaming_tool_iteration
                                                    }),
                                                );

                                                let (new_results, batch_failures) =
                                                    execute_tool_calls_batch(
                                                        &new_tool_calls,
                                                        &runtime.app_handle,
                                                        conversation.id,
                                                        &frontend_message_id,
                                                        request.project_folder.clone(),
                                                        request.conversation_mode.clone(),
                                                        streaming_tool_iteration,
                                                        tool_registry.clone(),
                                                    )
                                                    .await;
                                                tool_failure_summaries.extend(batch_failures);

                                                if did_fast_metadata_batch_fail(&new_results) {
                                                    let fallback =
                                                        build_fast_metadata_failure_message(
                                                            &tool_failure_summaries,
                                                        );
                                                    full_content.push_str("\n\n");
                                                    full_content.push_str(&fallback);
                                                    let _ = runtime.app_handle.emit(
                                                        "chat:stream-chunk",
                                                        serde_json::json!({
                                                            "conversation_id": conversation.id,
                                                            "message_id": frontend_message_id,
                                                            "delta": fallback,
                                                            "content": full_content.clone(),
                                                            "has_pending_messages": has_pending_messages()
                                                        }),
                                                    );
                                                    let _ = runtime.app_handle.emit(
                                                        "agentic:loop-ended",
                                                        serde_json::json!({
                                                            "conversation_id": conversation.id,
                                                            "message_id": frontend_message_id,
                                                            "iterations_used": streaming_tool_iteration,
                                                            "reason": "fast_metadata_failed",
                                                        }),
                                                    );
                                                    break;
                                                }

                                                if !new_results.is_empty() {
                                                    current_tool_calls = new_tool_calls;
                                                    current_tool_results = new_results;
                                                    has_media_tools =
                                                        current_tool_results.iter().any(|result| {
                                                            is_media_generation_tool(
                                                                &result.tool_name,
                                                            )
                                                        });
                                                    only_fast_metadata_tools =
                                                        is_fast_metadata_batch(
                                                            &current_tool_results,
                                                        );
                                                    max_streaming_tool_iterations =
                                                        resolve_streaming_tool_loop_max_iterations(
                                                            only_fast_metadata_tools,
                                                        );
                                                    continue;
                                                }
                                            }

                                            let _ = runtime.app_handle.emit(
                                                "agentic:loop-ended",
                                                serde_json::json!({
                                                    "conversation_id": conversation.id,
                                                    "message_id": frontend_message_id,
                                                    "iterations_used": streaming_tool_iteration,
                                                    "reason": "completed",
                                                }),
                                            );
                                            break;
                                        }
                                        Err(error) => {
                                            warn!(
                                                "[Chat] Follow-up stream consumption failed: {}",
                                                error
                                            );
                                            let _ = runtime.app_handle.emit(
                                                "agentic:loop-ended",
                                                serde_json::json!({
                                                    "conversation_id": conversation.id,
                                                    "message_id": frontend_message_id,
                                                    "iterations_used": streaming_tool_iteration,
                                                    "reason": "stream_error",
                                                }),
                                            );
                                            break;
                                        }
                                    }
                                }
                                None => {
                                    error!("[Chat] All follow-up streaming candidates failed");
                                    let fallback_delta = {
                                        let successful_tool_outputs = current_tool_results
                                            .iter()
                                            .filter(|result| result.success)
                                            .take(3)
                                            .filter_map(|result| {
                                                let content = result.to_message_content();
                                                let trimmed = content.trim();
                                                if trimmed.is_empty() {
                                                    return None;
                                                }
                                                let snippet: String =
                                                    trimmed.chars().take(3000).collect();
                                                Some(format!(
                                                    "Tool `{}` output:\n{}",
                                                    result.tool_name, snippet
                                                ))
                                            })
                                            .collect::<Vec<_>>();

                                        if !successful_tool_outputs.is_empty() {
                                            format!(
                                                "\n\nI couldn't generate a final explanation from the model, but the tool ran successfully:\n\n{}",
                                                successful_tool_outputs.join("\n\n")
                                            )
                                        } else {
                                            "\n\n*Tool execution completed but unable to generate final response.*".to_string()
                                        }
                                    };

                                    full_content.push_str(&fallback_delta);
                                    let _ = runtime.app_handle.emit(
                                        "chat:stream-chunk",
                                        serde_json::json!({
                                            "conversation_id": conversation.id,
                                            "message_id": frontend_message_id,
                                            "delta": fallback_delta,
                                            "content": full_content.clone(),
                                            "has_pending_messages": has_pending_messages()
                                        }),
                                    );
                                    let _ = runtime.app_handle.emit(
                                        "agentic:loop-ended",
                                        serde_json::json!({
                                            "conversation_id": conversation.id,
                                            "message_id": frontend_message_id,
                                            "iterations_used": streaming_tool_iteration,
                                            "reason": "candidates_failed",
                                        }),
                                    );
                                    break;
                                }
                            }
                        }

                        if streaming_tool_iteration > 1 {
                            info!(
                                "[Chat] Streaming tool loop completed after {} iteration(s)",
                                streaming_tool_iteration
                            );
                        }
                    }
                }

                if was_stopped && !full_content.is_empty() {
                    full_content.push_str("\n\n*[Generation stopped by user]*");
                    let _ = runtime.app_handle.emit(
                        "chat:stream-chunk",
                        serde_json::json!({
                            "conversation_id": conversation.id,
                            "message_id": frontend_message_id,
                            "delta": "\n\n*[Generation stopped by user]*",
                            "content": full_content.clone(),
                            "has_pending_messages": has_pending_messages()
                        }),
                    );
                }

                if full_content.trim().is_empty() {
                    let fallback = if !tool_failure_summaries.is_empty() {
                        format!(
                            "I couldn't complete that because one or more tools failed: {}. Please confirm the tool permissions or try a different approach.",
                            tool_failure_summaries.join("; ")
                        )
                    } else {
                        "I couldn't generate a response. Please try again.".to_string()
                    };

                    full_content = fallback.clone();
                    let _ = runtime.app_handle.emit(
                        "chat:stream-chunk",
                        serde_json::json!({
                            "conversation_id": conversation.id,
                            "message_id": frontend_message_id,
                            "delta": fallback,
                            "content": full_content.clone(),
                            "has_pending_messages": has_pending_messages()
                        }),
                    );
                }

                let (final_tokens, final_cost) = calculate_streaming_persistence_usage(
                    provider_enum,
                    &model,
                    token_count,
                    final_usage.as_ref(),
                    final_credits.as_ref(),
                );

                let assistant_message = match save_or_skip_assistant_message(
                    &runtime.db,
                    conversation.id,
                    &request.user_id,
                    &full_content,
                    Some(final_tokens as i32),
                    Some(final_cost),
                    provider_enum.map(|provider| provider.as_string()),
                    &model,
                    flags.incognito,
                    cloud_sync_enabled,
                ) {
                    Ok(message) => message,
                    Err(error) => {
                        emit_stream_failure(
                            &runtime.app_handle,
                            conversation.id,
                            &frontend_message_id,
                            format!("Failed to save message: {error}"),
                            Some(&full_content),
                        );
                        return;
                    }
                };

                let pending_at_end = peek_pending_messages_for_conversation(conversation.id);

                info!(
                    target: "chat",
                    correlation_id = %runtime.correlation_id,
                    conversation_id = conversation.id,
                    message_id = %frontend_message_id,
                    backend_message_id = assistant_message.id,
                    token_count = token_count,
                    pending_messages = pending_at_end.len(),
                    "Chat send_message completed successfully"
                );

                let _ = runtime.app_handle.emit(
                    "chat:stream-end",
                    serde_json::json!({
                        "conversation_id": conversation.id,
                        "message_id": frontend_message_id,
                        "backend_message_id": assistant_message.id,
                        "pending_messages_count": pending_at_end.len(),
                        "has_pending_messages": !pending_at_end.is_empty(),
                        "usage": final_usage,
                        "credits": final_credits,
                        "finish_reason": final_finish_reason
                    }),
                );

                if !pending_at_end.is_empty() {
                    info!(
                        target: "chat",
                        correlation_id = %runtime.correlation_id,
                        pending_count = pending_at_end.len(),
                        "Stream ended with pending messages to process"
                    );
                    let _ = runtime.app_handle.emit(
                        "chat:pending-messages-ready",
                        serde_json::json!({
                            "conversation_id": conversation.id,
                            "pending_messages": pending_at_end,
                            "count": pending_at_end.len()
                        }),
                    );
                }
            }
            Err(error) => {
                tracing::error!(
                    target: "chat",
                    correlation_id = %runtime.correlation_id,
                    conversation_id = conversation.id,
                    error = %error,
                    "Chat send_message failed with streaming error"
                );
                emit_stream_failure(
                    &runtime.app_handle,
                    conversation.id,
                    &frontend_message_id,
                    format!("Streaming failed: {error}"),
                    None,
                );
            }
        }
    });
}

async fn run_nonstreaming_deep_research(
    runtime: SendMessageRuntime,
    prepared: PreparedSendMessage,
) -> Result<ChatSendMessageResponse, String> {
    use crate::core::research::{ResearchMode, ResearchOrchestrator};

    let PreparedSendMessage {
        conversation,
        user_message,
        request,
        provider_enum,
        model,
        flags,
        cloud_sync_enabled,
        ..
    } = prepared;

    let orchestrator = ResearchOrchestrator::new(runtime.router.clone(), runtime.research_config)
        .map_err(|error| format!("Failed to initialize research: {}", error))?
        .with_app_handle(runtime.app_handle.clone())
        .with_task_id(request.research_task_id.clone());

    let result = orchestrator
        .research(&request.content, ResearchMode::Deep)
        .await
        .map_err(|error| error.to_string())?;

    let assistant_message = save_or_skip_assistant_message(
        &runtime.db,
        conversation.id,
        &conversation.user_id,
        &result.report,
        None,
        None,
        provider_enum.map(|provider| provider.as_string()),
        &model,
        flags.incognito,
        cloud_sync_enabled,
    )?;

    let stats = compute_or_skip_stats(&runtime.db, conversation.id, flags.incognito)?;

    Ok(ChatSendMessageResponse {
        conversation,
        user_message,
        assistant_message,
        stats,
        last_message: Some(result.report),
        credits: None,
    })
}

async fn run_nonstreaming_agent(
    runtime: SendMessageRuntime,
    prepared: PreparedSendMessage,
) -> Result<ChatSendMessageResponse, String> {
    use crate::automation::AutomationService;
    use crate::core::agi::{AGIConfig, AgentOrchestrator};

    let PreparedSendMessage {
        conversation,
        user_message,
        request,
        llm_request,
        preferences,
        provider_enum,
        model,
        agent_instruction,
        flags,
        cloud_sync_enabled,
        ..
    } = prepared;

    let orchestrator_arc = {
        let guard = crate::sys::commands::agi::ORCHESTRATOR.lock();
        guard.clone()
    };

    let orchestrator_arc = match orchestrator_arc {
        Some(orchestrator) => orchestrator,
        None => {
            let automation = match AutomationService::new() {
                Ok(service) => service,
                Err(error) => {
                    let _ = runtime.app_handle.emit(
                        "automation:permission_required",
                        serde_json::json!({
                            "reason": "agent_mode",
                            "message": "Grant Accessibility, Screen Recording, and Input Monitoring permissions to use Agent mode."
                        }),
                    );
                    return Err(format!("Automation service unavailable: {}", error));
                }
            };
            let orchestrator = AgentOrchestrator::new(
                4,
                AGIConfig::default(),
                runtime.router.clone(),
                Arc::new(automation),
                Some(runtime.app_handle.clone()),
            )
            .map_err(|error| format!("Failed to initialize orchestrator: {}", error))?;

            let orchestrator_arc = Arc::new(tokio::sync::Mutex::new(orchestrator));
            *crate::sys::commands::agi::ORCHESTRATOR.lock() = Some(orchestrator_arc.clone());
            orchestrator_arc
        }
    };

    let orchestrator_result = {
        let orchestrator = orchestrator_arc.lock().await;
        orchestrator
            .process_instruction(&agent_instruction, request.attachments.clone())
            .await
            .map_err(|error| format!("Agent execution failed: {}", error))?
    };

    let mut final_content = orchestrator_result.summary.clone();
    let mut final_tokens: Option<u32> = None;
    let mut final_cost: Option<f64> = None;

    if orchestrator_result.success {
        let mut messages = llm_request.messages.clone();
        messages.push(ChatMessage {
            role: "system".to_string(),
            content: format!(
                "Agent execution summary:\n{}\n\nProvide a clear final response to the user using this summary.",
                orchestrator_result.summary
            ),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        });

        let final_request = LLMRequest {
            messages,
            model: model.clone(),
            temperature: Some(DEFAULT_TEMPERATURE),
            max_tokens: Some(DEFAULT_MAX_TOKENS),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            ..Default::default()
        };

        let router = runtime.router.read().await;
        let candidates = router.candidates(&final_request, &preferences);
        if let Some(candidate) = candidates.first() {
            if let Ok(outcome) = router.invoke_candidate(candidate, &final_request).await {
                final_content = outcome.response.content.clone();
                final_tokens = outcome.response.tokens;
                final_cost = outcome.response.cost;
            }
        }
    }

    let assistant_message = save_or_skip_assistant_message(
        &runtime.db,
        conversation.id,
        &conversation.user_id,
        &final_content,
        final_tokens.map(|tokens| tokens as i32),
        final_cost,
        provider_enum.map(|provider| provider.as_string()),
        &model,
        flags.incognito,
        cloud_sync_enabled,
    )?;

    let stats = compute_or_skip_stats(&runtime.db, conversation.id, flags.incognito)?;

    Ok(ChatSendMessageResponse {
        conversation,
        user_message,
        assistant_message,
        stats,
        last_message: Some(final_content),
        credits: None,
    })
}

async fn run_nonstreaming_chat(
    runtime: SendMessageRuntime,
    prepared: PreparedSendMessage,
) -> Result<ChatSendMessageResponse, String> {
    let PreparedSendMessage {
        conversation,
        user_message,
        request,
        llm_request,
        preferences,
        provider_enum: _provider_enum,
        model,
        memory_handler,
        tool_registry,
        flags,
        cloud_sync_enabled,
        ..
    } = prepared;

    let candidates = {
        let router = runtime.router.read().await;
        router.candidates(&llm_request, &preferences)
    };

    if candidates.is_empty() {
        let router = runtime.router.read().await;
        if router.has_provider(crate::core::llm::Provider::ManagedCloud) {
            let provider_name = request
                .provider_override
                .clone()
                .or(request.provider.clone());
            if let Some(name) = provider_name {
                info!(
                    "[Chat] Redirecting request for unconfigured provider '{}' to Managed Cloud",
                    name
                );

                let fallback_candidate = crate::core::llm::llm_router::RouteCandidate {
                    provider: crate::core::llm::Provider::ManagedCloud,
                    model: model.clone(),
                    reason: "fallback-redirect-to-managed-cloud",
                    strategy: None,
                };

                if let Ok(outcome) = router
                    .invoke_candidate(&fallback_candidate, &llm_request)
                    .await
                {
                    let assistant_message = save_or_skip_assistant_message(
                        &runtime.db,
                        conversation.id,
                        &conversation.user_id,
                        &outcome.response.content,
                        outcome.response.tokens.map(|tokens| tokens as i32),
                        outcome.response.cost,
                        Some(outcome.provider.as_string()),
                        &outcome.model,
                        flags.incognito,
                        cloud_sync_enabled,
                    )?;

                    let stats =
                        compute_or_skip_stats(&runtime.db, conversation.id, flags.incognito)?;

                    return Ok(ChatSendMessageResponse {
                        conversation,
                        user_message,
                        assistant_message,
                        stats,
                        last_message: Some(outcome.response.content),
                        credits: outcome.response.credits,
                    });
                }
            }
        }

        return Err(
            "No LLM providers configured. Please add an API key in Settings > API Keys or sign in to use Managed Cloud."
                .to_string(),
        );
    }

    let mut last_error: Option<String> = None;
    for candidate in candidates {
        let result = {
            let router = runtime.router.read().await;
            router.invoke_candidate(&candidate, &llm_request).await
        };

        match result {
            Ok(mut outcome) => {
                let max_tool_iterations = 25;
                let mut tool_iteration = 0;
                let mut current_messages = llm_request.messages.clone();
                let mut final_content = outcome.response.content.clone();
                let mut final_reasoning_content = outcome.response.reasoning_content.clone();
                let mut final_reasoning_tokens = outcome
                    .response
                    .reasoning_tokens
                    .or(outcome.response.thinking_tokens);
                let mut total_tool_tokens: u32 = 0;

                while let Some(ref tool_calls) = outcome.response.tool_calls {
                    if tool_calls.is_empty() {
                        break;
                    }

                    tool_iteration += 1;
                    if tool_iteration > max_tool_iterations {
                        warn!(
                            "[Chat] Tool iteration limit reached ({}), stopping tool execution",
                            max_tool_iterations
                        );
                        let _ = runtime.app_handle.emit(
                            "chat:agent-progress",
                            serde_json::json!({
                                "conversation_id": conversation.id,
                                "iteration": tool_iteration - 1,
                                "max_iterations": max_tool_iterations,
                                "status": "limit_reached"
                            }),
                        );
                        break;
                    }

                    info!(
                        "[Chat] LLM requested {} tool call(s) (iteration {})",
                        tool_calls.len(),
                        tool_iteration
                    );

                    let normalized_tool_calls =
                        normalize_tool_calls(tool_calls, &format!("tool_call_{}", tool_iteration));

                    let _ = runtime.app_handle.emit(
                        "chat:agent-progress",
                        serde_json::json!({
                            "conversation_id": conversation.id,
                            "iteration": tool_iteration,
                            "max_iterations": max_tool_iterations,
                            "status": "executing_tools",
                            "tool_count": tool_calls.len()
                        }),
                    );

                    let _ = runtime.app_handle.emit(
                        "chat:tool-calls",
                        serde_json::json!({
                            "conversation_id": conversation.id,
                            "message_id": request.frontend_message_id.clone(),
                            "tool_calls": normalized_tool_calls,
                            "iteration": tool_iteration
                        }),
                    );

                    let tool_calls_for_message: Vec<crate::core::llm::ToolCall> =
                        normalized_tool_calls
                            .iter()
                            .map(|tool_call| crate::core::llm::ToolCall {
                                id: tool_call.id.clone(),
                                name: tool_call.name.clone(),
                                arguments: tool_call.arguments.clone(),
                            })
                            .collect();
                    current_messages.push(crate::core::llm::ChatMessage {
                        role: "assistant".to_string(),
                        content: outcome.response.content.clone(),
                        tool_calls: Some(tool_calls_for_message),
                        tool_call_id: None,
                        multimodal_content: None,
                    });

                    let frontend_message_id =
                        request.frontend_message_id.clone().unwrap_or_default();
                    let (tool_results, _batch_failures) = execute_tool_calls_batch(
                        &normalized_tool_calls,
                        &runtime.app_handle,
                        conversation.id,
                        &frontend_message_id,
                        request.project_folder.clone(),
                        request.conversation_mode.clone(),
                        0,
                        tool_registry.clone(),
                    )
                    .await;

                    for result in &tool_results {
                        current_messages.push(crate::core::llm::ChatMessage {
                            role: "tool".to_string(),
                            content: result.to_message_content(),
                            tool_calls: None,
                            tool_call_id: Some(result.tool_call_id.clone()),
                            multimodal_content: None,
                        });
                    }

                    let followup_request = crate::core::llm::LLMRequest {
                        messages: current_messages.clone(),
                        model: model.clone(),
                        temperature: Some(DEFAULT_TEMPERATURE),
                        max_tokens: Some(DEFAULT_MAX_TOKENS),
                        stream: false,
                        tools: llm_request.tools.clone(),
                        tool_choice: llm_request.tool_choice.clone(),
                        thinking_mode: request.thinking_mode,
                        ..Default::default()
                    };

                    let batch_has_media = tool_results
                        .iter()
                        .any(|result| is_media_generation_tool(&result.tool_name));
                    let nonstream_followup_timeout =
                        resolve_followup_invoke_timeout_secs(false, batch_has_media);

                    let followup_result = {
                        let router = runtime.router.read().await;
                        tokio::time::timeout(
                            std::time::Duration::from_secs(nonstream_followup_timeout),
                            router.invoke_candidate(&candidate, &followup_request),
                        )
                        .await
                    };

                    match followup_result {
                        Ok(Ok(new_outcome)) => {
                            total_tool_tokens += new_outcome.response.tokens.unwrap_or(0);
                            final_content = new_outcome.response.content.clone();
                            final_reasoning_content =
                                new_outcome.response.reasoning_content.clone();
                            final_reasoning_tokens = new_outcome
                                .response
                                .reasoning_tokens
                                .or(new_outcome.response.thinking_tokens);

                            if new_outcome.response.finish_reason.as_deref() == Some("pause_turn") {
                                info!(
                                    "[Chat] Received pause_turn, continuing conversation (iteration {})",
                                    tool_iteration
                                );
                            }

                            outcome = new_outcome;
                        }
                        Ok(Err(error)) => {
                            error!("[Chat] Follow-up LLM call failed: {}", error);
                            break;
                        }
                        Err(_) => {
                            error!(
                                "[Chat] Follow-up LLM call timed out after {}s",
                                nonstream_followup_timeout
                            );
                            break;
                        }
                    }
                }

                if tool_iteration > 0 {
                    info!(
                        "[Chat] Tool execution complete after {} iteration(s), {} additional tokens used",
                        tool_iteration,
                        total_tool_tokens
                    );
                }

                if let Some(reasoning_content) = final_reasoning_content
                    .as_ref()
                    .filter(|content| !content.is_empty())
                {
                    crate::sys::commands::thinking::emit_thinking_complete(
                        &runtime.app_handle,
                        reasoning_content.clone(),
                        final_reasoning_tokens,
                        request.frontend_message_id.clone(),
                    );
                }

                let total_tokens = outcome
                    .response
                    .tokens
                    .map(|tokens| tokens as i32)
                    .map(|tokens| tokens + total_tool_tokens as i32);

                let assistant_message = save_or_skip_assistant_message(
                    &runtime.db,
                    conversation.id,
                    &conversation.user_id,
                    &final_content,
                    total_tokens,
                    outcome.response.cost,
                    Some(outcome.provider.as_string()),
                    &outcome.model,
                    flags.incognito,
                    cloud_sync_enabled,
                )?;

                let stats = compute_or_skip_stats(&runtime.db, conversation.id, flags.incognito)?;

                if let Err(error) = memory_handler.detect_and_save_decision(&final_content) {
                    warn!("[Chat] Failed to auto-save decision (non-fatal): {}", error);
                }

                return Ok(ChatSendMessageResponse {
                    conversation,
                    user_message,
                    assistant_message,
                    stats,
                    last_message: Some(final_content),
                    credits: outcome.response.credits,
                });
            }
            Err(error) => {
                last_error = Some(format!("{}: {error}", candidate.provider.as_string()));
            }
        }
    }

    Err(format!(
        "All providers failed. Last error:{}",
        last_error.unwrap_or_else(|| "Unknown error".to_string())
    ))
}

fn calculate_streaming_persistence_usage(
    provider_enum: Option<crate::core::llm::Provider>,
    model: &str,
    token_count: u32,
    final_usage: Option<&TokenUsage>,
    final_credits: Option<&crate::core::llm::CreditsInfo>,
) -> (u32, f64) {
    if let Some(credits) = final_credits {
        let tokens = final_usage
            .and_then(|usage| usage.completion_tokens)
            .unwrap_or(token_count);
        return (tokens, credits.cost_cents / 100.0);
    }

    let output_tokens = if let Some(usage) = final_usage {
        if let Some(completion_tokens) = usage.completion_tokens {
            completion_tokens
        } else if let (Some(total), Some(prompt)) = (usage.total_tokens, usage.prompt_tokens) {
            total.saturating_sub(prompt)
        } else {
            token_count
        }
    } else {
        token_count
    };

    let cost = provider_enum
        .map(|provider| CostCalculator::new().calculate(provider, model, 0, output_tokens))
        .unwrap_or(0.0);

    (output_tokens, cost)
}

#[cfg(test)]
mod tests {
    use super::empty_streaming_response;
    use crate::data::db::models::{Conversation, Message};

    #[test]
    fn empty_streaming_response_zeroes_stats() {
        let response = empty_streaming_response(Conversation::default(), Message::default());
        assert_eq!(response.stats.message_count, 0);
        assert_eq!(response.stats.total_tokens, 0);
        assert_eq!(response.stats.total_cost, 0.0);
        assert!(response.last_message.is_none());
    }
}
