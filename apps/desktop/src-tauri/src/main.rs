#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![deny(warnings)] // Deny ALL warnings - zero tolerance
#![allow(unsafe_code)] // Required for Windows API calls
#![allow(unused_qualifications)] // Some qualifications improve code clarity

use agiworkforce_desktop::agent::code_generator::CodeGenerator;
use agiworkforce_desktop::agent::context_manager::ContextManager;
use agiworkforce_desktop::agent::runtime::AgentRuntime;
use agiworkforce_desktop::billing::BillingStateWrapper;
use agiworkforce_desktop::security::{AuthManager, SecretManager};
use agiworkforce_desktop::{
    build_system_tray,
    commands::{
        load_persisted_calendar_accounts, security::AuthManagerState, AIEmployeeState,
        AgentRuntimeState, ApiState, AppDatabase, BrowserStateWrapper, CalendarState, CloudState,
        CodeEditingState, CodeGeneratorState, ComputerUseState, ContextManagerState, DatabaseState,
        DocumentState, EmbeddingServiceState, FileWatcherState, GitHubState, LLMState, LSPState,
        McpState, ProductivityState, SettingsServiceState, SettingsState, ShortcutsState,
        TaskManagerState, TemplateManagerState, VoiceState, WorkflowEngineState,
        WorkspaceIndexState,
    },
    db::migrations,
    initialize_window,
    settings::SettingsService,
    state::AppState,
    telemetry,
};
use anyhow::Context;
use rusqlite::Connection;
use std::sync::{Arc, Mutex};
use tauri::{async_runtime, Manager};
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
                .context("Failed to get app data dir")?
                .join("agiworkforce.db");

            // Ensure parent directory exists
            if let Some(parent) = db_path.parent() {
                std::fs::create_dir_all(parent).context("Failed to create data directory")?;
            }

            // Open database connection
            let conn = Connection::open(&db_path).context("Failed to open database")?;

            // Run migrations
            if let Err(e) = migrations::run_migrations(&conn) {
                tracing::error!("Failed to run migrations: {}", e);
                return Err(anyhow::anyhow!("Failed to run migrations: {}", e).into());
            }

            tracing::info!("Database initialized at {:?}", db_path);

            // Manage database state
            let db_conn_arc = Arc::new(Mutex::new(conn));
            app.manage(AppDatabase {
                conn: db_conn_arc.clone(),
            });

            // Initialize security components
            // SecretManager handles secure JWT secret storage (OS keyring + database fallback)
            let secret_manager = Arc::new(SecretManager::new(db_conn_arc.clone()));
            tracing::info!("SecretManager initialized");

            // AuthManager handles user authentication, sessions, and token management
            // CRITICAL: This must be initialized to enforce authentication on protected commands
            let auth_manager = Arc::new(parking_lot::RwLock::new(AuthManager::new(secret_manager.clone())));
            app.manage(AuthManagerState(auth_manager));
            tracing::info!("AuthManager initialized - authentication system ready");

            // Initialize analytics telemetry state
            use agiworkforce_desktop::commands::analytics::TelemetryState;
            use agiworkforce_desktop::telemetry::{AnalyticsMetricsCollector, CollectorConfig, TelemetryCollector};

            let telemetry_config = CollectorConfig {
                enabled: true,
                batch_size: 50,
                flush_interval_secs: 30,
            };
            let telemetry_collector = TelemetryCollector::new(telemetry_config);
            let analytics_metrics = AnalyticsMetricsCollector::new();
            app.manage(TelemetryState::new(telemetry_collector, analytics_metrics));

            tracing::info!("Analytics telemetry state initialized");

            // Initialize LLM router state
            app.manage(LLMState::new());

            // Initialize browser automation state
            app.manage(BrowserStateWrapper::new());

            // Initialize settings state (legacy)
            app.manage(SettingsState::new());

            // Initialize new settings service with database connection
            let settings_conn =
                Connection::open(&db_path).context("Failed to open settings database")?;
            let settings_service = SettingsService::new(Arc::new(Mutex::new(settings_conn)))
                .context("Failed to initialize settings service")?;
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
                .context("Failed to initialize automation service")?;
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
                .context("Failed to get app data dir")?
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

            // Initialize Codebase Cache
            let cache_conn =
                Connection::open(&db_path).context("Failed to open database for codebase cache")?;
            let codebase_cache =
                agiworkforce_desktop::cache::CodebaseCache::new(Arc::new(Mutex::new(cache_conn)))
                    .context("Failed to initialize codebase cache")?;
            app.manage(agiworkforce_desktop::commands::cache::CodebaseCacheState(
                Arc::new(codebase_cache),
            ));

            tracing::info!("Codebase cache initialized");

            // Initialize Billing state (Stripe integration)
            app.manage(BillingStateWrapper::new());

            tracing::info!("Billing state initialized");

            // Initialize Workflow Orchestration state
            let workflow_engine_state =
                WorkflowEngineState::new(db_path.to_string_lossy().to_string());
            app.manage(workflow_engine_state);

            tracing::info!("Workflow orchestration state initialized");

            // Initialize Marketplace state for public workflows
            let marketplace_conn =
                Connection::open(&db_path).context("Failed to open database for marketplace")?;
            app.manage(
                agiworkforce_desktop::commands::marketplace::MarketplaceState {
                    db: Arc::new(Mutex::new(marketplace_conn)),
                },
            );

            tracing::info!("Marketplace state initialized");

            // Initialize Template Manager state
            let template_conn =
                Connection::open(&db_path).context("Failed to open database for template manager")?;
            let template_db = Arc::new(Mutex::new(template_conn));
            let template_manager =
                agiworkforce_desktop::commands::templates::initialize_template_manager(template_db);
            app.manage(TemplateManagerState {
                manager: Arc::new(Mutex::new(template_manager)),
            });

            tracing::info!("Template manager state initialized");

            // Initialize Real-time Metrics and ROI Dashboard
            let presence_db = Arc::new(Mutex::new(
                Connection::open(&db_path).context("Failed to open database for presence")?,
            ));
            let presence_manager =
                Arc::new(agiworkforce_desktop::realtime::PresenceManager::new(presence_db));
            let websocket_port = 8787;
            let realtime_server = Arc::new(
                agiworkforce_desktop::realtime::RealtimeServer::new(presence_manager.clone()),
            );
            {
                let server = realtime_server.clone();
                async_runtime::spawn(async move {
                    if let Err(e) = server.start(websocket_port).await {
                        tracing::error!("Realtime server failed: {}", e);
                    }
                });
            }
            app.manage(agiworkforce_desktop::commands::RealtimeState::new(
                presence_manager.clone(),
                websocket_port,
            ));
            let metrics_db = Arc::new(Mutex::new(
                Connection::open(&db_path).context("Failed to open database for metrics")?,
            ));
            let metrics_collector = Arc::new(
                agiworkforce_desktop::metrics::RealtimeMetricsCollector::new(
                    metrics_db.clone(),
                    realtime_server.clone(),
                ),
            );
            let metrics_comparison = Arc::new(
                agiworkforce_desktop::metrics::MetricsComparison::new(metrics_db.clone()),
            );

            // Manage metrics states
            app.manage(agiworkforce_desktop::commands::MetricsCollectorState(
                metrics_collector,
            ));
            app.manage(agiworkforce_desktop::commands::MetricsComparisonState(
                metrics_comparison,
            ));

            tracing::info!("Real-time metrics and ROI dashboard initialized");

            // Initialize Embedding Service for semantic code search
            let workspace_root = app
                .path()
                .app_data_dir()
                .context("Failed to get app data dir")?;
            let embedding_config = agiworkforce_desktop::embeddings::EmbeddingConfig::default();

            match async_runtime::block_on(
                agiworkforce_desktop::embeddings::EmbeddingService::new(
                    workspace_root,
                    embedding_config,
                ),
            ) {
                Ok(embedding_service) => {
                    app.manage(EmbeddingServiceState(Arc::new(TokioMutex::new(
                        embedding_service,
                    ))));
                    tracing::info!("Embedding service initialized");
                }
                Err(e) => {
                    tracing::warn!("Failed to initialize embedding service: {}. Semantic search will be unavailable.", e);
                }
            }

            // Initialize AI Employee system
            let employee_db = Arc::new(Mutex::new(
                Connection::open(&db_path).context("Failed to open database for AI employees")?,
            ));

            // Create LLM router for employee executor (reuse existing LLM state)
            let llm_router = Arc::new(Mutex::new(agiworkforce_desktop::router::LLMRouter::new()));

            // Create tool registry for employee executor
            let tools = Arc::new(agiworkforce_desktop::agi::tools::ToolRegistry::new()
                .context("Failed to initialize tool registry")?);

            // Create employee system components
            let employee_executor = Arc::new(
                agiworkforce_desktop::ai_employees::executor::AIEmployeeExecutor::new(
                    employee_db.clone(),
                    llm_router,
                    tools,
                ),
            );

            let employee_marketplace = Arc::new(Mutex::new(
                agiworkforce_desktop::ai_employees::marketplace::EmployeeMarketplace::new(
                    employee_db.clone(),
                ),
            ));

            let employee_registry = Arc::new(Mutex::new(
                agiworkforce_desktop::ai_employees::registry::AIEmployeeRegistry::new(
                    employee_db.clone(),
                ),
            ));

            // Initialize pre-built employees
            match employee_registry.lock() {
                Ok(registry) => {
                    if let Err(e) = registry.initialize() {
                        tracing::warn!("Failed to initialize AI employee registry: {}", e);
                    }
                }
                Err(e) => {
                    tracing::error!("Failed to lock employee registry: {}", e);
                    return Err(anyhow::anyhow!("Employee registry lock poisoned: {}", e).into());
                }
            }

            // Manage AI employee state
            app.manage(AIEmployeeState {
                executor: employee_executor,
                marketplace: employee_marketplace,
                registry: employee_registry,
            });

            tracing::info!("AI Employee system initialized");

            // Initialize Hook Registry for event-driven automation
            app.manage(agiworkforce_desktop::commands::HookRegistryState::new());

            tracing::info!("Hook registry state initialized");

            // Initialize Prompt Enhancement state for AI routing
            app.manage(agiworkforce_desktop::commands::PromptEnhancementState::new());

            tracing::info!("Prompt enhancement state initialized");

            // Initialize Background Task Manager
            let task_db_conn = Arc::new(Mutex::new(
                Connection::open(&db_path).context("Failed to open database for task manager")?,
            ));
            let task_manager = Arc::new(agiworkforce_desktop::tasks::TaskManager::new(
                task_db_conn,
                app.handle().clone(),
                4, // Max concurrent tasks
            ));

            // Restore queued tasks from database
            let task_manager_clone = task_manager.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = task_manager_clone.restore().await {
                    tracing::error!("Failed to restore tasks: {}", e);
                }
            });

            // Start background task loop
            let task_manager_loop = task_manager.clone();
            tauri::async_runtime::spawn(async move {
                agiworkforce_desktop::tasks::start_task_loop(task_manager_loop).await;
            });

            app.manage(TaskManagerState(task_manager));

            tracing::info!("Background task manager initialized");

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
            // Parallel Agent Orchestration commands
            agiworkforce_desktop::commands::orchestrator_init,
            agiworkforce_desktop::commands::orchestrator_spawn_agent,
            agiworkforce_desktop::commands::orchestrator_spawn_parallel,
            agiworkforce_desktop::commands::orchestrator_get_agent_status,
            agiworkforce_desktop::commands::orchestrator_list_agents,
            agiworkforce_desktop::commands::orchestrator_cancel_agent,
            agiworkforce_desktop::commands::orchestrator_cancel_all,
            agiworkforce_desktop::commands::orchestrator_wait_all,
            agiworkforce_desktop::commands::orchestrator_cleanup,
            // System monitoring and agent management commands
            agiworkforce_desktop::commands::get_system_resources,
            agiworkforce_desktop::commands::pause_agent,
            agiworkforce_desktop::commands::resume_agent,
            agiworkforce_desktop::commands::cancel_agent,
            agiworkforce_desktop::commands::refresh_agent_status,
            // User operation commands
            agiworkforce_desktop::commands::approve_operation,
            agiworkforce_desktop::commands::reject_operation,
            agiworkforce_desktop::commands::cancel_background_task,
            agiworkforce_desktop::commands::pause_background_task,
            agiworkforce_desktop::commands::resume_background_task,
            agiworkforce_desktop::commands::list_background_tasks,
            agiworkforce_desktop::commands::list_active_agents,
            // Knowledge base commands
            agiworkforce_desktop::commands::query_knowledge,
            agiworkforce_desktop::commands::get_recent_knowledge,
            agiworkforce_desktop::commands::get_knowledge_by_category,
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
            // Browser visualization commands
            agiworkforce_desktop::commands::browser_get_screenshot_stream,
            agiworkforce_desktop::commands::browser_highlight_element,
            agiworkforce_desktop::commands::browser_get_dom_snapshot,
            agiworkforce_desktop::commands::browser_get_console_logs,
            agiworkforce_desktop::commands::browser_get_network_activity,
            // Semantic browser automation commands
            agiworkforce_desktop::commands::find_element_semantic,
            agiworkforce_desktop::commands::find_all_elements_semantic,
            agiworkforce_desktop::commands::click_semantic,
            agiworkforce_desktop::commands::type_semantic,
            agiworkforce_desktop::commands::get_accessibility_tree,
            agiworkforce_desktop::commands::test_selector_strategies,
            agiworkforce_desktop::commands::get_dom_semantic_graph,
            agiworkforce_desktop::commands::get_interactive_elements,
            agiworkforce_desktop::commands::find_by_role,
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
            agiworkforce_desktop::commands::llm_get_available_models,
            agiworkforce_desktop::commands::llm_check_provider_status,
            agiworkforce_desktop::commands::llm_get_usage_stats,
            // Cache management commands
            agiworkforce_desktop::commands::cache_get_stats,
            agiworkforce_desktop::commands::cache_clear_all,
            agiworkforce_desktop::commands::cache_clear_by_type,
            agiworkforce_desktop::commands::cache_clear_by_provider,
            agiworkforce_desktop::commands::cache_get_size,
            agiworkforce_desktop::commands::cache_configure,
            agiworkforce_desktop::commands::cache_warmup,
            agiworkforce_desktop::commands::cache_export,
            agiworkforce_desktop::commands::cache_get_analytics,
            agiworkforce_desktop::commands::cache_prune_expired,
            // Codebase cache commands
            agiworkforce_desktop::commands::codebase_cache_get_stats,
            agiworkforce_desktop::commands::codebase_cache_clear_project,
            agiworkforce_desktop::commands::codebase_cache_clear_file,
            agiworkforce_desktop::commands::codebase_cache_clear_all,
            agiworkforce_desktop::commands::codebase_cache_clear_expired,
            agiworkforce_desktop::commands::codebase_cache_get_file_tree,
            agiworkforce_desktop::commands::codebase_cache_set_file_tree,
            agiworkforce_desktop::commands::codebase_cache_get_symbols,
            agiworkforce_desktop::commands::codebase_cache_set_symbols,
            agiworkforce_desktop::commands::codebase_cache_get_dependencies,
            agiworkforce_desktop::commands::codebase_cache_set_dependencies,
            agiworkforce_desktop::commands::codebase_cache_calculate_hash,
            // Embedding and semantic search commands
            agiworkforce_desktop::commands::generate_code_embeddings,
            agiworkforce_desktop::commands::semantic_search_codebase,
            agiworkforce_desktop::commands::get_embedding_stats,
            agiworkforce_desktop::commands::index_workspace,
            agiworkforce_desktop::commands::index_file,
            agiworkforce_desktop::commands::get_indexing_progress,
            agiworkforce_desktop::commands::on_file_changed,
            agiworkforce_desktop::commands::on_file_deleted,
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
            // Vision LLM commands
            agiworkforce_desktop::commands::vision_send_message,
            agiworkforce_desktop::commands::vision_analyze_screenshot,
            agiworkforce_desktop::commands::vision_extract_text,
            agiworkforce_desktop::commands::vision_compare_images,
            agiworkforce_desktop::commands::vision_locate_element,
            agiworkforce_desktop::commands::vision_describe_ui_elements,
            agiworkforce_desktop::commands::vision_answer_question,
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
            agiworkforce_desktop::commands::fs_read_file_content,
            agiworkforce_desktop::commands::fs_get_workspace_files,
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
            // Enhanced code editing commands (visual diff)
            agiworkforce_desktop::commands::get_file_diff,
            agiworkforce_desktop::commands::apply_changes,
            agiworkforce_desktop::commands::revert_changes,
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
            agiworkforce_desktop::commands::lsp_did_change,
            agiworkforce_desktop::commands::lsp_did_close,
            agiworkforce_desktop::commands::lsp_completion,
            agiworkforce_desktop::commands::lsp_hover,
            agiworkforce_desktop::commands::lsp_definition,
            agiworkforce_desktop::commands::lsp_references,
            agiworkforce_desktop::commands::lsp_rename,
            agiworkforce_desktop::commands::lsp_formatting,
            agiworkforce_desktop::commands::lsp_workspace_symbol,
            agiworkforce_desktop::commands::lsp_code_action,
            agiworkforce_desktop::commands::lsp_get_diagnostics,
            agiworkforce_desktop::commands::lsp_get_all_diagnostics,
            agiworkforce_desktop::commands::lsp_list_servers,
            agiworkforce_desktop::commands::lsp_detect_language,
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
            agiworkforce_desktop::commands::set_user_preference,
            // Billing commands (Stripe integration)
            agiworkforce_desktop::billing::billing_initialize,
            agiworkforce_desktop::billing::stripe_create_customer,
            agiworkforce_desktop::billing::stripe_get_customer_by_email,
            agiworkforce_desktop::billing::stripe_create_subscription,
            agiworkforce_desktop::billing::stripe_get_subscription,
            agiworkforce_desktop::billing::stripe_update_subscription,
            agiworkforce_desktop::billing::stripe_cancel_subscription,
            agiworkforce_desktop::billing::stripe_get_invoices,
            agiworkforce_desktop::billing::stripe_get_usage,
            agiworkforce_desktop::billing::stripe_track_usage,
            agiworkforce_desktop::billing::stripe_create_portal_session,
            agiworkforce_desktop::billing::stripe_get_active_subscription,
            agiworkforce_desktop::billing::stripe_process_webhook,
            // Subscription management commands
            agiworkforce_desktop::commands::subscribe_to_plan,
            agiworkforce_desktop::commands::upgrade_plan,
            agiworkforce_desktop::commands::cancel_subscription,
            // Workflow Orchestration commands
            agiworkforce_desktop::commands::create_workflow,
            agiworkforce_desktop::commands::update_workflow,
            agiworkforce_desktop::commands::delete_workflow,
            agiworkforce_desktop::commands::get_workflow,
            agiworkforce_desktop::commands::get_user_workflows,
            agiworkforce_desktop::commands::execute_workflow,
            agiworkforce_desktop::commands::pause_workflow,
            agiworkforce_desktop::commands::resume_workflow,
            agiworkforce_desktop::commands::cancel_workflow,
            agiworkforce_desktop::commands::get_workflow_status,
            agiworkforce_desktop::commands::get_execution_logs,
            agiworkforce_desktop::commands::schedule_workflow,
            agiworkforce_desktop::commands::trigger_workflow_on_event,
            agiworkforce_desktop::commands::get_next_execution_time,
            // Marketplace commands - Public workflow sharing
            agiworkforce_desktop::commands::publish_workflow_to_marketplace,
            agiworkforce_desktop::commands::unpublish_workflow,
            agiworkforce_desktop::commands::get_featured_workflows,
            agiworkforce_desktop::commands::get_trending_workflows,
            agiworkforce_desktop::commands::search_marketplace_workflows,
            agiworkforce_desktop::commands::get_workflow_by_share_url,
            agiworkforce_desktop::commands::get_creator_workflows,
            agiworkforce_desktop::commands::get_my_published_workflows,
            agiworkforce_desktop::commands::get_workflows_by_category,
            agiworkforce_desktop::commands::get_category_counts,
            agiworkforce_desktop::commands::get_popular_tags,
            agiworkforce_desktop::commands::clone_marketplace_workflow,
            agiworkforce_desktop::commands::fork_marketplace_workflow,
            agiworkforce_desktop::commands::rate_workflow,
            agiworkforce_desktop::commands::get_user_workflow_rating,
            agiworkforce_desktop::commands::comment_on_workflow,
            agiworkforce_desktop::commands::get_workflow_comments,
            agiworkforce_desktop::commands::delete_workflow_comment,
            agiworkforce_desktop::commands::favorite_workflow,
            agiworkforce_desktop::commands::unfavorite_workflow,
            agiworkforce_desktop::commands::is_workflow_favorited,
            agiworkforce_desktop::commands::get_user_favorites,
            agiworkforce_desktop::commands::get_user_clones,
            agiworkforce_desktop::commands::share_workflow,
            agiworkforce_desktop::commands::get_workflow_stats,
            agiworkforce_desktop::commands::get_workflow_templates,
            agiworkforce_desktop::commands::get_workflow_templates_by_category,
            agiworkforce_desktop::commands::search_workflow_templates,
            // Team collaboration commands
            agiworkforce_desktop::commands::create_team,
            agiworkforce_desktop::commands::get_team,
            agiworkforce_desktop::commands::update_team,
            agiworkforce_desktop::commands::delete_team,
            agiworkforce_desktop::commands::get_user_teams,
            agiworkforce_desktop::commands::invite_member,
            agiworkforce_desktop::commands::accept_invitation,
            agiworkforce_desktop::commands::remove_member,
            agiworkforce_desktop::commands::update_member_role,
            agiworkforce_desktop::commands::get_team_members,
            agiworkforce_desktop::commands::get_team_invitations,
            agiworkforce_desktop::commands::share_resource,
            agiworkforce_desktop::commands::unshare_resource,
            agiworkforce_desktop::commands::get_team_resources,
            agiworkforce_desktop::commands::get_team_resources_by_type,
            agiworkforce_desktop::commands::get_team_activity,
            agiworkforce_desktop::commands::get_user_team_activity,
            agiworkforce_desktop::commands::get_team_billing,
            agiworkforce_desktop::commands::initialize_team_billing,
            agiworkforce_desktop::commands::update_team_plan,
            agiworkforce_desktop::commands::add_team_seats,
            agiworkforce_desktop::commands::remove_team_seats,
            agiworkforce_desktop::commands::calculate_team_cost,
            agiworkforce_desktop::commands::update_team_usage,
            agiworkforce_desktop::commands::transfer_team_ownership,
            // Process reasoning commands
            agiworkforce_desktop::commands::get_process_templates,
            agiworkforce_desktop::commands::get_outcome_tracking,
            agiworkforce_desktop::commands::get_process_success_rates,
            agiworkforce_desktop::commands::get_best_practices,
            agiworkforce_desktop::commands::get_process_statistics,
            // Agent template commands
            agiworkforce_desktop::commands::get_all_templates,
            agiworkforce_desktop::commands::get_template_by_id,
            agiworkforce_desktop::commands::get_templates_by_category,
            agiworkforce_desktop::commands::install_template,
            agiworkforce_desktop::commands::get_installed_templates,
            agiworkforce_desktop::commands::search_templates,
            agiworkforce_desktop::commands::execute_template,
            agiworkforce_desktop::commands::uninstall_template,
            agiworkforce_desktop::commands::get_template_categories,
            // Real-time metrics and ROI dashboard commands
            agiworkforce_desktop::commands::get_realtime_stats,
            agiworkforce_desktop::commands::record_automation_metrics,
            agiworkforce_desktop::commands::get_metrics_history,
            agiworkforce_desktop::commands::get_employee_performance,
            agiworkforce_desktop::commands::compare_to_manual,
            agiworkforce_desktop::commands::compare_to_previous_period,
            agiworkforce_desktop::commands::compare_to_industry_benchmark,
            agiworkforce_desktop::commands::get_milestones,
            agiworkforce_desktop::commands::share_milestone,
            // Analytics and marketplace tracking commands
            agiworkforce_desktop::commands::track_workflow_view,
            agiworkforce_desktop::commands::acknowledge_milestone,
            // AI Employee Library commands
            agiworkforce_desktop::commands::ai_employees_initialize,
            agiworkforce_desktop::commands::ai_employees_get_all,
            agiworkforce_desktop::commands::ai_employees_get_by_id,
            agiworkforce_desktop::commands::ai_employees_search,
            agiworkforce_desktop::commands::ai_employees_get_featured,
            agiworkforce_desktop::commands::ai_employees_get_by_category,
            agiworkforce_desktop::commands::ai_employees_hire,
            agiworkforce_desktop::commands::ai_employees_fire,
            agiworkforce_desktop::commands::ai_employees_get_user_employees,
            agiworkforce_desktop::commands::ai_employees_assign_task,
            agiworkforce_desktop::commands::ai_employees_execute_task,
            agiworkforce_desktop::commands::ai_employees_get_task_status,
            agiworkforce_desktop::commands::ai_employees_list_tasks,
            agiworkforce_desktop::commands::ai_employees_run_demo,
            agiworkforce_desktop::commands::ai_employees_get_stats,
            agiworkforce_desktop::commands::ai_employees_publish,
            agiworkforce_desktop::commands::update_custom_employee,
            agiworkforce_desktop::commands::delete_custom_employee,
            agiworkforce_desktop::commands::publish_employee_to_marketplace,
            // Background task management commands
            agiworkforce_desktop::commands::bg_submit_task,
            agiworkforce_desktop::commands::bg_cancel_task,
            agiworkforce_desktop::commands::bg_pause_task,
            agiworkforce_desktop::commands::bg_resume_task,
            agiworkforce_desktop::commands::bg_get_task_status,
            agiworkforce_desktop::commands::bg_list_tasks,
            agiworkforce_desktop::commands::bg_get_task_stats,
            // Hook system commands
            agiworkforce_desktop::commands::hooks_initialize,
            agiworkforce_desktop::commands::hooks_list,
            agiworkforce_desktop::commands::hooks_add,
            agiworkforce_desktop::commands::hooks_remove,
            agiworkforce_desktop::commands::hooks_toggle,
            agiworkforce_desktop::commands::hooks_update,
            agiworkforce_desktop::commands::hooks_get_config_path,
            agiworkforce_desktop::commands::hooks_create_example,
            agiworkforce_desktop::commands::hooks_export,
            agiworkforce_desktop::commands::hooks_import,
            agiworkforce_desktop::commands::hooks_reload,
            agiworkforce_desktop::commands::hooks_get_event_types,
            agiworkforce_desktop::commands::hooks_get_stats,
            // Prompt enhancement and API routing commands
            agiworkforce_desktop::commands::detect_use_case,
            agiworkforce_desktop::commands::enhance_prompt,
            agiworkforce_desktop::commands::route_to_best_api,
            agiworkforce_desktop::commands::enhance_and_route_prompt,
            agiworkforce_desktop::commands::get_prompt_enhancement_config,
            agiworkforce_desktop::commands::set_prompt_enhancement_config,
            agiworkforce_desktop::commands::get_suggested_provider,
            agiworkforce_desktop::commands::get_available_use_cases,
            agiworkforce_desktop::commands::get_available_providers
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
