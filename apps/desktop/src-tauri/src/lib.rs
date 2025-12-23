#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![warn(warnings)]
#![allow(unused_qualifications)]
#![allow(clippy::should_implement_trait)]
#![allow(clippy::too_many_arguments)]
#![allow(clippy::type_complexity)]
#![allow(clippy::await_holding_lock)]

use crate::core::agent::approval::ApprovalController;
use crate::data::db::migrations;
use crate::data::settings::SettingsService;
use crate::sys::billing::BillingStateWrapper;
use crate::sys::commands::{
    ai_native::{CodeGeneratorState, ContextManagerState},
    load_persisted_calendar_accounts,
    security::AuthManagerState,
    ApiState, AppDatabase, BrowserStateWrapper, CalendarState, CloudState, CodeEditingState,
    ComputerUseState, DatabaseState, DocumentState, EmbeddingServiceState, FileWatcherState,
    GitHubState, LLMState, LSPState, McpState, ProductivityState, SettingsServiceState,
    SettingsState, ShortcutsState, TaskManagerState, TemplateManagerState, VoiceState,
    WorkflowEngineState, WorkspaceIndexState,
};
use crate::sys::security::{AuthManager, SecretManager};
use crate::sys::telemetry;
use anyhow::Context;
use rusqlite::Connection;
use std::sync::{Arc, Mutex};
use tauri::{async_runtime, Manager};
use tokio::sync::Mutex as TokioMutex;

pub mod automation;
pub mod core;
pub mod data;
pub mod features;
pub mod integrations;
pub mod sys;
pub mod ui;

