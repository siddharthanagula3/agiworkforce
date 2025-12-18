#![warn(warnings)] // Warn on warnings - allow for dev
#![allow(unsafe_code)] // Required for Windows API calls
#![allow(unused_qualifications)] // Some qualifications improve code clarity
#![allow(clippy::should_implement_trait)]
// Allow these as they require architectural refactoring beyond simple fixes
#![allow(clippy::too_many_arguments)] // Commands need all their params
#![allow(clippy::type_complexity)] // Complex types in websocket server
#![allow(clippy::await_holding_lock)] // Safe in our async context

use tauri::Manager;

// Core application modules
pub mod commands;
pub mod state;
pub mod tray;
pub mod window;

// Error handling and logging
pub mod logging;

// LLM Router and Cost Management
pub mod router;

// Prompt Enhancement and API Routing
pub mod prompt_enhancement;

// API Integrations (Perplexity, Veo3, Image Generation)
pub mod api_integrations;

// Automation modules
pub mod automation;

// Browser integration
pub mod browser;

// Database layer
pub mod db;

// Billing and subscriptions (Stripe integration)
pub mod billing;

// Account management and web backend integration (placeholders)
pub mod account;

// Settings storage
pub mod settings;

// Telemetry (logging, tracing, metrics)
pub mod telemetry;

// Overlay visualization
pub mod overlay;

// LLM Providers

// Security and guardrails
pub mod security;

// Modular Control Primitives (MCPs)
// pub mod mcps; // REMOVED duplicate

// Event system
pub mod events;

// Terminal/PTY
pub mod terminal;

// Filesystem operations and watching
pub mod filesystem;

// Codebase indexing and analysis
pub mod codebase;

// Vector embeddings for semantic search
pub mod embeddings;

// API client and OAuth
pub mod api;

// Database clients (SQL and NoSQL)
pub mod database;

// Communications (Email/IMAP/SMTP)

// Messaging platform integrations (Slack, WhatsApp, Teams)
pub mod communications;
pub mod messaging;

// Calendar integration (Google Calendar, Outlook)
pub mod calendar;

// Cloud storage integrations (Drive, Dropbox, OneDrive)
pub mod cloud;

// Productivity tools (Notion, Trello, Asana)
pub mod productivity;

// Document MCP (M16) - Word, Excel, PDF support
pub mod document;

// Windows Speech Recognition integration
pub mod speech;

// Windows Clipboard Monitoring
pub mod clipboard;

// Cloud Sync System
pub mod sync;

// Full-Text Search (FTS5)
pub mod search;

// Projects System with RAG
pub mod projects;

// Advanced Tool Permission System
pub mod permissions;

// AGI (Artificial General Intelligence) System
pub mod agi;

// Background Task Management System
pub mod tasks;

// AI Employee Library - Pre-built AI employees for instant value
pub mod ai_employees;

// Analytics and ROI tracking system
pub mod analytics;

// Workflow Orchestration System
pub mod orchestration;

// Onboarding and first-run experience
pub mod onboarding;

// Public Workflow Marketplace - Viral sharing system
pub mod workflows;

// Model Context Protocol (MCP) integration
pub mod mcp;

// Cache system for LLM responses and tool results
pub mod cache;

// Hook system for event-driven automation
pub mod hooks;

// Team collaboration system
pub mod teams;

// Real-time collaboration and WebSocket communication
pub mod realtime;

// Real-time ROI metrics and dashboard
pub mod metrics;

// Autonomous agent system (planner/executor/approval runtime)
pub mod agent;

// Re-exports for convenience
pub use state::{AppState, DockPosition, PersistentWindowState, WindowGeometry};
pub use tray::build_system_tray;
pub use window::{
    apply_dock, hide_window, initialize_window, set_always_on_top, set_pinned, show_window, undock,
    DockPreviewEvent, DockState,
};

// Error types
pub mod error;
pub use error::{Error, Result};

