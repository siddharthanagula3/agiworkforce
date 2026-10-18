use crate::core::mcp::config::{
    active_credential_scope, mcp_credential_row, oauth_placeholder_providers,
    oauth_token_expires_soon, open_mcp_settings_db, upsert_settings_v2_value,
    validate_credential_names,
};
use crate::core::mcp::{
    emit_mcp_event, ApprovedLaunch, McpClient, McpEvent, McpHealthMonitor, McpServerConfig,
    McpServersConfig, McpToolExecutor, McpToolRegistry,
};
use crate::sys::commands::connector_permissions::{
    encryption_from_state, resolve_permission, PermissionLevel,
};
use crate::sys::commands::master_password::MasterPasswordState;
use crate::sys::commands::tool_confirmation::{request_tool_confirmation, ToolConfirmationState};
use crate::sys::security::tool_guard::{RiskLevel, ToolConfirmationRequest, ToolSafetyTier};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex as TokioMutex;
use tokio::time::Duration;

pub struct McpState {
    pub client: Arc<McpClient>,
    pub registry: Arc<McpToolRegistry>,
    pub tool_executor: Arc<McpToolExecutor>,
    pub config: Arc<Mutex<McpServersConfig>>,
    pub persist_lock: Arc<TokioMutex<()>>,
    pub health_monitor: Arc<McpHealthMonitor>,
    oauth_refresh_lock: Arc<TokioMutex<()>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpConfigLocation {
    pub path: String,
    /// "project" when backed by a project MCP config path, otherwise "global".
    pub source: String,
    pub project_folder: Option<String>,
    pub exists: bool,
}

/// Resolve credentials only for the server the user explicitly chose to
/// connect. Resolving every configured server here can refresh OAuth tokens or
/// emit credential lookups for unrelated, disconnected integrations.
async fn build_runtime_server_config(
    raw_config: &McpServersConfig,
    server_name: &str,
) -> Result<McpServerConfig, String> {
    let server_config = raw_config
        .mcp_servers
        .get(server_name)
        .ok_or_else(|| format!("Server '{}' not found in configuration", server_name))?
        .clone();
    let mut scoped = McpServersConfig {
        mcp_servers: HashMap::from([(server_name.to_string(), server_config)]),
    };
    match open_mcp_settings_db() {
        Ok(conn) => {
            raw_config.adopt_legacy_credentials_of(&conn, &active_credential_scope(), server_name)
        }
        Err(error) => tracing::warn!(
            "[MCP] Stored credentials of '{}' were not checked for their current rows: {}",
            server_name,
            error
        ),
    }
    scoped
        .inject_credentials()
        .await
        .map_err(|e| format!("Failed to inject credentials: {}", e))?;
    scoped.mcp_servers.remove(server_name).ok_or_else(|| {
        format!(
            "Server '{}' disappeared while resolving credentials",
            server_name
        )
    })
}

async fn pin_oauth_token_endpoint(
    state: &McpState,
    mut approved_config: McpServersConfig,
    server_name: &str,
) -> Result<McpServersConfig, String> {
    use crate::core::mcp::transport::TransportConfig;
    let url = match approved_config
        .mcp_servers
        .get(server_name)
        .and_then(|server| server.transport.as_ref())
    {
        Some(TransportConfig::Http(http))
            if http.oauth_client_secret.is_some() && http.oauth_token_url.is_none() =>
        {
            http.url.clone()
        }
        _ => return Ok(approved_config),
    };
    let token_url = agiworkforce_mcp::oauth::discover_token_endpoint(&url)
        .await
        .map_err(|e| {
            format!(
                "Could not find the sign-in server for '{}' to bind its client secret to: {:#}",
                server_name, e
            )
        })?;
    pin_token_url(&mut approved_config, server_name, &url, &token_url);
    let updated = {
        let mut config = state.config.lock();
        pin_token_url(&mut config, server_name, &url, &token_url);
        config.clone()
    };
    state
        .persist_config_snapshot(&updated)
        .await
        .map_err(|e| format!("Failed to save MCP config: {}", e))?;
    Ok(approved_config)
}

fn pin_token_url(config: &mut McpServersConfig, server_name: &str, url: &str, token_url: &str) {
    use crate::core::mcp::transport::TransportConfig;
    if let Some(TransportConfig::Http(http)) = config
        .mcp_servers
        .get_mut(server_name)
        .and_then(|server| server.transport.as_mut())
    {
        if http.url == url && http.oauth_token_url.is_none() {
            http.oauth_token_url = Some(token_url.to_string());
        }
    }
}

fn resolve_config_location() -> Result<McpConfigLocation, String> {
    let project_folder = McpServersConfig::active_project_folder_from_env();
    let config_path = McpServersConfig::default_config_path()
        .map_err(|e| format!("Failed to get config path: {}", e))?;

    Ok(McpConfigLocation {
        path: config_path.to_string_lossy().to_string(),
        source: if project_folder.is_some() {
            "project".to_string()
        } else {
            "global".to_string()
        },
        project_folder,
        exists: McpServersConfig::has_config_file(&config_path),
    })
}

fn restore_redacted_env_values(
    incoming: &mut McpServersConfig,
    existing: &McpServersConfig,
    redacted_sentinel: &str,
) {
    for (server_name, incoming_server) in incoming.mcp_servers.iter_mut() {
        let Some(existing_server) = existing.mcp_servers.get(server_name) else {
            continue;
        };

        for (env_key, env_value) in incoming_server.env.iter_mut() {
            if env_value == redacted_sentinel {
                if let Some(existing_value) = existing_server.env.get(env_key) {
                    *env_value = existing_value.clone();
                }
            }
        }

        // Restore redacted HTTP transport credentials (mcp_get_config redacts
        // api_key / bearer_token / header values so they never reach the renderer).
        // Without this, saving an edited config would persist "<redacted>" and wipe
        // the real credentials.
        use crate::core::mcp::transport::TransportConfig;
        if let (
            Some(TransportConfig::Http(incoming_http)),
            Some(TransportConfig::Http(existing_http)),
        ) = (
            incoming_server.transport.as_mut(),
            existing_server.transport.as_ref(),
        ) {
            if incoming_http.api_key.as_deref() == Some(redacted_sentinel) {
                incoming_http.api_key = existing_http.api_key.clone();
            }
            if incoming_http.bearer_token.as_deref() == Some(redacted_sentinel) {
                incoming_http.bearer_token = existing_http.bearer_token.clone();
            }
            if incoming_http.oauth_client_secret.as_deref() == Some(redacted_sentinel) {
                incoming_http.oauth_client_secret = existing_http.oauth_client_secret.clone();
            }
            for (header_key, header_value) in incoming_http.headers.iter_mut() {
                if header_value == redacted_sentinel {
                    if let Some(existing_value) = existing_http.headers.get(header_key) {
                        *header_value = existing_value.clone();
                    }
                }
            }
        }
    }
}

/// A reload replaces the configured servers, so those are disconnected. The
/// servers of installed extensions come from no configuration file and stay
/// connected across it.
fn servers_to_disconnect(connected: Vec<String>, extension_servers: &[String]) -> Vec<String> {
    connected
        .into_iter()
        .filter(|server_name| !extension_servers.contains(server_name))
        .collect()
}

impl Default for McpState {
    fn default() -> Self {
        Self::new()
    }
}

impl McpState {
    pub fn new() -> Self {
        let client = Arc::new(McpClient::new());
        let registry = Arc::new(McpToolRegistry::new(client.clone()));
        let tool_executor = Arc::new(
            McpToolExecutor::new(client.clone()).with_default_timeout(Duration::from_secs(300)),
        );
        let config = Arc::new(Mutex::new(McpServersConfig::default()));
        let persist_lock = Arc::new(TokioMutex::new(()));
        let health_monitor = Arc::new(McpHealthMonitor::new(client.clone()));

        Self {
            client,
            registry,
            tool_executor,
            config,
            persist_lock,
            health_monitor,
            oauth_refresh_lock: Arc::new(TokioMutex::new(())),
        }
    }

    /// A connected server receives its OAuth token once, at spawn or connect.
    /// When that token is about to expire, refresh it and reconnect the server
    /// so the next call carries the new credential instead of failing with 401.
    pub async fn refresh_expiring_oauth_session(
        &self,
        app: &tauri::AppHandle,
        server_name: &str,
    ) -> Result<(), String> {
        let _refresh_guard = self.oauth_refresh_lock.lock().await;

        if !self
            .client
            .get_connected_servers()
            .iter()
            .any(|name| name == server_name)
        {
            return Ok(());
        }

        let raw_config = self.config.lock().clone();
        let Some(server_config) = raw_config.mcp_servers.get(server_name) else {
            return Ok(());
        };
        let expiring: Vec<String> = oauth_placeholder_providers(server_config)
            .into_iter()
            .filter(|provider| oauth_token_expires_soon(provider))
            .collect();
        if expiring.is_empty() {
            return Ok(());
        }

        let runtime_config = build_runtime_server_config(&raw_config, server_name).await?;
        if let Some(provider) = expiring
            .iter()
            .find(|provider| oauth_token_expires_soon(provider))
        {
            return Err(format!(
                "The {} sign-in for MCP server '{}' has expired and could not be refreshed. Reconnect it in Connectors.",
                provider, server_name
            ));
        }

        self.restart_server(
            app,
            server_name,
            runtime_config,
            "after refreshing its sign-in",
        )
        .await
    }

