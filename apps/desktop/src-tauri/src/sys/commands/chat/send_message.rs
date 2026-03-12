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
    _research_state: State<'_, crate::sys::commands::research::ResearchState>,
    app_handle: tauri::AppHandle,
    request: ChatSendMessageRequest,
) -> Result<ChatSendMessageResponse, String> {
    let correlation_id = uuid::Uuid::new_v4().to_string();

    let cloud_sync_enabled = {
        let settings = settings_state.settings.lock().await;
        settings
            .chat_preferences
            .as_ref()
            .map(|prefs| prefs.chat_storage_mode.as_str() == "cloud")
            .unwrap_or(false)
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

    #[cfg(feature = "billing")]
    {
        let billing = _billing_state.0.lock().await;
        check_billing_and_budget(&billing, &_db, &request.user_id)?;
    }
    #[cfg(not(feature = "billing"))]
    {
        check_billing_and_budget(&_db, &request.user_id)?;
    }

    let flags = resolve_request_flags(&request, &app_handle);
    let (provider_enum, model) = resolve_provider_and_model(&request);

    #[cfg(feature = "billing")]
    let plan_tier = {
        let billing_guard = _billing_state.0.lock().await;
        if let Ok(service) = billing_guard.stripe_service() {
            if let Ok(Some(subscription)) = service.get_primary_subscription() {
                subscription.plan_name.to_lowercase()
            } else {
                "free".to_string()
            }
        } else {
            "free".to_string()
        }
    };

    #[cfg(not(feature = "billing"))]
    let plan_tier = "free".to_string();

    let preferences = build_router_preferences(&request, provider_enum, &model, plan_tier);
    let db = AppDatabase {
        conn: _db.inner().conn.clone(),
    };

    let prepared = prepare_send_message(
        &db,
        &mcp_state,
        &project_context_state,
        &memory_state,
        &app_handle,
        request,
        provider_enum,
        model,
        preferences,
        flags,
        cloud_sync_enabled,
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
