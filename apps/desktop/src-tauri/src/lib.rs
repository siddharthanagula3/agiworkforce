#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![deny(warnings)]
#![allow(unused_qualifications)]
#![allow(clippy::should_implement_trait)]
#![allow(clippy::too_many_arguments)]
#![allow(clippy::type_complexity)]

// A shipped build must not carry the webview inspector. This fires only for this
// crate's own `devtools` feature. `devtools` in the tauri dependency's feature
// list, `tauri/devtools` reached from another feature, Tauri config features and
// any build with debug assertions all bypass it, so
// apps/desktop/scripts/check-no-devtools.mjs checks those before every release
// bundle and scripts/check-release-gates.mjs fails a workflow that skips it.
// Debug builds (`tauri dev`, `cargo clippy`) are unaffected.
#[cfg(all(feature = "devtools", not(debug_assertions)))]
compile_error!(
    "the `devtools` feature enables the webview inspector and must not be enabled in a release build; drop it from the bundler's --features list"
);

use crate::core::agent::approval::ApprovalController;
use crate::data::db::migrations;
use crate::data::settings::SettingsService;
use crate::sys::commands::{
    master_password::MasterPasswordState,
    mcp_extensions::McpExtensionsState,
    mcp_server::McpServerState,
    project_memory::ProjectMemoryState,
    research::ResearchState,
    security::SecretManagerState,
    skills::SkillsState,
    tool_confirmation::ToolConfirmationState,
    undo::UndoState,
    ApiState, AppDatabase, BrowserStateWrapper, CloudState, ComputerUseState, DocumentState,
    FileWatcherState, LLMState, McpOAuthState, McpState, McpbState, MemoryState, SchedulerState,
    SettingsServiceState, SettingsState, ShortcutsState, VoiceState,
};
use crate::sys::security::SecretManager;
use crate::sys::telemetry;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{async_runtime, Manager};
use tokio::sync::Mutex as TokioMutex;

/// Managed state holding the resolved app data directory.
/// Replaces `std::env::set_var("AGIWORKFORCE_APP_DATA_DIR", ...)` which is
/// unsafe in multi-threaded contexts (UB per POSIX `setenv` + Rust 1.66+ lint).
/// Injected via `app.manage()` inside `setup()` so every Tauri command can
/// retrieve it with `State<AppDirs>`.  The companion `OnceLock` in
/// `sys::utils` allows non-command code to resolve the same path without
/// needing a Tauri handle.
#[derive(Debug, Clone)]
pub struct AppDirs {
    pub data_dir: PathBuf,
}

/// Returns `true` when this process already holds macOS Accessibility permission.
/// Uses `AXIsProcessTrusted()` which **never prompts**, it only reads the TCC database.
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
pub mod upgrade;

#[cfg(test)]
pub mod tests;

pub use data::state::{AppState, DockPosition, PersistentWindowState, WindowGeometry};
pub use ui::tray::build_system_tray;
pub use ui::window::{
    apply_dock, auto_tile_for_browser, close_floating_window, create_floating_window, hide_window,
    initialize_window, set_always_on_top, set_pinned, show_window, toggle_floating_window, undock,
    DockPreviewEvent, DockState,
};