    /// Stops a connected server and starts it again from `runtime_config`,
    /// telling the window about both changes.
    async fn restart_server(
        &self,
        app: &tauri::AppHandle,
        server_name: &str,
        runtime_config: McpServerConfig,
        reason: &str,
    ) -> Result<(), String> {
        // A restart by the app asks nobody, so it goes ahead only for a
        // launch that is approved as it is now; one that is not is left
        // running as it was rather than stopped and not started again.
        let configured = self.config.lock().mcp_servers.get(server_name).cloned();
        let approved = match configured {
            Some(configured) => ApprovedLaunch::require(server_name, &configured)?,
            None => {
                return Err(format!(
                    "Server '{}' not found in configuration",
                    server_name
                ))
            }
        };

        self.client
            .disconnect_server(server_name)
            .await
            .map_err(|e| format!("Failed to restart MCP server '{}': {}", server_name, e))?;

        if let Err(err) = self
            .client
            .connect_server(server_name.to_string(), runtime_config, approved)
            .await
        {
            let message = format!(
                "Failed to reconnect MCP server '{}' {}: {}",
                server_name, reason, err
            );
            emit_mcp_event(
                app,
                McpEvent::ServerConnectionChanged {
                    server_name: server_name.to_string(),
                    connected: false,
                    error: Some(message.clone()),
                },
            );
            return Err(message);
        }

        tracing::info!("Reconnected MCP server '{}' {}", server_name, reason);
        emit_mcp_event(
            app,
            McpEvent::ServerConnectionChanged {
                server_name: server_name.to_string(),
                connected: true,
                error: None,
            },
        );
        let tool_count = self
            .client
            .list_server_tools(server_name)
            .map(|tools| tools.len())
            .unwrap_or(0);
        emit_mcp_event(
            app,
            McpEvent::ToolsUpdated {
                server_name: server_name.to_string(),
                tool_count,
            },
        );
        Ok(())
    }

    pub fn start_health_monitoring(&self, app_handle: tauri::AppHandle) {
        let monitor = self.health_monitor.clone();
        monitor.start_monitoring(std::time::Duration::from_secs(30), app_handle);
    }

    pub async fn persist_config_snapshot(&self, snapshot: &McpServersConfig) -> Result<(), String> {
        let _persist_guard = self.persist_lock.lock().await;
        let config_path = McpServersConfig::default_config_path()
            .map_err(|e| format!("Failed to get config path: {}", e))?;
        snapshot
            .save_to_file(&config_path)
            .await
            .map_err(|e| format!("Failed to save MCP config: {}", e))
    }

    /// Reload active MCP config from disk without starting any process or
    /// network transport.
    /// The config source is resolved by `McpServersConfig::default_config_path()`,
    /// which resolves project config precedence when a project folder is active.
    pub async fn reload_active_config(&self, app: &tauri::AppHandle) -> Result<String, String> {
        let config_path = McpServersConfig::default_config_path()
            .map_err(|e| format!("Failed to get config path: {}", e))?;

        let project_folder = McpServersConfig::active_project_folder_from_env();
        let mut raw_config = if McpServersConfig::has_config_file(&config_path) {
            let mut loaded = McpServersConfig::from_file(&config_path)
                .await
                .map_err(|e| format!("Failed to load MCP config: {}", e))?;
            if let Some(project_root) = project_folder.as_deref() {
                let disabled = loaded.disable_unconsented_project_servers(project_root);
                if disabled > 0 {
                    tracing::info!(
                        "[MCP] {disabled} server(s) in the project MCP config stay off until enabled in the app"
                    );
                }
            }
            loaded
        } else {
            // Seed new config files (including project MCP config targets) from current in-memory state.
            let seed_config = self.config.lock().clone();
            self.persist_config_snapshot(&seed_config)
                .await
                .map_err(|e| format!("Failed to save default config: {}", e))?;
            seed_config
        };

        // Merge in any servers declared in the shared CLI dotfile
        // (~/.agiworkforce/mcp.json), e.g. added via Settings → Developer's
        // DotfileSettings.tsx. See McpServersConfig::merge_dotfile_servers
        // for why this is a real, intentional cross-surface config file and
        // not dead scaffolding (DESKTOP-MCP-DOTFILE-CONFIG-FAKE-SUCCESS-01).
        raw_config.merge_dotfile_servers();

        *self.config.lock() = raw_config;

        let mut warnings: Vec<String> = Vec::new();

        let extension_servers = {
            use tauri::Manager;

            app.try_state::<crate::sys::commands::mcp_extensions::McpExtensionsState>()
                .map(|extensions| extensions.manager.running_server_names())
                .unwrap_or_default()
        };
        let configured_servers =
            servers_to_disconnect(self.client.get_connected_servers(), &extension_servers);

        for server_name in configured_servers {
            match self.client.disconnect_server(&server_name).await {
                Ok(_) => {
                    emit_mcp_event(
                        app,
                        McpEvent::ServerConnectionChanged {
                            server_name: server_name.clone(),
                            connected: false,
                            error: None,
                        },
                    );
                    emit_mcp_event(
                        app,
                        McpEvent::ToolsUpdated {
                            server_name,
                            tool_count: 0,
                        },
                    );
                }
                Err(err) => {
                    warnings.push(format!("failed to disconnect '{}': {}", server_name, err))
                }
            }
        }

        emit_mcp_event(
            app,
            McpEvent::SystemInitialized {
                server_count: 0,
                tool_count: 0,
            },
        );

        let location = resolve_config_location()?;
        let configured_count = self.config.lock().mcp_servers.len();
        let summary = format!(
            "MCP loaded from {} config ({}). {} server(s) available; connect explicitly to start one",
            location.source, location.path, configured_count
        );

        if warnings.is_empty() {
            Ok(summary)
        } else {
            Ok(format!(
                "{} with warnings: {}",
                summary,
                warnings.join("; ")
            ))
        }
    }

    /// Update the filesystem MCP server root directory.
    /// This couples folder selection with MCP filesystem server scope.
    /// Returns Ok(true) if the server was restarted, Ok(false) if no change needed.
    pub async fn update_filesystem_root(&self, new_root: &str) -> Result<bool, String> {
        self.update_filesystem_roots(&[new_root.to_string()]).await
    }

    /// Update the filesystem MCP server with multiple root directories.
    /// This allows the MCP filesystem server to access multiple directories.
    /// Returns Ok(true) if the server was restarted, Ok(false) if no change needed.
    pub async fn update_filesystem_roots(&self, new_roots: &[String]) -> Result<bool, String> {
        self.update_filesystem_roots_inner(new_roots, true).await
    }

    /// Apply task/session-scoped filesystem roots without writing them into
    /// the persistent MCP configuration. A relaunch (or explicit session
    /// clear) therefore restores the durable roots from Settings.
    pub async fn update_filesystem_roots_for_session(
        &self,
        new_roots: &[String],
    ) -> Result<bool, String> {
        self.update_filesystem_roots_inner(new_roots, false).await
    }

