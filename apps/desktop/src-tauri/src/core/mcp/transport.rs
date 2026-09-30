use super::logs::append_server_log;
use super::oauth::{DesktopBrowser, DesktopTokenStore};
use super::protocol::{JsonRpcResponse, RequestId};
use crate::core::mcp::{McpError, McpResult};
use agiworkforce_mcp::{McpNotification, NegotiatedServer};
use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::{mpsc, oneshot};

const HTTP_REQUEST_TIMEOUT_SECS: u64 = 30;

const STDIO_REQUEST_TIMEOUT_SECS: u64 = 120;

const SSE_STREAM_IDLE_TIMEOUT_SECS: u64 = 60;

const STDIO_LIVENESS_POLL_SECS: u64 = 5;

#[async_trait]
pub trait McpTransport: Send + Sync {
    async fn send_request(
        &self,
        method: String,
        params: Option<serde_json::Value>,
    ) -> McpResult<JsonRpcResponse>;

    fn is_alive(&self) -> bool;

    async fn shutdown(&self) -> McpResult<()>;
}

type Notifications = parking_lot::Mutex<Option<mpsc::Receiver<McpNotification>>>;

pub struct StdioTransport {
    tx: mpsc::UnboundedSender<EngineCommand>,
    alive: Arc<AtomicBool>,
    is_shutdown: Arc<AtomicBool>,
    shutdown_signal: Arc<tokio::sync::Notify>,
    negotiated: NegotiatedServer,
    notifications: Notifications,
}

enum EngineCommand {
    Request {
        method: String,
        params: Option<serde_json::Value>,
        reply: oneshot::Sender<McpResult<JsonRpcResponse>>,
    },
    Shutdown {
        reply: oneshot::Sender<()>,
    },
}

fn map_engine_error(e: agiworkforce_mcp::McpError) -> McpError {
    let msg = format!("{:#}", e.as_anyhow());
    if e.is_unsupported_protocol_version() {
        McpError::UnsupportedProtocolVersion(msg)
    } else if e.is_authorization_required() {
        McpError::ConnectionError(format!("{msg}. Reconnect this connector to sign in again."))
    } else if e.rpc_error().is_some() {
        McpError::RmcpError(msg)
    } else {
        McpError::ConnectionError(msg)
    }
}

fn drain_engine_stderr(server_name: &str, client: &agiworkforce_mcp::McpClient) {
    for line in client.drain_stderr() {
        tracing::debug!("[MCP Server stderr] {}", line);
        append_server_log(server_name, format!("[stderr] {}", line));
    }
}

fn client_metadata_document_url() -> Option<String> {
    agiworkforce_mcp::oauth::client_metadata_document_url(
        &crate::sys::account::get_api_base_url(),
        "desktop",
    )
}

fn engine_hooks(server_name: &str, interactive: Arc<AtomicBool>) -> agiworkforce_mcp::ClientHooks {
    agiworkforce_mcp::ClientHooks {
        token_store: Arc::new(DesktopTokenStore),
        elicitation: Arc::new(agiworkforce_mcp::AutoDeclineHandler),
        browser: Arc::new(DesktopBrowser { interactive }),
        client_info: agiworkforce_mcp::ClientInfo {
            name: "AGI Workforce".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
        },
        client_metadata_url: client_metadata_document_url(),
        on_log: {
            let name = server_name.to_string();
            Arc::new(move |msg: &str| {
                tracing::info!("[MCP Transport] [{}] {}", name, msg);
            })
        },
    }
}

#[allow(clippy::too_many_arguments)]
fn spawn_engine_actor(
    server_name: String,
    mut client: agiworkforce_mcp::McpClient,
    mut rx: mpsc::UnboundedReceiver<EngineCommand>,
    response_seq: Arc<AtomicU64>,
    alive: Arc<AtomicBool>,
    is_shutdown: Arc<AtomicBool>,
    shutdown_signal: Arc<tokio::sync::Notify>,
    request_timeout: std::time::Duration,
) {
    tokio::spawn(async move {
        let mut liveness =
            tokio::time::interval(std::time::Duration::from_secs(STDIO_LIVENESS_POLL_SECS));
        liveness.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

        loop {
            tokio::select! {
                cmd = rx.recv() => match cmd {
                    Some(EngineCommand::Request { method, params, reply }) => {
                        if is_shutdown.load(Ordering::SeqCst) {
                            let _ = reply.send(Err(McpError::ConnectionError(
                                "Transport shutting down".to_string(),
                            )));
                            continue;
                        }

                        let outcome = {
                            let request = client.request(&method, params, request_timeout);
                            tokio::pin!(request);
                            tokio::select! {
                                result = &mut request => Some(result),
                                _ = shutdown_signal.notified() => None,
                            }
                        };

                        match outcome {
                            Some(result) => {
                                drain_engine_stderr(&server_name, &client);
                                let mapped = match result {
                                    Ok(value) => {
                                        let seq = response_seq.fetch_add(1, Ordering::SeqCst);
                                        Ok(JsonRpcResponse {
                                            jsonrpc: "2.0".to_string(),
                                            result: value.unwrap_or(serde_json::Value::Null),
                                            id: RequestId::Number((seq % i64::MAX as u64) as i64),
                                        })
                                    }
                                    Err(e) => {
                                        alive.store(
                                            client.transport_alive(),
                                            Ordering::SeqCst,
                                        );
                                        Err(map_engine_error(e))
                                    }
                                };
                                let _ = reply.send(mapped);
                            }
                            None => {
                                let _ = reply.send(Err(McpError::ConnectionError(
                                    "Transport shutting down".to_string(),
                                )));
                                let _ = client.shutdown().await;
                                drain_engine_stderr(&server_name, &client);
                                alive.store(false, Ordering::SeqCst);
                                break;
                            }
                        }
                    }
                    Some(EngineCommand::Shutdown { reply }) => {
                        let _ = client.shutdown().await;
                        drain_engine_stderr(&server_name, &client);
                        alive.store(false, Ordering::SeqCst);
                        let _ = reply.send(());
                        break;
                    }
                    None => {
                        let _ = client.shutdown().await;
                        alive.store(false, Ordering::SeqCst);
                        break;
                    }
                },
                _ = liveness.tick() => {
                    alive.store(client.transport_alive(), Ordering::SeqCst);
                    drain_engine_stderr(&server_name, &client);
                }
            }
        }

        tracing::info!("[MCP Transport] Engine actor for '{}' stopped", server_name);
    });
}

