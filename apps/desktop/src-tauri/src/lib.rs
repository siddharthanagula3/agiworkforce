#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![warn(warnings)]
#![allow(unused_qualifications)]
#![allow(clippy::should_implement_trait)]
#![allow(clippy::too_many_arguments)]
#![allow(clippy::type_complexity)]
#![allow(clippy::await_holding_lock)]

use crate::agent::approval::ApprovalController;
use crate::billing::BillingStateWrapper;
use crate::commands::{
    ai_native::{CodeGeneratorState, ContextManagerState},
    load_persisted_calendar_accounts,
    security::AuthManagerState,
    ApiState, AppDatabase, BrowserStateWrapper, CalendarState, CloudState, CodeEditingState,
    ComputerUseState, DatabaseState, DocumentState, EmbeddingServiceState, FileWatcherState,
    GitHubState, LLMState, LSPState, McpState, ProductivityState, SettingsServiceState,
    SettingsState, ShortcutsState, TaskManagerState, TemplateManagerState, VoiceState,
    WorkflowEngineState, WorkspaceIndexState,
};
use crate::db::migrations;
use crate::security::{AuthManager, SecretManager};
use crate::settings::SettingsService;
use anyhow::Context;
use rusqlite::Connection;
use std::sync::{Arc, Mutex};
use tauri::{async_runtime, Manager};
use tokio::sync::Mutex as TokioMutex;

// Core application modules
pub mod account;
pub mod agent;
pub mod agi;
pub mod analytics;
pub mod api;
pub mod api_integrations;
pub mod automation;
pub mod billing;
pub mod browser;
pub mod cache;
pub mod calendar;
pub mod cloud;
pub mod codebase;
pub mod commands;
pub mod communications;
pub mod database;
pub mod db;
pub mod document;
pub mod embeddings;
pub mod error;
pub mod events;
pub mod filesystem;
pub mod hooks;
pub mod logging;
pub mod mcp;
pub mod messaging;
pub mod metrics;
pub mod onboarding;
pub mod orchestration;
pub mod overlay;
pub mod permissions;
pub mod productivity;
pub mod projects;
pub mod prompt_enhancement;
pub mod realtime;
pub mod router;
pub mod search;
pub mod security;
pub mod settings;
pub mod sync;
pub mod tasks;
pub mod teams;
pub mod telemetry;
pub mod terminal;
pub mod tray;
pub mod utils;
pub mod window;
pub mod workflows;

// Clipboard and speech are generally cross-platform or have fallbacks
pub mod clipboard;
pub mod speech;

// Re-exports
pub use state::{AppState, DockPosition, PersistentWindowState, WindowGeometry};
pub use tray::build_system_tray;
pub use window::{
    apply_dock, hide_window, initialize_window, set_always_on_top, set_pinned, show_window, undock,
    DockPreviewEvent, DockState,
};