    async fn update_filesystem_roots_inner(
        &self,
        new_roots: &[String],
        persist: bool,
    ) -> Result<bool, String> {
        // Validate all paths first
        for new_root in new_roots {
            let root_path = std::path::Path::new(new_root);
            if !root_path.exists() {
                return Err(format!("Path does not exist: {}", new_root));
            }
            if !root_path.is_dir() {
                return Err(format!("Path is not a directory: {}", new_root));
            }
        }

        if new_roots.is_empty() {
            return Err("At least one directory must be provided".to_string());
        }

        // Update config
        let (needs_restart, config_snapshot) = {
            let mut config = self.config.lock();
            if let Some(server_config) = config.mcp_servers.get_mut("filesystem") {
                // Get current roots (all args after the package name)
                let current_args: Vec<String> = server_config.args.clone();
                let current_roots: Vec<String> = current_args
                    .into_iter()
                    .skip_while(|arg| arg != FILESYSTEM_PACKAGE)
                    .skip(1)
                    .collect();

                // Check if roots have changed
                if current_roots == new_roots {
                    tracing::info!("[MCP] Filesystem roots unchanged, skipping update");
                    return Ok(false);
                }

                // Rebuild args: keep command and package, replace roots
                server_config.args = vec!["-y".to_string(), FILESYSTEM_PACKAGE.to_string()];
                server_config.args.extend(new_roots.iter().cloned());

                tracing::info!(
                    "[MCP] Updated filesystem server roots from {:?} to {:?}",
                    current_roots,
                    new_roots
                );
                (true, config.clone())
            } else {
                return Err("Filesystem server not found in config".to_string());
            }
        };

        if !needs_restart {
            return Ok(false);
        }

        if persist {
            self.persist_config_snapshot(&config_snapshot)
                .await
                .map_err(|e| format!("Failed to persist filesystem MCP config: {}", e))?;
        }

        // Changing a filesystem root must not turn a configured-but-disconnected
        // server into a running process. In particular, the packaged filesystem
        // entry uses npx, which may contact npm and install code. Only preserve a
        // connection that the user had already started explicitly.
        let running = self.client.started_launch("filesystem");
        let was_connected = self
            .client
            .get_connected_servers()
            .contains(&"filesystem".to_string());

        // Restart an already-live server to apply the new config.
        let server_config = self.config.lock().mcp_servers.get("filesystem").cloned();

        if was_connected {
            if let Err(e) = self.client.disconnect_server("filesystem").await {
                tracing::warn!("[MCP] Failed to disconnect filesystem server: {}", e);
            }
        }

        // Reconnect only when this method is preserving an existing explicit
        // connection. `enabled` is configuration state, not execution consent.
        if let Some(config) = server_config {
            if was_connected {
                // It was running, so it had been approved. It restarts
                // only as that same launch with the folders the user granted
                // elsewhere; anything else changed stays stopped until the
                // user connects and approves it.
                let approved = ApprovedLaunch::continuing(
                    "filesystem",
                    running.as_ref(),
                    &config,
                    &apart_from_filesystem_roots,
                )?;
                match self
                    .client
                    .connect_server("filesystem".to_string(), config, approved)
                    .await
                {
                    Ok(_) => {
                        tracing::info!(
                            "[MCP] Filesystem server restarted with new roots: {:?}",
                            new_roots
                        );
                        Ok(true)
                    }
                    Err(e) => {
                        // Log as a warning, the config has been updated in memory so the
                        // next explicit connect attempt will use the new roots.  A spawn
                        // failure (e.g. `npx` not found on this machine) is non-fatal; the
                        // rest of the app continues to work without MCP filesystem tools.
                        tracing::warn!(
                            "[MCP] Filesystem server could not be restarted (non-fatal): {}. \
                             The directory configuration has been saved and will take effect \
                             when the server is next connected.",
                            e
                        );
                        Ok(true)
                    }
                }
            } else {
                tracing::info!(
                    "[MCP] Filesystem server is disconnected; roots updated without starting it"
                );
                Ok(true)
            }
        } else {
            // Config entry missing, treat as a warning, not a hard failure.
            tracing::warn!("[MCP] Filesystem server entry not found in config; skipping restart.");
            Ok(false)
        }
    }
}

const FILESYSTEM_PACKAGE: &str = "@modelcontextprotocol/server-filesystem";

/// The filesystem server's launch without the folders it is given: its
/// arguments up to and including the package name.
fn apart_from_filesystem_roots(server: &McpServerConfig) -> McpServerConfig {
    let mut launch = server.clone();
    if let Some(package) = launch.args.iter().position(|arg| arg == FILESYSTEM_PACKAGE) {
        launch.args.truncate(package + 1);
    }
    launch
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerInfo {
    pub name: String,
    pub enabled: bool,
    pub connected: bool,
    pub tool_count: usize,
    pub command: String,
    /// Runs on this computer (stdio) rather than at a remote URL.
    pub local: bool,
    /// Local and inside the OS sandbox, i.e. the user has not opted it out.
    pub sandboxed: bool,
    /// Why a server the user let out of the sandbox is being kept in it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sandbox_notice: Option<String>,
    /// The user's own stored secrets this server names and is handed.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub receives_secrets: Vec<crate::core::mcp::config::StoredSecretReference>,
    /// For a server from the open project's MCP file: the files whose
    /// content the approval of it covers. Editing one asks again.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub approval_covers_files: Vec<String>,
    /// For such a server: why its files cannot be pinned, so that it is
    /// approved one start at a time.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approval_notice: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpToolInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub server: String,
    pub parameters: Vec<String>,
}

#[tauri::command]
pub async fn mcp_initialize(
    state: State<'_, McpState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    tracing::info!("Initializing MCP system");
    state.client.elicitation().attach(app.clone());
    let message = state.reload_active_config(&app).await?;
    state.start_health_monitoring(app.clone());
    Ok(message)
}

/// Answer a server's `elicitation/create` prompt: accept with form content,
/// continue after opening a URL request's link, decline, or cancel.
#[tauri::command]
pub async fn mcp_respond_elicitation(
    state: State<'_, McpState>,
    answer: crate::core::mcp::elicitation::ElicitationAnswer,
) -> Result<(), String> {
    state.client.elicitation().respond(answer)
}

/// Open a URL-mode prompt's address in the system browser. Continuing with
/// `mcp_respond_elicitation` is refused until this has happened.
#[tauri::command]
pub async fn mcp_open_elicitation_url(
    state: State<'_, McpState>,
    id: String,
) -> Result<(), String> {
    state.client.elicitation().open_url(&id)
}

/// Prompts still waiting for an answer, so a window that opens or reloads
/// mid-request can show them.
#[tauri::command]
pub async fn mcp_list_pending_elicitations(
    state: State<'_, McpState>,
) -> Result<Vec<crate::core::mcp::elicitation::ElicitationPrompt>, String> {
    Ok(state.client.elicitation().pending_prompts())
}

/// Turn the OS sandbox off or back on for one local server. Turning it off
/// is confirmed in a native dialog that names what the server can then do;
/// a connected server restarts so the change applies at once.
#[tauri::command]
pub async fn mcp_set_server_sandbox(
    state: State<'_, McpState>,
    app: tauri::AppHandle,
    name: String,
    sandboxed: bool,
) -> Result<(), String> {
    let raw_config = state.config.lock().clone();
    let server = raw_config
        .mcp_servers
        .get(&name)
        .ok_or_else(|| format!("Server '{}' not found in configuration", name))?
        .clone();
    if matches!(
        server.transport,
        Some(crate::core::mcp::transport::TransportConfig::Http(_))
    ) {
        return Err(
            "Remote servers do not run on this computer, so there is no sandbox to change."
                .to_string(),
        );
    }

    if !sandboxed {
        if let Some(reason) =
            crate::core::mcp::sandbox::unsandboxed_refusal(&server.command, &server.args)
        {
            return Err(reason);
        }
        crate::core::mcp::launch_approval::confirm_sandbox_off(&app, &name, &server).await?;
    }

    crate::core::mcp::sandbox::set_server_unsandboxed(
        &name,
        &server.command,
        &server.args,
        !sandboxed,
    )?;

    if state.client.get_connected_servers().contains(&name) {
        let runtime_config = build_runtime_server_config(&raw_config, &name).await?;
        state
            .restart_server(&app, &name, runtime_config, "with its new sandbox setting")
            .await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn mcp_list_servers(state: State<'_, McpState>) -> Result<Vec<McpServerInfo>, String> {
    let config = state.config.lock();
    let stats = state.client.get_stats();
    let connected: HashSet<String> = state.client.get_connected_servers().into_iter().collect();
    let project_root = McpServersConfig::active_project_folder_from_env();

    let servers: Vec<McpServerInfo> = config
        .mcp_servers
        .iter()
        .map(|(name, server_config)| {
            let local = !matches!(
                server_config.transport,
                Some(crate::core::mcp::transport::TransportConfig::Http(_))
            );
            let (approval_covers_files, approval_notice) = match project_root
                .as_deref()
                .and_then(|root| crate::core::mcp::config::project_approval_coverage(root, name))
            {
                Some(Ok(files)) => (files, None),
                Some(Err(notice)) => (Vec::new(), Some(notice)),
                None => (Vec::new(), None),
            };
            McpServerInfo {
                name: name.clone(),
                enabled: server_config.enabled,
                connected: connected.contains(name),
                tool_count: stats.get(name).copied().unwrap_or(0),
                command: format!("{} {}", server_config.command, server_config.args.join(" ")),
                local,
                sandboxed: local
                    && !crate::core::mcp::sandbox::server_runs_unsandboxed(
                        name,
                        &server_config.command,
                        &server_config.args,
                    ),
                sandbox_notice: local
                    .then(|| {
                        crate::core::mcp::sandbox::contained_reason(
                            name,
                            &server_config.command,
                            &server_config.args,
                        )
                    })
                    .flatten(),
                receives_secrets: crate::core::mcp::config::stored_secret_references(server_config),
                approval_covers_files,
                approval_notice,
            }
        })
        .collect();

    Ok(servers)
}

/// Starts a server. A launch the user has approved as it is now starts
/// without a question; any other, new or changed, is put to the user in a
/// native dialog first, and a server that is switched off does not start.
#[tauri::command]
pub async fn mcp_connect_server(
    state: State<'_, McpState>,
    app: tauri::AppHandle,
    name: String,
) -> Result<String, String> {
    if state.client.get_connected_servers().contains(&name) {
        return Ok(format!("Server '{}' is already connected", name));
    }

    let raw_config = state.config.lock().clone();
    let raw_server_config = raw_config
        .mcp_servers
        .get(&name)
        .ok_or_else(|| format!("Server '{}' not found in configuration", name))?
        .clone();

    let approved =
        crate::core::mcp::launch_approval::ensure_approved(&app, &name, &raw_server_config).await?;

    let raw_config = pin_oauth_token_endpoint(&state, raw_config, &name).await?;
    let server_config = build_runtime_server_config(&raw_config, &name).await?;

    state
        .client
        .sign_in_and_connect(name.clone(), server_config, approved)
        .await
        .map_err(|e| format!("Failed to connect: {}", e))?;

    emit_mcp_event(
        &app,
        McpEvent::ServerConnectionChanged {
            server_name: name.clone(),
            connected: true,
            error: None,
        },
    );
    let tool_count = state
        .client
        .list_server_tools(&name)
        .map(|tools| tools.len())
        .unwrap_or(0);
    emit_mcp_event(
        &app,
        McpEvent::ToolsUpdated {
            server_name: name.clone(),
            tool_count,
        },
    );

    Ok(format!("Connected to server '{}'", name))
}

#[tauri::command]
pub async fn mcp_disconnect_server(
    state: State<'_, McpState>,
    app: tauri::AppHandle,
    name: String,
) -> Result<String, String> {
    if !state.client.get_connected_servers().contains(&name) {
        emit_mcp_event(
            &app,
            McpEvent::ServerConnectionChanged {
                server_name: name.clone(),
                connected: false,
                error: None,
            },
        );
        emit_mcp_event(
            &app,
            McpEvent::ToolsUpdated {
                server_name: name.clone(),
                tool_count: 0,
            },
        );
        return Ok(format!("Server '{}' is already disconnected", name));
    }

    state
        .client
        .disconnect_server(&name)
        .await
        .map_err(|e| format!("Failed to disconnect: {}", e))?;

    emit_mcp_event(
        &app,
        McpEvent::ServerConnectionChanged {
            server_name: name.clone(),
            connected: false,
            error: None,
        },
    );
    emit_mcp_event(
        &app,
        McpEvent::ToolsUpdated {
            server_name: name.clone(),
            tool_count: 0,
        },
    );

    Ok(format!("Disconnected from server '{}'", name))
}

#[tauri::command]
pub async fn mcp_list_tools(state: State<'_, McpState>) -> Result<Vec<McpToolInfo>, String> {
    let tools = state.client.list_all_tools();

    let tool_infos: Vec<McpToolInfo> = tools
        .into_iter()
        .map(|(server_name, tool)| {
            let parameters: Vec<String> = tool
                .input_schema
                .get("properties")
                .and_then(|p| p.as_object())
                .map(|obj| obj.keys().cloned().collect())
                .unwrap_or_default();

            McpToolInfo {
                id: state.registry.tool_id_for(&server_name, &tool.name),
                name: tool.name.clone(),
                description: tool.description.unwrap_or_default(),
                server: server_name,
                parameters,
            }
        })
        .collect();

    Ok(tool_infos)
}

#[tauri::command]
pub async fn mcp_search_tools(
    state: State<'_, McpState>,
    query: String,
) -> Result<Vec<McpToolInfo>, String> {
    let tools = state.client.search_tools(&query);

    let tool_infos: Vec<McpToolInfo> = tools
        .into_iter()
        .map(|(server_name, tool)| {
            let parameters: Vec<String> = tool
                .input_schema
                .get("properties")
                .and_then(|p| p.as_object())
                .map(|obj| obj.keys().cloned().collect())
                .unwrap_or_default();

            McpToolInfo {
                id: state.registry.tool_id_for(&server_name, &tool.name),
                name: tool.name.clone(),
                description: tool.description.unwrap_or_default(),
                server: server_name,
                parameters,
            }
        })
        .collect();

    Ok(tool_infos)
}

#[tauri::command]
pub async fn mcp_call_tool(
    state: State<'_, McpState>,
    confirmation_state: State<'_, ToolConfirmationState>,
    rate_limit_state: State<'_, crate::sys::commands::llm::RateLimitState>,
    mp_state: State<'_, MasterPasswordState>,
    app: tauri::AppHandle,
    tool_id: String,
    arguments: HashMap<String, Value>,
) -> Result<Value, String> {
    // Rate limit check: 60 tool executions per minute.
    // Uses "mcp" as the global key since all MCP tool calls share the same budget.
    rate_limit_state
        .mcp_limiter
        .check_rate_limit("mcp")
        .map_err(|_| {
            "Rate limit exceeded for MCP tool execution. Please wait a moment and try again (limit: 60 tool calls per minute).".to_string()
        })?;

    crate::ui::hooks::gate_tool_use(&tool_id, arguments.clone()).await?;

    // Generate correlation ID for request tracing
    let correlation_id = uuid::Uuid::new_v4().to_string();

    // Resolve (server_name, tool_name) via the shared registry decoder
    // instead of a hand-rolled prefix strip. `create_safe_tool_id`
    // (registry.rs) emits `b64_`-prefixed components (or a hashed
    // `mcp__h__<hash>` id for very long names); the previous inline decode
    // here only understood legacy `hex:`/`b64:` prefixes (note also the
    // missing trailing underscore vs. the registry's `__` delimiter), so
    // `server_name`/`bare_tool_name` never decoded correctly and every
    // permission lookup below silently missed its stored value.
    let (server_name, bare_tool_name) = match state.registry.resolve_tool_id(&tool_id) {
        Ok(pair) => pair,
        Err(e) => {
            tracing::warn!(
                target: "mcp",
                correlation_id = %correlation_id,
                tool_id = %tool_id,
                error = %e,
                "Failed to resolve MCP tool ID; falling back to unresolved name for logging/permission checks"
            );
            ("unknown".to_string(), tool_id.clone())
        }
    };

    tracing::info!(
        target: "mcp",
        correlation_id = %correlation_id,
        tool_id = %tool_id,
        server = %server_name,
        "MCP tool call started"
    );

    // 1a. Per-tool connector permission gate (audit C-rank 1).
    // The permission store is keyed by connector *catalog* id (e.g.
    // "github"), written by
    // packages/ui/unified-chat/src/lib/connectorPermissionStore.ts, while
    // `server_name` here is the MCP server name (e.g. "connector-github").
    // those two strings never matched, so a saved "Always allow" or
    // "Blocked" choice had no effect. Map back to the catalog id via the
    // same table `get_connector_mcp_mapping` uses; fall back to the raw
    // server name for non-catalog (custom/user-added) MCP servers.
    let connector_id = crate::sys::commands::mcp_oauth::connector_id_for_server_name(&server_name)
        .map(|s| s.to_string())
        .unwrap_or_else(|| server_name.clone());
    let enc = encryption_from_state(&mp_state);
    // destructive: heuristically flag write/delete tools; conservative default is false
    // (the stored value overrides this at read time when the user has set a permission).
    let is_destructive =
        crate::sys::commands::connector_permissions::tool_name_looks_destructive(&bare_tool_name);

    let perm = resolve_permission(&enc, &connector_id, &bare_tool_name, is_destructive);

    match perm {
        PermissionLevel::Blocked => {
            tracing::warn!(
                target: "mcp",
                correlation_id = %correlation_id,
                tool = %tool_id,
                "Tool blocked by connector permission policy"
            );
            return Err(format!(
                "Tool '{}' is blocked by your connector permission settings. \
                 Change the permission in Settings → Connectors to allow it.",
                bare_tool_name
            ));
        }
        PermissionLevel::AlwaysAllow => {
            // Skip the approval dialog entirely.
            tracing::debug!(
                target: "mcp",
                correlation_id = %correlation_id,
                tool = %tool_id,
                "Tool auto-approved by connector permission policy (always-allow)"
            );
        }
        PermissionLevel::NeedsApproval => {
            // 1b. Existing confirmation dialog flow.
            let confirmation = ToolConfirmationRequest {
                request_id: correlation_id.clone(),
                tool_name: tool_id.clone(),
                tool_description: format!(
                    "Execute MCP tool '{}' on server '{}'",
                    tool_id, server_name
                ),
                parameters: serde_json::to_value(&arguments).unwrap_or(serde_json::json!({})),
                risk_level: RiskLevel::High,
                safety_tier: ToolSafetyTier::RequiresExplicitApproval,
                reason: "MCP tools can access system resources and external APIs.".to_string(),
                reversible: false,
                undo_description: None,
            };

            tracing::debug!(
                target: "mcp",
                correlation_id = %correlation_id,
                "Requesting tool confirmation"
            );

            let approved = request_tool_confirmation(&app, &confirmation_state, confirmation, 120)
                .await
                .map_err(|e| {
                    tracing::warn!(
                        target: "mcp",
                        correlation_id = %correlation_id,
                        error = %e,
                        "Tool confirmation failed"
                    );
                    e.to_string()
                })?;

            if !approved {
                tracing::info!(
                    target: "mcp",
                    correlation_id = %correlation_id,
                    "Tool execution cancelled by user"
                );
                return Err("Tool execution cancelled by user".to_string());
            }
        }
    }

    state
        .refresh_expiring_oauth_session(&app, &server_name)
        .await?;

    // Emit tool execution started event
    emit_mcp_event(
        &app,
        McpEvent::ToolExecutionStarted {
            tool_id: tool_id.clone(),
            server_name: server_name.clone(),
        },
    );

    tracing::debug!(
        target: "mcp",
        correlation_id = %correlation_id,
        tool_id = %tool_id,
        "Executing MCP tool"
    );

    let start_time = std::time::Instant::now();

    // Route the live execution path through McpToolExecutor so the timeout
    // has one source of truth.
    let result = state.tool_executor.execute_tool(&tool_id, arguments).await;

    // Handle timeout vs actual result
    let (success, duration_ms, final_result) = match result {
        Ok(execution) => {
            tracing::info!(
                target: "mcp",
                correlation_id = %correlation_id,
                tool_id = %tool_id,
                duration_ms = execution.duration_ms,
                "MCP tool call completed successfully"
            );
            (true, execution.duration_ms, Ok(execution.result))
        }
        Err(e) => {
            let duration_ms = start_time.elapsed().as_millis() as u64;
            tracing::error!(
                target: "mcp",
                correlation_id = %correlation_id,
                tool_id = %tool_id,
                error = %e,
                duration_ms = duration_ms,
                "MCP tool call failed"
            );
            (
                false,
                duration_ms,
                Err(format!("Tool execution failed: {}", e)),
            )
        }
    };

    // Emit tool execution completed event
    emit_mcp_event(
        &app,
        McpEvent::ToolExecutionCompleted {
            tool_id: tool_id.clone(),
            server_name,
            success,
            duration_ms,
        },
    );

    final_result
}

#[tauri::command]
pub async fn mcp_get_config(state: State<'_, McpState>) -> Result<Value, String> {
    let mut sanitized_config = state.config.lock().clone();
    for server_config in sanitized_config.mcp_servers.values_mut() {
        for env_value in server_config.env.values_mut() {
            if !env_value.starts_with("<from_") {
                *env_value = "<redacted>".to_string();
            }
        }

        // SECURITY: redact HTTP transport credentials too, they were previously
        // sent to the renderer in plaintext. api_key / bearer_token / all header
        // values are replaced with the sentinel; restore_redacted_env_values puts
        // the real values back on mcp_update_config so editing never wipes them.
        if let Some(crate::core::mcp::transport::TransportConfig::Http(http_config)) =
            server_config.transport.as_mut()
        {
            if http_config.api_key.is_some() {
                http_config.api_key = Some("<redacted>".to_string());
            }
            if http_config.bearer_token.is_some() {
                http_config.bearer_token = Some("<redacted>".to_string());
            }
            if http_config.oauth_client_secret.is_some() {
                http_config.oauth_client_secret = Some("<redacted>".to_string());
            }
            for header_value in http_config.headers.values_mut() {
                *header_value = "<redacted>".to_string();
            }
        }
    }

    serde_json::to_value(sanitized_config).map_err(|e| format!("Failed to serialize config: {}", e))
}

#[tauri::command]
pub async fn mcp_get_config_location() -> Result<McpConfigLocation, String> {
    resolve_config_location()
}

#[tauri::command]
pub async fn mcp_update_config(
    state: State<'_, McpState>,
    app: tauri::AppHandle,
    new_config: Value,
) -> Result<String, String> {
    let mut parsed_config: McpServersConfig =
        serde_json::from_value(new_config).map_err(|e| format!("Invalid config: {}", e))?;
    let existing_config = state.config.lock().clone();
    restore_redacted_env_values(&mut parsed_config, &existing_config, "<redacted>");
    let connected_servers = state.client.get_connected_servers();
    let servers_to_disconnect: Vec<String> = connected_servers
        .into_iter()
        .filter(|server_name| {
            let previous = existing_config.mcp_servers.get(server_name);
            let next = parsed_config.mcp_servers.get(server_name);
            match (previous, next) {
                (Some(previous), Some(next)) => {
                    serde_json::to_value(previous).ok() != serde_json::to_value(next).ok()
                }
                _ => true,
            }
        })
        .collect();
    let credential_scope = active_credential_scope();
    let orphaned_credential_rows: Vec<String> = existing_config
        .mcp_servers
        .iter()
        .filter(|(server_name, _)| !parsed_config.mcp_servers.contains_key(*server_name))
        .flat_map(|(server_name, removed)| {
            parsed_config.credential_rows_left_by(&credential_scope, server_name, removed)
        })
        .collect();
    state.persist_config_snapshot(&parsed_config).await?;

    *state.config.lock() = parsed_config;

    let mut warnings: Vec<String> = Vec::new();
    if let Err(error) = forget_credential_rows(&orphaned_credential_rows) {
        warnings.push(format!(
            "failed to delete the stored credentials of removed servers: {}",
            error
        ));
    }
    for server_name in servers_to_disconnect {
        match state.client.disconnect_server(&server_name).await {
            Ok(_) => {
                emit_mcp_event(
                    &app,
                    McpEvent::ServerConnectionChanged {
                        server_name: server_name.clone(),
                        connected: false,
                        error: None,
                    },
                );
                emit_mcp_event(
                    &app,
                    McpEvent::ToolsUpdated {
                        server_name: server_name.clone(),
                        tool_count: 0,
                    },
                );
            }
            Err(err) => warnings.push(format!("failed to disconnect '{}': {}", server_name, err)),
        }
    }

    if warnings.is_empty() {
        Ok("Configuration updated. Connect a server explicitly to start it.".to_string())
    } else {
        Ok(format!(
            "Configuration updated with warnings: {}",
            warnings.join("; ")
        ))
    }
}

#[tauri::command]
pub async fn mcp_enable_server(
    state: State<'_, McpState>,
    app: tauri::AppHandle,
    name: String,
) -> Result<String, String> {
    set_server_enabled(state, app, name, true).await
}

#[tauri::command]
pub async fn mcp_disable_server(
    state: State<'_, McpState>,
    app: tauri::AppHandle,
    name: String,
) -> Result<String, String> {
    set_server_enabled(state, app, name, false).await
}

async fn set_server_enabled(
    state: State<'_, McpState>,
    app: tauri::AppHandle,
    name: String,
    enabled: bool,
) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Server name cannot be empty".to_string());
    }

    if enabled {
        {
            let mut config_guard = state.config.lock();
            let entry = config_guard
                .mcp_servers
                .get_mut(trimmed)
                .ok_or_else(|| format!("Server '{}' not found in configuration", trimmed))?;
            entry.enabled = true;
        }
        let snapshot = state.config.lock().clone();
        state.persist_config_snapshot(&snapshot).await?;

        // Switching a server on is where its launch is approved, and that is
        // decided in the native dialog. A no leaves it off.
        let switched_on = snapshot.mcp_servers.get(trimmed).cloned();
        let approval = match &switched_on {
            Some(server) => {
                crate::core::mcp::launch_approval::ensure_approved(&app, trimmed, server)
                    .await
                    .map(|_| ())
            }
            None => Err(format!("Server '{}' not found in configuration", trimmed)),
        };
        if let Err(refusal) = approval {
            if let Some(entry) = state.config.lock().mcp_servers.get_mut(trimmed) {
                entry.enabled = false;
            }
            let reverted = state.config.lock().clone();
            state.persist_config_snapshot(&reverted).await?;
            return Err(refusal);
        }

        if state
            .client
            .get_connected_servers()
            .contains(&trimmed.to_string())
        {
            emit_mcp_event(
                &app,
                McpEvent::ServerConnectionChanged {
                    server_name: trimmed.to_string(),
                    connected: true,
                    error: None,
                },
            );
            let tool_count = state
                .client
                .list_server_tools(trimmed)
                .map(|tools| tools.len())
                .unwrap_or(0);
            emit_mcp_event(
                &app,
                McpEvent::ToolsUpdated {
                    server_name: trimmed.to_string(),
                    tool_count,
                },
            );
            return Ok(format!("Server '{}' enabled", trimmed));
        }

        emit_mcp_event(
            &app,
            McpEvent::ServerConnectionChanged {
                server_name: trimmed.to_string(),
                connected: false,
                error: None,
            },
        );
        emit_mcp_event(
            &app,
            McpEvent::ToolsUpdated {
                server_name: trimmed.to_string(),
                tool_count: 0,
            },
        );
        Ok(format!(
            "Server '{}' enabled. Connect it explicitly to start it.",
            trimmed
        ))
    } else {
        {
            let config_guard = state.config.lock();
            if !config_guard.mcp_servers.contains_key(trimmed) {
                return Err(format!("Server '{}' not found in configuration", trimmed));
            }
        }

        let was_connected = state
            .client
            .get_connected_servers()
            .contains(&trimmed.to_string());
        if was_connected {
            if let Err(err) = state.client.disconnect_server(trimmed).await {
                let err_message = format!("Failed to stop '{}': {}", trimmed, err);
                emit_mcp_event(
                    &app,
                    McpEvent::ServerConnectionChanged {
                        server_name: trimmed.to_string(),
                        connected: false,
                        error: Some(err_message.clone()),
                    },
                );
                return Err(err_message);
            }
        }

        {
            let mut config_guard = state.config.lock();
            let entry = config_guard
                .mcp_servers
                .get_mut(trimmed)
                .ok_or_else(|| format!("Server '{}' not found in configuration", trimmed))?;
            entry.enabled = false;
        }
        let snapshot = state.config.lock().clone();
        state.persist_config_snapshot(&snapshot).await?;
        if let Err(error) = crate::core::mcp::config::withdraw_launch_approval(trimmed) {
            tracing::warn!("[MCP] Could not withdraw the approval of '{trimmed}': {error}");
        }

        emit_mcp_event(
            &app,
            McpEvent::ServerConnectionChanged {
                server_name: trimmed.to_string(),
                connected: false,
                error: None,
            },
        );
        emit_mcp_event(
            &app,
            McpEvent::ToolsUpdated {
                server_name: trimmed.to_string(),
                tool_count: 0,
            },
        );
        Ok(format!("Server '{}' disabled", trimmed))
    }
}

#[tauri::command]
pub async fn mcp_get_stats(state: State<'_, McpState>) -> Result<HashMap<String, usize>, String> {
    Ok(state.client.get_stats())
}

#[tauri::command]
pub async fn mcp_get_server_logs(
    #[allow(non_snake_case)] serverName: String,
    lines: Option<usize>,
    _state: State<'_, McpState>,
) -> Result<Vec<String>, String> {
    Ok(crate::core::mcp::logs::get_server_logs(&serverName, lines))
}

#[tauri::command]
pub async fn mcp_get_health(
    state: State<'_, McpState>,
) -> Result<Vec<crate::core::mcp::ServerHealth>, String> {
    Ok(state.health_monitor.refresh_connected_health().await)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpCredentialSlot {
    pub server_name: String,
    pub key: String,
    pub stored: bool,
}

/// The credentials the configured servers read from the credential store,
/// and whether each one has a stored value. Values are never returned.
#[tauri::command]
pub async fn mcp_list_credential_slots(
    state: State<'_, McpState>,
) -> Result<Vec<McpCredentialSlot>, String> {
    let config = state.config.lock().clone();
    let keys = config.credential_store_keys();
    if keys.is_empty() {
        return Ok(Vec::new());
    }

    let scope = active_credential_scope();
    let conn = open_mcp_settings_db()?;
    let mut slots = Vec::with_capacity(keys.len());
    for (server_name, key) in keys {
        config.adopt_legacy_credential(&conn, &scope, &server_name, &key)?;
        let stored = credential_row_exists(&conn, &mcp_credential_row(&scope, &server_name, &key))?;
        slots.push(McpCredentialSlot {
            server_name,
            key,
            stored,
        });
    }
    Ok(slots)
}

fn credential_row_exists(conn: &rusqlite::Connection, row: &str) -> Result<bool, String> {
    use rusqlite::OptionalExtension;

    conn.query_row(
        "SELECT 1 FROM settings_v2 WHERE key = ?1",
        rusqlite::params![row],
        |_| Ok(()),
    )
    .optional()
    .map(|row| row.is_some())
    .map_err(|e| format!("Failed to read credential state: {}", e))
}

fn delete_credential_rows(conn: &rusqlite::Connection, rows: &[String]) -> Result<usize, String> {
    let mut deleted = 0;
    for row in rows {
        deleted += conn
            .execute(
                "DELETE FROM settings_v2 WHERE key = ?1",
                rusqlite::params![row],
            )
            .map_err(|e| format!("Failed to delete credential: {}", e))?;
    }
    Ok(deleted)
}

pub(crate) fn forget_credential_rows(rows: &[String]) -> Result<usize, String> {
    if rows.is_empty() {
        return Ok(0);
    }
    let conn = open_mcp_settings_db()?;
    delete_credential_rows(&conn, rows)
}

fn authorize_credential_delete(
    config: &McpServersConfig,
    conn: &rusqlite::Connection,
    scope: &str,
    server_name: &str,
    key: &str,
) -> Result<(), String> {
    let Err(refusal) = require_declared_credential_slot(config, server_name, key) else {
        return Ok(());
    };
    for row in config.deletable_credential_rows(scope, server_name, key) {
        if credential_row_exists(conn, &row)? {
            return Ok(());
        }
    }
    Err(refusal)
}

fn require_declared_credential_slot(
    config: &McpServersConfig,
    server_name: &str,
    key: &str,
) -> Result<(), String> {
    if !config.mcp_servers.contains_key(server_name) {
        return Err(format!("MCP server '{server_name}' is not configured"));
    }
    let declared = config
        .credential_store_keys()
        .iter()
        .any(|(slot_server, slot_key)| slot_server == server_name && slot_key == key);
    if !declared {
        return Err(format!(
            "MCP server '{server_name}' does not read '{key}' from the credential store"
        ));
    }
    Ok(())
}

/// Set a credential for an MCP server (stores in encrypted database)
#[tauri::command]
pub async fn mcp_set_credential(
    state: State<'_, McpState>,
    server_name: String,
    key: String,
    value: String,
) -> Result<String, String> {
    use crate::core::mcp::config::encrypt_mcp_credential;

    validate_credential_names(&server_name, &key)?;
    let config = state.config.lock().clone();
    require_declared_credential_slot(&config, &server_name, &key)?;

    // Encrypt the credential
    let encrypted =
        encrypt_mcp_credential(&value).ok_or_else(|| "Failed to encrypt credential".to_string())?;

    let scope = active_credential_scope();
    let conn = open_mcp_settings_db()?;

    config.adopt_legacy_credential(&conn, &scope, &server_name, &key)?;
    let cred_key = mcp_credential_row(&scope, &server_name, &key);
    upsert_settings_v2_value(&conn, &cred_key, &encrypted, "security", true)?;

    tracing::info!(
        "Credential stored for MCP server: {} / {}",
        server_name,
        key
    );
    Ok(format!("Credential stored for {} / {}", server_name, key))
}

/// Delete a credential for an MCP server from encrypted database
#[tauri::command]
pub async fn mcp_delete_credential(
    state: State<'_, McpState>,
    server_name: String,
    key: String,
) -> Result<String, String> {
    let scope = active_credential_scope();
    let config = state.config.lock().clone();
    let conn = open_mcp_settings_db()?;
    authorize_credential_delete(&config, &conn, &scope, &server_name, &key)?;

    delete_credential_rows(
        &conn,
        &config.deletable_credential_rows(&scope, &server_name, &key),
    )?;

    tracing::info!(
        "Credential deleted for MCP server: {} / {}",
        server_name,
        key
    );
    Ok(format!("Credential deleted for {} / {}", server_name, key))
}

/// Update the filesystem MCP server allowed directories.
///
/// This command updates the MCP filesystem server to use the specified directories
/// as allowed roots. It restarts the server only if the user already connected it.
///
/// This should be called when the user changes allowed directories in settings.
#[tauri::command]
pub async fn mcp_update_filesystem_directories(
    state: State<'_, McpState>,
    app: tauri::AppHandle,
    directories: Vec<String>,
) -> Result<String, String> {
    if directories.is_empty() {
        return Err("At least one directory must be provided".to_string());
    }
    crate::sys::commands::tool_confirmation::require_granted_folders(&app, &directories).await?;

    tracing::info!(
        "[MCP] Updating filesystem server with directories: {:?}",
        directories
    );

    match state.update_filesystem_roots(&directories).await {
        Ok(true) => Ok(format!(
            "Filesystem server updated with {} directory(ies)",
            directories.len()
        )),
        Ok(false) => Ok("Filesystem server already configured with these directories".to_string()),
        Err(e) => Err(e),
    }
}

#[cfg(test)]
mod filesystem_root_update_tests {
    use super::*;

    fn filesystem_launch(roots: &[&str]) -> McpServerConfig {
        let mut args = vec!["-y".to_string(), FILESYSTEM_PACKAGE.to_string()];
        args.extend(roots.iter().map(|root| root.to_string()));
        McpServerConfig {
            command: "npx".to_string(),
            args,
            env: HashMap::new(),
            enabled: true,
            transport: None,
            allow_local_network: false,
        }
    }

    fn same_apart_from_roots(one: &McpServerConfig, other: &McpServerConfig) -> bool {
        serde_json::to_value(apart_from_filesystem_roots(one)).unwrap()
            == serde_json::to_value(apart_from_filesystem_roots(other)).unwrap()
    }

    #[test]
    fn only_the_folders_are_set_aside_when_two_filesystem_launches_are_compared() {
        let running = filesystem_launch(&["/Users/someone/code"]);

        assert!(same_apart_from_roots(
            &running,
            &filesystem_launch(&["/Users/someone/code", "/Users/someone/notes"])
        ));
        assert!(same_apart_from_roots(&running, &filesystem_launch(&[])));

        let mut other_command = filesystem_launch(&["/Users/someone/code"]);
        other_command.command = "/tmp/anything".to_string();
        assert!(!same_apart_from_roots(&running, &other_command));

        let mut other_environment = filesystem_launch(&["/Users/someone/code"]);
        other_environment.env.insert(
            "NODE_OPTIONS".to_string(),
            "--require /tmp/x.js".to_string(),
        );
        assert!(!same_apart_from_roots(&running, &other_environment));

        let mut flag_before_package = filesystem_launch(&["/Users/someone/code"]);
        flag_before_package
            .args
            .insert(0, "--registry=https://example.test".to_string());
        assert!(!same_apart_from_roots(&running, &flag_before_package));

        let mut other_package = filesystem_launch(&[]);
        other_package.args = vec!["-y".to_string(), "some-other-package".to_string()];
        assert!(
            !same_apart_from_roots(&running, &other_package),
            "a launch that does not name the package has no folders to set aside"
        );
    }

    /// The restart used to be approved from whatever the configuration said
    /// at that moment, which the page can rewrite under a running server.
    #[test]
    fn the_restart_is_held_to_the_launch_the_server_was_started_as() {
        let shipped = include_str!("mcp.rs")
            .split("#[cfg(test)]")
            .next()
            .unwrap_or_default();
        let update = shipped
            .split("async fn update_filesystem_roots_inner(")
            .nth(1)
            .expect("update_filesystem_roots_inner");

        let started = update
            .find("self.client.started_launch(\"filesystem\")")
            .expect("the started launch is read");
        let stopped = update
            .find("disconnect_server(\"filesystem\")")
            .expect("the server is stopped");
        let continued = update
            .find("ApprovedLaunch::continuing(")
            .expect("the restart is checked");
        assert!(started < stopped && stopped < continued);
        assert!(update.contains("running.as_ref(),"));
    }

    #[tokio::test]
    async fn disconnected_legacy_enabled_filesystem_server_stays_disconnected_after_root_update() {
        let state = McpState::new();
        {
            let mut config = state.config.lock();
            let filesystem = config
                .mcp_servers
                .get_mut("filesystem")
                .expect("packaged filesystem config");
            // Simulate a user profile written by an older release, where the
            // packaged default was incorrectly marked enabled.
            filesystem.enabled = true;
            filesystem.args = vec![
                "-y".to_string(),
                "@modelcontextprotocol/server-filesystem".to_string(),
                ".".to_string(),
            ];
        }

        let root = std::env::temp_dir().to_string_lossy().to_string();
        let changed = state
            .update_filesystem_roots_for_session(std::slice::from_ref(&root))
            .await
            .expect("root update should succeed");

        assert!(changed);
        assert!(
            state.client.get_connected_servers().is_empty(),
            "a root update must never start a disconnected MCP server"
        );
        assert_eq!(
            state.config.lock().mcp_servers["filesystem"].args,
            vec![
                "-y".to_string(),
                "@modelcontextprotocol/server-filesystem".to_string(),
                root,
            ]
        );
    }
}

#[cfg(test)]
mod reload_tests {
    use super::servers_to_disconnect;

    #[test]
    fn a_reload_disconnects_configured_servers_and_keeps_extension_servers() {
        let connected = vec![
            "filesystem".to_string(),
            "ext-notes".to_string(),
            "github".to_string(),
        ];

        assert_eq!(
            servers_to_disconnect(connected.clone(), &["ext-notes".to_string()]),
            vec!["filesystem".to_string(), "github".to_string()]
        );
        assert_eq!(servers_to_disconnect(connected.clone(), &[]), connected);
    }

    #[test]
    fn a_configured_server_is_not_kept_just_for_looking_like_an_extension() {
        assert_eq!(
            servers_to_disconnect(vec!["ext-lookalike".to_string()], &[]),
            vec!["ext-lookalike".to_string()]
        );
    }
}

#[cfg(test)]
mod credential_slot_tests {
    use super::{
        authorize_credential_delete, credential_row_exists, delete_credential_rows,
        require_declared_credential_slot, McpServersConfig,
    };
    use crate::core::mcp::config::{
        credential_scope, mcp_credential_row, upsert_settings_v2_value, validate_credential_names,
    };

    const GITHUB_LEGACY_ROW: &str = "mcp_credential_github_GITHUB_PERSONAL_ACCESS_TOKEN";

    fn settings_db_with(rows: &[&str]) -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().expect("in-memory database");
        conn.execute(
            "CREATE TABLE settings_v2 (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                category TEXT NOT NULL,
                encrypted INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )
        .expect("settings table");
        for row in rows {
            upsert_settings_v2_value(
                &conn,
                row,
                &format!("ciphertext of {row}"),
                "security",
                true,
            )
            .expect("stored credential");
        }
        conn
    }

    fn stored_value(conn: &rusqlite::Connection, row: &str) -> Option<String> {
        use rusqlite::OptionalExtension;

        conn.query_row(
            "SELECT value FROM settings_v2 WHERE key = ?1",
            rusqlite::params![row],
            |found| found.get(0),
        )
        .optional()
        .expect("readable settings")
    }

    fn colliding() -> McpServersConfig {
        serde_json::from_str(
            r#"{
                "mcpServers": {
                    "github": {
                        "command": "npx",
                        "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "<from_credential_manager>" }
                    },
                    "github_GITHUB_PERSONAL": {
                        "command": "./planted",
                        "env": { "ACCESS_TOKEN": "<from_credential_manager>" }
                    }
                }
            }"#,
        )
        .expect("config parses")
    }

    #[test]
    fn servers_whose_names_and_slots_concatenate_alike_never_share_a_row() {
        let scope = credential_scope(None);
        let github = mcp_credential_row(&scope, "github", "GITHUB_PERSONAL_ACCESS_TOKEN");
        let planted = mcp_credential_row(&scope, "github_GITHUB_PERSONAL", "ACCESS_TOKEN");

        assert_eq!(
            github,
            "mcp_secret/user/676974687562/GITHUB_PERSONAL_ACCESS_TOKEN"
        );
        assert_ne!(github, planted);
        assert_ne!(
            mcp_credential_row(&scope, "a", "b/c"),
            mcp_credential_row(&scope, "a/b", "c")
        );
        assert!(!github.starts_with("mcp_credential_"));
    }

    #[test]
    fn a_colliding_server_cannot_adopt_another_servers_stored_credential() {
        let scope = credential_scope(None);
        let conn = settings_db_with(&[GITHUB_LEGACY_ROW]);
        let config = colliding();

        assert_eq!(
            config.adopt_legacy_credential(&conn, &scope, "github_GITHUB_PERSONAL", "ACCESS_TOKEN"),
            Ok(false)
        );
        assert_eq!(
            config.adopt_legacy_credential(&conn, &scope, "github", "GITHUB_PERSONAL_ACCESS_TOKEN"),
            Ok(false),
            "a row two configured servers spell belongs to neither"
        );
        let planted_row = mcp_credential_row(&scope, "github_GITHUB_PERSONAL", "ACCESS_TOKEN");
        assert_eq!(stored_value(&conn, &planted_row), None);
        assert!(stored_value(&conn, GITHUB_LEGACY_ROW).is_some());

        let mut alone = colliding();
        alone.mcp_servers.remove("github_GITHUB_PERSONAL");
        assert_eq!(
            alone.adopt_legacy_credential(&conn, &scope, "github", "GITHUB_PERSONAL_ACCESS_TOKEN"),
            Ok(true)
        );
        let github_row = mcp_credential_row(&scope, "github", "GITHUB_PERSONAL_ACCESS_TOKEN");
        assert_eq!(
            stored_value(&conn, &github_row),
            Some(format!("ciphertext of {GITHUB_LEGACY_ROW}"))
        );
        assert_eq!(stored_value(&conn, GITHUB_LEGACY_ROW), None);
        assert_eq!(
            colliding().adopt_legacy_credential(
                &conn,
                &scope,
                "github_GITHUB_PERSONAL",
                "ACCESS_TOKEN"
            ),
            Ok(false)
        );
        assert_eq!(stored_value(&conn, &planted_row), None);
    }

    #[test]
    fn a_slot_the_server_does_not_declare_adopts_nothing() {
        let scope = credential_scope(None);
        let conn = settings_db_with(&[GITHUB_LEGACY_ROW]);
        let mut config = colliding();
        config.mcp_servers.remove("github");

        assert_eq!(
            config.adopt_legacy_credential(&conn, &scope, "github", "GITHUB_PERSONAL_ACCESS_TOKEN"),
            Ok(false),
            "a server that is not configured adopts nothing"
        );
        assert_eq!(
            config.adopt_legacy_credential(&conn, &scope, "github_GITHUB_PERSONAL", "OTHER"),
            Ok(false)
        );
        assert!(stored_value(&conn, GITHUB_LEGACY_ROW).is_some());
    }

    #[test]
    fn a_project_config_reads_only_what_was_stored_for_its_own_folder() {
        let user = credential_scope(None);
        let project = credential_scope(Some("/work/repo"));
        let other_project = credential_scope(Some("/work/other"));
        let user_row = mcp_credential_row(&user, "github", "GITHUB_PERSONAL_ACCESS_TOKEN");
        let project_row = mcp_credential_row(&project, "github", "GITHUB_PERSONAL_ACCESS_TOKEN");
        let other_row =
            mcp_credential_row(&other_project, "github", "GITHUB_PERSONAL_ACCESS_TOKEN");
        assert_ne!(user_row, project_row);
        assert_ne!(project_row, other_row);

        let conn = settings_db_with(&[GITHUB_LEGACY_ROW, user_row.as_str()]);
        let mut config = colliding();
        config.mcp_servers.remove("github_GITHUB_PERSONAL");

        assert_eq!(
            config.adopt_legacy_credential(
                &conn,
                &project,
                "github",
                "GITHUB_PERSONAL_ACCESS_TOKEN"
            ),
            Ok(false)
        );
        assert_eq!(credential_row_exists(&conn, &project_row), Ok(false));
        assert!(stored_value(&conn, GITHUB_LEGACY_ROW).is_some());
        assert_eq!(
            config.deletable_credential_rows(&project, "github", "GITHUB_PERSONAL_ACCESS_TOKEN"),
            vec![project_row]
        );
    }

    #[test]
    fn names_that_cannot_be_stored_are_refused_on_save() {
        assert_eq!(
            validate_credential_names("github", "GITHUB_PERSONAL_ACCESS_TOKEN"),
            Ok(())
        );
        for (server_name, key) in [
            ("", "KEY"),
            ("   ", "KEY"),
            ("github", ""),
            ("git\nhub", "KEY"),
            ("github", "KEY\u{0}"),
        ] {
            assert!(
                validate_credential_names(server_name, key).is_err(),
                "{server_name:?} / {key:?}"
            );
        }
        assert!(validate_credential_names(&"s".repeat(257), "KEY").is_err());
        assert!(validate_credential_names("github", &"K".repeat(257)).is_err());
    }

    #[test]
    fn removing_a_server_deletes_its_stored_credentials_and_no_other() {
        let scope = credential_scope(None);
        let project = credential_scope(Some("/work/repo"));
        let mut config = configured();
        config.mcp_servers.insert(
            "stripe_LOG".to_string(),
            serde_json::from_str(
                r#"{ "command": "npx", "env": { "LEVEL": "<from_credential_manager>" } }"#,
            )
            .expect("server parses"),
        );
        let stripe_row = mcp_credential_row(&scope, "stripe", "STRIPE_SECRET_KEY");
        let stripe_project_row = mcp_credential_row(&project, "stripe", "STRIPE_SECRET_KEY");
        let github_row = mcp_credential_row(&scope, "github", "GITHUB_PERSONAL_ACCESS_TOKEN");
        let conn = settings_db_with(&[
            stripe_row.as_str(),
            stripe_project_row.as_str(),
            github_row.as_str(),
            "mcp_credential_stripe_bearer_token",
            "mcp_credential_stripe_LOG_LEVEL",
        ]);

        let removed = config.mcp_servers.remove("stripe").expect("configured");
        let rows = config.credential_rows_left_by(&scope, "stripe", &removed);

        assert!(rows.contains(&stripe_row));
        assert!(rows.contains(&"mcp_credential_stripe_bearer_token".to_string()));
        assert!(
            !rows.contains(&"mcp_credential_stripe_LOG_LEVEL".to_string()),
            "stripe_LOG still spells that row"
        );
        assert_eq!(delete_credential_rows(&conn, &rows), Ok(2));
        assert_eq!(credential_row_exists(&conn, &stripe_row), Ok(false));
        assert_eq!(
            credential_row_exists(&conn, "mcp_credential_stripe_bearer_token"),
            Ok(false)
        );
        assert_eq!(credential_row_exists(&conn, &stripe_project_row), Ok(true));
        assert_eq!(credential_row_exists(&conn, &github_row), Ok(true));
        assert_eq!(
            credential_row_exists(&conn, "mcp_credential_stripe_LOG_LEVEL"),
            Ok(true)
        );
    }

    #[test]
    fn a_stored_credential_of_a_removed_server_can_still_be_deleted() {
        let scope = credential_scope(None);
        let config = configured();
        let postgres_row = mcp_credential_row(&scope, "postgres", "POSTGRES_CONNECTION_STRING");
        let conn = settings_db_with(&[postgres_row.as_str(), "mcp_credential_mysql_MYSQL_URL"]);

        assert_eq!(
            authorize_credential_delete(
                &config,
                &conn,
                &scope,
                "postgres",
                "POSTGRES_CONNECTION_STRING"
            ),
            Ok(())
        );
        assert_eq!(
            authorize_credential_delete(&config, &conn, &scope, "mysql", "MYSQL_URL"),
            Ok(()),
            "a row stored before scopes that no configured server spells"
        );
        assert_eq!(
            authorize_credential_delete(&config, &conn, &scope, "stripe", "STRIPE_SECRET_KEY"),
            Ok(())
        );

        let refusal = authorize_credential_delete(&config, &conn, &scope, "postgres", "OTHER_KEY")
            .expect_err("nothing stored");
        assert!(
            refusal.contains("'postgres' is not configured"),
            "{refusal}"
        );
        assert!(require_declared_credential_slot(
            &config,
            "postgres",
            "POSTGRES_CONNECTION_STRING"
        )
        .is_err());
    }

    fn configured() -> McpServersConfig {
        serde_json::from_str(
            r#"{
                "mcpServers": {
                    "stripe": {
                        "command": "npx",
                        "env": {
                            "STRIPE_SECRET_KEY": "<from_credential_manager>",
                            "LOG_LEVEL": "debug"
                        }
                    },
                    "github": {
                        "command": "npx",
                        "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "<from_oauth:github>" }
                    }
                }
            }"#,
        )
        .expect("config parses")
    }