async fn send_engine_request(
    tx: &mpsc::UnboundedSender<EngineCommand>,
    method: String,
    params: Option<serde_json::Value>,
    timeout: std::time::Duration,
) -> Option<McpResult<JsonRpcResponse>> {
    let (reply_tx, reply_rx) = oneshot::channel();
    if tx
        .send(EngineCommand::Request {
            method,
            params,
            reply: reply_tx,
        })
        .is_err()
    {
        return Some(Err(McpError::ConnectionError(
            "Failed to send request: channel closed".to_string(),
        )));
    }
    match tokio::time::timeout(timeout, reply_rx).await {
        Ok(Ok(result)) => Some(result),
        Ok(Err(_)) => Some(Err(McpError::ConnectionError(
            "Response channel closed".to_string(),
        ))),
        Err(_) => None,
    }
}

async fn shutdown_engine(
    tx: &mpsc::UnboundedSender<EngineCommand>,
    is_shutdown: &AtomicBool,
    shutdown_signal: &tokio::sync::Notify,
    alive: &AtomicBool,
) {
    is_shutdown.store(true, Ordering::SeqCst);
    shutdown_signal.notify_waiters();
    let (reply_tx, reply_rx) = oneshot::channel();
    if tx.send(EngineCommand::Shutdown { reply: reply_tx }).is_ok() {
        let _ = tokio::time::timeout(tokio::time::Duration::from_secs(5), reply_rx).await;
    }
    alive.store(false, Ordering::SeqCst);
}

/// Build an augmented PATH string that includes common Node.js install locations.
///
/// Tauri desktop apps launched from Finder/Dock (macOS) or without a full shell
/// environment (Windows) may inherit a minimal PATH that omits user-installed
/// Node.js locations. This helper builds a comprehensive PATH so child processes
/// can find `npx`, `node`, `uvx`, etc.
///
/// On Windows, PATH entries are separated by `;` and Node.js is typically found
/// in `%APPDATA%\npm`, `%ProgramFiles%\nodejs`, or nvm-windows directories.
/// On macOS/Linux, `:` is the separator and Homebrew/nvm paths are prepended.
fn build_augmented_path() -> String {
    #[cfg(target_os = "windows")]
    {
        let separator = ";";
        let current_path = std::env::var("PATH").unwrap_or_default();
        let mut dirs: Vec<String> = Vec::new();

        // Common Windows Node.js install locations
        let appdata = std::env::var("APPDATA").unwrap_or_default();
        let localappdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
        let programfiles = std::env::var("ProgramFiles").unwrap_or_default();
        let programfiles_x86 = std::env::var("ProgramFiles(x86)").unwrap_or_default();
        let userprofile = std::env::var("USERPROFILE").unwrap_or_default();

        // npm global bin (most common location for npx on Windows)
        if !appdata.is_empty() {
            dirs.push(format!("{}\\npm", appdata));
        }

        // Node.js installer default locations
        if !programfiles.is_empty() {
            dirs.push(format!("{}\\nodejs", programfiles));
        }
        if !programfiles_x86.is_empty() {
            dirs.push(format!("{}\\nodejs", programfiles_x86));
        }

        // nvm-windows default install locations
        if !appdata.is_empty() {
            dirs.push(format!("{}\\nvm", appdata));
        }
        if !localappdata.is_empty() {
            dirs.push(format!("{}\\nvm", localappdata));
        }

        // nvm-windows symlink (active version)
        if !userprofile.is_empty() {
            let nvm_root = format!("{}\\AppData\\Roaming\\nvm", userprofile);
            if let Ok(entries) = std::fs::read_dir(&nvm_root) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        let name = entry.file_name();
                        let name_str = name.to_string_lossy();
                        if name_str.starts_with("v") {
                            let dir_str = path.to_string_lossy().to_string();
                            if !dirs.iter().any(|d| d == &dir_str) {
                                dirs.push(dir_str);
                            }
                        }
                    }
                }
            }
        }

        // Honour whatever PATH the process already has.
        for p in current_path.split(separator) {
            if !p.is_empty() && !dirs.iter().any(|d| d == p) {
                dirs.push(p.to_string());
            }
        }

        dirs.join(separator)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let separator = ":";
        let extra_dirs = [
            "/opt/homebrew/bin", // Homebrew on Apple Silicon
            "/usr/local/bin",    // Homebrew on Intel / manual installs
            "/usr/local/sbin",
            "/opt/local/bin", // MacPorts
            "/usr/bin",
            "/bin",
        ];

        let current_path = std::env::var("PATH").unwrap_or_default();
        let mut dirs: Vec<String> = extra_dirs.iter().map(|s| s.to_string()).collect();

        // Also honour whatever PATH the process already has.
        for p in current_path.split(separator) {
            if !p.is_empty() && !dirs.iter().any(|d| d == p) {
                dirs.push(p.to_string());
            }
        }

        // Include versioned Homebrew node installations (e.g. node@22, node@20).
        // Tauri apps launched from Finder/Dock do NOT get the user's shell PATH, so
        // `/opt/homebrew/opt/node@22/bin` is missing even though `brew link` may not
        // have symlinked it into `/opt/homebrew/bin`.
        for brew_root in &["/opt/homebrew/opt", "/usr/local/opt"] {
            if let Ok(entries) = std::fs::read_dir(brew_root) {
                for entry in entries.flatten() {
                    let name = entry.file_name();
                    let name_str = name.to_string_lossy();
                    if name_str.starts_with("node") {
                        let bin = format!("{}/bin", entry.path().display());
                        if std::path::Path::new(&bin).is_dir() && !dirs.iter().any(|d| d == &bin) {
                            dirs.push(bin);
                        }
                    }
                }
            }
        }

        // Include nvm directories dynamically.
        // Honour $NVM_DIR if set; otherwise fall back to the conventional ~/.nvm location.
        let home = std::env::var("HOME").unwrap_or_default();
        let nvm_base = std::env::var("NVM_DIR").unwrap_or_else(|_| format!("{}/.nvm", home));
        let nvm_dir = format!("{}/versions/node", nvm_base);
        if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
            for entry in entries.flatten() {
                let bin = format!("{}/bin", entry.path().display());
                if !dirs.iter().any(|d| d == &bin) {
                    dirs.push(bin);
                }
            }
        }

        dirs.join(separator)
    }
}

