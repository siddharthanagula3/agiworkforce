#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![deny(warnings)] // Deny ALL warnings - zero tolerance
#![allow(unsafe_code)] // Required for Windows API calls
#![allow(unused_qualifications)] // Some qualifications improve code clarity

use agiworkforce_desktop::agent::code_generator::CodeGenerator;
use agiworkforce_desktop::agent::context_manager::ContextManager;
use agiworkforce_desktop::agent::runtime::AgentRuntime;
use agiworkforce_desktop::{
    build_system_tray,
    commands::{
        load_persisted_calendar_accounts, AgentRuntimeState, ApiState, AppDatabase,
        BrowserStateWrapper, CalendarState, CloudState, CodeEditingState, CodeGeneratorState,
        ComputerUseState, ContextManagerState, DatabaseState, DocumentState, FileWatcherState,
        GitHubState, LLMState, LSPState, McpState, ProductivityState, SettingsServiceState,
        SettingsState, ShortcutsState, VoiceState, WorkspaceIndexState,
    },
    db::migrations,
    initialize_window,
    settings::SettingsService,
    state::AppState,
    telemetry,
};
use rusqlite::Connection;
use std::sync::{Arc, Mutex};
use tauri::Manager;
use tokio::sync::Mutex as TokioMutex;

fn main() {
    // Initialize telemetry (logging, tracing, metrics)
    let _telemetry_guard = telemetry::init().expect("Failed to initialize telemetry");

    tauri::Builder::default()
        .setup(|app| {
            // Initialize database
            let db_path = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir")
                .join("agiworkforce.db");

            // Ensure parent directory exists
            if let Some(parent) = db_path.parent() {
                std::fs::create_dir_all(parent).expect("Failed to create data directory");
            }

            // Open database connection
            let conn = Connection::open(&db_path).expect("Failed to open database");

            // Run migrations
            migrations::run_migrations(&conn).expect("Failed to run migrations");

            tracing::info!("Database initialized at {:?}", db_path);

            // Manage database state
            app.manage(AppDatabase(Mutex::new(conn)));

            // Initialize LLM router state
            app.manage(LLMState::new());

            // Initialize browser automation state
            app.manage(BrowserStateWrapper::new());

            // Initialize settings state (legacy)
            app.manage(SettingsState::new());

            // Initialize new settings service with database connection
            let settings_conn =
                Connection::open(&db_path).expect("Failed to open settings database");
            let settings_service = SettingsService::new(Arc::new(Mutex::new(settings_conn)))
                .expect("Failed to initialize settings service");
            app.manage(SettingsServiceState::new(settings_service));

            tracing::info!("Settings service initialized");

            // Initialize file watcher state
            app.manage(FileWatcherState::new());

            tracing::info!("File watcher initialized");

            // Initialize API state
            app.manage(ApiState::new());

            tracing::info!("API state initialized");

            // Initialize database state
            app.manage(tokio::sync::Mutex::new(DatabaseState::new()));

            tracing::info!("Database state initialized");

            // Initialize cloud storage state
            app.manage(CloudState::new());

            tracing::info!("Cloud storage state initialized");

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
            let session_manager =
                agiworkforce_desktop::terminal::SessionManager::new(app.handle().clone());
            app.manage(session_manager);

            tracing::info!("Terminal session manager initialized");

            // Initialize productivity state
            app.manage(ProductivityState::new());

            tracing::info!("Productivity state initialized");

            // Initialize document state
            app.manage(DocumentState::new());

            tracing::info!("Document state initialized");

            // Initialize automation service
            let automation_service = agiworkforce_desktop::automation::AutomationService::new()
                .expect("Failed to initialize automation service");
            app.manage(std::sync::Arc::new(automation_service));

            tracing::info!("Automation service initialized");

            // Initialize MCP state
            let mcp_state = McpState::new();
            let mcp_client = mcp_state.client.clone();
            let mcp_registry = mcp_state.registry.clone();
            app.manage(mcp_state);

            tracing::info!("MCP state initialized");

            // Initialize AgentRuntime
            let agent_runtime = AgentRuntime::new(
                mcp_client.clone(),
                mcp_registry.clone(),
                app.handle().clone(),
            );
            app.manage(AgentRuntimeState(Arc::new(TokioMutex::new(agent_runtime))));

            tracing::info!("AgentRuntime initialized");

            // Initialize ContextManager for AI-native development
            let project_root =
                std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
            let context_manager = ContextManager::new(project_root);
            app.manage(ContextManagerState(Arc::new(TokioMutex::new(
                context_manager,
            ))));

            tracing::info!("ContextManager initialized");

            // Initialize CodeGenerator
            let context_manager_for_gen = ContextManager::new(
                std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from(".")),
            );
            let code_generator = CodeGenerator::new(context_manager_for_gen);
            app.manage(CodeGeneratorState(Arc::new(TokioMutex::new(
                code_generator,
            ))));

            tracing::info!("CodeGenerator initialized");

            // Initialize GitHub integration state
            let workspace_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir")
                .join("github_repos");
            std::fs::create_dir_all(&workspace_dir).ok();
            app.manage(Arc::new(TokioMutex::new(GitHubState::new(workspace_dir))));

            tracing::info!("GitHub state initialized");

            // Initialize Computer Use state
            app.manage(Arc::new(TokioMutex::new(ComputerUseState::new())));

            tracing::info!("Computer Use state initialized");

            // Initialize Code Editing state
            app.manage(Arc::new(TokioMutex::new(CodeEditingState::new())));

            tracing::info!("Code Editing state initialized");

            // Initialize Voice Input state
            app.manage(Arc::new(TokioMutex::new(VoiceState::new())));

            tracing::info!("Voice state initialized");

            // Initialize Shortcuts state with defaults
            app.manage(Arc::new(TokioMutex::new(ShortcutsState::with_defaults())));

            tracing::info!("Shortcuts state initialized");

            // Initialize Workspace Indexing state
            app.manage(Arc::new(TokioMutex::new(WorkspaceIndexState::new())));

            tracing::info!("Workspace indexing state initialized");

            // Initialize LSP state
            app.manage(Arc::new(LSPState::new()));

            tracing::info!("LSP state initialized");

            // Initialize window state
            let state = AppState::load(app.handle())?;
            app.manage(state);

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
            // AGI commands
            agiworkforce_desktop::commands::agi_init,
            agiworkforce_desktop::commands::agi_submit_goal,
            agiworkforce_desktop::commands::agi_submit_goal_parallel,
            agiworkforce_desktop::commands::agi_get_goal_status,
            agiworkforce_desktop::commands::agi_list_goals,
            agiworkforce_desktop::commands::agi_stop,
            // Agent commands
            agiworkforce_desktop::commands::agent_init,
            agiworkforce_desktop::commands::agent_submit_task,
            agiworkforce_desktop::commands::agent_get_task_status,
            agiworkforce_desktop::commands::agent_list_tasks,
            agiworkforce_desktop::commands::agent_stop,
            // AgentRuntime commands
            agiworkforce_desktop::commands::runtime_queue_task,
            agiworkforce_desktop::commands::runtime_get_next_task,
            agiworkforce_desktop::commands::runtime_execute_task,
            agiworkforce_desktop::commands::runtime_cancel_task,
            agiworkforce_desktop::commands::runtime_get_task_status,
            agiworkforce_desktop::commands::runtime_get_all_tasks,
            agiworkforce_desktop::commands::runtime_set_auto_approve,
            agiworkforce_desktop::commands::runtime_is_auto_approve_enabled,
            agiworkforce_desktop::commands::runtime_revert_task,
            agiworkforce_desktop::commands::runtime_get_task_changes,
            agiworkforce_desktop::commands::runtime_get_all_changes,
            // AI-native software engineering commands
            agiworkforce_desktop::commands::ai_analyze_project,
            agiworkforce_desktop::commands::ai_add_constraint,
            agiworkforce_desktop::commands::ai_generate_code,
            agiworkforce_desktop::commands::ai_refactor_code,
            agiworkforce_desktop::commands::ai_generate_tests,
            agiworkforce_desktop::commands::ai_get_project_context,
            agiworkforce_desktop::commands::ai_generate_context_prompt,
            agiworkforce_desktop::commands::ai_access_file,
            // Window commands
            agiworkforce_desktop::commands::window_get_state,
            agiworkforce_desktop::commands::window_set_pinned,
            agiworkforce_desktop::commands::window_set_always_on_top,
            agiworkforce_desktop::commands::window_set_visibility,
            agiworkforce_desktop::commands::window_dock,
            agiworkforce_desktop::commands::window_is_maximized,
            agiworkforce_desktop::commands::window_maximize,
            agiworkforce_desktop::commands::window_unmaximize,
            agiworkforce_desktop::commands::window_toggle_maximize,
            agiworkforce_desktop::commands::window_set_fullscreen,
            agiworkforce_desktop::commands::window_is_fullscreen,
            agiworkforce_desktop::commands::tray_set_unread_badge,
            // Chat commands
            agiworkforce_desktop::commands::chat_create_conversation,
            agiworkforce_desktop::commands::chat_get_conversations,
            agiworkforce_desktop::commands::chat_get_conversation,
            agiworkforce_desktop::commands::chat_update_conversation,
            agiworkforce_desktop::commands::chat_delete_conversation,
            agiworkforce_desktop::commands::chat_create_message,
            agiworkforce_desktop::commands::chat_get_messages,
            agiworkforce_desktop::commands::chat_update_message,
            agiworkforce_desktop::commands::chat_delete_message,
            agiworkforce_desktop::commands::chat_send_message,
            agiworkforce_desktop::commands::chat_get_conversation_stats,
            agiworkforce_desktop::commands::chat_get_cost_overview,
            agiworkforce_desktop::commands::chat_get_cost_analytics,
            agiworkforce_desktop::commands::chat_set_monthly_budget,
            // Checkpoint commands
            agiworkforce_desktop::commands::checkpoint_create,
            agiworkforce_desktop::commands::checkpoint_restore,
            agiworkforce_desktop::commands::checkpoint_list,
            agiworkforce_desktop::commands::checkpoint_delete,
            // Cloud storage commands
            agiworkforce_desktop::commands::cloud_connect,
            agiworkforce_desktop::commands::cloud_complete_oauth,
            agiworkforce_desktop::commands::cloud_disconnect,
            agiworkforce_desktop::commands::cloud_list_accounts,
            agiworkforce_desktop::commands::cloud_list,
            agiworkforce_desktop::commands::cloud_upload,
            agiworkforce_desktop::commands::cloud_download,
            agiworkforce_desktop::commands::cloud_delete,
            agiworkforce_desktop::commands::cloud_create_folder,
            agiworkforce_desktop::commands::cloud_share,
            // Email commands
            agiworkforce_desktop::commands::email_connect,
            agiworkforce_desktop::commands::email_list_accounts,
            agiworkforce_desktop::commands::email_remove_account,
            agiworkforce_desktop::commands::email_list_folders,
            agiworkforce_desktop::commands::email_fetch_inbox,
            agiworkforce_desktop::commands::email_mark_read,
            agiworkforce_desktop::commands::email_delete,
            agiworkforce_desktop::commands::email_download_attachment,
            agiworkforce_desktop::commands::email_send,
            // Contact commands
            agiworkforce_desktop::commands::contact_create,
            agiworkforce_desktop::commands::contact_get,
            agiworkforce_desktop::commands::contact_list,
            agiworkforce_desktop::commands::contact_search,
            agiworkforce_desktop::commands::contact_update,
            agiworkforce_desktop::commands::contact_delete,
            agiworkforce_desktop::commands::contact_import_vcard,
            agiworkforce_desktop::commands::contact_export_vcard,
            // Calendar commands
            agiworkforce_desktop::commands::calendar_connect,
            agiworkforce_desktop::commands::calendar_complete_oauth,
            agiworkforce_desktop::commands::calendar_disconnect,
            agiworkforce_desktop::commands::calendar_list_accounts,
            agiworkforce_desktop::commands::calendar_list_calendars,
            agiworkforce_desktop::commands::calendar_list_events,
            agiworkforce_desktop::commands::calendar_create_event,
            agiworkforce_desktop::commands::calendar_update_event,
            agiworkforce_desktop::commands::calendar_delete_event,
            agiworkforce_desktop::commands::calendar_get_system_timezone,
            // Productivity commands
            agiworkforce_desktop::commands::productivity_connect,
            agiworkforce_desktop::commands::productivity_list_tasks,
            agiworkforce_desktop::commands::productivity_create_task,
            agiworkforce_desktop::commands::productivity_notion_list_pages,
            agiworkforce_desktop::commands::productivity_notion_query_database,
            agiworkforce_desktop::commands::productivity_notion_create_database_row,
            agiworkforce_desktop::commands::productivity_trello_list_boards,
            agiworkforce_desktop::commands::productivity_trello_list_cards,
            agiworkforce_desktop::commands::productivity_trello_create_card,
            agiworkforce_desktop::commands::productivity_trello_move_card,
            agiworkforce_desktop::commands::productivity_trello_add_comment,
            agiworkforce_desktop::commands::productivity_asana_list_projects,
            agiworkforce_desktop::commands::productivity_asana_list_project_tasks,
            agiworkforce_desktop::commands::productivity_asana_create_task,
            agiworkforce_desktop::commands::productivity_asana_assign_task,
            agiworkforce_desktop::commands::productivity_asana_mark_complete,
            // Automation commands
            agiworkforce_desktop::commands::automation_list_windows,
            agiworkforce_desktop::commands::automation_find_elements,
            agiworkforce_desktop::commands::automation_invoke,
            agiworkforce_desktop::commands::automation_set_value,
            agiworkforce_desktop::commands::automation_get_value,
            agiworkforce_desktop::commands::automation_toggle,
            agiworkforce_desktop::commands::automation_focus_window,
            agiworkforce_desktop::commands::automation_send_keys,
            agiworkforce_desktop::commands::automation_hotkey,
            agiworkforce_desktop::commands::automation_click,
            agiworkforce_desktop::commands::automation_clipboard_get,
            agiworkforce_desktop::commands::automation_clipboard_set,
            // Browser automation commands
            agiworkforce_desktop::commands::browser_init,
            agiworkforce_desktop::commands::browser_launch,
            agiworkforce_desktop::commands::browser_open_tab,
            agiworkforce_desktop::commands::browser_close_tab,
            agiworkforce_desktop::commands::browser_list_tabs,
            agiworkforce_desktop::commands::browser_navigate,
            agiworkforce_desktop::commands::browser_go_back,
            agiworkforce_desktop::commands::browser_go_forward,
            agiworkforce_desktop::commands::browser_reload,
            agiworkforce_desktop::commands::browser_get_url,
            agiworkforce_desktop::commands::browser_get_title,
            agiworkforce_desktop::commands::browser_click,
            agiworkforce_desktop::commands::browser_type,
            agiworkforce_desktop::commands::browser_get_text,
            agiworkforce_desktop::commands::browser_get_attribute,
            agiworkforce_desktop::commands::browser_wait_for_selector,
            agiworkforce_desktop::commands::browser_select_option,
            agiworkforce_desktop::commands::browser_check,
            agiworkforce_desktop::commands::browser_uncheck,
            agiworkforce_desktop::commands::browser_screenshot,
            agiworkforce_desktop::commands::browser_evaluate,
            agiworkforce_desktop::commands::browser_hover,
            agiworkforce_desktop::commands::browser_focus,
            agiworkforce_desktop::commands::browser_query_all,
            agiworkforce_desktop::commands::browser_scroll_into_view,
            // Advanced browser automation commands
            agiworkforce_desktop::commands::browser_execute_async_js,
            agiworkforce_desktop::commands::browser_get_element_state,
            agiworkforce_desktop::commands::browser_wait_for_interactive,
            agiworkforce_desktop::commands::browser_fill_form,
            agiworkforce_desktop::commands::browser_drag_and_drop,
            agiworkforce_desktop::commands::browser_upload_file,
            agiworkforce_desktop::commands::browser_get_cookies,
            agiworkforce_desktop::commands::browser_set_cookie,
            agiworkforce_desktop::commands::browser_clear_cookies,
            agiworkforce_desktop::commands::browser_get_performance_metrics,
            agiworkforce_desktop::commands::browser_wait_for_navigation,
            agiworkforce_desktop::commands::browser_get_frames,
            agiworkforce_desktop::commands::browser_execute_in_frame,
            agiworkforce_desktop::commands::browser_call_function,
            agiworkforce_desktop::commands::browser_enable_request_interception,
            // Git commands
            agiworkforce_desktop::commands::git_init,
            agiworkforce_desktop::commands::git_status,
            agiworkforce_desktop::commands::git_add,
            agiworkforce_desktop::commands::git_commit,
            agiworkforce_desktop::commands::git_push,
            agiworkforce_desktop::commands::git_pull,
            agiworkforce_desktop::commands::git_create_branch,
            agiworkforce_desktop::commands::git_checkout,
            agiworkforce_desktop::commands::git_checkout_new_branch,
            agiworkforce_desktop::commands::git_list_branches,
            agiworkforce_desktop::commands::git_delete_branch,
            agiworkforce_desktop::commands::git_merge,
            agiworkforce_desktop::commands::git_log,
            agiworkforce_desktop::commands::git_diff,
            agiworkforce_desktop::commands::git_clone,
            agiworkforce_desktop::commands::git_fetch,
            agiworkforce_desktop::commands::git_stash,
            agiworkforce_desktop::commands::git_stash_pop,
            agiworkforce_desktop::commands::git_reset,
            agiworkforce_desktop::commands::git_list_remotes,
            agiworkforce_desktop::commands::git_add_remote,
            // Design/CSS generation commands
            agiworkforce_desktop::commands::design_generate_css,
            agiworkforce_desktop::commands::design_apply_css,
            agiworkforce_desktop::commands::design_get_element_styles,
            agiworkforce_desktop::commands::design_generate_color_scheme,
            agiworkforce_desktop::commands::design_suggest_improvements,
            agiworkforce_desktop::commands::design_tokens_to_css,
            agiworkforce_desktop::commands::design_check_accessibility,
            // Debugging commands
            agiworkforce_desktop::commands::debug_parse_error,
            agiworkforce_desktop::commands::debug_suggest_fixes,
            agiworkforce_desktop::commands::debug_analyze_stack_trace,
            // Task persistence and coordination commands
            agiworkforce_desktop::commands::task_create,
            agiworkforce_desktop::commands::task_get_status,
            agiworkforce_desktop::commands::task_update_progress,
            agiworkforce_desktop::commands::task_pause,
            agiworkforce_desktop::commands::task_resume,
            agiworkforce_desktop::commands::task_cancel,
            agiworkforce_desktop::commands::task_list,
            agiworkforce_desktop::commands::task_list_by_status,
            agiworkforce_desktop::commands::task_complete,
            agiworkforce_desktop::commands::task_save_context,
            agiworkforce_desktop::commands::task_get_resumable,
            agiworkforce_desktop::commands::coord_update_app_state,
            agiworkforce_desktop::commands::coord_request_approval,
            agiworkforce_desktop::commands::coord_get_pending_approvals,
            // Migration commands
            agiworkforce_desktop::commands::migration_test_lovable_connection,
            agiworkforce_desktop::commands::migration_list_lovable_workflows,
            agiworkforce_desktop::commands::migration_launch_lovable,
            // LLM commands
            agiworkforce_desktop::commands::llm_send_message,
            agiworkforce_desktop::commands::llm_configure_provider,
            agiworkforce_desktop::commands::llm_set_default_provider,
            // Settings commands (legacy)
            agiworkforce_desktop::commands::settings_save_api_key,
            agiworkforce_desktop::commands::settings_get_api_key,
            agiworkforce_desktop::commands::settings_load,
            agiworkforce_desktop::commands::settings_save,
            // Settings v2 commands
            agiworkforce_desktop::commands::settings_v2_get,
            agiworkforce_desktop::commands::settings_v2_set,
            agiworkforce_desktop::commands::settings_v2_get_batch,
            agiworkforce_desktop::commands::settings_v2_delete,
            agiworkforce_desktop::commands::settings_v2_get_category,
            agiworkforce_desktop::commands::settings_v2_save_api_key,
            agiworkforce_desktop::commands::settings_v2_get_api_key,
            agiworkforce_desktop::commands::settings_v2_load_app_settings,
            agiworkforce_desktop::commands::settings_v2_save_app_settings,
            agiworkforce_desktop::commands::settings_v2_clear_cache,
            agiworkforce_desktop::commands::settings_v2_list_all,
            // Screen capture commands
            agiworkforce_desktop::commands::capture_screen_full,
            agiworkforce_desktop::commands::capture_screen_region,
            agiworkforce_desktop::commands::capture_get_windows,
            agiworkforce_desktop::commands::capture_get_history,
            agiworkforce_desktop::commands::capture_delete,
            agiworkforce_desktop::commands::capture_save_to_clipboard,
            // OCR commands
            agiworkforce_desktop::commands::ocr_process_image,
            agiworkforce_desktop::commands::ocr_process_region,
            agiworkforce_desktop::commands::ocr_get_languages,
            agiworkforce_desktop::commands::ocr_get_result,
            agiworkforce_desktop::commands::ocr_process_with_boxes,
            agiworkforce_desktop::commands::ocr_detect_languages,
            agiworkforce_desktop::commands::ocr_process_multi_language,
            agiworkforce_desktop::commands::ocr_preprocess_image,
            // File operations commands
            agiworkforce_desktop::commands::file_read,
            agiworkforce_desktop::commands::file_write,
            agiworkforce_desktop::commands::file_delete,
            agiworkforce_desktop::commands::file_rename,
            agiworkforce_desktop::commands::file_copy,
            agiworkforce_desktop::commands::file_move,
            agiworkforce_desktop::commands::file_exists,
            agiworkforce_desktop::commands::file_metadata,
            // Directory operations commands
            agiworkforce_desktop::commands::dir_create,
            agiworkforce_desktop::commands::dir_list,
            agiworkforce_desktop::commands::dir_delete,
            agiworkforce_desktop::commands::dir_traverse,
            // File search commands
            agiworkforce_desktop::filesystem::fs_search_files,
            agiworkforce_desktop::filesystem::fs_search_folders,
            agiworkforce_desktop::filesystem::fs_read_file_content,
            // File watcher commands
            agiworkforce_desktop::commands::file_watch_start,
            agiworkforce_desktop::commands::file_watch_stop,
            agiworkforce_desktop::commands::file_watch_list,
            agiworkforce_desktop::commands::file_watch_stop_all,
            // Terminal commands
            agiworkforce_desktop::commands::terminal_detect_shells,
            agiworkforce_desktop::commands::terminal_create_session,
            agiworkforce_desktop::commands::terminal_send_input,
            agiworkforce_desktop::commands::terminal_resize,
            agiworkforce_desktop::commands::terminal_kill,
            agiworkforce_desktop::commands::terminal_list_sessions,
            agiworkforce_desktop::commands::terminal_get_history,
            // API commands
            agiworkforce_desktop::commands::api_request,
            agiworkforce_desktop::commands::api_get,
            agiworkforce_desktop::commands::api_post_json,
            agiworkforce_desktop::commands::api_put_json,
            agiworkforce_desktop::commands::api_delete,
            agiworkforce_desktop::commands::api_parse_response,
            agiworkforce_desktop::commands::api_extract_json_path,
            agiworkforce_desktop::commands::api_oauth_create_client,
            agiworkforce_desktop::commands::api_oauth_get_auth_url,
            agiworkforce_desktop::commands::api_oauth_exchange_code,
            agiworkforce_desktop::commands::api_oauth_refresh_token,
            agiworkforce_desktop::commands::api_oauth_client_credentials,
            agiworkforce_desktop::commands::api_render_template,
            agiworkforce_desktop::commands::api_extract_template_variables,
            agiworkforce_desktop::commands::api_validate_template,
            // Database commands
            agiworkforce_desktop::commands::db_create_pool,
            agiworkforce_desktop::commands::db_execute_query,
            agiworkforce_desktop::commands::db_execute_prepared,
            agiworkforce_desktop::commands::db_execute_batch,
            agiworkforce_desktop::commands::db_close_pool,
            agiworkforce_desktop::commands::db_list_pools,
            agiworkforce_desktop::commands::db_get_pool_stats,
            agiworkforce_desktop::commands::db_build_select,
            agiworkforce_desktop::commands::db_build_insert,
            agiworkforce_desktop::commands::db_build_update,
            agiworkforce_desktop::commands::db_build_delete,
            agiworkforce_desktop::commands::db_mongo_connect,
            agiworkforce_desktop::commands::db_mongo_find,
            agiworkforce_desktop::commands::db_mongo_find_one,
            agiworkforce_desktop::commands::db_mongo_insert_one,
            agiworkforce_desktop::commands::db_mongo_insert_many,
            agiworkforce_desktop::commands::db_mongo_update_many,
            agiworkforce_desktop::commands::db_mongo_delete_many,
            agiworkforce_desktop::commands::db_mongo_disconnect,
            agiworkforce_desktop::commands::db_redis_connect,
            agiworkforce_desktop::commands::db_redis_get,
            agiworkforce_desktop::commands::db_redis_set,
            agiworkforce_desktop::commands::db_redis_del,
            agiworkforce_desktop::commands::db_redis_exists,
            agiworkforce_desktop::commands::db_redis_expire,
            agiworkforce_desktop::commands::db_redis_hget,
            agiworkforce_desktop::commands::db_redis_hset,
            agiworkforce_desktop::commands::db_redis_hgetall,
            agiworkforce_desktop::commands::db_redis_disconnect,
            // Document commands
            agiworkforce_desktop::commands::document_read,
            agiworkforce_desktop::commands::document_extract_text,
            agiworkforce_desktop::commands::document_get_metadata,
            agiworkforce_desktop::commands::document_search,
            agiworkforce_desktop::commands::document_detect_type,
            // MCP commands
            agiworkforce_desktop::commands::mcp_initialize,
            agiworkforce_desktop::commands::mcp_list_servers,
            agiworkforce_desktop::commands::mcp_connect_server,
            agiworkforce_desktop::commands::mcp_disconnect_server,
            agiworkforce_desktop::commands::mcp_list_tools,
            agiworkforce_desktop::commands::mcp_search_tools,
            agiworkforce_desktop::commands::mcp_call_tool,
            agiworkforce_desktop::commands::mcp_get_config,
            agiworkforce_desktop::commands::mcp_update_config,
            agiworkforce_desktop::commands::mcp_get_stats,
            agiworkforce_desktop::commands::mcp_store_credential,
            agiworkforce_desktop::commands::mcp_get_tool_schemas,
            agiworkforce_desktop::commands::mcp_get_health,
            agiworkforce_desktop::commands::mcp_check_server_health,
            // GitHub integration commands
            agiworkforce_desktop::commands::github_clone_repo,
            agiworkforce_desktop::commands::github_get_repo_context,
            agiworkforce_desktop::commands::github_search_files,
            agiworkforce_desktop::commands::github_read_file,
            agiworkforce_desktop::commands::github_get_file_tree,
            agiworkforce_desktop::commands::github_list_repos,
            // Computer use commands
            agiworkforce_desktop::commands::computer_use_start_session,
            agiworkforce_desktop::commands::computer_use_capture_screen,
            agiworkforce_desktop::commands::computer_use_click,
            agiworkforce_desktop::commands::computer_use_move_mouse,
            agiworkforce_desktop::commands::computer_use_type_text,
            agiworkforce_desktop::commands::computer_use_get_session,
            agiworkforce_desktop::commands::computer_use_list_sessions,
            agiworkforce_desktop::commands::computer_use_execute_tool,
            // Code editing commands
            agiworkforce_desktop::commands::code_generate_edit,
            agiworkforce_desktop::commands::code_apply_edit,
            agiworkforce_desktop::commands::code_reject_edit,
            agiworkforce_desktop::commands::code_list_pending_edits,
            agiworkforce_desktop::commands::composer_start_session,
            agiworkforce_desktop::commands::composer_apply_session,
            agiworkforce_desktop::commands::composer_get_session,
            // Voice input commands
            agiworkforce_desktop::commands::voice_transcribe_file,
            agiworkforce_desktop::commands::voice_transcribe_blob,
            agiworkforce_desktop::commands::voice_configure,
            agiworkforce_desktop::commands::voice_get_settings,
            agiworkforce_desktop::commands::voice_start_recording,
            agiworkforce_desktop::commands::voice_stop_recording,
            // Keyboard shortcuts commands
            agiworkforce_desktop::commands::shortcuts_register,
            agiworkforce_desktop::commands::shortcuts_unregister,
            agiworkforce_desktop::commands::shortcuts_list,
            agiworkforce_desktop::commands::shortcuts_update,
            agiworkforce_desktop::commands::shortcuts_trigger,
            agiworkforce_desktop::commands::shortcuts_reset,
            agiworkforce_desktop::commands::shortcuts_check_key,
            agiworkforce_desktop::commands::shortcuts_get_defaults,
            // Workspace indexing commands
            agiworkforce_desktop::commands::workspace_index,
            agiworkforce_desktop::commands::workspace_search_symbols,
            agiworkforce_desktop::commands::workspace_find_definition,
            agiworkforce_desktop::commands::workspace_find_references,
            agiworkforce_desktop::commands::workspace_get_dependencies,
            agiworkforce_desktop::commands::workspace_get_file_symbols,
            agiworkforce_desktop::commands::workspace_get_stats,
            // LSP integration commands
            agiworkforce_desktop::commands::lsp_start_server,
            agiworkforce_desktop::commands::lsp_stop_server,
            agiworkforce_desktop::commands::lsp_did_open,
            agiworkforce_desktop::commands::lsp_completion,
            agiworkforce_desktop::commands::lsp_hover,
            agiworkforce_desktop::commands::lsp_definition,
            agiworkforce_desktop::commands::lsp_references,
            // Onboarding and data management commands
            agiworkforce_desktop::commands::get_onboarding_status,
            agiworkforce_desktop::commands::complete_onboarding_step,
            agiworkforce_desktop::commands::skip_onboarding_step,
            agiworkforce_desktop::commands::reset_onboarding,
            agiworkforce_desktop::commands::export_user_data,
            agiworkforce_desktop::commands::check_connectivity,
            agiworkforce_desktop::commands::get_session_info,
            agiworkforce_desktop::commands::update_session_activity,
            agiworkforce_desktop::commands::get_user_preference,
            agiworkforce_desktop::commands::set_user_preference
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
