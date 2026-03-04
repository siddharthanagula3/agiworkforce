#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![warn(warnings)]
#![allow(unused_qualifications)]
#![allow(clippy::should_implement_trait)]
#![allow(clippy::too_many_arguments)]
#![allow(clippy::type_complexity)]

use crate::core::agent::approval::ApprovalController;
use crate::data::db::migrations;
use crate::data::settings::SettingsService;
use crate::sys::billing::BillingStateWrapper;
use crate::sys::commands::{
    ai_native::{CodeGeneratorState, ContextManagerState},
    gmail_oauth::GmailOAuthState,
    intent::IntentState,
    load_persisted_calendar_accounts,
    master_password::MasterPasswordState,
    mcp_extensions::McpExtensionsState,
    project_memory::ProjectMemoryState,
    research::ResearchState,
    auth::SessionState,
    security::AuthManagerState,
    skills::SkillsState,
    tool_confirmation::ToolConfirmationState,
    undo::UndoState,
    ApiState, AppDatabase, BrowserStateWrapper, CalendarState, CloudState, CodeEditingState,
    ComputerUseState, DatabaseState, DocumentState, EmbeddingServiceState, FileWatcherState,
    GitHubState, LLMState, LSPState, McpOAuthState, McpState, McpbState, MemoryState,
    NativeMessagingStateWrapper, NotificationState, ProductivityState, SchedulerState,
    SettingsServiceState, SettingsState, ShortcutsState, TaskManagerState, TemplateManagerState,
    VoiceState, WorkflowEngineState, WorkspaceIndexState,
};
use crate::sys::diagnostics::DiagnosticsState;
use crate::sys::security::{AuthManager, SecretManager};
use crate::sys::telemetry;
use anyhow::Context;
use std::sync::{Arc, Mutex};
use tauri::{async_runtime, Manager};
use tokio::sync::Mutex as TokioMutex;