pub use data::state::{AppState, DockPosition, PersistentWindowState, WindowGeometry};
pub use ui::tray::build_system_tray;
pub use ui::window::{
    apply_dock, hide_window, initialize_window, set_always_on_top, set_pinned, show_window, undock,
    DockPreviewEvent, DockState,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _telemetry_guard = match telemetry::init() {
        Ok(guard) => Some(guard),
        Err(e) => {
            eprintln!(
                "Failed to initialize telemetry: {}. Continuing without telemetry.",
                e
            );

            None
        }
    };

    std::panic::set_hook(Box::new(|info| {
        tracing::error!("Application Panic: {:?}", info);
    }));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {

            let app_data_dir = match app.path().app_data_dir() {
                Ok(dir) => dir,
                Err(e) => {
                    tracing::error!("Failed to get app data dir: {}. Falling back to temp directory.", e);

                    std::env::temp_dir().join("agiworkforce")
                }
            };

            if let Some(parent) = app_data_dir.parent() {
                if let Err(e) = std::fs::create_dir_all(parent) {
                    tracing::error!("Failed to create parent data directory: {}", e);
                }
            }
            if let Err(e) = std::fs::create_dir_all(&app_data_dir) {
                tracing::error!("Failed to create data directory: {}", e);
            }

            let db_path = app_data_dir.join("agiworkforce.db");
            tracing::info!("Database initialized at {:?}", db_path);


            let conn = Connection::open(&db_path).context("Failed to open database")?;


            if let Err(e) = migrations::run_migrations(&conn) {
                tracing::error!("Failed to run migrations: {}", e);

                return Err(anyhow::anyhow!("Failed to run migrations: {}", e).into());
            }



            let db_conn_arc = Arc::new(Mutex::new(conn));
            app.manage(AppDatabase {
                conn: db_conn_arc.clone(),
            });


            let approval_controller = ApprovalController::new(app_data_dir.clone())
                .map_err(|e| anyhow::anyhow!("Failed to initialize approval controller: {}", e))?;
            app.manage(approval_controller);


            let secret_manager = Arc::new(SecretManager::new(db_conn_arc.clone()));
            tracing::info!("SecretManager initialized");

            let auth_manager = Arc::new(parking_lot::RwLock::new(AuthManager::new(secret_manager.clone())));
            app.manage(AuthManagerState(auth_manager));
            tracing::info!("AuthManager initialized");


            use crate::sys::commands::analytics::TelemetryState;
            use crate::sys::telemetry::{AnalyticsMetricsCollector, CollectorConfig, TelemetryCollector};

            let telemetry_config = CollectorConfig {
                enabled: true,
                batch_size: 50,
                flush_interval_secs: 30,
            };
            let telemetry_collector = TelemetryCollector::new(telemetry_config);
            let analytics_metrics = AnalyticsMetricsCollector::new();
            app.manage(TelemetryState::new(telemetry_collector, analytics_metrics));


            app.manage(LLMState::new());


            match tauri::async_runtime::block_on(BrowserStateWrapper::new()) {
                Ok(state) => {
                    app.manage(state);
                }
                Err(e) => {
                    tracing::error!("Failed to initialize BrowserState: {}", e);
                    // Manage a dummy state or handle failure?
                    // For now, let's just log implementation.
                    // Ideally we should probably manage a dummy or broken state to avoid panics on retrieval,
                    // but BrowserState::new() failing is critical for browser features.
                }
            }


            app.manage(SettingsState::new());


            let settings_conn = Connection::open(&db_path).context("Failed to open settings database")?;
            let settings_service = SettingsService::new(Arc::new(Mutex::new(settings_conn)))
                .context("Failed to initialize settings service")?;
            app.manage(SettingsServiceState::new(settings_service));


            app.manage(FileWatcherState::new());


            app.manage(ApiState::new());


            app.manage(tokio::sync::Mutex::new(DatabaseState::new()));


            app.manage(CloudState::new());


            let calendar_state = CalendarState::new();
            match Connection::open(&db_path) {
                Ok(calendar_conn) => match load_persisted_calendar_accounts(&calendar_conn) {
                    Ok(accounts) => {
                        let mut restored = 0usize;
                        for (account_id, info, _) in accounts {
                            calendar_state
                                .manager
                                .upsert_account(account_id, info, None);
                            restored += 1;
                        }
                        tracing::info!("Calendar manager restored {restored} account(s)");
                    }
                    Err(err) => {
                        tracing::warn!("Failed to load calendar accounts: {err}");
                    }
                },
                Err(err) => {
                    tracing::warn!("Failed to open database for calendar restore: {err}");
                }
            }
            app.manage(calendar_state);


            let session_manager = crate::features::terminal::SessionManager::new(app.handle().clone());
            app.manage(session_manager.clone());


            let terminal_llm_router = Arc::new(crate::core::router::LLMRouter::new());


            let terminal_ai = crate::features::terminal::TerminalAI::new(
                terminal_llm_router,
                Arc::new(session_manager),
            );
            app.manage(terminal_ai);


            app.manage(ProductivityState::new());


            app.manage(DocumentState::new());


            match crate::automation::AutomationService::new() {
                Ok(automation_service) => {
                    app.manage(std::sync::Arc::new(Some(automation_service)));
                    tracing::info!("Automation service initialized");
                }
                Err(e) => {
                    tracing::warn!("Failed to initialize automation service: {}. Automation features may be degraded.", e);
                    app.manage(std::sync::Arc::new(None::<crate::automation::AutomationService>));
                }
            }


            let mcp_state = McpState::new();
            app.manage(mcp_state);


            app.manage(ContextManagerState(Arc::new(TokioMutex::new(()))));
            app.manage(CodeGeneratorState(Arc::new(TokioMutex::new(()))));


            let workspace_dir = app_data_dir.join("github_repos");
            std::fs::create_dir_all(&workspace_dir).ok();
            app.manage(Arc::new(TokioMutex::new(GitHubState::new(workspace_dir))));


            app.manage(Arc::new(TokioMutex::new(ComputerUseState::new())));


            app.manage(Arc::new(TokioMutex::new(CodeEditingState::new())));


            app.manage(Arc::new(TokioMutex::new(VoiceState::new())));


            app.manage(Arc::new(TokioMutex::new(ShortcutsState::with_defaults())));


            app.manage(Arc::new(TokioMutex::new(WorkspaceIndexState::new())));


            app.manage(Arc::new(LSPState::new()));


            let cache_conn = Connection::open(&db_path).context("Failed to open database for codebase cache")?;
            let codebase_cache = crate::data::cache::CodebaseCache::new(Arc::new(Mutex::new(cache_conn)))
                    .context("Failed to initialize codebase cache")?;
            app.manage(crate::sys::commands::cache::CodebaseCacheState(Arc::new(codebase_cache)));


            app.manage(BillingStateWrapper::new());


            let workflow_engine_state = WorkflowEngineState::new(db_path.to_string_lossy().to_string());
            app.manage(workflow_engine_state);


            let marketplace_conn = Connection::open(&db_path).context("Failed to open database for marketplace")?;
            app.manage(crate::sys::commands::marketplace::MarketplaceState {
                    db: Arc::new(Mutex::new(marketplace_conn)),
                });


            let template_conn = Connection::open(&db_path).context("Failed to open database for template manager")?;
            let template_db = Arc::new(Mutex::new(template_conn));
            let template_manager = crate::sys::commands::templates::initialize_template_manager(template_db);
            app.manage(TemplateManagerState {
                manager: Arc::new(Mutex::new(template_manager)),
            });


            let presence_db = Arc::new(tokio::sync::Mutex::new(
                Connection::open(&db_path).context("Failed to open database for presence")?,
            ));
            let presence_manager = Arc::new(crate::integrations::realtime::PresenceManager::new(presence_db));
            let websocket_port = 8787;
            let realtime_server = Arc::new(crate::integrations::realtime::RealtimeServer::new(presence_manager.clone()));
            {
                let server = realtime_server.clone();
                async_runtime::spawn(async move {
                    if let Err(e) = server.start(websocket_port).await {
                        tracing::error!("Realtime server failed: {}", e);
                    }
                });
            }
            app.manage(crate::sys::commands::RealtimeState::new(
                presence_manager.clone(),
                websocket_port,
            ));
            let metrics_db = Arc::new(Mutex::new(
                Connection::open(&db_path).context("Failed to open database for metrics")?,
            ));
            let metrics_collector = Arc::new(
                crate::data::metrics::RealtimeMetricsCollector::new(metrics_db.clone(), realtime_server.clone()),
            );
            let metrics_comparison = Arc::new(
                crate::data::metrics::MetricsComparison::new(metrics_db.clone()),
            );
            app.manage(crate::sys::commands::MetricsCollectorState(metrics_collector));
            app.manage(crate::sys::commands::MetricsComparisonState(metrics_comparison));


            let embedding_config = crate::core::embeddings::EmbeddingConfig::default();

            match async_runtime::block_on(
                crate::core::embeddings::EmbeddingService::new(
                    app_data_dir.clone(),
                    embedding_config,
                ),
            ) {
                Ok(embedding_service) => {
                    app.manage(EmbeddingServiceState(Arc::new(TokioMutex::new(embedding_service))));
                }
                Err(e) => {
                    tracing::warn!("Failed to initialize embedding service: {}", e);
                }
            }


            app.manage(crate::sys::commands::HookRegistryState::new());


            app.manage(crate::sys::commands::PromptEnhancementState::new());


            let task_db_conn = Arc::new(Mutex::new(
                Connection::open(&db_path).context("Failed to open database for task manager")?,
            ));
            let task_manager = Arc::new(crate::features::tasks::TaskManager::new(
                task_db_conn,
                app.handle().clone(),
                4,
            ));
            let task_manager_clone = task_manager.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = task_manager_clone.restore().await {
                    tracing::error!("Failed to restore tasks: {}", e);
                }
            });
            let task_manager_loop = task_manager.clone();
            tauri::async_runtime::spawn(async move {
                crate::features::tasks::start_task_loop(task_manager_loop).await;
            });
            app.manage(TaskManagerState(task_manager));


            if let Ok(state) = AppState::load(app.handle()) {
                app.manage(state);
            }


            if let Err(err) = build_system_tray(app) {
                eprintln!("[tray] initialization failed: {err:?}");
            }

            if let Some(window) = app.get_webview_window("main") {
                if let Err(err) = initialize_window(&window) {
                    eprintln!("[window] initialization failed: {err:?}");
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![





            crate::sys::commands::agi_init,
            crate::sys::commands::agi_submit_goal,
            crate::sys::commands::agi_submit_goal_parallel,
            crate::sys::commands::agi_get_goal_status,
            crate::sys::commands::agi_list_goals,
            crate::sys::commands::agi_stop,
            crate::sys::commands::agi_cancel_goal,


            crate::sys::commands::orchestrator_init,
            crate::sys::commands::orchestrator_init_default,
            crate::sys::commands::orchestrator_spawn_agent,
            crate::sys::commands::orchestrator_spawn_parallel,
            crate::sys::commands::orchestrator_get_agent_status,
            crate::sys::commands::orchestrator_list_agents,
            crate::sys::commands::orchestrator_cancel_agent,
            crate::sys::commands::orchestrator_cancel_all,
            crate::sys::commands::orchestrator_wait_all,
            crate::sys::commands::orchestrator_cleanup,


            crate::sys::commands::get_system_resources,
            crate::sys::commands::pause_agent,
            crate::sys::commands::resume_agent,
            crate::sys::commands::cancel_agent,
            crate::sys::commands::refresh_agent_status,
            crate::sys::commands::list_active_agents,


            crate::sys::commands::approve_operation,
            crate::sys::commands::reject_operation,
            crate::sys::commands::agent_resolve_approval,
            crate::sys::commands::agent_set_workflow_hash,
            crate::sys::commands::agent_list_trusted_workflows,


            crate::sys::commands::cancel_background_task,
            crate::sys::commands::pause_background_task,
            crate::sys::commands::resume_background_task,
            crate::sys::commands::list_background_tasks,


            crate::sys::commands::query_knowledge,
            crate::sys::commands::get_recent_knowledge,
            crate::sys::commands::get_knowledge_by_category,


            crate::sys::commands::ai_analyze_project,
            crate::sys::commands::ai_add_constraint,
            crate::sys::commands::ai_generate_code,
            crate::sys::commands::ai_refactor_code,
            crate::sys::commands::ai_generate_tests,
            crate::sys::commands::ai_get_project_context,
            crate::sys::commands::ai_generate_context_prompt,
            crate::sys::commands::ai_access_file,


            crate::sys::commands::window_get_state,
            crate::sys::commands::window_set_pinned,
            crate::sys::commands::window_set_always_on_top,
            crate::sys::commands::window_set_visibility,
            crate::sys::commands::window_dock,
            crate::sys::commands::window_is_maximized,
            crate::sys::commands::window_maximize,
            crate::sys::commands::window_unmaximize,
            crate::sys::commands::window_toggle_maximize,
            crate::sys::commands::window_set_fullscreen,
            crate::sys::commands::window_is_fullscreen,
            crate::sys::commands::tray_set_unread_badge,


            crate::sys::commands::chat_create_conversation,
            crate::sys::commands::chat_get_conversations,
            crate::sys::commands::chat_get_conversation,
            crate::sys::commands::chat_update_conversation,
            crate::sys::commands::chat_delete_conversation,
            crate::sys::commands::chat_create_message,
            crate::sys::commands::chat_get_messages,
            crate::sys::commands::chat_update_message,
            crate::sys::commands::chat_delete_message,
            crate::sys::commands::chat_send_message,
            crate::sys::commands::chat_stop_generation,
            crate::sys::commands::chat_get_conversation_stats,
            crate::sys::commands::chat_get_cost_overview,
            crate::sys::commands::chat_get_cost_analytics,
            crate::sys::commands::chat_set_monthly_budget,


            crate::sys::commands::checkpoint_create,
            crate::sys::commands::checkpoint_restore,
            crate::sys::commands::checkpoint_list,
            crate::sys::commands::checkpoint_delete,


            crate::sys::commands::cloud_connect,
            crate::sys::commands::cloud_complete_oauth,
            crate::sys::commands::cloud_disconnect,
            crate::sys::commands::cloud_list_accounts,
            crate::sys::commands::cloud_list,
            crate::sys::commands::cloud_upload,
            crate::sys::commands::cloud_download,
            crate::sys::commands::cloud_delete,
            crate::sys::commands::cloud_create_folder,
            crate::sys::commands::cloud_share,


            crate::sys::commands::email_connect,
            crate::sys::commands::email_list_accounts,
            crate::sys::commands::email_remove_account,
            crate::sys::commands::email_list_folders,
            crate::sys::commands::email_fetch_inbox,
            crate::sys::commands::email_mark_read,
            crate::sys::commands::email_delete,
            crate::sys::commands::email_download_attachment,
            crate::sys::commands::email_send,
            crate::sys::commands::contact_create,
            crate::sys::commands::contact_get,
            crate::sys::commands::contact_list,
            crate::sys::commands::contact_search,
            crate::sys::commands::contact_update,
            crate::sys::commands::contact_delete,
            crate::sys::commands::contact_import_vcard,
            crate::sys::commands::contact_export_vcard,


            crate::sys::commands::calendar_connect,
            crate::sys::commands::calendar_complete_oauth,
            crate::sys::commands::calendar_disconnect,
            crate::sys::commands::calendar_list_accounts,
            crate::sys::commands::calendar_list_calendars,
            crate::sys::commands::calendar_list_events,
            crate::sys::commands::calendar_create_event,
            crate::sys::commands::calendar_update_event,
            crate::sys::commands::calendar_delete_event,
            crate::sys::commands::calendar_get_system_timezone,


            crate::sys::commands::productivity_connect,
            crate::sys::commands::productivity_list_tasks,
            crate::sys::commands::productivity_create_task,
            crate::sys::commands::productivity_notion_list_pages,
            crate::sys::commands::productivity_notion_query_database,
            crate::sys::commands::productivity_notion_create_database_row,
            crate::sys::commands::productivity_trello_list_boards,
            crate::sys::commands::productivity_trello_list_cards,
            crate::sys::commands::productivity_trello_create_card,
            crate::sys::commands::productivity_trello_move_card,
            crate::sys::commands::productivity_trello_add_comment,
            crate::sys::commands::productivity_asana_list_projects,
            crate::sys::commands::productivity_asana_list_project_tasks,
            crate::sys::commands::productivity_asana_create_task,
            crate::sys::commands::productivity_asana_assign_task,
            crate::sys::commands::productivity_asana_mark_complete,


            crate::sys::commands::automation_list_windows,
            crate::sys::commands::automation_find_elements,
            crate::sys::commands::automation_invoke,
            crate::sys::commands::automation_set_value,
            crate::sys::commands::automation_get_value,
            crate::sys::commands::automation_toggle,
            crate::sys::commands::automation_focus_window,
            crate::sys::commands::automation_send_keys,
            crate::sys::commands::automation_hotkey,
            crate::sys::commands::automation_click,
            crate::sys::commands::automation_clipboard_get,
            crate::sys::commands::automation_clipboard_set,
            crate::sys::commands::automation_record_start,
            crate::sys::commands::automation_record_stop,
            crate::sys::commands::automation_record_action_click,
            crate::sys::commands::automation_record_action_type,
            crate::sys::commands::automation_record_action_screenshot,
            crate::sys::commands::automation_record_action_wait,
            crate::sys::commands::automation_record_is_recording,
            crate::sys::commands::automation_save_script,
            crate::sys::commands::automation_load_script,
            crate::sys::commands::automation_list_scripts,
            crate::sys::commands::automation_delete_script,
            crate::sys::commands::automation_execute_script,
            crate::sys::commands::automation_record_get_session,
            crate::sys::commands::automation_inspect_element_at_point,
            crate::sys::commands::automation_inspect_element_by_id,
            crate::sys::commands::automation_find_element_by_selector,
            crate::sys::commands::automation_generate_selector,
            crate::sys::commands::automation_get_element_tree,
            crate::sys::commands::automation_save_recording_as_script,
            crate::sys::commands::automation_generate_code,
            crate::sys::commands::overlay_emit_click,
            crate::sys::commands::overlay_emit_type,
            crate::sys::commands::overlay_emit_region,
            crate::sys::commands::overlay_replay_recent,

            crate::sys::commands::automation_drag_drop,
            crate::sys::commands::automation_ocr,
            crate::sys::commands::automation_type,
            crate::sys::commands::automation_screenshot,


            crate::sys::commands::browser_init,
            crate::sys::commands::browser_launch,
            crate::sys::commands::browser_open_tab,
            crate::sys::commands::browser_close_tab,
            crate::sys::commands::browser_list_tabs,
            crate::sys::commands::browser_navigate,
            crate::sys::commands::browser_go_back,
            crate::sys::commands::browser_go_forward,
            crate::sys::commands::browser_reload,
            crate::sys::commands::browser_get_url,
            crate::sys::commands::browser_get_title,
            crate::sys::commands::browser_click,
            crate::sys::commands::browser_type,
            crate::sys::commands::browser_get_text,
            crate::sys::commands::browser_get_attribute,
            crate::sys::commands::browser_wait_for_selector,
            crate::sys::commands::browser_select_option,
            crate::sys::commands::browser_check,
            crate::sys::commands::browser_uncheck,
            crate::sys::commands::browser_screenshot,
            crate::sys::commands::browser_evaluate,
            crate::sys::commands::browser_hover,
            crate::sys::commands::browser_focus,
            crate::sys::commands::browser_query_all,
            crate::sys::commands::browser_scroll_into_view,
            crate::sys::commands::browser_execute_async_js,
            crate::sys::commands::browser_get_element_state,
            crate::sys::commands::browser_wait_for_interactive,
            crate::sys::commands::browser_fill_form,
            crate::sys::commands::browser_drag_and_drop,
            crate::sys::commands::browser_upload_file,
            crate::sys::commands::browser_get_cookies,
            crate::sys::commands::browser_set_cookie,
            crate::sys::commands::browser_clear_cookies,
            crate::sys::commands::browser_get_performance_metrics,
            crate::sys::commands::browser_wait_for_navigation,
            crate::sys::commands::browser_get_frames,
            crate::sys::commands::browser_execute_in_frame,
            crate::sys::commands::browser_call_function,
            crate::sys::commands::browser_enable_request_interception,
            crate::sys::commands::browser_get_screenshot_stream,
            crate::sys::commands::browser_highlight_element,
            crate::sys::commands::browser_get_dom_snapshot,
            crate::sys::commands::browser_get_console_logs,
            crate::sys::commands::browser_get_network_activity,


            crate::sys::commands::find_element_semantic,
            crate::sys::commands::find_all_elements_semantic,
            crate::sys::commands::click_semantic,
            crate::sys::commands::type_semantic,
            crate::sys::commands::get_accessibility_tree,
            crate::sys::commands::test_selector_strategies,
            crate::sys::commands::get_dom_semantic_graph,
            crate::sys::commands::get_interactive_elements,
            crate::sys::commands::find_by_role,


            crate::sys::commands::git_init,
            crate::sys::commands::git_status,
            crate::sys::commands::git_add,
            crate::sys::commands::git_commit,
            crate::sys::commands::git_push,
            crate::sys::commands::git_pull,
            crate::sys::commands::git_create_branch,
            crate::sys::commands::git_checkout,
            crate::sys::commands::git_checkout_new_branch,
            crate::sys::commands::git_list_branches,
            crate::sys::commands::git_delete_branch,
            crate::sys::commands::git_merge,
            crate::sys::commands::git_log,
            crate::sys::commands::git_diff,
            crate::sys::commands::git_clone,
            crate::sys::commands::git_fetch,
            crate::sys::commands::git_stash,
            crate::sys::commands::git_stash_pop,
            crate::sys::commands::git_reset,
            crate::sys::commands::git_list_remotes,
            crate::sys::commands::git_add_remote,


            crate::sys::commands::design_generate_css,
            crate::sys::commands::design_apply_css,
            crate::sys::commands::design_get_element_styles,
            crate::sys::commands::design_generate_color_scheme,
            crate::sys::commands::design_suggest_improvements,
            crate::sys::commands::design_tokens_to_css,
            crate::sys::commands::design_check_accessibility,


            crate::sys::commands::media_generate_image,
            crate::sys::commands::media_generate_video,


            crate::sys::commands::debug_parse_error,
            crate::sys::commands::debug_suggest_fixes,
            crate::sys::commands::debug_analyze_stack_trace,


            crate::sys::commands::task_create,
            crate::sys::commands::task_get_status,
            crate::sys::commands::task_update_progress,
            crate::sys::commands::task_pause,
            crate::sys::commands::task_resume,
            crate::sys::commands::task_cancel,
            crate::sys::commands::task_list,
            crate::sys::commands::task_list_by_status,
            crate::sys::commands::task_complete,
            crate::sys::commands::task_save_context,
            crate::sys::commands::task_get_resumable,
            crate::sys::commands::coord_update_app_state,
            crate::sys::commands::coord_request_approval,
            crate::sys::commands::coord_get_pending_approvals,


            crate::sys::commands::migration_test_lovable_connection,
            crate::sys::commands::migration_list_lovable_workflows,
            crate::sys::commands::migration_launch_lovable,


            crate::sys::commands::llm_send_message,
            crate::sys::commands::llm_configure_provider,
            crate::sys::commands::llm_set_default_provider,
            crate::sys::commands::llm_get_available_models,
            crate::sys::commands::llm_check_provider_status,
            crate::sys::commands::llm_get_usage_stats,
            crate::sys::commands::router_suggestions,


            crate::sys::commands::cache_get_stats,
            crate::sys::commands::cache_clear_all,
            crate::sys::commands::cache_clear_by_type,
            crate::sys::commands::cache_clear_by_provider,
            crate::sys::commands::cache_get_size,
            crate::sys::commands::cache_configure,
            crate::sys::commands::cache_warmup,
            crate::sys::commands::cache_export,
            crate::sys::commands::cache_get_analytics,
            crate::sys::commands::cache_prune_expired,


            crate::sys::commands::codebase_cache_get_stats,
            crate::sys::commands::codebase_cache_clear_project,
            crate::sys::commands::codebase_cache_clear_file,
            crate::sys::commands::codebase_cache_clear_all,
            crate::sys::commands::codebase_cache_clear_expired,
            crate::sys::commands::codebase_cache_get_file_tree,
            crate::sys::commands::codebase_cache_set_file_tree,
            crate::sys::commands::codebase_cache_get_symbols,
            crate::sys::commands::codebase_cache_set_symbols,
            crate::sys::commands::codebase_cache_get_dependencies,
            crate::sys::commands::codebase_cache_set_dependencies,
            crate::sys::commands::codebase_cache_calculate_hash,


            crate::sys::commands::generate_code_embeddings,
            crate::sys::commands::semantic_search_codebase,
            crate::sys::commands::get_embedding_stats,
            crate::sys::commands::index_workspace,
            crate::sys::commands::index_file,
            crate::sys::commands::get_indexing_progress,
            crate::sys::commands::on_file_changed,
            crate::sys::commands::on_file_deleted,


            crate::sys::commands::settings_save_api_key,
            crate::sys::commands::settings_get_api_key,
            crate::sys::commands::settings_load,
            crate::sys::commands::settings_save,
            crate::sys::commands::settings_v2_get,
            crate::sys::commands::settings_v2_set,
            crate::sys::commands::settings_v2_get_batch,
            crate::sys::commands::settings_v2_delete,
            crate::sys::commands::settings_v2_get_category,
            crate::sys::commands::settings_v2_save_api_key,


            crate::sys::account::device_link_initiate,
            crate::sys::account::device_link_poll,
            crate::sys::account::fetch_user_profile,
            crate::sys::account::oauth_refresh,


            crate::sys::commands::create_team,
            crate::sys::commands::get_team,
            crate::sys::commands::update_team,
            crate::sys::commands::delete_team,
            crate::sys::commands::get_user_teams,
            crate::sys::commands::invite_member,
            crate::sys::commands::accept_invitation,
            crate::sys::commands::remove_member,
            crate::sys::commands::update_member_role,
            crate::sys::commands::get_team_members,
            crate::sys::commands::get_team_invitations,
            crate::sys::commands::share_resource,
            crate::sys::commands::unshare_resource,
            crate::sys::commands::get_team_resources,
            crate::sys::commands::get_team_resources_by_type,
            crate::sys::commands::get_team_activity,
            crate::sys::commands::get_user_team_activity,
            crate::sys::commands::get_team_billing,
            crate::sys::commands::initialize_team_billing,
            crate::sys::commands::update_team_plan,
            crate::sys::commands::add_team_seats,
            crate::sys::commands::remove_team_seats,
            crate::sys::commands::calculate_team_cost,
            crate::sys::commands::update_team_usage,
            crate::sys::commands::transfer_team_ownership,
            crate::sys::commands::settings_v2_get_api_key,
            crate::sys::commands::settings_v2_load_app_settings,
            crate::sys::commands::settings_v2_save_app_settings,
            crate::sys::commands::settings_v2_clear_cache,
            crate::sys::commands::settings_v2_list_all,


            crate::sys::commands::capture_screen_full,
            crate::sys::commands::capture_screen_region,
            crate::sys::commands::capture_get_windows,
            crate::sys::commands::capture_get_history,
            crate::sys::commands::capture_delete,
            crate::sys::commands::capture_save_to_clipboard,

            crate::sys::commands::capture::capture_screen_window,
            crate::sys::commands::capture::capture_from_clipboard,


            crate::sys::commands::ocr_process_image,
            crate::sys::commands::ocr_process_region,
            crate::sys::commands::ocr_get_languages,
            crate::sys::commands::ocr_get_result,
            crate::sys::commands::ocr_process_with_boxes,
            crate::sys::commands::ocr_detect_languages,
            crate::sys::commands::ocr_process_multi_language,
            crate::sys::commands::ocr_preprocess_image,


            crate::sys::commands::vision_send_message,
            crate::sys::commands::vision_analyze_screenshot,
            crate::sys::commands::vision_extract_text,
            crate::sys::commands::vision_compare_images,
            crate::sys::commands::vision_locate_element,
            crate::sys::commands::vision_describe_ui_elements,
            crate::sys::commands::vision_answer_question,


            crate::sys::commands::file_read,
            crate::sys::commands::file_write,
            crate::sys::commands::file_delete,
            crate::sys::commands::file_rename,
            crate::sys::commands::file_copy,
            crate::sys::commands::file_move,
            crate::sys::commands::file_exists,
            crate::sys::commands::file_metadata,
            crate::sys::commands::undo_file_operation,
            crate::sys::commands::execute_terminal_command,
            crate::sys::commands::dir_create,
            crate::sys::commands::dir_list,
            crate::sys::commands::dir_delete,
            crate::sys::commands::dir_traverse,
            crate::sys::filesystem::fs_search_files,
            crate::sys::filesystem::fs_search_folders,
            crate::sys::commands::fs_read_file_content,
            crate::sys::commands::fs_get_workspace_files,
            crate::sys::commands::file_watch_start,
            crate::sys::commands::file_watch_stop,
            crate::sys::commands::file_watch_list,
            crate::sys::commands::file_watch_stop_all,

            crate::sys::commands::file_read_text,
            crate::sys::commands::file_write_text,
            crate::sys::commands::file_read_binary,
            crate::sys::commands::file_write_binary,
            crate::sys::commands::file_get_metadata,


            crate::sys::commands::terminal_detect_shells,
            crate::sys::commands::terminal_create_session,
            crate::sys::commands::terminal_send_input,
            crate::sys::commands::terminal_resize,
            crate::sys::commands::terminal_kill,
            crate::sys::commands::terminal_list_sessions,
            crate::sys::commands::terminal_get_history,
            crate::sys::commands::terminal_ai_suggest_command,
            crate::sys::commands::terminal_ai_explain_error,
            crate::sys::commands::terminal_smart_commit,
            crate::sys::commands::terminal_ai_suggest_improvements,


            crate::sys::commands::api_request,
            crate::sys::commands::api_get,
            crate::sys::commands::api_post_json,
            crate::sys::commands::api_put_json,
            crate::sys::commands::api_delete,
            crate::sys::commands::api_parse_response,
            crate::sys::commands::api_extract_json_path,
            crate::sys::commands::api_oauth_create_client,
            crate::sys::commands::api_oauth_get_auth_url,
            crate::sys::commands::api_oauth_exchange_code,
            crate::sys::commands::api_oauth_refresh_token,
            crate::sys::commands::api_oauth_client_credentials,
            crate::sys::commands::api_render_template,
            crate::sys::commands::api_extract_template_variables,
            crate::sys::commands::api_validate_template,


            crate::sys::commands::db_create_pool,
            crate::sys::commands::db_execute_query,
            crate::sys::commands::db_execute_prepared,
            crate::sys::commands::db_execute_batch,
            crate::sys::commands::db_close_pool,
            crate::sys::commands::db_list_pools,
            crate::sys::commands::db_get_pool_stats,
            crate::sys::commands::db_build_select,
            crate::sys::commands::db_build_insert,
            crate::sys::commands::db_build_update,
            crate::sys::commands::db_build_delete,
            crate::sys::commands::db_mongo_connect,
            crate::sys::commands::db_mongo_find,
            crate::sys::commands::db_mongo_find_one,
            crate::sys::commands::db_mongo_insert_one,
            crate::sys::commands::db_mongo_insert_many,
            crate::sys::commands::db_mongo_update_many,
            crate::sys::commands::db_mongo_delete_many,
            crate::sys::commands::db_mongo_disconnect,
            crate::sys::commands::db_redis_connect,
            crate::sys::commands::db_redis_get,
            crate::sys::commands::db_redis_set,
            crate::sys::commands::db_redis_del,
            crate::sys::commands::db_redis_exists,
            crate::sys::commands::db_redis_expire,
            crate::sys::commands::db_redis_hget,
            crate::sys::commands::db_redis_hset,
            crate::sys::commands::db_redis_hgetall,
            crate::sys::commands::db_redis_disconnect,


            crate::sys::commands::document_read,
            crate::sys::commands::document_extract_text,
            crate::sys::commands::document_get_metadata,
            crate::sys::commands::document_search,
            crate::sys::commands::document_detect_type,
            crate::sys::commands::document_create_word,
            crate::sys::commands::document_create_word_simple,
            crate::sys::commands::document_create_excel,
            crate::sys::commands::document_create_excel_simple,
            crate::sys::commands::document_create_excel_numbers,
            crate::sys::commands::document_create_pdf,
            crate::sys::commands::document_create_pdf_simple,


            crate::sys::commands::mcp_initialize,
            crate::sys::commands::mcp_list_servers,
            crate::sys::commands::mcp_connect_server,
            crate::sys::commands::mcp_disconnect_server,
            crate::sys::commands::mcp_list_tools,
            crate::sys::commands::mcp_search_tools,
            crate::sys::commands::mcp_call_tool,
            crate::sys::commands::mcp_get_config,
            crate::sys::commands::mcp_update_config,
            crate::sys::commands::mcp_enable_server,
            crate::sys::commands::mcp_disable_server,
            crate::sys::commands::mcp_get_stats,
            crate::sys::commands::mcp_get_server_logs,
            crate::sys::commands::mcp_store_credential,
            crate::sys::commands::mcp_get_tool_schemas,
            crate::sys::commands::mcp_get_health,
            crate::sys::commands::mcp_check_server_health,


            crate::sys::commands::github_clone_repo,
            crate::sys::commands::github_get_repo_context,
            crate::sys::commands::github_search_files,
            crate::sys::commands::github_read_file,
            crate::sys::commands::github_get_file_tree,
            crate::sys::commands::github_list_repos,


            crate::sys::commands::computer_use_start_session,
            crate::sys::commands::computer_use_capture_screen,
            crate::sys::commands::computer_use_click,
            crate::sys::commands::computer_use_move_mouse,
            crate::sys::commands::computer_use_type_text,
            crate::sys::commands::computer_use_get_session,
            crate::sys::commands::computer_use_list_sessions,
            crate::sys::commands::computer_use_execute_tool,


            crate::sys::commands::code_generate_edit,
            crate::sys::commands::code_apply_edit,
            crate::sys::commands::code_reject_edit,
            crate::sys::commands::code_list_pending_edits,
            crate::sys::commands::composer_start_session,
            crate::sys::commands::composer_apply_session,
            crate::sys::commands::composer_get_session,
            crate::sys::commands::get_file_diff,
            crate::sys::commands::apply_changes,
            crate::sys::commands::revert_changes,


            crate::sys::commands::voice_transcribe_file,
            crate::sys::commands::voice_transcribe_blob,
            crate::sys::commands::voice_configure,
            crate::sys::commands::voice_get_settings,
            crate::sys::commands::voice_start_recording,
            crate::sys::commands::voice_stop_recording,


            crate::sys::commands::shortcuts_register,
            crate::sys::commands::shortcuts_unregister,
            crate::sys::commands::shortcuts_list,
            crate::sys::commands::shortcuts_update,
            crate::sys::commands::shortcuts_trigger,
            crate::sys::commands::shortcuts_reset,
            crate::sys::commands::shortcuts_check_key,
            crate::sys::commands::shortcuts_get_defaults,


            crate::sys::commands::workspace_index,
            crate::sys::commands::workspace_search_symbols,
            crate::sys::commands::workspace_find_definition,
            crate::sys::commands::workspace_find_references,
            crate::sys::commands::workspace_get_dependencies,
            crate::sys::commands::workspace_get_file_symbols,
            crate::sys::commands::workspace_get_stats,


            crate::sys::commands::lsp_start_server,
            crate::sys::commands::lsp_stop_server,
            crate::sys::commands::lsp_did_open,
            crate::sys::commands::lsp_did_change,
            crate::sys::commands::lsp_did_close,
            crate::sys::commands::lsp_completion,
            crate::sys::commands::lsp_hover,
            crate::sys::commands::lsp_definition,
            crate::sys::commands::lsp_references,
            crate::sys::commands::lsp_rename,
            crate::sys::commands::lsp_formatting,
            crate::sys::commands::lsp_workspace_symbol,
            crate::sys::commands::lsp_code_action,
            crate::sys::commands::lsp_get_diagnostics,
            crate::sys::commands::lsp_get_all_diagnostics,
            crate::sys::commands::lsp_list_servers,
            crate::sys::commands::lsp_detect_language,


            crate::sys::commands::get_onboarding_status,
            crate::sys::commands::complete_onboarding_step,
            crate::sys::commands::skip_onboarding_step,
            crate::sys::commands::reset_onboarding,
            crate::sys::commands::export_user_data,
            crate::sys::commands::check_connectivity,
            crate::sys::commands::get_session_info,
            crate::sys::commands::update_session_activity,
            crate::sys::commands::get_user_preference,
            crate::sys::commands::set_user_preference,
            crate::sys::commands::select_demo,
            crate::sys::commands::record_demo_results,
            crate::sys::commands::mark_setup_completed,
            crate::sys::commands::complete_first_run,
            crate::sys::commands::get_first_run_session,
            crate::sys::commands::get_first_run_statistics,
            crate::sys::commands::skip_first_run,
            crate::sys::commands::start_first_run_experience,
            crate::sys::commands::has_completed_first_run,
            crate::sys::commands::update_first_run_step,

            crate::sys::billing::billing_initialize,
            crate::sys::billing::stripe_create_customer,
            crate::sys::billing::stripe_get_customer_by_email,
            crate::sys::billing::stripe_create_subscription,
            crate::sys::billing::stripe_get_subscription,
            crate::sys::billing::stripe_update_subscription,
            crate::sys::billing::stripe_cancel_subscription,
            crate::sys::billing::stripe_get_invoices,
            crate::sys::billing::stripe_get_usage,
            crate::sys::billing::stripe_track_usage,
            crate::sys::billing::stripe_create_portal_session,
            crate::sys::billing::stripe_get_active_subscription,
            crate::sys::billing::stripe_process_webhook,
            crate::sys::billing::stripe_get_payment_methods,
            crate::sys::billing::stripe_create_setup_intent,
            crate::sys::billing::stripe_attach_payment_method,
            crate::sys::billing::stripe_set_default_payment_method,
            crate::sys::billing::stripe_delete_payment_method,
            crate::sys::billing::send_invoice_email,
            crate::sys::commands::subscribe_to_plan,
            crate::sys::commands::upgrade_plan,
            crate::sys::commands::cancel_subscription,
            crate::sys::commands::get_pricing_plans,
            crate::sys::commands::get_current_plan,


            crate::sys::commands::create_workflow,
            crate::sys::commands::update_workflow,
            crate::sys::commands::delete_workflow,
            crate::sys::commands::get_workflow,
            crate::sys::commands::get_user_workflows,
            crate::sys::commands::execute_workflow,
            crate::sys::commands::pause_workflow,
            crate::sys::commands::resume_workflow,
            crate::sys::commands::cancel_workflow,
            crate::sys::commands::get_workflow_status,
            crate::sys::commands::get_execution_logs,
            crate::sys::commands::schedule_workflow,
            crate::sys::commands::trigger_workflow_on_event,
            crate::sys::commands::get_next_execution_time,


            crate::sys::commands::publish_workflow_to_marketplace,
            crate::sys::commands::unpublish_workflow,
            crate::sys::commands::get_featured_workflows,
            crate::sys::commands::get_trending_workflows,
            crate::sys::commands::search_marketplace_workflows,
            crate::sys::commands::get_workflow_by_share_url,
            crate::sys::commands::get_creator_workflows,
            crate::sys::commands::get_my_published_workflows,
            crate::sys::commands::get_workflows_by_category,
            crate::sys::commands::get_category_counts,
            crate::sys::commands::get_popular_tags,
            crate::sys::commands::clone_marketplace_workflow,
            crate::sys::commands::fork_marketplace_workflow,
            crate::sys::commands::rate_workflow,
            crate::sys::commands::get_user_workflow_rating,
            crate::sys::commands::comment_on_workflow,
            crate::sys::commands::get_workflow_comments,
            crate::sys::commands::delete_workflow_comment,
            crate::sys::commands::favorite_workflow,
            crate::sys::commands::unfavorite_workflow,
            crate::sys::commands::is_workflow_favorited,
            crate::sys::commands::get_user_favorites,
            crate::sys::commands::get_user_clones,
            crate::sys::commands::share_workflow,
            crate::sys::commands::get_workflow_stats,
            crate::sys::commands::get_workflow_templates,
            crate::sys::commands::get_workflow_templates_by_category,
            crate::sys::commands::search_workflow_templates,


            crate::sys::commands::create_team,
            crate::sys::commands::get_team,
            crate::sys::commands::update_team,
            crate::sys::commands::delete_team,
            crate::sys::commands::get_user_teams,
            crate::sys::commands::invite_member,
            crate::sys::commands::accept_invitation,
            crate::sys::commands::remove_member,
            crate::sys::commands::update_member_role,
            crate::sys::commands::get_team_members,
            crate::sys::commands::get_team_invitations,
            crate::sys::commands::share_resource,
            crate::sys::commands::unshare_resource,
            crate::sys::commands::get_team_resources,
            crate::sys::commands::get_team_resources_by_type,
            crate::sys::commands::get_team_activity,
            crate::sys::commands::get_user_team_activity,
            crate::sys::commands::get_team_billing,
            crate::sys::commands::initialize_team_billing,
            crate::sys::commands::update_team_plan,
            crate::sys::commands::add_team_seats,
            crate::sys::commands::remove_team_seats,
            crate::sys::commands::calculate_team_cost,
            crate::sys::commands::update_team_usage,
            crate::sys::commands::transfer_team_ownership,


            crate::sys::commands::get_process_templates,
            crate::sys::commands::get_outcome_tracking,
            crate::sys::commands::get_process_success_rates,
            crate::sys::commands::get_best_practices,
            crate::sys::commands::get_process_statistics,


            crate::sys::commands::get_all_templates,
            crate::sys::commands::get_template_by_id,
            crate::sys::commands::get_templates_by_category,
            crate::sys::commands::install_template,
            crate::sys::commands::get_installed_templates,
            crate::sys::commands::search_templates,
            crate::sys::commands::execute_template,
            crate::sys::commands::uninstall_template,
            crate::sys::commands::get_template_categories,


            crate::sys::commands::analytics_track_event,
            crate::sys::commands::analytics_flush_events,
            crate::sys::commands::analytics_get_session_id,
            crate::sys::commands::analytics_set_user_property,
            crate::sys::commands::metrics_get_system,
            crate::sys::commands::metrics_get_app,
            crate::sys::commands::feature_flag_get,
            crate::sys::commands::feature_flag_get_all,
            crate::sys::commands::analytics_delete_all_data,
            crate::sys::commands::metrics_increment_automations,
            crate::sys::commands::metrics_increment_goals,
            crate::sys::commands::metrics_set_mcp_servers,
            crate::sys::commands::metrics_set_cache_hit_rate,
            crate::sys::commands::analytics_calculate_roi,
            crate::sys::commands::analytics_get_process_metrics,
            crate::sys::commands::analytics_get_user_metrics,
            crate::sys::commands::analytics_get_tool_metrics,
            crate::sys::commands::analytics_get_metric_trends,
            crate::sys::commands::analytics_export_report,
            crate::sys::commands::analytics_generate_weekly_report,
            crate::sys::commands::analytics_generate_monthly_report,
            crate::sys::commands::analytics_get_top_processes,
            crate::sys::commands::analytics_save_snapshot,

            crate::sys::commands::analytics_get_usage_stats,
            crate::sys::commands::analytics_get_feature_usage,


            crate::sys::commands::error_report,
            crate::sys::commands::error_report_batch,
            crate::sys::commands::error_get_logs,
            crate::sys::commands::error_clear_logs,
            crate::sys::commands::error_get_stats,
            crate::sys::commands::error_export_logs,


            crate::sys::commands::get_realtime_stats,
            crate::sys::commands::record_automation_metrics,
            crate::sys::commands::get_metrics_history,
            crate::sys::commands::compare_to_manual,
            crate::sys::commands::compare_to_previous_period,
            crate::sys::commands::compare_to_industry_benchmark,
            crate::sys::commands::get_milestones,
            crate::sys::commands::share_milestone,
            crate::sys::commands::track_workflow_view,
            crate::sys::commands::acknowledge_milestone,


            crate::sys::commands::bg_submit_task,
            crate::sys::commands::bg_cancel_task,
            crate::sys::commands::bg_pause_task,
            crate::sys::commands::bg_resume_task,
            crate::sys::commands::bg_get_task_status,
            crate::sys::commands::bg_list_tasks,
            crate::sys::commands::bg_get_task_stats,


            crate::sys::commands::hooks_initialize,
            crate::sys::commands::hooks_list,
            crate::sys::commands::hooks_add,
            crate::sys::commands::hooks_remove,
            crate::sys::commands::hooks_toggle,
            crate::sys::commands::hooks_update,
            crate::sys::commands::hooks_get_config_path,
            crate::sys::commands::hooks_create_example,
            crate::sys::commands::hooks_export,
            crate::sys::commands::hooks_import,
            crate::sys::commands::hooks_reload,
            crate::sys::commands::hooks_get_event_types,
            crate::sys::commands::hooks_get_stats,


            crate::sys::commands::detect_use_case,
            crate::sys::commands::enhance_prompt,
            crate::sys::commands::route_to_best_api,
            crate::sys::commands::enhance_and_route_prompt,
            crate::sys::commands::get_prompt_enhancement_config,
            crate::sys::commands::set_prompt_enhancement_config,
            crate::sys::commands::get_suggested_provider,
            crate::sys::commands::get_available_use_cases,
            crate::sys::commands::get_available_providers,


            crate::sys::commands::agent::agent_init,
            crate::sys::commands::agent::agent_submit_task,
            crate::sys::commands::agent::agent_get_task_status,
            crate::sys::commands::agent::agent_list_tasks,
            crate::sys::commands::agent::agent_stop,
            crate::sys::commands::security::auth_login,


            crate::sys::commands::governance::get_audit_events,
            crate::sys::commands::governance::verify_audit_event,
            crate::sys::commands::governance::verify_audit_integrity,
            crate::sys::commands::governance::log_tool_execution,
            crate::sys::commands::governance::log_workflow_execution,
            crate::sys::commands::governance::create_approval_request,
            crate::sys::commands::governance::get_pending_approvals,
            crate::sys::commands::governance::get_approval_request,
            crate::sys::commands::governance::approve_request,
            crate::sys::commands::governance::reject_request,
            crate::sys::commands::governance::requires_approval,
            crate::sys::commands::governance::calculate_risk_level,
            crate::sys::commands::governance::get_approval_statistics,
            crate::sys::commands::governance::expire_timed_out_requests,


            crate::sys::commands::tutorials::get_user_credits,


            crate::sys::commands::messaging::connect_slack,
            crate::sys::commands::messaging::connect_whatsapp,
            crate::sys::commands::messaging::connect_teams,
            crate::sys::commands::messaging::get_messaging_history,
            crate::sys::commands::messaging::disconnect_platform,
            crate::sys::commands::messaging::list_messaging_connections,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

pub mod models;