/// Return the platform-specific PATH separator character.
#[cfg(target_os = "windows")]
fn path_separator() -> char {
    ';'
}

#[cfg(not(target_os = "windows"))]
fn path_separator() -> char {
    ':'
}

/// Check whether `command` is already an absolute filesystem path.
///
/// On Windows, absolute paths begin with a drive letter (`C:\`) or a UNC
/// prefix (`\\`). On Unix, they start with `/`.
fn is_absolute_command(command: &str) -> bool {
    #[cfg(target_os = "windows")]
    {
        // Drive-letter path: e.g. C:\ or C:/
        let bytes = command.as_bytes();
        if bytes.len() >= 3 && bytes[1] == b':' && (bytes[2] == b'\\' || bytes[2] == b'/') {
            return true;
        }
        // UNC path: \\server\share
        if command.starts_with("\\\\") || command.starts_with("//") {
            return true;
        }
        false
    }

    #[cfg(not(target_os = "windows"))]
    {
        command.starts_with('/')
    }
}

/// Resolve a command name to its absolute path.
///
/// Uses `build_augmented_path` to search common install locations so that
/// `npx`, `node`, `uvx`, etc. are found even without a full shell environment.
///
/// On Windows, executables have `.exe`, `.cmd`, and `.bat` extensions that
/// must be tried when searching PATH entries.
fn resolve_command_path(command: &str) -> String {
    // Already an absolute path, use as-is.
    if is_absolute_command(command) {
        return command.to_string();
    }

    let augmented = build_augmented_path();
    let sep = path_separator();

    #[cfg(target_os = "windows")]
    let extensions = ["", ".exe", ".cmd", ".bat", ".ps1"];
    #[cfg(not(target_os = "windows"))]
    let extensions = [""];

    for dir in augmented.split(sep) {
        if dir.is_empty() {
            continue;
        }
        for ext in &extensions {
            let candidate = std::path::Path::new(dir).join(format!("{}{}", command, ext));
            if candidate.is_file() {
                let candidate_str = candidate.to_string_lossy().into_owned();
                tracing::debug!(
                    "[MCP Transport] Resolved '{}' -> '{}'",
                    command,
                    candidate_str
                );
                return candidate_str;
            }
        }
    }

    tracing::warn!(
        "[MCP Transport] Could not resolve '{}' to an absolute path; \
         spawning with bare name (may fail if not in PATH)",
        command
    );
    command.to_string()
}

/// Allowlist of permitted MCP server executors.
/// Only these binary names (not full paths) are allowed as MCP server commands.
const ALLOWED_MCP_EXECUTORS: &[&str] = &[
    "node",
    "node.exe",
    "python",
    "python3",
    "python3.exe",
    "npx",
    "npx.cmd",
    "uvx",
    "deno",
    "deno.exe",
    "bun",
    "bun.exe",
];

fn validate_mcp_command(command: &str) -> McpResult<()> {
    // Extract basename (handle both Unix and Windows paths)
    let basename = std::path::Path::new(command)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(command);

    // Reject shell metacharacters in any argument
    if command
        .chars()
        .any(|c| matches!(c, ';' | '|' | '&' | '$' | '`' | '\n' | '\r'))
    {
        return Err(McpError::InvalidConfig(format!(
            "MCP command contains forbidden characters: {command}"
        )));
    }

    if !ALLOWED_MCP_EXECUTORS.contains(&basename) {
        return Err(McpError::InvalidConfig(format!(
            "MCP server command '{basename}' is not in the allowed executor list. \
             Permitted executors: {ALLOWED_MCP_EXECUTORS:?}"
        )));
    }
    Ok(())
}

impl StdioTransport {
    pub async fn new(
        server_name: String,
        command: &str,
        args: &[String],
        env: &HashMap<String, String>,
    ) -> McpResult<Self> {
        validate_mcp_command(command)?;

        for arg in args {
            if arg
                .chars()
                .any(|c| matches!(c, ';' | '|' | '&' | '$' | '`' | '\n' | '\r'))
            {
                return Err(McpError::InvalidConfig(format!(
                    "MCP arg contains forbidden characters: {arg}"
                )));
            }
        }

        let resolved = resolve_command_path(command);
        tracing::info!(
            "[MCP Transport] Starting server '{}': {} {:?}",
            server_name,
            resolved,
            args
        );

        let augmented_path = build_augmented_path();
        let final_path = if let Some(user_path) = env.get("PATH") {
            format!("{}{}{}", augmented_path, path_separator(), user_path)
        } else {
            augmented_path
        };

        let mut engine_env: HashMap<String, String> = env
            .iter()
            .filter(|(key, _)| !crate::sys::security::env_filter::is_blocked_env_var(key))
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();
        engine_env.insert("PATH".to_string(), final_path);

        let engine_config = agiworkforce_mcp::TransportConfig::Stdio {
            command: resolved,
            args: args.to_vec(),
            env: engine_env,
        };
        let mut client = agiworkforce_mcp::McpClient::connect(
            &server_name,
            engine_config,
            agiworkforce_mcp::McpTimeouts::default(),
            engine_hooks(&server_name, Arc::new(AtomicBool::new(false))),
        )
        .await
        .map_err(map_engine_error)?;
        let negotiated = client.server().clone();
        let notifications = parking_lot::Mutex::new(client.notifications());

        let (tx, rx) = mpsc::unbounded_channel::<EngineCommand>();
        let alive = Arc::new(AtomicBool::new(true));
        let is_shutdown = Arc::new(AtomicBool::new(false));
        let shutdown_signal = Arc::new(tokio::sync::Notify::new());

        spawn_engine_actor(
            server_name,
            client,
            rx,
            Arc::new(AtomicU64::new(1)),
            alive.clone(),
            is_shutdown.clone(),
            shutdown_signal.clone(),
            std::time::Duration::from_secs(STDIO_REQUEST_TIMEOUT_SECS),
        );

        Ok(Self {
            tx,
            alive,
            is_shutdown,
            shutdown_signal,
            negotiated,
            notifications,
        })
    }
}