pub mod state;
#[cfg(test)]
pub mod test_utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize telemetry (logging, tracing, metrics)
    let _telemetry_guard = match telemetry::init() {
        Ok(guard) => Some(guard),
        Err(e) => {
            eprintln!(
                "Failed to initialize telemetry: {}. Continuing without telemetry.",
                e
            );
            // Continue without telemetry - better UX than crashing
            None
        }
    };

    // audit fix: Add panic hook to capture and log crashes
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
            // Initialize database in proper app data directory
            let app_data_dir = match app.path().app_data_dir() {
                Ok(dir) => dir,
                Err(e) => {
                    tracing::error!("Failed to get app data dir: {}. Falling back to temp directory.", e);
                    // Fallback to temp dir instead of panicking
                    std::env::temp_dir().join("agiworkforce")
                }
            };
            // Ensure directory exists
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

            // Open database connection
            let conn = Connection::open(&db_path).context("Failed to open database")?;

            // Run migrations
            if let Err(e) = migrations::run_migrations(&conn) {
                tracing::error!("Failed to run migrations: {}", e);
                // Return error to setup, which stops the app gracefully-ish
                return Err(anyhow::anyhow!("Failed to run migrations: {}", e).into());
            }

            // Manage database state
            // Using Arc<Mutex<Connection>> as expected by AppDatabase
            let db_conn_arc = Arc::new(Mutex::new(conn));
            app.manage(AppDatabase {
                conn: db_conn_arc.clone(),
            });

            // Approval controller for permission prompts and trusted workflows
            let approval_controller = ApprovalController::new(app_data_dir.clone())
                .map_err(|e| anyhow::anyhow!("Failed to initialize approval controller: {}", e))?;
            app.manage(approval_controller);

            // Initialize security components
            let secret_manager = Arc::new(SecretManager::new(db_conn_arc.clone()));
            tracing::info!("SecretManager initialized");

            let auth_manager = Arc::new(parking_lot::RwLock::new(AuthManager::new(secret_manager.clone())));
            app.manage(AuthManagerState(auth_manager));
            tracing::info!("AuthManager initialized");

            // Initialize analytics telemetry state
            use crate::commands::analytics::TelemetryState;
            use crate::telemetry::{AnalyticsMetricsCollector, CollectorConfig, TelemetryCollector};

            let telemetry_config = CollectorConfig {
                enabled: true,
                batch_size: 50,
                flush_interval_secs: 30,
            };
            let telemetry_collector = TelemetryCollector::new(telemetry_config);
            let analytics_metrics = AnalyticsMetricsCollector::new();
            app.manage(TelemetryState::new(telemetry_collector, analytics_metrics));

            // Initialize LLM router state
            app.manage(LLMState::new());

            // Initialize browser automation state
            app.manage(BrowserStateWrapper::new());

            // Initialize settings state (legacy)
            app.manage(SettingsState::new());

            // Initialize new settings service with database connection
            let settings_conn = Connection::open(&db_path).context("Failed to open settings database")?;
            let settings_service = SettingsService::new(Arc::new(Mutex::new(settings_conn)))
                .context("Failed to initialize settings service")?;
            app.manage(SettingsServiceState::new(settings_service));

            // Initialize file watcher state
            app.manage(FileWatcherState::new());

            // Initialize API state
            app.manage(ApiState::new());

            // Initialize database state (async compatible)
            app.manage(tokio::sync::Mutex::new(DatabaseState::new()));

            // Initialize cloud storage state
            app.manage(CloudState::new());

            // Initialize calendar state and restore persisted accounts
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

            // Initialize terminal session manager
            let session_manager = crate::terminal::SessionManager::new(app.handle().clone());
            app.manage(session_manager.clone());

            // Initialize LLM router for terminal AI
            let terminal_llm_router = Arc::new(crate::router::LLMRouter::new());

            // Initialize terminal AI assistant
            let terminal_ai = crate::terminal::TerminalAI::new(
                terminal_llm_router,
                Arc::new(session_manager),
            );
            app.manage(terminal_ai);

            // Initialize productivity state
            app.manage(ProductivityState::new());

            // Initialize document state
            app.manage(DocumentState::new());

            // Initialize automation service
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

            // Initialize MCP state
            let mcp_state = McpState::new();
            app.manage(mcp_state);

            // AI-native coding features (STUBBED)
            app.manage(ContextManagerState(Arc::new(TokioMutex::new(()))));
            app.manage(CodeGeneratorState(Arc::new(TokioMutex::new(()))));

            // Initialize GitHub integration state
            let workspace_dir = app_data_dir.join("github_repos");
            std::fs::create_dir_all(&workspace_dir).ok();
            app.manage(Arc::new(TokioMutex::new(GitHubState::new(workspace_dir))));

            // Initialize Computer Use state
            app.manage(Arc::new(TokioMutex::new(ComputerUseState::new())));

            // Initialize Code Editing state
            app.manage(Arc::new(TokioMutex::new(CodeEditingState::new())));

            // Initialize Voice Input state
            app.manage(Arc::new(TokioMutex::new(VoiceState::new())));

            // Initialize Shortcuts state with defaults
            app.manage(Arc::new(TokioMutex::new(ShortcutsState::with_defaults())));

            // Initialize Workspace Indexing state
            app.manage(Arc::new(TokioMutex::new(WorkspaceIndexState::new())));

            // Initialize LSP state
            app.manage(Arc::new(LSPState::new()));

            // Initialize Codebase Cache
            let cache_conn = Connection::open(&db_path).context("Failed to open database for codebase cache")?;
            let codebase_cache = crate::cache::CodebaseCache::new(Arc::new(Mutex::new(cache_conn)))
                    .context("Failed to initialize codebase cache")?;
            app.manage(crate::commands::cache::CodebaseCacheState(Arc::new(codebase_cache)));

            // Initialize Billing state (Stripe integration)
            app.manage(BillingStateWrapper::new());

            // Initialize Workflow Orchestration state
            let workflow_engine_state = WorkflowEngineState::new(db_path.to_string_lossy().to_string());
            app.manage(workflow_engine_state);

            // Initialize Marketplace state for public workflows
            let marketplace_conn = Connection::open(&db_path).context("Failed to open database for marketplace")?;
            app.manage(crate::commands::marketplace::MarketplaceState {
                    db: Arc::new(Mutex::new(marketplace_conn)),
                });

            // Initialize Template Manager state
            let template_conn = Connection::open(&db_path).context("Failed to open database for template manager")?;
            let template_db = Arc::new(Mutex::new(template_conn));
            let template_manager = crate::commands::templates::initialize_template_manager(template_db);
            app.manage(TemplateManagerState {
                manager: Arc::new(Mutex::new(template_manager)),
            });

            // Initialize Real-time Metrics and ROI Dashboard
            let presence_db = Arc::new(tokio::sync::Mutex::new(
                Connection::open(&db_path).context("Failed to open database for presence")?,
            ));
            let presence_manager = Arc::new(crate::realtime::PresenceManager::new(presence_db));
            let websocket_port = 8787;
            let realtime_server = Arc::new(crate::realtime::RealtimeServer::new(presence_manager.clone()));
            {
                let server = realtime_server.clone();
                async_runtime::spawn(async move {
                    if let Err(e) = server.start(websocket_port).await {
                        tracing::error!("Realtime server failed: {}", e);
                    }
                });
            }
            app.manage(crate::commands::RealtimeState::new(
                presence_manager.clone(),
                websocket_port,
            ));
            let metrics_db = Arc::new(Mutex::new(
                Connection::open(&db_path).context("Failed to open database for metrics")?,
            ));
            let metrics_collector = Arc::new(
                crate::metrics::RealtimeMetricsCollector::new(metrics_db.clone(), realtime_server.clone()),
            );
            let metrics_comparison = Arc::new(
                crate::metrics::MetricsComparison::new(metrics_db.clone()),
            );
            app.manage(crate::commands::MetricsCollectorState(metrics_collector));
            app.manage(crate::commands::MetricsComparisonState(metrics_comparison));

            // Initialize Embedding Service for semantic code search
            let embedding_config = crate::embeddings::EmbeddingConfig::default();
            // Use app_data_dir as workspace root default for embedding service for now
            match async_runtime::block_on(
                crate::embeddings::EmbeddingService::new(
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

            // Initialize Hook Registry
            app.manage(crate::commands::HookRegistryState::new());

            // Initialize Prompt Enhancement
            app.manage(crate::commands::PromptEnhancementState::new());

            // Initialize Background Task Manager
            let task_db_conn = Arc::new(Mutex::new(
                Connection::open(&db_path).context("Failed to open database for task manager")?,
            ));
            let task_manager = Arc::new(crate::tasks::TaskManager::new(
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
                crate::tasks::start_task_loop(task_manager_loop).await;
            });
            app.manage(TaskManagerState(task_manager));

            // Initialize window state
            if let Ok(state) = AppState::load(app.handle()) {
                app.manage(state);
            }

            // Build system tray
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
            // ============================================
            // Unified Command Registry (main.rs + lib.rs)
            // ============================================

            // AGI
            crate::commands::agi_init,
            crate::commands::agi_submit_goal,
            crate::commands::agi_submit_goal_parallel,
            crate::commands::agi_get_goal_status,
            crate::commands::agi_list_goals,
            crate::commands::agi_stop,

            // Orchestrator
            crate::commands::orchestrator_init,
            crate::commands::orchestrator_init_default,
            crate::commands::orchestrator_spawn_agent,
            crate::commands::orchestrator_spawn_parallel,
            crate::commands::orchestrator_get_agent_status,
            crate::commands::orchestrator_list_agents,
            crate::commands::orchestrator_cancel_agent,
            crate::commands::orchestrator_cancel_all,
            crate::commands::orchestrator_wait_all,
            crate::commands::orchestrator_cleanup,

            // System Monitoring
            crate::commands::get_system_resources,
            crate::commands::pause_agent,
            crate::commands::resume_agent,
            crate::commands::cancel_agent,
            crate::commands::refresh_agent_status,
            crate::commands::list_active_agents,

            // Operations / Approval
            crate::commands::approve_operation,
            crate::commands::reject_operation,
            crate::commands::agent_resolve_approval,
            crate::commands::agent_set_workflow_hash,
            crate::commands::agent_list_trusted_workflows,

            // Background Tasks
            crate::commands::cancel_background_task,
            crate::commands::pause_background_task,
            crate::commands::resume_background_task,
            crate::commands::list_background_tasks,

            // Knowledge
            crate::commands::query_knowledge,
            crate::commands::get_recent_knowledge,
            crate::commands::get_knowledge_by_category,

            // AI Native (Stubs)
            crate::commands::ai_analyze_project,
            crate::commands::ai_add_constraint,
            crate::commands::ai_generate_code,
            crate::commands::ai_refactor_code,
            crate::commands::ai_generate_tests,
            crate::commands::ai_get_project_context,
            crate::commands::ai_generate_context_prompt,
            crate::commands::ai_access_file,

            // Window
            crate::commands::window_get_state,
            crate::commands::window_set_pinned,
            crate::commands::window_set_always_on_top,
            crate::commands::window_set_visibility,
            crate::commands::window_dock,
            crate::commands::window_is_maximized,
            crate::commands::window_maximize,
            crate::commands::window_unmaximize,
            crate::commands::window_toggle_maximize,
            crate::commands::window_set_fullscreen,
            crate::commands::window_is_fullscreen,
            crate::commands::tray_set_unread_badge,

            // Chat
            crate::commands::chat_create_conversation,
            crate::commands::chat_get_conversations,
            crate::commands::chat_get_conversation,
            crate::commands::chat_update_conversation,
            crate::commands::chat_delete_conversation,
            crate::commands::chat_create_message,
            crate::commands::chat_get_messages,
            crate::commands::chat_update_message,
            crate::commands::chat_delete_message,
            crate::commands::chat_send_message,
            crate::commands::chat_stop_generation, // Added from lib.rs
            crate::commands::chat_get_conversation_stats,
            crate::commands::chat_get_cost_overview,
            crate::commands::chat_get_cost_analytics,
            crate::commands::chat_set_monthly_budget,

            // Checkpoints
            crate::commands::checkpoint_create,
            crate::commands::checkpoint_restore,
            crate::commands::checkpoint_list,
            crate::commands::checkpoint_delete,

            // Cloud
            crate::commands::cloud_connect,
            crate::commands::cloud_complete_oauth,
            crate::commands::cloud_disconnect,
            crate::commands::cloud_list_accounts,
            crate::commands::cloud_list,
            crate::commands::cloud_upload,
            crate::commands::cloud_download,
            crate::commands::cloud_delete,
            crate::commands::cloud_create_folder,
            crate::commands::cloud_share,

            // Email & Contacts
            crate::commands::email_connect,
            crate::commands::email_list_accounts,
            crate::commands::email_remove_account,
            crate::commands::email_list_folders,
            crate::commands::email_fetch_inbox,
            crate::commands::email_mark_read,
            crate::commands::email_delete,
            crate::commands::email_download_attachment,
            crate::commands::email_send,
            crate::commands::contact_create,
            crate::commands::contact_get,
            crate::commands::contact_list,
            crate::commands::contact_search,
            crate::commands::contact_update,
            crate::commands::contact_delete,
            crate::commands::contact_import_vcard,
            crate::commands::contact_export_vcard,

            // Calendar
            crate::commands::calendar_connect,
            crate::commands::calendar_complete_oauth,
            crate::commands::calendar_disconnect,
            crate::commands::calendar_list_accounts,
            crate::commands::calendar_list_calendars,
            crate::commands::calendar_list_events,
            crate::commands::calendar_create_event,
            crate::commands::calendar_update_event,
            crate::commands::calendar_delete_event,
            crate::commands::calendar_get_system_timezone,

            // Productivity
            crate::commands::productivity_connect,
            crate::commands::productivity_list_tasks,
            crate::commands::productivity_create_task,
            crate::commands::productivity_notion_list_pages,
            crate::commands::productivity_notion_query_database,
            crate::commands::productivity_notion_create_database_row,
            crate::commands::productivity_trello_list_boards,
            crate::commands::productivity_trello_list_cards,
            crate::commands::productivity_trello_create_card,
            crate::commands::productivity_trello_move_card,
            crate::commands::productivity_trello_add_comment,
            crate::commands::productivity_asana_list_projects,
            crate::commands::productivity_asana_list_project_tasks,
            crate::commands::productivity_asana_create_task,
            crate::commands::productivity_asana_assign_task,
            crate::commands::productivity_asana_mark_complete,

            // Automation (The critical missing ones)
            crate::commands::automation_list_windows,
            crate::commands::automation_find_elements,
            crate::commands::automation_invoke,
            crate::commands::automation_set_value,
            crate::commands::automation_get_value,
            crate::commands::automation_toggle,
            crate::commands::automation_focus_window,
            crate::commands::automation_send_keys,
            crate::commands::automation_hotkey,
            crate::commands::automation_click,
            crate::commands::automation_clipboard_get,
            crate::commands::automation_clipboard_set,
            crate::commands::automation_record_start,
            crate::commands::automation_record_stop,
            crate::commands::automation_record_action_click,
            crate::commands::automation_record_action_type,
            crate::commands::automation_record_action_screenshot,
            crate::commands::automation_record_action_wait,
            crate::commands::automation_record_is_recording,
            crate::commands::automation_save_script,
            crate::commands::automation_load_script,
            crate::commands::automation_list_scripts,
            crate::commands::automation_delete_script,
            crate::commands::automation_execute_script,
            crate::commands::automation_record_get_session,
            crate::commands::automation_inspect_element_at_point,
            crate::commands::automation_inspect_element_by_id,
            crate::commands::automation_find_element_by_selector,
            crate::commands::automation_generate_selector,
            crate::commands::automation_get_element_tree,
            crate::commands::automation_save_recording_as_script,
            crate::commands::automation_generate_code,
            crate::commands::overlay_emit_click,
            crate::commands::overlay_emit_type,
            crate::commands::overlay_emit_region,
            crate::commands::overlay_replay_recent,
            // Added from lib.rs / requests
            crate::commands::automation_drag_drop,
            crate::commands::automation_ocr,
            crate::commands::automation_type, // Also in lib.rs
            crate::commands::automation_screenshot, // Also in lib.rs

            // Browser Automation
            crate::commands::browser_init,
            crate::commands::browser_launch,
            crate::commands::browser_open_tab,
            crate::commands::browser_close_tab,
            crate::commands::browser_list_tabs,
            crate::commands::browser_navigate,
            crate::commands::browser_go_back,
            crate::commands::browser_go_forward,
            crate::commands::browser_reload,
            crate::commands::browser_get_url,
            crate::commands::browser_get_title,
            crate::commands::browser_click,
            crate::commands::browser_type,
            crate::commands::browser_get_text,
            crate::commands::browser_get_attribute,
            crate::commands::browser_wait_for_selector,
            crate::commands::browser_select_option,
            crate::commands::browser_check,
            crate::commands::browser_uncheck,
            crate::commands::browser_screenshot,
            crate::commands::browser_evaluate,
            crate::commands::browser_hover,
            crate::commands::browser_focus,
            crate::commands::browser_query_all,
            crate::commands::browser_scroll_into_view,
            crate::commands::browser_execute_async_js,
            crate::commands::browser_get_element_state,
            crate::commands::browser_wait_for_interactive,
            crate::commands::browser_fill_form,
            crate::commands::browser_drag_and_drop,
            crate::commands::browser_upload_file,
            crate::commands::browser_get_cookies,
            crate::commands::browser_set_cookie,
            crate::commands::browser_clear_cookies,
            crate::commands::browser_get_performance_metrics,
            crate::commands::browser_wait_for_navigation,
            crate::commands::browser_get_frames,
            crate::commands::browser_execute_in_frame,
            crate::commands::browser_call_function,
            crate::commands::browser_enable_request_interception,
            crate::commands::browser_get_screenshot_stream,
            crate::commands::browser_highlight_element,
            crate::commands::browser_get_dom_snapshot,
            crate::commands::browser_get_console_logs,
            crate::commands::browser_get_network_activity,

            // Semantic Browser
            crate::commands::find_element_semantic,
            crate::commands::find_all_elements_semantic,
            crate::commands::click_semantic,
            crate::commands::type_semantic,
            crate::commands::get_accessibility_tree,
            crate::commands::test_selector_strategies,
            crate::commands::get_dom_semantic_graph,
            crate::commands::get_interactive_elements,
            crate::commands::find_by_role,

            // Git
            crate::commands::git_init,
            crate::commands::git_status,
            crate::commands::git_add,
            crate::commands::git_commit,
            crate::commands::git_push,
            crate::commands::git_pull,
            crate::commands::git_create_branch,
            crate::commands::git_checkout,
            crate::commands::git_checkout_new_branch,
            crate::commands::git_list_branches,
            crate::commands::git_delete_branch,
            crate::commands::git_merge,
            crate::commands::git_log,
            crate::commands::git_diff,
            crate::commands::git_clone,
            crate::commands::git_fetch,
            crate::commands::git_stash,
            crate::commands::git_stash_pop,
            crate::commands::git_reset,
            crate::commands::git_list_remotes,
            crate::commands::git_add_remote,

            // Design
            crate::commands::design_generate_css,
            crate::commands::design_apply_css,
            crate::commands::design_get_element_styles,
            crate::commands::design_generate_color_scheme,
            crate::commands::design_suggest_improvements,
            crate::commands::design_tokens_to_css,
            crate::commands::design_check_accessibility,

            // Media
            crate::commands::media_generate_image,
            crate::commands::media_generate_video,

            // Debug
            crate::commands::debug_parse_error,
            crate::commands::debug_suggest_fixes,
            crate::commands::debug_analyze_stack_trace,

            // Task Persistence
            crate::commands::task_create,
            crate::commands::task_get_status,
            crate::commands::task_update_progress,
            crate::commands::task_pause,
            crate::commands::task_resume,
            crate::commands::task_cancel,
            crate::commands::task_list,
            crate::commands::task_list_by_status,
            crate::commands::task_complete,
            crate::commands::task_save_context,
            crate::commands::task_get_resumable,
            crate::commands::coord_update_app_state,
            crate::commands::coord_request_approval,
            crate::commands::coord_get_pending_approvals,

            // Migration
            crate::commands::migration_test_lovable_connection,
            crate::commands::migration_list_lovable_workflows,
            crate::commands::migration_launch_lovable,

            // LLM
            crate::commands::llm_send_message,
            crate::commands::llm_configure_provider,
            crate::commands::llm_set_default_provider,
            crate::commands::llm_get_available_models,
            crate::commands::llm_check_provider_status,
            crate::commands::llm_get_usage_stats,
            crate::commands::router_suggestions,

            // Cache
            crate::commands::cache_get_stats,
            crate::commands::cache_clear_all,
            crate::commands::cache_clear_by_type,
            crate::commands::cache_clear_by_provider,
            crate::commands::cache_get_size,
            crate::commands::cache_configure,
            crate::commands::cache_warmup,
            crate::commands::cache_export,
            crate::commands::cache_get_analytics,
            crate::commands::cache_prune_expired,

            // Codebase Cache
            crate::commands::codebase_cache_get_stats,
            crate::commands::codebase_cache_clear_project,
            crate::commands::codebase_cache_clear_file,
            crate::commands::codebase_cache_clear_all,
            crate::commands::codebase_cache_clear_expired,
            crate::commands::codebase_cache_get_file_tree,
            crate::commands::codebase_cache_set_file_tree,
            crate::commands::codebase_cache_get_symbols,
            crate::commands::codebase_cache_set_symbols,
            crate::commands::codebase_cache_get_dependencies,
            crate::commands::codebase_cache_set_dependencies,
            crate::commands::codebase_cache_calculate_hash,

            // Embeddings
            crate::commands::generate_code_embeddings,
            crate::commands::semantic_search_codebase,
            crate::commands::get_embedding_stats,
            crate::commands::index_workspace,
            crate::commands::index_file,
            crate::commands::get_indexing_progress,
            crate::commands::on_file_changed,
            crate::commands::on_file_deleted,

            // Settings
            crate::commands::settings_save_api_key,
            crate::commands::settings_get_api_key,
            crate::commands::settings_load,
            crate::commands::settings_save,
            crate::commands::settings_v2_get,
            crate::commands::settings_v2_set,
            crate::commands::settings_v2_get_batch,
            crate::commands::settings_v2_delete,
            crate::commands::settings_v2_get_category,
            crate::commands::settings_v2_save_api_key,

            // Account
            crate::account::device_link_initiate,
            crate::account::device_link_poll,
            crate::account::fetch_user_profile,
            crate::account::oauth_refresh,

            // Teams
            crate::commands::create_team,
            crate::commands::get_team,
            crate::commands::update_team,
            crate::commands::delete_team,
            crate::commands::get_user_teams,
            crate::commands::invite_member,
            crate::commands::accept_invitation,
            crate::commands::remove_member,
            crate::commands::update_member_role,
            crate::commands::get_team_members,
            crate::commands::get_team_invitations,
            crate::commands::share_resource,
            crate::commands::unshare_resource,
            crate::commands::get_team_resources,
            crate::commands::get_team_resources_by_type,
            crate::commands::get_team_activity,
            crate::commands::get_user_team_activity,
            crate::commands::get_team_billing,
            crate::commands::initialize_team_billing,
            crate::commands::update_team_plan,
            crate::commands::add_team_seats,
            crate::commands::remove_team_seats,
            crate::commands::calculate_team_cost,
            crate::commands::update_team_usage,
            crate::commands::transfer_team_ownership,
            crate::commands::settings_v2_get_api_key,
            crate::commands::settings_v2_load_app_settings,
            crate::commands::settings_v2_save_app_settings,
            crate::commands::settings_v2_clear_cache,
            crate::commands::settings_v2_list_all,

            // Capture
            crate::commands::capture_screen_full,
            crate::commands::capture_screen_region,
            crate::commands::capture_get_windows,
            crate::commands::capture_get_history,
            crate::commands::capture_delete,
            crate::commands::capture_save_to_clipboard,
            // Add from lib.rs
            crate::commands::capture::capture_screen_window,
            crate::commands::capture::capture_from_clipboard,

            // OCR
            crate::commands::ocr_process_image,
            crate::commands::ocr_process_region,
            crate::commands::ocr_get_languages,
            crate::commands::ocr_get_result,
            crate::commands::ocr_process_with_boxes,
            crate::commands::ocr_detect_languages,
            crate::commands::ocr_process_multi_language,
            crate::commands::ocr_preprocess_image,

            // Vision
            crate::commands::vision_send_message,
            crate::commands::vision_analyze_screenshot,
            crate::commands::vision_extract_text,
            crate::commands::vision_compare_images,
            crate::commands::vision_locate_element,
            crate::commands::vision_describe_ui_elements,
            crate::commands::vision_answer_question,

            // File Ops
            crate::commands::file_read,
            crate::commands::file_write,
            crate::commands::file_delete,
            crate::commands::file_rename,
            crate::commands::file_copy,
            crate::commands::file_move,
            crate::commands::file_exists,
            crate::commands::file_metadata,
            crate::commands::undo_file_operation,
            crate::commands::execute_terminal_command,
            crate::commands::dir_create,
            crate::commands::dir_list,
            crate::commands::dir_delete,
            crate::commands::dir_traverse,
            crate::filesystem::fs_search_files,
            crate::filesystem::fs_search_folders,
            crate::commands::fs_read_file_content,
            crate::commands::fs_get_workspace_files,
            crate::commands::file_watch_start,
            crate::commands::file_watch_stop,
            crate::commands::file_watch_list,
            crate::commands::file_watch_stop_all,
            // Additions from lib.rs
            crate::commands::file_read_text,
            crate::commands::file_write_text,
            crate::commands::file_read_binary,
            crate::commands::file_write_binary,
            crate::commands::file_get_metadata,

            // Terminal
            crate::commands::terminal_detect_shells,
            crate::commands::terminal_create_session,
            crate::commands::terminal_send_input,
            crate::commands::terminal_resize,
            crate::commands::terminal_kill,
            crate::commands::terminal_list_sessions,
            crate::commands::terminal_get_history,
            crate::commands::terminal_ai_suggest_command,
            crate::commands::terminal_ai_explain_error,
            crate::commands::terminal_smart_commit,
            crate::commands::terminal_ai_suggest_improvements,

            // API
            crate::commands::api_request,
            crate::commands::api_get,
            crate::commands::api_post_json,
            crate::commands::api_put_json,
            crate::commands::api_delete,
            crate::commands::api_parse_response,
            crate::commands::api_extract_json_path,
            crate::commands::api_oauth_create_client,
            crate::commands::api_oauth_get_auth_url,
            crate::commands::api_oauth_exchange_code,
            crate::commands::api_oauth_refresh_token,
            crate::commands::api_oauth_client_credentials,
            crate::commands::api_render_template,
            crate::commands::api_extract_template_variables,
            crate::commands::api_validate_template,

            // Database
            crate::commands::db_create_pool,
            crate::commands::db_execute_query,
            crate::commands::db_execute_prepared,
            crate::commands::db_execute_batch,
            crate::commands::db_close_pool,
            crate::commands::db_list_pools,
            crate::commands::db_get_pool_stats,
            crate::commands::db_build_select,
            crate::commands::db_build_insert,
            crate::commands::db_build_update,
            crate::commands::db_build_delete,
            crate::commands::db_mongo_connect,
            crate::commands::db_mongo_find,
            crate::commands::db_mongo_find_one,
            crate::commands::db_mongo_insert_one,
            crate::commands::db_mongo_insert_many,
            crate::commands::db_mongo_update_many,
            crate::commands::db_mongo_delete_many,
            crate::commands::db_mongo_disconnect,
            crate::commands::db_redis_connect,
            crate::commands::db_redis_get,
            crate::commands::db_redis_set,
            crate::commands::db_redis_del,
            crate::commands::db_redis_exists,
            crate::commands::db_redis_expire,
            crate::commands::db_redis_hget,
            crate::commands::db_redis_hset,
            crate::commands::db_redis_hgetall,
            crate::commands::db_redis_disconnect,

            // Documents
            crate::commands::document_read,
            crate::commands::document_extract_text,
            crate::commands::document_get_metadata,
            crate::commands::document_search,
            crate::commands::document_detect_type,
            crate::commands::document_create_word,
            crate::commands::document_create_word_simple,
            crate::commands::document_create_excel,
            crate::commands::document_create_excel_simple,
            crate::commands::document_create_excel_numbers,
            crate::commands::document_create_pdf,
            crate::commands::document_create_pdf_simple,

            // MCP
            crate::commands::mcp_initialize,
            crate::commands::mcp_list_servers,
            crate::commands::mcp_connect_server,
            crate::commands::mcp_disconnect_server,
            crate::commands::mcp_list_tools,
            crate::commands::mcp_search_tools,
            crate::commands::mcp_call_tool,
            crate::commands::mcp_get_config,
            crate::commands::mcp_update_config,
            crate::commands::mcp_enable_server,
            crate::commands::mcp_disable_server,
            crate::commands::mcp_get_stats,
            crate::commands::mcp_get_server_logs,
            crate::commands::mcp_store_credential,
            crate::commands::mcp_get_tool_schemas,
            crate::commands::mcp_get_health,
            crate::commands::mcp_check_server_health,

            // GitHub (Detailed)
            crate::commands::github_clone_repo,
            crate::commands::github_get_repo_context,
            crate::commands::github_search_files,
            crate::commands::github_read_file,
            crate::commands::github_get_file_tree,
            crate::commands::github_list_repos,

            // Computer Use
            crate::commands::computer_use_start_session,
            crate::commands::computer_use_capture_screen,
            crate::commands::computer_use_click,
            crate::commands::computer_use_move_mouse,
            crate::commands::computer_use_type_text,
            crate::commands::computer_use_get_session,
            crate::commands::computer_use_list_sessions,
            crate::commands::computer_use_execute_tool,

            // Code Editing
            crate::commands::code_generate_edit,
            crate::commands::code_apply_edit,
            crate::commands::code_reject_edit,
            crate::commands::code_list_pending_edits,
            crate::commands::composer_start_session,
            crate::commands::composer_apply_session,
            crate::commands::composer_get_session,
            crate::commands::get_file_diff,
            crate::commands::apply_changes,
            crate::commands::revert_changes,

            // Voice
            crate::commands::voice_transcribe_file,
            crate::commands::voice_transcribe_blob,
            crate::commands::voice_configure,
            crate::commands::voice_get_settings,
            crate::commands::voice_start_recording,
            crate::commands::voice_stop_recording,

            // Shortcuts
            crate::commands::shortcuts_register,
            crate::commands::shortcuts_unregister,
            crate::commands::shortcuts_list,
            crate::commands::shortcuts_update,
            crate::commands::shortcuts_trigger,
            crate::commands::shortcuts_reset,
            crate::commands::shortcuts_check_key,
            crate::commands::shortcuts_get_defaults,

            // Workspace Indexing
            crate::commands::workspace_index,
            crate::commands::workspace_search_symbols,
            crate::commands::workspace_find_definition,
            crate::commands::workspace_find_references,
            crate::commands::workspace_get_dependencies,
            crate::commands::workspace_get_file_symbols,
            crate::commands::workspace_get_stats,

            // LSP
            crate::commands::lsp_start_server,
            crate::commands::lsp_stop_server,
            crate::commands::lsp_did_open,
            crate::commands::lsp_did_change,
            crate::commands::lsp_did_close,
            crate::commands::lsp_completion,
            crate::commands::lsp_hover,
            crate::commands::lsp_definition,
            crate::commands::lsp_references,
            crate::commands::lsp_rename,
            crate::commands::lsp_formatting,
            crate::commands::lsp_workspace_symbol,
            crate::commands::lsp_code_action,
            crate::commands::lsp_get_diagnostics,
            crate::commands::lsp_get_all_diagnostics,
            crate::commands::lsp_list_servers,
            crate::commands::lsp_detect_language,

            // Onboarding & Data
            crate::commands::get_onboarding_status,
            crate::commands::complete_onboarding_step,
            crate::commands::skip_onboarding_step,
            crate::commands::reset_onboarding,
            crate::commands::export_user_data,
            crate::commands::check_connectivity,
            crate::commands::get_session_info,
            crate::commands::update_session_activity,
            crate::commands::get_user_preference,
            crate::commands::set_user_preference,
            crate::commands::select_demo,
            crate::commands::record_demo_results,
            crate::commands::mark_setup_completed,
            crate::commands::complete_first_run,
            crate::commands::get_first_run_session,
            crate::commands::get_first_run_statistics,
            crate::commands::skip_first_run,
            crate::commands::start_first_run_experience,
            crate::commands::has_completed_first_run,
            crate::commands::update_first_run_step,
            // Billing (Stripe)
            crate::billing::billing_initialize,
            crate::billing::stripe_create_customer,
            crate::billing::stripe_get_customer_by_email,
            crate::billing::stripe_create_subscription,
            crate::billing::stripe_get_subscription,
            crate::billing::stripe_update_subscription,
            crate::billing::stripe_cancel_subscription,
            crate::billing::stripe_get_invoices,
            crate::billing::stripe_get_usage,
            crate::billing::stripe_track_usage,
            crate::billing::stripe_create_portal_session,
            crate::billing::stripe_get_active_subscription,
            crate::billing::stripe_process_webhook,
            crate::billing::stripe_get_payment_methods,
            crate::billing::stripe_create_setup_intent,
            crate::billing::stripe_attach_payment_method,
            crate::billing::stripe_set_default_payment_method,
            crate::billing::stripe_delete_payment_method,
            crate::billing::send_invoice_email,
            crate::commands::subscribe_to_plan,
            crate::commands::upgrade_plan,
            crate::commands::cancel_subscription,
            crate::commands::get_pricing_plans,
            crate::commands::get_current_plan,

            // Workflow Orchestration (Additional)
            crate::commands::create_workflow,
            crate::commands::update_workflow,
            crate::commands::delete_workflow,
            crate::commands::get_workflow,
            crate::commands::get_user_workflows,
            crate::commands::execute_workflow,
            crate::commands::pause_workflow,
            crate::commands::resume_workflow,
            crate::commands::cancel_workflow,
            crate::commands::get_workflow_status,
            crate::commands::get_execution_logs,
            crate::commands::schedule_workflow,
            crate::commands::trigger_workflow_on_event,
            crate::commands::get_next_execution_time,

            // Marketplace
            crate::commands::publish_workflow_to_marketplace,
            crate::commands::unpublish_workflow,
            crate::commands::get_featured_workflows,
            crate::commands::get_trending_workflows,
            crate::commands::search_marketplace_workflows,
            crate::commands::get_workflow_by_share_url,
            crate::commands::get_creator_workflows,
            crate::commands::get_my_published_workflows,
            crate::commands::get_workflows_by_category,
            crate::commands::get_category_counts,
            crate::commands::get_popular_tags,
            crate::commands::clone_marketplace_workflow,
            crate::commands::fork_marketplace_workflow,
            crate::commands::rate_workflow,
            crate::commands::get_user_workflow_rating,
            crate::commands::comment_on_workflow,
            crate::commands::get_workflow_comments,
            crate::commands::delete_workflow_comment,
            crate::commands::favorite_workflow,
            crate::commands::unfavorite_workflow,
            crate::commands::is_workflow_favorited,
            crate::commands::get_user_favorites,
            crate::commands::get_user_clones,
            crate::commands::share_workflow,
            crate::commands::get_workflow_stats,
            crate::commands::get_workflow_templates,
            crate::commands::get_workflow_templates_by_category,
            crate::commands::search_workflow_templates,

            // Teams
            crate::commands::create_team,
            crate::commands::get_team,
            crate::commands::update_team,
            crate::commands::delete_team,
            crate::commands::get_user_teams,
            crate::commands::invite_member,
            crate::commands::accept_invitation,
            crate::commands::remove_member,
            crate::commands::update_member_role,
            crate::commands::get_team_members,
            crate::commands::get_team_invitations,
            crate::commands::share_resource,
            crate::commands::unshare_resource,
            crate::commands::get_team_resources,
            crate::commands::get_team_resources_by_type,
            crate::commands::get_team_activity,
            crate::commands::get_user_team_activity,
            crate::commands::get_team_billing,
            crate::commands::initialize_team_billing,
            crate::commands::update_team_plan,
            crate::commands::add_team_seats,
            crate::commands::remove_team_seats,
            crate::commands::calculate_team_cost,
            crate::commands::update_team_usage,
            crate::commands::transfer_team_ownership,

            // Process Reasoning
            crate::commands::get_process_templates,
            crate::commands::get_outcome_tracking,
            crate::commands::get_process_success_rates,
            crate::commands::get_best_practices,
            crate::commands::get_process_statistics,

            // Templates
            crate::commands::get_all_templates,
            crate::commands::get_template_by_id,
            crate::commands::get_templates_by_category,
            crate::commands::install_template,
            crate::commands::get_installed_templates,
            crate::commands::search_templates,
            crate::commands::execute_template,
            crate::commands::uninstall_template,
            crate::commands::get_template_categories,

            // Analytics / Metrics
            crate::commands::analytics_track_event,
            crate::commands::analytics_flush_events,
            crate::commands::analytics_get_session_id,
            crate::commands::analytics_set_user_property,
            crate::commands::metrics_get_system,
            crate::commands::metrics_get_app,
            crate::commands::feature_flag_get,
            crate::commands::feature_flag_get_all,
            crate::commands::analytics_delete_all_data,
            crate::commands::metrics_increment_automations,
            crate::commands::metrics_increment_goals,
            crate::commands::metrics_set_mcp_servers,
            crate::commands::metrics_set_cache_hit_rate,
            crate::commands::analytics_calculate_roi,
            crate::commands::analytics_get_process_metrics,
            crate::commands::analytics_get_user_metrics,
            crate::commands::analytics_get_tool_metrics,
            crate::commands::analytics_get_metric_trends,
            crate::commands::analytics_export_report,
            crate::commands::analytics_generate_weekly_report,
            crate::commands::analytics_generate_monthly_report,
            crate::commands::analytics_get_top_processes,
            crate::commands::analytics_save_snapshot,
            // New commands to replace frontend mocks
            crate::commands::analytics_get_usage_stats,
            crate::commands::analytics_get_feature_usage,

            // Error Reporting
            crate::commands::error_report,
            crate::commands::error_report_batch,
            crate::commands::error_get_logs,
            crate::commands::error_clear_logs,
            crate::commands::error_get_stats,
            crate::commands::error_export_logs,

            // Realtime / Metrics
            crate::commands::get_realtime_stats,
            crate::commands::record_automation_metrics,
            crate::commands::get_metrics_history,
            crate::commands::compare_to_manual,
            crate::commands::compare_to_previous_period,
            crate::commands::compare_to_industry_benchmark,
            crate::commands::get_milestones,
            crate::commands::share_milestone,
            crate::commands::track_workflow_view,
            crate::commands::acknowledge_milestone,

            // Background Tasks (Additional)
            crate::commands::bg_submit_task,
            crate::commands::bg_cancel_task,
            crate::commands::bg_pause_task,
            crate::commands::bg_resume_task,
            crate::commands::bg_get_task_status,
            crate::commands::bg_list_tasks,
            crate::commands::bg_get_task_stats,

            // Hooks
            crate::commands::hooks_initialize,
            crate::commands::hooks_list,
            crate::commands::hooks_add,
            crate::commands::hooks_remove,
            crate::commands::hooks_toggle,
            crate::commands::hooks_update,
            crate::commands::hooks_get_config_path,
            crate::commands::hooks_create_example,
            crate::commands::hooks_export,
            crate::commands::hooks_import,
            crate::commands::hooks_reload,
            crate::commands::hooks_get_event_types,
            crate::commands::hooks_get_stats,

            // Prompt Enhancement
            crate::commands::detect_use_case,
            crate::commands::enhance_prompt,
            crate::commands::route_to_best_api,
            crate::commands::enhance_and_route_prompt,
            crate::commands::get_prompt_enhancement_config,
            crate::commands::set_prompt_enhancement_config,
            crate::commands::get_suggested_provider,
            crate::commands::get_available_use_cases,
            crate::commands::get_available_providers,

            // Agent / Security
            crate::commands::agent::agent_init,
            crate::commands::agent::agent_submit_task,
            crate::commands::agent::agent_get_task_status,
            crate::commands::agent::agent_list_tasks,
            crate::commands::agent::agent_stop,
            crate::commands::security::auth_login,

            // Governance & Audit
            crate::commands::governance::get_audit_events,
            crate::commands::governance::verify_audit_event,
            crate::commands::governance::verify_audit_integrity,
            crate::commands::governance::log_tool_execution,
            crate::commands::governance::log_workflow_execution,
            crate::commands::governance::create_approval_request,
            crate::commands::governance::get_pending_approvals,
            crate::commands::governance::get_approval_request,
            crate::commands::governance::approve_request,
            crate::commands::governance::reject_request,
            crate::commands::governance::requires_approval,
            crate::commands::governance::calculate_risk_level,
            crate::commands::governance::get_approval_statistics,
            crate::commands::governance::expire_timed_out_requests,

            // Tutorial
            crate::commands::tutorials::get_user_credits,

            // Messaging
            crate::commands::messaging::connect_slack,
            crate::commands::messaging::connect_whatsapp,
            crate::commands::messaging::connect_teams,
            crate::commands::messaging::get_messaging_history,
            crate::commands::messaging::disconnect_platform,
            crate::commands::messaging::list_messaging_connections,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

pub mod models;