    #[test]
    fn a_declared_slot_of_a_configured_server_is_accepted() {
        assert_eq!(
            require_declared_credential_slot(&configured(), "stripe", "STRIPE_SECRET_KEY"),
            Ok(())
        );
    }

    #[test]
    fn a_server_that_is_not_configured_is_refused() {
        let refusal =
            require_declared_credential_slot(&configured(), "postgres", "STRIPE_SECRET_KEY")
                .expect_err("unknown server");
        assert!(
            refusal.contains("'postgres' is not configured"),
            "{refusal}"
        );
    }

    #[test]
    fn a_key_the_server_does_not_read_from_the_credential_store_is_refused() {
        let config = configured();
        for (server, key) in [
            ("stripe", "LOG_LEVEL"),
            ("stripe", "STRIPE_WEBHOOK_SECRET"),
            ("stripe", "GITHUB_PERSONAL_ACCESS_TOKEN"),
            ("github", "GITHUB_PERSONAL_ACCESS_TOKEN"),
            ("stripe", ""),
        ] {
            let refusal = require_declared_credential_slot(&config, server, key)
                .expect_err("undeclared slot");
            assert!(
                refusal.contains("does not read"),
                "{server}/{key}: {refusal}"
            );
        }
    }

    #[test]
    fn a_name_that_only_concatenates_to_a_declared_slot_is_refused() {
        let config: McpServersConfig = serde_json::from_str(
            r#"{
                "mcpServers": {
                    "notes": {
                        "command": "npx",
                        "env": { "API_TOKEN": "<from_credential_manager>" }
                    }
                }
            }"#,
        )
        .expect("config parses");

        assert!(require_declared_credential_slot(&config, "notes_API", "TOKEN").is_err());
        assert!(require_declared_credential_slot(&config, "notes", "API_TOKEN").is_ok());
    }
}

#[cfg(test)]
mod server_info_shape_tests {
    use super::McpServerInfo;

    /// `src/types/mcp.ts` reads the server list by these names; the connector
    /// health list showed "undefined tools" while it read `tool_count`.
    #[test]
    fn a_listed_server_reports_its_tool_count_as_the_settings_ui_reads_it() {
        let listed = serde_json::to_value(McpServerInfo {
            name: "github".to_string(),
            enabled: true,
            connected: true,
            tool_count: 4,
            command: "npx server".to_string(),
            local: true,
            sandboxed: true,
            sandbox_notice: None,
            receives_secrets: Vec::new(),
            approval_covers_files: Vec::new(),
            approval_notice: None,
        })
        .unwrap();

        assert_eq!(listed["toolCount"], 4);
        assert!(listed.get("tool_count").is_none());
    }
}