// Utilities
pub mod utils;

// Test utilities (only compiled in test builds)
#[cfg(test)]
pub mod test_utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Initialize database in proper app data directory (Bug #31 fix)
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");

            // Ensure directory exists
            if let Some(parent) = app_data_dir.parent() {
                std::fs::create_dir_all(parent).ok();
            }
            std::fs::create_dir_all(&app_data_dir).ok();

            let db_path = app_data_dir.join("agi.db");
            let db = crate::db::Database::new(db_path.to_str().expect("Invalid db path"))
                .expect("Failed to init DB");

            app.manage(commands::chat::AppDatabase {
                conn: db.get_connection(),
            });

            app.manage(crate::billing::BillingStateWrapper::default());
            app.manage(commands::llm::LLMState::default());
            app.manage(commands::settings::SettingsState::default());

            Ok(())
        })
        // Register All Commands
        .invoke_handler(tauri::generate_handler![
            // Chat Commands (15)
            commands::chat::chat_send_message,
            commands::chat::chat_get_conversations,
            commands::chat::chat_stop_generation,
            commands::chat::chat_create_conversation,
            commands::chat::chat_get_conversation,
            commands::chat::chat_update_conversation,
            commands::chat::chat_delete_conversation,
            commands::chat::chat_create_message,
            commands::chat::chat_get_messages,
            commands::chat::chat_update_message,
            commands::chat::chat_delete_message,
            commands::chat::chat_get_conversation_stats,
            commands::chat::chat_get_cost_overview,
            commands::chat::chat_get_cost_analytics,
            commands::chat::chat_set_monthly_budget,
            // File Operations Commands (20)
            commands::file_ops::file_read,
            commands::file_ops::file_write,
            commands::file_ops::file_delete,
            commands::file_ops::file_rename,
            commands::file_ops::file_copy,
            commands::file_ops::file_move,
            commands::file_ops::file_exists,
            commands::file_ops::file_metadata,
            commands::file_ops::dir_create,
            commands::file_ops::dir_list,
            commands::file_ops::dir_delete,
            commands::file_ops::dir_traverse,
            commands::file_ops::fs_read_file_content,
            commands::file_ops::fs_get_workspace_files,
            commands::file_ops::file_read_text,
            commands::file_ops::file_write_text,
            commands::file_ops::file_read_binary,
            commands::file_ops::file_write_binary,
            commands::file_ops::file_get_metadata,
            commands::file_ops::undo_file_operation,
            // Security Commands
            commands::security::auth_login,
            // MCP Commands
            commands::mcp::mcp_list_servers,
            // Tutorial Commands
            commands::tutorials::get_user_credits,
            // Terminal Commands (12)
            commands::terminal::execute_terminal_command,
            commands::terminal::terminal_detect_shells,
            commands::terminal::terminal_create_session,
            commands::terminal::terminal_send_input,
            commands::terminal::terminal_resize,
            commands::terminal::terminal_kill,
            commands::terminal::terminal_list_sessions,
            commands::terminal::terminal_get_history,
            commands::terminal::terminal_ai_suggest_command,
            commands::terminal::terminal_ai_explain_error,
            commands::terminal::terminal_smart_commit,
            commands::terminal::terminal_ai_suggest_improvements,
            // Settings Commands (4)
            commands::settings::settings_save_api_key,
            commands::settings::settings_get_api_key,
            commands::settings::settings_load,
            commands::settings::settings_save,
            // Agent Commands (8)
            commands::agent::agent_init,
            commands::agent::agent_submit_task,
            commands::agent::agent_get_task_status,
            commands::agent::agent_list_tasks,
            commands::agent::agent_stop,
            commands::agent::agent_resolve_approval,
            commands::agent::agent_set_workflow_hash,
            commands::agent::agent_list_trusted_workflows,
            // Automation Commands (5) - automation_ocr excluded due to conditional compilation
            commands::automation::automation_send_keys,
            commands::automation::automation_type,
            commands::automation::automation_drag_drop,
            commands::automation::automation_screenshot,
            commands::automation::overlay_replay_recent,
            // Browser Commands (Core 30)
            commands::browser::browser_init,
            commands::browser::browser_launch,
            commands::browser::browser_open_tab,
            commands::browser::browser_close_tab,
            commands::browser::browser_list_tabs,
            commands::browser::browser_navigate,
            commands::browser::browser_go_back,
            commands::browser::browser_go_forward,
            commands::browser::browser_reload,
            commands::browser::browser_get_url,
            commands::browser::browser_get_title,
            commands::browser::browser_click,
            commands::browser::browser_type,
            commands::browser::browser_get_text,
            commands::browser::browser_get_attribute,
            commands::browser::browser_wait_for_selector,
            commands::browser::browser_select_option,
            commands::browser::browser_check,
            commands::browser::browser_uncheck,
            commands::browser::browser_screenshot,
            commands::browser::browser_evaluate,
            commands::browser::browser_hover,
            commands::browser::browser_focus,
            commands::browser::browser_query_all,
            commands::browser::browser_scroll_into_view,
            commands::browser::browser_execute_async_js,
            commands::browser::browser_get_element_state,
            commands::browser::browser_wait_for_interactive,
            commands::browser::browser_fill_form,
            commands::browser::browser_drag_and_drop,
            commands::browser::browser_upload_file,
            commands::browser::browser_get_cookies,
            commands::browser::browser_set_cookie,
            commands::browser::browser_clear_cookies,
            // Capture Commands (8)
            commands::capture::capture_screen_full,
            commands::capture::capture_screen_region,
            commands::capture::capture_get_windows,
            commands::capture::capture_get_history,
            commands::capture::capture_delete,
            commands::capture::capture_save_to_clipboard,
            commands::capture::capture_screen_window,
            commands::capture::capture_from_clipboard,
            // Git Commands (22)
            commands::git::git_init,
            commands::git::git_status,
            commands::git::git_add,
            commands::git::git_commit,
            commands::git::git_push,
            commands::git::git_pull,
            commands::git::git_create_branch,
            commands::git::git_checkout,
            commands::git::git_checkout_new_branch,
            commands::git::git_list_branches,
            commands::git::git_delete_branch,
            commands::git::git_merge,
            commands::git::git_log,
            commands::git::git_diff,
            commands::git::git_clone,
            commands::git::git_fetch,
            commands::git::git_stash,
            commands::git::git_stash_pop,
            commands::git::git_reset,
            commands::git::git_list_remotes,
            commands::git::git_add_remote,
            // LLM Commands (7)
            commands::llm::llm_send_message,
            commands::llm::llm_configure_provider,
            commands::llm::llm_set_default_provider,
            commands::llm::llm_get_available_models,
            commands::llm::llm_check_provider_status,
            commands::llm::llm_get_usage_stats,
            commands::llm::router_suggestions,
            // Checkpoint Commands (4)
            commands::checkpoints::checkpoint_create,
            commands::checkpoints::checkpoint_restore,
            commands::checkpoints::checkpoint_list,
            commands::checkpoints::checkpoint_delete,
            // Code Editing Commands (10)
            commands::code_editing::code_generate_edit,
            commands::code_editing::code_apply_edit,
            commands::code_editing::code_reject_edit,
            commands::code_editing::composer_start_session,
            commands::code_editing::composer_apply_session,
            commands::code_editing::composer_get_session,
            commands::code_editing::code_list_pending_edits,
            commands::code_editing::get_file_diff,
            commands::code_editing::apply_changes,
            commands::code_editing::revert_changes,
            // Document Commands (12)
            commands::document::document_read,
            commands::document::document_extract_text,
            commands::document::document_get_metadata,
            commands::document::document_search,
            commands::document::document_detect_type,
            commands::document::document_create_word,
            commands::document::document_create_word_simple,
            commands::document::document_create_excel,
            commands::document::document_create_excel_simple,
            commands::document::document_create_excel_numbers,
            commands::document::document_create_pdf,
            commands::document::document_create_pdf_simple,
            // Workspace Commands (7)
            commands::workspace::workspace_index,
            commands::workspace::workspace_search_symbols,
            commands::workspace::workspace_find_definition,
            commands::workspace::workspace_find_references,
            commands::workspace::workspace_get_dependencies,
            commands::workspace::workspace_get_file_symbols,
            commands::workspace::workspace_get_stats,
            // Analytics Commands (26)
            commands::analytics::analytics_track_event,
            commands::analytics::analytics_flush_events,
            commands::analytics::analytics_get_session_id,
            commands::analytics::analytics_set_user_property,
            commands::analytics::metrics_get_system,
            commands::analytics::metrics_get_app,
            commands::analytics::feature_flag_get,
            commands::analytics::feature_flag_get_all,
            commands::analytics::analytics_delete_all_data,
            commands::analytics::metrics_increment_automations,
            commands::analytics::metrics_increment_goals,
            commands::analytics::metrics_set_mcp_servers,
            commands::analytics::metrics_set_cache_hit_rate,
            commands::analytics::analytics_calculate_roi,
            commands::analytics::analytics_get_process_metrics,
            commands::analytics::analytics_get_user_metrics,
            commands::analytics::analytics_get_tool_metrics,
            commands::analytics::analytics_get_metric_trends,
            commands::analytics::analytics_export_report,
            commands::analytics::analytics_generate_weekly_report,
            commands::analytics::analytics_generate_monthly_report,
            commands::analytics::analytics_get_top_processes,
            commands::analytics::analytics_save_snapshot,
            commands::analytics::track_workflow_view,
            commands::analytics::acknowledge_milestone,
            // Calendar Commands (10)
            commands::calendar::calendar_connect,
            commands::calendar::calendar_complete_oauth,
            commands::calendar::calendar_disconnect,
            commands::calendar::calendar_list_calendars,
            commands::calendar::calendar_list_events,
            commands::calendar::calendar_create_event,
            commands::calendar::calendar_update_event,
            commands::calendar::calendar_delete_event,
            commands::calendar::calendar_list_accounts,
            commands::calendar::calendar_get_system_timezone,
            // Cloud Storage Commands (10)
            commands::cloud::cloud_connect,
            commands::cloud::cloud_complete_oauth,
            commands::cloud::cloud_disconnect,
            commands::cloud::cloud_list_accounts,
            commands::cloud::cloud_list,
            commands::cloud::cloud_upload,
            commands::cloud::cloud_download,
            commands::cloud::cloud_delete,
            commands::cloud::cloud_create_folder,
            commands::cloud::cloud_share,
            // Email Commands (18)
            commands::email::email_connect,
            commands::email::email_list_accounts,
            commands::email::email_remove_account,
            commands::email::email_list_folders,
            commands::email::email_fetch_inbox,
            commands::email::email_mark_read,
            commands::email::email_delete,
            commands::email::email_download_attachment,
            commands::email::email_send,
            commands::email::contact_create,
            commands::email::contact_get,
            commands::email::contact_list,
            commands::email::contact_search,
            commands::email::contact_update,
            commands::email::contact_delete,
            commands::email::contact_import_vcard,
            commands::email::contact_export_vcard,
            // Messaging Platform Commands (6) - send_message excluded due to Send trait bounds
            commands::messaging::connect_slack,
            commands::messaging::connect_whatsapp,
            commands::messaging::connect_teams,
            commands::messaging::get_messaging_history,
            commands::messaging::disconnect_platform,
            commands::messaging::list_messaging_connections,
            // Media Generation Commands (New)
            commands::media::media_generate_image,
            commands::media::media_generate_video,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

pub mod models; // Exposed models directory