#[async_trait]
impl McpTransport for StdioTransport {
    async fn send_request(
        &self,
        method: String,
        params: Option<serde_json::Value>,
    ) -> McpResult<JsonRpcResponse> {
        if self.is_shutdown.load(Ordering::SeqCst) {
            return Err(McpError::ConnectionError(
                "Transport is shutdown".to_string(),
            ));
        }
        let timeout = std::time::Duration::from_secs(STDIO_REQUEST_TIMEOUT_SECS);
        send_engine_request(&self.tx, method, params, timeout)
            .await
            .unwrap_or_else(|| {
                Err(McpError::ConnectionError(format!(
                    "Request timeout after {} seconds",
                    STDIO_REQUEST_TIMEOUT_SECS
                )))
            })
    }

    fn is_alive(&self) -> bool {
        !self.is_shutdown.load(Ordering::SeqCst) && self.alive.load(Ordering::SeqCst)
    }

    async fn shutdown(&self) -> McpResult<()> {
        tracing::info!("[MCP Transport] Shutting down");
        shutdown_engine(
            &self.tx,
            &self.is_shutdown,
            &self.shutdown_signal,
            &self.alive,
        )
        .await;
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct HttpSseConfig {
    pub url: String,
    pub api_key: Option<String>,
    pub bearer_token: Option<String>,
    pub headers: HashMap<String, String>,
    pub timeout_secs: u64,
    pub verify_ssl: bool,
    pub oauth_client_id: Option<String>,
    pub oauth_client_secret: Option<String>,
    pub oauth_token_url: Option<String>,
}

impl Default for HttpSseConfig {
    fn default() -> Self {
        Self {
            url: String::new(),
            api_key: None,
            bearer_token: None,
            headers: HashMap::new(),
            timeout_secs: HTTP_REQUEST_TIMEOUT_SECS,
            verify_ssl: true,
            oauth_client_id: None,
            oauth_client_secret: None,
            oauth_token_url: None,
        }
    }
}

const SSE_CONNECT_TIMEOUT_SECS: u64 = 30;

const MAX_RESPONSE_BODY_BYTES: u64 = 50_000_000;

pub struct HttpSseTransport {
    server_name: String,
    tx: mpsc::UnboundedSender<EngineCommand>,
    alive: Arc<AtomicBool>,
    is_shutdown: Arc<AtomicBool>,
    shutdown_signal: Arc<tokio::sync::Notify>,
    request_timeout_secs: u64,
    negotiated: NegotiatedServer,
    notifications: Notifications,
}

fn refuse_cleartext_credential_hop(url: &str) -> Result<(), String> {
    let parsed = url::Url::parse(url).map_err(|e| format!("invalid MCP server URL: {}", e))?;
    if parsed.scheme() == "https" {
        return Ok(());
    }
    if is_loopback_host(&parsed) {
        return Ok(());
    }
    Err(format!(
        "scheme '{}' for host '{}' is not encrypted",
        parsed.scheme(),
        parsed.host_str().unwrap_or("")
    ))
}

fn is_loopback_host(parsed: &url::Url) -> bool {
    match parsed.host() {
        Some(url::Host::Domain(domain)) => domain.eq_ignore_ascii_case("localhost"),
        Some(url::Host::Ipv4(v4)) => v4.is_loopback(),
        Some(url::Host::Ipv6(v6)) => v6.is_loopback(),
        None => false,
    }
}

fn canonical_scheme(url: &str) -> String {
    let Ok(parsed) = url::Url::parse(url) else {
        return url.to_string();
    };
    let scheme = parsed.scheme();
    match url.get(..scheme.len()) {
        Some(prefix) if prefix != scheme && prefix.eq_ignore_ascii_case(scheme) => {
            format!("{}{}", scheme, &url[scheme.len()..])
        }
        _ => url.to_string(),
    }
}

fn remote_engine_config(
    server_name: &str,
    config: &HttpSseConfig,
) -> McpResult<(
    agiworkforce_mcp::TransportConfig,
    agiworkforce_mcp::McpTimeouts,
)> {
    if !config.verify_ssl {
        #[cfg(not(debug_assertions))]
        {
            tracing::error!(
                "[MCP HTTP Transport] verify_ssl=false is forbidden in release builds (server '{}', url '{}')",
                server_name,
                config.url
            );
            return Err(McpError::ConnectionError(
                "SSL verification cannot be disabled in release builds. \
                 Use a properly-signed certificate or run a debug build."
                    .to_string(),
            ));
        }

        #[cfg(debug_assertions)]
        {
            let is_localhost = url::Url::parse(&config.url)
                .map(|parsed| {
                    matches!(
                        parsed.host_str(),
                        Some("localhost") | Some("127.0.0.1") | Some("::1")
                    )
                })
                .unwrap_or(false);
            if !is_localhost {
                tracing::error!(
                    "[MCP HTTP Transport] Refusing to disable SSL verification for remote server '{}' at {}",
                    server_name,
                    config.url
                );
                return Err(McpError::ConnectionError(
                    "SSL verification cannot be disabled for remote servers. \
                     Only localhost (127.0.0.1, ::1) connections may bypass SSL verification."
                        .to_string(),
                ));
            }
        }
    }

    let sends_caller_headers =
        config.api_key.is_some() || config.bearer_token.is_some() || !config.headers.is_empty();
    if sends_caller_headers {
        refuse_cleartext_credential_hop(&config.url).map_err(|reason| {
            tracing::error!(
                "[MCP HTTP Transport] Refusing to send credentials for server '{}' over cleartext HTTP: {}",
                server_name,
                reason
            );
            McpError::ConnectionError(format!(
                "Refusing to send MCP credentials over cleartext HTTP. Remote MCP servers must use HTTPS: {}",
                reason
            ))
        })?;
    }

    let mut headers: HashMap<String, String> = HashMap::new();
    if let Some(ref api_key) = config.api_key {
        reqwest::header::HeaderValue::from_str(api_key)
            .map_err(|e| McpError::InvalidConfig(format!("Invalid API key header value: {}", e)))?;
        headers.insert("X-API-Key".to_string(), api_key.clone());
    }
    if let Some(ref token) = config.bearer_token {
        let value = format!("Bearer {}", token);
        reqwest::header::HeaderValue::from_str(&value).map_err(|e| {
            McpError::InvalidConfig(format!("Invalid bearer token header value: {}", e))
        })?;
        headers.insert("Authorization".to_string(), value);
    }
    for (key, value) in &config.headers {
        reqwest::header::HeaderName::try_from(key.as_str()).map_err(|e| {
            McpError::InvalidConfig(format!("Invalid header name '{}': {}", key, e))
        })?;
        reqwest::header::HeaderValue::from_str(value).map_err(|e| {
            McpError::InvalidConfig(format!("Invalid header value for '{}': {}", key, e))
        })?;
        headers.insert(key.clone(), value.clone());
    }

    let url = canonical_scheme(&config.url);
    let carries_authorization = headers
        .keys()
        .any(|name| name.eq_ignore_ascii_case("authorization"));
    let oauth =
        (!carries_authorization && refuse_cleartext_credential_hop(&url).is_ok()).then(|| {
            agiworkforce_mcp::OAuthConfig {
                client_id: config.oauth_client_id.clone(),
                client_secret: config.oauth_client_secret.clone(),
                token_url: config.oauth_token_url.clone(),
                ..agiworkforce_mcp::OAuthConfig::default()
            }
        });
    let timeouts = agiworkforce_mcp::McpTimeouts {
        initialize: std::time::Duration::from_secs(config.timeout_secs),
        validate_urls: true,
        verify_tls: config.verify_ssl,
        max_response_bytes: Some(MAX_RESPONSE_BODY_BYTES),
        connect_timeout: Some(std::time::Duration::from_secs(SSE_CONNECT_TIMEOUT_SECS)),
        sse_read_timeout: Some(std::time::Duration::from_secs(SSE_STREAM_IDLE_TIMEOUT_SECS)),
        ..agiworkforce_mcp::McpTimeouts::default()
    };
    Ok((
        agiworkforce_mcp::TransportConfig::Http {
            url,
            headers,
            oauth,
        },
        timeouts,
    ))
}

impl HttpSseTransport {
    pub async fn new(
        server_name: String,
        config: HttpSseConfig,
        interactive: bool,
    ) -> McpResult<Self> {
        tracing::info!(
            "[MCP HTTP Transport] Connecting to server '{}' at {}",
            server_name,
            config.url
        );
        let (engine_config, timeouts) = remote_engine_config(&server_name, &config)?;
        let browser_gate = Arc::new(AtomicBool::new(interactive));
        let mut client = agiworkforce_mcp::McpClient::connect(
            &server_name,
            engine_config,
            timeouts,
            engine_hooks(&server_name, Arc::clone(&browser_gate)),
        )
        .await
        .map_err(map_engine_error)?;
        browser_gate.store(false, Ordering::SeqCst);
        let negotiated = client.server().clone();
        let notifications = parking_lot::Mutex::new(client.notifications());

        let (tx, rx) = mpsc::unbounded_channel::<EngineCommand>();
        let alive = Arc::new(AtomicBool::new(true));
        let is_shutdown = Arc::new(AtomicBool::new(false));
        let shutdown_signal = Arc::new(tokio::sync::Notify::new());
        let request_timeout_secs = config.timeout_secs;

        spawn_engine_actor(
            server_name.clone(),
            client,
            rx,
            Arc::new(AtomicU64::new(1)),
            alive.clone(),
            is_shutdown.clone(),
            shutdown_signal.clone(),
            std::time::Duration::from_secs(request_timeout_secs),
        );

        Ok(Self {
            server_name,
            tx,
            alive,
            is_shutdown,
            shutdown_signal,
            request_timeout_secs,
            negotiated,
            notifications,
        })
    }
}

#[async_trait]
impl McpTransport for HttpSseTransport {
    async fn send_request(
        &self,
        method: String,
        params: Option<serde_json::Value>,
    ) -> McpResult<JsonRpcResponse> {
        if self.is_shutdown.load(Ordering::SeqCst) {
            return Err(McpError::ConnectionError(
                "Transport is shutdown".to_string(),
            ));
        }
        let timeout = std::time::Duration::from_secs(self.request_timeout_secs);
        send_engine_request(&self.tx, method, params, timeout)
            .await
            .unwrap_or_else(|| {
                Err(McpError::RequestTimeout(format!(
                    "Request for '{}' timed out after {}s, server accepted request but did not respond in time",
                    self.server_name, self.request_timeout_secs
                )))
            })
    }

    fn is_alive(&self) -> bool {
        !self.is_shutdown.load(Ordering::SeqCst) && self.alive.load(Ordering::SeqCst)
    }

    async fn shutdown(&self) -> McpResult<()> {
        tracing::info!(
            "[MCP HTTP Transport] Shutting down transport for '{}'",
            self.server_name
        );
        shutdown_engine(
            &self.tx,
            &self.is_shutdown,
            &self.shutdown_signal,
            &self.alive,
        )
        .await;
        Ok(())
    }
}

pub enum Transport {
    Stdio(StdioTransport),
    HttpSse(HttpSseTransport),
}

impl Transport {
    pub async fn from_config(
        server_name: String,
        config: &super::config::McpServerConfig,
        interactive: bool,
    ) -> McpResult<Self> {
        match &config.transport {
            Some(TransportConfig::Http(http_config)) => Ok(Transport::HttpSse(
                HttpSseTransport::new(server_name, http_config.as_ref().clone(), interactive)
                    .await?,
            )),
            Some(TransportConfig::Stdio) | None => Ok(Transport::Stdio(
                StdioTransport::new(server_name, &config.command, &config.args, &config.env)
                    .await?,
            )),
        }
    }

    pub fn negotiated(&self) -> &NegotiatedServer {
        match self {
            Transport::Stdio(t) => &t.negotiated,
            Transport::HttpSse(t) => &t.negotiated,
        }
    }

    pub fn take_notifications(&self) -> Option<mpsc::Receiver<McpNotification>> {
        match self {
            Transport::Stdio(t) => t.notifications.lock().take(),
            Transport::HttpSse(t) => t.notifications.lock().take(),
        }
    }
}

#[async_trait]
impl McpTransport for Transport {
    async fn send_request(
        &self,
        method: String,
        params: Option<serde_json::Value>,
    ) -> McpResult<JsonRpcResponse> {
        match self {
            Transport::Stdio(t) => t.send_request(method, params).await,
            Transport::HttpSse(t) => t.send_request(method, params).await,
        }
    }

    fn is_alive(&self) -> bool {
        match self {
            Transport::Stdio(t) => t.is_alive(),
            Transport::HttpSse(t) => t.is_alive(),
        }
    }

    async fn shutdown(&self) -> McpResult<()> {
        match self {
            Transport::Stdio(t) => t.shutdown().await,
            Transport::HttpSse(t) => t.shutdown().await,
        }
    }
}

/// Transport configuration enum
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum TransportConfig {
    /// Standard I/O transport (local process)
    #[default]
    Stdio,

    /// HTTP/SSE transport (remote server)
    Http(Box<HttpSseConfig>),
}

// Implement Serialize/Deserialize for HttpSseConfig
impl serde::Serialize for HttpSseConfig {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("HttpSseConfig", 9)?;
        state.serialize_field("url", &self.url)?;
        state.serialize_field("api_key", &self.api_key)?;
        state.serialize_field("bearer_token", &self.bearer_token)?;
        state.serialize_field("headers", &self.headers)?;
        state.serialize_field("timeout_secs", &self.timeout_secs)?;
        state.serialize_field("verify_ssl", &self.verify_ssl)?;
        for (key, value) in [
            ("oauth_client_id", &self.oauth_client_id),
            ("oauth_client_secret", &self.oauth_client_secret),
            ("oauth_token_url", &self.oauth_token_url),
        ] {
            match value {
                Some(value) => state.serialize_field(key, value)?,
                None => state.skip_field(key)?,
            }
        }
        state.end()
    }
}

impl<'de> serde::Deserialize<'de> for HttpSseConfig {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(serde::Deserialize)]
        struct HttpSseConfigHelper {
            url: String,
            #[serde(default)]
            api_key: Option<String>,
            #[serde(default)]
            bearer_token: Option<String>,
            #[serde(default)]
            headers: HashMap<String, String>,
            #[serde(default = "default_timeout")]
            timeout_secs: u64,
            #[serde(default = "default_verify_ssl")]
            verify_ssl: bool,
            #[serde(default)]
            oauth_client_id: Option<String>,
            #[serde(default)]
            oauth_client_secret: Option<String>,
            #[serde(default)]
            oauth_token_url: Option<String>,
        }

