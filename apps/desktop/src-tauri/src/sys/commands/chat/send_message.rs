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

    // TRUST-BOUNDARY: active_mode="local" must prevent cloud sync regardless of
    // chat_storage_mode. A user with storage_mode="cloud" but active_mode="local"
    // must not have their local chats synced to Neon (mirrors the is_local_mode
    // invariant enforced in send_message_setup.rs:745).
    let cloud_sync_enabled = {
        let storage_mode_is_cloud = {
            let settings = settings_state.settings.lock().await;
            settings
                .chat_preferences
                .as_ref()
                .map(|prefs| prefs.chat_storage_mode.as_str() == "cloud")
                .unwrap_or(false)
        };
        super::send_message_setup::derive_cloud_sync_enabled(
            request.active_mode.as_deref(),
            storage_mode_is_cloud,
        )
    };
    let (memory_enabled, auto_save_memories, allow_tool_assisted_memory_generation) = {
        let settings = settings_state.settings.lock().await;
        let preferences = settings
            .chat_preferences
            .as_ref()
            .cloned()
            .unwrap_or_default();
        (
            preferences.memory_enabled,
            preferences.memory_enabled && preferences.auto_save_memories,
            preferences.allow_tool_assisted_memory_generation,
        )
    };

    reset_stop_flag();
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
    let uses_managed_cloud =
        request_uses_managed_cloud(provider_enum, request.prefer_cloud_credits);

    if uses_managed_cloud {
        check_billing_and_budget(&_db, &request.user_id)?;
    } else {
        info!(
            target: "chat",
            correlation_id = %correlation_id,
            provider = ?provider_enum,
            "Skipping subscription gate for Local/BYOK chat request"
        );
    }

    let plan_tier = if uses_managed_cloud { "free" } else { "byok" }.to_string();

    let preferences = build_router_preferences(&request, provider_enum, &model, plan_tier);
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
        cloud_sync_enabled,
        auto_save_memories,
        memory_enabled,
        allow_tool_assisted_memory_generation,
    )
    .await?;

    let runtime = SendMessageRuntime {
        app_handle,
        db,
        router: _llm_state.router.clone(),
        research_config: _research_state.config.read().await.clone(),
        correlation_id,
    };

    if prepared.flags.stream_mode {
        handle_streaming_message(runtime, prepared).await
    } else {
        handle_nonstreaming_message(runtime, prepared).await
    }
}