/// Returns `true` when this process already holds macOS Accessibility permission.
/// Uses `AXIsProcessTrusted()` which **never prompts** — it only reads the TCC database.
/// Call this before any API that would trigger the "control this computer" dialog.
#[cfg(target_os = "macos")]
#[allow(unsafe_code)]
fn accessibility_is_trusted() -> bool {
    use accessibility_sys::AXIsProcessTrusted;
    unsafe { AXIsProcessTrusted() }
}

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
    apply_dock, auto_tile_for_browser, close_floating_window, create_floating_window, hide_window,
    initialize_window, is_floating_window_visible, set_always_on_top, set_pinned, show_window,
    toggle_floating_window, undock, DockPreviewEvent, DockState,
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
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown".to_string());
        let message = if let Some(s) = info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "Unknown panic".to_string()
        };
        tracing::error!("Application Panic at {}: {:?}", location, message);
        eprintln!("PANIC at {}: {}", location, message);
    }));

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build());

    // Shell plugin - disabled for App Store builds (sandbox restrictions)
    #[cfg(feature = "shell")]
    {
        builder = builder.plugin(tauri_plugin_shell::init());
    }

    // Updater plugin - disabled for App Store builds (App Store handles updates)
    #[cfg(feature = "updater")]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
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



            // Install native messaging manifest
            if let Err(e) = crate::integrations::native_messaging::manifest::install_manifests(Some("bblfoadbknbnmbchfjpgcefpkccpdnfc")) {
                tracing::warn!("Failed to install native messaging manifest: {}", e);
            } else {
                tracing::info!("Native messaging manifest installed/updated");
            }

            let db_path = app_data_dir.join("agiworkforce.db");
            tracing::info!("Database path: {:?}", db_path);

            // Derive the database encryption key from machine identity.
            // This uses PBKDF2 with machine-specific salt to produce a
            // deterministic 32-byte key unique to this machine.
            let db_encryption_key = {
                use crate::sys::security::{derive_key, KeyPurpose};
                derive_key(KeyPurpose::DatabaseEncryption)
            };

            let db_path_str = db_path.to_string_lossy().to_string();

            // Attempt to migrate an existing unencrypted database to SQLCipher.
            // This is a one-time operation for users upgrading from plain SQLite.
            if db_path.exists() {
                if let Err(e) = crate::data::db::encryption::migrate_to_encrypted(
                    &db_path_str,
                    &db_encryption_key,
                ) {
                    tracing::warn!(
                        "Database encryption migration skipped or failed: {}. \
                         Will attempt to open the database as-is.",
                        e
                    );
                }
            }

            // Open the database with encryption. Fail hard if encryption
            // cannot be established — silently falling back to plaintext
            // would violate the security contract and risk data exposure.
            let conn = crate::data::db::encryption::open_encrypted_connection(
                &db_path_str,
                &db_encryption_key,
            )
            .map_err(|enc_err| {
                tracing::error!(
                    "Failed to open database with encryption: {}. \
                     Refusing to fall back to unencrypted mode.",
                    enc_err
                );
                anyhow::anyhow!(
                    "Database encryption initialization failed: {}. \
                     Cannot start without encrypted database.",
                    enc_err
                )
            })?;
            tracing::info!("Database opened with SQLCipher encryption");

            // Configure SQLite for better performance and reliability.
            // These PRAGMAs must come after the encryption key PRAGMA.
            conn.execute_batch("
                PRAGMA busy_timeout = 5000;
                PRAGMA journal_mode = WAL;
                PRAGMA synchronous = NORMAL;
                PRAGMA foreign_keys = ON;
                PRAGMA cache_size = -64000;
            ").context("Failed to set database pragmas")?;

            if let Err(e) = migrations::run_migrations(&conn) {
                tracing::error!("Failed to run migrations: {}", e);

                return Err(anyhow::anyhow!("Failed to run migrations: {}", e).into());
            }

            tracing::info!("Database initialized at {:?}", db_path);

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

            // Session state for JWT storage (replaces process-global static)
            app.manage(SessionState::new());
            tracing::info!("SessionState initialized");

            // Master Password state for SECSYS-001 security enhancement
            match MasterPasswordState::new(db_conn_arc.clone()) {
                Ok(master_password_state) => {
                    app.manage(master_password_state);
                    tracing::info!("MasterPasswordState initialized");
                }
                Err(e) => {
                    tracing::warn!("Failed to initialize MasterPasswordState: {}. Master password features will be unavailable.", e);
                    app.manage(MasterPasswordState::new_degraded());
                }
            }


            use crate::sys::commands::analytics::TelemetryState;
            use crate::sys::telemetry::{AnalyticsMetricsCollector, CollectorConfig, TelemetryCollector};

            let telemetry_data_dir = app.path().app_data_dir().ok();
            let telemetry_config = CollectorConfig {
                enabled: true,
                batch_size: 50,
                flush_interval_secs: 30,
                app_data_dir: telemetry_data_dir,
            };
            let telemetry_collector = TelemetryCollector::new(telemetry_config);
            let analytics_metrics = AnalyticsMetricsCollector::new();
            app.manage(TelemetryState::new(telemetry_collector, analytics_metrics));


            app.manage(LLMState::new());


            // Initialize browser automation with graceful degradation.
            // If initialization fails, we still manage a degraded state so commands
            // can return meaningful errors instead of panicking on state retrieval.
            let browser_state = match tauri::async_runtime::block_on(BrowserStateWrapper::new()) {
                Ok(state) => {
                    tracing::info!("Browser automation initialized successfully");
                    state
                }
                Err(e) => {
                    tracing::warn!(
                        "Browser automation failed to initialize. Commands will return errors. \
                         Reason: {}. This may be due to missing Playwright/Chromium dependencies.",
                        e
                    );
                    // Create a degraded state that will return clear errors to the frontend
                    BrowserStateWrapper::new_degraded(e)
                }
            };
            app.manage(browser_state);

            // Native Messaging state for browser extension communication
            app.manage(NativeMessagingStateWrapper::new());
            tracing::info!("NativeMessagingStateWrapper initialized");

            app.manage(SettingsState::new());


            let settings_conn = crate::data::db::encryption::open_encrypted_connection(
                &db_path.to_string_lossy(),
                &db_encryption_key,
            ).map_err(|e| anyhow::anyhow!("Failed to open settings database: {}", e))?;
            let settings_service = SettingsService::new(Arc::new(Mutex::new(settings_conn)))
                .context("Failed to initialize settings service")?;
            app.manage(SettingsServiceState::new(settings_service));


            app.manage(FileWatcherState::new());


            app.manage(ApiState::new().map_err(|e| anyhow::anyhow!("Failed to initialize API state: {}", e))?);


            app.manage(tokio::sync::Mutex::new(DatabaseState::new()));


            app.manage(CloudState::new());


            let calendar_state = CalendarState::new();
            match crate::data::db::encryption::open_encrypted_connection(
                &db_path.to_string_lossy(),
                &db_encryption_key,
            ) {
                Ok(calendar_conn) => match load_persisted_calendar_accounts(&calendar_conn) {
                    Ok(accounts) => {
                        let mut restored = 0usize;
                        for (account_id, info, _) in accounts {
                            if let Err(e) = calendar_state
                                .manager
                                .upsert_account(account_id, info, None)
                            {
                                tracing::warn!("Failed to restore calendar account: {e}");
                            } else {
                                restored += 1;
                            }
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

            // Gmail OAuth state for handling Gmail OAuth 2.0 flows
            let gmail_oauth_state = GmailOAuthState::new();
            match crate::data::db::encryption::open_encrypted_connection(
                &db_path.to_string_lossy(),
                &db_encryption_key,
            ) {
                Ok(gmail_conn) => {
                    match crate::sys::commands::gmail_oauth::load_persisted_gmail_accounts(&gmail_conn) {
                        Ok(accounts) => {
                            let mut restored = 0usize;
                            for (account_id, info, _) in accounts {
                                if let Err(e) = gmail_oauth_state
                                    .manager
                                    .upsert_account(account_id, info, None) {
                                    tracing::warn!("Failed to restore Gmail account: {e}");
                                } else {
                                    restored += 1;
                                }
                            }
                            tracing::info!("Gmail OAuth manager restored {restored} account(s)");
                        }
                        Err(err) => {
                            tracing::warn!("Failed to load Gmail accounts: {err}");
                        }
                    }
                }
                Err(err) => {
                    tracing::warn!("Failed to open database for Gmail restore: {err}");
                }
            }
            app.manage(gmail_oauth_state);

            let session_manager = crate::features::terminal::SessionManager::new(app.handle().clone());
            app.manage(session_manager.clone());


            let terminal_llm_router = Arc::new(crate::core::llm::LLMRouter::new());


            let terminal_ai = crate::features::terminal::TerminalAI::new(
                terminal_llm_router,
                Arc::new(session_manager),
            );
            app.manage(terminal_ai);

            // LLMRouter for prompt completion feature (ghost text suggestions)
            let completion_router = Arc::new(tokio::sync::Mutex::new(crate::core::llm::LLMRouter::new()));
            app.manage(completion_router);


            app.manage(ProductivityState::new());


            app.manage(DocumentState::new());

            // Persistent memory state for AGI cross-session memory
            match MemoryState::new(&db_path.to_string_lossy()) {
                Ok(memory_state) => {
                    app.manage(memory_state);
                    tracing::info!("Memory manager initialized");
                }
                Err(e) => {
                    tracing::warn!("Failed to initialize memory manager: {}. Memory features may be degraded.", e);
                    app.manage(MemoryState::new_degraded());
                }
            }

            // Knowledge base state
            app.manage(crate::sys::commands::knowledge::KnowledgeState::new());

            // Project-scoped memory state for project-specific long-term memories
            match ProjectMemoryState::new(&db_path.to_string_lossy()) {
                Ok(project_memory_state) => {
                    app.manage(project_memory_state);
                    tracing::info!("Project memory manager initialized");
                }
                Err(e) => {
                    tracing::warn!("Failed to initialize project memory manager: {}. Project memory features may be degraded.", e);
                    app.manage(ProjectMemoryState::new_degraded());
                }
            }

            // On macOS, only initialize AutomationService when accessibility
            // permission is already granted.  Calling AutomationService::new()
            // without the grant triggers AXUIElementCreateSystemWide / CGEventTap
            // which causes the OS to show the "would like to control this computer"
            // dialog on every launch.
            #[cfg(target_os = "macos")]
            {
                if accessibility_is_trusted() {
                    match crate::automation::AutomationService::new() {
                        Ok(automation_service) => {
                            app.manage(Some(std::sync::Arc::new(automation_service)));
                            tracing::info!("Automation service initialized");
                        }
                        Err(e) => {
                            tracing::warn!("Failed to initialize automation service: {}. Automation features may be degraded.", e);
                            app.manage(None::<std::sync::Arc<crate::automation::AutomationService>>);
                        }
                    }
                } else {
                    tracing::info!("Accessibility permission not yet granted; AutomationService deferred until permission is obtained");
                    app.manage(None::<std::sync::Arc<crate::automation::AutomationService>>);
                }
            }
            #[cfg(not(target_os = "macos"))]
            {
                match crate::automation::AutomationService::new() {
                    Ok(automation_service) => {
                        app.manage(Some(std::sync::Arc::new(automation_service)));
                        tracing::info!("Automation service initialized");
                    }
                    Err(e) => {
                        tracing::warn!("Failed to initialize automation service: {}. Automation features may be degraded.", e);
                        app.manage(None::<std::sync::Arc<crate::automation::AutomationService>>);
                    }
                }
            }


            let mcp_state = McpState::new();
            app.manage(mcp_state);

            // Initialize MCP system and auto-connect configured servers
            let app_clone = app.handle().clone();
            async_runtime::spawn(async move {
                let mcp_state_ref: tauri::State<McpState> = app_clone.state();
                match crate::sys::commands::mcp::mcp_initialize(mcp_state_ref, app_clone.clone())
                    .await
                {
                    Ok(message) => {
                        tracing::info!("MCP initialization: {}", message);
                    }
                    Err(e) => {
                        tracing::error!("MCP initialization failed: {}. MCP tools will not be available.", e);
                    }
                }
            });

            // MCP OAuth state for handling OAuth flows (GitHub, Google Drive, Slack)
            app.manage(McpOAuthState::new());

            // MCP Bundle (MCPB) state for bundle management
            app.manage(McpbState::new());

            // MCP Extensions state for desktop extension management
            let mcp_state_ref: tauri::State<McpState> = app.state();
            let mcp_client = mcp_state_ref.client.clone();
            match McpExtensionsState::new(db_conn_arc.clone(), mcp_client.clone()) {
                Ok(extensions_state) => {
                    app.manage(extensions_state);
                    tracing::info!("MCP Extensions state initialized");
                }
                Err(e) => {
                    tracing::warn!("Failed to initialize MCP Extensions: {}. Extension features may be degraded.", e);
                    app.manage(McpExtensionsState::new_degraded(mcp_client));
                }
            }

            // Undo manager state for reversing AGI actions
            app.manage(UndoState::new());

            // Notification state for scheduled notifications
            app.manage(NotificationState::new());

            // Scheduler state for proactive task scheduling
            let scheduler_state = SchedulerState::new();
            app.manage(scheduler_state);
            tracing::info!("Scheduler initialized");

            // Skills manager for AGI skill context
            app.manage(SkillsState::default());
            tracing::info!("Skills manager initialized");

            // Research orchestration state for multi-source investigation
            app.manage(ResearchState::new());
            tracing::info!("Research state initialized");

            // Initialize AGI Orchestrator on startup for agent mode routing
            let app_for_orchestrator = app.handle().clone();
            async_runtime::spawn(async move {
                let automation_state_ref: tauri::State<
                    Option<std::sync::Arc<crate::automation::AutomationService>>,
                > = app_for_orchestrator.state();
                let llm_state_ref: tauri::State<LLMState> = app_for_orchestrator.state();
                match crate::sys::commands::orchestrator_init_default(
                    automation_state_ref,
                    llm_state_ref,
                    app_for_orchestrator.clone()
                ).await {
                    Ok(_) => {
                        tracing::info!("AGI Orchestrator initialized successfully");
                    }
                    Err(e) => {
                        tracing::warn!("Failed to initialize AGI Orchestrator: {}. Agent mode may not work until manually initialized.", e);
                    }
                }
            });

            // Messaging state for Discord, Telegram, Signal integrations
            app.manage(crate::sys::commands::messaging::MessagingState::default());
            tracing::info!("Messaging state initialized");

            // Canvas state manager for visual canvas/A2UI operations
            app.manage(crate::sys::commands::canvas::CanvasStateManager::default());
            tracing::info!("Canvas state manager initialized");

            // Diagnostics state for /doctor command
            app.manage(DiagnosticsState::new());
            tracing::info!("Diagnostics state initialized");

            // Tool Confirmation state for safety tier confirmation dialogs
            app.manage(ToolConfirmationState::new());
            tracing::info!("Tool confirmation state initialized");

            // Artifact state for live previews and versioned artifacts
            app.manage(crate::sys::commands::artifacts::ArtifactState::new());
            tracing::info!("Artifact state initialized");

            // Background Agent Manager for "&" prefix background tasks
            {
                use crate::core::agent::{BackgroundAgentManager, BackgroundAgentManagerState};
                use crate::sys::commands::llm::LLMState;

                // Retrieve the LLM router and automation service Arcs for background agent use.
                // These are managed earlier in this setup block (LLMState at ~line 206,
                // AutomationService at ~line 358), so ordering is safe.
                let llm_state: tauri::State<LLMState> = app.state();
                let router = Some(llm_state.router.clone());

                let automation_state: tauri::State<Option<std::sync::Arc<crate::automation::AutomationService>>> = app.state();
                let automation = automation_state.inner().clone();

                let bg_agent_manager = BackgroundAgentManager::new(
                    db_conn_arc.clone(),
                    router,
                    automation,
                );
                let mut bg_manager_with_handle = bg_agent_manager;
                bg_manager_with_handle.set_app_handle(app.handle().clone());
                let bg_state = BackgroundAgentManagerState::new(bg_manager_with_handle);

                // Initialize and restore any persisted agents
                let bg_state_clone = bg_state.0.clone();
                tauri::async_runtime::spawn(async move {
                    let manager = bg_state_clone.read().await;
                    if let Err(e) = manager.initialize().await {
                        tracing::warn!("Failed to initialize background agent manager: {}. Background agent features may be degraded.", e);
                    }
                });

                app.manage(bg_state);
                tracing::info!("Background Agent Manager initialized");
            }

            // Thinking state for extended thinking mode
            app.manage(crate::sys::commands::thinking::ThinkingState::new());
            tracing::info!("Thinking state initialized");

            // Intent detection state for intelligent routing
            app.manage(IntentState::new());
            tracing::info!("Intent detection state initialized");

            // Project context state for active folder selection
            app.manage(crate::sys::commands::project_context::ProjectContextState::new());
            tracing::info!("Project context state initialized");

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


            let cache_conn = crate::data::db::encryption::open_encrypted_connection(
                &db_path.to_string_lossy(),
                &db_encryption_key,
            ).map_err(|e| anyhow::anyhow!("Failed to open database for codebase cache: {}", e))?;
            let codebase_cache = crate::data::cache::CodebaseCache::new(Arc::new(Mutex::new(cache_conn)))
                    .context("Failed to initialize codebase cache")?;
            app.manage(crate::sys::commands::cache::CodebaseCacheState(Arc::new(codebase_cache)));


            app.manage(BillingStateWrapper::new());


            let workflow_engine_state = WorkflowEngineState::new(db_path.to_string_lossy().to_string());
            app.manage(workflow_engine_state);


            let marketplace_conn = crate::data::db::encryption::open_encrypted_connection(
                &db_path.to_string_lossy(),
                &db_encryption_key,
            ).map_err(|e| anyhow::anyhow!("Failed to open database for marketplace: {}", e))?;
            app.manage(crate::sys::commands::marketplace::MarketplaceState {
                    db: Arc::new(Mutex::new(marketplace_conn)),
                });


            let template_conn = crate::data::db::encryption::open_encrypted_connection(
                &db_path.to_string_lossy(),
                &db_encryption_key,
            ).map_err(|e| anyhow::anyhow!("Failed to open database for template manager: {}", e))?;
            let template_db = Arc::new(Mutex::new(template_conn));
            let template_manager = crate::sys::commands::templates::initialize_template_manager(template_db)
                .map_err(|e| anyhow::anyhow!("Failed to initialize template manager: {}", e))?;
            app.manage(TemplateManagerState {
                manager: Arc::new(Mutex::new(template_manager)),
            });


            let presence_db = Arc::new(tokio::sync::Mutex::new(
                crate::data::db::encryption::open_encrypted_connection(
                    &db_path.to_string_lossy(),
                    &db_encryption_key,
                ).map_err(|e| anyhow::anyhow!("Failed to open database for presence: {}", e))?,
            ));
            let presence_manager = Arc::new(crate::integrations::realtime::PresenceManager::new(presence_db));
            // Allow overriding the WebSocket port via environment variable for custom deployments
            let websocket_port: u16 = std::env::var("AGI_REALTIME_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(8787);

            // Generate secure token for realtime auth
            let realtime_token = uuid::Uuid::new_v4().to_string();
            // Write token to file for Native Host to read
            if let Err(e) = std::fs::write(app_data_dir.join(".ipc_token"), &realtime_token) {
                tracing::error!("Failed to write .ipc_token: {}", e);
            }
            // Restrict .ipc_token to owner-only read/write (0600)
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(
                    app_data_dir.join(".ipc_token"),
                    std::fs::Permissions::from_mode(0o600),
                );
            }

            let realtime_server = Arc::new(crate::integrations::realtime::RealtimeServer::new(
                presence_manager.clone(),
                realtime_token.clone(),
                Some(app.handle().clone()),
            ));
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
                realtime_token,
            ));
            let metrics_db = Arc::new(Mutex::new(
                crate::data::db::encryption::open_encrypted_connection(
                    &db_path.to_string_lossy(),
                    &db_encryption_key,
                ).map_err(|e| anyhow::anyhow!("Failed to open database for metrics: {}", e))?,
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
                    tracing::warn!("Failed to initialize embedding service: {}. Embedding features may be degraded.", e);
                    match crate::core::embeddings::EmbeddingService::new_degraded() {
                        Ok(degraded) => {
                            app.manage(EmbeddingServiceState(Arc::new(TokioMutex::new(degraded))));
                        }
                        Err(e2) => {
                            tracing::error!("Failed to create degraded embedding service: {}. Embedding commands will panic if invoked.", e2);
                        }
                    }
                }
            }


            app.manage(crate::sys::commands::HookRegistryState::new());


            app.manage(crate::sys::commands::PromptEnhancementState::new());

            // Initialize notification center state
            app.manage(crate::sys::commands::NotificationCenterState::new());

            let task_db_conn = Arc::new(Mutex::new(
                crate::data::db::encryption::open_encrypted_connection(
                    &db_path.to_string_lossy(),
                    &db_encryption_key,
                ).map_err(|e| anyhow::anyhow!("Failed to open database for task manager: {}", e))?,
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


            match AppState::load(app.handle()) {
                Ok(state) => {
                    app.manage(state);
                }
                Err(e) => {
                    tracing::warn!("Failed to load AppState: {}. Using default window state.", e);
                    app.manage(AppState::default());
                }
            }


            if let Err(err) = build_system_tray(app) {
                eprintln!("[tray] initialization failed: {err:?}");
            }

            // Initialize global shortcuts (Option+Space, etc.)
            // On macOS, global shortcuts rely on CGEventTap which requires
            // the Accessibility permission (kTCCServiceAccessibility).  Registering
            // without the grant triggers the OS permission dialog on every launch.
            // We defer registration until the user explicitly grants permission.
            #[cfg(target_os = "macos")]
            {
                if accessibility_is_trusted() {
                    if let Err(err) = crate::sys::commands::shortcuts::init_global_shortcuts(app.handle()) {
                        eprintln!("[shortcuts] global shortcuts initialization failed: {err:?}");
                    }
                } else {
                    tracing::info!("Accessibility permission not yet granted; global shortcuts deferred until permission is obtained");
                }
            }
            #[cfg(not(target_os = "macos"))]
            {
                if let Err(err) = crate::sys::commands::shortcuts::init_global_shortcuts(app.handle()) {
                    eprintln!("[shortcuts] global shortcuts initialization failed: {err:?}");
                }
            }

            if let Some(window) = app.get_webview_window("main") {
                if let Err(err) = initialize_window(&window) {
                    eprintln!("[window] initialization failed: {err:?}");
                }
            }

            Ok(())
        })
        // COMMAND REGISTRATION POLICY:
        // All Tauri IPC commands MUST be registered in this generate_handler![...] block.
        // The macro-based registry.rs file has been DELETED as it was a dead alternative
        // that caused missed registrations. This flat list is the SOLE source of truth.
        // When adding a new command:
        //   1. Implement the fn with #[tauri::command] in sys/commands/<domain>.rs
        //   2. pub use it from sys/commands/mod.rs
        //   3. Add crate::sys::commands::<fn_name>, here
        //   4. Run: bash apps/desktop/check-wiring.sh
        .invoke_handler(tauri::generate_handler![





            crate::sys::commands::agi_init,
            crate::sys::commands::agi_submit_goal,
            crate::sys::commands::agi_submit_goal_parallel,
            crate::sys::commands::agi_submit_goal_swarm,
            crate::sys::commands::agi_submit_goal_auto,
            crate::sys::commands::agi_should_use_swarm,
            crate::sys::commands::agi_get_goal_status,
            crate::sys::commands::agi_list_goals,
            crate::sys::commands::agi_stop,
            crate::sys::commands::agi_cancel_goal,
            crate::sys::commands::start_agent_task,

            // Reflection Engine
            crate::sys::commands::agi_get_reflection_insights,
            crate::sys::commands::agi_get_failure_patterns,
            crate::sys::commands::agi_get_suggested_corrections,
            crate::sys::commands::agi_get_sub_goals,
            crate::sys::commands::agi_get_recommendations,

            crate::sys::commands::auth_store_session,
            crate::sys::commands::auth_retrieve_session,
            crate::sys::commands::auth_remove_session,


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

            // Timeout config commands
            crate::sys::commands::timeout_get_config,
            crate::sys::commands::timeout_set_config,
            crate::sys::commands::timeout_get_recommended,


            crate::sys::commands::query_knowledge,
            crate::sys::commands::get_recent_knowledge,
            crate::sys::commands::get_knowledge_by_category,

            // Knowledge base commands
            crate::sys::commands::knowledge_add,
            crate::sys::commands::knowledge_query,


            crate::sys::commands::ai_analyze_project,
            crate::sys::commands::ai_add_constraint,
            crate::sys::commands::ai_generate_code,
            crate::sys::commands::ai_refactor_code,
            crate::sys::commands::ai_generate_tests,
            crate::sys::commands::ai_get_project_context,
            crate::sys::commands::ai_generate_context_prompt,
            crate::sys::commands::ai_access_file,

            // Completion / Ghost Text
            crate::sys::commands::get_code_completion,
            crate::sys::commands::get_inline_completion,
            crate::sys::commands::get_prompt_completion,


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
            crate::sys::commands::window_toggle_floating,
            crate::sys::commands::window_open_floating,
            crate::sys::commands::window_close_floating,
            crate::sys::commands::window_is_floating_visible,
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
            crate::sys::commands::cancel_tool_execution,
            crate::sys::commands::chat_add_pending_message,
            crate::sys::commands::chat_get_pending_messages,
            crate::sys::commands::chat_clear_pending_messages,
            crate::sys::commands::chat_pop_pending_message,
            crate::sys::commands::chat_get_conversation_stats,
            crate::sys::commands::chat_get_cost_overview,
            crate::sys::commands::chat_get_cost_analytics,

            crate::sys::commands::chat_set_monthly_budget,
            crate::sys::commands::chat_detect_intent,
            crate::sys::commands::chat_is_stop_command,
            crate::sys::commands::chat_handle_stop,
            crate::sys::commands::chat_compact_context,
            crate::sys::commands::chat::clear_local_database,
            crate::sys::commands::search_chat_history,
            crate::sys::commands::search_chat_history_semantic,
            crate::sys::commands::conversation_export,
            crate::sys::commands::conversation_export_pdf,
            crate::sys::commands::conversation_fork,
            crate::sys::commands::conversation_list_branches,
            crate::sys::commands::conversation_switch_branch,
            crate::sys::commands::conversation_delete_branch,


            crate::sys::commands::checkpoint_create,
            crate::sys::commands::checkpoint_restore,
            crate::sys::commands::checkpoint_list,
            crate::sys::commands::checkpoint_delete,

            // AGI Checkpoint Management
            crate::sys::commands::agi_checkpoint_save,
            crate::sys::commands::agi_checkpoint_get_latest,
            crate::sys::commands::agi_checkpoint_get,
            crate::sys::commands::agi_checkpoint_list,
            crate::sys::commands::agi_checkpoint_delete,
            crate::sys::commands::agi_checkpoint_restore_history,
            crate::sys::commands::agi_checkpoint_record_restore,
            crate::sys::commands::agi_checkpoint_cleanup,
            crate::sys::commands::agi_checkpoint_init,


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
            crate::sys::commands::email_move_message,
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

            // Gmail OAuth
            crate::sys::commands::gmail_oauth_start,
            crate::sys::commands::gmail_oauth_complete,
            crate::sys::commands::gmail_oauth_refresh,
            crate::sys::commands::gmail_oauth_list_accounts,
            crate::sys::commands::gmail_oauth_disconnect,
            crate::sys::commands::gmail_oauth_get_account,

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
            crate::sys::commands::browser_check_status,
            crate::sys::commands::browser_launch,
            crate::sys::commands::browser_open_tab,
            crate::sys::commands::browser_close_tab,
            crate::sys::commands::browser_switch_tab,
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
            crate::sys::commands::browser_get_content,
            crate::sys::commands::browser_get_dom_snapshot,
            crate::sys::commands::browser_get_console_logs,
            crate::sys::commands::browser_get_network_activity,
            crate::features::search::web_search::web_search,


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
            // Git Conflict Resolution
            crate::sys::commands::git_list_conflicts,
            crate::sys::commands::git_get_conflict_details,
            crate::sys::commands::git_resolve_conflict,
            crate::sys::commands::git_mark_resolved,
            crate::sys::commands::git_get_conflict_suggestion_prompt,
            crate::sys::commands::git_has_conflicts,
            crate::sys::commands::git_abort_merge,
            crate::sys::commands::git_complete_merge,
            // Git PR Creation
            crate::sys::commands::git_get_branch_diff_summary,
            crate::sys::commands::git_generate_pr_description,
            crate::sys::commands::git_create_pr,
            crate::sys::commands::git_check_pr_readiness,
            crate::sys::commands::git_current_branch,
            crate::sys::commands::git_default_branch,


            crate::sys::commands::design_generate_css,
            crate::sys::commands::design_apply_css,
            crate::sys::commands::design_get_element_styles,
            crate::sys::commands::design_generate_color_scheme,
            crate::sys::commands::design_suggest_improvements,
            crate::sys::commands::design_tokens_to_css,
            crate::sys::commands::design_check_accessibility,


            crate::sys::commands::media_generate_image,
            crate::sys::commands::media_generate_video,
            crate::sys::commands::media_get_history,


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
            crate::sys::commands::llm_ensure_managed_cloud,
            crate::sys::commands::llm_get_available_models,
            crate::sys::commands::llm_check_provider_status,
            crate::sys::commands::llm_get_usage_stats,
            crate::sys::commands::router_suggestions,
            crate::sys::commands::get_model_capabilities,
            crate::sys::commands::clear_model_capability_cache,


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


            crate::sys::commands::settings_load,
            crate::sys::commands::settings_save,
            crate::sys::commands::settings_load_from_disk,
            crate::sys::commands::settings_v2_get,
            crate::sys::commands::settings_v2_set,
            crate::sys::commands::settings_v2_get_batch,
            crate::sys::commands::settings_v2_delete,
            crate::sys::commands::settings_v2_get_category,

            // Custom Instructions
            crate::sys::commands::save_custom_instructions,
            crate::sys::commands::load_custom_instructions,

            crate::sys::account::device_link_initiate,
            crate::sys::account::device_link_poll,
            crate::sys::account::fetch_user_profile,
            crate::sys::account::oauth_refresh,
            crate::sys::account::fetch_credit_balance,
            crate::sys::account::report_llm_usage,
            crate::sys::account::account_store_api_base_url,
            crate::sys::account::account_store_access_token,
            crate::sys::account::account_store_refresh_token,
            crate::sys::account::account_clear_tokens,


            crate::sys::commands::create_team,
            crate::sys::commands::get_team,
            crate::sys::commands::update_team,
            crate::sys::commands::update_team_settings,
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
            crate::sys::commands::settings_v2_load_app_settings,
            crate::sys::commands::settings_v2_save_app_settings,
            crate::sys::commands::settings_v2_clear_cache,
            crate::sys::commands::settings_v2_list_all,
            crate::sys::commands::feedback::submit_feedback,
            crate::sys::commands::feedback::get_filtered_logs,


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

            // Ollama
            crate::sys::commands::ollama_check_status,
            crate::sys::commands::ollama_list_models,
            crate::sys::commands::ollama_get_model_info,
            crate::sys::commands::ollama_pull_model,
            crate::sys::commands::ollama_delete_model,

            crate::sys::commands::vision_analyze_screenshot,
            crate::sys::commands::vision_extract_text,
            crate::sys::commands::vision_compare_images,
            crate::sys::commands::vision_locate_element,
            crate::sys::commands::vision_describe_ui_elements,
            crate::sys::commands::vision_answer_question,

            // Screen Watcher (periodic screenshots for AGI awareness)
            crate::sys::commands::screen_watcher_start,
            crate::sys::commands::screen_watcher_stop,
            crate::sys::commands::screen_watcher_pause,
            crate::sys::commands::screen_watcher_resume,
            crate::sys::commands::screen_watcher_status,
            crate::sys::commands::screen_watcher_get_latest,
            crate::sys::commands::screen_watcher_get_recent,
            crate::sys::commands::screen_watcher_capture_now,

            // Native Messaging (browser extension communication)
            crate::sys::commands::native_messaging_check_status,
            crate::sys::commands::native_messaging_install,
            crate::sys::commands::native_messaging_uninstall,
            crate::sys::commands::native_messaging_set_extension_id,
            crate::sys::commands::native_messaging_get_connection_state,

            crate::sys::commands::file_read,
            crate::sys::commands::file_write,
            crate::sys::commands::file_delete,
            crate::sys::commands::file_rename,
            crate::sys::commands::file_copy,
            crate::sys::commands::file_move,
            crate::sys::commands::file_exists,
            crate::sys::commands::file_metadata,
            crate::sys::commands::file_open_with_default_app,
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
            crate::sys::commands::terminal_clear_history,
            crate::sys::commands::terminal_set_env,
            crate::sys::commands::terminal_get_env,
            crate::sys::commands::terminal_list_env,
            crate::sys::commands::terminal_unset_env,


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
            crate::sys::commands::db_store_password,
            crate::sys::commands::db_has_stored_password,
            crate::sys::commands::db_get_stored_password,
            crate::sys::commands::db_delete_stored_password,


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
            // Memory commands (persistent cross-session memory)
            crate::sys::commands::memory_remember,
            crate::sys::commands::memory_recall,
            crate::sys::commands::memory_search,
            crate::sys::commands::memory_get_by_category,
            crate::sys::commands::memory_get_important,
            crate::sys::commands::memory_forget,
            crate::sys::commands::memory_forget_topic,
            crate::sys::commands::memory_log_context,
            crate::sys::commands::memory_get_daily_logs,
            crate::sys::commands::memory_get_session_context,
            crate::sys::commands::memory_export_all,
            crate::sys::commands::memory_cleanup_logs,
            // Frontend compatibility aliases
            crate::sys::commands::memory_store,
            crate::sys::commands::memory_delete,
            crate::sys::commands::memory_list_all,
            crate::sys::commands::memory_list_categories,
            // Memory decay commands
            crate::sys::commands::memory_run_decay,
            crate::sys::commands::memory_get_decay_config,
            crate::sys::commands::memory_set_decay_config,
            crate::sys::commands::memory_get_decay_candidates,
            crate::sys::commands::memory_boost_on_access,
            crate::sys::commands::memory_recall_with_boost,
            crate::sys::commands::memory_decay_single,
            crate::sys::commands::memory_get_stats,
            // Memory compaction commands
            crate::sys::commands::memory_get_compaction_candidates,
            crate::sys::commands::memory_get_logs_in_range,
            crate::sys::commands::memory_compact_old_logs,
            crate::sys::commands::memory_promote_extracted,
            crate::sys::commands::memory_archive_compacted_logs,
            crate::sys::commands::memory_get_extraction_prompt,
            crate::sys::commands::memory_get_compaction_stats,
            // Memory export/import commands
            crate::sys::commands::memory_export_json,
            crate::sys::commands::memory_export_markdown,
            crate::sys::commands::memory_import_json,
            // Memory dashboard commands
            crate::sys::commands::memory_get_dashboard_stats,
            crate::sys::commands::memory_get_project_memories,
            crate::sys::commands::memory_get_usage_trends,
            crate::sys::commands::memory_suggest_important,

            // Project Memory Commands (project-scoped long-term memory)
            crate::sys::commands::project_memory::save_project_context,
            crate::sys::commands::project_memory::get_project_context,
            crate::sys::commands::project_memory::save_coding_style,
            crate::sys::commands::project_memory::get_coding_styles,
            crate::sys::commands::project_memory::save_architectural_decision,
            crate::sys::commands::project_memory::get_architectural_decisions,
            crate::sys::commands::project_memory::get_project_memories,
            crate::sys::commands::project_memory::search_project_memories,
            crate::sys::commands::project_memory::update_memory_importance,
            crate::sys::commands::project_memory::delete_project_memory,
            crate::sys::commands::project_memory::clear_project_memories,
            crate::sys::commands::project_memory::get_project_memory_stats,
            crate::sys::commands::project_memory::auto_save_decision,

            // Chat-Memory Integration Commands
            crate::sys::commands::chat_memory_integration::chat_load_project_memories,
            crate::sys::commands::chat_memory_integration::chat_detect_and_save_decision,
            crate::sys::commands::chat_memory_integration::chat_save_decision,
            crate::sys::commands::chat_memory_integration::chat_configure_memory_injection,
            crate::sys::commands::chat_memory_integration::chat_get_memory_dashboard,
            crate::sys::commands::chat_memory_integration::chat_suggest_memories_for_review,
            crate::sys::commands::chat_memory_integration::chat_prefetch_session_memories,
            crate::sys::commands::chat_memory_integration::chat_log_milestone,
            crate::sys::commands::chat_memory_integration::chat_log_action,
            crate::sys::commands::chat_memory_integration::chat_recall_memory,
            crate::sys::commands::chat_memory_integration::chat_search_memories,

            crate::sys::commands::mcp_initialize,
            crate::sys::commands::mcp_list_servers,
            crate::sys::commands::mcp_get_registry,
            crate::sys::commands::mcp_install_server,
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
            crate::sys::commands::mcp_set_credential,
            crate::sys::commands::mcp_delete_credential,
            crate::sys::commands::mcp_update_filesystem_directories,

            // MCP OAuth
            crate::sys::commands::mcp_oauth_start,
            crate::sys::commands::mcp_oauth_callback,
            crate::sys::commands::mcp_oauth_status,
            crate::sys::commands::mcp_oauth_disconnect,
            crate::sys::commands::mcp_oauth_refresh,
            crate::sys::commands::mcp_oauth_set_credentials,
            crate::sys::commands::mcp_list_connected_providers,
            crate::sys::commands::mcp_connect_connector,
            crate::sys::commands::save_api_key,

            // MCPB (MCP Bundles)
            crate::sys::commands::mcpb_fetch_registry,
            crate::sys::commands::mcpb_search_bundles,
            crate::sys::commands::mcpb_get_bundle_details,
            crate::sys::commands::mcpb_install_bundle,
            crate::sys::commands::mcpb_uninstall_bundle,
            crate::sys::commands::mcpb_get_installed_bundles,
            crate::sys::commands::mcpb_check_updates,
            crate::sys::commands::mcpb_update_bundle,
            crate::sys::commands::mcpb_get_categories,
            crate::sys::commands::mcpb_get_featured,

            // MCP Extensions (Desktop Extensions)
            crate::sys::commands::extension_list,
            crate::sys::commands::extension_get,
            crate::sys::commands::extension_install,
            crate::sys::commands::extension_uninstall,
            crate::sys::commands::extension_enable,
            crate::sys::commands::extension_disable,
            crate::sys::commands::extension_get_config,
            crate::sys::commands::extension_set_config,
            crate::sys::commands::extension_validate,
            crate::sys::commands::extension_list_by_status,
            crate::sys::commands::extension_start_all,
            crate::sys::commands::extension_stop_all,
            crate::sys::commands::extension_get_directory,
            crate::sys::commands::extension_select_package,
            crate::sys::commands::extension_page_context,
            crate::sys::commands::extension_analyze_forms,
            crate::sys::commands::extension_task_result,
            crate::sys::commands::extension_status,


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
            crate::sys::commands::computer_use_zoom_region,
            crate::sys::commands::computer_use_zoom_at_point,
            crate::sys::commands::computer_use_suggest_zoom_level,
            crate::sys::commands::continuous_job_runner_start,
            crate::sys::commands::continuous_job_runner_stop,
            crate::sys::commands::continuous_job_runner_status,


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
            crate::sys::commands::voice_check_local_whisper,


            crate::sys::commands::shortcuts_register,
            crate::sys::commands::shortcuts_unregister,
            crate::sys::commands::shortcuts_list,
            crate::sys::commands::shortcuts_update,
            crate::sys::commands::shortcuts_trigger,
            crate::sys::commands::shortcuts_reset,
            crate::sys::commands::shortcuts_check_key,
            crate::sys::commands::shortcuts_get_defaults,
            crate::sys::commands::shortcuts_register_global,
            crate::sys::commands::shortcuts_unregister_global,

            // Skills
            crate::sys::commands::skill_list,
            crate::sys::commands::skill_get,
            crate::sys::commands::skill_get_instructions,
            crate::sys::commands::skill_check_requirements,
            crate::sys::commands::skill_get_context,
            crate::sys::commands::skill_set_workspace,
            crate::sys::commands::skill_count,
            crate::sys::commands::skill_invoke,
            crate::sys::commands::skill_parse_slash_command,
            crate::sys::commands::skill_get_slash_commands,
            crate::sys::commands::skill_reload,
            crate::sys::commands::skill_match_for_message,

            // Messaging (Discord, Telegram, Signal)
            crate::sys::commands::messaging::messaging_connect_discord,
            crate::sys::commands::messaging::messaging_connect_telegram,
            crate::sys::commands::messaging::messaging_connect_signal,
            crate::sys::commands::messaging::messaging_send,
            crate::sys::commands::messaging::messaging_get_status,
            crate::sys::commands::messaging::messaging_disconnect,

            // Voice (TTS, Wake Word, PTT)
            crate::sys::commands::voice::voice_get_capabilities,
            crate::sys::commands::voice::voice_tts_speak,
            crate::sys::commands::voice::voice_tts_list_voices,
            crate::sys::commands::voice::voice_tts_configure,
            crate::sys::commands::voice::voice_wake_enable,
            crate::sys::commands::voice::voice_wake_disable,
            crate::sys::commands::voice::voice_wake_status,
            crate::sys::commands::voice::voice_wake_configure,
            crate::sys::commands::voice::voice_ptt_configure,
            crate::sys::commands::voice::voice_ptt_state,
            crate::sys::commands::voice::voice_ptt_key_down,
            crate::sys::commands::voice::voice_ptt_key_up,
            // Local Whisper STT
            crate::sys::commands::voice::voice_download_whisper_model,
            crate::sys::commands::voice::voice_list_whisper_models,
            crate::sys::commands::voice::voice_set_whisper_model,
            crate::sys::commands::voice::voice_delete_whisper_model,
            crate::sys::commands::voice::voice_transcribe_local,
            // Local Piper TTS
            crate::sys::commands::voice::voice_download_piper_voice,
            crate::sys::commands::voice::voice_list_piper_voices,
            crate::sys::commands::voice::voice_set_piper_voice,
            crate::sys::commands::voice::voice_delete_piper_voice,
            crate::sys::commands::voice::voice_tts_speak_local,
            crate::sys::commands::voice::voice_download_piper_binary,
            crate::sys::commands::voice::voice_check_piper_binary,
            crate::sys::commands::voice::voice_list_local_models,
            // Wispr Flow speech recording stubs
            crate::sys::commands::voice::speech_start_recording,
            crate::sys::commands::voice::speech_stop_and_transcribe,

            // Canvas (Visual Canvas / A2UI)
            crate::sys::commands::canvas::canvas_create,
            crate::sys::commands::canvas::canvas_get,
            crate::sys::commands::canvas::canvas_list,
            crate::sys::commands::canvas::canvas_destroy,
            crate::sys::commands::canvas::canvas_set_active,
            crate::sys::commands::canvas::canvas_get_active,
            crate::sys::commands::canvas::canvas_add_element,
            crate::sys::commands::canvas::canvas_remove_element,
            crate::sys::commands::canvas::canvas_update_element,
            crate::sys::commands::canvas::canvas_clear,
            crate::sys::commands::canvas::canvas_export,
            crate::sys::commands::canvas::canvas_a2ui_execute,
            crate::sys::commands::canvas::canvas_add_text,

            // System automation permissions (macOS Accessibility, Screen Recording)
            crate::sys::commands::check_automation_permissions,
            crate::sys::commands::request_automation_permission,

            // Notifications (OS-level desktop notifications)
            crate::sys::commands::notification_check_permission,
            crate::sys::commands::notification_request_permission,
            crate::sys::commands::notification_show,
            crate::sys::commands::notification_show_with_actions,
            crate::sys::commands::notification_schedule,
            crate::sys::commands::notification_schedule_reminder,
            crate::sys::commands::notification_cancel,
            crate::sys::commands::notification_cancel_all,
            crate::sys::commands::notification_get_scheduled,
            crate::sys::commands::notification_get,
            crate::sys::commands::notification_update,
            crate::sys::commands::notification_register_actions,

            // Notification Center (in-app notification system)
            crate::sys::commands::notification_center::notification_list,
            crate::sys::commands::notification_center::notification_mark_read,
            crate::sys::commands::notification_center::notification_mark_all_read,
            crate::sys::commands::notification_center::notification_delete,
            crate::sys::commands::notification_center::notification_delete_all_read,
            crate::sys::commands::notification_center::notification_get_settings,
            crate::sys::commands::notification_center::notification_set_settings,
            crate::sys::commands::notification_center::notification_create,
            crate::sys::commands::notification_center::notification_unread_count,

            // Scheduler (proactive task scheduling with cron expressions)
            crate::sys::commands::scheduler_add_job,
            crate::sys::commands::scheduler_remove_job,
            crate::sys::commands::scheduler_list_jobs,
            crate::sys::commands::scheduler_pause_job,
            crate::sys::commands::scheduler_resume_job,
            crate::sys::commands::scheduler_get_job,
            crate::sys::commands::scheduler_get_next_runs,

            // Research (multi-source investigation with citations)
            crate::sys::commands::research_start,
            crate::sys::commands::research_cancel,
            crate::sys::commands::research_get_config,
            crate::sys::commands::research_set_config,
            crate::sys::commands::research_get_modes,
            crate::sys::commands::research_quick,
            crate::sys::commands::research_check_availability,

            // Intent Detection (intelligent routing and tool selection)
            crate::sys::commands::intent::intent_detect,
            crate::sys::commands::intent::intent_detect_with_llm,
            crate::sys::commands::intent::intent_create_routing_plan,
            crate::sys::commands::intent::intent_check_quick_win,
            crate::sys::commands::intent::intent_get_categories,
            crate::sys::commands::intent::intent_extract_entities,
            crate::sys::commands::intent::intent_get_complexity_levels,
            crate::sys::commands::intent::intent_detect_batch,
            crate::sys::commands::intent::intent_configure,

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

            // Projects
            crate::sys::commands::project_create,
            crate::sys::commands::project_list,
            crate::sys::commands::project_get,
            crate::sys::commands::project_update,
            crate::sys::commands::project_delete,
            crate::sys::commands::project_get_settings,
            crate::sys::commands::project_update_settings,

            // Project Context (active folder selection)
            crate::sys::commands::project_context_set_folder,
            crate::sys::commands::project_context_get_folder,
            crate::sys::commands::project_context_validate_path,
            crate::sys::commands::project_context_list_files,
            crate::sys::commands::project_context_get_summary,

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
            crate::sys::commands::publish_workflow,
            crate::sys::commands::unpublish_workflow,
            crate::sys::commands::get_featured_workflows,
            crate::sys::commands::get_trending_workflows,
            crate::sys::commands::search_marketplace_workflows,
            crate::sys::commands::get_published_workflows,
            crate::sys::commands::get_workflow_by_id,
            crate::sys::commands::get_workflow_by_share_url,
            crate::sys::commands::get_creator_workflows,
            crate::sys::commands::get_my_published_workflows,
            crate::sys::commands::get_workflows_by_category,
            crate::sys::commands::get_category_counts,
            crate::sys::commands::get_popular_tags,
            crate::sys::commands::clone_marketplace_workflow,
            crate::sys::commands::fork_marketplace_workflow,
            crate::sys::commands::rate_workflow,
            crate::sys::commands::get_workflow_reviews,
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
            crate::sys::commands::get_workflow_analytics,
            crate::sys::commands::get_workflow_share_url,
            crate::sys::commands::get_workflow_embed_code,
            crate::sys::commands::increment_workflow_view_count,
            crate::sys::commands::get_workflow_templates,
            crate::sys::commands::get_workflow_templates_by_category,
            crate::sys::commands::search_workflow_templates,


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
            crate::sys::commands::analytics_get_time_saved_trend,
            crate::sys::commands::analytics_get_cost_saved_trend,
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

            // ROI Dashboard command aliases
            crate::sys::commands::get_today_stats,
            crate::sys::commands::get_week_stats,
            crate::sys::commands::get_month_stats,
            crate::sys::commands::get_all_time_stats,
            crate::sys::commands::get_manual_vs_automated_comparison,
            crate::sys::commands::get_period_comparison,
            crate::sys::commands::get_benchmark_comparison,
            crate::sys::commands::get_recent_activity,
            crate::sys::commands::export_roi_report,


            crate::sys::commands::bg_submit_task,
            crate::sys::commands::bg_cancel_task,
            crate::sys::commands::bg_pause_task,
            crate::sys::commands::bg_resume_task,
            crate::sys::commands::bg_get_task_status,
            crate::sys::commands::bg_list_tasks,
            crate::sys::commands::bg_get_task_stats,
            // Frontend-facing aliases (used by useBackgroundTasks hook)
            crate::sys::commands::background_task_list,
            crate::sys::commands::background_task_cancel,
            crate::sys::commands::background_task_status,


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

            // Tool Confirmation (safety tier confirmation dialogs)
            crate::sys::commands::tool_confirmation::respond_tool_confirmation,
            crate::sys::commands::tool_confirmation::get_tool_safety_tier,
            crate::sys::commands::tool_confirmation::get_remembered_tool_choices,
            crate::sys::commands::tool_confirmation::clear_remembered_tool_choices,
            crate::sys::commands::tool_confirmation::clear_remembered_tool_choice,
            crate::sys::commands::tool_confirmation::get_pending_confirmation_count,
            crate::sys::commands::tool_confirmation::cancel_tool_confirmation,
            crate::sys::commands::tool_confirmation::update_allowed_directories,
            crate::sys::commands::tool_confirmation::get_allowed_directories,
            crate::sys::commands::tool_confirmation::set_auto_approve_all,
            crate::sys::commands::tool_confirmation::get_auto_approve_all,
            crate::sys::commands::tool_confirmation::resolve_task_approval,

            // Master Password (SECSYS-001 security enhancement)
            crate::sys::commands::master_password::master_password_is_configured,
            crate::sys::commands::master_password::master_password_is_unlocked,
            crate::sys::commands::master_password::master_password_get_status,
            crate::sys::commands::master_password::master_password_setup,
            crate::sys::commands::master_password::master_password_verify,
            crate::sys::commands::master_password::master_password_unlock,
            crate::sys::commands::master_password::master_password_lock,
            crate::sys::commands::master_password::master_password_change,
            crate::sys::commands::master_password::master_password_needs_migration,
            crate::sys::commands::master_password::master_password_start_migration,
            crate::sys::commands::master_password::master_password_complete_migration,

            // Background Agents (push to background with "&" prefix)
            crate::sys::commands::background_agents::background_agent_push,
            crate::sys::commands::background_agents::background_agent_list,
            crate::sys::commands::background_agents::background_agent_list_active,
            crate::sys::commands::background_agents::background_agent_get,
            crate::sys::commands::background_agents::background_agent_pause,
            crate::sys::commands::background_agents::background_agent_resume,
            crate::sys::commands::background_agents::background_agent_cancel,
            crate::sys::commands::background_agents::background_agent_take_over,
            crate::sys::commands::background_agents::background_agent_stats,
            crate::sys::commands::background_agents::background_agent_cleanup,
            crate::sys::commands::background_agents::background_agent_should_push,


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


            // Tutorials
            crate::sys::commands::tutorials::get_tutorials,
            crate::sys::commands::tutorials::get_tutorial,
            crate::sys::commands::tutorials::get_recommended_tutorial,
            crate::sys::commands::tutorials::start_tutorial,
            crate::sys::commands::tutorials::complete_tutorial_step,
            crate::sys::commands::tutorials::skip_tutorial_step,
            crate::sys::commands::tutorials::complete_tutorial,
            crate::sys::commands::tutorials::reset_tutorial,
            crate::sys::commands::tutorials::get_tutorial_progress,
            crate::sys::commands::tutorials::get_user_tutorial_progress,
            crate::sys::commands::tutorials::get_tutorial_stats,
            crate::sys::commands::tutorials::record_step_view,
            crate::sys::commands::tutorials::get_user_rewards,
            crate::sys::commands::tutorials::has_reward,
            crate::sys::commands::tutorials::has_unlocked_feature,
            crate::sys::commands::tutorials::get_user_credits,
            crate::sys::commands::tutorials::populate_sample_data,
            crate::sys::commands::tutorials::has_sample_data,
            crate::sys::commands::tutorials::clear_sample_data,
            crate::sys::commands::tutorials::submit_tutorial_feedback,
            crate::sys::commands::tutorials::record_help_session,


            crate::sys::commands::messaging::connect_slack,
            crate::sys::commands::messaging::connect_whatsapp,
            crate::sys::commands::messaging::connect_teams,
            crate::sys::commands::messaging::get_messaging_history,
            crate::sys::commands::messaging::disconnect_platform,
            crate::sys::commands::messaging::list_messaging_connections,
            crate::sys::commands::messaging::send_message,

            // Realtime presence
            crate::sys::commands::realtime::connect_websocket,
            crate::sys::commands::realtime::get_team_presence,
            crate::sys::commands::realtime::get_user_presence,
            crate::sys::commands::realtime::set_user_online,
            crate::sys::commands::realtime::set_user_offline,
            crate::sys::commands::realtime::update_user_activity,

            // Privacy
            crate::sys::commands::privacy::privacy_delete_account,
            crate::sys::commands::privacy::privacy_export_data,
            crate::sys::commands::privacy::settings_update_privacy,

            // Undo Manager (AGI action reversal)
            crate::sys::commands::undo_get_summary,
            crate::sys::commands::undo_get_changes,
            crate::sys::commands::undo_change,
            crate::sys::commands::undo_last,
            crate::sys::commands::undo_task,
            crate::sys::commands::undo_can_undo,

            // Form Undo (browser form submission reversal)
            crate::sys::commands::undo::form_undo_record,
            crate::sys::commands::undo::form_undo_attempt,
            crate::sys::commands::undo::form_undo_can_undo,
            crate::sys::commands::undo::form_undo_list,
            crate::sys::commands::undo::form_undo_list_undoable,
            crate::sys::commands::undo::form_undo_get,
            crate::sys::commands::undo::form_undo_clear,
            crate::sys::commands::undo::form_undo_clear_old,
            crate::sys::commands::undo::form_undo_stats,

            // MySQL Database Commands
            crate::sys::commands::db_mysql_test_connection,
            crate::sys::commands::db_mysql_list_tables,
            crate::sys::commands::db_mysql_describe_table,
            crate::sys::commands::db_mysql_list_indexes,
            crate::sys::commands::db_mysql_call_procedure,
            crate::sys::commands::db_mysql_bulk_insert,
            crate::sys::commands::db_validate_query,

            // Error Recovery Commands
            crate::sys::error::commands::get_error_context,
            crate::sys::error::commands::get_all_error_contexts,
            crate::sys::error::commands::retry_failed_step,
            crate::sys::error::commands::skip_failed_step,
            crate::sys::error::commands::abort_execution,
            crate::sys::error::commands::clear_error_contexts,
            crate::sys::error::commands::get_recovery_suggestion,

            // Additional Automation
            crate::sys::commands::automation_get_text,

            // Artifacts (live previews and versioned documents)
            crate::sys::commands::artifacts::artifact_create,
            crate::sys::commands::artifacts::artifact_create_streaming,
            crate::sys::commands::artifacts::artifact_append_streaming,
            crate::sys::commands::artifacts::artifact_finalize_streaming,
            crate::sys::commands::artifacts::artifact_get,
            crate::sys::commands::artifacts::artifact_get_rendered,
            crate::sys::commands::artifacts::artifact_update,
            crate::sys::commands::artifacts::artifact_rollback,
            crate::sys::commands::artifacts::artifact_delete,
            crate::sys::commands::artifacts::artifact_archive,
            crate::sys::commands::artifacts::artifact_unarchive,
            crate::sys::commands::artifacts::artifact_pin,
            crate::sys::commands::artifacts::artifact_add_tags,
            crate::sys::commands::artifacts::artifact_remove_tags,
            crate::sys::commands::artifacts::artifact_list,
            crate::sys::commands::artifacts::artifact_get_by_conversation,
            crate::sys::commands::artifacts::artifact_get_versions,
            crate::sys::commands::artifacts::artifact_get_diff,
            crate::sys::commands::artifacts::artifact_get_stats,
            crate::sys::commands::artifacts::artifact_export_all,
            crate::sys::commands::artifacts::artifact_import_all,
            crate::sys::commands::artifacts::artifact_clear_all,
            crate::sys::commands::artifacts::artifact_apply_diff,

            // Diagnostics (/doctor command)
            crate::sys::diagnostics::commands::doctor_run_checks,
            crate::sys::diagnostics::commands::doctor_run_check,
            crate::sys::diagnostics::commands::doctor_get_report,
            crate::sys::diagnostics::commands::doctor_list_checks,
            crate::sys::diagnostics::commands::doctor_is_running,
            crate::sys::diagnostics::commands::doctor_format_report,

            // Extended Thinking Mode
            crate::sys::commands::thinking::thinking_get_config,
            crate::sys::commands::thinking::thinking_set_config,
            crate::sys::commands::thinking::thinking_toggle,
            crate::sys::commands::thinking::thinking_set_budget,
            crate::sys::commands::thinking::thinking_detect_trigger,
            crate::sys::commands::thinking::thinking_model_supports,
            crate::sys::commands::thinking::thinking_get_current,

            // Updater (only available when not building for App Store)
            #[cfg(feature = "updater")]
            crate::features::updater::check_for_updates,
            #[cfg(feature = "updater")]
            crate::features::updater::install_update,
            #[cfg(feature = "updater")]
            crate::features::updater::install_update_and_restart,
            #[cfg(feature = "updater")]
            crate::features::updater::get_current_version,
            #[cfg(feature = "updater")]
            crate::features::updater::get_version_info,
            // Swarm Commands (Phase 5 Wiring)
            crate::sys::commands::swarm::swarm_init,
            crate::sys::commands::swarm::swarm_execute_goal,
            crate::sys::commands::swarm::swarm_get_stats,
            crate::sys::commands::swarm::swarm_stop,

            // Vision Commands (Phase 7 Wiring)
            crate::sys::commands::vision::vision_send_message,

            // Google Batch Commands (not yet implemented - requires Google AI API integration)
            crate::sys::commands::google_batch::google_batch_create,
            crate::sys::commands::google_batch::google_batch_get,
            crate::sys::commands::google_batch::google_batch_list,
            crate::sys::commands::google_batch::google_batch_cancel,
            crate::sys::commands::google_batch::google_batch_delete,
            crate::sys::commands::google_batch::google_batch_get_results,
            crate::sys::commands::google_batch::google_batch_create_embeddings,
            crate::sys::commands::google_batch::google_batch_get_embeddings,
            crate::sys::commands::google_batch::google_batch_create_images,
            crate::sys::commands::google_batch::google_batch_calculate_cost,
            crate::sys::commands::google_batch::google_batch_create_jsonl,

            // Code execution (sandboxed)
            crate::sys::commands::execute_code,
        ])
        .manage(crate::sys::commands::swarm::SwarmState::new()) // Initialize SwarmState
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

pub mod models;