pub fn focus_running_instance<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> bool {
    let Some(window) = app.get_webview_window("main") else {
        return false;
    };

    #[cfg(target_os = "macos")]
    if let Err(error) = app.set_dock_visibility(true) {
        tracing::warn!("[single-instance] failed to restore dock visibility: {error}");
    }

    if let Err(error) = window
        .unminimize()
        .and_then(|()| window.show())
        .and_then(|()| window.set_focus())
    {
        tracing::warn!("[single-instance] failed to focus the running window: {error}");
    }

    true
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // FIX-F10 (audit 2026-05-19): only load `.env` files in debug builds.
    // Previously this ran in release too; a writer of `~/.env` could inject
    // `LD_PRELOAD` etc. into the process env, bypassing the BLOCKED_ENV_VARS
    // filter in code_execution.rs which only filters user-supplied env.
    #[cfg(debug_assertions)]
    {
        for env_file in &[".env.local", ".env"] {
            let path = std::path::Path::new(env_file);
            if let Ok(contents) = std::fs::read_to_string(path) {
                for line in contents.lines() {
                    let line = line.trim();
                    if line.is_empty() || line.starts_with('#') {
                        continue;
                    }
                    if let Some((key, value)) = line.split_once('=') {
                        let key = key.trim();
                        let value = value.trim();
                        // Only set if not already present in the environment.
                        // This runs before tokio, so single-threaded.
                        #[allow(clippy::disallowed_methods)]
                        if std::env::var(key).is_err() {
                            std::env::set_var(key, value);
                        }
                    }
                }
            }
        }
    }

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
        // DESK-09: must stay ahead of every other plugin. A second launch exits
        // inside this plugin's setup hook, before any later setup opens the
        // encrypted SQLite database that has no cross-process lock.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            focus_running_instance(app);
        }))
        .plugin(
            tauri::plugin::Builder::<_, ()>::new("telemetry")
                .setup(|app, _| {
                    let app_data_dir = app.path().app_data_dir()?;
                    crate::sys::utils::set_app_data_dir(app_data_dir);
                    match telemetry::init() {
                        Ok(guard) => {
                            app.manage(Mutex::new(guard));
                        }
                        Err(error) => {
                            eprintln!("Failed to initialize telemetry: {error}. Continuing without telemetry.");
                        }
                    }
                    Ok(())
                })
                .build(),
        )
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        // The main window's geometry is owned by `AppState`
        // (`ui::window::initialize_window`); a second writer restoring it on
        // window-ready would race that one. The plugin keeps the others.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_denylist(&["main"])
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::Builder::new().build());

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

    // Embedded WebDriver server for E2E testing (WebdriverIO Tauri service).
    // debug_assertions is a real rustc cfg (unlike in Cargo.toml dependency
    // selectors, which don't support it), this never registers/starts in release.
    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(tauri_plugin_wdio_webdriver::init());
        // Companion plugin adding browser.tauri.execute()/mock() to the same
        // @wdio/tauri-service harness, same debug-only rationale as above.
        builder = builder.plugin(tauri_plugin_wdio::init());
    }

    // DES-C15: give artifact previews their own origin (`artifact://localhost`,
    // `http://artifact.localhost` on Windows) serving the SAME renderer web
    // deploys. A same-document `srcdoc` preview inherits this app's CSP.
    // `script-src 'self' 'wasm-unsafe-eval'`, so interactive HTML and React
    // artifacts rendered inert inside the packaged binary. A separate origin does
    // not inherit that policy. Registered on the Builder (not in `setup`) because
    // Tauri wires URI scheme handlers when the webview is created.
    builder = crate::ui::artifact_sandbox::register_artifact_sandbox_protocol(builder);

    let app = builder
        // macOS normally keeps the application process alive after its last
        // window closes. Handle the main-window close at the Builder boundary
        // so it cannot be bypassed by feature-local listeners or temporary
        // window-state suppression. Auxiliary windows still close normally.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let keep_in_menu_bar = window
                    .app_handle()
                    .try_state::<AppState>()
                    .map(|state| state.snapshot().keep_in_menu_bar)
                    .unwrap_or(false);
                match crate::ui::window::window_close_action(window.label(), keep_in_menu_bar) {
                    crate::ui::window::WindowCloseAction::CloseWindow => {}
                    crate::ui::window::WindowCloseAction::HideToMenuBar => {
                        api.prevent_close();
                        let app_handle = window.app_handle();
                        let close_result = app_handle
                            .try_state::<AppState>()
                            .ok_or_else(|| anyhow::anyhow!("Window state is not available"))
                            .and_then(|state| {
                                crate::ui::window::request_main_window_close(app_handle, &state)
                            });
                        if let Err(err) = close_result {
                            tracing::error!("[window] failed to hide main window: {err:?}");
                            app_handle.exit(0);
                        }
                    }
                    crate::ui::window::WindowCloseAction::ExitApplication => {
                        api.prevent_close();
                        window.app_handle().exit(0);
                    }
                }
            }
        })
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

            // Publish the resolved data-dir via thread-safe OnceLock (replaces env var).
            // This MUST happen before anything calls `sys::utils::app_data_dir()`.
            crate::sys::utils::set_app_data_dir(app_data_dir.clone());
            agiworkforce_worktree::set_host_state_dir(app_data_dir.join("git-state"));

            // Also expose via Tauri managed state for commands that accept State<AppDirs>.
            app.manage(AppDirs {
                data_dir: app_data_dir.clone(),
            });
            app.manage(crate::sys::commands::CloudHandoffGrantState::default());

            let db_path = app_data_dir.join("agiworkforce.db");
            let startup_recovery = crate::sys::startup_recovery::StartupRecoveryState::new(
                app_data_dir.clone(),
                db_path.clone(),
            );
            app.manage(startup_recovery.clone());

            // Install native messaging manifests only for normal app bundles.
            // The isolated WDIO bundle shares Chrome/Edge's user-global host
            // registration paths, so it must never replace the production
            // manifest with a repository debug binary.
            use crate::integrations::native_messaging::manifest::ManifestInstallOutcome;
            match crate::integrations::native_messaging::manifest::install_manifests_for_bundle_identifier(
                &app.config().identifier,
                None,
            ) {
                Ok(ManifestInstallOutcome::Installed(_)) => {
                    tracing::info!("Native messaging manifest installed/updated");
                }
                Ok(ManifestInstallOutcome::SkippedTestHarness) => {
                    tracing::info!(
                        "Skipped browser-global native messaging manifest installation for test harness bundle {}",
                        app.config().identifier
                    );
                }
                Err(e) => {
                    tracing::warn!("Failed to install native messaging manifest: {}", e);
                }
            }

            tracing::info!("Database path: {:?}", db_path);

            // Every locally stored secret is keyed from this per-install value.
            // It must be loaded before the database opens, before migrations run,
            // and before any service derives a key, or those keys would fall back
            // to a derivation any local process can reproduce.
            match crate::sys::security::machine_key::OsInstallSecretStore::for_bundle_identifier(
                &app.config().identifier,
            )
            .and_then(|store| {
                crate::sys::security::machine_key::load_or_create_install_secret(&store)
            }) {
                Ok(install_secret) => {
                    crate::sys::security::machine_key::set_install_secret(&install_secret);
                    tracing::info!("Per-install encryption secret loaded from secure storage");
                    // File-backed stores whose readers derive one key and
                    // decrypt with it directly would otherwise lose everything
                    // a machine-key build wrote.
                    use crate::sys::security::machine_key_rewrap;
                    machine_key_rewrap::spawn_legacy_machine_only_file_rewrap();
                }
                Err(error) => {
                    tracing::error!(
                        "Failed to establish the per-install encryption secret: {error}"
                    );
                    startup_recovery.record(
                        crate::sys::startup_recovery::StartupRecoveryInfo::database_initialization(),
                    );
                    crate::sys::startup_recovery::show_recovery_window(app.handle());
                    return Ok(());
                }
            }

            let database_key_store =
                match crate::data::db::key_management::OsDatabaseKeyStore::for_bundle_identifier(
                    &app.config().identifier,
                ) {
                    Ok(store) => store,
                    Err(error) => {
                        tracing::error!(
                            "Failed to configure bundle-scoped database key storage: {error}"
                        );
                        startup_recovery.record(
                            crate::sys::startup_recovery::StartupRecoveryInfo::from_database_error(
                                &error,
                            ),
                        );
                        crate::sys::startup_recovery::show_recovery_window(app.handle());
                        return Ok(());
                    }
                };

            // New installations use a random key held by the operating
            // system's secure storage. Existing machine-derived databases are
            // probed read-only and adopted only after SQLCipher proves a
            // candidate key. No startup path guesses, rekeys, or replaces
            // unrecognized ciphertext.
            let stable_database = match crate::data::db::key_management::open_main_database(
                &db_path,
                &database_key_store,
                &crate::sys::security::machine_key::legacy_database_key_candidates(),
            ) {
                Ok(database) => database,
                Err(error) => {
                    tracing::error!(
                        "Failed to open the encrypted main database safely: {error}"
                    );
                    startup_recovery.record(
                        crate::sys::startup_recovery::StartupRecoveryInfo::from_database_error(
                            &error,
                        ),
                    );
                    crate::sys::startup_recovery::show_recovery_window(app.handle());
                    return Ok(());
                }
            };
            tracing::info!(
                "Database opened with SQLCipher encryption (key source: {:?})",
                stable_database.key_origin
            );
            let main_database_access = stable_database.access.clone();
            if let Err(error) =
                crate::data::db::key_management::register_main_database_access(
                    main_database_access.clone(),
                )
            {
                tracing::error!("Failed to register main-database access: {error}");
                startup_recovery.record(
                    crate::sys::startup_recovery::StartupRecoveryInfo::database_initialization(),
                );
                crate::sys::startup_recovery::show_recovery_window(app.handle());
                return Ok(());
            }
            app.manage(main_database_access.clone());
            let conn = stable_database.connection;

            // Configure SQLite for better performance and reliability.
            // These PRAGMAs must come after the encryption key PRAGMA.
            if let Err(error) = conn.execute_batch("
                PRAGMA busy_timeout = 5000;
                PRAGMA journal_mode = WAL;
                PRAGMA synchronous = NORMAL;
                PRAGMA foreign_keys = ON;
                PRAGMA cache_size = -64000;
            ") {
                tracing::error!("Failed to configure the encrypted main database: {error}");
                startup_recovery.record(
                    crate::sys::startup_recovery::StartupRecoveryInfo::database_initialization(),
                );
                crate::sys::startup_recovery::show_recovery_window(app.handle());
                return Ok(());
            }

            if let Err(e) = migrations::run_migrations(&conn) {
                tracing::error!("Failed to run migrations: {}", e);

                startup_recovery.record(
                    crate::sys::startup_recovery::StartupRecoveryInfo::database_initialization(),
                );
                crate::sys::startup_recovery::show_recovery_window(app.handle());
                return Ok(());
            }

            tracing::info!("Database initialized at {:?}", db_path);
            crate::sys::commands::chat::interrupted_turns::recover_at_launch(&conn);

            let machine_only_payloads =
                crate::sys::security::machine_key::machine_only_payloads();
            if !machine_only_payloads.is_empty() {
                tracing::warn!(
                    "{} stored payload(s) are still wrapped under the legacy machine-derived key \
                     and stay reproducible by any local process until they are written again: {}",
                    machine_only_payloads.len(),
                    machine_only_payloads.join(", ")
                );
            }

            let db_conn_arc = Arc::new(Mutex::new(conn));
            if let Err(error) =
                crate::automation::audit::configure_audit_store(db_conn_arc.clone())
            {
                tracing::error!(error, "Failed to configure the automation audit store");
            }
            app.manage(AppDatabase {
                conn: db_conn_arc.clone(),
            });

            let mut degraded_services: Vec<crate::sys::startup_recovery::DegradedService> =
                Vec::new();

            app.manage(ApprovalController::default());

            let secret_manager = Arc::new(SecretManager::new(db_conn_arc.clone()));
            tracing::info!("SecretManager initialized");
            app.manage(SecretManagerState(secret_manager.clone()));

            // Install the encrypted native proxy profile before any provider
            // constructs its reqwest clients. Corrupt settings do not prevent
            // startup; the factory remains on its environment-proxy defaults.
            if let Err(error) =
                crate::sys::commands::network_proxy::apply_saved_network_proxy(&secret_manager)
            {
                tracing::warn!("Network proxy settings were not applied: {error}");
            }

            // Master Password state for SECSYS-001 security enhancement
            // FIX-001 / FIX-002 / FIX-004: also publish a `MasterPasswordEncryption`
            // wrapper so credential-storage IPC handlers can grab a single
            // injected helper instead of re-doing AES-GCM boilerplate per call.
            // Both states share the same `Arc<Mutex<MasterPasswordManager>>`,
            // so unlock/lock/migration progress is reflected everywhere.
            // Cloned aside (in addition to being `app.manage()`d below) so BYOK
            // rehydration further down can decrypt stored provider keys without
            // re-deriving this from managed state mid-setup.
            let master_password_encryption_for_rehydration: crate::sys::security::MasterPasswordEncryption;
            match MasterPasswordState::new(db_conn_arc.clone()) {
                Ok(master_password_state) => {
                    let encryption = crate::sys::security::MasterPasswordEncryption::new(
                        master_password_state.manager.clone(),
                    );
                    master_password_encryption_for_rehydration = encryption.clone();
                    crate::sys::security::vault_credentials::install_global(encryption.clone());
                    app.manage(master_password_state);
                    app.manage(encryption);
                    tracing::info!(
                        "MasterPasswordState + MasterPasswordEncryption initialized"
                    );
                }
                Err(e) => {
                    tracing::warn!("Failed to initialize MasterPasswordState: {}. Master password features will be unavailable.", e);
                    let degraded = MasterPasswordState::new_degraded();
                    let encryption = crate::sys::security::MasterPasswordEncryption::new(
                        degraded.manager.clone(),
                    );
                    master_password_encryption_for_rehydration = encryption.clone();
                    crate::sys::security::vault_credentials::install_global(encryption.clone());
                    app.manage(degraded);
                    app.manage(encryption);
                }
            }

            // Per-user daily LLM-spend cap. Reuses
            // the main app DB so the budget table sits next to other
            // settings and ships in regular backups.
            match crate::core::llm::daily_budget::DailyBudgetGuard::new(db_conn_arc.clone()) {
                Ok(guard) => {
                    // The LLM router enforces the cap from below the command
                    // layer, where no AppHandle is reachable, so the guard is
                    // published both ways from this one construction.
                    crate::core::llm::daily_budget::install_global(guard.clone());
                    tracing::info!(
                        "DailyBudgetGuard initialized at ${:.2}/day cap",
                        guard.cap_usd()
                    );
                    app.manage(guard);
                }
                Err(e) => {
                    tracing::warn!(
                        "Failed to initialize DailyBudgetGuard: {e}. Budget enforcement disabled."
                    );
                }
            }

            if let Ok(conn) = db_conn_arc.lock() {
                crate::sys::commands::ollama::restore_keep_alive(&conn);
            }

            let llm_state = tauri::async_runtime::block_on(LLMState::with_cache(db_conn_arc.clone()));
            let llm_router_for_byok_rehydration = llm_state.router.clone();
            app.manage(llm_state);
            app.manage(crate::sys::commands::llm::RateLimitState::default());

            // Restore previously-configured BYOK direct-API providers (OpenRouter,
            // OpenAI, Anthropic, ...) into the fresh router. `save_api_key`/
            // `llm_configure_provider` only register a provider at the moment its
            // key is saved; without this, every BYOK provider silently reports
            // "not configured" after each restart even though its key is safely
            // stored (encrypted) in settings_v2. See
            // `sys::commands::llm::rehydrate_byok_providers` for the full failure
            // mode this closes.
            tauri::async_runtime::block_on(crate::sys::commands::llm::rehydrate_byok_providers(
                &llm_router_for_byok_rehydration,
                &master_password_encryption_for_rehydration,
            ));

            // Initialize browser automation with graceful degradation.
            // SEV-DESK-02: pass the Tauri AppHandle so ExtensionBridge can
            // surface confirmation prompts before any execute_script, navigate,
            // cookie, or localStorage operation reaches the active browser tab.
            let browser_state = match tauri::async_runtime::block_on(
                BrowserStateWrapper::new(Some(app.handle().clone())),
            ) {
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
            app.manage(crate::sys::commands::NativeMessagingStateWrapper::new());

            app.manage(crate::sys::commands::dispatch_hmac::DispatchHmacState::new());

            // The settings file is read once here, ahead of the scheduler,
            // the background agents and the triggers below, so the saved
            // settings and capability switches hold before anything can run a
            // tool or write the file.
            let startup_settings =
                crate::sys::commands::settings::read_startup_settings(&app_data_dir);
            app.manage(SettingsState::with(startup_settings.settings));
            app.manage(crate::sys::commands::capabilities::CapabilityState::from_saved(
                startup_settings.switches,
            ));

            let settings_service = match main_database_access
                .open_connection()
                .and_then(|conn| {
                    SettingsService::new(Arc::new(Mutex::new(conn)))
                        .map_err(|error| error.to_string())
                }) {
                Ok(service) => service,
                Err(error) => {
                    tracing::error!("Failed to initialize settings service: {error}");
                    startup_recovery.record(
                        crate::sys::startup_recovery::StartupRecoveryInfo::essential_service(
                            "Settings storage",
                        ),
                    );
                    crate::sys::startup_recovery::show_recovery_window(app.handle());
                    return Ok(());
                }
            };
            app.manage(SettingsServiceState::new(settings_service));

            // Hooks are announced as loading here, ahead of the scheduler, the
            // background agents and the triggers below: a run that starts
            // before this would find no hook gate and pass unheld.
            app.manage(crate::sys::commands::HookRegistryState::new());
            app.manage(crate::sys::commands::NotificationCenterState::restore(
                app.handle(),
            ));
            crate::sys::commands::initialize_hooks_at_startup(app.handle());

            app.manage(FileWatcherState::new());

            app.manage(ApiState::new().unwrap_or_else(|error| {
                degraded_services.push(crate::sys::startup_recovery::DegradedService {
                    feature: "API requests",
                    reason: error,
                });
                ApiState::default()
            }));

            app.manage(CloudState::new());

            let session_manager = crate::features::terminal::SessionManager::new(app.handle().clone());
            app.manage(session_manager.clone());

            let terminal_ai = crate::features::terminal::TerminalAI::new(
                app.state::<LLMState>().router.clone(),
                Arc::new(session_manager),
            );
            app.manage(terminal_ai);

            app.manage(DocumentState::new());

            // Persistent memory state for AGI cross-session memory. Lives in the
            // encrypted main database, so it must open through MainDatabaseAccess:
            // a plain Connection::open (what MemoryManager::new used) opens the
            // SQLCipher file without the key and every query fails with "file is
            // not a database", which surfaced as "Could not update memory" on
            // every add/edit/delete.
            match main_database_access.open_connection() {
                Ok(conn) => {
                    app.manage(MemoryState::from_connection(conn));
                    tracing::info!("Memory manager initialized");
                }
                Err(e) => {
                    tracing::warn!("Failed to initialize memory manager: {}. Memory features may be degraded.", e);
                    app.manage(MemoryState::new_degraded());
                }
            }

            app.manage(crate::sys::commands::memory::ConversationSummarizerState::new());

            // Project knowledge RAG state (shares the main DB path)
            app.manage(crate::sys::commands::knowledge::ProjectKnowledgeState::new(
                db_path.clone(),
            ));

            // Project-scoped memory state for project-specific long-term
            // memories. Lives in the main database, so it must open through
            // MainDatabaseAccess: the main DB is keyed from the OS key store
            // (or the WDIO harness key), and the machine-derived key that
            // `open_keyed_connection` uses can never match it ("file is not a
            // database" on every open).
            match main_database_access.open_connection() {
                Ok(conn) => {
                    app.manage(ProjectMemoryState::from_connection(conn));
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
                    match crate::automation::global_service() {
                        Ok(automation_service) => {
                            app.manage(Some(automation_service));
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
                match crate::automation::global_service() {
                    Ok(automation_service) => {
                        app.manage(Some(automation_service));
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

                // Initializing reloads the server set, which disconnects every
                // server, so the extensions the user left on start after it.
                let extensions: tauri::State<McpExtensionsState> = app_clone.state();
                match extensions.manager.start_enabled_extensions().await {
                    Ok(failures) => {
                        for (extension_id, reason) in failures {
                            tracing::warn!(
                                "Extension {} did not start at launch: {}",
                                extension_id,
                                reason
                            );
                        }
                    }
                    Err(e) => {
                        tracing::error!("Could not read the extensions to start at launch: {}", e);
                    }
                }
            });

            // MCP OAuth state for handling OAuth flows (GitHub, Google Drive, Slack)
            app.manage(McpOAuthState::default());

            // MCP Bundle (MCPB) state for bundle management
            app.manage(McpbState::new());

            // MCP Server Mode state (expose app as an MCP server)
            app.manage(McpServerState::new(9090, app.handle().clone()));

            // Undo manager state for reversing AGI actions
            app.manage(UndoState::new());

            // Scheduler state for proactive task scheduling, backed by local
            // encrypted SQLite so schedules survive app restarts. When that
            // database cannot be opened the scheduler reports the failure on
            // every call rather than accepting schedules a restart would lose.
            let scheduler_db_path = app_data_dir.join("scheduler.db");
            let scheduler_state = match SchedulerState::new_with_store(&scheduler_db_path) {
                Ok(state) => state,
                Err(e) => {
                    tracing::error!(
                        "Failed to open the schedule database at {}: {}. Scheduled tasks are unavailable this session.",
                        scheduler_db_path.display(),
                        e
                    );
                    SchedulerState::unavailable(format!(
                        "Scheduled tasks are unavailable: the schedule database at {} could not be opened ({}). \
                         New schedules are refused because they would be lost when the app quits. \
                         Check that the folder is writable, then restart the app.",
                        scheduler_db_path.display(),
                        e
                    ))
                }
            };
            // Register default memory maintenance jobs (daily summarization + weekly decay).
            // Idempotent, skips if jobs already exist (including jobs just hydrated from disk),
            // so a paused/edited default job is left as the user set it rather than recreated.
            scheduler_state.register_default_memory_jobs();
            // Start the background polling loop so scheduled jobs fire automatically.
            // The loop polls every 30 seconds and dispatches any jobs whose next_run
            // is in the past. Without this, jobs are stored but never auto-executed.
            crate::sys::shutdown::track_background_loop(
                crate::sys::shutdown::BackgroundLoop::Scheduler,
                scheduler_state.start_background_loop(app.handle().clone()),
            );
            app.manage(scheduler_state);
            tracing::info!("Scheduler initialized with background execution loop");

            // Skills manager for AGI skill context
            app.manage(SkillsState::default());
            tracing::info!("Skills manager initialized");

            // Research orchestration state for multi-source investigation
            app.manage(ResearchState::new());
            tracing::info!("Research state initialized");

            // Tool Confirmation state for safety tier confirmation dialogs
            app.manage(ToolConfirmationState::new_with_db(db_conn_arc.clone()));
            tracing::info!("Tool confirmation state initialized");

            // Artifact state for live previews and versioned artifacts
            app.manage(crate::sys::commands::artifacts::ArtifactState::with_db(db_conn_arc.clone()));
            tracing::info!("Artifact state initialized with DB persistence");

            // Background Agent Manager for "&" prefix background tasks
            {
                use crate::core::agent::{BackgroundAgentManager, BackgroundAgentManagerState};
                let bg_agent_manager = BackgroundAgentManager::new(db_conn_arc.clone());
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

            // Project context state for active folder selection
            app.manage(crate::sys::commands::project_context::ProjectContextState::new());
            tracing::info!("Project context state initialized");

            app.manage(Arc::new(TokioMutex::new(ComputerUseState::new())));

            // Per-app permission registry for Computer Use (Stream 1).
            // Persisted to ~/Library/Application Support/.../app_permissions.json
            // (or platform equivalent). Loaded on startup; saved on every change.
            {
                use crate::automation::computer_use::AppPermissionManager;
                let perm_path = app_data_dir.join("app_permissions.json");
                let manager = Arc::new(AppPermissionManager::new());
                if perm_path.exists() {
                    if let Ok(json) = std::fs::read_to_string(&perm_path) {
                        let manager_clone = manager.clone();
                        tauri::async_runtime::block_on(async move {
                            if let Err(e) = manager_clone.from_json(&json).await {
                                tracing::warn!(
                                    "Failed to load app_permissions.json: {}",
                                    e
                                );
                            }
                        });
                    }
                }
                app.manage(manager);
                tracing::info!(
                    "App permission registry initialized (persist path: {})",
                    perm_path.display()
                );
            }

            app.manage(Arc::new(TokioMutex::new(VoiceState::new())));

            app.manage(Arc::new(TokioMutex::new(ShortcutsState::with_defaults())));

            // The extension bridge only needs somewhere to keep presence rows,
            // so a main-database connection that will not open must not take
            // the bridge down with it.
            let presence_conn = match main_database_access.open_connection() {
                Ok(conn) => conn,
                Err(error) => {
                    tracing::warn!(
                        "Presence falls back to memory for this session: {error}"
                    );
                    match rusqlite::Connection::open_in_memory() {
                        Ok(conn) => conn,
                        Err(error) => {
                            tracing::error!("Failed to open a presence store: {error}");
                            startup_recovery.record(
                                crate::sys::startup_recovery::StartupRecoveryInfo::database_initialization(),
                            );
                            crate::sys::startup_recovery::show_recovery_window(app.handle());
                            return Ok(());
                        }
                    }
                }
            };
            let presence_db = Arc::new(tokio::sync::Mutex::new(presence_conn));
            let presence_manager = Arc::new(crate::integrations::realtime::PresenceManager::new(presence_db));
            let websocket_port =
                crate::integrations::native_messaging::endpoint::REALTIME_PORT;

            // Generate secure token for realtime auth
            let realtime_token = uuid::Uuid::new_v4().to_string();
            // Write token atomically with restricted permissions from the start.
            // Using OpenOptions ensures the file is created with 0o600 on Unix
            // *before* any content is written, eliminating the TOCTOU race where
            // another process could read the token between write and chmod.
            {
                use std::io::Write;
                let token_path =
                    crate::integrations::native_messaging::endpoint::token_path(&app_data_dir);

                #[cfg(unix)]
                let file_result = {
                    use std::os::unix::fs::OpenOptionsExt;
                    std::fs::OpenOptions::new()
                        .create(true)
                        .write(true)
                        .truncate(true)
                        .mode(0o600)
                        .open(&token_path)
                };

                #[cfg(not(unix))]
                let file_result = {
                    // On Windows, the file lives inside %APPDATA%\com.agiworkforce.desktop\
                    // which is already user-scoped. The default ACL (owner-only for APPDATA)
                    // provides equivalent protection, so no additional ACL is needed.
                    std::fs::OpenOptions::new()
                        .create(true)
                        .write(true)
                        .truncate(true)
                        .open(&token_path)
                };

                match file_result {
                    Ok(mut file) => {
                        if let Err(e) = file.write_all(realtime_token.as_bytes()) {
                            tracing::error!("Failed to write .ipc_token content: {}", e);
                        }
                    }
                    Err(e) => {
                        tracing::error!("Failed to create .ipc_token: {}", e);
                    }
                }
            }

            // The live RealtimeServer authenticates handshakes against this
            // token, and RealtimeState holds the same lock, so both always
            // see one value.
            let realtime_token_shared =
                std::sync::Arc::new(tokio::sync::RwLock::new(realtime_token));
            let realtime_server = Arc::new(crate::integrations::realtime::RealtimeServer::new(
                presence_manager.clone(),
                realtime_token_shared.clone(),
                Some(app.handle().clone()),
            ));
            {
                let server = realtime_server.clone();
                crate::sys::shutdown::track_background_loop(
                    crate::sys::shutdown::BackgroundLoop::RealtimeServer,
                    async_runtime::spawn(async move {
                        if let Err(e) = server.start(websocket_port).await {
                            tracing::error!("Realtime server failed: {}", e);
                        }
                    }),
                );
            }
            app.manage(crate::sys::commands::realtime::RealtimeServerHandle(
                realtime_server.clone(),
            ));
            app.manage(crate::sys::commands::RealtimeState::new(
                websocket_port,
                realtime_token_shared,
            ));
            match AppState::load(app.handle()) {
                Ok(state) => {
                    app.manage(state);
                }
                Err(e) => {
                    tracing::warn!("Failed to load AppState: {}. Using default window state.", e);
                    app.manage(AppState::default());
                }
            }

            // Event triggers (cron, webhook, file-watcher)
            let trigger_state = crate::core::agent::triggers::TriggerRegistryState::new(
                crate::core::agent::triggers::TriggerRegistry::new(),
            );
            let trigger_engine = trigger_state.0.clone();
            let trigger_app_handle = app.handle().clone();
            let trigger_store = main_database_access
                .open_connection()
                .map(|conn| Arc::new(Mutex::new(conn)));
            if let Err(error) = &trigger_store {
                degraded_services.push(crate::sys::startup_recovery::DegradedService {
                    feature: "Automation triggers",
                    reason: error.clone(),
                });
            }
            app.manage(trigger_state);
            tauri::async_runtime::spawn(async move {
                let mut registry = trigger_engine.write().await;
                registry.set_app_handle(trigger_app_handle);
                match trigger_store {
                    Ok(store) => registry.set_store(store),
                    Err(error) => {
                        registry.mark_unavailable(format!(
                            "Automation triggers are unavailable: their database could not be opened ({error}). \
                             New triggers are refused because they would be lost when the app quits. Restart the app to try again."
                        ));
                        return;
                    }
                }
                if let Err(e) = registry.load_persisted().await {
                    tracing::error!("[triggers] failed to restore persisted triggers: {e}");
                }
                if let Err(e) = registry.start().await {
                    tracing::error!("[triggers] trigger engine failed to start: {e}");
                }
            });

            if let Err(err) = build_system_tray(app) {
                tracing::error!("[tray] initialization failed: {err:?}");
            }

            // Native window menu (macOS menu bar + Windows/Linux title-bar menu)
            if let Err(err) = crate::ui::window_menu::build_window_menu(app) {
                tracing::warn!("[menu] window menu initialization failed: {err:?}");
            }

            // The default shortcuts are ordinary key combinations, which macOS
            // registers through RegisterEventHotKey with no Accessibility
            // grant. Only media keys need an event tap, and none is a default.
            if let Err(err) = crate::sys::commands::shortcuts::init_global_shortcuts(app.handle()) {
                tracing::error!("[shortcuts] global shortcuts initialization failed: {err:?}");
            }

            if let Some(window) = app.get_webview_window("main") {
                if let Err(err) = initialize_window(&window) {
                    tracing::error!("[window] initialization failed: {err:?}");
                }
            }

            crate::sys::startup_recovery::report_degraded_services(app.handle(), degraded_services);

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
            // Fail-closed local-database recovery commands. These are
            // available even when normal application state cannot initialize.
            crate::sys::startup_recovery::startup_get_recovery_state,
            crate::sys::startup_recovery::startup_retry,
            crate::sys::startup_recovery::startup_open_data_folder,
            crate::sys::startup_recovery::startup_export_diagnostics,
            crate::sys::startup_recovery::startup_quit,

            crate::sys::commands::get_system_resources,

            crate::sys::commands::agent_resolve_approval,

            // Dispatch HMAC verification (mobile↔desktop control-message auth)
            crate::sys::commands::dispatch_hmac_init,
            crate::sys::commands::dispatch_hmac_verify,
            crate::sys::commands::dispatch_hmac_sign,
            crate::sys::commands::dispatch_hmac_reset,

            crate::sys::commands::window_get_state,
            crate::sys::commands::window_set_pinned,
            crate::sys::commands::window_set_always_on_top,
            crate::sys::commands::window_set_visibility,
            crate::sys::commands::window_set_menu_bar_mode,
            crate::sys::commands::window_request_close,
            crate::sys::commands::window_dock,
            crate::sys::commands::window_toggle_maximize,
            crate::sys::commands::window_toggle_floating,
            crate::sys::commands::window_close_floating,

            crate::sys::commands::autostart_get_enabled,
            crate::sys::commands::autostart_set_enabled,

            crate::sys::commands::chat_create_conversation,
            crate::sys::commands::chat_get_conversations,
            crate::sys::commands::chat_get_messages,
            crate::sys::commands::chat_send_message,
            crate::sys::commands::chat_stop_generation,
            crate::sys::commands::cancel_tool_execution,
            crate::sys::commands::chat::pending::chat_add_pending_message,
            crate::sys::commands::chat::pending::chat_pop_pending_message,
            crate::sys::commands::chat_get_cost_overview,
            crate::sys::commands::chat_get_cost_analytics,

            crate::sys::commands::chat_set_monthly_budget,
            crate::sys::commands::chat_compact_context,
            crate::sys::commands::search_chat_history,
            crate::sys::commands::chat::search::get_recent_conversations,
            crate::sys::commands::conversation_export,
            crate::sys::commands::conversation_export_pdf,

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

            crate::sys::commands::automation_audit_outbox_list,
            crate::sys::commands::automation_audit_outbox_ack,
            crate::sys::commands::automation_record_start,
            crate::sys::commands::automation_record_stop,
            crate::sys::commands::automation_record_discard,
            crate::sys::commands::automation_record_action_click,
            crate::sys::commands::automation_record_action_narration,
            crate::sys::commands::automation_record_is_recording,
            crate::sys::commands::automation_record_get_status,
            crate::sys::commands::automation_record_get_last,
            crate::sys::commands::automation_record_clear_last,

            crate::sys::commands::browser_init,
            crate::sys::commands::browser_check_status,
            crate::sys::commands::browser_launch,
            crate::sys::commands::browser_open_tab,
            crate::sys::commands::browser_close,
            crate::sys::commands::browser_navigate,
            crate::sys::commands::browser_go_back,
            crate::sys::commands::browser_go_forward,
            crate::sys::commands::browser_reload,
            crate::sys::commands::browser_get_url,
            crate::sys::commands::browser_get_title,
            crate::sys::commands::browser_get_screenshot_stream,

            crate::sys::commands::git_status,
            crate::sys::commands::git_add,
            crate::sys::commands::git_commit,
            crate::sys::commands::git_pull,
            crate::sys::commands::git_checkout,
            crate::sys::commands::git_checkout_new_branch,
            crate::sys::commands::git_list_branches,
            crate::sys::commands::git_delete_branch,
            crate::sys::commands::git_diff,
            crate::sys::commands::git_reset,
            crate::sys::commands::git_checkout_files,
            crate::sys::commands::git_trust_repository_config,
            // Git merge, conflict resolution, and PR commands
            crate::sys::commands::git_fetch,

            crate::sys::commands::llm_send_message,
            crate::sys::commands::llm_configure_provider,
            crate::sys::commands::llm_network_proxy_get,
            crate::sys::commands::llm_network_proxy_set,
            crate::sys::commands::llm_set_default_provider,
            crate::sys::commands::llm_ensure_managed_cloud,
            crate::sys::commands::llm_get_available_models,
            crate::sys::commands::llm_check_provider_status,
            crate::sys::commands::llm_get_usage_stats,
            crate::sys::commands::llm_list_lmstudio_models,
            crate::sys::commands::llm_list_llamacpp_models,
            crate::sys::commands::llm_list_vllm_models,
            crate::sys::commands::llm_lmstudio_list_model_states,
            crate::sys::commands::llm_lmstudio_load_model,
            crate::sys::commands::llm_lmstudio_unload_model,
            crate::sys::commands::router_suggestions,

            crate::sys::commands::cache_get_stats,
            crate::sys::commands::cache_clear_all,
            crate::sys::commands::cache_clear_by_type,
            crate::sys::commands::cache_clear_by_provider,
            crate::sys::commands::cache_export,
            crate::sys::commands::cache_get_analytics,
            crate::sys::commands::cache_prune_expired,

            crate::sys::commands::settings_load,
            crate::sys::commands::settings_save,
            crate::sys::commands::settings_load_from_disk,
            crate::sys::commands::settings_kept_unreadable_file,
            crate::sys::security::sandbox_runtime::terminal_sandbox_availability,

            // Custom Instructions
            crate::sys::commands::save_custom_instructions,
            crate::sys::commands::load_custom_instructions,

            // Custom Agents CRUD
            crate::sys::commands::list_custom_agents,
            crate::sys::commands::save_custom_agent,
            crate::sys::commands::delete_custom_agent,

            // Interactive Tools
            crate::sys::commands::interactive::question_answer,

            crate::sys::account::fetch_user_profile,
            crate::sys::account::account_store_api_base_url,
            crate::sys::account::app_mode::account_set_app_mode,
            crate::sys::account::account_store_access_token,
            crate::sys::account::account_clear_tokens,
            crate::sys::account::account_restore_access_token,
            crate::sys::account::account_refresh_session,
            crate::sys::account::account_start_device_authorization,
            crate::sys::account::account_poll_device_authorization,
            crate::sys::account::account_approve_device_authorization,
            crate::sys::account::clerk_native::account_clerk_native_request,

            crate::sys::commands::settings_v2_clear_cache,

            crate::sys::commands::capture_screen_full,
            crate::sys::commands::capture_screen_region,
            crate::sys::commands::capture_get_windows,

            crate::sys::commands::capture::capture_screen_window,

            // Ollama
            crate::sys::commands::ollama_check_status,
            crate::sys::commands::ollama_list_models,
            crate::sys::commands::ollama_pull_model,
            crate::sys::commands::ollama_cancel_pull,
            crate::sys::commands::ollama_list_loaded_models,
            crate::sys::commands::ollama_load_model,
            crate::sys::commands::ollama_unload_model,
            crate::sys::commands::ollama_get_keep_alive,
            crate::sys::commands::ollama_set_keep_alive,
            crate::sys::commands::ollama_delete_model,

            crate::sys::commands::file_read,
            crate::sys::commands::file_write,
            crate::sys::commands::file_delete,
            crate::sys::commands::file_rename,
            crate::sys::commands::file_exists,
            crate::sys::commands::file_open_with_default_app,
            crate::sys::commands::dir_create,
            crate::sys::commands::dir_list,
            crate::sys::commands::dir_delete,
            crate::sys::commands::file_watch_start,
            crate::sys::commands::file_watch_stop,

            // Code search (Grep + Glob + Formatter pipeline)
            crate::sys::commands::select_cloud_handoff_folder,
            crate::sys::commands::list_cloud_handoff_files,
            crate::sys::commands::read_cloud_handoff_file,
            crate::sys::commands::revoke_cloud_handoff_grant,

            crate::sys::commands::terminal_detect_shells,
            crate::sys::commands::terminal_create_session,
            crate::sys::commands::terminal_send_input,
            crate::sys::commands::terminal_resize,
            crate::sys::commands::terminal_kill,
            crate::sys::commands::terminal_get_history,
            crate::sys::commands::terminal_ai_suggest_command,
            crate::sys::commands::terminal_smart_commit,
            crate::sys::commands::terminal_ai_suggest_improvements,
            crate::sys::commands::terminal_clear_history,

            crate::sys::commands::document_extract_text,
            crate::sys::commands::document_create_pdf_simple_manifest,
            // Memory commands (persistent cross-session memory)
            crate::sys::commands::memory_forget_topic,
            crate::sys::commands::memory_store,
            crate::sys::commands::memory_delete,
            crate::sys::commands::memory_list_all,
            // Memory export/import commands
            crate::sys::commands::memory_export_json,
            crate::sys::commands::memory_export_markdown,

            // Project Memory Commands (project-scoped long-term memory)
            crate::sys::commands::project_memory::get_project_memories,

            // Chat-Memory Integration Commands
            crate::sys::commands::chat_memory_integration::chat_configure_memory_injection,

            crate::sys::commands::mcp_initialize,
            crate::sys::commands::mcp_list_servers,
            crate::sys::commands::mcp_connect_server,
            crate::sys::commands::mcp_disconnect_server,
            crate::sys::commands::mcp_list_tools,
            crate::sys::commands::mcp_search_tools,
            crate::sys::commands::mcp_call_tool,
            crate::sys::commands::mcp_get_config,
            crate::sys::commands::mcp_get_config_location,
            crate::sys::commands::mcp_update_config,
            crate::sys::commands::mcp_enable_server,
            crate::sys::commands::mcp_disable_server,
            crate::sys::commands::mcp_get_stats,
            crate::sys::commands::mcp_get_server_logs,
            crate::sys::commands::mcp_get_health,
            crate::sys::commands::mcp_set_credential,
            crate::sys::commands::mcp_delete_credential,
            crate::sys::commands::mcp_list_credential_slots,
            crate::sys::commands::mcp_update_filesystem_directories,

            // MCP OAuth
            crate::sys::commands::mcp_oauth_start,
            crate::sys::commands::mcp_oauth_callback,
            crate::sys::commands::mcp_oauth_status,
            crate::sys::commands::mcp_oauth_disconnect,
            crate::sys::commands::mcp_oauth_refresh,
            crate::sys::commands::mcp_oauth_set_credentials,
            crate::sys::commands::mcp_oauth_credentials_status,
            crate::sys::commands::mcp_list_connected_providers,
            crate::sys::commands::mcp_get_supported_connector_ids,
            crate::sys::commands::mcp_connect_connector,
            crate::sys::commands::save_api_key,

            // Connector per-tool permissions
            crate::sys::commands::connector_permission_get,
            crate::sys::commands::connector_permission_set,
            crate::sys::commands::connector_permission_list,
            crate::sys::commands::connector_permission_reset,

            // MCPB (MCP Bundles)
            crate::sys::commands::mcpb_fetch_registry,
            crate::sys::commands::mcpb_search_bundles,
            crate::sys::commands::mcpb_install_bundle,
            crate::sys::commands::mcpb_uninstall_bundle,
            crate::sys::commands::mcpb_get_installed_bundles,
            crate::sys::commands::mcpb_update_bundle,
            crate::sys::commands::mcpb_get_categories,
            crate::sys::commands::mcpb_get_featured,

            // MCP Server Mode (expose app as MCP server)
            crate::sys::commands::mcp_server_start,
            crate::sys::commands::mcp_server_stop,
            crate::sys::commands::mcp_server_status,
            crate::sys::commands::mcp_server_get_config,
            crate::sys::commands::mcp_server_reveal_token,
            crate::sys::commands::mcp_server_update_config,
            crate::sys::commands::mcp_server_list_tools,

            // MCP Extensions (Desktop Extensions)
            crate::sys::commands::extension_list,
            crate::sys::commands::extension_install,
            crate::sys::commands::extension_uninstall,
            crate::sys::commands::extension_enable,
            crate::sys::commands::extension_disable,
            crate::sys::commands::extension_select_package,
            crate::sys::commands::extension_clear_selected_context_handoff,
            crate::sys::commands::extension_get_pending_selected_context_handoff,
            crate::sys::commands::extension_status,
            crate::sys::commands::extension_get_config,
            crate::sys::commands::extension_set_config,

            crate::sys::commands::voice_transcribe_blob,
            crate::sys::commands::voice_configure,
            crate::sys::commands::voice_get_settings,
            crate::sys::commands::voice_check_local_whisper,

            crate::sys::commands::shortcuts_reset,

            // Skills
            crate::sys::commands::skill_list,
            crate::sys::commands::skill_reload,
            crate::sys::commands::skill_workspace_status,
            crate::sys::commands::skill_set_workspace_consent,
            crate::sys::commands::skill_create_from_recording,

            // AGI Dictation lifecycle (coordinator sessions + global hotkey hook).
            // System-wide dictation is NOT available yet; the coordinator
            // fail-closes global sessions (DESKTOP-SYSTEM-DICTATION-UNWIRED-01).
            crate::sys::commands::voice_global::dictation_session_begin,
            crate::sys::commands::voice_global::dictation_session_advance,
            crate::sys::commands::voice_global::dictation_session_end,
            crate::sys::commands::voice_global::voice_start_global_ptt,
            crate::sys::commands::voice_global::voice_stop_global_ptt,

            // Voice (TTS, Wake Word, PTT)
            // AGI Dictation in-app speech recording
            crate::sys::commands::voice::speech_start_recording,
            crate::sys::commands::voice::speech_stop_and_transcribe,

            // System automation permissions (macOS Accessibility, Screen Recording)
            crate::sys::commands::check_automation_permissions,
            crate::sys::commands::request_automation_permission,

            // Notification Center (in-app notification system)
            crate::sys::commands::notification_center::notification_list,
            crate::sys::commands::notification_center::notification_mark_read,
            crate::sys::commands::notification_center::notification_mark_all_read,
            crate::sys::commands::notification_center::notification_delete,
            crate::sys::commands::notification_center::notification_delete_all_read,
            crate::sys::commands::notification_center::notification_get_settings,
            crate::sys::commands::notification_center::notification_set_settings,

            // Scheduler (proactive task scheduling with cron expressions)
            crate::sys::commands::scheduler_add_job,
            crate::sys::commands::scheduler_remove_job,
            crate::sys::commands::scheduler_list_jobs,
            crate::sys::commands::scheduler_toggle_job,
            crate::sys::commands::scheduler_stop_run,
            crate::sys::commands::scheduler_running_jobs,
            crate::sys::commands::scheduler_run_job_now,
            crate::sys::commands::scheduler_get_history,
            crate::sys::commands::scheduler_update_job,

            // Research (multi-source investigation with citations)
            crate::sys::commands::research_start,
            crate::sys::commands::research_cancel,
            crate::sys::commands::research_get_config,

            crate::sys::commands::get_user_preference,
            crate::sys::commands::set_user_preference,

            // Projects
            crate::sys::commands::project_create,
            crate::sys::commands::project_list,
            crate::sys::commands::project_update,
            crate::sys::commands::project_delete,

            // Project Context (active folder selection)
            crate::sys::commands::project_context_set_folder,

            crate::sys::commands::error_report,
            crate::sys::commands::error_report_batch,

            crate::sys::commands::security::secret_manager_has,
            crate::sys::commands::security::secret_manager_set,
            crate::sys::commands::security::secret_manager_delete,

            // Tool Confirmation (safety tier confirmation dialogs)
            crate::sys::commands::tool_confirmation::respond_tool_confirmation,
            crate::sys::commands::tool_confirmation::get_remembered_tool_choices,
            crate::sys::commands::tool_confirmation::update_allowed_directories,
            crate::sys::commands::tool_confirmation::set_auto_approve_all,
            crate::sys::commands::tool_confirmation::get_auto_approve_all,
            crate::sys::commands::tool_confirmation::set_agent_mode,
            crate::sys::commands::tool_confirmation::get_agent_mode,
            crate::sys::commands::tool_confirmation::set_tool_approval_policy,
            crate::sys::commands::tool_confirmation::clear_session_tool_approvals,

            // Master Password (SECSYS-001 security enhancement)
            crate::sys::commands::master_password::master_password_get_status,
            crate::sys::commands::master_password::master_password_setup,
            crate::sys::commands::master_password::master_password_unlock,
            crate::sys::commands::master_password::master_password_lock,
            crate::sys::commands::master_password::master_password_change,
            crate::sys::commands::master_password::master_password_remove,
            crate::sys::commands::master_password::master_password_migrate_credentials,
            crate::sys::commands::daily_budget::budget_get_status,
            crate::sys::commands::daily_budget::budget_set_cap_usd,

            // Background Agents (push to background with "&" prefix)
            crate::sys::commands::background_agents::background_agent_list,
            crate::sys::commands::background_agents::background_agent_resume,

            // browser-extension pairing handshake
            crate::sys::commands::realtime::bridge_pending_pair_requests,
            crate::sys::commands::realtime::bridge_deny_pair_request,

            // Privacy
            crate::sys::commands::privacy::privacy_delete_account,
            crate::sys::commands::privacy::privacy_export_data,

            // Undo Manager (AGI action reversal)
            crate::sys::commands::undo_last,
            crate::sys::commands::undo_can_undo,

            // Coding checkpoints (named file snapshots for rewind)
            crate::sys::commands::coding_checkpoint_list,
            crate::sys::commands::coding_checkpoint_rewind,

            // Artifacts (live previews and versioned documents)
            crate::sys::commands::artifacts::artifact_get,
            crate::sys::commands::artifacts::artifact_update,
            crate::sys::commands::artifacts::artifact_rollback,
            crate::sys::commands::artifacts::artifact_delete,
            crate::sys::commands::artifacts::artifact_archive,
            crate::sys::commands::artifacts::artifact_unarchive,
            crate::sys::commands::artifacts::artifact_pin,
            crate::sys::commands::artifacts::artifact_get_conversation_snapshot,
            crate::sys::commands::artifacts::artifact_link_to_message,
            crate::sys::commands::artifacts::artifact_get_versions,
            crate::sys::commands::artifacts::artifact_list_persisted,

            // Capability enforcement (frontend feature toggles → backend)
            crate::sys::commands::capabilities::list_capabilities,
            crate::sys::commands::capabilities::set_capability,
            crate::sys::commands::claude_plugins::claude_plugin_cli_available,
            crate::sys::commands::claude_plugins::claude_plugin_change,

            // Hooks (hook registry management)
            crate::sys::commands::hooks_initialize,
            crate::sys::commands::hooks_waiting_for_approval,
            crate::sys::commands::hooks_list,
            crate::sys::commands::hooks_add,
            crate::sys::commands::hooks_remove,
            crate::sys::commands::hooks_toggle,
            crate::sys::commands::hooks_update,
            crate::sys::commands::hooks_export,
            crate::sys::commands::hooks_import,
            crate::sys::commands::hooks_reload,
            crate::sys::commands::hooks_get_event_types,
            crate::sys::commands::hooks_get_stats,

            crate::sys::commands::get_local_user_id,
            crate::sys::commands::background_agent_cancel,
            crate::sys::commands::background_agent_start,
            crate::sys::commands::background_agent_get,
            crate::sys::commands::background_agent_pause,
            crate::sys::commands::chat_archive_conversation,
            crate::sys::commands::chat_delete_conversation,
            crate::sys::commands::chat_delete_message,
            crate::sys::commands::chat_update_conversation_title,
            crate::sys::commands::computer_use_cancel_opa_task,
            crate::sys::commands::computer_use_execute_opa_task,
            crate::sys::commands::computer_use_take_over,
            crate::sys::commands::computer_use_hand_back,
            // Stream 1: per-app permission registry
            crate::sys::commands::app_permissions_list,
            crate::sys::commands::app_permissions_set,
            crate::sys::commands::app_permissions_remove,
            crate::sys::commands::app_permissions_always_blocked,
            crate::sys::commands::app_permissions_active_window,
            crate::sys::commands::project_memory::delete_project_memory,
            crate::sys::commands::error_get_logs,
            crate::sys::commands::llm_list_ollama_models,
            crate::sys::commands::memory_import_json_string,
            crate::sys::commands::notification_unread_count,
            crate::sys::commands::project_memory::save_architectural_decision,
            crate::sys::commands::computer_use_revoke_consent,
            crate::sys::commands::shortcuts_register_global,
            crate::sys::commands::shortcuts_unregister_global,
            crate::sys::commands::shortcuts_update,
            crate::sys::commands::skill_get_instructions,
            crate::sys::commands::skill_match_for_message,
            crate::sys::commands::voice_check_piper_binary,
            crate::sys::commands::voice_download_piper_binary,
            crate::sys::commands::voice_download_piper_voice,
            crate::sys::commands::voice_download_whisper_model,
            crate::sys::commands::voice_enable_barge_in,
            crate::sys::commands::voice_get_capabilities,
            crate::sys::commands::voice_list_piper_voices,
            crate::sys::commands::voice_list_whisper_models,
            crate::sys::commands::voice_tts_speak_local,
            crate::sys::commands::voice_tts_speak_with_barge_in,
            crate::sys::commands::voice_tts_stop,
            crate::sys::commands::voice_wake_disable,
            crate::sys::commands::voice_wake_enable,

            // Event Triggers (cron, webhook, file-watcher automation)
            crate::core::agent::triggers::register_trigger,
            crate::core::agent::triggers::unregister_trigger,
            crate::core::agent::triggers::list_triggers,
            crate::core::agent::triggers::toggle_trigger,
            crate::core::agent::triggers::update_trigger,
            crate::core::agent::triggers::regenerate_webhook_token,
            crate::core::agent::triggers::get_trigger_executions,
            crate::core::agent::triggers::trigger_engine_info,
            crate::core::agent::triggers::pick_trigger_watch_folder,
            crate::sys::picked_folders::pick_folder,

            // ============================================================
            // Dotfile commands (~/.agiworkforce/ config bridge)
            // ============================================================
            crate::sys::commands::read_shared_config,
            crate::sys::commands::write_shared_config,
            crate::sys::commands::dotfile_list_mcp_servers,
            crate::sys::commands::dotfile_add_mcp_server,
            crate::sys::commands::dotfile_remove_mcp_server,
            crate::sys::commands::dotfile_list_skills,
            crate::sys::commands::dotfile_read_instructions,
            crate::sys::commands::dotfile_write_instructions,
            crate::sys::commands::dotfile_read_memories,

            // ============================================================
            // Ecosystem detection (import MCP configs from other tools)
            // ============================================================
            crate::sys::commands::detect_ecosystem_tools,
            crate::sys::commands::import_ecosystem_mcp_servers,
            crate::sys::commands::llm_list_saved_api_keys,
            crate::sys::commands::llm_list_locked_api_keys,
            crate::sys::commands::llm_delete_api_key,
            crate::sys::commands::llm_create_byok_fork,
            crate::sys::commands::chat::control::chat_set_plan_mode,
            crate::sys::commands::chat::interrupted_turns::chat_list_interrupted_turns,
            crate::sys::commands::chat::interrupted_turns::chat_dismiss_interrupted_turn,
            crate::sys::commands::scheduler_get_keep_awake,
            crate::sys::commands::scheduler_set_keep_awake,
            crate::sys::commands::chat::superseded::chat_supersede_messages,
            crate::sys::commands::chat::superseded::chat_restore_superseded_messages,
            crate::sys::commands::chat::superseded::chat_release_superseded_messages,
            crate::sys::commands::memory_delete_all,
            crate::sys::commands::project_sync_knowledge,
            crate::sys::commands::project_remove_knowledge_file,
            crate::sys::commands::chat_get_context_usage,
            crate::sys::commands::chat_get_conversation_instructions,
            crate::sys::commands::chat_set_conversation_instructions,
            crate::sys::commands::mcp_respond_elicitation,
            crate::sys::commands::mcp_open_elicitation_url,
            crate::sys::commands::mcp_list_pending_elicitations,
            crate::sys::commands::mcp_set_server_sandbox,
            crate::sys::commands::chat_pin_conversation,
            crate::sys::commands::chat_set_conversation_project,
            crate::sys::commands::chat_save_message_detail,
            crate::sys::commands::chat_set_message_feedback,
            crate::sys::commands::chat_branch_conversation,
            crate::sys::commands::chat_list_conversation_branches,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // Plugins are initialised by `build`, so a second launch has already
    // exited; the configured windows and their webviews are only created when
    // `run` reaches the ready event. A deletion asked for before the last exit
    // has to finish here, while no webview holds its data store open.
    crate::sys::commands::privacy::finish_pending_local_wipe_before_webview(&app);

    app.run(|app, event| {
        if let tauri::RunEvent::ExitRequested { code, api, .. } = &event {
            crate::sys::shutdown::handle_exit_requested(app, *code, api);
        }
    });
}
