use super::*;
use crate::sys::commands::chat::send_message_execution::{
    handle_nonstreaming_message, handle_streaming_message, SendMessageRuntime,
};
use crate::sys::commands::chat::send_message_setup::{
    build_router_preferences, log_chat_request, prepare_send_message, resolve_provider_and_model,
    resolve_request_flags,
};

#[tauri::command]
pub async fn chat_send_message(
    _db: State<'_, AppDatabase>,
    _llm_state: State<'_, LLMState>,
    settings_state: State<'_, crate::sys::commands::settings::SettingsState>,
    #[cfg_attr(not(feature = "billing"), allow(unused_variables))] _billing_state: State<
        '_,
        crate::sys::billing::BillingStateWrapper,
    >,
    mcp_state: State<'_, crate::sys::commands::mcp::McpState>,
    project_context_state: State<'_, crate::sys::commands::project_context::ProjectContextState>,
    memory_state: State<'_, crate::sys::commands::memory::MemoryState>,
    project_memory_state: State<'_, crate::sys::commands::project_memory::ProjectMemoryState>,
    _research_state: State<'_, crate::sys::commands::research::ResearchState>,
    app_handle: tauri::AppHandle,
    request: ChatSendMessageRequest,
) -> Result<ChatSendMessageResponse, String> {
    let correlation_id = uuid::Uuid::new_v4().to_string();

    let memory_enabled = {
        let settings = settings_state.settings.lock().await;
        settings
            .chat_preferences
            .as_ref()
            .is_some_and(|preferences| preferences.memory_enabled)
    };

    if let Some(conversation_id) = request.conversation_id {
        reset_stop_flag(conversation_id);
    }
    let turn = request
        .conversation_id
        .map(super::interrupted_turns::ChatTurn::begin);
    let started_new_conversation = request.conversation_id.is_none();
    request.validate().map_err(|error| error.to_string())?;
    log_chat_request(&request, &correlation_id);

    info!(
        target: "chat",
        correlation_id = %correlation_id,
        conversation_id = ?request.conversation_id,
        content_length = request.content.len(),
        "Chat send_message started"
    );

    let flags = resolve_request_flags(&request, &app_handle);
    let (provider_enum, model) = resolve_provider_and_model(&request);
    let preferences = build_router_preferences(&request, provider_enum, &model, "byok".to_string());
    let db = AppDatabase {
        conn: _db.inner().conn.clone(),
    };

    let prepared = prepare_send_message(
        &db,
        &mcp_state,
        &project_context_state,
        &memory_state,
        &project_memory_state,
        &app_handle,
        _llm_state.router.clone(),
        request,
        provider_enum,
        model,
        preferences,
        flags,
        memory_enabled,
    )
    .await?;
    if started_new_conversation {
        reset_stop_flag(prepared.conversation.id);
    }
    let conversation_id = prepared.conversation.id;
    let mut turn = match turn {
        Some(turn) if turn.conversation_id() == conversation_id => turn,
        _ => super::interrupted_turns::ChatTurn::begin(conversation_id),
    };
    if !prepared.flags.incognito {
        turn.record_persisted(&db, prepared.user_message.id);
    }

    let runtime = SendMessageRuntime {
        app_handle,
        db,
        router: _llm_state.router.clone(),
        research_config: _research_state.config.read().await.clone(),
        correlation_id,
    };

    if prepared.flags.stream_mode {
        handle_streaming_message(runtime, prepared, turn).await
    } else {
        handle_nonstreaming_message(runtime, prepared).await
    }
}