        fn default_timeout() -> u64 {
            HTTP_REQUEST_TIMEOUT_SECS
        }

        fn default_verify_ssl() -> bool {
            true
        }

        let helper = HttpSseConfigHelper::deserialize(deserializer)?;
        Ok(HttpSseConfig {
            url: helper.url,
            api_key: helper.api_key,
            bearer_token: helper.bearer_token,
            headers: helper.headers,
            timeout_secs: helper.timeout_secs,
            verify_ssl: helper.verify_ssl,
            oauth_client_id: helper.oauth_client_id,
            oauth_client_secret: helper.oauth_client_secret,
            oauth_token_url: helper.oauth_token_url,
        })
    }
}

#[cfg(test)]
mod protocol_era_tests {
    use super::*;

    /// A server that still rejects every revision we speak with -32022 after
    /// negotiation must not read as a transient server fault: retrying cannot
    /// help, and the remedy is a client update.
    #[test]
    fn test_unsupported_version_frame_is_classified_separately() {
        let engine_err = agiworkforce_mcp::McpError::from(anyhow::Error::new(
            agiworkforce_mcp::RpcError::unsupported_protocol_version("2026-07-28"),
        ));
        assert!(matches!(
            map_engine_error(engine_err),
            McpError::UnsupportedProtocolVersion(_)
        ));
    }

    /// Every other JSON-RPC error frame keeps its existing classification.
    #[test]
    fn test_other_jsonrpc_frames_stay_server_errors() {
        let engine_err = agiworkforce_mcp::McpError::from(anyhow::Error::new(
            agiworkforce_mcp::RpcError::new(-32601, "Method not found"),
        ));
        assert!(matches!(
            map_engine_error(engine_err),
            McpError::RmcpError(_)
        ));
    }

    /// Transport faults are not protocol faults.
    #[test]
    fn test_io_failures_remain_connection_errors() {
        let engine_err =
            agiworkforce_mcp::McpError::from(anyhow::anyhow!("broken pipe while writing"));
        assert!(matches!(
            map_engine_error(engine_err),
            McpError::ConnectionError(_)
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::super::protocol::{JsonRpcRequest, McpMessage};
    use super::*;

    #[tokio::test]
    async fn test_request_id_increment() {
        let counter = Arc::new(AtomicU64::new(1));
        let id1 = counter.fetch_add(1, Ordering::SeqCst);
        let id2 = counter.fetch_add(1, Ordering::SeqCst);
        assert_eq!(id1, 1);
        assert_eq!(id2, 2);
    }

    #[test]
    fn test_message_serialization() {
        let req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            method: "test".to_string(),
            params: None,
            id: RequestId::Number(1),
        };
        let msg = McpMessage::Request(req);
        let json = msg.to_string().unwrap();
        assert!(json.contains("\"method\":\"test\""));
    }

    #[test]
    fn test_http_sse_config_default() {
        let config = HttpSseConfig::default();
        assert!(config.url.is_empty());
        assert!(config.api_key.is_none());
        assert!(config.bearer_token.is_none());
        assert!(config.headers.is_empty());
        assert_eq!(config.timeout_secs, HTTP_REQUEST_TIMEOUT_SECS);
        assert!(config.verify_ssl);
    }

    #[test]
    fn test_http_sse_config_serialization() {
        let config = HttpSseConfig {
            url: "http://localhost:8080".to_string(),
            api_key: Some("test-key".to_string()),
            bearer_token: None,
            headers: {
                let mut h = HashMap::new();
                h.insert("X-Custom".to_string(), "value".to_string());
                h
            },
            timeout_secs: 60,
            verify_ssl: true,
            ..Default::default()
        };

        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("http://localhost:8080"));
        assert!(json.contains("test-key"));

        let deserialized: HttpSseConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.url, config.url);
        assert_eq!(deserialized.api_key, config.api_key);
    }

    #[test]
    fn test_transport_config_serialization() {
        // Test Stdio
        let stdio_config = TransportConfig::Stdio;
        let json = serde_json::to_string(&stdio_config).unwrap();
        assert!(json.contains("stdio"));

        // Test Http
        let http_config = TransportConfig::Http(Box::new(HttpSseConfig {
            url: "http://localhost:8080".to_string(),
            ..Default::default()
        }));
        let json = serde_json::to_string(&http_config).unwrap();
        assert!(json.contains("http"));
        assert!(json.contains("localhost:8080"));
    }

    #[test]
    fn test_notification_serialization() {
        // BUG 1 verification: notifications should NOT have an id field
        use super::super::protocol::JsonRpcNotification;
        let notif = JsonRpcNotification {
            jsonrpc: "2.0".to_string(),
            method: "notifications/initialized".to_string(),
            params: None,
        };
        let msg = McpMessage::Notification(notif);
        let json = msg.to_string().unwrap();
        // Must NOT contain "id" field
        assert!(
            !json.contains("\"id\""),
            "Notification should not have id field: {}",
            json
        );
        assert!(json.contains("notifications/initialized"));
    }

    #[test]
    fn test_timeout_constants_are_reasonable() {
        let connect = SSE_CONNECT_TIMEOUT_SECS;
        let request = HTTP_REQUEST_TIMEOUT_SECS;
        let idle = SSE_STREAM_IDLE_TIMEOUT_SECS;

        // Connection timeout should be shorter than request timeout
        assert!(
            connect <= request,
            "Connect timeout ({}) should not exceed request timeout ({})",
            connect,
            request,
        );
        // SSE idle timeout should be generous since SSE streams may have long pauses
        assert!(
            idle >= request,
            "SSE idle timeout ({}) should be at least as long as request timeout ({})",
            idle,
            request,
        );
    }

    #[test]
    fn test_connection_timeout_error_variant() {
        let err = McpError::ConnectionTimeout(
            "HTTP connection attempt to http://example.com timed out after 30s".to_string(),
        );
        let msg = err.to_string();
        assert!(msg.contains("timed out"));
        assert!(msg.contains("http://example.com"));
    }

    #[test]
    fn test_request_timeout_error_variant() {
        let err = McpError::RequestTimeout(
            "HTTP request to http://example.com timed out after 30s".to_string(),
        );
        let msg = err.to_string();
        assert!(msg.contains("timed out"));
        assert!(msg.contains("http://example.com"));
    }

    #[tokio::test]
    async fn test_sse_stream_idle_timeout() {
        // Verify timeout constant is set to a reasonable value
        assert_eq!(SSE_STREAM_IDLE_TIMEOUT_SECS, 60);

        // Verify a RequestTimeout error can be constructed for idle streams
        let timeout_err = McpError::RequestTimeout(format!(
            "SSE stream for 'test-server' stalled, no data received for {}s",
            SSE_STREAM_IDLE_TIMEOUT_SECS,
        ));
        assert!(timeout_err.to_string().contains("stalled"));
        assert!(timeout_err.to_string().contains("60s"));
    }

    #[test]
    fn test_http_sse_transport_connection_timeout_config() {
        let config = HttpSseConfig {
            url: "http://192.0.2.1:9999".to_string(),
            timeout_secs: 1,
            verify_ssl: true,
            ..Default::default()
        };

        let (_, timeouts) =
            remote_engine_config("timeout-test", &config).expect("header-free config is accepted");
        assert_eq!(timeouts.initialize, std::time::Duration::from_secs(1));
        assert_eq!(
            timeouts.connect_timeout,
            Some(std::time::Duration::from_secs(SSE_CONNECT_TIMEOUT_SECS))
        );
        assert_eq!(
            timeouts.sse_read_timeout,
            Some(std::time::Duration::from_secs(SSE_STREAM_IDLE_TIMEOUT_SECS))
        );
    }

    fn cleartext_remote(name: &str) -> String {
        format!("http://{}.example.com:8080", name)
    }

    fn expect_credential_refusal(server: &str, config: HttpSseConfig) -> McpError {
        match remote_engine_config(server, &config) {
            Ok(_) => panic!(
                "credentials over cleartext http:// must be refused ({})",
                server
            ),
            Err(e) => e,
        }
    }

    #[tokio::test]
    async fn test_bearer_token_refused_over_cleartext_remote() {
        let config = HttpSseConfig {
            url: cleartext_remote("bearer"),
            bearer_token: Some("secret-token".to_string()),
            ..Default::default()
        };

        let msg = expect_credential_refusal("cleartext-bearer", config).to_string();
        assert!(msg.contains("HTTPS"), "unexpected error: {}", msg);
        assert!(
            !msg.contains("secret-token"),
            "error must not leak the credential: {}",
            msg
        );
    }

    #[tokio::test]
    async fn test_api_key_refused_over_cleartext_remote() {
        let config = HttpSseConfig {
            url: cleartext_remote("apikey"),
            api_key: Some("secret-key".to_string()),
            ..Default::default()
        };

        let msg = expect_credential_refusal("cleartext-api-key", config).to_string();
        assert!(msg.contains("HTTPS"), "unexpected error: {}", msg);
        assert!(!msg.contains("secret-key"), "leaked credential: {}", msg);
    }

    #[tokio::test]
    async fn test_custom_credential_header_refused_over_cleartext_remote() {
        for name in ["Authorization", "X-Api-Key", "X-Auth-Token", "Cookie"] {
            let config = HttpSseConfig {
                url: cleartext_remote("custom"),
                headers: HashMap::from([(name.to_string(), "secret".to_string())]),
                ..Default::default()
            };

            let msg = expect_credential_refusal("cleartext-custom", config).to_string();
            assert!(msg.contains("HTTPS"), "header '{}': {}", name, msg);
        }
    }

    /// The gate cannot depend on recognising a header name: `apikey` and
    /// friends carry no `-`/`_` separator, and the config file an attacker can
    /// write picks the name. Every caller-supplied header is gated.
    #[tokio::test]
    async fn test_any_custom_header_refused_over_cleartext_remote() {
        for name in [
            "apikey",
            "x-apikey",
            "authentication",
            "x-auth",
            "x-access-key",
            "x-trace-id",
        ] {
            let config = HttpSseConfig {
                url: cleartext_remote("anyheader"),
                headers: HashMap::from([(name.to_string(), "secret".to_string())]),
                ..Default::default()
            };

            let msg = expect_credential_refusal("cleartext-any-header", config).to_string();
            assert!(msg.contains("HTTPS"), "header '{}': {}", name, msg);
        }
    }

    /// URL schemes are case-insensitive on the wire, so an uppercase or mixed
    /// spelling must not buy a cleartext hop for a credential.
    #[tokio::test]
    async fn test_uppercase_scheme_cleartext_remote_refuses_credentials() {
        for scheme in ["HTTP", "HtTp", "hTTP"] {
            let config = HttpSseConfig {
                url: format!("{}://mcp.example.com:8080", scheme),
                bearer_token: Some("secret-token".to_string()),
                ..Default::default()
            };

            let msg = expect_credential_refusal("uppercase-scheme", config).to_string();
            assert!(msg.contains("HTTPS"), "scheme '{}': {}", scheme, msg);
            assert!(
                !msg.contains("secret-token"),
                "error must not leak the credential: {}",
                msg
            );
        }
    }

    #[tokio::test]
    async fn test_uppercase_scheme_cleartext_remote_refuses_custom_header() {
        let config = HttpSseConfig {
            url: "HTTP://mcp.example.com:8080".to_string(),
            headers: HashMap::from([("apikey".to_string(), "secret".to_string())]),
            ..Default::default()
        };

        let msg = expect_credential_refusal("uppercase-scheme-header", config).to_string();
        assert!(msg.contains("HTTPS"), "unexpected error: {}", msg);
    }

    /// A URL the parser cannot resolve to an encrypted scheme fails closed
    /// rather than falling through to the header mapping.
    #[tokio::test]
    async fn test_unresolvable_scheme_refuses_credentials() {
        for url in ["not a url", "mcp.example.com:8080", "ftp://mcp.example.com"] {
            let config = HttpSseConfig {
                url: url.to_string(),
                api_key: Some("secret-key".to_string()),
                ..Default::default()
            };

            let msg = expect_credential_refusal("unresolvable-scheme", config).to_string();
            assert!(msg.contains("HTTPS"), "url '{}': {}", url, msg);
            assert!(!msg.contains("secret-key"), "leaked credential: {}", msg);
        }
    }

    #[tokio::test]
    async fn test_uppercase_https_remote_still_allowed() {
        let config = HttpSseConfig {
            url: "HTTPS://mcp.example.com".to_string(),
            bearer_token: Some("remote-token".to_string()),
            ..Default::default()
        };

        remote_engine_config("uppercase-https", &config)
            .expect("uppercase https remote with credentials must be allowed");
    }

    #[test]
    fn test_engine_sees_a_lowercase_scheme() {
        assert_eq!(
            canonical_scheme("HTTP://mcp.example.com:8080"),
            "http://mcp.example.com:8080"
        );
        assert_eq!(
            canonical_scheme("HtTpS://mcp.example.com/base"),
            "https://mcp.example.com/base"
        );
        assert_eq!(
            canonical_scheme("http://localhost:8080"),
            "http://localhost:8080"
        );
        assert_eq!(canonical_scheme("not a url"), "not a url");
    }

    #[tokio::test]
    async fn test_credentials_allowed_over_loopback_http() {
        for host in ["localhost", "127.0.0.1", "[::1]"] {
            let config = HttpSseConfig {
                url: format!("http://{}:8080", host),
                bearer_token: Some("local-token".to_string()),
                ..Default::default()
            };

            remote_engine_config("loopback", &config)
                .unwrap_or_else(|e| panic!("loopback {} must stay allowed: {:?}", host, e));
        }
    }

    #[tokio::test]
    async fn test_credentials_allowed_over_https_remote() {
        let config = HttpSseConfig {
            url: "https://mcp.example.com".to_string(),
            bearer_token: Some("remote-token".to_string()),
            ..Default::default()
        };

        remote_engine_config("https-remote", &config)
            .expect("https remote with credentials must be allowed");
    }

    #[tokio::test]
    async fn test_header_free_cleartext_remote_still_allowed() {
        let config = HttpSseConfig {
            url: cleartext_remote("nocreds"),
            ..Default::default()
        };

        remote_engine_config("no-creds", &config)
            .expect("cleartext remote without caller headers keeps prior behaviour");
    }

    #[tokio::test]
    async fn test_custom_headers_allowed_over_loopback_http() {
        let config = HttpSseConfig {
            url: "http://127.0.0.1:8080".to_string(),
            headers: HashMap::from([("X-Trace-Id".to_string(), "abc".to_string())]),
            ..Default::default()
        };

        remote_engine_config("loopback-headers", &config).expect("loopback keeps custom headers");
    }
}
